import * as jwt from 'jsonwebtoken';
import * as credential from './private/credential';
import * as model from './model'
import { io } from './socket'
import { default_workspace } from './config'
import * as ec from './error_codes';

import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "api.sessions", src: true, level: 1 });

export function jwt_verify(token: string, secret: string): Promise<{ user_id: string, username: string } | null> {
    return new Promise((resolve) => {
        jwt.verify(token, credential.jwt_secret, function (err, decoded: any) {
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


export async function register({ username, password, fullname, email }: { username: string, password: string, fullname?: string, email?: string }): Promise<RegisterResponse> {
    log.info({ username, password, fullname, email });
    if (!username || !password) {
        return { ok: false, error: 'User name and password are required.' };
    }
    const not_pwned = await model.users.check_password_not_pwned(password);
    if (!not_pwned) {
        return { ok: false, error: 'Breached password' };
    }
    if (/[@~!\s]/.test(username)) {
        return { ok: false, error: 'Invalid username' };
    }
    const r1 = await model.users.register({ username, password, email, fullname, source: 'self_register', workspace: default_workspace });
    if (r1 == null) {
        return { ok: false };
    } else {
        const { user, error, error_code } = r1;
        if (!user) {
            return { ok: false, error: error_code == ec.USER_EXISTS ? 'User already exists' : error, error_code };
        }
        const r: boolean = await model.users.save_password(user.id, password);
        if (!r) {
            return { ok: false, error: 'Password save error' };
        }
        const token = jwt_sign({ username, user_id: user.id });
        const decoded = await jwt_verify(token, credential.jwt_secret).catch(() => {
            return null
        });
        if (decoded) {
            const local_db_password = await model.users.get_local_db_password(user.id);
            const obj: UsersNewSocket = {
                __type: 'users.new',
                timestamp: user.timestamp,
                user
            };
            io.emit('users.new', obj);
            return { ok: true, token, decoded, local_db_password };
        } else {
            return { ok: false, error: 'Token verificaiton error' };
        }
    }

}