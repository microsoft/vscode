/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import plugin from '../compat/stylistic.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const ruleTester = new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } });
const missingSemi = [{ messageId: 'missingSemi' }];

ruleTester.run('semi', plugin.rules.semi, {
	valid: [
		'let a = 1;',
		'for (let i = 0; i < 1; i++) { }',
		'for (const k of o) { }',
		'for (const k in o) { }',
		'if (a) { } else { }',
		'function f() { }',
		'class A { m() { } [key: string]: unknown }',
		'export default class { }',
		'export default function () { }',
		'export default interface I { }',
		'export const a = 1;',
		'interface I { a: string }',
		'namespace N { }',
		'enum E { A }',
		`declare module 'm'`,
		'declare global { }',
		'export as namespace N',
		'abstract class A { abstract m(): void; abstract p: number; accessor q = 1; declare d: string; }',
	],
	invalid: [
		{ code: 'let a = 1', output: 'let a = 1;', errors: [{ messageId: 'missingSemi', line: 1, column: 9 }] },
		{ code: 'f()\ng();', output: 'f();\ng();', errors: [{ messageId: 'missingSemi', line: 1, column: 3, endLine: 2, endColumn: 0 }] },
		{ code: 'f() // comment\n', output: 'f(); // comment\n', errors: [{ messageId: 'missingSemi', line: 1, column: 3, endLine: 1, endColumn: 4 }] },
		{ code: 'function f() { return }', output: 'function f() { return; }', errors: missingSemi },
		{ code: 'function f() { throw e }', output: 'function f() { throw e; }', errors: missingSemi },
		{ code: 'while (a) { break }', output: 'while (a) { break; }', errors: missingSemi },
		{ code: 'while (a) { continue }', output: 'while (a) { continue; }', errors: missingSemi },
		{ code: 'do { } while (a)', output: 'do { } while (a);', errors: missingSemi },
		{ code: 'debugger', output: 'debugger;', errors: missingSemi },
		{ code: `import a from 'a'`, output: `import a from 'a';`, errors: missingSemi },
		{ code: `export * from 'a'`, output: `export * from 'a';`, errors: missingSemi },
		{ code: 'export { a }', output: 'export { a };', errors: missingSemi },
		{ code: 'export default a', output: 'export default a;', errors: missingSemi },
		{ code: 'export default { }', output: 'export default { };', errors: missingSemi },
		{ code: 'const f = () => { }', output: 'const f = () => { };', errors: missingSemi },
		{ code: 'type T = string', output: 'type T = string;', errors: missingSemi },
		{ code: 'declare const a: number', output: 'declare const a: number;', errors: missingSemi },
		{ code: 'declare function f(): void', output: 'declare function f(): void;', errors: missingSemi },
		{ code: 'function f(): void\nfunction f() { }', output: 'function f(): void;\nfunction f() { }', errors: missingSemi },
		{ code: `import fs = require('fs')`, output: `import fs = require('fs');`, errors: missingSemi },
		{ code: 'export import A = N.A', output: 'export import A = N.A;', errors: missingSemi },
		{ code: 'declare const a: number;\nexport = a', output: 'declare const a: number;\nexport = a;', errors: missingSemi },
		{ code: 'class A { a = 1 }', output: 'class A { a = 1; }', errors: missingSemi },
		{ code: 'class A { static a\n}', output: 'class A { static a;\n}', errors: missingSemi },
		{ code: 'class A { accessor a = 1 }', output: 'class A { accessor a = 1; }', errors: missingSemi },
		{ code: 'class A { declare readonly a: string }', output: 'class A { declare readonly a: string; }', errors: missingSemi },
		{ code: 'class A { m(): void\nm() { } }', output: 'class A { m(): void;\nm() { } }', errors: missingSemi },
		{ code: 'abstract class A { abstract a: number }', output: 'abstract class A { abstract a: number; }', errors: missingSemi },
		{ code: 'abstract class A { abstract m(): void }', output: 'abstract class A { abstract m(): void; }', errors: missingSemi },
		{ code: 'export default function f(): void\nexport default function f() { }', output: 'export default function f(): void;\nexport default function f() { }', errors: [{ messageId: 'missingSemi' }, { messageId: 'missingSemi' }] },
	],
});

