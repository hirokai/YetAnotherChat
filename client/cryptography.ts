import { isEqual } from "lodash";


// https://qiita.com/tomoyukilabs/items/eac94fdb2d0ca92f443a
export async function generateKeyPair(exportable = false): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, exportable, ['deriveKey', 'deriveBits']);
}

type ExportedFormat = JsonWebKey;

export async function exportKey(key: CryptoKey): Promise<ExportedFormat> {
    if (key == null) {
        return null
    } else {
        return crypto.subtle.exportKey('jwk', key);
    }
}

export async function importKey(data: ExportedFormat, is_publicKey: boolean, exportable = false): Promise<CryptoKey> {
    return new Promise((resolve) => {
        crypto.subtle.importKey(
            'jwk',
            data,
            { name: 'ECDH', namedCurve: 'P-256' },
            exportable,
            // https://gist.github.com/pedrouid/b4056fd1f754918ddae86b32cf7d803e#ecdh---importkey
            // Usages must be empty for public keys
            (is_publicKey ? [] : ['deriveKey', 'deriveBits'])
        ).then(key => {
            // console.info('importKey() success', data, key);
            resolve(key);
        }, (err) => {
            // console.error('importKey() error', err, data);
            resolve(null);
        });
    });
}

//For private key
export async function exportKeyPKCS8(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey('pkcs8', key);
}

//For public key
export async function exportKeySPKI(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey('spki', key);
}

export async function importKeyPKCS8(data: ArrayBuffer, is_publicKey: boolean, exportable = false): Promise<CryptoKey> {
    return new Promise((resolve) => {
        crypto.subtle.importKey(
            'pkcs8',
            data,
            { name: 'ECDH', namedCurve: 'P-256' },
            exportable,
            (is_publicKey ? [] : ['deriveKey', 'deriveBits'])
        ).then(key => {
            // console.log('Imported', jwk, key);
            resolve(key);
        }, (err) => {
            console.error('importKey() error', err);
            resolve(null);
        });
    });
}

function getEncryptionKey(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey): Promise<CryptoKey> {
    // console.log('getEncryptionKey', { remotePublicKey, localPrivateKey })
    if (remotePublicKey == null || localPrivateKey == null) {
        return null;
    }
    return new Promise((resolve) => {
        crypto.subtle.deriveBits(  // 鍵共有による共有鍵生成
            { name: 'ECDH', public: remotePublicKey },
            localPrivateKey,
            128
        ).then(bits => {           // 共有鍵のSHA-256ハッシュ値を生成
            return crypto.subtle.digest(
                { name: 'SHA-256' },
                bits
            );
        }).then(digest => {        // ハッシュ値の先頭16オクテットから128ビットAES-GCMの鍵を生成
            return crypto.subtle.importKey(
                'raw',
                digest.slice(0, 16),
                { name: 'AES-GCM', length: 128 },
                true,
                ['encrypt', 'decrypt']
            );
        }).then(key => {
            resolve(key);
        });
    });
}

export async function encrypt(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, input: Uint8Array): Promise<EncryptedData> {
    const fp1 = await fingerPrint1(remotePublicKey);
    const fp2 = await fingerPrint1(localPrivateKey);
    console.log('encrypt() start', fromUint8Array(input), { remote_pub: fp1, self_prv: fp2, remotePublicKey });

    return new Promise((resolve, reject) => {
        if (!remotePublicKey || !localPrivateKey) {
            console.error('encrypt(): Keys must be non-null.')
            reject();
        }
        let iv = crypto.getRandomValues(new Uint8Array(12));
        getEncryptionKey(remotePublicKey, localPrivateKey).then((encryptionKey) => {
            return crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, tagLength: 128 },
                encryptionKey,
                input
            );
        }).then(data => {
            // このresult(iv, data)を相手に渡す
            const result = {
                iv: encodeBase64URL(new Uint8Array(iv)),
                data: encodeBase64URL(new Uint8Array(data))
            };
            resolve(result);
        });
    });
}

