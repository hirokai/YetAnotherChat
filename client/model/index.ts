/// <reference path="../../common/types.d.ts" />

import axios from 'axios';
// import { map, sortBy, find, filter, keyBy, max, cloneDeep, values, zip, isEmpty, every } from 'lodash-es';
import map from 'lodash/map'
import sortBy from 'lodash/sortBy'
import find from 'lodash/find'
import range from 'lodash/range'
import filter from 'lodash/filter'
import includes from 'lodash/includes'
import keyBy from 'lodash/keyBy'
import max from 'lodash/max'
import cloneDeep from 'lodash/cloneDeep'
import values from 'lodash/values'
import zip from 'lodash/zip'
import isEmpty from 'lodash/isEmpty'
import every from 'lodash/every'

import moment from 'moment';
const shortid = require('shortid').generate;
import $ from 'jquery';
import * as crypto from './cryptography';

import * as CryptoJS from "crypto-js";

window['CryptoJS'] = CryptoJS;

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
    readonly DB_VERSION: number = 3;
    constructor({ user_id, token, onInit }: { user_id: string, token: string, onInit?: () => void }) {
        this.user_id = user_id;
        this.token = token;
    }
    async init(): Promise<boolean> {
        if (!this.token) {
            return false;
        }
        let keyPair = await this.keys.download_my_keys_from_server();
        console.log('Downloaded key pair', keyPair);
        if (keyPair == null || keyPair.publicKey == null) {
            await this.keys.reset();
        } else {
            await this.keys.save_my_keys(keyPair, true);
        }
        if (keyPair && keyPair.privateKey) {
            //For user export, it has to be prepared beforehand (no async operation)
            this.privateKeyJson = await crypto.exportKey(keyPair.privateKey);;
        }
        return true;
    }
    saveDbWithName(dbName: string, data: any): Promise<void> {
        const storeName = 'default';
        const self = this;
        return new Promise((resolve, reject) => {
            const openReq = indexedDB.open(dbName, this.DB_VERSION);
            openReq.onupgradeneeded = function (event: any) {
                var db = (<IDBRequest>event.target).result;
                db.createObjectStore(storeName);
            }
            openReq.onsuccess = function (event: any) {
                // console.log('openReq.onsuccess');
                var db = event.target.result;
                var trans = db.transaction(storeName, 'readwrite');
                var store = trans.objectStore(storeName);
                const putReq = store.put(data, self.user_id);
                putReq.onsuccess = function () {
                    // console.log('get data success', getReq.result);
                    resolve();
                }
                putReq.onerror = () => {
                    reject();
                }
            }
            openReq.onerror = (e) => {
                console.log('saveDb.openReq.error', e);
                reject();
            }
        });
    }
    loadDbWithName(dbName: string): Promise<any> {
        const storeName = 'default';
        const self = this;
        return new Promise((resolve, reject) => {
            const openReq = indexedDB.open(dbName, this.DB_VERSION);
            openReq.onupgradeneeded = function (event: any) {
                var db = (<IDBRequest>event.target).result;
                try {
                    db.createObjectStore(storeName);
                } catch (e) {
                    console.log(e);
                }
            }
            openReq.onsuccess = function (event: any) {
                const db = (<IDBRequest>event.target).result;
                const trans = db.transaction(storeName, 'readonly');
                const store = trans.objectStore(storeName);
                const getReq = store.get(self.user_id);
                if (getReq == null) {
                    return;
                }
                getReq.onsuccess = function () {
                    // console.log('get data success', getReq.result);
                    resolve(getReq.result);
                }
                getReq.onerror = () => {
                    reject();
                }
            }
            openReq.onerror = (e) => {
                console.log('loadDb.openReq onerror', dbName, storeName, e);
                reject();
            }
        });
    }
    removeDb(dbName: string): Promise<void> {
        const storeName = 'default';
        const self = this;
        return new Promise((resolve, reject) => {
            const openReq = indexedDB.open(dbName);
            openReq.onupgradeneeded = function (event: any) {
                var db = (<IDBRequest>event.target).result;
                try {
                    db.createObjectStore(storeName);
                } catch (e) {
                    console.log(e);
                }
            }
            openReq.onsuccess = function (event: any) {
                // console.log('openReq.onsuccess');
                var db = event.target.result;
                var trans = db.transaction(storeName, 'readwrite');
                var store = trans.objectStore(storeName);
                let req;
                req = store.delete(self.user_id);
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
        list: async (): Promise<{ [key: string]: User }> => {
            const snapshot: { [key: string]: User } = await this.users.loadDb();
            // console.log('users snapshot', snapshot);
            if (snapshot && Object.keys(snapshot).length > 0) {
                // console.log('Returning users from local DB.')
                return snapshot;
            } else {
                console.log('users.list(): Getting users and save to local DB')
                const p1 = <Promise<AxiosResponse<GetUsersResponse>>>axios.get('/api/users');
                const p2 = <Promise<AxiosResponse<GetProfilesResponse>>>axios.get('/api/users/all/profiles');
                const [r1, r2] = await Promise.all([p1, p2]);
                console.log('r1,r2', r1, r2)
                const { data: { data: { users } } } = r1;
                const { data: { data: profiles } } = r2;
                const users_dict: { [key: string]: User } = keyBy(users, 'id');
                // console.log(users_dict);
                map(profiles, (profile, user_id) => {
                    // console.log(profile, user_id, users_dict[user_id]);
                    if (users_dict[user_id]) {
                        users_dict[user_id].profile = profile;
                    }
                });
                await this.users.saveDb(users_dict);
                return users_dict;
            }
        },
        loadDb: async (): Promise<{ [key: string]: User }> => {
            return await this.loadDbWithName('yacht.users');
        },
        loadDbLocked: async (): Promise<string> => {
            return await this.loadDbWithName('yacht.users');
        },
        saveDb: async (users: { [key: string]: User }): Promise<void> => {
            return await this.saveDbWithName('yacht.users', users);
        },
        saveDbLocked: async (users: string): Promise<void> => {
            return await this.saveDbWithName('yacht.users', users);
        },
        lockDb: async (password: string) => {
            const users = await this.users.loadDb();
            var ciphertext: string = CryptoJS.AES.encrypt(JSON.stringify(users), password).toString();
            await this.users.saveDbLocked(ciphertext);
        },
        unlockDb: async (password: string) => {
            const users_str: any = await this.users.loadDbLocked();
            if (users_str && typeof users_str == 'string') {
                var bytes = CryptoJS.AES.decrypt(users_str, password);
                var decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
                await this.users.saveDb(decryptedData);
            }
        },
        resetCacheAndReload: async () => {
            await this.removeDb('yacht.users');
            await this.users.list();
        },
        update_my_info: async (key: string, value: string) => {
            console.log('update_my_info', key, value);
            let obj: UpdateUserData;
            if (includes(['username', 'fullname', 'email'], key)) {
                obj = Object.assign({},
                    key == 'username' ? { username: value } : null,
                    key == 'fullname' ? { fullname: value } : null,
                    key == 'email' ? { email: value } : null);
                console.log('update_my_info', obj);
                const r = await axios.patch('/api/users/' + this.user_id, obj);
                console.log('update_my_info', key, value, r);
            } else {
                const obj = {};
                obj[key] = value;
                await this.users.update_my_profile(obj);
            }
        },
        update_my_profile: async (profile: { [key: string]: string }) => {
            const obj: UpdateProfileData = {
                profile
            };
            const { data: { ok, user_id, data: profile_result } } = <AxiosResponse<UpdateProfileResponse>>await axios.patch('/api/users/' + this.user_id + '/profiles', obj);
        },
        on_new: async (msg: UsersNewSocket) => {
            console.log('users.on_new', msg);
            var users: { [key: string]: User } = await this.users.loadDb();
            users[msg.user.id] = msg.user;
            await this.users.saveDb(users);
        },
        on_update: async (msg: UsersUpdateSocket) => {
            console.log('users.on_update', msg);
            var users: { [key: string]: User } = await this.users.loadDb();
            const u = users[msg.user_id];
            if (u == null) {
                return;
            }
            switch (msg.action) {
                case 'online': {
                    u.online = msg.online;
                    await this.users.saveDb(users);
                    break;
                }
                case 'public_key': {
                    u.publicKey = msg.public_key;
                    u.fingerprint = await crypto.fingerPrint(msg.public_key);
                    await this.users.saveDb(users);
                    break;
                }
                case 'user': {
                    if (msg.user) {
                        users[msg.user_id] = msg.user;
                        console.log('Saving users', users);
                        await this.users.saveDb(users);
                    }
                    break;
                }
                case 'profile': {
                    if (msg.profile) {
                        users[msg.user_id].profile = msg.profile;
                        console.log('Saving users', users);
                        await this.users.saveDb(users);
                    }
                    break;
                }
            }
        },
        toClient: async (u: User): Promise<UserClient> => {
            if (u == null) {
                return null;
            }
            const fingerprint: string = await crypto.fingerPrint(u.publicKey) || '';
            const profile_list = [];
            map(u.profile, (v, k) => {
                profile_list.push([k, v]);
            });
            return {
                id: u.id,
                fullname: u.fullname || '',
                username: u.username || '',
                emails: u.emails || [],
                avatar: u.avatar || '',
                online: u.online || false,
                fingerprint
                , profile: profile_list
                // , profile: [["SDGs", map(range(1, 18), (i) => (Math.random() > 0.5 ? '' + i : '')).join(',')]]//profile_list.join(',')
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
        fetch_since: async (session_id: string, snapshot: SessionCache): Promise<{ delta: CommentChange[], time_after: number }> => {
            if (snapshot.comments) {
                const timestamps = map(snapshot.comments, (v) => v.timestamp);
                const time_after = timestamps.length == 0 ? 0 : max(timestamps);
                console.log('Snapshot exists. up to ', time_after);
                const cached_ids = map(snapshot.comments, (d) => d.id);
                const body: GetCommentsDeltaData = { last_updated: time_after, cached_ids };
                console.log('comments delta req', body)
                const { data: delta }: { data: CommentChange[] } = await axios.post('/api/sessions/' + session_id + '/comments/delta', body);
                return { delta, time_after };
            } else {
                console.log('Snapshot not found. Getting all.')
                const body: GetCommentsDeltaData = { last_updated: 0, cached_ids: [] };
                const { data: delta }: { data: CommentChange[] } = await axios.post('/api/sessions/' + session_id + '/comments/delta', body);
                return { delta, time_after: -1 };
            }
        },
        list_for_session: async (session: string): Promise<ChatEntryClient[]> => {
            console.log('list_for_session', session);
            const snapshot: SessionCache = await this.sessions.load(session);
            if (snapshot) {
                const { delta, time_after } = await this.comments.fetch_since(session, snapshot);
                const updated_comments = await this.comments.apply_delta(snapshot.comments, delta);
                const new_snapshot: SessionCache = { id: snapshot.id, comments: updated_comments };
                const list = sortBy(values(updated_comments), 'timestamp');
                await this.sessions.save(session, new_snapshot);
                console.info('Updated with delta', time_after, delta, Object.keys(snapshot.comments || {}).length, "->", Object.keys(new_snapshot.comments || {}).length);
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
                    return crypto.encrypt_str(remote_publicKey, my_keys.privateKey, comment);
                }));
            });
            let encrypt = 'ecdh.v1';
            const comments = map(ds, (encrypted: string, i: number) => {
                if (encrypt == 'ecdh.v1') {
                    return { for_user: room.members[i], content: encrypted };
                } else if (encrypt == 'none') {
                    return { for_user: room.members[i], content: comment }
                }
            })
            const obj: PostCommentData = { comments, temporary_id, encrypt };
            const { data: { data } }: AxiosResponse<PostCommentResponse> = await axios.post('/api/sessions/' + session + '/comments', obj);
        },
        on_new: async (msg: CommentsNewSocket): Promise<{ comment_id: string, session_id: string }> => {
            const [msg1] = await processData([msg.entry], this);
            if (msg1) {
                const snapshot = await this.sessions.load(msg.entry.session_id);
                if (snapshot) {
                    if (!snapshot.comments) {
                        snapshot.comments = {};
                    }
                    snapshot.comments[msg1.id] = msg1;
                    await this.sessions.save(msg.entry.session_id, snapshot);
                }
                // await this.sessions.reload(msg.entry.session_id);
                return { comment_id: msg.entry.id, session_id: msg.entry.session_id };
            } else {
                console.log('comments.on_new process error');
            }
        },
        on_delete: async (msg: CommentsDeleteSocket): Promise<{ id: string, session_id: string }> => {
            const snapshot = await this.sessions.load(msg.session_id);
            delete snapshot.comments[msg.id];
            this.sessions.save(msg.session_id, snapshot);
            return { id: msg.id, session_id: msg.session_id };
        },
        delete_cache_of_session: async (session_id: string) => {
            const _ = await this.removeDb('yacht.sessions');
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
                const info = this.sessions.toClient(room);
                if (!room_cache) {
                    room_cache = { id: room.id };
                }
                room_cache.info = info;
                infos.push(info);
                console.log('Session saving', room.id, room_cache);
                await this.sessions.save(room.id, room_cache);
            }
            return infos;
        },
        loadDb: async (): Promise<{ [key: string]: SessionCache }> => {
            return await this.loadDbWithName('yacht.sessions');
        },
        saveDb: async (sessions: { [key: string]: SessionCache }): Promise<void> => {
            return await this.saveDbWithName('yacht.sessions', sessions);
        },
        loadDbLocked: async (): Promise<string> => {
            return await this.loadDbWithName('yacht.sessions');
        },
        saveDbLocked: async (sessions: string): Promise<void> => {
            return await this.saveDbWithName('yacht.sessions', sessions);
        },
        lockDb: async (password: string) => {
            const sessions = await this.sessions.loadDb();
            var ciphertext: string = CryptoJS.AES.encrypt(JSON.stringify(sessions), password).toString();
            await this.sessions.saveDbLocked(ciphertext);
        },
        unlockDb: async (password: string) => {
            const sessions_str: any = await this.sessions.loadDbLocked();
            if (sessions_str && typeof sessions_str == 'string') {
                var bytes = CryptoJS.AES.decrypt(sessions_str, password);
                var decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
                await this.sessions.saveDb(decryptedData);
            }
        },
        toClient: (d: RoomInfo): RoomInfoClient => {
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
        },
        load: async (session_id: string): Promise<SessionCache> => {
            const sessions: { [key: string]: SessionCache } = await this.sessions.loadDb();
            return sessions ? sessions[session_id] : null;
        },
        save: async (session_id: string, data: SessionCache) => {
            let sessions: { [key: string]: SessionCache } = await this.sessions.loadDb();
            if (sessions != null) {
                sessions[session_id] = data;
            } else {
                sessions = {};
                sessions[session_id] = data;
            }
            await this.sessions.saveDb(sessions);
        },
        reload: async (session_id: string) => {
            await this.comments.delete_cache_of_session(session_id);
            const comments = await this.comments.list_for_session(session_id);
            console.log('after reset feeding ', comments.length);
            return comments;
        },
        deleteDb: async (session_id: string) => {
            await this.removeDb('yacht.sessions');
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
            await this.sessions.deleteDb(msg.id);
            return;
        },
        on_delete: async (msg: SessionsDeleteSocket): Promise<void> => {
            console.log('sessions.on_delete', msg.id);
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
            const users = await this.users.loadDb();
            const user = users ? users[user_id] : null;
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
            const users = await this.users.loadDb();
            if (users != null && users[user_id] != null) {
                users[user_id].publicKey = jwk;
                await this.users.saveDb(users);
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
        loadDbMine: async (): Promise<MyKeyCacheData> => {
            return await this.loadDbWithName('yacht.keyPair');
        },
        saveDbMine: async (keys: MyKeyCacheData): Promise<void> => {
            return await this.saveDbWithName('yacht.keyPair', keys);
        },
        loadDbMineLocked: async (): Promise<string> => {
            return await this.loadDbWithName('yacht.keyPair');
        },
        saveDbMineLocked: async (keys: string): Promise<void> => {
            return await this.saveDbWithName('yacht.keyPair', keys);
        },
        lockDbMine: async (password: string) => {
            const keys: any = await this.keys.loadDbMine();
            console.log('lockDbMine before locking', keys, JSON.stringify(keys));
            var ciphertext: string = CryptoJS.AES.encrypt(JSON.stringify(keys), password).toString();
            await this.keys.saveDbMineLocked(ciphertext);
        },
        unlockDbMine: async (password: string) => {
            const keys_str: any = await this.keys.loadDbMineLocked();
            if (keys_str && typeof keys_str == 'string') {
                var bytes = CryptoJS.AES.decrypt(keys_str, password);
                var decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
                await this.keys.saveDbMine(decryptedData);
            }
        },
        get_my_keys: async (): Promise<CryptoKeyPair> => {
            const data: MyKeyCacheData = await this.keys.loadDbMine();
            if (data) {
                const publicKey = await crypto.importKey(data.publicKey, true, true);
                const privateKey = await crypto.importKey(data.privateKey, false, true);
                return { publicKey, privateKey };
            } else {
                return null;
            }
        },
        save_my_keys: async (keyPair: CryptoKeyPair, ignore_null: boolean = false): Promise<void> => {
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
            this.privateKeyJson = privateKey;
            if (ignore_null) {
                const old: CryptoKeyPair = await this.keys.get_my_keys();
                if (old && obj.privateKey == null) {
                    obj.privateKey = await crypto.exportKey(old.privateKey);
                }
                if (old && obj.publicKey == null) {
                    obj.publicKey = await crypto.exportKey(old.publicKey);
                }
            }
            await this.keys.saveDbMine(obj);
        },
        import_private_key: async (jwk: JsonWebKey): Promise<{ fingerprint: string, verified: boolean }> => {
            const keyPair: CryptoKeyPair = await this.keys.get_my_keys();
            console.log('import_private_key', keyPair);
            if (keyPair == null) {
                throw new Error('Public key is not found.');
            } else {
                const prv_imported = await crypto.importKey(jwk, false, true);
                const newKeyPair = { privateKey: prv_imported, publicKey: keyPair.publicKey }
                const fingerprint = await crypto.fingerPrint(jwk);
                const verified = await this.keys.verify_my_private_fingerprint(fingerprint);
                console.log('New key pair verified:', verified);
                if (verified) {
                    await this.keys.save_my_keys(newKeyPair);
                    return { fingerprint, verified };
                } else {
                    // const data: MyKeyCacheData = await this.loadDb('yacht.keyPair', 'id', 'myself');
                    // data.privateKey = null;
                    // await this.saveDb('yacht.keyPair', 'id', 'myself', data, true);
                    return { fingerprint: null, verified };
                }
            }
        },
        upload_my_private_key: async (): Promise<boolean> => {
            const private_key_1 = await this.keys.get_my_keys();
            const private_key = await crypto.exportKey(private_key_1.privateKey);
            const { data: { ok } } = <AxiosResponse<PostPrivateKeyResponse>>await axios.post('/api/private_key', { private_key });
            return ok;
        },
        download_my_keys_from_server: async (): Promise<CryptoKeyPair> => {
            const params: GetPublicKeysParams = { user_id: this.user_id };
            const { data: { publicKey: jwk_pub } } = <AxiosResponse<GetPublicKeysResponse>>await axios.get('/api/public_keys/me');
            const { data: { privateKey: jwk_prv } } = <AxiosResponse<GetPrivateKeyResponse>>await axios.get('/api/private_key');
            const publicKey = await crypto.importKey(jwk_pub, true, true);
            const privateKey = await crypto.importKey(jwk_prv, false, true);
            return { publicKey, privateKey };
        },
        verify_my_private_fingerprint: async (fp: string): Promise<boolean> => {
            const { data: { ok, publicKey: jwk_pub, privateKeyFingerprint } } = <AxiosResponse<GetPublicKeysResponse>>await axios.get('/api/public_keys/me');
            return ok && fp == privateKeyFingerprint;
        },
        upload_my_public_key: async (keyPair: CryptoKeyPair) => {
            const jwk = await crypto.exportKey(keyPair.publicKey);
            const privateKeyFingerprint = await crypto.fingerPrint1(keyPair.privateKey);
            const obj: UpdatePublicKeyParams = { for_user: this.user_id, publicKey: jwk, privateKeyFingerprint };
            const { data } = await axios.post('/api/public_keys', obj);
            console.log('update_public_key result', data);
        },
        reset: async (): Promise<{ timestamp: number, fingerprint: { prv: string, pub: string } }> => {
            const timestamp = new Date().getTime();
            const keyPair = await crypto.generateKeyPair(true);
            this.privateKeyJson = await crypto.exportKey(keyPair.privateKey);
            await this.keys.save_my_keys(keyPair);
            await this.keys.upload_my_public_key(keyPair);
            const fingerprint = await this.keys.get_my_fingerprint();
            return { timestamp, fingerprint };
        }
    }
    files = {
        upload: async (session_id: string, data: string | ArrayBuffer, filename: string, filetype: string, encrypting: boolean): Promise<{ ok: boolean, files: { path: string, file_id: string }[], iv: string, secret: string }> => {
            const formData = new FormData();
            let secret: ArrayBuffer, iv: Uint8Array;
            if (encrypting) {
                const r = await crypto.generateKeyAndEncrypt(new Uint8Array(<ArrayBuffer>data));
                secret = r.secret;
                iv = r.iv;
                const blob_encrypted = new Blob([r.data], { type: filetype });
                formData.append('user_image', blob_encrypted, filename);
            } else {
                const blob = new Blob([data], { type: filetype });
                formData.append('user_image', blob, filename);
            }
            return new Promise((resolve) => {
                $.ajax({
                    url: '/api/files?kind=file&session_id=' + session_id + (iv ? '&iv=' + iv : '') + '&token=' + this.token,
                    type: 'post',
                    data: formData,
                    processData: false,
                    contentType: false,
                    dataType: 'json'
                }).then((r) => {
                    if (r.ok) {
                        if (encrypting) {
                            resolve({ ok: r.ok, files: r.files, iv: crypto.encode(iv), secret: crypto.encode(new Uint8Array(secret)) });
                        } else {
                            resolve({ ok: r.ok, files: r.files, iv: null, secret: null });
                        }
                    } else {
                        resolve(null);
                    }
                }, (err) => {
                    console.log('error', err);
                });
            });
        },
        upload_and_post: async (session_id: string, data: ArrayBuffer | string, filename: string, filetype: string) => {
            const { ok, files, secret, iv } = await this.files.upload(session_id, data, filename, filetype, true);
            map(files, (file) => {
                const comment = '<__file::' + file.file_id + '::' + file.path + '::' + iv + '::' + secret + '>';
                this.comments.new({ comment, session: session_id })
            });
        }
    }
    config = {
        get: async (): Promise<string[][]> => {
            const { data: { ok, data } }: AxiosResponse<GetConfigResponse> = await axios.get('/api/config');
            return data;
        },
        save: async (key: string, value: string): Promise<boolean> => {
            // console.log('config.save', key, value);
            const data: PostConfigData = { key, value };
            console.log('PostConfigData', data);
            const { data: { ok } }: AxiosResponse<PostConfigResponse> = await axios.post('/api/config', data);
            return ok;
        }
    }
}

async function decryptComment(comment: string, from_user: string, encrypt: EncryptionMode, model: Model): Promise<{ decrypted: string, encrypt: EncryptionMode }> {
    let deciphered_comment: string;
    if (encrypt == 'ecdh.v1') {
        const my_keys = await model.keys.get_my_keys();
        const remote_publicKey = await model.keys.get(from_user);
        deciphered_comment = await crypto.decrypt_str(remote_publicKey, my_keys.privateKey, comment).catch(() => {
            (async () => {
                const pub = await crypto.fingerPrint1(remote_publicKey);
                const mypub = await crypto.fingerPrint1(my_keys.publicKey);
                const prv = await crypto.fingerPrint1(my_keys.privateKey);
                console.log('Error decrypting', mypub, pub, prv);
                console.log('Comment by ', from_user, { remote_pub: pub, my_pub: mypub });
            })();
            return null
        });
    } else if (encrypt == 'none') {
        deciphered_comment = comment;
    } else {
        deciphered_comment = 'N/A'
    }
    const encrypt_after = deciphered_comment ? 'none' : encrypt;
    return { decrypted: deciphered_comment, encrypt: encrypt_after }
}

async function processComment(m: CommentTyp, model: Model): Promise<CommentTypClient> {
    // console.log('Processing comment by ', m.user_id);
    var v: CommentTypClient = { id: m.id, user: m.user_id, comment: m.comment, timestamp: m.timestamp, formattedTime: formatTime(m.timestamp), originalUrl: "", sentTo: "", session: m.session_id, source: "", kind: 'comment', encrypt: m.encrypt };
    v.originalUrl = m.original_url || "";
    v.sentTo = m.sent_to || "";
    v.source = m.source;
    return v;
}

async function processEvent(m: SessionEvent): Promise<SessionEventClient> {
    return Object.assign({}, m, { formattedTime: formatTime(m.timestamp), user: m.user_id, session: m.session_id });
}

async function getThumbnail(url: string, iv_str?: string, encryption_key?: string): Promise<string> {
    //https://stackoverflow.com/questions/49040247/download-binary-file-with-axios
    const response = await axios.get(url,
        {
            responseType: 'arraybuffer',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'image/jpeg'
            }
        });
    const arr: ArrayBuffer = response.data;
    let arr_decrypted: ArrayBuffer;

    if (encryption_key == null) {
        arr_decrypted = arr;
    } else {
        const secret = await crypto.importEncryptionKey(encryption_key, true);
        arr_decrypted = await crypto.decryptWithEncryptionKey(new Uint8Array(arr), iv_str, secret).catch(() => new Uint8Array([]));
    }
    const thumbnailBase64 = "data:image/jpeg;base64," + crypto.encode(new Uint8Array(arr_decrypted));
    return thumbnailBase64;
}

