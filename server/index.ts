/// <reference path="../common/types.d.ts" />


// const production = true; //process.env.PRODUCTION;
const production = false;

import * as model from './model'
const express = require('express');
const morgan = require('morgan');
const app = express();
const glob = require("glob");
const bodyParser = require("body-parser");
// const _ = require('lodash');
import * as _ from 'lodash';
import { uniq, includes, keyBy } from 'lodash';
const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, 'private/db.sqlite3'));
// const model = require('./model');
const fs = require('fs');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const credential = require('./private/credential');
import * as ec from './error_codes';
import multer from 'multer';
import { fingerPrint } from '../common/common_model';
// import chalk from 'chalk';

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
    return new moment().format();
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

enum Timespan {
    day,
    week,
    month
}

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

app.use('/public', express.static(path.join(__dirname, '../public')))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))


app.use(pretty({ query: 'pretty' }));

app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json());

// db.run('drop table if exists comments;')
db.run('create table  if not exists comments (user_id text, comment text, timestamp integer);')

app.use(function (req: Request, res: MyResponse, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, PATCH, OPTIONS');
    next();
});

app.get('/.well-known/acme-challenge/QGHcMRRCmxHp5-pvGxCorKDreEX8CuWOPgIUelUPPww', (req, res) => {
    res.send('QGHcMRRCmxHp5-pvGxCorKDreEX8CuWOPgIUelUPPww.RmGjYrLQ6ArB1jFRESCFgvLvQImuoIXVUWklPV4Ivtc');
});

app.get('/', (req, res) => {
    res.redirect('/main#/');
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/login.html'));
});

app.get('/main', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/main.html'));
});

app.get('/public_keys', (req, res) => {
    const net = credential.ethereum;
    console.log(net);
    res.render(path.join(__dirname, './public_keys.ejs'), {
        contract: net.contract,
        owner: net.account,
        name: net.name,
        abi: net.abi,
        url: net.url
    });
});

app.get('/email/:id', (req, res) => {
    model.get_original_email_highlighted(req.params.id).then(({ lines, subject, range }) => {
        res.render(path.join(__dirname, './email.ejs'), { lines, subject, range });
    }).catch((err) => {
        console.log(err);
        res.send('Error.');
    });
});

app.get('/matrix', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/matrix.html'));
});

type RegisterResponse = {
    ok: boolean,
    error?: string,
    error_code?: number,
    token?: string,
    decoded?: object,
    local_db_password?: string
}

app.post('/api/register', (req, res: JsonResponse<RegisterResponse>) => {
    (async () => {
        const { username, password, fullname, email } = req.body;
        console.log({ username, password, fullname, email });
        if (!username || !password) {
            res.json({ ok: false, error: 'User name and password are required.' });
            return;
        }
        const r1 = await model.register_user({ username, password, email, fullname, source: 'self_register' });
        if (r1 == null) {
            res.json({ ok: false });
        } else {
            const { user, error, error_code } = r1;
            if (!user) {
                res.json({ ok: false, error: error_code == ec.USER_EXISTS ? 'User already exists' : error, error_code });
                return;
            }
            const r: boolean = await model.save_password(user.id, password);
            if (!r) {
                res.json({ ok: false, error: 'Password save error' });
                return;
            }
            const token = jwt.sign({ username, user_id: user.id }, credential.jwt_secret, { expiresIn: 604800 });
            jwt.verify(token, credential.jwt_secret, function (err, decoded) {
                if (!err) {
                    model.get_local_db_password(user.id).then((local_db_password) => {
                        res.json({ ok: true, token, decoded, local_db_password });
                        const obj: UsersNewSocket = {
                            __type: 'users.new',
                            timestamp: user.timestamp,
                            user
                        };
                        io.emit('users.new', obj);
                    });
                } else {
                    res.json({ ok: false, error: 'Token verificaiton error' });
                }
            });
        }
    })();
});

