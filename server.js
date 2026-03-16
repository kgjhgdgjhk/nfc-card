// ============================================
// استيراد المكتبات المطلوبة
// ============================================
const express = require('express');
const path = require('path');
const ejs = require('ejs');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs').promises;
const session = require('express-session');


// تحميل متغيرات البيئة
dotenv.config();

// إنشاء تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// إعدادات middleware الأساسية
// ============================================
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// إعدادات الجلسة
// ============================================
// ============================================
// إعدادات الجلسة - محسنة للإنتاج
// ============================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-to-something-secure-123',
    resave: true, // غير إلى true
    saveUninitialized: true, // غير إلى true
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // يوم واحد
        secure: process.env.NODE_ENV === 'production', // true في الإنتاج مع HTTPS
        httpOnly: true,
        sameSite: 'lax' // مهم للـ redirects
    },
    proxy: true // مهم لـ Render
}));

// ============================================
// ✅ تفعيل PostgreSQL - إزالة التعليق
// ============================================
const { 
  sequelize, 
  Profile, 
  Visit, 
  Order,
  saveProfile: saveProfileToDB,
  findProfile: findProfileInDB,
  createVisit,
  createOrder,
  getAllProfiles,
  getAllVisits 
} = require('./models/Profile');

// متغير للتحقق من حالة الاتصال
let isPostgresConnected = false;

// ============================================
// ✅ دالة الاتصال بقاعدة البيانات
// ============================================
async function connectToDatabase() {
    try {
        console.log('📡 محاولة الاتصال بقاعدة البيانات...');
        
        // استخدام sequelize المستورد من ملف Profile
        await sequelize.authenticate();
        console.log('✅ تم الاتصال بقاعدة البيانات PostgreSQL بنجاح');
        
        // مزامنة النماذج مع قاعدة البيانات
        await sequelize.sync({ alter: true });
        console.log('✅ تم مزامنة النماذج مع قاعدة البيانات');
        
        isPostgresConnected = true;
        return true;
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:');
        console.error('📌 رسالة الخطأ:', error.message);
        console.log('');
        console.log('⚠️  استخدام الملفات المحلية كبديل');
        console.log('📂 سيتم حفظ البيانات في مجلد data/');
        console.log('');
        
        isPostgresConnected = false;
        return false;
    }
}

// تشغيل الاتصال بقاعدة البيانات
connectToDatabase();

// ============================================
// Middleware لتحديد الرابط الأساسي
// ============================================
app.use((req, res, next) => {
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    req.baseUrlFull = `${protocol}://${host}`;
    console.log('🌐 baseUrlFull:', req.baseUrlFull);
    next();
});

// تعيين محرك العرض EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================
// نظام انتهاء صلاحية الموقع (بعد أسبوع)
// ============================================
const expiryDate = new Date();
expiryDate.setDate(expiryDate.getDate() + 7); // +7 أيام

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "Albahri.com";

// وسيط التحقق من الصلاحية
app.use((req, res, next) => {
    const allowedPaths = [
        '/unlock', 
        '/unlock-site',
        '/extend-site', 
        '/css', 
        '/js', 
        '/images',
        '/favicon.ico'
    ];
    
    if (allowedPaths.some(path => req.path.startsWith(path))) {
        return next();
    }

    if (req.session && req.session.siteUnlocked) {
        return next();
    }

    const now = new Date();
    
    if (now > expiryDate) {
        return res.render('site-locked', {
            title: '⚠️ الموقع مغلق',
            expiryDate: expiryDate.toLocaleDateString('ar-SA'),
            error: null
        });
    }
    
    next();
});

// ============================================
// إعدادات Lava Lamp
// ============================================
app.use((req, res, next) => {
    res.locals.enableLavaLamp = true;
    res.locals.lavaLampOptions = {
        intensity: 'medium',
        interactive: true,
        autoColor: true
    };
    next();
});

// ============================================
// ✅ دوال مساعدة محسنة للتعامل مع البيانات (PostgreSQL + ملفات محلية كنسخة احتياطية)
// ============================================

// حفظ ملف شخصي جديد
async function saveProfile(profileData) {
    try {
        if (isPostgresConnected) {
            // ✅ استخدام PostgreSQL
            console.log('💾 حفظ في PostgreSQL:', profileData.profileId);
            return await saveProfileToDB(profileData);
        } else {
            // ⚠️ استخدام الملف المحلي كنسخة احتياطية
            console.log('💾 حفظ في ملف محلي (احتياطي):', profileData.profileId);
            
            const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');
            const dataDir = path.join(__dirname, 'data');
            
            try {
                await fs.access(dataDir);
            } catch {
                await fs.mkdir(dataDir, { recursive: true });
            }
            
            let profiles = [];
            try {
                const data = await fs.readFile(DATA_FILE, 'utf8');
                profiles = JSON.parse(data);
            } catch {
                profiles = [];
            }
            
            profiles.push(profileData);
            await fs.writeFile(DATA_FILE, JSON.stringify(profiles, null, 2));
            
            return { success: true, data: profileData };
        }
    } catch (error) {
        console.error('خطأ في حفظ الملف الشخصي:', error);
        return { success: false, error: error.message };
    }
}

// البحث عن ملف شخصي
async function findProfile(profileId) {
    try {
        if (isPostgresConnected) {
            // ✅ استخدام PostgreSQL
            console.log('🔍 بحث في PostgreSQL:', profileId);
            return await findProfileInDB(profileId);
        } else {
            // ⚠️ استخدام الملف المحلي
            console.log('🔍 بحث في ملف محلي:', profileId);
            
            const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');
            
            try {
                const data = await fs.readFile(DATA_FILE, 'utf8');
                const profiles = JSON.parse(data);
                return profiles.find(p => p.profileId === profileId) || null;
            } catch {
                return null;
            }
        }
    } catch (error) {
        console.error('خطأ في البحث:', error);
        return null;
    }
}

