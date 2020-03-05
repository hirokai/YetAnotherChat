// Fill the values and rename this file to user_info.ts

const _ = require('lodash');

const users = [
    ['Alice', 'alice@XXX.com'],
    ['Bob', 'bob@YYY.com'],
    ['Chris', 'chris@ZZZ.com']];

const emails = [
    ['Alice', 'alice@XXX.com'],
    ['Bob', 'bob@YYY.com'],
    ['Chris', 'chris@ZZZ.com']];

export const find_user = ({ email, name }): string | null => {
    console.log('find_user', email, name)
    const email1 = _.find(emails, (e) => { return email && email.indexOf(e[1]) != -1; });
    const user = _.find(users, (u) => { return name && name.indexOf(u[1]) != -1; });
    if (user) {
        return user[0];
    } else if (email1) {
        return email1[0];
    } else {
        return null;
    }
};

export const allowed_passwords = ['XXXX'];

export const mail_recipients_allowed = ['XXXX@XXXX.com'];

export const test_myself = { username: 'Alice', email: 'alice@XXX.com', fullname: 'Alice Brown', password: 'XXXXXX' };


