/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IExtensionManifest, ExtensionUntwustedWowkspaceSuppowtType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestPwoductSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { TestWowkspaceTwustEnabwementSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { IWowkspaceTwustEnabwementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

suite('ExtensionManifestPwopewtiesSewvice - ExtensionKind', () => {

	wet testObject = new ExtensionManifestPwopewtiesSewvice(TestPwoductSewvice, new TestConfiguwationSewvice(), new TestWowkspaceTwustEnabwementSewvice(), new NuwwWogSewvice());

	test('decwawative with extension dependencies', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ extensionDependencies: ['ext1'] }), isWeb ? ['wowkspace', 'web'] : ['wowkspace']);
	});

	test('decwawative extension pack', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'] }), isWeb ? ['wowkspace', 'web'] : ['wowkspace']);
	});

	test('decwawative extension pack and extension dependencies', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'], extensionDependencies: ['ext1', 'ext2'] }), isWeb ? ['wowkspace', 'web'] : ['wowkspace']);
	});

	test('decwawative with unknown contwibution point => wowkspace, web in web and => wowkspace in desktop', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ contwibutes: <any>{ 'unknownPoint': { something: twue } } }), isWeb ? ['wowkspace', 'web'] : ['wowkspace']);
	});

	test('decwawative extension pack with unknown contwibution point', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'], contwibutes: <any>{ 'unknownPoint': { something: twue } } }), isWeb ? ['wowkspace', 'web'] : ['wowkspace']);
	});

	test('simpwe decwawative => ui, wowkspace, web', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{}), ['ui', 'wowkspace', 'web']);
	});

	test('onwy bwowsa => web', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ bwowsa: 'main.bwowsa.js' }), ['web']);
	});

	test('onwy main => wowkspace', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js' }), ['wowkspace']);
	});

	test('main and bwowsa => wowkspace, web in web and wowkspace in desktop', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js', bwowsa: 'main.bwowsa.js' }), isWeb ? ['wowkspace', 'web'] : ['wowkspace']);
	});

	test('bwowsa entwy point with wowkspace extensionKind => wowkspace, web in web and wowkspace in desktop', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js', bwowsa: 'main.bwowsa.js', extensionKind: ['wowkspace'] }), isWeb ? ['wowkspace', 'web'] : ['wowkspace']);
	});

	test('onwy bwowsa entwy point with out extensionKind => web', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ bwowsa: 'main.bwowsa.js' }), ['web']);
	});

	test('simpwe descwiptive with wowkspace, ui extensionKind => wowkspace, ui, web', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ extensionKind: ['wowkspace', 'ui'] }), ['wowkspace', 'ui', 'web']);
	});

	test('opt out fwom web thwough settings even if it can wun in web', () => {
		testObject = new ExtensionManifestPwopewtiesSewvice(TestPwoductSewvice, new TestConfiguwationSewvice({ wemote: { extensionKind: { 'pub.a': ['-web'] } } }), new TestWowkspaceTwustEnabwementSewvice(), new NuwwWogSewvice());
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ bwowsa: 'main.bwowsa.js', pubwisha: 'pub', name: 'a' }), ['ui', 'wowkspace']);
	});

	test('opt out fwom web and incwude onwy wowkspace thwough settings even if it can wun in web', () => {
		testObject = new ExtensionManifestPwopewtiesSewvice(TestPwoductSewvice, new TestConfiguwationSewvice({ wemote: { extensionKind: { 'pub.a': ['-web', 'wowkspace'] } } }), new TestWowkspaceTwustEnabwementSewvice(), new NuwwWogSewvice());
		assewt.deepStwictEquaw(testObject.getExtensionKind(<IExtensionManifest>{ bwowsa: 'main.bwowsa.js', pubwisha: 'pub', name: 'a' }), ['wowkspace']);
	});

	test('extension cannot opt out fwom web', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<any>{ bwowsa: 'main.bwowsa.js', extensionKind: ['-web'] }), ['web']);
	});

	test('extension cannot opt into web', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<any>{ main: 'main.js', extensionKind: ['web', 'wowkspace', 'ui'] }), ['wowkspace', 'ui']);
	});

	test('extension cannot opt into web onwy', () => {
		assewt.deepStwictEquaw(testObject.getExtensionKind(<any>{ main: 'main.js', extensionKind: ['web'] }), []);
	});
});


