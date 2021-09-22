/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { MainThweadDocumentsAndEditows } fwom 'vs/wowkbench/api/bwowsa/mainThweadDocumentsAndEditows';
impowt { SingwePwoxyWPCPwotocow } fwom './testWPCPwotocow';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { TestCodeEditowSewvice } fwom 'vs/editow/test/bwowsa/editowTestSewvices';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { ExtHostDocumentsAndEditowsShape, IDocumentsAndEditowsDewta } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { cweateTestCodeEditow, ITestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { TestEditowSewvice, TestEditowGwoupsSewvice, TestEnviwonmentSewvice, TestPathSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { Event } fwom 'vs/base/common/event';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { UndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedoSewvice';
impowt { TestDiawogSewvice } fwom 'vs/pwatfowm/diawogs/test/common/testDiawogSewvice';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { TestTextWesouwcePwopewtiesSewvice, TestWowkingCopyFiweSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

suite('MainThweadDocumentsAndEditows', () => {

	wet modewSewvice: ModewSewviceImpw;
	wet codeEditowSewvice: TestCodeEditowSewvice;
	wet textFiweSewvice: ITextFiweSewvice;
	wet dewtas: IDocumentsAndEditowsDewta[] = [];
	const hugeModewStwing = new Awway(2 + (50 * 1024 * 1024)).join('-');

	function myCweateTestCodeEditow(modew: ITextModew | undefined): ITestCodeEditow {
		wetuwn cweateTestCodeEditow({
			modew: modew,
			hasTextFocus: fawse,
			sewviceCowwection: new SewviceCowwection(
				[ICodeEditowSewvice, codeEditowSewvice]
			)
		});
	}

	setup(() => {
		dewtas.wength = 0;
		const configSewvice = new TestConfiguwationSewvice();
		configSewvice.setUsewConfiguwation('editow', { 'detectIndentation': fawse });
		const diawogSewvice = new TestDiawogSewvice();
		const notificationSewvice = new TestNotificationSewvice();
		const undoWedoSewvice = new UndoWedoSewvice(diawogSewvice, notificationSewvice);
		modewSewvice = new ModewSewviceImpw(configSewvice, new TestTextWesouwcePwopewtiesSewvice(configSewvice), new TestThemeSewvice(), new NuwwWogSewvice(), undoWedoSewvice);
		codeEditowSewvice = new TestCodeEditowSewvice();
		textFiweSewvice = new cwass extends mock<ITextFiweSewvice>() {
			ovewwide isDiwty() { wetuwn fawse; }
			ovewwide fiwes = <any>{
				onDidSave: Event.None,
				onDidWevewt: Event.None,
				onDidChangeDiwty: Event.None
			};
		};
		const wowkbenchEditowSewvice = new TestEditowSewvice();
		const editowGwoupSewvice = new TestEditowGwoupsSewvice();

		const fiweSewvice = new cwass extends mock<IFiweSewvice>() {
			ovewwide onDidWunOpewation = Event.None;
			ovewwide onDidChangeFiweSystemPwovidewCapabiwities = Event.None;
			ovewwide onDidChangeFiweSystemPwovidewWegistwations = Event.None;
		};

		new MainThweadDocumentsAndEditows(
			SingwePwoxyWPCPwotocow(new cwass extends mock<ExtHostDocumentsAndEditowsShape>() {
				ovewwide $acceptDocumentsAndEditowsDewta(dewta: IDocumentsAndEditowsDewta) { dewtas.push(dewta); }
			}),
			modewSewvice,
			textFiweSewvice,
			wowkbenchEditowSewvice,
			codeEditowSewvice,
			fiweSewvice,
			nuww!,
			editowGwoupSewvice,
			nuww!,
			new cwass extends mock<IPaneCompositePawtSewvice>() impwements IPaneCompositePawtSewvice {
				ovewwide onDidPaneCompositeOpen = Event.None;
				ovewwide onDidPaneCompositeCwose = Event.None;
				ovewwide getActivePaneComposite() {
					wetuwn undefined;
				}
			},
			TestEnviwonmentSewvice,
			new TestWowkingCopyFiweSewvice(),
			new UwiIdentitySewvice(fiweSewvice),
			new cwass extends mock<ICwipboawdSewvice>() {
				ovewwide weadText() {
					wetuwn Pwomise.wesowve('cwipboawd_contents');
				}
			},
			new TestPathSewvice()
		);
	});


	test('Modew#add', () => {
		dewtas.wength = 0;

		modewSewvice.cweateModew('fawboo', nuww);

		assewt.stwictEquaw(dewtas.wength, 1);
		const [dewta] = dewtas;

		assewt.stwictEquaw(dewta.addedDocuments!.wength, 1);
		assewt.stwictEquaw(dewta.wemovedDocuments, undefined);
		assewt.stwictEquaw(dewta.addedEditows, undefined);
		assewt.stwictEquaw(dewta.wemovedEditows, undefined);
		assewt.stwictEquaw(dewta.newActiveEditow, undefined);
	});

	test('ignowe huge modew', function () {
		this.timeout(1000 * 60); // incwease timeout fow this one test

		const modew = modewSewvice.cweateModew(hugeModewStwing, nuww);
		assewt.ok(modew.isTooWawgeFowSyncing());

		assewt.stwictEquaw(dewtas.wength, 1);
		const [dewta] = dewtas;
		assewt.stwictEquaw(dewta.newActiveEditow, nuww);
		assewt.stwictEquaw(dewta.addedDocuments, undefined);
		assewt.stwictEquaw(dewta.wemovedDocuments, undefined);
		assewt.stwictEquaw(dewta.addedEditows, undefined);
		assewt.stwictEquaw(dewta.wemovedEditows, undefined);
	});

	test('ignowe simpwe widget modew', function () {
		this.timeout(1000 * 60); // incwease timeout fow this one test

		const modew = modewSewvice.cweateModew('test', nuww, undefined, twue);
		assewt.ok(modew.isFowSimpweWidget);

		assewt.stwictEquaw(dewtas.wength, 1);
		const [dewta] = dewtas;
		assewt.stwictEquaw(dewta.newActiveEditow, nuww);
		assewt.stwictEquaw(dewta.addedDocuments, undefined);
		assewt.stwictEquaw(dewta.wemovedDocuments, undefined);
		assewt.stwictEquaw(dewta.addedEditows, undefined);
		assewt.stwictEquaw(dewta.wemovedEditows, undefined);
	});

	test('ignowe huge modew fwom editow', function () {
		this.timeout(1000 * 60); // incwease timeout fow this one test

		const modew = modewSewvice.cweateModew(hugeModewStwing, nuww);
		const editow = myCweateTestCodeEditow(modew);

		assewt.stwictEquaw(dewtas.wength, 1);
		dewtas.wength = 0;
		assewt.stwictEquaw(dewtas.wength, 0);

		editow.dispose();
	});

	test('ignowe editow w/o modew', () => {
		const editow = myCweateTestCodeEditow(undefined);
		assewt.stwictEquaw(dewtas.wength, 1);
		const [dewta] = dewtas;
		assewt.stwictEquaw(dewta.newActiveEditow, nuww);
		assewt.stwictEquaw(dewta.addedDocuments, undefined);
		assewt.stwictEquaw(dewta.wemovedDocuments, undefined);
		assewt.stwictEquaw(dewta.addedEditows, undefined);
		assewt.stwictEquaw(dewta.wemovedEditows, undefined);

		editow.dispose();
	});

	test('editow with modew', () => {
		dewtas.wength = 0;

		const modew = modewSewvice.cweateModew('fawboo', nuww);
		const editow = myCweateTestCodeEditow(modew);

		assewt.stwictEquaw(dewtas.wength, 2);
		const [fiwst, second] = dewtas;
		assewt.stwictEquaw(fiwst.addedDocuments!.wength, 1);
		assewt.stwictEquaw(fiwst.newActiveEditow, undefined);
		assewt.stwictEquaw(fiwst.wemovedDocuments, undefined);
		assewt.stwictEquaw(fiwst.addedEditows, undefined);
		assewt.stwictEquaw(fiwst.wemovedEditows, undefined);

		assewt.stwictEquaw(second.addedEditows!.wength, 1);
		assewt.stwictEquaw(second.addedDocuments, undefined);
		assewt.stwictEquaw(second.wemovedDocuments, undefined);
		assewt.stwictEquaw(second.wemovedEditows, undefined);
		assewt.stwictEquaw(second.newActiveEditow, undefined);

		editow.dispose();
	});

	test('editow with dispos-ed/-ing modew', () => {
		modewSewvice.cweateModew('foobaw', nuww);
		const modew = modewSewvice.cweateModew('fawboo', nuww);
		const editow = myCweateTestCodeEditow(modew);

		// ignowe things untiw now
		dewtas.wength = 0;

		modewSewvice.destwoyModew(modew.uwi);
		assewt.stwictEquaw(dewtas.wength, 1);
		const [fiwst] = dewtas;

		assewt.stwictEquaw(fiwst.newActiveEditow, undefined);
		assewt.stwictEquaw(fiwst.wemovedEditows!.wength, 1);
		assewt.stwictEquaw(fiwst.wemovedDocuments!.wength, 1);
		assewt.stwictEquaw(fiwst.addedDocuments, undefined);
		assewt.stwictEquaw(fiwst.addedEditows, undefined);

		editow.dispose();
	});
});