// تحديث إحصائيات الزيارة
async function updateProfileStats(profileId) {
    try {
        if (isPostgresConnected) {
            // ✅ تحديث في PostgreSQL
            // يمكن إضافة كود تحديث الإحصائيات هنا إذا كان موجوداً في Profile.js
            console.log('📊 تحديث إحصائيات في PostgreSQL:', profileId);
        } else {
            // ⚠️ تحديث في الملف المحلي
            const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');
            const data = await fs.readFile(DATA_FILE, 'utf8');
            const profiles = JSON.parse(data);
            
            const profileIndex = profiles.findIndex(p => p.profileId === profileId);
            if (profileIndex !== -1) {
                if (!profiles[profileIndex].stats) {
                    profiles[profileIndex].stats = { views: 0 };
                }
                profiles[profileIndex].stats.views = (profiles[profileIndex].stats.views || 0) + 1;
                profiles[profileIndex].stats.lastView = new Date();
                
                await fs.writeFile(DATA_FILE, JSON.stringify(profiles, null, 2));
            }
        }
    } catch (error) {
        console.error('خطأ في تحديث الإحصائيات:', error);
    }
}
// ============================================
// دالة جلب الدولة من عنوان IP
// ============================================
async function getCountryFromIP(ip) {
    try {
        // تجاهل الـ IP المحلي
        if (ip === '127.0.0.1' || ip === '::1' || ip.includes('192.168.') || ip.includes('10.0.')) {
            return { country: 'محلي', flag: '💻', code: 'LOCAL' };
        }

        // استخدام API مجاني (ip-api.com)
        const response = await axios.get(`http://ip-api.com/json/${ip}`, {
            timeout: 3000, // مهلة 3 ثواني
            headers: { 'User-Agent': 'NFC-Card-System' }
        });

        if (response.data && response.data.status === 'success') {
            return {
                country: response.data.country,
                flag: getFlagEmoji(response.data.countryCode),
                code: response.data.countryCode
            };
        } else {
            return { country: 'غير معروف', flag: '🌐', code: 'UNKNOWN' };
        }
    } catch (error) {
        console.log('⚠️ خطأ في جلب الدولة:', error.message);
        return { country: 'غير معروف', flag: '🌐', code: 'UNKNOWN' };
    }
}

// دالة تحويل كود الدولة إلى علم (Emoji Flag)
function getFlagEmoji(countryCode) {
    if (!countryCode) return '🌐';
    
    try {
        // تحويل الكود (مثل SA) إلى علم (🇸🇦)
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        
        return String.fromCodePoint(...codePoints);
    } catch (error) {
        return '🌐';
    }
}

// تسجيل زيارة
async function logVisit(profileId, req) {
    try {
        // استخراج IP الحقيقي
        let ip = req.headers['x-forwarded-for'] || 
                 req.headers['x-real-ip'] ||
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress || 
                 req.ip ||
                 'unknown';
        
        if (ip && ip.includes('::ffff:')) {
            ip = ip.split('::ffff:')[1];
        }
        
        if (ip && ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }
        
        // تنظيف IP من أي مسافات
        ip = ip.trim();
        
        // ✅ جلب الدولة من IP
        const countryInfo = await getCountryFromIP(ip);
        
        const userAgent = req.headers['user-agent'] || 'غير معروف';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'مباشر';
        
        const visitData = {
            profileId: profileId,
            cardId: profileId,
            ip: ip,
            country: countryInfo.country,
            countryFlag: countryInfo.flag,
            countryCode: countryInfo.code,
            userAgent: userAgent,
            browser: getBrowserInfo(userAgent),
            os: getOSInfo(userAgent),
            referer: referer,
            timestamp: new Date(),
            createdAt: new Date()
        };
        
        console.log('📝 تسجيل زيارة:', { 
            profileId, 
            ip, 
            country: countryInfo.country,
            browser: visitData.browser 
        });
        
        if (isPostgresConnected) {
            // ✅ استخدام PostgreSQL
            await createVisit(visitData);
        } else {
            // ⚠️ استخدام الملف المحلي
            const VISITS_FILE = path.join(__dirname, 'data', 'visits.json');
            
            const dataDir = path.join(__dirname, 'data');
            try {
                await fs.access(dataDir);
            } catch {
                await fs.mkdir(dataDir, { recursive: true });
            }
            
            let visits = [];
            try {
                const data = await fs.readFile(VISITS_FILE, 'utf8');
                visits = JSON.parse(data);
            } catch {
                visits = [];
            }
            
            visits.push(visitData);
            await fs.writeFile(VISITS_FILE, JSON.stringify(visits, null, 2));
        }
        
        // تحديث إحصائيات الملف الشخصي
        await updateProfileStats(profileId);
        
        return true;
    } catch (error) {
        console.error('❌ خطأ في تسجيل الزيارة:', error);
        return false;
    }
}
// دوال مساعدة لاستخراج معلومات المتصفح ونظام التشغيل (نفس الكود السابق)
function getBrowserInfo(userAgent) {
    if (!userAgent) return 'غير معروف';
    
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Google Chrome';
    if (userAgent.includes('Firefox')) return 'Mozilla Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Apple Safari';
    if (userAgent.includes('Edg')) return 'Microsoft Edge';
    if (userAgent.includes('OPR') || userAgent.includes('Opera')) return 'Opera';
    if (userAgent.includes('MSIE') || userAgent.includes('Trident')) return 'Internet Explorer';
    
    return 'متصفح آخر';
}

