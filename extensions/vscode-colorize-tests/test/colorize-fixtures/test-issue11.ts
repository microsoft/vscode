let keyCode = 0;
if(!(keyCode === 8 || (keyCode>=48 && keyCode<=57))) {}
for (let i=0; i<5; i++) {}
for (var i=0; i<5; i++) {}
for (let i=0; i<5; i++) {}
for (; i<5;) {}
for (let i=0; 1+( i<<5 ) < 5;i++) {}
var p = 1?2:(3<4?5:6);
class A<X, Y> { }
class A1<T extends { a: () => string }> { }
class B { }
class C { }
function foo<T>() { return 1;}
let x1: A<(param?: number) => void, B>;
let x2: A<C | B, C & B>;
const t = 1 < (5 > 10 ? 1 : 2);
var f6 = 1 < foo<string>();