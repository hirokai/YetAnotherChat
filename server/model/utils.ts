import * as shortid_ from 'shortid';
import * as CryptoJS from "crypto-js";
import * as credentials from '../private/credential';
import { createCipher, createDecipher } from 'crypto';
import * as bunyan from 'bunyan';
export const log = bunyan.createLogger({ name: "model", src: true, level: 1 });

shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
export const shortid = shortid_.generate;

import { Pool, Client } from 'pg';

export let pool: Pool;
export let client: Client;

export async function connectToDB(database?: string) {
    // pools will use environment variables
    // for connection information
    if (database == 'test') {
        pool = new Pool({
            database: 'test',
            user: 'hiroyuki'
        });
        client = new Client({
            database: 'test',
            user: 'hiroyuki'
        });
    } else {
        pool = new Pool();
        client = new Client();
    }
    await client.connect();
}

export function cipher(plainText: string, password: string = credentials.cipher_secret): string | null {
    try {
        var cipher = createCipher('aes192', password);
        var cipheredText = cipher.update(plainText, 'utf8', 'hex');
        cipheredText += cipher.final('hex');
        // log.debug('ciphered length', cipheredText.length);
        return cipheredText;

    } catch (e) {
        log.debug(e, plainText);
        return null;
    }
}

export function decipher(cipheredText: string, password: string = credentials.cipher_secret): string | null {
    try {
        var decipher = createDecipher('aes192', password);
        var dec = decipher.update(cipheredText, 'hex', 'utf8');
        dec += decipher.final('utf8');
        // log.debug('deciphered length', dec.length);
        return dec;
    } catch (e) {
        log.debug(e, cipheredText);
        return null;
    }
}

export function cipher2(plainText: string, password: string = credentials.cipher_secret) {
    try {
        var cipheredText: string = CryptoJS.AES.encrypt(plainText, password).toString();
        return cipheredText;
    } catch (e) {
        log.debug(e, plainText);
        return null;
    }
}

export function decipher2(cipheredText: string, password: string = credentials.cipher_secret) {
    try {
        var bytes = CryptoJS.AES.decrypt(cipheredText, password);
        var depheredText = bytes.toString(CryptoJS.enc.Utf8);
        return depheredText;
    } catch (e) {
        log.debug(e, cipheredText);
        return null;
    }
}
