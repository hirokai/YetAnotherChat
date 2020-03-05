/// <reference path="../common/types.d.ts" />


const production = !!process.env.NODE_PRODUCTION;

import * as model from './model'
const express = require('express');
import morgan from 'morgan';
const app = express();
import bodyParser from "body-parser";
import * as _ from 'lodash';
const path = require('path');
import * as fs from 'fs';
import moment from 'moment';

import * as mail_algo from './model/mail_algo'
import * as utils from './model/utils'
import { router as api_routes } from './api'
import { router as api_public_routes } from './api_public'
import { router as api_webhook } from './webhook'
import { init_socket, io } from './socket'
import { jwt_verify } from './auth'
import * as bunyan from 'bunyan';
const log = bunyan.createLogger({ name: "index", src: true, level: 1 });
import * as credential from './private/credential'

log.info('Starting...');
const port = process.env.PORT || 3000;

import dotenv from 'dotenv'
dotenv.config();
// log.debug(process.env)

const http = require('http').createServer(app);
let https;
if (production) {
    log.info('Production (HTTPS)');
    // https://itnext.io/node-express-letsencrypt-generate-a-free-ssl-certificate-and-run-an-https-server-in-5-minutes-a730fbe528ca
    const privateKey = fs.readFileSync('/etc/letsencrypt/live/coi-sns.com/privkey.pem', 'utf8');
    const certificate = fs.readFileSync('/etc/letsencrypt/live/coi-sns.com/cert.pem', 'utf8');
    const ca = fs.readFileSync('/etc/letsencrypt/live/coi-sns.com/chain.pem', 'utf8');
    const credentials = {
        key: privateKey,
        cert: certificate,
        ca: ca
    };
    https = require('https').createServer(credentials, app);
    app.use((req, res, next) => {
        if (!req.secure) {
            return res.redirect('https://' + req.get('host') + req.url);
        }
        next();
    });
}

init_socket(production ? https : http);

const morgan_date = morgan.token('date', (req, res) => {
    return moment().format();
});

const morgan_user_id = morgan.token('user_id', (req, res) => {
    return req.decoded ? req.decoded.user_id : 'null';
});

//Settings
const pretty = require('express-prettify');
app.use(pretty({ query: 'pretty', spaces: 8 }));

app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json());

app.use(function (req: Request, res: MyResponse, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, PATCH, OPTIONS');
    next();
});

app.use(morgan(':date[iso] :user_id :method :url :status - :res[content-length] :response-time ms'));

app.set("view engine", "ejs");
var compression = require('compression');
app.use(compression());

const helmet = require('helmet')
app.use(helmet());

function clientErrorHandler(err, req, res, next) {
    if (req.xhr) {
        res.status(500).send({ error: 'Something failed!' })
    } else {
        next(err)
    }
}

app.use(clientErrorHandler);

// Public resources
app.use('/about', express.static(path.join(__dirname, '../public/about')))
app.use('/public', express.static(path.join(__dirname, '../public')))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))
app.use('/register', express.static(path.join(__dirname, '../public/html/register.html')))
app.use('/login', express.static(path.join(__dirname, '../public/html/login.html')))
app.use('/reset_password', express.static(path.join(__dirname, '../public/html/reset_password.html')))
app.use('/main', express.static(path.join(__dirname, '../public/html/main.html')))
app.use('/matrix', express.static(path.join(__dirname, '../public/html/matrix.html')))
app.use('/m', express.static(path.join(__dirname, '../client/mobile/html')))
app.get('/', (req, res) => {
    res.redirect('/main#/');
});
app.get('/public_keys', (req, res, next) => {
    try {
        const net = credential.ethereum;
        log.info(net);
        res.render(path.join(__dirname, 'view', './public_keys.ejs'), {
            contract: net.contract,
            owner: net.account,
            name: net.name,
            abi: net.abi,
            url: net.url
        });
    } catch (e) {
        next(e);
    }
});

