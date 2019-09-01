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

import * as jwt from 'jsonwebtoken';
import * as ec from './error_codes';
import multer from 'multer';
import * as mail_algo from './model/mail_algo'
import * as utils from './model/utils'
import { db } from './model/utils'
const credential = require('./private/credential');

utils.connectToDB();

const http = require('http').createServer(app);

var https;
if (production) {
    console.log('Production (HTTPS)')

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
}

const io = require('socket.io')(production ? https : http);

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

const upload = multer({
    dest: './uploads/',
    limits: {
        fieldNameSize: 1000,
        files: 100,
        fileSize: 1000000000
    }
}).single('user_image');

interface MyResponse extends Response {
    token: any;
    header: (k: string, v: string) => void;
}

interface MyPostRequest<T> {
    token: any;
    body: T;
    params?: { [key: string]: string }
    decoded?: { username: string, user_id: string, iap: number, exp: number }
}

interface GetAuthRequest {
    token: any
    query: { [key: string]: string }
    params?: { [key: string]: string }
    decoded: { username: string, user_id: string, iap: number, exp: number }
}

interface GetAuthRequest1<T> {
    token: any
    query: T
    params?: { [key: string]: string }
    decoded: { username: string, user_id: string, iap: number, exp: number }
}

console.log('Starting...');
const port = process.env.PORT || 3000;

const pretty = require('express-prettify');

// app.use('/public', express.static(__dirname + '/../public'))

app.use('/about', express.static(path.join(__dirname, '../public/about')))

app.use('/public', express.static(path.join(__dirname, '../public')))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))


app.use(pretty({ query: 'pretty' }));

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

app.get('/', (req, res) => {
    res.redirect('/main#/');
});

app.get('/register', (req, res, next) => {
    try {
        res.sendFile(path.join(__dirname, '../public/html/register.html'));
    } catch (e) {
        next(e);
    }
});

app.get('/login', (req, res, next) => {
    try {
        res.sendFile(path.join(__dirname, '../public/html/login.html'));
    } catch (e) {
        next(e);
    }
});

app.get('/main', (req, res, next) => {
    try {
        res.sendFile(path.join(__dirname, '../public/html/main.html'));
    } catch (e) {
        next(e);
    }
});

app.get('/public_keys', (req, res, next) => {
    try {
        const net = credential.ethereum;
        console.log(net);
        res.render(path.join(__dirname, './public_keys.ejs'), {
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
        res.render(path.join(__dirname, './email.ejs'), { lines, subject, range });
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
        console.log({ username, password, fullname, email });
        if (!username || !password) {
            res.json({ ok: false, error: 'User name and password are required.' });
            return;
        }
        const r1 = await model.users.register({ username, password, email, fullname, source: 'self_register' });
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
            const token = jwt.sign({ username, user_id: user.id }, credential.jwt_secret, { expiresIn: 604800 });
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
        console.log('Received email from: ', req.body['From']);
        await mail_algo.update_db_on_mailgun_webhook({ body: req.body, db, myio: io });
        console.log('Parsing done.');
    })().catch(next);
});

app.post('/api/login', (req: MyPostRequest<LoginParams>, res, next) => {
    (async () => {
        const { username, password } = req.body;
        console.log({ username, password });
        const matched = await model.users.match_password(null, username, password);
        if (matched) {
            console.log("login ok", username, password);
            const user = await model.users.find_from_username(username);
            if (user != null) {
                console.log('find_user_from_username', user);
                const token = jwt.sign({ username, user_id: user.id }, credential.jwt_secret, { expiresIn: 604800 });
                const decoded = await new Promise((resolve) => {
                    jwt.verify(token, credential.jwt_secret, (err, decoded) => {
                        resolve(decoded);
                    });
                });
                const local_db_password = await model.users.get_local_db_password(user.id);
                res.json({ ok: true, token, decoded, local_db_password });
            } else {
                res.json({ ok: false, error: 'Wrong user name or password.' }); //User not found
            }
        } else {
            res.json({ ok: false, error: 'Wrong user name or password.' });
        }
    })().catch(next);
});

const jwt_verify = (token: string, secret: string): Promise<any> => {
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
                console.log(req.query);
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

app.get('/api/matrix', (req, res, next) => {
    (async () => {
        const span = req.query.timespan;
        res.set('Content-Type', 'application/json')
        res.send(fs.readFileSync('private/slack_count_' + span + '.json', 'utf8'));
    })().catch(next);
});

app.get('/api/workspaces', (req: GetAuthRequest, res: JsonResponse<GetWorkspacesResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const wss = await model.workspaces.list(user_id);
        console.log('/api/workspaces', wss);
        res.json({ ok: true, data: wss });
    })().catch(next);
});

