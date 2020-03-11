import { shortid, pool } from './utils'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.email", src: true, level: 1 });
import { simpleParser } from 'mailparser';
import _ from 'lodash';
import * as credentials from '../private/credential';


const apiKey = credentials.mailgun;
const domain = 'mail.coi-sns.com';
import { app_domain, timezone, enable_send_email } from '../config';

const mailgun = require('mailgun-js')({ apiKey, domain })

async function send_email({ subject, to, from, content }: { subject: string, to: string, from: string, content: string }) {
    if (from != null && content != null && content.trim() != '') {
        log.info('Mail sending to: ', to);
        log.info('Subject: ', subject);
        const data = {
            from,
            to,
            subject,
            text: content,
        }
        if (!enable_send_email) {
            log.info('Dry run (no email actually sent)');
            log.info(data);
        } else {
            mailgun.messages().send(data)
                .then(body => log.info(body))
                .catch(err => console.error(err));
        }
    }
}

export async function add(parsed) {
    const mid = parsed.messageId.slice(1, parsed.messageId.length - 1);
    log.debug('adding', mid);
    const id = shortid();
    const r = await pool.query('select count(*) from email where message_id=$1;', [mid]);
    const existing = r.rows[0].count > 0;
    if (existing) {
        await pool.query('delete from email where message_id=$1;', [mid]);
    }
    await pool.query('insert into email (id,timestamp,message_id,subject,email_text,email_from) values ($1,$2,$3,$4,$5,$6);', [id, new Date(parsed.date).valueOf(), mid, parsed.subject, parsed.text, parsed.from.text]);
    return { ok: true, overwrite: existing };
}

export async function reply(params: { user_id: string, reply_to: string, message: string }) {
    const content = params.message + '\n\n COI SNSで返信： http://localhost:3000/reply/' + params.reply_to
    await send_email({ to: 'kai@tohoku.ac.jp', content, from: 'hiroyuki.kai@gmail.com', subject: 'Reply' });
    return { ok: false, error: 'Stub' };
}

export async function list(_params: any): Promise<Email[]> {
    const es = await pool.query('select * from email order by timestamp desc;')
    return es.rows.map((r) => { return { subject: r.subject, date: r.date, from: r.email_from, text: r.email_text, message_id: r.message_id, timestamp: parseInt(r.timestamp) } });
}

export async function get(params: { user_id: string, message_id: string }) {
    const e = (await pool.query('select * from email where message_id=$1;', [params.message_id])).rows[0];
    log.debug(e);
    if (e) {
        const data = { message_id: e.message_id, subject: e.subject || "", from: e.email_from, text: e.email_text }
        return data;
    } else {
        return undefined;
    }
}


export async function parseEmail(data) {
    const parsed = await simpleParser(data);
    // log.debug(Object.keys(parsed));
    return parsed;
}