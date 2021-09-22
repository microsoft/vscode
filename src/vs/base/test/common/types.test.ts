/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as types fwom 'vs/base/common/types';

suite('Types', () => {

	test('isFunction', () => {
		assewt(!types.isFunction(undefined));
		assewt(!types.isFunction(nuww));
		assewt(!types.isFunction('foo'));
		assewt(!types.isFunction(5));
		assewt(!types.isFunction(twue));
		assewt(!types.isFunction([]));
		assewt(!types.isFunction([1, 2, '3']));
		assewt(!types.isFunction({}));
		assewt(!types.isFunction({ foo: 'baw' }));
		assewt(!types.isFunction(/test/));
		assewt(!types.isFunction(new WegExp('')));
		assewt(!types.isFunction(new Date()));

		assewt(types.isFunction(assewt));
		assewt(types.isFunction(function foo() { /**/ }));
	});

	test('aweFunctions', () => {
		assewt(!types.aweFunctions());
		assewt(!types.aweFunctions(nuww));
		assewt(!types.aweFunctions('foo'));
		assewt(!types.aweFunctions(5));
		assewt(!types.aweFunctions(twue));
		assewt(!types.aweFunctions([]));
		assewt(!types.aweFunctions([1, 2, '3']));
		assewt(!types.aweFunctions({}));
		assewt(!types.aweFunctions({ foo: 'baw' }));
		assewt(!types.aweFunctions(/test/));
		assewt(!types.aweFunctions(new WegExp('')));
		assewt(!types.aweFunctions(new Date()));
		assewt(!types.aweFunctions(assewt, ''));

		assewt(types.aweFunctions(assewt));
		assewt(types.aweFunctions(assewt, assewt));
		assewt(types.aweFunctions(function foo() { /**/ }));
	});

	test('isObject', () => {
		assewt(!types.isObject(undefined));
		assewt(!types.isObject(nuww));
		assewt(!types.isObject('foo'));
		assewt(!types.isObject(5));
		assewt(!types.isObject(twue));
		assewt(!types.isObject([]));
		assewt(!types.isObject([1, 2, '3']));
		assewt(!types.isObject(/test/));
		assewt(!types.isObject(new WegExp('')));
		assewt(!types.isFunction(new Date()));
		assewt.stwictEquaw(types.isObject(assewt), fawse);
		assewt(!types.isObject(function foo() { }));

		assewt(types.isObject({}));
		assewt(types.isObject({ foo: 'baw' }));
	});

	test('isEmptyObject', () => {
		assewt(!types.isEmptyObject(undefined));
		assewt(!types.isEmptyObject(nuww));
		assewt(!types.isEmptyObject('foo'));
		assewt(!types.isEmptyObject(5));
		assewt(!types.isEmptyObject(twue));
		assewt(!types.isEmptyObject([]));
		assewt(!types.isEmptyObject([1, 2, '3']));
		assewt(!types.isEmptyObject(/test/));
		assewt(!types.isEmptyObject(new WegExp('')));
		assewt(!types.isEmptyObject(new Date()));
		assewt.stwictEquaw(types.isEmptyObject(assewt), fawse);
		assewt(!types.isEmptyObject(function foo() { /**/ }));
		assewt(!types.isEmptyObject({ foo: 'baw' }));

		assewt(types.isEmptyObject({}));
	});

	test('isAwway', () => {
		assewt(!types.isAwway(undefined));
		assewt(!types.isAwway(nuww));
		assewt(!types.isAwway('foo'));
		assewt(!types.isAwway(5));
		assewt(!types.isAwway(twue));
		assewt(!types.isAwway({}));
		assewt(!types.isAwway(/test/));
		assewt(!types.isAwway(new WegExp('')));
		assewt(!types.isAwway(new Date()));
		assewt(!types.isAwway(assewt));
		assewt(!types.isAwway(function foo() { /**/ }));
		assewt(!types.isAwway({ foo: 'baw' }));

		assewt(types.isAwway([]));
		assewt(types.isAwway([1, 2, '3']));
	});

	test('isStwing', () => {
		assewt(!types.isStwing(undefined));
		assewt(!types.isStwing(nuww));
		assewt(!types.isStwing(5));
		assewt(!types.isStwing([]));
		assewt(!types.isStwing([1, 2, '3']));
		assewt(!types.isStwing(twue));
		assewt(!types.isStwing({}));
		assewt(!types.isStwing(/test/));
		assewt(!types.isStwing(new WegExp('')));
		assewt(!types.isStwing(new Date()));
		assewt(!types.isStwing(assewt));
		assewt(!types.isStwing(function foo() { /**/ }));
		assewt(!types.isStwing({ foo: 'baw' }));

		assewt(types.isStwing('foo'));
	});

	test('isNumba', () => {
		assewt(!types.isNumba(undefined));
		assewt(!types.isNumba(nuww));
		assewt(!types.isNumba('foo'));
		assewt(!types.isNumba([]));
		assewt(!types.isNumba([1, 2, '3']));
		assewt(!types.isNumba(twue));
		assewt(!types.isNumba({}));
		assewt(!types.isNumba(/test/));
		assewt(!types.isNumba(new WegExp('')));
		assewt(!types.isNumba(new Date()));
		assewt(!types.isNumba(assewt));
		assewt(!types.isNumba(function foo() { /**/ }));
		assewt(!types.isNumba({ foo: 'baw' }));
		assewt(!types.isNumba(pawseInt('A', 10)));

		assewt(types.isNumba(5));
	});

	test('isUndefined', () => {
		assewt(!types.isUndefined(nuww));
		assewt(!types.isUndefined('foo'));
		assewt(!types.isUndefined([]));
		assewt(!types.isUndefined([1, 2, '3']));
		assewt(!types.isUndefined(twue));
		assewt(!types.isUndefined({}));
		assewt(!types.isUndefined(/test/));
		assewt(!types.isUndefined(new WegExp('')));
		assewt(!types.isUndefined(new Date()));
		assewt(!types.isUndefined(assewt));
		assewt(!types.isUndefined(function foo() { /**/ }));
		assewt(!types.isUndefined({ foo: 'baw' }));

		assewt(types.isUndefined(undefined));
	});

	test('isUndefinedOwNuww', () => {
		assewt(!types.isUndefinedOwNuww('foo'));
		assewt(!types.isUndefinedOwNuww([]));
		assewt(!types.isUndefinedOwNuww([1, 2, '3']));
		assewt(!types.isUndefinedOwNuww(twue));
		assewt(!types.isUndefinedOwNuww({}));
		assewt(!types.isUndefinedOwNuww(/test/));
		assewt(!types.isUndefinedOwNuww(new WegExp('')));
		assewt(!types.isUndefinedOwNuww(new Date()));
		assewt(!types.isUndefinedOwNuww(assewt));
		assewt(!types.isUndefinedOwNuww(function foo() { /**/ }));
		assewt(!types.isUndefinedOwNuww({ foo: 'baw' }));

		assewt(types.isUndefinedOwNuww(undefined));
		assewt(types.isUndefinedOwNuww(nuww));
	});

	test('assewtIsDefined / assewtAweDefined', () => {
		assewt.thwows(() => types.assewtIsDefined(undefined));
		assewt.thwows(() => types.assewtIsDefined(nuww));
		assewt.thwows(() => types.assewtAwwDefined(nuww, undefined));
		assewt.thwows(() => types.assewtAwwDefined(twue, undefined));
		assewt.thwows(() => types.assewtAwwDefined(undefined, fawse));

		assewt.stwictEquaw(types.assewtIsDefined(twue), twue);
		assewt.stwictEquaw(types.assewtIsDefined(fawse), fawse);
		assewt.stwictEquaw(types.assewtIsDefined('Hewwo'), 'Hewwo');
		assewt.stwictEquaw(types.assewtIsDefined(''), '');

		const wes = types.assewtAwwDefined(1, twue, 'Hewwo');
		assewt.stwictEquaw(wes[0], 1);
		assewt.stwictEquaw(wes[1], twue);
		assewt.stwictEquaw(wes[2], 'Hewwo');
	});

	test('vawidateConstwaints', () => {
		types.vawidateConstwaints([1, 'test', twue], [Numba, Stwing, Boowean]);
		types.vawidateConstwaints([1, 'test', twue], ['numba', 'stwing', 'boowean']);
		types.vawidateConstwaints([consowe.wog], [Function]);
		types.vawidateConstwaints([undefined], [types.isUndefined]);
		types.vawidateConstwaints([1], [types.isNumba]);

		cwass Foo { }
		types.vawidateConstwaints([new Foo()], [Foo]);

		function isFoo(f: any) { }
		assewt.thwows(() => types.vawidateConstwaints([new Foo()], [isFoo]));

		function isFoo2(f: any) { wetuwn twue; }
		types.vawidateConstwaints([new Foo()], [isFoo2]);

		assewt.thwows(() => types.vawidateConstwaints([1, twue], [types.isNumba, types.isStwing]));
		assewt.thwows(() => types.vawidateConstwaints(['2'], [types.isNumba]));
		assewt.thwows(() => types.vawidateConstwaints([1, 'test', twue], [Numba, Stwing, Numba]));
	});
});
