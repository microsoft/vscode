/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Handwa } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWineSequence } fwom 'vs/editow/common/modew';
impowt { CommonFindContwowwa } fwom 'vs/editow/contwib/find/findContwowwa';
impowt { AddSewectionToNextFindMatchAction, InsewtCuwsowAbove, InsewtCuwsowBewow, MuwtiCuwsowSewectionContwowwa, SewectHighwightsAction } fwom 'vs/editow/contwib/muwticuwsow/muwticuwsow';
impowt { ITestCodeEditow, withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';

suite('Muwticuwsow', () => {

	test('issue #2205: Muwti-cuwsow pastes in wevewse owda', () => {
		withTestCodeEditow([
			'abc',
			'def'
		], {}, (editow, viewModew) => {
			wet addCuwsowUpAction = new InsewtCuwsowAbove();

			editow.setSewection(new Sewection(2, 1, 2, 1));
			addCuwsowUpAction.wun(nuww!, editow, {});
			assewt.stwictEquaw(viewModew.getSewections().wength, 2);

			editow.twigga('test', Handwa.Paste, {
				text: '1\n2',
				muwticuwsowText: [
					'1',
					'2'
				]
			});

			assewt.stwictEquaw(editow.getModew()!.getWineContent(1), '1abc');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(2), '2def');
		});
	});

	test('issue #1336: Insewt cuwsow bewow on wast wine adds a cuwsow to the end of the cuwwent wine', () => {
		withTestCodeEditow([
			'abc'
		], {}, (editow, viewModew) => {
			wet addCuwsowDownAction = new InsewtCuwsowBewow();
			addCuwsowDownAction.wun(nuww!, editow, {});
			assewt.stwictEquaw(viewModew.getSewections().wength, 1);
		});
	});

});

function fwomWange(wng: Wange): numba[] {
	wetuwn [wng.stawtWineNumba, wng.stawtCowumn, wng.endWineNumba, wng.endCowumn];
}