async function processFile(m: ChatFile): Promise<ChatFileClient> {
    m.kind = 'file';
    let v: ChatFileClient;
    const re = m.comment.match(/<__file::([^:]+)::([^:]+)::([^:]+)::([^:]+)>/);
    const encrypted = re != null;
    if (encrypted) {
        const re = m.comment.match(/<__file::([^:]+)::([^:]+)::([^:]+)::([^:]+)>/);
        const file_id = re[1];
        const url = re[2] || "";
        const iv_str = re[3];
        const encryption_key = re[4];
        const thumbnailBase64 = await getThumbnail(url, iv_str, encryption_key);
        v = Object.assign({}, m, { file_id, user: m.user_id, url, session: m.session_id, thumbnailBase64, formattedTime: formatTime(m.timestamp) });
    } else {
        const re = m.comment.match(/<__file::([^:]+)::([^:]+)>/);
        if (!re) {
            return null;
        }
        console.log('matched', re);
        const file_id = re[1];
        const url = re[2];
        const thumbnailBase64 = ""; // await getThumbnail(url);
        v = Object.assign({}, m, { file_id, url, user: m.user_id, thumbnailBase64, formattedTime: formatTime(m.timestamp), session: m.session_id });
    }
    delete v['originalUrl'];
    return v;
}

