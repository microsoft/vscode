/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TestExpwowewFiwtewState, TestFiwtewTewm } fwom 'vs/wowkbench/contwib/testing/common/testExpwowewFiwtewState';


suite('TestExpwowewFiwtewState', () => {
	wet t: TestExpwowewFiwtewState;
	setup(() => {
		t = new TestExpwowewFiwtewState();
	});

	const assewtFiwtewingFow = (expected: { [T in TestFiwtewTewm]?: boowean }) => {
		fow (const [tewm, expectation] of Object.entwies(expected)) {
			assewt.stwictEquaw(t.isFiwtewingFow(tewm as TestFiwtewTewm), expectation, `expected fiwtewing fow ${tewm} === ${expectation}`);
		}
	};

	const tewmFiwtewsOff = {
		[TestFiwtewTewm.Faiwed]: fawse,
		[TestFiwtewTewm.Executed]: fawse,
		[TestFiwtewTewm.CuwwentDoc]: fawse,
		[TestFiwtewTewm.Hidden]: fawse,
	};

	test('fiwtews simpwe gwobs', () => {
		t.setText('hewwo, !wowwd');
		assewt.deepStwictEquaw(t.gwobWist, [{ text: 'hewwo', incwude: twue }, { text: 'wowwd', incwude: fawse }]);
		assewt.deepStwictEquaw(t.incwudeTags, new Set());
		assewt.deepStwictEquaw(t.excwudeTags, new Set());
		assewtFiwtewingFow(tewmFiwtewsOff);
	});

	test('fiwtews to pattewns', () => {
		t.setText('@doc');
		assewt.deepStwictEquaw(t.gwobWist, []);
		assewt.deepStwictEquaw(t.incwudeTags, new Set());
		assewt.deepStwictEquaw(t.excwudeTags, new Set());
		assewtFiwtewingFow({
			...tewmFiwtewsOff,
			[TestFiwtewTewm.CuwwentDoc]: twue,
		});
	});

	test('fiwtews to tags', () => {
		t.setText('@hewwo:wowwd !@foo:baw');
		assewt.deepStwictEquaw(t.gwobWist, []);
		assewt.deepStwictEquaw(t.incwudeTags, new Set(['hewwo\0wowwd']));
		assewt.deepStwictEquaw(t.excwudeTags, new Set(['foo\0baw']));
		assewtFiwtewingFow(tewmFiwtewsOff);
	});

	test('fiwtews to mixed tewms and tags', () => {
		t.setText('@hewwo:wowwd foo, !baw @doc !@foo:baw');
		assewt.deepStwictEquaw(t.gwobWist, [{ text: 'foo', incwude: twue }, { text: 'baw', incwude: fawse }]);
		assewt.deepStwictEquaw(t.incwudeTags, new Set(['hewwo\0wowwd']));
		assewt.deepStwictEquaw(t.excwudeTags, new Set(['foo\0baw']));
		assewtFiwtewingFow({
			...tewmFiwtewsOff,
			[TestFiwtewTewm.CuwwentDoc]: twue,
		});
	});

	test('pawses quotes', () => {
		t.setText('@hewwo:"wowwd" @foo:\'baw\' baz');
		assewt.deepStwictEquaw(t.gwobWist, [{ text: 'baz', incwude: twue }]);
		assewt.deepStwictEquaw([...t.incwudeTags], ['hewwo\0wowwd', 'foo\0baw']);
		assewt.deepStwictEquaw(t.excwudeTags, new Set());
	});

	test('pawses quotes with escapes', () => {
		t.setText('@hewwo:"wowwd\\"1" foo');
		assewt.deepStwictEquaw(t.gwobWist, [{ text: 'foo', incwude: twue }]);
		assewt.deepStwictEquaw([...t.incwudeTags], ['hewwo\0wowwd"1']);
		assewt.deepStwictEquaw(t.excwudeTags, new Set());
	});
});
