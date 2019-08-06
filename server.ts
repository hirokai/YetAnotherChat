/// <reference path="./types.d.ts" />

import * as model from './model'


const express = require('express');
const app = express();
const glob = require("glob");
const bodyParser = require("body-parser");
// const _ = require('lodash');
import * as _ from 'lodash';
const path = require('path');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, 'private/db.sqlite3'));
// const model = require('./model');
const fs = require('fs');
const moment = require('moment');
const jwt = require('jsonwebtoken');
var http = require('http').createServer(app);
const io = require('socket.io')(http);
const credential = require('./private/credential');
import * as ec from './error_codes';
import multer from 'multer';


const upload = multer({ dest: './public/uploads/' }).single('user_image');

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
    body: T
}

interface GetAuthRequest {
    token: any;
    query: { [key: string]: string }
    decoded: { username: string, user_id: string, iap: number, exp: number }
}

console.log('Starting...');
const port = process.env.PORT || 3000;

const pretty = require('express-prettify');

app.use('/public', express.static(path.join(__dirname, 'public')))

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


app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, './public/html/register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, './public/html/login.html'));
});

app.get('/main', (req, res) => {
    res.sendFile(path.join(__dirname, './public/html/main.html'));
});


app.get('/matrix', (req, res) => {
    res.sendFile(path.join(__dirname, './public/html/matrix.html'));
});

