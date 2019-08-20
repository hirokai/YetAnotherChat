/// <reference path="../common/types.d.ts" />

// @ts-ignore
import { Elm } from './Main.elm';
import { map } from 'lodash-es';
import axios from 'axios';
import $ from 'jquery';
import moment from 'moment';
import 'bootstrap';
import io from "socket.io-client";
import { Model, processData, processSessionInfo } from './client_model';
import * as crypto from './cryptography';
require('moment/locale/ja');
moment.locale('ja');

const shortid = require('shortid').generate;

const token: string = localStorage.getItem('yacht.token') || "";
const user_id: string = localStorage['yacht.user_id'] || "";

window['removeSavedKeys'] = () => {
    crypto.removeSavedKeys().then(() => {
        console.log('Removed keys.');
    });
}

window['importKey'] = crypto.importKey;

if (!token || token == '') {
    location.href = '/login' + location.hash;
}

crypto.test_crypto();
// crypto.test_crypto1();
// throw new Error('Abort');

(async () => {
    const model = new Model(token, { privateKey: null, publicKey: null });
    const keyPair = await crypto.loadMyKeys();
    console.log('public and private keys', keyPair);
    if (keyPair) {
        model.keyPair = keyPair;
        console.log('Uploading a previously made public key.');
        const jwk = await crypto.exportKey(keyPair.publicKey);
        const obj: PostPublicKeyParams = {
            publicKey: jwk, token, for_user: user_id
        };
        await axios.post('/api/public_keys', obj);
    } else {
        console.log('Generating a new public/private keys.')
        const localKey = await crypto.generatePublicKey(true);
        console.log('Generated', localKey)
        crypto.saveMyKeys(localKey).then(() => {
            console.log('Key pair saved to DB');
        });
        model.keyPair = localKey;
        console.log('posting ', localKey);
        const jwk = await crypto.exportKey(localKey.publicKey);
        const obj: PostPublicKeyParams = { publicKey: jwk, for_user: user_id, token }
        await axios.post('/api/public_keys', obj);
    }
    window['model'] = model;


    const app: ElmApp = Elm.Main.init({ flags: { user_id, show_toppane, expand_chatinput, show_users_with_email_only } });

    window.setTimeout(() => {
        recalcPositions(show_toppane, expand_chatinput);
    }, 100);


    socket.on('connect', () => {
        socket.emit('subscribe', { token });
    });

    app.ports.saveConfig.subscribe(({ userWithEmailOnly }) => {
        console.log('saveConfig', { userWithEmailOnly });
        show_users_with_email_only = userWithEmailOnly;
        localStorage['yacht.show_users_with_email_only'] = JSON.stringify(show_users_with_email_only);
    });


    axios.get('/api/verify_token', { params: { token } }).then(({ data }) => {
        if (!data.valid) {
            console.log('verify token failed', data);
            location.href = '/login' + location.hash;
        }
    });

    socket.on("users.update", async (msg: UsersUpdateSocket) => {
        await model.users.on_update(msg);
        if (msg.user_id != null) {
            app.ports.onChangeData.send({ resource: "users", id: msg.user_id });
        }
    });

    socket.on("sessions.new", async (msg: SessionsNewSocket) => {
        await model.sessions.on_new(msg);
        app.ports.onChangeData.send({ resource: "sessions", id: "" });
    });

    socket.on("sessions.update", async (msg: SessionsUpdateSocket) => {
        await model.sessions.on_update(msg);
        app.ports.onChangeData.send({ resource: "sessions", id: "" });
    });

    socket.on("comments.new", async (msg: CommentsNewSocket) => {
        const session_id = await model.comments.on_new(msg);
        if (session_id != null) {
            app.ports.onChangeData.send({ resource: "comments", id: session_id });
        }
    });

    socket.on("comments.delete", async (msg: CommentsDeleteSocket) => {
        const { session_id } = await model.comments.on_delete(msg);
        if (session_id != null) {
            app.ports.onChangeData.send({ resource: "comments", id: session_id });
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
        el.scrollIntoView(true);
    }

    app.ports.deleteSession.subscribe(async ({ id }) => {
        const r = await model.sessions.delete(id);
        console.log('deleteSession', r);
    })

    app.ports.scrollToBottom.subscribe(scrollToBottom);

    app.ports.scrollTo.subscribe(scrollTo);

    app.ports.createNewSession.subscribe(async function (args: any[]) {
        var name: string = args[0];
        const members: string[] = args[1];
        if (name == "") {
            name = "会話: " + moment().format('MM/DD HH:mm')
        }
        const { sessions, messages } = await model.sessions.new({ name, members });

        app.ports.feedRoomInfo.send(map(sessions, processSessionInfo));
        const processed = await processData(messages, null);
        app.ports.feedMessages.send(processed);
    });

    app.ports.enterSession.subscribe((session_id: string) => {
        model.sessions.get(session_id);
    });

    app.ports.getUsers.subscribe(() => {
        model.users.get().then((us) => {
            console.log('model.users.get()', us);
            app.ports.feedUsers.send(us);
        });
    });

    app.ports.getMessages.subscribe((session: string) => {
        model.comments.list_for_session(session).then(app.ports.feedMessages.send);
    });

    app.ports.getUserMessages.subscribe(async function (user: string) {
        model.comments.list_for_user(user).then(app.ports.feedUserMessages.send);
    });

    app.ports.getSessionsWithSameMembers.subscribe(function ({ members, is_all }: { members: Array<string>, is_all: boolean }) {
        axios.get('/api/sessions', { params: { of_members: members.join(','), is_all, token } }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
            app.ports.feedSessionsWithSameMembers.send(map(data.data, (r) => {
                return r.id;
            }));
        });
    });

    app.ports.getSessionsOf.subscribe(function (user: string) {
        const params: GetSessionsOfParams = { of_members: user, token };
        axios.get('/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
            app.ports.feedSessionsOf.send(map(data.data, "id"));
        }).catch(() => {
            app.ports.feedSessionsOf.send([]);
        });
    });

    function getAndfeedRoomInfo() {
        model.sessions.list().then(app.ports.feedRoomInfo.send);
    }

    app.ports.getRoomInfo.subscribe(getAndfeedRoomInfo);

    var temporary_id_list = [];

    app.ports.sendCommentToServer.subscribe(({ comment, session }: { comment: string, session: string }) => {
        const temporary_id = shortid();
        temporary_id_list.push(temporary_id);
        model.comments.new({ comment, session }).then(() => {
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
        console.log(hash);
        location.hash = hash;
        // recalcPositions(show_toppane);
    });

    function recalcPositions(show_toppane: boolean, expand_chatinput: boolean) {
        // console.log('recalcPositions', show_toppane, expand_chatinput);
        const height = 100 + (show_toppane ? 160 : 0) + (expand_chatinput ? 90 : 0);
        $(() => {
            $('#chat-outer').height(window.innerHeight - height);
        });

        window.addEventListener('resize', () => {
            $('#chat-outer').height(window.innerHeight - height);
            // console.log(window.innerHeight);
        });
    }

    window.addEventListener('hashchange', () => {
        console.log('hashChange', location.hash, app.ports.hashChanged);
        app.ports.hashChanged.send(location.hash);
        recalcPositions(show_toppane, expand_chatinput);
        return null;
    });

    app.ports.hashChanged.send(location.hash);

    app.ports.recalcElementPositions.subscribe(({ show_toppane: _show_toppane, expand_chatinput: _expand_chatinput }: { show_toppane: boolean, expand_chatinput: boolean }) => {
        console.log("recalcElementPositions", { _show_toppane, _expand_chatinput });
        show_toppane = _show_toppane;
        expand_chatinput = _expand_chatinput;
        localStorage['yacht.show_toppane'] = JSON.stringify(show_toppane);
        localStorage['yacht.expand_chatinput'] = JSON.stringify(_expand_chatinput);
        recalcPositions(_show_toppane, expand_chatinput);
    });

    app.ports.joinRoom.subscribe(({ session_id }) => {
        $.post('/api/join_session', { token, session_id }).then((res: JoinSessionResponse) => {
            console.log('join_session', res);
        });
        recalcPositions(show_toppane, expand_chatinput);
    });


    app.ports.startPosterSession.subscribe(async (file_id: string) => {
        console.log('startPosterSession', file_id);
        const members: string[] = [localStorage['yacht.user_id']];
        const name: string = "ポスターセッション: " + moment().format('MM/DD HH:mm')
        const temporary_id: string = shortid();
        const post_data: PostSessionsParam = { name, members, temporary_id, token, file_id };
        const { data }: PostSessionsResponse = await $.post('/api/sessions', post_data);
        app.ports.receiveNewRoomInfo.send(data);
        const p1: Promise<AxiosResponse<GetSessionsResponse>> = axios.get('/api/sessions', { params: { token } });
        const p2: Promise<AxiosResponse<GetCommentsResponse>> = axios.get('/api/comments', { params: { session: data.id, token } });
        const [{ data: { data: data1 } }, { data: { data: data2 } }] = await Promise.all([p1, p2]);
        app.ports.feedRoomInfo.send(map(data1, processSessionInfo));
        const processed = await processData(data2, model.keyPair.privateKey);
        app.ports.feedMessages.send(processed);
    });

    app.ports.logout.subscribe(() => {
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
        const profile_img = $('.profile-img.mine');
        profile_img.addClass('droppable')

        profile_img.on('dragover', (ev) => {
            $(ev.target).addClass('dragover');
            ev.preventDefault();
        });
        profile_img.on('dragleave', (ev) => {
            $(ev.target).removeClass('dragover');
        });
        profile_img.on('drop', (ev: any) => {
            const event: DragEvent = ev.originalEvent;
            console.log(ev);
            ev.stopPropagation();
            ev.preventDefault();
            $(ev.target).removeClass('dragover');
            const file_id = $(ev.target).attr('data-file_id');
            const files = event.dataTransfer.files;
            map(files, function (file) {
                var reader = new FileReader();
                reader.onloadend = () => {
                    const formData = new FormData();
                    const imgBlob = new Blob([reader.result], { type: file.type });
                    formData.append('user_image', imgBlob, file.name);
                    if (file_id && file_id != '') {
                        updateData(file_id, formData);
                    } else {
                        postPosterData(formData);
                    }
                };
                reader.readAsArrayBuffer(file);
            });
            console.log(files);
        });

        const chat_body = $('#chat-input');
        chat_body.on('dragover', (ev) => {
            $(ev.target).addClass('dragover');
            ev.preventDefault();
        });
        chat_body.on('dragleave', (ev) => {
            $(ev.target).removeClass('dragover');
        });
        chat_body.on('drop', (ev: any) => {
            const event: DragEvent = ev.originalEvent;
            console.log(ev);
            ev.stopPropagation();
            ev.preventDefault();
            $(ev.target).removeClass('dragover');
            const files = event.dataTransfer.files;
            map(files, function (file) {
                var reader = new FileReader();
                reader.onloadend = () => {
                    const formData = new FormData();
                    const imgBlob = new Blob([reader.result], { type: file.type });
                    formData.append('user_image', imgBlob, file.name);
                    const session_id: string = $('#chat-body').attr('data-session_id');
                    postFileToSession(session_id, formData);
                };
                reader.readAsArrayBuffer(file);
            });
        });

        // @ts-ignore
        $('[data-toggle="tooltip"]').tooltip();

        const subject = $('#toppane-subject');
        const chat_outer = $('#chat-outer');
        chat_outer.on('scroll', () => {
            const pos_threshold = 40;
            const pos = chat_outer.scrollTop();
            if (prev_pos < pos_threshold && pos >= pos_threshold) {
                subject.removeClass('hidden');
            } else if (prev_pos > pos_threshold && pos <= pos_threshold) {
                subject.addClass('hidden');
            }
            prev_pos = pos;
        });
    });

    let prev_pos = 0;

    app.ports.getUserImages.subscribe(() => {
        getUserImages();
    });

    function getUserImages() {
        axios.get('/api/files', { params: { token } }).then(({ data }) => {
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
        axios.delete('/api/files/' + file_id, { data: { token, user_id } }).then(({ data }: AxiosResponse<DeleteFileResponse>) => {
            console.log(data);
        });
    });

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


})();

const socket: SocketIOClient.Socket = io('');

var show_toppane = JSON.parse(localStorage['yacht.show_toppane'] || "false") || false;
var expand_chatinput = JSON.parse(localStorage['yacht.expand_chatinput'] || "false") || false;
var show_users_with_email_only = JSON.parse(localStorage['yacht.show_users_with_email_only'] || "false") || false;

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
    onChangeData: ElmSend<{ resource: string, id: string }>;
    scrollToBottom: ElmSub<void>;
    scrollTo: ElmSub<string>;
    createNewSession: ElmSub<any[]>;
    enterSession: ElmSub<string>;
    feedRoomInfo: ElmSend<RoomInfoClient[]>;
    feedMessages: ElmSend<ChatEntryClient[]>;
    getUsers: ElmSub<void>;
    feedUsers: ElmSend<User[]>;
    getUserMessages: ElmSub<string>;
    feedUserMessages: ElmSend<ChatEntryClient[]>;
    getSessionsWithSameMembers: ElmSub<{ members: Array<string>, is_all: boolean }>;
    feedSessionsWithSameMembers: ElmSend<string[]>;
    getSessionsOf: ElmSub<string>;
    feedSessionsOf: ElmSend<string[]>;
    sendCommentToServer: ElmSub<{ comment: string, user: string, session: string }>;
    sendCommentToServerDone: ElmSend<void>;
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
    getUserImages: ElmSub<void>;
    deleteFile: ElmSub<string>;
    deleteSession: ElmSub<{ id: string }>;
    saveConfig: ElmSub<{ userWithEmailOnly: boolean }>;
}

interface ElmApp {
    ports: ElmAppPorts;
}

function postFileToSession(session_id: string, formData: FormData) {
    $.ajax({
        url: '/api/files?kind=file&session_id=' + session_id + '&token=' + token,
        type: 'post',
        data: formData,
        processData: false,
        contentType: false,
        dataType: 'html'
    }).then((r) => {
        const res = JSON.parse(r);
        console.log(res);

    }, (err) => {
        console.log('error', err);
    });
}

