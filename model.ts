import RoomInfo from 'defs';
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

    const get_sent_mail = (q) => {
        return new Promise((resolve) => {
            fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/sent_gmail_list.json'), 'utf8', (err, data) => {
                const list = JSON.parse(data);
                const res = _.filter(list, (a) => { return a.to.indexOf(q) != -1; });
                resolve(res);
            });
        });
    };

    const get_mail_from = (q) => {
        return new Promise((resolve) => {
            fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
                const list = JSON.parse(data);
                const res = _.filter(list, (a) => { return a.to && (a.to.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.to.indexOf("kai@tohoku.ac.jp") != -1 || a.to.indexOf("hk.biomems@gmail.com") != -1) && a.from && a.from.indexOf(q) != -1; });
                resolve(res);
            });
        });
    };

    const get_mail_to = (q) => {
        return new Promise((resolve) => {
            fs.readFile(path.join(process.env.HOME, 'repos/gmail-import/all_mail_summary.json'), 'utf8', (err, data) => {
                const list = JSON.parse(data);
                const res = _.filter(list, (a) => { return a.from && (a.from.indexOf("kai@biomems.mech.tohoku.ac.jp") != -1 || a.from.indexOf("kai@tohoku.ac.jp") != -1 || a.from.indexOf("hk.biomems@gmail.com") != -1) && a.to && a.to.indexOf(q) != -1; });
                resolve(res);
            });
        });
    };

    const create_new_session = (name, members) => {
        return new Promise((resolve) => {
            const ts = new Date().getTime();
            const session_id = shortid();
            db.serialize(() => {
                db.run('insert into sessions (id, name, timestamp) values (?,?,?);', session_id, name, ts);
                _.each(members, (member) => {
                    db.run('insert into session_members (session_id, member_name) values (?,?);', session_id, member);
                });
                resolve({ id: session_id, name: name, timestamp: ts });
            });
        });
    };

    function get_session_info(session_id: string): Promise<RoomInfo> {
        console.log('get_session_info', session_id);
        return new Promise((resolve) => {
            // const ts = new Date().getTime();
            db.serialize(() => {
                db.get('select * from sessions where id=?;', session_id, (err, session) => {
                    db.all('select * from session_members where session_id=?', session_id, (err, r2) => {
                        const members = _.map(r2, 'member_name');
                        const numMessages = 0;
                        const firstMsgTime = "";
                        const lastMsgTime = "";
                        const id = session_id;
                        resolve({ name: <string>session.name, timestamp: <number>session.timestamp, members, numMessages, firstMsgTime, lastMsgTime, id });
                    })
                });
            });
        });
    };

    const get_session_list = function ({ of_members, is_all }): Promise<RoomInfo[]> {
        if (of_members) {
            return get_session_of_members(of_members, is_all);
        }
        return new Promise((resolve) => {
            db.serialize(() => {
                db.all('select s.id,s.name,s.timestamp,group_concat(distinct m.member_name) as members,count(c.timestamp) from sessions as s join session_members as m on s.id=m.session_id join comments as c on s.id=c.session_id group by s.id order by s.timestamp desc;', (err, sessions) => {
                    const ss: RoomInfo[] = _.map(sessions, (s) => {
                        console.log(s);
                        return {
                            id: s.id, name: s.name, timestamp: s.timestamp, members: s.members.split(","),
                            numMessages: s['count(c.timestamp)'], firstMsgTime: "", lastMsgTime: ""
                        };
                    });
                    console.log(ss);
                    resolve(ss);
                });
            });
        });
    };

    const get_session_of_members = (members, is_all): Promise<RoomInfo[]> => {
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
                        numMessages: s['count(timestamp)'], firstMsgTime: "", lastMsgTime: "", members: session.members.split(",")
                    };
                    return r;
                }));
            });
        });
    };

    const get_comments_list = ({ session_id, user_id }) => {
        const processRow = (row) => {
            const text = row.comment.replace(/(:.+?:)/g, function (m, $1) {
                const r = emoji_dict[$1];
                return r ? r.emoji : $1;
            });
            return { text, ts: row.timestamp, user: row.user_id, original_url: row.url_original, sent_to: row.sent_to };
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

    module.exports = {
        get_sent_mail,
        get_mail_from,
        get_mail_to,
        create_new_session,
        get_session_info,
        get_session_list,
        get_comments_list
    };

}