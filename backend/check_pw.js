const bcrypt = require('bcryptjs');
const hash = '$2b$10$jKc8h7vg.7gJp7pN6YXccuD0cuyj06vT4Tj9MD/qEY';
const passwords = ['admin123', 'admin', 'password', 'feedx123', 'feedx2026', '123456'];

passwords.forEach(pw => {
    if (bcrypt.compareSync(pw, hash)) {
        console.log(`FOUND! The password is: ${pw}`);
    }
});
