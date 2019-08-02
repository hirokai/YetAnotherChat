/// <reference path="../types.d.ts" />

{
    const jwt = require('jsonwebtoken');
    const credential = require('../private/credential');
    const axios = require('axios');
    const _ = require('lodash');
    const $ = require('jquery');

    const session_id = '4T9Y1a7ThzA';

    function get_token(username: string): string {
        const token = jwt.sign({ username }, credential.jwt_secret, { expiresIn: 604800 });
        return token;
    }
    function get_users() {
        const usernames = ['Abe', 'Tanaka', 'Kai'];
        return _.map(usernames, (u: string) => { return [u, get_token(u)]; });
    }


    const users = get_users();
    _.map(users, ([user, token]) => {
        function doSomething(user, token) {
            const params: GetSessionsOfParams = { of_members: null, token };
            const comment = '' + Math.random();
            axios.post('http://localhost:3000/api/comments', { comment, user, session: session_id, token }).then((res: PostCommentResponse) => {
                console.log(res.data)
            });
        }
        // https://stackoverflow.com/questions/6962658/randomize-setinterval-how-to-rewrite-same-random-after-random-interval
        (function loop() {
            var rand = Math.round(Math.random() * (8000 - 500)) + 500;
            setTimeout(function () {
                doSomething(user, token);
                loop();
            }, rand);
        }());

    });

    // axios.get('http://localhost:3000/api/sessions', { params }).then(({ data }: AxiosResponse<GetSessionsResponse>) => {
    //     console.log(data);
    // }).catch((err) => {
    //     console.log(err);
    // });
}