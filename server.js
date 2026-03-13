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
const session = require('express-session'); // ✅ الجلسات هنا في البداية

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
// إعدادات الجلسة - مهم تكون قبل أي استخدام للجلسات
// ============================================
app.use(session({
    secret: 'your-secret-key-change-this-to-something-secure-123',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // يوم واحد
        secure: false // غيرها إلى true لو عندك HTTPS
    }
}));

// تعيين محرك العرض EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================
// نظام انتهاء صلاحية الموقع (بعد أسبوع)
// ============================================

// تاريخ انتهاء الصلاحية (بعد أسبوع من الآن)
const expiryDate = new Date();
expiryDate.setDate(expiryDate.getDate() + 7); // +7 أيام

// كلمة المرور للدخول بعد انتهاء الصلاحية
const MASTER_PASSWORD = "Albahri.com"; // ⚠️ غيرها إلى كلمة سر قوية

// وسيط التحقق من الصلاحية
app.use((req, res, next) => {
    // استثناء بعض المسارات المهمة
    const allowedPaths = [
        '/unlock', 
        '/unlock-site',
        '/extend-site', 
        '/css', 
        '/js', 
        '/images',
        '/favicon.ico'
    ];
    
    // إذا كان المسار مسموح به حتى لو انتهت الصلاحية
    if (allowedPaths.some(path => req.path.startsWith(path))) {
        return next();
    }

    // التحقق من الجلسة (إذا كان المستخدم فتح القفل)
    if (req.session && req.session.siteUnlocked) {
        return next();
    }

    const now = new Date();
    
    // إذا انتهت الصلاحية
    if (now > expiryDate) {
        // عرض صفحة القفل
        return res.render('site-locked', {
            title: '⚠️ الموقع مغلق',
            expiryDate: expiryDate.toLocaleDateString('ar-SA'),
            error: null
        });
    }
    
    // الموقع لسه شغال
    next();
});

// ============================================
// استيراد الموديلات من PostgreSQL
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

// ============================================
// الاتصال بقاعدة البيانات PostgreSQL
// ============================================
let isPostgresConnected = false;

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
        console.error('📌 تفاصيل إضافية:', error.parent?.message || 'لا توجد تفاصيل إضافية');
        console.log('');
        console.log('⚠️  استخدام الملفات المحلية كبديل');
        console.log('📂 سيتم حفظ البيانات في مجلد data/');
        console.log('');
        
        isPostgresConnected = false;
        return false;
    }
}
// محاولة الاتصال بقاعدة البيانات
connectToDatabase();

// ============================================
// إعدادات Lava Lamp
// ============================================

// وسيط لإضافة Lava Lamp للصفحات
app.use((req, res, next) => {
    res.locals.enableLavaLamp = true; // تفعيل Lava Lamp لجميع الصفحات
    res.locals.lavaLampOptions = {
        intensity: 'medium', // خفيف، متوسط، قوي
        interactive: true, // تفاعل مع الماوس
        autoColor: true // تغيير الألوان تلقائياً
    };
    next();
});

// ============================================
// دوال مساعدة للتعامل مع البيانات
// ============================================

