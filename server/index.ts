/// <reference path="../common/types.d.ts" />


const production = !!process.env.NODE_PRODUCTION;

import * as model from './model'
import { Timespan, expandSpan } from './model'
const express = require('express');
import morgan from 'morgan';
const app = express();
import glob from "glob";
import bodyParser from "body-parser";
import * as _ from 'lodash';
import { uniq, includes, map } from 'lodash';
const path = require('path');
import * as fs from 'fs';
import moment from 'moment';
import request from 'request';

import * as ec from './error_codes';
import multer from 'multer';
import * as mail_algo from './model/mail_algo'
import * as utils from './model/utils'
import * as email from './email'
import { db } from './model/utils'
import { router as api_routes } from './api'
import { init_socket, io } from './socket'
import { jwt_sign, jwt_verify } from './auth'
import { default_workspace } from './config'
const credential = require('./private/credential');

import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "index", src: true, level: 1 });

utils.connectToDB();

const http = require('http').createServer(app);

var https;
if (production) {
    log.info('Production (HTTPS)');
    // https://itnext.io/node-express-letsencrypt-generate-a-free-ssl-certificate-and-run-an-https-server-in-5-minutes-a730fbe528ca
    const privateKey = fs.readFileSync('/etc/letsencrypt/live/coi-sns.com/privkey.pem', 'utf8');
    const certificate = fs.readFileSync('/etc/letsencrypt/live/coi-sns.com/cert.pem', 'utf8');
    const ca = fs.readFileSync('/etc/letsencrypt/live/coi-sns.com/chain.pem', 'utf8');
    const credentials = {
        key: privateKey,
        cert: certificate,
        ca: ca
    };
    https = require('https').createServer(credentials, app);
    app.use((req, res, next) => {
        if (!req.secure) {
            return res.redirect('https://' + req.get('host') + req.url);
        }
        next();
    });
}

init_socket(production ? https : http);

const morgan_date = morgan.token('date', (req, res) => {
    return moment().format();
});

const morgan_user_id = morgan.token('user_id', (req, res) => {
    return req.decoded ? req.decoded.user_id : 'null';
});

app.use(morgan(':date[iso] :user_id :method :url :status - :res[content-length] :response-time ms'));

app.set("view engine", "ejs");
var compression = require('compression');
app.use(compression());

const helmet = require('helmet')
app.use(helmet());
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

const upload = multer({
    dest: './uploads/',
    limits: {
        fieldNameSize: 1000,
        files: 100,
        fileSize: 1000 * 1000 * 10
    }
}).single('user_image');

log.info('Starting...');
const port = process.env.PORT || 3000;

const pretty = require('express-prettify');
app.use(pretty({ query: 'pretty', spaces: 8 }));

app.use('/about', express.static(path.join(__dirname, '../public/about')))
app.use('/public', express.static(path.join(__dirname, '../public')))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))
app.use('/register', express.static(path.join(__dirname, '../public/html/register.html')))
app.use('/login', express.static(path.join(__dirname, '../public/html/login.html')))
app.use('/main', express.static(path.join(__dirname, '../public/html/main.html')))
app.get('/', (req, res) => {
    res.redirect('/main#/');
});

app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json());

app.use(function (req: Request, res: MyResponse, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, PATCH, OPTIONS');
    next();
});

function clientErrorHandler(err, req, res, next) {
    if (req.xhr) {
        res.status(500).send({ error: 'Something failed!' })
    } else {
        next(err)
    }
}

app.use(clientErrorHandler);

app.get('/.well-known/acme-challenge/QGHcMRRCmxHp5-pvGxCorKDreEX8CuWOPgIUelUPPww', (req, res) => {
    res.send('QGHcMRRCmxHp5-pvGxCorKDreEX8CuWOPgIUelUPPww.RmGjYrLQ6ArB1jFRESCFgvLvQImuoIXVUWklPV4Ivtc');
});

app.post('/api/reset_password', (req, res, next) => {
    (async () => {
        const { ok, error } = await model.users.reset_password_from_link(req.body.token, req.body.password);
        res.send({ ok, error });
    })().catch(next);
});


app.get('/reset_password/:reset_password_token', resetPasswordLimiter, (req, res, next) => {
    (async () => {
        const token = req.params.reset_password_token;
        const user: User | null = await model.users.get_user_for_reset_password_token(token);
        if (user) {
            res.render(path.join(__dirname, 'view', './reset_password_from_link.ejs'), {
                token,
                user
            });
        } else {
            res.send('リンクが無効あるいは期限切れです。');
        }
    })().catch(next);
});

app.get('/reset_password', resetPasswordLimiter, (req, res, next) => {
    try {
        res.sendFile(path.join(__dirname, '../public/html/reset_password.html'));
    } catch (e) {
        next(e);
    }
});

