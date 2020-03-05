// Fill the values and rename this file to credential.js

import { abi } from '../model/HashStorage3.json';

const ethereum_all = {
    // Private key MUST BE private.
    // MainNet
    mainnet: {
        url: 'https://mainnet.infura.io/v3/XXXXXXXX',
        account: '0xXXXXXXXX',
        contract: '0xXXXXXXXX',
        privateKey: 'XXXXXXXX',
        abi: abi,
        name: 'mainnet'
    },
    //Ropsten
    ropsten: {
        url: 'https://ropsten.infura.io/v3/XXXXXXXX',
        account: '0xXXXXXXXX',
        contract: '0xXXXXXXXX',
        privateKey: 'XXXXXXXX',
        abi: abi,
        name: 'ropsten'
    }
};

export const slack_token = 'xoxp-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX';
export const mailgun = 'XXXXXXXX';
export const jwt_secret = 'XXXXXXXX';
export const cipher_secret = 'XXXXXXXX';
export const ethereum = ethereum_all.ropsten;
export const skyway_key = 'XXXXXXXX';
