const dotenv = require('dotenv');
const { Sequelize, DataTypes } = require('sequelize');
dotenv.config();

// ============================================
// ✅ تفعيل الاتصال بقاعدة البيانات PostgreSQL
// ============================================
console.log('📡 جاري الاتصال بقاعدة البيانات PostgreSQL...');

// تهيئة الاتصال بقاعدة البيانات باستخدام DATABASE_URL
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false // مهم لـ Render
        }
    },
    logging: false // إيقاف تسجيل الاستعلامات (يمكن تفعيله للتصحيح)
});

// اختبار الاتصال بقاعدة البيانات
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ تم الاتصال بقاعدة البيانات PostgreSQL بنجاح');
  } catch (error) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:');
    console.error('📌 رسالة الخطأ:', error.message);
    console.error('📌 تأكد من صحة DATABASE_URL في متغيرات البيئة');
  }
}
testConnection();

// ============================================
// تعريف نموذج Profile (الملف الشخصي)
// ============================================
const Profile = sequelize.define('Profile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  profileId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  // المعلومات الأساسية
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  email: {
    type: DataTypes.STRING,
    validate: {
      isEmail: true
    }
  },
  phone: DataTypes.STRING,
  title: DataTypes.STRING,
  company: DataTypes.STRING,
  bio: DataTypes.TEXT,
  
  // ✅ حقول إضافية (العنوان والموقع)
  website: DataTypes.STRING,
  address: DataTypes.STRING,
  
  // القالب
  template: {
    type: DataTypes.STRING,
    defaultValue: 'modern'
  },
  
  // إعدادات الحماية
  password: DataTypes.STRING,
  isPasswordProtected: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // إعدادات الخصوصية
  enableStats: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  allowVCard: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // روابط التواصل الاجتماعي (مخزنة كـ JSON)
  social: {
    type: DataTypes.JSONB,
    defaultValue: {
      linkedin: null,
      twitter: null,
      github: null,
      instagram: null,
      facebook: null
    }
  },
  
  // إحصائيات (مخزنة كـ JSON)
  stats: {
    type: DataTypes.JSONB,
    defaultValue: {
      views: 0,
      lastView: null,
      uniqueVisitors: 0
    }
  },
  
  // حالة الملف
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  tableName: 'profiles'
});

// ============================================
// تعريف نموذج Visit (الزيارات) - محدث مع حقول الدولة
// ============================================
const Visit = sequelize.define('Visit', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  profileId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'profiles',
      key: 'profileId'
    }
  },
  cardId: DataTypes.STRING,
  ip: DataTypes.STRING,
  
  // ✅ حقول الدولة المنفصلة (جديدة)
  country: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  countryFlag: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  countryCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  
  // معلومات المتصفح والجهاز
  userAgent: DataTypes.TEXT,
  browser: DataTypes.STRING,
  os: DataTypes.STRING,
  referer: DataTypes.STRING,
  
  // ✅ حقل location القديم (اختياري - يمكن الاحتفاظ به أو حذفه)
  location: {
    type: DataTypes.JSONB,
    defaultValue: {
      country: null,
      city: null
    }
  }
}, {
  timestamps: true,
  tableName: 'visits'
});
// ============================================
// تعريف نموذج Order (الطلبات)
// ============================================
const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  orderId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  profileId: {
    type: DataTypes.STRING,
    references: {
      model: 'profiles',
      key: 'profileId'
    }
  },
  cardType: {
    type: DataTypes.STRING,
    defaultValue: 'physical'
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  }
}, {
  timestamps: true,
  tableName: 'orders'
});

// ============================================
// إنشاء العلاقات بين الجداول
// ============================================
Profile.hasMany(Visit, { foreignKey: 'profileId', sourceKey: 'profileId' });
Visit.belongsTo(Profile, { foreignKey: 'profileId', targetKey: 'profileId' });

Profile.hasMany(Order, { foreignKey: 'profileId', sourceKey: 'profileId' });
Order.belongsTo(Profile, { foreignKey: 'profileId', targetKey: 'profileId' });

// ============================================
// مزامنة النماذج مع قاعدة البيانات
// ============================================
async function syncModels() {
  try {
    await sequelize.sync({ alter: true });
    console.log('✅ تم مزامنة النماذج مع قاعدة البيانات');
  } catch (error) {
    console.error('❌ خطأ في مزامنة النماذج:', error.message);
  }
}

// تشغيل المزامنة بعد التأكد من الاتصال
setTimeout(() => {
  syncModels();
}, 2000);

// ============================================
// دوال مساعدة للتعامل مع البيانات
// ============================================

async function saveProfile(profileData) {
  try {
    const profile = await Profile.create(profileData);
    console.log('✅ تم حفظ الملف الشخصي في PostgreSQL:', profile.profileId);
    return { success: true, data: profile.toJSON() };
  } catch (error) {
    console.error('❌ خطأ في حفظ الملف الشخصي:', error.message);
    return { success: false, error: error.message };
  }
}

async function findProfile(profileId) {
  try {
    const profile = await Profile.findOne({ where: { profileId } });
    return profile ? profile.toJSON() : null;
  } catch (error) {
    console.error('❌ خطأ في البحث:', error.message);
    return null;
  }
}

async function updateProfileStats(profileId) {
  try {
    const profile = await Profile.findOne({ where: { profileId } });
    if (profile) {
      const stats = profile.stats || { views: 0, uniqueVisitors: 0 };
      stats.views += 1;
      stats.lastView = new Date();
      await profile.update({ stats });
    }
  } catch (error) {
    console.error('❌ خطأ في تحديث الإحصائيات:', error.message);
  }
}

async function createVisit(visitData) {
  try {
    const visit = await Visit.create(visitData);
    await updateProfileStats(visitData.profileId);
    return { success: true, data: visit.toJSON() };
  } catch (error) {
    console.error('❌ خطأ في تسجيل الزيارة:', error.message);
    return { success: false, error: error.message };
  }
}

async function createOrder(orderData) {
  try {
    const order = await Order.create(orderData);
    return { success: true, data: order.toJSON() };
  } catch (error) {
    console.error('❌ خطأ في إنشاء الطلب:', error.message);
    return { success: false, error: error.message };
  }
}

async function getAllProfiles() {
  try {
    const profiles = await Profile.findAll({
      order: [['createdAt', 'DESC']]
    });
    return profiles.map(p => p.toJSON());
  } catch (error) {
    console.error('❌ خطأ في جلب الملفات:', error.message);
    return [];
  }
}

async function getAllVisits(limit = 100) {
  try {
    const visits = await Visit.findAll({
      include: [{
        model: Profile,
        attributes: ['name', 'profileId']
      }],
      attributes: [
        'id', 
        'profileId', 
        'cardId', 
        'ip', 
        'country',        // ✅ الحقل الجديد
        'countryFlag',     // ✅ الحقل الجديد
        'countryCode',     // ✅ الحقل الجديد
        'userAgent', 
        'browser', 
        'os', 
        'referer', 
        'location', 
        'createdAt', 
        'updatedAt'
      ],
      order: [['createdAt', 'DESC']],
      limit
    });
    return visits.map(v => v.toJSON());
  } catch (error) {
    console.error('❌ خطأ في جلب الزيارات:', error.message);
    return [];
  }
}
// ============================================
// تصدير النماذج والدوال المساعدة
// ============================================
module.exports = {
  sequelize,
  Profile,
  Visit,
  Order,
  saveProfile,
  findProfile,
  createVisit,
  createOrder,
  getAllProfiles,
  getAllVisits
};