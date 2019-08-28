import { shortid } from './utils'
import * as mail_algo from './mail_algo'
import { map } from 'lodash';

export function parse_mailgun_webhook(body): MailgunParsed {
    const timestamp = new Date(body['Date']).getTime();
    const comment = body['stripped-text'];
    const message_id = body['Message-Id'];
    const from = body['From'];
    const sent_to = body['To'];
    const id = shortid();
    const subject = body['Subject'];
    const s = body['References'];
    const references = s ? s.split(/\s+/) : [];
    const data = {
        id,
        from,
        message_id,
        lines: { start: 1, end: comment.split('\r\n').length },
        timestamp,
        comment,
        sent_to,
        body,
        references,
        subject,
        heading: ''
    };
    return data;
}

export function parse_mailgun_webhook_thread(body): MailgunParsed[] {
    const timestamp = new Date(body['Date']).getTime();
    const comment = body['body-plain'];
    const items: MailThreadItem[] = mail_algo.split_replies(comment);
    if (!items) {
        return [];
    }
    // console.log('parseMailgunWebhookThread: split', items.length);
    const message_id = body['Message-Id'];
    // const user = body['From'];
    // const user_id: string = user_info_private.find_user(body['From']);
    const from = body['From']
    const sent_to = body['To'];
    const subject = body['Subject'];
    const s = body['References'];
    const references = s ? s.split(/\s+/) : [];
    items[0].from = from;
    items[0].timestamp = timestamp;
    return map(items, (item: MailThreadItem) => {
        const data = {
            id: shortid(),
            from: item.from,
            message_id,
            lines: item.lines,
            timestamp: item.timestamp,
            comment: item.comment,
            sent_to,
            body,
            references,
            subject,
            heading: item.heading
        };
        return data;
    });
}
