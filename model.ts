/// <reference path="./types.d.ts" />

const fs = require("fs");
const path = require('path');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, './private/db.sqlite3'));
// const ulid = require('ulid').ulid;
const shortid_ = require('shortid');
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;
import * as mail_algo from './mail_algo';

const emojis = require("./emojis.json").emojis;
const emoji_dict = _.keyBy(emojis, 'shortname');

import * as user_info from './private/user_info';
import * as error_code from './error_codes';
import bcrypt from 'bcrypt';
const saltRounds = 10;
import * as credentials from './private/credential';
import { createCipher, createDecipher } from 'crypto';

export async function save_password(user_id: string, password: string): Promise<boolean> {
    const hash = await bcrypt.hash(password, saltRounds);
    const r = await new Promise<boolean>((resolve) => {
        db.run('update users set password=? where id=?', hash, user_id, (err) => {
            resolve(err == null);
        });
    });
    return r;
    // const res = await bcrypt.compare(password, hash);
    // return res;
}

export function merge_users(db, users: { user_id: string, name: string, fullname: string, email: string }[]) {
    const merge_to_user: { user_id: string, name: string, fullname: string, email: string } = _.orderBy(users, (u) => {
        return (u.fullname ? 100 : 0) + (u.name ? 50 : 0);
    }, 'desc')[0];

    console.log('Merging to', merge_to_user);
    if (merge_to_user == null) {
        return;
    } else {
        const new_id = merge_to_user.user_id;
        db.serialize(() => {
            _.map(_.map(users, 'user_id'), (uid: string) => {
                if (uid != new_id) {
                    db.run('update comments set user_id=? where user_id=?', new_id, uid);
                    db.run('update session_current_members set user_id=? where user_id=?', new_id, uid);
                    db.run('update session_events set user_id=? where user_id=?', new_id, uid);
                    db.run('update user_connections set user_id=? where user_id=?', new_id, uid);
                    db.run('delete from user_emails where user_id=?', uid);
                    db.run('delete from users where id=?', uid);
                }
            });
        });
    }
}

export function get_sent_mail(q: string): Promise<any[]> {
    return new Promise((resolve) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/sent_gmail_list.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = _.filter(list, (a) => { return a.to.indexOf(q) != -1; });
            resolve(res);
        });
    });
}

export function get_mail_from(q: string): Promise<any[]> {
    return new Promise((resolve) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = _.filter(list, (a) => { return a.to && (a.to.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.to.indexOf("kai@tohoku.ac.jp") != -1 || a.to.indexOf("hk.biomems@gmail.com") != -1) && a.from && a.from.indexOf(q) != -1; });
            resolve(res);
        });
    });
}

export function get_mail_to(q: string): Promise<any[]> {
    return new Promise((resolve) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = _.filter(list, (a) => { return a.from && (a.from.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.from.indexOf("kai@tohoku.ac.jp") != -1 || a.from.indexOf("hk.biomems@gmail.com") != -1) && a.to && a.to.indexOf(q) != -1; });
            resolve(res);
        });
    });
}

export function create_new_session(name: string, members: string[]): Promise<{ id: string, name: string, timestamp: number, members: string[] }> {
    const session_id = shortid();
    return create_session_with_id(session_id, name, members);
}


export function create_session_with_id(session_id: string, name: string, members: string[]): Promise<{ id: string, name: string, timestamp: number, members: string[] }> {
    return new Promise((resolve) => {
        const ts = new Date().getTime();
        db.serialize(() => {
            db.run('insert or ignore into sessions (id, name, timestamp) values (?,?,?);', session_id, cipher(name), ts);
            Promise.all(_.map(members, (m) => join_session(session_id, m))).then(() => {
                resolve({ id: session_id, name: cipher(name), timestamp: ts, members });
            });
        });
    });
}

export function get_session_info(session_id: string): Promise<RoomInfo> {
    console.log('get_session_info', session_id);
    return new Promise((resolve) => {
        // const ts = new Date().getTime();
        db.serialize(() => {
            db.get('select * from sessions where id=?;', session_id, (err, session) => {
                if (!session) {
                    resolve(null);
                } else {
                    db.all('select * from session_current_members where session_id=?', session_id, (err, r2) => {
                        const members = _.map(r2, 'user_id');
                        const numMessages: Map<string, number> = new Map<string, number>();
                        const firstMsgTime = -1;
                        const lastMsgTime = -1;
                        const id = session_id;
                        resolve({ name: decipher(session.name), timestamp: <number>session.timestamp, members, numMessages, firstMsgTime, lastMsgTime, id });
                    })

                }
            });
        });
    });
}