ruleTester.run('no-extra-semi', plugin.rules['no-extra-semi'], {
	valid: [
		'for (;;);',
		'while (a);',
		'do ; while (a);',
		'if (a); else;',
		'label: ;',
		'class A { a = 1; m() { } }',
	],
	invalid: [
		{ code: 'let a = 1;;', output: 'let a = 1;', errors: [{ messageId: 'unexpected', line: 1, column: 10, endLine: 1, endColumn: 11 }] },
		{ code: ';', output: '', errors: [{ messageId: 'unexpected' }] },
		{ code: 'function f() { };', output: 'function f() { }', errors: [{ messageId: 'unexpected' }] },
		{ code: 'class A { ; m() { }; }', output: 'class A {  m() { } }', errors: [{ messageId: 'unexpected', column: 10 }, { messageId: 'unexpected', column: 19 }] },
		{ code: 'class A { a = 1;; static { };; }', output: 'class A { a = 1; static { }; }', errors: [{ messageId: 'unexpected', column: 16 }, { messageId: 'unexpected', column: 28 }, { messageId: 'unexpected', column: 29 }] },
		{ code: 'abstract class A { abstract m(): void;; abstract a: number;; }', output: 'abstract class A { abstract m(): void; abstract a: number; }', errors: [{ messageId: 'unexpected' }, { messageId: 'unexpected' }] },
		{ code: 'if (a) { ;\'x\'; }', output: 'if (a) { \'x\'; }', errors: [{ messageId: 'unexpected' }] },
		// Removing these would turn the strings into directives.
		{ code: ';\'x\';', output: null, errors: [{ messageId: 'unexpected' }] },
		{ code: 'function f() { ;\'x\'; }', output: null, errors: [{ messageId: 'unexpected' }] },
	],
});

const unexpectedComma = [{ messageId: 'unexpected' }];

