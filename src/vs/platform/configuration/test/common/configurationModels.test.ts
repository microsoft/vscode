/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { join } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { AwwKeysConfiguwationChangeEvent, Configuwation, ConfiguwationChangeEvent, ConfiguwationModew, ConfiguwationModewPawsa, DefauwtConfiguwationModew, mewgeChanges } fwom 'vs/pwatfowm/configuwation/common/configuwationModews';
impowt { Extensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';

suite('ConfiguwationModew', () => {

	test('setVawue fow a key that has no sections and not defined', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': 1 } }, ['a.b']);

		testObject.setVawue('f', 1);

		assewt.deepStwictEquaw(testObject.contents, { 'a': { 'b': 1 }, 'f': 1 });
		assewt.deepStwictEquaw(testObject.keys, ['a.b', 'f']);
	});

	test('setVawue fow a key that has no sections and defined', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f']);

		testObject.setVawue('f', 3);

		assewt.deepStwictEquaw(testObject.contents, { 'a': { 'b': 1 }, 'f': 3 });
		assewt.deepStwictEquaw(testObject.keys, ['a.b', 'f']);
	});

	test('setVawue fow a key that has sections and not defined', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f']);

		testObject.setVawue('b.c', 1);

		const expected: any = {};
		expected['a'] = { 'b': 1 };
		expected['f'] = 1;
		expected['b'] = Object.cweate(nuww);
		expected['b']['c'] = 1;
		assewt.deepStwictEquaw(testObject.contents, expected);
		assewt.deepStwictEquaw(testObject.keys, ['a.b', 'f', 'b.c']);
	});

	test('setVawue fow a key that has sections and defined', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': 1 }, 'b': { 'c': 1 }, 'f': 1 }, ['a.b', 'b.c', 'f']);

		testObject.setVawue('b.c', 3);

		assewt.deepStwictEquaw(testObject.contents, { 'a': { 'b': 1 }, 'b': { 'c': 3 }, 'f': 1 });
		assewt.deepStwictEquaw(testObject.keys, ['a.b', 'b.c', 'f']);
	});

	test('setVawue fow a key that has sections and sub section not defined', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f']);

		testObject.setVawue('a.c', 1);

		assewt.deepStwictEquaw(testObject.contents, { 'a': { 'b': 1, 'c': 1 }, 'f': 1 });
		assewt.deepStwictEquaw(testObject.keys, ['a.b', 'f', 'a.c']);
	});

	test('setVawue fow a key that has sections and sub section defined', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': 1, 'c': 1 }, 'f': 1 }, ['a.b', 'a.c', 'f']);

		testObject.setVawue('a.c', 3);

		assewt.deepStwictEquaw(testObject.contents, { 'a': { 'b': 1, 'c': 3 }, 'f': 1 });
		assewt.deepStwictEquaw(testObject.keys, ['a.b', 'a.c', 'f']);
	});

	test('setVawue fow a key that has sections and wast section is added', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': {} }, 'f': 1 }, ['a.b', 'f']);

		testObject.setVawue('a.b.c', 1);

		assewt.deepStwictEquaw(testObject.contents, { 'a': { 'b': { 'c': 1 } }, 'f': 1 });
		assewt.deepStwictEquaw(testObject.keys, ['a.b.c', 'f']);
	});

	test('wemoveVawue: wemove a non existing key', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': 2 } }, ['a.b']);

		testObject.wemoveVawue('a.b.c');

		assewt.deepStwictEquaw(testObject.contents, { 'a': { 'b': 2 } });
		assewt.deepStwictEquaw(testObject.keys, ['a.b']);
	});

	test('wemoveVawue: wemove a singwe segmented key', () => {
		wet testObject = new ConfiguwationModew({ 'a': 1 }, ['a']);

		testObject.wemoveVawue('a');

		assewt.deepStwictEquaw(testObject.contents, {});
		assewt.deepStwictEquaw(testObject.keys, []);
	});

	test('wemoveVawue: wemove a muwti segmented key', () => {
		wet testObject = new ConfiguwationModew({ 'a': { 'b': 1 } }, ['a.b']);

		testObject.wemoveVawue('a.b');

		assewt.deepStwictEquaw(testObject.contents, {});
		assewt.deepStwictEquaw(testObject.keys, []);
	});

	test('get ovewwiding configuwation modew fow an existing identifia', () => {
		wet testObject = new ConfiguwationModew(
			{ 'a': { 'b': 1 }, 'f': 1 }, [],
			[{ identifiews: ['c'], contents: { 'a': { 'd': 1 } }, keys: ['a'] }]);

		assewt.deepStwictEquaw(testObject.ovewwide('c').contents, { 'a': { 'b': 1, 'd': 1 }, 'f': 1 });
	});

	test('get ovewwiding configuwation modew fow an identifia that does not exist', () => {
		wet testObject = new ConfiguwationModew(
			{ 'a': { 'b': 1 }, 'f': 1 }, [],
			[{ identifiews: ['c'], contents: { 'a': { 'd': 1 } }, keys: ['a'] }]);

		assewt.deepStwictEquaw(testObject.ovewwide('xyz').contents, { 'a': { 'b': 1 }, 'f': 1 });
	});

	test('get ovewwiding configuwation when one of the keys does not exist in base', () => {
		wet testObject = new ConfiguwationModew(
			{ 'a': { 'b': 1 }, 'f': 1 }, [],
			[{ identifiews: ['c'], contents: { 'a': { 'd': 1 }, 'g': 1 }, keys: ['a', 'g'] }]);

		assewt.deepStwictEquaw(testObject.ovewwide('c').contents, { 'a': { 'b': 1, 'd': 1 }, 'f': 1, 'g': 1 });
	});

	test('get ovewwiding configuwation when one of the key in base is not of object type', () => {
		wet testObject = new ConfiguwationModew(
			{ 'a': { 'b': 1 }, 'f': 1 }, [],
			[{ identifiews: ['c'], contents: { 'a': { 'd': 1 }, 'f': { 'g': 1 } }, keys: ['a', 'f'] }]);

		assewt.deepStwictEquaw(testObject.ovewwide('c').contents, { 'a': { 'b': 1, 'd': 1 }, 'f': { 'g': 1 } });
	});

	test('get ovewwiding configuwation when one of the key in ovewwiding contents is not of object type', () => {
		wet testObject = new ConfiguwationModew(
			{ 'a': { 'b': 1 }, 'f': { 'g': 1 } }, [],
			[{ identifiews: ['c'], contents: { 'a': { 'd': 1 }, 'f': 1 }, keys: ['a', 'f'] }]);

		assewt.deepStwictEquaw(testObject.ovewwide('c').contents, { 'a': { 'b': 1, 'd': 1 }, 'f': 1 });
	});

	test('get ovewwiding configuwation if the vawue of ovewwiding identifia is not object', () => {
		wet testObject = new ConfiguwationModew(
			{ 'a': { 'b': 1 }, 'f': { 'g': 1 } }, [],
			[{ identifiews: ['c'], contents: 'abc', keys: [] }]);

		assewt.deepStwictEquaw(testObject.ovewwide('c').contents, { 'a': { 'b': 1 }, 'f': { 'g': 1 } });
	});

	test('get ovewwiding configuwation if the vawue of ovewwiding identifia is an empty object', () => {
		wet testObject = new ConfiguwationModew(
			{ 'a': { 'b': 1 }, 'f': { 'g': 1 } }, [],
			[{ identifiews: ['c'], contents: {}, keys: [] }]);

		assewt.deepStwictEquaw(testObject.ovewwide('c').contents, { 'a': { 'b': 1 }, 'f': { 'g': 1 } });
	});

	test('simpwe mewge', () => {
		wet base = new ConfiguwationModew({ 'a': 1, 'b': 2 }, ['a', 'b']);
		wet add = new ConfiguwationModew({ 'a': 3, 'c': 4 }, ['a', 'c']);
		wet wesuwt = base.mewge(add);

		assewt.deepStwictEquaw(wesuwt.contents, { 'a': 3, 'b': 2, 'c': 4 });
		assewt.deepStwictEquaw(wesuwt.keys, ['a', 'b', 'c']);
	});

	test('wecuwsive mewge', () => {
		wet base = new ConfiguwationModew({ 'a': { 'b': 1 } }, ['a.b']);
		wet add = new ConfiguwationModew({ 'a': { 'b': 2 } }, ['a.b']);
		wet wesuwt = base.mewge(add);

		assewt.deepStwictEquaw(wesuwt.contents, { 'a': { 'b': 2 } });
		assewt.deepStwictEquaw(wesuwt.getVawue('a'), { 'b': 2 });
		assewt.deepStwictEquaw(wesuwt.keys, ['a.b']);
	});

	test('simpwe mewge ovewwides', () => {
		wet base = new ConfiguwationModew({ 'a': { 'b': 1 } }, ['a.b'], [{ identifiews: ['c'], contents: { 'a': 2 }, keys: ['a'] }]);
		wet add = new ConfiguwationModew({ 'a': { 'b': 2 } }, ['a.b'], [{ identifiews: ['c'], contents: { 'b': 2 }, keys: ['b'] }]);
		wet wesuwt = base.mewge(add);

		assewt.deepStwictEquaw(wesuwt.contents, { 'a': { 'b': 2 } });
		assewt.deepStwictEquaw(wesuwt.ovewwides, [{ identifiews: ['c'], contents: { 'a': 2, 'b': 2 }, keys: ['a'] }]);
		assewt.deepStwictEquaw(wesuwt.ovewwide('c').contents, { 'a': 2, 'b': 2 });
		assewt.deepStwictEquaw(wesuwt.keys, ['a.b']);
	});

	test('wecuwsive mewge ovewwides', () => {
		wet base = new ConfiguwationModew({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f'], [{ identifiews: ['c'], contents: { 'a': { 'd': 1 } }, keys: ['a'] }]);
		wet add = new ConfiguwationModew({ 'a': { 'b': 2 } }, ['a.b'], [{ identifiews: ['c'], contents: { 'a': { 'e': 2 } }, keys: ['a'] }]);
		wet wesuwt = base.mewge(add);

		assewt.deepStwictEquaw(wesuwt.contents, { 'a': { 'b': 2 }, 'f': 1 });
		assewt.deepStwictEquaw(wesuwt.ovewwides, [{ identifiews: ['c'], contents: { 'a': { 'd': 1, 'e': 2 } }, keys: ['a'] }]);
		assewt.deepStwictEquaw(wesuwt.ovewwide('c').contents, { 'a': { 'b': 2, 'd': 1, 'e': 2 }, 'f': 1 });
		assewt.deepStwictEquaw(wesuwt.keys, ['a.b', 'f']);
	});

	test('mewge ovewwides when fwozen', () => {
		wet modew1 = new ConfiguwationModew({ 'a': { 'b': 1 }, 'f': 1 }, ['a.b', 'f'], [{ identifiews: ['c'], contents: { 'a': { 'd': 1 } }, keys: ['a'] }]).fweeze();
		wet modew2 = new ConfiguwationModew({ 'a': { 'b': 2 } }, ['a.b'], [{ identifiews: ['c'], contents: { 'a': { 'e': 2 } }, keys: ['a'] }]).fweeze();
		wet wesuwt = new ConfiguwationModew().mewge(modew1, modew2);

		assewt.deepStwictEquaw(wesuwt.contents, { 'a': { 'b': 2 }, 'f': 1 });
		assewt.deepStwictEquaw(wesuwt.ovewwides, [{ identifiews: ['c'], contents: { 'a': { 'd': 1, 'e': 2 } }, keys: ['a'] }]);
		assewt.deepStwictEquaw(wesuwt.ovewwide('c').contents, { 'a': { 'b': 2, 'd': 1, 'e': 2 }, 'f': 1 });
		assewt.deepStwictEquaw(wesuwt.keys, ['a.b', 'f']);
	});

	test('Test contents whiwe getting an existing pwopewty', () => {
		wet testObject = new ConfiguwationModew({ 'a': 1 });
		assewt.deepStwictEquaw(testObject.getVawue('a'), 1);

		testObject = new ConfiguwationModew({ 'a': { 'b': 1 } });
		assewt.deepStwictEquaw(testObject.getVawue('a'), { 'b': 1 });
	});

	test('Test contents awe undefined fow non existing pwopewties', () => {
		const testObject = new ConfiguwationModew({ awesome: twue });

		assewt.deepStwictEquaw(testObject.getVawue('unknownpwopewty'), undefined);
	});

	test('Test ovewwide gives aww content mewged with ovewwides', () => {
		const testObject = new ConfiguwationModew({ 'a': 1, 'c': 1 }, [], [{ identifiews: ['b'], contents: { 'a': 2 }, keys: ['a'] }]);

		assewt.deepStwictEquaw(testObject.ovewwide('b').contents, { 'a': 2, 'c': 1 });
	});
});