app.get('/api/workspaces/:id', (req: GetAuthRequest, res: JsonResponse<GetWorkspaceResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const workspace_id = req.params.id;
        const wss = await model.workspaces.get(user_id, workspace_id);
        res.json({ ok: true, data: wss });
    })().catch(next);
});


app.get('/api/users', (req: GetAuthRequest, res: JsonResponse<GetUsersResponse>, next) => {
    (async () => {
        const users = await model.users.list(req.decoded.user_id);
        res.json({ ok: true, data: { users } });
    })().catch(next);
});

app.get('/api/users/:id', (req, res: JsonResponse<GetUserResponse>, next) => {
    (async () => {
        const user = await model.users.get(req.params.id);
        res.json({ ok: true, data: { user } });
    })().catch(next);
});

app.patch('/api/users/:id', (req: MyPostRequest<UpdateUserData>, res: JsonResponse<UpdateUserResponse>, next) => {
    (async () => {
        if (req.decoded.user_id == req.params.id) {
            const user_id = req.decoded.user_id;
            const username = req.body.username;
            const fullname = req.body.fullname;
            const email = req.body.email;
            const timestamp = new Date().getTime();
            const user = await model.users.update(user_id, { username, fullname, email });
            const obj: UsersUpdateSocket = {
                __type: 'users.update',
                action: 'user',
                timestamp,
                user_id,
                user
            };
            io.emit('users.update', obj);
            res.json({ ok: true, data: user });
        } else {
            res.json({ ok: false, error: 'Only myself can be changed.' })
        }
    })().catch(next);

});

app.get('/api/users/all/profiles', (req, res: JsonResponse<GetProfilesResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        console.log('get_profiles');
        const data = await model.users.get_profiles();
        const obj: GetProfilesResponse = {
            ok: data != null,
            user_id,
            data
        };
        res.json(obj);
    })().catch(next);
});

app.get('/api/users/:id/profiles', (req, res: JsonResponse<GetProfileResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const data = await model.users.get_profile(user_id);
        const obj: GetProfileResponse = {
            ok: data != null,
            user_id,
            data
        };
        res.json(obj);
    })().catch(next);
});

app.patch('/api/users/:id/profiles', (req: MyPostRequest<UpdateProfileData>, res: JsonResponse<UpdateProfileResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const profile_ = req.body.profile;
        const ps = map(profile_, (v, k) => {
            return model.users.set_profile(user_id, k, v);
        });
        await Promise.all(ps);
        const profile = await model.users.get_profile(user_id);
        const timestamp = new Date().getTime();
        const obj: UsersUpdateSocket = {
            __type: 'users.update',
            action: 'profile',
            user_id,
            timestamp,
            profile   // Not only changed values but also all values are included.
        };
        io.emit('users.update', obj);
        res.json({ ok: true, user_id, data: profile });
    })().catch(next);
});

app.get('/api/users/:id/comments', (req, res: JsonResponse<GetCommentsResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id
        const comments = await model.sessions.list_comments(user_id, null, user_id);
        res.json({ ok: true, data: comments });
    })().catch(next);
});

app.get('/api/sessions/:id', (req, res: JsonResponse<GetSessionResponse>, next) => {
    (async () => {
        const data = await model.sessions.get(req.params.id);
        if (data) {
            res.json({ ok: true, data });
        } else {
            res.status(404).json({ ok: false });
        }
    })().catch(next);
});

app.delete('/api/comments/:id', (req: GetAuthRequest, res: JsonResponse<DeleteCommentResponse>, next) => {
    (async () => {
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
    })().catch(next);
});

