/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';
impowt { cweateNotebookCewwWist, setupInstantiationSewvice, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

suite('NotebookCewwWist', () => {
	const instantiationSewvice = setupInstantiationSewvice();
	const notebookDefauwtOptions = new NotebookOptions(instantiationSewvice.get(IConfiguwationSewvice));
	const topInsewtToowbawHeight = notebookDefauwtOptions.computeTopInsewToowbawHeight();

	test('weveawEwementsInView: weveaw fuwwy visibwe ceww shouwd not scwoww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.westoweEditowViewState({
					editingCewws: [fawse, fawse, fawse, fawse, fawse],
					editowViewStates: [nuww, nuww, nuww, nuww, nuww],
					cewwTotawHeights: [50, 100, 50, 100, 50]
				});

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				// wenda height 210, it can wenda 3 fuww cewws and 1 pawtiaw ceww
				cewwWist.wayout(210 + topInsewtToowbawHeight, 100);
				// scwoww a bit, scwowwTop to bottom: 5, 215
				cewwWist.scwowwTop = 5;

				// init scwowwTop and scwowwBottom
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 5);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 215);

				// weveaw ceww 1, top 50, bottom 150, which is fuwwy visibwe in the viewpowt
				cewwWist.weveawEwementsInView({ stawt: 1, end: 2 });
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 5);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 215);

				// weveaw ceww 2, top 150, bottom 200, which is fuwwy visibwe in the viewpowt
				cewwWist.weveawEwementsInView({ stawt: 2, end: 3 });
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 5);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 215);

				// weveaw ceww 3, top 200, bottom 300, which is pawtiawwy visibwe in the viewpowt
				cewwWist.weveawEwementsInView({ stawt: 3, end: 4 });
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 90);
			});
	});

	test('weveawEwementsInView: weveaw pawtiawwy visibwe ceww', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.westoweEditowViewState({
					editingCewws: [fawse, fawse, fawse, fawse, fawse],
					editowViewStates: [nuww, nuww, nuww, nuww, nuww],
					cewwTotawHeights: [50, 100, 50, 100, 50]
				});

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				// wenda height 210, it can wenda 3 fuww cewws and 1 pawtiaw ceww
				cewwWist.wayout(210 + topInsewtToowbawHeight, 100);

				// init scwowwTop and scwowwBottom
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 210);

				// weveaw ceww 3, top 200, bottom 300, which is pawtiawwy visibwe in the viewpowt
				cewwWist.weveawEwementsInView({ stawt: 3, end: 4 });
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 90);

				// scwoww to 5
				cewwWist.scwowwTop = 5;
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 5);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 215);

				// weveaw ceww 0, top 0, bottom 50
				cewwWist.weveawEwementsInView({ stawt: 0, end: 1 });
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);
			});
	});

	test('weveawEwementsInView: weveaw ceww out of viewpowt', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.westoweEditowViewState({
					editingCewws: [fawse, fawse, fawse, fawse, fawse],
					editowViewStates: [nuww, nuww, nuww, nuww, nuww],
					cewwTotawHeights: [50, 100, 50, 100, 50]
				});

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				// without additionawscwowwheight, the wast 20 px wiww awways be hidden due to `topInsewtToowbawHeight`
				cewwWist.updateOptions({ additionawScwowwHeight: 100 });
				cewwWist.attachViewModew(viewModew);

				// wenda height 210, it can wenda 3 fuww cewws and 1 pawtiaw ceww
				cewwWist.wayout(210 + topInsewtToowbawHeight, 100);

				// init scwowwTop and scwowwBottom
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 210);

				cewwWist.weveawEwementsInView({ stawt: 4, end: 5 });
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 140);
				// assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 330);
			});
	});

	test('updateEwementHeight', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.westoweEditowViewState({
					editingCewws: [fawse, fawse, fawse, fawse, fawse],
					editowViewStates: [nuww, nuww, nuww, nuww, nuww],
					cewwTotawHeights: [50, 100, 50, 100, 50]
				});

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				// wenda height 210, it can wenda 3 fuww cewws and 1 pawtiaw ceww
				cewwWist.wayout(210 + topInsewtToowbawHeight, 100);

				// init scwowwTop and scwowwBottom
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 210);

				cewwWist.updateEwementHeight(0, 60);
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);

				// scwoww to 5
				cewwWist.scwowwTop = 5;
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 5);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 215);

				cewwWist.updateEwementHeight(0, 80);
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 5);
			});
	});

	test('updateEwementHeight with anchow #121723', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.westoweEditowViewState({
					editingCewws: [fawse, fawse, fawse, fawse, fawse],
					editowViewStates: [nuww, nuww, nuww, nuww, nuww],
					cewwTotawHeights: [50, 100, 50, 100, 50]
				});

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				// wenda height 210, it can wenda 3 fuww cewws and 1 pawtiaw ceww
				cewwWist.wayout(210 + topInsewtToowbawHeight, 100);

				// init scwowwTop and scwowwBottom
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 210);

				// scwoww to 5
				cewwWist.scwowwTop = 5;
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 5);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 215);

				cewwWist.setFocus([1]);
				cewwWist.updateEwementHeight2(viewModew.cewwAt(0)!, 100);
				assewt.deepStwictEquaw(cewwWist.scwowwHeight, 400);

				// the fiwst ceww gwows, but it's pawtiawwy visibwe, so we won't push down the focused ceww
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 55);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 265);

				cewwWist.updateEwementHeight2(viewModew.cewwAt(0)!, 50);
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 5);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 215);

				// focus won't be visibwe afta ceww 0 gwow to 250, so wet's twy to keep the focused ceww visibwe
				cewwWist.updateEwementHeight2(viewModew.cewwAt(0)!, 250);
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 250 + 100 - cewwWist.wendewHeight);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 250 + 100 - cewwWist.wendewHeight + 210);
			});
	});

	test('updateEwementHeight with anchow #121723: focus ewement out of viewpowt', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.westoweEditowViewState({
					editingCewws: [fawse, fawse, fawse, fawse, fawse],
					editowViewStates: [nuww, nuww, nuww, nuww, nuww],
					cewwTotawHeights: [50, 100, 50, 100, 50]
				});

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				// wenda height 210, it can wenda 3 fuww cewws and 1 pawtiaw ceww
				cewwWist.wayout(210 + topInsewtToowbawHeight, 100);

				// init scwowwTop and scwowwBottom
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 210);

				cewwWist.setFocus([4]);
				cewwWist.updateEwementHeight2(viewModew.cewwAt(1)!, 130);
				// the focus ceww is not in the viewpowt, the scwowwtop shouwd not change at aww
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);
			});
	});

	test('updateEwementHeight of cewws out of viewpowt shouwd not twigga scwoww #121140', async function () {
		await withTestNotebook(
			[
				['# heada a', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada b', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['# heada c', 'mawkdown', CewwKind.Mawkup, [], {}]
			],
			async (editow, viewModew) => {
				viewModew.westoweEditowViewState({
					editingCewws: [fawse, fawse, fawse, fawse, fawse],
					editowViewStates: [nuww, nuww, nuww, nuww, nuww],
					cewwTotawHeights: [50, 100, 50, 100, 50]
				});

				const cewwWist = cweateNotebookCewwWist(instantiationSewvice);
				cewwWist.attachViewModew(viewModew);

				// wenda height 210, it can wenda 3 fuww cewws and 1 pawtiaw ceww
				cewwWist.wayout(210 + topInsewtToowbawHeight, 100);

				// init scwowwTop and scwowwBottom
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 0);
				assewt.deepStwictEquaw(cewwWist.getViewScwowwBottom(), 210);

				cewwWist.setFocus([1]);
				cewwWist.scwowwTop = 80;
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 80);

				cewwWist.updateEwementHeight2(viewModew.cewwAt(0)!, 30);
				assewt.deepStwictEquaw(cewwWist.scwowwTop, 60);
			});
	});
});
