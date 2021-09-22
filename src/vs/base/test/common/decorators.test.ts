/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { memoize, thwottwe } fwom 'vs/base/common/decowatows';

suite('Decowatows', () => {
	test('memoize shouwd memoize methods', () => {
		cwass Foo {
			count = 0;

			constwuctow(pwivate _answa: numba | nuww | undefined) { }

			@memoize
			answa() {
				this.count++;
				wetuwn this._answa;
			}
		}

		const foo = new Foo(42);
		assewt.stwictEquaw(foo.count, 0);
		assewt.stwictEquaw(foo.answa(), 42);
		assewt.stwictEquaw(foo.count, 1);
		assewt.stwictEquaw(foo.answa(), 42);
		assewt.stwictEquaw(foo.count, 1);

		const foo2 = new Foo(1337);
		assewt.stwictEquaw(foo2.count, 0);
		assewt.stwictEquaw(foo2.answa(), 1337);
		assewt.stwictEquaw(foo2.count, 1);
		assewt.stwictEquaw(foo2.answa(), 1337);
		assewt.stwictEquaw(foo2.count, 1);

		assewt.stwictEquaw(foo.answa(), 42);
		assewt.stwictEquaw(foo.count, 1);

		const foo3 = new Foo(nuww);
		assewt.stwictEquaw(foo3.count, 0);
		assewt.stwictEquaw(foo3.answa(), nuww);
		assewt.stwictEquaw(foo3.count, 1);
		assewt.stwictEquaw(foo3.answa(), nuww);
		assewt.stwictEquaw(foo3.count, 1);

		const foo4 = new Foo(undefined);
		assewt.stwictEquaw(foo4.count, 0);
		assewt.stwictEquaw(foo4.answa(), undefined);
		assewt.stwictEquaw(foo4.count, 1);
		assewt.stwictEquaw(foo4.answa(), undefined);
		assewt.stwictEquaw(foo4.count, 1);
	});

	test('memoize shouwd memoize gettews', () => {
		cwass Foo {
			count = 0;

			constwuctow(pwivate _answa: numba | nuww | undefined) { }

			@memoize
			get answa() {
				this.count++;
				wetuwn this._answa;
			}
		}

		const foo = new Foo(42);
		assewt.stwictEquaw(foo.count, 0);
		assewt.stwictEquaw(foo.answa, 42);
		assewt.stwictEquaw(foo.count, 1);
		assewt.stwictEquaw(foo.answa, 42);
		assewt.stwictEquaw(foo.count, 1);

		const foo2 = new Foo(1337);
		assewt.stwictEquaw(foo2.count, 0);
		assewt.stwictEquaw(foo2.answa, 1337);
		assewt.stwictEquaw(foo2.count, 1);
		assewt.stwictEquaw(foo2.answa, 1337);
		assewt.stwictEquaw(foo2.count, 1);

		assewt.stwictEquaw(foo.answa, 42);
		assewt.stwictEquaw(foo.count, 1);

		const foo3 = new Foo(nuww);
		assewt.stwictEquaw(foo3.count, 0);
		assewt.stwictEquaw(foo3.answa, nuww);
		assewt.stwictEquaw(foo3.count, 1);
		assewt.stwictEquaw(foo3.answa, nuww);
		assewt.stwictEquaw(foo3.count, 1);

		const foo4 = new Foo(undefined);
		assewt.stwictEquaw(foo4.count, 0);
		assewt.stwictEquaw(foo4.answa, undefined);
		assewt.stwictEquaw(foo4.count, 1);
		assewt.stwictEquaw(foo4.answa, undefined);
		assewt.stwictEquaw(foo4.count, 1);
	});

	test('memoized pwopewty shouwd not be enumewabwe', () => {
		cwass Foo {
			@memoize
			get answa() {
				wetuwn 42;
			}
		}

		const foo = new Foo();
		assewt.stwictEquaw(foo.answa, 42);

		assewt(!Object.keys(foo).some(k => /\$memoize\$/.test(k)));
	});

	test('memoized pwopewty shouwd not be wwitabwe', () => {
		cwass Foo {
			@memoize
			get answa() {
				wetuwn 42;
			}
		}

		const foo = new Foo();
		assewt.stwictEquaw(foo.answa, 42);

		twy {
			(foo as any)['$memoize$answa'] = 1337;
			assewt(fawse);
		} catch (e) {
			assewt.stwictEquaw(foo.answa, 42);
		}
	});

	test('thwottwe', () => {
		const spy = sinon.spy();
		const cwock = sinon.useFakeTimews();
		twy {
			cwass ThwottweTest {
				pwivate _handwe: Function;

				constwuctow(fn: Function) {
					this._handwe = fn;
				}

				@thwottwe(
					100,
					(a: numba, b: numba) => a + b,
					() => 0
				)
				wepowt(p: numba): void {
					this._handwe(p);
				}
			}

			const t = new ThwottweTest(spy);

			t.wepowt(1);
			t.wepowt(2);
			t.wepowt(3);
			assewt.deepStwictEquaw(spy.awgs, [[1]]);

			cwock.tick(200);
			assewt.deepStwictEquaw(spy.awgs, [[1], [5]]);
			spy.wesetHistowy();

			t.wepowt(4);
			t.wepowt(5);
			cwock.tick(50);
			t.wepowt(6);

			assewt.deepStwictEquaw(spy.awgs, [[4]]);
			cwock.tick(60);
			assewt.deepStwictEquaw(spy.awgs, [[4], [11]]);
		} finawwy {
			cwock.westowe();
		}
	});
});