function getOSInfo(userAgent) {
    if (!userAgent) return 'غير معروف';
    
    if (userAgent.includes('Windows NT 10.0')) return 'Windows 10/11';
    if (userAgent.includes('Windows NT 6.3')) return 'Windows 8.1';
    if (userAgent.includes('Windows NT 6.2')) return 'Windows 8';
    if (userAgent.includes('Windows NT 6.1')) return 'Windows 7';
    if (userAgent.includes('Mac OS X')) return 'macOS';
    if (userAgent.includes('iPhone')) return 'iOS (iPhone)';
    if (userAgent.includes('iPad')) return 'iOS (iPad)';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('Linux')) return 'Linux';
    
    return 'نظام تشغيل آخر';
}

// ============================================
// المسارات (Routes) - نفس الكود السابق
// ============================================

// صفحة فتح القفل
app.get('/unlock', (req, res) => {
    res.render('site-locked', {
        title: 'فتح الموقع',
        expiryDate: expiryDate.toLocaleDateString('ar-SA'),
        error: null
    });
});

// التحقق من كلمة المرور لفتح الموقع
app.post('/unlock-site', (req, res) => {
    const { password } = req.body;
    
    if (password === MASTER_PASSWORD) {
        req.session.siteUnlocked = true;
        res.redirect('/');
    } else {
        res.render('site-locked', {
            title: '⚠️ كلمة مرور خاطئة',
            expiryDate: expiryDate.toLocaleDateString('ar-SA'),
            error: 'كلمة المرور غير صحيحة'
        });
    }
});

// Route لإطالة المدة
app.get('/extend-site/:days', (req, res) => {
    const { days } = req.params;
    const daysToAdd = parseInt(days);
    
    if (isNaN(daysToAdd)) {
        return res.status(400).json({ error: 'عدد الأيام غير صحيح' });
    }
    
    const providedSecret = req.query.secret || '';
    
    if (providedSecret === MASTER_PASSWORD) {
        const oldDate = new Date(expiryDate);
        expiryDate.setDate(expiryDate.getDate() + daysToAdd);
        
        res.json({ 
            success: true, 
            message: `تم تمديد الموقع ${days} يوم`,
            oldExpiryDate: oldDate.toLocaleDateString('ar-SA'),
            newExpiryDate: expiryDate.toLocaleDateString('ar-SA')
        });
    } else {
        res.status(403).json({ error: 'غير مصرح' });
    }
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.render('index', {
        title: 'نظام بطاقات NFC الذكية',
        message: 'مرحباً بك في نظام بطاقات NFC الذكية'
    });
});

// صفحة إنشاء الهوية الذكية
app.get('/create-profile', (req, res) => {
    res.render('create-profile', {
        title: 'إنشاء هويتك الذكية',
        step: 1,
        ctaText: 'ابدأ الآن مجاناً',
        ctaColor: '#667eea'
    });
});

// حفظ البيانات للخطوة 1 - مع رفع الصور
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

app.post('/create-profile/step1', upload.single('profileImage'), async (req, res) => {
    try {
        const { 
            name, 
            email, 
            phone, 
            title, 
            company, 
            bio,
            website,
            address          
        } = req.body;

        console.log("📦 DATA المستلمة:", req.body);
        console.log("🖼️ IMAGE:", req.file ? `مستلم (${req.file.size} بايت)` : 'لا يوجد صورة');

        if (!name || !email || !phone) {
            console.log('❌ حقول ناقصة:', { name, email, phone });
            return res.redirect('/create-profile?error=الرجاء إدخال جميع البيانات المطلوبة');
        }

        const profileId = `profile-${uuidv4().substring(0, 8)}`;

        req.session.profileData = {
            profileId,
            name, 
            email, 
            phone, 
            title, 
            company, 
            bio,
            website,
            address
        };

        console.log('✅ بيانات تم حفظها في الجلسة:', { name, website, address, profileId });
        
        // ✅ التوجيه إلى الخطوة الثانية
        res.redirect('/create-profile/step2');

    } catch (error) {
        console.error('❌ خطأ في /create-profile/step1:', error);
        res.redirect('/create-profile?error=حدث خطأ، الرجاء المحاولة مرة أخرى');
    }
});

// صفحة اختيار القالب (الخطوة 2)
app.get('/create-profile/step2', (req, res) => {
    if (!req.session.profileData) {
        return res.redirect('/create-profile?error=الرجاء البدء من البداية');
    }
    
    res.render('create-profile-step2', {
        title: 'اختر قالب هويتك',
        step: 2,
        formData: req.session.profileData,
        ctaText: 'اختر القالب واستمر',
        ctaColor: '#28a745'
    });
});

// حفظ اختيار القالب
// حفظ اختيار القالب - مع التوجيه إلى معاينة البطاقة
app.post('/create-profile/step2', (req, res) => {
    const { template } = req.body;
    
    if (!req.session.profileData) {
        return res.redirect('/create-profile?error=الرجاء البدء من البداية');
    }
    
    // حفظ القالب في الجلسة
    req.session.profileData.template = template;
    
    // ✅ التوجيه إلى صفحة معاينة البطاقة بدلاً من الخطوة 3
    res.redirect(`/template-preview/${template}`);
    
    // إذا أردت الاستمرار إلى الخطوة 3 لاحقاً، علق السطر أعلاه واستخدم هذا:
    // res.redirect('/create-profile/step3');
});

// صفحة إعدادات الحماية (الخطوة 3)
app.get('/create-profile/step3', (req, res) => {
    if (!req.session.profileData) {
        return res.redirect('/create-profile?error=الرجاء البدء من البداية');
    }
    
    res.render('create-profile-step3', {
        title: 'حماية ملفك الشخصي',
        step: 3,
        formData: req.session.profileData,
        ctaText: 'تأمين ملفي الشخصي',
        ctaColor: '#dc3545'
    });
});

