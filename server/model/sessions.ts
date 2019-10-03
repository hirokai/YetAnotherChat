/// <reference path="./types.d.ts" />

import { shortid, cipher, decipher, pool, client } from './utils'
import * as users from './users'
import { get_public_key } from './keys'
import { fingerPrint } from '../../common/common_model'
import { map, includes, orderBy, keyBy, min, max, chain, compact, zip, sum, values, sortedUniq, sortBy } from 'lodash';
const emojis = require("./emojis.json").emojis;
const emoji_dict = keyBy(emojis, 'shortname');
import * as model from './index'
import * as _ from 'lodash';
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.sessions", src: true, level: 1 });

export async function delete_session(user_id: string, id: string): Promise<boolean> {
    try {
        const session = await get(user_id, id);
        if (!session || session.owner != user_id) {
            return false;
        }
        client.query('BEGIN');
        await client.query('delete from session_current_members where session_id=$1;', [id]);
        await client.query('delete from comments where session_id=$1;', [id]);
        await client.query('delete from session_events where session_id=$1;', [id]);
        await client.query('delete from sessions where id=$1;', [id]);
        client.query('COMMIT');
        return true;
    } catch (e) {
        client.query('ROLLBACK');
        return false;
    }
}

export async function get_members({ myself, session_id, only_registered = true }: { myself: string, session_id: string, only_registered?: boolean }): Promise<User[]> {
    const ids = await get_member_ids({ myself, session_id, only_registered });
    return compact(await Promise.all(map(ids, (user_id: string) => {
        return users.get(user_id);
    })));
}

export async function is_member(session_id: string, user_id: string): Promise<boolean> {
    const row = (await pool.query('select * from session_current_members where session_id=$1 and user_id=$2', [session_id, user_id])).rows[0];
    log.info('model.is_member', row)
    return !!row;
}

export async function get_member_ids({ myself, session_id, only_registered = true }: { myself: string, session_id: string, only_registered?: boolean }): Promise<string[] | null> {
    if (only_registered) {
        const r = await pool.query<{ user_id: string }>("select user_id from session_current_members where session_id=$1 and source<>'email_thread'", [session_id]);
        const ids = map(r.rows, 'user_id');
        if (!includes(ids, myself)) {  //The user is not a member.
            return null;
        } else {
            return ids;
        }
    } else {
        const r = await pool.query<{ user_id: string }>('select user_id from session_current_members where session_id=$1', [session_id]);
        const ids = map(r.rows, 'user_id');
        if (!includes(ids, myself)) {  //The user is not a member.
            return null;
        } else {
            return ids;
        }
    }
}

export async function get_sessions_of_member(user_id: string, member_id: string): Promise<RoomInfo[]> {
    const sessions = (await pool.query<{ id: string, timestamp: number, name: string, workspace: string, visibility?: SessionVisibility, member: string, source: SessionMemberSource }>(`
    select s.id,s.timestamp,s.name,s.workspace,s.visibility,m.user_id member, m.source from sessions s
    join session_current_members m on m.session_id=s.id
    where (
            s.visibility='public' or
            (s.visibility='workspace' and
                s.workspace in (select id from workspaces join users_in_workspaces on users_in_workspaces.workspace_id=workspaces.id where users_in_workspaces.user_id=$1)) or
            s.id in (select id from sessions join session_current_members on sessions.id=session_current_members.session_id where user_id=$1))
        and m.user_id=$2;`, [user_id, member_id])).rows;
    const ss = map(_.groupBy(sessions, 'id'), (ss1) => {
        const s1 = ss1[0];
        const roles: SessionMemberSource[] = _.map(ss1, 'source');
        const owner_index = _.findIndex(roles, 'owner');
        const members: string[] = _.map(ss1, 'member');
        var r: RoomInfo = {
            id: s1.id, name: s1.name, timestamp: s1.timestamp,
            numMessages: { '__total': -1 }, firstMsgTime: -1, lastMsgTime: -1, members,
            owner: owner_index != -1 ? members[owner_index] : '',
            visibility: s1.visibility || 'private'
        };
        return r;
    });
    const ss_sorted = orderBy(ss, 'lastMsgTime', 'desc');
    log.debug(`${ss_sorted.length} sessions.`)
    return ss_sorted;
}

