import { shortid, pool } from './utils'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.email", src: true, level: 1 });
import { simpleParser } from 'mailparser';


export async function add(parsed) {
    log.debug('adding', parsed);
    const id = shortid();
    const r = await pool.query('select count(*) from email where message_id=$1;', [parsed.messageId]);
    const existing = r.rows[0].count > 0;
    if (existing) {
        await pool.query('delete from email where message_id=$1;', [parsed.messageId]);
    }
    await pool.query('insert into email (id,timestamp,message_id,subject,email_text,email_from) values ($1,$2,$3,$4,$5,$6);', [id, new Date(parsed.date).valueOf(), parsed.messageId, parsed.subject, parsed.text, parsed.from.text]);
    return { ok: true, overwrite: existing };
}

export async function list(params: any) {
    const es = await pool.query('select * from email;')
    return es.rows;
}

export async function get(params: { user_id: string, message_id: string }) {
    const es = await pool.query('select * from email where message_id=$1;', [params.message_id]);
    log.debug(es.rows[0]);
    const data = { message_id: es.rows[0].message_id, subject: es.rows[0].subject || "", from: es.rows[0].email_from }
    return data;
}


export async function parseEmail(data) {
    const parsed = await simpleParser(data);
    log.debug(Object.keys(parsed));
    return parsed;
}