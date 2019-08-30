import { map, filter, includes, orderBy } from 'lodash';
import { db, db_, shortid } from './utils'
import bcrypt from 'bcrypt';

import { get_public_key } from './keys'
import * as keys from './keys'
import * as users from './users'
import * as error_code from '../error_codes'
import * as user_info from '../private/user_info'
import crypto from 'crypto'

import { fingerPrint } from '../../common/common_model'


const saltRounds = 10;

export async function get_socket_ids(user_id: string): Promise<string[]> {
    const rows = await db_.all('select socket_id from user_connections where user_id=?;', user_id);
    return map(rows, 'socket_id');
}

export function save_socket_id(user_id: string, socket_id: string): Promise<{ ok: boolean, timestamp: number }> {
    return new Promise((resolve) => {
        const timestamp: number = new Date().getTime();
        db.run('insert into user_connections (socket_id,user_id,timestamp) values (?,?,?);', socket_id, user_id, timestamp, (err) => {
            const ok = !err;
            resolve({ ok: !err, timestamp: ok ? timestamp : null });
        });
    });
}

export async function get(user_id: string): Promise<User> {
    const row = await db_.get<UserWithEmail>("select users.timestamp,users.id,users.name,group_concat(distinct user_emails.email) as emails,users.fullname,profile_value from users join user_emails on users.id=user_emails.user_id join profiles as p on p.user_id=users.id where users.id=? and p.profile_name='avatar' group by users.id;", user_id);
    if (row && row.id) {
        const emails = row.emails ? row.emails.split(',') : [];
        const { publicKey } = await keys.get_public_key(user_id);
        const online_users = await list_online_users();
        const id = row['id']
        const online: boolean = includes(online_users, id);
        return ({ username: row.name, id, emails, avatar: row['profile_value'], fullname: row.fullname, online, publicKey, timestamp: row.timestamp });
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
    await db_.run('insert into workspaces (id,name,timestamp,kind) values (?,?,?,?);', id, options.name, timestamp, kind);
    return { name: options.name, public: options.public, id };
}

export async function remove_workspace(workspace_id: string): Promise<boolean> {
    const id = shortid();
    await db_.run('delete from workspaces where id=?;', workspace_id);
    return true;
}

export async function join_workspace(myself: string, workspace: string) {
    const timestamp = new Date().getTime()
    await db_.run('insert into users_in_workspaces (user_id,workspace_id,timestamp) values (?,?,?);', myself, workspace, timestamp);
    return true;
}

export async function get_workspace_member_ids(workspace_id: string): Promise<string[]> {
    const timestamp = new Date().getTime()
    const rows = await db_.all<{ user_id: string }>('select * from users_in_workspaces where workspace_id=?;', workspace_id);
    return map(rows, 'user_id');
}

export async function add_to_contact(myself: string, contact: string) {
    const timestamp = new Date().getTime()
    await db_.run('insert into contacts (user_id,contact_id,timestamp,source) values (?,?,?,?);', myself, contact, timestamp, 'manual');
    return true;
}

export async function list(myself: string): Promise<User[]> {
    const rows: { [key: string]: any } = await
        db_.all("select users.timestamp,users.id,users.name,group_concat(distinct user_emails.email) as emails,users.fullname,profiles.profile_value as avatar from users join user_emails on users.id=user_emails.user_id join profiles on users.id=profiles.user_id join contacts on contacts.contact_id=users.id where profiles.profile_name='avatar' and contacts.user_id=? group by users.id;", myself);
    const online_users = await list_online_users();
    const users = await Promise.all(map(rows, async (row): Promise<User> => {
        const user_id = row['id'];
        const { publicKey: pk1 } = await get_public_key(user_id);
        let fingerprint: string;
        if (pk1) {
            fingerprint = await fingerPrint(pk1);
        }
        // console.log('model.list_users() publicKey', user_id, myself, pk1);
        const obj: User = {
            emails: row['emails'].split(','),
            timestamp: row['timestamp'],
            username: row['name'] || row['id'],
            fullname: row['fullname'] || "",
            id: user_id,
            avatar: row['avatar'],
            publicKey: pk1,
            online: includes(online_users, user_id),
            fingerprint
        };
        return obj;
    }));
    return users;
}

export async function list_online_users(): Promise<string[]> {
    return new Promise((resolve) => {
        db.all('select user_id from user_connections;', (err, rows) => {
            resolve(map(rows, 'user_id'));
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

export function merge(db, users: UserSubset[]) {
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

type ProfileKey = 'username' | 'fullname' | 'email' | 'password';

export async function update(user_id: string, { username, fullname, email }: { username?: string, fullname?: string, email?: string }): Promise<User> {
    const f = (s, value): Promise<boolean> => {
        return new Promise((r1) => {
            db.run(s, value, user_id, (err) => {
                r1(err == null);
            });
        })
    }
    const g = (): Promise<boolean> => {
        return new Promise((r1) => {
            r1(true);
        });
    }
    const p1 = username ? f('update users set name=? where id=?;', username) : g();
    const p2 = fullname ? f('update users set fullname=? where id=?;', fullname) : g();
    const p3 = email ? f('update user_emails set email=? where user_id=?;', email) : g();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    if (r1 && r2 && r3) {
        const user = await get(user_id);
        return user;
    } else {
        return null;
    }
}

export async function save_password(user_id: string, password: string): Promise<boolean> {
    const hash = await bcrypt.hash(password, saltRounds);
    const r = await db_.get<{ id: string }>('select id from users where id=?;', user_id);
    if (!r || !r.id) {
        return false;
    } else {
        await db_.run('update users set password=? where id=?', hash, user_id);
        return true;
    }
}

interface UserWithEmail {
    id: string,
    name: string,
    fullname: string,
    username: string,
    timestamp: number,
    emails: string
}

export async function find_user_from_email({ myself, email }: { myself: string, email: string }): Promise<User> {
    if (!email || email.trim() == "") {
        return null;
    } else {
        const { err, row } = await new Promise<{ err: any, row: UserWithEmail }>((resolve) => {
            db.get('select users.timestamp,users.id,users.name,users.fullname,group_concat(distinct user_emails.email) as emails,profile_value from users join user_emails on users.id=user_emails.user_id join profiles on profiles.user_id=users.id group by users.id having emails like ?;', '%' + email + '%', (err, row: UserWithEmail) => {
                resolve({ err, row })
            });
        });
        if (!err && row) {
            const user_id = row.id;
            const { publicKey } = await get_public_key(user_id);
            const online_users = await list_online_users();
            const online: boolean = includes(online_users, user_id);
            const emails = (row.emails || '').split(',');
            return { username: row.name, fullname: row.fullname, id: user_id, emails, avatar: row['profile_value'], online, publicKey, timestamp: row.timestamp };
        } else {
            return null;
        }
    }
}

export async function find_from_username(username: string): Promise<User> {
    const row = await db_.get("select users.timestamp,users.id,users.name,group_concat(distinct user_emails.email) as emails, profile_value from users join user_emails on users.id=user_emails.user_id join profiles on profiles.user_id=users.id where users.name=? and profiles.profile_name='avatar' group by users.id;", username);
    if (row) {
        const user_id = row['id']
        const emails = row['emails'] ? row['emails'].split(',') : [];
        const { publicKey } = await get_public_key(user_id);
        const online_users = await list_online_users();
        const online: boolean = includes(online_users, user_id);
        return { username: row['name'], id: user_id, emails, avatar: row['profile_value'], fullname: row['fullname'] || null, online, publicKey, timestamp: row['timestamp'] };
    } else {
        return null;
    }
}

export async function get_user_config(user_id: string): Promise<string[][]> {
    const rows = await db_.all<any>('select * from user_configs where user_id=?;', user_id);
    if (rows) {
        const user = await users.get(user_id);
        console.log('get_user_config', user);
        const cs = filter(map(rows, (row) => [row['config_name'], row['config_value']]).concat(
            [['username', user.username], ['fullname', user.fullname], ['email', user.emails[0]]]
        ), (c) => { return c[0] != null && c[1] != null; });
        return cs;
    } else {
        return [];
    }
}

export async function set_user_config(user_id: string, key: string, value: string): Promise<{ ok: boolean }> {
    const row = await db_.get('select * from user_configs where user_id=? and config_name=?;', user_id, key);
    if (row) {
        const timestamp = new Date().getTime();
        const err = await db_.run('update user_configs set timestamp=?,config_value=? where user_id=? and config_name=?;', timestamp, value, user_id, key);
        if (err) {
            console.error('set_user_config', err);
            return { ok: false };
        } else {
            return { ok: true };
        }
    } else {
        const timestamp = new Date().getTime();
        const err = await db_.run('insert into user_configs (timestamp,user_id,config_name,config_value) values (?,?,?,?);', timestamp, user_id, key, value);
        if (err) {
            console.error('set_user_config', err);
            return { ok: false };
        } else {
            return { ok: true };
        }
    }
}

export async function register({ username, password, email, fullname = null, source }: { username: string, password: string, email?: string, fullname?: string, source: string }): Promise<{ ok: boolean, user?: User, error?: string, error_code?: number }> {
    const user_id = shortid();
    if (!username || !password) {
        return { ok: false, error: 'Username and password are required' };
    } else if (username.length > 64 || password.length > 64) {
        return { ok: false, error: 'Username or password is too long' };
    } else {
        if (username.indexOf('__') == 0) {
            return { ok: false, error: 'User name invalid.' };
        }
        const existing_user: User = await find_from_username(username);
        const existing_user2: User = await find_user_from_email({ myself: user_id, email });
        return new Promise((resolve) => {
            if (existing_user) {
                resolve({ ok: false, error_code: error_code.USER_EXISTS, error: 'User name already exists' });
            } else if (existing_user2) {
                resolve({ ok: false, error_code: error_code.USER_EXISTS, error: 'User email already exists' });
            } else {
                bcrypt.hash(password, saltRounds, function (err, hash) {
                    if (err) {
                        resolve({ ok: false, error: 'Password hashing error' });
                    } else {
                        db.serialize(() => {
                            const timestamp = new Date().getTime();
                            db.run('insert into users (id,name,password,fullname,timestamp,source) values (?,?,?,?,?,?)', user_id, username, hash, fullname, timestamp, source);
                            db.run('insert into user_emails (user_id,email) values (?,?)', user_id, email || "");
                            const avatar = choose_avatar(username);
                            set_profile(user_id, 'avatar', avatar).then(() => {
                                const emails = email ? [email] : [];
                                const user: User = { id: user_id, fullname, username, emails, avatar, online: false, publicKey: null, timestamp }
                                resolve({ ok: true, user });
                            });
                        });
                    }
                });

            }
        });
    }
}

export async function get_local_db_password(user_id: string): Promise<string> {
    console.log('get_local_db_password', user_id);
    return new Promise((resolve) => {
        if (!user_id) {
            resolve(null);
            return;
        }
        db.get('select db_local_password from users where id=?;', user_id, (err, row) => {
            let db_local_password;
            if (!err && row) {
                db_local_password = row['db_local_password'];
            }
            if (db_local_password) {
                resolve(db_local_password);
                // crypto.randomBytes(32, (err, buf) => {
                //     const db_local_password_new = buf.toString('base64');
                //     db.run('update users set db_local_password=? where id=?;', db_local_password_new, user_id, (err1, row1) => { });
                // });
            } else {
                crypto.randomBytes(32, (err, buf) => {
                    const db_local_password = buf.toString('base64');
                    db.run('update users set db_local_password=? where id=?;', db_local_password, user_id, (err1, row1) => {
                        if (!err1) {
                            resolve(db_local_password);
                        } else {
                            resolve(null);
                        }
                    });

                });
            }
        });
    });
}

export async function match_password(myself: string, username: string, password: string): Promise<boolean> {
    const user = await users.find_from_username(username);
    if (user != null) {
        console.log('passwordMatch', user);
        const hash = await users.get_user_password_hash(user.id);
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

function choose_avatar(username: string): string {
    if (username[0].match(/\w/)) {
        const num = 1 + Math.floor(Math.random() * 5);
        return '/public/img/letter/' + username[0].toLowerCase() + '.' + num + '.png';
    } else {
        return '/public/img/portrait.png';
    }
}

export async function get_profile(user_id: string): Promise<{ [key: string]: string }> {
    return new Promise((resolve) => {
        db.all('select * from profiles where user_id=?;', user_id, (err, rows) => {
            const obj: { [key: string]: string } = {};
            rows.forEach((row) => {
                obj[row['profile_name']] = row['profile_value'];
            });
            resolve(obj);
        });
    });
}

export async function get_profiles(): Promise<{ [key: string]: { [key: string]: string } }> {
    return new Promise((resolve) => {
        db.all('select * from profiles;', (err, rows) => {
            const profiles: { [key: string]: { [key: string]: string } } = {};
            rows.forEach((row) => {
                const user_id = row['user_id'];
                if (!profiles[user_id]) {
                    profiles[user_id] = {};
                }
                profiles[user_id][row['profile_name']] = row['profile_value'];
            });
            resolve(profiles);
        });
    });
}

export async function set_profile(user_id: string, key: string, value: string): Promise<boolean> {
    return new Promise((resolve) => {
        db.get('select * from profiles where user_id=? and profile_name=?;', user_id, key, (err, row) => {
            if (err) {
                console.log(err);
                resolve(false);
                return;
            }
            const timestamp = new Date().getTime();
            if (!row) {
                db.run('insert into profiles (timestamp,user_id,profile_name,profile_value) values (?,?,?,?);', timestamp, user_id, key, value, (err1) => {
                    resolve(!err1);
                });
            } else {
                db.run('update profiles set timestamp=?,profile_value=? where user_id=? and profile_name=?;', timestamp, value, user_id, key, (err1) => {
                    resolve(!err1);
                });
            }
        });
    });
}

