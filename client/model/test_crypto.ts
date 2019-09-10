import { importKey, decrypt_str, encrypt_str, generateKeyPair, exportKey, exportKeyPKCS8, importKeyPKCS8, encodeBase64URL, decodeBase64URL, exportKeySPKI, fingerPrint } from './cryptography';

type ExportedFormat = JsonWebKey

//Encrypt at A side with A's secret and B's public key.
async function test_encrypt(lk_a: CryptoKey, pk_b: ExportedFormat, input: string): Promise<string | null> {
    try {
        const imported_b = await importKey(pk_b, true);
        return encrypt_str(imported_b, lk_a, input);
    } catch (e) {
        console.log(e);
        return null;
    }
}

//Decrypt at B side with B's secret and A's public key.
async function test_decrypt(lk_b: CryptoKey, pk_a: ExportedFormat, input: string): Promise<string> {
    const imported_a = await importKey(pk_a, true);
    return decrypt_str(imported_a, lk_b, input);
}

//Encrypt at A side with A's secret and B's public key.
async function test_encrypt2(lk_a: CryptoKey, lk_b: CryptoKey, input: string): Promise<string | null> {
    try {
        return encrypt_str(lk_b, lk_a, input);
    } catch (e) {
        console.log(e);
        return null;
    }
}

//Decrypt at B side with B's secret and A's public key.
async function test_decrypt2(lk_b: CryptoKey, lk_a: CryptoKey, input: string): Promise<string> {
    return decrypt_str(lk_a, lk_b, input);
}

// This works
export function test_crypto() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "暗号化する文字列１";

        const lk_a = await generateKeyPair(true);
        const exported = await exportKey(lk_a.privateKey);
        console.log('test_crypto(): Exported', exported, JSON.stringify(exported));
        const imported_a = await importKey(exported, false);
        console.log('test_crypto(): Imported', imported_a)

        const lk_b = await generateKeyPair(true);

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt2(imported_a, lk_b.publicKey, input_string);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt2(lk_b.privateKey, lk_a.publicKey, encrypted);

        console.log('test_crypto', input_string, decrypted);
    })();
}

// This works
export function test_crypto1() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "２番めの暗号化試験";

        const lk_a = await generateKeyPair(true);
        const exported_a = await exportKey(lk_a.publicKey);

        const lk_b = await generateKeyPair(true);
        const exported_b = await exportKey(lk_b.publicKey);

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt(lk_a.privateKey, exported_b, input_string);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt(lk_b.privateKey, exported_a, encrypted);

        console.log('test_crypto', input_string, decrypted);
    })();
}

// This works now
export function test_crypto2() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "暗号化する文字列3";

        const lk_a = await generateKeyPair(true);
        const exported = await exportKeyPKCS8(lk_a.privateKey);
        console.log('test_crypto2(): Exported', exported, JSON.stringify(exported));
        const imported_a = await importKeyPKCS8(exported, false);
        console.log('test_crypto2(): Imported', imported_a)

        const lk_b = await generateKeyPair(true);

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt2(imported_a, lk_b.publicKey, input_string);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt2(lk_b.privateKey, lk_a.publicKey, encrypted);

        console.log('test_crypto', input_string, decrypted);
    })();
}

// This does NOT work. imported_a cannot be got.
export function test_crypto3() {
    (async () => {
        console.log('test_crypto start');
        const input_string = "4番めの暗号化試験";

        const lk_a = await generateKeyPair(true);
        const exported_a = await exportKeyPKCS8(lk_a.publicKey);
        const imported_a = await importKeyPKCS8(exported_a, true);

        const lk_b = await generateKeyPair(true);
        // const exported_b = await exportKeyPKCS8(lk_b.publicKey);
        // const imported_b = await importKeyPKCS8(exported_b, true);

        //Encrypt at A side with A's secret and B's public key.
        const encrypted = await test_encrypt2(lk_a.privateKey, lk_b.publicKey, input_string);
        console.log('test_crypto', encrypted);
        //Decrypt at B side with B's secret and A's public key.
        const decrypted = await test_decrypt2(lk_b.privateKey, lk_a.publicKey, encrypted);

        console.log('test_crypto', input_string, decrypted);
    })();
}

async function text_export(keyPair: CryptoKeyPair) {
    const prv_exported = await exportKey(keyPair.privateKey);
    const pub_exported = await exportKeySPKI(keyPair.publicKey);
    const pub_exported_b64 = encodeBase64URL(new Uint8Array(pub_exported));
    if (pub_exported_b64 != null) {
        const pub_exported_b64_2 = pub_exported_b64.match(/.{1,32}/g).join('\n');
        const pub_exported2 = decodeBase64URL(pub_exported_b64);
        const fp = await fingerPrint(prv_exported);
        console.log('Private key exported', prv_exported);
        console.log('Public key exported', pub_exported, pub_exported2, pub_exported_b64_2);
    }
}