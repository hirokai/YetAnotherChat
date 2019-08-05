/// <reference path="../types.d.ts" />

// @ts-ignore
import { Elm } from './Main.elm';
import { map, includes, pull, clone } from 'lodash-es';
import axios from 'axios';
import $ from 'jquery';
import moment from 'moment';
import 'bootstrap';
import io from "socket.io-client";
const shortid = require('shortid').generate;

// @ts-ignore
const socket: SocketIOClient.Socket = io('');



require('moment/locale/ja');
moment.locale('ja');

const init_show_pane = JSON.parse(localStorage['yacht.show_toppane'] || "false") || false;
const app = Elm.Main.init({ flags: { user_id: localStorage['yacht.user_id'] || "", show_top_pane: init_show_pane } });

const token = localStorage.getItem('yacht.token') || "";

socket.emit('subscribe', { token });

axios.get('/api/verify_token', { params: { token } }).then(({ data }) => {
    if (!data.valid) {
        console.log('verify token failed', data);
        location.href = '/login';
    }
});



socket.on("message", (msg: any) => {
    console.log('Socket.io message', msg);
    if (includes(temporary_id_list, msg.temporary_id)) {
        pull(temporary_id_list, msg.temporary_id);
        return;
    }
    if (msg.__type == "new_comment") {
        msg.timestamp = moment(msg.timestamp).format('YYYY/M/D HH:mm:ss');
        msg = <ChatEntryClient>msg;
    } else if (msg.__type == "new_session") {
        const msg1 = <RoomInfoClient>msg;
        msg1.timestamp = moment(msg.timestamp).format('YYYY/M/D HH:mm:ss');
        msg1.firstMsgTime = -1;
        msg1.lastMsgTime = -1;
        msg1.numMessages = { "__total": 0 };
        msg = msg1;
    } else if (msg.__type == "new_member") {
        const msg1 = <any>msg;
        msg1.timestamp = moment(msg.timestamp).format('YYYY/M/D HH:mm:ss');
        msg = msg1;
    }
    app.ports.onSocket.send(msg);
});

function scrollTo(id) {
    console.log('scrollTo', id);
    window.setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
            console.log('scrollTo', id);
            el.scrollIntoView(true);
        }
    }, 50);
}

app.ports.scrollTo.subscribe(scrollTo);

type ChatEntry = CommentTyp | SessionEvent;

const processData = (res: ChatEntry[]): ChatEntryClient[] => {
    return map(res, (m1) => {
        console.log('processData', m1);
        const user: string = m1.user_id;
        var v: ChatEntryClient = { id: m1.id, user, comment: "", timestamp: moment(m1.timestamp).format('YYYY/M/D HH:mm:ss'), originalUrl: "", sentTo: "", session: m1.session_id, source: "", kind: m1.kind, action: "" };
        switch (m1.kind) {
            case "comment": {
                const m = <CommentTyp>m1;
                v.comment = m.comment;
                v.originalUrl = m.original_url || "";
                v.sentTo = m.sent_to || "";
                v.source = m.source;
                return v;
            }
            case "event": {
                const m = <SessionEvent>m1;
                v.comment = "（参加しました）";
                v.action = m.action;
                return v;
            }
        }
    });
};

app.ports.createNewSession.subscribe(async function (args: any[]) {
    var name: string = args[0];
    const members: string[] = args[1];
    if (name == "") {
        name = "会話: " + moment().format('MM/DD HH:mm')
    }
    const temporary_id = shortid();
    const post_data: PostSessionsParam = { name, members, temporary_id, token };
    const { data }: PostSessionsResponse = await $.post('/api/sessions', post_data);
    app.ports.receiveNewRoomInfo.send(data);
    const p1 = axios.get('/api/sessions', { params: { token } });
    const p2 = axios.get('/api/comments', { params: { session: data.id, token } });
    const [{ data: { data: data1 } }, { data: { data: data2 } }] = await Promise.all([p1, p2]);
    app.ports.feedRoomInfo.send(data1);
    app.ports.feedMessages.send(processData(data2));
});

function getAndFeedMessages(session: string) {
    const params: GetCommentsParams = { session, token };
    axios.get('/api/comments', { params }).then(({ data }) => {
        const values = processData(data);
        console.log(values);
        app.ports.feedMessages.send(values);
        // scrollToBottom();
    });
}

app.ports.getUsers.subscribe(() => {
    axios.get('/api/users', { params: { token } }).then(({ data }: AxiosResponse<GetUsersResponse>) => {
        const users: User[] = data.data.users;
        console.log(users);
        app.ports.feedUsers.send(users);
    });
});

app.ports.getMessages.subscribe(getAndFeedMessages);

app.ports.getUserMessages.subscribe(async function (user: string) {
    const { data } = await axios.get('/api/comments', { params: { user, token } });
    app.ports.feedUserMessages.send(processData(data));
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

function getAndfeedRoolmInfo() {
    const params: AuthedParams = { token };
    axios.get('/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
        app.ports.feedRoomInfo.send(map(data.data, (r): RoomInfoClient => {
            var s: any = clone(r);
            s.timestamp = moment(r.timestamp).format('YYYY/M/D HH:mm:ss');
            return s;
        }));
        // scrollToBottom();
    });
}

app.ports.getRoomInfo.subscribe(function () {
    getAndfeedRoolmInfo();
});

var temporary_id_list = [];

app.ports.sendCommentToServer.subscribe(function ({ comment, user, session }: { comment: string, user: string, session: string }) {
    const temporary_id = shortid();
    temporary_id_list.push(temporary_id);
    $.post('/api/comments', { comment, user, session, temporary_id, token }).then((res: PostCommentResponse) => {
        getAndfeedRoolmInfo();
        scrollTo(res.data.id);
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
    recalcPositions(true);
});

var show_toppane = true;

function recalcPositions(show_toppane: boolean) {
    $(() => {
        $('#chat-outer').height(window.innerHeight - (show_toppane ? 260 : 100));
    });

    window.addEventListener('resize', () => {
        $('#chat-outer').height(window.innerHeight - (show_toppane ? 260 : 100));
        console.log(window.innerHeight);
    });
}

window.addEventListener('hashchange', () => {
    console.log('hashChange', location.hash, app.ports.hashChanged);
    app.ports.hashChanged.send(location.hash);
    recalcPositions(show_toppane);
    return null;
});

app.ports.hashChanged.send(location.hash);

app.ports.recalcElementPositions.subscribe((_show_toppane: boolean) => {
    console.log("recalcElementPositions");
    show_toppane = _show_toppane;
    localStorage['yacht.show_toppane'] = JSON.stringify(show_toppane);
    recalcPositions(_show_toppane);
});

app.ports.joinRoom.subscribe(({ session_id, user_id }) => {
    $.post('/api/join_session', { token, session_id }).then((res: JoinSessionResponse) => {
        console.log('join_session', res);
    });
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
