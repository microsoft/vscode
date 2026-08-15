/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { convertPrivateFields, adjustSourceMap } from '../private-to-property.ts';
import { SourceMapConsumer, SourceMapGenerator, type RawSourceMap } from 'source-map';

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

	test('returns edits array', () => {
		const code = 'class Foo { #x = 1; get() { return this.#x; } }';
		const result = convertPrivateFields(code, 'test.js');
		assert.strictEqual(result.edits.length, 2);
		// Edits should be sorted by start position
		assert.ok(result.edits[0].start < result.edits[1].start);
		// First edit is the declaration #x, second is the usage this.#x
		assert.strictEqual(result.edits[0].newText, '$a');
		assert.strictEqual(result.edits[1].newText, '$a');
	});

	test('no edits when no private fields', () => {
		const code = 'class Foo { x = 1; }';
		const result = convertPrivateFields(code, 'test.js');
		assert.deepStrictEqual(result.edits, []);
	});

	test('async private method — replacement must not merge with async keyword', async () => {
		// In minified output, there is no space between `async` and `#method`:
		//   class Foo{async#run(){await Promise.resolve(1)}}
		// Replacing `#run` with `$a` naively produces `async$a()` which is a
		// single identifier, not `async $a()`. The `await` inside then becomes
		// invalid because the method is no longer async.
		const code = 'class Foo{async#run(){return await Promise.resolve(1)}call(){return this.#run()}}';
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#run'), 'should replace #run');
		// The replacement must NOT fuse with `async` into a single token
		assert.doesNotThrow(() => new Function(result.code), 'transformed code must be valid JS');
		// Verify it actually executes (the async method should still work)
		const exec = new Function(`
			${result.code}
			return new Foo().call();
		`);
		const val = await exec();
		assert.strictEqual(val, 1);
	});

	test('async private method — space inserted in declaration and not in usage', () => {
		// More readable version: ensure that `async #method()` becomes
		// `async $a()` (with space), while `this.#method()` becomes
		// `this.$a()` (no extra space needed since `.` separates tokens).
		const code = [
			'class Foo {',
			'  async #doWork() { return await 42; }',
			'  run() { return this.#doWork(); }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.ok(!result.code.includes('#doWork'), 'should replace #doWork');
		assert.doesNotThrow(() => new Function(result.code), 'transformed code must be valid JS');
	});

	test('static async private method — no token fusion', async () => {
		const code = 'class Foo{static async#init(){return await Promise.resolve(1)}static go(){return Foo.#init()}}';
		const result = convertPrivateFields(code, 'test.js');
		assert.doesNotThrow(() => new Function(result.code),
			'static async private method must produce valid JS, got:\n' + result.code);
		const exec = new Function(`
			${result.code}
			return Foo.go();
		`);
		const value = await exec();
		assert.strictEqual(value, 1);
	});

	test('heritage clause — extends expression resolves outer private field, not inner', () => {
		const code = [
			'class Outer {',
			'  #x = "outer";',
			'  method() {',
			'    return class extends (this.#x, Object) {',
			'      #x = "inner";',
			'    };',
			'  }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		// Outer.#x → $a (first class scanned), Inner.#x → $b (second)
		// this.#x in the extends clause lexically refers to Outer.#x,
		// so it must become this.$a, NOT this.$b
		assert.ok(result.code.includes('this.$a, Object'),
			'heritage clause should reference outer replacement ($a), got:\n' + result.code);
	});

	test('heritage clause runtime — extends uses correct outer private field', () => {
		const code = [
			'class Base { }',
			'class Outer {',
			'  #Base = Base;',
			'  createInner() {',
			'    return class extends this.#Base {',
			'      #Base = null;',
			'    };',
			'  }',
			'}',
			'const o = new Outer();',
			'const Inner = o.createInner();',
			'const inst = new Inner();',
			'return inst instanceof Base;',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		// With the bug, this.#Base in extends resolves to Inner's replacement
		// ($b) instead of Outer's ($a). Since the Outer instance has no $b
		// property, `class extends undefined` throws TypeError.
		assert.strictEqual(new Function(result.code)(), true,
			'inner class should extend Base via outer private field, code:\n' + result.code);
	});

	test('generated name must not collide with existing public property', () => {
		const code = [
			'class Foo {',
			'  $a = "public";',
			'  #x = "private";',
			'  getPublic() { return this.$a; }',
			'  getPrivate() { return this.#x; }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		// #x must not be renamed to $a since the class already has a public $a
		const fieldDecls = result.code.match(/\$a\s*=/g);
		assert.ok(!fieldDecls || fieldDecls.length <= 1,
			'should not produce duplicate $a property declarations, got:\n' + result.code);
	});

	test('collision with existing property — runtime correctness', () => {
		const code = [
			'class Foo {',
			'  $a = "public";',
			'  #x = "private";',
			'  getPublic() { return this.$a; }',
			'  getPrivate() { return this.#x; }',
			'}',
			'const f = new Foo();',
			'return f.getPublic() + "," + f.getPrivate();',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		// Original: getPublic() → "public", getPrivate() → "private"
		// With the bug: both return "private" because $a overwrites $a
		assert.strictEqual(new Function(result.code)(), 'public,private',
			'public and private properties must remain distinct, code:\n' + result.code);
	});

	test('collision avoidance — string-literal public property name', () => {
		const code = [
			'class Foo {',
			'  \'$a\' = "public";',
			'  #x = "private";',
			'  getPublic() { return this[\'$a\']; }',
			'  getPrivate() { return this.#x; }',
			'}',
			'const f = new Foo();',
			'return f.getPublic() + "," + f.getPrivate();',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.strictEqual(new Function(result.code)(), 'public,private',
			'string-literal public property must not collide, code:\n' + result.code);
	});

	test('collision avoidance — computed string-literal public property name', () => {
		const code = [
			'class Foo {',
			'  [\'$a\'] = "public";',
			'  #x = "private";',
			'  getPublic() { return this[\'$a\']; }',
			'  getPrivate() { return this.#x; }',
			'}',
			'const f = new Foo();',
			'return f.getPublic() + "," + f.getPrivate();',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		assert.strictEqual(new Function(result.code)(), 'public,private',
			'computed string-literal public property must not collide, code:\n' + result.code);
	});

	test('brand check in heritage clause resolves to outer scope', () => {
		const code = [
			'class Outer {',
			'  #brand;',
			'  createChecked(obj) {',
			'    return class extends (#brand in obj ? Object : Object) {',
			'      #brand;',
			'    };',
			'  }',
			'}',
		].join('\n');
		const result = convertPrivateFields(code, 'test.js');
		// #brand in the extends clause should resolve to Outer.#brand ($a),
		// not Inner.#brand ($b)
		assert.ok(result.code.includes('\'$a\' in obj'),
			'brand check in heritage clause should use outer replacement, got:\n' + result.code);
	});
});

suite('adjustSourceMap', () => {

	/**
	 * Helper: creates a source map with dense 1:1 mappings (every character)
	 * for a single-source file. Each column maps generated -> original identity.
	 */
	function createIdentitySourceMap(code: string, sourceName: string): RawSourceMap {
		const gen = new SourceMapGenerator();
		gen.setSourceContent(sourceName, code);
		const lines = code.split('\n');
		for (let line = 0; line < lines.length; line++) {
			for (let col = 0; col < lines[line].length; col++) {
				gen.addMapping({
					generated: { line: line + 1, column: col },
					original: { line: line + 1, column: col },
					source: sourceName,
				});
			}
		}
		return JSON.parse(gen.toString());
	}

	test('no edits - returns mappings unchanged', () => {
		const code = 'class Foo { x = 1; }';
		const map = createIdentitySourceMap(code, 'test.js');
		const originalMappings = map.mappings;
		const result = adjustSourceMap(map, code, []);
		assert.strictEqual(result.mappings, originalMappings);
	});

	test('single edit shrinks token - columns after edit shift left', () => {
		// "var #longName = 1; var y = 2;"
		//  0   4         14     22
		// After: "var $a = 1; var y = 2;"
		//  0   4  7       15
		const code = 'var #longName = 1; var y = 2;';
		// Create a sparse map with mappings only at known token positions
		const gen = new SourceMapGenerator();
		gen.setSourceContent('test.js', code);
		// Map 'var' at col 0
		gen.addMapping({ generated: { line: 1, column: 0 }, original: { line: 1, column: 0 }, source: 'test.js' });
		// Map '#longName' at col 4
		gen.addMapping({ generated: { line: 1, column: 4 }, original: { line: 1, column: 4 }, source: 'test.js' });
		// Map '=' at col 14
		gen.addMapping({ generated: { line: 1, column: 14 }, original: { line: 1, column: 14 }, source: 'test.js' });
		// Map 'var' at col 19
		gen.addMapping({ generated: { line: 1, column: 19 }, original: { line: 1, column: 19 }, source: 'test.js' });
		// Map 'y' at col 23
		gen.addMapping({ generated: { line: 1, column: 23 }, original: { line: 1, column: 23 }, source: 'test.js' });
		const map = JSON.parse(gen.toString());

		const result = adjustSourceMap(map, code, [{ start: 4, end: 13, newText: '$a' }]);

		const consumer = new SourceMapConsumer(result);
		// 'y' was at gen col 23, edit shrunk 9->2 chars (delta -7), so now at gen col 16
		const pos = consumer.originalPositionFor({ line: 1, column: 16 });
		assert.strictEqual(pos.column, 23, 'y should map back to original column 23');

		// '=' was at gen col 14, edit shrunk by 7, so now at gen col 7
		const pos2 = consumer.originalPositionFor({ line: 1, column: 7 });
		assert.strictEqual(pos2.column, 14, '= should map back to original column 14');
	});

	test('edit on line does not affect other lines', () => {
		const code = 'class Foo {\n  #x = 1;\n  get() { return 42; }\n}';
		const map = createIdentitySourceMap(code, 'test.js');

		const hashPos = code.indexOf('#x');
		const result = adjustSourceMap(map, code, [{ start: hashPos, end: hashPos + 2, newText: '$a' }]);

		const consumer = new SourceMapConsumer(result);
		// Line 3 (1-based) should be completely unaffected
		const pos = consumer.originalPositionFor({ line: 3, column: 0 });
		assert.strictEqual(pos.line, 3);
		assert.strictEqual(pos.column, 0);
	});

	test('multiple edits on same line accumulate shifts', () => {
		// "this.#aaa + this.#bbb + this.#ccc;"
		//  0    5      11   17      23   29
		const code = 'this.#aaa + this.#bbb + this.#ccc;';
		// Sparse map at token boundaries (not inside edit spans)
		const gen = new SourceMapGenerator();
		gen.setSourceContent('test.js', code);
		gen.addMapping({ generated: { line: 1, column: 0 }, original: { line: 1, column: 0 }, source: 'test.js' });   // 'this'
		gen.addMapping({ generated: { line: 1, column: 5 }, original: { line: 1, column: 5 }, source: 'test.js' });   // '#aaa'
		gen.addMapping({ generated: { line: 1, column: 10 }, original: { line: 1, column: 10 }, source: 'test.js' }); // '+'
		gen.addMapping({ generated: { line: 1, column: 12 }, original: { line: 1, column: 12 }, source: 'test.js' }); // 'this'
		gen.addMapping({ generated: { line: 1, column: 17 }, original: { line: 1, column: 17 }, source: 'test.js' }); // '#bbb'
		gen.addMapping({ generated: { line: 1, column: 22 }, original: { line: 1, column: 22 }, source: 'test.js' }); // '+'
		gen.addMapping({ generated: { line: 1, column: 24 }, original: { line: 1, column: 24 }, source: 'test.js' }); // 'this'
		gen.addMapping({ generated: { line: 1, column: 29 }, original: { line: 1, column: 29 }, source: 'test.js' }); // '#ccc'
		gen.addMapping({ generated: { line: 1, column: 33 }, original: { line: 1, column: 33 }, source: 'test.js' }); // ';'
		const map = JSON.parse(gen.toString());

		const edits = [
			{ start: 5, end: 9, newText: '$a' },   // #aaa(4) -> $a(2), delta -2
			{ start: 17, end: 21, newText: '$b' },  // #bbb(4) -> $b(2), delta -2
			{ start: 29, end: 33, newText: '$c' },  // #ccc(4) -> $c(2), delta -2
		];
		const result = adjustSourceMap(map, code, edits);

		const consumer = new SourceMapConsumer(result);
		// After edits: "this.$a + this.$b + this.$c;"
		// '#ccc' was at gen col 29, now at 29-2-2=25
		const pos = consumer.originalPositionFor({ line: 1, column: 25 });
		assert.strictEqual(pos.column, 29, 'third edit position should map to original column');

		// '+' after #bbb was at gen col 22, both prior edits shift by -2 each: 22-4=18
		const pos2 = consumer.originalPositionFor({ line: 1, column: 18 });
		assert.strictEqual(pos2.column, 22, 'plus after second edit should map correctly');
	});

	test('end-to-end: convertPrivateFields + adjustSourceMap', () => {
		const code = [
			'class MyWidget {',
			'  #count = 0;',
			'  increment() { this.#count++; }',
			'  getValue() { return this.#count; }',
			'}',
		].join('\n');

		const map = createIdentitySourceMap(code, 'widget.js');
		const result = convertPrivateFields(code, 'widget.js');

		assert.ok(result.edits.length > 0, 'should have edits');
		assert.ok(!result.code.includes('#count'), 'should not contain #count');

		// Adjust the source map
		const adjusted = adjustSourceMap(map, code, result.edits);
		const consumer = new SourceMapConsumer(adjusted);

		// Find 'getValue' in the edited output and verify it maps back correctly
		const editedLines = result.code.split('\n');
		const getValueLine = editedLines.findIndex(l => l.includes('getValue'));
		assert.ok(getValueLine >= 0, 'should find getValue in edited code');

		const getValueCol = editedLines[getValueLine].indexOf('getValue');
		const pos = consumer.originalPositionFor({ line: getValueLine + 1, column: getValueCol });

		// getValue was on line 4 (1-based), same column in original
		const origLines = code.split('\n');
		const origGetValueCol = origLines[3].indexOf('getValue');
		assert.strictEqual(pos.line, 4, 'getValue should map to original line 4');
		assert.strictEqual(pos.column, origGetValueCol, 'getValue column should match original');
	});

	test('multi-line edit: removing newlines shifts subsequent lines up', () => {
		// Simulates the NLS scenario: a template literal with embedded newlines
		// is replaced with `null`, collapsing 3 lines into 1.
		const code = [
			'var a = "hello";',          // line 0 (0-based)
			'var b = `line1',             // line 1
			'line2',                      // line 2
			'line3`;',                    // line 3
			'var c = "world";',           // line 4
		].join('\n');
		const map = createIdentitySourceMap(code, 'test.js');

		// Replace the template literal `line1\nline2\nline3` with `null`
		// (keeps `var b = ` and `;` intact)
		const tplStart = code.indexOf('`line1');
		const tplEnd = code.indexOf('line3`') + 'line3`'.length;
		const edits = [{ start: tplStart, end: tplEnd, newText: 'null' }];

		const result = adjustSourceMap(map, code, edits);
		const consumer = new SourceMapConsumer(result);

		// After edit, code is:
		// "var a = \"hello\";\nvar b = null;\nvar c = \"world\";"
		// "var c" was on line 5 (1-based), now on line 3 (1-based) since 2 newlines removed

		// 'var c' at original line 5, col 0 should now map at generated line 3
		const pos = consumer.originalPositionFor({ line: 3, column: 0 });
		assert.strictEqual(pos.line, 5, 'var c should map to original line 5');
		assert.strictEqual(pos.column, 0, 'var c column should be 0');

		// 'var a' on line 1 should be unaffected
		const posA = consumer.originalPositionFor({ line: 1, column: 0 });
		assert.strictEqual(posA.line, 1, 'var a should still map to original line 1');
	});

	test('brand check: #field in obj -> string replacement adjusts map', () => {
		const code = 'class C { #x; check(o) { return #x in o; } }';
		const map = createIdentitySourceMap(code, 'test.js');

		const result = convertPrivateFields(code, 'test.js');
		const adjusted = adjustSourceMap(map, code, result.edits);
		const consumer = new SourceMapConsumer(adjusted);

		// 'check' method should still map correctly
		const editedCheckCol = result.code.indexOf('check');
		const pos = consumer.originalPositionFor({ line: 1, column: editedCheckCol });
		assert.strictEqual(pos.line, 1);
		assert.strictEqual(pos.column, code.indexOf('check'));
	});
});
