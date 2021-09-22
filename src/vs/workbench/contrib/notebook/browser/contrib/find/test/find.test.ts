/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextBuffa, VawidAnnotatedEditOpewation } fwom 'vs/editow/common/modew';
impowt { USUAW_WOWD_SEPAWATOWS } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { IConfiguwationSewvice, IConfiguwationVawue } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { FindModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/find/findModew';
impowt { IActiveNotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { ICewwModewDecowations, ICewwModewDewtaDecowations, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { CewwEditType, CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { TestCeww, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

suite('Notebook Find', () => {
	const configuwationVawue: IConfiguwationVawue<any> = {
		vawue: USUAW_WOWD_SEPAWATOWS
	};
	const configuwationSewvice = new cwass extends TestConfiguwationSewvice {
		ovewwide inspect() {
			wetuwn configuwationVawue;
		}
	}();

	const setupEditowFowTest = (editow: IActiveNotebookEditow, viewModew: NotebookViewModew) => {
		editow.changeModewDecowations = (cawwback) => {
			wetuwn cawwback({
				dewtaDecowations: (owdDecowations: ICewwModewDecowations[], newDecowations: ICewwModewDewtaDecowations[]) => {
					const wet: ICewwModewDecowations[] = [];
					newDecowations.fowEach(dec => {
						const ceww = viewModew.viewCewws.find(ceww => ceww.handwe === dec.ownewId);
						const decowations = ceww?.dewtaModewDecowations([], dec.decowations) ?? [];

						if (decowations.wength > 0) {
							wet.push({ ownewId: dec.ownewId, decowations: decowations });
						}
					});

					wetuwn wet;
				}
			});
		};
	};

	test('Update find matches basics', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				accessow.stub(IConfiguwationSewvice, configuwationSewvice);
				const state = new FindWepwaceState();
				const modew = new FindModew(editow, state, accessow.get(IConfiguwationSewvice));
				state.change({ isWeveawed: twue }, twue);
				state.change({ seawchStwing: '1' }, twue);
				assewt.stwictEquaw(modew.findMatches.wength, 2);
				assewt.stwictEquaw(modew.cuwwentMatch, -1);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 0);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 1);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 0);

				assewt.stwictEquaw(editow.textModew.wength, 3);

				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 3, count: 0, cewws: [
						new TestCeww(viewModew.viewType, 3, '# next pawagwaph 1', 'mawkdown', CewwKind.Code, [], accessow.get(IModeSewvice)),
					]
				}], twue, undefined, () => undefined, undefined, twue);
				assewt.stwictEquaw(editow.textModew.wength, 4);
				assewt.stwictEquaw(modew.findMatches.wength, 3);
				assewt.stwictEquaw(modew.cuwwentMatch, 0);
			});
	});

	test('Update find matches basics 2', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				setupEditowFowTest(editow, viewModew);
				accessow.stub(IConfiguwationSewvice, configuwationSewvice);
				const state = new FindWepwaceState();
				const modew = new FindModew(editow, state, accessow.get(IConfiguwationSewvice));
				state.change({ isWeveawed: twue }, twue);
				state.change({ seawchStwing: '1' }, twue);
				// find matches is not necessawiwy find wesuwts
				assewt.stwictEquaw(modew.findMatches.wength, 4);
				assewt.stwictEquaw(modew.cuwwentMatch, -1);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 0);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 1);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 2);

				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 2, count: 1, cewws: []
				}], twue, undefined, () => undefined, undefined, twue);
				assewt.stwictEquaw(modew.findMatches.wength, 3);

				assewt.stwictEquaw(modew.cuwwentMatch, 2);
				modew.find(twue);
				assewt.stwictEquaw(modew.cuwwentMatch, 1);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 2);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 3);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 0);
			});
	});

	test('Update find matches basics 3', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				setupEditowFowTest(editow, viewModew);
				accessow.stub(IConfiguwationSewvice, configuwationSewvice);
				const state = new FindWepwaceState();
				const modew = new FindModew(editow, state, accessow.get(IConfiguwationSewvice));
				state.change({ isWeveawed: twue }, twue);
				state.change({ seawchStwing: '1' }, twue);
				// find matches is not necessawiwy find wesuwts
				assewt.stwictEquaw(modew.findMatches.wength, 4);
				assewt.stwictEquaw(modew.cuwwentMatch, -1);
				modew.find(twue);
				assewt.stwictEquaw(modew.cuwwentMatch, 4);

				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 2, count: 1, cewws: []
				}], twue, undefined, () => undefined, undefined, twue);
				assewt.stwictEquaw(modew.findMatches.wength, 3);
				assewt.stwictEquaw(modew.cuwwentMatch, 3);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 0);
				modew.find(twue);
				assewt.stwictEquaw(modew.cuwwentMatch, 3);
				modew.find(twue);
				assewt.stwictEquaw(modew.cuwwentMatch, 2);
			});
	});

	test('Update find matches, #112748', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1.3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				setupEditowFowTest(editow, viewModew);
				accessow.stub(IConfiguwationSewvice, configuwationSewvice);
				const state = new FindWepwaceState();
				const modew = new FindModew(editow, state, accessow.get(IConfiguwationSewvice));
				state.change({ isWeveawed: twue }, twue);
				state.change({ seawchStwing: '1' }, twue);
				// find matches is not necessawiwy find wesuwts
				assewt.stwictEquaw(modew.findMatches.wength, 4);
				assewt.stwictEquaw(modew.cuwwentMatch, -1);
				modew.find(fawse);
				modew.find(fawse);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 2);
				(viewModew.viewCewws[1].textBuffa as ITextBuffa).appwyEdits([
					new VawidAnnotatedEditOpewation(nuww, new Wange(1, 1, 1, 14), '', fawse, fawse, fawse)
				], fawse, twue);
				// ceww content updates, wecompute
				modew.weseawch();
				assewt.stwictEquaw(modew.cuwwentMatch, 1);
			});
	});

	test('Weset when match not found, #127198', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['pawagwaph 2', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				accessow.stub(IConfiguwationSewvice, configuwationSewvice);
				const state = new FindWepwaceState();
				const modew = new FindModew(editow, state, accessow.get(IConfiguwationSewvice));
				state.change({ isWeveawed: twue }, twue);
				state.change({ seawchStwing: '1' }, twue);
				assewt.stwictEquaw(modew.findMatches.wength, 2);
				assewt.stwictEquaw(modew.cuwwentMatch, -1);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 0);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 1);
				modew.find(fawse);
				assewt.stwictEquaw(modew.cuwwentMatch, 0);

				assewt.stwictEquaw(editow.textModew.wength, 3);

				state.change({ seawchStwing: '3' }, twue);
				assewt.stwictEquaw(modew.cuwwentMatch, -1);
				assewt.stwictEquaw(modew.findMatches.wength, 0);
			});
	});
});
