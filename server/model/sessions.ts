/// <reference path="./types.d.ts" />

import { db, shortid, cipher, decipher, db_ } from './utils'
import * as users from './users'
import { get_public_key } from './keys'
import { fingerPrint } from '../../common/common_model'
import { map, includes, orderBy, keyBy, min, max, chain, compact, zip, sum, values, sortedUniq, sortBy } from 'lodash';
const emojis = require("./emojis.json").emojis;
const emoji_dict = keyBy(emojis, 'shortname');


export async function delete_session(id: string) {
    const err = await db_.run('delete from sessions where id=?;', id);
    const err2 = await db_.run('delete from comments where session_id=?;', id);
    const err3 = await db_.run('delete from session_current_members where session_id=?;', id);
    const err4 = await db_.run('delete from session_events where session_id=?;', id);
    return !err && !err2 && !err3 && !err4;
}

export async function get_members({ myself, session_id, only_registered = true }: { myself: string, session_id: string, only_registered?: boolean }): Promise<User[]> {
    const ids = await get_member_ids({ myself, session_id, only_registered });
    return compact(await Promise.all(map(ids, (user_id: string) => {
        return users.get(user_id);
    })));
}

export function is_member(session_id: string, user_id: string): Promise<boolean> {
    return new Promise((resolve) => {
        db.get('select * from session_current_members where session_id=? and user_id=?', session_id, user_id, (err, row) => {
            console.log('model.is_member', err, row)
            resolve(!!row);
        });
    });
}

export async function get_member_ids({ myself, session_id, only_registered = true }: { myself: string, session_id: string, only_registered?: boolean }): Promise<string[] | null> {
    if (only_registered) {
        const rows = await db_.all<{ user_id: string }>("select user_id from session_current_members where session_id=? and source<>'email_thread'", session_id);
        const ids = map(rows, 'user_id');
        if (!includes(ids, myself)) {  //The user is not a member.
            return null;
        } else {
            return ids;
        }
    } else {
        const rows = await db_.all<{ user_id: string }>('select user_id from session_current_members where session_id=?', session_id);
        const ids = map(rows, 'user_id');
        if (!includes(ids, myself)) {  //The user is not a member.
            return null;
        } else {
            return ids;
        }
    }
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

export function update({ session_id, name }: { session_id: string, name: string }): Promise<{ ok: boolean, timestamp?: number }> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        db.run('update sessions set name=? where id=?;', cipher(name), session_id, (err) => {
            if (!err) {
                resolve({ ok: false });
            } else {
                resolve({ ok: true, timestamp });
            }
        });
    });
}

