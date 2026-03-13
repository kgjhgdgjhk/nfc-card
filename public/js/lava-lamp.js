// التحكم في تأثير Lava Lamp
class LavaLampController {
    constructor() {
        this.blobs = [];
        this.mouseX = 0;
        this.mouseY = 0;
        this.init();
    }

    init() {
        // إنشاء عناصر Lava Lamp
        this.createBlobs();
        
        // إضافة تأثير التفاعل مع الماوس
        document.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX / window.innerWidth;
            this.mouseY = e.clientY / window.innerHeight;
            this.updateBlobsPosition();
        });

        // تحديث الألوان بشكل عشوائي
        setInterval(() => {
            this.randomizeColors();
        }, 5000);
    }

    createBlobs() {
        const container = document.createElement('div');
        container.className = 'lava-lamp-background';
        
        // إنشاء 5 فقاعات
        for (let i = 1; i <= 5; i++) {
            const blob = document.createElement('div');
            blob.className = `lava-blob blob${i}`;
            container.appendChild(blob);
            this.blobs.push(blob);
        }
        
        document.body.insertBefore(container, document.body.firstChild);
    }

    updateBlobsPosition() {
        // تغيير حركة الفقاعات بناءً على موقع الماوس
        this.blobs.forEach((blob, index) => {
            const speed = (index + 1) * 0.05;
            const offsetX = this.mouseX * 100 * speed;
            const offsetY = this.mouseY * 100 * speed;
            
            blob.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        });
    }

    randomizeColors() {
        const colors = [
            ['#ff6b6b', '#c92a2a'],
            ['#4ecdc4', '#2c7a7b'],
            ['#a8e6cf', '#3b9e8e'],
            ['#ffd93d', '#ff8c42'],
            ['#6c5ce7', '#341f97'],
            ['#e84342', '#c0392b'],
            ['#00b894', '#006266']
        ];
        
        this.blobs.forEach((blob, index) => {
            const randomColors = colors[Math.floor(Math.random() * colors.length)];
            blob.style.background = `radial-gradient(circle at 30% 30%, ${randomColors[0]}, ${randomColors[1]})`;
        });
    }
}

// تفعيل Lava Lamp عندما تكون الصفحة محملة
document.addEventListener('DOMContentLoaded', () => {
    // يمكنك تفعيل أو إلغاء تفعيل Lava Lamp حسب الصفحة
    if (!window.location.pathname.includes('/admin') || confirm('هل تريد تفعيل تأثير Lava Lamp؟')) {
        new LavaLampController();
    }
});

// دالة لتفعيل/إلغاء تفعيل Lava Lamp
window.toggleLavaLamp = function() {
    const lavaLamp = document.querySelector('.lava-lamp-background');
    if (lavaLamp) {
        lavaLamp.style.display = lavaLamp.style.display === 'none' ? 'block' : 'none';
    }
};

// دالة لتغيير سرعة الحركة
window.setLavaSpeed = function(speed) {
    const blobs = document.querySelectorAll('.lava-blob');
    blobs.forEach(blob => {
        blob.style.animationDuration = `${20 / speed}s`;
    });
};