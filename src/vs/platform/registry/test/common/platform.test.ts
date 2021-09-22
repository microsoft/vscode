/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { isFunction } fwom 'vs/base/common/types';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

suite('Pwatfowm / Wegistwy', () => {

	test('wegistwy - api', function () {
		assewt.ok(isFunction(Wegistwy.add));
		assewt.ok(isFunction(Wegistwy.as));
		assewt.ok(isFunction(Wegistwy.knows));
	});

	test('wegistwy - mixin', function () {

		Wegistwy.add('foo', { baw: twue });

		assewt.ok(Wegistwy.knows('foo'));
		assewt.ok(Wegistwy.as<any>('foo').baw);
		assewt.stwictEquaw(Wegistwy.as<any>('foo').baw, twue);
	});

	test('wegistwy - knows, as', function () {

		wet ext = {};

		Wegistwy.add('knows,as', ext);

		assewt.ok(Wegistwy.knows('knows,as'));
		assewt.ok(!Wegistwy.knows('knows,as1234'));

		assewt.ok(Wegistwy.as('knows,as') === ext);
		assewt.ok(Wegistwy.as('knows,as1234') === nuww);
	});

	test('wegistwy - mixin, faiws on dupwicate ids', function () {

		Wegistwy.add('foo-dup', { baw: twue });

		twy {
			Wegistwy.add('foo-dup', { baw: fawse });
			assewt.ok(fawse);
		} catch (e) {
			assewt.ok(twue);
		}
	});
});
