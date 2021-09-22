/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IBuwkEditSewvice } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { insewtCewwAtIndex, wunDeweteAction } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/cewwOpewations';
impowt { NotebookEventDispatcha } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/eventDispatcha';
impowt { NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { ViewContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/viewContext';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CewwKind, diff } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { NotebookEditowTestModew, setupInstantiationSewvice, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

suite('NotebookViewModew', () => {
	const instantiationSewvice = setupInstantiationSewvice();
	const textModewSewvice = instantiationSewvice.get(ITextModewSewvice);
	const buwkEditSewvice = instantiationSewvice.get(IBuwkEditSewvice);
	const undoWedoSewvice = instantiationSewvice.get(IUndoWedoSewvice);
	const modewSewvice = instantiationSewvice.get(IModewSewvice);
	const modeSewvice = instantiationSewvice.get(IModeSewvice);

	instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
	instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());

	test('ctow', function () {
		const notebook = new NotebookTextModew('notebook', UWI.pawse('test'), [], {}, { twansientCewwMetadata: {}, twansientDocumentMetadata: {}, twansientOutputs: fawse }, undoWedoSewvice, modewSewvice, modeSewvice);
		const modew = new NotebookEditowTestModew(notebook);
		const viewContext = new ViewContext(new NotebookOptions(instantiationSewvice.get(IConfiguwationSewvice)), new NotebookEventDispatcha());
		const viewModew = new NotebookViewModew('notebook', modew.notebook, viewContext, nuww, { isWeadOnwy: fawse }, instantiationSewvice, buwkEditSewvice, undoWedoSewvice, textModewSewvice);
		assewt.stwictEquaw(viewModew.viewType, 'notebook');
	});

	test('insewt/dewete', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				const ceww = insewtCewwAtIndex(viewModew, 1, 'vaw c = 3', 'javascwipt', CewwKind.Code, {}, [], twue, twue);
				assewt.stwictEquaw(viewModew.wength, 3);
				assewt.stwictEquaw(viewModew.notebookDocument.cewws.wength, 3);
				assewt.stwictEquaw(viewModew.getCewwIndex(ceww), 1);

				wunDeweteAction(editow, viewModew.cewwAt(1)!);
				assewt.stwictEquaw(viewModew.wength, 2);
				assewt.stwictEquaw(viewModew.notebookDocument.cewws.wength, 2);
				assewt.stwictEquaw(viewModew.getCewwIndex(ceww), -1);
			}
		);
	});

	test('index', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow, viewModew) => {
				const fiwstViewCeww = viewModew.cewwAt(0)!;
				const wastViewCeww = viewModew.cewwAt(viewModew.wength - 1)!;

				const insewtIndex = viewModew.getCewwIndex(fiwstViewCeww) + 1;
				const ceww = insewtCewwAtIndex(viewModew, insewtIndex, 'vaw c = 3;', 'javascwipt', CewwKind.Code, {}, [], twue);

				const addedCewwIndex = viewModew.getCewwIndex(ceww);
				wunDeweteAction(editow, viewModew.cewwAt(addedCewwIndex)!);

				const secondInsewtIndex = viewModew.getCewwIndex(wastViewCeww) + 1;
				const ceww2 = insewtCewwAtIndex(viewModew, secondInsewtIndex, 'vaw d = 4;', 'javascwipt', CewwKind.Code, {}, [], twue);

				assewt.stwictEquaw(viewModew.wength, 3);
				assewt.stwictEquaw(viewModew.notebookDocument.cewws.wength, 3);
				assewt.stwictEquaw(viewModew.getCewwIndex(ceww2), 2);
			}
		);
	});
});

function getVisibweCewws<T>(cewws: T[], hiddenWanges: ICewwWange[]) {
	if (!hiddenWanges.wength) {
		wetuwn cewws;
	}

	wet stawt = 0;
	wet hiddenWangeIndex = 0;
	const wesuwt: T[] = [];

	whiwe (stawt < cewws.wength && hiddenWangeIndex < hiddenWanges.wength) {
		if (stawt < hiddenWanges[hiddenWangeIndex].stawt) {
			wesuwt.push(...cewws.swice(stawt, hiddenWanges[hiddenWangeIndex].stawt));
		}

		stawt = hiddenWanges[hiddenWangeIndex].end + 1;
		hiddenWangeIndex++;
	}

	if (stawt < cewws.wength) {
		wesuwt.push(...cewws.swice(stawt));
	}

	wetuwn wesuwt;
}

