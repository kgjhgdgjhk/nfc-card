// استيراد المكتبات المطلوبة
const express = require('express');
const path = require('path');
const ejs = require('ejs');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

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

// مسار ملف البيانات
const DATA_FILE = path.join(__dirname, 'data', 'cards.json');

// التأكد من وجود مجلد البيانات وملف JSON
async function initializeDataFile() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        try {
            await fs.access(DATA_FILE);
        } catch {
            // إنشاء ملف بيانات افتراضي
            const defaultData = {
                cards: [
                    {
                        id: "nfc-001",
                        cardId: "nfc-001",
                        name: "أحمد محمد",
                        title: "مطور برمجيات",
                        company: "شركة التقنية",
                        email: "ahmed@example.com",
                        phone: "+966 50 123 4567",
                        website: "https://ahmed.dev",
                        address: "الرياض، المملكة العربية السعودية",
                        bio: "مطور برمجيات بخبرة 5 سنوات في تطوير تطبيقات الويب والجوال",
                        social: {
                            linkedin: "https://linkedin.com/in/ahmed",
                            twitter: "https://twitter.com/ahmed",
                            github: "https://github.com/ahmed"
                        },
                        dynamicLink: "https://ahmed.dev/portfolio",
                        isActive: true,
                        lastUpdated: new Date().toISOString()
                    }
                ],
                visits: []
            };
            await fs.writeFile(DATA_FILE, JSON.stringify(defaultData, null, 2));
        }
    } catch (error) {
        console.error('خطأ في تهيئة ملف البيانات:', error);
    }
}

// استدعاء تهيئة البيانات
initializeDataFile();

// ============================================
// دوال مساعدة للتعامل مع البيانات
// ============================================

// قراءة جميع البطاقات
async function getCards() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('خطأ في قراءة البيانات:', error);
        return { cards: [], visits: [] };
    }
}

// حفظ البيانات
async function saveCards(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('خطأ في حفظ البيانات:', error);
        return false;
    }
}

// البحث عن بطاقة بواسطة المعرف
async function findCardById(cardId) {
    const data = await getCards();
    return data.cards.find(card => card.cardId === cardId);
}

// تسجيل زيارة
async function logVisit(cardId, req) {
    const data = await getCards();
    const visit = {
        id: uuidv4(),
        cardId: cardId,
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer') || 'direct'
    };
    
    if (!data.visits) data.visits = [];
    data.visits.push(visit);
    await saveCards(data);
    return visit;
}

// ============================================
// المسارات الرئيسية
// ============================================

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'نظام بطاقات NFC',
        message: 'مرحباً بك في نظام بطاقات NFC الذكية'
    });
});

// ============================================
// مسار طلب المنتج (مهم: هذا كان ناقصاً)
// ============================================

// صفحة طلب المنتج
app.get('/order', (req, res) => {
    res.render('order', {
        title: 'طلب بطاقة NFC ذكية'
    });
});

// API لطلب المنتج
app.post('/api/order', async (req, res) => {
    try {
        const orderData = req.body;
        console.log('طلب جديد:', orderData);
        
        res.json({
            success: true,
            message: 'تم استلام طلبك بنجاح',
            data: orderData
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في معالجة الطلب'
        });
    }
});

// صفحة البطاقة (عند مسح NFC)
app.get('/card/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId;
        console.log(`تم مسح بطاقة NFC: ${cardId}`);
        
        // البحث عن البطاقة
        const card = await findCardById(cardId);
        
        if (!card) {
            return res.status(404).render('error', {
                title: 'بطاقة غير موجودة',
                message: 'عذراً، البطاقة غير موجودة أو غير مفعلة'
            });
        }
        
        // تسجيل الزيارة
        await logVisit(cardId, req);
        
        // عرض صفحة البطاقة
        res.render('card', {
            title: `بطاقة ${card.name} المهنية`,
            card: card,
            baseUrl: process.env.BASE_URL
        });
        
    } catch (error) {
        console.error('خطأ في عرض البطاقة:', error);
        res.status(500).render('error', {
            title: 'خطأ في النظام',
            message: 'حدث خطأ أثناء معالجة طلبك'
        });
    }
});

// API للحصول على بيانات البطاقة (للاستخدام مع NFC الديناميكي)
app.get('/api/card/:cardId', async (req, res) => {
    try {
        const card = await findCardById(req.params.cardId);
        
        if (!card) {
            return res.status(404).json({ 
                success: false, 
                message: 'البطاقة غير موجودة' 
            });
        }
        
        // تسجيل الزيارة من API
        await logVisit(req.params.cardId, req);
        
        res.json({
            success: true,
            data: card
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في الخادم' 
        });
    }
});

// صفحة الإدارة (لإضافة وتعديل البطاقات) - مع إصلاح مشكلة query
app.get('/admin', async (req, res) => {
    try {
        const data = await getCards();
        
        // إصلاح مشكلة query - نمرر query parameters
        res.render('admin', {
            title: 'لوحة التحكم - بطاقات NFC',
            cards: data.cards,
            visits: data.visits || [],
            query: req.query || {}  // هذا مهم جداً لإصلاح الخطأ
        });
        
    } catch (error) {
        console.error('خطأ في صفحة الإدارة:', error);
        res.status(500).send('حدث خطأ في تحميل صفحة الإدارة');
    }
});

