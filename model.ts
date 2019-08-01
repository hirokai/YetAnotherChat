/// <reference path="./types.d.ts" />

const user_info_private = require('./private/user_info');

{
    const fs = require("fs");
    const path = require('path');
    const _ = require('lodash');
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(path.join(__dirname, './private/db.sqlite3'));
    // const ulid = require('ulid').ulid;
    const shortid = require('shortid').generate;

    const emojis = require("./emojis.json").emojis;
    const emoji_dict = _.keyBy(emojis, 'shortname');
    const mail_algo = require('./mail_algo');

    function post_comment(user_id: string, session_id: string, ts: number, comment: string, original_url?: string) {
        return new Promise((resolve, reject) => {
            const comment_id = shortid.generate();
            db.run('insert into comments (id,user_id,comment,timestamp,session_id,url_original) values (?,?,?,?,?,?);', comment_id, user_id, comment, ts, session_id, original_url, (err1) => {
                db.run('insert or ignore into session_members (session_id,member_name) values (?,?)', session_id, user_id, (err2) => {
                    if (!err1 && !err2) {
                        resolve(comment_id);
                    } else {
                        reject([err1, err2]);
                    }
                });
            });
        });
    }

    function get_sent_mail(q: string): Promise<any[]> {
        return new Promise((resolve) => {
            fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/sent_gmail_list.json'), 'utf8', (err, data) => {
                const list = JSON.parse(data);
                const res = _.filter(list, (a) => { return a.to.indexOf(q) != -1; });
                resolve(res);
            });
        });
    };

    function get_mail_from(q: string): Promise<any[]> {
        return new Promise((resolve) => {
            fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
                const list = JSON.parse(data);
                const res = _.filter(list, (a) => { return a.to && (a.to.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.to.indexOf("kai@tohoku.ac.jp") != -1 || a.to.indexOf("hk.biomems@gmail.com") != -1) && a.from && a.from.indexOf(q) != -1; });
                resolve(res);
            });
        });
    };

    function get_mail_to(q: string): Promise<any[]> {
        return new Promise((resolve) => {
            fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
                const list = JSON.parse(data);
                const res = _.filter(list, (a) => { return a.from && (a.from.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.from.indexOf("kai@tohoku.ac.jp") != -1 || a.from.indexOf("hk.biomems@gmail.com") != -1) && a.to && a.to.indexOf(q) != -1; });
                resolve(res);
            });
        });
    };

    function create_new_session(name: string, members: string[]): Promise<{ id: string, name: string, timestamp: number }> {
        const session_id = shortid();
        return create_session_with_id(session_id, name, members);
    }


    function create_session_with_id(session_id: string, name: string, members: string[]): Promise<{ id: string, name: string, timestamp: number }> {
        return new Promise((resolve) => {
            const ts = new Date().getTime();
            db.serialize(() => {
                db.run('insert or ignore into sessions (id, name, timestamp) values (?,?,?);', session_id, name, ts);
                _.each(members, (member) => {
                    db.run('insert or ignore into session_members (session_id, member_name) values (?,?);', session_id, member);
                });
                resolve({ id: session_id, name: name, timestamp: ts });
            });
        });
    }

    function get_session_info(session_id: string): Promise<RoomInfo> {
        console.log('get_session_info', session_id);
        return new Promise((resolve) => {
            // const ts = new Date().getTime();
            db.serialize(() => {
                db.get('select * from sessions where id=?;', session_id, (err, session) => {
                    db.all('select * from session_members where session_id=?', session_id, (err, r2) => {
                        const members = _.map(r2, 'member_name');
                        const numMessages: Map<string, number> = new Map<string, number>();
                        const firstMsgTime = -1;
                        const lastMsgTime = -1;
                        const id = session_id;
                        resolve({ name: <string>session.name, timestamp: <number>session.timestamp, members, numMessages, firstMsgTime, lastMsgTime, id });
                    })
                });
            });
        });
    };

    const get_session_list = function (params): Promise<RoomInfo[]> {
        const { of_members, is_all } = params;
        console.log('get_session_list():', params);
        if (of_members) {
            return get_session_of_members(of_members, is_all);
        }
        return new Promise((resolve) => {
            db.serialize(() => {
                db.all('select s.id,s.name,s.timestamp,group_concat(distinct m.member_name) as members from sessions as s join session_members as m on s.id=m.session_id group by s.id order by s.timestamp desc;', (err, sessions) => {
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
                        const ss: RoomInfo[] = _.map(_.zip(sessions, infos), ([s, info]) => {
                            return {
                                id: s.id, name: s.name, timestamp: s.timestamp, members: s.members.split(","),
                                numMessages: info.count, firstMsgTime: info.first, lastMsgTime: info.last
                            };
                        });
                        resolve(ss);
                    })
                });
            });
        });
    };

    const get_session_of_members = (members: string[], is_all: boolean): Promise<RoomInfo[]> => {
        var s = _.sortBy(members).join(",");
        if (!is_all) {
            s = '%' + s + '%';
        }
        return new Promise((resolve) => {
            // https://stackoverflow.com/questions/1897352/sqlite-group-concat-ordering
            const q = "select id,name,timestamp,group_concat(member_name) as members from (select s.id,s.name,s.timestamp,m.member_name from sessions as s join session_members as m on s.id=m.session_id order by s.timestamp,m.member_name) group by id having members like ? order by timestamp desc;"
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

    const get_comments_list = (session_id: string, user_id: string): Promise<CommentTyp[]> => {
        const processRow = (row): CommentTyp => {
            const comment = row.comment.replace(/(:.+?:)/g, function (m, $1) {
                const r = emoji_dict[$1];
                return r ? r.emoji : $1;
            });
            return { id: row.id, comment, timestamp: parseInt(row.timestamp), user_id: row.user_id, original_url: row.url_original, sent_to: row.sent_to, session_id: row.session_id };
        };
        return new Promise((resolve) => {
            if (session_id && !user_id) {
                db.serialize(() => {
                    db.all('select * from comments where session_id=? order by timestamp;', session_id, (err, rows) => {
                        resolve(_.map(rows, processRow));
                    });
                });
            } else if (!session_id && user_id) {
                db.serialize(() => {
                    db.all('select * from comments where user_id=? order by timestamp;', user_id, (err, rows) => {
                        resolve(_.map(rows, processRow));
                    });
                });
            } else if (session_id && user_id) {
                db.serialize(() => {
                    db.all('select * from comments where session_id=? and user_id=? order by timestamp;', session_id, user_id, (err, rows) => {
                        resolve(_.map(rows, processRow));
                    });
                });
            } else {
                db.all('select * from comments order by timestamp;', (err, rows) => {
                    resolve(_.map(rows, processRow));
                });
            }
        });
    };

    function parseMailgunWebhook(body): MailgunParsed {
        const timestamp = new Date(body['Date']).getTime();
        const comment = body['stripped-text'];
        const message_id = body['Message-Id'];
        const user_id = user_info_private.find_user(body['From']);
        const sent_to = body['To'];
        const id = shortid.generate();
        const data = {
            id,
            user_id,
            message_id,
            timestamp,
            comment,
            sent_to,
            body
        };
        return data;
    }

    function find_email_sessions(data: MailgunParsed[]): string[][] {
        const pairs = _.flatten(_.map(data, (d) => {
            const s = d.body['References'];
            const id = d.body['Message-Id'];
            const refs = s ? s.split(/\s+/) : [id]; // Connect to self if isolated.
            return _.map(refs, (r) => [r, id]);
        }));
        const groups = mail_algo.find_groups(pairs);
        var id_mapping = {};
        console.log('groups', groups);
        _.map(groups, (g) => {
            const session_id = shortid.generate();
            _.map(g, (m) => {
                console.log(m);
                id_mapping[m] = session_id;
            });
        });
        const all_ids = _.map(data, (d) => {
            return [id_mapping[d.message_id], "Email thread"];
        })
        return all_ids;
    }

    module.exports = {
        get_sent_mail,
        get_mail_from,
        get_mail_to,
        create_new_session,
        get_session_info,
        get_session_list,
        get_comments_list,
        post_comment,
        parseMailgunWebhook,
        find_email_sessions,
        create_session_with_id
    };

}