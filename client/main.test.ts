import puppeteer from 'puppeteer';

jest.setTimeout(20000);

async function login(page: puppeteer.Page) {
    await page.goto('http://localhost:3000/login');
    await page.type('#username', 'Kai2');
    await page.type('#password', 'hoge');
    await page.click('#submit');
}

describe('Login', () => {
    let page: puppeteer.Page;
    let browser: puppeteer.Browser;

    beforeAll(async done => {
        browser = await puppeteer.launch({
            headless: false,  // 動作確認するためheadlessモードにしない
            slowMo: 100  // 動作確認しやすいようにpuppeteerの操作を遅延させる
        });
        page = await browser.newPage();
        await page.goto('http://localhost:3000/login');
        done();
    });
    test('Login to see main page', async done => {
        await login(page);
        await page.waitFor(1000);
        expect(page.title()).resolves.toEqual('COI SNS');
        const el = await page.$('h1');
        if (el == null) {
            throw new Error('Element not found');
        } else {
            const t = await (await el.getProperty('textContent')).jsonValue();
            expect(t).toEqual('ワークスペース')
            done();
        }
    });
    afterAll(async done => {
        await page.close();
        await browser.close();
        done();
    });
});

describe('Register page', () => {
    let page: puppeteer.Page;
    let browser: puppeteer.Browser;
    beforeAll(async done => {
        browser = await puppeteer.launch({
            headless: false,  // 動作確認するためheadlessモードにしない
            slowMo: 100  // 動作確認しやすいようにpuppeteerの操作を遅延させる
        });
        page = await browser.newPage();
        await page.goto('http://localhost:3000/login');
        done();
    });
    test('Invalid username should be rejected', async done => {
        await expect(page.title()).resolves.toMatch('ログイン');
        await page.click("a[href='/register']");
        await page.waitFor(1000);
        let el = await page.$('h1');
        if (el == null) {
            throw new Error('Element not found');
        } else {
            const t = await (await el.getProperty('textContent')).jsonValue()
            expect(t).toEqual('新規登録');
            await page.type('#username', '__Sato');
            await page.type('#password', '1234');
            await page.click('#agree');
            await page.click('#submit');
            el = await page.$('#info-username');
            if (el == null) {
                throw new Error('Element not found');
            } else {
                const t2 = await (await el.getProperty('textContent')).jsonValue();
                expect(t2).toEqual('無効なユーザー名です（"__"から始まることはできません）');
                await page.waitFor(1000);
                done();
            }
        }
    });
    afterAll(async done => {
        await page.close();
        await browser.close();
        done();
    });
});