export async function get_session_of_members(user_id: string, members: string[]): Promise<RoomInfo[]> {
    log.info('get_session_of_members');
    if (members.length == 0) {
        return [];
    }
    if (members.length == 1) {
        return get_sessions_of_member(user_id, members[0]);
    } else {
        const sessions_list = await Promise.all(_.map(members, (m) => get_sessions_of_member(user_id, m)));
        let ss2 = sessions_list[0];
        for (let ss of sessions_list) {
            ss2 = _.intersectionBy(ss2, ss, (s) => s.id);
        }
        return orderBy(ss2, 'lastMsgTime', 'desc');
    }
}

export async function update({ session_id, name }: { session_id: string, name: string }): Promise<{ ok: boolean, timestamp?: number }> {
    const timestamp = new Date().getTime();
    try {
        await pool.query('update sessions set name=$1 where id=$2;', [cipher(name), session_id]);
        return { ok: true, timestamp };
    } catch{
        return { ok: false }
    }
}

export async function list_comments(for_user: string, session_id?: string, user_id?: string, time_after?: number): Promise<ChatEntry[] | null> {
    const processRow = (row): ChatEntry => {
        const comment = row.comment.replace(/(:.+?:)/g, function (m, $1) {
            const r = emoji_dict[$1];
            return r ? r.emoji : $1;
        });
        return { id: row.id, comment, timestamp: parseInt(row.timestamp), user_id: row.user_id, original_url: row.original_url, sent_to: row.sent_to, session_id: row.session_id, source: row.source, kind: "comment", encrypt: row.encrypt, fingerprint: { from: row['fingerprint_from'], to: row['fingerprint_to'] } };
    };
    time_after = time_after ? time_after : -1;
    var func;
    if (session_id && !user_id) {
        func = () => {
            return pool.query('select * from comments where session_id=$1 and for_user=$2 and timestamp>$3 order by timestamp;', [session_id, for_user, time_after]);
        };
    } else if (!session_id && user_id) {
        func = () => {
            return pool.query('select * from comments where user_id=$1 and for_user=$2 and timestamp>$3 order by timestamp;', [user_id, for_user, time_after]);
        }
    } else if (session_id && user_id) {
        func = () => {
            return pool.query('select * from comments where session_id=$1 and user_id=$2 and for_user=$3 and timestamp>$4 order by timestamp;', [session_id, user_id, for_user, time_after]);
        }
    } else {
        func = () => {
            return pool.query('select * from comments and for_user=$1 and timestamp>$2 order by timestamp;', [for_user, time_after]);
        }
    }

    const row1 = (await pool.query('select 1 from sessions where id=$1;', [session_id])).rows[0];
    if (row1 == null) {
        return null;
    } else {
        const rows = (await func()).rows;
        const res1 = map(rows, processRow);
        if (session_id) {
            const rows2 = (await pool.query('select * from session_events where session_id=$1;', [session_id])).rows;
            const res2 = map(rows2, (r) => {
                r.kind = "event";
                return r;
            });
            return sortBy(res1.concat(res2), ['timestamp', (r) => {
                return { 'event': 0, 'comment': 1 }[r.kind];
            }]);
        } else {
            return res1;
        }
    }
}

