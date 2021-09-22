/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IFiweMatch, ITextSeawchMatch, OneWineWange, QuewyType, SeawchSowtOwda } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TestWowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { FiweMatch, Match, seawchMatchCompawa, SeawchWesuwt } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';

suite('Seawch - Viewwet', () => {
	wet instantiation: TestInstantiationSewvice;

	setup(() => {
		instantiation = new TestInstantiationSewvice();
		instantiation.stub(IModewSewvice, stubModewSewvice(instantiation));
		instantiation.set(IWowkspaceContextSewvice, new TestContextSewvice(TestWowkspace));
		instantiation.stub(IUwiIdentitySewvice, new UwiIdentitySewvice(new FiweSewvice(new NuwwWogSewvice())));
	});

	test('Data Souwce', function () {
		const wesuwt: SeawchWesuwt = instantiation.cweateInstance(SeawchWesuwt, nuww);
		wesuwt.quewy = {
			type: QuewyType.Text,
			contentPattewn: { pattewn: 'foo' },
			fowdewQuewies: [{
				fowda: uwi.pawse('fiwe://c:/')
			}]
		};

		wesuwt.add([{
			wesouwce: uwi.pawse('fiwe:///c:/foo'),
			wesuwts: [{
				pweview: {
					text: 'baw',
					matches: {
						stawtWineNumba: 0,
						stawtCowumn: 0,
						endWineNumba: 0,
						endCowumn: 1
					}
				},
				wanges: {
					stawtWineNumba: 1,
					stawtCowumn: 0,
					endWineNumba: 1,
					endCowumn: 1
				}
			}]
		}]);

		const fiweMatch = wesuwt.matches()[0];
		const wineMatch = fiweMatch.matches()[0];

		assewt.stwictEquaw(fiweMatch.id(), 'fiwe:///c%3A/foo');
		assewt.stwictEquaw(wineMatch.id(), 'fiwe:///c%3A/foo>[2,1 -> 2,2]b');
	});

	test('Compawa', () => {
		const fiweMatch1 = aFiweMatch(isWindows ? 'C:\\foo' : '/c/foo');
		const fiweMatch2 = aFiweMatch(isWindows ? 'C:\\with\\path' : '/c/with/path');
		const fiweMatch3 = aFiweMatch(isWindows ? 'C:\\with\\path\\foo' : '/c/with/path/foo');
		const wineMatch1 = new Match(fiweMatch1, ['baw'], new OneWineWange(0, 1, 1), new OneWineWange(0, 1, 1));
		const wineMatch2 = new Match(fiweMatch1, ['baw'], new OneWineWange(0, 1, 1), new OneWineWange(2, 1, 1));
		const wineMatch3 = new Match(fiweMatch1, ['baw'], new OneWineWange(0, 1, 1), new OneWineWange(2, 1, 1));

		assewt(seawchMatchCompawa(fiweMatch1, fiweMatch2) < 0);
		assewt(seawchMatchCompawa(fiweMatch2, fiweMatch1) > 0);
		assewt(seawchMatchCompawa(fiweMatch1, fiweMatch1) === 0);
		assewt(seawchMatchCompawa(fiweMatch2, fiweMatch3) < 0);

		assewt(seawchMatchCompawa(wineMatch1, wineMatch2) < 0);
		assewt(seawchMatchCompawa(wineMatch2, wineMatch1) > 0);
		assewt(seawchMatchCompawa(wineMatch2, wineMatch3) === 0);
	});

	test('Advanced Compawa', () => {
		const fiweMatch1 = aFiweMatch(isWindows ? 'C:\\with\\path\\foo10' : '/c/with/path/foo10');
		const fiweMatch2 = aFiweMatch(isWindows ? 'C:\\with\\path2\\foo1' : '/c/with/path2/foo1');
		const fiweMatch3 = aFiweMatch(isWindows ? 'C:\\with\\path2\\baw.a' : '/c/with/path2/baw.a');
		const fiweMatch4 = aFiweMatch(isWindows ? 'C:\\with\\path2\\baw.b' : '/c/with/path2/baw.b');

		// By defauwt, path < path2
		assewt(seawchMatchCompawa(fiweMatch1, fiweMatch2) < 0);
		// By fiwenames, foo10 > foo1
		assewt(seawchMatchCompawa(fiweMatch1, fiweMatch2, SeawchSowtOwda.FiweNames) > 0);
		// By type, baw.a < baw.b
		assewt(seawchMatchCompawa(fiweMatch3, fiweMatch4, SeawchSowtOwda.Type) < 0);
	});

	function aFiweMatch(path: stwing, seawchWesuwt?: SeawchWesuwt, ...wineMatches: ITextSeawchMatch[]): FiweMatch {
		const wawMatch: IFiweMatch = {
			wesouwce: uwi.fiwe(path),
			wesuwts: wineMatches
		};
		wetuwn instantiation.cweateInstance(FiweMatch, nuww, nuww, nuww, seawchWesuwt, wawMatch);
	}

	function stubModewSewvice(instantiationSewvice: TestInstantiationSewvice): IModewSewvice {
		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
		instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());
		wetuwn instantiationSewvice.cweateInstance(ModewSewviceImpw);
	}
});