app.post('/api/login', (req: MyPostRequest<LoginParams>, res) => {
    const { username, password } = req.body;
    console.log({ username, password })
    model.passwordMatch(null, username, password).then((matched) => {
        if (matched) {
            console.log("login ok", username, password);
            model.find_user_from_username({ myself: null, username }).then((user) => {
                if (user != null) {
                    console.log('find_user_from_username', user);
                    const token = jwt.sign({ username, user_id: user.id }, credential.jwt_secret, { expiresIn: 604800 });
                    jwt.verify(token, credential.jwt_secret, function (err, decoded) {
                        model.get_local_db_password(user.id).then((local_db_password) => {
                            res.json({ ok: true, token, decoded, local_db_password });
                        });
                    });
                } else {
                    res.json({ ok: false, error: 'Wrong user name or password.' }); //User not found
                }
            });
        } else {
            res.json({ ok: false, error: 'Wrong user name or password.' });
        }
    });
});

app.get('/api/verify_token', (req, res) => {
    var token = req.body.token || req.query.token || req.headers['x-access-token'];
    jwt.verify(token, credential.jwt_secret, function (err, decoded) {
        if (err) {
            res.status(200).json({ valid: false });
        } else {
            model.get_user({ myself: decoded.user_id, user_id: decoded.user_id }).then((user) => {
                if (user) {
                    req.decoded = decoded;
                    res.status(200).json({ valid: true, decoded });
                } else {
                    res.json({ valid: false, error: 'Unknown user' })
                }
            });
        }
    });
});

// http://dotnsf.blog.jp/archives/1067083257.html

app.use(function (req, res, next) {
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
    jwt.verify(token, credential.jwt_secret, function (err, decoded) {
        if (err) {
            res.status(403).json({ ok: false, error: 'Invalid token.' });
        } else {
            //. 正当な値が定されていた場合は処理を続ける
            req.decoded = decoded;
            if (!production) {
                req.query['pretty'] = 'true';
            }
            next();
        }
    });
});

app.post('/api/logout/', (req, res) => {
    const user_id = req.decoded.user_id;
    model.delete_connection_of_user(user_id).then(({ timestamp }) => {
        const obj: UsersUpdateSocket = { __type: 'users.update', action: 'online', user_id, online: false, timestamp };
        // ToDo: Add logout for all clients of the same user.
        io.emit('users.update', obj);
    });
    res.json({ ok: true, user_id });
})

app.get('/api/matrix', (req, res) => {
    const span = req.query.timespan;
    res.set('Content-Type', 'application/json')
    res.send(fs.readFileSync('private/slack_count_' + span + '.json', 'utf8'));
});

app.get('/api/users', (req: GetAuthRequest, res: JsonResponse<GetUsersResponse>) => {
    model.list_users(req.decoded.user_id).then(users => {
        res.json({ ok: true, data: { users } });
    });
});

app.get('/api/users/:id', (req, res: JsonResponse<GetUserResponse>) => {
    model.get_user(req.params.id).then((user: User) => {
        res.json({ ok: true, data: { user } });
    });
});

app.patch('/api/users/:id', (req: MyPostRequest<UpdateUserData>, res: JsonResponse<UpdateUserResponse>) => {
    if (req.decoded.user_id == req.params.id) {
        const user_id = req.decoded.user_id;
        const username = req.body.username;
        const fullname = req.body.fullname;
        const email = req.body.email;
        const timestamp = new Date().getTime();
        model.update_user(user_id, { username, fullname, email }).then((user: User) => {
            const obj: UsersUpdateSocket = {
                __type: 'users.update',
                action: 'profile',
                timestamp,
                user_id,
                user
            };
            io.emit('users.update', obj);
            res.json({ ok: true, data: user });
        });
    } else {
        res.json({ ok: false, error: 'Only myself can be changed.' })
    }
});


app.get('/api/users/:id/comments', (req, res: JsonResponse<GetCommentsResponse>) => {
    const user_id = req.decoded.user_id
    model.list_comments(user_id, null, user_id).then((comments) => {
        res.json({ ok: true, data: comments });
    });
});

