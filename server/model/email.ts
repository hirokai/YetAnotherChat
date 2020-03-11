import { shortid, pool } from './utils'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.email", src: true, level: 1 });
import { simpleParser } from 'mailparser';
import e = require('express');
import _ from 'lodash';

export async function add(parsed) {
    log.debug('adding', parsed.messageId);
    const id = shortid();
    const r = await pool.query('select count(*) from email where message_id=$1;', [parsed.messageId]);
    const existing = r.rows[0].count > 0;
    if (existing) {
        await pool.query('delete from email where message_id=$1;', [parsed.messageId]);
    }
    await pool.query('insert into email (id,timestamp,message_id,subject,email_text,email_from) values ($1,$2,$3,$4,$5,$6);', [id, new Date(parsed.date).valueOf(), parsed.messageId, parsed.subject, parsed.text, parsed.from.text]);
    return { ok: true, overwrite: existing };
}

export async function list(params: any): Promise<Email[]> {
    const es = await pool.query('select * from email order by timestamp desc;')
    return es.rows.map((r) => { return { subject: r.subject, date: r.date, from: r.email_from, text: r.email_text, message_id: r.message_id, timestamp: parseInt(r.timestamp) } });
}

export async function get(params: { user_id: string, message_id: string }) {
    const e = (await pool.query('select * from email where message_id=$1;', [params.message_id])).rows[0];
    log.debug(e);
    const data = { message_id: e.message_id, subject: e.subject || "", from: e.email_from, text: e.email_text }
    return data;
}


export async function parseEmail(data) {
    const parsed = await simpleParser(data);
    // log.debug(Object.keys(parsed));
    return parsed;
}