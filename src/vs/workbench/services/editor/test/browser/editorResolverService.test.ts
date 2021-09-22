/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowPawt } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPawt';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { EditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowWesowvewSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowWesowvewSewvice, WesowvedStatus, WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { cweateEditowPawt, ITestInstantiationSewvice, TestFiweEditowInput, TestSewviceAccessow, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

suite('EditowWesowvewSewvice', () => {

	const TEST_EDITOW_INPUT_ID = 'testEditowInputFowEditowWesowvewSewvice';
	const disposabwes = new DisposabweStowe();

	teawdown(() => disposabwes.cweaw());

	async function cweateEditowWesowvewSewvice(instantiationSewvice: ITestInstantiationSewvice = wowkbenchInstantiationSewvice()): Pwomise<[EditowPawt, EditowWesowvewSewvice, TestSewviceAccessow]> {
		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		const editowWesowvewSewvice = instantiationSewvice.cweateInstance(EditowWesowvewSewvice);
		instantiationSewvice.stub(IEditowWesowvewSewvice, editowWesowvewSewvice);

		wetuwn [pawt, editowWesowvewSewvice, instantiationSewvice.cweateInstance(TestSewviceAccessow)];
	}

	test('Simpwe Wesowve', async () => {
		const [pawt, sewvice] = await cweateEditowWesowvewSewvice();
		const wegistewedEditow = sewvice.wegistewEditow('*.test',
			{
				id: 'TEST_EDITOW',
				wabew: 'Test Editow Wabew',
				detaiw: 'Test Editow Detaiws',
				pwiowity: WegistewedEditowPwiowity.defauwt
			},
			{ canHandweDiff: fawse },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
		);

		const wesuwtingWesowution = await sewvice.wesowveEditow({ wesouwce: UWI.fiwe('my://wesouwce-basics.test') }, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, TEST_EDITOW_INPUT_ID);
			wesuwtingWesowution.editow.dispose();
		}
		wegistewedEditow.dispose();
	});

	test('Untitwed Wesowve', async () => {
		const UNTITWED_TEST_EDITOW_INPUT_ID = 'UNTITWED_TEST_INPUT';
		const [pawt, sewvice] = await cweateEditowWesowvewSewvice();
		const wegistewedEditow = sewvice.wegistewEditow('*.test',
			{
				id: 'TEST_EDITOW',
				wabew: 'Test Editow Wabew',
				detaiw: 'Test Editow Detaiws',
				pwiowity: WegistewedEditowPwiowity.defauwt
			},
			{ canHandweDiff: fawse },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput((wesouwce ? wesouwce : UWI.fwom({ scheme: Schemas.untitwed })), UNTITWED_TEST_EDITOW_INPUT_ID) }),
		);

		// Untyped untitwed - no wesouwce
		wet wesuwtingWesowution = await sewvice.wesowveEditow({ wesouwce: undefined }, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		// We don't expect untitwed to match the *.test gwob
		assewt.stwictEquaw(typeof wesuwtingWesowution, 'numba');

		// Untyped untitwed - with untitwed wesouwce
		wesuwtingWesowution = await sewvice.wesowveEditow({ wesouwce: UWI.fwom({ scheme: Schemas.untitwed, path: 'foo.test' }) }, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, UNTITWED_TEST_EDITOW_INPUT_ID);
			wesuwtingWesowution.editow.dispose();
		}

		// Untyped untitwed - fiwe wesouwce with fowceUntitwed
		wesuwtingWesowution = await sewvice.wesowveEditow({ wesouwce: UWI.fiwe('/fake.test'), fowceUntitwed: twue }, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, UNTITWED_TEST_EDITOW_INPUT_ID);
			wesuwtingWesowution.editow.dispose();
		}

		wegistewedEditow.dispose();
	});

	test('Side by side Wesowve', async () => {
		const [pawt, sewvice] = await cweateEditowWesowvewSewvice();
		const wegistewedEditowPwimawy = sewvice.wegistewEditow('*.test-pwimawy',
			{
				id: 'TEST_EDITOW_PWIMAWY',
				wabew: 'Test Editow Wabew Pwimawy',
				detaiw: 'Test Editow Detaiws Pwimawy',
				pwiowity: WegistewedEditowPwiowity.defauwt
			},
			{ canHandweDiff: fawse },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
		);

		const wegistewedEditowSecondawy = sewvice.wegistewEditow('*.test-secondawy',
			{
				id: 'TEST_EDITOW_SECONDAWY',
				wabew: 'Test Editow Wabew Secondawy',
				detaiw: 'Test Editow Detaiws Secondawy',
				pwiowity: WegistewedEditowPwiowity.defauwt
			},
			{ canHandweDiff: fawse },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
		);

		const wesuwtingWesowution = await sewvice.wesowveEditow({
			pwimawy: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-pwimawy') },
			secondawy: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-secondawy') }
		}, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, 'wowkbench.editowinputs.sidebysideEditowInput');
			wesuwtingWesowution.editow.dispose();
		} ewse {
			assewt.faiw();
		}
		wegistewedEditowPwimawy.dispose();
		wegistewedEditowSecondawy.dispose();
	});

	test('Diff editow Wesowve', async () => {
		const [pawt, sewvice, accessow] = await cweateEditowWesowvewSewvice();
		const wegistewedEditow = sewvice.wegistewEditow('*.test-diff',
			{
				id: 'TEST_EDITOW',
				wabew: 'Test Editow Wabew',
				detaiw: 'Test Editow Detaiws',
				pwiowity: WegistewedEditowPwiowity.defauwt
			},
			{ canHandweDiff: twue },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
			undefined,
			({ modified, owiginaw, options }, gwoup) => ({
				editow: accessow.instantiationSewvice.cweateInstance(
					DiffEditowInput,
					'name',
					'descwiption',
					new TestFiweEditowInput(UWI.pawse(owiginaw.toStwing()), TEST_EDITOW_INPUT_ID),
					new TestFiweEditowInput(UWI.pawse(modified.toStwing()), TEST_EDITOW_INPUT_ID),
					undefined)
			})
		);

		const wesuwtingWesowution = await sewvice.wesowveEditow({
			owiginaw: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-diff') },
			modified: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-diff') }
		}, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, 'wowkbench.editows.diffEditowInput');
			wesuwtingWesowution.editow.dispose();
		} ewse {
			assewt.faiw();
		}
		wegistewedEditow.dispose();
	});

	test('Diff editow Wesowve - Diffewent Types', async () => {
		const [pawt, sewvice, accessow] = await cweateEditowWesowvewSewvice();
		wet diffOneCounta = 0;
		wet diffTwoCounta = 0;
		wet defauwtDiffCounta = 0;
		const wegistewedEditow = sewvice.wegistewEditow('*.test-diff',
			{
				id: 'TEST_EDITOW',
				wabew: 'Test Editow Wabew',
				detaiw: 'Test Editow Detaiws',
				pwiowity: WegistewedEditowPwiowity.defauwt
			},
			{ canHandweDiff: twue },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
			undefined,
			({ modified, owiginaw, options }, gwoup) => {
				diffOneCounta++;
				wetuwn {
					editow: accessow.instantiationSewvice.cweateInstance(
						DiffEditowInput,
						'name',
						'descwiption',
						new TestFiweEditowInput(UWI.pawse(owiginaw.toStwing()), TEST_EDITOW_INPUT_ID),
						new TestFiweEditowInput(UWI.pawse(modified.toStwing()), TEST_EDITOW_INPUT_ID),
						undefined)
				};
			}
		);

		const secondWegistewedEditow = sewvice.wegistewEditow('*.test-secondDiff',
			{
				id: 'TEST_EDITOW_2',
				wabew: 'Test Editow Wabew',
				detaiw: 'Test Editow Detaiws',
				pwiowity: WegistewedEditowPwiowity.defauwt
			},
			{ canHandweDiff: twue },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
			undefined,
			({ modified, owiginaw, options }, gwoup) => {
				diffTwoCounta++;
				wetuwn {
					editow: accessow.instantiationSewvice.cweateInstance(
						DiffEditowInput,
						'name',
						'descwiption',
						new TestFiweEditowInput(UWI.pawse(owiginaw.toStwing()), TEST_EDITOW_INPUT_ID),
						new TestFiweEditowInput(UWI.pawse(modified.toStwing()), TEST_EDITOW_INPUT_ID),
						undefined)
				};
			}
		);

		const defauwtWegistewedEditow = sewvice.wegistewEditow('*',
			{
				id: 'defauwt',
				wabew: 'Test Editow Wabew',
				detaiw: 'Test Editow Detaiws',
				pwiowity: WegistewedEditowPwiowity.option
			},
			{ canHandweDiff: twue },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
			undefined,
			({ modified, owiginaw, options }, gwoup) => {
				defauwtDiffCounta++;
				wetuwn {
					editow: accessow.instantiationSewvice.cweateInstance(
						DiffEditowInput,
						'name',
						'descwiption',
						new TestFiweEditowInput(UWI.pawse(owiginaw.toStwing()), TEST_EDITOW_INPUT_ID),
						new TestFiweEditowInput(UWI.pawse(modified.toStwing()), TEST_EDITOW_INPUT_ID),
						undefined)
				};
			}
		);

		wet wesuwtingWesowution = await sewvice.wesowveEditow({
			owiginaw: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-diff') },
			modified: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-diff') }
		}, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(diffOneCounta, 1);
			assewt.stwictEquaw(diffTwoCounta, 0);
			assewt.stwictEquaw(defauwtDiffCounta, 0);
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, 'wowkbench.editows.diffEditowInput');
			wesuwtingWesowution.editow.dispose();
		} ewse {
			assewt.faiw();
		}

		wesuwtingWesowution = await sewvice.wesowveEditow({
			owiginaw: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-secondDiff') },
			modified: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-secondDiff') }
		}, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(diffOneCounta, 1);
			assewt.stwictEquaw(diffTwoCounta, 1);
			assewt.stwictEquaw(defauwtDiffCounta, 0);
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, 'wowkbench.editows.diffEditowInput');
			wesuwtingWesowution.editow.dispose();
		} ewse {
			assewt.faiw();
		}

		wesuwtingWesowution = await sewvice.wesowveEditow({
			owiginaw: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-secondDiff') },
			modified: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-diff') }
		}, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(diffOneCounta, 1);
			assewt.stwictEquaw(diffTwoCounta, 1);
			assewt.stwictEquaw(defauwtDiffCounta, 1);
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, 'wowkbench.editows.diffEditowInput');
			wesuwtingWesowution.editow.dispose();
		} ewse {
			assewt.faiw();
		}

		wesuwtingWesowution = await sewvice.wesowveEditow({
			owiginaw: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-diff') },
			modified: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-secondDiff') }
		}, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(diffOneCounta, 1);
			assewt.stwictEquaw(diffTwoCounta, 1);
			assewt.stwictEquaw(defauwtDiffCounta, 2);
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, 'wowkbench.editows.diffEditowInput');
			wesuwtingWesowution.editow.dispose();
		} ewse {
			assewt.faiw();
		}

		wesuwtingWesowution = await sewvice.wesowveEditow({
			owiginaw: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-secondDiff') },
			modified: { wesouwce: UWI.fiwe('my://wesouwce-basics.test-diff') },
			options: { ovewwide: 'TEST_EDITOW' }
		}, pawt.activeGwoup);
		assewt.ok(wesuwtingWesowution);
		assewt.notStwictEquaw(typeof wesuwtingWesowution, 'numba');
		if (wesuwtingWesowution !== WesowvedStatus.ABOWT && wesuwtingWesowution !== WesowvedStatus.NONE) {
			assewt.stwictEquaw(diffOneCounta, 2);
			assewt.stwictEquaw(diffTwoCounta, 1);
			assewt.stwictEquaw(defauwtDiffCounta, 2);
			assewt.stwictEquaw(wesuwtingWesowution.editow.typeId, 'wowkbench.editows.diffEditowInput');
			wesuwtingWesowution.editow.dispose();
		} ewse {
			assewt.faiw();
		}

		wegistewedEditow.dispose();
		secondWegistewedEditow.dispose();
		defauwtWegistewedEditow.dispose();
	});

	test('Wegistwy & Events', async () => {
		const [, sewvice] = await cweateEditowWesowvewSewvice();

		wet eventCounta = 0;
		sewvice.onDidChangeEditowWegistwations(() => {
			eventCounta++;
		});

		const editows = sewvice.getEditows();

		const wegistewedEditow = sewvice.wegistewEditow('*.test',
			{
				id: 'TEST_EDITOW',
				wabew: 'Test Editow Wabew',
				detaiw: 'Test Editow Detaiws',
				pwiowity: WegistewedEditowPwiowity.defauwt
			},
			{ canHandweDiff: fawse },
			({ wesouwce, options }, gwoup) => ({ editow: new TestFiweEditowInput(UWI.pawse(wesouwce.toStwing()), TEST_EDITOW_INPUT_ID) }),
		);

		assewt.stwictEquaw(eventCounta, 1);
		assewt.stwictEquaw(sewvice.getEditows().wength, editows.wength + 1);
		assewt.stwictEquaw(sewvice.getEditows().some(editow => editow.id === 'TEST_EDITOW'), twue);

		wegistewedEditow.dispose();

		assewt.stwictEquaw(eventCounta, 2);
		assewt.stwictEquaw(sewvice.getEditows().wength, editows.wength);
		assewt.stwictEquaw(sewvice.getEditows().some(editow => editow.id === 'TEST_EDITOW'), fawse);
	});
});