app.patch('/api/sessions/:id', (req, res: JsonResponse<PatchSessionResponse>, next) => {
    (async () => {
        const session_id = req.params.id;
        const { name, members } = req.body;
        console.log(name, members);
        const { ok, timestamp } = await model.sessions.update({ session_id, name });
        const data: SessionsUpdateSocket = {
            __type: 'sessions.update',
            id: session_id,
            name,
            timestamp
        };
        io.emit('sessions.update', data);
        res.json({ ok });
    })().catch(next);
});

app.delete('/api/sessions/:id', (req, res: JsonResponse<CommentsDeleteResponse>, next) => {
    (async () => {
        const id = req.params.id;
        const ok = await model.sessions.delete_session(id);
        if (ok) {
            res.json({ ok: true });
            const obj: SessionsDeleteSocket = { __type: 'sessions.delete', id };
            io.emit('sessions.delete', obj);
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});


app.get('/api/sessions', (req: GetAuthRequest, res: JsonResponse<GetSessionsResponse>, next) => {
    (async () => {
        const ms: string = req.query.of_members;
        const of_members: string[] = ms ? ms.split(",") : undefined;
        const is_all: boolean = !(typeof req.query.is_all === 'undefined');
        const user_id: string = req.decoded.user_id;
        const r = await model.sessions.get_session_list({ user_id, of_members, is_all });
        res.json({ ok: true, data: r });
    })().catch(next);
});

interface PostRequest<T> {
    decoded: { user_id: string, username: string },
    body: T
}

interface DeleteRequest<T, U> {
    decoded: { user_id: string, username: string },
    body: U,
    params: T
}

app.post('/api/sessions', (req: PostRequest<PostSessionsParam>, res: JsonResponse<PostSessionsResponse>) => {
    const body = req.body;
    const members = uniq(body.members.concat([req.decoded.user_id]));
    const name = body.name;
    const temporary_id = body.temporary_id;
    (async () => {
        if (name && members) {
            const data = await model.sessions.create(name, members);
            const obj: SessionsNewSocket = {
                __type: 'sessions.new',
                temporary_id,
                id: data.id
            };
            io.emit("sessions.new", obj);
            _.map(members, async (m: string) => {
                const socket_ids: string[] = await model.users.get_socket_ids(m);
                console.log('emitting to', socket_ids);
                socket_ids.forEach(socket_id => {

                    console.log('sessions.new socket', obj);
                    // io.to(socket_id).emit("sessions.new", obj);
                })
            });
            res.json({ ok: true, data });
        } else {
            res.json({ ok: false, error: 'Name and members are necessary' });
        }
    })().catch((error) => {
        res.json({ ok: false, error });
    });
});


app.post('/api/sessions/:session_id/comments/delta', (req: MyPostRequest<GetCommentsDeltaData>, res, next) => {
    // https://qiita.com/yukin01/items/1a36606439123525dc6d
    (async () => {
        const session_id = req.params.session_id;
        const last_updated = req.body.last_updated;
        const cached_ids = req.body.cached_ids;
        // console.log(session_id, last_updated, cached_ids);
        const deltas: CommentChange[] = await model.list_comment_delta({ session_id, cached_ids, for_user: req.decoded.user_id, last_updated });
        res.json(deltas);
    })().catch(next);
});

app.get('/api/sessions/:session_id/comments', (req: GetAuthRequest1<GetCommentsParams>, res: JsonResponse<GetCommentsResponse>, next) => {
    (async () => {
        const session_id = req.params.session_id;
        const by_user = req.query.by_user;
        const after = req.query.after;
        const comments: ChatEntry[] = await model.sessions.list_comments(req.decoded.user_id, session_id, by_user, after);
        res.json({ ok: comments != null, data: comments });
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
        if (r.ok) {
            _.map(r.data.members.concat([myself]), async (m: string) => {
                const socket_ids: string[] = await model.users.get_socket_ids(m);
                const data1 = { session_id, user_id: myself };
                socket_ids.forEach(socket_id => {
                    io.to(socket_id).emit("message", _.extend({}, { __type: "new_member" }, data1));
                })
            });
            const socket_ids_newmember: string[] = await model.users.get_socket_ids(myself);
            console.log('emitting to new member', socket_ids_newmember);

            const data2: RoomInfo = await model.sessions.get(session_id);
            socket_ids_newmember.forEach(socket_id => {
                io.to(socket_id).emit("message", _.extend({}, { __type: "new_session" }, data2));
            });
        }
    })().catch(next);
});

app.post('/api/sessions/:session_id/comments', (req: MyPostRequest<PostCommentData>, res: JsonResponse<PostCommentResponse>) => {
    (async () => {
        const timestamp = new Date().getTime();
        const user_id = req.decoded.user_id;
        const comments = req.body.comments;
        const session_id = req.params.session_id;
        const temporary_id = req.body.temporary_id;
        const encrypt = req.body.encrypt;
        console.log('/api/comments');

        if (encrypt == 'ecdh.v1' || encrypt == 'none') {
            const p: PostCommentModelParams = {
                user_id, session_id, timestamp, comments, encrypt
            }
            const rs = await model.sessions.post_comment(p);
            res.json({ ok: true });
            for (let r of rs) {
                const { data: d, for_user, ok, error } = r;
                if (d) {
                    // await email.send_emails_to_session_members({ session_id, user_id, comment: model.make_email_content(d) });
                    const obj: CommentsNewSocket = {
                        __type: 'comment.new',
                        temporary_id,
                        entry: d
                    };
                    const socket_ids = await model.users.get_socket_ids(for_user);
                    console.log('Emitting comments.new', obj);
                    for (let sid of socket_ids) {
                        io.to(sid).emit("comments.new", obj);
                    }
                }
            }
        }
    })().catch(() => {
        res.json({ ok: false, error: "DB error." })
    });
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
        console.log('/api/files', err, req.file);
        if (!err) {
            const { file_id } = await model.files.save_user_file(req.decoded.user_id, req.file.path, kind, session_id);
            console.log('save_user_file done', file_id)
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
        console.log('/api/files', err, req.file);
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
                console.log('/api/files/:id emitting', obj);
                io.emit("message", obj);
            }
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

app.delete('/api/files/:id', (req: DeleteRequest<DeleteFileRequestParam, DeleteFileRequestData>, res: JsonResponse<DeleteFileResponse>, next) => {
    (async () => {
        console.log('delete comment');
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
        const { publicKey: pub, prv_fingerprint } = await model.keys.get_public_key(user_id);
        res.json({ ok: pub != null, publicKey: pub, privateKeyFingerprint: prv_fingerprint });
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
        if (ok) {
            const obj: UsersUpdateSocket = { __type: "users.update", action: 'public_key', user_id, timestamp, public_key: jwk };
            io.emit('users.update', obj);
        }
    })().catch(next);
});

app.get('/api/config', (req: GetAuthRequest, res: JsonResponse<GetConfigResponse>, next) => {
    (async () => {
        const configs = await model.users.get_user_config(req.decoded.user_id);
        res.json({ ok: true, data: configs });
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
}

model.delete_all_connections().then(() => {
    http.listen(port, () => {
        console.log("server is running at port " + port);
    })
});

if (production) {
    https.listen(443, () => {
        console.log("HTTPS server is running at port " + 443);
    })
}

io.on('connection', (socket: SocketIO.Socket) => {
    console.log('A user connected', socket.id);
    socket.on('subscribe', async ({ token }) => {
        const decoded = await jwt_verify(token, credential.jwt_secret);
        if (decoded) {
            const user_id = decoded.user_id;
            const previous = await model.users.list_online_users();
            const r = await model.users.save_socket_id(user_id, socket.id);
            console.log('saveSocketId', r, 'socket id', user_id, socket.id)
            console.log('Online users:', previous, user_id)
            if (!includes(previous, user_id)) {
                const obj: UsersUpdateSocket = { __type: "users.update", action: 'online', user_id, online: true, timestamp: r.timestamp }
                io.emit('users.update', obj);
            }
        }
    });
    socket.on('disconnect', async () => {
        console.log('disconnected', socket.id);
        const { user_id, online, timestamp } = await model.delete_connection(socket.id);
        const obj: UsersUpdateSocket = {
            __type: 'users.update',
            action: 'online',
            user_id, online, timestamp
        }
        io.emit('users.update', obj);
    })
});

// setInterval(() => {
//     var clients = Object.keys(io.sockets.clients().connected);
//     console.log(clients);
// }, 3000);