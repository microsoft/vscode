const n = null;
const u = undefined;
const a = true || false;
type T = null | unknown | undefined | true | false;

function bar(a?: string): string { return '' }
interface A {
    b?: 2;
    a: 1;
}
const obj = {
    a: 1,
};

const obj1 = {};
const obj2 = {
    ...obj1,
}
function foo(param: string, ...rest) {}

undefined
null
NaN
Infinity

type One = 'zcxvf';

type Two = 'one' | 'two' & 'three';

const obj = {
    one: 1
};

type Rec = Record<string, string>;

new URL('./../../renderer/dist/index.html', import.meta.url);