const rateLimit = require('express-rate-limit');
const resetPasswordLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 min window
    max: 100,
    message:
        "Too many password reset from this IP, please try again after 10 minutes"
});

app.get('/reset_password/:reset_password_token', resetPasswordLimiter, (req, res, next) => {
    (async () => {
        const token = req.params.reset_password_token;
        const user: User | null = await model.users.get_user_for_reset_password_token(token);
        if (user) {
            res.render(path.join(__dirname, 'view', './reset_password_from_link.ejs'), {
                token,
                user
            });
        } else {
            res.send('リンクが無効あるいは期限切れです。');
        }
    })().catch(next);
});

app.get('/email/:id', (req, res, next) => {
    (async () => {
        const { lines, subject, range } = await model.get_original_email_highlighted(req.params.id);
        res.render(path.join(__dirname, 'view', './email.ejs'), { lines, subject, range });
    })().catch(next);
});

app.get('/.well-known/acme-challenge/QGHcMRRCmxHp5-pvGxCorKDreEX8CuWOPgIUelUPPww', (req, res) => {
    res.send('QGHcMRRCmxHp5-pvGxCorKDreEX8CuWOPgIUelUPPww.RmGjYrLQ6ArB1jFRESCFgvLvQImuoIXVUWklPV4Ivtc');
});

//
// Public APIs and Webhook endpoints
//

app.use('/api_public', api_public_routes);
app.use('/webhook', api_webhook)

//
// Check JWT for authorized APIs
//

// http://dotnsf.blog.jp/archives/1067083257.html
app.use(function (req, res, next) {
    (async () => {
        log.debug(req);
        if (req.path.indexOf('/api/') != 0) {
            next();
            return;
        }
        var token = req.body.token || req.query.token || req.headers['x-access-token'];
        if (!production) {
            if ('debug' in req.query) {
                token = token || process.env.TEST_TOKEN;
                req.query['pretty'] = "";
                log.info(req.query);
            }
        }
        if (!token) {
            res.status(403).send({ ok: false, message: 'No token provided.' });
            return
        }
        const decoded = await jwt_verify(token, credential.jwt_secret);
        if (!decoded) {
            res.status(403).json({ ok: false, error: 'Invalid token.' });
        } else {
            //. 正当な値が定されていた場合は処理を続ける
            req.decoded = decoded;
            if (!production) {
                req.query['pretty'] = 'true';
            }
            next();
        }
    })().catch(next);
});

//
// Authorized APIs
//

// http://catlau.co/how-to-modularize-routes-with-the-express-router/
app.use('/api', api_routes);

//Periodically remove old IDs.
setInterval(async () => {
    await model.keys.remove_old_temporary_private_key();
}, 10 * 1000);

log.info('Connecting to DB...')
utils.connectToDB().then(() => {
    log.info('Connected to DB.');
    model.delete_all_connections().then(() => {
        http.listen(port, () => {
            log.info("HTTP server is running at port " + port);
        })
        if (production) {
            https.listen(443, () => {
                log.info("HTTPS server is running at port " + 443);
            })
        }
    });
}).catch((e) => {
    log.error('Connection to DB failed. Quitting.', e);
    (production ? https : http).close();
    process.exit(1);
});


if (!production) {
    app.post('/debug/emit_socket', (req, res) => {
        io.emit("message", req.body);
        res.json({ ok: true });
    });
    app.get('/debug/import/:user_id/:mail_id', (req, res, next) => {
        (async () => {
            const mail_id: string = req.params.mail_id;
            const user_id: string = req.params.user_id;
            try {
                const body = JSON.parse(fs.readFileSync('./imported_data/mailgun/' + user_id + '/' + mail_id + '.json', 'utf8'));
                log.info('Import email from: ', body['From']);
                const { added_users, comments } = await mail_algo.update_db_on_mailgun_webhook({ body: body, pool: utils.pool, myio: io, ignore_recipient: true });
                log.info('Parsing done.', added_users);
                res.json({ ok: true, comments, added_users });
            } catch (e) {
                next(e);
            }
        })().catch(next);
    })
}