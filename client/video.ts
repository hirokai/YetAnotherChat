let existingCall;
import $ from 'jquery';
import Peer, { SfuRoom } from 'skyway-js';
import * as credentials from '../server/private/credential';
const peer = new Peer({ key: credentials.skyway_key });

let localStream: MediaStream;
let sfuRoom;

export function terminate(roomName: string) {
    localStream.getTracks().forEach((track) => {
        track.stop();
    });
    sfuRoom.close();
}

export function start(roomName: string) {

    const constraints = {
        audio: { deviceId: undefined },
        video: { deviceId: undefined, width: { max: 300 }, height: { max: 200 } },
    };

    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        //@ts-ignore
        $('#my-video').get(0).srcObject = stream;
        localStream = stream;

        if (existingCall) {
            existingCall.replaceStream(stream);
            return;
        }

        sfuRoom = peer.joinRoom(roomName, {
            mode: 'sfu',
            stream: localStream,
        });
        window['sfuRoom'] = sfuRoom;
        sfuRoom.on('open', () => { console.log('Opened', sfuRoom) });

        sfuRoom.on('stream', stream => {
            //@ts-ignore
            // console.log('Joined to video', peerId, sfuRoom.remoteStreams);
            //@ts-ignore
            $('#their-video').get(0).srcObject = stream;
        });

    }).catch(err => {
        $('#step1-error').show();
        console.error(err);
    });
}