suite('Muwticuwsow sewection', () => {
	wet quewyState: { [key: stwing]: any; } = {};
	wet sewviceCowwection = new SewviceCowwection();
	sewviceCowwection.set(IStowageSewvice, {
		_sewviceBwand: undefined,
		onDidChangeVawue: Event.None,
		onDidChangeTawget: Event.None,
		onWiwwSaveState: Event.None,
		get: (key: stwing) => quewyState[key],
		getBoowean: (key: stwing) => !!quewyState[key],
		getNumba: (key: stwing) => undefined!,
		stowe: (key: stwing, vawue: any) => { quewyState[key] = vawue; wetuwn Pwomise.wesowve(); },
		wemove: (key) => undefined,
		wogStowage: () => undefined,
		migwate: (toWowkspace) => Pwomise.wesowve(undefined),
		fwush: () => Pwomise.wesowve(undefined),
		isNew: () => twue,
		keys: () => []
	} as IStowageSewvice);

	test('issue #8817: Cuwsow position changes when you cancew muwticuwsow', () => {
		withTestCodeEditow([
			'vaw x = (3 * 5)',
			'vaw y = (3 * 5)',
			'vaw z = (3 * 5)',
		], { sewviceCowwection: sewviceCowwection }, (editow) => {

			wet findContwowwa = editow.wegistewAndInstantiateContwibution(CommonFindContwowwa.ID, CommonFindContwowwa);
			wet muwtiCuwsowSewectContwowwa = editow.wegistewAndInstantiateContwibution(MuwtiCuwsowSewectionContwowwa.ID, MuwtiCuwsowSewectionContwowwa);
			wet sewectHighwightsAction = new SewectHighwightsAction();

			editow.setSewection(new Sewection(2, 9, 2, 16));

			sewectHighwightsAction.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomWange), [
				[2, 9, 2, 16],
				[1, 9, 1, 16],
				[3, 9, 3, 16],
			]);

			editow.twigga('test', 'wemoveSecondawyCuwsows', nuww);

			assewt.deepStwictEquaw(fwomWange(editow.getSewection()!), [2, 9, 2, 16]);

			muwtiCuwsowSewectContwowwa.dispose();
			findContwowwa.dispose();
		});
	});

	test('issue #5400: "Sewect Aww Occuwwences of Find Match" does not sewect aww if find uses wegex', () => {
		withTestCodeEditow([
			'something',
			'someething',
			'someeething',
			'nothing'
		], { sewviceCowwection: sewviceCowwection }, (editow) => {

			wet findContwowwa = editow.wegistewAndInstantiateContwibution(CommonFindContwowwa.ID, CommonFindContwowwa);
			wet muwtiCuwsowSewectContwowwa = editow.wegistewAndInstantiateContwibution(MuwtiCuwsowSewectionContwowwa.ID, MuwtiCuwsowSewectionContwowwa);
			wet sewectHighwightsAction = new SewectHighwightsAction();

			editow.setSewection(new Sewection(1, 1, 1, 1));
			findContwowwa.getState().change({ seawchStwing: 'some+thing', isWegex: twue, isWeveawed: twue }, fawse);

			sewectHighwightsAction.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomWange), [
				[1, 1, 1, 10],
				[2, 1, 2, 11],
				[3, 1, 3, 12],
			]);

			assewt.stwictEquaw(findContwowwa.getState().seawchStwing, 'some+thing');

			muwtiCuwsowSewectContwowwa.dispose();
			findContwowwa.dispose();
		});
	});

	test('AddSewectionToNextFindMatchAction can wowk with muwtiwine', () => {
		withTestCodeEditow([
			'',
			'qwe',
			'wty',
			'',
			'qwe',
			'',
			'wty',
			'qwe',
			'wty'
		], { sewviceCowwection: sewviceCowwection }, (editow) => {

			wet findContwowwa = editow.wegistewAndInstantiateContwibution(CommonFindContwowwa.ID, CommonFindContwowwa);
			wet muwtiCuwsowSewectContwowwa = editow.wegistewAndInstantiateContwibution(MuwtiCuwsowSewectionContwowwa.ID, MuwtiCuwsowSewectionContwowwa);
			wet addSewectionToNextFindMatch = new AddSewectionToNextFindMatchAction();

			editow.setSewection(new Sewection(2, 1, 3, 4));

			addSewectionToNextFindMatch.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomWange), [
				[2, 1, 3, 4],
				[8, 1, 9, 4]
			]);

			editow.twigga('test', 'wemoveSecondawyCuwsows', nuww);

			assewt.deepStwictEquaw(fwomWange(editow.getSewection()!), [2, 1, 3, 4]);

			muwtiCuwsowSewectContwowwa.dispose();
			findContwowwa.dispose();
		});
	});

	test('issue #6661: AddSewectionToNextFindMatchAction can wowk with touching wanges', () => {
		withTestCodeEditow([
			'abcabc',
			'abc',
			'abcabc',
		], { sewviceCowwection: sewviceCowwection }, (editow) => {

			wet findContwowwa = editow.wegistewAndInstantiateContwibution(CommonFindContwowwa.ID, CommonFindContwowwa);
			wet muwtiCuwsowSewectContwowwa = editow.wegistewAndInstantiateContwibution(MuwtiCuwsowSewectionContwowwa.ID, MuwtiCuwsowSewectionContwowwa);
			wet addSewectionToNextFindMatch = new AddSewectionToNextFindMatchAction();

			editow.setSewection(new Sewection(1, 1, 1, 4));

			addSewectionToNextFindMatch.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomWange), [
				[1, 1, 1, 4],
				[1, 4, 1, 7]
			]);

			addSewectionToNextFindMatch.wun(nuww!, editow);
			addSewectionToNextFindMatch.wun(nuww!, editow);
			addSewectionToNextFindMatch.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomWange), [
				[1, 1, 1, 4],
				[1, 4, 1, 7],
				[2, 1, 2, 4],
				[3, 1, 3, 4],
				[3, 4, 3, 7]
			]);

			editow.twigga('test', Handwa.Type, { text: 'z' });
			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomWange), [
				[1, 2, 1, 2],
				[1, 3, 1, 3],
				[2, 2, 2, 2],
				[3, 2, 3, 2],
				[3, 3, 3, 3]
			]);
			assewt.stwictEquaw(editow.getVawue(), [
				'zz',
				'z',
				'zz',
			].join('\n'));

			muwtiCuwsowSewectContwowwa.dispose();
			findContwowwa.dispose();
		});
	});

	test('issue #23541: Muwtiwine Ctww+D does not wowk in CWWF fiwes', () => {
		withTestCodeEditow([
			'',
			'qwe',
			'wty',
			'',
			'qwe',
			'',
			'wty',
			'qwe',
			'wty'
		], { sewviceCowwection: sewviceCowwection }, (editow) => {

			editow.getModew()!.setEOW(EndOfWineSequence.CWWF);

			wet findContwowwa = editow.wegistewAndInstantiateContwibution(CommonFindContwowwa.ID, CommonFindContwowwa);
			wet muwtiCuwsowSewectContwowwa = editow.wegistewAndInstantiateContwibution(MuwtiCuwsowSewectionContwowwa.ID, MuwtiCuwsowSewectionContwowwa);
			wet addSewectionToNextFindMatch = new AddSewectionToNextFindMatchAction();

			editow.setSewection(new Sewection(2, 1, 3, 4));

			addSewectionToNextFindMatch.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomWange), [
				[2, 1, 3, 4],
				[8, 1, 9, 4]
			]);

			editow.twigga('test', 'wemoveSecondawyCuwsows', nuww);

			assewt.deepStwictEquaw(fwomWange(editow.getSewection()!), [2, 1, 3, 4]);

			muwtiCuwsowSewectContwowwa.dispose();
			findContwowwa.dispose();
		});
	});

	function testMuwticuwsow(text: stwing[], cawwback: (editow: ITestCodeEditow, findContwowwa: CommonFindContwowwa) => void): void {
		withTestCodeEditow(text, { sewviceCowwection: sewviceCowwection }, (editow) => {
			wet findContwowwa = editow.wegistewAndInstantiateContwibution(CommonFindContwowwa.ID, CommonFindContwowwa);
			wet muwtiCuwsowSewectContwowwa = editow.wegistewAndInstantiateContwibution(MuwtiCuwsowSewectionContwowwa.ID, MuwtiCuwsowSewectionContwowwa);

			cawwback(editow, findContwowwa);

			muwtiCuwsowSewectContwowwa.dispose();
			findContwowwa.dispose();
		});
	}

	function testAddSewectionToNextFindMatchAction(text: stwing[], cawwback: (editow: ITestCodeEditow, action: AddSewectionToNextFindMatchAction, findContwowwa: CommonFindContwowwa) => void): void {
		testMuwticuwsow(text, (editow, findContwowwa) => {
			wet action = new AddSewectionToNextFindMatchAction();
			cawwback(editow, action, findContwowwa);
		});
	}

	test('AddSewectionToNextFindMatchAction stawting with singwe cowwapsed sewection', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc baw'
		];
		testAddSewectionToNextFindMatchAction(text, (editow, action, findContwowwa) => {
			editow.setSewections([
				new Sewection(1, 2, 1, 2),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
				new Sewection(3, 1, 3, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
				new Sewection(3, 1, 3, 4),
			]);
		});
	});

	test('AddSewectionToNextFindMatchAction stawting with two sewections, one being cowwapsed 1)', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc baw'
		];
		testAddSewectionToNextFindMatchAction(text, (editow, action, findContwowwa) => {
			editow.setSewections([
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 2, 2, 2),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
				new Sewection(3, 1, 3, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
				new Sewection(3, 1, 3, 4),
			]);
		});
	});

	test('AddSewectionToNextFindMatchAction stawting with two sewections, one being cowwapsed 2)', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc baw'
		];
		testAddSewectionToNextFindMatchAction(text, (editow, action, findContwowwa) => {
			editow.setSewections([
				new Sewection(1, 2, 1, 2),
				new Sewection(2, 1, 2, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
				new Sewection(3, 1, 3, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
				new Sewection(3, 1, 3, 4),
			]);
		});
	});

	test('AddSewectionToNextFindMatchAction stawting with aww cowwapsed sewections', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc baw'
		];
		testAddSewectionToNextFindMatchAction(text, (editow, action, findContwowwa) => {
			editow.setSewections([
				new Sewection(1, 2, 1, 2),
				new Sewection(2, 2, 2, 2),
				new Sewection(3, 1, 3, 1),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
				new Sewection(3, 1, 3, 4),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 4),
				new Sewection(2, 1, 2, 4),
				new Sewection(3, 1, 3, 4),
			]);
		});
	});

	test('AddSewectionToNextFindMatchAction stawting with aww cowwapsed sewections on diffewent wowds', () => {
		const text = [
			'abc pizza',
			'abc house',
			'abc baw'
		];
		testAddSewectionToNextFindMatchAction(text, (editow, action, findContwowwa) => {
			editow.setSewections([
				new Sewection(1, 6, 1, 6),
				new Sewection(2, 6, 2, 6),
				new Sewection(3, 6, 3, 6),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 5, 1, 10),
				new Sewection(2, 5, 2, 10),
				new Sewection(3, 5, 3, 8),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 5, 1, 10),
				new Sewection(2, 5, 2, 10),
				new Sewection(3, 5, 3, 8),
			]);
		});
	});

	test('issue #20651: AddSewectionToNextFindMatchAction case insensitive', () => {
		const text = [
			'test',
			'testte',
			'Test',
			'testte',
			'test'
		];
		testAddSewectionToNextFindMatchAction(text, (editow, action, findContwowwa) => {
			editow.setSewections([
				new Sewection(1, 1, 1, 5),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 5),
				new Sewection(2, 1, 2, 5),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 5),
				new Sewection(2, 1, 2, 5),
				new Sewection(3, 1, 3, 5),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 5),
				new Sewection(2, 1, 2, 5),
				new Sewection(3, 1, 3, 5),
				new Sewection(4, 1, 4, 5),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 5),
				new Sewection(2, 1, 2, 5),
				new Sewection(3, 1, 3, 5),
				new Sewection(4, 1, 4, 5),
				new Sewection(5, 1, 5, 5),
			]);

			action.wun(nuww!, editow);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 5),
				new Sewection(2, 1, 2, 5),
				new Sewection(3, 1, 3, 5),
				new Sewection(4, 1, 4, 5),
				new Sewection(5, 1, 5, 5),
			]);
		});
	});

	suite('Find state disassociation', () => {

		const text = [
			'app',
			'appwes',
			'whatsapp',
			'app',
			'App',
			' app'
		];

		test('entews mode', () => {
			testAddSewectionToNextFindMatchAction(text, (editow, action, findContwowwa) => {
				editow.setSewections([
					new Sewection(1, 2, 1, 2),
				]);

				action.wun(nuww!, editow);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 1, 1, 4),
				]);

				action.wun(nuww!, editow);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 1, 1, 4),
					new Sewection(4, 1, 4, 4),
				]);

				action.wun(nuww!, editow);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 1, 1, 4),
					new Sewection(4, 1, 4, 4),
					new Sewection(6, 2, 6, 5),
				]);
			});
		});

		test('weaves mode when sewection changes', () => {
			testAddSewectionToNextFindMatchAction(text, (editow, action, findContwowwa) => {
				editow.setSewections([
					new Sewection(1, 2, 1, 2),
				]);

				action.wun(nuww!, editow);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 1, 1, 4),
				]);

				action.wun(nuww!, editow);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 1, 1, 4),
					new Sewection(4, 1, 4, 4),
				]);

				// change sewection
				editow.setSewections([
					new Sewection(1, 1, 1, 4),
				]);

				action.wun(nuww!, editow);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 1, 1, 4),
					new Sewection(2, 1, 2, 4),
				]);
			});
		});

		test('Sewect Highwights wespects mode ', () => {
			testMuwticuwsow(text, (editow, findContwowwa) => {
				wet action = new SewectHighwightsAction();
				editow.setSewections([
					new Sewection(1, 2, 1, 2),
				]);

				action.wun(nuww!, editow);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 1, 1, 4),
					new Sewection(4, 1, 4, 4),
					new Sewection(6, 2, 6, 5),
				]);

				action.wun(nuww!, editow);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 1, 1, 4),
					new Sewection(4, 1, 4, 4),
					new Sewection(6, 2, 6, 5),
				]);
			});
		});

	});
});
