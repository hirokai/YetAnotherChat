import { pool } from './utils'
import * as ethereum from './ethereum'
import * as credentials from '../private/credential'
import { fingerPrint } from '../../common/common_model'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.keys", src: true, level: 1 });

export async function update_public_key({ user_id, for_user, jwk }: { user_id: string, for_user: string, jwk: JsonWebKey }): Promise<{ ok: boolean, error?: string }> {
    const timestamp = new Date().getTime();
    for_user = for_user != null ? for_user : '';
    log.debug('update_public_key', { user_id, for_user, timestamp, jwk })
    if (user_id != null && jwk != null) {
        try {
            await pool.query('update public_keys set user_id=$1, for_user=$2, public_key=$3, timestamp=$4 where user_id=$5 and for_user=$6;', [user_id, for_user, JSON.stringify(jwk), timestamp, user_id, for_user]);
            log.debug(user_id);
            return ({ ok: true });

        } catch (e) {
            return ({ ok: false, error: 'Update error: ' + e });
        }
    } else {
        return ({ ok: false, error: 'Params user_id or jwk is null' });
    }
}

export async function register_public_key({ user_id, for_user, jwk, privateKeyFingerprint }: { user_id: string, for_user: string, jwk: JsonWebKey, privateKeyFingerprint: string }): Promise<{ ok: boolean, timestamp?: number }> {
    const timestamp = new Date().getTime();
    for_user = for_user != null ? for_user : '';
    log.debug('register_public_key', { user_id, for_user, jwk })
    if (user_id != null && jwk != null) {
        const err = await pool.query('insert into public_keys (user_id,for_user,public_key,timestamp,private_fingerprint) values ($1,$2,$3,$4,$5);', [user_id, for_user, JSON.stringify(jwk), timestamp, privateKeyFingerprint]);
        if (!err) {
            log.debug(user_id);
            const pub_fp = await fingerPrint(jwk);
            //Do not "await" the following. It takes time.
            ethereum.add_to_ethereum(credentials.ethereum, user_id, timestamp, pub_fp).then(() => {
                log.debug('add_to_ethereum done');
            })
            return { ok: true, timestamp };
        } else {
            log.debug('register_public_key', err);
            return { ok: false };
        }
    } else {
        log.debug('register_public_key error', user_id, jwk)
        return { ok: false };
    }
}

async function get_public_key_internal({ user_id, for_user }: { user_id: string, for_user: string }): Promise<{ publicKey: JsonWebKey, prv_fingerprint: string } | null> {
    const row = (await pool.query('select * from public_keys where user_id=$1 and for_user=$2 order by timestamp desc limit 1', [user_id, for_user])).rows[0];
    if (row) {
        return { publicKey: JSON.parse(row['public_key']), prv_fingerprint: row['private_fingerprint'] };
    } else {
        return null;
    }
}

export async function get_public_key(user_id: string): Promise<{ publicKey: JsonWebKey, prv_fingerprint: string } | null> {
    return get_public_key_internal({ user_id, for_user: user_id });
}

export async function get_private_key(user_id: string): Promise<{ ok: boolean, privateKey: JsonWebKey }> {
    const row = (await pool.query('select * from private_key_temporary where user_id=$1;', [user_id])).rows[0];
    return { ok: !!row, privateKey: row ? JSON.parse(row['private_key']) : undefined };
}

export async function temporarily_store_private_key(user_id: string, key: JsonWebKey): Promise<boolean> {
    const key_str = JSON.stringify(key);
    const timestamp = new Date().getTime();
    try {
        await pool.query('insert into private_key_temporary (user_id,timestamp,private_key) values ($1,$2,$3);', [user_id, timestamp, key_str]);
    } catch{
    }
    try {
        await pool.query('update private_key_temporary set timestamp=$1,private_key=$2 where user_id=$3;', [timestamp, key_str, user_id]);
        return true;
    } catch{
        return false;
    }
}

export async function remove_old_temporary_private_key() {
    const threshold = new Date().getTime() - 1000 * 60 * 5; // 5 minutes
    await pool.query('delete from private_key_temporary where timestamp<$1', [threshold]);
}