// إضافة بطاقة جديدة
app.post('/admin/card/add', async (req, res) => {
    try {
        const data = await getCards();
        
        // إنشاء بطاقة جديدة
        const newCard = {
            id: uuidv4(),
            cardId: req.body.cardId || `nfc-${Date.now()}`,
            name: req.body.name,
            title: req.body.title,
            company: req.body.company,
            email: req.body.email,
            phone: req.body.phone,
            website: req.body.website,
            address: req.body.address,
            bio: req.body.bio,
            social: {
                linkedin: req.body.linkedin,
                twitter: req.body.twitter,
                github: req.body.github
            },
            dynamicLink: req.body.dynamicLink || '',
            isActive: true,
            lastUpdated: new Date().toISOString()
        };
        
        data.cards.push(newCard);
        await saveCards(data);
        
        res.redirect('/admin?success=تم إضافة البطاقة بنجاح');
        
    } catch (error) {
        console.error('خطأ في إضافة البطاقة:', error);
        res.redirect('/admin?error=حدث خطأ أثناء إضافة البطاقة');
    }
});

// تحديث بطاقة
app.post('/admin/card/update/:cardId', async (req, res) => {
    try {
        const data = await getCards();
        const cardIndex = data.cards.findIndex(c => c.cardId === req.params.cardId);
        
        if (cardIndex === -1) {
            return res.redirect('/admin?error=البطاقة غير موجودة');
        }
        
        // تحديث بيانات البطاقة
        data.cards[cardIndex] = {
            ...data.cards[cardIndex],
            name: req.body.name,
            title: req.body.title,
            company: req.body.company,
            email: req.body.email,
            phone: req.body.phone,
            website: req.body.website,
            address: req.body.address,
            bio: req.body.bio,
            social: {
                linkedin: req.body.linkedin,
                twitter: req.body.twitter,
                github: req.body.github
            },
            dynamicLink: req.body.dynamicLink || '',
            isActive: req.body.isActive === 'on',
            lastUpdated: new Date().toISOString()
        };
        
        await saveCards(data);
        res.redirect('/admin?success=تم تحديث البطاقة بنجاح');
        
    } catch (error) {
        console.error('خطأ في تحديث البطاقة:', error);
        res.redirect('/admin?error=حدث خطأ أثناء تحديث البطاقة');
    }
});

// حذف بطاقة
app.post('/admin/card/delete/:cardId', async (req, res) => {
    try {
        const data = await getCards();
        data.cards = data.cards.filter(c => c.cardId !== req.params.cardId);
        await saveCards(data);
        res.redirect('/admin?success=تم حذف البطاقة بنجاح');
    } catch (error) {
        res.redirect('/admin?error=حدث خطأ أثناء حذف البطاقة');
    }
});

// إحصائيات الزيارات
app.get('/admin/stats/:cardId', async (req, res) => {
    try {
        const data = await getCards();
        const cardVisits = data.visits.filter(v => v.cardId === req.params.cardId);
        
        res.json({
            success: true,
            totalVisits: cardVisits.length,
            visits: cardVisits
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
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
// نظام إنشاء الهوية الذكية (4 خطوات)
// ============================================

// صفحة إنشاء الهوية الذكية
app.get('/create-profile', (req, res) => {
    res.render('create-profile', {
        title: 'إنشاء هويتك الذكية',
        step: 1
    });
});

// حفظ البيانات المؤقتة للخطوة 1
app.post('/create-profile/step1', (req, res) => {
    // هنا يمكن حفظ البيانات في session أو تمريرها كـ query
    const { name, email, phone, title, company } = req.body;
    res.redirect(`/create-profile/step2?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&title=${encodeURIComponent(title)}&company=${encodeURIComponent(company)}`);
});

// صفحة اختيار القالب (الخطوة 2)
app.get('/create-profile/step2', (req, res) => {
    res.render('create-profile-step2', {
        title: 'اختر قالب هويتك',
        step: 2,
        formData: req.query
    });
});

// حفظ اختيار القالب
app.post('/create-profile/step2', (req, res) => {
    const { template, ...formData } = req.body;
    const queryString = new URLSearchParams({ ...formData, template }).toString();
    res.redirect(`/create-profile/step3?${queryString}`);
});

// صفحة إعدادات الحماية والخصوصية (الخطوة 3)
app.get('/create-profile/step3', (req, res) => {
    res.render('create-profile-step3', {
        title: 'حماية ملفك الشخصي',
        step: 3,
        formData: req.query
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
app.get('/create-profile/step4', (req, res) => {
    // إنشاء معرف فريد للملف الشخصي
    const profileId = `profile-${Math.random().toString(36).substring(2, 10)}`;
    const profileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/p/${profileId}`;
    
    res.render('create-profile-step4', {
        title: 'هويتك الذكية جاهزة',
        step: 4,
        formData: req.query,
        profileId: profileId,
        profileUrl: profileUrl
    });
});

// صفحة عرض الملف الشخصي (عند مسح NFC)
app.get('/p/:profileId', async (req, res) => {
    // هنا يمكن جلب بيانات الملف الشخصي من قاعدة البيانات
    // حالياً نستخدم بيانات تجريبية
    res.render('public-profile', {
        title: 'الملف الشخصي',
        profileId: req.params.profileId
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
    ║  لوحة التحكم: http://localhost:${PORT}/admin ║
    ║  طلب المنتج: http://localhost:${PORT}/order   ║
    ║  مثال لبطاقة: http://localhost:${PORT}/card/nfc-001 ║
    ╚══════════════════════════════════════════╝
    `);
});