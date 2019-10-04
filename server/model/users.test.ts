import * as path from 'path'
import { shortid, pool, connectToDB } from './utils'
import * as model from './index'
import { exec as exec_ } from 'child_process'
import * as util from 'util'
import * as _ from 'lodash';
import { random_str, random_str_b58, register } from './test_utils'
const exec = util.promisify(exec_);
jest.setTimeout(3000);
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.users.test", level: 1 });

describe('Get, list, add, and update', () => {
    beforeEach(done => {
        return new Promise(async (resolve, reject) => {
            await exec('psql -d test < server/schema.sql');
            await connectToDB('test');
            done();
        });
    });

    test('Get by random ID should be null', async done => {
        const user_id = shortid();
        expect(user_id).toEqual(expect.anything());
        const user = await model.users.get(user_id);
        expect(user).toBeNull();
        done();
    });

    test('Add and get', async done => {
        const user = await register();
        const user2 = await model.users.get(user.id);
        expect(user2).toEqual(user);
        done();
    });

    test('Get by name multiple times', async done => {
        const user = await register();
        const user2 = await model.users.find_from_username(user.username);
        expect(user2).toEqual(user);
        if (user2) {
            const user3 = await model.users.find_from_username(user2.username);
            expect(user3).toEqual(user);
        }
        done();
    });

    test('Email must be unique', async () => {
        const username = 'Sato' + Math.floor(Math.random() * 100000);
        const password = random_str(16);
        const email = random_str(8) + '@' + random_str(4) + '.com'
        const user = await register({ username: username, password: password, email });
        expect(user).toEqual(expect.anything());
        log.debug(user);
        const username2 = 'Tanaka' + Math.floor(Math.random() * 100000);
        const password2 = random_str(16);
        await expect(register({ username: username2, password: password2, email })).rejects.toThrow();
    });

    test('Get by email multiple times', async done => {
        const source = 'self_register';
        const user = await register({ source });
        if (!user) {
            throw new Error('User error');
        }
        const user2 = await model.users.find_user_from_email(user.emails[0]).catch(() => null);
        const user3 = await model.users.find_user_from_email(user.emails[0]).catch(() => null);
        expect(user2).toEqual(user);
        expect(user3).toEqual(user);
        done();
    });

    test('List', async done => {
        const source = 'self_register';
        const user = await register({ source });
        const user2 = await register({ source });
        await model.users.add_to_contact(user.id, user.id);
        await model.users.add_to_contact(user.id, user2.id);
        const users = await model.users.list(user.id).catch(() => []);
        expect(users).toHaveLength(2);
        done();
    });

    test('Update username', async done => {
        const source = 'self_register';
        const u1 = await register({ source });
        const u2 = await register({ source });
        const u1_2username = random_str();
        await model.users.update(u1.id, { username: u1_2username });
        const u1_2 = await model.users.get(u1.id);
        const u2_2 = await model.users.get(u2.id);
        expect(u1_2).toEqual(expect.anything());
        if (u1_2 && u2_2) {
            expect(u1_2.username).toEqual(u1_2username);
            const u1_2a = Object.assign({}, u1_2, { username: u1.username });
            expect(u1_2a).toEqual(u1);
            expect(u2_2.username).toEqual(u2.username);
        } else {
            throw new Error('Null')
        }
        done();
    })
    test('Update fullname', async done => {
        const source = 'self_register';
        const u1 = await register({ source });
        const u2 = await register({ source });
        const u1_2fullname = random_str();
        await model.users.update(u1.id, { fullname: u1_2fullname });
        const u1_2 = await model.users.get(u1.id);
        const u2_2 = await model.users.get(u2.id);
        expect(u1_2).toEqual(expect.anything());
        if (u1_2 && u2_2) {
            expect(u1_2.fullname).toEqual(u1_2fullname);
            const u1_2a = Object.assign({}, u1_2, { fullname: u1.fullname });
            expect(u1_2a).toEqual(u1);
            expect(u2_2.fullname).toEqual(u2.fullname);
        } else {
            throw new Error('Null')
        }
        done();
    });

    test('Update email', async done => {
        const source = 'self_register';
        const u1 = await register({ source });
        const u2 = await register({ source });
        const u1_2email = random_str();
        await model.users.update(u1.id, { email: u1_2email });
        const u1_2 = await model.users.get(u1.id);
        const u2_2 = await model.users.get(u2.id);
        expect(u1_2).toEqual(expect.anything());
        if (u1_2 && u2_2) {
            expect(u1_2.emails[0]).toEqual(u1_2email);
            const u1_2a = Object.assign({}, u1_2, { emails: u1.emails });
            expect(u1_2a).toEqual(u1);
            expect(u2_2.emails).toEqual(u2.emails);
        } else {
            throw new Error('Null')
        }
        done();
    });

});

