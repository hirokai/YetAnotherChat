import * as shortid_ from 'shortid';
import path from 'path'
import sqlite3 from 'sqlite3'
import * as CryptoJS from "crypto-js";
import * as credentials from '../private/credential';
import { createCipher, createDecipher } from 'crypto';

shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
export const shortid = shortid_.generate;

import { Pool, Client } from 'pg';

export let db: sqlite3.Database;
export let pool: Pool;
const default_database = path.join(__dirname, '../private/db.sqlite3');
export function connectToDB(db_path: string = default_database) {
    db = new sqlite3.Database(db_path);
}

export function connectToDB_postgres(db_path: string = default_database) {
    // pools will use environment variables
    // for connection information
    pool = new Pool();
    (async () => {
        const rows = await pool.query<User>('select * from users; ');
        console.log(rows.rows);
    })();
}

export const db_ = {
    run_: (query: string, ...rest) => {
        db.run(query, rest);
    },
    run: (query: string, ...args: any[]): void | Promise<any> => {
        return new Promise((resolve, reject) => {
            db.run(query, args, (err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve();
                }
            });

        });
    },
    get_: (query: string, ...rest) => {
        db.get(query, rest);
    },
    get: <T = any>(query: string, ...args: any[]): Promise<T> => {
        return new Promise((resolve, reject) => {
            db.get(query, args, (err, row: T) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(row);
                }
            });
        });
    },
    all_: (query: string, ...rest) => {
        db.all(query, rest);
    },
    all: <T = any>(query: string, ...args: any[]): Promise<T[]> => {
        return new Promise((resolve, reject) => {
            db.all(query, args, (err, rows) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(rows);
                }
            });
        });
    },
    serialize: (...rest) => {
        db.serialize(...rest);
    },
    close: (...rest) => {
        db.close(...rest);
    }
}

export function cipher(plainText: string, password: string = credentials.cipher_secret): string | null {
    try {
        var cipher = createCipher('aes192', password);
        var cipheredText = cipher.update(plainText, 'utf8', 'hex');
        cipheredText += cipher.final('hex');
        // console.log('ciphered length', cipheredText.length);
        return cipheredText;

    } catch (e) {
        console.log(e, plainText);
        return null;
    }
}

export function decipher(cipheredText: string, password: string = credentials.cipher_secret): string | null {
    try {
        var decipher = createDecipher('aes192', password);
        var dec = decipher.update(cipheredText, 'hex', 'utf8');
        dec += decipher.final('utf8');
        // console.log('deciphered length', dec.length);
        return dec;
    } catch (e) {
        console.log(e, cipheredText);
        return null;
    }
}

export function cipher2(plainText: string, password: string = credentials.cipher_secret) {
    try {
        var cipheredText: string = CryptoJS.AES.encrypt(plainText, password).toString();
        return cipheredText;
    } catch (e) {
        console.log(e, plainText);
        return null;
    }
}

export function decipher2(cipheredText: string, password: string = credentials.cipher_secret) {
    try {
        var bytes = CryptoJS.AES.decrypt(cipheredText, password);
        var depheredText = bytes.toString(CryptoJS.enc.Utf8);
        return depheredText;
    } catch (e) {
        console.log(e, cipheredText);
        return null;
    }
}
