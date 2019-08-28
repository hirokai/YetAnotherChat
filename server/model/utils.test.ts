import * as utils from './utils'
import * as fc from 'fast-check';

const random_str = (N) => {
    const S = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return Array.from(Array(N)).map(() => S[Math.floor(Math.random() * S.length)]).join('');
};

test('Cipher and decipher', async done => {
    await fc.assert(
        fc.property(fc.fullUnicodeString(100), fc.fullUnicodeString(100), (password, plain) => {
            const ciphered = utils.cipher(plain, password);
            const deciphered = utils.decipher(ciphered, password);
            return plain == deciphered;
        }),
        { numRuns: 1000, verbose: false }
    );
    done();
});

test('Cipher and decipher: 2', async done => {
    await fc.assert(
        fc.property(fc.fullUnicodeString(100), fc.fullUnicodeString(100), (password, plain) => {
            const ciphered = utils.cipher2(plain, password);
            const deciphered = utils.decipher2(ciphered, password);
            return plain == deciphered;
        }),
        { numRuns: 1000, verbose: false }
    );
    done();
});