// Double check with Elm's data type.
// Fields are copied from Elm source code.
async function checkChatEntryFormat(d: ChatEntryClient): Promise<boolean> {
    if (d.kind == 'file') {
        const { id, user, file_id, url, formattedTime, thumbnailBase64 } = d;
        if (!every([id, user, file_id, url, formattedTime, thumbnailBase64], (a) => a != null)) {
            console.log([id, user, file_id, url, formattedTime, thumbnailBase64])
            return false;
        }
    } else if (d.kind == 'comment') {
        const { id, user, comment, session, formattedTime, originalUrl, sentTo, source } = d;
        if (!every([id, user, comment, session, formattedTime, originalUrl, sentTo, source], (a) => a != null)) {
            console.log([id, user, comment, session, formattedTime, originalUrl, sentTo, source]);
            return false;
        }
    } else if (d.kind == 'event') {
        const { id, session, user, timestamp, action } = d;
        if (!every([id, session, user, timestamp, action], (a) => a != null)) {
            return false;
        }
    }
    return true;
}

function judgeKind(comment: string): ChatEntryKind {
    if (!comment) {
        return "comment";
    }
    if (comment.slice(0, 9) == '<__file::') {
        return "file";
    } else if (comment.slice(0, 10) == '<__event::') {
        return "event"
    } else {
        return "comment"
    }
}

