export function localStorageLogger(s: string) {
    console.log(s);
    localStorage['yacht.log'] += Date.now().toString() + ' ' + s + '\n';
}