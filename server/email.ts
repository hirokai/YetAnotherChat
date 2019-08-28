/// <reference path="../common/types.d.ts" />

import { db } from '../server/model/utils'
import * as model from './model';
import * as credentials from './private/credential';
import { find, map, includes, compact } from 'lodash';
import { mail_recipients_allowed } from './private/user_info';
'use strict'

const apiKey = credentials.mailgun;
const domain = 'mail.coi-sns.com'

const mailgun = require('mailgun-js')({ apiKey, domain })

function make_to(tos: User[]): string {
    console.log('make_to', tos);
    return compact(map(tos, (to) => {
        if (true) {
            // if (includes(mail_recipients_allowed, to.emails[0])) {
            console.log('Email allowed:', to.emails[0], mail_recipients_allowed);
            return (to.fullname || to.username) + " (on COI SNS) <" + to.emails[0] + ">";
        } else {
            console.log('Email NOT allowed:', to.emails[0], mail_recipients_allowed);
            return null;
        }
    })).join(', ');
}

function send_email({ subject, to: tos, from, content }: { subject: string, to: User[], from: User, content: string }) {
    if (from != null && tos != null && tos.length > 0 && content != null && content.trim() != '') {
        const to = make_to(tos);
        console.log('Mail sending to: ', to);
        console.log('Subject: ', subject);
        return;
        const data = {
            from: (from.fullname || from.username) + ' (COI SNS) <' + from.id + '@mail.coi-sns.com>',
            to,
            subject,
            text: content,
        }

        mailgun.messages().send(data)
            .then(body => console.log(body))
            .catch(err => console.error(err));
    }
}

// mailgun.messages.list()
//     .then(domains => console.log(domains)) // logs array of domains
//     .catch(err => console.log(err)); // logs any error

export async function send_emails_to_session_members({ session_id, user_id, comment }: { session_id: string, user_id: string, comment: string }): Promise<void> {
    const session = await model.sessions.get(session_id);
    const online_users = await model.users.list_online_users();
    const members = await model.sessions.get_members({ myself: user_id, session_id });
    const from: User = find(members, (m => m.id == user_id));
    if (from != null) {
        send_email({ subject: 'Re: ' + session.name, to: members, from, content: comment });
    }
}