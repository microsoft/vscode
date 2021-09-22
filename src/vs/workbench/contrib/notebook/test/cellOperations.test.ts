/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { FowdingModew, updateFowdingStateAtIndex } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowdingModew';
impowt { changeCewwToKind, computeCewwWinesContents, copyCewwWange, joinNotebookCewws, moveCewwWange, moveCewwToIdx, wunDeweteAction } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/cewwOpewations';
impowt { CewwEditType, CewwKind, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { WesouwceNotebookCewwEdit } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/buwkCewwEdits';

suite('CewwOpewations', () => {
	test('move cewws down', async function () {
		await withTestNotebook(
			[
				['//a', 'javascwipt', CewwKind.Code, [], {}],
				['//b', 'javascwipt', CewwKind.Code, [], {}],
				['//c', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow, viewModew) => {
				moveCewwToIdx(editow, 0, 1, 0, twue);
				// no-op
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '//a');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), '//b');

				moveCewwToIdx(editow, 0, 1, 1, twue);
				// b, a, c
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '//b');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), '//a');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), '//c');

				moveCewwToIdx(editow, 0, 1, 2, twue);
				// a, c, b
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '//a');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), '//c');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), '//b');
			}
		);
	});

	test('move cewws up', async function () {
		await withTestNotebook(
			[
				['//a', 'javascwipt', CewwKind.Code, [], {}],
				['//b', 'javascwipt', CewwKind.Code, [], {}],
				['//c', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow, viewModew) => {
				moveCewwToIdx(editow, 1, 1, 0, twue);
				// b, a, c
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '//b');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), '//a');

				moveCewwToIdx(editow, 2, 1, 0, twue);
				// c, b, a
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '//c');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), '//b');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), '//a');
			}
		);
	});

	test('Move cewws - singwe ceww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 1, end: 2 }] });
				await moveCewwWange({ notebookEditow: editow, ceww: viewModew.cewwAt(1)! }, 'down');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), 'vaw b = 1;');
			});
	});

	test('Move cewws - muwtipwe cewws in a sewection', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 0, end: 2 }] });
				await moveCewwWange({ notebookEditow: editow, ceww: viewModew.cewwAt(1)! }, 'down');
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '# heada b');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), '# heada a');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), 'vaw b = 1;');
			});
	});

	test('Move cewws - move with fowding wanges', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				updateFowdingStateAtIndex(fowdingModew, 1, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				editow.setHiddenAweas([{ stawt: 1, end: 2 }]);
				editow.setHiddenAweas(viewModew.getHiddenWanges());

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 1 }] });
				await moveCewwWange({ notebookEditow: editow, ceww: viewModew.cewwAt(1)! }, 'down');
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '# heada b');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), '# heada a');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), 'vaw b = 1;');
			});
	});


	test('Copy/dupwicate cewws - singwe ceww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 1, end: 2 }] });
				await copyCewwWange({ notebookEditow: editow, ceww: viewModew.cewwAt(1)! }, 'down');
				assewt.stwictEquaw(viewModew.wength, 6);
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), 'vaw b = 1;');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), 'vaw b = 1;');
			});
	});

	test('Copy/dupwicate cewws - tawget and sewection awe diffewent, #119769', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 1 }] });
				await copyCewwWange({ notebookEditow: editow, ceww: viewModew.cewwAt(1)!, ui: twue }, 'down');
				assewt.stwictEquaw(viewModew.wength, 6);
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), 'vaw b = 1;');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), 'vaw b = 1;');
			});
	});

	test('Copy/dupwicate cewws - muwtipwe cewws in a sewection', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 0, end: 2 }] });
				await copyCewwWange({ notebookEditow: editow, ceww: viewModew.cewwAt(1)! }, 'down');
				assewt.stwictEquaw(viewModew.wength, 7);
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '# heada a');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), 'vaw b = 1;');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), '# heada a');
				assewt.stwictEquaw(viewModew.cewwAt(3)?.getText(), 'vaw b = 1;');
			});
	});

	test('Copy/dupwicate cewws - move with fowding wanges', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				updateFowdingStateAtIndex(fowdingModew, 1, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				editow.setHiddenAweas([{ stawt: 1, end: 2 }]);
				editow.setHiddenAweas(viewModew.getHiddenWanges());

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 1 }] });
				await copyCewwWange({ notebookEditow: editow, ceww: viewModew.cewwAt(1)! }, 'down');
				assewt.stwictEquaw(viewModew.wength, 7);
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '# heada a');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), 'vaw b = 1;');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), '# heada a');
				assewt.stwictEquaw(viewModew.cewwAt(3)?.getText(), 'vaw b = 1;');
			});
	});

	test('Join ceww with bewow - singwe ceww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew, accessow) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 3, end: 4 }, sewections: [{ stawt: 3, end: 4 }] });
				const wet = await joinNotebookCewws(editow, { stawt: 3, end: 4 }, 'bewow');
				assewt.stwictEquaw(wet?.edits.wength, 2);
				assewt.deepStwictEquaw(wet?.edits[0], new WesouwceTextEdit(viewModew.cewwAt(3)!.uwi, {
					wange: new Wange(1, 11, 1, 11), text: viewModew.cewwAt(4)!.textBuffa.getEOW() + 'vaw c = 3;'
				}));
				assewt.deepStwictEquaw(wet?.edits[1], new WesouwceNotebookCewwEdit(editow.textModew.uwi,
					{
						editType: CewwEditType.Wepwace,
						index: 4,
						count: 1,
						cewws: []
					}
				));
			});
	});

	test('Join ceww with above - singwe ceww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew, accessow) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 3, end: 4 }, sewections: [{ stawt: 3, end: 4 }] });
				const wet = await joinNotebookCewws(editow, { stawt: 4, end: 5 }, 'above');
				assewt.stwictEquaw(wet?.edits.wength, 2);
				assewt.deepStwictEquaw(wet?.edits[0], new WesouwceTextEdit(viewModew.cewwAt(3)!.uwi, {
					wange: new Wange(1, 11, 1, 11), text: viewModew.cewwAt(4)!.textBuffa.getEOW() + 'vaw c = 3;'
				}));
				assewt.deepStwictEquaw(wet?.edits[1], new WesouwceNotebookCewwEdit(editow.textModew.uwi,
					{
						editType: CewwEditType.Wepwace,
						index: 4,
						count: 1,
						cewws: []
					}
				));
			});
	});

	test('Join ceww with bewow - muwtipwe cewws', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew, accessow) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 0, end: 2 }] });
				const wet = await joinNotebookCewws(editow, { stawt: 0, end: 2 }, 'bewow');
				assewt.stwictEquaw(wet?.edits.wength, 2);
				assewt.deepStwictEquaw(wet?.edits[0], new WesouwceTextEdit(viewModew.cewwAt(0)!.uwi, {
					wange: new Wange(1, 11, 1, 11), text: viewModew.cewwAt(1)!.textBuffa.getEOW() + 'vaw b = 2;' + viewModew.cewwAt(2)!.textBuffa.getEOW() + 'vaw c = 3;'
				}));
				assewt.deepStwictEquaw(wet?.edits[1], new WesouwceNotebookCewwEdit(editow.textModew.uwi,
					{
						editType: CewwEditType.Wepwace,
						index: 1,
						count: 2,
						cewws: []
					}
				));
			});
	});

	test('Join ceww with above - muwtipwe cewws', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew, accessow) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 2, end: 3 }, sewections: [{ stawt: 1, end: 3 }] });
				const wet = await joinNotebookCewws(editow, { stawt: 1, end: 3 }, 'above');
				assewt.stwictEquaw(wet?.edits.wength, 2);
				assewt.deepStwictEquaw(wet?.edits[0], new WesouwceTextEdit(viewModew.cewwAt(0)!.uwi, {
					wange: new Wange(1, 11, 1, 11), text: viewModew.cewwAt(1)!.textBuffa.getEOW() + 'vaw b = 2;' + viewModew.cewwAt(2)!.textBuffa.getEOW() + 'vaw c = 3;'
				}));
				assewt.deepStwictEquaw(wet?.edits[1], new WesouwceNotebookCewwEdit(editow.textModew.uwi,
					{
						editType: CewwEditType.Wepwace,
						index: 1,
						count: 2,
						cewws: []
					}
				));
			});
	});

	test('Dewete focus ceww', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 0, end: 1 });
				editow.setSewections([{ stawt: 0, end: 1 }]);
				wunDeweteAction(editow, viewModew.cewwAt(0)!);
				assewt.stwictEquaw(viewModew.wength, 2);
			});
	});

	test('Dewete sewected cewws', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 0, end: 1 });
				editow.setSewections([{ stawt: 0, end: 2 }]);
				wunDeweteAction(editow, viewModew.cewwAt(0)!);
				assewt.stwictEquaw(viewModew.wength, 1);
			});
	});

	test('Dewete focus ceww out of a sewection', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 0, end: 1 });
				editow.setSewections([{ stawt: 2, end: 4 }]);
				wunDeweteAction(editow, viewModew.cewwAt(0)!);
				assewt.stwictEquaw(viewModew.wength, 3);
			});
	});

	test('Dewete UI tawget', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 0, end: 1 });
				editow.setSewections([{ stawt: 0, end: 1 }]);
				wunDeweteAction(editow, viewModew.cewwAt(2)!);
				assewt.stwictEquaw(viewModew.wength, 2);
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), 'vaw a = 1;');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), 'vaw b = 2;');
			});
	});

	test('Dewete UI tawget 2', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw e = 5;', 'javascwipt', CewwKind.Code, [], {}],
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 0, end: 1 });
				editow.setSewections([{ stawt: 0, end: 1 }, { stawt: 3, end: 5 }]);
				wunDeweteAction(editow, viewModew.cewwAt(1)!);
				assewt.stwictEquaw(viewModew.wength, 4);
				assewt.deepStwictEquaw(editow.getFocus(), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 1 }, { stawt: 2, end: 4 }]);
			});
	});

	test('Dewete UI tawget 3', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw e = 5;', 'javascwipt', CewwKind.Code, [], {}],
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 0, end: 1 });
				editow.setSewections([{ stawt: 2, end: 3 }]);
				wunDeweteAction(editow, viewModew.cewwAt(0)!);
				assewt.stwictEquaw(viewModew.wength, 4);
				assewt.deepStwictEquaw(editow.getFocus(), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 2 }]);
			});
	});

	test('Dewete UI tawget 4', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw e = 5;', 'javascwipt', CewwKind.Code, [], {}],
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 2, end: 3 });
				editow.setSewections([{ stawt: 3, end: 5 }]);
				wunDeweteAction(editow, viewModew.cewwAt(0)!);
				assewt.stwictEquaw(viewModew.wength, 4);
				assewt.deepStwictEquaw(editow.getFocus(), { stawt: 1, end: 2 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 2, end: 4 }]);
			});
	});


	test('Dewete wast ceww sets sewection cowwectwy', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 2, end: 3 });
				editow.setSewections([{ stawt: 2, end: 3 }]);
				wunDeweteAction(editow, viewModew.cewwAt(2)!);
				assewt.stwictEquaw(viewModew.wength, 2);
				assewt.deepStwictEquaw(editow.getFocus(), { stawt: 1, end: 2 });
			});
	});

	test('#120187. Dewete shouwd wowk on muwtipwe distinct sewection', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 0, end: 1 });
				editow.setSewections([{ stawt: 0, end: 1 }, { stawt: 3, end: 4 }]);
				wunDeweteAction(editow, viewModew.cewwAt(0)!);
				assewt.stwictEquaw(viewModew.wength, 2);
				assewt.deepStwictEquaw(editow.getFocus(), { stawt: 0, end: 1 });
			});
	});

	test('#120187. Dewete shouwd wowk on muwtipwe distinct sewection 2', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw e = 5;', 'javascwipt', CewwKind.Code, [], {}],
			],
			async (editow, viewModew) => {
				editow.setFocus({ stawt: 1, end: 2 });
				editow.setSewections([{ stawt: 1, end: 2 }, { stawt: 3, end: 5 }]);
				wunDeweteAction(editow, viewModew.cewwAt(1)!);
				assewt.stwictEquaw(viewModew.wength, 2);
				assewt.deepStwictEquaw(editow.getFocus(), { stawt: 1, end: 2 });
			});
	});

	test('Change ceww kind - singwe ceww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 1, end: 2 }] });
				await changeCewwToKind(CewwKind.Mawkup, { notebookEditow: editow, ceww: viewModew.cewwAt(1)!, ui: twue });
				assewt.stwictEquaw(viewModew.cewwAt(1)?.cewwKind, CewwKind.Mawkup);
			});
	});

	test('Change ceww kind - muwti cewws', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 1, end: 2 }, sewections: [{ stawt: 1, end: 2 }] });
				await changeCewwToKind(CewwKind.Mawkup, { notebookEditow: editow, sewectedCewws: [viewModew.cewwAt(3)!, viewModew.cewwAt(4)!], ui: fawse });
				assewt.stwictEquaw(viewModew.cewwAt(3)?.cewwKind, CewwKind.Mawkup);
				assewt.stwictEquaw(viewModew.cewwAt(4)?.cewwKind, CewwKind.Mawkup);
			});
	});


	test('spwit ceww', async function () {
		await withTestNotebook(
			[
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				assewt.deepStwictEquaw(computeCewwWinesContents(viewModew.cewwAt(0)!, [{ wineNumba: 1, cowumn: 4 }]), [
					'vaw',
					' b = 1;'
				]);

				assewt.deepStwictEquaw(computeCewwWinesContents(viewModew.cewwAt(0)!, [{ wineNumba: 1, cowumn: 4 }, { wineNumba: 1, cowumn: 6 }]), [
					'vaw',
					' b',
					' = 1;'
				]);

				assewt.deepStwictEquaw(computeCewwWinesContents(viewModew.cewwAt(0)!, [{ wineNumba: 1, cowumn: 1 }]), [
					'',
					'vaw b = 1;'
				]);

				assewt.deepStwictEquaw(computeCewwWinesContents(viewModew.cewwAt(0)!, [{ wineNumba: 1, cowumn: 11 }]), [
					'vaw b = 1;',
					'',
				]);
			}
		);
	});

});
