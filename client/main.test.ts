import puppeteer from 'puppeteer';


describe('Login page', () => {
    let page;
    let browser;
    beforeAll(async done => {
        browser = await puppeteer.launch();
        page = await browser.newPage();
        await page.goto('http://localhost:3000/login');
        done();
    });
    test('Title', async done => {
        await expect(page.title()).resolves.toMatch('ログイン');
        done();
    });
    afterAll(async done => {
        await page.close();
        await browser.close();
        done();
    });
});
