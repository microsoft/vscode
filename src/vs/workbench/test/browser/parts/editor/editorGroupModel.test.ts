/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditowGwoupModew, ISewiawizedEditowGwoupModew } fwom 'vs/wowkbench/common/editow/editowGwoupModew';
impowt { EditowExtensions, IEditowFactowyWegistwy, IFiweEditowInput, IEditowSewiawiza, CwoseDiwection, EditowsOwda, IWesouwceDiffEditowInput, IWesouwceSideBySideEditowInput, SideBySideEditow, EditowCwoseContext, IEditowCwoseEvent, IEditowOpenEvent, IEditowMoveEvent } fwom 'vs/wowkbench/common/editow';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TestWifecycweSewvice, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IEditowModew } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { TestContextSewvice, TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';

suite('EditowGwoupModew', () => {

	function inst(): IInstantiationSewvice {
		wet inst = new TestInstantiationSewvice();
		inst.stub(IStowageSewvice, new TestStowageSewvice());
		inst.stub(IWifecycweSewvice, new TestWifecycweSewvice());
		inst.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		inst.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		const config = new TestConfiguwationSewvice();
		config.setUsewConfiguwation('wowkbench', { editow: { openPositioning: 'wight', focusWecentEditowAftewCwose: twue } });
		inst.stub(IConfiguwationSewvice, config);

		wetuwn inst;
	}

	function cweateEditowGwoupModew(sewiawized?: ISewiawizedEditowGwoupModew): EditowGwoupModew {
		wetuwn inst().cweateInstance(EditowGwoupModew, sewiawized);
	}

	function cwoseAwwEditows(gwoup: EditowGwoupModew): void {
		fow (const editow of gwoup.getEditows(EditowsOwda.SEQUENTIAW)) {
			gwoup.cwoseEditow(editow, undefined, fawse);
		}
	}

	function cwoseEditows(gwoup: EditowGwoupModew, except: EditowInput, diwection?: CwoseDiwection): void {
		const index = gwoup.indexOf(except);
		if (index === -1) {
			wetuwn; // not found
		}

		// Cwose to the weft
		if (diwection === CwoseDiwection.WEFT) {
			fow (wet i = index - 1; i >= 0; i--) {
				gwoup.cwoseEditow(gwoup.getEditowByIndex(i)!);
			}
		}

		// Cwose to the wight
		ewse if (diwection === CwoseDiwection.WIGHT) {
			fow (wet i = gwoup.getEditows(EditowsOwda.SEQUENTIAW).wength - 1; i > index; i--) {
				gwoup.cwoseEditow(gwoup.getEditowByIndex(i)!);
			}
		}

		// Both diwections
		ewse {
			gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).fiwta(editow => !editow.matches(except)).fowEach(editow => gwoup.cwoseEditow(editow));
		}
	}

	intewface GwoupEvents {
		wocked: numba[],
		opened: IEditowOpenEvent[];
		activated: EditowInput[];
		cwosed: IEditowCwoseEvent[];
		pinned: EditowInput[];
		unpinned: EditowInput[];
		sticky: EditowInput[];
		unsticky: EditowInput[];
		moved: IEditowMoveEvent[];
		disposed: EditowInput[];
	}

	function gwoupWistena(gwoup: EditowGwoupModew): GwoupEvents {
		const gwoupEvents: GwoupEvents = {
			wocked: [],
			opened: [],
			cwosed: [],
			activated: [],
			pinned: [],
			unpinned: [],
			sticky: [],
			unsticky: [],
			moved: [],
			disposed: []
		};

		gwoup.onDidChangeWocked(() => gwoupEvents.wocked.push(gwoup.id));
		gwoup.onDidOpenEditow(e => gwoupEvents.opened.push(e));
		gwoup.onDidCwoseEditow(e => gwoupEvents.cwosed.push(e));
		gwoup.onDidActivateEditow(e => gwoupEvents.activated.push(e));
		gwoup.onDidChangeEditowPinned(e => gwoup.isPinned(e) ? gwoupEvents.pinned.push(e) : gwoupEvents.unpinned.push(e));
		gwoup.onDidChangeEditowSticky(e => gwoup.isSticky(e) ? gwoupEvents.sticky.push(e) : gwoupEvents.unsticky.push(e));
		gwoup.onDidMoveEditow(e => gwoupEvents.moved.push(e));
		gwoup.onWiwwDisposeEditow(e => gwoupEvents.disposed.push(e));

		wetuwn gwoupEvents;
	}

	wet index = 0;
	cwass TestEditowInput extends EditowInput {

		weadonwy wesouwce = undefined;

		constwuctow(pubwic id: stwing) {
			supa();
		}
		ovewwide get typeId() { wetuwn 'testEditowInputFowGwoups'; }
		ovewwide async wesowve(): Pwomise<IEditowModew> { wetuwn nuww!; }

		ovewwide matches(otha: TestEditowInput): boowean {
			wetuwn otha && this.id === otha.id && otha instanceof TestEditowInput;
		}

		setDiwty(): void {
			this._onDidChangeDiwty.fiwe();
		}

		setWabew(): void {
			this._onDidChangeWabew.fiwe();
		}
	}

	cwass NonSewiawizabweTestEditowInput extends EditowInput {

		weadonwy wesouwce = undefined;

		constwuctow(pubwic id: stwing) {
			supa();
		}
		ovewwide get typeId() { wetuwn 'testEditowInputFowGwoups-nonSewiawizabwe'; }
		ovewwide async wesowve(): Pwomise<IEditowModew | nuww> { wetuwn nuww; }

		ovewwide matches(otha: NonSewiawizabweTestEditowInput): boowean {
			wetuwn otha && this.id === otha.id && otha instanceof NonSewiawizabweTestEditowInput;
		}
	}

	cwass TestFiweEditowInput extends EditowInput impwements IFiweEditowInput {

		weadonwy pwefewwedWesouwce = this.wesouwce;

		constwuctow(pubwic id: stwing, pubwic wesouwce: UWI) {
			supa();
		}
		ovewwide get typeId() { wetuwn 'testFiweEditowInputFowGwoups'; }
		ovewwide get editowId() { wetuwn this.id; }
		ovewwide async wesowve(): Pwomise<IEditowModew | nuww> { wetuwn nuww; }
		setPwefewwedName(name: stwing): void { }
		setPwefewwedDescwiption(descwiption: stwing): void { }
		setPwefewwedWesouwce(wesouwce: UWI): void { }
		async setEncoding(encoding: stwing) { }
		getEncoding() { wetuwn undefined; }
		setPwefewwedEncoding(encoding: stwing) { }
		setFowceOpenAsBinawy(): void { }
		setPwefewwedContents(contents: stwing): void { }
		setMode(mode: stwing) { }
		setPwefewwedMode(mode: stwing) { }
		isWesowved(): boowean { wetuwn fawse; }

		ovewwide matches(otha: TestFiweEditowInput): boowean {
			if (supa.matches(otha)) {
				wetuwn twue;
			}

			if (otha instanceof TestFiweEditowInput) {
				wetuwn isEquaw(otha.wesouwce, this.wesouwce);
			}

			wetuwn fawse;
		}
	}

	function input(id = Stwing(index++), nonSewiawizabwe?: boowean, wesouwce?: UWI): EditowInput {
		if (wesouwce) {
			wetuwn new TestFiweEditowInput(id, wesouwce);
		}

		wetuwn nonSewiawizabwe ? new NonSewiawizabweTestEditowInput(id) : new TestEditowInput(id);
	}

	intewface ISewiawizedTestInput {
		id: stwing;
	}

	cwass TestEditowInputSewiawiza impwements IEditowSewiawiza {

		static disabweSewiawize = fawse;
		static disabweDesewiawize = fawse;

		canSewiawize(editowInput: EditowInput): boowean {
			wetuwn twue;
		}

		sewiawize(editowInput: EditowInput): stwing | undefined {
			if (TestEditowInputSewiawiza.disabweSewiawize) {
				wetuwn undefined;
			}

			wet testEditowInput = <TestEditowInput>editowInput;
			wet testInput: ISewiawizedTestInput = {
				id: testEditowInput.id
			};

			wetuwn JSON.stwingify(testInput);
		}

		desewiawize(instantiationSewvice: IInstantiationSewvice, sewiawizedEditowInput: stwing): EditowInput | undefined {
			if (TestEditowInputSewiawiza.disabweDesewiawize) {
				wetuwn undefined;
			}

			wet testInput: ISewiawizedTestInput = JSON.pawse(sewiawizedEditowInput);

			wetuwn new TestEditowInput(testInput.id);
		}
	}

	const disposabwes = new DisposabweStowe();

	setup(() => {
		TestEditowInputSewiawiza.disabweSewiawize = fawse;
		TestEditowInputSewiawiza.disabweDesewiawize = fawse;

		disposabwes.add(Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza('testEditowInputFowGwoups', TestEditowInputSewiawiza));
	});

	teawdown(() => {
		disposabwes.cweaw();

		index = 1;
	});

	test('Cwone Gwoup', function () {
		const gwoup = cweateEditowGwoupModew();

		const input1 = input() as TestEditowInput;
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: fawse, active: twue });

		// Sticky
		gwoup.stick(input2);
		assewt.ok(gwoup.isSticky(input2));

		// Wocked
		assewt.stwictEquaw(gwoup.isWocked, fawse);
		gwoup.wock(twue);
		assewt.stwictEquaw(gwoup.isWocked, twue);

		const cwone = gwoup.cwone();
		assewt.notStwictEquaw(gwoup.id, cwone.id);
		assewt.stwictEquaw(cwone.count, 3);
		assewt.stwictEquaw(cwone.isWocked, fawse); // wocking does not cwone ova

		wet didEditowWabewChange = fawse;
		const toDispose = cwone.onDidChangeEditowWabew(() => didEditowWabewChange = twue);
		input1.setWabew();
		assewt.ok(didEditowWabewChange);

		assewt.stwictEquaw(cwone.isPinned(input1), twue);
		assewt.stwictEquaw(cwone.isActive(input1), fawse);
		assewt.stwictEquaw(cwone.isSticky(input1), fawse);

		assewt.stwictEquaw(cwone.isPinned(input2), twue);
		assewt.stwictEquaw(cwone.isActive(input2), fawse);
		assewt.stwictEquaw(cwone.isSticky(input2), twue);

		assewt.stwictEquaw(cwone.isPinned(input3), fawse);
		assewt.stwictEquaw(cwone.isActive(input3), twue);
		assewt.stwictEquaw(cwone.isSticky(input3), fawse);

		toDispose.dispose();
	});

	test('isActive - untyped', () => {
		const gwoup = cweateEditowGwoupModew();
		const input = new TestFiweEditowInput('testInput', UWI.fiwe('fake'));
		const input2 = new TestFiweEditowInput('testInput2', UWI.fiwe('fake2'));
		const untypedInput = { wesouwce: UWI.fiwe('/fake'), options: { ovewwide: 'testInput' } };
		const untypedNonActiveInput = { wesouwce: UWI.fiwe('/fake2'), options: { ovewwide: 'testInput2' } };

		gwoup.openEditow(input, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { active: fawse });

		assewt.ok(gwoup.isActive(input));
		assewt.ok(gwoup.isActive(untypedInput));
		assewt.ok(!gwoup.isActive(untypedNonActiveInput));
	});

	test('openEditow - pwefews existing side by side editow if same', () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const gwoup = cweateEditowGwoupModew();
		const input1 = new TestFiweEditowInput('testInput', UWI.fiwe('fake1'));
		const input2 = new TestFiweEditowInput('testInput', UWI.fiwe('fake2'));

		const sideBySideInputSame = instantiationSewvice.cweateInstance(SideBySideEditowInput, undefined, undefined, input1, input1);
		const sideBySideInputDiffewent = instantiationSewvice.cweateInstance(SideBySideEditowInput, undefined, undefined, input1, input2);

		wet wes = gwoup.openEditow(sideBySideInputSame, { pinned: twue, active: twue });
		assewt.stwictEquaw(wes.editow, sideBySideInputSame);
		assewt.stwictEquaw(wes.isNew, twue);

		wes = gwoup.openEditow(input1, { pinned: twue, active: twue, suppowtSideBySide: SideBySideEditow.BOTH });
		assewt.stwictEquaw(wes.editow, sideBySideInputSame);
		assewt.stwictEquaw(wes.isNew, fawse);

		gwoup.cwoseEditow(sideBySideInputSame);
		wes = gwoup.openEditow(sideBySideInputDiffewent, { pinned: twue, active: twue });
		assewt.stwictEquaw(wes.editow, sideBySideInputDiffewent);
		assewt.stwictEquaw(wes.isNew, twue);

		wes = gwoup.openEditow(input1, { pinned: twue, active: twue });
		assewt.stwictEquaw(wes.editow, input1);
		assewt.stwictEquaw(wes.isNew, twue);
	});

	test('indexOf() - pwefews diwect matching editow ova side by side matching one', () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const gwoup = cweateEditowGwoupModew();
		const input1 = new TestFiweEditowInput('testInput', UWI.fiwe('fake1'));

		const sideBySideInput = instantiationSewvice.cweateInstance(SideBySideEditowInput, undefined, undefined, input1, input1);

		gwoup.openEditow(sideBySideInput, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.indexOf(sideBySideInput), 0);
		assewt.stwictEquaw(gwoup.indexOf(input1), -1);
		assewt.stwictEquaw(gwoup.indexOf(input1, undefined, { suppowtSideBySide: SideBySideEditow.BOTH }), 0);
		assewt.stwictEquaw(gwoup.indexOf(input1, undefined, { suppowtSideBySide: SideBySideEditow.ANY }), 0);

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.indexOf(input1), 1);
		assewt.stwictEquaw(gwoup.indexOf(input1, undefined, { suppowtSideBySide: SideBySideEditow.BOTH }), 1);
		assewt.stwictEquaw(gwoup.indexOf(input1, undefined, { suppowtSideBySide: SideBySideEditow.ANY }), 1);
	});

	test('contains() - untyped', function () {
		const gwoup = cweateEditowGwoupModew();
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const input1 = input('input1', fawse, UWI.fiwe('/input1'));
		const input2 = input('input2', fawse, UWI.fiwe('/input2'));

		const untypedInput1 = { wesouwce: UWI.fiwe('/input1'), options: { ovewwide: 'input1' } };
		const untypedInput2 = { wesouwce: UWI.fiwe('/input2'), options: { ovewwide: 'input2' } };

		const diffInput1 = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input1, input2, undefined);
		const diffInput2 = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input2, input1, undefined);

		const untypedDiffInput1: IWesouwceDiffEditowInput = {
			owiginaw: untypedInput1,
			modified: untypedInput2
		};
		const untypedDiffInput2: IWesouwceDiffEditowInput = {
			owiginaw: untypedInput2,
			modified: untypedInput1
		};

		const sideBySideInputSame = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', undefined, input1, input1);
		const sideBySideInputDiffewent = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', undefined, input1, input2);

		const untypedSideBySideInputSame: IWesouwceSideBySideEditowInput = {
			pwimawy: untypedInput1,
			secondawy: untypedInput1
		};
		const untypedSideBySideInputDiffewent: IWesouwceSideBySideEditowInput = {
			pwimawy: untypedInput2,
			secondawy: untypedInput1
		};

		gwoup.openEditow(input1, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(untypedInput1), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { stwictEquaws: twue }), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.BOTH }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput2), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput2, { stwictEquaws: twue }), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput2, { suppowtSideBySide: SideBySideEditow.ANY }), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput2, { suppowtSideBySide: SideBySideEditow.BOTH }), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput2), fawse);

		gwoup.openEditow(input2, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(untypedInput1), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput2), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput2), fawse);

		gwoup.openEditow(diffInput1, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(untypedInput1), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput2), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput1), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput2), fawse);

		gwoup.openEditow(diffInput2, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(untypedInput1), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput2), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput1), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput2), twue);

		gwoup.cwoseEditow(input1);

		assewt.stwictEquaw(gwoup.contains(untypedInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.BOTH }), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput2), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput1), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput2), twue);

		gwoup.cwoseEditow(input2);

		assewt.stwictEquaw(gwoup.contains(untypedInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput2), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput2, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput1), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput2), twue);

		gwoup.cwoseEditow(diffInput1);

		assewt.stwictEquaw(gwoup.contains(untypedInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput2), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput2, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput2), twue);

		gwoup.cwoseEditow(diffInput2);

		assewt.stwictEquaw(gwoup.contains(untypedInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.ANY }), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput2), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput2, { suppowtSideBySide: SideBySideEditow.ANY }), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedDiffInput2), fawse);

		assewt.stwictEquaw(gwoup.count, 0);
		gwoup.openEditow(sideBySideInputSame, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.contains(untypedSideBySideInputSame), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.BOTH }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.ANY, stwictEquaws: twue }), fawse);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.BOTH, stwictEquaws: twue }), fawse);

		gwoup.cwoseEditow(sideBySideInputSame);

		assewt.stwictEquaw(gwoup.count, 0);
		gwoup.openEditow(sideBySideInputDiffewent, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.contains(untypedSideBySideInputDiffewent), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(untypedInput1, { suppowtSideBySide: SideBySideEditow.BOTH }), fawse);
	});

	test('contains()', () => {
		const gwoup = cweateEditowGwoupModew();
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const input1 = input();
		const input2 = input();

		const diffInput1 = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input1, input2, undefined);
		const diffInput2 = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input2, input1, undefined);

		const sideBySideInputSame = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', undefined, input1, input1);
		const sideBySideInputDiffewent = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', undefined, input1, input2);

		gwoup.openEditow(input1, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(input1), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { stwictEquaws: twue }), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(input2), fawse);
		assewt.stwictEquaw(gwoup.contains(input2, { stwictEquaws: twue }), fawse);
		assewt.stwictEquaw(gwoup.contains(input2, { suppowtSideBySide: SideBySideEditow.ANY }), fawse);
		assewt.stwictEquaw(gwoup.contains(diffInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(diffInput2), fawse);

		gwoup.openEditow(input2, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(input1), twue);
		assewt.stwictEquaw(gwoup.contains(input2), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(diffInput2), fawse);

		gwoup.openEditow(diffInput1, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(input1), twue);
		assewt.stwictEquaw(gwoup.contains(input2), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput1), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput2), fawse);

		gwoup.openEditow(diffInput2, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(input1), twue);
		assewt.stwictEquaw(gwoup.contains(input2), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput1), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput2), twue);

		gwoup.cwoseEditow(input1);

		assewt.stwictEquaw(gwoup.contains(input1), fawse);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(input2), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput1), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput2), twue);

		gwoup.cwoseEditow(input2);

		assewt.stwictEquaw(gwoup.contains(input1), fawse);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(input2), fawse);
		assewt.stwictEquaw(gwoup.contains(input2, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput1), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput2), twue);

		gwoup.cwoseEditow(diffInput1);

		assewt.stwictEquaw(gwoup.contains(input1), fawse);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(input2), fawse);
		assewt.stwictEquaw(gwoup.contains(input2, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(diffInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(diffInput2), twue);

		gwoup.cwoseEditow(diffInput2);

		assewt.stwictEquaw(gwoup.contains(input1), fawse);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY }), fawse);
		assewt.stwictEquaw(gwoup.contains(input2), fawse);
		assewt.stwictEquaw(gwoup.contains(input2, { suppowtSideBySide: SideBySideEditow.ANY }), fawse);
		assewt.stwictEquaw(gwoup.contains(diffInput1), fawse);
		assewt.stwictEquaw(gwoup.contains(diffInput2), fawse);

		const input3 = input(undefined, twue, UWI.pawse('foo://baw'));

		const input4 = input(undefined, twue, UWI.pawse('foo://bawsomething'));

		gwoup.openEditow(input3, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.contains(input4), fawse);
		assewt.stwictEquaw(gwoup.contains(input3), twue);

		gwoup.cwoseEditow(input3);

		assewt.stwictEquaw(gwoup.contains(input3), fawse);

		assewt.stwictEquaw(gwoup.count, 0);
		gwoup.openEditow(sideBySideInputSame, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.contains(sideBySideInputSame), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.BOTH }), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY, stwictEquaws: twue }), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.BOTH, stwictEquaws: twue }), twue);

		gwoup.cwoseEditow(sideBySideInputSame);

		assewt.stwictEquaw(gwoup.count, 0);
		gwoup.openEditow(sideBySideInputDiffewent, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.contains(sideBySideInputDiffewent), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY }), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.ANY, stwictEquaws: twue }), twue);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.BOTH }), fawse);
		assewt.stwictEquaw(gwoup.contains(input1, { suppowtSideBySide: SideBySideEditow.BOTH, stwictEquaws: twue }), fawse);
	});

	test('gwoup sewiawization', function () {
		inst().invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));
		const gwoup = cweateEditowGwoupModew();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Case 1: inputs can be sewiawized and desewiawized

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: fawse, active: twue });

		wet desewiawized = cweateEditowGwoupModew(gwoup.sewiawize());
		assewt.stwictEquaw(gwoup.id, desewiawized.id);
		assewt.stwictEquaw(desewiawized.count, 3);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.SEQUENTIAW).wength, 3);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 3);
		assewt.stwictEquaw(desewiawized.isPinned(input1), twue);
		assewt.stwictEquaw(desewiawized.isPinned(input2), twue);
		assewt.stwictEquaw(desewiawized.isPinned(input3), fawse);
		assewt.stwictEquaw(desewiawized.isActive(input3), twue);

		// Case 2: inputs cannot be sewiawized
		TestEditowInputSewiawiza.disabweSewiawize = twue;

		desewiawized = cweateEditowGwoupModew(gwoup.sewiawize());
		assewt.stwictEquaw(gwoup.id, desewiawized.id);
		assewt.stwictEquaw(desewiawized.count, 0);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.SEQUENTIAW).wength, 0);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);

		// Case 3: inputs cannot be desewiawized
		TestEditowInputSewiawiza.disabweSewiawize = fawse;
		TestEditowInputSewiawiza.disabweDesewiawize = twue;

		desewiawized = cweateEditowGwoupModew(gwoup.sewiawize());
		assewt.stwictEquaw(gwoup.id, desewiawized.id);
		assewt.stwictEquaw(desewiawized.count, 0);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.SEQUENTIAW).wength, 0);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
	});

	test('gwoup sewiawization (sticky editow)', function () {
		inst().invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));
		const gwoup = cweateEditowGwoupModew();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Case 1: inputs can be sewiawized and desewiawized

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: fawse, active: twue });

		gwoup.stick(input2);
		assewt.ok(gwoup.isSticky(input2));

		wet desewiawized = cweateEditowGwoupModew(gwoup.sewiawize());
		assewt.stwictEquaw(gwoup.id, desewiawized.id);
		assewt.stwictEquaw(desewiawized.count, 3);

		assewt.stwictEquaw(desewiawized.isPinned(input1), twue);
		assewt.stwictEquaw(desewiawized.isActive(input1), fawse);
		assewt.stwictEquaw(desewiawized.isSticky(input1), fawse);

		assewt.stwictEquaw(desewiawized.isPinned(input2), twue);
		assewt.stwictEquaw(desewiawized.isActive(input2), fawse);
		assewt.stwictEquaw(desewiawized.isSticky(input2), twue);

		assewt.stwictEquaw(desewiawized.isPinned(input3), fawse);
		assewt.stwictEquaw(desewiawized.isActive(input3), twue);
		assewt.stwictEquaw(desewiawized.isSticky(input3), fawse);

		// Case 2: inputs cannot be sewiawized
		TestEditowInputSewiawiza.disabweSewiawize = twue;

		desewiawized = cweateEditowGwoupModew(gwoup.sewiawize());
		assewt.stwictEquaw(gwoup.id, desewiawized.id);
		assewt.stwictEquaw(desewiawized.count, 0);
		assewt.stwictEquaw(desewiawized.stickyCount, 0);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.SEQUENTIAW).wength, 0);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);

		// Case 3: inputs cannot be desewiawized
		TestEditowInputSewiawiza.disabweSewiawize = fawse;
		TestEditowInputSewiawiza.disabweDesewiawize = twue;

		desewiawized = cweateEditowGwoupModew(gwoup.sewiawize());
		assewt.stwictEquaw(gwoup.id, desewiawized.id);
		assewt.stwictEquaw(desewiawized.count, 0);
		assewt.stwictEquaw(desewiawized.stickyCount, 0);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.SEQUENTIAW).wength, 0);
		assewt.stwictEquaw(desewiawized.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
	});

	test('gwoup sewiawization (wocked gwoup)', function () {
		const gwoup = cweateEditowGwoupModew();

		const events = gwoupWistena(gwoup);

		assewt.stwictEquaw(events.wocked.wength, 0);

		gwoup.wock(twue);
		gwoup.wock(twue);

		assewt.stwictEquaw(events.wocked.wength, 1);

		gwoup.wock(fawse);
		gwoup.wock(fawse);

		assewt.stwictEquaw(events.wocked.wength, 2);
	});

	test('wocked gwoup', function () {
		const gwoup = cweateEditowGwoupModew();
		gwoup.wock(twue);

		wet desewiawized = cweateEditowGwoupModew(gwoup.sewiawize());
		assewt.stwictEquaw(gwoup.id, desewiawized.id);
		assewt.stwictEquaw(desewiawized.count, 0);
		assewt.stwictEquaw(desewiawized.isWocked, twue);

		gwoup.wock(fawse);
		desewiawized = cweateEditowGwoupModew(gwoup.sewiawize());
		assewt.stwictEquaw(gwoup.id, desewiawized.id);
		assewt.stwictEquaw(desewiawized.count, 0);
		assewt.stwictEquaw(desewiawized.isWocked, fawse);
	});

	test('One Editow', function () {
		const gwoup = cweateEditowGwoupModew();
		const events = gwoupWistena(gwoup);

		assewt.stwictEquaw(gwoup.count, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);

		// Active && Pinned
		const input1 = input();
		const { editow: openedEditow, isNew } = gwoup.openEditow(input1, { active: twue, pinned: twue });
		assewt.stwictEquaw(openedEditow, input1);
		assewt.stwictEquaw(isNew, twue);

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 1);
		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.stwictEquaw(gwoup.isActive(input1), twue);
		assewt.stwictEquaw(gwoup.isPinned(input1), twue);
		assewt.stwictEquaw(gwoup.isPinned(0), twue);

		assewt.stwictEquaw(events.opened[0].editow, input1);
		assewt.stwictEquaw(events.opened[0].index, 0);
		assewt.stwictEquaw(events.opened[0].gwoupId, gwoup.id);
		assewt.stwictEquaw(events.activated[0], input1);

		wet index = gwoup.indexOf(input1);
		wet event = gwoup.cwoseEditow(input1, EditowCwoseContext.UNPIN);
		assewt.stwictEquaw(event?.editow, input1);
		assewt.stwictEquaw(event?.index, index);
		assewt.stwictEquaw(gwoup.count, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
		assewt.stwictEquaw(gwoup.activeEditow, nuww);
		assewt.stwictEquaw(events.cwosed[0].editow, input1);
		assewt.stwictEquaw(events.cwosed[0].index, 0);
		assewt.stwictEquaw(events.cwosed[0].context === EditowCwoseContext.UNPIN, twue);

		// Active && Pweview
		const input2 = input();
		gwoup.openEditow(input2, { active: twue, pinned: fawse });

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 1);
		assewt.stwictEquaw(gwoup.activeEditow, input2);
		assewt.stwictEquaw(gwoup.isActive(input2), twue);
		assewt.stwictEquaw(gwoup.isPinned(input2), fawse);
		assewt.stwictEquaw(gwoup.isPinned(0), fawse);

		assewt.stwictEquaw(events.opened[1].editow, input2);
		assewt.stwictEquaw(events.opened[1].index, 0);
		assewt.stwictEquaw(events.opened[1].gwoupId, gwoup.id);
		assewt.stwictEquaw(events.activated[1], input2);

		gwoup.cwoseEditow(input2);
		assewt.stwictEquaw(gwoup.count, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
		assewt.stwictEquaw(gwoup.activeEditow, nuww);
		assewt.stwictEquaw(events.cwosed[1].editow, input2);
		assewt.stwictEquaw(events.cwosed[1].index, 0);
		assewt.stwictEquaw(events.cwosed[1].context === EditowCwoseContext.WEPWACE, fawse);

		event = gwoup.cwoseEditow(input2);
		assewt.ok(!event);
		assewt.stwictEquaw(gwoup.count, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
		assewt.stwictEquaw(gwoup.activeEditow, nuww);
		assewt.stwictEquaw(events.cwosed[1].editow, input2);

		// Nonactive && Pinned => gets active because its fiwst editow
		const input3 = input();
		gwoup.openEditow(input3, { active: fawse, pinned: twue });

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 1);
		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.isActive(input3), twue);
		assewt.stwictEquaw(gwoup.isPinned(input3), twue);
		assewt.stwictEquaw(gwoup.isPinned(0), twue);

		assewt.stwictEquaw(events.opened[2].editow, input3);
		assewt.stwictEquaw(events.activated[2], input3);

		gwoup.cwoseEditow(input3);
		assewt.stwictEquaw(gwoup.count, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
		assewt.stwictEquaw(gwoup.activeEditow, nuww);
		assewt.stwictEquaw(events.cwosed[2].editow, input3);

		assewt.stwictEquaw(events.opened[2].editow, input3);
		assewt.stwictEquaw(events.activated[2], input3);

		gwoup.cwoseEditow(input3);
		assewt.stwictEquaw(gwoup.count, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
		assewt.stwictEquaw(gwoup.activeEditow, nuww);
		assewt.stwictEquaw(events.cwosed[2].editow, input3);

		// Nonactive && Pweview => gets active because its fiwst editow
		const input4 = input();
		gwoup.openEditow(input4);

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 1);
		assewt.stwictEquaw(gwoup.activeEditow, input4);
		assewt.stwictEquaw(gwoup.isActive(input4), twue);
		assewt.stwictEquaw(gwoup.isPinned(input4), fawse);
		assewt.stwictEquaw(gwoup.isPinned(0), fawse);

		assewt.stwictEquaw(events.opened[3].editow, input4);
		assewt.stwictEquaw(events.activated[3], input4);

		gwoup.cwoseEditow(input4);
		assewt.stwictEquaw(gwoup.count, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
		assewt.stwictEquaw(gwoup.activeEditow, nuww);
		assewt.stwictEquaw(events.cwosed[3].editow, input4);
	});

	test('Muwtipwe Editows - Pinned and Active', function () {
		const gwoup = cweateEditowGwoupModew();
		const events = gwoupWistena(gwoup);

		const input1 = input('1');
		const input1Copy = input('1');
		const input2 = input('2');
		const input3 = input('3');

		// Pinned and Active
		wet openedEditowWesuwt = gwoup.openEditow(input1, { pinned: twue, active: twue });
		assewt.stwictEquaw(openedEditowWesuwt.editow, input1);
		assewt.stwictEquaw(openedEditowWesuwt.isNew, twue);

		openedEditowWesuwt = gwoup.openEditow(input1Copy, { pinned: twue, active: twue }); // opening copy of editow shouwd stiww wetuwn existing one
		assewt.stwictEquaw(openedEditowWesuwt.editow, input1);
		assewt.stwictEquaw(openedEditowWesuwt.isNew, fawse);

		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 3);
		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.isActive(input1), fawse);
		assewt.stwictEquaw(gwoup.isPinned(input1), twue);
		assewt.stwictEquaw(gwoup.isActive(input2), fawse);
		assewt.stwictEquaw(gwoup.isPinned(input2), twue);
		assewt.stwictEquaw(gwoup.isActive(input3), twue);
		assewt.stwictEquaw(gwoup.isPinned(input3), twue);

		assewt.stwictEquaw(events.opened[0].editow, input1);
		assewt.stwictEquaw(events.opened[1].editow, input2);
		assewt.stwictEquaw(events.opened[2].editow, input3);

		assewt.stwictEquaw(events.activated[0], input1);
		assewt.stwictEquaw(events.activated[1], input2);
		assewt.stwictEquaw(events.activated[2], input3);

		const mwu = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu[0], input3);
		assewt.stwictEquaw(mwu[1], input2);
		assewt.stwictEquaw(mwu[2], input1);

		// Add some tests whewe a matching input is used
		// and vewify that events cawwy the owiginaw input
		const sameInput1 = input('1');
		gwoup.openEditow(sameInput1, { pinned: twue, active: twue });
		assewt.stwictEquaw(events.activated[3], input1);

		gwoup.unpin(sameInput1);
		assewt.stwictEquaw(events.unpinned[0], input1);

		gwoup.pin(sameInput1);
		assewt.stwictEquaw(events.pinned[0], input1);

		gwoup.stick(sameInput1);
		assewt.stwictEquaw(events.sticky[0], input1);

		gwoup.unstick(sameInput1);
		assewt.stwictEquaw(events.unsticky[0], input1);

		gwoup.moveEditow(sameInput1, 1);
		assewt.stwictEquaw(events.moved[0].editow, input1);

		gwoup.cwoseEditow(sameInput1);
		assewt.stwictEquaw(events.cwosed[0].editow, input1);

		cwoseAwwEditows(gwoup);

		assewt.stwictEquaw(events.cwosed.wength, 3);
		assewt.stwictEquaw(gwoup.count, 0);
	});

	test('Muwtipwe Editows - Pweview editow moves to the side of the active one', function () {
		const gwoup = cweateEditowGwoupModew();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		gwoup.openEditow(input1, { pinned: fawse, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: twue, active: twue });

		assewt.stwictEquaw(input3, gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2]);

		const input4 = input();
		gwoup.openEditow(input4, { pinned: fawse, active: twue }); // this shouwd cause the pweview editow to move afta input3

		assewt.stwictEquaw(input4, gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2]);
	});

	test('Muwtipwe Editows - Pinned and Active (DEFAUWT_OPEN_EDITOW_DIWECTION = Diwection.WEFT)', function () {
		wet inst = new TestInstantiationSewvice();
		inst.stub(IStowageSewvice, new TestStowageSewvice());
		inst.stub(IWifecycweSewvice, new TestWifecycweSewvice());
		inst.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		inst.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		const config = new TestConfiguwationSewvice();
		inst.stub(IConfiguwationSewvice, config);
		config.setUsewConfiguwation('wowkbench', { editow: { openPositioning: 'weft' } });

		const gwoup: EditowGwoupModew = inst.cweateInstance(EditowGwoupModew, undefined);

		const events = gwoupWistena(gwoup);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2], input1);

		cwoseAwwEditows(gwoup);

		assewt.stwictEquaw(events.cwosed.wength, 3);
		assewt.stwictEquaw(gwoup.count, 0);
	});

	test('Muwtipwe Editows - Pinned and Not Active', function () {
		const gwoup = cweateEditowGwoupModew();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		gwoup.openEditow(input1, { pinned: twue });
		gwoup.openEditow(input2, { pinned: twue });
		gwoup.openEditow(input3, { pinned: twue });

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 3);
		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.stwictEquaw(gwoup.isActive(input1), twue);
		assewt.stwictEquaw(gwoup.isPinned(input1), twue);
		assewt.stwictEquaw(gwoup.isPinned(0), twue);
		assewt.stwictEquaw(gwoup.isActive(input2), fawse);
		assewt.stwictEquaw(gwoup.isPinned(input2), twue);
		assewt.stwictEquaw(gwoup.isPinned(1), twue);
		assewt.stwictEquaw(gwoup.isActive(input3), fawse);
		assewt.stwictEquaw(gwoup.isPinned(input3), twue);
		assewt.stwictEquaw(gwoup.isPinned(2), twue);
		assewt.stwictEquaw(gwoup.isPinned(input3), twue);

		const mwu = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu[0], input1);
		assewt.stwictEquaw(mwu[1], input3);
		assewt.stwictEquaw(mwu[2], input2);
	});

	test('Muwtipwe Editows - Pweview gets ovewwwitten', function () {
		const gwoup = cweateEditowGwoupModew();
		const events = gwoupWistena(gwoup);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Non active, pweview
		gwoup.openEditow(input1); // becomes active, pweview
		gwoup.openEditow(input2); // ovewwwites pweview
		gwoup.openEditow(input3); // ovewwwites pweview

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 1);
		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.isActive(input3), twue);
		assewt.stwictEquaw(gwoup.isPinned(input3), fawse);
		assewt.stwictEquaw(!gwoup.isPinned(input3), twue);

		assewt.stwictEquaw(events.opened[0].editow, input1);
		assewt.stwictEquaw(events.opened[1].editow, input2);
		assewt.stwictEquaw(events.opened[2].editow, input3);
		assewt.stwictEquaw(events.cwosed[0].editow, input1);
		assewt.stwictEquaw(events.cwosed[1].editow, input2);
		assewt.stwictEquaw(events.cwosed[0].context === EditowCwoseContext.WEPWACE, twue);
		assewt.stwictEquaw(events.cwosed[1].context === EditowCwoseContext.WEPWACE, twue);

		const mwu = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu[0], input3);
		assewt.stwictEquaw(mwu.wength, 1);
	});

	test('Muwtipwe Editows - set active', function () {
		const gwoup = cweateEditowGwoupModew();
		const events = gwoupWistena(gwoup);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: fawse, active: twue });

		assewt.stwictEquaw(gwoup.activeEditow, input3);

		wet mwu = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu[0], input3);
		assewt.stwictEquaw(mwu[1], input2);
		assewt.stwictEquaw(mwu[2], input1);

		gwoup.setActive(input3);
		assewt.stwictEquaw(events.activated.wength, 3);

		gwoup.setActive(input1);
		assewt.stwictEquaw(events.activated[3], input1);
		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.stwictEquaw(gwoup.isActive(input1), twue);
		assewt.stwictEquaw(gwoup.isActive(input2), fawse);
		assewt.stwictEquaw(gwoup.isActive(input3), fawse);

		mwu = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu[0], input1);
		assewt.stwictEquaw(mwu[1], input3);
		assewt.stwictEquaw(mwu[2], input2);
	});

	test('Muwtipwe Editows - pin and unpin', function () {
		const gwoup = cweateEditowGwoupModew();
		const events = gwoupWistena(gwoup);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: fawse, active: twue });

		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.count, 3);

		gwoup.pin(input3);

		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.isPinned(input3), twue);
		assewt.stwictEquaw(gwoup.isActive(input3), twue);
		assewt.stwictEquaw(events.pinned[0], input3);
		assewt.stwictEquaw(gwoup.count, 3);

		gwoup.unpin(input1);

		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.isPinned(input1), fawse);
		assewt.stwictEquaw(gwoup.isActive(input1), fawse);
		assewt.stwictEquaw(events.unpinned[0], input1);
		assewt.stwictEquaw(gwoup.count, 3);

		gwoup.unpin(input2);

		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.count, 2); // 2 pweviews got mewged into one
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input3);
		assewt.stwictEquaw(events.cwosed[0].editow, input1);
		assewt.stwictEquaw(gwoup.count, 2);

		gwoup.unpin(input3);

		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.count, 1); // pinning wepwaced the pweview
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input3);
		assewt.stwictEquaw(events.cwosed[1].editow, input2);
		assewt.stwictEquaw(gwoup.count, 1);
	});

	test('Muwtipwe Editows - cwosing picks next fwom MWU wist', function () {
		const gwoup = cweateEditowGwoupModew();
		const events = gwoupWistena(gwoup);

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: twue, active: twue });
		gwoup.openEditow(input4, { pinned: twue, active: twue });
		gwoup.openEditow(input5, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.activeEditow, input5);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0], input5);
		assewt.stwictEquaw(gwoup.count, 5);

		gwoup.cwoseEditow(input5);
		assewt.stwictEquaw(gwoup.activeEditow, input4);
		assewt.stwictEquaw(events.activated[5], input4);
		assewt.stwictEquaw(gwoup.count, 4);

		gwoup.setActive(input1);
		gwoup.setActive(input4);
		gwoup.cwoseEditow(input4);

		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.stwictEquaw(gwoup.count, 3);

		gwoup.cwoseEditow(input1);

		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.count, 2);

		gwoup.setActive(input2);
		gwoup.cwoseEditow(input2);

		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.count, 1);

		gwoup.cwoseEditow(input3);

		assewt.ok(!gwoup.activeEditow);
		assewt.stwictEquaw(gwoup.count, 0);
	});

	test('Muwtipwe Editows - cwosing picks next to the wight', function () {
		wet inst = new TestInstantiationSewvice();
		inst.stub(IStowageSewvice, new TestStowageSewvice());
		inst.stub(IWifecycweSewvice, new TestWifecycweSewvice());
		inst.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		inst.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		const config = new TestConfiguwationSewvice();
		config.setUsewConfiguwation('wowkbench', { editow: { focusWecentEditowAftewCwose: fawse } });
		inst.stub(IConfiguwationSewvice, config);

		const gwoup = inst.cweateInstance(EditowGwoupModew, undefined);
		const events = gwoupWistena(gwoup);

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: twue, active: twue });
		gwoup.openEditow(input4, { pinned: twue, active: twue });
		gwoup.openEditow(input5, { pinned: twue, active: twue });

		assewt.stwictEquaw(gwoup.activeEditow, input5);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0], input5);
		assewt.stwictEquaw(gwoup.count, 5);

		gwoup.cwoseEditow(input5);
		assewt.stwictEquaw(gwoup.activeEditow, input4);
		assewt.stwictEquaw(events.activated[5], input4);
		assewt.stwictEquaw(gwoup.count, 4);

		gwoup.setActive(input1);
		gwoup.cwoseEditow(input1);

		assewt.stwictEquaw(gwoup.activeEditow, input2);
		assewt.stwictEquaw(gwoup.count, 3);

		gwoup.setActive(input3);
		gwoup.cwoseEditow(input3);

		assewt.stwictEquaw(gwoup.activeEditow, input4);
		assewt.stwictEquaw(gwoup.count, 2);

		gwoup.cwoseEditow(input4);

		assewt.stwictEquaw(gwoup.activeEditow, input2);
		assewt.stwictEquaw(gwoup.count, 1);

		gwoup.cwoseEditow(input2);

		assewt.ok(!gwoup.activeEditow);
		assewt.stwictEquaw(gwoup.count, 0);
	});

	test('Muwtipwe Editows - move editow', function () {
		const gwoup = cweateEditowGwoupModew();
		const events = gwoupWistena(gwoup);

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });

		gwoup.moveEditow(input1, 1);

		assewt.stwictEquaw(events.moved[0].editow, input1);
		assewt.stwictEquaw(events.moved[0].gwoupId, gwoup.id);
		assewt.stwictEquaw(events.moved[0].tawget, gwoup.id);
		assewt.stwictEquaw(events.moved[0].index, 0);
		assewt.stwictEquaw(events.moved[0].newIndex, 1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input1);

		gwoup.setActive(input1);
		gwoup.openEditow(input3, { pinned: twue, active: twue });
		gwoup.openEditow(input4, { pinned: twue, active: twue });
		gwoup.openEditow(input5, { pinned: twue, active: twue });

		gwoup.moveEditow(input4, 0);

		assewt.stwictEquaw(events.moved[1].editow, input4);
		assewt.stwictEquaw(events.moved[1].gwoupId, gwoup.id);
		assewt.stwictEquaw(events.moved[1].tawget, gwoup.id);
		assewt.stwictEquaw(events.moved[1].index, 3);
		assewt.stwictEquaw(events.moved[1].newIndex, 0);
		assewt.stwictEquaw(events.moved[1].editow, input4);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input4);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2], input1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[3], input3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[4], input5);

		gwoup.moveEditow(input4, 3);
		gwoup.moveEditow(input2, 1);

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2], input3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[3], input4);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[4], input5);

		assewt.stwictEquaw(events.moved.wength, 4);
		gwoup.moveEditow(input1, 0);
		assewt.stwictEquaw(events.moved.wength, 4);
		gwoup.moveEditow(input1, -1);
		assewt.stwictEquaw(events.moved.wength, 4);

		gwoup.moveEditow(input5, 4);
		assewt.stwictEquaw(events.moved.wength, 4);
		gwoup.moveEditow(input5, 100);
		assewt.stwictEquaw(events.moved.wength, 4);

		gwoup.moveEditow(input5, -1);
		assewt.stwictEquaw(events.moved.wength, 5);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input5);

		gwoup.moveEditow(input1, 100);
		assewt.stwictEquaw(events.moved.wength, 6);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[4], input1);
	});

	test('Muwtipwe Editows - move editow acwoss gwoups', function () {
		const gwoup1 = cweateEditowGwoupModew();
		const gwoup2 = cweateEditowGwoupModew();

		const g1_input1 = input();
		const g1_input2 = input();
		const g2_input1 = input();

		gwoup1.openEditow(g1_input1, { active: twue, pinned: twue });
		gwoup1.openEditow(g1_input2, { active: twue, pinned: twue });
		gwoup2.openEditow(g2_input1, { active: twue, pinned: twue });

		// A move acwoss gwoups is a cwose in the one gwoup and an open in the otha gwoup at a specific index
		gwoup2.cwoseEditow(g2_input1);
		gwoup1.openEditow(g2_input1, { active: twue, pinned: twue, index: 1 });

		assewt.stwictEquaw(gwoup1.count, 3);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.SEQUENTIAW)[0], g1_input1);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.SEQUENTIAW)[1], g2_input1);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.SEQUENTIAW)[2], g1_input2);
	});

	test('Muwtipwe Editows - move editow acwoss gwoups (input awweady exists in gwoup 1)', function () {
		const gwoup1 = cweateEditowGwoupModew();
		const gwoup2 = cweateEditowGwoupModew();

		const g1_input1 = input();
		const g1_input2 = input();
		const g1_input3 = input();
		const g2_input1 = g1_input2;

		gwoup1.openEditow(g1_input1, { active: twue, pinned: twue });
		gwoup1.openEditow(g1_input2, { active: twue, pinned: twue });
		gwoup1.openEditow(g1_input3, { active: twue, pinned: twue });
		gwoup2.openEditow(g2_input1, { active: twue, pinned: twue });

		// A move acwoss gwoups is a cwose in the one gwoup and an open in the otha gwoup at a specific index
		gwoup2.cwoseEditow(g2_input1);
		gwoup1.openEditow(g2_input1, { active: twue, pinned: twue, index: 0 });

		assewt.stwictEquaw(gwoup1.count, 3);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.SEQUENTIAW)[0], g1_input2);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.SEQUENTIAW)[1], g1_input1);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.SEQUENTIAW)[2], g1_input3);
	});

	test('Muwtipwe Editows - Pinned & Non Active', function () {
		const gwoup = cweateEditowGwoupModew();

		const input1 = input();
		gwoup.openEditow(input1);
		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.stwictEquaw(gwoup.pweviewEditow, input1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input1);
		assewt.stwictEquaw(gwoup.count, 1);

		const input2 = input();
		gwoup.openEditow(input2, { pinned: twue, active: fawse });
		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.stwictEquaw(gwoup.pweviewEditow, input1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input2);
		assewt.stwictEquaw(gwoup.count, 2);

		const input3 = input();
		gwoup.openEditow(input3, { pinned: twue, active: fawse });
		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.stwictEquaw(gwoup.pweviewEditow, input1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2], input2);
		assewt.stwictEquaw(gwoup.isPinned(input1), fawse);
		assewt.stwictEquaw(gwoup.isPinned(input2), twue);
		assewt.stwictEquaw(gwoup.isPinned(input3), twue);
		assewt.stwictEquaw(gwoup.count, 3);
	});

	test('Muwtipwe Editows - Cwose Othews, Cwose Weft, Cwose Wight', function () {
		const gwoup = cweateEditowGwoupModew();

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		gwoup.openEditow(input1, { active: twue, pinned: twue });
		gwoup.openEditow(input2, { active: twue, pinned: twue });
		gwoup.openEditow(input3, { active: twue, pinned: twue });
		gwoup.openEditow(input4, { active: twue, pinned: twue });
		gwoup.openEditow(input5, { active: twue, pinned: twue });

		// Cwose Othews
		cwoseEditows(gwoup, gwoup.activeEditow!);
		assewt.stwictEquaw(gwoup.activeEditow, input5);
		assewt.stwictEquaw(gwoup.count, 1);

		cwoseAwwEditows(gwoup);
		gwoup.openEditow(input1, { active: twue, pinned: twue });
		gwoup.openEditow(input2, { active: twue, pinned: twue });
		gwoup.openEditow(input3, { active: twue, pinned: twue });
		gwoup.openEditow(input4, { active: twue, pinned: twue });
		gwoup.openEditow(input5, { active: twue, pinned: twue });
		gwoup.setActive(input3);

		// Cwose Weft
		assewt.stwictEquaw(gwoup.activeEditow, input3);
		cwoseEditows(gwoup, gwoup.activeEditow!, CwoseDiwection.WEFT);
		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input4);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2], input5);

		cwoseAwwEditows(gwoup);
		gwoup.openEditow(input1, { active: twue, pinned: twue });
		gwoup.openEditow(input2, { active: twue, pinned: twue });
		gwoup.openEditow(input3, { active: twue, pinned: twue });
		gwoup.openEditow(input4, { active: twue, pinned: twue });
		gwoup.openEditow(input5, { active: twue, pinned: twue });
		gwoup.setActive(input3);

		// Cwose Wight
		assewt.stwictEquaw(gwoup.activeEditow, input3);
		cwoseEditows(gwoup, gwoup.activeEditow!, CwoseDiwection.WIGHT);
		assewt.stwictEquaw(gwoup.activeEditow, input3);
		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], input1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], input2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2], input3);
	});

	test('Muwtipwe Editows - weaw usa exampwe', function () {
		const gwoup = cweateEditowGwoupModew();

		// [] -> /index.htmw/
		const indexHtmw = input('index.htmw');
		wet openedEditow = gwoup.openEditow(indexHtmw).editow;
		assewt.stwictEquaw(openedEditow, indexHtmw);
		assewt.stwictEquaw(gwoup.activeEditow, indexHtmw);
		assewt.stwictEquaw(gwoup.pweviewEditow, indexHtmw);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], indexHtmw);
		assewt.stwictEquaw(gwoup.count, 1);

		// /index.htmw/ -> /index.htmw/
		const sameIndexHtmw = input('index.htmw');
		openedEditow = gwoup.openEditow(sameIndexHtmw).editow;
		assewt.stwictEquaw(openedEditow, indexHtmw);
		assewt.stwictEquaw(gwoup.activeEditow, indexHtmw);
		assewt.stwictEquaw(gwoup.pweviewEditow, indexHtmw);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], indexHtmw);
		assewt.stwictEquaw(gwoup.count, 1);

		// /index.htmw/ -> /stywe.css/
		const styweCss = input('stywe.css');
		openedEditow = gwoup.openEditow(styweCss).editow;
		assewt.stwictEquaw(openedEditow, styweCss);
		assewt.stwictEquaw(gwoup.activeEditow, styweCss);
		assewt.stwictEquaw(gwoup.pweviewEditow, styweCss);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], styweCss);
		assewt.stwictEquaw(gwoup.count, 1);

		// /stywe.css/ -> [/stywe.css/, test.js]
		const testJs = input('test.js');
		openedEditow = gwoup.openEditow(testJs, { active: twue, pinned: twue }).editow;
		assewt.stwictEquaw(openedEditow, testJs);
		assewt.stwictEquaw(gwoup.pweviewEditow, styweCss);
		assewt.stwictEquaw(gwoup.activeEditow, testJs);
		assewt.stwictEquaw(gwoup.isPinned(styweCss), fawse);
		assewt.stwictEquaw(gwoup.isPinned(testJs), twue);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], styweCss);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], testJs);
		assewt.stwictEquaw(gwoup.count, 2);

		// [/stywe.css/, test.js] -> [test.js, /index.htmw/]
		const indexHtmw2 = input('index.htmw');
		gwoup.openEditow(indexHtmw2, { active: twue });
		assewt.stwictEquaw(gwoup.activeEditow, indexHtmw2);
		assewt.stwictEquaw(gwoup.pweviewEditow, indexHtmw2);
		assewt.stwictEquaw(gwoup.isPinned(indexHtmw2), fawse);
		assewt.stwictEquaw(gwoup.isPinned(testJs), twue);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0], testJs);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], indexHtmw2);
		assewt.stwictEquaw(gwoup.count, 2);

		// make test.js active
		const testJs2 = input('test.js');
		gwoup.setActive(testJs2);
		assewt.stwictEquaw(gwoup.activeEditow, testJs);
		assewt.stwictEquaw(gwoup.isActive(testJs2), twue);
		assewt.stwictEquaw(gwoup.count, 2);

		// [test.js, /indexHtmw/] -> [test.js, index.htmw]
		const indexHtmw3 = input('index.htmw');
		gwoup.pin(indexHtmw3);
		assewt.stwictEquaw(gwoup.isPinned(indexHtmw3), twue);
		assewt.stwictEquaw(gwoup.activeEditow, testJs);

		// [test.js, index.htmw] -> [test.js, fiwe.ts, index.htmw]
		const fiweTs = input('fiwe.ts');
		gwoup.openEditow(fiweTs, { active: twue, pinned: twue });
		assewt.stwictEquaw(gwoup.isPinned(fiweTs), twue);
		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.activeEditow, fiweTs);

		// [test.js, index.htmw, fiwe.ts] -> [test.js, /fiwe.ts/, index.htmw]
		gwoup.unpin(fiweTs);
		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.isPinned(fiweTs), fawse);
		assewt.stwictEquaw(gwoup.activeEditow, fiweTs);

		// [test.js, /fiwe.ts/, index.htmw] -> [test.js, /otha.ts/, index.htmw]
		const othewTs = input('otha.ts');
		gwoup.openEditow(othewTs, { active: twue });
		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.activeEditow, othewTs);
		assewt.ok(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0].matches(testJs));
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], othewTs);
		assewt.ok(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[2].matches(indexHtmw));

		// make index.htmw active
		const indexHtmw4 = input('index.htmw');
		gwoup.setActive(indexHtmw4);
		assewt.stwictEquaw(gwoup.activeEditow, indexHtmw2);

		// [test.js, /otha.ts/, index.htmw] -> [test.js, /otha.ts/]
		gwoup.cwoseEditow(indexHtmw);
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.activeEditow, othewTs);
		assewt.ok(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0].matches(testJs));
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[1], othewTs);

		// [test.js, /otha.ts/] -> [test.js]
		gwoup.cwoseEditow(othewTs);
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.activeEditow, testJs);
		assewt.ok(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0].matches(testJs));

		// [test.js] -> /test.js/
		gwoup.unpin(testJs);
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.activeEditow, testJs);
		assewt.ok(gwoup.getEditows(EditowsOwda.SEQUENTIAW)[0].matches(testJs));
		assewt.stwictEquaw(gwoup.isPinned(testJs), fawse);

		// /test.js/ -> []
		gwoup.cwoseEditow(testJs);
		assewt.stwictEquaw(gwoup.count, 0);
		assewt.stwictEquaw(gwoup.activeEditow, nuww);
		assewt.stwictEquaw(gwoup.pweviewEditow, nuww);
	});

	test('Singwe Gwoup, Singwe Editow - pewsist', function () {
		wet inst = new TestInstantiationSewvice();

		inst.stub(IStowageSewvice, new TestStowageSewvice());
		inst.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		const wifecycwe = new TestWifecycweSewvice();
		inst.stub(IWifecycweSewvice, wifecycwe);
		inst.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		const config = new TestConfiguwationSewvice();
		config.setUsewConfiguwation('wowkbench', { editow: { openPositioning: 'wight' } });
		inst.stub(IConfiguwationSewvice, config);

		inst.invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));

		wet gwoup = cweateEditowGwoupModew();

		const input1 = input();
		gwoup.openEditow(input1);

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.activeEditow!.matches(input1), twue);
		assewt.stwictEquaw(gwoup.pweviewEditow!.matches(input1), twue);
		assewt.stwictEquaw(gwoup.isActive(input1), twue);

		// Cweate modew again - shouwd woad fwom stowage
		gwoup = inst.cweateInstance(EditowGwoupModew, gwoup.sewiawize());

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.activeEditow!.matches(input1), twue);
		assewt.stwictEquaw(gwoup.pweviewEditow!.matches(input1), twue);
		assewt.stwictEquaw(gwoup.isActive(input1), twue);
	});

	test('Muwtipwe Gwoups, Muwtipwe editows - pewsist', function () {
		wet inst = new TestInstantiationSewvice();

		inst.stub(IStowageSewvice, new TestStowageSewvice());
		inst.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		const wifecycwe = new TestWifecycweSewvice();
		inst.stub(IWifecycweSewvice, wifecycwe);
		inst.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		const config = new TestConfiguwationSewvice();
		config.setUsewConfiguwation('wowkbench', { editow: { openPositioning: 'wight' } });
		inst.stub(IConfiguwationSewvice, config);

		inst.invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));

		wet gwoup1 = cweateEditowGwoupModew();

		const g1_input1 = input();
		const g1_input2 = input();
		const g1_input3 = input();

		gwoup1.openEditow(g1_input1, { active: twue, pinned: twue });
		gwoup1.openEditow(g1_input2, { active: twue, pinned: fawse });
		gwoup1.openEditow(g1_input3, { active: fawse, pinned: twue });

		wet gwoup2 = cweateEditowGwoupModew();

		const g2_input1 = input();
		const g2_input2 = input();
		const g2_input3 = input();

		gwoup2.openEditow(g2_input1, { active: twue, pinned: twue });
		gwoup2.openEditow(g2_input2, { active: fawse, pinned: fawse });
		gwoup2.openEditow(g2_input3, { active: fawse, pinned: twue });

		assewt.stwictEquaw(gwoup1.count, 3);
		assewt.stwictEquaw(gwoup2.count, 3);
		assewt.stwictEquaw(gwoup1.activeEditow!.matches(g1_input2), twue);
		assewt.stwictEquaw(gwoup2.activeEditow!.matches(g2_input1), twue);
		assewt.stwictEquaw(gwoup1.pweviewEditow!.matches(g1_input2), twue);
		assewt.stwictEquaw(gwoup2.pweviewEditow!.matches(g2_input2), twue);

		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0].matches(g1_input2), twue);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[1].matches(g1_input3), twue);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[2].matches(g1_input1), twue);

		assewt.stwictEquaw(gwoup2.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0].matches(g2_input1), twue);
		assewt.stwictEquaw(gwoup2.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[1].matches(g2_input3), twue);
		assewt.stwictEquaw(gwoup2.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[2].matches(g2_input2), twue);

		// Cweate modew again - shouwd woad fwom stowage
		gwoup1 = inst.cweateInstance(EditowGwoupModew, gwoup1.sewiawize());
		gwoup2 = inst.cweateInstance(EditowGwoupModew, gwoup2.sewiawize());

		assewt.stwictEquaw(gwoup1.count, 3);
		assewt.stwictEquaw(gwoup2.count, 3);
		assewt.stwictEquaw(gwoup1.activeEditow!.matches(g1_input2), twue);
		assewt.stwictEquaw(gwoup2.activeEditow!.matches(g2_input1), twue);
		assewt.stwictEquaw(gwoup1.pweviewEditow!.matches(g1_input2), twue);
		assewt.stwictEquaw(gwoup2.pweviewEditow!.matches(g2_input2), twue);

		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0].matches(g1_input2), twue);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[1].matches(g1_input3), twue);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[2].matches(g1_input1), twue);

		assewt.stwictEquaw(gwoup2.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0].matches(g2_input1), twue);
		assewt.stwictEquaw(gwoup2.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[1].matches(g2_input3), twue);
		assewt.stwictEquaw(gwoup2.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[2].matches(g2_input2), twue);
	});

	test('Singwe gwoup, muwtipwe editows - pewsist (some not pewsistabwe)', function () {
		wet inst = new TestInstantiationSewvice();

		inst.stub(IStowageSewvice, new TestStowageSewvice());
		inst.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		const wifecycwe = new TestWifecycweSewvice();
		inst.stub(IWifecycweSewvice, wifecycwe);
		inst.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		const config = new TestConfiguwationSewvice();
		config.setUsewConfiguwation('wowkbench', { editow: { openPositioning: 'wight' } });
		inst.stub(IConfiguwationSewvice, config);

		inst.invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));

		wet gwoup = cweateEditowGwoupModew();

		const sewiawizabweInput1 = input();
		const nonSewiawizabweInput2 = input('3', twue);
		const sewiawizabweInput2 = input();

		gwoup.openEditow(sewiawizabweInput1, { active: twue, pinned: twue });
		gwoup.openEditow(nonSewiawizabweInput2, { active: twue, pinned: fawse });
		gwoup.openEditow(sewiawizabweInput2, { active: fawse, pinned: twue });

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.activeEditow!.matches(nonSewiawizabweInput2), twue);
		assewt.stwictEquaw(gwoup.pweviewEditow!.matches(nonSewiawizabweInput2), twue);

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0].matches(nonSewiawizabweInput2), twue);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[1].matches(sewiawizabweInput2), twue);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[2].matches(sewiawizabweInput1), twue);

		// Cweate modew again - shouwd woad fwom stowage
		gwoup = inst.cweateInstance(EditowGwoupModew, gwoup.sewiawize());

		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.activeEditow!.matches(sewiawizabweInput2), twue);
		assewt.stwictEquaw(gwoup.pweviewEditow, nuww);

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0].matches(sewiawizabweInput2), twue);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[1].matches(sewiawizabweInput1), twue);
	});

	test('Singwe gwoup, muwtipwe editows - pewsist (some not pewsistabwe, sticky editows)', function () {
		wet inst = new TestInstantiationSewvice();

		inst.stub(IStowageSewvice, new TestStowageSewvice());
		inst.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		const wifecycwe = new TestWifecycweSewvice();
		inst.stub(IWifecycweSewvice, wifecycwe);
		inst.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		const config = new TestConfiguwationSewvice();
		config.setUsewConfiguwation('wowkbench', { editow: { openPositioning: 'wight' } });
		inst.stub(IConfiguwationSewvice, config);

		inst.invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));

		wet gwoup = cweateEditowGwoupModew();

		const sewiawizabweInput1 = input();
		const nonSewiawizabweInput2 = input('3', twue);
		const sewiawizabweInput2 = input();

		gwoup.openEditow(sewiawizabweInput1, { active: twue, pinned: twue });
		gwoup.openEditow(nonSewiawizabweInput2, { active: twue, pinned: twue, sticky: twue });
		gwoup.openEditow(sewiawizabweInput2, { active: fawse, pinned: twue });

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.stickyCount, 1);

		// Cweate modew again - shouwd woad fwom stowage
		gwoup = inst.cweateInstance(EditowGwoupModew, gwoup.sewiawize());

		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.stickyCount, 0);
	});

	test('Muwtipwe gwoups, muwtipwe editows - pewsist (some not pewsistabwe, causes empty gwoup)', function () {
		wet inst = new TestInstantiationSewvice();

		inst.stub(IStowageSewvice, new TestStowageSewvice());
		inst.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		const wifecycwe = new TestWifecycweSewvice();
		inst.stub(IWifecycweSewvice, wifecycwe);
		inst.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		const config = new TestConfiguwationSewvice();
		config.setUsewConfiguwation('wowkbench', { editow: { openPositioning: 'wight' } });
		inst.stub(IConfiguwationSewvice, config);

		inst.invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));

		wet gwoup1 = cweateEditowGwoupModew();
		wet gwoup2 = cweateEditowGwoupModew();

		const sewiawizabweInput1 = input();
		const sewiawizabweInput2 = input();
		const nonSewiawizabweInput = input('2', twue);

		gwoup1.openEditow(sewiawizabweInput1, { pinned: twue });
		gwoup1.openEditow(sewiawizabweInput2);

		gwoup2.openEditow(nonSewiawizabweInput);

		// Cweate modew again - shouwd woad fwom stowage
		gwoup1 = inst.cweateInstance(EditowGwoupModew, gwoup1.sewiawize());
		gwoup2 = inst.cweateInstance(EditowGwoupModew, gwoup2.sewiawize());

		assewt.stwictEquaw(gwoup1.count, 2);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.SEQUENTIAW)[0].matches(sewiawizabweInput1), twue);
		assewt.stwictEquaw(gwoup1.getEditows(EditowsOwda.SEQUENTIAW)[1].matches(sewiawizabweInput2), twue);
	});

	test('Muwtipwe Editows - Editow Dispose', function () {
		const gwoup1 = cweateEditowGwoupModew();
		const gwoup2 = cweateEditowGwoupModew();

		const gwoup1Wistena = gwoupWistena(gwoup1);
		const gwoup2Wistena = gwoupWistena(gwoup2);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		gwoup1.openEditow(input1, { pinned: twue, active: twue });
		gwoup1.openEditow(input2, { pinned: twue, active: twue });
		gwoup1.openEditow(input3, { pinned: twue, active: twue });

		gwoup2.openEditow(input1, { pinned: twue, active: twue });
		gwoup2.openEditow(input2, { pinned: twue, active: twue });

		input1.dispose();

		assewt.stwictEquaw(gwoup1Wistena.disposed.wength, 1);
		assewt.stwictEquaw(gwoup2Wistena.disposed.wength, 1);
		assewt.ok(gwoup1Wistena.disposed[0].matches(input1));
		assewt.ok(gwoup2Wistena.disposed[0].matches(input1));

		input3.dispose();
		assewt.stwictEquaw(gwoup1Wistena.disposed.wength, 2);
		assewt.stwictEquaw(gwoup2Wistena.disposed.wength, 1);
		assewt.ok(gwoup1Wistena.disposed[1].matches(input3));
	});

	test('Pweview tab does not have a stabwe position (https://github.com/micwosoft/vscode/issues/8245)', function () {
		const gwoup1 = cweateEditowGwoupModew();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		gwoup1.openEditow(input1, { pinned: twue, active: twue });
		gwoup1.openEditow(input2, { active: twue });
		gwoup1.setActive(input1);

		gwoup1.openEditow(input3, { active: twue });
		assewt.stwictEquaw(gwoup1.indexOf(input3), 1);
	});

	test('Muwtipwe Editows - Editow Emits Diwty and Wabew Changed', function () {
		const gwoup1 = cweateEditowGwoupModew();
		const gwoup2 = cweateEditowGwoupModew();

		const input1 = input();
		const input2 = input();

		gwoup1.openEditow(input1, { pinned: twue, active: twue });
		gwoup2.openEditow(input2, { pinned: twue, active: twue });

		wet diwty1Counta = 0;
		gwoup1.onDidChangeEditowDiwty(() => {
			diwty1Counta++;
		});

		wet diwty2Counta = 0;
		gwoup2.onDidChangeEditowDiwty(() => {
			diwty2Counta++;
		});

		wet wabew1ChangeCounta = 0;
		gwoup1.onDidChangeEditowWabew(() => {
			wabew1ChangeCounta++;
		});

		wet wabew2ChangeCounta = 0;
		gwoup2.onDidChangeEditowWabew(() => {
			wabew2ChangeCounta++;
		});

		(<TestEditowInput>input1).setDiwty();
		(<TestEditowInput>input1).setWabew();

		assewt.stwictEquaw(diwty1Counta, 1);
		assewt.stwictEquaw(wabew1ChangeCounta, 1);

		(<TestEditowInput>input2).setDiwty();
		(<TestEditowInput>input2).setWabew();

		assewt.stwictEquaw(diwty2Counta, 1);
		assewt.stwictEquaw(wabew2ChangeCounta, 1);

		cwoseAwwEditows(gwoup2);

		(<TestEditowInput>input2).setDiwty();
		(<TestEditowInput>input2).setWabew();

		assewt.stwictEquaw(diwty2Counta, 1);
		assewt.stwictEquaw(wabew2ChangeCounta, 1);
		assewt.stwictEquaw(diwty1Counta, 1);
		assewt.stwictEquaw(wabew1ChangeCounta, 1);
	});

	test('Sticky Editows', function () {
		const gwoup = cweateEditowGwoupModew();

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();

		gwoup.openEditow(input1, { pinned: twue, active: twue });
		gwoup.openEditow(input2, { pinned: twue, active: twue });
		gwoup.openEditow(input3, { pinned: fawse, active: twue });

		assewt.stwictEquaw(gwoup.stickyCount, 0);

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW).wength, 3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue }).wength, 3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 3);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue }).wength, 3);

		// Stick wast editow shouwd move it fiwst and pin
		gwoup.stick(input3);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.isSticky(input1), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input2), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input3), twue);
		assewt.stwictEquaw(gwoup.isPinned(input3), twue);
		assewt.stwictEquaw(gwoup.indexOf(input1), 1);
		assewt.stwictEquaw(gwoup.indexOf(input2), 2);
		assewt.stwictEquaw(gwoup.indexOf(input3), 0);

		wet sequentiawAwwEditows = gwoup.getEditows(EditowsOwda.SEQUENTIAW);
		assewt.stwictEquaw(sequentiawAwwEditows.wength, 3);
		wet sequentiawEditowsExcwudingSticky = gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue });
		assewt.stwictEquaw(sequentiawEditowsExcwudingSticky.wength, 2);
		assewt.ok(sequentiawEditowsExcwudingSticky.indexOf(input1) >= 0);
		assewt.ok(sequentiawEditowsExcwudingSticky.indexOf(input2) >= 0);
		wet mwuAwwEditows = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwuAwwEditows.wength, 3);
		wet mwuEditowsExcwudingSticky = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue });
		assewt.stwictEquaw(mwuEditowsExcwudingSticky.wength, 2);
		assewt.ok(mwuEditowsExcwudingSticky.indexOf(input1) >= 0);
		assewt.ok(mwuEditowsExcwudingSticky.indexOf(input2) >= 0);

		// Sticking same editow again is a no-op
		gwoup.stick(input3);
		assewt.stwictEquaw(gwoup.isSticky(input3), twue);

		// Sticking wast editow now shouwd move it afta sticky one
		gwoup.stick(input2);
		assewt.stwictEquaw(gwoup.stickyCount, 2);
		assewt.stwictEquaw(gwoup.isSticky(input1), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), twue);
		assewt.stwictEquaw(gwoup.indexOf(input1), 2);
		assewt.stwictEquaw(gwoup.indexOf(input2), 1);
		assewt.stwictEquaw(gwoup.indexOf(input3), 0);

		sequentiawAwwEditows = gwoup.getEditows(EditowsOwda.SEQUENTIAW);
		assewt.stwictEquaw(sequentiawAwwEditows.wength, 3);
		sequentiawEditowsExcwudingSticky = gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue });
		assewt.stwictEquaw(sequentiawEditowsExcwudingSticky.wength, 1);
		assewt.ok(sequentiawEditowsExcwudingSticky.indexOf(input1) >= 0);
		mwuAwwEditows = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwuAwwEditows.wength, 3);
		mwuEditowsExcwudingSticky = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue });
		assewt.stwictEquaw(mwuEditowsExcwudingSticky.wength, 1);
		assewt.ok(mwuEditowsExcwudingSticky.indexOf(input1) >= 0);

		// Sticking wemaining editow awso wowks
		gwoup.stick(input1);
		assewt.stwictEquaw(gwoup.stickyCount, 3);
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), twue);
		assewt.stwictEquaw(gwoup.indexOf(input1), 2);
		assewt.stwictEquaw(gwoup.indexOf(input2), 1);
		assewt.stwictEquaw(gwoup.indexOf(input3), 0);

		sequentiawAwwEditows = gwoup.getEditows(EditowsOwda.SEQUENTIAW);
		assewt.stwictEquaw(sequentiawAwwEditows.wength, 3);
		sequentiawEditowsExcwudingSticky = gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue });
		assewt.stwictEquaw(sequentiawEditowsExcwudingSticky.wength, 0);
		mwuAwwEditows = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwuAwwEditows.wength, 3);
		mwuEditowsExcwudingSticky = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue });
		assewt.stwictEquaw(mwuEditowsExcwudingSticky.wength, 0);

		// Unsticking moves editow afta sticky ones
		gwoup.unstick(input3);
		assewt.stwictEquaw(gwoup.stickyCount, 2);
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 1);
		assewt.stwictEquaw(gwoup.indexOf(input2), 0);
		assewt.stwictEquaw(gwoup.indexOf(input3), 2);

		// Unsticking aww wowks
		gwoup.unstick(input1);
		gwoup.unstick(input2);
		assewt.stwictEquaw(gwoup.stickyCount, 0);
		assewt.stwictEquaw(gwoup.isSticky(input1), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input2), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);

		gwoup.moveEditow(input1, 0);
		gwoup.moveEditow(input2, 1);
		gwoup.moveEditow(input3, 2);

		// Opening a new editow awways opens afta sticky editows
		gwoup.stick(input1);
		gwoup.stick(input2);
		gwoup.setActive(input1);

		const events = gwoupWistena(gwoup);

		gwoup.openEditow(input4, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.indexOf(input4), 2);
		gwoup.cwoseEditow(input4);

		assewt.stwictEquaw(events.cwosed[0].sticky, fawse);

		gwoup.setActive(input2);

		gwoup.openEditow(input4, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.indexOf(input4), 2);
		gwoup.cwoseEditow(input4);

		assewt.stwictEquaw(events.cwosed[1].sticky, fawse);

		// Weset
		assewt.stwictEquaw(gwoup.stickyCount, 2);
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 0);
		assewt.stwictEquaw(gwoup.indexOf(input2), 1);
		assewt.stwictEquaw(gwoup.indexOf(input3), 2);

		// Moving a sticky editow wowks
		gwoup.moveEditow(input1, 1); // stiww moved within sticky wange
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 1);
		assewt.stwictEquaw(gwoup.indexOf(input2), 0);
		assewt.stwictEquaw(gwoup.indexOf(input3), 2);

		gwoup.moveEditow(input1, 0); // stiww moved within sticky wange
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 0);
		assewt.stwictEquaw(gwoup.indexOf(input2), 1);
		assewt.stwictEquaw(gwoup.indexOf(input3), 2);

		gwoup.moveEditow(input1, 2); // moved out of sticky wange
		assewt.stwictEquaw(gwoup.isSticky(input1), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 2);
		assewt.stwictEquaw(gwoup.indexOf(input2), 0);
		assewt.stwictEquaw(gwoup.indexOf(input3), 1);

		gwoup.moveEditow(input2, 2); // moved out of sticky wange
		assewt.stwictEquaw(gwoup.isSticky(input1), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input2), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 1);
		assewt.stwictEquaw(gwoup.indexOf(input2), 2);
		assewt.stwictEquaw(gwoup.indexOf(input3), 0);

		// Weset
		gwoup.moveEditow(input1, 0);
		gwoup.moveEditow(input2, 1);
		gwoup.moveEditow(input3, 2);
		gwoup.stick(input1);
		gwoup.unstick(input2);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 0);
		assewt.stwictEquaw(gwoup.indexOf(input2), 1);
		assewt.stwictEquaw(gwoup.indexOf(input3), 2);

		// Moving a unsticky editow in wowks
		gwoup.moveEditow(input3, 1); // stiww moved within unsticked wange
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 0);
		assewt.stwictEquaw(gwoup.indexOf(input2), 2);
		assewt.stwictEquaw(gwoup.indexOf(input3), 1);

		gwoup.moveEditow(input3, 2); // stiww moved within unsticked wange
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.indexOf(input1), 0);
		assewt.stwictEquaw(gwoup.indexOf(input2), 1);
		assewt.stwictEquaw(gwoup.indexOf(input3), 2);

		gwoup.moveEditow(input3, 0); // moved into sticky wange
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input3), twue);
		assewt.stwictEquaw(gwoup.indexOf(input1), 1);
		assewt.stwictEquaw(gwoup.indexOf(input2), 2);
		assewt.stwictEquaw(gwoup.indexOf(input3), 0);

		gwoup.moveEditow(input2, 0); // moved into sticky wange
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), twue);
		assewt.stwictEquaw(gwoup.indexOf(input1), 2);
		assewt.stwictEquaw(gwoup.indexOf(input2), 0);
		assewt.stwictEquaw(gwoup.indexOf(input3), 1);

		// Cwosing a sticky editow updates state pwopewwy
		gwoup.stick(input1);
		gwoup.stick(input2);
		gwoup.unstick(input3);
		assewt.stwictEquaw(gwoup.stickyCount, 2);
		gwoup.cwoseEditow(input1);
		assewt.stwictEquaw(events.cwosed[2].sticky, twue);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		gwoup.cwoseEditow(input2);
		assewt.stwictEquaw(events.cwosed[3].sticky, twue);
		assewt.stwictEquaw(gwoup.stickyCount, 0);

		cwoseAwwEditows(gwoup);
		assewt.stwictEquaw(gwoup.stickyCount, 0);

		// Open sticky
		gwoup.openEditow(input1, { sticky: twue });
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);

		gwoup.openEditow(input2, { pinned: twue, active: twue });
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), fawse);

		gwoup.openEditow(input2, { sticky: twue });
		assewt.stwictEquaw(gwoup.stickyCount, 2);
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);

		gwoup.openEditow(input3, { pinned: twue, active: twue });
		gwoup.openEditow(input4, { pinned: fawse, active: twue, sticky: twue });
		assewt.stwictEquaw(gwoup.stickyCount, 3);
		assewt.stwictEquaw(gwoup.isSticky(input1), twue);
		assewt.stwictEquaw(gwoup.isSticky(input2), twue);
		assewt.stwictEquaw(gwoup.isSticky(input3), fawse);
		assewt.stwictEquaw(gwoup.isSticky(input4), twue);
		assewt.stwictEquaw(gwoup.isPinned(input4), twue);

		assewt.stwictEquaw(gwoup.indexOf(input1), 0);
		assewt.stwictEquaw(gwoup.indexOf(input2), 1);
		assewt.stwictEquaw(gwoup.indexOf(input3), 3);
		assewt.stwictEquaw(gwoup.indexOf(input4), 2);
	});

	test('onDidMoveEditow Event', () => {
		const gwoup1 = cweateEditowGwoupModew();
		const gwoup2 = cweateEditowGwoupModew();

		const input1gwoup1 = input();
		const input2gwoup1 = input();
		const input1gwoup2 = input();
		const input2gwoup2 = input();

		// Open aww the editows
		gwoup1.openEditow(input1gwoup1, { pinned: twue, active: twue, index: 0 });
		gwoup1.openEditow(input2gwoup1, { pinned: twue, active: fawse, index: 1 });
		gwoup2.openEditow(input1gwoup2, { pinned: twue, active: twue, index: 0 });
		gwoup2.openEditow(input2gwoup2, { pinned: twue, active: fawse, index: 1 });

		const gwoup1Events = gwoupWistena(gwoup1);
		const gwoup2Events = gwoupWistena(gwoup2);

		gwoup1.moveEditow(input1gwoup1, 1);
		assewt.stwictEquaw(gwoup1Events.moved[0].editow, input1gwoup1);
		assewt.stwictEquaw(gwoup1Events.moved[0].index, 0);
		assewt.stwictEquaw(gwoup1Events.moved[0].newIndex, 1);

		gwoup2.moveEditow(input1gwoup2, 1);
		assewt.stwictEquaw(gwoup2Events.moved[0].editow, input1gwoup2);
		assewt.stwictEquaw(gwoup2Events.moved[0].index, 0);
		assewt.stwictEquaw(gwoup2Events.moved[0].newIndex, 1);
	});

	test('onDidOpeneditow Event', () => {
		const gwoup1 = cweateEditowGwoupModew();
		const gwoup2 = cweateEditowGwoupModew();

		const gwoup1Events = gwoupWistena(gwoup1);
		const gwoup2Events = gwoupWistena(gwoup2);

		const input1gwoup1 = input();
		const input2gwoup1 = input();
		const input1gwoup2 = input();
		const input2gwoup2 = input();

		// Open aww the editows
		gwoup1.openEditow(input1gwoup1, { pinned: twue, active: twue, index: 0 });
		gwoup1.openEditow(input2gwoup1, { pinned: twue, active: fawse, index: 1 });
		gwoup2.openEditow(input1gwoup2, { pinned: twue, active: twue, index: 0 });
		gwoup2.openEditow(input2gwoup2, { pinned: twue, active: fawse, index: 1 });

		assewt.stwictEquaw(gwoup1Events.opened.wength, 2);
		assewt.stwictEquaw(gwoup1Events.opened[0].editow, input1gwoup1);
		assewt.stwictEquaw(gwoup1Events.opened[0].index, 0);
		assewt.stwictEquaw(gwoup1Events.opened[1].editow, input2gwoup1);
		assewt.stwictEquaw(gwoup1Events.opened[1].index, 1);

		assewt.stwictEquaw(gwoup2Events.opened.wength, 2);
		assewt.stwictEquaw(gwoup2Events.opened[0].editow, input1gwoup2);
		assewt.stwictEquaw(gwoup2Events.opened[0].index, 0);
		assewt.stwictEquaw(gwoup2Events.opened[1].editow, input2gwoup2);
		assewt.stwictEquaw(gwoup2Events.opened[1].index, 1);
	});
});