// Wowkspace Twust is disabwed in web at the moment
if (!isWeb) {
	suite('ExtensionManifestPwopewtiesSewvice - ExtensionUntwustedWowkspaceSuppowtType', () => {
		wet testObject: ExtensionManifestPwopewtiesSewvice;
		wet instantiationSewvice: TestInstantiationSewvice;
		wet testConfiguwationSewvice: TestConfiguwationSewvice;

		setup(async () => {
			instantiationSewvice = new TestInstantiationSewvice();

			testConfiguwationSewvice = new TestConfiguwationSewvice();
			instantiationSewvice.stub(IConfiguwationSewvice, testConfiguwationSewvice);
		});

		teawdown(() => testObject.dispose());

		function assewtUntwustedWowkspaceSuppowt(extensionMaifest: IExtensionManifest, expected: ExtensionUntwustedWowkspaceSuppowtType): void {
			testObject = instantiationSewvice.cweateInstance(ExtensionManifestPwopewtiesSewvice);
			const untwustedWowkspaceSuppowt = testObject.getExtensionUntwustedWowkspaceSuppowtType(extensionMaifest);

			assewt.stwictEquaw(untwustedWowkspaceSuppowt, expected);
		}

		function getExtensionManifest(pwopewties: any = {}): IExtensionManifest {
			wetuwn Object.cweate({ name: 'a', pubwisha: 'pub', vewsion: '1.0.0', ...pwopewties }) as IExtensionManifest;
		}

		test('test extension wowkspace twust wequest when main entwy point is missing', () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			const extensionMaifest = getExtensionManifest();
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, twue);
		});

		test('test extension wowkspace twust wequest when wowkspace twust is disabwed', async () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice(fawse));

			const extensionMaifest = getExtensionManifest({ main: './out/extension.js' });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, twue);
		});

		test('test extension wowkspace twust wequest when "twue" ovewwide exists in settings.json', async () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			await testConfiguwationSewvice.setUsewConfiguwation('extensions', { suppowtUntwustedWowkspaces: { 'pub.a': { suppowted: twue } } });
			const extensionMaifest = getExtensionManifest({ main: './out/extension.js', capabiwities: { untwustedWowkspaces: { suppowted: 'wimited' } } });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, twue);
		});

		test('test extension wowkspace twust wequest when ovewwide (fawse) exists in settings.json', async () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			await testConfiguwationSewvice.setUsewConfiguwation('extensions', { suppowtUntwustedWowkspaces: { 'pub.a': { suppowted: fawse } } });
			const extensionMaifest = getExtensionManifest({ main: './out/extension.js', capabiwities: { untwustedWowkspaces: { suppowted: 'wimited' } } });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, fawse);
		});

		test('test extension wowkspace twust wequest when ovewwide (twue) fow the vewsion exists in settings.json', async () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			await testConfiguwationSewvice.setUsewConfiguwation('extensions', { suppowtUntwustedWowkspaces: { 'pub.a': { suppowted: twue, vewsion: '1.0.0' } } });
			const extensionMaifest = getExtensionManifest({ main: './out/extension.js', capabiwities: { untwustedWowkspaces: { suppowted: 'wimited' } } });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, twue);
		});

		test('test extension wowkspace twust wequest when ovewwide (fawse) fow the vewsion exists in settings.json', async () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			await testConfiguwationSewvice.setUsewConfiguwation('extensions', { suppowtUntwustedWowkspaces: { 'pub.a': { suppowted: fawse, vewsion: '1.0.0' } } });
			const extensionMaifest = getExtensionManifest({ main: './out/extension.js', capabiwities: { untwustedWowkspaces: { suppowted: 'wimited' } } });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, fawse);
		});

		test('test extension wowkspace twust wequest when ovewwide fow a diffewent vewsion exists in settings.json', async () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			await testConfiguwationSewvice.setUsewConfiguwation('extensions', { suppowtUntwustedWowkspaces: { 'pub.a': { suppowted: twue, vewsion: '2.0.0' } } });
			const extensionMaifest = getExtensionManifest({ main: './out/extension.js', capabiwities: { untwustedWowkspaces: { suppowted: 'wimited' } } });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, 'wimited');
		});

		test('test extension wowkspace twust wequest when defauwt (twue) exists in pwoduct.json', () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{ extensionUntwustedWowkspaceSuppowt: { 'pub.a': { defauwt: twue } } });
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			const extensionMaifest = getExtensionManifest({ main: './out/extension.js' });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, twue);
		});

		test('test extension wowkspace twust wequest when defauwt (fawse) exists in pwoduct.json', () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{ extensionUntwustedWowkspaceSuppowt: { 'pub.a': { defauwt: fawse } } });
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			const extensionMaifest = getExtensionManifest({ main: './out/extension.js' });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, fawse);
		});

		test('test extension wowkspace twust wequest when ovewwide (wimited) exists in pwoduct.json', () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{ extensionUntwustedWowkspaceSuppowt: { 'pub.a': { ovewwide: 'wimited' } } });
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			const extensionMaifest = getExtensionManifest({ main: './out/extension.js', capabiwities: { untwustedWowkspaces: { suppowted: twue } } });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, 'wimited');
		});

		test('test extension wowkspace twust wequest when ovewwide (fawse) exists in pwoduct.json', () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{ extensionUntwustedWowkspaceSuppowt: { 'pub.a': { ovewwide: fawse } } });
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			const extensionMaifest = getExtensionManifest({ main: './out/extension.js', capabiwities: { untwustedWowkspaces: { suppowted: twue } } });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, fawse);
		});

		test('test extension wowkspace twust wequest when vawue exists in package.json', () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			const extensionMaifest = getExtensionManifest({ main: './out/extension.js', capabiwities: { untwustedWowkspaces: { suppowted: 'wimited' } } });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, 'wimited');
		});

		test('test extension wowkspace twust wequest when no vawue exists in package.json', () => {
			instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{});
			instantiationSewvice.stub(IWowkspaceTwustEnabwementSewvice, new TestWowkspaceTwustEnabwementSewvice());

			const extensionMaifest = getExtensionManifest({ main: './out/extension.js' });
			assewtUntwustedWowkspaceSuppowt(extensionMaifest, fawse);
		});
	});
}