export async function processData(rawEntries: ChatEntry[], model: Model): Promise<ChatEntryClient[]> {
    // console.log('processData latest', rawEntries[rawEntries.length - 1], rawEntries[rawEntries.length - 1].comment);
    const entries = await Promise.all(map(rawEntries || [], async (m: ChatEntry) => {
        if ('comment' in m) {
            const { decrypted, encrypt } = await decryptComment(m.comment, m.user_id, m.encrypt, model).catch((e) => { return { decrypted: m.comment, encrypt: m.encrypt } });
            m.comment = decrypted || m.comment;
            m.kind = judgeKind(decrypted);
            m.encrypt = decrypted ? encrypt : m.encrypt;
        }
        if (m.kind == 'comment') {
            return processComment(m, model);
        } else if (m.kind == 'file') {
            return processFile(m);
        } else if (m.kind == 'event') {
            return processEvent(m);
        }
    }));
    const checked = await Promise.all(map(entries, checkChatEntryFormat));
    const invalidEntries = filter(zip(entries, checked), ([d, c]) => { return !c; });
    if (!isEmpty(invalidEntries)) {
        console.log('Invalid entries', map(invalidEntries, ([d, c]) => d));
        return [];
    } else {
        return entries;
    }
}

export function formatTime(timestamp: number): string {
    if (timestamp < 0) {
        return '(日時不明)'
    } else {
        return moment(timestamp).format('YYYY/M/D HH:mm:ss');
    }
}


//export async function decrypt(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, encrypted: EncryptedData, info?: any): Promise<Uint8Array> {

function decryptWithFingerprint(fp_remote_pub: string, fp_my_pub: string) {

}