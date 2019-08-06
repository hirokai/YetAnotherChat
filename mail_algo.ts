
const shortid_ = require('shortid');
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

import * as _ from 'lodash';
const moment = require('moment');
moment.locale('ja');
import * as model from './model';
import * as user_info from './private/user_info';


// https://stackoverflow.com/questions/21900713/finding-all-connected-components-of-an-undirected-graph

// Breadth First Search function
// v is the source vertex
// all_pairs is the input array, which contains length 2 arrays
// visited is a dictionary for keeping track of whether a node is visited
const bfs = function (v, all_pairs, visited) {
    var q = [];
    var current_group = [];
    var i, nextVertex, pair;
    var length_all_pairs = all_pairs.length;
    q.push(v);
    while (q.length > 0) {
        v = q.shift();
        if (!visited[v]) {
            visited[v] = true;
            current_group.push(v);
            // go through the input array to find vertices that are
            // directly adjacent to the current vertex, and put them
            // onto the queue
            for (i = 0; i < length_all_pairs; i += 1) {
                pair = all_pairs[i];
                if (pair[0] === v && !visited[pair[1]]) {
                    q.push(pair[1]);
                } else if (pair[1] === v && !visited[pair[0]]) {
                    q.push(pair[0]);
                }
            }
        }
    }
    // return everything in the current "group"
    return current_group;
};


export function find_groups(pairs: string[][]): string[][] {
    var groups = [];
    var i, k, length, u, v, src, current_pair;
    var visited = {};

    // main loop - find any unvisited vertex from the input array and
    // treat it as the source, then perform a breadth first search from
    // it. All vertices visited from this search belong to the same group
    for (i = 0, length = pairs.length; i < length; i += 1) {
        current_pair = pairs[i];
        u = current_pair[0];
        v = current_pair[1];
        src = null;
        if (!visited[u]) {
            src = u;
        } else if (!visited[v]) {
            src = v;
        }
        if (src) {
            // there is an unvisited vertex in this pair.
            // perform a breadth first search, and push the resulting
            // group onto the list of all groups
            groups.push(bfs(src, pairs, visited));
        }
    }
    return groups;
}


export function group_email_sessions(threads: MailgunParsed[][]): MailGroup[] {
    const emails: MailgunParsed[] = _.compact(_.map(threads, (thread) => {
        return thread[0];
    }));

    //Mapping from message-id to array of (possibly split) emails
    const data_dict: { [index: string]: MailgunParsed[]; } = _.groupBy(_.flatten(threads), (d: MailgunParsed) => { return d.message_id });

    // console.log('emails', emails);

    const pairs = _.flatten(_.map(emails, (d: MailgunParsed) => {
        const id = d.body['Message-Id'];
        const refs = d.references.length == 0 ? [id] : d.references; //Connect to self if isolated.
        return _.map(refs, (r) => [r, id]);
    }));

    //Grouping represented by arrays of arrays of message-id.
    const groups_of_emails: string[][] = find_groups(pairs);

    //Mapping from message-id to session_id
    var id_mapping: { [key: string]: string } = {};
    //Mapping from session_id to session name
    var name_mapping: { [key: string]: string } = {};

    return _.map(groups_of_emails, (group: string[]) => {
        const session_id = shortid.generate();
        // console.log(data_dict[g[0]], g[0])
        name_mapping[session_id] = (data_dict[group[0]] || [{}])[0]['subject'] || "Email thread";
        _.map(group, (message_id) => {
            id_mapping[message_id] = session_id;
        });
        return {
            session_id, session_name: name_mapping[session_id], data: _.compact(_.flatMap(group, (mid) => {
                return data_dict[mid];
            }))
        };
    });

}

export function find_email_session(db: any, data: MailgunParsed): Promise<string> {
    const ps: Promise<string>[] = _.map(data.references, (r) => {
        return new Promise<string>((resolve) => {
            db.get("select session_id from comments where url_original=?", r, (err, row) => {
                // console.log('find_email_session', r, err, row);
                if (row && row['session_id']) {
                    resolve(row['session_id']);
                } else {
                    resolve(null)
                }
            });
        });
    });
    return Promise.all(ps).then((results: string[]) => {
        const session_id = _.compact(results)[0];
        return session_id;
    })
}


