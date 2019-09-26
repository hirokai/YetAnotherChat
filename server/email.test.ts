import * as model from './model';
import { exec as exec_ } from 'child_process'
import { connectToDB } from './model/utils'
import { random_str, register } from './model/test_utils'
import * as util from 'util'
const exec = util.promisify(exec_);

beforeEach(done => {
    return new Promise(async (resolve, reject) => {
        await exec('psql -d test < server/schema.sql');
        connectToDB('test');
        done();
    });
});

test('Find from email', async done => {
    const u1 = await register({ username: 'Kai', email: 'kai@tohoku.ac.jp' });
    const u2 = await register({ username: 'Kai2', email: 'hiroyuki.kai@gmail.com' });
    const u3 = await model.users.find_from_username('Kai');
    expect(u3).toEqual(u1);
    done();
});