import * as model from './index'

export const random_str = (N) => {
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