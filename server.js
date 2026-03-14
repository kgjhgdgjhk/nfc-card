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
        
        const userAgent = req.headers['user-agent'] || 'غير معروف';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'مباشر';
        
        const visitData = {
            profileId: profileId,
            cardId: profileId,
            ip: ip,
            userAgent: userAgent,
            browser: getBrowserInfo(userAgent),
            os: getOSInfo(userAgent),
            referer: referer,
            timestamp: new Date(),
            createdAt: new Date()
        };
        
        console.log('📝 تسجيل زيارة:', { profileId, ip, browser: visitData.browser });
        
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

// حفظ البيانات للخطوة 1
app.post('/create-profile/step1', async (req, res) => {
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
        
        if (!name || !email || !phone) {
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
        
        console.log('✅ بيانات تم حفظها في الجلسة:', { name, website, address });
        
        res.redirect('/create-profile/step2');
        
    } catch (error) {
        console.error('خطأ:', error);
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
app.post('/create-profile/step2', (req, res) => {
    const { template } = req.body;
    
    if (!req.session.profileData) {
        return res.redirect('/create-profile?error=الرجاء البدء من البداية');
    }
    
    req.session.profileData.template = template;
    res.redirect('/create-profile/step3');
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
        
        res.render('profile-3d', {
            title: `ملف ${profile.name} الشخصي | عرض ثلاثي الأبعاد`,
            profileId: profile.profileId,
            formData: profile,
            profileUrl: `${req.baseUrlFull}/p/${profile.profileId}`,
            whatsappNumber: process.env.WHATSAPP_NUMBER || '966500000000',
            query: req.query || {},
            enableLavaLamp: false
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
        
        console.log('🎮 عرض ثلاثي الأبعاد للملف:', profile.name);
        
        res.render('profile-3d', {
            title: `ملف ${profile.name} الشخصي | عرض ثلاثي الأبعاد`,
            profileId: profile.profileId,
            formData: profile,
            profileUrl: `${req.baseUrlFull}/p/${profile.profileId}`,
            whatsappNumber: process.env.WHATSAPP_NUMBER || '966500000000',
            query: req.query || {},
            enableLavaLamp: false
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
            // يمكن إضافة دالة للحصول على الطلبات
            stats = {
                totalProfiles: profiles.length,
                totalVisits: visits.length,
                todayVisits: visits.filter(v => 
                    new Date(v.timestamp).toDateString() === new Date().toDateString()
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

// باقي المسارات (نفس الكود السابق) - card, edit, delete, debug, etc.

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
    ║  قاعدة البيانات: ${isPostgresConnected ? '✅ PostgreSQL' : '⚠️  ملفات محلية'} ║
    ║  انتهاء الصلاحية: ${expiryDate.toLocaleDateString('ar-SA')} ║
    ╚══════════════════════════════════════════╝
    `);
});