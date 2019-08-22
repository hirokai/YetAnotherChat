/// <reference path="../common/types.d.ts" />

import * as fs from "fs";
const path = require('path');
import { map, filter, includes, orderBy, groupBy, keyBy, min, max, chain, compact, zip, sum, values, sortedUniq, sortBy, difference } from 'lodash';

import { fingerPrint } from '../common/common_model';

const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(path.join(__dirname, './private/db.sqlite3'));
// const ulid = require('ulid').ulid;
const shortid_ = require('shortid');
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;
import * as mail_algo from './mail_algo';

const emojis = require("./emojis.json").emojis;
const emoji_dict = keyBy(emojis, 'shortname');

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

export function merge_users(db, users: UserSubset[]) {
    const merge_to_user: UserSubset = orderBy(users, (u) => {
        return (u.fullname ? 100 : 0) + (u.username ? 50 : 0);
    }, 'desc')[0];

    console.log('Merging to', merge_to_user);
    if (merge_to_user == null) {
        return;
    } else {
        const new_id = merge_to_user.id;
        db.serialize(() => {
            map(map(users, (u: UserSubset): string => { return u.id; }), (old_id: string) => {
                if (old_id != new_id) {
                    db.run('update comments set user_id=? where user_id=?', new_id, old_id);

                    db.get('select * from session_current_members where user_id');

                    db.all("select session_id,group_concat(user_id) as uids,count(user_id) as uid_count from session_current_members where user_id in (?,?) group by session_id having uid_count > 1;",
                        new_id, old_id, (err, rows) => {
                            if (rows) {
                                const session_ids: string[] = map(rows, 'session_id');
                                console.log('Removing (sessions,user)', session_ids, old_id);
                                session_ids.forEach((sid) => {
                                    db.run('delete from session_current_members where session_id=? and user_id=?', sid, sid, old_id);
                                })
                            }
                        });
                    db.run('update session_current_members set user_id=? where user_id=?', new_id, old_id, (err) => {
                        if (err)
                            console.log('update session_current_members', new_id, old_id, err)
                    });
                    db.run('update session_events set user_id=? where user_id=?', new_id, old_id);
                    db.run('update user_connections set user_id=? where user_id=?', new_id, old_id);
                    db.run('delete from user_emails where user_id=?', old_id);
                    db.run('delete from users where id=?', old_id);
                }
            });
        });
    }
}

export function make_email_content(c: CommentTyp): string {
    return c.comment + '\r\n\r\n--------\r\n' + 'このメールに返信すると，COI SNS上で会話を続けられます。\r\n' + 'COI SNSでリアルタイムチャット： ' + 'https://coi-sns.com/main#/sessions/' + c.session_id;
}

export function get_sent_mail(q: string): Promise<any[]> {
    return new Promise((resolve) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/sent_gmail_list.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = filter(list, (a) => { return a.to.indexOf(q) != -1; });
            resolve(res);
        });
    });
}

export function get_mail_from(q: string): Promise<any[]> {
    return new Promise((resolve) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = filter(list, (a) => { return a.to && (a.to.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.to.indexOf("kai@tohoku.ac.jp") != -1 || a.to.indexOf("hk.biomems@gmail.com") != -1) && a.from && a.from.indexOf(q) != -1; });
            resolve(res);
        });
    });
}

export function get_mail_to(q: string): Promise<any[]> {
    return new Promise((resolve) => {
        fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
            const list = JSON.parse(data);
            const res = filter(list, (a) => { return a.from && (a.from.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.from.indexOf("kai@tohoku.ac.jp") != -1 || a.from.indexOf("hk.biomems@gmail.com") != -1) && a.to && a.to.indexOf(q) != -1; });
            resolve(res);
        });
    });
}

export function create_new_session(name: string, members: string[]): Promise<RoomInfo> {
    const session_id = shortid();
    return create_session_with_id(session_id, name, members);
}


