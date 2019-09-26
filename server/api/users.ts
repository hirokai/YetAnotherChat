/// <reference path="../../common/types.d.ts" />
import * as model from '../model'
import { Router } from 'express'
export const router: any = Router();
import * as _ from 'lodash';
import { io } from '../socket'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "api.users", src: true, level: 1 });

router.get('/', (req: GetAuthRequest, res, next) => {
    (async () => {
        const users = await model.users.list(req.decoded.user_id);
        const obj: GetUsersResponse = { ok: true, data: { users } }
        res.json(obj);
    })().catch(next);
});

router.get('/:id', (req, res: JsonResponse<GetUserResponse>, next) => {
    (async () => {
        const user = await model.users.get(req.params.id);
        if (user) {
            res.json({ ok: true, data: user });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});

router.patch('/:id', (req: MyPostRequest<UpdateUserData>, res: JsonResponse<UpdateUserResponse>, next) => {
    (async () => {
        if (req.decoded && req.params && req.decoded.user_id && req.decoded.user_id == req.params.id) {
            const user_id = req.decoded.user_id;
            const username = req.body.username;
            const fullname = req.body.fullname;
            const email = req.body.email;
            const timestamp = new Date().getTime();
            const user = await model.users.update(user_id, { username, fullname, email });
            const obj: UsersUpdateSocket = {
                __type: 'users.update',
                action: 'user',
                timestamp,
                user_id,
                user
            };
            io.emit('users.update', obj);
            res.json({ ok: true, data: user });
        } else {
            res.json({ ok: false, error: 'Only myself can be changed.' })
        }
    })().catch(next);

});

router.get('/all/profiles', (req, res: JsonResponse<GetProfilesResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        log.info('get_profiles');
        const data = await model.users.get_profiles();
        const obj: GetProfilesResponse = {
            ok: data != null,
            user_id,
            data
        };
        res.json(obj);
    })().catch(next);
});

router.get('/:id/profiles', (req, res: JsonResponse<GetProfileResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const data = await model.users.get_profile(user_id);
        const obj: GetProfileResponse = {
            ok: data != null,
            user_id,
            data
        };
        res.json(obj);
    })().catch(next);
});

router.patch('/:id/profiles', (req: MyPostRequest<UpdateProfileData>, res: JsonResponse<UpdateProfileResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id;
        const profile_ = req.body.profile;
        const ps = _.map(profile_, (v, k) => {
            return model.users.set_profile(user_id, k, v);
        });
        await Promise.all(ps);
        const profile = await model.users.get_profile(user_id);
        const timestamp = new Date().getTime();
        const obj: UsersUpdateSocket = {
            __type: 'users.update',
            action: 'profile',
            user_id,
            timestamp,
            profile   // Not only changed values but also all values are included.
        };
        io.emit('users.update', obj);
        res.json({ ok: true, user_id, data: profile });
    })().catch(next);
});

router.get('/:id/comments', (req, res: JsonResponse<GetCommentsResponse>, next) => {
    (async () => {
        const user_id = req.decoded.user_id
        const comments = await model.sessions.list_comments(user_id, undefined, user_id);
        if (comments) {
            res.json({ ok: true, data: comments });
        } else {
            res.json({ ok: false });
        }
    })().catch(next);
});
