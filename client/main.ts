/// <reference path="../common/types.d.ts" />

// @ts-ignore
import { Elm } from './view/Main.elm';
import map from 'lodash/map';
import values from 'lodash/values';
import includes from 'lodash/includes';
import compact from 'lodash/compact'
import axios from 'axios';
import $ from 'jquery';
import 'bootstrap';
import io from "socket.io-client";
import { Model, processData, formatTime2 } from './model';
import * as crypto from './model/cryptography';
import * as video from './video';

import * as shortid_ from 'shortid';
shortid_.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_');
const shortid = shortid_.generate;

const token: string = localStorage.getItem('yacht.token') || "";
const user_id: string = localStorage['yacht.user_id'] || "";
const password: string = localStorage['yacht.db_password'] || "";

axios.defaults.headers.common['x-access-token'] = token;

window['importKey'] = crypto.importKey;

(async () => {
    const model = new Model({
        user_id, token
    });
    const init_ok = await model.init();
    console.log('Model init ok =', init_ok);
    if (!init_ok) {
        location.href = '/login?redirect=' + location.hash;
    }
    const fp = await model.keys.get_my_fingerprint();

    window['model'] = model;

    const config: LocalConfig = Object.assign({}, model.config.defaultConfig, JSON.parse(localStorage['yacht.config'] || "null"));

    var expand_toppane: boolean = config.expand_toppane || false;
    var expand_chatinput = config.expand_chatinput || false;
    var show_users_with_email_only = config.show_users_with_email_only || false;

    await Promise.all([
        // model.keys.unlockDbMine(password),
        model.users.unlockDb(password),
        model.sessions.unlockDb(password)]);
    // return;

    const app: ElmApp = Elm.Main.init({ flags: { user_id, config } });
    if (fp && app) {
        app.ports.setValue.send(['my_public_key', fp.pub || ""]);
        app.ports.setValue.send(['my_private_key', fp.prv || ""]);
    }

    const socket: SocketIOClient.Socket = io('');

    socket.on('connect', () => {
        console.log('subscribing on socket');
        socket.emit('subscribe', { token });
    });

    socket.on('reload', () => {
        location.reload();
    })

    app.ports.saveConfig.subscribe(({ userWithEmailOnly }) => {
        console.log('saveConfig', { userWithEmailOnly });
        show_users_with_email_only = userWithEmailOnly;
        model.config.updateLocal((c) => { c.show_users_with_email_only = show_users_with_email_only; return c; })
    });

    app.ports.saveSDGs.subscribe(async (s) => {
        await model.users.update_my_info('SDGs', s);
    })

    axios.get('/api/verify_token').then(({ data }) => {
        if (!data.valid) {
            console.log('verify token failed', data);
            location.href = '/login' + location.hash;
        }
    });

    socket.on("users.new", async (msg: UsersNewSocket) => {
        await model.users.on_new(msg);
        const users = await model.users.list().catch(() => []);
        const ps = map(values(users), model.users.toClient);
        const usersClient = await Promise.all(ps);
        console.log('Feeding users', usersClient);
        app.ports.feedUsers.send(usersClient);
    });

    socket.on("users.update", async (msg: UsersUpdateSocket) => {
        await model.users.on_update(msg);
        const users = await model.users.list().catch(() => []);
        const ps = map(values(users), model.users.toClient);
        const usersClient = await Promise.all(ps);
        app.ports.feedUsers.send(usersClient);
    });

    socket.on("workspaces.update", async (msg: WorkspacesUpdateSocket) => {
        // await model.workspaces.on_update(msg);
        const wss = await model.workspaces.list().catch(() => []);
        app.ports.feedWorkspaces.send(values(wss));
    });

    socket.on("sessions.new", async (msg: SessionsNewSocket) => {
        await model.sessions.on_new(msg);
        app.ports.onChangeData.send({ resource: "sessions", id: msg.id, operation: "new" });
    });

    socket.on("sessions.delete", async (msg: SessionsDeleteSocket) => {
        await model.sessions.on_delete(msg);
        app.ports.onChangeData.send({ resource: "sessions", id: msg.id, operation: "delete" });
    });

    socket.on("sessions.update", async (msg: SessionsUpdateSocket) => {
        await model.sessions.on_update(msg);
        app.ports.onChangeData.send({ resource: "sessions", id: msg.id, operation: "update" });
    });

    socket.on("comments.new", async (msg: CommentsNewSocket) => {
        const r = await model.comments.on_new(msg);
        if (r != null) {
            app.ports.onChangeData.send({ resource: "sessions", id: r.session_id, operation: "comments.new" });
            scrollToBottom();
        }
    });

    socket.on("comments.delete", async (msg: CommentsDeleteSocket) => {
        const { session_id } = await model.comments.on_delete(msg);
        if (session_id != null) {
            app.ports.onChangeData.send({ resource: "sessions", id: session_id, operation: 'comments.delete' });
        }
    });

    function scrollTo(id: string) {
        console.log('scrollTo', id);
        window.setTimeout(() => {
            const el = document.getElementById(id);
            if (el) {
                // console.log('scrollTo', id);
                el.scrollIntoView(true);
            }
        }, 50);
    }

    function scrollToBottom() {
        const el = document.getElementById('end-line');
        if (el) {
            el.scrollIntoView(true);
        }
    }

    app.ports.resetKeys.subscribe(async () => {
        const { timestamp, fingerprint } = await model.keys.reset();
        app.ports.setValue.send(['my_public_key', fingerprint.pub]);
        app.ports.setValue.send(['my_private_key', fingerprint.prv]);
    });

    app.ports.resetUserCache.subscribe(async () => {
        await model.users.resetCacheAndReload();
        model.users.list().then(async (us) => {
            Promise.all(map(us, model.users.toClient)).then((users) => {
                app.ports.feedUsers.send(users);
            })
        });
    });

    app.ports.deleteSession.subscribe(async ({ id }) => {
        const r = await model.sessions.delete(id);
        console.log('deleteSession', r);
    });

    app.ports.reloadSession.subscribe(async (session_id) => {
        const comments = await model.sessions.reload(session_id);
        if (comments) {
            app.ports.feedMessages.send(comments);
        }
    });

    app.ports.deleteWorkspace.subscribe(async (workspace_id) => {
        const ok = await model.workspaces.delete(workspace_id);
        if (ok) {
            const wss = await model.workspaces.list();
            app.ports.feedWorkspaces.send(values(wss));
        }
    });

    app.ports.joinWorkspace.subscribe(async (workspace_id) => {
        const ok = await model.workspaces.join(workspace_id);
        console.log('joinWorkspace', ok);
        if (ok) {
            const ws = await model.workspaces.get(workspace_id);
            console.log('joinWorkspace', ws);
            if (ws) {
                app.ports.feedWorkspace.send(ws);
                const us = await model.users.list();
                const users = await Promise.all(map(us, model.users.toClient));
                app.ports.feedUsers.send(users);
            }
        }
    });
    app.ports.quitWorkspace.subscribe(async (workspace_id) => {
        const ok = await model.workspaces.quit(workspace_id);
        if (ok) {
            const wss = await model.workspaces.list();
            app.ports.feedWorkspaces.send(values(wss));
        }
    });

    app.ports.getSessionsInWorkspace.subscribe(async (workspace_id) => {
        const data = await model.sessions.list_in_workspace(workspace_id);
        app.ports.feedSessionsInWorkspace.send(compact(map(data, 'id')))
    });

    app.ports.scrollToBottom.subscribe(scrollToBottom);

    app.ports.scrollTo.subscribe(scrollTo);

    app.ports.createWorkspace.subscribe(async function (args: any[]) {
        const name: string = args[0];
        const members: string[] = args[1];
        const ws = await model.workspaces.create(name, members);
        if (ws != null) {
            model.workspaces.list().then((wss) => {
                app.ports.feedWorkspaces.send(values(wss));
                location.href = '#/workspaces/' + ws.id;
            });
        }
    });

    app.ports.saveWorkspace.subscribe(async ({ id, name }) => {
        if (name != "") {
            const ok = await model.workspaces.update({ id, name });
            console.log('saveWorkspace', id, name, ok)
        } else {

        }
    })

    app.ports.getWorkspace.subscribe(async (wid) => {
        const ws = await model.workspaces.get(wid);
        console.log('getWorkspace', ws);
        if (ws) {
            app.ports.feedWorkspace.send(ws);
        }
    })

    app.ports.createSession.subscribe(async function ({ workspace, name, members, redirect }: { workspace: string, name: string, members: string[], redirect: boolean }) {
        console.log('createSession', { workspace, name, members })
        if (name == "") {
            name = formatTime2(new Date().getTime()) + " 会話"
        }
        const session = await model.sessions.new({ name, members, workspace: workspace == "" ? undefined : workspace });
        app.ports.feedNewRoomInfo.send(model.sessions.toClient(session));
        if (redirect) {
            location.hash = '/sessions/' + session.id;
        }
    });

    app.ports.getCurrentSessionInfo.subscribe(async (id: string) => {
        const session = await model.sessions.get(id);
        if (session) {
            app.ports.feedNewRoomInfo.send(model.sessions.toClient(session));
        }
    });

    app.ports.initializeData.subscribe(async () => {
        model.users.list().then(async (us) => {
            Promise.all(map(us, model.users.toClient)).then((users) => {
                console.log('Feeding users', users);
                app.ports.feedUsers.send(users);
            })
        });
        getUserImages();
        getAndfeedRoomInfo();
        model.workspaces.list().then((ws) => {
            app.ports.feedWorkspaces.send(values(ws));
        })
    });

    app.ports.reloadSessions.subscribe(() => {
        console.log('reloadSessions');
        model.sessions.list().then((sessions) => {
            console.log('Got', sessions);
            app.ports.feedRoomInfo.send(sessions);
        });
    });

    app.ports.getUsers.subscribe(() => {
        console.log('app.ports.getUsers');
        model.users.list().then(async (us) => {
            Promise.all(map(us, model.users.toClient)).then((users) => {
                app.ports.feedUsers.send(users);
            })
        });
    });

    app.ports.getMessages.subscribe(async (session: string) => {
        console.log('getMessages ', session);
        if (!model.sessions.validID(session)) {
            console.error('getMessages: empty ID');
        } else {
            const comments = await model.comments.list_for_session(session);
            if (comments != null) {
                console.log('feedMessages to send', comments);
                app.ports.feedMessages.send(comments);
            }
        }

    });

    app.ports.getUserMessages.subscribe(async function (user: string) {
        model.comments.list_for_user(user).then(app.ports.feedUserMessages.send);
    });

    app.ports.getSessionsWithSameMembers.subscribe(function ({ members, is_all }: { members: Array<string>, is_all: boolean }) {
        axios.get('/api/sessions', { params: { of_members: members.join(','), is_all } }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
            app.ports.feedSessionsWithSameMembers.send(map(data.data, (r) => {
                return r.id;
            }));
        });
    });

    app.ports.getSessionsOf.subscribe(function (user: string) {
        const params: GetSessionsOfParams = { of_members: user };
        axios.get('/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
            app.ports.feedSessionsOf.send(map(data.data, "id"));
        }).catch(() => {
            app.ports.feedSessionsOf.send([]);
        });
    });

    function getAndfeedRoomInfo() {
        model.sessions.list().then((rooms) => {
            // console.log(rooms);
            app.ports.feedRoomInfo.send(rooms);
        });
    }

    app.ports.getRoomInfo.subscribe(getAndfeedRoomInfo);

    app.ports.sendCommentToServer.subscribe(({ comment, session }: { comment: string, session: string }) => {
        model.comments.new({ comment, session_id: session }).then(() => {
            app.ports.sendCommentToServerDone.send(null);
            getAndfeedRoomInfo();
            scrollToBottom();
        });
    });

    app.ports.removeItemRemote.subscribe((comment_id: string) => {
        axios.delete('/api/comments/' + comment_id, { data: { token } }).then(({ data }: AxiosResponse<DeleteCommentResponse>) => {
            console.log(data);
        });
    });

    app.ports.sendRoomName.subscribe(({ id, new_name }) => {
        axios.patch('/api/sessions/' + id, { name: new_name, token }).then(({ data }: AxiosResponse<PatchSessionResponse>) => {
            console.log(data, data.ok, id, new_name);
        })
    });

    app.ports.setPageHash.subscribe(function (hash: string) {
        if (location.hash != hash) {
            location.hash = hash;
        }
    });

    window.addEventListener('hashchange', () => {
        console.log('hashChange', location.hash, app.ports.hashChanged);
        app.ports.hashChanged.send(location.hash);
        return null;
    });

    app.ports.hashChanged.send(location.hash);

    app.ports.recalcElementPositions.subscribe(({ show_toppane: _expand_toppane, expand_chatinput: _expand_chatinput }: { show_toppane: boolean, expand_chatinput: boolean }) => {
        console.log("recalcElementPositions", { _show_toppane: _expand_toppane, _expand_chatinput });
        expand_toppane = _expand_toppane;
        expand_chatinput = _expand_chatinput;
        model.config.updateLocal((c) => {
            c.expand_toppane = expand_toppane;
            c.expand_chatinput = _expand_chatinput;
            return c;
        });
    });

    app.ports.joinRoom.subscribe(({ session_id }) => {
        model.sessions.get(session_id).then((session: RoomInfo) => {
            if (!includes(map(session.members, 'id'), user_id)) {
                $.post('/api/join_session', { token, session_id }).then((res: JoinSessionResponse) => {
                    console.log('join_session', res);
                });
            } else {
                socket.emit('enter_session');
            }
        });
    });

    app.ports.startPosterSession.subscribe(async (file_id: string) => {
        console.log('startPosterSession', file_id);
        const members: string[] = [localStorage['yacht.user_id']];
        const name: string = "ポスターセッション: " + formatTime2(new Date().getTime())
        const temporary_id: string = shortid();
        const post_data: PostSessionsParam = { name, members, temporary_id, file_id };
        const { data }: PostSessionsResponse = await axios.post('/api/sessions', post_data);
        if (data) {
            app.ports.receiveNewRoomInfo.send(data);
            const p1: Promise<AxiosResponse<GetSessionsResponse>> = axios.get('/api/sessions');
            const p2: Promise<AxiosResponse<GetCommentsResponse>> = axios.get('/api/sessions/' + data.id + '/comments', { params: { token } });
            const [{ data: { data: data1 } }, { data: { data: data2 } }] = await Promise.all([p1, p2]);
            if (data2) {
                app.ports.feedRoomInfo.send(map(data1, model.sessions.toClient));
                const processed = await processData(data2, model);
                app.ports.feedMessages.send(processed);
            }
        }
    });

    app.ports.setConfigValue.subscribe(({ key, value }) => {
        model.config.save(key, value);
    });

    app.ports.setConfigLocal.subscribe(({ key, value }) => {
        console.log('setConfigLocal', key, value);
        model.config.saveLocal(key, value);
    });

    app.ports.setProfileValue.subscribe(({ key, value }) => {
        model.users.update_my_info(key, value);
    });

    app.ports.getConfig.subscribe(async () => {
        const configList: string[][] = await model.config.get();
        console.log('feedConfigValues feeding', configList);
        app.ports.feedConfigValues.send(configList);
    });

    app.ports.setVisibility.subscribe(async ({ id, kind, visibility }) => {
        if (kind == 'session') {
            await model.sessions.set_visibility({ user_id, id, visibility });
        } else if (kind == 'workspace' && visibility != 'workspace') {
            await model.workspaces.update({ id, visibility });
        }
    });

    app.ports.uploadPrivateKey.subscribe(async () => {
        await model.keys.upload_my_private_key();
    });

    app.ports.downloadPrivateKey.subscribe(() => {
        const content = JSON.stringify(model.privateKeyJson, null, 2);
        handleDownload(content);
    });

    app.ports.logout.subscribe(async () => {
        await Promise.all([
            // model.keys.lockDbMine(password),
            model.users.lockDb(password),
            model.sessions.lockDb(password)]);
        $.post('/api/logout', { token }).then((res) => {
            if (res.ok) {
                localStorage.removeItem('yacht.token');
                localStorage.removeItem('yacht.user_id');
                localStorage.removeItem('yacht.username');
                location.href = '/login';
            }
        })
    });

    $(() => {
        $(document).on('dragover', '.profile-img.mine', (ev) => {
            $(ev.target).addClass('dragover');
            ev.preventDefault();
        });
        $(document).on('dragleave', '.profile-img.mine', (ev) => {
            $(ev.target).removeClass('dragover');
        });
        $(document).on('drop', '.profile-img.mine', (ev: any) => {
            const event: DragEvent = ev.originalEvent;
            console.log(ev);
            ev.stopPropagation();
            ev.preventDefault();
            $(ev.target).removeClass('dragover');
            const file_id = $(ev.target).attr('data-file_id');
            if (event.dataTransfer) {
                const files = event.dataTransfer.files;
                map(files, function (file) {
                    var reader = new FileReader();
                    reader.onloadend = () => {
                        const formData = new FormData();
                        if (reader.result) {
                            const imgBlob = new Blob([reader.result], { type: file.type });
                            formData.append('user_image', imgBlob, file.name);
                            if (file_id && file_id != '') {
                                updateData(file_id, formData);
                            } else {
                                postPosterData(formData);
                            }
                        }
                    };
                    reader.readAsArrayBuffer(file);
                });
                console.log(files);
            }
        });

        $(document).on('dragover', '#chat-input', (ev) => {
            $(ev.target).addClass('dragover');
            ev.preventDefault();
        });
        $(document).on('dragleave', '#chat-input', (ev) => {
            $(ev.target).removeClass('dragover');
        });
        $(document).on('drop', '#footer', (ev: any) => {
            const event: DragEvent = ev.originalEvent;
            console.log(ev);
            ev.stopPropagation();
            ev.preventDefault();
            $(ev.target).removeClass('dragover');
            if (event.dataTransfer) {
                const files = event.dataTransfer.files;
                map(files, (file) => {
                    var reader = new FileReader();
                    reader.onloadend = () => {
                        const session_id = $('#chat-body').attr('data-session_id');
                        if (session_id && reader.result) {
                            console.log('reader result', reader.result);
                            model.files.upload_and_post(session_id, <ArrayBuffer>reader.result, file.name, file.type).then(() => {

                            });
                        }
                    };
                    reader.readAsArrayBuffer(file);
                });
            }
        });
        $(document).on('paste', (ev: any) => {
            const event: ClipboardEvent = ev.originalEvent;
            console.log(ev, event);
            const file = event.clipboardData ?
                (event.clipboardData.items ?
                    (event.clipboardData.items[0] ?
                        event.clipboardData.items[0].getAsFile() : null) : null) : null;
            if (file) {
                const is_image = event.clipboardData ?
                    (event.clipboardData.items ?
                        (event.clipboardData.items[0] ?
                            /image.*/.test(event.clipboardData.items[0].type) : null) : null) : null;
                if (is_image) {
                    const reader = new FileReader();
                    reader.onload = function (evt) {
                        const session_id = $('#chat-body').attr('data-session_id');
                        if (session_id && reader.result) {
                            console.log('reader result', reader.result);
                            const byteString = atob((<string>reader.result).split(',')[1]);
                            const buffer = new Uint8Array(byteString.length);
                            for (var i = 0; i < byteString.length; i++) {
                                buffer[i] = byteString.charCodeAt(i);
                            }
                            model.files.upload_and_post(session_id, buffer, file.name, file.type).then(() => {

                            });
                        }
                        console.log({
                            dataURL: reader.result,
                            event: evt,
                            file: file,
                            name: file ? file.name : null
                        });
                    };
                    reader.readAsDataURL(file);
                }

            }
        });
        // @ts-ignore
        $('[data-toggle="tooltip"]').tooltip();

        const subject = $('#toppane-subject');
        $(document).on('scroll', '#chat-outer', () => {
            const pos_threshold = 40;
            const pos = $('#chat-outer').scrollTop();
            if (pos) {
                if (prev_pos < pos_threshold && pos >= pos_threshold) {
                    subject.removeClass('hidden');
                } else if (prev_pos > pos_threshold && pos <= pos_threshold) {
                    subject.addClass('hidden');
                }
                prev_pos = pos;
            }
        });
        console.log('#upload-private-key', $('#upload-private-key'))
        $(document).on('change', '#upload-private-key', handleFileSelect);

    });

    let prev_pos = 0;

    function getUserImages() {
        axios.get('/api/files', { params: { kind: 'poster' } }).then(({ data }) => {
            // console.log('getUserImages', data);
            map(data.files, (files, user_id) => {
                const dat: UserImages = {
                    user_id, images: map(files, (f) => {
                        return { file_id: f.id, url: f.path };
                    })
                };
                // console.log(dat);
                app.ports.feedUserImages.send(dat);
            });
        });
    }

    app.ports.deleteFile.subscribe((file_id: string) => {
        const user_id = localStorage['yacht.user_id'];
        console.log('deleteFile', user_id, file_id);
        axios.delete('/api/files/' + file_id, { data: { user_id } }).then(({ data }: AxiosResponse<DeleteFileResponse>) => {
            console.log(data);
        });
    });

    app.ports.startVideo.subscribe((roomName) => {
        console.log('start video');
        socket.emit('new.video', { session_id: roomName });
        const onPeerJoin = (uid: string) => {
            app.ports.videoJoin.send(uid);
        };
        const onPeerLeave = (uid: string) => {
            app.ports.videoLeft.send(uid);
        };
        video.start(user_id, roomName, onPeerJoin, onPeerLeave);
    })

    app.ports.stopVideo.subscribe((roomName) => {
        console.log('stop video');
        video.terminate(user_id, roomName);
    })

    function postPosterData(formData: FormData) {
        $.ajax({
            url: '/api/files?kind=poster&token=' + token,
            type: 'post',
            data: formData,
            processData: false,
            contentType: false,
            dataType: 'html'
        }).then((r) => {
            const res = JSON.parse(r);
            console.log('postPosterData success', res);
            if (res.ok) {
                getUserImages();
            }
        }, (err) => {
            console.log('postPosterData error', err);
        }).catch((e) => {
            console.log('postPosterData error', e);
        });
    }

    function updateData(file_id: string, formData: FormData) {
        $.ajax({
            url: '/api/files/' + file_id + '?token=' + token,
            type: 'patch',
            data: formData,
            processData: false,
            contentType: false,
            dataType: 'html',
            complete: function () { },
            success: function (r) {
                const res = JSON.parse(r);
                console.log(res);
                if (res.ok) {
                    getUserImages();
                }
            }
        });
    }
    function handleFileSelect(evt) {
        var files = evt.target.files; // FileList object

        var reader = new FileReader();
        console.log('handleFileSelect');

        // Closure to capture the file information.
        reader.onload = () => {
            (async () => {
                const prv_jwk: JsonWebKey = JSON.parse(<string>reader.result);
                model.keys.import_private_key(prv_jwk).then(({ fingerprint }) => {
                    app.ports.setValue.send(['my_private_key', fingerprint]);
                    app.ports.setValue.send(['my_private_key_message', "鍵を取り込みました。"]);
                }).catch(() => {
                    app.ports.setValue.send(['my_private_key_message', "秘密鍵が正しくありません。"]);
                });
            })();
        }

        // Read in the image file as a data URL.
        reader.readAsText(files[0]);
    }
})();