export function get_user_file(file_id: string): Promise<{ url: string }> {
    return new Promise((resolve) => {
        db.get('select path from files where id=?;', file_id, (err, row) => {
            const path = row ? row['path'] : null;
            resolve({ url: path });
        });
    });
}

export function get_user_file_list(): Promise<{ url: string }[]> {
    return new Promise((resolve) => {
        db.all('select * from files;', (err, rows) => {
            const files = _.groupBy(_.map(rows || [], (row) => {
                return row;
            }), 'user_id');
            resolve(files);
        });
    });
}

export function save_user_file(user_id: string, path: string, kind: string, session_id?: string): Promise<{ file_id: string, path: string }> {
    return new Promise((resolve) => {
        const timestamp: number = new Date().getTime();
        const file_id = shortid();
        const abs_path = '/' + path;
        db.run('insert into files (id,user_id,path,timestamp,kind) values (?,?,?,?);', file_id, user_id, abs_path, timestamp, kind, (err) => {
            if (session_id != null) {
                const comment_id = shortid();
                const comment = '<__file::' + file_id + '::' + path + '>';
                db.run('insert into comments (id,user_id,session_id,timestamp,comment) values (?,?,?,?,?)',
                    comment_id, user_id, session_id, timestamp, cipher(comment),
                    (err2) => {
                        if (!err && !err2) {
                            resolve({ file_id, path });
                        }
                    }
                )
            }
        });
    });
}

export function update_user_file(user_id: string, file_id: string, new_path: string): Promise<{ file_id: string, path: string }> {
    return new Promise((resolve) => {
        const timestamp: number = new Date().getTime();
        db.run('update files set path=?,timestamp=? where id=? and user_id=?;', new_path, timestamp, file_id, user_id, (err) => {
            if (!err) {
                resolve({ file_id, path });
            } else {
                resolve(null);
            }
        });
    });
}

export function post_file_to_session(session_id: string, user_id: string, file_id: string): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        get_user_file(file_id).then((r) => {
            if (r != null) {
                post_comment(user_id, session_id, timestamp, "<__file::" + file_id + "::" + r.url + ">").then(() => {
                    resolve({ ok: true });
                });
            }
        });
    });
}

export function get_session_list(params: { user_id: string, of_members: string[], is_all: boolean }): Promise<RoomInfo[]> {
    const { user_id, of_members, is_all } = params;
    // console.log('get_session_list():', params);
    if (of_members) {
        return get_session_of_members(user_id, of_members, is_all);
    }
    return new Promise((resolve) => {
        db.serialize(() => {
            db.all('select s.id,s.name,s.timestamp,group_concat(distinct m.user_id) as members from sessions as s join session_current_members as m on s.id=m.session_id group by s.id having members like ? order by s.timestamp desc;', '%' + user_id + '%', (err, sessions) => {
                Promise.all(_.map(sessions, (s) => {
                    return new Promise((resolve1) => {
                        db.all("select count(*),user_id,max(timestamp),min(timestamp) from comments where session_id=? group by user_id;", s.id, (err, users) => {
                            const first = _.min(_.map(users, 'min(timestamp)')) || -1;
                            const last = _.max(_.map(users, 'max(timestamp)')) || -1;
                            var count = _.chain(users).keyBy('user_id').mapValues((u) => {
                                return u['count(*)'];
                            }).value();
                            _.map(s.members.split(","), (m) => {
                                count[m] = count[m] || 0;
                            });
                            count['__total'] = _.sum(_.values(count)) || 0;
                            resolve1({ count, first, last });
                        });
                    });
                })).then((infos) => {
                    const ss: RoomInfo[] = _.compact(_.map(_.zip(sessions, infos), ([s, info]) => {
                        const members = s.members.split(",");
                        if (!_.includes(members, user_id)) {   //Double check if user_id is included.
                            return null;
                        }
                        return {
                            id: s.id, name: decipher(s.name) || '', timestamp: s.timestamp, members,
                            numMessages: info.count, firstMsgTime: info.first, lastMsgTime: info.last
                        };
                    }));
                    resolve(ss);
                })
            });
        });
    });
};

