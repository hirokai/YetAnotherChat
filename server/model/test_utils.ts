import * as model from './index'
import crypto from 'crypto'
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
import baseX from 'base-x';
const bs58 = baseX(BASE58);

import * as bunyan from 'bunyan';
export const log = bunyan.createLogger({ name: "model.test", src: true, level: 1 });

export const random_str = (N?: number) => {
    const MAX_LENGTH = 100;
    const MIN_LENGTH = 0;
    N = N ? N : MIN_LENGTH + Math.floor(Math.random() * (MAX_LENGTH - MIN_LENGTH));
    const S = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return Array.from(Array(N)).map(() => S[Math.floor(Math.random() * S.length)]).join('');
};

export async function random_str_b58(length: number = 32) {
    return await new Promise<string>((resolve) => {
        crypto.randomBytes(length, (err, buf) => {
            if (err) throw err;
            const token = bs58.encode(buf);
            resolve(token);
        });
    });
}

export async function register(opt?: { basename?: string, username?: string, fullname?: string, password?: string, email?: string, source?: 'self_register' | 'email_thread' | undefined }): Promise<User> {
    opt = opt || {};
    const username = opt.username || (opt.basename || random_str(4)) + Math.floor(Math.random() * 100000);
    const fullname = opt.fullname;
    const password = opt.password || random_str(16);
    const source = opt.source || 'self_register';
    const email = opt.email || ('' + Math.floor(Math.random() * 100000) + '@gmail.com');
    const { user } = await model.users.register({ username, password, fullname, email, source });
    if (!user) {
        throw new Error('User register error');
    }
    return user;
}