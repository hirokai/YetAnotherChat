/// <reference path="../common/types.d.ts" />

import axios from 'axios';
import { map, clone, includes, pull, without, sortBy, take, find, min, filter, keyBy } from 'lodash-es';
import moment from 'moment';
const shortid = require('shortid').generate;
import $ from 'jquery';
import * as credentials from '../server/private/credential';
import * as crypto from './cryptography';

export type ChatEntry = CommentTyp | SessionEvent | ChatFile;

export class Model {
    token: string
    privateKey: JsonWebKey
    publicKeys: { [key: string]: JsonWebKey } = {}
    snapshot: { [key: string]: { [key: number]: any } };
    readonly MAX_SAVE_SNAPSHOT: number = 2;
    constructor(token: string, privateKey: JsonWebKey) {
        this.token = token;
        this.privateKey = privateKey;
        this.snapshot = {};
    }
    getSnapshot(resource: string, timestamp: number = -1): any {
        if (resource in this.snapshot && timestamp in this.snapshot[resource]) {
            return this.snapshot[resource][timestamp];
        }
    }
    setSnapshot(resource: string, timestamp: number, data: any): void {
        if (!(resource in this.snapshot)) {
            this.snapshot[resource] = {};
        }
        this.snapshot[resource][timestamp] = data;
        this.snapshot[resource][-1] = data;  //latest
        const timestamps: number[] = without(map(Object.keys(this.snapshot[resource]), (s) => parseInt(s, 10)), -1);
        // console.log('keys', Object.keys(this.snapshot[key]), timestamps);
        if (timestamps.length > this.MAX_SAVE_SNAPSHOT) {
            const to_discard: number[] = take(sortBy(timestamps), timestamps.length - this.MAX_SAVE_SNAPSHOT);
            // console.log('to_discard', to_discard);
            to_discard.forEach((ts: number) => {
                delete this.snapshot[resource][ts];
                // console.log('snapshot discarded', key, ts);
            });
        }
        console.log('setSnapshot', this.snapshot);
    }
    changeHandler(msg: any, clientHandler: (vs: any) => void) {
        console.log('Socket.io message', msg);
        const temporary_id_list = [];
        if (includes(temporary_id_list, msg.temporary_id)) {
            pull(temporary_id_list, msg.temporary_id);
            return;
        }
        if (msg.__type == "new_session") {
            const msg1 = <RoomInfoClient>msg;
            msg1.timestamp = formatTime(msg.timestamp);
            msg1.firstMsgTime = -1;
            msg1.lastMsgTime = -1;
            msg1.numMessages = { "__total": 0 };
            msg = msg1;
            clientHandler(msg);
        } else if (msg.__type == "new_member") {
            const msg1 = <any>msg;
            msg1.timestamp = formatTime(msg.timestamp);
            msg = msg1;
            clientHandler(msg);
        } else if (msg.__type == "new_file") {
            const msg1 = <any>msg;
            // msg1.timestamp = formatTime(msg.timestamp);
            msg = msg1;
            clientHandler(msg);
        }
    }
    users = {
        get: async (): Promise<User[]> => {
            return new Promise((resolve) => {
                console.log({ params: { token: this.token } });
                const snapshot = null;
                // const snapshot = this.getSnapshot('users', -1);
                if (snapshot) {
                    console.log('Returning snapshot users.')
                    return new Promise((resolve) => {
                        resolve(snapshot);
                    });
                } else {
                    axios.get('/api/users', { params: { token: this.token } }).then(({ data }: AxiosResponse<GetUsersResponse>) => {
                        const timestamp = new Date().getTime();
                        const users = data.data.users;
                        this.setSnapshot('users', timestamp, users);
                        resolve(users);
                    });
                }
            });
        },
        on_update: (msg: UsersUpdateSocket) => {
            console.log('users.on_update', msg);
            const timestamp = new Date().getTime();
            var users: User[] = this.getSnapshot('users', -1);
            const u = find(users, { id: msg.user_id });
            if (u != null) {
                u.online = msg.online;
                this.setSnapshot('users', timestamp, users);
            }
        }
    }
    comments = {
        list_for_session: (session: string): Promise<any> => {
            const key = 'comments.session.' + session;
            const params: GetCommentsParams = { session, token: this.token };
            const timestamp = new Date().getTime();
            const snapshot: ChatEntryClient[] = this.getSnapshot(key, -1);
            if (snapshot) {
                console.log('Returning snapshot.')
                return new Promise((resolve) => {
                    resolve(snapshot);
                });
            } else {
                return axios.get('/api/comments', { params }).then(({ data }: { data: ChatEntry[] }) => {
                    const comments: ChatEntryClient[] = processData(data)
                    this.setSnapshot(key, timestamp, comments);
                    return comments;
                });
            }
        },
        list_for_user: (user: string): Promise<ChatEntryClient[]> => {
            return axios.get('/api/comments', { params: { user, token: this.token } }).then(({ data }) => {
                return processData(data);
            });
        },
        new: async ({ comment, session }: { comment: string, session: string }): Promise<void> => {
            const room: RoomInfo = await this.sessions.get(session);
            const temporary_id = shortid();
            const users: User[] = this.getSnapshot('users') || [];
            const userDict: { [key: string]: User } = keyBy(users, (u: User) => u.id);
            const comment_encoded = crypto.toUint8Aarray(comment);
            const ds = await Promise.all(map(room.members, ({ id, publicKey }) => {
                const imp_pub = crypto.importKey(publicKey);
                const imp_prv = crypto.importKey(this.privateKey);
                return Promise.all([imp_pub, imp_prv]);
            })).then((ps) => {
                return Promise.all(map(ps, ([imp_pub, imp_prv]) => {
                    return crypto.encrypt(imp_pub, imp_prv, comment_encoded);
                }));
            })
            const comments = map(ds, (d: EncryptedData, i: number) => {
                return { for_user: room.members[i].id, content: d.data };
            })
            const obj: PostCommentData = { comments, session, temporary_id, encrypt: 'ecdh.v1', token: this.token };
            const { data: { data } }: AxiosResponse<PostCommentResponse> = await axios.post('/api/comments', obj);
        },
        on_new: async (msg: CommentsNewSocket): Promise<string> => {
            const timestamp = msg.timestamp;
            var msg1: ChatEntryClient = {
                id: msg.id,
                user: msg.user,
                comment: msg.comment,
                session: msg.session_id,
                timestamp: formatTime(msg.timestamp),
                originalUrl: msg.original_url,
                sentTo: msg.sent_to,
                source: msg.source,
                kind: msg.kind,
                action: ""
            };
            const snapshot: ChatEntryClient[] = this.getSnapshot('comments.session.' + msg.session_id, -1);
            if (snapshot != null) {
                snapshot.push(msg1);
                this.setSnapshot('comments.session.' + msg.session_id, timestamp, snapshot);
                return msg.session_id;
            } else {
                console.log(this.snapshot);
                return null;
            }
        },
        on_delete: async (msg: CommentsDeleteSocket): Promise<{ id: string, session_id: string }> => {
            const key = 'comments.session.' + msg.session_id;
            const snapshot: ChatEntryClient[] = this.getSnapshot(key, -1) || [];
            const new_vs = filter(snapshot, (c) => {
                return c.id != msg.id;
            });
            this.setSnapshot(key, -1, new_vs);
            return { id: msg.id, session_id: msg.session_id };
        }
    }
    sessions = {
        list: () => {
            const params: AuthedParams = { token: this.token };
            return axios.get('/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
                const timestamp = new Date().getTime();
                this.setSnapshot('sessions', timestamp, data.data);
                const values1: RoomInfoClient[] = map(data.data, (r): RoomInfoClient => {
                    var s: any = clone(r);
                    s.timestamp = formatTime(r.timestamp);
                    return s;
                });
                return values1;
            });
        },
        get: async (id: string): Promise<RoomInfo> => {
            const params: AuthedParams = { token: this.token };
            const { data: r }: { data: GetSessionResponse } = await axios.get('/api/sessions/' + id, { params });
            return r.data;
        },
        new: async ({ name, members }: { name: string, members: string[] }): Promise<{ newRoom: any, sessions: any, messages: any }> => {
            const temporary_id = shortid();
            const post_data: PostSessionsParam = { name, members, temporary_id, token: this.token };
            const { data: newRoom }: PostSessionsResponse = await $.post('/api/sessions', post_data);
            const p1 = axios.get('/api/sessions', { params: { token: this.token } });
            const p2 = axios.get('/api/comments', { params: { session: newRoom.id, token: this.token } });
            const [{ data: { data: sessions } }, { data: { data: messages } }] = await Promise.all([p1, p2]);
            return { newRoom, sessions, messages };
        },
        delete: async (id: string) => {
            const { data }: AxiosResponse<CommentsDeleteResponse> = await axios.delete('/api/sessions/' + id, { data: { token: this.token } });
            return data;
        },
        on_new: async (msg: SessionsNewSocket): Promise<void> => {
            console.log('sessions.on_new', msg);
            return;
        },
        on_update: async (msg: SessionsUpdateSocket): Promise<void> => {
            console.log('sessions.on_update', msg);
            const values: RoomInfo[] = this.getSnapshot('sessions');
            const new_values = map(values, (v) => {
                if (v.id == msg.id) {
                    v.name = msg.name;
                }
                return v;
            })
            this.setSnapshot('sessions', msg.timestamp, new_values);
            return;
        }
    }
}

export const processData = (res: ChatEntry[]): ChatEntryClient[] => {
    return map(res, (m1) => {
        // console.log('processData', m1);
        const user: string = m1.user_id;
        switch (m1.kind) {
            case "comment": {
                const m = <CommentTyp>m1;
                var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
                // v.comment = decipher_client(m.comment, credentials.cipher_secret);
                // console.log('decipher_client', v.comment);
                v.comment = m.comment;
                v.originalUrl = m.original_url || "";
                v.sentTo = m.sent_to || "";
                v.source = m.source;
                return v;
            }
            case "event": {
                const m = <SessionEvent>m1;
                var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
                v.comment = "（参加しました）";
                v.action = m.action;
                return v;
            }
            case "file": {
                const m = <ChatFile>m1;
                var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
                v.comment = "（ファイル：" + m.url + "）";
                v.url = m.url;
                return v;
            }
        }
    });
};

export function formatTime(timestamp: number): string {
    if (timestamp < 0) {
        return '(日時不明)'
    } else {
        return moment(timestamp).format('YYYY/M/D HH:mm:ss');
    }
}