type UserImages = {
    user_id: string;
    images: {
        file_id: any;
        url: any;
    }[];
}

type ElmSend<T> = {
    send: (arg: T) => void;
}

type ElmSub<T> = {
    subscribe: (fn: (arg: T) => void) => void;
}

interface ElmAppPorts {
    getMessages: ElmSub<string>;
    onChangeData: ElmSend<{ resource: string, id: string, operation: string }>;
    scrollToBottom: ElmSub<void>;
    scrollTo: ElmSub<string>;
    createWorkspace: ElmSub<any[]>;
    createSession: ElmSub<{ workspace: string, members: string[], name: string, redirect: boolean }>;
    getCurrentSessionInfo: ElmSub<string>;
    feedNewRoomInfo: ElmSend<RoomInfoClient>;
    feedRoomInfo: ElmSend<RoomInfoClient[]>;
    feedMessages: ElmSend<ChatEntryClient[]>;
    getConfig: ElmSub<void>
    feedConfigValues: ElmSend<string[][]>;
    setConfigValue: ElmSub<{ key: string, value: string }>;
    setConfigLocal: ElmSub<{ key: string, value: string }>;
    setProfileValue: ElmSub<{ key: string, value: string }>;
    getWorkspace: ElmSub<string>;
    feedWorkspace: ElmSend<Workspace>;
    feedWorkspaces: ElmSend<Workspace[]>;
    feedSessionsInWorkspace: ElmSend<string[]>;
    getSessionsInWorkspace: ElmSub<string>;
    setVisibility: ElmSub<{ id: string, kind: 'session' | 'workspace', visibility: SessionVisibility | WorkspaceVisibility }>;
    getUsers: ElmSub<void>;
    feedUsers: ElmSend<UserClient[]>;
    getUserMessages: ElmSub<string>;
    feedUserMessages: ElmSend<ChatEntryClient[]>;
    getSessionsWithSameMembers: ElmSub<{ members: Array<string>, is_all: boolean }>;
    feedSessionsWithSameMembers: ElmSend<string[]>;
    getSessionsOf: ElmSub<string>;
    feedSessionsOf: ElmSend<string[]>;
    sendCommentToServer: ElmSub<{ comment: string, user: string, session: string }>;
    sendCommentToServerDone: ElmSend<null>;
    getRoomInfo: ElmSub<string>;
    removeItemRemote: ElmSub<string>;
    sendRoomName: ElmSub<{ id: string, new_name: string }>;
    setPageHash: ElmSub<string>;
    hashChanged: ElmSend<string>;
    recalcElementPositions: ElmSub<{ show_toppane: boolean, expand_chatinput: boolean }>;
    joinRoom: ElmSub<{ session_id: string }>;
    startPosterSession: ElmSub<string>;
    receiveNewRoomInfo: ElmSend<{ id: string }>;
    logout: ElmSub<void>;
    feedUserImages: ElmSend<UserImages>;
    deleteFile: ElmSub<string>;
    deleteSession: ElmSub<{ id: string }>;
    deleteWorkspace: ElmSub<string>;
    joinWorkspace: ElmSub<string>;
    quitWorkspace: ElmSub<string>;
    reloadSession: ElmSub<string>;
    reloadSessions: ElmSub<void>;
    saveConfig: ElmSub<{ userWithEmailOnly: boolean }>;
    downloadPrivateKey: ElmSub<void>;
    uploadPrivateKey: ElmSub<void>;
    resetKeys: ElmSub<void>;
    resetUserCache: ElmSub<void>;
    setValue: ElmSend<string[]>;
    initializeData: ElmSub<void>;
    startVideo: ElmSub<string>;
    stopVideo: ElmSub<string>;
    videoJoin: ElmSend<string>;
    videoLeft: ElmSend<string>;
    saveSDGs: ElmSub<string>;
    saveWorkspace: ElmSub<{ id: string, name: string }>;
}

interface ElmApp {
    ports: ElmAppPorts;
}

// https://qiita.com/wadahiro/items/eb50ac6bbe2e18cf8813
function handleDownload(content: string) {
    var blob = new Blob([content], { "type": "application/json" });

    const el = <HTMLAnchorElement>document.getElementById("download-private-key");
    el.href = window.URL.createObjectURL(blob);
}