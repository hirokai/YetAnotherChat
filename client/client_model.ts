/// <reference path="../common/types.d.ts" />

import axios from 'axios';
import { map, clone, includes, pull, without, sortBy, take, find, filter, keyBy, max, cloneDeep, values } from 'lodash-es';
import moment from 'moment';
const shortid = require('shortid').generate;
import $ from 'jquery';
import * as crypto from './cryptography';
import { Session } from 'inspector';
import { S_IFBLK } from 'constants';

export type ChatEntry = CommentTyp | SessionEvent | ChatFile;

interface SessionCache {
    id: string
    comments?: { [key: string]: ChatEntryClient }
    info?: RoomInfoClient
}

const token: string = localStorage.getItem('yacht.token') || "";
axios.defaults.headers.common['x-access-token'] = token;

export class Model {
    user_id: string
    token: string
    privateKeyJson: JsonWebKey
    onInit: () => void;
    publicKeys: { [key: string]: CryptoKey } = {}
    snapshot: { [key: string]: { [key: number]: any } };
    readonly MAX_SAVE_SNAPSHOT: number = 2;
    constructor(user_id: string, token: string) {
        this.user_id = user_id;
        this.token = token;
        console.log('Model initalized:', { token });
        this.snapshot = {};
        (async () => {
            let keyPair = await this.keys.get_my_keys();
            if (keyPair && keyPair.publicKey && keyPair.privateKey) {
                const privateKey = keyPair.privateKey;
                const prv_exported = await crypto.exportKey(privateKey);
                //For user export, it has to be prepared beforehand (no async operation)
                this.privateKeyJson = prv_exported;
            } else {
                console.log('Downloading my keys from server.')
                const { publicKey, privateKey } = await this.keys.download_my_keys_from_server();
                const pub = await crypto.fingerPrint1(publicKey);
                const prv = await crypto.fingerPrint1(privateKey);
                console.log('Downloaded: ', pub, prv);
                keyPair = { publicKey, privateKey };
                this.keys.save_my_keys(keyPair);
            }
            if (this.onInit) {
                this.onInit();
            }
        })();
    }
    saveDb(storeName: string, keyName: string, key: string, data: any, use_internal_key: boolean): Promise<void> {
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
                // console.log('saveDb put', obj);
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
    removeDb(storeName: string, keyName: string, key: string): Promise<void> {
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
                const req = store.delete(key);
                req.onsuccess = function () {
                    // console.log('get data success', getReq.result);
                    resolve();
                }
                req.onerror = () => {
                    reject();
                }
            }
            openReq.onerror = () => {
                reject();
            }
        });
    }
    users = {
        get: async (): Promise<{ [key: string]: User }> => {
            const snapshot: { [key: string]: User } = keyBy(await this.loadDb('yacht.users', 'id'), 'id');
            // console.log('users snapshot', snapshot);
            if (Object.keys(snapshot).length > 0) {
                // console.log('Returning users from local DB.')
                return snapshot;
            } else {
                // console.log('Getting users and save to local DB')
                const r = await axios.get('/api/users');
                const { data: { data: { users } } } = r;
                console.log('API users result', r, users);
                await map(users, (u) => {
                    return this.saveDb('yacht.users', 'id', u.id, u, true);
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
                await this.saveDb('yacht.users', 'id', u.id, u, true);
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
        apply_delta: async (data_: { [key: string]: ChatEntryClient }, delta: CommentChange[]): Promise<{ [key: string]: ChatEntryClient }> => {
            var data = cloneDeep(data_) || {};
            for (let i = 0; i < delta.length; i++) {
                const d = delta[i];
                if (d.__type == "new") {
                    const d1 = await processData([d.comment], this);
                    data[d.comment.id] = d1[0];
                } else if (d.__type == "update") {
                    const d1 = await processData([d.comment], this);
                    data[d.comment.id] = d1[0];
                } else if (d.__type == "delete") {
                    delete data[d.id];
                }
            }
            return data;
        },
        fetch_since: async (session_id: string, snapshot: SessionCache): Promise<CommentChange[]> => {
            if (snapshot.comments) {
                const timestamps = map(snapshot.comments, (v) => v.timestamp);
                const time_after = timestamps.length == 0 ? 0 : max(timestamps);
                const cached_ids = map(snapshot.comments, (d) => d.id);
                const body: GetCommentsDeltaData = { last_updated: time_after, cached_ids };
                const { data }: { data: CommentChange[] } = await axios.post('/api/sessions/' + session_id + '/comments/delta', { body });
                return data;
            } else {
                const body: GetCommentsDeltaData = { last_updated: 0, cached_ids: [] };
                const { data }: { data: CommentChange[] } = await axios.post('/api/sessions/' + session_id + '/comments/delta', { body });
                return data;
            }
        },
        list_for_session: async (session: string): Promise<ChatEntryClient[]> => {
            console.log('list_for_session', session);
            const snapshot: SessionCache = await this.sessions.load(session);
            if (snapshot) {
                const delta: CommentChange[] = await this.comments.fetch_since(session, snapshot);
                const updated_comments = await this.comments.apply_delta(snapshot.comments, delta);
                const new_snapshot: SessionCache = { id: snapshot.id, comments: updated_comments };
                const list = sortBy(values(updated_comments), 'timestamp');
                await this.sessions.save(session, new_snapshot);
                console.info('Updated', snapshot.comments.length, delta, new_snapshot.comments.length);
                return list;
            } else {
                const { data: { ok, data } }: { data: { ok: boolean, data: ChatEntry[] } } = await axios.get('/api/sessions/' + session + '/comments');
                if (ok && data) {
                    const entries = await processData(data, this);
                    const comments: { [key: string]: ChatEntryClient } = keyBy(entries, 'id');
                    console.log('list_for_session() comments', session, comments, entries, data);
                    const obj: SessionCache = { id: session, comments };
                    await this.sessions.save(session, obj);
                    const list = sortBy(values(comments), 'timestamp');
                    return list;
                } else {
                    return null;    // session not found.
                }
            }
        },
        list_for_user: (user: string): Promise<ChatEntryClient[]> => {
            return axios.get('/api/users/' + user + '/comments').then(({ data }) => {
                return processData(data, this);
            });
        },
        new: async ({ comment, session }: { comment: string, session: string }): Promise<void> => {
            const room: RoomInfo = await this.sessions.get(session);
            console.log('room members', room);
            const temporary_id = shortid();
            const comment_encoded = crypto.toUint8Aarray(comment);
            const my_keys = await this.keys.get_my_keys();
            const ds = await Promise.all(map(room.members, (id) => {
                return this.keys.get(id);
            })).then((ps) => {
                console.log('imported keys', ps)
                return Promise.all(map(ps, (remote_publicKey: CryptoKey, i: number) => {
                    (async () => {
                        const ts = new Date().getTime();
                        const pub = await crypto.fingerPrint1(remote_publicKey);
                        const mypub = await crypto.fingerPrint1(my_keys.publicKey);
                        const prv = await crypto.fingerPrint1(my_keys.privateKey);
                        console.log('Encrypting', room.members[i], ts, pub, mypub, prv)
                        // console.log('Error decrypting', m.timestamp, mypub, pub, prv);    
                    })();
                    return crypto.encrypt(remote_publicKey, my_keys.privateKey, comment_encoded);
                }));
            })
            const comments = map(ds, (d: EncryptedData, i: number) => {
                return { for_user: room.members[i], content: d.iv + ':' + d.data };
            })
            const obj: PostCommentData = { comments, temporary_id, encrypt: 'ecdh.v1' };
            const { data: { data } }: AxiosResponse<PostCommentResponse> = await axios.post('/api/sessions/' + session + '/comments', obj);
        },
        on_new: async (msg: CommentsNewSocket): Promise<{ comment_id: string, session_id: string }> => {
            const [msg1] = await processData([msg.entry], this);
            const snapshot = await this.sessions.load(msg.entry.session_id);
            snapshot.comments[msg1.id] = msg1;
            await this.sessions.save(msg.entry.session_id, snapshot);
            return { comment_id: msg1.id, session_id: msg.entry.session_id };
        },
        on_delete: async (msg: CommentsDeleteSocket): Promise<{ id: string, session_id: string }> => {
            const snapshot = await this.sessions.load(msg.session_id);
            delete snapshot.comments[msg.id];
            this.sessions.save(msg.session_id, snapshot);
            return { id: msg.id, session_id: msg.session_id };
        },
        delete_cache_of_session: async (session_id: string) => {
            const _ = await this.removeDb('yacht.sessions', 'id', session_id);
            console.log('delete_cache_of_session done');
        }
    }
    sessions = {
        list: async (): Promise<RoomInfoClient[]> => {
            const { data: { data: rooms } }: AxiosResponse<GetSessionsResponse> = await axios.get('/api/sessions');
            const timestamp = new Date().getTime();
            const infos = [];
            for (let room of rooms) {
                let room_cache = await this.sessions.load(room.id);
                const info = processSessionInfo(room);
                if (!room_cache) {
                    room_cache = { id: room.id };
                }
                room_cache.info = info;
                infos.push(info);
                console.log(room);
                await this.sessions.save(room.id, room_cache);
            }
            return infos;
        },
        load: async (session_id: string): Promise<SessionCache> => {
            return await this.loadDb('yacht.sessions', 'id', session_id);
        },
        save: async (session_id: string, data: SessionCache) => {
            console.log('sessions.save', session_id);
            if (!includes(['gQcq8X_25', 'gQcq8X_25', '3vDctYrMw'], session_id)) {
                // throw new Error('sessions.save wrong');
            }
            await this.saveDb('yacht.sessions', 'id', session_id, data, true);
        },
        get: async (id: string): Promise<RoomInfo> => {
            const { data: r }: { data: GetSessionResponse } = await axios.get('/api/sessions/' + id);
            return r.data;
        },
        new: async ({ name, members }: { name: string, members: string[] }): Promise<{ newRoom: RoomInfo, sessions: RoomInfo[], messages: ChatEntry[] }> => {
            const temporary_id = shortid();
            const post_data: PostSessionsParam = { name, members, temporary_id };
            const { data: newRoom }: PostSessionsResponse = await axios.post('/api/sessions', post_data);
            const p1 = axios.get('/api/sessions');
            const p2 = axios.get('/api/sessions/' + newRoom.id + '/comments');
            const [{ data: { data: sessions } }, { data: { data: messages } }] = await Promise.all([p1, p2]);
            return { newRoom, sessions, messages };
        },
        delete: async (id: string) => {
            const { data }: AxiosResponse<CommentsDeleteResponse> = await axios.delete('/api/sessions/' + id);
            return data;
        },
        on_new: async (msg: SessionsNewSocket): Promise<void> => {
            console.log('sessions.on_new', msg);
            return;
        },
        on_update: async (msg: SessionsUpdateSocket): Promise<void> => {
            console.log('sessions.on_update', msg);
            const room: SessionCache = await this.sessions.load(msg.id);
            room.info.name = msg.name;
            await this.sessions.save(msg.id, room);
        }
    }
    keys = {
        get: async (user_id: string): Promise<CryptoKey> => {
            const user: User = await this.loadDb('yacht.users', 'id', user_id);
            if (user) {
                const key = await crypto.importKey(user.publicKey, true, true);
                const fp = await crypto.fingerPrint1(key);
                console.log('Public key fingerprint: ', user_id, fp);
                return key;
            } else {
                return null;
            }
        },
        save_public_key: async (user_id: string, jwk: JsonWebKey): Promise<void> => {
            const user: User = await this.loadDb('yacht.users', 'id', user_id);
            if (user != null) {
                user.publicKey = jwk;
                await this.saveDb('yacht.users', 'id', user_id, user, true);
            }
        },
        get_my_fingerprint: async (): Promise<{ prv: string, pub: string }> => {
            const my_keys = await this.keys.get_my_keys();
            const p1 = crypto.fingerPrint1(my_keys.privateKey);
            const p2 = crypto.fingerPrint1(my_keys.publicKey);
            return Promise.all([p1, p2]).then(([prv, pub]) => {
                return { prv, pub }
            });
        },
        get_my_keys: async (): Promise<CryptoKeyPair> => {
            const data: MyKeyCacheData = await this.loadDb('yacht.keyPair', 'id', 'myself');
            if (data) {
                const publicKey = await crypto.importKey(data.publicKey, true, true);
                const privateKey = await crypto.importKey(data.privateKey, false, true);
                return { publicKey, privateKey };
            } else {
                return null;
            }
        },
        save_my_keys: async (keyPair: CryptoKeyPair): Promise<void> => {
            const prv_e_p = crypto.exportKey(keyPair.privateKey);
            const pub_e_p = crypto.exportKey(keyPair.publicKey);
            const fps = await Promise.all([prv_e_p, pub_e_p]).then((ks) => {
                console.log('[prv_e_p, pub_e_p]', ks, keyPair.privateKey, keyPair.publicKey)
                return Promise.all([crypto.fingerPrint(ks[0]), crypto.fingerPrint(ks[1])]);
            });
            const fp = { privateKey: fps[0], publicKey: fps[1] };
            const privateKey = await crypto.exportKey(keyPair.privateKey);
            const publicKey = await crypto.exportKey(keyPair.publicKey);
            const obj: MyKeyCacheData = { id: 'myself', privateKey, publicKey, fingerPrint: fp };
            await this.saveDb('yacht.keyPair', 'id', 'myself', obj, true);
        },
        import_private_key: async (jwk: JsonWebKey) => {
            const keyPair: CryptoKeyPair = await this.keys.get_my_keys();
            console.log('import_private_key', keyPair);
            if (keyPair == null) {
                throw new Error('Public key is not found.');
            } else {
                const prv_imported = await crypto.importKey(jwk, false, true);
                const newKeyPair = { privateKey: prv_imported, publicKey: keyPair.publicKey }
                const v = await crypto.verify_key_pair(newKeyPair);
                console.log('New key pair verified:', v)
                await this.keys.save_my_keys(newKeyPair);
            }
        },
        upload_my_private_key: async () => {
            const private_key_1 = await this.keys.get_my_keys();
            const private_key = await crypto.exportKey(private_key_1.privateKey);
            axios.post('/api/private_key', { private_key });
        },
        download_my_keys_from_server: async (): Promise<CryptoKeyPair> => {
            const params: GetPublicKeysParams = { user_id: this.user_id, token: this.token };

            const { data: { data: jwk_pub } } = <AxiosResponse<GetPublicKeysResponse>>await axios.get('/api/public_keys/me', { params });
            const { data: { privateKey: jwk_prv } } = <AxiosResponse<GetPrivateKeyResponse>>await axios.get('/api/private_key');
            const publicKey = await crypto.importKey(jwk_pub, true, true);
            const privateKey = await crypto.importKey(jwk_prv, false, true);
            return { publicKey, privateKey };
        },
        upload_my_public_key: async (publicKey: CryptoKey) => {
            const jwk = await crypto.exportKey(publicKey);
            const obj: UpdatePublicKeyParams = { for_user: this.user_id, publicKey: jwk };
            const { data } = await axios.patch('/api/public_keys', obj);
            console.log('update_public_key result', data);
        },
        reset: async (): Promise<{ timestamp: number, fingerprint: { prv: string, pub: string } }> => {
            const timestamp = new Date().getTime();
            const keyPair = await crypto.generateKeyPair(true);
            this.privateKeyJson = await crypto.exportKey(keyPair.privateKey);
            await this.keys.save_my_keys(keyPair);
            await this.keys.upload_my_public_key(keyPair.publicKey);
            const fingerprint = await this.keys.get_my_fingerprint();
            return { timestamp, fingerprint };
        }
    }
}

async function processComment(m1: ChatEntry, model: Model): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <CommentTyp>m1;
    // console.log('Processing comment by ', m.user_id);
    const remote_publicKey = await model.keys.get(m.user_id);
    let deciphered_comment: string;
    if (m.encrypt == 'ecdh.v1') {
        const my_keys = await model.keys.get_my_keys();
        deciphered_comment = await crypto.decrypt_str(remote_publicKey, my_keys.privateKey, m.comment, m.user_id).catch(() => {
            (async () => {
                const pub = await crypto.fingerPrint1(remote_publicKey);
                const mypub = await crypto.fingerPrint1(my_keys.publicKey);
                const prv = await crypto.fingerPrint1(my_keys.privateKey);
                console.log('Error decrypting', m.timestamp, mypub, pub, prv);
                console.log('Comment by ', m.user_id, { remote_pub: pub, my_pub: mypub });
            })();
            return null
        });
    } else if (m.encrypt == 'none') {
        deciphered_comment = m.comment;
    } else {
        deciphered_comment = 'N/A'
    }
    const encrypt = deciphered_comment ? 'none' : m.encrypt;
    var v: ChatEntryClient = { id: m.id, user, comment: deciphered_comment || m.comment, timestamp: m.timestamp, formattedTime: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "", encrypt };
    v.originalUrl = m.original_url || "";
    v.sentTo = m.sent_to || "";
    v.source = m.source;
    return v;
}

async function processEvent(m1: ChatEntry): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <SessionEvent>m1;
    var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: m.timestamp, formattedTime: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "", encrypt: m1.encrypt };
    v.comment = "（参加しました）";
    v.action = m.action;
    return v;
}

async function processFile(m1: ChatEntry): Promise<ChatEntryClient> {
    const user: string = m1.user_id;
    const m = <ChatFile>m1;
    var v: ChatEntryClient = { id: m.id, user, comment: "", timestamp: m.timestamp, formattedTime: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: m1.kind, action: "", encrypt: m1.encrypt };
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
        formattedTime: formatTime(d.timestamp),
        timestamp: d.timestamp,
        members: d.members
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