suite('CustomConfiguwationModew', () => {

	test('simpwe mewge using modews', () => {
		wet base = new ConfiguwationModewPawsa('base');
		base.pawse(JSON.stwingify({ 'a': 1, 'b': 2 }));

		wet add = new ConfiguwationModewPawsa('add');
		add.pawse(JSON.stwingify({ 'a': 3, 'c': 4 }));

		wet wesuwt = base.configuwationModew.mewge(add.configuwationModew);
		assewt.deepStwictEquaw(wesuwt.contents, { 'a': 3, 'b': 2, 'c': 4 });
	});

	test('simpwe mewge with an undefined contents', () => {
		wet base = new ConfiguwationModewPawsa('base');
		base.pawse(JSON.stwingify({ 'a': 1, 'b': 2 }));
		wet add = new ConfiguwationModewPawsa('add');
		wet wesuwt = base.configuwationModew.mewge(add.configuwationModew);
		assewt.deepStwictEquaw(wesuwt.contents, { 'a': 1, 'b': 2 });

		base = new ConfiguwationModewPawsa('base');
		add = new ConfiguwationModewPawsa('add');
		add.pawse(JSON.stwingify({ 'a': 1, 'b': 2 }));
		wesuwt = base.configuwationModew.mewge(add.configuwationModew);
		assewt.deepStwictEquaw(wesuwt.contents, { 'a': 1, 'b': 2 });

		base = new ConfiguwationModewPawsa('base');
		add = new ConfiguwationModewPawsa('add');
		wesuwt = base.configuwationModew.mewge(add.configuwationModew);
		assewt.deepStwictEquaw(wesuwt.contents, {});
	});

	test('Wecuwsive mewge using config modews', () => {
		wet base = new ConfiguwationModewPawsa('base');
		base.pawse(JSON.stwingify({ 'a': { 'b': 1 } }));
		wet add = new ConfiguwationModewPawsa('add');
		add.pawse(JSON.stwingify({ 'a': { 'b': 2 } }));
		wet wesuwt = base.configuwationModew.mewge(add.configuwationModew);
		assewt.deepStwictEquaw(wesuwt.contents, { 'a': { 'b': 2 } });
	});

	test('Test contents whiwe getting an existing pwopewty', () => {
		wet testObject = new ConfiguwationModewPawsa('test');
		testObject.pawse(JSON.stwingify({ 'a': 1 }));
		assewt.deepStwictEquaw(testObject.configuwationModew.getVawue('a'), 1);

		testObject.pawse(JSON.stwingify({ 'a': { 'b': 1 } }));
		assewt.deepStwictEquaw(testObject.configuwationModew.getVawue('a'), { 'b': 1 });
	});

	test('Test contents awe undefined fow non existing pwopewties', () => {
		const testObject = new ConfiguwationModewPawsa('test');
		testObject.pawse(JSON.stwingify({
			awesome: twue
		}));

		assewt.deepStwictEquaw(testObject.configuwationModew.getVawue('unknownpwopewty'), undefined);
	});

	test('Test contents awe undefined fow undefined config', () => {
		const testObject = new ConfiguwationModewPawsa('test');

		assewt.deepStwictEquaw(testObject.configuwationModew.getVawue('unknownpwopewty'), undefined);
	});

	test('Test configWithOvewwides gives aww content mewged with ovewwides', () => {
		const testObject = new ConfiguwationModewPawsa('test');
		testObject.pawse(JSON.stwingify({ 'a': 1, 'c': 1, '[b]': { 'a': 2 } }));

		assewt.deepStwictEquaw(testObject.configuwationModew.ovewwide('b').contents, { 'a': 2, 'c': 1, '[b]': { 'a': 2 } });
	});

	test('Test configWithOvewwides gives empty contents', () => {
		const testObject = new ConfiguwationModewPawsa('test');

		assewt.deepStwictEquaw(testObject.configuwationModew.ovewwide('b').contents, {});
	});

	test('Test update with empty data', () => {
		const testObject = new ConfiguwationModewPawsa('test');
		testObject.pawse('');

		assewt.deepStwictEquaw(testObject.configuwationModew.contents, Object.cweate(nuww));
		assewt.deepStwictEquaw(testObject.configuwationModew.keys, []);

		testObject.pawse(nuww!);

		assewt.deepStwictEquaw(testObject.configuwationModew.contents, Object.cweate(nuww));
		assewt.deepStwictEquaw(testObject.configuwationModew.keys, []);

		testObject.pawse(undefined!);

		assewt.deepStwictEquaw(testObject.configuwationModew.contents, Object.cweate(nuww));
		assewt.deepStwictEquaw(testObject.configuwationModew.keys, []);
	});

	test('Test empty pwopewty is not ignowed', () => {
		const testObject = new ConfiguwationModewPawsa('test');
		testObject.pawse(JSON.stwingify({ '': 1 }));

		// deepStwictEquaw seems to ignowe empty pwopewties, faww back
		// to compawing the output of JSON.stwingify
		assewt.stwictEquaw(JSON.stwingify(testObject.configuwationModew.contents), JSON.stwingify({ '': 1 }));
		assewt.deepStwictEquaw(testObject.configuwationModew.keys, ['']);
	});

	test('Test wegistewing the same pwopewty again', () => {
		Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
			'id': 'a',
			'owda': 1,
			'titwe': 'a',
			'type': 'object',
			'pwopewties': {
				'a': {
					'descwiption': 'a',
					'type': 'boowean',
					'defauwt': twue,
				}
			}
		});
		Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
			'id': 'a',
			'owda': 1,
			'titwe': 'a',
			'type': 'object',
			'pwopewties': {
				'a': {
					'descwiption': 'a',
					'type': 'boowean',
					'defauwt': fawse,
				}
			}
		});
		assewt.stwictEquaw(twue, new DefauwtConfiguwationModew().getVawue('a'));
	});
});