export function get_session_of_members(user_id: string, members: string[], is_all: boolean): Promise<RoomInfo[]> {
    var s: string = _.sortedUniq(_.sortBy([user_id].concat(members))).join(",");
    if (!is_all) {
        s = '%' + s + '%';
    }
    return new Promise((resolve) => {
        // https://stackoverflow.com/questions/1897352/sqlite-group-concat-ordering
        const q = "select id,name,timestamp,group_concat(user_id) as members from (select s.id,s.name,s.timestamp,m.user_id from sessions as s join session_current_members as m on s.id=m.session_id order by s.timestamp,m.user_id) group by id having members like ? order by timestamp desc;"
        db.all(q, s, (err, sessions) => {
            resolve(_.map(sessions, (session) => {
                var r: RoomInfo = {
                    id: session.id, name: session.name, timestamp: session.timestamp,
                    numMessages: s['count(timestamp)'], firstMsgTime: -1, lastMsgTime: -1, members: session.members.split(",")
                };
                return r;
            }));
        });
    });
};

export function get_comments_list(session_id: string, user_id: string): Promise<(CommentTyp | SessionEvent | ChatFile)[]> {
    const processRow = (row): CommentTyp | SessionEvent | ChatFile => {
        const comment_deciphered = decipher(row.comment, credentials.cipher_secret);
        const comment = comment_deciphered.replace(/(:.+?:)/g, function (m, $1) {
            const r = emoji_dict[$1];
            return r ? r.emoji : $1;
        });
        console.log('get_comments_list comment', comment);
        if (comment.slice(0, 9) == '<__file::') {
            const m = comment.match(/<__file::(.+?)::(.+)>/);
            const file_id = m[1] || "";
            return {
                url: m[2] || "",
                file_id: file_id,
                kind: "file",
                session_id,
                user_id: row['user_id'],
                timestamp: row['timestamp'],
                id: row['id']
            };
        } else {
            return { id: row.id, comment, timestamp: parseInt(row.timestamp), user_id: row.user_id, original_url: row.original_url, sent_to: row.sent_to, session_id: row.session_id, source: row.source, kind: "comment" }
        }
    };
    var func;
    if (session_id && !user_id) {
        func = (cb) => {
            db.all('select * from comments where session_id=? order by timestamp;', session_id, cb);
        };
    } else if (!session_id && user_id) {
        func = (cb) => {
            db.all('select * from comments where user_id=? order by timestamp;', user_id, cb);
        }
    } else if (session_id && user_id) {
        func = (cb) => {
            db.all('select * from comments where session_id=? and user_id=? order by timestamp;', session_id, user_id, cb);
        }
    } else {
        func = (cb) => {
            db.all('select * from comments order by timestamp;', cb);
        }
    }

    return new Promise((resolve) => {
        func((err, rows) => {
            if (session_id) {
                db.all('select * from session_events where session_id=?', session_id, (err, rows2) => {
                    const res1 = _.map(rows, processRow);
                    const res2 = _.map(rows2, (r) => {
                        r.kind = "event";
                        return r;
                    });
                    resolve(_.sortBy(res1.concat(res2), ['timestamp', (r) => {
                        return { 'event': 0, 'comment': 1 }[r.kind];
                    }]));
                });
            } else {
                resolve(_.map(rows, processRow));
            }
        });
    });

};

export function parseMailgunWebhook(body): MailgunParsed {
    const timestamp = new Date(body['Date']).getTime();
    const comment = body['stripped-text'];
    const message_id = body['Message-Id'];
    const from = body['From'];
    const sent_to = body['To'];
    const id = shortid.generate();
    const subject = body['Subject'];
    const s = body['References'];
    const references = s ? s.split(/\s+/) : [];
    const data = {
        id,
        from,
        message_id,
        timestamp,
        comment,
        sent_to,
        body,
        references,
        subject,
    };
    return data;
}

