const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('postgresql://postgres:MyPass123@db.hjiouikrentuhqspymsf.supabase.co:5432/postgres', {
  dialect: 'postgres',
  dialectOptions: {
    ssl: false
  },
});

sequelize.authenticate()
  .then(() => console.log('✅ اتصال ناجح'))
  .catch(err => console.error('❌ خطأ في الاتصال:', err));