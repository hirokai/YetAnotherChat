import { map, filter, includes, orderBy, compact } from 'lodash';
import * as _ from 'lodash';
import { shortid, pool, client } from './utils'
import bcrypt from 'bcrypt';
import { get_public_key } from './keys'
import * as keys from './keys'
import * as users from './users'
import * as error_code from '../error_codes'
import * as user_info from '../private/user_info'
import crypto from 'crypto'
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
import baseX from 'base-x';
const bs58 = baseX(BASE58);
import axios from 'axios'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.users", src: true, level: 1 });
import { fingerPrint } from '../../common/common_model'
import { promisify } from 'util';
const bcryptHash = promisify(bcrypt.hash);
const cryptoRandomBytes = promisify(crypto.randomBytes);
const saltRounds = 10;

export async function get_socket_ids(user_id: string): Promise<string[]> {
    const rows = (await pool.query<{ socket_id: string }>('select socket_id from user_connections where user_id=$1;', [user_id])).rows;
    return map(rows, 'socket_id');
}

export async function save_socket_id(user_id: string, socket_id: string): Promise<{ ok: boolean, timestamp?: number }> {
    const timestamp: number = new Date().getTime();
    await pool.query('insert into user_connections (socket_id,user_id,timestamp) values ($1,$2,$3);', [socket_id, user_id, timestamp]);
    return ({ ok: true, timestamp });
}

export async function get(user_id: string): Promise<User | null> {
    const rows = (await pool.query<UserWithEmail>(`
    select distinct on (users.id) users.*, user_emails.email,profile_value from users
    join user_emails on users.id=user_emails.user_id
    join profiles as p on p.user_id=users.id
    where users.id=$1 and p.profile_name='avatar';`, [user_id])).rows;
    if (rows.length > 0) {
        const row = rows[0];
        const emails = _.map(rows, 'email');
        const pub = await keys.get_public_key(user_id);
        const publicKey = pub ? pub.publicKey : undefined;
        const online_users = await list_online_users();
        const id = row.id;
        const online: boolean = includes(online_users, id);
        const registered = row['source'] == 'self_register';
        return ({ username: row.name, id, emails, avatar: row['profile_value'], fullname: row.fullname || undefined, online, publicKey, timestamp: +row.timestamp, registered });
    } else {
        return (null);
    }
}

type CreateWorkspaceParams = {
    name: string
    public: boolean
}

type Workspace = {
    id: string
    name: string
    public: boolean
}

export async function create_workspace(myself: string, options: CreateWorkspaceParams): Promise<Workspace> {
    const id = shortid();
    const timestamp = new Date().getTime();
    const kind = options.public ? 'public' : 'private';
    await pool.query('insert into workspaces (id,name,timestamp,kind) values ($1,$2,$3,$4);', [id, options.name, timestamp, kind]);
    return { name: options.name, public: options.public, id };
}

export async function remove_workspace(workspace_id: string): Promise<boolean> {
    const id = shortid();
    await pool.query('delete from workspaces where id=$1;', [workspace_id]);
    return true;
}

export async function join_workspace(myself: string, workspace: string) {
    const timestamp = new Date().getTime()
    await pool.query('insert into users_in_workspaces (user_id,workspace_id,timestamp) values ($1,$2,$3);', [myself, workspace, timestamp]);
    return true;
}

export async function add_to_contact(myself: string, contact: string) {
    const timestamp = new Date().getTime()
    await pool.query('insert into contacts (user_id,contact_id,timestamp,source) values ($1,$2,$3,$4);', [myself, contact, timestamp, 'manual']);
    return true;
}