export function parseMailgunWebhookThread(body): MailgunParsed[] {
    const timestamp = new Date(body['Date']).getTime();
    const comment = body['body-plain'];
    const items: MailThreadItem[] = mail_algo.split_replies(comment);
    if (!items) {
        return [];
    }
    // console.log('parseMailgunWebhookThread: split', items.length);
    const message_id = body['Message-Id'];
    // const user = body['From'];
    // const user_id: string = user_info_private.find_user(body['From']);
    const from = body['From']
    const sent_to = body['To'];
    const subject = body['Subject'];
    const s = body['References'];
    const references = s ? s.split(/\s+/) : [];
    items[0].from = from;
    items[0].timestamp = timestamp;
    return _.map(items, (item: MailThreadItem) => {
        const data = {
            id: shortid.generate(),
            from: item.from,
            message_id,
            timestamp: item.timestamp,
            comment: item.comment,
            sent_to,
            body,
            references,
            subject,
        };
        return data;
    });
}

export function is_member(session_id: string, user_id: string): Promise<boolean> {
    return new Promise((resolve) => {
        db.get('select * from session_current_members where session_id=? and user_id=?', session_id, user_id, (err, row) => {
            console.log('model.is_member', err, row)
            resolve(!!row);
        });
    });
}

export function get_members(session_id: string): Promise<string[]> {
    return new Promise((resolve) => {
        db.all('select * from session_current_members where session_id=?', session_id, (err, rows) => {
            resolve(_.map(rows, 'user_id'));
        });
    });
}

export function join_session(session_id: string, user_id: string, timestamp: number = -1): Promise<JoinSessionResponse> {
    return new Promise((resolve, reject) => {
        if (!session_id || !user_id) {
            reject();
        }
        const ts: number = timestamp > 0 ? timestamp : new Date().getTime();
        const id: string = shortid();
        db.serialize(() => {
            db.run('insert into session_events (id,session_id,user_id,timestamp,action) values (?,?,?,?,?);', id, session_id, user_id, ts, 'join', (err) => {
                // console.log('model.join_session', err);
                const data = { id };
                if (!err) {
                    db.run('insert into session_current_members (session_id,user_id) values (?,?);',
                        session_id, user_id, (err2) => {
                            if (!err2) {
                                resolve({ ok: true, data });
                            } else {
                                resolve({ ok: false, data });
                            }
                        });
                } else {
                    console.log('error')
                    resolve({ ok: false })
                }
            });
        });
    });
}

export function getSocketIds(user_id: string): Promise<string[]> {
    return new Promise((resolve) => {
        db.all('select socket_id from user_connections where user_id=?;', user_id, (err, rows) => {
            resolve(_.map(rows, 'socket_id'));
        });
    });
}

export function saveSocketId(user_id: string, socket_id: string): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
        const ts: number = new Date().getTime();
        db.run('insert into user_connections (socket_id,user_id, timestamp) values (?,?,?);', socket_id, user_id, ts, (err) => {
            console.log('saveSocketId', err);
            resolve({ ok: !err });
        });
    });
}

export async function register_user(username: string, password: string, email?: string, fullname?: string): Promise<{ ok: boolean, user_id?: string, error?: string, error_code?: number }> {
    const user_id = shortid();
    if (username) {
        const existing_user: User = await find_user_from_username(username);
        if (existing_user) {
            return { ok: false, error_code: error_code.USER_EXISTS, error: 'User name already exists' }
        } else {
            bcrypt.hash(password, saltRounds, function (err, hash) {
                db.serialize(() => {
                    if (!err) {
                        const timestamp = new Date().getTime();
                        db.run('insert into users (id,name,password,fullname,timestamp) values (?,?,?,?,?)', user_id, username, hash, fullname, timestamp);
                        db.run('insert into user_emails (user_id,email) values (?,?)', user_id, email);
                    }
                });
            });
            return { ok: true, user_id: user_id, };
        }
    } else {
        return { ok: false, error: 'User name has to be specified' };
    }
}


export function cipher(plainText: string, password: string = credentials.cipher_secret) {
    var cipher = createCipher('aes192', password);
    var cipheredText = cipher.update(plainText, 'utf8', 'hex');
    cipheredText += cipher.final('hex');
    // console.log('ciphered length', cipheredText.length);
    return cipheredText;
}

export function decipher(cipheredText: string, password: string = credentials.cipher_secret) {
    try {
        var decipher = createDecipher('aes192', password);
        var dec = decipher.update(cipheredText, 'hex', 'utf8');
        dec += decipher.final('utf8');
        // console.log('deciphered length', dec.length);
        return dec;
    } catch (e) {
        console.log(e, cipheredText)
        return null;
    }
}


