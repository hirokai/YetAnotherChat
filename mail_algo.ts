{
    const shortid = require('shortid').generate;
    const _ = require('lodash');
    const moment = require('moment');
    moment.locale('ja');


    // https://stackoverflow.com/questions/21900713/finding-all-connected-components-of-an-undirected-graph

    // Breadth First Search function
    // v is the source vertex
    // all_pairs is the input array, which contains length 2 arrays
    // visited is a dictionary for keeping track of whether a node is visited
    var bfs = function (v, all_pairs, visited) {
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


    function find_groups(pairs: string[][]): string[][] {
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


    function group_email_sessions(threads: MailgunParsed[][]): MailGroup[] {
        const emails: MailgunParsed[] = _.map(threads, (thread) => {
            return thread[0];
        });

        console.log(_.map(emails, (m: MailgunParsed) => {
            return [m.message_id, m.subject];
        }));

        //Mapping from message-id to array of (possibly split) emails
        const data_dict: { [index: string]: MailgunParsed[]; } = _.groupBy(_.flatten(threads), (d: MailgunParsed) => { return d.message_id });

        const pairs = _.flatten(_.map(emails, (d: MailgunParsed) => {
            const id = d.body['Message-Id'];
            const refs = d.references.length == 0 ? [id] : d.references; //Connect to self if isolated.
            return _.map(refs, (r) => [r, id]);
        }));

        //Grouping represented by arrays of arrays of message-id.
        const groups_of_emails: string[][] = find_groups(pairs);
        console.log('groups', groups_of_emails);

        //Mapping from message-id to session_id
        var id_mapping: { [key: string]: string } = {};
        //Mapping from session_id to session name
        var name_mapping: { [key: string]: string } = {};

        return _.map(groups_of_emails, (group: string[]) => {
            const session_id = shortid.generate();
            // console.log(data_dict[g[0]], g[0])
            console.log('dict', data_dict[group[0]])
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

        const all_groups_flatten: MailGroup[] = _.map(_.flatten(threads), (d): MailGroup => {
            const session_id = id_mapping[d.message_id];
            const session_name = name_mapping[session_id];
            return { session_id, session_name, data: data_dict[d.message_id] };
        });
        console.log('all_groups_flatten', _.map(all_groups_flatten, (group: MailGroup) => {
            return [group.session_id, group.data.map((m) => { return m.user_id })];
        }));

        const all_groups1: { [key: string]: MailGroup[] } = _.groupBy(all_groups_flatten, (d: MailGroup) => {
            return d.session_id;
        });
        console.log('all_groups1', _.map(all_groups1, (groups: MailGroup[], k: string) => {
            return _.map(groups, (group) => [group.session_id, group.data.map((m) => { return m.user_id })]);
        }));
        const all_groups: MailGroup[] = _.map(all_groups1, (ds: MailGroup[]) => {
            console.log('mail group length', ds.length);
            return {
                session_id: ds[0].session_id,
                session_name: ds[0].session_name,
                data: _.flatMap(ds, (d: MailGroup): MailgunParsed[] => {
                    return _.uniqBy(d.data, (d1: MailgunParsed) => {
                        if (ds.length > 5)
                            console.log(ds.length, d.data.length);
                        return d1.id;
                    });
                })
            };
        });
        console.log(_.map(all_groups, (group: MailGroup) => {
            return [group.session_id, group.data.map((m) => { return m.user_id })];
        }));
        return all_groups;
    }

    function find_email_session(db: any, data: MailgunParsed): Promise<string> {
        const ps = _.map(data.references, (r) => {
            return new Promise((resolve) => {
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
        return Promise.all(ps).then((results) => {
            console.log('results', results);
            const session_id = _.compact(results)[0];
            return session_id;
        })
    }


    function split_replies(txt: string): MailThreadItem[] {
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
        txt.split('\r\n').forEach((line: string) => {
            const m = line.replace(/\s/g, '').match(/^>+/);
            if (header_reading) {
                head_txt += line + '\r\n';
                if (line.trim() == '') {
                    header_reading = false;
                    reply_depth += 1;
                    const { from, timestamp } = parseHead(head_txt_prev);
                    const comment = _.map(_.dropRight(content_lines), (l: string) => {
                        return removeQuoteMarks(l, reply_indent_prev);
                    }).join('\r\n');
                    content_lines = [];
                    replies.push({ from, timestamp, comment });
                    head_txt_prev = head_txt;
                }
            } else {
                if (m) {
                    reply_indent = Math.max(reply_indent, m[0].length);
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
                    } else {
                        content_lines.push(line);
                    }
                } else if (line.match(/--+ Forwarded message --+/i)) {
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

    function removeQuoteMarks(s: string, indent: number) {
        return s.replace(new RegExp('^(> ?){' + indent + '}'), '')
    }

    function parseHead(s: string): { from: string, timestamp: number } {
        if (s.indexOf('\r\n') != -1) {
            const m1 = s.match(/From: (.+?)\r\n/);
            const m2 = s.match(/Date: (.+?)\r\n/);
            if (m1 && m2) {
                return { from: m1[1], timestamp: moment(m2[1], 'YYYY年M月D日(dddd) HH:mm').valueOf() };
            }
        } else {
            const m1 = s.match(/.+年.+月.+日\(.+\) \d+:\d+/);
            const timestamp = m1 ? moment(m1[0], 'YYYY年M月D日(dddd) HH:mm').valueOf() : -1;
            const from = m1 ? s.replace(m1[0], '') : '';
            return { from, timestamp };
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

    module.exports = {
        find_groups,
        group_email_sessions,
        find_email_session,
        split_replies
    }
}