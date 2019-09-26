import * as jwt from 'jsonwebtoken';
const credential = require('./private/credential');

export function jwt_verify(token: string, secret: string): Promise<{ user_id: string, username: string } | null> {
    return new Promise((resolve) => {
        jwt.verify(token, credential.jwt_secret, function (err, decoded) {
            if (err) {
                resolve(null);
            } else {
                resolve(decoded);
            }
        });
    });
}

export function jwt_sign({ username, user_id }: { username: string, user_id: string }) {
    return jwt.sign({ username, user_id }, credential.jwt_secret, { expiresIn: 604800 });
}
