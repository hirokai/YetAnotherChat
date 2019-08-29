import * as path from 'path'
import { connectToDB, shortid, db } from './utils'
import * as model from './index'
import { exec as exec_ } from 'child_process'
import * as util from 'util'
import * as _ from 'lodash';
import { map } from 'lodash-es';
import { prependListener } from 'cluster';
const exec = util.promisify(exec_);

jest.setTimeout(1000);

const random_str = (N) => {
    const S = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return Array.from(Array(N)).map(() => S[Math.floor(Math.random() * S.length)]).join('');
};


export async function register(opt?: { basename?: string, username?: string, fullname?: string, password?: string, email?: string, source?: string }) {
    opt = opt || {};
    const username = (opt.basename || random_str(4)) + Math.floor(Math.random() * 100000);
    const fullname = opt.fullname;
    const password = opt.password || random_str(16);
    const source = opt.source || 'self_register';
    const email = opt.email || ('' + Math.floor(Math.random() * 100000) + '@gmail.com');
    return await model.users.register({ username, password, fullname, email, source });
}

beforeEach(done => {
    return new Promise(async (resolve, reject) => {
        await exec('sqlite3 server/private/db_test.sqlite3 < server/schema.sql');
        connectToDB('server/private/db_test.sqlite3');
        done();
        // exec('sqlite3 server/private/db_test.sqlite3 < server/schema.sql').then(({ stderr, stdout }) => {
        // the *entire* stdout and stderr (buffered)
        // });
    });
});


test('Get by random ID should be null', () => {
    const user_id = shortid();
    expect(user_id).toEqual(expect.anything());
    return model.users.get({ myself: user_id, user_id }).then(user => {
        expect(user).toBeNull();
    });
});

test('Add and get', async done => {
    const { ok, error, user } = await register();
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    const user2 = await model.users.get({ myself: user.id, user_id: user.id });
    expect(user2).toEqual(user);
    done();
});

test('Get by name multiple times', async done => {
    const { ok, error, user } = await register();
    const user2 = await model.users.find_from_username({ myself: user.id, username: user.username });
    const user3 = await model.users.find_from_username({ myself: user2.id, username: user2.username });
    expect(user2).toEqual(user);
    expect(user3).toEqual(user);
    done();
});

test('Email must be unique', async () => {
    const username = 'Sato' + Math.floor(Math.random() * 100000);
    const password = random_str(16);
    const email = random_str(8) + '@' + random_str(4) + '.com'
    const { ok, error, user } = await register({ username: username, password: password, email });
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    expect(user).toEqual(expect.anything());
    const username2 = 'Tanaka' + Math.floor(Math.random() * 100000);
    const password2 = random_str(16);
    const { ok: ok2, user: user2 } = await register({ username: username2, password: password2, email });
    expect(ok2).toBe(false);
    expect(user2).toBeUndefined();
});

test('Get by email multiple times', async done => {
    const username = 'Sato' + Math.floor(Math.random() * 100000);
    const password = random_str(16);
    const source = 'self_register';
    const email = '' + Math.floor(Math.random() * 100000) + '@gmail.com';
    const { ok, user, error } = await model.users.register({ username, password, email, source });
    const user2 = await model.users.find_user_from_email({ myself: user.id, email: user.emails[0] }).catch(() => null);
    const user3 = await model.users.find_user_from_email({ myself: user.id, email: user.emails[0] }).catch(() => null);
    expect(user2).toEqual(user);
    expect(user3).toEqual(user);
    done();
});

test('List', async done => {
    const username = 'Sato' + Math.floor(Math.random() * 100000);
    const password = 'Hoge';
    const source = 'self_register';
    const email = '' + Math.floor(Math.random() * 100000) + '@gmail.com';
    const { ok, user, error } = await model.users.register({ username, password, email, source });
    const username2 = 'Tanaka' + Math.floor(Math.random() * 100000);
    const email2 = '' + Math.floor(Math.random() * 100000) + '@gmail.com';
    const { user: user2 } = await model.users.register({ username: username2, password, email: email2, source });
    const users = await model.users.list(user.id).catch(() => []);
    expect(users).toHaveLength(2);
    done();
});

