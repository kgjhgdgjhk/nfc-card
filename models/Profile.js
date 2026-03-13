const dotenv = require('dotenv');
dotenv.config();

// ============================================
// ⚠️ تم تعطيل قاعدة البيانات PostgreSQL نهائياً
// ============================================
console.log('⚠️ قاعدة البيانات معطلة - استخدام الملفات المحلية فقط');

// دوال وهمية للتعامل مع الملفات المحلية
const mockFunctions = {
    // دوال النماذج
    sequelize: null,
    Profile: null,
    Visit: null,
    Order: null,
    
    // دوال مساعدة
    saveProfile: async (profileData) => {
        console.log('📝 حفظ الملف الشخصي محلياً (محاكاة)');
        return { success: true, data: profileData };
    },
    
    findProfile: async (profileId) => {
        console.log('🔍 البحث عن ملف محلياً (محاكاة)');
        return null;
    },
    
    createVisit: async (visitData) => {
        console.log('👁️ تسجيل زيارة محلياً (محاكاة)');
        return { success: true, data: visitData };
    },
    
    createOrder: async (orderData) => {
        console.log('📦 إنشاء طلب محلياً (محاكاة)');
        return { success: true, data: orderData };
    },
    
    getAllProfiles: async () => {
        console.log('📋 جلب الملفات محلياً (محاكاة)');
        return [];
    },
    
    getAllVisits: async (limit = 100) => {
        console.log('👀 جلب الزيارات محلياً (محاكاة)');
        return [];
    },
    
    updateProfileStats: async (profileId) => {
        console.log('📊 تحديث إحصائيات محلياً (محاكاة)');
        return { success: true };
    }
};

// تصدير الدوال الوهمية
module.exports = mockFunctions;

// ============================================
// الكود الأصلي معطل نهائياً (محذوف)
// ============================================
/*
const { Sequelize, DataTypes } = require('sequelize');

// تهيئة الاتصال بقاعدة البيانات
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: console.log,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        }
    }
);

// اختبار الاتصال بقاعدة البيانات
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ تم الاتصال بقاعدة البيانات PostgreSQL بنجاح');
  } catch (error) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', error);
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
  
  // القالب
  template: {
    type: DataTypes.ENUM('modern', 'classic', 'minimal'),
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
      instagram: null
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
// تعريف نموذج Visit (الزيارات)
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
  ip: DataTypes.STRING,
  userAgent: DataTypes.TEXT,
  referer: DataTypes.STRING,
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
  customerName: DataTypes.STRING,
  customerEmail: DataTypes.STRING,
  customerPhone: DataTypes.STRING,
  cardType: {
    type: DataTypes.ENUM('physical', 'digital', 'both'),
    defaultValue: 'physical'
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: 1,
      max: 1000
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'cancelled'),
    defaultValue: 'pending'
  },
  notes: DataTypes.TEXT
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
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ تم مزامنة النماذج مع قاعدة البيانات');
    } else {
      await sequelize.sync();
      console.log('✅ تم التحقق من النماذج');
    }
  } catch (error) {
    console.error('❌ خطأ في مزامنة النماذج:', error);
  }
}

if (process.env.NODE_ENV !== 'test') {
  syncModels();
}

// ============================================
// دوال مساعدة للتعامل مع البيانات
// ============================================

async function saveProfile(profileData) {
  try {
    const profile = await Profile.create(profileData);
    return { success: true, data: profile.toJSON() };
  } catch (error) {
    console.error('خطأ في حفظ الملف الشخصي:', error);
    return { success: false, error: error.message };
  }
}

async function findProfile(profileId) {
  try {
    const profile = await Profile.findOne({ where: { profileId } });
    return profile ? profile.toJSON() : null;
  } catch (error) {
    console.error('خطأ في البحث:', error);
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
    console.error('خطأ في تحديث الإحصائيات:', error);
  }
}

async function createVisit(visitData) {
  try {
    const visit = await Visit.create(visitData);
    await updateProfileStats(visitData.profileId);
    return { success: true, data: visit.toJSON() };
  } catch (error) {
    console.error('خطأ في تسجيل الزيارة:', error);
    return { success: false, error: error.message };
  }
}

async function createOrder(orderData) {
  try {
    const order = await Order.create(orderData);
    return { success: true, data: order.toJSON() };
  } catch (error) {
    console.error('خطأ في إنشاء الطلب:', error);
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
    console.error('خطأ في جلب الملفات:', error);
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
      order: [['createdAt', 'DESC']],
      limit
    });
    return visits.map(v => v.toJSON());
  } catch (error) {
    console.error('خطأ في جلب الزيارات:', error);
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
*/