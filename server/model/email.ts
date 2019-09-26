import { shortid } from './utils'
import * as mail_algo from './mail_algo'
import { map } from 'lodash';
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "model.email", src: true });

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
    items[0].timestamp = timestamp;
    items[0].from = body['From'];

    if (items.length == 0) {
        return [];
    }
    // log.debug('parseMailgunWebhookThread: split', items.length);
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
    return map(items, (item: MailThreadItem, i: number) => {
        const data: MailgunParsed = {
            id: shortid(),
            from: item.from || 'N/A',
            message_id: i == 0 ? message_id : undefined,
            lines: item.lines || { start: 0, end: 0 },
            timestamp: item.timestamp || 0,
            comment: item.comment,
            sent_to,
            body,
            references,
            subject,
            heading: item.heading || ''
        };
        return data;
    });
}
