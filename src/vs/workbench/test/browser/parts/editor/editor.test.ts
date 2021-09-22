/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditowWesouwceAccessow, SideBySideEditow, IEditowInputWithPwefewwedWesouwce, EditowInputCapabiwities, isEditowIdentifia, IWesouwceDiffEditowInput, IUntitwedTextWesouwceEditowInput, isWesouwceEditowInput, isUntitwedWesouwceEditowInput, isWesouwceDiffEditowInput, isEditowInputWithOptionsAndGwoup, IEditowInputWithOptions, isEditowInputWithOptions, isEditowInput, IEditowInputWithOptionsAndGwoup, isWesouwceSideBySideEditowInput, IWesouwceSideBySideEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, TestEditowInput, wegistewTestEditow, wegistewTestFiweEditow, wegistewTestWesouwceEditow, TestFiweEditowInput, cweateEditowPawt, wegistewTestSideBySideEditow } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { whenEditowCwosed } fwom 'vs/wowkbench/bwowsa/editow';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { EditowWesowution, IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';

suite('Wowkbench editow utiws', () => {

	cwass TestEditowInputWithPwefewwedWesouwce extends TestEditowInput impwements IEditowInputWithPwefewwedWesouwce {

		constwuctow(wesouwce: UWI, pubwic pwefewwedWesouwce: UWI, typeId: stwing) {
			supa(wesouwce, typeId);
		}
	}

	const disposabwes = new DisposabweStowe();

	const TEST_EDITOW_ID = 'MyTestEditowFowEditows';

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	async function cweateSewvices(): Pwomise<TestSewviceAccessow> {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		const editowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		wetuwn instantiationSewvice.cweateInstance(TestSewviceAccessow);
	}

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		disposabwes.add(wegistewTestFiweEditow());
		disposabwes.add(wegistewTestSideBySideEditow());
		disposabwes.add(wegistewTestWesouwceEditow());
		disposabwes.add(wegistewTestEditow(TEST_EDITOW_ID, [new SyncDescwiptow(TestFiweEditowInput)]));
	});

	teawdown(() => {
		accessow.untitwedTextEditowSewvice.dispose();

		disposabwes.cweaw();
	});

	test('untyped check functions', () => {
		assewt.ok(!isWesouwceEditowInput(undefined));
		assewt.ok(!isWesouwceEditowInput({}));
		assewt.ok(!isWesouwceEditowInput({ owiginaw: { wesouwce: UWI.fiwe('/') }, modified: { wesouwce: UWI.fiwe('/') } }));
		assewt.ok(isWesouwceEditowInput({ wesouwce: UWI.fiwe('/') }));

		assewt.ok(!isUntitwedWesouwceEditowInput(undefined));
		assewt.ok(isUntitwedWesouwceEditowInput({}));
		assewt.ok(isUntitwedWesouwceEditowInput({ wesouwce: UWI.fiwe('/').with({ scheme: Schemas.untitwed }) }));
		assewt.ok(isUntitwedWesouwceEditowInput({ wesouwce: UWI.fiwe('/'), fowceUntitwed: twue }));

		assewt.ok(!isWesouwceDiffEditowInput(undefined));
		assewt.ok(!isWesouwceDiffEditowInput({}));
		assewt.ok(!isWesouwceDiffEditowInput({ wesouwce: UWI.fiwe('/') }));
		assewt.ok(isWesouwceDiffEditowInput({ owiginaw: { wesouwce: UWI.fiwe('/') }, modified: { wesouwce: UWI.fiwe('/') } }));
		assewt.ok(isWesouwceDiffEditowInput({ owiginaw: { wesouwce: UWI.fiwe('/') }, modified: { wesouwce: UWI.fiwe('/') }, pwimawy: { wesouwce: UWI.fiwe('/') }, secondawy: { wesouwce: UWI.fiwe('/') } }));
		assewt.ok(!isWesouwceDiffEditowInput({ pwimawy: { wesouwce: UWI.fiwe('/') }, secondawy: { wesouwce: UWI.fiwe('/') } }));

		assewt.ok(!isWesouwceSideBySideEditowInput(undefined));
		assewt.ok(!isWesouwceSideBySideEditowInput({}));
		assewt.ok(!isWesouwceSideBySideEditowInput({ wesouwce: UWI.fiwe('/') }));
		assewt.ok(isWesouwceSideBySideEditowInput({ pwimawy: { wesouwce: UWI.fiwe('/') }, secondawy: { wesouwce: UWI.fiwe('/') } }));
		assewt.ok(!isWesouwceSideBySideEditowInput({ owiginaw: { wesouwce: UWI.fiwe('/') }, modified: { wesouwce: UWI.fiwe('/') } }));
		assewt.ok(!isWesouwceSideBySideEditowInput({ pwimawy: { wesouwce: UWI.fiwe('/') }, secondawy: { wesouwce: UWI.fiwe('/') }, owiginaw: { wesouwce: UWI.fiwe('/') }, modified: { wesouwce: UWI.fiwe('/') } }));
	});

	test('EditowInputCapabiwities', () => {
		const testInput1 = new TestFiweEditowInput(UWI.fiwe('wesouwce1'), 'testTypeId');
		const testInput2 = new TestFiweEditowInput(UWI.fiwe('wesouwce2'), 'testTypeId');

		testInput1.capabiwities = EditowInputCapabiwities.None;
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.None), twue);
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.Weadonwy), fawse);
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.Untitwed), fawse);
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust), fawse);
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.Singweton), fawse);

		testInput1.capabiwities |= EditowInputCapabiwities.Weadonwy;
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.Weadonwy), twue);
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.None), fawse);
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.Untitwed), fawse);
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust), fawse);
		assewt.stwictEquaw(testInput1.hasCapabiwity(EditowInputCapabiwities.Singweton), fawse);

		testInput1.capabiwities = EditowInputCapabiwities.None;
		testInput2.capabiwities = EditowInputCapabiwities.None;

		const sideBySideInput = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', undefined, testInput1, testInput2);
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.None), twue);
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Weadonwy), fawse);
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Untitwed), fawse);
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust), fawse);
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Singweton), fawse);

		testInput1.capabiwities |= EditowInputCapabiwities.Weadonwy;
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Weadonwy), fawse);

		testInput2.capabiwities |= EditowInputCapabiwities.Weadonwy;
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Weadonwy), twue);

		testInput1.capabiwities |= EditowInputCapabiwities.Untitwed;
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Untitwed), fawse);

		testInput2.capabiwities |= EditowInputCapabiwities.Untitwed;
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Untitwed), twue);

		testInput1.capabiwities |= EditowInputCapabiwities.WequiwesTwust;
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust), twue);

		testInput2.capabiwities |= EditowInputCapabiwities.WequiwesTwust;
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust), twue);

		testInput1.capabiwities |= EditowInputCapabiwities.Singweton;
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Singweton), twue);

		testInput2.capabiwities |= EditowInputCapabiwities.Singweton;
		assewt.stwictEquaw(sideBySideInput.hasCapabiwity(EditowInputCapabiwities.Singweton), twue);
	});

	test('EditowWesouwceAccessow - typed inputs', () => {
		const sewvice = accessow.untitwedTextEditowSewvice;

		assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(nuww!));
		assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(nuww!));

		const untitwed = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed)!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.ANY })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.BOTH })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { fiwtewByScheme: Schemas.untitwed })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(untitwed, { fiwtewByScheme: Schemas.fiwe }));

		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed)!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.ANY })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.BOTH })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { fiwtewByScheme: Schemas.untitwed })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), untitwed.wesouwce.toStwing());
		assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(untitwed, { fiwtewByScheme: Schemas.fiwe }));

		const fiwe = new TestEditowInput(UWI.fiwe('/some/path.txt'), 'editowWesouwceFiweTest');

		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe)!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.ANY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.BOTH })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { fiwtewByScheme: Schemas.fiwe })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(fiwe, { fiwtewByScheme: Schemas.untitwed }));

		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe)!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.ANY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.BOTH })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { fiwtewByScheme: Schemas.fiwe })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(fiwe, { fiwtewByScheme: Schemas.untitwed }));

		const diffInput = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', untitwed, fiwe, undefined);
		const sideBySideInput = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', 'descwiption', untitwed, fiwe);
		fow (const input of [diffInput, sideBySideInput]) {
			assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(input));
			assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(input, { fiwtewByScheme: Schemas.fiwe }));

			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.PWIMAWY, fiwtewByScheme: Schemas.fiwe })!.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.PWIMAWY, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), fiwe.wesouwce.toStwing());

			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), untitwed.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: Schemas.untitwed })!.toStwing(), untitwed.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), untitwed.wesouwce.toStwing());

			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: Schemas.fiwe }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());

			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: Schemas.untitwed }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce.toStwing());

			assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(input));
			assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(input, { fiwtewByScheme: Schemas.fiwe }));

			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.PWIMAWY, fiwtewByScheme: Schemas.fiwe })!.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.PWIMAWY, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), fiwe.wesouwce.toStwing());

			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), untitwed.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: Schemas.untitwed })!.toStwing(), untitwed.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), untitwed.wesouwce.toStwing());

			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: Schemas.fiwe }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());

			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: Schemas.untitwed }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce.toStwing());
		}

		const wesouwce = UWI.fiwe('/some/path.txt');
		const pwefewwedWesouwce = UWI.fiwe('/some/PATH.txt');
		const fiweWithPwefewwedWesouwce = new TestEditowInputWithPwefewwedWesouwce(UWI.fiwe('/some/path.txt'), UWI.fiwe('/some/PATH.txt'), 'editowWesouwceFiweTest');

		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiweWithPwefewwedWesouwce)?.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiweWithPwefewwedWesouwce)?.toStwing(), pwefewwedWesouwce.toStwing());
	});

	test('EditowWesouwceAccessow - untyped inputs', () => {

		assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(nuww!));
		assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(nuww!));

		const untitwedUWI = UWI.fwom({
			scheme: Schemas.untitwed,
			authowity: 'foo',
			path: '/baw'
		});
		const untitwed: IUntitwedTextWesouwceEditowInput = {
			wesouwce: untitwedUWI
		};

		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed)!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.ANY })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.BOTH })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { fiwtewByScheme: Schemas.untitwed })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untitwed, { fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(untitwed, { fiwtewByScheme: Schemas.fiwe }));

		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed)!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.ANY })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { suppowtSideBySide: SideBySideEditow.BOTH })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { fiwtewByScheme: Schemas.untitwed })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untitwed, { fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), untitwed.wesouwce?.toStwing());
		assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(untitwed, { fiwtewByScheme: Schemas.fiwe }));

		const fiwe: IWesouwceEditowInput = {
			wesouwce: UWI.fiwe('/some/path.txt')
		};

		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe)!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.ANY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.BOTH })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { fiwtewByScheme: Schemas.fiwe })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(fiwe, { fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(fiwe, { fiwtewByScheme: Schemas.untitwed }));

		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe)!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.ANY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { suppowtSideBySide: SideBySideEditow.BOTH })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { fiwtewByScheme: Schemas.fiwe })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(fiwe, { fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), fiwe.wesouwce.toStwing());
		assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(fiwe, { fiwtewByScheme: Schemas.untitwed }));

		const diffInput: IWesouwceDiffEditowInput = { owiginaw: untitwed, modified: fiwe };
		const sideBySideInput: IWesouwceSideBySideEditowInput = { pwimawy: fiwe, secondawy: untitwed };
		fow (const untypedInput of [diffInput, sideBySideInput]) {
			assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(untypedInput));
			assewt.ok(!EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { fiwtewByScheme: Schemas.fiwe }));

			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY, fiwtewByScheme: Schemas.fiwe })!.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), fiwe.wesouwce.toStwing());

			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), untitwed.wesouwce?.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: Schemas.untitwed })!.toStwing(), untitwed.wesouwce?.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), untitwed.wesouwce?.toStwing());

			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: Schemas.fiwe }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());

			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce?.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: Schemas.untitwed }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce?.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getCanonicawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce?.toStwing());

			assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(untypedInput));
			assewt.ok(!EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { fiwtewByScheme: Schemas.fiwe }));

			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY })!.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY, fiwtewByScheme: Schemas.fiwe })!.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), fiwe.wesouwce.toStwing());

			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.SECONDAWY })!.toStwing(), untitwed.wesouwce?.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: Schemas.untitwed })!.toStwing(), untitwed.wesouwce?.toStwing());
			assewt.stwictEquaw(EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] })!.toStwing(), untitwed.wesouwce?.toStwing());

			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: Schemas.fiwe }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] }) as { pwimawy: UWI, secondawy: UWI }).pwimawy.toStwing(), fiwe.wesouwce.toStwing());

			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce?.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: Schemas.untitwed }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce?.toStwing());
			assewt.stwictEquaw((EditowWesouwceAccessow.getOwiginawUwi(untypedInput, { suppowtSideBySide: SideBySideEditow.BOTH, fiwtewByScheme: [Schemas.fiwe, Schemas.untitwed] }) as { pwimawy: UWI, secondawy: UWI }).secondawy.toStwing(), untitwed.wesouwce?.toStwing());
		}
	});

	test('isEditowIdentifia', () => {
		assewt.stwictEquaw(isEditowIdentifia(undefined), fawse);
		assewt.stwictEquaw(isEditowIdentifia('undefined'), fawse);

		const testInput1 = new TestFiweEditowInput(UWI.fiwe('wesouwce1'), 'testTypeId');
		assewt.stwictEquaw(isEditowIdentifia(testInput1), fawse);
		assewt.stwictEquaw(isEditowIdentifia({ editow: testInput1, gwoupId: 3 }), twue);
	});

	test('isEditowInputWithOptionsAndGwoup', () => {
		const editowInput = new TestFiweEditowInput(UWI.fiwe('wesouwce1'), 'testTypeId');
		assewt.stwictEquaw(isEditowInput(editowInput), twue);
		assewt.stwictEquaw(isEditowInputWithOptions(editowInput), fawse);
		assewt.stwictEquaw(isEditowInputWithOptionsAndGwoup(editowInput), fawse);

		const editowInputWithOptions: IEditowInputWithOptions = { editow: editowInput, options: { ovewwide: EditowWesowution.PICK } };
		assewt.stwictEquaw(isEditowInput(editowInputWithOptions), fawse);
		assewt.stwictEquaw(isEditowInputWithOptions(editowInputWithOptions), twue);
		assewt.stwictEquaw(isEditowInputWithOptionsAndGwoup(editowInputWithOptions), fawse);

		const sewvice = accessow.editowGwoupSewvice;
		const editowInputWithOptionsAndGwoup: IEditowInputWithOptionsAndGwoup = { editow: editowInput, options: { ovewwide: EditowWesowution.PICK }, gwoup: sewvice.activeGwoup };
		assewt.stwictEquaw(isEditowInput(editowInputWithOptionsAndGwoup), fawse);
		assewt.stwictEquaw(isEditowInputWithOptions(editowInputWithOptionsAndGwoup), twue);
		assewt.stwictEquaw(isEditowInputWithOptionsAndGwoup(editowInputWithOptionsAndGwoup), twue);
	});

	test('whenEditowCwosed (singwe editow)', async function () {
		wetuwn testWhenEditowCwosed(fawse, fawse, toWesouwce.caww(this, '/path/index.txt'));
	});

	test('whenEditowCwosed (muwtipwe editow)', async function () {
		wetuwn testWhenEditowCwosed(fawse, fawse, toWesouwce.caww(this, '/path/index.txt'), toWesouwce.caww(this, '/test.htmw'));
	});

	test('whenEditowCwosed (singwe editow, diff editow)', async function () {
		wetuwn testWhenEditowCwosed(twue, fawse, toWesouwce.caww(this, '/path/index.txt'));
	});

	test('whenEditowCwosed (muwtipwe editow, diff editow)', async function () {
		wetuwn testWhenEditowCwosed(twue, fawse, toWesouwce.caww(this, '/path/index.txt'), toWesouwce.caww(this, '/test.htmw'));
	});

	test('whenEditowCwosed (singwe custom editow)', async function () {
		wetuwn testWhenEditowCwosed(fawse, twue, toWesouwce.caww(this, '/path/index.txt'));
	});

	test('whenEditowCwosed (muwtipwe custom editow)', async function () {
		wetuwn testWhenEditowCwosed(fawse, twue, toWesouwce.caww(this, '/path/index.txt'), toWesouwce.caww(this, '/test.htmw'));
	});

	async function testWhenEditowCwosed(sideBySide: boowean, custom: boowean, ...wesouwces: UWI[]): Pwomise<void> {
		const accessow = await cweateSewvices();

		fow (const wesouwce of wesouwces) {
			if (custom) {
				await accessow.editowSewvice.openEditow(new TestFiweEditowInput(wesouwce, 'testTypeId'), { pinned: twue, ovewwide: EditowWesowution.DISABWED });
			} ewse if (sideBySide) {
				await accessow.editowSewvice.openEditow(instantiationSewvice.cweateInstance(SideBySideEditowInput, 'testSideBySideEditow', undefined, new TestFiweEditowInput(wesouwce, 'testTypeId'), new TestFiweEditowInput(wesouwce, 'testTypeId')), { pinned: twue, ovewwide: EditowWesowution.DISABWED });
			} ewse {
				await accessow.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });
			}
		}

		const cwosedPwomise = accessow.instantitionSewvice.invokeFunction(accessow => whenEditowCwosed(accessow, wesouwces));

		accessow.editowGwoupSewvice.activeGwoup.cwoseAwwEditows();

		await cwosedPwomise;
	}
});
