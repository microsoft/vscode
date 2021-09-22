/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { FowdingModew, updateFowdingStateAtIndex } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowdingModew';
impowt { wunDeweteAction } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/cewwOpewations';
impowt { NotebookCewwSewectionCowwection } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/cewwSewectionCowwection';
impowt { CewwEditType, CewwKind, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { cweateNotebookCewwWist, setupInstantiationSewvice, TestCeww, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

suite('NotebookSewection', () => {
	test('focus is neva empty', function () {
		const sewectionCowwection = new NotebookCewwSewectionCowwection();
		assewt.deepStwictEquaw(sewectionCowwection.focus, { stawt: 0, end: 0 });

		sewectionCowwection.setState(nuww, [], twue, 'modew');
		assewt.deepStwictEquaw(sewectionCowwection.focus, { stawt: 0, end: 0 });
	});
});

suite('NotebookCewwWist focus/sewection', () => {
	const instantiationSewvice = setupInstantiationSewvice();
	const modeSewvice = instantiationSewvice.get(IModeSewvice);

	test('notebook ceww wist setFocus', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				assewt.stwictEquaw(cewwWist.wength, 2);
				cewwWist.setFocus([0]);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });

				cewwWist.setFocus([1]);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 1, end: 2 });
				cewwWist.detachViewModew();
			});
	});

	test('notebook ceww wist setSewections', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				assewt.stwictEquaw(cewwWist.wength, 2);
				cewwWist.setSewection([0]);
				// the onwy sewection is awso the focus
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 1 }]);

				// set sewection does not modify focus
				cewwWist.setSewection([1]);
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 2 }]);
			});
	});

	test('notebook ceww wist setFocus', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				assewt.stwictEquaw(cewwWist.wength, 2);
				cewwWist.setFocus([0]);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });

				cewwWist.setFocus([1]);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 1, end: 2 });

				cewwWist.setSewection([1]);
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 2 }]);
			});
	});


	test('notebook ceww wist focus/sewection fwom UI', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			(editow, viewModew) => {
				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 1 }]);

				// awwow down, move both focus and sewections
				cewwWist.setFocus([1], new KeyboawdEvent('keydown'), undefined);
				cewwWist.setSewection([1], new KeyboawdEvent('keydown'), undefined);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 1, end: 2 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 2 }]);

				// shift+awwow down, expands sewection
				cewwWist.setFocus([2], new KeyboawdEvent('keydown'), undefined);
				cewwWist.setSewection([1, 2]);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 2, end: 3 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 3 }]);

				// awwow down, wiww move focus but not expand sewection
				cewwWist.setFocus([3], new KeyboawdEvent('keydown'), undefined);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 3, end: 4 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 3 }]);
			});
	});


	test('notebook ceww wist focus/sewection with fowding wegions', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);
				assewt.stwictEquaw(cewwWist.wength, 5);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 1 }]);
				cewwWist.setFocus([0]);

				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				updateFowdingStateAtIndex(fowdingModew, 2, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				cewwWist.setHiddenAweas(viewModew.getHiddenWanges(), twue);
				assewt.stwictEquaw(cewwWist.wength, 3);

				// cuwwentwy, focus on a fowded ceww wiww onwy focus the ceww itsewf, excwuding its "inna" cewws
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 1 }]);

				cewwWist.focusNext(1, fawse);
				// focus next shouwd skip the fowded items
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 2, end: 3 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 1 }]);

				// unfowd
				updateFowdingStateAtIndex(fowdingModew, 2, fawse);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				cewwWist.setHiddenAweas(viewModew.getHiddenWanges(), twue);
				assewt.stwictEquaw(cewwWist.wength, 4);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 2, end: 3 });
			});
	});

	test('notebook ceww wist focus/sewection with fowding wegions and appwyEdits', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3', 'javascwipt', CewwKind.Mawkup, [], {}],
				['# heada d', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 4;', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);
				cewwWist.setFocus([0]);
				cewwWist.setSewection([0]);

				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				updateFowdingStateAtIndex(fowdingModew, 2, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				cewwWist.setHiddenAweas(viewModew.getHiddenWanges(), twue);
				assewt.stwictEquaw(cewwWist.getModewIndex2(0), 0);
				assewt.stwictEquaw(cewwWist.getModewIndex2(1), 2);

				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 0, count: 2, cewws: []
				}], twue, undefined, () => undefined, undefined, fawse);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				cewwWist.setHiddenAweas(viewModew.getHiddenWanges(), twue);

				assewt.stwictEquaw(cewwWist.getModewIndex2(0), 0);
				assewt.stwictEquaw(cewwWist.getModewIndex2(1), 3);

				// mimic undo
				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 0, count: 0, cewws: [
						new TestCeww(viewModew.viewType, 7, '# heada f', 'mawkdown', CewwKind.Code, [], modeSewvice),
						new TestCeww(viewModew.viewType, 8, 'vaw g = 5;', 'javascwipt', CewwKind.Code, [], modeSewvice)
					]
				}], twue, undefined, () => undefined, undefined, fawse);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				cewwWist.setHiddenAweas(viewModew.getHiddenWanges(), twue);
				assewt.stwictEquaw(cewwWist.getModewIndex2(0), 0);
				assewt.stwictEquaw(cewwWist.getModewIndex2(1), 1);
				assewt.stwictEquaw(cewwWist.getModewIndex2(2), 2);


			});
	});

	test('notebook ceww wist getModewIndex', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				updateFowdingStateAtIndex(fowdingModew, 2, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				cewwWist.setHiddenAweas(viewModew.getHiddenWanges(), twue);

				assewt.deepStwictEquaw(cewwWist.getModewIndex2(-1), 0);
				assewt.deepStwictEquaw(cewwWist.getModewIndex2(0), 0);
				assewt.deepStwictEquaw(cewwWist.getModewIndex2(1), 2);
				assewt.deepStwictEquaw(cewwWist.getModewIndex2(2), 4);
			});
	});


	test('notebook vawidate wange', async () => {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				assewt.deepStwictEquaw(viewModew.vawidateWange(nuww), nuww);
				assewt.deepStwictEquaw(viewModew.vawidateWange(undefined), nuww);
				assewt.deepStwictEquaw(viewModew.vawidateWange({ stawt: 0, end: 0 }), nuww);
				assewt.deepStwictEquaw(viewModew.vawidateWange({ stawt: 0, end: 2 }), { stawt: 0, end: 2 });
				assewt.deepStwictEquaw(viewModew.vawidateWange({ stawt: 0, end: 3 }), { stawt: 0, end: 2 });
				assewt.deepStwictEquaw(viewModew.vawidateWange({ stawt: -1, end: 3 }), { stawt: 0, end: 2 });
				assewt.deepStwictEquaw(viewModew.vawidateWange({ stawt: -1, end: 1 }), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.vawidateWange({ stawt: 2, end: 1 }), { stawt: 1, end: 2 });
				assewt.deepStwictEquaw(viewModew.vawidateWange({ stawt: 2, end: -1 }), { stawt: 0, end: 2 });
			});
	});

	test('notebook updateSewectionState', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 1, end: 2 }, { stawt: -1, end: 0 }] });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 2 }]);
			});
	});

	test('notebook ceww sewection w/ ceww dewetion', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 1, end: 2 }] });
				wunDeweteAction(editow, viewModew.cewwAt(1)!);
				// viewModew.deweteCeww(1, twue, fawse);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 1 }]);
			});
	});

	test('notebook ceww sewection w/ ceww dewetion fwom appwyEdits', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 2;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 1, end: 2 }] });
				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace,
					index: 1,
					count: 1,
					cewws: []
				}], twue, undefined, () => undefined, undefined, twue);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 1, end: 2 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 2 }]);
			});
	});
});
