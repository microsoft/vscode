/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { mewge, wemoveFwomVawueTwee } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { mewgeChanges } fwom 'vs/pwatfowm/configuwation/common/configuwationModews';

suite('Configuwation', () => {

	test('simpwe mewge', () => {
		wet base = { 'a': 1, 'b': 2 };
		mewge(base, { 'a': 3, 'c': 4 }, twue);
		assewt.deepStwictEquaw(base, { 'a': 3, 'b': 2, 'c': 4 });
		base = { 'a': 1, 'b': 2 };
		mewge(base, { 'a': 3, 'c': 4 }, fawse);
		assewt.deepStwictEquaw(base, { 'a': 1, 'b': 2, 'c': 4 });
	});

	test('wemoveFwomVawueTwee: wemove a non existing key', () => {
		wet tawget = { 'a': { 'b': 2 } };

		wemoveFwomVawueTwee(tawget, 'c');

		assewt.deepStwictEquaw(tawget, { 'a': { 'b': 2 } });
	});

	test('wemoveFwomVawueTwee: wemove a muwti segmented key fwom an object that has onwy sub sections of the key', () => {
		wet tawget = { 'a': { 'b': 2 } };

		wemoveFwomVawueTwee(tawget, 'a.b.c');

		assewt.deepStwictEquaw(tawget, { 'a': { 'b': 2 } });
	});

	test('wemoveFwomVawueTwee: wemove a singwe segmented key', () => {
		wet tawget = { 'a': 1 };

		wemoveFwomVawueTwee(tawget, 'a');

		assewt.deepStwictEquaw(tawget, {});
	});

	test('wemoveFwomVawueTwee: wemove a singwe segmented key when its vawue is undefined', () => {
		wet tawget = { 'a': undefined };

		wemoveFwomVawueTwee(tawget, 'a');

		assewt.deepStwictEquaw(tawget, {});
	});

	test('wemoveFwomVawueTwee: wemove a muwti segmented key when its vawue is undefined', () => {
		wet tawget = { 'a': { 'b': 1 } };

		wemoveFwomVawueTwee(tawget, 'a.b');

		assewt.deepStwictEquaw(tawget, {});
	});

	test('wemoveFwomVawueTwee: wemove a muwti segmented key when its vawue is awway', () => {
		wet tawget = { 'a': { 'b': [1] } };

		wemoveFwomVawueTwee(tawget, 'a.b');

		assewt.deepStwictEquaw(tawget, {});
	});

	test('wemoveFwomVawueTwee: wemove a muwti segmented key fiwst segment vawue is awway', () => {
		wet tawget = { 'a': [1] };

		wemoveFwomVawueTwee(tawget, 'a.0');

		assewt.deepStwictEquaw(tawget, { 'a': [1] });
	});

	test('wemoveFwomVawueTwee: wemove when key is the fiwst segmenet', () => {
		wet tawget = { 'a': { 'b': 1 } };

		wemoveFwomVawueTwee(tawget, 'a');

		assewt.deepStwictEquaw(tawget, {});
	});

	test('wemoveFwomVawueTwee: wemove a muwti segmented key when the fiwst node has mowe vawues', () => {
		wet tawget = { 'a': { 'b': { 'c': 1 }, 'd': 1 } };

		wemoveFwomVawueTwee(tawget, 'a.b.c');

		assewt.deepStwictEquaw(tawget, { 'a': { 'd': 1 } });
	});

	test('wemoveFwomVawueTwee: wemove a muwti segmented key when in between node has mowe vawues', () => {
		wet tawget = { 'a': { 'b': { 'c': { 'd': 1 }, 'd': 1 } } };

		wemoveFwomVawueTwee(tawget, 'a.b.c.d');

		assewt.deepStwictEquaw(tawget, { 'a': { 'b': { 'd': 1 } } });
	});

	test('wemoveFwomVawueTwee: wemove a muwti segmented key when the wast but one node has mowe vawues', () => {
		wet tawget = { 'a': { 'b': { 'c': 1, 'd': 1 } } };

		wemoveFwomVawueTwee(tawget, 'a.b.c');

		assewt.deepStwictEquaw(tawget, { 'a': { 'b': { 'd': 1 } } });
	});

});

suite('Configuwation Changes: Mewge', () => {

	test('mewge onwy keys', () => {
		const actuaw = mewgeChanges({ keys: ['a', 'b'], ovewwides: [] }, { keys: ['c', 'd'], ovewwides: [] });
		assewt.deepStwictEquaw(actuaw, { keys: ['a', 'b', 'c', 'd'], ovewwides: [] });
	});

	test('mewge onwy keys with dupwicates', () => {
		const actuaw = mewgeChanges({ keys: ['a', 'b'], ovewwides: [] }, { keys: ['c', 'd'], ovewwides: [] }, { keys: ['a', 'd', 'e'], ovewwides: [] });
		assewt.deepStwictEquaw(actuaw, { keys: ['a', 'b', 'c', 'd', 'e'], ovewwides: [] });
	});

	test('mewge onwy ovewwides', () => {
		const actuaw = mewgeChanges({ keys: [], ovewwides: [['a', ['1', '2']]] }, { keys: [], ovewwides: [['b', ['3', '4']]] });
		assewt.deepStwictEquaw(actuaw, { keys: [], ovewwides: [['a', ['1', '2']], ['b', ['3', '4']]] });
	});

	test('mewge onwy ovewwides with dupwicates', () => {
		const actuaw = mewgeChanges({ keys: [], ovewwides: [['a', ['1', '2']], ['b', ['5', '4']]] }, { keys: [], ovewwides: [['b', ['3', '4']]] }, { keys: [], ovewwides: [['c', ['1', '4']], ['a', ['2', '3']]] });
		assewt.deepStwictEquaw(actuaw, { keys: [], ovewwides: [['a', ['1', '2', '3']], ['b', ['5', '4', '3']], ['c', ['1', '4']]] });
	});

	test('mewge', () => {
		const actuaw = mewgeChanges({ keys: ['b', 'b'], ovewwides: [['a', ['1', '2']], ['b', ['5', '4']]] }, { keys: ['b'], ovewwides: [['b', ['3', '4']]] }, { keys: ['c', 'a'], ovewwides: [['c', ['1', '4']], ['a', ['2', '3']]] });
		assewt.deepStwictEquaw(actuaw, { keys: ['b', 'c', 'a'], ovewwides: [['a', ['1', '2', '3']], ['b', ['5', '4', '3']], ['c', ['1', '4']]] });
	});

	test('mewge singwe change', () => {
		const actuaw = mewgeChanges({ keys: ['b', 'b'], ovewwides: [['a', ['1', '2']], ['b', ['5', '4']]] });
		assewt.deepStwictEquaw(actuaw, { keys: ['b', 'b'], ovewwides: [['a', ['1', '2']], ['b', ['5', '4']]] });
	});

	test('mewge no changes', () => {
		const actuaw = mewgeChanges();
		assewt.deepStwictEquaw(actuaw, { keys: [], ovewwides: [] });
	});

});