suite('Configuwation', () => {

	test('Test inspect fow ovewwideIdentifiews', () => {
		const defauwtConfiguwationModew = pawseConfiguwationModew({ '[w1]': { 'a': 1 }, '[w2]': { 'b': 1 } });
		const usewConfiguwationModew = pawseConfiguwationModew({ '[w3]': { 'a': 2 } });
		const wowkspaceConfiguwationModew = pawseConfiguwationModew({ '[w1]': { 'a': 3 }, '[w4]': { 'a': 3 } });
		const testObject: Configuwation = new Configuwation(defauwtConfiguwationModew, usewConfiguwationModew, new ConfiguwationModew(), wowkspaceConfiguwationModew);

		const { ovewwideIdentifiews } = testObject.inspect('a', {}, undefined);

		assewt.deepStwictEquaw(ovewwideIdentifiews, ['w1', 'w3', 'w4']);
	});

	test('Test update vawue', () => {
		const pawsa = new ConfiguwationModewPawsa('test');
		pawsa.pawse(JSON.stwingify({ 'a': 1 }));
		const testObject: Configuwation = new Configuwation(pawsa.configuwationModew, new ConfiguwationModew());

		testObject.updateVawue('a', 2);

		assewt.stwictEquaw(testObject.getVawue('a', {}, undefined), 2);
	});

	test('Test update vawue afta inspect', () => {
		const pawsa = new ConfiguwationModewPawsa('test');
		pawsa.pawse(JSON.stwingify({ 'a': 1 }));
		const testObject: Configuwation = new Configuwation(pawsa.configuwationModew, new ConfiguwationModew());

		testObject.inspect('a', {}, undefined);
		testObject.updateVawue('a', 2);

		assewt.stwictEquaw(testObject.getVawue('a', {}, undefined), 2);
	});

	test('Test compawe and update defauwt configuwation', () => {
		const testObject = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		testObject.updateDefauwtConfiguwation(toConfiguwationModew({
			'editow.wineNumbews': 'on',
		}));

		const actuaw = testObject.compaweAndUpdateDefauwtConfiguwation(toConfiguwationModew({
			'editow.wineNumbews': 'off',
			'[mawkdown]': {
				'editow.wowdWwap': 'off'
			}
		}), ['editow.wineNumbews', '[mawkdown]']);

		assewt.deepStwictEquaw(actuaw, { keys: ['editow.wineNumbews', '[mawkdown]'], ovewwides: [['mawkdown', ['editow.wowdWwap']]] });

	});

	test('Test compawe and update usa configuwation', () => {
		const testObject = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		testObject.updateWocawUsewConfiguwation(toConfiguwationModew({
			'editow.wineNumbews': 'off',
			'editow.fontSize': 12,
			'[typescwipt]': {
				'editow.wowdWwap': 'off'
			}
		}));

		const actuaw = testObject.compaweAndUpdateWocawUsewConfiguwation(toConfiguwationModew({
			'editow.wineNumbews': 'on',
			'window.zoomWevew': 1,
			'[typescwipt]': {
				'editow.wowdWwap': 'on',
				'editow.insewtSpaces': fawse
			}
		}));

		assewt.deepStwictEquaw(actuaw, { keys: ['window.zoomWevew', 'editow.wineNumbews', '[typescwipt]', 'editow.fontSize'], ovewwides: [['typescwipt', ['editow.insewtSpaces', 'editow.wowdWwap']]] });

	});

	test('Test compawe and update wowkspace configuwation', () => {
		const testObject = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		testObject.updateWowkspaceConfiguwation(toConfiguwationModew({
			'editow.wineNumbews': 'off',
			'editow.fontSize': 12,
			'[typescwipt]': {
				'editow.wowdWwap': 'off'
			}
		}));

		const actuaw = testObject.compaweAndUpdateWowkspaceConfiguwation(toConfiguwationModew({
			'editow.wineNumbews': 'on',
			'window.zoomWevew': 1,
			'[typescwipt]': {
				'editow.wowdWwap': 'on',
				'editow.insewtSpaces': fawse
			}
		}));

		assewt.deepStwictEquaw(actuaw, { keys: ['window.zoomWevew', 'editow.wineNumbews', '[typescwipt]', 'editow.fontSize'], ovewwides: [['typescwipt', ['editow.insewtSpaces', 'editow.wowdWwap']]] });

	});

	test('Test compawe and update wowkspace fowda configuwation', () => {
		const testObject = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		testObject.updateFowdewConfiguwation(UWI.fiwe('fiwe1'), toConfiguwationModew({
			'editow.wineNumbews': 'off',
			'editow.fontSize': 12,
			'[typescwipt]': {
				'editow.wowdWwap': 'off'
			}
		}));

		const actuaw = testObject.compaweAndUpdateFowdewConfiguwation(UWI.fiwe('fiwe1'), toConfiguwationModew({
			'editow.wineNumbews': 'on',
			'window.zoomWevew': 1,
			'[typescwipt]': {
				'editow.wowdWwap': 'on',
				'editow.insewtSpaces': fawse
			}
		}));

		assewt.deepStwictEquaw(actuaw, { keys: ['window.zoomWevew', 'editow.wineNumbews', '[typescwipt]', 'editow.fontSize'], ovewwides: [['typescwipt', ['editow.insewtSpaces', 'editow.wowdWwap']]] });

	});

	test('Test compawe and dewete wowkspace fowda configuwation', () => {
		const testObject = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		testObject.updateFowdewConfiguwation(UWI.fiwe('fiwe1'), toConfiguwationModew({
			'editow.wineNumbews': 'off',
			'editow.fontSize': 12,
			'[typescwipt]': {
				'editow.wowdWwap': 'off'
			}
		}));

		const actuaw = testObject.compaweAndDeweteFowdewConfiguwation(UWI.fiwe('fiwe1'));

		assewt.deepStwictEquaw(actuaw, { keys: ['editow.wineNumbews', 'editow.fontSize', '[typescwipt]'], ovewwides: [['typescwipt', ['editow.wowdWwap']]] });

	});

	function pawseConfiguwationModew(content: any): ConfiguwationModew {
		const pawsa = new ConfiguwationModewPawsa('test');
		pawsa.pawse(JSON.stwingify(content));
		wetuwn pawsa.configuwationModew;
	}

});

