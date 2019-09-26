/// <reference path="../common/types.d.ts" />
import * as model from './model'
import { Router } from 'express'
export const router: any = Router();
import * as _ from 'lodash';
import * as auth from './auth'
import * as email from './email'
import * as credential from './private/credential'

import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "api.sessions", src: true, level: 1 });


router.post('/register', (req, res: JsonResponse<RegisterResponse>, next) => {
    (async () => {
        const { username, password, fullname, email } = req.body;
        const r = await auth.register({ username, password, fullname, email });
        res.json(r);
    })().catch(next);
});

const rateLimit = require('express-rate-limit');
const resetPasswordLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 min window
    max: 100,
    message:
        "Too many password reset from this IP, please try again after 10 minutes"
});

const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min window
    max: 100,
    message:
        "Too many login attempts from this IP, please try again after one minute"
});

router.post('/login', loginLimiter, (req: MyPostRequest<LoginParams>, res, next) => {
    (async () => {
        const { username, password } = req.body;
        log.info({ username, password });
        const matched = await model.users.match_password(username, password);
        if (matched) {
            log.info("login ok", username, password);
            const user = await model.users.find_from_username(username);
            if (user != null) {
                log.info('find_user_from_username', user);
                const token = auth.jwt_sign({ username, user_id: user.id });
                const decoded = await auth.jwt_verify(token, credential.jwt_secret);
                if (decoded) {
                    const local_db_password = await model.users.get_local_db_password(user.id);
                    res.json({ ok: true, token, decoded, local_db_password });
                } else {
                    res.json({ ok: false, error: 'Invalid token' });
                }
            } else {
                res.json({ ok: false, error: 'Wrong user name or password.' }); //User not found
            }
        } else {
            res.json({ ok: false, error: 'Wrong user name or password.' });
        }
    })().catch(next);
});

router.get('/verify_token', (req, res, next) => {
    (async () => {
        var token = req.body.token || req.query.token || req.headers['x-access-token'];
        const decoded = await auth.jwt_verify(token, credential.jwt_secret);
        if (decoded == null) {
            res.status(200).json({ valid: false });
        } else {
            const user = await model.users.get(decoded.user_id);
            if (user) {
                req.decoded = decoded;
                res.status(200).json({ valid: true, decoded });
            } else {
                res.json({ valid: false, error: 'Unknown user' })
            }
        }
    })().catch(next);
});

router.post('/reset_password_with_token', (req, res, next) => {
    (async () => {
        const { ok, error } = await model.users.reset_password_from_link(req.body.token, req.body.password);
        res.send({ ok, error });
    })().catch(next);
});

router.post('/reset_password', resetPasswordLimiter, (req, res, next) => {
    (async () => {
        const q: string = req.body.q;
        const u = await model.users.find_user_from_email(q);
        if (u != null) {
            const email_ = u.emails[0];
            if (email_) {
                await email.send_reset_password_link(u);
                res.json({ ok: true });
            } else {
                res.json({ ok: false, error: 'No email registered' });
            }
        } else {
            const u2 = await model.users.find_from_username(q);
            if (u2 != null) {
                const email_ = u2.emails[0];
                if (email_) {
                    await email.send_reset_password_link(u2);
                    res.json({ ok: true });
                } else {
                    res.json({ ok: false, error: 'No email registered' });
                }
            } else {
                res.json({ ok: false, error: 'Not found' });
            }
        }
    })().catch(next);
});
