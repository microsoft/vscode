/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { memoize } from 'vs/base/common/decorators';

suite('Decorators', () => {
	test('memoize should memoize methods', () => {
		class Foo {
			count = 0;

			constructor(private _answer: number | null | undefined) { }

			@memoize
			answer() {
				this.count++;
				return this._answer;
			}
		}

		const foo = new Foo(42);
		assert.equal(foo.count, 0);
		assert.equal(foo.answer(), 42);
		assert.equal(foo.count, 1);
		assert.equal(foo.answer(), 42);
		assert.equal(foo.count, 1);

		const foo2 = new Foo(1337);
		assert.equal(foo2.count, 0);
		assert.equal(foo2.answer(), 1337);
		assert.equal(foo2.count, 1);
		assert.equal(foo2.answer(), 1337);
		assert.equal(foo2.count, 1);

		assert.equal(foo.answer(), 42);
		assert.equal(foo.count, 1);

		const foo3 = new Foo(null);
		assert.equal(foo3.count, 0);
		assert.equal(foo3.answer(), null);
		assert.equal(foo3.count, 1);
		assert.equal(foo3.answer(), null);
		assert.equal(foo3.count, 1);

		const foo4 = new Foo(undefined);
		assert.equal(foo4.count, 0);
		assert.equal(foo4.answer(), undefined);
		assert.equal(foo4.count, 1);
		assert.equal(foo4.answer(), undefined);
		assert.equal(foo4.count, 1);
	});

	test('memoize should memoize getters', () => {
		class Foo {
			count = 0;

			constructor(private _answer: number | null | undefined) { }

			@memoize
			get answer() {
				this.count++;
				return this._answer;
			}
		}

		const foo = new Foo(42);
		assert.equal(foo.count, 0);
		assert.equal(foo.answer, 42);
		assert.equal(foo.count, 1);
		assert.equal(foo.answer, 42);
		assert.equal(foo.count, 1);

		const foo2 = new Foo(1337);
		assert.equal(foo2.count, 0);
		assert.equal(foo2.answer, 1337);
		assert.equal(foo2.count, 1);
		assert.equal(foo2.answer, 1337);
		assert.equal(foo2.count, 1);

		assert.equal(foo.answer, 42);
		assert.equal(foo.count, 1);

		const foo3 = new Foo(null);
		assert.equal(foo3.count, 0);
		assert.equal(foo3.answer, null);
		assert.equal(foo3.count, 1);
		assert.equal(foo3.answer, null);
		assert.equal(foo3.count, 1);

		const foo4 = new Foo(undefined);
		assert.equal(foo4.count, 0);
		assert.equal(foo4.answer, undefined);
		assert.equal(foo4.count, 1);
		assert.equal(foo4.answer, undefined);
		assert.equal(foo4.count, 1);
	});

	test('memoized property should not be enumerable', () => {
		class Foo {
			@memoize
			get answer() { return 42; }
		}

		const foo = new Foo();
		assert.equal(foo.answer, 42);

		assert(!Object.keys(foo).some(k => /\$memoize\$/.test(k)));
	});

	test('memoized property should not be writable', () => {
		class Foo {
			@memoize
			get answer() { return 42; }
		}

		const foo = new Foo();
		assert.equal(foo.answer, 42);

		try {
			(foo as any)['$memoize$answer'] = 1337;
			assert(false);
		} catch (e) {
			assert.equal(foo.answer, 42);
		}
	});
});
