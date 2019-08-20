/// <reference path="../common/types.d.ts" />

import axios from 'axios';
import { map, clone, includes, pull, without, sortBy, take, find, filter } from 'lodash-es';
import moment from 'moment';
const shortid = require('shortid').generate;
import $ from 'jquery';
import * as crypto from './cryptography';

export type ChatEntry = CommentTyp | SessionEvent | ChatFile;

export class Model {
    token: string
    keyPair: CryptoKeyPair
    privateKeyJson: object
    publicKeys: { [key: string]: CryptoKey } = {}
    snapshot: { [key: string]: { [key: number]: any } };
    readonly MAX_SAVE_SNAPSHOT: number = 2;
    constructor(token: string, keyPair: CryptoKeyPair) {
        this.token = token;
        this.keyPair = keyPair;
        console.log('Model initalized:', { token, keyPair });
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
        // console.log('setSnapshot', this.snapshot);
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
        list_for_session: async (session: string): Promise<ChatEntryClient[]> => {
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
                const { data }: { data: ChatEntry[] } = await axios.get('/api/comments', { params });
                const comments: ChatEntryClient[] = await processData(data, this.keyPair.privateKey);
                console.log('comments', comments);
                this.setSnapshot(key, timestamp, comments);
                return comments;
            }
        },
        list_for_user: (user: string): Promise<ChatEntryClient[]> => {
            return axios.get('/api/comments', { params: { user, token: this.token } }).then(({ data }) => {
                return processData(data, this.keyPair.privateKey);
            });
        },
        new: async ({ comment, session }: { comment: string, session: string }): Promise<void> => {
            const room: RoomInfo = await this.sessions.get(session);
            console.log('room members', room);
            const temporary_id = shortid();
            const comment_encoded = crypto.toUint8Aarray(comment);
            const prv_key = (await crypto.loadMyKeys()).privateKey;
            const ds = await Promise.all(map(room.members, ({ id, publicKey }) => {
                console.log({ pub: publicKey, prv: prv_key });
                return crypto.importKey(publicKey, true);
            })).then((ps) => {
                console.log('imported keys', ps)
                return Promise.all(map(ps, (imp_pub: CryptoKey) => {
                    console.log('Encrypting', imp_pub, prv_key)
                    return crypto.encrypt(imp_pub, prv_key, comment_encoded);
                }));
            })
            const comments = map(ds, (d: EncryptedData, i: number) => {
                return { for_user: room.members[i].id, content: d.iv + ':' + d.data };
            })
            const obj: PostCommentData = { comments, session, temporary_id, encrypt: 'ecdh.v1', token: this.token };
            const { data: { data } }: AxiosResponse<PostCommentResponse> = await axios.post('/api/comments', obj);
        },
        on_new: async (msg: CommentsNewSocket): Promise<string> => {
            const timestamp = msg.timestamp;
            const deciphered_comment = await crypto.decrypt_str(this.keyPair.publicKey, this.keyPair.privateKey, msg.comment).catch(() => { console.log('Error decrypting'); return msg.comment });
            var msg1: ChatEntryClient = {
                id: msg.id,
                user: msg.user,
                comment: deciphered_comment,
                session: msg.session_id,
                timestamp: formatTime(msg.timestamp),
                originalUrl: msg.original_url,
                sentTo: msg.sent_to || "",
                source: msg.source,
                kind: msg.kind,
                action: ""
            };
            const snapshot: ChatEntryClient[] = this.getSnapshot('comments.session.' + msg.session_id, -1);
            console.log('comments.new', msg1);
            if (snapshot != null) {
                console.log('comments.new', snapshot.length);
                snapshot.push(msg1);
                console.log('comments.new', snapshot.length);
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
            console.log('session.get result', r.data);
            await Promise.all(map(r.data.members, ({ id, publicKey }) => {
                return crypto.savePublicKey(id, publicKey);
            }));
            return r.data;
        },
        new: async ({ name, members }: { name: string, members: string[] }): Promise<{ newRoom: RoomInfo, sessions: RoomInfo[], messages: ChatEntry[] }> => {
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

async function processComment(m1: ChatEntry, privateKey: CryptoKey): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <CommentTyp>m1;
    // console.log('Processing comment by ', m.user_id);
    const publicKey = await crypto.loadPublicKey(m.user_id);
    // const deciphered_comment = m.comment;
    const deciphered_comment = await crypto.decrypt_str(publicKey, privateKey, m.comment, m.user_id).catch(() => { console.log('Error decrypting'); return m.comment });
    // console.log('decrypted', deciphered_comment);
    var v: ChatEntryClient = { id: m.id, user, comment: deciphered_comment, timestamp: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
    v.originalUrl = m.original_url || "";
    v.sentTo = m.sent_to || "";
    v.source = m.source;
    return v;
}

async function processEvent(m1: ChatEntry): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <SessionEvent>m1;
    var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
    v.comment = "（参加しました）";
    v.action = m.action;
    return v;
}

async function processFile(m1: ChatEntry): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <ChatFile>m1;
    var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
    v.comment = "（ファイル：" + m.url + "）";
    v.url = m.url;
    return v;
}

export async function processData(res: ChatEntry[], privateKey: CryptoKey): Promise<ChatEntryClient[]> {
    return Promise.all(map(res, (m1) => {
        // console.log('processData', m1);
        switch (m1.kind) {
            case "comment": {
                return processComment(m1, privateKey);
            }
            case "event": {
                return processEvent(m1);
            }
            case "file": {
                return processFile(m1);
            }
        }
    }));
}

export const processSessionInfo = (d: RoomInfo): RoomInfoClient => {
    const r: RoomInfoClient = {
        name: d.name,
        numMessages: d.numMessages,
        firstMsgTime: d.firstMsgTime,
        lastMsgTime: d.lastMsgTime,
        id: d.id,
        timestamp: formatTime(d.timestamp),
        members: map(d.members, (m) => m.id)
    };
    return r;
}

export function formatTime(timestamp: number): string {
    if (timestamp < 0) {
        return '(日時不明)'
    } else {
        return moment(timestamp).format('YYYY/M/D HH:mm:ss');
    }
}

