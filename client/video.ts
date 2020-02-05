let existingCall;
import $ from 'jquery';
import Peer, { SfuRoom } from 'skyway-js';
import { skyway_key } from '../server/private/credential'

let localStream: MediaStream;
let sfuRoom;
let peer;

export function terminate(user_id: string, roomName: string) {
    sfuRoom.close();
    localStream.getTracks().forEach((track) => {
        track.stop();
    });
    peer.destroy();
}

export function start(user_id: string, roomName: string, onPeerJoin: (string) => void, onPeerLeave: (string) => void) {
    var array = new Uint32Array(2);
    window.crypto.getRandomValues(array);
    peer = new Peer(user_id + '_' + array[0], { key: skyway_key });


    const constraints = {
        audio: { deviceId: undefined },
        video: { deviceId: undefined, width: { ideal: 300 }, height: { ideal: 200 } },
    };

    peer.on('open', (peerId) => {
        console.log(constraints);
        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            //@ts-ignore
            $('#my-video').get(0).srcObject = stream;
            localStream = stream;
            //@ts-ignore
            $('#my-video').get(0).muted = true;

            if (existingCall) {
                existingCall.replaceStream(stream);
                return;
            }

            sfuRoom = peer.joinRoom(roomName, {
                mode: 'sfu',
                stream: localStream,
            });
            sfuRoom.send({ user_id, })
            window['sfuRoom'] = sfuRoom;
            sfuRoom.on('open', () => { console.log('Opened', sfuRoom) });
            sfuRoom.on('stream', stream => {
                const user_id = stream.peerId.split("_")[0];
                const elemId = '#remote-video.' + user_id;
                const count = Object.keys(sfuRoom.remoteStreams).length;
                const new_constraints = {
                    audio: { deviceId: undefined },
                    video: { deviceId: undefined, width: { ideal: 300 / Math.sqrt(count + 1) }, height: { ideal: 200 / Math.sqrt(count + 1) } },
                };
                console.log(new_constraints);
                navigator.mediaDevices.getUserMedia(new_constraints).then(new_stream => {
                    sfuRoom.replaceStream(new_stream);
                });

                console.log('sfuRoom.on', elemId, stream);
                //@ts-ignore
                // console.log('Joined to video', peerId, sfuRoom.remoteStreams);
                //@ts-ignore
                document.getElementById('remote-video.' + user_id).srcObject = stream;
            });

            sfuRoom.on('peerJoin', (peerId: string) => {
                const user_id = peerId.split("_")[0];
                onPeerJoin(user_id)
            });

            sfuRoom.on('peerLeave', (peerId: string) => {
                const user_id = peerId.split("_")[0];
                //@ts-ignore
                document.getElementById('remote-video.' + user_id).srcObject = null;
                onPeerLeave(user_id);
            });

        }).catch(err => {
            $('#step1-error').show();
            console.error(err);
        });

    });
}