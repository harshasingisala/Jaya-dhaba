const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const envPath = path.join(__dirname, '.env');
const password = 'admin123';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    process.exit(1);
}

let content = fs.readFileSync(envPath, 'utf8');
const lines = content.split('\n');
const newLines = lines.map(line => {
    if (line.startsWith('ADMIN_PASSWORD_HASH=')) {
        return `ADMIN_PASSWORD_HASH=${hash}`;
    }
    return line;
});

// If not present, add it
if (!newLines.some(l => l.startsWith('ADMIN_PASSWORD_HASH='))) {
    newLines.push(`ADMIN_PASSWORD_HASH=${hash}`);
}

fs.writeFileSync(envPath, newLines.join('\n'));
console.log('Successfully updated .env with valid hash for admin123');
console.log('Hash length:', hash.length);
