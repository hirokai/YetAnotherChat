/// <reference path="../../common/types.d.ts" />
import * as model from '../model'
import { Router } from 'express'
export const router: any = Router();
import { io } from '../socket'
import * as _ from 'lodash';

import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "api.keys", src: true, level: 1 });


router.get('/private_key', (req, res, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const { ok, privateKey } = await model.keys.get_private_key(user_id);
        res.json({ ok, privateKey });
    })().catch(next);
});

router.post('/private_key', (req, res: JsonResponse<PostPrivateKeyResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const private_key: JsonWebKey = req.body.private_key;
        const ok = await model.keys.temporarily_store_private_key(user_id, private_key);
        res.json({ ok });
    })().catch(next);
});


router.get('/public_keys/me', (req: GetAuthRequest, res: JsonResponse<GetPublicKeysResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const pub1 = await model.keys.get_public_key(user_id);
        if (pub1) {
            const { publicKey: pub, prv_fingerprint } = pub1;
            res.json({ ok: pub != null, publicKey: pub, privateKeyFingerprint: prv_fingerprint });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.post('/public_keys', (req: MyPostRequest<PostPublicKeyParams>, res, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const jwk = req.body.publicKey;
        const for_user = req.body.for_user;
        const privateKeyFingerprint = req.body.privateKeyFingerprint;
        const { ok, timestamp } = await model.keys.register_public_key({ user_id, for_user, jwk, privateKeyFingerprint });
        res.json({ ok, timestamp });
        if (ok && timestamp) {
            const obj: UsersUpdateSocket = { __type: "users.update", action: 'public_key', user_id, timestamp, public_key: jwk };
            io.emit('users.update', obj);
        }
    })().catch(next);
});