export function create_session_with_id(session_id: string, name: string, members: string[]): Promise<RoomInfo> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        db.serialize(() => {
            db.run('insert or ignore into sessions (id, name, timestamp) values (?,?,?);', session_id, cipher(name), timestamp);
            Promise.all(map(members, (m) => join_session({ session_id, user_id: m, timestamp, source: 'owner' }))).then(() => {
                get_session_info(session_id).then((roomInfo) => {
                    resolve(roomInfo);
                });
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
                    db.all('select * from session_current_members as m where session_id=? group by m.user_id', session_id, (err, r2) => {
                        const members = map(r2, (r2): string => { return r2['user_id'] });
                        const numMessages: { [key: string]: number } = {};
                        const firstMsgTime = -1;
                        const lastMsgTime = -1;
                        const id = session_id;
                        const obj: RoomInfo = { name: decipher(session.name), timestamp: session.timestamp, members, numMessages, firstMsgTime, lastMsgTime, id };
                        resolve(obj);
                    })

                }
            });
        });
    });
}

export async function delete_file({ user_id, file_id }): Promise<{ ok: boolean, data?: DeleteFileData }> {
    return new Promise((resolve) => {
        db.get('select path from files where id=? and user_id=?;', file_id, user_id, (err1, row1) => {
            db.run('delete from files where id=? and user_id=?;', file_id, user_id, (err) => {
                if (!err1 && !err) {
                    const data: DeleteFileData = { file_id, user_id };
                    const path = row1 ? row1['path'] : null;
                    if (path) {
                        fs.unlink(path, (err2) => {
                            if (!err2) {
                                resolve({ ok: true, data });
                            } else {
                                resolve({ ok: false });
                            }
                        });
                    } else {
                        resolve({ ok: false });
                    }
                } else {
                    resolve({ ok: false });
                }
            });
        });
    });
}