export function split_replies(txt: string): MailThreadItem[] {
    var replies: MailThreadItem[] = [];
    var head_txt: string = '';
    var reply_indent: number = 0;
    var reply_indent_prev: number = 0;
    var reply_depth: number = 0;
    var content_lines: string[] = [];
    var head_txt: string = '';
    var head_txt_prev: string = '';
    var line_prev: string = '';
    var header_reading: boolean = false;
    if (!txt) {
        return null;
    }
    txt.split('\r\n').forEach((line: string) => {
        if (header_reading) {
            // console.log('header');
            head_txt += line + '\r\n';
            if (line.replace(/>/g, '').trim() == '') {
                header_reading = false;
                reply_depth += 1;
                const { from, timestamp } = parseHead(head_txt_prev);
                console.log('parseHead', { from, timestamp })
                const comment = _.map(_.dropRight(content_lines), (l: string) => {
                    return removeQuoteMarks(l, reply_indent_prev);
                }).join('\r\n');
                content_lines = [];
                replies.push({ from, timestamp, comment });
                head_txt_prev = head_txt;
                head_txt = '';
            }
        } else {
            const m = line.replace(/\s/g, '').match(/^>+/);
            if (m) {
                reply_indent = Math.max(reply_indent, m[0].length);
            }
            if (reply_indent > reply_indent_prev) {
                reply_depth += 1;
                const { from, timestamp } = parseHead(head_txt_prev);
                const comment = _.map(_.dropRight(content_lines), (l: string) => {
                    return removeQuoteMarks(l, reply_indent_prev);
                }).join('\r\n');
                replies.push({ from, timestamp, comment });
                head_txt_prev = line_prev;
                content_lines = [];
                reply_indent_prev = reply_indent;
            } else if (line.match(/--+ ?Forwarded message ?--+/i) || line.match(/--+ ?Original Message ?--+/i)) {
                header_reading = true;
            } else {
                content_lines.push(line);
            }
        }
        line_prev = line;
        // console.log(reply_depth, reply_indent, line);
    });
    if (reply_depth > 0) {
        const { from, timestamp } = parseHead(head_txt_prev);
        const comment = _.map(content_lines, (l: string) => {
            return removeQuoteMarks(l, reply_indent_prev);
        }).join('\r\n');
        replies.push({ from, timestamp, comment });
        return replies;
    } else {
        return [{ from: '', timestamp: -1, comment: txt }];
    }
}

export function removeQuoteMarks(s: string, indent: number) {
    return s.replace(new RegExp('^(> ?){' + indent + '}'), '')
}

export function parseHead(s: string): { from: string, timestamp: number } {
    if (s.indexOf('\r\n') != -1) {      //multi line.
        const m1 = s.match(/From: (.+?)\r\n/);
        const m2 = s.match(/Date: (.+?)\r\n/);
        const m3 = s.match(/Sent: (.+?)\r\n/);
        if (m1 && (m2 || m3)) {
            const timestamp = m2 ? moment(m2[1], 'YYYY年M月D日(dddd) HH:mm').valueOf() : moment(m3[1]).valueOf();
            return { from: m1[1], timestamp };
        }
    } else {
        const m1 = s.match(/.+年.+月.+日\(.+\) \d+:\d+/);
        const m2 = s.match(/On (\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{1,2}), (.+) wrote:/);
        if (m1) {
            const timestamp = moment(m1[0], 'YYYY年M月D日(dddd) HH:mm').valueOf();
            const from = s.replace(m1[0], '');
            return { from, timestamp };
        } else if (m2) {
            console.log('parseHead m2', m2[1]);
            const timestamp = new Date(m2[1]).getTime();
            const from = m2[2];
            return { from, timestamp };
        }
    }
    return { from: null, timestamp: null }
}