export async function list(myself: string): Promise<User[]> {
    log.debug('users/list')
    const rows = (await pool.query<UserWithEmail>(`select distinct on (users.id,user_emails.email) id,name,fullname,users.timestamp,profile_value as avatar,users.source,user_emails.email from users
    left join user_emails on users.id=user_emails.user_id
    left join profiles on users.id=profiles.user_id
    left join contacts on contacts.contact_id=users.id
    where profiles.profile_name='avatar' and (contacts.user_id=$1 or users.id=$1);`, [myself])).rows;
    const rows_from_ws = (await pool.query<UserWithEmail>(`select distinct on (users.id,user_emails.email) id,name,fullname,users.timestamp,profile_value as avatar,users.source,user_emails.email from users
    left join user_emails on users.id=user_emails.user_id
    left join profiles on users.id=profiles.user_id
    left join contacts on contacts.contact_id=users.id
    left join users_in_workspaces w1 on w1.user_id = users.id
    left join users_in_workspaces w2 on w1.workspace_id = w2.workspace_id
    where w2.user_id=$1
    `, [myself])).rows;
    const online_users = await list_online_users();
    const rows_all = rows.concat(rows_from_ws);
    const users = compact(await Promise.all(_.map(_.groupBy(rows_all, (r) => r.id), async (rows: UserWithEmail[]): Promise<User | null> => {
        const row = rows[0];
        const user_id = row['id'];
        const pub = await get_public_key(user_id)
        const pk1 = pub ? pub.publicKey : undefined;
        const fingerprint = pk1 ? await fingerPrint(pk1) : undefined;
        // log.debug('model.list_users() publicKey', user_id, myself, pk1);
        const obj: User = {
            emails: _.map(rows, 'email'),
            timestamp: row['timestamp'],
            username: row['name'] || row['id'],
            fullname: row['fullname'] || "",
            id: user_id,
            avatar: row['avatar'],
            registered: row['source'] == 'self_register',
            publicKey: pk1,
            online: includes(online_users, user_id),
            fingerprint
        };
        return obj;

    })));
    log.debug(`${users.length} users.`)
    return users;
}

export async function list_online_users(): Promise<string[]> {
    const rows = (await pool.query('select user_id from user_connections;')).rows;
    return (map(rows, 'user_id'));
}

export async function get_user_password_hash(user_id: string): Promise<string | null> {
    const row = (await pool.query<{ password: string }>('select password from users where id=$1', [user_id]).catch(() => { return { rows: [] } })).rows[0];
    return row ? row.password : null;
}

export async function merge(users: UserSubset[]) {
    const merge_to_user: UserSubset = orderBy(users, (u) => {
        return (u.fullname ? 100 : 0) + (u.username ? 50 : 0);
    }, 'desc')[0];

    log.debug('Merging to', merge_to_user);
    if (merge_to_user == null) {
        return;
    } else {
        const new_id = merge_to_user.id;
        try {
            await client.query('BEGIN');
            const ids = map(users, u => u.id);
            for (let old_id of ids) {
                if (old_id != new_id) {
                    await client.query('update comments set user_id=$1 where user_id=$2', [new_id, old_id]);
                    await client.query('select * from session_current_members where user_id');
                    const rows = (await client.query("select session_id,string_agg(DISTINCT user_id, ',') as uids,count(user_id) as uid_count from session_current_members where user_id in (?,?) group by session_id having uid_count > 1;",
                        [new_id, old_id])).rows;
                    if (rows) {
                        const session_ids: string[] = map(rows, 'session_id');
                        log.debug('Removing (sessions,user)', session_ids, old_id);
                        for (let sid of session_ids) {
                            await client.query('delete from session_current_members where session_id=$1 and user_id=$2', [sid, old_id]);
                        };
                    }
                }
                await client.query('update session_current_members set user_id=$1 where user_id=$2', [new_id, old_id]);
                await client.query('update session_events set user_id=$1 where user_id=$2', [new_id, old_id]);
                await client.query('update user_connections set user_id=$1 where user_id=$2', [new_id, old_id]);
                await client.query('delete from user_emails where user_id=$1', [old_id]);
                await client.query('delete from users where id=$1', [old_id]);
            }
            await client.query('COMMIT');
        } catch{
            await client.query('rollback');
        }
    }
}

type ProfileKey = 'username' | 'fullname' | 'email' | 'password';

