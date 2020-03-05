export function localStorageLogger(...args: any[]) {
    console.log(...args);
    if (!localStorage['yacht.log']) {
        localStorage['yacht.log'] = '';
    }
    localStorage['yacht.log'] += Date.now() + ' ' + (args ? args.map((a) => JSON.stringify(a)).join(' ') : args) + '\n';

}