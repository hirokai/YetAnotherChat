import * as shortid_ from 'shortid';
import path from 'path'
import sqlite3 from 'sqlite3'
import * as CryptoJS from "crypto-js";
import * as credentials from '../private/credential';

shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
export const shortid = shortid_.generate;

export const db = new sqlite3.Database(path.join(__dirname, '../private/db.sqlite3'));

export function cipher(plainText: string, password: string = credentials.cipher_secret) {
    try {
        var cipheredText: string = CryptoJS.AES.encrypt(plainText, password).toString();
        return cipheredText;
    } catch (e) {
        console.log(e, plainText);
        return null;
    }
}

export function decipher(cipheredText: string, password: string = credentials.cipher_secret) {
    try {
        var bytes = CryptoJS.AES.decrypt(cipheredText, password);
        var depheredText = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        return depheredText;
    } catch (e) {
        console.log(e, cipheredText);
        return null;
    }
}