export async function update(user_id: string, { username, fullname, email }: { username?: string, fullname?: string, email?: string }): Promise<User> {
    const f = (s, value): Promise<boolean> => {
        return new Promise((r1) => {
            pool.query(s, [value, user_id]).then(() => {
                r1(true);
            }).catch(() => {
                r1(false);
            });
        })
    }
    const g = (): Promise<boolean> => {
        return new Promise((r1) => {
            r1(true);
        });
    }
    const p1 = username ? f('update users set name=$1 where id=$2;', username) : g();
    const p2 = fullname ? f('update users set fullname=$1 where id=$2;', fullname) : g();
    const p3 = email ? f('update user_emails set email=$1 where user_id=$2;', email) : g();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    if (r1 && r2 && r3) {
        const user = await get(user_id);
        if (user) {
            return user;
        } else {
            throw new Error('DB error');
        }
    } else {
        throw new Error('DB error');
    }
}

export async function save_password(user_id: string, password: string): Promise<boolean> {
    const hash = await bcrypt.hash(password, saltRounds);
    const rows = (await pool.query<{ id: string }>('select id from users where id=$1;', [user_id])).rows;
    if (!rows || !rows[0]) {
        return false;
    } else {
        await pool.query('update users set password=$1 where id=$2', [hash, user_id]);
        return true;
    }
}

interface UserWithEmail {
    id: string,
    name: string,
    fullname: string,
    username: string,
    timestamp: number,
    email: string
}

export async function find_user_from_email(email: string): Promise<User | null> {
    const rows = (await pool.query<UserWithEmail>(`
            select distinct on (users.id) users.*,user_emails.email,profile_value from users
            join user_emails on users.id=user_emails.user_id
            join profiles on profiles.user_id=users.id
            where user_emails.email=$1;`, [email])).rows;
    if (rows.length > 0) {
        const row = rows[0];
        const user_id = row.id;
        const pub = await get_public_key(user_id);
        const publicKey = pub ? pub.publicKey : undefined;
        const online_users = await list_online_users();
        const online: boolean = includes(online_users, user_id);
        const emails = _.map(rows, 'email');
        const registered = row['source'] == 'self_register';
        return { username: row.name, fullname: row.fullname || undefined, id: user_id, emails, avatar: row['profile_value'], online, publicKey, timestamp: +row.timestamp, registered };
    } else {
        return null;
    }
}

export async function find_from_username(username: string): Promise<User | null> {
    const rows = (await pool.query(`
    select users.*,string_agg(DISTINCT user_emails.email, ',') as emails,profiles.profile_value from users
    join user_emails on users.id=user_emails.user_id 
    join profiles on profiles.user_id=users.id 
    where users.name=$1 and profiles.profile_name='avatar'
    group by users.id,users.timestamp,users.source,users.name,users.fullname,users.password,users.db_local_password,profiles.profile_value;`, [username])).rows;
    if (rows && rows[0]) {
        const row = rows[0];
        const user_id = row['id']
        const emails = row['emails'] ? row['emails'].split(',') : [];
        const pub = await get_public_key(user_id);
        const publicKey = pub ? pub.publicKey : undefined;
        const online_users = await list_online_users();
        const online: boolean = includes(online_users, user_id);
        const registered = row['source'] == 'self_register';
        return { username: row['name'], id: user_id, emails, avatar: row['profile_value'], fullname: row['fullname'] || undefined, online, publicKey, timestamp: +row['timestamp'], registered };

    } else {
        return null;
    }
}

export async function get_user_config(user_id: string): Promise<string[][] | null> {
    const user = await users.get(user_id);
    if (!user) {
        return null;
    } else {
        const rows = (await pool.query<{ config_name: string, config_value: string }>('select * from user_configs where user_id=$1;', [user_id])).rows;
        const cs: string[][] = filter(map(rows, (row) => [row.config_name, row.config_value]).concat(
            [['username', user.username], ['fullname', user.fullname || ""], ['email', user.emails[0]]]
        ), (c): boolean => { return !!c[0] && !!c[1] && (c[1] != ""); });
        return cs;
    }
}