export function parse_email_address(s: string): { email: string, name: string } {
    if (!s) {
        return { email: null, name: null };
    }
    const ts = s.split('<');
    if (ts.length > 1) {
        const name = ts[0].trim().replace(/^"/, '').replace(/"$/, '');
        const email = ts[1].replace(/>:?\s*$/, '');
        return { name: name != '' ? name : null, email };
    } else {
        const name = s.trim().replace(/^["'<>\s]/g, '').replace(/["'<>\s]$/g, '');;
        const email = '';
        return { name, email };
    }
}

function test() {
    const pairs = [
        ["a2", "a5"],
        ["a3", "a6"],
        ["a4", "a5"],
        ["a7", "a9"]
    ];

    const groups = find_groups(pairs);
    console.log(groups);
}

// Make a mapping from parsed email to {id,name,email}.
export function mkUserTableFromEmails(emails: MailgunParsed[]): UserTableFromEmail {
    const users = _.groupBy(_.map(emails, (email: MailgunParsed) => {
        return parse_email_address(email.from);
    }), 'email');
    const s: UserTableFromEmail = _.mapValues(users, (us) => {
        return { id: shortid(), name: us[0].name, names: _.uniq(_.map(us, 'name')), email: us[0].email };
    })
    console.log(s);
    return s;
}


export function mk_user_name(fullname: string): string {
    if (fullname == null) {
        return null;
    } else {
        const ts: string[] = fullname.split(/\s+/g);
        const re = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/;
        if (ts[0].match(re)) {  //Japanese -> first chunk is surname.
            return ts[0];
        } else {
            var surname = _.find(ts, (t) => {
                return t.toUpperCase() == t && t.length > 1;
            });
            surname = surname ? surname : ts[ts.length - 1];
            return surname || fullname;
        }
    }
}


export async function update_db_on_mailgun_webhook(body: object, db, myio?: SocketIO.Server): Promise<{ added_users: { user_id: string, name: string, fullname: string, email: string }[] }> {
    const myself = await model.find_user_from_email(user_info.test_myself.email);
    if (myself == null) {
        return { added_users: [] };
    }

    const datas: MailgunParsed[] = model.parseMailgunWebhookThread(body);
    console.log('-------')
    console.log('Thread of ' + datas.length + ' emails.');
    if (datas.length == 0) {
        return;
    }
    var session_id = await find_email_session(db, datas[0]);
    if (session_id) {
        console.log('existing session', session_id);
    } else {
        const r = await model.create_new_session(datas[0].subject, []);
        session_id = r ? r.id : null;
        console.log('new session', session_id);
    }
    if (session_id == null) {
        console.log('Session ID was not obtained.');
        return;
    }
    var results: { user_id: string, name: string, fullname: string, email: string }[] = [];
    for (var i = 0; i < datas.length; i++) {
        const data: MailgunParsed = datas[0];
        const { name: fullname, email } = parse_email_address(data.from);
        const r = await find_or_make_user(db, fullname, email);
        if (r != null) {
            results.push(r);
            const r1: JoinSessionResponse = await model.join_session(session_id, r.user_id, data.timestamp);
            await model.join_session(session_id, myself.id, data.timestamp);
            console.log('update_db_on_mailgun_webhook', { session_id, user_id: r.user_id, fullname, email, 'data.from': data.from, r1 });
            const { ok, data: data1 } = await model.post_comment(r.user_id, session_id, data.timestamp, data.comment, data.message_id);
            if (ok) {
                const obj = _.extend({ __type: "new_comment" }, data1);
                if (myio) {
                    myio.emit("message", obj);
                }
            }
        }
    }
    return { added_users: results };
}


async function find_or_make_user(db, fullname: string, email: string): Promise<{ user_id: string, name: string, fullname: string, email: string }> {
    // const v = Math.random();
    // console.log(v);
    const name = mk_user_name(fullname);
    const user = await model.find_user_from_email(email);
    if (user != null) {
        var user_id = user.id;
    } else {
        // console.log(v);
        var { ok, user_id } = await model.register_user(name, "", email, fullname);
        // console.log(v);
    }
    return ok ? { user_id, name, fullname, email } : null;
}
