import { connectToDB, shortid } from './utils'
import { exec as exec_ } from 'child_process'
import * as model from './index'
import * as util from 'util'
import * as _ from 'lodash';
import * as sessions from './sessions'
import { userInfo } from 'os';
import * as mail_algo from './mail_algo'

const exec = util.promisify(exec_);

jest.setTimeout(1000);

beforeEach(done => {
    return new Promise(async (resolve, reject) => {
        await exec('psql -d test < server/schema.sql');
        connectToDB('test');
        done();
    });
});

describe('Mail algo', () => {
    test('Remove quote', () => {
        const input = '> > >';
        const output = mail_algo.remove_quote_marks(input, 3);
        expect(output).toEqual('');
    })
})

describe('Find sessions', () => {
    test('find_groups', () => {
        const pairs = [
            ["a2", "a5"],
            ["a3", "a6"],
            ["a4", "a5"],
            ["a7", "a9"]
        ];
        const groups = mail_algo.find_groups(pairs);
        expect(groups).toHaveLength(3);
    })
})

describe('Email address parser', () => {
    test('Name and email', () => {
        const { email, name } = mail_algo.parse_email_address('John <john@test.com>');
        expect(name).toEqual('John');
        expect(email).toEqual('john@test.com');
    });
    test('Name and email 2', () => {
        const { email, name } = mail_algo.parse_email_address('山田 太郎<yamada@test.com>');
        expect(name).toEqual('山田 太郎');
        expect(email).toEqual('yamada@test.com');
    });
    test('Name and email 3', () => {
        const { email, name } = mail_algo.parse_email_address('山田 太郎[mailto:yamada@test.com]');
        expect(name).toEqual('山田 太郎');
        expect(email).toEqual('yamada@test.com');
    });
    test('Name only', () => {
        const { email, name } = mail_algo.parse_email_address('John');
        expect(name).toEqual('John');
        expect(email).toBeUndefined();
    });
    test('Email only', () => {
        const { email, name } = mail_algo.parse_email_address('john@test.com');
        expect(name).toBeUndefined();
        expect(email).toEqual('john@test.com');
    });
    test('Email only 2', () => {
        const { email, name } = mail_algo.parse_email_address('<john@test.com>');
        expect(name).toBeUndefined();
        expect(email).toEqual('john@test.com');
    });
});