// حفظ إعدادات الحماية
app.post('/create-profile/step3', (req, res) => {
    const { password, enableStats, allowVCard } = req.body;
    
    if (!req.session.profileData) {
        return res.redirect('/create-profile?error=الرجاء البدء من البداية');
    }
    
    req.session.profileData.password = password || '';
    req.session.profileData.enableStats = enableStats || 'off';
    req.session.profileData.allowVCard = allowVCard || 'off';
    
    res.redirect('/create-profile/step4');
});

// صفحة التأكيد والنتيجة (الخطوة 4)
app.get('/create-profile/step4', async (req, res) => {
    try {
        if (!req.session.profileData) {
            return res.redirect('/create-profile?error=الرجاء البدء من البداية');
        }
        
        const formData = req.session.profileData;
        const profileId = formData.profileId;
        const profileUrl = `${req.baseUrlFull}/p/${profileId}`;
        
        const profileData = {
            profileId,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            title: formData.title,
            company: formData.company,
            bio: formData.bio,
            website: formData.website,
            address: formData.address,
            template: formData.template || 'modern',
            password: formData.password,
            isPasswordProtected: !!(formData.password && formData.password.trim() !== ''),
            enableStats: formData.enableStats === 'on',
            allowVCard: formData.allowVCard === 'on',
            stats: { views: 0 },
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await saveProfile(profileData);
        
        if (!result.success) {
            console.error('خطأ في الحفظ:', result.error);
        }
        
        console.log('✅ تم حفظ الملف الشخصي:', {
            name: profileData.name,
            website: profileData.website,
            address: profileData.address
        });
        
        res.render('create-profile-step4', {
            title: 'هويتك الذكية جاهزة',
            step: 4,
            formData: profileData,
            profileId,
            profileUrl,
            ctaText: 'اطلب بطاقتك المادية الآن',
            ctaColor: '#667eea',
            whatsappNumber: process.env.WHATSAPP_NUMBER || '966500000000'
        });
        
    } catch (error) {
        console.error('خطأ في حفظ الملف الشخصي:', error);
        res.redirect('/create-profile?error=حدث خطأ في حفظ البيانات');
    }
});

// صفحة عرض الملف الشخصي العام
// صفحة عرض الملف الشخصي العام - مع تمرير template
app.get('/p/:profileId', async (req, res) => {
    try {
        const profile = await findProfile(req.params.profileId);
        
        if (!profile) {
            return res.render('error', {
                title: 'الملف غير موجود',
                message: 'عذراً، الملف الشخصي غير موجود'
            });
        }
        
        await logVisit(req.params.profileId, req);
        
        // ✅ استخراج القالب من البيانات المحفوظة
        const template = profile.template || 'modern';
        
        console.log('🎨 عرض البطاقة بالقالب:', template, 'للمستخدم:', profile.name);
        
        res.render('profile-3d', {
            title: `ملف ${profile.name} الشخصي | عرض ثلاثي الأبعاد`,
            profileId: profile.profileId,
            formData: profile,
            profileUrl: `${req.baseUrlFull}/p/${profile.profileId}`,
            whatsappNumber: process.env.WHATSAPP_NUMBER || '966500000000',
            query: req.query || {},
            enableLavaLamp: false,
            template: template // ✅ هذا هو المهم
        });
        
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).render('error', {
            title: 'خطأ',
            message: 'حدث خطأ في تحميل الملف الشخصي'
        });
    }
});

// رابط مخصص للعرض الثلاثي الأبعاد (3D)
app.get('/3d/:profileId', async (req, res) => {
    try {
        const profile = await findProfile(req.params.profileId);
        
        if (!profile) {
            return res.render('error', {
                title: 'الملف غير موجود',
                message: 'عذراً، الملف الشخصي غير موجود'
            });
        }
        
        await logVisit(req.params.profileId, req);
        
        // ✅ استخراج القالب
        const template = profile.template || 'modern';
        
        console.log('🎮 عرض ثلاثي الأبعاد بالقالب:', template, 'للمستخدم:', profile.name);
        
        res.render('profile-3d', {
            title: `ملف ${profile.name} الشخصي | عرض ثلاثي الأبعاد`,
            profileId: profile.profileId,
            formData: profile,
            profileUrl: `${req.baseUrlFull}/p/${profile.profileId}`,
            whatsappNumber: process.env.WHATSAPP_NUMBER || '966500000000',
            query: req.query || {},
            enableLavaLamp: false,
            template: template // ✅ هذا هو المهم
        });
        
    } catch (error) {
        console.error('خطأ في العرض الثلاثي الأبعاد:', error);
        res.status(500).render('error', {
            title: 'خطأ',
            message: 'حدث خطأ في تحميل العرض الثلاثي الأبعاد'
        });
    }
});
// التحقق من كلمة المرور
app.post('/p/:profileId/verify', async (req, res) => {
    try {
        const { password } = req.body;
        const profile = await findProfile(req.params.profileId);
        
        if (profile && profile.password === password) {
            res.redirect(`/p/${req.params.profileId}?verified=true`);
        } else {
            res.redirect(`/p/${req.params.profileId}?error=كلمة المرور غير صحيحة`);
        }
    } catch (error) {
        res.redirect(`/p/${req.params.profileId}?error=حدث خطأ`);
    }
});

// API لإنشاء طلب بطاقة
app.post('/api/create-order', async (req, res) => {
    try {
        const { profileId, cardType, quantity } = req.body;
        
        const orderData = {
            orderId: `ORD-${uuidv4().substring(0, 8)}`,
            profileId,
            cardType: cardType || 'physical',
            quantity: quantity || 1,
            status: 'pending',
            createdAt: new Date()
        };
        
        if (isPostgresConnected) {
            // حفظ في PostgreSQL
            await createOrder(orderData);
        } else {
            // حفظ في ملف محلي
            const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
            
            let orders = [];
            try {
                const data = await fs.readFile(ORDERS_FILE, 'utf8');
                orders = JSON.parse(data);
            } catch {
                orders = [];
            }
            
            orders.push(orderData);
            await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2));
        }
        
        const whatsappMessage = `طلب جديد:\nالرقم: ${orderData.orderId}\nالنوع: ${cardType}\nالكمية: ${quantity}`;
        
        res.json({
            success: true,
            message: 'تم إنشاء الطلب بنجاح',
            orderId: orderData.orderId,
            whatsappLink: `https://wa.me/${process.env.WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`
        });
        
    } catch (error) {
        console.error('خطأ في إنشاء الطلب:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في إنشاء الطلب'
        });
    }
});