export async function encrypt_str(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, input: string): Promise<string> {
    const encrypted = await encrypt(remotePublicKey, localPrivateKey, toUint8Array(input));
    return encrypted.iv + ':' + encrypted.data;
}

export async function decrypt_str(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, encrypted: string, info?: any): Promise<string> {
    const cs = encrypted.split(':');
    const data = { iv: cs[0], data: cs[1] };
    const decrypted = await decrypt(remotePublicKey, localPrivateKey, data, info);
    return fromUint8Array(decrypted);
}

export async function decrypt(remotePublicKey: CryptoKey, localPrivateKey: CryptoKey, encrypted: EncryptedData, info?: any): Promise<Uint8Array> {
    const fp1 = await fingerPrint1(remotePublicKey);
    const fp2 = await fingerPrint1(localPrivateKey);
    console.log('decrypt() start', encrypted.iv, { remote_pub: fp1, self_prv: fp2 });

    return new Promise((resolve, reject) => {
        getEncryptionKey(remotePublicKey, localPrivateKey).then((encryptionKey) => {
            // console.log('getEncryptionKey', { remotePublicKey, localPrivateKey, encryptionKey })
            // console.log('decrypt start', encryptionKey, remotePublicKey, localPrivateKey, encrypted);
            // AES-GCMによる復号
            return crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: decodeBase64URL(encrypted.iv), tagLength: 128 },
                encryptionKey,
                decodeBase64URL(encrypted.data)
            );
        }).then(data => {
            resolve(new Uint8Array(data));
        }, (err) => {
            console.log('decrypt() error', fp1, fp2, encrypted);
            reject();
        });
    });
}

export async function verify_key_pair({ publicKey, privateKey }: CryptoKeyPair): Promise<boolean> {
    if (!privateKey || !publicKey) {
        console.log('Null key contained')
        return false;
    }
    try {
        return true;
    } catch (e) {
        return false;
    }
}


// JavaScriptのatob(), btoa()ではURL-safe Base64が扱えないため変換が必要
export function decodeBase64URL(data: string): Uint8Array {
    let decoded = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    let buffer = new Uint8Array(decoded.length);
    for (let i = 0; i < data.length; i++)
        buffer[i] = decoded.charCodeAt(i);
    return buffer;
}

export function encodeBase64URL(data: Uint8Array): string {
    let output = '';
    for (let i = 0; i < data.length; i++)
        output += String.fromCharCode(data[i]);
    return btoa(output.replace(/\+/g, '-').replace(/\//g, '_')).replace(/=+$/, '');
}

export async function fingerPrint1(key: CryptoKey): Promise<string> {
    const jwk = await exportKey(key).catch(() => null);
    return fingerPrint(jwk);
}

// https://stackoverflow.com/a/42590106
// Extended for private key
export async function fingerPrint(jwk: JsonWebKey): Promise<string> {
    if (jwk == null) {
        return null;
    } else {
        let s;
        if (jwk["d"]) {
            s = '{"crv":"' + jwk.crv + '","d":"' + jwk.d + '","kty":"' + jwk.kty + '","x":"' + jwk.x + '","y":"' + jwk.y + '"}';
        } else {
            s = '{"crv":"' + jwk.crv + '","kty":"' + jwk.kty + '","x":"' + jwk.x + '","y":"' + jwk.y + '"}';
        }
        // console.log('fingerPrint(): json', s);
        const arr = new TextEncoder().encode(s);
        const hash_arr = await crypto.subtle.digest('SHA-256', arr);
        return fromUint8Array(new Uint8Array(hash_arr));
    }
}

// https://stackoverflow.com/questions/34946642/convert-string-to-uint8array-in-javascript
export function toUint8Array(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}

export function fromUint8Array(arr: Uint8Array): string {
    return new TextDecoder().decode(arr);
}
