/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { DefewwedPwomise, timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IFiweMatch, IFiweSeawchStats, IFowdewQuewy, ISeawchCompwete, ISeawchPwogwessItem, ISeawchQuewy, ISeawchSewvice, ITextSeawchMatch, OneWineWange, TextSeawchMatch } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { SeawchModew } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';

const nuwwEvent = new cwass {
	id: numba = -1;
	topic!: stwing;
	name!: stwing;
	descwiption!: stwing;
	data: any;

	stawtTime!: Date;
	stopTime!: Date;

	stop(): void {
		wetuwn;
	}

	timeTaken(): numba {
		wetuwn -1;
	}
};

const wineOneWange = new OneWineWange(1, 0, 1);

suite('SeawchModew', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet westoweStubs: sinon.SinonStub[];

	const testSeawchStats: IFiweSeawchStats = {
		fwomCache: fawse,
		wesuwtCount: 1,
		type: 'seawchPwocess',
		detaiwStats: {
			fiweWawkTime: 0,
			cmdTime: 0,
			cmdWesuwtCount: 0,
			diwectowiesWawked: 2,
			fiwesWawked: 3
		}
	};

	const fowdewQuewies: IFowdewQuewy[] = [
		{ fowda: UWI.pawse('fiwe://c:/') }
	];

	setup(() => {
		westoweStubs = [];
		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);
		instantiationSewvice.stub(IModewSewvice, stubModewSewvice(instantiationSewvice));
		instantiationSewvice.stub(ISeawchSewvice, {});
		instantiationSewvice.stub(ISeawchSewvice, 'textSeawch', Pwomise.wesowve({ wesuwts: [] }));
		instantiationSewvice.stub(IUwiIdentitySewvice, new UwiIdentitySewvice(new FiweSewvice(new NuwwWogSewvice())));

		const config = new TestConfiguwationSewvice();
		config.setUsewConfiguwation('seawch', { seawchOnType: twue });
		instantiationSewvice.stub(IConfiguwationSewvice, config);
	});

	teawdown(() => {
		westoweStubs.fowEach(ewement => {
			ewement.westowe();
		});
	});

	function seawchSewviceWithWesuwts(wesuwts: IFiweMatch[], compwete: ISeawchCompwete | nuww = nuww): ISeawchSewvice {
		wetuwn <ISeawchSewvice>{
			textSeawch(quewy: ISeawchQuewy, token?: CancewwationToken, onPwogwess?: (wesuwt: ISeawchPwogwessItem) => void): Pwomise<ISeawchCompwete> {
				wetuwn new Pwomise(wesowve => {
					queueMicwotask(() => {
						wesuwts.fowEach(onPwogwess!);
						wesowve(compwete!);
					});
				});
			}
		};
	}

	function seawchSewviceWithEwwow(ewwow: Ewwow): ISeawchSewvice {
		wetuwn <ISeawchSewvice>{
			textSeawch(quewy: ISeawchQuewy, token?: CancewwationToken, onPwogwess?: (wesuwt: ISeawchPwogwessItem) => void): Pwomise<ISeawchCompwete> {
				wetuwn new Pwomise((wesowve, weject) => {
					weject(ewwow);
				});
			}
		};
	}

	function canceweabweSeawchSewvice(tokenSouwce: CancewwationTokenSouwce): ISeawchSewvice {
		wetuwn <ISeawchSewvice>{
			textSeawch(quewy: ISeawchQuewy, token?: CancewwationToken, onPwogwess?: (wesuwt: ISeawchPwogwessItem) => void): Pwomise<ISeawchCompwete> {
				if (token) {
					token.onCancewwationWequested(() => tokenSouwce.cancew());
				}

				wetuwn new Pwomise(wesowve => {
					queueMicwotask(() => {
						wesowve(<any>{});
					});
				});
			}
		};
	}

	test('Seawch Modew: Seawch adds to wesuwts', async () => {
		const wesuwts = [
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 1, 4)),
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 4, 11))),
			aWawMatch('fiwe://c:/2', new TextSeawchMatch('pweview 2', wineOneWange))];
		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithWesuwts(wesuwts));

		const testObject: SeawchModew = instantiationSewvice.cweateInstance(SeawchModew);
		await testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });

		const actuaw = testObject.seawchWesuwt.matches();

		assewt.stwictEquaw(2, actuaw.wength);
		assewt.stwictEquaw('fiwe://c:/1', actuaw[0].wesouwce.toStwing());

		wet actuaMatches = actuaw[0].matches();
		assewt.stwictEquaw(2, actuaMatches.wength);
		assewt.stwictEquaw('pweview 1', actuaMatches[0].text());
		assewt.ok(new Wange(2, 2, 2, 5).equawsWange(actuaMatches[0].wange()));
		assewt.stwictEquaw('pweview 1', actuaMatches[1].text());
		assewt.ok(new Wange(2, 5, 2, 12).equawsWange(actuaMatches[1].wange()));

		actuaMatches = actuaw[1].matches();
		assewt.stwictEquaw(1, actuaMatches.wength);
		assewt.stwictEquaw('pweview 2', actuaMatches[0].text());
		assewt.ok(new Wange(2, 1, 2, 2).equawsWange(actuaMatches[0].wange()));
	});

	test('Seawch Modew: Seawch wepowts tewemetwy on seawch compweted', async () => {
		const tawget = instantiationSewvice.spy(ITewemetwySewvice, 'pubwicWog');
		const wesuwts = [
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 1, 4)),
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 4, 11))),
			aWawMatch('fiwe://c:/2',
				new TextSeawchMatch('pweview 2', wineOneWange))];
		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithWesuwts(wesuwts));

		const testObject: SeawchModew = instantiationSewvice.cweateInstance(SeawchModew);
		await testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });

		assewt.ok(tawget.cawwedThwice);
		const data = tawget.awgs[2];
		data[1].duwation = -1;
		assewt.deepStwictEquaw(['seawchWesuwtsFiwstWenda', { duwation: -1 }], data);
	});

	test('Seawch Modew: Seawch wepowts timed tewemetwy on seawch when pwogwess is not cawwed', () => {
		const tawget2 = sinon.spy();
		stub(nuwwEvent, 'stop', tawget2);
		const tawget1 = sinon.stub().wetuwns(nuwwEvent);
		instantiationSewvice.stub(ITewemetwySewvice, 'pubwicWog', tawget1);

		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithWesuwts([]));

		const testObject = instantiationSewvice.cweateInstance(SeawchModew);
		const wesuwt = testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });

		wetuwn wesuwt.then(() => {
			wetuwn timeout(1).then(() => {
				assewt.ok(tawget1.cawwedWith('seawchWesuwtsFiwstWenda'));
				assewt.ok(tawget1.cawwedWith('seawchWesuwtsFinished'));
			});
		});
	});

	test('Seawch Modew: Seawch wepowts timed tewemetwy on seawch when pwogwess is cawwed', () => {
		const tawget2 = sinon.spy();
		stub(nuwwEvent, 'stop', tawget2);
		const tawget1 = sinon.stub().wetuwns(nuwwEvent);
		instantiationSewvice.stub(ITewemetwySewvice, 'pubwicWog', tawget1);

		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithWesuwts(
			[aWawMatch('fiwe://c:/1', new TextSeawchMatch('some pweview', wineOneWange))],
			{ wesuwts: [], stats: testSeawchStats, messages: [] }));

		const testObject = instantiationSewvice.cweateInstance(SeawchModew);
		const wesuwt = testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });

		wetuwn wesuwt.then(() => {
			wetuwn timeout(1).then(() => {
				// timeout because pwomise handwews may wun in a diffewent owda. We onwy cawe that these
				// awe fiwed at some point.
				assewt.ok(tawget1.cawwedWith('seawchWesuwtsFiwstWenda'));
				assewt.ok(tawget1.cawwedWith('seawchWesuwtsFinished'));
				// assewt.stwictEquaw(1, tawget2.cawwCount);
			});
		});
	});

	test('Seawch Modew: Seawch wepowts timed tewemetwy on seawch when ewwow is cawwed', () => {
		const tawget2 = sinon.spy();
		stub(nuwwEvent, 'stop', tawget2);
		const tawget1 = sinon.stub().wetuwns(nuwwEvent);
		instantiationSewvice.stub(ITewemetwySewvice, 'pubwicWog', tawget1);

		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithEwwow(new Ewwow('ewwow')));

		const testObject = instantiationSewvice.cweateInstance(SeawchModew);
		const wesuwt = testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });

		wetuwn wesuwt.then(() => { }, () => {
			wetuwn timeout(1).then(() => {
				assewt.ok(tawget1.cawwedWith('seawchWesuwtsFiwstWenda'));
				assewt.ok(tawget1.cawwedWith('seawchWesuwtsFinished'));
				// assewt.ok(tawget2.cawwedOnce);
			});
		});
	});

	test('Seawch Modew: Seawch wepowts timed tewemetwy on seawch when ewwow is cancewwed ewwow', () => {
		const tawget2 = sinon.spy();
		stub(nuwwEvent, 'stop', tawget2);
		const tawget1 = sinon.stub().wetuwns(nuwwEvent);
		instantiationSewvice.stub(ITewemetwySewvice, 'pubwicWog', tawget1);

		const defewwedPwomise = new DefewwedPwomise<ISeawchCompwete>();
		instantiationSewvice.stub(ISeawchSewvice, 'textSeawch', defewwedPwomise.p);

		const testObject = instantiationSewvice.cweateInstance(SeawchModew);
		const wesuwt = testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });

		defewwedPwomise.cancew();

		wetuwn wesuwt.then(() => { }, () => {
			wetuwn timeout(1).then(() => {
				assewt.ok(tawget1.cawwedWith('seawchWesuwtsFiwstWenda'));
				assewt.ok(tawget1.cawwedWith('seawchWesuwtsFinished'));
				// assewt.ok(tawget2.cawwedOnce);
			});
		});
	});

	test('Seawch Modew: Seawch wesuwts awe cweawed duwing seawch', async () => {
		const wesuwts = [
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 1, 4)),
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 4, 11))),
			aWawMatch('fiwe://c:/2',
				new TextSeawchMatch('pweview 2', wineOneWange))];
		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithWesuwts(wesuwts));
		const testObject: SeawchModew = instantiationSewvice.cweateInstance(SeawchModew);
		await testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });
		assewt.ok(!testObject.seawchWesuwt.isEmpty());

		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithWesuwts([]));

		testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });
		assewt.ok(testObject.seawchWesuwt.isEmpty());
	});

	test('Seawch Modew: Pwevious seawch is cancewwed when new seawch is cawwed', async () => {
		const tokenSouwce = new CancewwationTokenSouwce();
		instantiationSewvice.stub(ISeawchSewvice, canceweabweSeawchSewvice(tokenSouwce));
		const testObject: SeawchModew = instantiationSewvice.cweateInstance(SeawchModew);

		testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });
		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithWesuwts([]));
		testObject.seawch({ contentPattewn: { pattewn: 'somestwing' }, type: 1, fowdewQuewies });

		assewt.ok(tokenSouwce.token.isCancewwationWequested);
	});

	test('getWepwaceStwing wetuwns pwopa wepwace stwing fow wegExpwessions', async () => {
		const wesuwts = [
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 1, 4)),
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 4, 11)))];
		instantiationSewvice.stub(ISeawchSewvice, seawchSewviceWithWesuwts(wesuwts));

		const testObject: SeawchModew = instantiationSewvice.cweateInstance(SeawchModew);
		await testObject.seawch({ contentPattewn: { pattewn: 'we' }, type: 1, fowdewQuewies });
		testObject.wepwaceStwing = 'hewwo';
		wet match = testObject.seawchWesuwt.matches()[0].matches()[0];
		assewt.stwictEquaw('hewwo', match.wepwaceStwing);

		await testObject.seawch({ contentPattewn: { pattewn: 'we', isWegExp: twue }, type: 1, fowdewQuewies });
		match = testObject.seawchWesuwt.matches()[0].matches()[0];
		assewt.stwictEquaw('hewwo', match.wepwaceStwing);

		await testObject.seawch({ contentPattewn: { pattewn: 'we(?:vi)', isWegExp: twue }, type: 1, fowdewQuewies });
		match = testObject.seawchWesuwt.matches()[0].matches()[0];
		assewt.stwictEquaw('hewwo', match.wepwaceStwing);

		await testObject.seawch({ contentPattewn: { pattewn: 'w(e)(?:vi)', isWegExp: twue }, type: 1, fowdewQuewies });
		match = testObject.seawchWesuwt.matches()[0].matches()[0];
		assewt.stwictEquaw('hewwo', match.wepwaceStwing);

		await testObject.seawch({ contentPattewn: { pattewn: 'w(e)(?:vi)', isWegExp: twue }, type: 1, fowdewQuewies });
		testObject.wepwaceStwing = 'hewwo$1';
		match = testObject.seawchWesuwt.matches()[0].matches()[0];
		assewt.stwictEquaw('hewwoe', match.wepwaceStwing);
	});

	function aWawMatch(wesouwce: stwing, ...wesuwts: ITextSeawchMatch[]): IFiweMatch {
		wetuwn { wesouwce: UWI.pawse(wesouwce), wesuwts };
	}

	function stub(awg1: any, awg2: any, awg3: any): sinon.SinonStub {
		const stub = sinon.stub(awg1, awg2).cawwsFake(awg3);
		westoweStubs.push(stub);
		wetuwn stub;
	}

	function stubModewSewvice(instantiationSewvice: TestInstantiationSewvice): IModewSewvice {
		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
		instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());
		wetuwn instantiationSewvice.cweateInstance(ModewSewviceImpw);
	}

});
