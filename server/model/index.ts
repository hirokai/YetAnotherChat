/// <reference path="../../common/types.d.ts" />

import * as fs from "fs";
const path = require('path');
import { map, keyBy, difference } from 'lodash';

import { db } from './utils'

import * as users_ from './users'
export const users = users_;
import * as files_ from './files'
export const files = files_;
import * as sessions_ from './sessions'
export const sessions = sessions_;
import * as keys_ from './keys'
export const keys = keys_;
import * as _ from 'lodash';
import moment from 'moment';

export function make_email_content(c: CommentTyp): string {
    return c.comment + '\r\n\r\n--------\r\n' + 'このメールに返信すると，COI SNS上で会話を続けられます。\r\n' + 'COI SNSでリアルタイムチャット： ' + 'https://coi-sns.com/main#/sessions/' + c.session_id;
}

export async function post_file_to_session(session_id: string, user_id: string, file_id: string): Promise<{ ok: boolean }> {
    if (null == file_id) {
        return { ok: false };
    }
    const timestamp = new Date().getTime();
    const r = await files_.get(file_id);
    if (r != null) {
        const { ok } = await sessions.post_comment({ user_id, session_id, timestamp, comment: "<__file::" + file_id + "::" + r.url + ">", for_user: "", encrypt: 'none' });
        return { ok };
    }
}

export async function list_comment_delta({ for_user, session_id, cached_ids, last_updated }: { for_user: string, session_id: string, cached_ids: string[], last_updated: number }): Promise<CommentChange[]> {
    const comments = await sessions.list_comments(for_user, session_id, null);
    console.log('Comments length:', comments.length);
    return new Promise((resolve) => {
        const cached_id_dict = keyBy(cached_ids);
        var delta: CommentChange[] = [];
        if (comments.length == 0) {
            resolve([]);
        } else {
            comments.forEach((comment) => {
                const already = cached_id_dict[comment.id];
                if (!already) {
                    delta.push({ __type: 'new', comment });
                } else if (comment.timestamp > last_updated) {
                    delta.push({ __type: 'update', id: comment.id, comment });
                }
            });
            const current_ids = map(comments, 'id');
            const removed_ids = difference(cached_ids, current_ids);
            // console.log('cached and current', for_user, cached_ids, current_ids)
            removed_ids.forEach((id) => {
                delta.push({ __type: 'delete', id });
            });
            resolve(delta);
        }
    });
}

export function get_original_email_highlighted(mail_id: string): Promise<{ lines: { line: string, highlight: boolean }[], subject: string, range: { start: number, end: number } }> {
    return new Promise((resolve, reject) => {
        const m = mail_id.match(/(.+)::lines=(\d+)-(\d+)/);
        if (m) {
            const [message_id, start_s, end_s] = [m[1], m[2], m[3]];
            const [start, end] = [+start_s, +end_s];
            const file_path = path.join(__dirname, '../imported_data/mailgun/' + message_id + '.json');
            console.log(file_path);
            fs.readFile(file_path, 'utf8', (err, s: string) => {
                if (err) {
                    console.log(err);
                    reject();
                } else {
                    const obj = JSON.parse(s);
                    const subject = obj['Subject'];
                    const lines = map(<string[]>obj['body-plain'].split('\r\n'), (line, ii) => {
                        const i = ii + 1;
                        return { line, highlight: i >= start && i <= end };
                    });
                    resolve({ lines, subject, range: { start, end } });
                }
            });
        } else {
            reject('Mail url is wrong.');
        }
    });
}

export async function delete_connection(socket_id: string): Promise<{ user_id: string, online: boolean, timestamp: number }> {
    return new Promise((resolve) => {
        db.get('select user_id from user_connections where socket_id=?;', socket_id, (err, row) => {
            if (row) {
                const user_id = row['user_id'];
                const timestamp = new Date().getTime();
                db.run('delete from user_connections where socket_id=?;', socket_id, () => {
                    db.get('select count(*) from user_connections where user_id=?;', user_id, (err1, row1) => {
                        console.log('select count(*) from user_connections', user_id, err1, row1);
                        const online: boolean = !!(row1 && row1['count(*)'] > 0);
                        resolve({ user_id, online, timestamp });
                    });
                });
            } else {
                resolve({ user_id: null, online: false, timestamp: null });
            }
        });
    });
}

export async function delete_connection_of_user(user_id: string): Promise<{ timestamp: number }> {
    return new Promise((resolve) => {
        const timestamp = new Date().getTime();
        db.run('delete from user_connections where user_id=?;', user_id, () => {
            resolve({ timestamp });
        });
    });
}

export async function delete_all_connections(): Promise<boolean> {
    return new Promise((resolve) => {
        db.run('delete from user_connections;', (err) => {
            resolve(!err);
        });
    });
}

export function expandSpan(date: string, span: Timespan): string[] {
    console.log('expandSpan', span);
    if (span == Timespan.day) {
        return [date];
    } else if (span == Timespan.week) {
        const m = moment(date, "YYYYMMDD");
        return _.map(_.range(1, 8), (i) => {
            const m1 = _.clone(m);
            m1.isoWeekday(i);
            return m1.format("YYYYMMDD");
        });
    } else if (span == Timespan.month) {
        const m = moment(date, "YYYYMMDD");
        const daysList = [31, m.isLeapYear() ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return _.map(_.range(1, daysList[m.month()] + 1), (i: number) => {
            const m1 = _.clone(m);
            m1.date(i);
            return m1.format("YYYYMMDD");
        });
    }
}

export enum Timespan {
    day,
    week,
    month
}
