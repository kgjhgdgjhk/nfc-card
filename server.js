// استيراد المكتبات المطلوبة
const express = require('express');
const path = require('path');
const ejs = require('ejs');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs').promises;

// تحميل متغيرات البيئة
dotenv.config();

// إنشاء تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// تعيين محرك العرض EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// استيراد الموديلات من PostgreSQL
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
        // اختبار الاتصال بقاعدة البيانات
        await sequelize.authenticate();
        console.log('✅ تم الاتصال بقاعدة البيانات PostgreSQL بنجاح');
        isPostgresConnected = true;
        return true;
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:');
        console.error('📌 رسالة الخطأ:', error.message);
        console.log('💡 استخدام الملفات المحلية كبديل');
        isPostgresConnected = false;
        return false;
    }
}

// محاولة الاتصال بقاعدة البيانات
connectToDatabase();

// ============================================
// دوال مساعدة للتعامل مع البيانات (مع دعم PostgreSQL والملفات المحلية)
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
async function logVisit(profileId, req) {
    try {
        const visitData = {
            profileId,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            referer: req.get('Referer') || 'direct',
            timestamp: new Date()
        };
        
        if (isPostgresConnected) {
            // استخدام PostgreSQL
            await createVisit(visitData);
        } else {
            // استخدام الملف المحلي
            const VISITS_FILE = path.join(__dirname, 'data', 'visits.json');
            
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
        console.error('خطأ في تسجيل الزيارة:', error);
        return false;
    }
}

// ============================================
// نظام إنشاء الهوية الذكية (مع CTA buttons)
// ============================================

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
        
        // حفظ البيانات مؤقتاً في الجلسة أو تمريرها
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
            // عرض صفحة إدخال كلمة المرور
            return res.render('profile-password', {
                title: 'ملف محمي',
                profileId: req.params.profileId
            });
        }
        
        // عرض الملف الشخصي حسب القالب المختار
        res.render(`templates/template-${profile.template}`, {
            title: `ملف ${profile.name} الشخصي`,
            profile,
            allowVCard: profile.allowVCard,
            ctaText: 'احصل على بطاقتك NFC',
            ctaLink: '/create-profile'
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
            // تخزين في الجلسة أنه تم التحقق
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
        
        // إرسال إشعار للواتساب
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
            // استخدام PostgreSQL
            profiles = await getAllProfiles();
            visits = await getAllVisits(100);
            
            // إحصائيات إضافية
            stats = {
                totalProfiles: profiles.length,
                totalVisits: visits.length,
                todayVisits: visits.filter(v => 
                    new Date(v.createdAt).toDateString() === new Date().toDateString()
                ).length
            };
        } else {
            // استخدام الملفات المحلية
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

// صفحة الخطأ
app.get('/error', (req, res) => {
    res.render('error', {
        title: 'خطأ',
        message: req.query.message || 'حدث خطأ غير متوقع'
    });
});
// ============================================
// الصفحة الرئيسية
// ============================================
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
    ╠══════════════════════════════════════════╣
    ║  قاعدة البيانات: ${isPostgresConnected ? '✅ PostgreSQL متصل' : '⚠️  ملفات محلية'} ║
    ╚══════════════════════════════════════════╝
    `);
});