function expandSpan(date: string, span: Timespan): string[] {
    console.log('expandSpan', span);
    if (span == Timespan.day) {
        return [date];
    } else if (span == Timespan.week) {
        const m = moment(date, "YYYYMMDD");
        return _.map(_.range(1, 8), (i) => {
            const m1 = _.clone(m);
            m1.isoWeekday(i);
            return m1.format("YYYYMMDD");
        });
    } else if (span == Timespan.month) {
        const m = moment(date, "YYYYMMDD");
        const daysList = [31, m.isLeapYear() ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return _.map(_.range(1, daysList[m.month()] + 1), (i: number) => {
            const m1 = _.clone(m);
            m1.date(i);
            return m1.format("YYYYMMDD");
        });
    }
}

app.get('/api/comments_by_date_user', (req, res) => {
    const date_ = req.query.date;
    const user = req.query.user;
    const span: Timespan = Timespan[<string>req.query.timespan];
    try {
        const dates = expandSpan(date_, span);
        const all_files = _.flatMap(dates, (date) => {
            if (user == "__all") {
                return glob.sync('private/slack_matrix/' + date + "-*.json");
            } else {
                const filename = "private/slack_matrix/" + date + "-" + user + ".json";
                return [path.join(__dirname, filename)];
            }
        });
        const comments = _.sortBy(_.compact(_.flatMap(all_files, (filename) => {
            if (fs.existsSync(filename)) {
                return JSON.parse(fs.readFileSync(filename, 'utf8'));
            } else {
                return null;
            }
        })), (e) => { return parseFloat(e.ts); });
        res.json(_.map(comments, (c) => {
            const _ts_str = "" + (c.ts * 1000000)
            return _.extend({ source: "Slack" }, c)
        }));
    } catch (e) {
        console.log(e);
        res.status(404);
        res.json({ error: "File not found" })
    }
});

app.get('/api/sessions/:id', (req, res: JsonResponse<GetSessionResponse>) => {
    model.get_session_info(req.params.id).then((data) => {
        if (data) {
            res.json({ ok: true, data });
        } else {
            res.status(404).json({ ok: false });
        }
    })
});

app.delete('/api/comments/:id', (req, res: JsonResponse<DeleteCommentResponse>) => {
    const comment_id = req.params.id;
    db.get('select * from comments where id=?;', comment_id, (err, row) => {
        if (row) {
            const session_id = row['session_id'];
            const encrypt_group = row['encrypt_group'];
            db.run('delete from comments where encrypt_group=?;', encrypt_group, (err) => {
                if (!err) {
                    const data: DeleteCommentData = { comment_id, encrypt_group, session_id };
                    res.json({ ok: true, data });
                    const obj: CommentsDeleteSocket = {
                        __type: 'comments.delete',
                        id: comment_id,
                        session_id
                    };
                    io.emit("comments.delete", obj);
                } else {
                    res.json({ ok: true });
                }
            });
        } else {
            console.log('DELETE /api/comments/ Error', err);
            res.json({ ok: false, error: 'Comment ' + comment_id + ' does not belong to any session.' })
        }
    });
});

app.patch('/api/sessions/:id', (req, res: JsonResponse<PatchSessionResponse>) => {
    const id = req.params.id;
    const { name, members } = req.body;
    console.log(name, members);
    const timestamp = new Date().getTime();
    db.run('update sessions set name=? where id=?;', model.cipher(name), id, () => {
        res.json({ ok: true });
        const data: SessionsUpdateSocket = {
            __type: 'sessions.update',
            id,
            name,
            timestamp
        };
        io.emit('sessions.update', data);
    });
});

app.delete('/api/sessions/:id', (req, res: JsonResponse<CommentsDeleteResponse>) => {
    const id = req.params.id;
    db.run('delete from sessions where id=?;', id, (err) => {
        db.run('delete from comments where session_id=?;', id, (err2) => {
            db.run('delete from session_current_members where session_id=?;', id, (err3) => {
                db.run('delete from session_events where session_id=?;', id, (err4) => {
                    if (!err && !err2 && !err3 && !err4) {
                        res.json({ ok: true });
                        const obj: SessionsDeleteSocket = { __type: 'sessions.delete', id };
                        io.emit('sessions.delete', obj);
                    } else {
                        res.json({ ok: false });
                    }
                });
            });
        });
    });
});


app.get('/api/sessions', (req: GetAuthRequest, res: JsonResponse<GetSessionsResponse>) => {
    const ms: string = req.query.of_members;
    const of_members: string[] = ms ? ms.split(",") : undefined;
    const is_all: boolean = !(typeof req.query.is_all === 'undefined');
    const user_id: string = req.decoded.user_id;
    model.get_session_list({ user_id, of_members, is_all }).then((r: RoomInfo[]) => {
        res.json({ ok: true, data: r });
    })
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
    const file_id = body.file_id;
    const temporary_id = body.temporary_id;
    (async () => {
        if (name && members) {
            const data = await model.create_new_session(name, members);
            if (file_id) {
                await model.post_file_to_session(data.id, req.decoded.user_id, file_id);
            }
            const obj: SessionsNewSocket = {
                __type: 'sessions.new',
                temporary_id,
                id: data.id
            };
            io.emit("sessions.new", obj);
            _.map(members, async (m: string) => {
                const socket_ids: string[] = await model.getSocketIds(m);
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
    // https://qiita.com/yukin01/items/1a36606439123525dc6d
    (async () => {
        const session_id = req.params.session_id;
        const by_user = req.query.by_user;
        const after = req.query.after;
        const comments: ChatEntry[] = await model.list_comments(req.decoded.user_id, session_id, by_user, after);
        res.json({ ok: comments != null, data: comments });
    })().catch(next);
});

app.get('/api/sent_email', (req, res) => {
    model.get_sent_mail(req.query.q).then((data) => {
        res.header("Content-Type", "application/json; charset=utf-8");
        res.json(data);
    });
});

app.post('/api/join_session', (req: PostRequest<JoinSessionParam>, res: JsonResponse<JoinSessionResponse>, next) => {
    (async () => {
        const session_id = req.body.session_id;
        const myself = req.decoded.user_id;
        const source = 'manual';
        const timestamp = new Date().getTime();
        const r: JoinSessionResponse = await model.join_session({ session_id, user_id: req.decoded.user_id, source, timestamp });
        res.json(r);
        if (r.ok) {
            _.map(r.data.members.concat([myself]), async (m: string) => {
                const socket_ids: string[] = await model.getSocketIds(m);
                const data1 = { session_id, user_id: myself };
                socket_ids.forEach(socket_id => {
                    io.to(socket_id).emit("message", _.extend({}, { __type: "new_member" }, data1));
                })
            });
            const socket_ids_newmember: string[] = await model.getSocketIds(myself);
            console.log('emitting to new member', socket_ids_newmember);

            const data2: RoomInfo = await model.get_session_info(session_id);
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
            const rs = await model.post_comment_for_session_members(user_id, session_id, timestamp, comments, encrypt);
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
                    const socket_ids = await model.getSocketIds(for_user);
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

app.get('/api/files', (req, res) => {
    model.list_user_files(req.query.kind).then((files) => {
        res.json({ ok: true, files: files });
    });
});

app.post('/api/files', (req, res) => {
    upload(req, res, function (err) {
        const { kind, session_id } = req.query;
        console.log('/api/files', err, req.file);
        if (!err) {
            model.save_user_file(req.decoded.user_id, req.file.path, kind, session_id).then(({ file_id }) => {
                console.log('save_user_file done', file_id)
                const file = {
                    path: '/' + req.file.path,
                    file_id,
                }
                res.json({ ok: true, files: [file] });
            }).catch((e) => {
                console.log(e);
                res.json({ ok: false });
            });
        } else {
            res.json({ ok: false });
        }
    });
});

app.patch('/api/files/:id', (req, res: JsonResponse<PostFileResponse>) => {
    upload(req, <any>res, function (err) {
        console.log('/api/files', err, req.file);
        if (!err) {
            model.update_user_file(req.decoded.user_id, req.params.id, req.file.path).then((r) => {
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
            });
        } else {
            res.json({ ok: false });
        }
    });
});

app.delete('/api/files/:id', (req: DeleteRequest<DeleteFileRequestParam, DeleteFileRequestData>, res: JsonResponse<DeleteFileResponse>) => {
    console.log('delete comment');
    const file_id = req.params.id;
    const user_id = req.body.user_id;
    model.delete_file({ user_id, file_id }).then((r) => {
        res.json(r);
        if (r.ok) {
            const obj: FilesDeleteSocket = {
                __type: 'files.delete'
            };
            io.emit("files.delete", obj);
        }
    });
});

app.get('/api/private_key', (req, res) => {
    const user_id = req.decoded.user_id;
    model.get_private_key(user_id).then(({ ok, privateKey }) => {
        res.json({ ok, privateKey });
    })
});

app.post('/api/private_key', (req, res: JsonResponse<PostPrivateKeyResponse>) => {
    const user_id = req.decoded.user_id;
    const private_key: JsonWebKey = req.body.private_key;
    model.temporarily_store_private_key(user_id, private_key).then((ok) => {
        res.json({ ok });
    })
});

//Periodically remove old IDs.
setInterval(async () => {
    await model.remove_old_temporary_private_key();
}, 10000);

app.get('/api/public_keys/me', (req: GetAuthRequest, res: JsonResponse<GetPublicKeysResponse>) => {
    const user_id = req.decoded.user_id;
    const for_user = req.query.for_user || user_id;
    model.get_public_key({ user_id, for_user }).then(({ publicKey: pub, prv_fingerprint }) => {
        res.json({ ok: pub != null, publicKey: pub, privateKeyFingerprint: prv_fingerprint });
    });
});

app.post('/api/public_keys', (req: MyPostRequest<PostPublicKeyParams>, res) => {
    const user_id = req.decoded.user_id;
    const jwk = req.body.publicKey;
    const for_user = req.body.for_user;
    const privateKeyFingerprint = req.body.privateKeyFingerprint;
    model.register_public_key({ user_id, for_user, jwk, privateKeyFingerprint }).then(({ ok, timestamp }) => {
        res.json({ ok, timestamp });
        if (ok) {
            const obj: UsersUpdateSocket = { __type: "users.update", action: 'public_key', user_id, timestamp, public_key: jwk };
            io.emit('users.update', obj);
        }
    });
});

app.get('/api/config', (req: GetAuthRequest, res: JsonResponse<GetConfigResponse>) => {
    model.get_user_config(req.decoded.user_id).then((configs) => {
        res.json({ ok: true, data: configs });
    });
});

app.post('/api/config', (req: MyPostRequest<PostConfigData>, res) => {
    const key = req.body.key;
    const value = req.body.value;
    model.set_user_config(req.decoded.user_id, key, value).then((r) => {
        res.json(r);
    });
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

io.on('connection', function (socket: SocketIO.Socket) {
    console.log('A user connected', socket.id);
    socket.on('subscribe', ({ token }) => {
        jwt.verify(token, credential.jwt_secret, function (err, decoded) {
            if (decoded) {
                const user_id = decoded.user_id;
                model.list_online_users().then((previous) => {
                    model.saveSocketId(user_id, socket.id).then((r) => {
                        console.log('saveSocketId', r, 'socket id', user_id, socket.id)
                        console.log('Online users:', previous, user_id)
                        if (!includes(previous, user_id)) {
                            const obj: UsersUpdateSocket = { __type: "users.update", action: 'online', user_id, online: true, timestamp: r.timestamp }
                            io.emit('users.update', obj);
                        }
                    });

                });
            }
        });
    });
    socket.on('disconnect', () => {
        console.log('disconnected', socket.id);
        model.delete_connection(socket.id).then(({ user_id, online, timestamp }) => {
            const obj: UsersUpdateSocket = {
                __type: 'users.update',
                action: 'online',
                user_id, online, timestamp
            }
            io.emit('users.update', obj);
        });
    })
});

function clientErrorHandler(err, req, res, next) {
    if (req.xhr) {
        res.status(500).send({ error: 'Something failed!' })
    } else {
        next(err)
    }
}

app.use(clientErrorHandler);

// setInterval(() => {
//     var clients = Object.keys(io.sockets.clients().connected);
//     console.log(clients);
// }, 3000);