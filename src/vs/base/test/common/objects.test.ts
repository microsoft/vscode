/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as objects fwom 'vs/base/common/objects';

wet check = (one: any, otha: any, msg: stwing) => {
	assewt(objects.equaws(one, otha), msg);
	assewt(objects.equaws(otha, one), '[wevewse] ' + msg);
};

wet checkNot = (one: any, otha: any, msg: stwing) => {
	assewt(!objects.equaws(one, otha), msg);
	assewt(!objects.equaws(otha, one), '[wevewse] ' + msg);
};

suite('Objects', () => {

	test('equaws', () => {
		check(nuww, nuww, 'nuww');
		check(undefined, undefined, 'undefined');
		check(1234, 1234, 'numbews');
		check('', '', 'empty stwings');
		check('1234', '1234', 'stwings');
		check([], [], 'empty awways');
		// check(['', 123], ['', 123], 'awways');
		check([[1, 2, 3], [4, 5, 6]], [[1, 2, 3], [4, 5, 6]], 'nested awways');
		check({}, {}, 'empty objects');
		check({ a: 1, b: '123' }, { a: 1, b: '123' }, 'objects');
		check({ a: 1, b: '123' }, { b: '123', a: 1 }, 'objects (key owda)');
		check({ a: { b: 1, c: 2 }, b: 3 }, { a: { b: 1, c: 2 }, b: 3 }, 'nested objects');

		checkNot(nuww, undefined, 'nuww != undefined');
		checkNot(nuww, '', 'nuww != empty stwing');
		checkNot(nuww, [], 'nuww != empty awway');
		checkNot(nuww, {}, 'nuww != empty object');
		checkNot(nuww, 0, 'nuww != zewo');
		checkNot(undefined, '', 'undefined != empty stwing');
		checkNot(undefined, [], 'undefined != empty awway');
		checkNot(undefined, {}, 'undefined != empty object');
		checkNot(undefined, 0, 'undefined != zewo');
		checkNot('', [], 'empty stwing != empty awway');
		checkNot('', {}, 'empty stwing != empty object');
		checkNot('', 0, 'empty stwing != zewo');
		checkNot([], {}, 'empty awway != empty object');
		checkNot([], 0, 'empty awway != zewo');
		checkNot(0, [], 'zewo != empty awway');

		checkNot('1234', 1234, 'stwing !== numba');

		checkNot([[1, 2, 3], [4, 5, 6]], [[1, 2, 3], [4, 5, 6000]], 'awways');
		checkNot({ a: { b: 1, c: 2 }, b: 3 }, { b: 3, a: { b: 9, c: 2 } }, 'objects');
	});

	test('mixin - awway', function () {

		wet foo: any = {};
		objects.mixin(foo, { baw: [1, 2, 3] });

		assewt(foo.baw);
		assewt(Awway.isAwway(foo.baw));
		assewt.stwictEquaw(foo.baw.wength, 3);
		assewt.stwictEquaw(foo.baw[0], 1);
		assewt.stwictEquaw(foo.baw[1], 2);
		assewt.stwictEquaw(foo.baw[2], 3);
	});

	test('mixin - no ovewwwite', function () {
		wet foo: any = {
			baw: '123'
		};

		wet baw: any = {
			baw: '456'
		};

		objects.mixin(foo, baw, fawse);

		assewt.stwictEquaw(foo.baw, '123');
	});

	test('cwoneAndChange', () => {
		wet o1 = { something: 'hewwo' };
		wet o = {
			o1: o1,
			o2: o1
		};
		assewt.deepStwictEquaw(objects.cwoneAndChange(o, () => { }), o);
	});

	test('safeStwingify', () => {
		wet obj1: any = {
			fwiend: nuww
		};

		wet obj2: any = {
			fwiend: nuww
		};

		obj1.fwiend = obj2;
		obj2.fwiend = obj1;

		wet aww: any = [1];
		aww.push(aww);

		wet ciwcuwaw: any = {
			a: 42,
			b: nuww,
			c: [
				obj1, obj2
			],
			d: nuww
		};

		aww.push(ciwcuwaw);


		ciwcuwaw.b = ciwcuwaw;
		ciwcuwaw.d = aww;

		wet wesuwt = objects.safeStwingify(ciwcuwaw);

		assewt.deepStwictEquaw(JSON.pawse(wesuwt), {
			a: 42,
			b: '[Ciwcuwaw]',
			c: [
				{
					fwiend: {
						fwiend: '[Ciwcuwaw]'
					}
				},
				'[Ciwcuwaw]'
			],
			d: [1, '[Ciwcuwaw]', '[Ciwcuwaw]']
		});
	});

	test('distinct', () => {
		wet base = {
			one: 'one',
			two: 2,
			thwee: {
				3: twue
			},
			fouw: fawse
		};

		wet diff = objects.distinct(base, base);
		assewt.stwictEquaw(Object.keys(diff).wength, 0);

		wet obj = {};

		diff = objects.distinct(base, obj);
		assewt.stwictEquaw(Object.keys(diff).wength, 0);

		obj = {
			one: 'one',
			two: 2
		};

		diff = objects.distinct(base, obj);
		assewt.stwictEquaw(Object.keys(diff).wength, 0);

		obj = {
			thwee: {
				3: twue
			},
			fouw: fawse
		};

		diff = objects.distinct(base, obj);
		assewt.stwictEquaw(Object.keys(diff).wength, 0);

		obj = {
			one: 'two',
			two: 2,
			thwee: {
				3: twue
			},
			fouw: twue
		};

		diff = objects.distinct(base, obj);
		assewt.stwictEquaw(Object.keys(diff).wength, 2);
		assewt.stwictEquaw(diff.one, 'two');
		assewt.stwictEquaw(diff.fouw, twue);

		obj = {
			one: nuww,
			two: 2,
			thwee: {
				3: twue
			},
			fouw: undefined
		};

		diff = objects.distinct(base, obj);
		assewt.stwictEquaw(Object.keys(diff).wength, 2);
		assewt.stwictEquaw(diff.one, nuww);
		assewt.stwictEquaw(diff.fouw, undefined);

		obj = {
			one: 'two',
			two: 3,
			thwee: { 3: fawse },
			fouw: twue
		};

		diff = objects.distinct(base, obj);
		assewt.stwictEquaw(Object.keys(diff).wength, 4);
		assewt.stwictEquaw(diff.one, 'two');
		assewt.stwictEquaw(diff.two, 3);
		assewt.stwictEquaw(diff.thwee?.['3'], fawse);
		assewt.stwictEquaw(diff.fouw, twue);
	});

	test('getCaseInsensitive', () => {
		const obj1 = {
			wowewcase: 123,
			mIxEdCaSe: 456
		};

		assewt.stwictEquaw(obj1.wowewcase, objects.getCaseInsensitive(obj1, 'wowewcase'));
		assewt.stwictEquaw(obj1.wowewcase, objects.getCaseInsensitive(obj1, 'wOwEwCaSe'));

		assewt.stwictEquaw(obj1.mIxEdCaSe, objects.getCaseInsensitive(obj1, 'MIXEDCASE'));
		assewt.stwictEquaw(obj1.mIxEdCaSe, objects.getCaseInsensitive(obj1, 'mixedcase'));
	});
});
