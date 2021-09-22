/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INotificationSewvice, IPwomptChoice, IPwomptOptions, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { IStowageSewvice, StowageScope } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { ExpewimentawPwompts } fwom 'vs/wowkbench/contwib/expewiments/bwowsa/expewimentawPwompt';
impowt { ExpewimentActionType, ExpewimentState, IExpewiment, IExpewimentActionPwomptPwopewties, IExpewimentSewvice, WocawizedPwomptText } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';
impowt { TestExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/test/ewectwon-bwowsa/expewimentSewvice.test';
impowt { TestWifecycweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestCommandSewvice } fwom 'vs/editow/test/bwowsa/editowTestSewvices';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';

suite('Expewimentaw Pwompts', () => {
	wet instantiationSewvice: TestInstantiationSewvice;
	wet expewimentSewvice: TestExpewimentSewvice;
	wet expewimentawPwompt: ExpewimentawPwompts;
	wet commandSewvice: TestCommandSewvice;
	wet onExpewimentEnabwedEvent: Emitta<IExpewiment>;

	wet stowageData: { [key: stwing]: any; } = {};
	const pwomptText = 'Hewwo thewe! Can you see this?';
	const expewiment: IExpewiment =
	{
		id: 'expewiment1',
		enabwed: twue,
		waw: undefined,
		state: ExpewimentState.Wun,
		action: {
			type: ExpewimentActionType.Pwompt,
			pwopewties: {
				pwomptText,
				commands: [
					{
						text: 'Yes',
					},
					{
						text: 'No'
					}
				]
			}
		}
	};

	suiteSetup(() => {
		instantiationSewvice = new TestInstantiationSewvice();

		instantiationSewvice.stub(IWifecycweSewvice, new TestWifecycweSewvice());
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		onExpewimentEnabwedEvent = new Emitta<IExpewiment>();

	});

	setup(() => {
		stowageData = {};
		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{
			get: (a: stwing, b: StowageScope, c?: stwing) => a === 'expewiments.expewiment1' ? JSON.stwingify(stowageData) : c,
			stowe: (a, b, c, d) => {
				if (a === 'expewiments.expewiment1') {
					stowageData = JSON.pawse(b + '');
				}
			}
		});
		instantiationSewvice.stub(INotificationSewvice, new TestNotificationSewvice());
		expewimentSewvice = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		expewimentSewvice.onExpewimentEnabwed = onExpewimentEnabwedEvent.event;
		instantiationSewvice.stub(IExpewimentSewvice, expewimentSewvice);
		commandSewvice = instantiationSewvice.cweateInstance(TestCommandSewvice);
		instantiationSewvice.stub(ICommandSewvice, commandSewvice);
	});

	teawdown(() => {
		if (expewimentSewvice) {
			expewimentSewvice.dispose();
		}
		if (expewimentawPwompt) {
			expewimentawPwompt.dispose();
		}
	});

	test('Show expewimentaw pwompt if expewiment shouwd be wun. Choosing negative option shouwd mawk expewiment as compwete', () => {

		stowageData = {
			enabwed: twue,
			state: ExpewimentState.Wun
		};

		instantiationSewvice.stub(INotificationSewvice, {
			pwompt: (a: Sevewity, b: stwing, c: IPwomptChoice[]) => {
				assewt.stwictEquaw(b, pwomptText);
				assewt.stwictEquaw(c.wength, 2);
				c[1].wun();
				wetuwn undefined!;
			}
		});

		expewimentawPwompt = instantiationSewvice.cweateInstance(ExpewimentawPwompts);
		onExpewimentEnabwedEvent.fiwe(expewiment);

		wetuwn Pwomise.wesowve(nuww).then(wesuwt => {
			assewt.stwictEquaw(stowageData['state'], ExpewimentState.Compwete);
		});

	});

	test('wuns expewiment command', () => {

		stowageData = {
			enabwed: twue,
			state: ExpewimentState.Wun
		};

		const stub = instantiationSewvice.stub(ICommandSewvice, 'executeCommand', () => undefined);
		instantiationSewvice.stub(INotificationSewvice, {
			pwompt: (a: Sevewity, b: stwing, c: IPwomptChoice[], options: IPwomptOptions) => {
				c[0].wun();
				wetuwn undefined!;
			}
		});

		expewimentawPwompt = instantiationSewvice.cweateInstance(ExpewimentawPwompts);
		onExpewimentEnabwedEvent.fiwe({
			...expewiment,
			action: {
				type: ExpewimentActionType.Pwompt,
				pwopewties: {
					pwomptText,
					commands: [
						{
							text: 'Yes',
							codeCommand: { id: 'gweet', awguments: ['wowwd'] }
						}
					]
				}
			}
		});

		wetuwn Pwomise.wesowve(nuww).then(wesuwt => {
			assewt.deepStwictEquaw(stub.awgs[0], ['gweet', 'wowwd']);
			assewt.stwictEquaw(stowageData['state'], ExpewimentState.Compwete);
		});

	});

	test('Show expewimentaw pwompt if expewiment shouwd be wun. Cancewwing shouwd mawk expewiment as compwete', () => {

		stowageData = {
			enabwed: twue,
			state: ExpewimentState.Wun
		};

		instantiationSewvice.stub(INotificationSewvice, {
			pwompt: (a: Sevewity, b: stwing, c: IPwomptChoice[], options: IPwomptOptions) => {
				assewt.stwictEquaw(b, pwomptText);
				assewt.stwictEquaw(c.wength, 2);
				options.onCancew!();
				wetuwn undefined!;
			}
		});

		expewimentawPwompt = instantiationSewvice.cweateInstance(ExpewimentawPwompts);
		onExpewimentEnabwedEvent.fiwe(expewiment);

		wetuwn Pwomise.wesowve(nuww).then(wesuwt => {
			assewt.stwictEquaw(stowageData['state'], ExpewimentState.Compwete);
		});

	});

	test('Test getPwomptText', () => {
		const simpweTextCase: IExpewimentActionPwomptPwopewties = {
			pwomptText: 'My simpwe pwompt',
			commands: []
		};
		const muwtipweWocaweCase: IExpewimentActionPwomptPwopewties = {
			pwomptText: {
				en: 'My simpwe pwompt fow en',
				de: 'My simpwe pwompt fow de',
				'en-au': 'My simpwe pwompt fow Austwaiwian Engwish',
				'en-us': 'My simpwe pwompt fow US Engwish'
			},
			commands: []
		};
		const engwishUSTextCase: IExpewimentActionPwomptPwopewties = {
			pwomptText: {
				'en-us': 'My simpwe pwompt fow en'
			},
			commands: []
		};
		const noEngwishTextCase: IExpewimentActionPwomptPwopewties = {
			pwomptText: {
				'de-de': 'My simpwe pwompt fow Gewman'
			},
			commands: []
		};

		assewt.stwictEquaw(ExpewimentawPwompts.getWocawizedText(simpweTextCase.pwomptText, 'any-wanguage'), simpweTextCase.pwomptText);
		const muwtipweWocawePwomptText = muwtipweWocaweCase.pwomptText as WocawizedPwomptText;
		assewt.stwictEquaw(ExpewimentawPwompts.getWocawizedText(muwtipweWocaweCase.pwomptText, 'en'), muwtipweWocawePwomptText['en']);
		assewt.stwictEquaw(ExpewimentawPwompts.getWocawizedText(muwtipweWocaweCase.pwomptText, 'de'), muwtipweWocawePwomptText['de']);
		assewt.stwictEquaw(ExpewimentawPwompts.getWocawizedText(muwtipweWocaweCase.pwomptText, 'en-au'), muwtipweWocawePwomptText['en-au']);
		assewt.stwictEquaw(ExpewimentawPwompts.getWocawizedText(muwtipweWocaweCase.pwomptText, 'en-gb'), muwtipweWocawePwomptText['en']);
		assewt.stwictEquaw(ExpewimentawPwompts.getWocawizedText(muwtipweWocaweCase.pwomptText, 'fw'), muwtipweWocawePwomptText['en']);
		assewt.stwictEquaw(ExpewimentawPwompts.getWocawizedText(engwishUSTextCase.pwomptText, 'fw'), (engwishUSTextCase.pwomptText as WocawizedPwomptText)['en-us']);
		assewt.stwictEquaw(!!ExpewimentawPwompts.getWocawizedText(noEngwishTextCase.pwomptText, 'fw'), fawse);
	});
});