// لوحة التحكم مع إحصائيات
app.get('/admin', async (req, res) => {
    try {
        let profiles = [];
        let visits = [];
        let orders = [];
        let stats = {};
        
        if (isPostgresConnected) {
            // ✅ استخدام PostgreSQL
            profiles = await getAllProfiles();
            visits = await getAllVisits();
            
            // ✅ جلب الطلبات إذا كانت موجودة
            try {
                const { Order } = require('./models/Profile');
                orders = await Order.findAll();
            } catch (error) {
                console.log('⚠️ لا يوجد نموذج للطلبات أو لم يتم العثور عليه');
                orders = [];
            }
            
            stats = {
                totalProfiles: profiles.length,
                totalVisits: visits.length,
                todayVisits: visits.filter(v => 
                    v && v.timestamp && new Date(v.timestamp).toDateString() === new Date().toDateString()
                ).length,
                totalOrders: orders.length
            };
        } else {
            // ⚠️ استخدام الملفات المحلية
            const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
            const VISITS_FILE = path.join(__dirname, 'data', 'visits.json');
            const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
            
            try {
                const profilesData = await fs.readFile(PROFILES_FILE, 'utf8');
                profiles = JSON.parse(profilesData);
            } catch {
                profiles = [];
            }
            
            try {
                const visitsData = await fs.readFile(VISITS_FILE, 'utf8');
                visits = JSON.parse(visitsData).slice(-100);
            } catch {
                visits = [];
            }
            
            try {
                const ordersData = await fs.readFile(ORDERS_FILE, 'utf8');
                orders = JSON.parse(ordersData);
            } catch {
                orders = [];
            }
            
            stats = {
                totalProfiles: profiles.length,
                totalVisits: visits.length,
                todayVisits: visits.filter(v => 
                    v && v.timestamp && new Date(v.timestamp).toDateString() === new Date().toDateString()
                ).length,
                totalOrders: orders.length
            };
        }
        
        // ✅ إضافة زر تسجيل الخروج
        res.render('admin', {
            title: 'لوحة التحكم',
            profiles,
            visits,
            orders,
            stats,
            query: req.query || {},
            isPostgresConnected,
            adminLoggedIn: req.session.adminLoggedIn || false,
            success: req.query.success || null,
            error: req.query.error || null
        });
        
    } catch (error) {
        console.error('خطأ في لوحة التحكم:', error);
        res.status(500).send('حدث خطأ في تحميل لوحة التحكم');
    }
});

// ✅ مسار تسجيل الخروج من لوحة التحكم
app.get('/admin/logout', (req, res) => {
    req.session.adminLoggedIn = false;
    req.session.destroy((err) => {
        if (err) {
            console.error('خطأ في تسجيل الخروج:', err);
        }
        res.redirect('/admin/login');
    });
});

// ============================================
// المسارات المفقودة للتعديل والحذف
// ============================================

// صفحة تعديل البطاقة
app.get('/admin/card/edit/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        console.log('🔍 جاري البحث عن بطاقة:', cardId);
        
        let card = null;
        let profiles = [];
        
        if (isPostgresConnected) {
            // البحث في PostgreSQL
            card = await findProfile(cardId);
        } else {
            // البحث في الملفات المحلية
            const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
            
            try {
                const data = await fs.readFile(PROFILES_FILE, 'utf8');
                profiles = JSON.parse(data);
                
                // البحث في profileId
                card = profiles.find(p => p.profileId === cardId);
                
            } catch (error) {
                console.error('خطأ في قراءة الملف:', error);
            }
        }
        
        if (card) {
            console.log('✅ تم العثور على البطاقة:', card.name);
            
            res.render('edit-card', { 
                card: card,
                query: req.query || {},
                title: `تعديل بطاقة ${card.name}`,
                enableLavaLamp: true
            });
        } else {
            console.log('❌ البطاقة غير موجودة:', cardId);
            res.redirect('/admin?error=البطاقة غير موجودة');
        }
        
    } catch (error) {
        console.error('❌ خطأ في صفحة التعديل:', error);
        res.redirect('/admin?error=حدث خطأ في تحميل صفحة التعديل');
    }
});
// تحديث بيانات البطاقة
app.post('/admin/card/update/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        const updatedData = req.body;
        
        console.log('📝 جاري تحديث البطاقة:', cardId);
        
        if (isPostgresConnected) {
            // ✅ تحديث في PostgreSQL
            const profile = await Profile.findOne({ where: { profileId: cardId } });
            
            if (profile) {
                await profile.update({
                    name: updatedData.name || profile.name,
                    email: updatedData.email || profile.email,
                    phone: updatedData.phone || profile.phone,
                    title: updatedData.title || profile.title,
                    company: updatedData.company || profile.company,
                    bio: updatedData.bio || profile.bio,
                    website: updatedData.website || profile.website,
                    address: updatedData.address || profile.address,
                    template: updatedData.template || profile.template,
                    updatedAt: new Date()
                });
                
                console.log('✅ تم تحديث البطاقة في PostgreSQL:', cardId);
                return res.redirect('/admin?success=تم تحديث البطاقة بنجاح في PostgreSQL');
            } else {
                return res.redirect('/admin?error=البطاقة غير موجودة في PostgreSQL');
            }
        } else {
            // تحديث في الملف المحلي (الكود القديم)
            const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
            
            let profiles = [];
            try {
                const data = await fs.readFile(PROFILES_FILE, 'utf8');
                profiles = JSON.parse(data);
            } catch (error) {
                return res.redirect('/admin?error=ملف البطاقات غير موجود');
            }
            
            let index = profiles.findIndex(p => p.profileId === cardId);
            
            if (index !== -1) {
                const oldCard = profiles[index];
                
                const updatedCard = {
                    ...oldCard,
                    name: updatedData.name || oldCard.name,
                    email: updatedData.email || oldCard.email,
                    phone: updatedData.phone || oldCard.phone,
                    title: updatedData.title || oldCard.title,
                    company: updatedData.company || oldCard.company,
                    bio: updatedData.bio || oldCard.bio,
                    website: updatedData.website || oldCard.website,
                    address: updatedData.address || oldCard.address,
                    template: updatedData.template || oldCard.template,
                    updatedAt: new Date()
                };
                
                profiles[index] = updatedCard;
                await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
                
                console.log('✅ تم تحديث البطاقة بنجاح:', updatedCard.name);
                res.redirect('/admin?success=تم تحديث البطاقة بنجاح');
            } else {
                res.redirect('/admin?error=البطاقة غير موجودة');
            }
        }
        
    } catch (error) {
        console.error('❌ خطأ في تحديث البطاقة:', error);
        res.redirect('/admin?error=حدث خطأ في تحديث البطاقة: ' + error.message);
    }
});
// حذف بطاقة