export function post_comment(user_id: string, session_id: string, ts: number, comment: string, original_url: string = "", sent_to: string = "", source = ""): Promise<{ ok: boolean, data?: CommentTyp, error?: string }> {
    return new Promise((resolve, reject) => {
        const comment_id = shortid.generate();
        db.run('insert into comments (id,user_id,comment,timestamp,session_id,original_url,sent_to,source) values (?,?,?,?,?,?,?,?);', comment_id, user_id, cipher(comment, credentials.cipher_secret), ts, session_id, original_url, sent_to, source, (err1) => {
            db.run('insert or ignore into session_current_members (session_id,user_id) values (?,?)', session_id, user_id, (err2) => {
                if (!err1 && !err2) {
                    const data: CommentTyp = {
                        id: comment_id, timestamp: ts, user_id, comment: comment, session_id, original_url, sent_to, source, kind: "comment"
                    };
                    resolve({ ok: true, data });
                } else {
                    reject([err1, err2]);
                }
            });
        });
    });
}

export function get_users(): Promise<User[]> {
    return new Promise((resolve, reject) => {
        db.all('select users.id,users.name,group_concat(distinct user_emails.email) as emails,users.fullname from users join user_emails on users.id=user_emails.user_id group by users.id;', (err, rows) => {
            if (err) {
                reject();
            } else {
                const users: User[] = _.map(rows, (row) => {
                    return {
                        emails: row['emails'].split(','),
                        username: row['name'] || row['id'],
                        fullname: row['fullname'] || "",
                        id: row['id'],
                        avatar: ''
                    };
                });
                resolve(users);
            }
        });
    });
}

export function find_user_from_email(email: string): Promise<User> {
    return new Promise((resolve, reject) => {
        if (!email || email.trim() == "") {
            resolve(null);
        } else {
            db.get('select users.id,users.name,users.fullname,group_concat(distinct user_emails.email) as emails from users join user_emails on users.id=user_emails.user_id group by users.id having emails like ?;', '%' + email + '%', (err, row) => {
                if (!err && row) {
                    resolve({ username: row['name'], fullname: row['fullname'], id: row['id'], emails: row['emails'], avatar: '' });
                } else {
                    resolve(null);
                }
            });

        }
    });
}

export function find_user_from_username(username: string): Promise<User> {
    return new Promise((resolve) => {
        db.get('select users.id,users.name,group_concat(distinct user_emails.email) as emails from users join user_emails on users.id=user_emails.user_id where users.name=? group by users.id;', username, (err, row) => {
            if (row) {
                const emails = row['emails'].split(',');
                resolve({ username: row['name'], id: row['id'], emails, avatar: "", fullname: row['fullname'] });
            } else {
                resolve(null);
            }
        });
    });
}

export function find_user_from_user_id(user_id: string): Promise<User> {
    return new Promise((resolve) => {
        console.log('find_user_from_user_id', user_id)
        db.get('select users.id,users.name,group_concat(distinct user_emails.email) as emails from users join user_emails on users.id=user_emails.user_id where users.id=? group by users.id;', user_id, (err, row) => {
            if (row) {
                const emails = row['emails'].split(',');
                resolve({ username: row['name'], id: row['id'], emails, avatar: "", fullname: row['fullname'] });
            } else {
                resolve(null);
            }

        });
    });
}

export function get_user_password_hash(user_id: string): Promise<string> {
    return new Promise((resolve) => {
        if (!user_id) {
            resolve(null);
        } else {
            db.get('select password from users where id=?', user_id, (err, row) => {
                resolve(row ? row['password'] : null);
            });
        }
    });
}

export async function passwordMatch(username: string, password: string): Promise<boolean> {
    const user = await find_user_from_username(username);
    if (user != null) {
        console.log('passwordMatch', user);
        const hash = await get_user_password_hash(user.id);
        console.log(hash, password, _.includes(user_info.allowed_passwords, password));
        if (!hash) {
            return _.includes(user_info.allowed_passwords, password);
        } else {
            const ok = await bcrypt.compare(password, hash);
            console.log('bcrypt compare', ok);
            return ok;
        }
    } else {
        return false;
    }
}