app.get('/public_keys', (req, res, next) => {
    try {
        const net = credential.ethereum;
        log.info(net);
        res.render(path.join(__dirname, 'view', './public_keys.ejs'), {
            contract: net.contract,
            owner: net.account,
            name: net.name,
            abi: net.abi,
            url: net.url
        });
    } catch (e) {
        next(e);
    }
});

app.get('/email/:id', (req, res, next) => {
    (async () => {
        const { lines, subject, range } = await model.get_original_email_highlighted(req.params.id);
        res.render(path.join(__dirname, 'view', './email.ejs'), { lines, subject, range });
    })().catch(next);
});

app.get('/matrix', (req, res, next) => {
    try {
        res.sendFile(path.join(__dirname, '../public/html/matrix.html'));
    } catch (e) {
        next(e);
    }
});

type RegisterResponse = {
    ok: boolean,
    error?: string,
    error_code?: number,
    token?: string,
    decoded?: object,
    local_db_password?: string
}

app.post('/api/register', (req, res: JsonResponse<RegisterResponse>, next) => {
    (async () => {
        const { username, password, fullname, email } = req.body;
        log.info({ username, password, fullname, email });
        if (!username || !password) {
            res.json({ ok: false, error: 'User name and password are required.' });
            return;
        }
        const not_pwned = await model.users.check_password_not_pwned(password);
        if (!not_pwned) {
            res.json({ ok: false, error: 'Breached password' });
            return;
        }
        if (/[@~!\s]/.test(username)) {
            res.json({ ok: false, error: 'Invalid username' });
            return;
        }
        const r1 = await model.users.register({ username, password, email, fullname, source: 'self_register', workspace: default_workspace });
        if (r1 == null) {
            res.json({ ok: false });
        } else {
            const { user, error, error_code } = r1;
            if (!user) {
                res.json({ ok: false, error: error_code == ec.USER_EXISTS ? 'User already exists' : error, error_code });
                return;
            }
            const r: boolean = await model.users.save_password(user.id, password);
            if (!r) {
                res.json({ ok: false, error: 'Password save error' });
                return;
            }
            const token = jwt_sign({ username, user_id: user.id });
            const decoded = await jwt_verify(token, credential.jwt_secret).catch(() => {
                res.json({ ok: false, error: 'Token verificaiton error' });
            });
            if (decoded) {
                const local_db_password = await model.users.get_local_db_password(user.id);
                res.json({ ok: true, token, decoded, local_db_password });
                const obj: UsersNewSocket = {
                    __type: 'users.new',
                    timestamp: user.timestamp,
                    user
                };
                io.emit('users.new', obj);
            } else {

            }
        }
    })().catch(next);
});

app.post('/webhook/mailgun', multer().none(), (req, res, next) => {
    (async () => {
        res.json({ status: "ok" });
        log.info('Received email from: ', req.body['From']);
        await mail_algo.update_db_on_mailgun_webhook({ body: req.body, db, myio: io });
        log.info('Parsing done.');
    })().catch(next);
});


const shortid_ = require('shortid');
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

app.post('/webhook/slack', (req, res) => {
    log.debug(req.body);
    res.send(req.body.challenge || '');
    fs.writeFile('imported_data/slack/' + req.body['event_id'] + '.json', JSON.stringify(req.body, null, 2), (err) => {
        console.log('write file ', err);
    });
    const channel = req.body.event.channel;
    const url: string = 'https://slack.com/api/conversations.history';
    const token = credential.slack_token;
    const event = req.body.event;
    const timestamp_us = event.ts;
    const oldest = timestamp_us - 0.01;
    request({ url, method: 'GET', qs: { channel, token, oldest }, json: true }, (err, res1, html) => {
        console.log(err, res1.body);
        const msg = _.find(res1.body.messages, (m) => { return m.client_msg_id == event.client_msg_id });
        if (msg != null) {
            const session_id = 'gsTeps7Y8';
            const user_id = 'tRX3JzQEv';
            const id = shortid();
            const comment = msg.text;
            const timestamp = Math.floor(timestamp_us * 1000);
            console.log({ id, session_id, user_id, timestamp, comment });
            const url = 'slack://channel?team=' + event.team + '&id=' + channel + '&message_ts=' + timestamp_us;
            return; //Stub
            /*
            const rs = await model.sessions.post_comment_for_session_members(user_id, session_id, timestamp, comments, encrypt);
            model.sessions.post_comment({ user_id, session_id, timestamp, comment, url, "", "slack:channel:" + channel }).then((r) => {
                if (r.data) {
                    const obj = _.extend({}, { __type: "new_comment", temporary_id: "" }, r.data);
                    axios.post('http://localhost:3000/internal/emit_socket', obj).then((r2) => {
                        console.log(r2);
                    });
                }
            })
            */
        }
    });
})