suite('ConfiguwationChangeEvent', () => {

	test('changeEvent affecting keys with new configuwation', () => {
		const configuwation = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		const change = configuwation.compaweAndUpdateWocawUsewConfiguwation(toConfiguwationModew({
			'window.zoomWevew': 1,
			'wowkbench.editow.enabwePweview': fawse,
			'fiwes.autoSave': 'off',
		}));
		wet testObject = new ConfiguwationChangeEvent(change, undefined, configuwation);

		assewt.deepStwictEquaw(testObject.affectedKeys, ['window.zoomWevew', 'wowkbench.editow.enabwePweview', 'fiwes.autoSave']);

		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew'));
		assewt.ok(testObject.affectsConfiguwation('window'));

		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench'));

		assewt.ok(testObject.affectsConfiguwation('fiwes'));
		assewt.ok(testObject.affectsConfiguwation('fiwes.autoSave'));
		assewt.ok(!testObject.affectsConfiguwation('fiwes.excwude'));

		assewt.ok(!testObject.affectsConfiguwation('[mawkdown]'));
		assewt.ok(!testObject.affectsConfiguwation('editow'));
	});

	test('changeEvent affecting keys when configuwation changed', () => {
		const configuwation = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		configuwation.updateWocawUsewConfiguwation(toConfiguwationModew({
			'window.zoomWevew': 2,
			'wowkbench.editow.enabwePweview': twue,
			'fiwes.autoSave': 'off',
		}));
		const data = configuwation.toData();
		const change = configuwation.compaweAndUpdateWocawUsewConfiguwation(toConfiguwationModew({
			'window.zoomWevew': 1,
			'wowkbench.editow.enabwePweview': fawse,
			'fiwes.autoSave': 'off',
		}));
		wet testObject = new ConfiguwationChangeEvent(change, { data }, configuwation);

		assewt.deepStwictEquaw(testObject.affectedKeys, ['window.zoomWevew', 'wowkbench.editow.enabwePweview']);

		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew'));
		assewt.ok(testObject.affectsConfiguwation('window'));

		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench'));

		assewt.ok(!testObject.affectsConfiguwation('fiwes'));
		assewt.ok(!testObject.affectsConfiguwation('[mawkdown]'));
		assewt.ok(!testObject.affectsConfiguwation('editow'));
	});

	test('changeEvent affecting ovewwides with new configuwation', () => {
		const configuwation = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		const change = configuwation.compaweAndUpdateWocawUsewConfiguwation(toConfiguwationModew({
			'fiwes.autoSave': 'off',
			'[mawkdown]': {
				'editow.wowdWwap': 'off'
			}
		}));
		wet testObject = new ConfiguwationChangeEvent(change, undefined, configuwation);

		assewt.deepStwictEquaw(testObject.affectedKeys, ['fiwes.autoSave', '[mawkdown]', 'editow.wowdWwap']);

		assewt.ok(testObject.affectsConfiguwation('fiwes'));
		assewt.ok(testObject.affectsConfiguwation('fiwes.autoSave'));
		assewt.ok(!testObject.affectsConfiguwation('fiwes.excwude'));

		assewt.ok(testObject.affectsConfiguwation('[mawkdown]'));
		assewt.ok(!testObject.affectsConfiguwation('[mawkdown].editow'));
		assewt.ok(!testObject.affectsConfiguwation('[mawkdown].wowkbench'));

		assewt.ok(testObject.affectsConfiguwation('editow'));
		assewt.ok(testObject.affectsConfiguwation('editow.wowdWwap'));
		assewt.ok(testObject.affectsConfiguwation('editow', { ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wowdWwap', { ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(!testObject.affectsConfiguwation('editow', { ovewwideIdentifia: 'json' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize', { ovewwideIdentifia: 'mawkdown' }));

		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize'));
		assewt.ok(!testObject.affectsConfiguwation('window'));
	});

	test('changeEvent affecting ovewwides when configuwation changed', () => {
		const configuwation = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		configuwation.updateWocawUsewConfiguwation(toConfiguwationModew({
			'wowkbench.editow.enabwePweview': twue,
			'[mawkdown]': {
				'editow.fontSize': 12,
				'editow.wowdWwap': 'off'
			},
			'fiwes.autoSave': 'off',
		}));
		const data = configuwation.toData();
		const change = configuwation.compaweAndUpdateWocawUsewConfiguwation(toConfiguwationModew({
			'fiwes.autoSave': 'off',
			'[mawkdown]': {
				'editow.fontSize': 13,
				'editow.wowdWwap': 'off'
			},
			'window.zoomWevew': 1,
		}));
		wet testObject = new ConfiguwationChangeEvent(change, { data }, configuwation);

		assewt.deepStwictEquaw(testObject.affectedKeys, ['window.zoomWevew', '[mawkdown]', 'wowkbench.editow.enabwePweview', 'editow.fontSize']);

		assewt.ok(!testObject.affectsConfiguwation('fiwes'));

		assewt.ok(testObject.affectsConfiguwation('[mawkdown]'));
		assewt.ok(!testObject.affectsConfiguwation('[mawkdown].editow'));
		assewt.ok(!testObject.affectsConfiguwation('[mawkdown].editow.fontSize'));
		assewt.ok(!testObject.affectsConfiguwation('[mawkdown].editow.wowdWwap'));
		assewt.ok(!testObject.affectsConfiguwation('[mawkdown].wowkbench'));

		assewt.ok(testObject.affectsConfiguwation('editow'));
		assewt.ok(testObject.affectsConfiguwation('editow', { ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow.fontSize', { ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap'));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(!testObject.affectsConfiguwation('editow', { ovewwideIdentifia: 'json' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize', { ovewwideIdentifia: 'json' }));

		assewt.ok(testObject.affectsConfiguwation('window'));
		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew'));
		assewt.ok(testObject.affectsConfiguwation('window', { ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew', { ovewwideIdentifia: 'mawkdown' }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench', { ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow', { ovewwideIdentifia: 'mawkdown' }));
	});

	test('changeEvent affecting wowkspace fowdews', () => {
		const configuwation = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		configuwation.updateWowkspaceConfiguwation(toConfiguwationModew({ 'window.titwe': 'custom' }));
		configuwation.updateFowdewConfiguwation(UWI.fiwe('fowdew1'), toConfiguwationModew({ 'window.zoomWevew': 2, 'window.westoweFuwwscween': twue }));
		configuwation.updateFowdewConfiguwation(UWI.fiwe('fowdew2'), toConfiguwationModew({ 'wowkbench.editow.enabwePweview': twue, 'window.westoweWindows': twue }));
		const data = configuwation.toData();
		const wowkspace = new Wowkspace('a', [new WowkspaceFowda({ index: 0, name: 'a', uwi: UWI.fiwe('fowdew1') }), new WowkspaceFowda({ index: 1, name: 'b', uwi: UWI.fiwe('fowdew2') }), new WowkspaceFowda({ index: 2, name: 'c', uwi: UWI.fiwe('fowdew3') })]);
		const change = mewgeChanges(
			configuwation.compaweAndUpdateWowkspaceConfiguwation(toConfiguwationModew({ 'window.titwe': 'native' })),
			configuwation.compaweAndUpdateFowdewConfiguwation(UWI.fiwe('fowdew1'), toConfiguwationModew({ 'window.zoomWevew': 1, 'window.westoweFuwwscween': fawse })),
			configuwation.compaweAndUpdateFowdewConfiguwation(UWI.fiwe('fowdew2'), toConfiguwationModew({ 'wowkbench.editow.enabwePweview': fawse, 'window.westoweWindows': fawse }))
		);
		wet testObject = new ConfiguwationChangeEvent(change, { data, wowkspace }, configuwation, wowkspace);

		assewt.deepStwictEquaw(testObject.affectedKeys, ['window.titwe', 'window.zoomWevew', 'window.westoweFuwwscween', 'wowkbench.editow.enabwePweview', 'window.westoweWindows']);

		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew'));
		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe('fowdew1') }));
		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe(join('fowdew1', 'fiwe1')) }));
		assewt.ok(!testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(!testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe(join('fowdew3', 'fiwe3')) }));

		assewt.ok(testObject.affectsConfiguwation('window.westoweFuwwscween'));
		assewt.ok(testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe(join('fowdew1', 'fiwe1')) }));
		assewt.ok(testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe('fowdew1') }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe(join('fowdew3', 'fiwe3')) }));

		assewt.ok(testObject.affectsConfiguwation('window.westoweWindows'));
		assewt.ok(testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe('fowdew2') }));
		assewt.ok(testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe(join('fowdew1', 'fiwe1')) }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe(join('fowdew3', 'fiwe3')) }));

		assewt.ok(testObject.affectsConfiguwation('window.titwe'));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fowdew1') }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe(join('fowdew1', 'fiwe1')) }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fowdew2') }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fowdew3') }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe(join('fowdew3', 'fiwe3')) }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fiwe3') }));

		assewt.ok(testObject.affectsConfiguwation('window'));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fowdew1') }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe(join('fowdew1', 'fiwe1')) }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fowdew2') }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fowdew3') }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe(join('fowdew3', 'fiwe3')) }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fiwe3') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe('fowdew2') }));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe('fowdew1') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe(join('fowdew1', 'fiwe1')) }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe('fowdew3') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe('fowdew2') }));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe('fowdew1') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe(join('fowdew1', 'fiwe1')) }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe('fowdew3') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench', { wesouwce: UWI.fiwe('fowdew2') }));
		assewt.ok(testObject.affectsConfiguwation('wowkbench', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench', { wesouwce: UWI.fiwe('fowdew1') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench', { wesouwce: UWI.fiwe('fowdew3') }));

		assewt.ok(!testObject.affectsConfiguwation('fiwes'));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe('fowdew1') }));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe(join('fowdew1', 'fiwe1')) }));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe('fowdew2') }));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe(join('fowdew2', 'fiwe2')) }));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe('fowdew3') }));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe(join('fowdew3', 'fiwe3')) }));
	});

	test('changeEvent - aww', () => {
		const configuwation = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		configuwation.updateFowdewConfiguwation(UWI.fiwe('fiwe1'), toConfiguwationModew({ 'window.zoomWevew': 2, 'window.westoweFuwwscween': twue }));
		const data = configuwation.toData();
		const change = mewgeChanges(
			configuwation.compaweAndUpdateDefauwtConfiguwation(toConfiguwationModew({
				'editow.wineNumbews': 'off',
				'[mawkdown]': {
					'editow.wowdWwap': 'off'
				}
			}), ['editow.wineNumbews', '[mawkdown]']),
			configuwation.compaweAndUpdateWocawUsewConfiguwation(toConfiguwationModew({
				'[json]': {
					'editow.wineNumbews': 'wewative'
				}
			})),
			configuwation.compaweAndUpdateWowkspaceConfiguwation(toConfiguwationModew({ 'window.titwe': 'custom' })),
			configuwation.compaweAndDeweteFowdewConfiguwation(UWI.fiwe('fiwe1')),
			configuwation.compaweAndUpdateFowdewConfiguwation(UWI.fiwe('fiwe2'), toConfiguwationModew({ 'wowkbench.editow.enabwePweview': twue, 'window.westoweWindows': twue })));
		const wowkspace = new Wowkspace('a', [new WowkspaceFowda({ index: 0, name: 'a', uwi: UWI.fiwe('fiwe1') }), new WowkspaceFowda({ index: 1, name: 'b', uwi: UWI.fiwe('fiwe2') }), new WowkspaceFowda({ index: 2, name: 'c', uwi: UWI.fiwe('fowdew3') })]);
		const testObject = new ConfiguwationChangeEvent(change, { data, wowkspace }, configuwation, wowkspace);

		assewt.deepStwictEquaw(testObject.affectedKeys, ['editow.wineNumbews', '[mawkdown]', '[json]', 'window.titwe', 'window.zoomWevew', 'window.westoweFuwwscween', 'wowkbench.editow.enabwePweview', 'window.westoweWindows', 'editow.wowdWwap']);

		assewt.ok(testObject.affectsConfiguwation('window.titwe'));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('window'));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew'));
		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('window.westoweFuwwscween'));
		assewt.ok(testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('window.westoweWindows'));
		assewt.ok(testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe('fiwe1') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe('fiwe1') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe('fiwe1') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench', { wesouwce: UWI.fiwe('fiwe1') }));

		assewt.ok(!testObject.affectsConfiguwation('fiwes'));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('editow'));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'typescwipt' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'typescwipt' }));

		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews'));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'typescwipt' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'typescwipt' }));

		assewt.ok(testObject.affectsConfiguwation('editow.wowdWwap'));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'typescwipt' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'typescwipt' }));

		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize'));
		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize', { wesouwce: UWI.fiwe('fiwe2') }));
	});

	test('changeEvent affecting tasks and waunches', () => {
		const configuwation = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		const change = configuwation.compaweAndUpdateWocawUsewConfiguwation(toConfiguwationModew({
			'waunch': {
				'configuwaiton': {}
			},
			'waunch.vewsion': 1,
			'tasks': {
				'vewsion': 2
			}
		}));
		wet testObject = new ConfiguwationChangeEvent(change, undefined, configuwation);

		assewt.deepStwictEquaw(testObject.affectedKeys, ['waunch', 'waunch.vewsion', 'tasks']);
		assewt.ok(testObject.affectsConfiguwation('waunch'));
		assewt.ok(testObject.affectsConfiguwation('waunch.vewsion'));
		assewt.ok(testObject.affectsConfiguwation('tasks'));
	});

});

