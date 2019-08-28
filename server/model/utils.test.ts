import * as utils from './utils'

const random_str = (N) => {
    const S = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return Array.from(Array(N)).map(() => S[Math.floor(Math.random() * S.length)]).join('');
};

test('Cipher and decipher', () => {
    const password = random_str(16);
    const plain = random_str(16);
    const ciphered = utils.cipher(plain, password);
    expect(ciphered).not.toEqual(plain);
    expect(utils.decipher(ciphered, password)).toEqual(plain);
});

test('Cipher and decipher: 2', () => {
    const password = random_str(16);
    const plain = random_str(16);
    const ciphered = utils.cipher2(plain, password);
    expect(ciphered).not.toEqual(plain);
    expect(utils.decipher2(ciphered, password)).toEqual(plain);
});

