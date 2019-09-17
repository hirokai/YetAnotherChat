/// <reference path="../common/types.d.ts" />

import { db } from '../server/model/utils'
import * as model from './model';
import * as credentials from './private/credential';
import { find, map, includes, compact } from 'lodash';
import { mail_recipients_allowed } from './private/user_info';
import moment from 'moment-timezone'

moment.locale('ja', {
    weekdays: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],
    weekdaysShort: ["日", "月", "火", "水", "木", "金", "土"]
});

const apiKey = credentials.mailgun;
const domain = 'mail.coi-sns.com';
import { app_domain, timezone, enable_send_email } from './config';

const mailgun = require('mailgun-js')({ apiKey, domain })
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "email", src: true, level: 1 });

function make_to(tos: User[]): string {
    log.info('make_to', tos);
    return compact(map(tos, (to) => {
        if (true) {
            // if (includes(mail_recipients_allowed, to.emails[0])) {
            log.info('Email allowed:', to.emails[0], mail_recipients_allowed);
            return (to.fullname || to.username) + " (on COI SNS) <" + to.emails[0] + ">";
        } else {
            log.info('Email NOT allowed:', to.emails[0], mail_recipients_allowed);
            return null;
        }
    })).join(', ');
}


async function send_email_from_system({ subject, to: tos, content, dry_run = false }: { subject: string, to: User[], content: string, dry_run?: boolean }) {
    if (tos.length > 0 && content.trim() != '') {
        const to = make_to(tos);
        log.info('Mail sending to: ', to);
        log.info('Subject: ', subject);
        const data = {
            from: 'COI SNS <noreply@mail.coi-sns.com>',
            to,
            subject,
            text: content,
        }
        if (dry_run || !enable_send_email) {
            log.info('Dry run (no email actually sent)');
            log.info(data);
        } else {
            mailgun.messages().send(data)
                .then(body => log.info(body))
                .catch(err => console.error(err));
        }
    }
}

async function send_email({ subject, to: tos, from, content }: { subject: string, to: User[], from: User, content: string }) {
    if (from != null && tos != null && tos.length > 0 && content != null && content.trim() != '') {
        const to = make_to(tos);
        log.info('Mail sending to: ', to);
        log.info('Subject: ', subject);
        const data = {
            from: (from.fullname || from.username) + ' (COI SNS) <' + from.id + '@mail.coi-sns.com>',
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

// mailgun.messages.list()
//     .then(domains => log.info(domains)) // logs array of domains
//     .catch(err => log.info(err)); // logs any error

export async function send_emails_to_session_members({ session_id, user_id, comment }: { session_id: string, user_id: string, comment: string }): Promise<void> {
    const session = await model.sessions.get(user_id, session_id);
    const online_users = await model.users.list_online_users();
    const members = await model.sessions.get_members({ myself: user_id, session_id });
    const from = find(members, (m => m.id == user_id));
    if (from != null && session != null) {
        await send_email({ subject: 'Re: ' + session.name, to: members, from, content: comment });
    }
}

export async function send_reset_password_link(user: User) {
    const { token, expiresAt } = await model.users.make_password_reset_token(user);
    const recipent: string = user.fullname || user.username || 'ユーザー'
    const content = `
${recipent} 様

下記のリンクをクリックするとCOI SNSのパスワードをリセットします。

${app_domain}/reset_password/${token}

上記リンクの有効期限は${moment(expiresAt).tz(timezone).format('YYYY年MM月DD日(ddd) H時mm分 (z)')}です。
リセットを依頼した記憶のない場合はこのメールを無視するか，support@mail.coi-sns.comまでご連絡ください。
`;
    await send_email_from_system({ subject: 'パスワードのリセット', to: [user], content })
}