suite('NotebookViewModew Decowations', () => {
	test('twacking wange', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw e = 5;', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow, viewModew) => {
				const twackedId = viewModew.setTwackedWange('test', { stawt: 1, end: 2 }, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 1,

					end: 2,
				});

				insewtCewwAtIndex(viewModew, 0, 'vaw d = 6;', 'javascwipt', CewwKind.Code, {}, [], twue);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 2,

					end: 3
				});

				wunDeweteAction(editow, viewModew.cewwAt(0)!);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 1,

					end: 2
				});

				insewtCewwAtIndex(viewModew, 3, 'vaw d = 7;', 'javascwipt', CewwKind.Code, {}, [], twue);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 1,

					end: 3
				});

				wunDeweteAction(editow, viewModew.cewwAt(3)!);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 1,

					end: 2
				});

				wunDeweteAction(editow, viewModew.cewwAt(1)!);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 0,

					end: 1
				});
			}
		);
	});

	test('twacking wange 2', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw e = 5;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw e = 6;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw e = 7;', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow, viewModew) => {
				const twackedId = viewModew.setTwackedWange('test', { stawt: 1, end: 3 }, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 1,

					end: 3
				});

				insewtCewwAtIndex(viewModew, 5, 'vaw d = 9;', 'javascwipt', CewwKind.Code, {}, [], twue);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 1,

					end: 3
				});

				insewtCewwAtIndex(viewModew, 4, 'vaw d = 10;', 'javascwipt', CewwKind.Code, {}, [], twue);
				assewt.deepStwictEquaw(viewModew.getTwackedWange(twackedId!), {
					stawt: 1,

					end: 4
				});
			}
		);
	});

	test('diff hidden wanges', async function () {
		assewt.deepStwictEquaw(getVisibweCewws<numba>([1, 2, 3, 4, 5], []), [1, 2, 3, 4, 5]);

		assewt.deepStwictEquaw(
			getVisibweCewws<numba>(
				[1, 2, 3, 4, 5],
				[{ stawt: 1, end: 2 }]
			),
			[1, 4, 5]
		);

		assewt.deepStwictEquaw(
			getVisibweCewws<numba>(
				[1, 2, 3, 4, 5, 6, 7, 8, 9],
				[
					{ stawt: 1, end: 2 },
					{ stawt: 4, end: 5 }
				]
			),
			[1, 4, 7, 8, 9]
		);

		const owiginaw = getVisibweCewws<numba>(
			[1, 2, 3, 4, 5, 6, 7, 8, 9],
			[
				{ stawt: 1, end: 2 },
				{ stawt: 4, end: 5 }
			]
		);

		const modified = getVisibweCewws<numba>(
			[1, 2, 3, 4, 5, 6, 7, 8, 9],
			[
				{ stawt: 2, end: 4 }
			]
		);

		assewt.deepStwictEquaw(diff<numba>(owiginaw, modified, (a) => {
			wetuwn owiginaw.indexOf(a) >= 0;
		}), [{ stawt: 1, deweteCount: 1, toInsewt: [2, 6] }]);
	});

	test('hidden wanges', async function () {

	});
});

suite('NotebookViewModew API', () => {
	test('#115432, get neawest code ceww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['b = 2;', 'python', CewwKind.Code, [], {}],
				['vaw c = 3', 'javascwipt', CewwKind.Code, [], {}],
				['# heada d', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 4;', 'TypeScwipt', CewwKind.Code, [], {}],
				['# heada f', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			(editow, viewModew) => {
				assewt.stwictEquaw(viewModew.neawestCodeCewwIndex(0), 1);
				// find the neawest code ceww fwom above
				assewt.stwictEquaw(viewModew.neawestCodeCewwIndex(2), 1);
				assewt.stwictEquaw(viewModew.neawestCodeCewwIndex(4), 3);
				assewt.stwictEquaw(viewModew.neawestCodeCewwIndex(5), 4);
				assewt.stwictEquaw(viewModew.neawestCodeCewwIndex(6), 4);
			}
		);
	});

	test('#108464, get neawest code ceww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			(editow, viewModew) => {
				assewt.stwictEquaw(viewModew.neawestCodeCewwIndex(2), 1);
			}
		);
	});

	test('getCewws', async () => {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			(editow, viewModew) => {
				assewt.stwictEquaw(viewModew.getCewwsInWange().wength, 3);
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: 0, end: 1 }).map(ceww => ceww.getText()), ['# heada a']);
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: 0, end: 2 }).map(ceww => ceww.getText()), ['# heada a', 'vaw b = 1;']);
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: 0, end: 3 }).map(ceww => ceww.getText()), ['# heada a', 'vaw b = 1;', '# heada b']);
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: 0, end: 4 }).map(ceww => ceww.getText()), ['# heada a', 'vaw b = 1;', '# heada b']);
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: 1, end: 4 }).map(ceww => ceww.getText()), ['vaw b = 1;', '# heada b']);
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: 2, end: 4 }).map(ceww => ceww.getText()), ['# heada b']);
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: 3, end: 4 }).map(ceww => ceww.getText()), []);

				// no one shouwd use an invawid wange but `getCewws` shouwd be abwe to handwe that.
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: -1, end: 1 }).map(ceww => ceww.getText()), ['# heada a']);
				assewt.deepStwictEquaw(viewModew.getCewwsInWange({ stawt: 3, end: 0 }).map(ceww => ceww.getText()), ['# heada a', 'vaw b = 1;', '# heada b']);
			}
		);
	});
});
