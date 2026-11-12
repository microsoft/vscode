/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import rule from '../code-no-parameter-property-before-init.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const direct = (name: string) => ({ messageId: 'direct', data: { name } });
const indirect = (name: string, path: string) => ({ messageId: 'indirect', data: { name, path } });

new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } }).run('code-no-parameter-property-before-init', rule, {
	valid: [
		// The constructor runs after the parameter properties are assigned.
		`class C { constructor(private readonly s: S) { this.s.run(); } }`,
		// Functions that the initializer creates, but doesn't run.
		`class C { x = () => this.s.run(); y = function () { return this; }; constructor(private readonly s: S) { } }`,
		`class C { x = this.e.event(() => this.s.run()); constructor(private readonly s: S) { } }`,
		// A method or a function-valued field that the initializer reads, but doesn't call.
		`class C { x = this.m; y = this.f; f = () => this.s; constructor(private readonly s: S) { } m() { return this.s; } }`,
		// A method that reads no parameter property, and recursion.
		`class C { x = this.m(); constructor(private readonly s: S) { } m(): number { return this.m() + this.n; } }`,
		// Static members, and other objects.
		`class C { static x = this.s; y = other.s; constructor(private readonly s: S) { } }`,
		// The \`this\` of a nested class or object method.
		`class C { x = new class { s = 1; y = this.s; }; y = { s: 1, m() { return this.s; } }.m(); constructor(private readonly s: S) { } }`,
		// Parameters that aren't properties, and members that the class doesn't declare.
		`class C extends B { x = this.s; y = this.inherited(); constructor(s: S) { super(); } }`,
		// Assignments that only write the parameter property.
		`class C { x = (this.s = 1); constructor(public s: number) { } }`,
		// Calling a generator only creates an iterator.
		`class C { x = this.values(); y = this.g(); g = function* (this: C) { yield this.s; }; constructor(private readonly s: S) { } *values() { yield this.s; } }`,
	],
	invalid: [
		{ code: `class C { x = this.s.value; constructor(private readonly s: S) { } }`, errors: [direct('s')] },
		{ code: `class C { x = this['s']; constructor(public s = 1) { } }`, errors: [direct('s')] },
		{ code: `class C { accessor x = this.s; constructor(private readonly s: S) { } }`, errors: [direct('s')] },
		{ code: `class C { x = this.m(); constructor(private readonly s: S) { } m() { return this.n(); } n() { return this.s; } }`, errors: [indirect('s', 'this.m() -> this.n() -> this.s')] },
		{ code: `class C { x = this.g; constructor(private readonly s: S) { } get g() { return this.s; } }`, errors: [indirect('s', 'this.g -> this.s')] },
		{ code: `class C { x = this.#m(); f = () => this.s; constructor(private readonly s: S) { } #m() { return this.f(); } }`, errors: [indirect('s', 'this.#m() -> this.f() -> this.s')] },
		{ code: `class C { x = [this.a, this.m()]; constructor(private a: A, private b: B) { } m() { return this.b!; } }`, errors: [direct('a'), indirect('b', 'this.m() -> this.b')] },
		{ code: `class C { x = (this.s += 1); constructor(public s: number) { } }`, errors: [direct('s')] },
		// Default values of parameters run when the call leaves out the arguments.
		{ code: `class C { x = this.m(); y = this.f(); f = (value = this.s) => value; constructor(private readonly s: S) { } m(value = this.s.value) { return value; } }`, errors: [indirect('s', 'this.m() -> this.s'), indirect('s', 'this.f() -> this.s')] },
		{ code: 'class C { x = this.tag`text`; constructor(private readonly s: S) { } tag(parts: TemplateStringsArray) { return this.s; } }', errors: [indirect('s', 'this.tag`` -> this.s')] },
		// Members that run each other.
		{ code: `class C { x = this.a(false); y = this.b(); constructor(private readonly s: S) { } a(recur: boolean) { if (recur) { this.b(); } return this.s; } b() { return this.a(false); } }`, errors: [indirect('s', 'this.a() -> this.s'), indirect('s', 'this.b() -> this.a() -> this.s')] },
		{ code: `class C { x = this.b(); constructor(private readonly s: S) { } a(): S { return this.b() ?? this.s; } b(): S { return this.a(); } }`, errors: [indirect('s', 'this.b() -> this.a() -> this.s')] },
	],
});
