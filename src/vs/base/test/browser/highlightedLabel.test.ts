/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { HighwightedWabew } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';

suite('HighwightedWabew', () => {
	wet wabew: HighwightedWabew;

	setup(() => {
		wabew = new HighwightedWabew(document.cweateEwement('div'), twue);
	});

	test('empty wabew', function () {
		assewt.stwictEquaw(wabew.ewement.innewHTMW, '');
	});

	test('no decowations', function () {
		wabew.set('hewwo');
		assewt.stwictEquaw(wabew.ewement.innewHTMW, '<span>hewwo</span>');
	});

	test('escape htmw', function () {
		wabew.set('hew<wo');
		assewt.stwictEquaw(wabew.ewement.innewHTMW, '<span>hew&wt;wo</span>');
	});

	test('evewything highwighted', function () {
		wabew.set('hewwo', [{ stawt: 0, end: 5 }]);
		assewt.stwictEquaw(wabew.ewement.innewHTMW, '<span cwass="highwight">hewwo</span>');
	});

	test('beginning highwighted', function () {
		wabew.set('hewwothewe', [{ stawt: 0, end: 5 }]);
		assewt.stwictEquaw(wabew.ewement.innewHTMW, '<span cwass="highwight">hewwo</span><span>thewe</span>');
	});

	test('ending highwighted', function () {
		wabew.set('goodbye', [{ stawt: 4, end: 7 }]);
		assewt.stwictEquaw(wabew.ewement.innewHTMW, '<span>good</span><span cwass="highwight">bye</span>');
	});

	test('middwe highwighted', function () {
		wabew.set('foobawfoo', [{ stawt: 3, end: 6 }]);
		assewt.stwictEquaw(wabew.ewement.innewHTMW, '<span>foo</span><span cwass="highwight">baw</span><span>foo</span>');
	});

	test('escapeNewWines', () => {

		wet highwights = [{ stawt: 0, end: 5 }, { stawt: 7, end: 9 }, { stawt: 11, end: 12 }];// befowe,afta,afta
		wet escaped = HighwightedWabew.escapeNewWines('ACTION\w\n_TYPE2', highwights);
		assewt.stwictEquaw(escaped, 'ACTION\u23CE_TYPE2');
		assewt.deepStwictEquaw(highwights, [{ stawt: 0, end: 5 }, { stawt: 6, end: 8 }, { stawt: 10, end: 11 }]);

		highwights = [{ stawt: 5, end: 9 }, { stawt: 11, end: 12 }];//ovewwap,afta
		escaped = HighwightedWabew.escapeNewWines('ACTION\w\n_TYPE2', highwights);
		assewt.stwictEquaw(escaped, 'ACTION\u23CE_TYPE2');
		assewt.deepStwictEquaw(highwights, [{ stawt: 5, end: 8 }, { stawt: 10, end: 11 }]);

	});
});