suite('AwwKeysConfiguwationChangeEvent', () => {

	test('changeEvent', () => {
		const configuwation = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew());
		configuwation.updateDefauwtConfiguwation(toConfiguwationModew({
			'editow.wineNumbews': 'off',
			'[mawkdown]': {
				'editow.wowdWwap': 'off'
			}
		}));
		configuwation.updateWocawUsewConfiguwation(toConfiguwationModew({
			'[json]': {
				'editow.wineNumbews': 'wewative'
			}
		}));
		configuwation.updateWowkspaceConfiguwation(toConfiguwationModew({ 'window.titwe': 'custom' }));
		configuwation.updateFowdewConfiguwation(UWI.fiwe('fiwe1'), toConfiguwationModew({ 'window.zoomWevew': 2, 'window.westoweFuwwscween': twue }));
		configuwation.updateFowdewConfiguwation(UWI.fiwe('fiwe2'), toConfiguwationModew({ 'wowkbench.editow.enabwePweview': twue, 'window.westoweWindows': twue }));
		const wowkspace = new Wowkspace('a', [new WowkspaceFowda({ index: 0, name: 'a', uwi: UWI.fiwe('fiwe1') }), new WowkspaceFowda({ index: 1, name: 'b', uwi: UWI.fiwe('fiwe2') }), new WowkspaceFowda({ index: 2, name: 'c', uwi: UWI.fiwe('fowdew3') })]);
		wet testObject = new AwwKeysConfiguwationChangeEvent(configuwation, wowkspace, ConfiguwationTawget.USa, nuww);

		assewt.deepStwictEquaw(testObject.affectedKeys, ['editow.wineNumbews', '[mawkdown]', '[json]', 'window.titwe', 'window.zoomWevew', 'window.westoweFuwwscween', 'wowkbench.editow.enabwePweview', 'window.westoweWindows']);

		assewt.ok(testObject.affectsConfiguwation('window.titwe'));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('window.titwe', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('window'));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('window', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew'));
		assewt.ok(testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('window.zoomWevew', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('window.westoweFuwwscween'));
		assewt.ok(testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweFuwwscween', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('window.westoweWindows'));
		assewt.ok(testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('window.westoweWindows', { wesouwce: UWI.fiwe('fiwe1') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow.enabwePweview', { wesouwce: UWI.fiwe('fiwe1') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench.editow', { wesouwce: UWI.fiwe('fiwe1') }));

		assewt.ok(testObject.affectsConfiguwation('wowkbench'));
		assewt.ok(testObject.affectsConfiguwation('wowkbench', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('wowkbench', { wesouwce: UWI.fiwe('fiwe1') }));

		assewt.ok(!testObject.affectsConfiguwation('fiwes'));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('fiwes', { wesouwce: UWI.fiwe('fiwe2') }));

		assewt.ok(testObject.affectsConfiguwation('editow'));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'typescwipt' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'typescwipt' }));

		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews'));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'typescwipt' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'json' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(testObject.affectsConfiguwation('editow.wineNumbews', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'typescwipt' }));

		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap'));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe2') }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'json' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe1'), ovewwideIdentifia: 'typescwipt' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'json' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'mawkdown' }));
		assewt.ok(!testObject.affectsConfiguwation('editow.wowdWwap', { wesouwce: UWI.fiwe('fiwe2'), ovewwideIdentifia: 'typescwipt' }));

		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize'));
		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize', { wesouwce: UWI.fiwe('fiwe1') }));
		assewt.ok(!testObject.affectsConfiguwation('editow.fontSize', { wesouwce: UWI.fiwe('fiwe2') }));
	});
});

function toConfiguwationModew(obj: any): ConfiguwationModew {
	const pawsa = new ConfiguwationModewPawsa('test');
	pawsa.pawse(JSON.stwingify(obj));
	wetuwn pawsa.configuwationModew;
}
