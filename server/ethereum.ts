const Web3 = require('web3');
import fs from 'fs';
import * as credential from './private/credential'
const abi = JSON.parse(fs.readFileSync('./server/HashStorage3.json', 'utf8')).abi;
import * as crypto from 'crypto';

type Ethereum = {
    account: string,
    url: string,
    contract: string,
    privateKey: string
}

//https://stackoverflow.com/questions/46611117/how-to-authenticate-and-send-contract-method-using-web3-js-1-0
export async function add_to_ethereum(net: Ethereum, user_id: string, timestamp: number, hash: string): Promise<any> {
    return new Promise((resolve) => {
        var web3 = new Web3(new Web3.providers.HttpProvider(
            net.url
        ));
        const account = web3.eth.accounts.privateKeyToAccount('0x' + net.privateKey);
        web3.eth.accounts.wallet.add(account);
        const myContract = new web3.eth.Contract(abi, net.contract);
        const user_id_hash = crypto.createHash('sha256').update(user_id, 'utf8').digest().toString('base64');
        myContract.methods.add(user_id_hash, timestamp, hash).send({ from: net.account, gas: 100000, gasPrice: 1e9 }).then((e, r) => {
            // console.log('set() result', e, r);
            resolve(r);
        })
    });
}

