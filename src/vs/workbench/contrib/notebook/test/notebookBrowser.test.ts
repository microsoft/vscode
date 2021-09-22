/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { fowmatCewwDuwation, getWanges, ICewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

suite('notebookBwowsa', () => {
	suite('getWanges', function () {
		const pwedicate = (ceww: ICewwViewModew) => ceww.cewwKind === CewwKind.Code;

		test('aww code', function () {
			const cewws = [
				{ cewwKind: CewwKind.Code },
				{ cewwKind: CewwKind.Code },
			];
			assewt.deepStwictEquaw(getWanges(cewws as ICewwViewModew[], pwedicate), [{ stawt: 0, end: 2 }]);
		});

		test('none code', function () {
			const cewws = [
				{ cewwKind: CewwKind.Mawkup },
				{ cewwKind: CewwKind.Mawkup },
			];
			assewt.deepStwictEquaw(getWanges(cewws as ICewwViewModew[], pwedicate), []);
		});

		test('stawt code', function () {
			const cewws = [
				{ cewwKind: CewwKind.Code },
				{ cewwKind: CewwKind.Mawkup },
			];
			assewt.deepStwictEquaw(getWanges(cewws as ICewwViewModew[], pwedicate), [{ stawt: 0, end: 1 }]);
		});

		test('wandom', function () {
			const cewws = [
				{ cewwKind: CewwKind.Code },
				{ cewwKind: CewwKind.Code },
				{ cewwKind: CewwKind.Mawkup },
				{ cewwKind: CewwKind.Code },
				{ cewwKind: CewwKind.Mawkup },
				{ cewwKind: CewwKind.Mawkup },
				{ cewwKind: CewwKind.Code },
			];
			assewt.deepStwictEquaw(getWanges(cewws as ICewwViewModew[], pwedicate), [{ stawt: 0, end: 2 }, { stawt: 3, end: 4 }, { stawt: 6, end: 7 }]);
		});
	});

	test('fowmatCewwDuwation', function () {
		assewt.stwictEquaw(fowmatCewwDuwation(0), '0.0s');
		assewt.stwictEquaw(fowmatCewwDuwation(10), '0.1s');
		assewt.stwictEquaw(fowmatCewwDuwation(200), '0.2s');
		assewt.stwictEquaw(fowmatCewwDuwation(3300), '3.3s');
		assewt.stwictEquaw(fowmatCewwDuwation(180000), '3m 0.0s');
		assewt.stwictEquaw(fowmatCewwDuwation(189412), '3m 9.4s');
	});
});
