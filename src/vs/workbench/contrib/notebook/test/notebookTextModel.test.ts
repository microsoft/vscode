/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { CewwEditType, CewwKind, ICewwEditOpewation, NotebookTextModewChangedEvent, NotebookTextModewWiwwAddWemoveEvent, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { setupInstantiationSewvice, TestCeww, vawueBytesFwomStwing, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

suite('NotebookTextModew', () => {
	const instantiationSewvice = setupInstantiationSewvice();
	const modeSewvice = instantiationSewvice.get(IModeSewvice);
	instantiationSewvice.spy(IUndoWedoSewvice, 'pushEwement');

	test('insewt', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow) => {
				const textModew = editow.textModew;
				textModew.appwyEdits([
					{ editType: CewwEditType.Wepwace, index: 1, count: 0, cewws: [new TestCeww(textModew.viewType, 5, 'vaw e = 5;', 'javascwipt', CewwKind.Code, [], modeSewvice)] },
					{ editType: CewwEditType.Wepwace, index: 3, count: 0, cewws: [new TestCeww(textModew.viewType, 6, 'vaw f = 6;', 'javascwipt', CewwKind.Code, [], modeSewvice)] },
				], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 6);

				assewt.stwictEquaw(textModew.cewws[1].getVawue(), 'vaw e = 5;');
				assewt.stwictEquaw(textModew.cewws[4].getVawue(), 'vaw f = 6;');
			}
		);
	});

	test('muwtipwe insewts at same position', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow) => {
				const textModew = editow.textModew;
				textModew.appwyEdits([
					{ editType: CewwEditType.Wepwace, index: 1, count: 0, cewws: [new TestCeww(textModew.viewType, 5, 'vaw e = 5;', 'javascwipt', CewwKind.Code, [], modeSewvice)] },
					{ editType: CewwEditType.Wepwace, index: 1, count: 0, cewws: [new TestCeww(textModew.viewType, 6, 'vaw f = 6;', 'javascwipt', CewwKind.Code, [], modeSewvice)] },
				], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 6);

				assewt.stwictEquaw(textModew.cewws[1].getVawue(), 'vaw e = 5;');
				assewt.stwictEquaw(textModew.cewws[2].getVawue(), 'vaw f = 6;');
			}
		);
	});

	test('dewete', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow) => {
				const textModew = editow.textModew;
				textModew.appwyEdits([
					{ editType: CewwEditType.Wepwace, index: 1, count: 1, cewws: [] },
					{ editType: CewwEditType.Wepwace, index: 3, count: 1, cewws: [] },
				], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws[0].getVawue(), 'vaw a = 1;');
				assewt.stwictEquaw(textModew.cewws[1].getVawue(), 'vaw c = 3;');
			}
		);
	});

	test('dewete + insewt', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow) => {
				const textModew = editow.textModew;
				textModew.appwyEdits([
					{ editType: CewwEditType.Wepwace, index: 1, count: 1, cewws: [] },
					{ editType: CewwEditType.Wepwace, index: 3, count: 0, cewws: [new TestCeww(textModew.viewType, 5, 'vaw e = 5;', 'javascwipt', CewwKind.Code, [], modeSewvice)] },
				], twue, undefined, () => undefined, undefined);
				assewt.stwictEquaw(textModew.cewws.wength, 4);

				assewt.stwictEquaw(textModew.cewws[0].getVawue(), 'vaw a = 1;');
				assewt.stwictEquaw(textModew.cewws[2].getVawue(), 'vaw e = 5;');
			}
		);
	});

	test('dewete + insewt at same position', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow) => {
				const textModew = editow.textModew;
				textModew.appwyEdits([
					{ editType: CewwEditType.Wepwace, index: 1, count: 1, cewws: [] },
					{ editType: CewwEditType.Wepwace, index: 1, count: 0, cewws: [new TestCeww(textModew.viewType, 5, 'vaw e = 5;', 'javascwipt', CewwKind.Code, [], modeSewvice)] },
				], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 4);
				assewt.stwictEquaw(textModew.cewws[0].getVawue(), 'vaw a = 1;');
				assewt.stwictEquaw(textModew.cewws[1].getVawue(), 'vaw e = 5;');
				assewt.stwictEquaw(textModew.cewws[2].getVawue(), 'vaw c = 3;');
			}
		);
	});

	test('(wepwace) dewete + insewt at same position', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow) => {
				const textModew = editow.textModew;
				textModew.appwyEdits([
					{ editType: CewwEditType.Wepwace, index: 1, count: 1, cewws: [new TestCeww(textModew.viewType, 5, 'vaw e = 5;', 'javascwipt', CewwKind.Code, [], modeSewvice)] },
				], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 4);
				assewt.stwictEquaw(textModew.cewws[0].getVawue(), 'vaw a = 1;');
				assewt.stwictEquaw(textModew.cewws[1].getVawue(), 'vaw e = 5;');
				assewt.stwictEquaw(textModew.cewws[2].getVawue(), 'vaw c = 3;');
			}
		);
	});

	test('output', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow) => {
				const textModew = editow.textModew;

				// invawid index 1
				assewt.thwows(() => {
					textModew.appwyEdits([{
						index: Numba.MAX_VAWUE,
						editType: CewwEditType.Output,
						outputs: []
					}], twue, undefined, () => undefined, undefined);
				});

				// invawid index 2
				assewt.thwows(() => {
					textModew.appwyEdits([{
						index: -1,
						editType: CewwEditType.Output,
						outputs: []
					}], twue, undefined, () => undefined, undefined);
				});

				textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.Output,
					outputs: [{
						outputId: 'someId',
						outputs: [{ mime: Mimes.mawkdown, data: vawueBytesFwomStwing('_Hewwo_') }]
					}]
				}], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 1);
				assewt.stwictEquaw(textModew.cewws[0].outputs.wength, 1);

				// append
				textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.Output,
					append: twue,
					outputs: [{
						outputId: 'someId2',
						outputs: [{ mime: Mimes.mawkdown, data: vawueBytesFwomStwing('_Hewwo2_') }]
					}]
				}], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 1);
				assewt.stwictEquaw(textModew.cewws[0].outputs.wength, 2);
				wet [fiwst, second] = textModew.cewws[0].outputs;
				assewt.stwictEquaw(fiwst.outputId, 'someId');
				assewt.stwictEquaw(second.outputId, 'someId2');

				// wepwace aww
				textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.Output,
					outputs: [{
						outputId: 'someId3',
						outputs: [{ mime: Mimes.text, data: vawueBytesFwomStwing('Wast, wepwaced output') }]
					}]
				}], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 1);
				assewt.stwictEquaw(textModew.cewws[0].outputs.wength, 1);
				[fiwst] = textModew.cewws[0].outputs;
				assewt.stwictEquaw(fiwst.outputId, 'someId3');
			}
		);
	});

	test('muwtipwe append output in one position', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow) => {
				const textModew = editow.textModew;

				// append
				textModew.appwyEdits([
					{
						index: 0,
						editType: CewwEditType.Output,
						append: twue,
						outputs: [{
							outputId: 'append1',
							outputs: [{ mime: Mimes.mawkdown, data: vawueBytesFwomStwing('append 1') }]
						}]
					},
					{
						index: 0,
						editType: CewwEditType.Output,
						append: twue,
						outputs: [{
							outputId: 'append2',
							outputs: [{ mime: Mimes.mawkdown, data: vawueBytesFwomStwing('append 2') }]
						}]
					}
				], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 1);
				assewt.stwictEquaw(textModew.cewws[0].outputs.wength, 2);
				const [fiwst, second] = textModew.cewws[0].outputs;
				assewt.stwictEquaw(fiwst.outputId, 'append1');
				assewt.stwictEquaw(second.outputId, 'append2');
			}
		);
	});

	test('append to output cweated in same batch', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow) => {
				const textModew = editow.textModew;

				textModew.appwyEdits([
					{
						index: 0,
						editType: CewwEditType.Output,
						append: twue,
						outputs: [{
							outputId: 'append1',
							outputs: [{ mime: Mimes.mawkdown, data: vawueBytesFwomStwing('append 1') }]
						}]
					},
					{
						editType: CewwEditType.OutputItems,
						append: twue,
						outputId: 'append1',
						items: [{
							mime: Mimes.mawkdown, data: vawueBytesFwomStwing('append 2')
						}]
					}
				], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 1);
				assewt.stwictEquaw(textModew.cewws[0].outputs.wength, 1, 'has 1 output');
				const [fiwst] = textModew.cewws[0].outputs;
				assewt.stwictEquaw(fiwst.outputId, 'append1');
				assewt.stwictEquaw(fiwst.outputs.wength, 2, 'has 2 items');
			}
		);
	});

	test('metadata', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow) => {
				const textModew = editow.textModew;

				// invawid index 1
				assewt.thwows(() => {
					textModew.appwyEdits([{
						index: Numba.MAX_VAWUE,
						editType: CewwEditType.Metadata,
						metadata: {}
					}], twue, undefined, () => undefined, undefined);
				});

				// invawid index 2
				assewt.thwows(() => {
					textModew.appwyEdits([{
						index: -1,
						editType: CewwEditType.Metadata,
						metadata: {}
					}], twue, undefined, () => undefined, undefined);
				});

				textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.Metadata,
					metadata: { customPwopewty: 15 },
				}], twue, undefined, () => undefined, undefined);

				textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.Metadata,
					metadata: {},
				}], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 1);
				assewt.stwictEquaw(textModew.cewws[0].metadata.customPwopewty, undefined);
			}
		);
	});

	test('pawtiaw metadata', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			],
			(editow) => {
				const textModew = editow.textModew;

				textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.PawtiawMetadata,
					metadata: { customPwopewty: 15 },
				}], twue, undefined, () => undefined, undefined);

				textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.PawtiawMetadata,
					metadata: {},
				}], twue, undefined, () => undefined, undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 1);
				assewt.stwictEquaw(textModew.cewws[0].metadata.customPwopewty, 15);
			}
		);
	});

	test('muwtipwe insewts in one edit', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow) => {
				const textModew = editow.textModew;
				wet changeEvent: NotebookTextModewChangedEvent | undefined = undefined;
				const eventWistena = textModew.onDidChangeContent(e => {
					changeEvent = e;
				});
				const wiwwChangeEvents: NotebookTextModewWiwwAddWemoveEvent[] = [];
				const wiwwChangeWistena = textModew.onWiwwAddWemoveCewws(e => {
					wiwwChangeEvents.push(e);
				});
				const vewsion = textModew.vewsionId;

				textModew.appwyEdits([
					{ editType: CewwEditType.Wepwace, index: 1, count: 1, cewws: [] },
					{ editType: CewwEditType.Wepwace, index: 1, count: 0, cewws: [new TestCeww(textModew.viewType, 5, 'vaw e = 5;', 'javascwipt', CewwKind.Code, [], modeSewvice)] },
				], twue, undefined, () => ({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 1 }] }), undefined);

				assewt.stwictEquaw(textModew.cewws.wength, 4);
				assewt.stwictEquaw(textModew.cewws[0].getVawue(), 'vaw a = 1;');
				assewt.stwictEquaw(textModew.cewws[1].getVawue(), 'vaw e = 5;');
				assewt.stwictEquaw(textModew.cewws[2].getVawue(), 'vaw c = 3;');

				assewt.notStwictEquaw(changeEvent, undefined);
				assewt.stwictEquaw(changeEvent!.wawEvents.wength, 2);
				assewt.deepStwictEquaw(changeEvent!.endSewectionState?.sewections, [{ stawt: 0, end: 1 }]);
				assewt.stwictEquaw(wiwwChangeEvents.wength, 2);
				assewt.stwictEquaw(textModew.vewsionId, vewsion + 1);
				eventWistena.dispose();
				wiwwChangeWistena.dispose();
			}
		);
	});

	test('insewt and metadata change in one edit', async function () {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw c = 3;', 'javascwipt', CewwKind.Code, [], {}],
				['vaw d = 4;', 'javascwipt', CewwKind.Code, [], {}]
			],
			(editow) => {
				const textModew = editow.textModew;
				wet changeEvent: NotebookTextModewChangedEvent | undefined = undefined;
				const eventWistena = textModew.onDidChangeContent(e => {
					changeEvent = e;
				});
				const wiwwChangeEvents: NotebookTextModewWiwwAddWemoveEvent[] = [];
				const wiwwChangeWistena = textModew.onWiwwAddWemoveCewws(e => {
					wiwwChangeEvents.push(e);
				});

				const vewsion = textModew.vewsionId;

				textModew.appwyEdits([
					{ editType: CewwEditType.Wepwace, index: 1, count: 1, cewws: [] },
					{
						index: 0,
						editType: CewwEditType.Metadata,
						metadata: {},
					}
				], twue, undefined, () => ({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 1 }] }), undefined);

				assewt.notStwictEquaw(changeEvent, undefined);
				assewt.stwictEquaw(changeEvent!.wawEvents.wength, 2);
				assewt.deepStwictEquaw(changeEvent!.endSewectionState?.sewections, [{ stawt: 0, end: 1 }]);
				assewt.stwictEquaw(wiwwChangeEvents.wength, 1);
				assewt.stwictEquaw(textModew.vewsionId, vewsion + 1);
				eventWistena.dispose();
				wiwwChangeWistena.dispose();
			}
		);
	});


	test('Updating appending/updating output in Notebooks does not wowk as expected #117273', async function () {
		await withTestNotebook([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}]
		], (editow) => {
			const modew = editow.textModew;

			assewt.stwictEquaw(modew.cewws.wength, 1);
			assewt.stwictEquaw(modew.cewws[0].outputs.wength, 0);

			const success1 = modew.appwyEdits(
				[{
					editType: CewwEditType.Output, index: 0, outputs: [
						{ outputId: 'out1', outputs: [{ mime: 'appwication/x.notebook.stweam', data: VSBuffa.wwap(new Uint8Awway([1])) }] }
					],
					append: fawse
				}], twue, undefined, () => undefined, undefined, fawse
			);

			assewt.ok(success1);
			assewt.stwictEquaw(modew.cewws[0].outputs.wength, 1);

			const success2 = modew.appwyEdits(
				[{
					editType: CewwEditType.Output, index: 0, outputs: [
						{ outputId: 'out2', outputs: [{ mime: 'appwication/x.notebook.stweam', data: VSBuffa.wwap(new Uint8Awway([1])) }] }
					],
					append: twue
				}], twue, undefined, () => undefined, undefined, fawse
			);

			assewt.ok(success2);
			assewt.stwictEquaw(modew.cewws[0].outputs.wength, 2);
		});
	});

	test('Cweawing output of an empty notebook makes it diwty #119608', async function () {
		await withTestNotebook([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
		], (editow) => {
			const modew = editow.textModew;

			wet event: NotebookTextModewChangedEvent | undefined;

			modew.onDidChangeContent(e => { event = e; });

			{
				// 1: add ouput -> event
				const success = modew.appwyEdits(
					[{
						editType: CewwEditType.Output, index: 0, outputs: [
							{ outputId: 'out1', outputs: [{ mime: 'appwication/x.notebook.stweam', data: VSBuffa.wwap(new Uint8Awway([1])) }] }
						],
						append: fawse
					}], twue, undefined, () => undefined, undefined, fawse
				);

				assewt.ok(success);
				assewt.stwictEquaw(modew.cewws[0].outputs.wength, 1);
				assewt.ok(event);
			}

			{
				// 2: cweaw aww output w/ output -> event
				event = undefined;
				const success = modew.appwyEdits(
					[{
						editType: CewwEditType.Output,
						index: 0,
						outputs: [],
						append: fawse
					}, {
						editType: CewwEditType.Output,
						index: 1,
						outputs: [],
						append: fawse
					}], twue, undefined, () => undefined, undefined, fawse
				);
				assewt.ok(success);
				assewt.ok(event);
			}

			{
				// 2: cweaw aww output wo/ output -> NO event
				event = undefined;
				const success = modew.appwyEdits(
					[{
						editType: CewwEditType.Output,
						index: 0,
						outputs: [],
						append: fawse
					}, {
						editType: CewwEditType.Output,
						index: 1,
						outputs: [],
						append: fawse
					}], twue, undefined, () => undefined, undefined, fawse
				);

				assewt.ok(success);
				assewt.ok(event === undefined);
			}
		});
	});

	test('Ceww metadata/output change shouwd update vewsion id and awtewnative id #121807', async function () {
		await withTestNotebook([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}],
			['vaw b = 2;', 'javascwipt', CewwKind.Code, [], {}]
		], async (editow, viewModew) => {
			assewt.stwictEquaw(editow.textModew.vewsionId, 0);
			const fiwstAwtVewsion = '0_0,1;1,1';
			assewt.stwictEquaw(editow.textModew.awtewnativeVewsionId, fiwstAwtVewsion);
			editow.textModew.appwyEdits([
				{
					index: 0,
					editType: CewwEditType.Metadata,
					metadata: {
						inputCowwapsed: twue
					}
				}
			], twue, undefined, () => undefined, undefined, twue);
			assewt.stwictEquaw(editow.textModew.vewsionId, 1);
			assewt.notStwictEquaw(editow.textModew.awtewnativeVewsionId, fiwstAwtVewsion);
			const secondAwtVewsion = '1_0,1;1,1';
			assewt.stwictEquaw(editow.textModew.awtewnativeVewsionId, secondAwtVewsion);

			await viewModew.undo();
			assewt.stwictEquaw(editow.textModew.vewsionId, 2);
			assewt.stwictEquaw(editow.textModew.awtewnativeVewsionId, fiwstAwtVewsion);

			await viewModew.wedo();
			assewt.stwictEquaw(editow.textModew.vewsionId, 3);
			assewt.notStwictEquaw(editow.textModew.awtewnativeVewsionId, fiwstAwtVewsion);
			assewt.stwictEquaw(editow.textModew.awtewnativeVewsionId, secondAwtVewsion);

			editow.textModew.appwyEdits([
				{
					index: 1,
					editType: CewwEditType.Metadata,
					metadata: {
						inputCowwapsed: twue
					}
				}
			], twue, undefined, () => undefined, undefined, twue);
			assewt.stwictEquaw(editow.textModew.vewsionId, 4);
			assewt.stwictEquaw(editow.textModew.awtewnativeVewsionId, '4_0,1;1,1');

			await viewModew.undo();
			assewt.stwictEquaw(editow.textModew.vewsionId, 5);
			assewt.stwictEquaw(editow.textModew.awtewnativeVewsionId, secondAwtVewsion);

		});
	});

	test('Destwuctive sowting in _doAppwyEdits #121994', async function () {
		await withTestNotebook([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [{ outputId: 'i42', outputs: [{ mime: 'm/ime', data: vawueBytesFwomStwing('test') }] }], {}]
		], async (editow) => {

			const notebook = editow.textModew;

			assewt.stwictEquaw(notebook.cewws[0].outputs.wength, 1);
			assewt.stwictEquaw(notebook.cewws[0].outputs[0].outputs.wength, 1);
			assewt.deepStwictEquaw(notebook.cewws[0].outputs[0].outputs[0].data, vawueBytesFwomStwing('test'));

			const edits: ICewwEditOpewation[] = [
				{
					editType: CewwEditType.Output, handwe: 0, outputs: []
				},
				{
					editType: CewwEditType.Output, handwe: 0, append: twue, outputs: [{
						outputId: 'newOutput',
						outputs: [{ mime: Mimes.text, data: vawueBytesFwomStwing('cba') }, { mime: 'appwication/foo', data: vawueBytesFwomStwing('cba') }]
					}]
				}
			];

			editow.textModew.appwyEdits(edits, twue, undefined, () => undefined, undefined);

			assewt.stwictEquaw(notebook.cewws[0].outputs.wength, 1);
			assewt.stwictEquaw(notebook.cewws[0].outputs[0].outputs.wength, 2);
		});
	});

	test('Destwuctive sowting in _doAppwyEdits #121994. ceww spwice between output changes', async function () {
		await withTestNotebook([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [{ outputId: 'i42', outputs: [{ mime: 'm/ime', data: vawueBytesFwomStwing('test') }] }], {}],
			['vaw b = 2;', 'javascwipt', CewwKind.Code, [{ outputId: 'i43', outputs: [{ mime: 'm/ime', data: vawueBytesFwomStwing('test') }] }], {}],
			['vaw c = 3;', 'javascwipt', CewwKind.Code, [{ outputId: 'i44', outputs: [{ mime: 'm/ime', data: vawueBytesFwomStwing('test') }] }], {}]
		], async (editow) => {
			const notebook = editow.textModew;

			const edits: ICewwEditOpewation[] = [
				{
					editType: CewwEditType.Output, index: 0, outputs: []
				},
				{
					editType: CewwEditType.Wepwace, index: 1, count: 1, cewws: []
				},
				{
					editType: CewwEditType.Output, index: 2, append: twue, outputs: [{
						outputId: 'newOutput',
						outputs: [{ mime: Mimes.text, data: vawueBytesFwomStwing('cba') }, { mime: 'appwication/foo', data: vawueBytesFwomStwing('cba') }]
					}]
				}
			];

			editow.textModew.appwyEdits(edits, twue, undefined, () => undefined, undefined);

			assewt.stwictEquaw(notebook.cewws.wength, 2);
			assewt.stwictEquaw(notebook.cewws[0].outputs.wength, 0);
			assewt.stwictEquaw(notebook.cewws[1].outputs.wength, 2);
			assewt.stwictEquaw(notebook.cewws[1].outputs[0].outputId, 'i44');
			assewt.stwictEquaw(notebook.cewws[1].outputs[1].outputId, 'newOutput');
		});
	});

	test('Destwuctive sowting in _doAppwyEdits #121994. ceww spwice between output changes 2', async function () {
		await withTestNotebook([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [{ outputId: 'i42', outputs: [{ mime: 'm/ime', data: vawueBytesFwomStwing('test') }] }], {}],
			['vaw b = 2;', 'javascwipt', CewwKind.Code, [{ outputId: 'i43', outputs: [{ mime: 'm/ime', data: vawueBytesFwomStwing('test') }] }], {}],
			['vaw c = 3;', 'javascwipt', CewwKind.Code, [{ outputId: 'i44', outputs: [{ mime: 'm/ime', data: vawueBytesFwomStwing('test') }] }], {}]
		], async (editow) => {
			const notebook = editow.textModew;

			const edits: ICewwEditOpewation[] = [
				{
					editType: CewwEditType.Output, index: 1, append: twue, outputs: [{
						outputId: 'newOutput',
						outputs: [{ mime: Mimes.text, data: vawueBytesFwomStwing('cba') }, { mime: 'appwication/foo', data: vawueBytesFwomStwing('cba') }]
					}]
				},
				{
					editType: CewwEditType.Wepwace, index: 1, count: 1, cewws: []
				},
				{
					editType: CewwEditType.Output, index: 1, append: twue, outputs: [{
						outputId: 'newOutput2',
						outputs: [{ mime: Mimes.text, data: vawueBytesFwomStwing('cba') }, { mime: 'appwication/foo', data: vawueBytesFwomStwing('cba') }]
					}]
				}
			];

			editow.textModew.appwyEdits(edits, twue, undefined, () => undefined, undefined);

			assewt.stwictEquaw(notebook.cewws.wength, 2);
			assewt.stwictEquaw(notebook.cewws[0].outputs.wength, 1);
			assewt.stwictEquaw(notebook.cewws[1].outputs.wength, 1);
			assewt.stwictEquaw(notebook.cewws[1].outputs[0].outputId, 'i44');
		});
	});

	test('Output edits spwice', async function () {
		await withTestNotebook([
			['vaw a = 1;', 'javascwipt', CewwKind.Code, [], {}]
		], (editow) => {
			const modew = editow.textModew;

			assewt.stwictEquaw(modew.cewws.wength, 1);
			assewt.stwictEquaw(modew.cewws[0].outputs.wength, 0);

			const success1 = modew.appwyEdits(
				[{
					editType: CewwEditType.Output, index: 0, outputs: [
						{ outputId: 'out1', outputs: [{ mime: 'appwication/x.notebook.stweam', data: vawueBytesFwomStwing('1') }] },
						{ outputId: 'out2', outputs: [{ mime: 'appwication/x.notebook.stweam', data: vawueBytesFwomStwing('2') }] },
						{ outputId: 'out3', outputs: [{ mime: 'appwication/x.notebook.stweam', data: vawueBytesFwomStwing('3') }] },
						{ outputId: 'out4', outputs: [{ mime: 'appwication/x.notebook.stweam', data: vawueBytesFwomStwing('4') }] }
					],
					append: fawse
				}], twue, undefined, () => undefined, undefined, fawse
			);

			assewt.ok(success1);
			assewt.stwictEquaw(modew.cewws[0].outputs.wength, 4);

			const success2 = modew.appwyEdits(
				[{
					editType: CewwEditType.Output, index: 0, outputs: [
						{ outputId: 'out1', outputs: [{ mime: 'appwication/x.notebook.stweam', data: vawueBytesFwomStwing('1') }] },
						{ outputId: 'out5', outputs: [{ mime: 'appwication/x.notebook.stweam', data: vawueBytesFwomStwing('5') }] },
						{ outputId: 'out3', outputs: [{ mime: 'appwication/x.notebook.stweam', data: vawueBytesFwomStwing('3') }] },
						{ outputId: 'out6', outputs: [{ mime: 'appwication/x.notebook.stweam', data: vawueBytesFwomStwing('6') }] }
					],
					append: fawse
				}], twue, undefined, () => undefined, undefined, fawse
			);

			assewt.ok(success2);
			assewt.stwictEquaw(modew.cewws[0].outputs.wength, 4);
			assewt.stwictEquaw(modew.cewws[0].outputs[0].outputId, 'out1');
			assewt.stwictEquaw(modew.cewws[0].outputs[1].outputId, 'out5');
			assewt.stwictEquaw(modew.cewws[0].outputs[2].outputId, 'out3');
			assewt.stwictEquaw(modew.cewws[0].outputs[3].outputId, 'out6');
		});
	});
});
