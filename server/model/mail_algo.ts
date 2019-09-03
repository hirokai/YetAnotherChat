
const shortid_ = require('shortid');
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

import * as fs from 'fs';
import * as _ from 'lodash';
import moment from 'moment';
moment.locale('ja');

import * as model from './index';
import * as user_info from '../private/user_info';
import * as email from './email'

// https://stackoverflow.com/questions/21900713/finding-all-connected-components-of-an-undirected-graph

// Breadth First Search function
// v is the source vertex
// all_pairs is the input array, which contains length 2 arrays
// visited is a dictionary for keeping track of whether a node is visited
const bfs = function (v0: string, all_pairs: string[][], visited: { [key: string]: boolean }): string[] {
    var q: string[] = [];
    var current_group: string[] = [];
    var i, nextVertex
    var pair: string[];
    var length_all_pairs = all_pairs.length;
    q.push(v0);
    while (q.length > 0) {
        const v = q.shift();
        if (v) {
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
    }
    // return everything in the current "group"
    return current_group;
};


export function find_groups(pairs: string[][]): string[][] {
    var groups: string[][] = [];
    var i, k, length;
    var u: string;
    var v: string;
    var src: string | null;
    var current_pair: string[];
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

export async function find_email_session(db: any, data: MailgunParsed): Promise<string> {
    const results = await Promise.all(_.map(data.references, async (r): Promise<string | null> => {
        const row = await new Promise<any>((resolve) => {
            db.get("select session_id from comments where url_original=?", r, (err, r) => {
                resolve(r);
            })
        });
        if (row && row['session_id']) {
            return row['session_id'];
        } else {
            return null;
        }
    }));
    const session_id = _.compact(results)[0];
    return session_id;
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
    var start: number = 0;
    var end: number = 0;
    var header_reading: boolean = false;
    const lines = txt.split('\r\n');
    lines.forEach((line: string, ii: number) => {
        const i = ii + 1;
        if (header_reading) {
            // console.log('header');
            head_txt += line + '\r\n';
            if (line.replace(/>/g, '').trim() == '') {
                header_reading = false;
                reply_depth += 1;
                const p = parseHead(reply_depth == 1 ? head_txt : head_txt_prev);
                if (p) {
                    const { from, timestamp } = p;
                    console.log('parseHead', { from, timestamp })
                    const comment = _.map(_.dropRight(content_lines), (l: string) => {
                        return remove_quote_marks(l, reply_indent_prev);
                    }).join('\r\n');
                    content_lines = [];
                    replies.push({ from, timestamp, comment, heading: head_txt_prev, lines: { start, end } });
                    head_txt_prev = head_txt;
                    head_txt = '';
                    start = i + 1;
                }
            }
        } else {
            const m0 = line_prev.trim().match(/----------/);
            const m0_1 = line.match(/^From: (.+)/);
            if (m0 && m0_1) {//Google style forwarded email
                header_reading = true;
                end = i - 1;
                head_txt += line + '\r\n';
            } else {
                const m = line.replace(/\s/g, '').match(/^>+/);
                if (m) {
                    reply_indent = Math.max(reply_indent, m[0].length);
                }
                if (reply_indent > reply_indent_prev) {
                    reply_depth += 1;
                    const p = parseHead(head_txt_prev);
                    if (p) {
                        const { from, timestamp } = p;
                        const comment = _.map(_.dropRight(content_lines), (l: string) => {
                            return remove_quote_marks(l, reply_indent_prev);
                        }).join('\r\n');
                        replies.push({ from, timestamp, comment, heading: head_txt_prev, lines: { start, end } });
                        head_txt_prev = line_prev;
                        content_lines = [];
                        reply_indent_prev = reply_indent;
                        start = i + 1;
                    }
                } else if (line.match(/--+ ?Forwarded message ?--+/i) || line.match(/--+ ?Original Message ?--+/i)) {
                    header_reading = true;
                    end = i - 1;
                } else {
                    content_lines.push(line);
                }
            }
        }
        if (line.replace(/>/g, '').trim() != '') {
            line_prev = line;
        }
        console.log(reply_depth, reply_indent, (header_reading ? '-' : ' '), line);
    });
    if (reply_depth > 0) {
        const p = parseHead(head_txt_prev);
        if (p) {
            const { from, timestamp } = p;
            const comment = _.map(content_lines, (l: string) => {
                return remove_quote_marks(l, reply_indent_prev);
            }).join('\r\n');
            replies.push({ from, timestamp, comment, heading: head_txt_prev, lines: { start, end } });
            return replies;
        }
        return replies;
    } else {
        return [{ from: '', timestamp: -1, comment: txt, heading: "", lines: { start: 1, end: lines.length } }];
    }
}

export function remove_quote_marks(s: string, indent: number) {
    return s.replace(new RegExp('^(> ?){' + indent + '}'), '')
}

export function parseHead(s: string): { from: string, timestamp: number } | null {
    if (s.indexOf('\r\n') != -1) {      //multi line.
        const m1 = s.match(/From: (.+?)\s*\r\n/);
        const m2 = s.match(/Date: (.+?)\s*\r\n/);
        const m3 = s.match(/Sent: (.+?)\s*\r\n/);
        console.log('parseHead multiline', ',', m1 ? m1[1] : null, ',', m2 ? m2[1] : null, ',', m3 ? m3[1] : null);
        if (m1 && (m2 || m3)) {
            const timestamp = m2 ? moment(m2[1], 'YYYY年M月D日(dddd) HH:mm').valueOf() : (m3 ? moment(m3[1]).valueOf() : -1);
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
    return null;
}

export function parse_email_address(s: string): { email: string, name?: string } {
    const ts = s.split('<');
    if (ts.length > 1) {
        const name = ts[0].trim().replace(/^"/, '').replace(/"$/, '');
        const email = ts[1].replace(/>:?\s*$/, '');
        return { name: name != '' ? name : undefined, email };
    } else {
        const m = s.match(/(.+)\[mailto:(.+)\]/);
        if (m) {
            return { name: m[1].trim(), email: m[2].trim() };
        } else {
            const name = s.trim().replace(/^["'<>\s]/g, '').replace(/["'<>\s]$/g, '');;
            const email = '';
            return { name, email };
        }
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
export function make_user_table_from_emails(emails: MailgunParsed[]): UserTableFromEmail {
    const users = _.groupBy(_.map(emails, (email: MailgunParsed) => {
        return parse_email_address(email.from);
    }), 'email');
    const s: UserTableFromEmail = _.mapValues(users, (us) => {
        const names = _.compact(_.uniq(_.map(us, 'name')));
        return { id: shortid(), name: names[0], names, email: us[0].email };
    })
    console.log(s);
    return s;
}


export function mk_user_name(fullname: string): string {
    const ts: string[] = fullname.split(/\s+/g);
    const re = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/;
    if (ts[0].match(re)) {  //Japanese -> first chunk is surname.
        return ts[0];
    } else {
        var surname = _.find(ts, (t, i) => {
            return t.toUpperCase() == t && t.length > 1 && (i == 0 || i == ts.length - 1);
        });
        surname = surname ? surname : ts[ts.length - 1];
        return surname || fullname;
    }
}


export async function update_db_on_mailgun_webhook({ body, db, myio, ignore_recipient = false }: { body: object, db, myio?: SocketIO.Server, ignore_recipient?: boolean }): Promise<{ added_users: User[] }> {
    const recipient: string = body['recipient'].split('@')[0].replace('.', '');
    fs.mkdir('imported_data/mailgun/' + recipient, { recursive: true }, () => {
        fs.writeFile('imported_data/mailgun/' + recipient + '/' + body['Message-Id'] + '.json', JSON.stringify(body, null, 2), () => {

        });
    });

    let myself: User | null;
    if (!ignore_recipient) {
        const user_id = recipient;
        myself = await model.users.get(user_id);
        if (myself == null) {
            console.log('Recipent ID invalid:', recipient);
            return { added_users: [] };
        }
        console.log('Adding to user: ', myself);
    } else {
        myself = await model.users.find_user_from_email(user_info.test_myself.email)
        if (myself == null) {
            console.log('Cannot find test user.');
            return { added_users: [] };
        }
    }

    const datas: MailgunParsed[] = email.parse_mailgun_webhook_thread(body);
    console.log('-------')
    console.log('Thread of ' + datas.length + ' emails.');
    console.log('From: ', _.map(datas, d => d.from));
    if (datas.length == 0) {
        return { added_users: [] };
    }
    var session_id: string | null = await find_email_session(db, datas[0]);
    if (session_id) {
        console.log('existing session', session_id);
    } else {
        const r = await model.sessions.create(myself.id, datas[0].subject, []);
        session_id = r ? r.id : null;
        console.log('new session', session_id);
    }
    if (session_id == null) {
        console.log('Session ID was not obtained.');
        return { added_users: [] };
    }
    var results: User[] = [];
    var results_comments: CommentTyp[] = [];
    await model.sessions.join({ session_id, user_id: myself.id, timestamp: datas[datas.length - 1].timestamp, source: 'owner' });
    for (var i = 0; i < datas.length; i++) {
        const data: MailgunParsed = datas[i];
        const timestamp = data.timestamp || -1;
        const { name: fullname, email } = parse_email_address(data.from);
        console.log('parsed email', { fullname, email });
        const u: User = await find_or_make_user_for_email(db, email, fullname);
        console.log('find_or_make_user result', timestamp, u);
        if (u == null) {
            console.log('User=null');
        } else {
            await model.users.add_to_contact(myself.id, u.id);
            results.push(u);
            const url = data.message_id + '::lines=' + data.lines.start + '-' + data.lines.end;
            const r1: JoinSessionResponse = await model.sessions.join({ session_id, user_id: u.id, timestamp, source: 'email_thread' });
            console.log('update_db_on_mailgun_webhook', { session_id, user_id: u.id, fullname, email, 'data.from': data.from, r1 });
            const comments = [{ for_user: myself.id, content: data.comment }];
            const params: PostCommentModelParams = { user_id: u.id, session_id, timestamp, comments, original_url: url, source: "email", encrypt: 'none' };
            const comments_posted = await model.sessions.post_comment(params);
            console.log('Heading and comment beginning', data.heading, data.comment.slice(0, 100));
            if (comments_posted && comments_posted[0] && comments_posted[0].data)
                results_comments.push(comments_posted[0].data);
            if (comments_posted[0].ok) {
                const obj = _.extend({ __type: "new_comment" }, comments_posted[0].data);
                if (myio) {
                    myio.emit("message", obj);
                }
            }
        }
    }
    console.log('results_comments', datas.length, results_comments);
    console.log('results', results);
    return { added_users: results };
}

function mk_random_username() {
    return 'ユーザー';
}

async function find_or_make_user_for_email(db, email: string, fullname?: string): Promise<User> {
    // const v = Math.random();
    // console.log(v);
    const user: User | null = await model.users.find_user_from_email(email);
    if (user != null) {
        return user;
    } else {
        email = email ? email : "";
        var name_base = fullname ? mk_user_name(fullname) : null;
        if (name_base == null || name_base == '') {
            name_base = mk_random_username();
        }
        var name = name_base;
        var user1: User | null = await model.users.find_from_username(name);
        if (user1 != null) {
            for (var i = 2; i < 10000; i++) {
                name = name_base + i;
                user1 = await model.users.find_from_username(name);
                if (user1 == null) {
                    break;
                }
            }
        }
        console.log('find_or_make_user making', fullname, email, name);
        const source = "email_thread";
        const { ok, user: user2, error } = await model.users.register({ username: name, password: "11111111", email, fullname, source });
        console.log('find_or_make_user', error);
        if (user2) {
            return user2;
        } else {
            throw new Error('find_or_make_user_for_email error.')
        }
    }
}