export async function delete_comment(user_id: string, comment_id: string): Promise<{ ok: boolean, data?: DeleteCommentData, error?: string }> {
    const rows = (await pool.query<{ session_id: string, user_id: string, encrypt_group?: string }>('select * from comments where id=$1;', [comment_id])).rows;
    if (rows) {
        const row = rows[0];
        const session_id = row['session_id'];
        const user_id_ = row['user_id'];
        if (user_id != user_id_) {
            return { ok: false, error: 'Cannot delete comments by other users' };
        }
        const encrypt_group = row['encrypt_group'];
        if (!encrypt_group) {
            return { ok: false, error: 'Encrypted data was not correctly saved.' }
        }
        const rows2 = (await pool.query('select * from comments where encrypt_group=$1;', [encrypt_group])).rows;
        if (!rows2[0]) {
            return { ok: false, error: 'Encrypted data was not correctly saved.' }
        }
        try {
            await pool.query('delete from comments where encrypt_group=$1;', [encrypt_group]);
            const data: DeleteCommentData = { comment_id, encrypt_group, session_id };
            return { ok: true, data };
        } catch (err) {
            return { ok: false, error: err };
        }
    } else {
        return { ok: false, error: 'Comment ' + comment_id + ' does not belong to any session.' };
    }
}

export async function get(user_id: string, session_id: string): Promise<RoomInfo | null> {
    const rows =
        (await pool.query<{ id: string, user_id: string, name: string, timestamp: number, workspace?: string, source?: string, visibility?: SessionVisibility }>(`
            select s.*,m.* from sessions as s
            join session_current_members as m on s.id=m.session_id
            where s.id=$1 order by s.timestamp desc;`, [session_id])).rows;
    const session = { id: rows[0].id, members: _.map(rows, (row) => { return { id: row.user_id, source: row.source }; }), name: rows[0].name, timestamp: rows[0].timestamp, workspace: rows[0].workspace, visibility: rows[0].visibility };
    const users = (await pool.query("select count(*),user_id,max(timestamp),min(timestamp) from comments where session_id=$1 and for_user=$2 group by user_id;", [session.id, user_id])).rows;
    const first = min(map(users, 'min(timestamp)')) || -1;
    const last = max(map(users, 'max(timestamp)')) || -1;
    var count: { [key: string]: number } = chain(users).keyBy('user_id').mapValues((u) => {
        return u['count(*)'];
    }).value();
    map(session.members, (m) => {
        count[m.id] = count[m.id] || 0;
    });
    count['__total'] = sum(values(count)) || 0;
    const info = { count, first, last };
    if (session.visibility == 'private' && !_.includes(_.map(session.members, 'id'), user_id)) {
        return null;
    }
    const owner = _.find(session.members, (m) => m.source == 'owner');
    if (!owner) {
        return null;
    } else {
        const obj: RoomInfo = {
            id: session.id, name: decipher(session.name) || '', timestamp: session.timestamp, members: _.map(session.members, 'id'), numMessages: info.count, firstMsgTime: info.first, lastMsgTime: info.last, workspace: session.workspace,
            owner: owner.id, visibility: session.visibility || 'private'
        };
        return obj;
    }
}