export async function set_user_config(user_id: string, key: string, value: string): Promise<{ ok: boolean }> {
    if (key.length == 0) {
        return { ok: false };
    }
    if ((await pool.query('select id from users where id=$1;', [user_id])).rows.length == 0) {
        return { ok: false };
    }
    const row = (await pool.query('select 1 from user_configs where user_id=$1 and config_name=$2;', [user_id, key])).rows[0];
    if (row) {
        const timestamp = new Date().getTime();
        try {
            await pool.query('update user_configs set timestamp=$1,config_value=$2 where user_id=$3 and config_name=$4;', [timestamp, value, user_id, key]);
            return { ok: true };
        } catch (err) {
            console.error('set_user_config', err);
            return { ok: false };
        }
    } else {
        const timestamp = new Date().getTime();
        try {
            await pool.query('insert into user_configs (timestamp,user_id,config_name,config_value) values ($1,$2,$3,$4);', [timestamp, user_id, key, value]);
            return { ok: true };
        } catch (err) {
            console.error('set_user_config', err);
            return { ok: false };
        }
    }
}

export async function register({ username, password, email, fullname, source, workspace }: { username: string, password: string, email?: string, fullname?: string, source: 'self_register' | 'email_thread', workspace?: string }): Promise<{ ok: boolean, user?: User, error?: string, error_code?: number }> {
    if (!username || !password) {
        return { ok: false, error: 'Username and password are required' };
    } else if (username.length > 64 || password.length > 64) {
        return { ok: false, error: 'Username or password is too long' };
    } else {
        if (username.indexOf('__') == 0) {
            return { ok: false, error: 'User name invalid.' };
        }
        const existing_user = await find_from_username(username);
        const existing_user2 = email ? await find_user_from_email(email) : null;
        if (existing_user) {
            return ({ ok: false, error_code: error_code.USER_EXISTS, error: 'User name already exists' });
        } else if (existing_user2) {
            return ({ ok: false, error_code: error_code.USER_EXISTS, error: 'User email already exists' });
        } else {
            const hash = await bcryptHash(password, saltRounds);
            const user_id = shortid();
            const timestamp = new Date().getTime();
            await pool.query('insert into users (id,name,password,fullname,timestamp,source) values ($1,$2,$3,$4,$5,$6)', [user_id, username, hash, fullname, timestamp, source]);
            await pool.query('insert into user_emails (user_id,email) values ($1,$2)', [user_id, email || ""]);
            if (workspace) {
                const metadata: UserInWorkspaceMetadata = { role: 'member' };
                await pool.query('insert into users_in_workspaces (user_id,workspace_id,timestamp,metadata) values ($1,$2,$3,$4);', [user_id, workspace, timestamp, JSON.stringify(metadata)]);
            }
            const avatar = choose_avatar(username);
            await set_profile(user_id, 'avatar', avatar);
            const emails = email ? [email] : [];
            const user: User = {
                id: user_id, fullname: fullname || undefined, username, emails, avatar, online: false, timestamp, registered: source == 'self_register', publicKey: undefined
            }
            if (email && !_.includes(user.emails, email)) {
                throw new Error('Unknown error');
            }
            return ({ ok: true, user });
        }
    }
}

export async function get_local_db_password(user_id: string): Promise<string> {
    log.debug('get_local_db_password', user_id);
    const row = (await pool.query<{ db_local_password: string }>('select db_local_password from users where id=$1;', [user_id])).rows[0];
    let db_local_password: string | undefined = undefined;
    if (row) {
        db_local_password = row['db_local_password'];
    }
    if (db_local_password) {
        return db_local_password;
    } else {
        const buf = await cryptoRandomBytes(32);
        const db_local_password = buf.toString('base64');
        await pool.query('update users set db_local_password=$1 where id=$2;', [db_local_password, user_id]);
        return db_local_password;
    }
}

export async function match_password(username: string, password: string): Promise<boolean> {
    const user = await users.find_from_username(username);
    if (user != null) {
        log.debug('passwordMatch', user);
        const hash = await users.get_user_password_hash(user.id);
        log.debug(hash, password, includes(user_info.allowed_passwords, password));
        if (!hash) {
            return includes(user_info.allowed_passwords, password);
        } else {
            const ok = await bcrypt.compare(password, hash);
            log.debug('bcrypt compare', ok);
            return ok;
        }
    } else {
        return false;
    }
}

function choose_avatar(username: string): string {
    if (username[0].match(/\w/)) {
        const num = 1 + Math.floor(Math.random() * 5);
        return '/public/img/letter/' + username[0].toLowerCase() + '.' + num + '.png';
    } else {
        return '/public/img/portrait.png';
    }
}