describe('Config', () => {
    beforeEach(async done => {
        await exec('psql -d test < server/schema.sql');
        await connectToDB('test');
        done();
    });

    test('Setting for non-existent and different users does not affect a user', async done => {
        const u1 = await register({ source: 'self_register' });
        const u2 = await register({ source: 'self_register' });
        const [k1, v1, k2, v2] = _.map(_.range(4), () => random_str());
        let { ok } = await model.users.set_user_config(u1.id, k1, v1);
        expect(ok).toBe(true);
        ok = (await model.users.set_user_config(u2.id, k2, v2)).ok;
        expect(ok).toBe(true);
        ok = (await model.users.set_user_config(random_str(), k2, v2)).ok;
        expect(ok).toBe(false);
        let ss = await model.users.get_user_config(u1.id);
        expect(_.sortBy(ss)).toEqual(_.sortBy([[k1, v1], ['username', u1.username], ['email', u1.emails[0]]]));
        ss = await model.users.get_user_config(u2.id);
        expect(_.sortBy(ss)).toEqual(_.sortBy([[k2, v2], ['username', u2.username], ['email', u2.emails[0]]]));
        done();
    });

    test('Set multiple configs', async () => {
        const user = await register({ source: 'self_register' });
        const L = 10;
        const kvs = _.fromPairs(_.map(_.range(L), () => { return [random_str(100), random_str(100)]; }));
        const oks: boolean[] = [];
        for (let [k, v] of _.toPairs(kvs)) {
            const { ok } = await model.users.set_user_config(user.id, k, v);
            oks.push(ok);
        }
        expect(_.every(oks)).toBeTruthy();
        log.debug(oks);
        const cs = await model.users.get_user_config(user.id);

        expect(cs).toHaveLength(L + 2); //username, email ToDo: Remove these.
        const oks2 = await Promise.all(_.map(kvs, async (v, k) => {
            const { ok } = await model.users.set_user_config(user.id, k, v);
            return ok;
        }));
        expect(_.every(oks2)).toBeTruthy();
        expect(cs).toHaveLength(L + 2); //username, email ToDo: Remove these.
    });
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
        const user = await register({ password });
        const m1 = await model.users.match_password(user.username, password);
        expect(m1).toBe(true);
        const password2 = random_str(16);
        const ok = await model.users.save_password(user.id, password2);
        expect(ok).toBe(true);
        const m2a = await model.users.match_password(user.username, password2);
        expect(m2a).toBe(true);
        const m2b = await model.users.match_password(user.username, password);
        expect(m2b).toBe(false);
    });
    test('Local DB password', async () => {
        const user = await register();
        const pass = await model.users.get_local_db_password(user.id);
        const pass2 = await model.users.get_local_db_password(user.id);
        expect(pass).toEqual(expect.anything());
        expect(pass).toEqual(pass2);
    })
});

describe('Profiles', () => {
    beforeEach(done => {
        return new Promise(async (resolve, reject) => {
            await exec('psql -d test < server/schema.sql');
            await connectToDB('test');
            done();
        });
    });
    test('Set and get profiles', async () => {
        const user = await register();
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
        const u1 = await register();
        const u2 = await register();
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
        expect(_.filter(common_values, (v) => { return v.indexOf("/public/img/letter/") != 0 })).toEqual([]);
    });
});

