/// <reference path="../common/types.d.ts" />

// @ts-ignore
import { Elm } from './Main.elm';
import { map, includes, pull, clone } from 'lodash-es';
import axios from 'axios';
import $ from 'jquery';
import moment from 'moment';
import 'bootstrap';
import io from "socket.io-client";
import { Model, processData, formatTime, ChatEntry } from './client_model';
const shortid = require('shortid').generate;

const token = localStorage.getItem('yacht.token') || "";
const model = new Model(token);

if (!token || token == '') {
    location.href = '/login' + location.hash;
}

// @ts-ignore
const socket: SocketIOClient.Socket = io('');

require('moment/locale/ja');
moment.locale('ja');

var show_toppane = JSON.parse(localStorage['yacht.show_toppane'] || "false") || false;
var expand_chatinput = JSON.parse(localStorage['yacht.expand_chatinput'] || "false") || false;

const app = Elm.Main.init({ flags: { user_id: localStorage['yacht.user_id'] || "", show_top_pane: show_toppane, expand_chatinput } });

window.setTimeout(() => {
    recalcPositions(show_toppane, expand_chatinput);
}, 100);


socket.emit('subscribe', { token });


axios.get('/api/verify_token', { params: { token } }).then(({ data }) => {
    if (!data.valid) {
        console.log('verify token failed', data);
        location.href = '/login' + location.hash;
    }
});

socket.on("message", (msg: any) => model.changeHandler(msg, app.ports.onSocket.send));

socket.on("sessions.new", (msg: SessionsNewSocket) => {
    model.sessions.on_new(msg).then(() => {
        app.ports.onChangeData.send({ resource: "sessions", id: "" });
    });
});

socket.on("sessions.update", (msg: SessionsUpdateSocket) => {
    model.sessions.on_update(msg).then(() => {
        app.ports.onChangeData.send({ resource: "sessions", id: "" });
    });
});

socket.on("comments.new", (msg: CommentsNewSocket) => {
    model.comments.on_new(msg).then((session_id) => {
        if (session_id != null) {
            app.ports.onChangeData.send({ resource: "comments", id: session_id });
        }
    });
});


function scrollTo(id: string) {
    console.log('scrollTo', id);
    window.setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
            console.log('scrollTo', id);
            el.scrollIntoView(true);
        }
    }, 50);
}

function scrollToBottom() {
    const el = document.getElementById('end-line');
    el.scrollIntoView(true);
}

app.ports.scrollToBottom.subscribe(scrollToBottom);

app.ports.scrollTo.subscribe(scrollTo);

app.ports.createNewSession.subscribe(async function (args: any[]) {
    var name: string = args[0];
    const members: string[] = args[1];
    if (name == "") {
        name = "会話: " + moment().format('MM/DD HH:mm')
    }
    const { newRoom, messages } = await model.sessions.new({ name, members });

    app.ports.feedRoomInfo.send(newRoom);
    app.ports.feedMessages.send(processData(messages));
});

app.ports.getUsers.subscribe(() => {
    model.users.get().then(app.ports.feedUsers.send);
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

app.ports.sendCommentToServer.subscribe(({ comment, user, session }: { comment: string, user: string, session: string }) => {
    const temporary_id = shortid();
    temporary_id_list.push(temporary_id);
    model.comments.new({ comment, user, session }).then(() => {
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

app.ports.sendRoomName.subscribe(({ id, new_name }: { id: string, new_name: string }) => {
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
        console.log(window.innerHeight);
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


app.ports.startPosterSession.subscribe(async (file_id) => {
    console.log('startPosterSession', file_id);
    const members: string[] = [localStorage['yacht.user_id']];
    const name = "ポスターセッション: " + moment().format('MM/DD HH:mm')
    const temporary_id = shortid();
    const post_data: PostSessionsParam = { name, members, temporary_id, token, file_id };
    const { data }: PostSessionsResponse = await $.post('/api/sessions', post_data);
    app.ports.receiveNewRoomInfo.send(data);
    const p1 = axios.get('/api/sessions', { params: { token } });
    const p2 = axios.get('/api/comments', { params: { session: data.id, token } });
    const [{ data: { data: data1 } }, { data: { data: data2 } }] = await Promise.all([p1, p2]);
    app.ports.feedRoomInfo.send(data1);
    app.ports.feedMessages.send(processData(data2));
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
// window.setTimeout(() => {
//     var test = document.getElementById("measure-width");
//     test.innerText = "hoge";
//     var height = (test.clientHeight + 1);
//     var width = (test.clientWidth + 1);

//     console.log(height, width);
// }, 1000);

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
    chat_outer.on('scroll', (ev) => {
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

function getUserImages() {
    axios.get('/api/files', { params: { token } }).then(({ data }) => {
        // console.log('getUserImages', data);
        map(data.files, (files, user_id) => {
            const dat = {
                user_id, images: map(files, (f) => {
                    return { file_id: f.id, url: f.path };
                })
            };
            console.log(dat);
            app.ports.feedUserImages.send(dat);
        });
    });
}

app.ports.getUserImages.subscribe(() => {
    getUserImages();
});

app.ports.deleteFile.subscribe((file_id: string) => {
    const user_id = localStorage['yacht.user_id'];
    console.log('deleteFile', user_id, file_id);
    axios.delete('/api/files/' + file_id, { data: { token, user_id } }).then(({ data }: AxiosResponse<DeleteFileResponse>) => {
        console.log(data);
    });
});

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

