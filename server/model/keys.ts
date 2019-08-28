import { db } from './utils'
import * as ethereum from './ethereum'
import * as credentials from '../private/credential'
import { fingerPrint } from '../../common/common_model'

export async function update_public_key({ user_id, for_user, jwk }: { user_id: string, for_user: string, jwk: JsonWebKey }): Promise<{ ok: boolean, error?: string }> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        for_user = for_user != null ? for_user : '';
        console.log('update_public_key', { user_id, for_user, timestamp, jwk })
        if (user_id != null && jwk != null) {
            db.run('update public_keys set user_id=?, for_user=?, public_key=?, timestamp=? where user_id=? and for_user=?;', user_id, for_user, JSON.stringify(jwk), timestamp, user_id, for_user, (err) => {
                if (!err) {
                    console.log(user_id);
                    resolve({ ok: true });
                } else {
                    resolve({ ok: false, error: 'Update error: ' + err });
                }
            });
        } else {
            resolve({ ok: false, error: 'Params user_id or jwk is null' });
        }
    });
}

export async function register_public_key({ user_id, for_user, jwk, privateKeyFingerprint }: { user_id: string, for_user: string, jwk: JsonWebKey, privateKeyFingerprint: string }): Promise<{ ok: boolean, timestamp?: number }> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        for_user = for_user != null ? for_user : '';
        console.log('register_public_key', { user_id, for_user, jwk })
        if (user_id != null && jwk != null) {
            db.run('insert into public_keys (user_id,for_user,public_key,timestamp,private_fingerprint) values (?,?,?,?,?);', user_id, for_user, JSON.stringify(jwk), timestamp, privateKeyFingerprint, (err) => {
                if (!err) {
                    console.log(user_id);
                    fingerPrint(jwk).then((pub_fp) => {
                        ethereum.add_to_ethereum(credentials.ethereum, user_id, timestamp, pub_fp).then(() => {
                            console.log('add_to_ethereum done');
                        })
                    });
                    resolve({ ok: true, timestamp });
                } else {
                    console.log('register_public_key', err);
                    resolve({ ok: false });
                }
            });
        } else {
            console.log('register_public_key error', user_id, jwk)
            resolve({ ok: false });
        }
    });
}


export async function get_public_key({ user_id, for_user }: { user_id: string, for_user: string }): Promise<{ publicKey: JsonWebKey, prv_fingerprint: string }> {
    return new Promise((resolve) => {
        db.get('select * from public_keys where user_id=? and for_user=? order by timestamp desc limit 1', user_id, for_user, (err, row) => {
            if (!err && row) {
                resolve({ publicKey: JSON.parse(row['public_key']), prv_fingerprint: row['private_fingerprint'] });
            } else {
                resolve({ publicKey: null, prv_fingerprint: null });
            }
        });
    });
}


export async function get_private_key(user_id: string): Promise<{ ok: boolean, privateKey: JsonWebKey }> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        db.get('select * from private_key_temporary where user_id=?;', user_id, (err, row) => {
            resolve({ ok: !!row, privateKey: row ? JSON.parse(row['private_key']) : undefined });
        });
    });
}

export async function temporarily_store_private_key(user_id: string, key: JsonWebKey): Promise<boolean> {
    return new Promise((resolve) => {
        const key_str = JSON.stringify(key);
        const timestamp = new Date().getTime();
        console.log('temporarily_store_private_key 1');
        db.run('insert into private_key_temporary (user_id,timestamp,private_key) values (?,?,?);', user_id, timestamp, key_str, (err) => {
            console.log('temporarily_store_private_key 2');
            if (err) {
                db.run('update private_key_temporary set timestamp=?,private_key=? where user_id=?;', timestamp, key_str, user_id, (err2) => {
                    resolve(err2 == null);
                });
            } else {
                resolve(true);
            }
        });
    });
}

export async function remove_old_temporary_private_key() {
    return new Promise((resolve) => {
        const threshold = new Date().getTime() - 1000 * 60 * 5; // 5 minutes
        db.run('delete from private_key_temporary where timestamp<?', threshold, (err) => {
            resolve(!err);
        });
    });
}