test('User config', async () => {
    const username = 'Sato' + Math.floor(Math.random() * 100000);
    const password = random_str(16);
    const source = 'self_register';
    const email = '' + Math.floor(Math.random() * 100000) + '@gmail.com';
    const { user, error } = await model.users.register({ username, password, email, source });
    const key = 'avatar';
    const value = '/public/img/test.png';
    const L = 10;
    const kvs = _.fromPairs(_.map(_.range(L), () => { return [random_str(100), random_str(100)]; }));
    const oks = [];
    for (let [k, v] of _.toPairs(kvs)) {
        const { ok } = await model.users.set_user_config(user.id, k, v);
        oks.push(ok);
    }
    expect(_.every(oks)).toBeTruthy();
    console.log(oks);
    const cs = await model.users.get_user_config(user.id);

    expect(cs).toHaveLength(L + 2); //username, email ToDo: Remove these.
    const oks2 = await Promise.all(_.map(kvs, async (v, k) => {
        const { ok } = await model.users.set_user_config(user.id, k, v);
        return ok;
    }));
    expect(_.every(oks2)).toBeTruthy();
    expect(cs).toHaveLength(L + 2); //username, email ToDo: Remove these.
});

describe('Password', () => {
    test('Password cannot be saved to Non-existent user', async () => {
        const user_id = shortid();
        const password = random_str(16);
        const ok = await model.users.save_password(user_id, password);
        expect(ok).toBe(false);
    });
    test('Password can be changed and matched for a user', async () => {
        const password = random_str(16);
        const { user, error } = await register({ password });
        const m1 = await model.users.match_password(user.id, user.username, password);
        expect(m1).toBe(true);
        const password2 = random_str(16);
        const ok = await model.users.save_password(user.id, password2);
        expect(ok).toBe(true);
        const m2a = await model.users.match_password(user.id, user.username, password2);
        expect(m2a).toBe(true);
        const m2b = await model.users.match_password(user.id, user.username, password);
        expect(m2b).toBe(false);
    });
    test('Local DB password', async () => {
        const { user } = await register();
        const pass = await model.users.get_local_db_password(user.id);
        const pass2 = await model.users.get_local_db_password(user.id);
        expect(pass).toEqual(expect.anything());
        expect(pass).toEqual(pass2);
    })
});

describe('Profiles', () => {
    test('Set and get profiles', async () => {
        const { user } = await register();
        const profile = await model.users.get_profile(user.id);
        expect(Object.keys(profile)).toHaveLength(1);   //Include avatar
        const L = 30;
        const kvs = _.fromPairs(_.map(_.range(L), () => { return [random_str(100), random_str(100)]; }));
        const oks = await Promise.all(_.map(kvs, async (v, k) => {
            return model.users.set_profile(user.id, k, v);
        }));
        expect(oks).toHaveLength(L);
        expect(_.every(oks)).toBeTruthy();
        const profile2 = await model.users.get_profile(user.id);
        expect(Object.keys(profile2)).toHaveLength(L + 1);    //Avatar
    });
    test('Multiple users', async () => {
        const { user: u1 } = await register();
        const { user: u2 } = await register();
        const ks = _.map(_.range(30), () => { return random_str(30); });
        await Promise.all(ks.map((k) => {
            return model.users.set_profile(u1.id, k, random_str(16));
        }));
        await Promise.all(ks.map((k) => {
            return model.users.set_profile(u2.id, k, random_str(16));
        }));
        const p1 = await model.users.get_profile(u1.id);
        const p2 = await model.users.get_profile(u2.id);
        const p_both = await model.users.get_profiles();
        const p1_and_p2 = {};
        const common_values = _.intersection(Object.values(p1), Object.values(p2));
        p1_and_p2[u1.id] = p1;
        p1_and_p2[u2.id] = p2;
        expect(p1_and_p2).toEqual(p_both);
        expect(common_values).toEqual([]);
    });
});

describe('Socket', () => {
    test('Get socket IDs', async () => {
        const { user } = await register();
        const ids = await model.users.get_socket_ids(user.id);
        expect(ids).toHaveLength(0);
    });
    test('Set socket IDs', async () => {
        const { user } = await register();
        const ids = _.map(_.range(30), () => { return random_str(16); });
        const rs = await Promise.all(_.map(ids, (id) => {
            return model.users.save_socket_id(user.id, id);
        }))
        expect(_.every(_.map(rs, 'ok'))).toBe(true);
        const ids_get = await model.users.get_socket_ids(user.id);
        expect(new Set(ids_get)).toEqual(new Set(ids));
    });
})
/*
test('Merge', async () => {
    const L = 10;
    const fullname = random_str(16);
    const username = random_str(8);
    const users = await Promise.all(_.map(_.range(L), async (): Promise<UserSubset> => {
        const { user } = await register({ username, fullname })
        return { username, fullname, id: user.id };
    }));
    await model.users.merge(db, users);
    const users_get = await model.users.list(users[0].id);
    expect(users_get).toHaveLength(1);

});
*/