app.post('/admin/card/delete/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        console.log('🗑️ جاري حذف البطاقة:', cardId);
        
        if (isPostgresConnected) {
            // ✅ حذف من PostgreSQL (تم التعديل)
            const profile = await Profile.findOne({ where: { profileId: cardId } });
            
            if (profile) {
                // حذف الزيارات المرتبطة أولاً (حفاظاً على تكامل البيانات)
                await Visit.destroy({ where: { profileId: cardId } });
                
                // حذف الطلبات المرتبطة
                await Order.destroy({ where: { profileId: cardId } });
                
                // حذف البروفايل نفسه
                await profile.destroy();
                
                console.log('✅ تم حذف البطاقة من PostgreSQL:', cardId);
                return res.redirect('/admin?success=تم حذف البطاقة بنجاح من PostgreSQL');
            } else {
                console.log('❌ البطاقة غير موجودة في PostgreSQL');
                return res.redirect('/admin?error=البطاقة غير موجودة');
            }
        } else {
            // حذف من الملف المحلي (الكود القديم)
            const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
            
            const data = await fs.readFile(PROFILES_FILE, 'utf8');
            let profiles = JSON.parse(data);
            
            let index = profiles.findIndex(p => p.profileId === cardId);
            
            if (index !== -1) {
                const deletedCard = profiles[index];
                profiles.splice(index, 1);
                await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
                
                console.log('✅ تم حذف البطاقة بنجاح:', deletedCard.name);
                res.redirect('/admin?success=تم حذف البطاقة بنجاح');
            } else {
                console.log('❌ البطاقة غير موجودة');
                res.redirect('/admin?error=البطاقة غير موجودة');
            }
        }
        
    } catch (error) {
        console.error('❌ خطأ في حذف البطاقة:', error);
        res.redirect('/admin?error=حدث خطأ في حذف البطاقة: ' + error.message);
    }
});

// صفحة عرض جميع البطاقات (معدلة لعرض الكل)
app.get('/card', async (req, res) => {
    try {
        let profiles = [];
        
        if (isPostgresConnected) {
            profiles = await getAllProfiles();
        } else {
            const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
            try {
                const data = await fs.readFile(PROFILES_FILE, 'utf8');
                profiles = JSON.parse(data);
            } catch {
                profiles = [];
            }
        }
        
        // ✅ إزالة الـ slice وعرض جميع البطاقات
        res.render('cards-list', {
            title: 'جميع البطاقات المتاحة',
            profiles: profiles, // عرض الكل بدون تقطيع
            totalCount: profiles.length,
            query: req.query || {}
        });
    } catch (error) {
        console.error('خطأ في عرض البطاقات:', error);
        res.redirect('/');
    }
});


// ============================================
// صفحات عرض القوالب - NEW
// ============================================