// حفظ ملف شخصي جديد
async function saveProfile(profileData) {
    try {
        if (isPostgresConnected) {
            // استخدام PostgreSQL
            return await saveProfileToDB(profileData);
        } else {
            // استخدام الملف المحلي كبديل
            const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');
            
            // التأكد من وجود مجلد data
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
            return await findProfileInDB(profileId);
        } else {
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

// تحديث إحصائيات الزيارة (للملفات المحلية)
async function updateProfileStatsLocally(profileId) {
    try {
        const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const profiles = JSON.parse(data);
        
        const profileIndex = profiles.findIndex(p => p.profileId === profileId);
        if (profileIndex !== -1) {
            if (!profiles[profileIndex].stats) {
                profiles[profileIndex].stats = { views: 0, uniqueVisitors: 0 };
            }
            profiles[profileIndex].stats.views = (profiles[profileIndex].stats.views || 0) + 1;
            profiles[profileIndex].stats.lastView = new Date();
            
            await fs.writeFile(DATA_FILE, JSON.stringify(profiles, null, 2));
        }
    } catch (error) {
        console.error('خطأ في تحديث الإحصائيات محلياً:', error);
    }
}

// تسجيل زيارة
// تسجيل زيارة - نسخة محسنة
async function logVisit(profileId, req) {
    try {
        // استخراج IP الحقيقي (مهم للخوادم التي تستخدم Proxy)
        let ip = req.headers['x-forwarded-for'] || 
                 req.headers['x-real-ip'] ||
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress || 
                 req.ip ||
                 'unknown';
        
        // تنظيف الـ IP (إزالة بادئة IPv6 إذا وجدت)
        if (ip && ip.includes('::ffff:')) {
            ip = ip.split('::ffff:')[1];
        }
        
        // إذا كان IP طويل (عدة عناوين) خذ أول واحد
        if (ip && ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }
        
        // استخراج User Agent كامل
        const userAgent = req.headers['user-agent'] || 'غير معروف';
        
        // استخراج Referer
        const referer = req.headers['referer'] || req.headers['referrer'] || 'مباشر';
        
        // تجهيز بيانات الزيارة بشكل كامل
        const visitData = {
            profileId: profileId,
            cardId: profileId, // إضافة cardId للتطابق مع الواجهة
            ip: ip,
            userAgent: userAgent,
            browser: getBrowserInfo(userAgent), // استخراج معلومات المتصفح
            os: getOSInfo(userAgent), // استخراج معلومات نظام التشغيل
            referer: referer,
            timestamp: new Date(),
            createdAt: new Date() // إضافة createdAt للتطابق
        };
        
        console.log('📝 تسجيل زيارة:', {
            profileId,
            ip,
            browser: visitData.browser,
            os: visitData.os,
            userAgent: userAgent.substring(0, 50) + '...'
        });
        
        if (isPostgresConnected) {
            // استخدام PostgreSQL
            await createVisit(visitData);
        } else {
            // استخدام الملف المحلي
            const VISITS_FILE = path.join(__dirname, 'data', 'visits.json');
            
            // التأكد من وجود مجلد data
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
            
            // تحديث إحصائيات الملف الشخصي
            await updateProfileStatsLocally(profileId);
        }
        
        return true;
    } catch (error) {
        console.error('❌ خطأ في تسجيل الزيارة:', error);
        return false;
    }
}

// دالة مساعدة لاستخراج معلومات المتصفح
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

// دالة مساعدة لاستخراج معلومات نظام التشغيل
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
// الصفحات والمسارات (Routes)
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
        // تخزين في الجلسة أنه فتح القفل
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

// Route لإطالة المدة (للاستخدام الشخصي)
// Route لإطالة المدة (للاستخدام الشخصي) - نسخة مصححة
app.get('/extend-site/:days', (req, res) => {
    const { days } = req.params;
    
    // تأكد من أن days رقم صحيح
    const daysToAdd = parseInt(days);
    if (isNaN(daysToAdd)) {  // شيلنا شرط <= 0
        return res.status(400).json({ error: 'عدد الأيام غير صحيح' });
    }
    
    // استقبل secret من query parameters
    const providedSecret = req.query.secret || '';
    
    // قارن بدون مشاكل
    if (providedSecret === "Albahri.com") {
        // حدث التاريخ
        const oldDate = new Date(expiryDate);
        expiryDate.setDate(expiryDate.getDate() + daysToAdd);
        
        res.json({ 
            success: true, 
            message: `تم تمديد الموقع ${days} يوم`,
            oldExpiryDate: oldDate.toLocaleDateString('ar-SA'),
            newExpiryDate: expiryDate.toLocaleDateString('ar-SA')
        });
    } else {
        // أرسل معلومات التصحيح
        res.status(403).json({ 
            error: 'غير مصرح',
            details: {
                provided: providedSecret,
                expected: "Albahri.com",
                match: providedSecret === "Albahri.com",
                length: providedSecret.length,
                charCodes: providedSecret.split('').map(c => c.charCodeAt(0))
            }
        });
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

// حفظ البيانات للخطوة 1
app.post('/create-profile/step1', async (req, res) => {
    try {
        const { name, email, phone, title, company, bio } = req.body;
        
        // التحقق من البيانات
        if (!name || !email || !phone) {
            return res.redirect('/create-profile?error=الرجاء إدخال جميع البيانات المطلوبة');
        }
        
        // إنشاء معرف فريد
        const profileId = `profile-${uuidv4().substring(0, 8)}`;
        
        // حفظ البيانات مؤقتاً
        const queryString = new URLSearchParams({
            profileId,
            name, email, phone, title, company, bio
        }).toString();
        
        res.redirect(`/create-profile/step2?${queryString}`);
        
    } catch (error) {
        console.error('خطأ:', error);
        res.redirect('/create-profile?error=حدث خطأ، الرجاء المحاولة مرة أخرى');
    }
});

// صفحة اختيار القالب (الخطوة 2)
app.get('/create-profile/step2', (req, res) => {
    res.render('create-profile-step2', {
        title: 'اختر قالب هويتك',
        step: 2,
        formData: req.query,
        ctaText: 'اختر القالب واستمر',
        ctaColor: '#28a745'
    });
});

// حفظ اختيار القالب
app.post('/create-profile/step2', (req, res) => {
    const { template, ...formData } = req.body;
    const queryString = new URLSearchParams({ ...formData, template }).toString();
    res.redirect(`/create-profile/step3?${queryString}`);
});

// صفحة إعدادات الحماية (الخطوة 3)
app.get('/create-profile/step3', (req, res) => {
    res.render('create-profile-step3', {
        title: 'حماية ملفك الشخصي',
        step: 3,
        formData: req.query,
        ctaText: 'تأمين ملفي الشخصي',
        ctaColor: '#dc3545'
    });
});

// حفظ إعدادات الحماية
app.post('/create-profile/step3', (req, res) => {
    const { password, enableStats, allowVCard, ...formData } = req.body;
    const queryString = new URLSearchParams({ 
        ...formData, 
        password: password || '',
        enableStats: enableStats || 'off',
        allowVCard: allowVCard || 'off'
    }).toString();
    res.redirect(`/create-profile/step4?${queryString}`);
});

// صفحة التأكيد والنتيجة (الخطوة 4)
app.get('/create-profile/step4', async (req, res) => {
    try {
        const formData = req.query;
        const profileId = formData.profileId || `profile-${uuidv4().substring(0, 8)}`;
        const profileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/p/${profileId}`;
        
        // حفظ الملف الشخصي في قاعدة البيانات
        const profileData = {
            profileId,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            title: formData.title,
            company: formData.company,
            bio: formData.bio,
            template: formData.template || 'modern',
            password: formData.password,
            isPasswordProtected: !!formData.password,
            enableStats: formData.enableStats === 'on',
            allowVCard: formData.allowVCard === 'on',
            stats: { views: 0 },
            createdAt: new Date(),
            updatedAt: new Date(),
            social: {
                linkedin: null,
                twitter: null,
                github: null,
                instagram: null
            }
        };
        
        const result = await saveProfile(profileData);
        
        if (!result.success) {
            console.error('خطأ في الحفظ:', result.error);
        }
        
        res.render('create-profile-step4', {
            title: 'هويتك الذكية جاهزة',
            step: 4,
            formData,
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
// صفحة عرض الملف الشخصي العام
app.get('/p/:profileId', async (req, res) => {
    try {
        const profile = await findProfile(req.params.profileId);
        
        if (!profile) {
            return res.render('error', {
                title: 'الملف غير موجود',
                message: 'عذراً، الملف الشخصي غير موجود'
            });
        }
        
        // تسجيل الزيارة
        await logVisit(req.params.profileId, req);
        
        // التحقق من كلمة المرور إذا كانت مفعلة
        if (profile.isPasswordProtected && profile.password) {
            return res.render('profile-password', {
                title: 'ملف محمي',
                profileId: req.params.profileId,
                query: req.query || {}  // ✅ إضافة query
            });
        }
        
        // عرض الملف الشخصي حسب القالب المختار
        res.render(`templates/template-${profile.template}`, {
            title: `ملف ${profile.name} الشخصي`,
            profile,
            allowVCard: profile.allowVCard,
            ctaText: 'احصل على بطاقتك NFC',
            ctaLink: '/create-profile',
            query: req.query || {}  // ✅ إضافة query هنا أيضاً
        });
        
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).render('error', {
            title: 'خطأ',
            message: 'حدث خطأ في تحميل الملف الشخصي'
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
            await createOrder(orderData);
        } else {
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
            profiles = await getAllProfiles();
            visits = await getAllVisits(100);
            
            stats = {
                totalProfiles: profiles.length,
                totalVisits: visits.length,
                todayVisits: visits.filter(v => 
                    new Date(v.createdAt).toDateString() === new Date().toDateString()
                ).length
            };
        } else {
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
                    new Date(v.timestamp).toDateString() === new Date().toDateString()
                ).length,
                totalOrders: orders.length
            };
        }
        
        res.render('admin', {
            title: 'لوحة التحكم',
            profiles,
            visits,
            orders,
            stats,
            query: req.query || {},
            isPostgresConnected
        });
        
    } catch (error) {
        console.error('خطأ في لوحة التحكم:', error);
        res.status(500).send('حدث خطأ في تحميل لوحة التحكم');
    }
});

// صفحة العرض التجريبي للبطاقة
app.get('/card/card-nfc-001', (req, res) => {
    const demoProfile = {
        profileId: 'nfc-001',
        name: 'أحمد محمد',
        email: 'ahmed@example.com',
        phone: '+966 50 123 4567',
        title: 'مطور برمجيات',
        company: 'تك المحدودة',
        bio: 'مطور واجهات أمامية بخبرة 5 سنوات',
        template: 'modern',
        isPasswordProtected: false,
        enableStats: true,
        allowVCard: true,
        stats: { views: 1250 },
        social: {
            linkedin: 'https://linkedin.com/in/ahmed',
            twitter: 'https://twitter.com/ahmed',
            github: 'https://github.com/ahmed',
            instagram: 'https://instagram.com/ahmed'
        },
        createdAt: new Date()
    };

    res.render('templates/template-modern', {
        title: `ملف ${demoProfile.name} التجريبي`,
        profile: demoProfile,
        allowVCard: true,
        isDemo: true,
        ctaText: 'احصل على بطاقتك NFC الآن',
        ctaLink: '/create-profile'
    });
});

// صفحة الخطأ
app.get('/error', (req, res) => {
    res.render('error', {
        title: 'خطأ',
        message: req.query.message || 'حدث خطأ غير متوقع'
    });
});

// صفحة تجريبية لعرض Lava Lamp
app.get('/lava-demo', (req, res) => {
    res.render('lava-demo', {
        title: 'عرض تأثير Lava Lamp',
        enableLavaLamp: true,
        lavaLampOptions: {
            intensity: 'high',
            interactive: true,
            autoColor: true
        }
    });
});

// API للتحكم في Lava Lamp
app.post('/api/lava-lamp/settings', (req, res) => {
    const { enabled, intensity, interactive, autoColor } = req.body;
    
    res.json({
        success: true,
        message: 'تم تحديث إعدادات Lava Lamp',
        settings: { enabled, intensity, interactive, autoColor }
    });
});

// مسارات تفعيل/إلغاء Lava Lamp
app.get('/enable-lava', (req, res) => {
    res.cookie('lavaLamp', 'enabled', { maxAge: 900000, httpOnly: true });
    res.redirect(req.get('referer') || '/');
});

app.get('/disable-lava', (req, res) => {
    res.clearCookie('lavaLamp');
    res.redirect(req.get('referer') || '/');
});

// صفحة تعديل البطاقة
// صفحة تعديل البطاقة - نسخة مصححة تبحث في profileId و cardId
app.get('/admin/card/edit/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        console.log('🔍 جاري البحث عن بطاقة:', cardId);
        
        let card = null;
        let profiles = [];
        
        // قراءة الملفات المحلية
        const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
        
        try {
            const data = await fs.readFile(PROFILES_FILE, 'utf8');
            profiles = JSON.parse(data);
            
            console.log('📊 عدد البطاقات في الملف:', profiles.length);
            
            // طباعة أول بطاقة لمعرفة هيكل البيانات
            if (profiles.length > 0) {
                console.log('📌 مثال لبطاقة:', {
                    id: profiles[0].profileId || profiles[0].cardId,
                    name: profiles[0].name,
                    الحقول_المتوفرة: Object.keys(profiles[0])
                });
            }
            
            // البحث في profileId أولاً (لأنك تستخدمه عند الحفظ)
            card = profiles.find(p => p.profileId === cardId);
            
            // إذا لم يتم العثور، ابحث في cardId
            if (!card) {
                card = profiles.find(p => p.cardId === cardId);
            }
            
            // إذا لم يتم العثور، ابحث في أي حقل آخر قد يحتوي على المعرف
            if (!card) {
                card = profiles.find(p => p.id === cardId || p._id === cardId);
            }
            
        } catch (error) {
            console.error('خطأ في قراءة الملف:', error);
        }
        
        if (card) {
            console.log('✅ تم العثور على البطاقة:', card.name);
            console.log('🔑 المعرف المستخدم:', card.profileId || card.cardId);
            
            res.render('edit-card', { 
                card: card,
                query: req.query || {},
                title: `تعديل بطاقة ${card.name}`,
                enableLavaLamp: true
            });
        } else {
            console.log('❌ البطاقة غير موجودة:', cardId);
            
            // للتصحيح: عرض جميع المعرفات المتاحة
            console.log('📋 المعرفات المتوفرة:', profiles.map(p => ({ 
                profileId: p.profileId, 
                cardId: p.cardId,
                name: p.name 
            })));
            
            res.redirect('/admin?error=البطاقة غير موجودة');
        }
        
    } catch (error) {
        console.error('❌ خطأ في صفحة التعديل:', error);
        res.redirect('/admin?error=حدث خطأ في تحميل صفحة التعديل');
    }
});

// تحديث بيانات البطاقة
// تحديث بيانات البطاقة - نسخة مصححة تتعامل مع profileId و cardId
app.post('/admin/card/update/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        const updatedData = req.body;
        
        console.log('📝 جاري تحديث البطاقة:', cardId);
        console.log('📦 البيانات الجديدة:', updatedData);
        
        const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
        
        // قراءة الملف
        const data = await fs.readFile(PROFILES_FILE, 'utf8');
        const profiles = JSON.parse(data);
        
        // البحث عن البطاقة في profileId أو cardId
        let index = profiles.findIndex(p => p.profileId === cardId);
        
        // إذا لم يتم العثور، ابحث في cardId
        if (index === -1) {
            index = profiles.findIndex(p => p.cardId === cardId);
        }
        
        if (index !== -1) {
            // الاحتفاظ بالبيانات القديمة المهمة
            const oldCard = profiles[index];
            
            // تحديث البيانات مع الحفاظ على الحقول الأساسية
            profiles[index] = {
                ...oldCard,              // الاحتفاظ بجميع البيانات القديمة
                ...updatedData,           // تحديث بالبيانات الجديدة
                profileId: oldCard.profileId || oldCard.cardId, // الحفاظ على profileId
                cardId: oldCard.cardId || oldCard.profileId,     // الحفاظ على cardId
                updatedAt: new Date()     // تحديث وقت التعديل
            };
            
            // حفظ الملف
            await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
            
            console.log('✅ تم تحديث البطاقة بنجاح:', profiles[index].name);
            res.redirect('/admin?success=تم تحديث البطاقة بنجاح');
        } else {
            console.log('❌ البطاقة غير موجودة:', cardId);
            res.redirect('/admin?error=البطاقة غير موجودة');
        }
        
    } catch (error) {
        console.error('❌ خطأ في تحديث البطاقة:', error);
        res.redirect('/admin?error=حدث خطأ في تحديث البطاقة');
    }
});
// صفحة عرض جميع البطاقات
app.get('/card', async (req, res) => {
    try {
        const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
        let profiles = [];
        
        try {
            const data = await fs.readFile(PROFILES_FILE, 'utf8');
            profiles = JSON.parse(data);
        } catch {
            profiles = [];
        }
        
        res.render('cards-list', {
            title: 'البطاقات المتاحة',
            profiles: profiles.slice(0, 10) // آخر 10 بطاقات
        });
    } catch (error) {
        res.redirect('/');
    }
});

// حذف بطاقة
app.post('/admin/card/delete/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        console.log('🗑️ جاري حذف البطاقة:', cardId);
        
        const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
        
        // قراءة الملف
        const data = await fs.readFile(PROFILES_FILE, 'utf8');
        let profiles = JSON.parse(data);
        
        // البحث عن البطاقة في profileId أو cardId
        let index = profiles.findIndex(p => p.profileId === cardId);
        
        // إذا لم يتم العثور، ابحث في cardId
        if (index === -1) {
            index = profiles.findIndex(p => p.cardId === cardId);
        }
        
        // إذا لم يتم العثور، ابحث في id
        if (index === -1) {
            index = profiles.findIndex(p => p.id === cardId);
        }
        
        if (index !== -1) {
            const deletedCard = profiles[index];
            
            // حذف البطاقة
            profiles.splice(index, 1);
            
            // حفظ الملف بعد الحذف
            await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
            
            console.log('✅ تم حذف البطاقة بنجاح:', deletedCard.name);
            res.redirect('/admin?success=تم حذف البطاقة بنجاح');
        } else {
            console.log('❌ البطاقة غير موجودة:', cardId);
            res.redirect('/admin?error=البطاقة غير موجودة');
        }
        
    } catch (error) {
        console.error('❌ خطأ في حذف البطاقة:', error);
        res.redirect('/admin?error=حدث خطأ في حذف البطاقة');
    }
});

// أو يمكنك استخدام DELETE method إذا كنت تفضل
app.delete('/api/admin/card/delete/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        
        const PROFILES_FILE = path.join(__dirname, 'data', 'profiles.json');
        const data = await fs.readFile(PROFILES_FILE, 'utf8');
        let profiles = JSON.parse(data);
        
        const initialLength = profiles.length;
        profiles = profiles.filter(p => 
            p.profileId !== cardId && 
            p.cardId !== cardId && 
            p.id !== cardId
        );
        
        if (profiles.length < initialLength) {
            await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
            res.json({ success: true, message: 'تم حذف البطاقة بنجاح' });
        } else {
            res.status(404).json({ success: false, message: 'البطاقة غير موجودة' });
        }
        
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ في الحذف' });
    }
});

// مسار لعرض محتوى ملف الزيارات (للتشخيص)
app.get('/debug/visits', async (req, res) => {
    try {
        const VISITS_FILE = path.join(__dirname, 'data', 'visits.json');
        
        // التأكد من وجود الملف
        try {
            await fs.access(VISITS_FILE);
        } catch {
            return res.json({ 
                message: 'ملف الزيارات غير موجود بعد',
                path: VISITS_FILE 
            });
        }
        
        const data = await fs.readFile(VISITS_FILE, 'utf8');
        const visits = JSON.parse(data);
        
        res.json({
            total: visits.length,
            lastVisit: visits[visits.length - 1] || null,
            recentVisits: visits.slice(-5).map(v => ({
                profileId: v.profileId,
                ip: v.ip,
                browser: v.browser || v.userAgent?.substring(0, 30),
                timestamp: v.timestamp
            }))
        });
    } catch (error) {
        res.json({ 
            error: error.message,
            stack: error.stack 
        });
    }
});
// ============================================
// تشغيل الخادم
// ============================================
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║     نظام بطاقات NFC الذكية               ║
    ╠══════════════════════════════════════════╣
    ║  الخادم يعمل على: http://localhost:${PORT}  ║
    ║  إنشاء هوية: http://localhost:${PORT}/create-profile ║
    ║  لوحة التحكم: http://localhost:${PORT}/admin ║
    ║  فتح القفل: http://localhost:${PORT}/unlock ║
    ╠══════════════════════════════════════════╣
    ║  قاعدة البيانات: ${isPostgresConnected ? '✅ PostgreSQL متصل' : '⚠️  ملفات محلية'} ║
    ║  انتهاء الصلاحية: ${expiryDate.toLocaleDateString('ar-SA')} ║
    ╚══════════════════════════════════════════╝
    `);
});