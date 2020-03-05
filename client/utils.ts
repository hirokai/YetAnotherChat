<<<<<<< HEAD
export function localStorageLogger(...args: any[]) {
    console.log(...args);
    if (!localStorage['yacht.log']) {
        localStorage['yacht.log'] = '';
    }
    localStorage['yacht.log'] += Date.now() + ' ' + (args ? args.map((a) => JSON.stringify(a)).join(' ') : args) + '\n';
=======
export function localStorageLogger(s: string) {
    console.log(s);
    localStorage['yacht.log'] += Date.now().toString() + ' ' + s + '\n';
>>>>>>> a169ac915683497d8bfe75b002d15ddc6d7a5d00
}