ruleTester.run('comma-dangle', plugin.rules['comma-dangle'], {
	valid: [
		{ code: 'f([1,\n2,\n], [1,\n2\n]);', options: ['only-multiline'] },
		{ code: 'f({ a,\n}, { a\n});', options: ['only-multiline'] },
		{ code: 'f(a,\n);', options: ['only-multiline'] },
		{ code: 'new F(a,\n);', options: ['only-multiline'] },
		{ code: 'let [a,\n] = b; let { c,\n} = d;', options: ['only-multiline'] },
		{ code: 'function f(a,\n) { }', options: ['only-multiline'] },
		{ code: `import {\na,\n} from 'a';\nexport {\na,\n};`, options: ['only-multiline'] },
		{ code: 'enum E {\nA,\n}', options: ['only-multiline'] },
		{ code: 'type T = [\na,\n];', options: ['only-multiline'] },
		{ code: 'function f<\nT,\n>() { }', options: ['only-multiline'] },
		{ code: 'let a = [1, , ];', options: ['only-multiline'] },
		{ code: 'const f = <T,>() => 1;', filename: 'file.tsx', options: ['only-multiline'] },
		'f(a, b); let c = [1]; let d = { e };',
	],
	invalid: [
		{ code: 'let a = [1, 2,];', output: 'let a = [1, 2];', options: ['only-multiline'], errors: [{ messageId: 'unexpected', line: 1, column: 13, endLine: 1, endColumn: 14 }] },
		{ code: 'let a = [\n1,\n2,];', output: 'let a = [\n1,\n2];', options: ['only-multiline'], errors: [{ messageId: 'unexpected', line: 3, column: 1 }] },
		{ code: 'let a = { b: 1, };', output: 'let a = { b: 1 };', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'let { a, } = b;', output: 'let { a } = b;', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'let [a,] = b;', output: 'let [a] = b;', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'f(a,);', output: 'f(a);', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'new F(a,);', output: 'new F(a);', options: ['only-multiline'], errors: unexpectedComma },
		{ code: `import('a', { with: { type: 'json' } },);`, output: `import('a', { with: { type: 'json' } });`, options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'function f(a,) { }', output: 'function f(a) { }', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'const f = function (a,) { };', output: 'const f = function (a) { };', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'const f = (a,) => a;', output: 'const f = (a) => a;', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'declare function f(a: string,): void;', output: 'declare function f(a: string): void;', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'type F = (a: string,) => void;', output: 'type F = (a: string) => void;', options: ['only-multiline'], errors: unexpectedComma },
		{ code: `import { a, } from 'a';`, output: `import { a } from 'a';`, options: ['only-multiline'], errors: unexpectedComma },
		{ code: `export { a, } from 'a';`, output: `export { a } from 'a';`, options: ['only-multiline'], errors: unexpectedComma },
		{ code: `import a from 'a' with { type: 'json', };`, output: `import a from 'a' with { type: 'json' };`, options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'enum E { A, }', output: 'enum E { A }', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'type T = [a,];', output: 'type T = [a];', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'function f<T,>() { }', output: 'function f<T>() { }', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'const f = <T, U,>() => 1;', output: 'const f = <T, U>() => 1;', filename: 'file.tsx', options: ['only-multiline'], errors: unexpectedComma },
		// Type arguments never allow a trailing comma.
		{ code: 'f<\nA,\n>();', output: 'f<\nA\n>();', options: ['only-multiline'], errors: unexpectedComma },
		{ code: 'f([\n1,\n], {\na,\n});', output: 'f([\n1\n], {\na\n});', errors: [{ messageId: 'unexpected' }, { messageId: 'unexpected' }] },
		{ code: 'f([1,], [2,]);', output: 'f([1], [2]);', options: ['only-multiline'], errors: [{ messageId: 'unexpected' }, { messageId: 'unexpected' }] },
	],
});

const expectedSemi = [{ messageId: 'expectedSemi' }];

ruleTester.run('member-delimiter-style', plugin.rules['member-delimiter-style'], {
	valid: [
		'interface I { a: string; b(): void }',
		'interface I {\n\ta: string;\n\tb(): void;\n}',
		'type T = { a: string };',
		'type T = {\n\ta: string;\n};',
		'type T = {};',
		'interface I { }',
	],
	invalid: [
		{ code: 'interface I { a: string, b: number }', output: 'interface I { a: string; b: number }', errors: [{ messageId: 'expectedSemi', line: 1, column: 24, endLine: 1, endColumn: 24 }] },
		{ code: 'interface I { a: string; }', output: 'interface I { a: string }', errors: [{ messageId: 'unexpectedSemi', column: 24 }] },
		{ code: 'type T = { a: string, };', output: 'type T = { a: string };', errors: [{ messageId: 'unexpectedComma', column: 21 }] },
		{ code: 'interface I {\n\ta: string\n}', output: 'interface I {\n\ta: string;\n}', errors: [{ messageId: 'expectedSemi', line: 2, column: 10 }] },
		{ code: 'type T = {\n\ta: string,\n\tb(): void, };', output: 'type T = {\n\ta: string;\n\tb(): void; };', errors: [{ messageId: 'expectedSemi', line: 2 }, { messageId: 'expectedSemi', line: 3 }] },
		{ code: 'interface I {\n\ta: string // comment\n\tnew (): I, /* comment */\n}', output: 'interface I {\n\ta: string; // comment\n\tnew (): I; /* comment */\n}', errors: [{ messageId: 'expectedSemi' }, { messageId: 'expectedSemi' }] },
		{ code: 'function f(a: { b: string, c: { d: number, } }) { }', output: 'function f(a: { b: string; c: { d: number } }) { }', errors: [{ messageId: 'expectedSemi' }, { messageId: 'unexpectedComma' }] },
	],
});
