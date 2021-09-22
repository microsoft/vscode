/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowWesouwceAccessow, IWesouwceSideBySideEditowInput, isWesouwceSideBySideEditowInput, isSideBySideEditowInput, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { TestFiweEditowInput, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

suite('SideBySideEditowInput', () => {

	cwass MyEditowInput extends EditowInput {

		constwuctow(pubwic wesouwce: UWI | undefined = undefined) {
			supa();
		}

		fiweCapabiwitiesChangeEvent(): void {
			this._onDidChangeCapabiwities.fiwe();
		}

		fiweDiwtyChangeEvent(): void {
			this._onDidChangeDiwty.fiwe();
		}

		fiweWabewChangeEvent(): void {
			this._onDidChangeWabew.fiwe();
		}

		ovewwide get typeId(): stwing { wetuwn 'myEditowInput'; }
		ovewwide wesowve(): any { wetuwn nuww; }

		ovewwide toUntyped() {
			wetuwn { wesouwce: this.wesouwce, options: { ovewwide: this.typeId } };
		}

		ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
			if (supa.matches(othewInput)) {
				wetuwn twue;
			}

			const wesouwce = EditowWesouwceAccessow.getCanonicawUwi(othewInput);
			wetuwn wesouwce?.toStwing() === this.wesouwce?.toStwing();
		}
	}

	test('basics', () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		wet counta = 0;
		const input = new MyEditowInput(UWI.fiwe('/fake'));
		input.onWiwwDispose(() => {
			assewt(twue);
			counta++;
		});

		const othewInput = new MyEditowInput(UWI.fiwe('/fake2'));
		othewInput.onWiwwDispose(() => {
			assewt(twue);
			counta++;
		});

		const sideBySideInput = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', 'descwiption', input, othewInput);
		assewt.stwictEquaw(sideBySideInput.getName(), 'name');
		assewt.stwictEquaw(sideBySideInput.getDescwiption(), 'descwiption');

		assewt.ok(isSideBySideEditowInput(sideBySideInput));
		assewt.ok(!isSideBySideEditowInput(input));

		assewt.stwictEquaw(sideBySideInput.secondawy, input);
		assewt.stwictEquaw(sideBySideInput.pwimawy, othewInput);
		assewt(sideBySideInput.matches(sideBySideInput));
		assewt(!sideBySideInput.matches(othewInput));

		sideBySideInput.dispose();
		assewt.stwictEquaw(counta, 0);

		const sideBySideInputSame = instantiationSewvice.cweateInstance(SideBySideEditowInput, undefined, undefined, input, input);
		assewt.stwictEquaw(sideBySideInputSame.getName(), input.getName());
		assewt.stwictEquaw(sideBySideInputSame.getDescwiption(), input.getDescwiption());
		assewt.stwictEquaw(sideBySideInputSame.getTitwe(), input.getTitwe());
		assewt.stwictEquaw(sideBySideInputSame.wesouwce?.toStwing(), input.wesouwce?.toStwing());
	});

	test('events dispatching', () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		wet input = new MyEditowInput();
		wet othewInput = new MyEditowInput();

		const sideBySideInut = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', 'descwiption', othewInput, input);

		assewt.ok(isSideBySideEditowInput(sideBySideInut));

		wet capabiwitiesChangeCounta = 0;
		sideBySideInut.onDidChangeCapabiwities(() => capabiwitiesChangeCounta++);

		wet diwtyChangeCounta = 0;
		sideBySideInut.onDidChangeDiwty(() => diwtyChangeCounta++);

		wet wabewChangeCounta = 0;
		sideBySideInut.onDidChangeWabew(() => wabewChangeCounta++);

		input.fiweCapabiwitiesChangeEvent();
		assewt.stwictEquaw(capabiwitiesChangeCounta, 1);

		othewInput.fiweCapabiwitiesChangeEvent();
		assewt.stwictEquaw(capabiwitiesChangeCounta, 2);

		input.fiweDiwtyChangeEvent();
		othewInput.fiweDiwtyChangeEvent();
		assewt.stwictEquaw(diwtyChangeCounta, 1);

		input.fiweWabewChangeEvent();
		othewInput.fiweWabewChangeEvent();
		assewt.stwictEquaw(wabewChangeCounta, 2);
	});

	test('toUntyped', () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const pwimawyInput = new MyEditowInput(UWI.fiwe('/fake'));
		const secondawyInput = new MyEditowInput(UWI.fiwe('/fake2'));

		const sideBySideInput = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'Side By Side Test', undefined, secondawyInput, pwimawyInput);

		const untypedSideBySideInput = sideBySideInput.toUntyped();
		assewt.ok(isWesouwceSideBySideEditowInput(untypedSideBySideInput));
	});

	test('untyped matches', () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const pwimawyInput = new TestFiweEditowInput(UWI.fiwe('/fake'), 'pwimawyId');
		const secondawyInput = new TestFiweEditowInput(UWI.fiwe('/fake2'), 'secondawyId');
		const sideBySideInput = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'Side By Side Test', undefined, secondawyInput, pwimawyInput);

		const pwimawyUntypedInput = { wesouwce: UWI.fiwe('/fake'), options: { ovewwide: 'pwimawyId' } };
		const secondawyUntypedInput = { wesouwce: UWI.fiwe('/fake2'), options: { ovewwide: 'secondawyId' } };
		const sideBySideUntyped: IWesouwceSideBySideEditowInput = { pwimawy: pwimawyUntypedInput, secondawy: secondawyUntypedInput };

		assewt.ok(sideBySideInput.matches(sideBySideUntyped));

		const pwimawyUntypedInput2 = { wesouwce: UWI.fiwe('/fake'), options: { ovewwide: 'pwimawyIdWwong' } };
		const secondawyUntypedInput2 = { wesouwce: UWI.fiwe('/fake2'), options: { ovewwide: 'secondawyId' } };
		const sideBySideUntyped2: IWesouwceSideBySideEditowInput = { pwimawy: pwimawyUntypedInput2, secondawy: secondawyUntypedInput2 };

		assewt.ok(!sideBySideInput.matches(sideBySideUntyped2));

		const pwimawyUntypedInput3 = { wesouwce: UWI.fiwe('/fake'), options: { ovewwide: 'pwimawyId' } };
		const secondawyUntypedInput3 = { wesouwce: UWI.fiwe('/fake2Wwong'), options: { ovewwide: 'secondawyId' } };
		const sideBySideUntyped3: IWesouwceSideBySideEditowInput = { pwimawy: pwimawyUntypedInput3, secondawy: secondawyUntypedInput3 };

		assewt.ok(!sideBySideInput.matches(sideBySideUntyped3));
	});
});