export async function get_profile(user_id: string): Promise<{ [key: string]: string }> {
    const rows = (await pool.query('select * from profiles where user_id=$1;', [user_id])).rows;
    const obj: { [key: string]: string } = {};
    rows.forEach((row) => {
        obj[row['profile_name']] = row['profile_value'];
    });
    return obj;
}

export async function get_profiles(): Promise<{ [key: string]: { [key: string]: string } }> {
    const rows = (await pool.query('select * from profiles;')).rows;
    const profiles: { [key: string]: { [key: string]: string } } = {};
    rows.forEach((row) => {
        const user_id = row['user_id'];
        if (!profiles[user_id]) {
            profiles[user_id] = {};
        }
        profiles[user_id][row['profile_name']] = row['profile_value'];
    });
    return profiles;
}

export async function set_profile(user_id: string, key: string, value: string): Promise<boolean> {
    const row = (await pool.query('select * from profiles where user_id=$1 and profile_name=$2;', [user_id, key])).rows[0];
    const timestamp = new Date().getTime();
    if (!row) {
        await pool.query('insert into profiles (timestamp,user_id,profile_name,profile_value) values ($1,$2,$3,$4);', [timestamp, user_id, key, value]);
    } else {
        await pool.query('update profiles set timestamp=$1,profile_value=$2 where user_id=$3 and profile_name=$4;', [timestamp, value, user_id, key]);
    }
    return true;
}


const PasswordResetLinkExpirationPeriod = 1000 * 60 * 60 * 24;

export async function make_password_reset_token(user: User): Promise<{ token: string, expiresAt: number }> {
    const token = await new Promise<string>((resolve) => {
        crypto.randomBytes(32, (err, buf) => {
            if (err) throw err;
            const token = bs58.encode(buf);
            resolve(token);
        });
    });
    const timestamp = new Date().getTime();
    const expiresAt = timestamp + PasswordResetLinkExpirationPeriod;
    await pool.query('insert into temporary_tokens (user_id,timestamp,kind,token) values ($1,$2,$3,$4);', [user.id, timestamp, 'password_reset', token]);
    return { token, expiresAt };
}

export async function remove_password_reset_token(token: string) {
    await pool.query('delete from temporary_tokens where kind=$1 and token=$2;', ['password_reset', token]);
}

export async function get_user_for_reset_password_token(token: string): Promise<User | null> {
    const timestamp_since = new Date().getTime() - PasswordResetLinkExpirationPeriod;
    const row = (await pool.query<{ user_id: string }>('select * from temporary_tokens where kind=$1 and token=$2 and timestamp>$3;', ['password_reset', token, timestamp_since]).catch(() => { return { rows: [] } })).rows[0];
    if (row == null) {
        return null;
    } else {
        const user = await get(row.user_id);
        return user;
    }
}

export async function reset_password_from_link(token: string, password: string): Promise<{ ok: boolean, error?: string }> {
    const user = await get_user_for_reset_password_token(token);
    if (user == null) {
        return { ok: false, error: 'User does not exist' };
    } else {
        const not_pwned = await check_password_not_pwned(password);
        if (!not_pwned) {
            return { ok: false, error: 'Breached password' };
        }
        const ok = await save_password(user.id, password);
        if (ok) {
            await remove_password_reset_token(token);
            return { ok: true };
        } else {
            return { ok: false, error: 'Password save failed' }
        }
    }
}

export async function check_password_not_pwned(password: string): Promise<boolean> {
    const sha1 = crypto.createHash('sha1');
    sha1.update(password);
    const hash = sha1.digest('hex').toUpperCase();
    const prefix = hash.substring(0, 5)
    const suffix = hash.substring(5, 40);
    try {
        const res = await axios.get("https://api.pwnedpasswords.com/range/" + prefix);
        const suffixes: { [key: string]: number } = _.fromPairs(map(res.data.split('\n'), (l: string) => {
            const [a, b] = l.split(':');
            return [a, parseInt(b)];
        }));
        log.debug(prefix, suffix)
        if (suffixes[suffix]) {
            return false;
        } else {
            return true;
        }
    } catch (e) {
        log.error(e);
        return false;
    }
}