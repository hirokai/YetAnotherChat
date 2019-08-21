/// <reference path="../common/types.d.ts" />

import axios from 'axios';
import { map, clone, includes, pull, without, sortBy, take, find, filter, keyBy, max } from 'lodash-es';
import moment from 'moment';
const shortid = require('shortid').generate;
import $ from 'jquery';
import * as crypto from './cryptography';

export type ChatEntry = CommentTyp | SessionEvent | ChatFile;

export class Model {
    user_id: string
    token: string
    keyPair: CryptoKeyPair
    privateKeyJson: JsonWebKey
    publicKeys: { [key: string]: CryptoKey } = {}
    snapshot: { [key: string]: { [key: number]: any } };
    readonly MAX_SAVE_SNAPSHOT: number = 2;
    constructor(user_id: string, token: string, keyPair: CryptoKeyPair) {
        this.user_id = user_id;
        this.token = token;
        this.keyPair = keyPair;
        console.log('Model initalized:', { token, keyPair });
        this.snapshot = {};
    }
    saveDb(storeName: string, key: string, keyName: string, data: any, use_internal_key: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            const openReq = indexedDB.open(storeName);
            openReq.onupgradeneeded = function (event: any) {
                var db = (<IDBRequest>event.target).result;
                db.createObjectStore(storeName, { keyPath: keyName });
            }
            openReq.onsuccess = function (event: any) {
                // console.log('openReq.onsuccess');
                var db = event.target.result;
                var trans = db.transaction(storeName, 'readwrite');
                var store = trans.objectStore(storeName);
                let obj;
                if (use_internal_key) {
                    obj = data;
                } else {
                    obj = { data };
                    obj[keyName] = key;
                }
                console.log('saveDb put', obj);
                const putReq = store.put(obj);
                putReq.onsuccess = function () {
                    // console.log('get data success', getReq.result);
                    resolve();
                }
                putReq.onerror = () => {
                    reject();
                }
            }
            openReq.onerror = () => {
                reject();
            }
        });
    }
    loadDb(storeName: string, keyName: string, key: string = null): Promise<any> {
        return new Promise((resolve, reject) => {
            const openReq = indexedDB.open(storeName);
            // console.log('loadDb', openReq);
            openReq.onupgradeneeded = function (event: any) {
                // console.log('loadDb. onupgradeneeded', storeName);
                var db = (<IDBRequest>event.target).result;
                db.createObjectStore(storeName, { keyPath: keyName });
            }
            openReq.onsuccess = function (event: any) {
                // console.log('loadDb. onsuccess', storeName);
                // console.log('openReq.onsuccess');
                var db = event.target.result;
                var trans = db.transaction(storeName, 'readonly');
                var store = trans.objectStore(storeName);
                const getReq = key ? store.get(key) : store.getAll();
                getReq.onsuccess = function () {
                    // console.log('get data success', getReq.result);
                    resolve(getReq.result);
                }
                getReq.onerror = () => {
                    reject();
                }
            }
            openReq.onerror = () => {
                console.log('loadDb. onerror', storeName);
                reject();
            }
        });
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
        get: async (): Promise<{ [key: string]: User }> => {
            console.log({ params: { token: this.token } });
            const snapshot: { [key: string]: User } = keyBy(await this.loadDb('yacht.users', 'id'), 'id');
            // console.log('users snapshot', snapshot);
            if (Object.keys(snapshot).length > 0) {
                // console.log('Returning users from local DB.')
                return snapshot;
            } else {
                // console.log('Getting users and save to local DB')
                const r = await axios.get('/api/users', { params: { token: this.token } });
                const { data: { data: { users } } } = r;
                console.log('API users result', r, users);
                await map(users, (u) => {
                    return this.saveDb('yacht.users', u.id, 'id', u, true);
                });
                return keyBy(users, 'id');
            }
        },
        on_update: async (msg: UsersUpdateSocket) => {
            console.log('users.on_update', msg);
            const timestamp = new Date().getTime();
            var users: User[] = await this.loadDb('yacht.users', 'id');
            const u = find(users, { id: msg.user_id });
            if (u != null) {
                u.online = msg.online;
                await this.saveDb('yacht.users', u.id, 'id', u, true);
            }
        },
        toClient: async (u: User): Promise<UserClient> => {
            const fingerprint: string = await crypto.fingerPrint(u.publicKey);
            return {
                id: u.id,
                fullname: u.fullname || '',
                username: u.username || '',
                emails: u.emails || [],
                avatar: u.avatar || '',
                online: u.online || false,
                fingerprint
            };
        }
    }
    comments = {
        fetch_since: async (session_id: string, time_after: number): Promise<ChatEntry[]> => {
            const params: GetCommentsParams = { token: this.token, after: time_after };
            const { data }: { data: ChatEntry[] } = await axios.get('/api/sessions/' + session_id + '/comments', { params });
            return data;
        },
        list_for_session: async (session: string): Promise<{ [key: string]: ChatEntryClient }> => {
            const snapshot: { data: { [key: string]: ChatEntryClient } } = await this.loadDb('yacht.comments', 'session_id', session);
            if (snapshot) {
                const timestamps = map(snapshot.data, (v) => v.timestamp);
                const time_after = timestamps.length == 0 ? 0 : max(timestamps);
                const delta: ChatEntryClient[] = await this.comments.fetch_since(session, time_after).then((cs) => {
                    return processData(cs, this);
                })
                console.log('Comments new data length: ', delta.length);
                return Object.assign({}, snapshot.data, keyBy(delta, 'id'));
            } else {
                const params: GetCommentsParams = { token: this.token };
                const { data }: { data: ChatEntry[] } = await axios.get('/api/sessions/' + session + '/comments', { params });
                const comments: { [key: string]: ChatEntryClient } = keyBy(await processData(data, this), 'id');
                console.log('comments', comments);
                await this.saveDb('yacht.comments', session, 'session_id', comments, false);
                return comments;
            }
        },
        list_for_user: (user: string): Promise<ChatEntryClient[]> => {
            const params: GetCommentsParams = { token: this.token };
            return axios.get('/api/users/' + user + '/comments', { params }).then(({ data }) => {
                return processData(data, this);
            });
        },
        new: async ({ comment, session }: { comment: string, session: string }): Promise<void> => {
            const room: RoomInfo = await this.sessions.get(session);
            console.log('room members', room);
            const temporary_id = shortid();
            const comment_encoded = crypto.toUint8Aarray(comment);
            const prv_key = await this.keys.get_my_private_key();
            const ds = await Promise.all(map(room.members, ({ id, publicKey: jwk }) => {
                return new Promise((resolve) => {
                    if (jwk) {
                        crypto.importKey(jwk, true, true).then(resolve);
                    } else {
                        this.keys.get(id).then(resolve);
                    }
                });
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
            const obj: PostCommentData = { comments, temporary_id, encrypt: 'ecdh.v1', token: this.token };
            const { data: { data } }: AxiosResponse<PostCommentResponse> = await axios.post('/api/sessions/' + session + '/comments', obj);
        },
        on_new: async (msg: CommentsNewSocket): Promise<string> => {
            const timestamp = msg.timestamp;
            const publicKey = await this.keys.get(msg.user);
            const deciphered_comment = await crypto.decrypt_str(publicKey, this.keyPair.privateKey, msg.comment).catch(() => { console.log('on_new: Error decrypting'); return msg.comment });
            var msg1: ChatEntryClient = {
                id: msg.id,
                user: msg.user,
                comment: deciphered_comment,
                session: msg.session_id,
                timestamp: msg.timestamp,
                formattedTime: formatTime(msg.timestamp),
                originalUrl: msg.original_url,
                sentTo: msg.sent_to || "",
                source: msg.source,
                kind: msg.kind,
                action: ""
            };
            const snapshot_resource_id = 'comments.session.' + msg.session_id;
            const snapshot: { [key: string]: ChatEntryClient } = this.getSnapshot(snapshot_resource_id, -1);
            console.log('comments.new', msg1);
            if (snapshot != null) {
                console.log('comments.new', snapshot.length);
                snapshot[msg1.id] = msg1;
                console.log('comments.new', snapshot.length);
                this.setSnapshot(snapshot_resource_id, timestamp, snapshot);
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
            // console.log('session.get result', r.data);
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
            const p2 = axios.get('/api/sessions/' + newRoom.id + '/comments', { params: { token: this.token } });
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
    keys = {
        get: async (user_id: string): Promise<CryptoKey> => {
            const users: User[] = this.getSnapshot('users');
            if (!users) {
                return null;
            } else {
                const user: User = find(users, (u) => u.id == user_id);
                const jwk = user ? user.publicKey : null;
                const key = await crypto.importKey(jwk, true, true);
                return key;
            }
        },
        get_fingerprint: async (): Promise<{ prv: string, pub: string }> => {
            const p1 = crypto.fingerPrint1(this.keyPair.privateKey);
            const p2 = crypto.fingerPrint1(this.keyPair.publicKey);
            return Promise.all([p1, p2]).then(([prv, pub]) => {
                return { prv, pub }
            });
        },
        add_to_history: async (timestamp: number, fingerprint: { prv: string, pub: string }) => {
            return new Promise((resolve) => {
                const storeName = 'yacht.my_key_history';
                const openReq = indexedDB.open(storeName);
                openReq.onupgradeneeded = function (event: any) {
                    var db = (<IDBRequest>event.target).result;
                    db.createObjectStore(storeName, { keyPath: 'timestamp' });
                }
                openReq.onsuccess = function (event: any) {
                    // console.log('openReq.onsuccess');
                    var db = event.target.result;
                    var trans = db.transaction(storeName, 'readwrite');
                    var store = trans.objectStore(storeName);
                    const p1 = new Promise((r) => {
                        const putReq = store.put({ timestamp, fingerprint });
                        putReq.onsuccess = function () {
                            r();
                        }
                    });
                    const p2 = new Promise((r) => {
                        const putReq = store.put({ timestamp: -1, fingerprint });
                        putReq.onsuccess = function () {
                            r();
                        }
                    });
                    Promise.all([p1, p2]).then(() => {
                        resolve();
                    })
                }
            });
        },
        get_my_private_key: async (): Promise<CryptoKey> => {
            return new Promise((resolve, reject) => {
                const storeName = 'yacht.keyPair';
                const openReq = indexedDB.open(storeName);
                openReq.onupgradeneeded = function (event: any) {
                    var db = (<IDBRequest>event.target).result;
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
                openReq.onsuccess = function (event: any) {
                    // console.log('openReq.onsuccess');
                    var db = event.target.result;
                    var trans = db.transaction(storeName, 'readonly');
                    var store = trans.objectStore(storeName);
                    var getReq = store.get('myself');
                    getReq.onsuccess = function () {
                        // console.log('get data success', getReq.result);
                        resolve(getReq.result ? getReq.result.keyPair.privateKey : null);
                    }
                    getReq.onerror = () => {
                        reject();
                    }
                }
                openReq.onerror = () => {
                    reject();
                }
            });
        },
        get_my_fingerprint_from_cache: async (): Promise<{ prv: string, pub: string }> => {
            return new Promise((resolve, reject) => {
                const storeName = 'yacht.my_key_history';
                const openReq = indexedDB.open(storeName);
                openReq.onupgradeneeded = function (event: any) {
                    var db = (<IDBRequest>event.target).result;
                    db.createObjectStore(storeName, { keyPath: 'timestamp' });
                }
                openReq.onsuccess = function (event: any) {
                    // console.log('openReq.onsuccess');
                    var db = event.target.result;
                    var trans = db.transaction(storeName, 'readonly');
                    var store = trans.objectStore(storeName);
                    var getReq = store.get(-1);
                    getReq.onsuccess = function () {
                        // console.log('get data success', getReq.result);
                        resolve(getReq.result ? getReq.result.fingerprint : null);
                    }
                    getReq.onerror = () => {
                        reject();
                    }
                }
                openReq.onerror = () => {
                    reject();
                }
            });
        },
        get_my_public_key_from_server: async (): Promise<CryptoKey> => {
            const params: GetPublicKeysParams = { user_id: this.user_id, token: this.token };

            const { data: { data } } = <AxiosResponse<GetPublicKeysResponse>>await axios.get('/api/public_keys/me', { params });
            console.log('Importing', data);
            return crypto.importKey(data, true);
        },
        update_public_key: async (publicKey: CryptoKey) => {
            const jwk = await crypto.exportKey(publicKey);
            const obj: UpdatePublicKeyParams = { user_id: this.user_id, for_user: this.user_id, token: this.token, publicKey: jwk };
            const { data } = await axios.patch('/api/public_keys', obj);
            console.log('update_public_key result', data);
        },
        reset: async (): Promise<{ timestamp: number, fingerprint: { prv: string, pub: string } }> => {
            const timestamp = new Date().getTime();
            const keyPair = await crypto.generateKeyPair(true);
            this.keyPair = keyPair;
            this.privateKeyJson = await crypto.exportKey(keyPair.privateKey);
            console.log(keyPair);
            await crypto.saveMyKeys(keyPair);
            await this.keys.update_public_key(keyPair.publicKey);
            const fingerprint = await this.keys.get_fingerprint();
            this.keys.add_to_history(timestamp, fingerprint);
            return { timestamp, fingerprint };
        }
    }
}

async function processComment(m1: ChatEntry, model: Model): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <CommentTyp>m1;
    // console.log('Processing comment by ', m.user_id);
    const publicKey = await model.keys.get(m.user_id);
    // const deciphered_comment = m.comment;
    const deciphered_comment = await crypto.decrypt_str(publicKey, model.keyPair.privateKey, m.comment, m.user_id).catch(() => { console.log('Error decrypting'); return m.comment });
    // console.log('decrypted', deciphered_comment);
    var v: ChatEntryClient = { id: m.id, user, comment: deciphered_comment, timestamp: m.timestamp, formattedTime: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
    v.originalUrl = m.original_url || "";
    v.sentTo = m.sent_to || "";
    v.source = m.source;
    return v;
}

async function processEvent(m1: ChatEntry): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <SessionEvent>m1;
    var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: m.timestamp, formattedTime: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
    v.comment = "（参加しました）";
    v.action = m.action;
    return v;
}

async function processFile(m1: ChatEntry): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <ChatFile>m1;
    var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: m.timestamp, formattedTime: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "" };
    v.comment = "（ファイル：" + m.url + "）";
    v.url = m.url;
    return v;
}

export async function processData(res: ChatEntry[], model: Model): Promise<ChatEntryClient[]> {
    return Promise.all(map(res, (m1) => {
        // console.log('processData', m1);
        switch (m1.kind) {
            case "comment": {
                return processComment(m1, model);
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

