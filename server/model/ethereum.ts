import Web3 from 'web3';
import fs from 'fs';
const abi = JSON.parse(fs.readFileSync('./server/model/HashStorage3.json', 'utf8')).abi;
import * as crypto from 'crypto';
import { log } from './utils'

type Ethereum = {
    account: string,
    url: string,
    contract: string,
    privateKey: string
}

//https://stackoverflow.com/questions/46611117/how-to-authenticate-and-send-contract-method-using-web3-js-1-0
export async function add_to_ethereum(net: Ethereum, user_id: string, timestamp: number, hash: string): Promise<any> {
    var web3 = new Web3(new Web3.providers.HttpProvider(
        net.url
    ));
    const account = web3.eth.accounts.privateKeyToAccount('0x' + net.privateKey);
    web3.eth.accounts.wallet.add(account);
    const myContract = new web3.eth.Contract(abi, net.contract);
    const user_id_hash = crypto.createHash('sha256').update(user_id, 'utf8').digest().toString('base64');
    const gasLimit = 400000;
    const gasPrice = 1e9;
    log.debug('Adding fingerprint to ethereum with gas limit and gas price', gasLimit, gasPrice / 1e9, user_id, hash);
    const r = await myContract.methods.add(user_id_hash, timestamp, hash).send({ from: net.account, gas: gasLimit, gasPrice });
    // log.debug('set() result', e, r);
    return r;
}

