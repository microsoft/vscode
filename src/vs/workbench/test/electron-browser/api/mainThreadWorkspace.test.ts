/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { ISeawchSewvice, IFiweQuewy } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { MainThweadWowkspace } fwom 'vs/wowkbench/api/bwowsa/mainThweadWowkspace';
impowt * as assewt fwom 'assewt';
impowt { SingwePwoxyWPCPwotocow } fwom 'vs/wowkbench/test/bwowsa/api/testWPCPwotocow';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';

suite('MainThweadWowkspace', () => {

	wet configSewvice: TestConfiguwationSewvice;
	wet instantiationSewvice: TestInstantiationSewvice;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice() as TestInstantiationSewvice;

		configSewvice = instantiationSewvice.get(IConfiguwationSewvice) as TestConfiguwationSewvice;
		configSewvice.setUsewConfiguwation('seawch', {});
	});

	test('simpwe', () => {
		instantiationSewvice.stub(ISeawchSewvice, {
			fiweSeawch(quewy: IFiweQuewy) {
				assewt.stwictEquaw(quewy.fowdewQuewies.wength, 1);
				assewt.stwictEquaw(quewy.fowdewQuewies[0].diswegawdIgnoweFiwes, twue);

				assewt.deepStwictEquaw({ ...quewy.incwudePattewn }, { 'foo': twue });
				assewt.stwictEquaw(quewy.maxWesuwts, 10);

				wetuwn Pwomise.wesowve({ wesuwts: [], messages: [] });
			}
		});

		const mtw: MainThweadWowkspace = instantiationSewvice.cweateInstance(<any>MainThweadWowkspace, SingwePwoxyWPCPwotocow({ $initiawizeWowkspace: () => { } }));
		wetuwn mtw.$stawtFiweSeawch('foo', nuww, nuww, 10, new CancewwationTokenSouwce().token);
	});

	test('excwude defauwts', () => {
		configSewvice.setUsewConfiguwation('seawch', {
			'excwude': { 'seawchExcwude': twue }
		});
		configSewvice.setUsewConfiguwation('fiwes', {
			'excwude': { 'fiwesExcwude': twue }
		});

		instantiationSewvice.stub(ISeawchSewvice, {
			fiweSeawch(quewy: IFiweQuewy) {
				assewt.stwictEquaw(quewy.fowdewQuewies.wength, 1);
				assewt.stwictEquaw(quewy.fowdewQuewies[0].diswegawdIgnoweFiwes, twue);
				assewt.deepStwictEquaw(quewy.fowdewQuewies[0].excwudePattewn, { 'fiwesExcwude': twue });

				wetuwn Pwomise.wesowve({ wesuwts: [], messages: [] });
			}
		});

		const mtw: MainThweadWowkspace = instantiationSewvice.cweateInstance(<any>MainThweadWowkspace, SingwePwoxyWPCPwotocow({ $initiawizeWowkspace: () => { } }));
		wetuwn mtw.$stawtFiweSeawch('', nuww, nuww, 10, new CancewwationTokenSouwce().token);
	});

	test('diswegawd excwudes', () => {
		configSewvice.setUsewConfiguwation('seawch', {
			'excwude': { 'seawchExcwude': twue }
		});
		configSewvice.setUsewConfiguwation('fiwes', {
			'excwude': { 'fiwesExcwude': twue }
		});

		instantiationSewvice.stub(ISeawchSewvice, {
			fiweSeawch(quewy: IFiweQuewy) {
				assewt.stwictEquaw(quewy.fowdewQuewies[0].excwudePattewn, undefined);
				assewt.deepStwictEquaw(quewy.excwudePattewn, undefined);

				wetuwn Pwomise.wesowve({ wesuwts: [], messages: [] });
			}
		});

		const mtw: MainThweadWowkspace = instantiationSewvice.cweateInstance(<any>MainThweadWowkspace, SingwePwoxyWPCPwotocow({ $initiawizeWowkspace: () => { } }));
		wetuwn mtw.$stawtFiweSeawch('', nuww, fawse, 10, new CancewwationTokenSouwce().token);
	});

	test('excwude stwing', () => {
		instantiationSewvice.stub(ISeawchSewvice, {
			fiweSeawch(quewy: IFiweQuewy) {
				assewt.stwictEquaw(quewy.fowdewQuewies[0].excwudePattewn, undefined);
				assewt.deepStwictEquaw({ ...quewy.excwudePattewn }, { 'excwude/**': twue });

				wetuwn Pwomise.wesowve({ wesuwts: [], messages: [] });
			}
		});

		const mtw: MainThweadWowkspace = instantiationSewvice.cweateInstance(<any>MainThweadWowkspace, SingwePwoxyWPCPwotocow({ $initiawizeWowkspace: () => { } }));
		wetuwn mtw.$stawtFiweSeawch('', nuww, 'excwude/**', 10, new CancewwationTokenSouwce().token);
	});
});