export function list_user_files(): Promise<{ [key: string]: { url: string } }> {
    return new Promise((resolve) => {
        db.all('select * from files;', (err, rows) => {
            //@ts-ignore
            const files: { [key: string]: { url: string } } = groupBy(map(rows || [], (row): { url: string } => {
                return row;
            }), 'user_id');
            resolve(files);
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

export function save_user_file(user_id: string, path: string, kind: string, session_id?: string): Promise<{ file_id: string, path: string }> {
    return new Promise((resolve, reject) => {
        const timestamp: number = new Date().getTime();
        const file_id = shortid();
        const abs_path = '/' + path;
        // resolve({ file_id: null, path: null });
        console.log('save_user_file 1');
        db.run('insert into files (id,user_id,path,timestamp,kind) values (?,?,?,?,?);', file_id, user_id, abs_path, timestamp, kind, (err) => {
            console.log('save_user_file 2');
            if (err) {
                console.log('save_user_file error', err);
                reject();
            } else if (session_id != null) {
                console.log('save_user_file 3');
                const comment_id = shortid();
                const comment = '<__file::' + file_id + '::' + path + '>';
                db.run('insert into comments (id,user_id,session_id,timestamp,comment) values (?,?,?,?,?)',
                    comment_id, user_id, session_id, timestamp, cipher(comment),
                    (err2) => {
                        if (!err && !err2) {
                            resolve({ file_id, path });
                        } else {
                            reject({ err, err2 });
                        }
                    }
                )
            } else {
                resolve({ file_id, path });
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
        if (null == file_id) {
            resolve({ ok: false })
        }
        const timestamp = new Date().getTime();
        get_user_file(file_id).then((r) => {
            if (r != null) {
                post_comment({ user_id, session_id, timestamp, comment: "<__file::" + file_id + "::" + r.url + ">", for_user: "", encrypt: 'none' }).then(() => {
                    resolve({ ok: true });
                });
            }
        });
    });
}

export function get_session_list(params: { user_id: string, of_members: string[], is_all: boolean }): Promise<RoomInfo[]> {
    const { user_id, of_members, is_all } = params;
    if (of_members) {
        return get_session_of_members(user_id, of_members, is_all);
    }
    return new Promise((resolve) => {
        db.serialize(() => {
            db.all(`
            select s.id,s.name,s.timestamp,group_concat(distinct m.user_id) as members from sessions as s
                join session_current_members as m on s.id=m.session_id
                group by s.id having members like ?
                order by s.timestamp desc;`, '%' + user_id + '%', (err, sessions) => {
                    Promise.all(map(sessions, (s) => {
                        return new Promise((resolve1) => {
                            db.all("select count(*),user_id,max(timestamp),min(timestamp) from comments where session_id=? group by user_id;", s.id, (err, users) => {
                                const first = min(map(users, 'min(timestamp)')) || -1;
                                const last = max(map(users, 'max(timestamp)')) || -1;
                                var count: { [key: string]: number } = chain(users).keyBy('user_id').mapValues((u) => {
                                    return u['count(*)'];
                                }).value();
                                const members: string[] = s.members.split(',')
                                map(members, (m) => {
                                    count[m] = count[m] || 0;
                                });
                                count['__total'] = sum(values(count)) || 0;
                                resolve1({ count, first, last });
                            });
                        });
                    })).then((infos: { count: { [key: string]: number }, first: number, last: number }[]) => {
                        const ss: RoomInfo[] = compact(map(zip(sessions, infos), ([s, info]) => {
                            const members = s['members'].split(",");
                            if (!includes(members, user_id)) {   //Double check if user_id is included.
                                return null;
                            }
                            const obj: RoomInfo = {
                                id: s['id'], name: decipher(s['name']) || '', timestamp: s['timestamp'], members,
                                numMessages: info.count, firstMsgTime: info.first, lastMsgTime: info.last
                            };
                            return obj;
                        }));
                        const ss_sorted = orderBy(ss, 'lastMsgTime', 'desc');
                        resolve(ss_sorted);
                    })
                });
        });
    });
}

export async function list_comment_delta({ for_user, session_id, cached_ids, last_updated }: { for_user: string, session_id: string, cached_ids: string[], last_updated: number }): Promise<CommentChange[]> {
    const comments = await list_comments(for_user, session_id, for_user);
    console.log('Comments length:', comments.length);
    return new Promise((resolve) => {
        const cached_id_dict = keyBy(cached_ids);
        var delta: CommentChange[] = [];
        if (comments.length == 0) {
            resolve([]);
        } else {
            comments.forEach((comment) => {
                const already = cached_id_dict[comment.id];
                if (!already) {
                    delta.push({ __type: 'new', comment });
                } else if (comment.timestamp > last_updated) {
                    delta.push({ __type: 'update', id: comment.id, comment });
                }
            });
            const current_ids = map(comments, 'id');
            const removed_ids = difference(cached_ids, current_ids);
            console.log('cached and current', for_user, cached_ids, current_ids)
            // removed_ids.forEach((id) => {
            //     delta.push({ __type: 'delete', id });
            // });
            resolve(delta);
        }
    });
}

export function get_session_of_members(user_id: string, members: string[], is_all: boolean): Promise<RoomInfo[]> {
    console.log('get_session_of_members');
    var s: string = sortedUniq(sortBy([user_id].concat(members))).join(",");
    if (!is_all) {
        s = '%' + s + '%';
    }
    return new Promise((resolve) => {
        // https://stackoverflow.com/questions/1897352/sqlite-group-concat-ordering
        const q = "select id,name,timestamp,group_concat(user_id) as members from (select s.id,s.name,s.timestamp,m.user_id from sessions as s join session_current_members as m on s.id=m.session_id order by s.timestamp,m.user_id) group by id having members like ? order by timestamp desc;"
        db.all(q, s, (err, sessions) => {
            const ss = map(sessions, (session) => {
                var r: RoomInfo = {
                    id: session.id, name: session.name, timestamp: session.timestamp,
                    numMessages: s['count(timestamp)'], firstMsgTime: -1, lastMsgTime: -1, members: session.members.split(",")
                };
                return r;
            });
            const ss_sorted = orderBy(ss, 'lastMsgTime', 'desc');
            resolve(ss_sorted);
        });
    });
}

export function list_comments(for_user: string, session_id: string, user_id: string, time_after?: number): Promise<ChatEntry[]> {
    const processRow = (row): ChatEntry => {
        const comment = row.comment.replace(/(:.+?:)/g, function (m, $1) {
            const r = emoji_dict[$1];
            return r ? r.emoji : $1;
        });
        // console.log('get_comments_list comment', comment);
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
                id: row['id'],
                encrypt: row['encrypt']
            };
        } else {
            return { id: row.id, comment, timestamp: parseInt(row.timestamp), user_id: row.user_id, original_url: row.original_url, sent_to: row.sent_to, session_id: row.session_id, source: row.source, kind: "comment", encrypt: row.encrypt }
        }
    };
    time_after = time_after ? time_after : -1;
    var func;
    if (session_id && !user_id) {
        func = (cb) => {
            db.all('select * from comments where session_id=? and for_user=? and timestamp>? order by timestamp;', session_id, for_user, time_after, cb);
        };
    } else if (!session_id && user_id) {
        func = (cb) => {
            db.all('select * from comments where user_id=? and for_user=? and timestamp>? order by timestamp;', user_id, for_user, time_after, cb);
        }
    } else if (session_id && user_id) {
        func = (cb) => {
            db.all('select * from comments where session_id=? and user_id=? and for_user=? and timestamp>? order by timestamp;', session_id, user_id, for_user, time_after, cb);
        }
    } else {
        func = (cb) => {
            db.all('select * from comments and for_user=? and timestamp>? order by timestamp;', for_user, time_after, cb);
        }
    }

    return new Promise((resolve) => {
        db.get('select id from sessions where id=?;', session_id, (err1, row1) => {
            if (row1 == null) {
                resolve(null);
            } else {
                func((err, rows) => {
                    if (session_id) {
                        db.all('select * from session_events where session_id=? and for_user=?;', session_id, user_id, (err, rows2) => {
                            const res1 = map(rows, processRow);
                            const res2 = map(rows2, (r) => {
                                r.kind = "event";
                                return r;
                            });
                            resolve(sortBy(res1.concat(res2), ['timestamp', (r) => {
                                return { 'event': 0, 'comment': 1 }[r.kind];
                            }]));
                        });
                    } else {
                        resolve(map(rows, processRow));
                    }
                });
            }
        });
    });

}

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
        lines: { start: 1, end: comment.split('\r\n').length },
        timestamp,
        comment,
        sent_to,
        body,
        references,
        subject,
        heading: ''
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
    return map(items, (item: MailThreadItem) => {
        const data = {
            id: shortid.generate(),
            from: item.from,
            message_id,
            lines: item.lines,
            timestamp: item.timestamp,
            comment: item.comment,
            sent_to,
            body,
            references,
            subject,
            heading: item.heading
        };
        return data;
    });
}

export async function get_private_key(user_id: string): Promise<{ ok: boolean, privateKey: JsonWebKey }> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        db.get('select * from private_key_temporary where user_id=?;', user_id, (err, row) => {
            resolve({ ok: !!row, privateKey: row ? JSON.parse(row['key']) : undefined });
        });
    });
}

export async function temporarily_store_private_key(user_id: string, key: JsonWebKey): Promise<boolean> {
    return new Promise((resolve) => {
        const key_str = JSON.stringify(key);
        const timestamp = new Date().getTime();
        db.run('insert into private_key_temporary (user_id,timestamp,key) values (?,?,?);', user_id, timestamp, key_str, (err) => {
            if (err) {
                db.run('update private_key_temporary set timestamp=?,key=? where user_id=?', timestamp, key_str, user_id, (err2) => {
                    resolve(err2 == null);
                });
            } else {
                resolve(true);
            }
        });
    });
}

export async function remove_old_temporary_private_key() {
    return new Promise((resolve) => {
        const threshold = new Date().getTime() - 1000 * 60 * 5; // 5 minutes
        db.run('delete from private_key_temporary where timestamp<?', threshold, (err) => {
            resolve(!err);
        });
    });
}

export function get_original_email_highlighted(mail_id: string): Promise<{ lines: { line: string, highlight: boolean }[], subject: string, range: { start: number, end: number } }> {
    return new Promise((resolve, reject) => {
        const m = mail_id.match(/(.+)::lines=(\d+)-(\d+)/);
        if (m) {
            const [message_id, start_s, end_s] = [m[1], m[2], m[3]];
            const [start, end] = [+start_s, +end_s];
            const file_path = path.join(__dirname, '../imported_data/mailgun/' + message_id + '.json');
            console.log(file_path);
            fs.readFile(file_path, 'utf8', (err, s: string) => {
                if (err) {
                    console.log(err);
                    reject();
                } else {
                    const obj = JSON.parse(s);
                    const subject = obj['Subject'];
                    const lines = map(<string[]>obj['body-plain'].split('\r\n'), (line, ii) => {
                        const i = ii + 1;
                        return { line, highlight: i >= start && i <= end };
                    });
                    resolve({ lines, subject, range: { start, end } });
                }
            });
        } else {
            reject('Mail url is wrong.');
        }
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

export function get_member_ids({ session_id, only_registered = true }: { session_id: string, only_registered?: boolean }): Promise<string[]> {
    return new Promise((resolve) => {
        if (only_registered) {
            db.all("select user_id from session_current_members where session_id=? and source<>'email_thread'", session_id, (err, rows) => {
                resolve(map(rows, 'user_id'));
            });
        } else {
            db.all('select user_id from session_current_members where session_id=?', session_id, (err, rows) => {
                resolve(map(rows, 'user_id'));
            });
        }
    });
}

export function get_members({ myself, session_id, only_registered = true }: { myself: string, session_id: string, only_registered?: boolean }): Promise<User[]> {
    return new Promise((resolve) => {
        get_member_ids({ session_id, only_registered }).then((ids) => {
            const ps = map(ids, (user_id: string) => {
                return get_user({ user_id, myself });
            });
            Promise.all(ps).then((users) => {
                resolve(users);
            })
        });
    });
}

export function join_session({ session_id, user_id, timestamp = -1, source }: { session_id: string, user_id: string, timestamp: number, source: string }): Promise<JoinSessionResponse> {
    console.log('join_session source', source, user_id);
    return new Promise((resolve, reject) => {
        if (!session_id || !user_id) {
            reject();
        }
        const ts: number = timestamp > 0 ? timestamp : new Date().getTime();
        const id: string = shortid();
        db.serialize(async () => {
            const is_registered_user = (await get_user({ user_id, myself: user_id })) != null;
            const members: string[] = await get_member_ids({ session_id });
            console.log(members);
            const is_member: boolean = includes(members, user_id);
            if (!is_registered_user) {
                resolve({ ok: false, error: 'User ID invalid' })
            } else if (is_member) {
                resolve({ ok: false, error: 'Already member' })
            } else {
                db.run('insert into session_events (id,session_id,user_id,timestamp,action) values (?,?,?,?,?);', id, session_id, user_id, ts, 'join', (err) => {
                    // console.log('model.join_session', err);
                    const data = { id, members };
                    if (!err) {
                        db.run('insert into session_current_members (session_id,user_id,source) values (?,?,?);',
                            session_id, user_id, source, (err2) => {
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
            }
        });
    });
}

export function getSocketIds(user_id: string): Promise<string[]> {
    return new Promise((resolve) => {
        db.all('select socket_id from user_connections where user_id=?;', user_id, (err, rows) => {
            resolve(map(rows, 'socket_id'));
        });
    });
}

export function saveSocketId(user_id: string, socket_id: string): Promise<{ ok: boolean, timestamp: number }> {
    return new Promise((resolve) => {
        const timestamp: number = new Date().getTime();
        db.run('insert into user_connections (socket_id,user_id, timestamp) values (?,?,?);', socket_id, user_id, timestamp, (err) => {
            const ok = !err;
            resolve({ ok: !err, timestamp: ok ? timestamp : null });
        });
    });
}

export async function list_online_users(): Promise<string[]> {
    return new Promise((resolve) => {
        db.all('select user_id from user_connections;', (err, rows) => {
            resolve(map(rows, 'user_id'));
        });
    });
}

export async function delete_connection(socket_id: string): Promise<{ user_id: string, online: boolean, timestamp: number }> {
    return new Promise((resolve) => {
        db.get('select user_id from user_connections where socket_id=?;', socket_id, (err, row) => {
            if (row) {
                const user_id = row['user_id'];
                const timestamp = new Date().getTime();
                db.run('delete from user_connections where socket_id=?;', socket_id, () => {
                    db.get('select count(*) from user_connections where user_id=?;', user_id, (err1, row1) => {
                        console.log('select count(*) from user_connections', user_id, err1, row1);
                        const online: boolean = !!(row1 && row1['count(*)'] > 0);
                        resolve({ user_id, online, timestamp });
                    });
                });
            } else {
                resolve({ user_id: null, online: false, timestamp: null });
            }
        });
    });
}

export async function delete_connection_of_user(user_id: string) {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        db.run('delete from user_connections where user_id=?;', user_id, () => {
            resolve({ timestamp });
        });
    });
}

export async function delete_all_connections(): Promise<boolean> {
    return new Promise((resolve) => {
        db.run('delete from user_connections;', (err) => {
            resolve(!err);
        });
    });
}

export async function register_user({ username, password, email, fullname, source, publicKey }: { username: string, password: string, email?: string, fullname?: string, source: string, publicKey: JsonWebKey }): Promise<{ ok: boolean, user?: User, error?: string, error_code?: number }> {
    const user_id = shortid();
    if (username && publicKey) {
        const existing_user: User = await find_user_from_username({ myself: user_id, username });
        if (existing_user) {
            return { ok: false, error_code: error_code.USER_EXISTS, error: 'User name already exists' }
        } else {
            bcrypt.hash(password, saltRounds, function (err, hash) {
                if (!err) {
                    db.serialize(() => {
                        const timestamp = new Date().getTime();
                        db.run('insert into users (id,name,password,fullname,timestamp,source) values (?,?,?,?,?,?)', user_id, username, hash, fullname, timestamp, source);
                        db.run('insert into user_emails (user_id,email) values (?,?)', user_id, email);
                        db.run('insert into public_keys (timestamp,user_id,for_user,key) values (?,?,?,?)', timestamp, user_id, user_id, JSON.stringify(publicKey));
                    });
                }
            });
            const emails = email ? [email] : [];
            const avatar = '';
            const user: User = { id: user_id, fullname, username, emails, avatar, online: false, publicKey }
            return { ok: true, user };
        }
    } else {
        return { ok: false, error: 'User name has to be specified' };
    }
}


export function cipher(plainText: string, password: string = credentials.cipher_secret) {
    try {
        var cipher = createCipher('aes192', password);
        var cipheredText = cipher.update(plainText, 'utf8', 'hex');
        cipheredText += cipher.final('hex');
        // console.log('ciphered length', cipheredText.length);
        return cipheredText;

    } catch (e) {
        console.log(e, plainText);
        return null;
    }
}

export function decipher(cipheredText: string, password: string = credentials.cipher_secret) {
    try {
        var decipher = createDecipher('aes192', password);
        var dec = decipher.update(cipheredText, 'hex', 'utf8');
        dec += decipher.final('utf8');
        // console.log('deciphered length', dec.length);
        return dec;
    } catch (e) {
        console.log(e, cipheredText);
        return null;
    }
}

export async function post_comment_for_session_members(user_id: string, session_id: string, timestamp: number, comments: { for_user: string; content: string; }[], encrypt: string): Promise<{ ok: boolean, data?: CommentTyp, error?: string }[]> {
    const encrypt_group = shortid();
    return Promise.all(map(comments, ({ for_user, content }) => {
        const comment_id = shortid();
        return post_comment({ comment_id, user_id, session_id, timestamp, comment: content, encrypt, for_user, source: "self", encrypt_group });
    }));
}

export function post_comment({ user_id, session_id, timestamp, comment, for_user, sent_to, original_url = "", source = "", encrypt = "none", comment_id, encrypt_group }: { user_id: string, session_id: string, timestamp: number, comment: string, for_user: string, original_url?: string, sent_to?: string, source?: string, encrypt: string, comment_id?: string, encrypt_group?: string }): Promise<{ ok: boolean, data?: CommentTyp, error?: string }> {
    console.log('post_comment start');
    comment_id = comment_id || shortid();
    return new Promise((resolve, reject) => {
        db.run('insert into comments (id,user_id,comment,for_user,encrypt,timestamp,session_id,original_url,sent_to,source,encrypt_group) values (?,?,?,?,?,?,?,?,?,?,?);', comment_id, user_id, comment, for_user, encrypt, timestamp, session_id, original_url, sent_to, source, encrypt_group, (err1) => {
            db.run('insert or ignore into session_current_members (session_id,user_id) values (?,?)', session_id, user_id, (err2) => {
                if (!err1 && !err2) {
                    const data: CommentTyp = {
                        id: comment_id, timestamp: timestamp, user_id, comment: comment, session_id, original_url, sent_to, source, kind: "comment", encrypt
                    };
                    resolve({ ok: true, data });
                } else {
                    console.log('post_comment error', err1, err2)
                    reject([err1, err2]);
                }
            });
        });
    });
}

export async function list_users(myself: string): Promise<User[]> {
    const rows: { [key: string]: any } = await new Promise((resolve, reject) => {
        db.all('select users.id,users.name,group_concat(distinct user_emails.email) as emails,users.fullname from users join user_emails on users.id=user_emails.user_id group by users.id;', (err, rows: object) => {
            if (err) {
                reject();
            } else {
                resolve(rows);
            }
        });
    });
    const online_users = list_online_users();
    const users = await Promise.all(map(rows, (row): Promise<User> => {
        return new Promise((resolve) => {
            const user_id = row['id'];
            get_public_key({ user_id, for_user: myself }).then((pk1) => {
                if (pk1) {
                    fingerPrint(pk1).then((fingerprint) => {
                        // console.log('model.list_users() publicKey', user_id, myself, pk1);
                        const obj: User = {
                            emails: row['emails'].split(','),
                            username: row['name'] || row['id'],
                            fullname: row['fullname'] || "",
                            id: user_id,
                            avatar: '',
                            publicKey: pk1,
                            online: includes(online_users, user_id),
                            fingerprint
                        }
                        resolve(obj);
                    });
                } else {
                    //ToDo: Currently default public key has for_user=user_id.
                    //But 1-to-1 communication better requires different public keys for every sent-to user.
                    get_public_key({ user_id, for_user: user_id }).then((pk2) => {
                        fingerPrint(pk2).then((fingerprint) => {

                            // console.log('model.list_users() publicKey', user_id, user_id, pk2);
                            const obj: User = {
                                emails: row['emails'].split(','),
                                username: row['name'] || row['id'],
                                fullname: row['fullname'] || "",
                                id: user_id,
                                avatar: '',
                                publicKey: pk2,
                                online: includes(online_users, user_id),
                                fingerprint
                            }
                            resolve(obj);
                        });
                    });
                }
            });
        });
    }));
    //@ts-ignore
    return users;
}

export function find_user_from_email({ myself, email }: { myself: string, email: string }): Promise<User> {
    return new Promise((resolve) => {
        if (!email || email.trim() == "") {
            resolve(null);
        } else {
            db.get('select users.id,users.name,users.fullname,group_concat(distinct user_emails.email) as emails from users join user_emails on users.id=user_emails.user_id group by users.id having emails like ?;', '%' + email + '%', (err, row) => {
                if (!err && row) {
                    const user_id = row['id']
                    get_public_key({ user_id, for_user: myself }).then((publicKey) => {
                        list_online_users().then((online_users) => {
                            const online: boolean = includes(online_users, user_id);
                            resolve({ username: row['name'], fullname: row['fullname'], id: user_id, emails: row['emails'], avatar: '', online, publicKey });
                        });
                    });
                } else {
                    resolve(null);
                }
            });
        }
    });
}

export function find_user_from_username({ myself, username }: { myself: string, username: string }): Promise<User> {
    return new Promise((resolve) => {
        db.get('select users.id,users.name,group_concat(distinct user_emails.email) as emails from users join user_emails on users.id=user_emails.user_id where users.name=? group by users.id;', username, (err, row) => {
            if (row) {
                console.log('find_user_from_username', row);
                const user_id = row['id']
                const emails = row['emails'].split(',');
                get_public_key({ user_id, for_user: myself }).then((publicKey) => {
                    list_online_users().then((online_users) => {
                        const online: boolean = includes(online_users, user_id);
                        resolve({ username: row['name'], id: user_id, emails, avatar: "", fullname: row['fullname'], online, publicKey });
                    });
                });
            } else {
                resolve(null);
            }
        });
    });
}

export function get_user({ myself, user_id }: { myself: string, user_id: string }): Promise<User> {
    return new Promise((resolve) => {
        db.get('select users.id,users.name,group_concat(distinct user_emails.email) as emails from users join user_emails on users.id=user_emails.user_id where users.id=? group by users.id;', user_id, (err, row) => {
            if (row) {
                const emails = row['emails'].split(',');
                get_public_key({ user_id, for_user: myself }).then((publicKey) => {
                    list_online_users().then((online_users) => {
                        const id = row['id']
                        const online: boolean = includes(online_users, id);
                        resolve({ username: row['name'], id, emails, avatar: "", fullname: row['fullname'], online, publicKey });
                    });
                });
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

export async function passwordMatch(myself: string, username: string, password: string): Promise<boolean> {
    const user = await find_user_from_username({ myself, username });
    if (user != null) {
        console.log('passwordMatch', user);
        const hash = await get_user_password_hash(user.id);
        console.log(hash, password, includes(user_info.allowed_passwords, password));
        if (!hash) {
            return includes(user_info.allowed_passwords, password);
        } else {
            const ok = await bcrypt.compare(password, hash);
            console.log('bcrypt compare', ok);
            return ok;
        }
    } else {
        return false;
    }
}

export async function update_public_key({ user_id, for_user, jwk }: { user_id: string, for_user: string, jwk: JsonWebKey }): Promise<{ ok: boolean, error?: string }> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        for_user = for_user != null ? for_user : '';
        console.log('update_public_key', { user_id, for_user, timestamp, jwk })
        if (user_id != null && jwk != null) {
            db.run('update public_keys set user_id=?, for_user=?, key=?, timestamp=? where user_id=? and for_user=?;', user_id, for_user, JSON.stringify(jwk), timestamp, user_id, for_user, (err) => {
                if (!err) {
                    console.log(user_id);
                    resolve({ ok: true });
                } else {
                    resolve({ ok: false, error: 'Update error: ' + err });
                }
            });
        } else {
            resolve({ ok: false, error: 'Params user_id or jwk is null' });
        }
    });
}

export async function register_public_key({ user_id, for_user, jwk }: { user_id: string, for_user: string, jwk: JsonWebKey }): Promise<boolean> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        for_user = for_user != null ? for_user : '';
        console.log('register_public_key', { user_id, for_user, jwk })
        if (user_id != null && jwk != null) {
            db.get('select count(*) from public_keys where user_id=? and for_user=?', user_id, for_user, (err, row) => {
                if (row['count(*)'] > 0) {
                    resolve(false);
                } else {
                    db.run('insert into public_keys (user_id,for_user,key,timestamp) values (?,?,?,?)', user_id, for_user, JSON.stringify(jwk), timestamp, (err) => {
                        if (!err) {
                            console.log(user_id);
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    });
                }
            });
        } else {
            resolve(false);
        }
    });
}

export async function get_public_key({ user_id, for_user }: { user_id: string, for_user: string }): Promise<JsonWebKey> {
    return new Promise((resolve) => {
        db.get('select * from public_keys where user_id=? and for_user=?', user_id, for_user, (err, row) => {
            if (!err && row) {
                resolve(JSON.parse(row['key']));
            } else {
                resolve(null);
            }
        });
    });
}
