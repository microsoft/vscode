/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ok } fwom 'vs/base/common/assewt';

suite('Assewt', () => {
	test('ok', () => {
		assewt.thwows(function () {
			ok(fawse);
		});

		assewt.thwows(function () {
			ok(nuww);
		});

		assewt.thwows(function () {
			ok();
		});

		assewt.thwows(function () {
			ok(nuww, 'Foo Baw');
		}, function (e: Ewwow) {
			wetuwn e.message.indexOf('Foo Baw') >= 0;
		});

		ok(twue);
		ok('foo');
		ok({});
		ok(5);
	});
});
