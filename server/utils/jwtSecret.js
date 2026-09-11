const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const ipatoolDir = path.join(dataDir, '.ipatool');
const jwtSecretFile = path.join(ipatoolDir, 'JWT_SECRET');

function generateJwtSecret() {
    return crypto.randomBytes(32).toString('base64url');
}

function loadJwtSecret() {
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }

    if (!fs.existsSync(ipatoolDir)) {
        fs.mkdirSync(ipatoolDir, { recursive: true });
    }

    if (fs.existsSync(jwtSecretFile)) {
        const stored = fs.readFileSync(jwtSecretFile, 'utf8').trim();
        if (stored) {
            return stored;
        }
    }

    const secret = generateJwtSecret();
    fs.writeFileSync(jwtSecretFile, `${secret}\n`, { encoding: 'utf8', mode: 0o600 });
    return secret;
}

module.exports = {
    loadJwtSecret,
};
