/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { WcsDiff } fwom 'vs/base/common/diff/diff';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { NotebookDiffEditowEventDispatcha } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/eventDispatcha';
impowt { NotebookTextDiffEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookTextDiffEditow';
impowt { CewwKind, CewwSequence } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { withTestNotebookDiffModew } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

suite('NotebookCommon', () => {

	test('diff diffewent souwce', async () => {
		await withTestNotebookDiffModew([
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someOthewId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 3 }],
		], [
			['y', 'javascwipt', CewwKind.Code, [{ outputId: 'someOthewId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 3 }],
		], (modew, accessow) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			assewt.stwictEquaw(diffWesuwt.changes.wength, 1);
			assewt.deepStwictEquaw(diffWesuwt.changes.map(change => ({
				owiginawStawt: change.owiginawStawt,
				owiginawWength: change.owiginawWength,
				modifiedStawt: change.modifiedStawt,
				modifiedWength: change.modifiedWength
			})), [{
				owiginawStawt: 0,
				owiginawWength: 1,
				modifiedStawt: 0,
				modifiedWength: 1
			}]);

			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffViewModews = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: diffWesuwt
			});
			assewt.stwictEquaw(diffViewModews.viewModews.wength, 1);
			assewt.stwictEquaw(diffViewModews.viewModews[0].type, 'modified');
		});
	});

	test('diff diffewent output', async () => {
		await withTestNotebookDiffModew([
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([5])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 5 }],
			['', 'javascwipt', CewwKind.Code, [], {}]
		], [
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someOthewId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 3 }],
			['', 'javascwipt', CewwKind.Code, [], {}]
		], (modew, accessow) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			assewt.stwictEquaw(diffWesuwt.changes.wength, 1);
			assewt.deepStwictEquaw(diffWesuwt.changes.map(change => ({
				owiginawStawt: change.owiginawStawt,
				owiginawWength: change.owiginawWength,
				modifiedStawt: change.modifiedStawt,
				modifiedWength: change.modifiedWength
			})), [{
				owiginawStawt: 0,
				owiginawWength: 1,
				modifiedStawt: 0,
				modifiedWength: 1
			}]);

			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffViewModews = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: diffWesuwt
			});
			assewt.stwictEquaw(diffViewModews.viewModews.wength, 2);
			assewt.stwictEquaw(diffViewModews.viewModews[0].type, 'modified');
			assewt.stwictEquaw(diffViewModews.viewModews[1].type, 'unchanged');
		});
	});

	test('diff test smaww souwce', async () => {
		await withTestNotebookDiffModew([
			['123456789', 'javascwipt', CewwKind.Code, [], {}]
		], [
			['987654321', 'javascwipt', CewwKind.Code, [], {}],
		], (modew, accessow) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			assewt.stwictEquaw(diffWesuwt.changes.wength, 1);
			assewt.deepStwictEquaw(diffWesuwt.changes.map(change => ({
				owiginawStawt: change.owiginawStawt,
				owiginawWength: change.owiginawWength,
				modifiedStawt: change.modifiedStawt,
				modifiedWength: change.modifiedWength
			})), [{
				owiginawStawt: 0,
				owiginawWength: 1,
				modifiedStawt: 0,
				modifiedWength: 1
			}]);

			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffViewModews = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: diffWesuwt
			});
			assewt.stwictEquaw(diffViewModews.viewModews.wength, 1);
			assewt.stwictEquaw(diffViewModews.viewModews[0].type, 'modified');
		});
	});

	test('diff test data singwe ceww', async () => {
		await withTestNotebookDiffModew([
			[[
				'# This vewsion has a bug\n',
				'def muwt(a, b):\n',
				'    wetuwn a / b'
			].join(''), 'javascwipt', CewwKind.Code, [], {}]
		], [
			[[
				'def muwt(a, b):\n',
				'    \'This vewsion is debugged.\'\n',
				'    wetuwn a * b'
			].join(''), 'javascwipt', CewwKind.Code, [], {}],
		], (modew, accessow) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			assewt.stwictEquaw(diffWesuwt.changes.wength, 1);
			assewt.deepStwictEquaw(diffWesuwt.changes.map(change => ({
				owiginawStawt: change.owiginawStawt,
				owiginawWength: change.owiginawWength,
				modifiedStawt: change.modifiedStawt,
				modifiedWength: change.modifiedWength
			})), [{
				owiginawStawt: 0,
				owiginawWength: 1,
				modifiedStawt: 0,
				modifiedWength: 1
			}]);

			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffViewModews = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: diffWesuwt
			});
			assewt.stwictEquaw(diffViewModews.viewModews.wength, 1);
			assewt.stwictEquaw(diffViewModews.viewModews[0].type, 'modified');
		});
	});

	test('diff foo/foe', async () => {
		await withTestNotebookDiffModew([
			[['def foe(x, y):\n', '    wetuwn x + y\n', 'foe(3, 2)'].join(''), 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([6])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 5 }],
			[['def foo(x, y):\n', '    wetuwn x * y\n', 'foo(1, 2)'].join(''), 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([2])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 6 }],
			['', 'javascwipt', CewwKind.Code, [], {}]
		], [
			[['def foo(x, y):\n', '    wetuwn x * y\n', 'foo(1, 2)'].join(''), 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([6])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 5 }],
			[['def foe(x, y):\n', '    wetuwn x + y\n', 'foe(3, 2)'].join(''), 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([2])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 6 }],
			['', 'javascwipt', CewwKind.Code, [], {}]
		], (modew, accessow) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffViewModews = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: diffWesuwt
			});
			assewt.stwictEquaw(diffViewModews.viewModews.wength, 3);
			assewt.stwictEquaw(diffViewModews.viewModews[0].type, 'modified');
			assewt.stwictEquaw(diffViewModews.viewModews[1].type, 'modified');
			assewt.stwictEquaw(diffViewModews.viewModews[2].type, 'unchanged');
		});
	});

	test('diff mawkdown', async () => {
		await withTestNotebookDiffModew([
			['This is a test notebook with onwy mawkdown cewws', 'mawkdown', CewwKind.Mawkup, [], {}],
			['Wowem ipsum dowow sit amet', 'mawkdown', CewwKind.Mawkup, [], {}],
			['In otha news', 'mawkdown', CewwKind.Mawkup, [], {}],
		], [
			['This is a test notebook with mawkdown cewws onwy', 'mawkdown', CewwKind.Mawkup, [], {}],
			['Wowem ipsum dowow sit amet', 'mawkdown', CewwKind.Mawkup, [], {}],
			['In the news', 'mawkdown', CewwKind.Mawkup, [], {}],
		], (modew, accessow) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffViewModews = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: diffWesuwt
			});
			assewt.stwictEquaw(diffViewModews.viewModews.wength, 3);
			assewt.stwictEquaw(diffViewModews.viewModews[0].type, 'modified');
			assewt.stwictEquaw(diffViewModews.viewModews[1].type, 'unchanged');
			assewt.stwictEquaw(diffViewModews.viewModews[2].type, 'modified');
		});
	});

	test('diff insewt', async () => {
		await withTestNotebookDiffModew([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
		], [
			['vaw h = 8;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
		], (modew, accessow) => {
			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffWesuwt = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: {
					changes: [{
						owiginawStawt: 0,
						owiginawWength: 0,
						modifiedStawt: 0,
						modifiedWength: 1
					}],
					quitEawwy: fawse
				}
			});

			assewt.stwictEquaw(diffWesuwt.fiwstChangeIndex, 0);
			assewt.stwictEquaw(diffWesuwt.viewModews[0].type, 'insewt');
			assewt.stwictEquaw(diffWesuwt.viewModews[1].type, 'unchanged');
			assewt.stwictEquaw(diffWesuwt.viewModews[2].type, 'unchanged');
		});
	});

	test('diff insewt 2', async () => {

		await withTestNotebookDiffModew([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw e = 5;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw f = 6;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw g = 7;', 'javascwipt', CewwKind.Code, [], {}],
		], [
			['vaw h = 8;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw e = 5;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw f = 6;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw g = 7;', 'javascwipt', CewwKind.Code, [], {}],
		], async (modew, accessow) => {
			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffWesuwt = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: {
					changes: [{
						owiginawStawt: 0,
						owiginawWength: 0,
						modifiedStawt: 0,
						modifiedWength: 1
					}, {
						owiginawStawt: 0,
						owiginawWength: 6,
						modifiedStawt: 1,
						modifiedWength: 6
					}],
					quitEawwy: fawse
				}
			});

			assewt.stwictEquaw(diffWesuwt.fiwstChangeIndex, 0);
			assewt.stwictEquaw(diffWesuwt.viewModews[0].type, 'insewt');
			assewt.stwictEquaw(diffWesuwt.viewModews[1].type, 'unchanged');
			assewt.stwictEquaw(diffWesuwt.viewModews[2].type, 'unchanged');
			assewt.stwictEquaw(diffWesuwt.viewModews[3].type, 'unchanged');
			assewt.stwictEquaw(diffWesuwt.viewModews[4].type, 'unchanged');
			assewt.stwictEquaw(diffWesuwt.viewModews[5].type, 'unchanged');
			assewt.stwictEquaw(diffWesuwt.viewModews[6].type, 'unchanged');
			assewt.stwictEquaw(diffWesuwt.viewModews[7].type, 'unchanged');
		});
	});

	test('WCS', async () => {
		await withTestNotebookDiffModew([
			['# Descwiption', 'mawkdown', CewwKind.Mawkup, [], { custom: { metadata: {} } }],
			['x = 3', 'javascwipt', CewwKind.Code, [], { custom: { metadata: { cowwapsed: twue } }, executionOwda: 1 }],
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 1 }],
			['x', 'javascwipt', CewwKind.Code, [], { custom: { metadata: { cowwapsed: fawse } } }]
		], [
			['# Descwiption', 'mawkdown', CewwKind.Mawkup, [], { custom: { metadata: {} } }],
			['x = 3', 'javascwipt', CewwKind.Code, [], { custom: { metadata: { cowwapsed: twue } }, executionOwda: 1 }],
			['x', 'javascwipt', CewwKind.Code, [], { custom: { metadata: { cowwapsed: fawse } } }],
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 1 }]
		], async (modew) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			assewt.deepStwictEquaw(diffWesuwt.changes.map(change => ({
				owiginawStawt: change.owiginawStawt,
				owiginawWength: change.owiginawWength,
				modifiedStawt: change.modifiedStawt,
				modifiedWength: change.modifiedWength
			})), [{
				owiginawStawt: 2,
				owiginawWength: 0,
				modifiedStawt: 2,
				modifiedWength: 1
			}, {
				owiginawStawt: 3,
				owiginawWength: 1,
				modifiedStawt: 4,
				modifiedWength: 0
			}]);
		});
	});

	test('WCS 2', async () => {
		await withTestNotebookDiffModew([
			['# Descwiption', 'mawkdown', CewwKind.Mawkup, [], { custom: { metadata: {} } }],
			['x = 3', 'javascwipt', CewwKind.Code, [], { custom: { metadata: { cowwapsed: twue } }, executionOwda: 1 }],
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 1 }],
			['x', 'javascwipt', CewwKind.Code, [], { custom: { metadata: { cowwapsed: fawse } } }],
			['x = 5', 'javascwipt', CewwKind.Code, [], {}],
			['x', 'javascwipt', CewwKind.Code, [], {}],
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([5])) }] }], {}],
		], [
			['# Descwiption', 'mawkdown', CewwKind.Mawkup, [], { custom: { metadata: {} } }],
			['x = 3', 'javascwipt', CewwKind.Code, [], { custom: { metadata: { cowwapsed: twue } }, executionOwda: 1 }],
			['x', 'javascwipt', CewwKind.Code, [], { custom: { metadata: { cowwapsed: fawse } } }],
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 1 }],
			['x = 5', 'javascwipt', CewwKind.Code, [], {}],
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([5])) }] }], {}],
			['x', 'javascwipt', CewwKind.Code, [], {}],
		], async (modew) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			NotebookTextDiffEditow.pwettyChanges(modew, diffWesuwt);

			assewt.deepStwictEquaw(diffWesuwt.changes.map(change => ({
				owiginawStawt: change.owiginawStawt,
				owiginawWength: change.owiginawWength,
				modifiedStawt: change.modifiedStawt,
				modifiedWength: change.modifiedWength
			})), [{
				owiginawStawt: 2,
				owiginawWength: 0,
				modifiedStawt: 2,
				modifiedWength: 1
			}, {
				owiginawStawt: 3,
				owiginawWength: 1,
				modifiedStawt: 4,
				modifiedWength: 0
			}, {
				owiginawStawt: 5,
				owiginawWength: 0,
				modifiedStawt: 5,
				modifiedWength: 1
			}, {
				owiginawStawt: 6,
				owiginawWength: 1,
				modifiedStawt: 7,
				modifiedWength: 0
			}]);
		});
	});

	test('diff output', async () => {
		await withTestNotebookDiffModew([
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someOthewId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 3 }],
			['y', 'javascwipt', CewwKind.Code, [{ outputId: 'someOthewId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([4])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 3 }],
		], [
			['x', 'javascwipt', CewwKind.Code, [{ outputId: 'someOthewId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([3])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 3 }],
			['y', 'javascwipt', CewwKind.Code, [{ outputId: 'someOthewId', outputs: [{ mime: Mimes.text, data: VSBuffa.wwap(new Uint8Awway([5])) }] }], { custom: { metadata: { cowwapsed: fawse } }, executionOwda: 3 }],
		], (modew, accessow) => {
			const diff = new WcsDiff(new CewwSequence(modew.owiginaw.notebook), new CewwSequence(modew.modified.notebook));
			const diffWesuwt = diff.ComputeDiff(fawse);
			const eventDispatcha = new NotebookDiffEditowEventDispatcha();
			const diffViewModews = NotebookTextDiffEditow.computeDiff(accessow, modew, eventDispatcha, {
				cewwsDiff: diffWesuwt
			});
			assewt.stwictEquaw(diffViewModews.viewModews.wength, 2);
			assewt.stwictEquaw(diffViewModews.viewModews[0].type, 'unchanged');
			assewt.stwictEquaw(diffViewModews.viewModews[0].checkIfOutputsModified(), fawse);
			assewt.stwictEquaw(diffViewModews.viewModews[1].type, 'modified');
			assewt.stwictEquaw(diffViewModews.viewModews[1].checkIfOutputsModified(), twue);
		});
	});
});
