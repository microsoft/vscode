export function replaceEscapedOctetsWithChar(s: string) {
    return s.replace(/(?:^|[^\\])((?:\\[0-9]{3})+)/g, (substring: string, ...args: any[]) => {
        let capgroup: string = args[0].toString();
        let prevChar: string = '';
        if (substring.length > capgroup.length) {
            prevChar = substring[0];
        }
        let octal = capgroup.split('\\').filter(s => s.trim() !== "");
        try {
            let chars = octalToChars(octal);
            return prevChar + chars;
        } catch(err) {
            return substring;
        }
    });
}

export function octalToChars(octal: Array<string>) {
    let hex: string = octal.map(octet => convertFromBaseToBase(octet, 8, 16)).join('');
    let s = new Buffer(hex, 'hex').toString('utf8');
    for(let i=0; i<s.length; i++) {
        if(s.charCodeAt(i) === 65533) {
            // the character is an uncknown character, this is probably binary data
            return hex;
        }
    }
    return s;
}

export function convertFromBaseToBase(str: string | number, fromBase: number, toBase: number) {
    if (typeof(str) === 'number') {
        str = str.toString();
    }
    var num = parseInt(str, fromBase);
    return num.toString(toBase);
}