export async function list(params: { user_id: string, of_members?: string[] | undefined, workspace_id?: string }): Promise<RoomInfo[]> {
    const { user_id, of_members, workspace_id } = params;
    log.debug(params);
    if (of_members) {
        return get_session_of_members(user_id, of_members);
    }
    var hrstart = process.hrtime()
    const rows = (workspace_id ? await pool.query<{ id: string, user_id: string, name: string, timestamp: number, workspace?: string, source?: string, visibility?: SessionVisibility }>(`
            select s.*,m2.* from sessions as s
            join session_current_members as m on s.id=m.session_id
            join session_current_members as m2 on m.session_id=m2.session_id
            where m.user_id=$1 and s.workspace=$2 order by s.timestamp desc;`, [user_id, workspace_id]) :
        await pool.query<{ id: string, user_id: string, name: string, timestamp: number, workspace?: string, source?: string, visibility?: SessionVisibility }>(`
            select s.*,m2.* from sessions as s
            join session_current_members as m on s.id=m.session_id
            join session_current_members as m2 on m.session_id=m2.session_id
            where m.user_id=$1 order by s.timestamp desc;`, [user_id])).rows;

    const rows_public =
        (await pool.query<{ id: string, user_id: string, name: string, timestamp: number, workspace?: string, source?: string, visibility?: SessionVisibility }>(`
        select s.*,m.* from sessions as s
        join session_current_members as m on s.id=m.session_id
        where s.visibility in ('public');`)).rows;

    const rows_workspace = workspace_id ?
        (await pool.query<{ id: string, user_id: string, name: string, timestamp: number, workspace?: string, source?: string, visibility?: SessionVisibility }>(`
        select s.*,m.* from sessions as s
        join session_current_members as m on s.id=m.session_id
        where s.workspace=$1;`, [workspace_id])).rows : [];

    const workspaces = workspace_id ? [workspace_id] : _.map(await model.workspaces.list(user_id), 'id');

    // log.info('sessions.list', params, rows);
    const sessions = _.map(_.groupBy(_.uniqBy(rows.concat(rows_public).concat(rows_workspace), (r) => { return r.id + r.user_id; }), 'id'), (g) => {
        return { id: g[0].id, members: _.map(g, (g) => { return { id: g.user_id, source: g.source }; }), name: g[0].name, timestamp: g[0].timestamp, workspace: g[0].workspace, visibility: g[0].visibility };
    });
    const infos: { count: { [key: string]: number }, first: number, last: number }[] = [];
    for (let s of sessions) {
        const users = (await pool.query("select count(*),user_id,max(timestamp),min(timestamp) from comments where session_id=$1 and for_user=$2 group by user_id;", [s.id, user_id])).rows;
        const first = min(map(users, 'min(timestamp)')) || -1;
        const last = max(map(users, 'max(timestamp)')) || -1;
        var count: { [key: string]: number } = chain(users).keyBy('user_id').mapValues((u) => {
            return u['count(*)'];
        }).value();
        map(s.members, (m) => {
            count[m.id] = count[m.id] || 0;
        });
        count['__total'] = sum(values(count)) || 0;
        const info = { count, first, last };
        // const info = { count: { '__total': 0 }, first: 0, last: 0 };
        infos.push(info);
    }
    const ss: RoomInfo[] = compact(map(zip(sessions, infos), ([s, info]) => {
        // log.info(s, info);
        if (!s || !info) {
            return null;
        }
        if (!_.includes(_.map(s.members, 'id'), user_id) && !_.includes(workspaces, s.workspace)) {
            return null;
        }
        const owner = _.find(s.members, (m) => m.source == 'owner');
        if (!owner) {
            return null;
        } else {
            const obj: RoomInfo = {
                id: s.id, name: decipher(s.name) || '', timestamp: +s.timestamp, members: _.map(s.members, 'id'), numMessages: info.count, firstMsgTime: info.first, lastMsgTime: info.last, workspace: s.workspace,
                owner: owner.id, visibility: s.visibility || 'private'
            };
            return obj;
        }
    }));
    const ss_sorted = orderBy(ss, 'lastMsgTime', 'desc');
    const hrend = process.hrtime(hrstart);
    log.debug(hrend);
    return ss_sorted;
}

type SessionMemberSource = 'owner' | 'added_by_member' | 'email_thread' | 'self_manual';

async function add_member_internal({ session_id, user_id, source }: { session_id: string, user_id: string, source: SessionMemberSource }): Promise<boolean> {
    try {
        await pool.query('insert into session_current_members (session_id,user_id,source) values ($1,$2,$3);', [session_id, user_id, source]);
        return true;
    } catch{
        return false;
    }
}

