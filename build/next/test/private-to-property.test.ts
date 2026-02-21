/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { convertPrivateFields } from '../private-to-property.ts';

suite('convertPrivateFields', () => {

	test('no # characters — quick bail-out', () => {
		const result = convertPrivateFields('const x = 1; function foo() { return x; }', 'test.js');
		assert.strictEqual(result.code, 'const x = 1; function foo() { return x; }');
		assert.strictEqual(result.editCount, 0);
		assert.strictEqual(result.classCount, 0);
		assert.strictEqual(result.fieldCount, 0);
	});

	test('class without private fields — identity', () => {
		const code = 'class Plain { x = 1; get() { return this.x; } }';
		const result = convertPrivateFields(code, 'test.js');
		assert.strictEqual(result.code, code);
		assert.strictEqual(result.editCount, 0);
	});

	test('basic private field', () => {
		const code = 'class Foo { #x = 1; get() { return this.#x; } }';
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#x'), 'should not contain #x');
		assert.ok(result.code.includes('$a'), 'should contain replacement $a');
		assert.strictEqual(result.classCount, 1);
		assert.strictEqual(result.fieldCount, 1);
		assert.strictEqual(result.editCount, 2);
	});

	test('multiple private fields in one class', () => {
		const code = 'class Foo { #x = 1; #y = 2; get() { return this.#x + this.#y; } }';
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#x'));
		assert.ok(!result.code.includes('#y'));
		assert.strictEqual(result.fieldCount, 2);
		assert.strictEqual(result.editCount, 4);
	});

	test('inheritance — same private name in parent and child get different replacements', () => {
		const code = [
			'class Parent { #a = 1; getA() { return this.#a; } }',
			'class Child extends Parent { #a = 2; getChildA() { return this.#a; } }',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#a'));
		assert.ok(result.code.includes('$a'), 'Parent should get $a');
		assert.ok(result.code.includes('$b'), 'Child should get $b');
	});

	test('static private field — no clash with inherited public property', () => {
		const code = [
			'class MyError extends Error {',
			'  static #name = "MyError";',
			'  check(data) { return data.name !== MyError.#name; }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#name'));
		assert.ok(result.code.includes('$a'));
		assert.ok(result.code.includes('data.name'), 'public property should be preserved');
	});

	test('private method', () => {
		const code = [
			'class Bar {',
			'  #normalize(s) { return s.toLowerCase(); }',
			'  process(s) { return this.#normalize(s); }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#normalize'));
		assert.strictEqual(result.fieldCount, 1);
	});

	test('getter/setter pair', () => {
		const code = [
			'class WithAccessors {',
			'  #_val;',
			'  get #val() { return this.#_val; }',
			'  set #val(v) { this.#_val = v; }',
			'  init() { this.#val = 42; }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#_val'));
		assert.ok(!result.code.includes('#val'));
		assert.strictEqual(result.fieldCount, 2);
	});

	test('nested classes — separate scopes', () => {
		const code = [
			'class Outer {',
			'  #x = 1;',
			'  method() {',
			'    class Inner {',
			'      #y = 2;',
			'      foo() { return this.#y; }',
			'    }',
			'    return this.#x;',
			'  }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#x'));
		assert.ok(!result.code.includes('#y'));
		assert.strictEqual(result.classCount, 2);
	});

	test('nested class accessing outer private field', () => {
		const code = [
			'class Outer {',
			'  #x = 1;',
			'  method() {',
			'    class Inner {',
			'      foo(o) { return o.#x; }',
			'    }',
			'    return this.#x;',
			'  }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#x'));
		const matches = result.code.match(/\$a/g);
		assert.strictEqual(matches?.length, 3, 'decl + this.#x + o.#x = 3');
	});

	test('nested classes — same private name get different replacements', () => {
		const code = [
			'class Outer {',
			'  #x = 1;',
			'  m() {',
			'    class Inner {',
			'      #x = 2;',
			'      f() { return this.#x; }',
			'    }',
			'    return this.#x;',
			'  }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#x'));
		assert.ok(result.code.includes('$a'), 'Outer.#x → $a');
		assert.ok(result.code.includes('$b'), 'Inner.#x → $b');
	});

	test('unrelated classes with same private name', () => {
		const code = [
			'class A { #data = 1; get() { return this.#data; } }',
			'class B { #data = 2; get() { return this.#data; } }',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#data'));
		assert.ok(result.code.includes('$a'));
		assert.ok(result.code.includes('$b'));
	});

	test('cross-instance access', () => {
		const code = [
			'class Foo {',
			'  #secret = 42;',
			'  equals(other) { return this.#secret === other.#secret; }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#secret'));
		const matches = result.code.match(/\$a/g);
		assert.strictEqual(matches?.length, 3);
	});

	test('string containing # is not modified', () => {
		const code = [
			'class Foo {',
			'  #x = 1;',
			'  label = "use #x for private";',
			'  get() { return this.#x; }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(result.code.includes('"use #x for private"'), 'string preserved');
		assert.ok(!result.code.includes('this.#x'), 'usage replaced');
	});

	test('#field in expr — brand check uses quoted string', () => {
		const code = 'class Foo { #brand; static check(x) { if (#brand in x) return true; } }';
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#brand'));
		assert.ok(result.code.includes('\'$a\' in x'), 'quoted string for in-check');
	});

	test('string #brand in obj is not treated as private field', () => {
		const code = 'class Foo { #brand = true; isFoo(obj) { return "#brand" in obj; } }';
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(result.code.includes('"#brand" in obj'), 'string literal preserved');
	});

	test('transformed code is valid JavaScript', () => {
		const code = [
			'class Base { #id = 0; getId() { return this.#id; } }',
			'class Derived extends Base { #name; constructor(n) { super(); this.#name = n; } getName() { return this.#name; } }',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.doesNotThrow(() => new Function(result.code));
	});

	test('transformed code executes correctly', () => {
		const code = [
			'class Counter {',
			'  #count = 0;',
			'  increment() { this.#count++; }',
			'  get value() { return this.#count; }',
			'}',
			'const c = new Counter();',
			'c.increment(); c.increment(); c.increment();',
			'return c.value;',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.strictEqual(new Function(result.code)(), 3);
	});

	test('transformed code executes correctly with inheritance', () => {
		const code = [
			'class Animal {',
			'  #sound;',
			'  constructor(s) { this.#sound = s; }',
			'  speak() { return this.#sound; }',
			'}',
			'class Dog extends Animal {',
			'  #tricks = [];',
			'  constructor() { super("woof"); }',
			'  learn(trick) { this.#tricks.push(trick); }',
			'  show() { return this.#tricks.join(","); }',
			'}',
			'const d = new Dog();',
			'd.learn("sit"); d.learn("shake");',
			'return d.speak() + ":" + d.show();',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.strictEqual(new Function(result.code)(), 'woof:sit,shake');
	});

	suite('name generation', () => {

		test('generates $a through $Z for 52 fields', () => {
			const fields = [];
			const usages = [];
			for (let i = 0; i < 52; i++) {
				fields.push(`#f${i};`);
				usages.push(`this.#f${i}`);
			}
			const code = `class Big { ${fields.join(' ')} get() { return ${usages.join(' + ')}; } }`;
			const result = convertPrivateFields(code, 'test.js');
			assert.ok(result.code.includes('$a'));
			assert.ok(result.code.includes('$Z'));
			assert.strictEqual(result.fieldCount, 52);
		});

		test('wraps to $aa after $Z', () => {
			const fields = [];
			const usages = [];
			for (let i = 0; i < 53; i++) {
				fields.push(`#f${i};`);
				usages.push(`this.#f${i}`);
			}
			const code = `class Big { ${fields.join(' ')} get() { return ${usages.join(' + ')}; } }`;
			const result = convertPrivateFields(code, 'test.js');
			assert.ok(result.code.includes('$aa'));
		});
	});
});
