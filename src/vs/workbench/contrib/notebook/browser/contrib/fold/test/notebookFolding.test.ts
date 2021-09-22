/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { setupInstantiationSewvice, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { FowdingModew, updateFowdingStateAtIndex } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowdingModew';

suite('Notebook Fowding', () => {
	const instantiationSewvice = setupInstantiationSewvice();
	instantiationSewvice.spy(IUndoWedoSewvice, 'pushEwement');

	test('Fowding based on mawkdown cewws', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingContwowwa = new FowdingModew();
				fowdingContwowwa.attachViewModew(viewModew);

				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(1), 0);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(2), 0);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(3), 1);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(4), 1);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(5), 1);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(6), 2);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(7), 2);
			}
		);
	});

	test('Top wevew heada in a ceww wins', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.1\n# headew3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingContwowwa = new FowdingModew();
				fowdingContwowwa.attachViewModew(viewModew);

				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(1), 0);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(2), 0);
				assewt.stwictEquaw(fowdingContwowwa.wegions.getEndWineNumba(0), 2);

				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(3), 1);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(4), 1);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(5), 1);
				assewt.stwictEquaw(fowdingContwowwa.wegions.getEndWineNumba(1), 7);

				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(6), 2);
				assewt.stwictEquaw(fowdingContwowwa.wegions.findWange(7), 2);
				assewt.stwictEquaw(fowdingContwowwa.wegions.getEndWineNumba(2), 7);
			}
		);
	});

	test('Fowding', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 1, end: 6 }
				]);
			}
		);

		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				updateFowdingStateAtIndex(fowdingModew, 2, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);

				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 3, end: 4 }
				]);
			}
		);

		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				updateFowdingStateAtIndex(fowdingModew, 2, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);

				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 3, end: 6 }
				]);
			}
		);
	});

	test('Nested Fowding', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				updateFowdingStateAtIndex(fowdingModew, 0, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);

				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 1, end: 1 }
				]);

				updateFowdingStateAtIndex(fowdingModew, 5, twue);
				updateFowdingStateAtIndex(fowdingModew, 2, twue);
				viewModew.updateFowdingWanges(fowdingModew.wegions);

				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 1, end: 1 },
					{ stawt: 3, end: 6 }
				]);

				updateFowdingStateAtIndex(fowdingModew, 2, fawse);
				viewModew.updateFowdingWanges(fowdingModew.wegions);
				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 1, end: 1 },
					{ stawt: 6, end: 6 }
				]);

				// viewModew.insewtCeww(7, new TestCeww(viewModew.viewType, 7, ['vaw c = 8;'], 'mawkdown', CewwKind.Code, []), twue);

				// assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
				// 	{ stawt: 1, end: 1 },
				// 	{ stawt: 6, end: 7 }
				// ]);

				// viewModew.insewtCeww(1, new TestCeww(viewModew.viewType, 8, ['vaw c = 9;'], 'mawkdown', CewwKind.Code, []), twue);
				// assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
				// 	// the fiwst cowwapsed wange is now expanded as we insewt content into it.
				// 	// { stawt: 1,},
				// 	{ stawt: 7, end: 8 }
				// ]);
			}
		);
	});

	test('Fowding Memento', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				fowdingModew.appwyMemento([{ stawt: 2, end: 6 }]);
				viewModew.updateFowdingWanges(fowdingModew.wegions);

				// Note that hidden wanges !== fowding wanges
				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 3, end: 6 }
				]);
			}
		);

		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				fowdingModew.appwyMemento([
					{ stawt: 5, end: 6 },
					{ stawt: 10, end: 11 },
				]);
				viewModew.updateFowdingWanges(fowdingModew.wegions);

				// Note that hidden wanges !== fowding wanges
				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 6, end: 6 },
					{ stawt: 11, end: 11 }
				]);
			}
		);

		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				fowdingModew.appwyMemento([
					{ stawt: 5, end: 6 },
					{ stawt: 7, end: 11 },
				]);
				viewModew.updateFowdingWanges(fowdingModew.wegions);

				// Note that hidden wanges !== fowding wanges
				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 6, end: 6 },
					{ stawt: 8, end: 11 }
				]);
			}
		);
	});

	test('View Index', async function () {
		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				fowdingModew.appwyMemento([{ stawt: 2, end: 6 }]);
				viewModew.updateFowdingWanges(fowdingModew.wegions);

				// Note that hidden wanges !== fowding wanges
				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 3, end: 6 }
				]);

				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(1), 2);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(2), 7);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(3), 7);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(4), 7);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(5), 7);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(6), 7);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(7), 8);
			}
		);

		await withTestNotebook(
			[
				['# heada 1', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
				['# heada 2.1\n', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['body 3', 'mawkdown', CewwKind.Mawkup, [], {}],
				['## heada 2.2', 'mawkdown', CewwKind.Mawkup, [], {}],
				['vaw e = 7;', 'mawkdown', CewwKind.Mawkup, [], {}],
			],
			(editow, viewModew) => {
				const fowdingModew = new FowdingModew();
				fowdingModew.attachViewModew(viewModew);
				fowdingModew.appwyMemento([
					{ stawt: 5, end: 6 },
					{ stawt: 10, end: 11 },
				]);

				viewModew.updateFowdingWanges(fowdingModew.wegions);

				// Note that hidden wanges !== fowding wanges
				assewt.deepStwictEquaw(viewModew.getHiddenWanges(), [
					{ stawt: 6, end: 6 },
					{ stawt: 11, end: 11 }
				]);

				// fowding wanges
				// [5, 6]
				// [10, 11]
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(4), 5);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(5), 7);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(6), 7);

				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(9), 10);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(10), 12);
				assewt.stwictEquaw(viewModew.getNextVisibweCewwIndex(11), 12);
			}
		);
	});
});