describe('Socket', () => {
    test('Get socket IDs', async () => {
        const user = await register();
        const ids = await model.users.get_socket_ids(user.id);
        expect(ids).toHaveLength(0);
    });
    test('Set socket IDs', async () => {
        const user = await register();
        const ids = _.map(_.range(30), () => { return random_str(16); });
        const rs = await Promise.all(_.map(ids, (id) => {
            return model.users.save_socket_id(user.id, id);
        }))
        expect(_.every(_.map(rs, 'ok'))).toBe(true);
        const ids_get = await model.users.get_socket_ids(user.id);
        expect(new Set(ids_get)).toEqual(new Set(ids));
    });
})

describe('Contacts', () => {
    beforeAll(done => {
        return new Promise(async (resolve, reject) => {
            await exec('psql -d test < server/schema.sql');
            await connectToDB('test');
            done();
        });
    });
    test('Invisible before contact addition', async done => {
        const me = await register();
        const u2 = await register();
        const users_from_me = _.map(await model.users.list(me.id), 'id');
        expect(users_from_me).not.toContainEqual(u2.id);
        done();
    });
    test('Visible after contact addition', async done => {
        const me = await register();
        const u2 = await register();
        model.users.add_to_contact(me.id, u2.id);
        const users_from_me = _.map(await model.users.list(me.id), 'id');
        expect(users_from_me).toContainEqual(u2.id);
        const users_from_u2 = _.map(await model.users.list(u2.id), 'id');
        expect(users_from_u2).not.toContainEqual(me.id);
        done();
    });
});

describe('Workspaces', () => {
    test('Add and remove', async done => {
        const me = await register();
        const ws = await model.users.create_workspace(me.id, { name: 'Test', public: false });
        await model.users.join_workspace(me.id, ws.id);
        await model.users.remove_workspace(ws.id);
        const rows = (await pool.query('select * from workspaces;')).rows;
        expect(rows).toHaveLength(0);
        done();
    });

});

describe('Pwned password', () => {
    test('Bad passwords', async done => {
        let hrstart = process.hrtime()
        let r = await model.users.check_password_not_pwned('1234');
        let hrend = process.hrtime(hrstart);
        let msec = hrend[0] * 1e3 + hrend[1] / 1e6
        log.info(`${msec} msec for API`)
        expect(r).toBe(false);
        hrstart = process.hrtime()
        r = await model.users.check_password_not_pwned('password');
        hrend = process.hrtime(hrstart);
        msec = hrend[0] * 1e3 + hrend[1] / 1e6
        log.info(`${msec} msec for API`)
        expect(r).toBe(false);
        done();
    });
    test('Safe passwords', async done => {
        let password = await random_str_b58();
        let hrstart = process.hrtime()
        let r = await model.users.check_password_not_pwned(password);
        let hrend = process.hrtime(hrstart);
        let msec = hrend[0] * 1e3 + hrend[1] / 1e6
        expect(r).toBe(true);
        log.info(`${msec} msec for API`)
        password = await random_str_b58();
        hrstart = process.hrtime()
        r = await model.users.check_password_not_pwned(password);
        hrend = process.hrtime(hrstart);
        msec = hrend[0] * 1e3 + hrend[1] / 1e6
        log.info(`${msec} msec for API`)
        expect(r).toBe(true);
        done();
    });
})


describe('Password reset', () => {
    test('Generate and remove token', async done => {
        const user = await register();
        const { token, expiresAt } = await model.users.make_password_reset_token(user);
        let u2 = await model.users.get_user_for_reset_password_token(token);
        expect(u2).toEqual(user);
        await model.users.remove_password_reset_token(token);
        u2 = await model.users.get_user_for_reset_password_token(token);
        expect(u2).toBeNull();
        done();
    });

    test('Execute resetting password', async done => {
        const password = random_str(16);
        const user = await register({ password });
        const new_password = random_str(16);
        expect(model.users.match_password(user.username, password)).resolves.toBe(true);
        expect(model.users.match_password(user.username, new_password)).resolves.toBe(false);
        const { token, expiresAt } = await model.users.make_password_reset_token(user);
        await model.users.reset_password_from_link(token, new_password);
        let u2 = await model.users.get_user_for_reset_password_token(token);
        expect(u2).toBeNull();
        expect(model.users.match_password(user.username, password)).resolves.toBe(false);
        expect(model.users.match_password(user.username, new_password)).resolves.toBe(true);
        done();
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