app.post('/api/login', loginLimiter, (req: MyPostRequest<LoginParams>, res, next) => {
    (async () => {
        const { username, password } = req.body;
        log.info({ username, password });
        const matched = await model.users.match_password(username, password);
        if (matched) {
            log.info("login ok", username, password);
            const user = await model.users.find_from_username(username);
            if (user != null) {
                log.info('find_user_from_username', user);
                const token = jwt_sign({ username, user_id: user.id });
                const decoded = await jwt_verify(token, credential.jwt_secret);
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

app.get('/api/verify_token', (req, res, next) => {
    (async () => {
        var token = req.body.token || req.query.token || req.headers['x-access-token'];
        const decoded = await jwt_verify(token, credential.jwt_secret);
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

app.post('/api_public/reset_password', (req, res, next) => {
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

// http://dotnsf.blog.jp/archives/1067083257.html

app.use(function (req, res, next) {
    (async () => {
        if (req.path.indexOf('/api/') != 0) {
            next();
            return;
        }
        var token = req.body.token || req.query.token || req.headers['x-access-token'];
        if (!production) {
            if ('debug' in req.query) {
                token = token || credential.test_token;
                req.query['pretty'] = "";
                log.info(req.query);
            }
        }
        if (!token) {
            res.status(403).send({ ok: false, message: 'No token provided.' });
            return
        }
        const decoded = await jwt_verify(token, credential.jwt_secret);
        if (!decoded) {
            res.status(403).json({ ok: false, error: 'Invalid token.' });
        } else {
            //. 正当な値が定されていた場合は処理を続ける
            req.decoded = decoded;
            if (!production) {
                req.query['pretty'] = 'true';
            }
            next();
        }
    })().catch(next);
});

// http://catlau.co/how-to-modularize-routes-with-the-express-router/
app.use('/api', api_routes);

app.post('/api/logout/', (req, res, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const { timestamp } = await model.delete_connection_of_user(user_id);
        const obj: UsersUpdateSocket = { __type: 'users.update', action: 'online', user_id, online: false, timestamp };
        // ToDo: Add logout for all clients of the same user.
        io.emit('users.update', obj);
        res.json({ ok: true, user_id });
    })().catch(next);
})

app.delete('/api/comments/:id', (req: GetAuthRequest, res: JsonResponse<DeleteCommentResponse>, next) => {
    (async () => {
        if (req.params) {
            const comment_id = req.params.id;
            const r = await model.sessions.delete_comment(req.decoded.user_id, comment_id);
            res.json(r);
            if (r.data) {
                const obj: CommentsDeleteSocket = {
                    __type: 'comments.delete',
                    id: comment_id,
                    session_id: r.data.session_id
                };
                io.emit("comments.delete", obj);
            }
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});


app.post('/api/join_session', (req: PostRequest<JoinSessionParam>, res: JsonResponse<JoinSessionResponse>, next) => {
    (async () => {
        const session_id = req.body.session_id;
        const myself = req.decoded.user_id;
        const source = 'manual';
        const timestamp = new Date().getTime();
        const r: JoinSessionResponse = await model.sessions.join({ session_id, user_id: req.decoded.user_id, source, timestamp });
        res.json(r);
        if (r.ok && r.data) {
            _.map(r.data.members.concat([myself]), async (m: string) => {
                const socket_ids: string[] = await model.users.get_socket_ids(m);
                const data1 = { session_id, user_id: myself };
                socket_ids.forEach(socket_id => {
                    io.to(socket_id).emit("message", _.extend({}, { __type: "new_member" }, data1));
                })
            });
            const socket_ids_newmember: string[] = await model.users.get_socket_ids(myself);
            log.info('emitting to new member', socket_ids_newmember);

            const data2 = await model.sessions.get(myself, session_id);
            if (data2) {
                socket_ids_newmember.forEach(socket_id => {
                    io.to(socket_id).emit("message", _.extend({}, { __type: "new_session" }, data2));
                });
            }
        }
    })().catch(next);
});

app.get('/api/files', (req, res, next) => {
    (async () => {
        const files = await model.files.list_user_files(req.query.kind);
        res.json({ ok: true, files: files });
    })().catch(next);
});

app.post('/api/files', (req, res, next) => {
    (async () => {
        const { kind, session_id } = req.query;
        const err = await new Promise((resolve) => {
            upload(req, res, function (e) {
                resolve(e);
            });
        });
        log.info('/api/files', err, req.file);
        if (!err) {
            const { file_id } = await model.files.save_user_file(req.decoded.user_id, req.file.path, kind, session_id);
            log.info('save_user_file done', file_id)
            const file = {
                path: '/' + req.file.path,
                file_id,
            }
            res.json({ ok: true, files: [file] });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

app.patch('/api/files/:id', (req, res: JsonResponse<PostFileResponse>, next) => {
    (async () => {
        const err = await new Promise((resolve) => {
            upload(req, <any>res, function (e) {
                resolve(e);
            });
        });
        log.info('/api/files', err, req.file);
        if (!err) {
            const r = await model.files.update_user_file(req.decoded.user_id, req.params.id, req.file.path);
            if (r != null) {
                const data: PostFileResponseData = {
                    path: '/' + req.file.path,
                    file_id: r.file_id,
                    user_id: req.decoded.user_id
                };
                res.json({ ok: true, data });
                const obj = _.extend({}, { __type: "new_file" }, data);
                log.info('/api/files/:id emitting', obj);
                io.emit("message", obj);
            }
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

app.delete('/api/files/:id', (req: DeleteRequest<DeleteFileRequestParam, DeleteFileRequestData>, res: JsonResponse<DeleteFileResponse>, next) => {
    (async () => {
        log.info('delete comment');
        const file_id = req.params.id;
        const user_id = req.body.user_id;
        const r = await model.files.delete_file({ user_id, file_id });
        res.json(r);
        if (r.ok) {
            const obj: FilesDeleteSocket = {
                __type: 'files.delete'
            };
            io.emit("files.delete", obj);
        }
    })().catch(next);
});

app.get('/api/private_key', (req, res, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const { ok, privateKey } = await model.keys.get_private_key(user_id);
        res.json({ ok, privateKey });
    })().catch(next);
});

app.post('/api/private_key', (req, res: JsonResponse<PostPrivateKeyResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const private_key: JsonWebKey = req.body.private_key;
        const ok = await model.keys.temporarily_store_private_key(user_id, private_key);
        res.json({ ok });
    })().catch(next);
});

//Periodically remove old IDs.
setInterval(async () => {
    await model.keys.remove_old_temporary_private_key();
}, 10000);

app.get('/api/public_keys/me', (req: GetAuthRequest, res: JsonResponse<GetPublicKeysResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const pub1 = await model.keys.get_public_key(user_id);
        if (pub1) {
            const { publicKey: pub, prv_fingerprint } = pub1;
            res.json({ ok: pub != null, publicKey: pub, privateKeyFingerprint: prv_fingerprint });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

app.post('/api/public_keys', (req: MyPostRequest<PostPublicKeyParams>, res, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const jwk = req.body.publicKey;
        const for_user = req.body.for_user;
        const privateKeyFingerprint = req.body.privateKeyFingerprint;
        const { ok, timestamp } = await model.keys.register_public_key({ user_id, for_user, jwk, privateKeyFingerprint });
        res.json({ ok, timestamp });
        if (ok && timestamp) {
            const obj: UsersUpdateSocket = { __type: "users.update", action: 'public_key', user_id, timestamp, public_key: jwk };
            io.emit('users.update', obj);
        }
    })().catch(next);
});

app.get('/api/config', (req: GetAuthRequest, res: JsonResponse<GetConfigResponse>, next) => {
    (async () => {
        const configs = await model.users.get_user_config(req.decoded.user_id);
        res.json({ ok: configs != null, data: configs || undefined });
    })().catch(next);
});

app.post('/api/config', (req: MyPostRequest<PostConfigData>, res, next) => {
    (async () => {
        const key = req.body.key;
        const value = req.body.value;
        const r = await model.users.set_user_config(req.decoded.user_id, key, value);
        res.json(r);
    })().catch(next);
});

if (!production) {
    app.post('/debug/emit_socket', (req, res) => {
        io.emit("message", req.body);
        res.json({ ok: true });
    });
    app.get('/debug/import/:user_id/:mail_id', (req, res, next) => {
        (async () => {
            const mail_id: string = req.params.mail_id;
            const user_id: string = req.params.user_id;
            try {
                const body = JSON.parse(fs.readFileSync('./imported_data/mailgun/' + user_id + '/' + mail_id + '.json', 'utf8'));
                log.info('Import email from: ', body['From']);
                const { added_users, comments } = await mail_algo.update_db_on_mailgun_webhook({ body: body, db, myio: io, ignore_recipient: true });
                log.info('Parsing done.', added_users);
                res.json({ ok: true, comments, added_users });
            } catch (e) {
                next(e);
            }
        })().catch(next);
    })
}

model.delete_all_connections().then(() => {
    http.listen(port, () => {
        log.info("server is running at port " + port);
    })
    if (production) {
        https.listen(443, () => {
            log.info("HTTPS server is running at port " + 443);
        })
    }
});