app.post('/api/register', (req, res) => {
    // res.json({ ok: false });
    (async () => {
        const { username, password, fullname, email } = req.body;
        console.log({ username, password, fullname, email });
        const { user_id, error, error_code } = await model.register_user(username, email, fullname);
        if (!user_id) {
            res.json({ ok: false, error: error_code == ec.USER_EXISTS ? 'User already exists' : error, error_code });
            return;
        }
        const r: boolean = await model.save_password(user_id, password);
        if (!r) {
            res.json({ ok: false, error: 'Password save error' });
            return;
        }
        const token = jwt.sign({ username, user_id }, credential.jwt_secret, { expiresIn: 604800 });
        jwt.verify(token, credential.jwt_secret, function (err, decoded) {
            if (!err) {
                res.json({ ok: true, token, decoded });
            } else {
                res.json({ ok: false, error: 'Token verificaiton error' });
            }
        });
    })();
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    model.passwordMatch(username, password).then((matched) => {
        if (matched) {
            console.log("login ok", username, password);
            model.find_user_from_username(username).then((user) => {
                if (user != null) {
                    console.log('find_user_from_username', user);
                    const token = jwt.sign({ username, user_id: user.id }, credential.jwt_secret, { expiresIn: 604800 });
                    jwt.verify(token, credential.jwt_secret, function (err, decoded) {
                        res.json({ ok: true, token, decoded });
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
        console.log('decoded', decoded);
        if (err) {
            res.status(200).json({ valid: false });
        } else {
            model.find_user_from_user_id(decoded.user_id).then((user) => {
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
            next();
        }
    });
});

app.post('/api/logout/', (req, res) => {
    const user_id = req.decoded.user_id;
    res.json({ ok: true });
})

app.get('/api/matrix', (req, res) => {
    const span = req.query.timespan;
    res.set('Content-Type', 'application/json')
    res.send(fs.readFileSync('private/slack_count_' + span + '.json', 'utf8'));
});

app.get('/api/users_old', (_, res: JsonResponse<User>) => {
    const users: UserSlack[] = JSON.parse(fs.readFileSync('private/slack_users.json', 'utf8'));
    res.json(_.map(users, (u: UserSlack): User => {
        const ts = u.real_name.split(" ");
        const letter = ts[ts.length - 1][0].toLowerCase();
        return { id: u.id, fullname: u.real_name, username: u.name, avatar: '/public/img/letter/' + letter + '.png', emails: [] };
    }));
});

app.get('/api/users', (__, res: JsonResponse<GetUsersResponse>) => {
    model.get_users().then(users => {
        res.json({ ok: true, data: { users } });
    });
});

app.get('/api/users/:id', (req, res: JsonResponse<GetUserResponse>) => {
    model.find_user_from_user_id(req.params.id).then((user: User) => {
        res.json({ ok: true, data: { user } });
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
        res.json({ ok: true, data });
    })
});


app.delete('/api/comments/:id', (req, res: JsonResponse<DeleteCommentResponse>) => {
    console.log('delete comment');
    const comment_id = req.params.id;
    db.get('select session_id from comments where id=?', comment_id, (err, row) => {
        const session_id = row['session_id'];
        db.run('delete from comments where id=?;', comment_id, (err) => {
            if (!err) {
                res.json({ ok: true, data: { comment_id, session_id } });
                const data: DeleteCommentData = { comment_id, session_id };
                io.emit("message", _.extend({}, { __type: "delete_comment" }, data));
            } else {
                res.json({ ok: true });
            }
        });

    });
});



app.patch('/api/sessions/:id', (req, res: JsonResponse<PatchSessionResponse>) => {
    const id = req.params.id;
    const { name, members } = req.body;
    console.log(name, members);
    db.run('update sessions set name=? where id=?;', model.cipher(name), id, () => {
        res.json({ ok: true });
    });
});


app.get('/api/sessions', (req: GetAuthRequest, res: JsonResponse<GetSessionsResponse>) => {
    const ms: string = req.query.of_members;
    const of_members: string[] = ms ? ms.split(",") : undefined;
    const is_all: boolean = !(typeof req.query.is_all === 'undefined');
    console.log(req.decoded);
    const user_id: string = req.decoded.user_id;
    model.get_session_list({ user_id, of_members, is_all }).then((r: RoomInfo[]) => {
        res.json({ ok: true, data: r });
    })
});

interface PostRequest<T> {
    decoded: { user_id: string, username: string },
    body: T
}

app.post('/api/sessions', (req: PostRequest<PostSessionsParam>, res: JsonResponse<PostSessionsResponse>) => {
    const body = req.body;
    const members = body.members;
    const name = body.name;
    const temporary_id = body.temporary_id;
    if (name && members) {
        model.create_new_session(name, members).then((data) => {
            res.json({ ok: true, data });
            _.map(members, async (m: string) => {
                const socket_ids: string[] = await model.getSocketIds(m);
                console.log('emitting to', socket_ids);
                socket_ids.forEach(socket_id => {
                    io.to(socket_id).emit("message", _.extend({}, { __type: "new_session", temporary_id }, data));
                })
            });
        }).catch((error) => {
            res.json({ ok: false, error });
        });
    } else {
        res.json({ ok: false, error: 'Name and members are necessary' });
    }
});

app.get('/api/comments', (req, res, next) => {
    // https://qiita.com/yukin01/items/1a36606439123525dc6d
    (async () => {
        const session_id = req.query.session;
        const user_id = req.query.user;
        const comments: (CommentTyp | SessionEvent)[] = await model.get_comments_list(session_id, user_id);
        res.json(comments);
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
        const members = await model.get_members(session_id);
        console.log(members);
        const myself = req.decoded.user_id;
        const is_member = _.includes(members, myself);
        if (!is_member) {
            const data: JoinSessionResponse = await model.join_session(session_id, req.decoded.user_id);
            res.json(data);
            _.map(members.concat([myself]), async (m: string) => {
                const socket_ids: string[] = await model.getSocketIds(m);
                const data1 = { session_id, user_id: myself };
                socket_ids.forEach(socket_id => {
                    io.to(socket_id).emit("message", _.extend({}, { __type: "new_member" }, data1));
                })
            });
            const socket_ids_newmember: string[] = await model.getSocketIds(myself);
            console.log('emitting to new member', socket_ids_newmember);

            const data2: { id: string, name: string, timestamp: number, members: string[] } = await model.get_session_info(session_id);
            socket_ids_newmember.forEach(socket_id => {
                io.to(socket_id).emit("message", _.extend({}, { __type: "new_session" }, data2));
            });

        } else {
            res.json({ ok: false, error: 'Already member' });
        }
    })().catch(next);
});

app.post('/api/comments', (req: MyPostRequest<PostCommentData>, res: JsonResponse<PostCommentResponse>) => {
    (async () => {
        db.serialize(async () => {
            const ts = new Date().getTime();
            const user = req.body.user;
            const comment = req.body.comment;
            const session_id = req.body.session;
            const temporary_id = req.body.temporary_id;
            const data: CommentTyp = await model.post_comment(user, session_id, ts, comment, "", "", "self");
            res.json({ ok: true, data });
            io.emit("message", _.extend({}, { __type: "new_comment", temporary_id }, data));
        });
    })().catch(() => {
        res.json({ ok: false, error: "DB error." })
    });
});

app.get('/api/files', (req, res) => {
    model.get_user_file_list().then((files) => {
        res.json({ ok: true, files: files });
    });
});

app.post('/api/files', (req, res) => {
    upload(req, res, function (err) {
        console.log('/api/files', err, req.file);
        if (!err) {
            model.save_user_file(req.decoded.user_id, req.file.path).then(({ file_id }) => {
                const file = {
                    path: '/' + req.file.path,
                    file_id,
                }
                res.json({ ok: true, files: [file] });
            });
        } else {
            res.json({ ok: false });
        }
    });
});

http.listen(port, () => {
    console.log("server is running at port " + port);
})

io.on('connection', function (socket) {
    console.log('A user connected');
    socket.on('subscribe', ({ token }) => {
        console.log('subscribe');
        jwt.verify(token, credential.jwt_secret, function (err, decoded) {
            if (decoded) {
                const user_id = decoded.username;
                model.saveSocketId(user_id, socket.id).then((r) => {
                    console.log('saveSocketId', r)
                    console.log('socket id', user_id, socket.id);
                });
            }
        });
    });
});

function clientErrorHandler(err, req, res, next) {
    if (req.xhr) {
        res.status(500).send({ error: 'Something failed!' })
    } else {
        next(err)
    }
}

app.use(clientErrorHandler);
