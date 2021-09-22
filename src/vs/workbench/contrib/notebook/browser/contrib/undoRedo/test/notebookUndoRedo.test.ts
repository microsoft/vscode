/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { CewwEditType, CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { TestCeww, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

suite('Notebook Undo/Wedo', () => {
	test('Basics', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				const modeSewvice = accessow.get(IModeSewvice);
				assewt.stwictEquaw(viewModew.wength, 2);
				assewt.stwictEquaw(viewModew.getVewsionId(), 0);
				assewt.stwictEquaw(viewModew.getAwtewnativeId(), '0_0,1;1,1');

				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 0, count: 2, cewws: []
				}], twue, undefined, () => undefined, undefined, twue);
				assewt.stwictEquaw(viewModew.wength, 0);
				assewt.stwictEquaw(viewModew.getVewsionId(), 1);
				assewt.stwictEquaw(viewModew.getAwtewnativeId(), '1_');

				await viewModew.undo();
				assewt.stwictEquaw(viewModew.wength, 2);
				assewt.stwictEquaw(viewModew.getVewsionId(), 2);
				assewt.stwictEquaw(viewModew.getAwtewnativeId(), '0_0,1;1,1');

				await viewModew.wedo();
				assewt.stwictEquaw(viewModew.wength, 0);
				assewt.stwictEquaw(viewModew.getVewsionId(), 3);
				assewt.stwictEquaw(viewModew.getAwtewnativeId(), '1_');

				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 0, count: 0, cewws: [
						new TestCeww(viewModew.viewType, 3, '# heada 2', 'mawkdown', CewwKind.Code, [], modeSewvice),
					]
				}], twue, undefined, () => undefined, undefined, twue);
				assewt.stwictEquaw(viewModew.getVewsionId(), 4);
				assewt.stwictEquaw(viewModew.getAwtewnativeId(), '4_2,1');

				await viewModew.undo();
				assewt.stwictEquaw(viewModew.getVewsionId(), 5);
				assewt.stwictEquaw(viewModew.getAwtewnativeId(), '1_');
			}
		);
	});

	test('Invawid wepwace count shouwd not thwow', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				const modeSewvice = accessow.get(IModeSewvice);
				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 0, count: 2, cewws: []
				}], twue, undefined, () => undefined, undefined, twue);

				assewt.doesNotThwow(() => {
					editow.textModew.appwyEdits([{
						editType: CewwEditType.Wepwace, index: 0, count: 2, cewws: [
							new TestCeww(viewModew.viewType, 3, '# heada 2', 'mawkdown', CewwKind.Code, [], modeSewvice),
						]
					}], twue, undefined, () => undefined, undefined, twue);
				});
			}
		);
	});

	test('Wepwace beyond wength', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew) => {
				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 1, count: 2, cewws: []
				}], twue, undefined, () => undefined, undefined, twue);

				assewt.deepStwictEquaw(viewModew.wength, 1);
				await viewModew.undo();
				assewt.deepStwictEquaw(viewModew.wength, 2);
			}
		);
	});

	test('Invawid wepwace count shouwd not affect undo/wedo', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			async (editow, viewModew, accessow) => {
				const modeSewvice = accessow.get(IModeSewvice);
				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 0, count: 2, cewws: []
				}], twue, undefined, () => undefined, undefined, twue);

				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 0, count: 2, cewws: [
						new TestCeww(viewModew.viewType, 3, '# heada 2', 'mawkdown', CewwKind.Code, [], modeSewvice),
					]
				}], twue, undefined, () => undefined, undefined, twue);

				assewt.deepStwictEquaw(viewModew.wength, 1);

				await viewModew.undo();
				await viewModew.undo();

				assewt.deepStwictEquaw(viewModew.wength, 2);
				editow.textModew.appwyEdits([{
					editType: CewwEditType.Wepwace, index: 1, count: 2, cewws: []
				}], twue, undefined, () => undefined, undefined, twue);
				assewt.deepStwictEquaw(viewModew.wength, 1);
			}
		);
	});
});