export async function join({ session_id, user_id, timestamp = -1, source }: { session_id: string, user_id: string, timestamp: number, source: SessionMemberSource }): Promise<JoinSessionResponse> {
    log.info('join_session source', source, user_id);
    if (!session_id || !user_id) {
        return { ok: false };
    }
    const ts: number = timestamp > 0 ? timestamp : new Date().getTime();
    const id: string = shortid();
    const is_registered_user = (await users.get(user_id)) != null;
    const members: string[] = await get_member_ids({ myself: user_id, session_id }) || [];
    const is_member: boolean = includes(members, user_id);
    if (!is_registered_user) {
        return ({ ok: false, error: 'User ID invalid' })
    } else if (is_member) {
        return ({ ok: false, error: 'Already member' })
    } else {
        await pool.query('insert into session_events (id,session_id,user_id,timestamp,action) values ($1,$2,$3,$4,$5);', [id, session_id, user_id, ts, 'join']);
        await pool.query('insert into session_current_members (session_id,user_id,source) values ($1,$2,$3);', [session_id, user_id, source]);
        return { ok: true, data: { id, members } };
    }
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
    log.info('post_comment start');
    const _comment_id = comment_id || shortid();
    // Currently key is same for all recipients.
    const from = await get_public_key(user_id);
    const to = await get_public_key(for_user);
    if (encrypt == 'none' || (from && to)) {
        const fp_from = from ? await fingerPrint(from.publicKey) : undefined;
        const fp_to = to ? await fingerPrint(to.publicKey) : undefined;
        // log.info('Posting with key: ' + fingerprint, publicKey, user_id, for_user);
        try {
            await pool.query(`insert into comments (
                                    id,user_id,comment,for_user,encrypt,timestamp,session_id,original_url,sent_to,source,encrypt_group,fingerprint_from,fingerprint_to
                                    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13);`, [_comment_id, user_id, comment, for_user, encrypt, timestamp, session_id, original_url, sent_to, source, encrypt_group, fp_from, fp_to]);
            const row = (await pool.query('select 1 from session_current_members where session_id=$1 and user_id=$2', [session_id, user_id])).rows[0];
            if (!row) {
                await pool.query('insert into session_current_members (session_id,user_id) values ($1,$2)', [session_id, user_id]);
            }
            const data: CommentTyp = {
                id: _comment_id, timestamp: timestamp, user_id, comment: comment, session_id, original_url, sent_to, source: source, kind: "comment", encrypt,
                fingerprint: { from: fp_from, to: fp_to }
            };
            return { ok: true, for_user, data };
        } catch (err) {
            log.info('post_comment error', err)
            throw err;
        }
    } else {
        return { ok: false, for_user, error: 'Public key is missing' };
    }
}

export async function create(user_id: string, name: string, members: string[], visibility: SessionVisibility, workspace?: string): Promise<RoomInfo> {
    const session_id = shortid();
    return create_session_with_id(user_id, session_id, name, members, visibility, workspace);
}

export async function create_session_with_id(user_id: string, session_id: string, name: string, members: string[], visibility: SessionVisibility, workspace?: string): Promise<RoomInfo> {
    const timestamp = new Date().getTime();
    if (workspace) {
        await pool.query('insert into sessions (id, name, timestamp,workspace,visibility) values ($1,$2,$3,$4,$5);', [session_id, cipher(name), timestamp, workspace, visibility]);
    } else {
        await pool.query('insert into sessions (id, name, timestamp,visibility) values ($1,$2,$3,$4);', [session_id, cipher(name), timestamp, visibility]);
    }
    await add_member_internal({ session_id, user_id, source: 'owner' });
    for (let m of members) {
        const r = await add_member_internal({ session_id, user_id: m, source: 'added_by_member' });
    }
    const roomInfo = await get(user_id, session_id);
    if (roomInfo) {
        return roomInfo;
    } else {
        throw new Error('Session ID not found');
    }
}

export async function set_visibility(user_id: string, id: string, visibility: SessionVisibility) {
    try {
        const s = await get(user_id, id);
        if (s && s.owner == user_id) {
            pool.query('update sessions set visibility=$1 where id=$2;', [visibility, id]);
            return true;
        } else {
            return false;
        }
    } catch{
        return false;
    }
}