// صفحة معاينة القالب (عرض البطاقة)
app.get('/template-preview/:template', async (req, res) => {
    try {
        const template = req.params.template;
        
        // التحقق من صحة القالب
        const validTemplates = ['modern', 'classic', 'minimal', 'dark', 'tech', 'elegant', 'corporate', 'creative', '3d', 'neon'];
        if (!validTemplates.includes(template)) {
            console.log('⚠️ قالب غير صالح:', template);
            return res.redirect('/create-profile/step2?error=قالب غير صالح');
        }
        
        // التحقق من وجود بيانات في الجلسة
        if (!req.session.profileData) {
            console.log('⚠️ لا توجد بيانات في الجلسة، استخدام بيانات تجريبية');
            // استخدام بيانات تجريبية مع القالب المختار
            req.session.profileData = {
                name: 'أحمد محمد',
                title: 'مطور برمجيات',
                company: 'شركة التقنية',
                email: 'ahmed@example.com',
                phone: '+966 50 123 4567',
                website: 'www.ahmed.com',
                address: 'الرياض، السعودية',
                bio: 'مطور ويب بخبرة 5 سنوات',
                template: template // إضافة القالب هنا
            };
        } else {
            // تحديث القالب في بيانات الجلسة الموجودة
            req.session.profileData.template = template;
        }
        
        // الحصول على البيانات المحدثة من الجلسة
        const formData = req.session.profileData;
        const profileId = formData.profileId || `demo-${Date.now()}`;
        const profileUrl = `${req.baseUrlFull}/p/${profileId}`;
        
        console.log('✅ عرض معاينة القالب:', {
            template: template,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            title: formData.title,
            company: formData.company
        });
        
        res.render('template-preview', {
            formData: formData,
            profileId: profileId,
            profileUrl: profileUrl,
            template: template,
            whatsappNumber: process.env.WHATSAPP_NUMBER || '966500000000'
        });
        
    } catch (error) {
        console.error('❌ خطأ في معاينة القالب:', error);
        res.redirect('/create-profile/step2?error=حدث خطأ في المعاينة');
    }
});
// عرض البطاقة المحفوظة
app.get('/card/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        console.log('🔍 جاري عرض البطاقة:', cardId);
        
        let card = null;
        
        if (isPostgresConnected) {
            card = await findProfile(cardId);
        } else {
            const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
            try {
                const data = await fs.readFile(PROFILES_FILE, 'utf8');
                const profiles = JSON.parse(data);
                card = profiles.find(p => p.profileId === cardId || p.cardId === cardId);
            } catch (error) {
                console.log('⚠️ ملف البطاقات غير موجود');
            }
        }
        
        if (!card) {
            return res.render('error', {
                title: 'البطاقة غير موجودة',
                message: 'عذراً، البطاقة المطلوبة غير موجودة'
            });
        }
        
        // تسجيل الزيارة
        await logVisit(card.profileId || cardId, req);
        
        const profileUrl = `${req.baseUrlFull}/p/${card.profileId || cardId}`;
        const template = card.template || 'modern';
        
        res.render('template-preview', {
            formData: card,
            profileId: card.profileId || cardId,
            profileUrl: profileUrl,
            template: template,
            whatsappNumber: process.env.WHATSAPP_NUMBER || '966500000000'
        });
        
    } catch (error) {
        console.error('خطأ في عرض البطاقة:', error);
        res.status(500).render('error', {
            title: 'خطأ',
            message: 'حدث خطأ في تحميل البطاقة'
        });
    }
});

// تحديث مسار step2 ليشمل التوجيه إلى معاينة القالب (اختياري)
// يمكنك تعديل هذا إذا أردت الانتقال مباشرة إلى المعاينة بعد الاختيار
/*
app.post('/create-profile/step2', (req, res) => {
    const { template } = req.body;
    
    if (!req.session.profileData) {
        return res.redirect('/create-profile?error=الرجاء البدء من البداية');
    }
    
    req.session.profileData.template = template;
    
    // للتجربة: اذهب إلى معاينة القالب مباشرة
    res.redirect(`/template-preview/${template}`);
    
    // أو استمر للخطوة التالية:
    // res.redirect('/create-profile/step3');
});
*/

// باقي المسارات (نفس الكود السابق) - card, edit, delete, debug, etc.

// ============================================
// تشغيل الخادم
// ============================================

// ============================================
// Routes للتشخيص وإصلاح القوالب
// ============================================

