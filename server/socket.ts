import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "socket", src: true, level: 1 });
import { jwt_verify } from './auth'
const credential = require('./private/credential');
import * as model from './model'
import * as _ from 'lodash';

export let io;

export function init_socket(https) {
    io = require('socket.io')(https);
    io.on('connection', (socket: SocketIO.Socket) => {
        log.info('A user connected', socket.id);
        socket.on('subscribe', async ({ token }) => {
            const decoded = await jwt_verify(token, credential.jwt_secret);
            if (decoded) {
                const user_id = decoded.user_id;
                const previous = await model.users.list_online_users();
                const r = await model.users.save_socket_id(user_id, socket.id);
                log.info('saveSocketId', r, 'socket id', user_id, socket.id)
                log.info('Online users:', previous, user_id)
                if (!_.includes(previous, user_id) && r.ok && r.timestamp) {
                    const obj: UsersUpdateSocket = { __type: "users.update", action: 'online', user_id, online: true, timestamp: r.timestamp }
                    io.emit('users.update', obj);
                }
            }
        });
        socket.on('disconnect', async () => {
            log.info('disconnected', socket.id);
            const r = await model.delete_connection(socket.id);
            if (r) {
                const { user_id, online, timestamp } = r;
                const obj: UsersUpdateSocket = {
                    __type: 'users.update',
                    action: 'online',
                    user_id, online, timestamp
                }
                io.emit('users.update', obj);
            }
        })
    });
}

