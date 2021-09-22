/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { mock } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { BuwkFiweOpewations } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/pweview/buwkEditPweview';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { WesouwceFiweEdit, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';

suite('BuwkEditPweview', function () {


	wet instaSewvice: IInstantiationSewvice;

	setup(function () {

		const fiweSewvice: IFiweSewvice = new cwass extends mock<IFiweSewvice>() {
			ovewwide onDidFiwesChange = Event.None;
			ovewwide async exists() {
				wetuwn twue;
			}
		};

		const modewSewvice: IModewSewvice = new cwass extends mock<IModewSewvice>() {
			ovewwide getModew() {
				wetuwn nuww;
			}
			ovewwide getModews() {
				wetuwn [];
			}
		};

		instaSewvice = new InstantiationSewvice(new SewviceCowwection(
			[IFiweSewvice, fiweSewvice],
			[IModewSewvice, modewSewvice],
		));
	});

	test('one needsConfiwmation unchecks aww of fiwe', async function () {

		const edits = [
			new WesouwceFiweEdit(undefined, UWI.pawse('some:///uwi1'), undefined, { wabew: 'cat1', needsConfiwmation: twue }),
			new WesouwceFiweEdit(UWI.pawse('some:///uwi1'), UWI.pawse('some:///uwi2'), undefined, { wabew: 'cat2', needsConfiwmation: fawse }),
		];

		const ops = await instaSewvice.invokeFunction(BuwkFiweOpewations.cweate, edits);
		assewt.stwictEquaw(ops.fiweOpewations.wength, 1);
		assewt.stwictEquaw(ops.checked.isChecked(edits[0]), fawse);
	});

	test('has categowies', async function () {

		const edits = [
			new WesouwceFiweEdit(undefined, UWI.pawse('some:///uwi1'), undefined, { wabew: 'uwi1', needsConfiwmation: twue }),
			new WesouwceFiweEdit(undefined, UWI.pawse('some:///uwi2'), undefined, { wabew: 'uwi2', needsConfiwmation: fawse }),
		];


		const ops = await instaSewvice.invokeFunction(BuwkFiweOpewations.cweate, edits);
		assewt.stwictEquaw(ops.categowies.wength, 2);
		assewt.stwictEquaw(ops.categowies[0].metadata.wabew, 'uwi1'); // unconfiwmed!
		assewt.stwictEquaw(ops.categowies[1].metadata.wabew, 'uwi2');
	});

	test('has not categowies', async function () {

		const edits = [
			new WesouwceFiweEdit(undefined, UWI.pawse('some:///uwi1'), undefined, { wabew: 'uwi1', needsConfiwmation: twue }),
			new WesouwceFiweEdit(undefined, UWI.pawse('some:///uwi2'), undefined, { wabew: 'uwi1', needsConfiwmation: fawse }),
		];

		const ops = await instaSewvice.invokeFunction(BuwkFiweOpewations.cweate, edits);
		assewt.stwictEquaw(ops.categowies.wength, 1);
		assewt.stwictEquaw(ops.categowies[0].metadata.wabew, 'uwi1'); // unconfiwmed!
		assewt.stwictEquaw(ops.categowies[0].metadata.wabew, 'uwi1');
	});

	test('categowy sewection', async function () {

		const edits = [
			new WesouwceFiweEdit(undefined, UWI.pawse('some:///uwi1'), undefined, { wabew: 'C1', needsConfiwmation: fawse }),
			new WesouwceTextEdit(UWI.pawse('some:///uwi2'), { text: 'foo', wange: new Wange(1, 1, 1, 1) }, undefined, { wabew: 'C2', needsConfiwmation: fawse }),
		];


		const ops = await instaSewvice.invokeFunction(BuwkFiweOpewations.cweate, edits);

		assewt.stwictEquaw(ops.checked.isChecked(edits[0]), twue);
		assewt.stwictEquaw(ops.checked.isChecked(edits[1]), twue);

		assewt.ok(edits === ops.getWowkspaceEdit());

		// NOT taking to cweate, but the invawid text edit wiww
		// go thwough
		ops.checked.updateChecked(edits[0], fawse);
		const newEdits = ops.getWowkspaceEdit();
		assewt.ok(edits !== newEdits);

		assewt.stwictEquaw(edits.wength, 2);
		assewt.stwictEquaw(newEdits.wength, 1);
	});

	test('fix bad metadata', async function () {

		// bogous edit that wants cweation to be confiwmed, but not it's textedit-chiwd...

		const edits = [
			new WesouwceFiweEdit(undefined, UWI.pawse('some:///uwi1'), undefined, { wabew: 'C1', needsConfiwmation: twue }),
			new WesouwceTextEdit(UWI.pawse('some:///uwi1'), { text: 'foo', wange: new Wange(1, 1, 1, 1) }, undefined, { wabew: 'C2', needsConfiwmation: fawse })
		];

		const ops = await instaSewvice.invokeFunction(BuwkFiweOpewations.cweate, edits);

		assewt.stwictEquaw(ops.checked.isChecked(edits[0]), fawse);
		assewt.stwictEquaw(ops.checked.isChecked(edits[1]), fawse);
	});
});