// Route للتشخيص - اعرض بيانات البطاقة بصيغة JSON
app.get('/debug/:profileId', async (req, res) => {
    try {
        const profileId = req.params.profileId;
        console.log('🔍 تشخيص البطاقة:', profileId);
        
        const profile = await findProfile(profileId);
        
        if (!profile) {
            return res.json({ 
                success: false, 
                error: 'الملف غير موجود',
                profileId: profileId 
            });
        }
        
        // عرض البيانات كاملة
        res.json({
            success: true,
            profileId: profile.profileId,
            name: profile.name,
            template: profile.template || 'غير موجود (سيكون القيمة الافتراضية modern)',
            allData: profile
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Route لتحديث القالب يدوياً
app.get('/fix-template/:profileId/:template', async (req, res) => {
    try {
        const { profileId, template } = req.params;
        
        // التحقق من أن القالب موجود في القائمة
        const validTemplates = ['modern', 'classic', 'minimal', 'dark', 'tech', 'elegant', 'corporate', 'creative', '3d', 'neon'];
        
        if (!validTemplates.includes(template)) {
            return res.json({ 
                success: false, 
                error: 'قالب غير صالح. القوالب المتاحة: ' + validTemplates.join(', ') 
            });
        }
        
        console.log('🔧 جاري تحديث القالب:', { profileId, template });
        
        if (isPostgresConnected) {
            // تحديث في PostgreSQL
            const profile = await Profile.findOne({ where: { profileId } });
            
            if (profile) {
                await profile.update({ template: template });
                console.log('✅ تم تحديث القالب في PostgreSQL');
                
                // جلب البيانات المحدثة
                const updatedProfile = await Profile.findOne({ where: { profileId } });
                
                res.json({ 
                    success: true, 
                    message: `✅ تم تحديث القالب إلى ${template}`,
                    profileId: profileId,
                    newTemplate: updatedProfile.template,
                    database: 'PostgreSQL'
                });
            } else {
                res.json({ 
                    success: false, 
                    error: 'الملف غير موجود في PostgreSQL',
                    profileId: profileId 
                });
            }
            
        } else {
            // تحديث في الملف المحلي
            const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
            
            // التأكد من وجود الملف
            try {
                await fs.access(PROFILES_FILE);
            } catch {
                return res.json({ 
                    success: false, 
                    error: 'ملف البيانات غير موجود' 
                });
            }
            
            // قراءة الملف
            const data = await fs.readFile(PROFILES_FILE, 'utf8');
            let profiles = JSON.parse(data);
            
            // البحث عن البطاقة
            const index = profiles.findIndex(p => p.profileId === profileId);
            
            if (index !== -1) {
                // تحديث القالب
                profiles[index].template = template;
                profiles[index].updatedAt = new Date();
                
                // حفظ الملف
                await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
                
                console.log('✅ تم تحديث القالب في الملف المحلي');
                
                res.json({ 
                    success: true, 
                    message: `✅ تم تحديث القالب إلى ${template}`,
                    profileId: profileId,
                    name: profiles[index].name,
                    newTemplate: profiles[index].template,
                    database: 'ملف محلي'
                });
            } else {
                res.json({ 
                    success: false, 
                    error: 'الملف غير موجود في الملف المحلي',
                    profileId: profileId 
                });
            }
        }
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        res.json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Route لعرض جميع البطاقات ومعرفة القوالب
app.get('/debug-all', async (req, res) => {
    try {
        let profiles = [];
        let result = [];
        
        if (isPostgresConnected) {
            profiles = await getAllProfiles();
        } else {
            const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
            try {
                const data = await fs.readFile(PROFILES_FILE, 'utf8');
                profiles = JSON.parse(data);
            } catch {
                profiles = [];
            }
        }
        
        // تجهيز النتائج
        result = profiles.map(p => ({
            profileId: p.profileId,
            name: p.name,
            template: p.template || 'غير موجود (سيكون modern)',
            hasTemplate: p.template ? '✅ نعم' : '❌ لا'
        }));
        
        res.json({
            total: result.length,
            profiles: result
        });
        
    } catch (error) {
        res.json({ error: error.message });
    }
});
// ============================================
// نظام الحماية المتقدم للوحة التحكم
// ============================================

// كلمة المرور الرئيسية للدخول (يمكنك تغييرها)
const ADMIN_USERNAME = 'admin'; // اسم المستخدم
const ADMIN_PASSWORD = 'Albahri2024'; // كلمة المرور - غيرها بشيء معقد

// صفحة تسجيل الدخول للوحة التحكم
app.get('/admin/login', (req, res) => {
    // إذا كان المستخدم مسجل الدخول بالفعل، حوله للوحة التحكم
    if (req.session && req.session.adminLoggedIn) {
        return res.redirect('/admin');
    }
    
    res.render('admin-login', {
        title: 'تسجيل الدخول - لوحة التحكم',
        error: req.query.error || null,
        layout: false // إذا كان عندك layout
    });
});

// التحقق من بيانات الدخول
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    // التحقق من اسم المستخدم وكلمة المرور
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.adminLoggedIn = true;
        req.session.adminLoginTime = new Date();
        
        // تسجيل محاولة الدخول الناجحة (اختياري)
        console.log(`✅ دخول ناجح للوحة التحكم: ${username} في ${new Date().toLocaleString()}`);
        
        res.redirect('/admin');
    } else {
        console.log(`❌ محاولة دخول فاشلة: ${username} من IP: ${req.ip}`);
        res.redirect('/admin/login?error=بيانات الدخول غير صحيحة');
    }
});

// تسجيل الخروج
app.get('/admin/logout', (req, res) => {
    req.session.adminLoggedIn = false;
    req.session.destroy((err) => {
        if (err) {
            console.error('خطأ في تسجيل الخروج:', err);
        }
        res.redirect('/admin/login');
    });
});

// Middleware لحماية لوحة التحكم
function requireAdminLogin(req, res, next) {
    // قائمة المسارات المسموح بها بدون تسجيل دخول
    const publicPaths = [
        '/admin/login',
        '/admin/login.css',
        '/admin/login.js',
        '/css/',
        '/js/',
        '/images/'
    ];
    
    // التحقق إذا كان المسار الحالي عام
    if (publicPaths.some(path => req.path.startsWith(path))) {
        return next();
    }
    
    // التحقق من جلسة تسجيل الدخول
    if (req.session && req.session.adminLoggedIn) {
        // يمكن إضافة صلاحية الجلسة (مثلاً تنتهي بعد 8 ساعات)
        const loginTime = req.session.adminLoginTime;
        if (loginTime) {
            const hoursSinceLogin = (new Date() - new Date(loginTime)) / (1000 * 60 * 60);
            if (hoursSinceLogin > 8) { // تنتهي الجلسة بعد 8 ساعات
                req.session.adminLoggedIn = false;
                return res.redirect('/admin/login?error=انتهت الجلسة، الرجاء تسجيل الدخول مرة أخرى');
            }
        }
        
        return next();
    }
    
    // إذا لم يكن مسجل دخول، حوله لصفحة تسجيل الدخول
    res.redirect('/admin/login');
}

// تطبيق الحماية على جميع مسارات /admin
app.use('/admin', requireAdminLogin);

// حماية إضافية: منع الوصول المباشر للملفات الحساسة
app.use((req, res, next) => {
    // منع الوصول لملفات الإعدادات
    const blockedPaths = [
        '/.env',
        '/server.js',
        '/package.json',
        '/package-lock.json',
        '/data/',
        '/models/'
    ];
    
    if (blockedPaths.some(path => req.path.startsWith(path))) {
        return res.status(403).send('⛔ غير مصرح بالوصول');
    }
    
    next();
});


// دالة تحويل كود الدولة إلى علم (Emoji Flag)
function getFlagEmoji(countryCode) {
    if (!countryCode) return '🌐';
    
    // تحويل الكود (مثل SA) إلى علم (🇸🇦)
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    
    return String.fromCodePoint(...codePoints);
}

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║     نظام بطاقات NFC الذكية               ║
    ╠══════════════════════════════════════════╣
    ║  الخادم يعمل على: http://localhost:${PORT}  ║
    ║  إنشاء هوية: http://localhost:${PORT}/create-profile ║
    ║  لوحة التحكم: http://localhost:${PORT}/admin/login ║
    ║  فتح القفل: http://localhost:${PORT}/unlock ║
    ╠══════════════════════════════════════════╣
    ║  قاعدة البيانات: ${isPostgresConnected ? '✅ PostgreSQL' : '⚠️  ملفات محلية'} ║
    ║  انتهاء الصلاحية: ${expiryDate.toLocaleDateString('ar-SA')} ║
    ╚══════════════════════════════════════════╝
    `);
});