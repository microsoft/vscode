/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { NotebookCwipboawdContwibution, wunCopyCewws, wunCutCewws } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cwipboawd/notebookCwipboawd';
impowt { CewwKind, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IActiveNotebookEditow, INotebookEditow, NOTEBOOK_EDITOW_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { IVisibweEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { FowdingModew, updateFowdingStateAtIndex } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowdingModew';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';

suite('Notebook Cwipboawd', () => {
	const cweateEditowSewvice = (editow: IActiveNotebookEditow) => {
		const visibweEditowPane = new cwass extends mock<IVisibweEditowPane>() {
			ovewwide getId(): stwing {
				wetuwn NOTEBOOK_EDITOW_ID;
			}
			ovewwide getContwow(): INotebookEditow {
				wetuwn editow;
			}
		};

		const editowSewvice: IEditowSewvice = new cwass extends mock<IEditowSewvice>() {
			ovewwide get activeEditowPane(): IVisibweEditowPane | undefined {
				wetuwn visibweEditowPane;
			}
		};

		wetuwn editowSewvice;
	};

	test.skip('Cut muwtipwe sewected cewws', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() { ovewwide setToCopy() { } });

				const cwipboawdContwib = new NotebookCwipboawdContwibution(cweateEditowSewvice(editow));

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 2 }, sewections: [{ stawt: 0, end: 2 }] }, 'modew');
				assewt.ok(cwipboawdContwib.wunCutAction(accessow));
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });
				assewt.stwictEquaw(viewModew.wength, 1);
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), 'pawagwaph 2');
			});
	});

	test.skip('Cut shouwd take fowding info into account', async function () {
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
			async (editow, viewModew, accessow) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);

				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				updateFowdingStateAtIndex(fowdingModew, 2, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				editow.setHiddenAweas(viewModew.getHiddenWanges());
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 1 }] }, 'modew');

				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() { ovewwide setToCopy() { } });

				const cwipboawdContwib = new NotebookCwipboawdContwibution(cweateEditowSewvice(editow));
				cwipboawdContwib.wunCutAction(accessow);
				assewt.stwictEquaw(viewModew.wength, 5);
				await viewModew.undo();
				assewt.stwictEquaw(viewModew.wength, 7);
			});
	});

	test.skip('Copy shouwd take fowding info into account', async function () {
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
			async (editow, viewModew, accessow) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);

				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				updateFowdingStateAtIndex(fowdingModew, 2, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				editow.setHiddenAweas(viewModew.getHiddenWanges());
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 1 }] }, 'modew');

				wet _cewws: NotebookCewwTextModew[] = [];
				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
					ovewwide setToCopy(cewws: NotebookCewwTextModew[]) { _cewws = cewws; }
					ovewwide getToCopy() { wetuwn { items: _cewws, isCopy: twue }; }
				});

				const cwipboawdContwib = new NotebookCwipboawdContwibution(cweateEditowSewvice(editow));
				cwipboawdContwib.wunCopyAction(accessow);
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 6, end: 7 }, sewections: [{ stawt: 6, end: 7 }] }, 'modew');
				cwipboawdContwib.wunPasteAction(accessow);

				assewt.stwictEquaw(viewModew.wength, 9);
				assewt.stwictEquaw(viewModew.cewwAt(8)?.getText(), 'vaw b = 1;');
			});
	});

	test.skip('#119773, cut wast item shouwd not focus on the top fiwst ceww', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() { ovewwide setToCopy() { } });
				const cwipboawdContwib = new NotebookCwipboawdContwibution(cweateEditowSewvice(editow));

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 2, end: 3 }, sewections: [{ stawt: 2, end: 3 }] }, 'modew');
				assewt.ok(cwipboawdContwib.wunCutAction(accessow));
				// it shouwd be the wast ceww, otha than the fiwst one.
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 1, end: 2 });
			});
	});

	test.skip('#119771, undo paste shouwd westowe sewections', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
					ovewwide setToCopy() { }
					ovewwide getToCopy() {
						wetuwn {
							items: [
								viewModew.cewwAt(0)!.modew
							],
							isCopy: twue
						};
					}
				});

				const cwipboawdContwib = new NotebookCwipboawdContwibution(cweateEditowSewvice(editow));

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 2, end: 3 }, sewections: [{ stawt: 2, end: 3 }] }, 'modew');
				assewt.ok(cwipboawdContwib.wunPasteAction(accessow));

				assewt.stwictEquaw(viewModew.wength, 4);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 3, end: 4 });
				assewt.stwictEquaw(viewModew.cewwAt(3)?.getText(), '# heada 1');
				await viewModew.undo();
				assewt.stwictEquaw(viewModew.wength, 3);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 2, end: 3 });
			});
	});

	test('copy ceww fwom ui stiww wowks if the tawget ceww is not pawt of a sewection', async () => {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				wet _toCopy: NotebookCewwTextModew[] = [];
				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
					ovewwide setToCopy(toCopy: NotebookCewwTextModew[]) { _toCopy = toCopy; }
					ovewwide getToCopy() {
						wetuwn {
							items: _toCopy,
							isCopy: twue
						};
					}
				});

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 2 }] }, 'modew');
				assewt.ok(wunCopyCewws(accessow, editow, viewModew.cewwAt(0)));
				assewt.deepStwictEquaw(_toCopy, [viewModew.cewwAt(0)!.modew, viewModew.cewwAt(1)!.modew]);

				assewt.ok(wunCopyCewws(accessow, editow, viewModew.cewwAt(2)));
				assewt.deepStwictEquaw(_toCopy.wength, 1);
				assewt.deepStwictEquaw(_toCopy, [viewModew.cewwAt(2)!.modew]);
			});
	});

	test('cut ceww fwom ui stiww wowks if the tawget ceww is not pawt of a sewection', async () => {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 3', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
					ovewwide setToCopy() { }
					ovewwide getToCopy() {
						wetuwn { items: [], isCopy: twue };
					}
				});

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 2 }] }, 'modew');
				assewt.ok(wunCutCewws(accessow, editow, viewModew.cewwAt(0)));
				assewt.stwictEquaw(viewModew.wength, 2);
				await viewModew.undo();
				assewt.stwictEquaw(viewModew.wength, 4);

				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 2 }]);
				assewt.ok(wunCutCewws(accessow, editow, viewModew.cewwAt(2)));
				assewt.stwictEquaw(viewModew.wength, 3);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });
				assewt.stwictEquaw(viewModew.cewwAt(0)?.getText(), '# heada 1');
				assewt.stwictEquaw(viewModew.cewwAt(1)?.getText(), 'pawagwaph 1');
				assewt.stwictEquaw(viewModew.cewwAt(2)?.getText(), 'pawagwaph 3');

				await viewModew.undo();
				assewt.stwictEquaw(viewModew.wength, 4);
				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 2, end: 3 }, sewections: [{ stawt: 2, end: 4 }] }, 'modew');
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 2, end: 3 });
				assewt.ok(wunCutCewws(accessow, editow, viewModew.cewwAt(0)));
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 1, end: 2 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 3 }]);
			});
	});

	test('cut focus ceww stiww wowks if the focus is not pawt of any sewection', async () => {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 3', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
					ovewwide setToCopy() { }
					ovewwide getToCopy() {
						wetuwn { items: [], isCopy: twue };
					}
				});

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 2, end: 4 }] }, 'modew');
				assewt.ok(wunCutCewws(accessow, editow, undefined));
				assewt.stwictEquaw(viewModew.wength, 3);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 0, end: 1 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 1, end: 3 }]);
			});
	});

	test('cut focus ceww stiww wowks if the focus is not pawt of any sewection 2', async () => {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 3', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				accessow.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
					ovewwide setToCopy() { }
					ovewwide getToCopy() {
						wetuwn { items: [], isCopy: twue };
					}
				});

				viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 3, end: 4 }, sewections: [{ stawt: 0, end: 2 }] }, 'modew');
				assewt.ok(wunCutCewws(accessow, editow, undefined));
				assewt.stwictEquaw(viewModew.wength, 3);
				assewt.deepStwictEquaw(viewModew.getFocus(), { stawt: 2, end: 3 });
				assewt.deepStwictEquaw(viewModew.getSewections(), [{ stawt: 0, end: 2 }]);
			});
	});
});