export function list_comments(for_user: string, session_id?: string, user_id?: string, time_after?: number): Promise<ChatEntry[] | null> {
    const processRow = (row): ChatEntry => {
        console.log(row.comment);
        const comment = row.comment.replace(/(:.+?:)/g, function (m, $1) {
            const r = emoji_dict[$1];
            return r ? r.emoji : $1;
        });
        return { id: row.id, comment, timestamp: parseInt(row.timestamp), user_id: row.user_id, original_url: row.original_url, sent_to: row.sent_to, session_id: row.session_id, source: row.source, kind: "comment", encrypt: row.encrypt, fingerprint: { from: row['fingerprint_from'], to: row['fingerprint_to'] } };
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

export async function delete_comment(user_id: string, comment_id: string): Promise<{ ok: boolean, data?: DeleteCommentData, error?: string }> {
    const row = await db_.get('select * from comments where id=?;', comment_id);
    if (row) {
        const session_id = row['session_id'];
        const user_id_ = row['user_id'];
        if (user_id != user_id_) {
            return { ok: false, error: 'Cannot delete comments by other users' };
        }
        const encrypt_group = row['encrypt_group'];
        if (!encrypt_group) {
            return { ok: false, error: 'Encrypted data was not correctly saved.' }
        }
        const row2 = await db_.get('select * from comments where encrypt_group=?;', encrypt_group);
        if (!row2) {
            return { ok: false, error: 'Encrypted data was not correctly saved.' }
        }
        const err = await db_.run('delete from comments where encrypt_group=?;', encrypt_group);
        if (err) {
            return { ok: false, error: err };
        } else {
            const data: DeleteCommentData = { comment_id, encrypt_group, session_id };
            return { ok: true, data };
        }
    } else {
        return { ok: false, error: 'Comment ' + comment_id + ' does not belong to any session.' };
    }
}

export function get_session_list(params: { user_id: string, of_members: string[] | undefined, is_all: boolean }): Promise<RoomInfo[]> {
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
                            db.all("select count(*),user_id,max(timestamp),min(timestamp) from comments where session_id=? and for_user=? group by user_id;", s.id, user_id, (err, users) => {
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
                            if (!info) {
                                return null;
                            }
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

export function join({ session_id, user_id, timestamp = -1, source }: { session_id: string, user_id: string, timestamp: number, source: string }): Promise<JoinSessionResponse> {
    console.log('join_session source', source, user_id);
    return new Promise((resolve, reject) => {
        if (!session_id || !user_id) {
            reject();
        }
        const ts: number = timestamp > 0 ? timestamp : new Date().getTime();
        const id: string = shortid();
        db.serialize(async () => {
            const is_registered_user = (await users.get(user_id)) != null;
            const members: string[] | null = await get_member_ids({ myself: user_id, session_id });
            if (!members) {
                resolve({ ok: false, error: 'Not a member' });
                return;
            }
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

export async function post_comment(p: PostCommentModelParams): Promise<{ ok: boolean, for_user: string, data?: CommentTyp, error?: string }[]> {
    const encrypt_group = shortid();
    return Promise.all(map(p.comments, ({ for_user, content }) => {
        const comment_id = shortid();
        return post_comment_for_each(p.user_id, p.session_id, p.timestamp, encrypt_group, for_user, content, p.encrypt, p.source || "self", p.original_url, p.sent_to, p.comment_id);
    }));
}

async function post_comment_for_each(
    user_id: string,
    session_id: string,
    timestamp: number,
    encrypt_group: string,
    for_user: string,
    comment: string,
    encrypt: EncryptionMode,
    source: string,
    original_url?: string,
    sent_to?: string,
    comment_id?: string,
): Promise<{ ok: boolean, for_user: string, data?: CommentTyp, error?: string }> {
    console.log('post_comment start');
    comment_id = comment_id || shortid();
    // Currently key is same for all recipients.
    const from = await get_public_key(user_id);
    const to = await get_public_key(for_user);
    if (from && to) {
        const pub_from = from.publicKey;
        const pub_to = to.publicKey;
        const fp_from = await fingerPrint(pub_from);
        const fp_to = await fingerPrint(pub_to);
        // console.log('Posting with key: ' + fingerprint, publicKey, user_id, for_user);
        const err1 = await db_.run(`insert into comments (
                                    id,user_id,comment,for_user,encrypt,timestamp,session_id,original_url,sent_to,source,encrypt_group,fingerprint_from,fingerprint_to
                                    ) values (?,?,?,?,?,?,?,?,?,?,?,?,?);`, comment_id, user_id, comment, for_user, encrypt, timestamp, session_id, original_url, sent_to, source, encrypt_group, fp_from, fp_to);
        const err2 = await db_.run('insert or ignore into session_current_members (session_id,user_id) values (?,?)', session_id, user_id);
        if (!err1 && !err2) {
            const data: CommentTyp = {
                id: comment_id, timestamp: timestamp, user_id, comment: comment, session_id, original_url, sent_to, source: source, kind: "comment", encrypt,
                fingerprint: { from: fp_from, to: fp_to }
            };
            return { ok: true, for_user, data };
        } else {
            console.log('post_comment error', err1, err2)
            throw [err1, err2];
        }
    } else {
        return { ok: false, for_user, error: 'Public key is missing' };
    }
}

export async function create(name: string, members: string[]): Promise<RoomInfo> {
    const session_id = shortid();
    return create_session_with_id(session_id, name, members);
}

export async function create_session_with_id(session_id: string, name: string, members: string[]): Promise<RoomInfo> {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().getTime();
        db.run('insert or ignore into sessions (id, name, timestamp) values (?,?,?);', session_id, cipher(name), timestamp);
        Promise.all(map(members, (m) => join({ session_id, user_id: m, timestamp, source: 'owner' }))).then(() => {
            get(session_id).then((roomInfo) => {
                if (roomInfo) {
                    resolve(roomInfo);
                } else {
                    reject('Session ID not found');
                }
            });
        });
    });
}

export function get(session_id: string): Promise<RoomInfo | null> {
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
                        const obj: RoomInfo = { name: decipher(session.name) || "(decryption error)", timestamp: session.timestamp, members, numMessages, firstMsgTime, lastMsgTime, id };
                        resolve(obj);
                    })

                }
            });
        });
    });
}

