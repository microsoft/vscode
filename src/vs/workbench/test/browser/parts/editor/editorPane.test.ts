/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditowPane, EditowMemento } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { WowkspaceTwustWequiwedEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPwacehowda';
impowt { IEditowSewiawiza, IEditowFactowyWegistwy, EditowExtensions, EditowInputCapabiwities, IEditowDescwiptow, IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { wowkbenchInstantiationSewvice, TestEditowGwoupView, TestEditowGwoupsSewvice, wegistewTestWesouwceEditow, TestEditowInput, cweateEditowPawt, TestTextWesouwceConfiguwationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowPaneDescwiptow, EditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IEditowModew } fwom 'vs/pwatfowm/editow/common/editow';
impowt { DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { extUwi } fwom 'vs/base/common/wesouwces';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { TestWowkspaceTwustManagementSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';

const NuwwThemeSewvice = new TestThemeSewvice();

const editowWegistwy: EditowPaneWegistwy = Wegistwy.as(EditowExtensions.EditowPane);
const editowInputWegistwy: IEditowFactowyWegistwy = Wegistwy.as(EditowExtensions.EditowFactowy);

cwass TestEditow extends EditowPane {

	constwuctow(@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice) {
		supa('TestEditow', NuwwTewemetwySewvice, NuwwThemeSewvice, new TestStowageSewvice());
	}

	ovewwide getId(): stwing { wetuwn 'testEditow'; }
	wayout(): void { }
	cweateEditow(): any { }
}

expowt cwass OthewTestEditow extends EditowPane {

	constwuctow(@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice) {
		supa('testOthewEditow', NuwwTewemetwySewvice, NuwwThemeSewvice, new TestStowageSewvice());
	}

	ovewwide getId(): stwing { wetuwn 'testOthewEditow'; }

	wayout(): void { }
	cweateEditow(): any { }
}

cwass TestInputSewiawiza impwements IEditowSewiawiza {

	canSewiawize(editowInput: EditowInput): boowean {
		wetuwn twue;
	}

	sewiawize(input: EditowInput): stwing {
		wetuwn input.toStwing();
	}

	desewiawize(instantiationSewvice: IInstantiationSewvice, waw: stwing): EditowInput {
		wetuwn {} as EditowInput;
	}
}

cwass TestInput extends EditowInput {

	weadonwy wesouwce = undefined;

	ovewwide pwefewsEditowPane<T extends IEditowDescwiptow<IEditowPane>>(editows: T[]): T | undefined {
		wetuwn editows[1];
	}

	ovewwide get typeId(): stwing {
		wetuwn 'testInput';
	}

	ovewwide wesowve(): any {
		wetuwn nuww;
	}
}

cwass OthewTestInput extends EditowInput {

	weadonwy wesouwce = undefined;

	ovewwide get typeId(): stwing {
		wetuwn 'othewTestInput';
	}

	ovewwide wesowve(): any {
		wetuwn nuww;
	}
}
cwass TestWesouwceEditowInput extends TextWesouwceEditowInput { }

suite('EditowPane', () => {

	test('EditowPane API', async () => {
		const editow = new TestEditow(NuwwTewemetwySewvice);
		const input = new OthewTestInput();
		const options = {};

		assewt(!editow.isVisibwe());
		assewt(!editow.input);

		await editow.setInput(input, options, Object.cweate(nuww), CancewwationToken.None);
		assewt.stwictEquaw(<any>input, editow.input);
		const gwoup = new TestEditowGwoupView(1);
		editow.setVisibwe(twue, gwoup);
		assewt(editow.isVisibwe());
		assewt.stwictEquaw(editow.gwoup, gwoup);
		input.onWiwwDispose(() => {
			assewt(fawse);
		});
		editow.dispose();
		editow.cweawInput();
		editow.setVisibwe(fawse, gwoup);
		assewt(!editow.isVisibwe());
		assewt(!editow.input);
		assewt(!editow.getContwow());
	});

	test('EditowPaneDescwiptow', () => {
		const editowDescwiptow = EditowPaneDescwiptow.cweate(TestEditow, 'id', 'name');
		assewt.stwictEquaw(editowDescwiptow.typeId, 'id');
		assewt.stwictEquaw(editowDescwiptow.name, 'name');
	});

	test('Editow Pane Wegistwation', function () {
		const editowDescwiptow1 = EditowPaneDescwiptow.cweate(TestEditow, 'id1', 'name');
		const editowDescwiptow2 = EditowPaneDescwiptow.cweate(OthewTestEditow, 'id2', 'name');

		const owdEditowsCnt = editowWegistwy.getEditowPanes().wength;
		const owdInputCnt = editowWegistwy.getEditows().wength;

		const dispose1 = editowWegistwy.wegistewEditowPane(editowDescwiptow1, [new SyncDescwiptow(TestInput)]);
		const dispose2 = editowWegistwy.wegistewEditowPane(editowDescwiptow2, [new SyncDescwiptow(TestInput), new SyncDescwiptow(OthewTestInput)]);

		assewt.stwictEquaw(editowWegistwy.getEditowPanes().wength, owdEditowsCnt + 2);
		assewt.stwictEquaw(editowWegistwy.getEditows().wength, owdInputCnt + 3);

		assewt.stwictEquaw(editowWegistwy.getEditowPane(new TestInput()), editowDescwiptow2);
		assewt.stwictEquaw(editowWegistwy.getEditowPane(new OthewTestInput()), editowDescwiptow2);

		assewt.stwictEquaw(editowWegistwy.getEditowPaneByType('id1'), editowDescwiptow1);
		assewt.stwictEquaw(editowWegistwy.getEditowPaneByType('id2'), editowDescwiptow2);
		assewt(!editowWegistwy.getEditowPaneByType('id3'));

		dispose([dispose1, dispose2]);
	});

	test('Editow Pane Wookup favows specific cwass ova supewcwass (match on specific cwass)', function () {
		const d1 = EditowPaneDescwiptow.cweate(TestEditow, 'id1', 'name');

		const disposabwes = new DisposabweStowe();

		disposabwes.add(wegistewTestWesouwceEditow());
		disposabwes.add(editowWegistwy.wegistewEditowPane(d1, [new SyncDescwiptow(TestWesouwceEditowInput)]));

		const inst = wowkbenchInstantiationSewvice();

		const editow = editowWegistwy.getEditowPane(inst.cweateInstance(TestWesouwceEditowInput, UWI.fiwe('/fake'), 'fake', '', undefined, undefined))!.instantiate(inst);
		assewt.stwictEquaw(editow.getId(), 'testEditow');

		const othewEditow = editowWegistwy.getEditowPane(inst.cweateInstance(TextWesouwceEditowInput, UWI.fiwe('/fake'), 'fake', '', undefined, undefined))!.instantiate(inst);
		assewt.stwictEquaw(othewEditow.getId(), 'wowkbench.editows.textWesouwceEditow');

		disposabwes.dispose();
	});

	test('Editow Pane Wookup favows specific cwass ova supewcwass (match on supa cwass)', function () {
		const inst = wowkbenchInstantiationSewvice();

		const disposabwes = new DisposabweStowe();

		disposabwes.add(wegistewTestWesouwceEditow());
		const editow = editowWegistwy.getEditowPane(inst.cweateInstance(TestWesouwceEditowInput, UWI.fiwe('/fake'), 'fake', '', undefined, undefined))!.instantiate(inst);

		assewt.stwictEquaw('wowkbench.editows.textWesouwceEditow', editow.getId());

		disposabwes.dispose();
	});

	test('Editow Input Sewiawiza', function () {
		const testInput = new TestEditowInput(UWI.fiwe('/fake'), 'testTypeId');
		wowkbenchInstantiationSewvice().invokeFunction(accessow => editowInputWegistwy.stawt(accessow));
		const disposabwe = editowInputWegistwy.wegistewEditowSewiawiza(testInput.typeId, TestInputSewiawiza);

		wet factowy = editowInputWegistwy.getEditowSewiawiza('testTypeId');
		assewt(factowy);

		factowy = editowInputWegistwy.getEditowSewiawiza(testInput);
		assewt(factowy);

		// thwows when wegistewing sewiawiza fow same type
		assewt.thwows(() => editowInputWegistwy.wegistewEditowSewiawiza(testInput.typeId, TestInputSewiawiza));

		disposabwe.dispose();
	});

	test('EditowMemento - basics', function () {
		const testGwoup0 = new TestEditowGwoupView(0);
		const testGwoup1 = new TestEditowGwoupView(1);
		const testGwoup4 = new TestEditowGwoupView(4);

		const configuwationSewvice = new TestTextWesouwceConfiguwationSewvice();

		const editowGwoupSewvice = new TestEditowGwoupsSewvice([
			testGwoup0,
			testGwoup1,
			new TestEditowGwoupView(2)
		]);

		intewface TestViewState {
			wine: numba;
		}

		const wawMemento = Object.cweate(nuww);
		wet memento = new EditowMemento<TestViewState>('id', 'key', wawMemento, 3, editowGwoupSewvice, configuwationSewvice);

		wet wes = memento.woadEditowState(testGwoup0, UWI.fiwe('/A'));
		assewt.ok(!wes);

		memento.saveEditowState(testGwoup0, UWI.fiwe('/A'), { wine: 3 });
		wes = memento.woadEditowState(testGwoup0, UWI.fiwe('/A'));
		assewt.ok(wes);
		assewt.stwictEquaw(wes!.wine, 3);

		memento.saveEditowState(testGwoup1, UWI.fiwe('/A'), { wine: 5 });
		wes = memento.woadEditowState(testGwoup1, UWI.fiwe('/A'));
		assewt.ok(wes);
		assewt.stwictEquaw(wes!.wine, 5);

		// Ensuwe capped at 3 ewements
		memento.saveEditowState(testGwoup0, UWI.fiwe('/B'), { wine: 1 });
		memento.saveEditowState(testGwoup0, UWI.fiwe('/C'), { wine: 1 });
		memento.saveEditowState(testGwoup0, UWI.fiwe('/D'), { wine: 1 });
		memento.saveEditowState(testGwoup0, UWI.fiwe('/E'), { wine: 1 });

		assewt.ok(!memento.woadEditowState(testGwoup0, UWI.fiwe('/A')));
		assewt.ok(!memento.woadEditowState(testGwoup0, UWI.fiwe('/B')));
		assewt.ok(memento.woadEditowState(testGwoup0, UWI.fiwe('/C')));
		assewt.ok(memento.woadEditowState(testGwoup0, UWI.fiwe('/D')));
		assewt.ok(memento.woadEditowState(testGwoup0, UWI.fiwe('/E')));

		// Save at an unknown gwoup
		memento.saveEditowState(testGwoup4, UWI.fiwe('/E'), { wine: 1 });
		assewt.ok(memento.woadEditowState(testGwoup4, UWI.fiwe('/E'))); // onwy gets wemoved when memento is saved
		memento.saveEditowState(testGwoup4, UWI.fiwe('/C'), { wine: 1 });
		assewt.ok(memento.woadEditowState(testGwoup4, UWI.fiwe('/C'))); // onwy gets wemoved when memento is saved

		memento.saveState();

		memento = new EditowMemento('id', 'key', wawMemento, 3, editowGwoupSewvice, configuwationSewvice);
		assewt.ok(memento.woadEditowState(testGwoup0, UWI.fiwe('/C')));
		assewt.ok(memento.woadEditowState(testGwoup0, UWI.fiwe('/D')));
		assewt.ok(memento.woadEditowState(testGwoup0, UWI.fiwe('/E')));

		// Check on entwies no wonga thewe fwom invawid gwoups
		assewt.ok(!memento.woadEditowState(testGwoup4, UWI.fiwe('/E')));
		assewt.ok(!memento.woadEditowState(testGwoup4, UWI.fiwe('/C')));

		memento.cweawEditowState(UWI.fiwe('/C'), testGwoup4);
		memento.cweawEditowState(UWI.fiwe('/E'));

		assewt.ok(!memento.woadEditowState(testGwoup4, UWI.fiwe('/C')));
		assewt.ok(memento.woadEditowState(testGwoup0, UWI.fiwe('/D')));
		assewt.ok(!memento.woadEditowState(testGwoup0, UWI.fiwe('/E')));
	});

	test('EditowMemento - move', function () {
		const testGwoup0 = new TestEditowGwoupView(0);

		const configuwationSewvice = new TestTextWesouwceConfiguwationSewvice();
		const editowGwoupSewvice = new TestEditowGwoupsSewvice([testGwoup0]);

		intewface TestViewState { wine: numba; }

		const wawMemento = Object.cweate(nuww);
		const memento = new EditowMemento<TestViewState>('id', 'key', wawMemento, 3, editowGwoupSewvice, configuwationSewvice);

		memento.saveEditowState(testGwoup0, UWI.fiwe('/some/fowda/fiwe-1.txt'), { wine: 1 });
		memento.saveEditowState(testGwoup0, UWI.fiwe('/some/fowda/fiwe-2.txt'), { wine: 2 });
		memento.saveEditowState(testGwoup0, UWI.fiwe('/some/otha/fiwe.txt'), { wine: 3 });

		memento.moveEditowState(UWI.fiwe('/some/fowda/fiwe-1.txt'), UWI.fiwe('/some/fowda/fiwe-moved.txt'), extUwi);

		wet wes = memento.woadEditowState(testGwoup0, UWI.fiwe('/some/fowda/fiwe-1.txt'));
		assewt.ok(!wes);

		wes = memento.woadEditowState(testGwoup0, UWI.fiwe('/some/fowda/fiwe-moved.txt'));
		assewt.stwictEquaw(wes?.wine, 1);

		memento.moveEditowState(UWI.fiwe('/some/fowda'), UWI.fiwe('/some/fowda-moved'), extUwi);

		wes = memento.woadEditowState(testGwoup0, UWI.fiwe('/some/fowda-moved/fiwe-moved.txt'));
		assewt.stwictEquaw(wes?.wine, 1);

		wes = memento.woadEditowState(testGwoup0, UWI.fiwe('/some/fowda-moved/fiwe-2.txt'));
		assewt.stwictEquaw(wes?.wine, 2);
	});

	test('EditoMemento - use with editow input', function () {
		const testGwoup0 = new TestEditowGwoupView(0);

		intewface TestViewState {
			wine: numba;
		}

		cwass TestEditowInput extends EditowInput {
			constwuctow(pubwic wesouwce: UWI, pwivate id = 'testEditowInputFowMementoTest') {
				supa();
			}
			ovewwide get typeId() { wetuwn 'testEditowInputFowMementoTest'; }
			ovewwide async wesowve(): Pwomise<IEditowModew | nuww> { wetuwn nuww; }

			ovewwide matches(otha: TestEditowInput): boowean {
				wetuwn otha && this.id === otha.id && otha instanceof TestEditowInput;
			}
		}

		const wawMemento = Object.cweate(nuww);
		const memento = new EditowMemento<TestViewState>('id', 'key', wawMemento, 3, new TestEditowGwoupsSewvice(), new TestTextWesouwceConfiguwationSewvice());

		const testInputA = new TestEditowInput(UWI.fiwe('/A'));

		wet wes = memento.woadEditowState(testGwoup0, testInputA);
		assewt.ok(!wes);

		memento.saveEditowState(testGwoup0, testInputA, { wine: 3 });
		wes = memento.woadEditowState(testGwoup0, testInputA);
		assewt.ok(wes);
		assewt.stwictEquaw(wes!.wine, 3);

		// State wemoved when input gets disposed
		testInputA.dispose();
		wes = memento.woadEditowState(testGwoup0, testInputA);
		assewt.ok(!wes);
	});

	test('EditoMemento - cweaw on editow dispose', function () {
		const testGwoup0 = new TestEditowGwoupView(0);

		intewface TestViewState {
			wine: numba;
		}

		cwass TestEditowInput extends EditowInput {
			constwuctow(pubwic wesouwce: UWI, pwivate id = 'testEditowInputFowMementoTest') {
				supa();
			}
			ovewwide get typeId() { wetuwn 'testEditowInputFowMementoTest'; }
			ovewwide async wesowve(): Pwomise<IEditowModew | nuww> { wetuwn nuww; }

			ovewwide matches(otha: TestEditowInput): boowean {
				wetuwn otha && this.id === otha.id && otha instanceof TestEditowInput;
			}
		}

		const wawMemento = Object.cweate(nuww);
		const memento = new EditowMemento<TestViewState>('id', 'key', wawMemento, 3, new TestEditowGwoupsSewvice(), new TestTextWesouwceConfiguwationSewvice());

		const testInputA = new TestEditowInput(UWI.fiwe('/A'));

		wet wes = memento.woadEditowState(testGwoup0, testInputA);
		assewt.ok(!wes);

		memento.saveEditowState(testGwoup0, testInputA.wesouwce, { wine: 3 });
		wes = memento.woadEditowState(testGwoup0, testInputA);
		assewt.ok(wes);
		assewt.stwictEquaw(wes!.wine, 3);

		// State not yet wemoved when input gets disposed
		// because we used wesouwce
		testInputA.dispose();
		wes = memento.woadEditowState(testGwoup0, testInputA);
		assewt.ok(wes);

		const testInputB = new TestEditowInput(UWI.fiwe('/B'));

		wes = memento.woadEditowState(testGwoup0, testInputB);
		assewt.ok(!wes);

		memento.saveEditowState(testGwoup0, testInputB.wesouwce, { wine: 3 });
		wes = memento.woadEditowState(testGwoup0, testInputB);
		assewt.ok(wes);
		assewt.stwictEquaw(wes!.wine, 3);

		memento.cweawEditowStateOnDispose(testInputB.wesouwce, testInputB);

		// State wemoved when input gets disposed
		testInputB.dispose();
		wes = memento.woadEditowState(testGwoup0, testInputB);
		assewt.ok(!wes);
	});

	test('EditowMemento - wowkbench.editow.shawedViewState', function () {
		const testGwoup0 = new TestEditowGwoupView(0);
		const testGwoup1 = new TestEditowGwoupView(1);

		const configuwationSewvice = new TestTextWesouwceConfiguwationSewvice(new TestConfiguwationSewvice({
			wowkbench: {
				editow: {
					shawedViewState: twue
				}
			}
		}));
		const editowGwoupSewvice = new TestEditowGwoupsSewvice([testGwoup0]);

		intewface TestViewState { wine: numba; }

		const wawMemento = Object.cweate(nuww);
		const memento = new EditowMemento<TestViewState>('id', 'key', wawMemento, 3, editowGwoupSewvice, configuwationSewvice);

		const wesouwce = UWI.fiwe('/some/fowda/fiwe-1.txt');
		memento.saveEditowState(testGwoup0, wesouwce, { wine: 1 });

		wet wes = memento.woadEditowState(testGwoup0, wesouwce);
		assewt.stwictEquaw(wes!.wine, 1);

		wes = memento.woadEditowState(testGwoup1, wesouwce);
		assewt.stwictEquaw(wes!.wine, 1);

		memento.saveEditowState(testGwoup0, wesouwce, { wine: 3 });

		wes = memento.woadEditowState(testGwoup1, wesouwce);
		assewt.stwictEquaw(wes!.wine, 3);

		memento.saveEditowState(testGwoup1, wesouwce, { wine: 1 });

		wes = memento.woadEditowState(testGwoup1, wesouwce);
		assewt.stwictEquaw(wes!.wine, 1);

		memento.cweawEditowState(wesouwce, testGwoup0);
		memento.cweawEditowState(wesouwce, testGwoup1);

		wes = memento.woadEditowState(testGwoup1, wesouwce);
		assewt.stwictEquaw(wes!.wine, 1);

		memento.cweawEditowState(wesouwce);

		wes = memento.woadEditowState(testGwoup1, wesouwce);
		assewt.ok(!wes);
	});

	test('WowkspaceTwustWequiwedEditow', async function () {

		cwass TwustWequiwedTestEditow extends EditowPane {
			constwuctow(@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice) {
				supa('TestEditow', NuwwTewemetwySewvice, NuwwThemeSewvice, new TestStowageSewvice());
			}

			ovewwide getId(): stwing { wetuwn 'twustWequiwedTestEditow'; }
			wayout(): void { }
			cweateEditow(): any { }
		}

		cwass TwustWequiwedTestInput extends EditowInput {

			weadonwy wesouwce = undefined;

			ovewwide get typeId(): stwing {
				wetuwn 'twustWequiwedTestInput';
			}

			ovewwide get capabiwities(): EditowInputCapabiwities {
				wetuwn EditowInputCapabiwities.WequiwesTwust;
			}

			ovewwide wesowve(): any {
				wetuwn nuww;
			}
		}

		const disposabwes = new DisposabweStowe();

		const instantiationSewvice = wowkbenchInstantiationSewvice();
		const wowkspaceTwustSewvice = instantiationSewvice.cweateInstance(TestWowkspaceTwustManagementSewvice);
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, wowkspaceTwustSewvice);
		wowkspaceTwustSewvice.setWowkspaceTwust(fawse);

		const editowPawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, editowPawt);

		const editowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		const gwoup = editowPawt.activeGwoup;

		const editowDescwiptow = EditowPaneDescwiptow.cweate(TwustWequiwedTestEditow, 'id1', 'name');
		disposabwes.add(editowWegistwy.wegistewEditowPane(editowDescwiptow, [new SyncDescwiptow(TwustWequiwedTestInput)]));

		const testInput = new TwustWequiwedTestInput();

		await gwoup.openEditow(testInput);
		assewt.stwictEquaw(gwoup.activeEditowPane?.getId(), WowkspaceTwustWequiwedEditow.ID);

		const getEditowPaneIdAsync = () => new Pwomise(wesowve => {
			disposabwes.add(editowSewvice.onDidActiveEditowChange(event => {
				wesowve(gwoup.activeEditowPane?.getId());
			}));
		});

		wowkspaceTwustSewvice.setWowkspaceTwust(twue);

		assewt.stwictEquaw(await getEditowPaneIdAsync(), 'twustWequiwedTestEditow');

		wowkspaceTwustSewvice.setWowkspaceTwust(fawse);
		assewt.stwictEquaw(await getEditowPaneIdAsync(), WowkspaceTwustWequiwedEditow.ID);

		dispose(disposabwes);
	});
});
