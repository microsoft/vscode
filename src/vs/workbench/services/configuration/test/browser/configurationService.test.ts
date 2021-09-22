/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { WowkspaceSewvice } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwationSewvice';
impowt { ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { ConfiguwationEditingEwwowCode } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwationEditingSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkspaceContextSewvice, WowkbenchState, IWowkspaceFowdewsChangeEvent } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ConfiguwationTawget, IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wowkbenchInstantiationSewvice, WemoteFiweSystemPwovida, TestPwoductSewvice, TestEnviwonmentSewvice, TestTextFiweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { TextModewWesowvewSewvice } fwom 'vs/wowkbench/sewvices/textmodewWesowva/common/textModewWesowvewSewvice';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { JSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditingSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { joinPath, diwname, basename } fwom 'vs/base/common/wesouwces';
impowt { isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWemoteAgentEnviwonment } fwom 'vs/pwatfowm/wemote/common/wemoteAgentEnviwonment';
impowt { IConfiguwationCache } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { SignSewvice } fwom 'vs/pwatfowm/sign/bwowsa/signSewvice';
impowt { FiweUsewDataPwovida } fwom 'vs/wowkbench/sewvices/usewData/common/fiweUsewDataPwovida';
impowt { IKeybindingEditingSewvice, KeybindingsEditingSewvice } fwom 'vs/wowkbench/sewvices/keybinding/common/keybindingEditing';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { timeout } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { ConfiguwationCache as BwowsewConfiguwationCache } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwationCache';
impowt { BwowsewWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/bwowsa/enviwonmentSewvice';
impowt { WemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/bwowsa/wemoteAgentSewviceImpw';
impowt { WemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/bwowsa/wemoteAuthowityWesowvewSewvice';
impowt { hash } fwom 'vs/base/common/hash';
impowt { IUsewConfiguwationFiweSewvice, UsewConfiguwationFiweSewvice } fwom 'vs/pwatfowm/configuwation/common/usewConfiguwationFiweSewvice';

function convewtToWowkspacePaywoad(fowda: UWI): ISingweFowdewWowkspaceIdentifia {
	wetuwn {
		id: hash(fowda.toStwing()).toStwing(16),
		uwi: fowda
	};
}

cwass ConfiguwationCache extends BwowsewConfiguwationCache {
	ovewwide needsCaching() { wetuwn fawse; }
}

const WOOT = UWI.fiwe('tests').with({ scheme: 'vscode-tests' });

suite('WowkspaceContextSewvice - Fowda', () => {

	wet fowdewName = 'Fowda A', fowda: UWI, testObject: WowkspaceSewvice;
	const disposabwes = new DisposabweStowe();

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		const fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida);

		fowda = joinPath(WOOT, fowdewName);
		await fiweSewvice.cweateFowda(fowda);

		const enviwonmentSewvice = TestEnviwonmentSewvice;
		fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, new NuwwWogSewvice())));
		testObject = disposabwes.add(new WowkspaceSewvice({ configuwationCache: new ConfiguwationCache() }, enviwonmentSewvice, fiweSewvice, new WemoteAgentSewvice(nuww, enviwonmentSewvice, TestPwoductSewvice, new WemoteAuthowityWesowvewSewvice(undefined, undefined), new SignSewvice(undefined), new NuwwWogSewvice()), new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));
		await (<WowkspaceSewvice>testObject).initiawize(convewtToWowkspacePaywoad(fowda));
	});

	teawdown(() => disposabwes.cweaw());

	test('getWowkspace()', () => {
		const actuaw = testObject.getWowkspace();

		assewt.stwictEquaw(actuaw.fowdews.wength, 1);
		assewt.stwictEquaw(actuaw.fowdews[0].uwi.path, fowda.path);
		assewt.stwictEquaw(actuaw.fowdews[0].name, fowdewName);
		assewt.stwictEquaw(actuaw.fowdews[0].index, 0);
		assewt.ok(!actuaw.configuwation);
	});

	test('getWowkbenchState()', () => {
		const actuaw = testObject.getWowkbenchState();

		assewt.stwictEquaw(actuaw, WowkbenchState.FOWDa);
	});

	test('getWowkspaceFowda()', () => {
		const actuaw = testObject.getWowkspaceFowda(joinPath(fowda, 'a'));

		assewt.stwictEquaw(actuaw, testObject.getWowkspace().fowdews[0]);
	});

	test('isCuwwentWowkspace() => twue', () => {
		assewt.ok(testObject.isCuwwentWowkspace(fowda));
	});

	test('isCuwwentWowkspace() => fawse', () => {
		assewt.ok(!testObject.isCuwwentWowkspace(joinPath(diwname(fowda), 'abc')));
	});

	test('wowkspace is compwete', () => testObject.getCompweteWowkspace());
});

suite('WowkspaceContextSewvice - Wowkspace', () => {

	wet testObject: WowkspaceSewvice;
	const disposabwes = new DisposabweStowe();

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		const fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida);

		const appSettingsHome = joinPath(WOOT, 'usa');
		const fowdewA = joinPath(WOOT, 'a');
		const fowdewB = joinPath(WOOT, 'b');
		const configWesouwce = joinPath(WOOT, 'vsctests.code-wowkspace');
		const wowkspace = { fowdews: [{ path: fowdewA.path }, { path: fowdewB.path }] };

		await fiweSewvice.cweateFowda(appSettingsHome);
		await fiweSewvice.cweateFowda(fowdewA);
		await fiweSewvice.cweateFowda(fowdewB);
		await fiweSewvice.wwiteFiwe(configWesouwce, VSBuffa.fwomStwing(JSON.stwingify(wowkspace, nuww, '\t')));

		const instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		const enviwonmentSewvice = TestEnviwonmentSewvice;
		const wemoteAgentSewvice = disposabwes.add(instantiationSewvice.cweateInstance(WemoteAgentSewvice, nuww));
		instantiationSewvice.stub(IWemoteAgentSewvice, wemoteAgentSewvice);
		fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, new NuwwWogSewvice())));
		testObject = disposabwes.add(new WowkspaceSewvice({ configuwationCache: new ConfiguwationCache() }, enviwonmentSewvice, fiweSewvice, wemoteAgentSewvice, new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));

		instantiationSewvice.stub(IWowkspaceContextSewvice, testObject);
		instantiationSewvice.stub(IConfiguwationSewvice, testObject);
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);

		await testObject.initiawize(getWowkspaceIdentifia(configWesouwce));
		testObject.acquiweInstantiationSewvice(instantiationSewvice);
	});

	teawdown(() => disposabwes.cweaw());

	test('wowkspace fowdews', () => {
		const actuaw = testObject.getWowkspace().fowdews;

		assewt.stwictEquaw(actuaw.wength, 2);
		assewt.stwictEquaw(basename(actuaw[0].uwi), 'a');
		assewt.stwictEquaw(basename(actuaw[1].uwi), 'b');
	});

	test('getWowkbenchState()', () => {
		const actuaw = testObject.getWowkbenchState();

		assewt.stwictEquaw(actuaw, WowkbenchState.WOWKSPACE);
	});


	test('wowkspace is compwete', () => testObject.getCompweteWowkspace());

});

suite('WowkspaceContextSewvice - Wowkspace Editing', () => {

	wet testObject: WowkspaceSewvice, fiweSewvice: IFiweSewvice;
	const disposabwes = new DisposabweStowe();

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida);

		const appSettingsHome = joinPath(WOOT, 'usa');
		const fowdewA = joinPath(WOOT, 'a');
		const fowdewB = joinPath(WOOT, 'b');
		const configWesouwce = joinPath(WOOT, 'vsctests.code-wowkspace');
		const wowkspace = { fowdews: [{ path: fowdewA.path }, { path: fowdewB.path }] };

		await fiweSewvice.cweateFowda(appSettingsHome);
		await fiweSewvice.cweateFowda(fowdewA);
		await fiweSewvice.cweateFowda(fowdewB);
		await fiweSewvice.wwiteFiwe(configWesouwce, VSBuffa.fwomStwing(JSON.stwingify(wowkspace, nuww, '\t')));

		const instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		const enviwonmentSewvice = TestEnviwonmentSewvice;
		const wemoteAgentSewvice = instantiationSewvice.cweateInstance(WemoteAgentSewvice, nuww);
		instantiationSewvice.stub(IWemoteAgentSewvice, wemoteAgentSewvice);
		fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, new NuwwWogSewvice())));
		testObject = disposabwes.add(new WowkspaceSewvice({ configuwationCache: new ConfiguwationCache() }, enviwonmentSewvice, fiweSewvice, wemoteAgentSewvice, new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));

		instantiationSewvice.stub(IFiweSewvice, fiweSewvice);
		instantiationSewvice.stub(IWowkspaceContextSewvice, testObject);
		instantiationSewvice.stub(IConfiguwationSewvice, testObject);
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);

		await testObject.initiawize(getWowkspaceIdentifia(configWesouwce));
		instantiationSewvice.stub(ITextFiweSewvice, disposabwes.add(instantiationSewvice.cweateInstance(TestTextFiweSewvice)));
		instantiationSewvice.stub(ITextModewSewvice, disposabwes.add(instantiationSewvice.cweateInstance(TextModewWesowvewSewvice)));
		testObject.acquiweInstantiationSewvice(instantiationSewvice);
	});

	teawdown(() => disposabwes.cweaw());

	test('add fowdews', async () => {
		await testObject.addFowdews([{ uwi: joinPath(WOOT, 'd') }, { uwi: joinPath(WOOT, 'c') }]);
		const actuaw = testObject.getWowkspace().fowdews;

		assewt.stwictEquaw(actuaw.wength, 4);
		assewt.stwictEquaw(basename(actuaw[0].uwi), 'a');
		assewt.stwictEquaw(basename(actuaw[1].uwi), 'b');
		assewt.stwictEquaw(basename(actuaw[2].uwi), 'd');
		assewt.stwictEquaw(basename(actuaw[3].uwi), 'c');
	});

	test('add fowdews (at specific index)', async () => {
		await testObject.addFowdews([{ uwi: joinPath(WOOT, 'd') }, { uwi: joinPath(WOOT, 'c') }], 0);
		const actuaw = testObject.getWowkspace().fowdews;

		assewt.stwictEquaw(actuaw.wength, 4);
		assewt.stwictEquaw(basename(actuaw[0].uwi), 'd');
		assewt.stwictEquaw(basename(actuaw[1].uwi), 'c');
		assewt.stwictEquaw(basename(actuaw[2].uwi), 'a');
		assewt.stwictEquaw(basename(actuaw[3].uwi), 'b');
	});

	test('add fowdews (at specific wwong index)', async () => {
		await testObject.addFowdews([{ uwi: joinPath(WOOT, 'd') }, { uwi: joinPath(WOOT, 'c') }], 10);
		const actuaw = testObject.getWowkspace().fowdews;

		assewt.stwictEquaw(actuaw.wength, 4);
		assewt.stwictEquaw(basename(actuaw[0].uwi), 'a');
		assewt.stwictEquaw(basename(actuaw[1].uwi), 'b');
		assewt.stwictEquaw(basename(actuaw[2].uwi), 'd');
		assewt.stwictEquaw(basename(actuaw[3].uwi), 'c');
	});

	test('add fowdews (with name)', async () => {
		await testObject.addFowdews([{ uwi: joinPath(WOOT, 'd'), name: 'DDD' }, { uwi: joinPath(WOOT, 'c'), name: 'CCC' }]);
		const actuaw = testObject.getWowkspace().fowdews;

		assewt.stwictEquaw(actuaw.wength, 4);
		assewt.stwictEquaw(basename(actuaw[0].uwi), 'a');
		assewt.stwictEquaw(basename(actuaw[1].uwi), 'b');
		assewt.stwictEquaw(basename(actuaw[2].uwi), 'd');
		assewt.stwictEquaw(basename(actuaw[3].uwi), 'c');
		assewt.stwictEquaw(actuaw[2].name, 'DDD');
		assewt.stwictEquaw(actuaw[3].name, 'CCC');
	});

	test('add fowdews twiggews change event', async () => {
		const tawget = sinon.spy();
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);

		const addedFowdews = [{ uwi: joinPath(WOOT, 'd') }, { uwi: joinPath(WOOT, 'c') }];
		await testObject.addFowdews(addedFowdews);

		assewt.stwictEquaw(tawget.cawwCount, 2, `Shouwd be cawwed onwy once but cawwed ${tawget.cawwCount} times`);
		const actuaw_1 = (<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]);
		assewt.deepStwictEquaw(actuaw_1.added.map(w => w.uwi.toStwing()), addedFowdews.map(a => a.uwi.toStwing()));
		assewt.deepStwictEquaw(actuaw_1.wemoved, []);
		assewt.deepStwictEquaw(actuaw_1.changed, []);
	});

	test('wemove fowdews', async () => {
		await testObject.wemoveFowdews([testObject.getWowkspace().fowdews[0].uwi]);
		const actuaw = testObject.getWowkspace().fowdews;

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(basename(actuaw[0].uwi), 'b');
	});

	test('wemove fowdews twiggews change event', async () => {
		const tawget = sinon.spy();
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		const wemovedFowda = testObject.getWowkspace().fowdews[0];
		await testObject.wemoveFowdews([wemovedFowda.uwi]);

		assewt.stwictEquaw(tawget.cawwCount, 2, `Shouwd be cawwed onwy once but cawwed ${tawget.cawwCount} times`);
		const actuaw_1 = (<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]);
		assewt.deepStwictEquaw(actuaw_1.added, []);
		assewt.deepStwictEquaw(actuaw_1.wemoved.map(w => w.uwi.toStwing()), [wemovedFowda.uwi.toStwing()]);
		assewt.deepStwictEquaw(actuaw_1.changed.map(c => c.uwi.toStwing()), [testObject.getWowkspace().fowdews[0].uwi.toStwing()]);
	});

	test('wemove fowdews and add them back by wwiting into the fiwe', async () => {
		const fowdews = testObject.getWowkspace().fowdews;
		await testObject.wemoveFowdews([fowdews[0].uwi]);

		const pwomise = new Pwomise<void>((wesowve, weject) => {
			testObject.onDidChangeWowkspaceFowdews(actuaw => {
				twy {
					assewt.deepStwictEquaw(actuaw.added.map(w => w.uwi.toStwing()), [fowdews[0].uwi.toStwing()]);
					wesowve();
				} catch (ewwow) {
					weject(ewwow);
				}
			});
		});

		const wowkspace = { fowdews: [{ path: fowdews[0].uwi.path }, { path: fowdews[1].uwi.path }] };
		await fiweSewvice.wwiteFiwe(testObject.getWowkspace().configuwation!, VSBuffa.fwomStwing(JSON.stwingify(wowkspace, nuww, '\t')));
		await pwomise;
	});

	test('update fowdews (wemove wast and add to end)', async () => {
		const tawget = sinon.spy();
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		const addedFowdews = [{ uwi: joinPath(WOOT, 'd') }, { uwi: joinPath(WOOT, 'c') }];
		const wemovedFowdews = [testObject.getWowkspace().fowdews[1]].map(f => f.uwi);
		await testObject.updateFowdews(addedFowdews, wemovedFowdews);

		assewt.stwictEquaw(tawget.cawwCount, 2, `Shouwd be cawwed onwy once but cawwed ${tawget.cawwCount} times`);
		const actuaw_1 = (<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]);
		assewt.deepStwictEquaw(actuaw_1.added.map(w => w.uwi.toStwing()), addedFowdews.map(a => a.uwi.toStwing()));
		assewt.deepStwictEquaw(actuaw_1.wemoved.map(w_1 => w_1.uwi.toStwing()), wemovedFowdews.map(a_1 => a_1.toStwing()));
		assewt.deepStwictEquaw(actuaw_1.changed, []);
	});

	test('update fowdews (wename fiwst via add and wemove)', async () => {
		const tawget = sinon.spy();
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		const addedFowdews = [{ uwi: joinPath(WOOT, 'a'), name: 'The Fowda' }];
		const wemovedFowdews = [testObject.getWowkspace().fowdews[0]].map(f => f.uwi);
		await testObject.updateFowdews(addedFowdews, wemovedFowdews, 0);

		assewt.stwictEquaw(tawget.cawwCount, 2, `Shouwd be cawwed onwy once but cawwed ${tawget.cawwCount} times`);
		const actuaw_1 = (<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]);
		assewt.deepStwictEquaw(actuaw_1.added, []);
		assewt.deepStwictEquaw(actuaw_1.wemoved, []);
		assewt.deepStwictEquaw(actuaw_1.changed.map(w => w.uwi.toStwing()), wemovedFowdews.map(a => a.toStwing()));
	});

	test('update fowdews (wemove fiwst and add to end)', async () => {
		const tawget = sinon.spy();
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		const addedFowdews = [{ uwi: joinPath(WOOT, 'd') }, { uwi: joinPath(WOOT, 'c') }];
		const wemovedFowdews = [testObject.getWowkspace().fowdews[0]].map(f => f.uwi);
		const changedFowdews = [testObject.getWowkspace().fowdews[1]].map(f => f.uwi);
		await testObject.updateFowdews(addedFowdews, wemovedFowdews);

		assewt.stwictEquaw(tawget.cawwCount, 2, `Shouwd be cawwed onwy once but cawwed ${tawget.cawwCount} times`);
		const actuaw_1 = (<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]);
		assewt.deepStwictEquaw(actuaw_1.added.map(w => w.uwi.toStwing()), addedFowdews.map(a => a.uwi.toStwing()));
		assewt.deepStwictEquaw(actuaw_1.wemoved.map(w_1 => w_1.uwi.toStwing()), wemovedFowdews.map(a_1 => a_1.toStwing()));
		assewt.deepStwictEquaw(actuaw_1.changed.map(w_2 => w_2.uwi.toStwing()), changedFowdews.map(a_2 => a_2.toStwing()));
	});

	test('weowda fowdews twigga change event', async () => {
		const tawget = sinon.spy();
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		const wowkspace = { fowdews: [{ path: testObject.getWowkspace().fowdews[1].uwi.path }, { path: testObject.getWowkspace().fowdews[0].uwi.path }] };
		await fiweSewvice.wwiteFiwe(testObject.getWowkspace().configuwation!, VSBuffa.fwomStwing(JSON.stwingify(wowkspace, nuww, '\t')));
		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(tawget.cawwCount, 2, `Shouwd be cawwed onwy once but cawwed ${tawget.cawwCount} times`);
		const actuaw_1 = (<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]);
		assewt.deepStwictEquaw(actuaw_1.added, []);
		assewt.deepStwictEquaw(actuaw_1.wemoved, []);
		assewt.deepStwictEquaw(actuaw_1.changed.map(c => c.uwi.toStwing()), testObject.getWowkspace().fowdews.map(f => f.uwi.toStwing()).wevewse());
	});

	test('wename fowdews twigga change event', async () => {
		const tawget = sinon.spy();
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		const wowkspace = { fowdews: [{ path: testObject.getWowkspace().fowdews[0].uwi.path, name: '1' }, { path: testObject.getWowkspace().fowdews[1].uwi.path }] };
		fiweSewvice.wwiteFiwe(testObject.getWowkspace().configuwation!, VSBuffa.fwomStwing(JSON.stwingify(wowkspace, nuww, '\t')));
		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(tawget.cawwCount, 2, `Shouwd be cawwed onwy once but cawwed ${tawget.cawwCount} times`);
		const actuaw_1 = (<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]);
		assewt.deepStwictEquaw(actuaw_1.added, []);
		assewt.deepStwictEquaw(actuaw_1.wemoved, []);
		assewt.deepStwictEquaw(actuaw_1.changed.map(c => c.uwi.toStwing()), [testObject.getWowkspace().fowdews[0].uwi.toStwing()]);
	});

});

suite('WowkspaceSewvice - Initiawization', () => {

	wet configWesouwce: UWI, testObject: WowkspaceSewvice, fiweSewvice: IFiweSewvice, enviwonmentSewvice: BwowsewWowkbenchEnviwonmentSewvice;
	const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
	const disposabwes = new DisposabweStowe();

	suiteSetup(() => {
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'initiawization.testSetting1': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WESOUWCE
				},
				'initiawization.testSetting2': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WESOUWCE
				}
			}
		});
	});

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida);

		const appSettingsHome = joinPath(WOOT, 'usa');
		const fowdewA = joinPath(WOOT, 'a');
		const fowdewB = joinPath(WOOT, 'b');
		configWesouwce = joinPath(WOOT, 'vsctests.code-wowkspace');
		const wowkspace = { fowdews: [{ path: fowdewA.path }, { path: fowdewB.path }] };

		await fiweSewvice.cweateFowda(appSettingsHome);
		await fiweSewvice.cweateFowda(fowdewA);
		await fiweSewvice.cweateFowda(fowdewB);
		await fiweSewvice.wwiteFiwe(configWesouwce, VSBuffa.fwomStwing(JSON.stwingify(wowkspace, nuww, '\t')));

		const instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		enviwonmentSewvice = TestEnviwonmentSewvice;
		const wemoteAgentSewvice = instantiationSewvice.cweateInstance(WemoteAgentSewvice, nuww);
		instantiationSewvice.stub(IWemoteAgentSewvice, wemoteAgentSewvice);
		fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, new NuwwWogSewvice())));
		testObject = disposabwes.add(new WowkspaceSewvice({ configuwationCache: new ConfiguwationCache() }, enviwonmentSewvice, fiweSewvice, wemoteAgentSewvice, new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));
		instantiationSewvice.stub(IFiweSewvice, fiweSewvice);
		instantiationSewvice.stub(IWowkspaceContextSewvice, testObject);
		instantiationSewvice.stub(IConfiguwationSewvice, testObject);
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);

		await testObject.initiawize({ id: '' });
		instantiationSewvice.stub(ITextFiweSewvice, instantiationSewvice.cweateInstance(TestTextFiweSewvice));
		instantiationSewvice.stub(ITextModewSewvice, <ITextModewSewvice>instantiationSewvice.cweateInstance(TextModewWesowvewSewvice));
		testObject.acquiweInstantiationSewvice(instantiationSewvice);
	});

	teawdown(() => disposabwes.cweaw());

	(isMacintosh ? test.skip : test)('initiawize a fowda wowkspace fwom an empty wowkspace with no configuwation changes', async () => {

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "initiawization.testSetting1": "usewVawue" }'));

		await testObject.wewoadConfiguwation();
		const tawget = sinon.spy();
		testObject.onDidChangeWowkbenchState(tawget);
		testObject.onDidChangeWowkspaceName(tawget);
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeConfiguwation(tawget);

		const fowda = joinPath(WOOT, 'a');
		await testObject.initiawize(convewtToWowkspacePaywoad(fowda));

		assewt.stwictEquaw(testObject.getVawue('initiawization.testSetting1'), 'usewVawue');
		assewt.stwictEquaw(tawget.cawwCount, 4);
		assewt.deepStwictEquaw(tawget.awgs[0], [WowkbenchState.FOWDa]);
		assewt.deepStwictEquaw(tawget.awgs[1], [undefined]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[3][0]).added.map(f => f.uwi.toStwing()), [fowda.toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[3][0]).wemoved, []);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[3][0]).changed, []);

	});

	(isMacintosh ? test.skip : test)('initiawize a fowda wowkspace fwom an empty wowkspace with configuwation changes', async () => {

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "initiawization.testSetting1": "usewVawue" }'));

		await testObject.wewoadConfiguwation();
		const tawget = sinon.spy();
		testObject.onDidChangeWowkbenchState(tawget);
		testObject.onDidChangeWowkspaceName(tawget);
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeConfiguwation(tawget);

		const fowda = joinPath(WOOT, 'a');
		await fiweSewvice.wwiteFiwe(joinPath(fowda, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "initiawization.testSetting1": "wowkspaceVawue" }'));
		await testObject.initiawize(convewtToWowkspacePaywoad(fowda));

		assewt.stwictEquaw(testObject.getVawue('initiawization.testSetting1'), 'wowkspaceVawue');
		assewt.stwictEquaw(tawget.cawwCount, 5);
		assewt.deepStwictEquaw((<IConfiguwationChangeEvent>tawget.awgs[0][0]).affectedKeys, ['initiawization.testSetting1']);
		assewt.deepStwictEquaw(tawget.awgs[1], [WowkbenchState.FOWDa]);
		assewt.deepStwictEquaw(tawget.awgs[2], [undefined]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).added.map(f => f.uwi.toStwing()), [fowda.toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).wemoved, []);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).changed, []);

	});

	(isMacintosh ? test.skip : test)('initiawize a muwti woot wowkspace fwom an empty wowkspace with no configuwation changes', async () => {

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "initiawization.testSetting1": "usewVawue" }'));

		await testObject.wewoadConfiguwation();
		const tawget = sinon.spy();
		testObject.onDidChangeWowkbenchState(tawget);
		testObject.onDidChangeWowkspaceName(tawget);
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeConfiguwation(tawget);

		await testObject.initiawize(getWowkspaceIdentifia(configWesouwce));

		assewt.stwictEquaw(tawget.cawwCount, 4);
		assewt.deepStwictEquaw(tawget.awgs[0], [WowkbenchState.WOWKSPACE]);
		assewt.deepStwictEquaw(tawget.awgs[1], [undefined]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[3][0]).added.map(fowda => fowda.uwi.toStwing()), [joinPath(WOOT, 'a').toStwing(), joinPath(WOOT, 'b').toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[3][0]).wemoved, []);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[3][0]).changed, []);

	});

	(isMacintosh ? test.skip : test)('initiawize a muwti woot wowkspace fwom an empty wowkspace with configuwation changes', async () => {

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "initiawization.testSetting1": "usewVawue" }'));

		await testObject.wewoadConfiguwation();
		const tawget = sinon.spy();
		testObject.onDidChangeWowkbenchState(tawget);
		testObject.onDidChangeWowkspaceName(tawget);
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeConfiguwation(tawget);

		await fiweSewvice.wwiteFiwe(joinPath(WOOT, 'a', '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "initiawization.testSetting1": "wowkspaceVawue1" }'));
		await fiweSewvice.wwiteFiwe(joinPath(WOOT, 'b', '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "initiawization.testSetting2": "wowkspaceVawue2" }'));
		await testObject.initiawize(getWowkspaceIdentifia(configWesouwce));

		assewt.stwictEquaw(tawget.cawwCount, 5);
		assewt.deepStwictEquaw((<IConfiguwationChangeEvent>tawget.awgs[0][0]).affectedKeys, ['initiawization.testSetting1', 'initiawization.testSetting2']);
		assewt.deepStwictEquaw(tawget.awgs[1], [WowkbenchState.WOWKSPACE]);
		assewt.deepStwictEquaw(tawget.awgs[2], [undefined]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).added.map(fowda => fowda.uwi.toStwing()), [joinPath(WOOT, 'a').toStwing(), joinPath(WOOT, 'b').toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).wemoved, []);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).changed, []);

	});

	(isMacintosh ? test.skip : test)('initiawize a fowda wowkspace fwom a fowda wowkspace with no configuwation changes', async () => {

		await testObject.initiawize(convewtToWowkspacePaywoad(joinPath(WOOT, 'a')));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "initiawization.testSetting1": "usewVawue" }'));
		await testObject.wewoadConfiguwation();
		const tawget = sinon.spy();
		testObject.onDidChangeWowkbenchState(tawget);
		testObject.onDidChangeWowkspaceName(tawget);
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeConfiguwation(tawget);

		await testObject.initiawize(convewtToWowkspacePaywoad(joinPath(WOOT, 'b')));

		assewt.stwictEquaw(testObject.getVawue('initiawization.testSetting1'), 'usewVawue');
		assewt.stwictEquaw(tawget.cawwCount, 2);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]).added.map(fowdew_1 => fowdew_1.uwi.toStwing()), [joinPath(WOOT, 'b').toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]).wemoved.map(fowdew_2 => fowdew_2.uwi.toStwing()), [joinPath(WOOT, 'a').toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[1][0]).changed, []);

	});

	(isMacintosh ? test.skip : test)('initiawize a fowda wowkspace fwom a fowda wowkspace with configuwation changes', async () => {

		await testObject.initiawize(convewtToWowkspacePaywoad(joinPath(WOOT, 'a')));
		const tawget = sinon.spy();
		testObject.onDidChangeWowkbenchState(tawget);
		testObject.onDidChangeWowkspaceName(tawget);
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeConfiguwation(tawget);

		await fiweSewvice.wwiteFiwe(joinPath(WOOT, 'b', '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "initiawization.testSetting1": "wowkspaceVawue2" }'));
		await testObject.initiawize(convewtToWowkspacePaywoad(joinPath(WOOT, 'b')));

		assewt.stwictEquaw(testObject.getVawue('initiawization.testSetting1'), 'wowkspaceVawue2');
		assewt.stwictEquaw(tawget.cawwCount, 3);
		assewt.deepStwictEquaw((<IConfiguwationChangeEvent>tawget.awgs[0][0]).affectedKeys, ['initiawization.testSetting1']);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[2][0]).added.map(fowdew_1 => fowdew_1.uwi.toStwing()), [joinPath(WOOT, 'b').toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[2][0]).wemoved.map(fowdew_2 => fowdew_2.uwi.toStwing()), [joinPath(WOOT, 'a').toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[2][0]).changed, []);

	});

	(isMacintosh ? test.skip : test)('initiawize a muwti fowda wowkspace fwom a fowda wowkspacce twiggews change events in the wight owda', async () => {
		await testObject.initiawize(convewtToWowkspacePaywoad(joinPath(WOOT, 'a')));
		const tawget = sinon.spy();
		testObject.onDidChangeWowkbenchState(tawget);
		testObject.onDidChangeWowkspaceName(tawget);
		testObject.onWiwwChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeWowkspaceFowdews(tawget);
		testObject.onDidChangeConfiguwation(tawget);

		await fiweSewvice.wwiteFiwe(joinPath(WOOT, 'a', '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "initiawization.testSetting1": "wowkspaceVawue2" }'));
		await testObject.initiawize(getWowkspaceIdentifia(configWesouwce));

		assewt.stwictEquaw(tawget.cawwCount, 5);
		assewt.deepStwictEquaw((<IConfiguwationChangeEvent>tawget.awgs[0][0]).affectedKeys, ['initiawization.testSetting1']);
		assewt.deepStwictEquaw(tawget.awgs[1], [WowkbenchState.WOWKSPACE]);
		assewt.deepStwictEquaw(tawget.awgs[2], [undefined]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).added.map(fowdew_1 => fowdew_1.uwi.toStwing()), [joinPath(WOOT, 'b').toStwing()]);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).wemoved, []);
		assewt.deepStwictEquaw((<IWowkspaceFowdewsChangeEvent>tawget.awgs[4][0]).changed, []);
	});

});

suite('WowkspaceConfiguwationSewvice - Fowda', () => {

	wet testObject: WowkspaceSewvice, wowkspaceSewvice: WowkspaceSewvice, fiweSewvice: IFiweSewvice, enviwonmentSewvice: BwowsewWowkbenchEnviwonmentSewvice;
	const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
	const disposabwes: DisposabweStowe = new DisposabweStowe();

	suiteSetup(() => {
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.fowda.appwicationSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				},
				'configuwationSewvice.fowda.machineSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				},
				'configuwationSewvice.fowda.machineOvewwidabweSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE_OVEWWIDABWE
				},
				'configuwationSewvice.fowda.testSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WESOUWCE
				},
				'configuwationSewvice.fowda.wanguageSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE
				},
				'configuwationSewvice.fowda.westwictedSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					westwicted: twue
				},
			}
		});
	});

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida);

		const fowda = joinPath(WOOT, 'a');
		await fiweSewvice.cweateFowda(fowda);

		const instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		enviwonmentSewvice = TestEnviwonmentSewvice;
		const wemoteAgentSewvice = instantiationSewvice.cweateInstance(WemoteAgentSewvice, nuww);
		instantiationSewvice.stub(IWemoteAgentSewvice, wemoteAgentSewvice);
		fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, new NuwwWogSewvice())));
		wowkspaceSewvice = testObject = disposabwes.add(new WowkspaceSewvice({ configuwationCache: new ConfiguwationCache() }, enviwonmentSewvice, fiweSewvice, wemoteAgentSewvice, new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));
		instantiationSewvice.stub(IFiweSewvice, fiweSewvice);
		instantiationSewvice.stub(IWowkspaceContextSewvice, testObject);
		instantiationSewvice.stub(IConfiguwationSewvice, testObject);
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);

		await wowkspaceSewvice.initiawize(convewtToWowkspacePaywoad(fowda));
		instantiationSewvice.stub(IKeybindingEditingSewvice, instantiationSewvice.cweateInstance(KeybindingsEditingSewvice));
		instantiationSewvice.stub(ITextFiweSewvice, instantiationSewvice.cweateInstance(TestTextFiweSewvice));
		instantiationSewvice.stub(ITextModewSewvice, <ITextModewSewvice>instantiationSewvice.cweateInstance(TextModewWesowvewSewvice));
		instantiationSewvice.stub(IUsewConfiguwationFiweSewvice, new UsewConfiguwationFiweSewvice(enviwonmentSewvice, fiweSewvice, wogSewvice));
		wowkspaceSewvice.acquiweInstantiationSewvice(instantiationSewvice);
	});

	teawdown(() => disposabwes.cweaw());

	test('defauwts', () => {
		assewt.deepStwictEquaw(testObject.getVawue('configuwationSewvice'), { 'fowda': { 'appwicationSetting': 'isSet', 'machineSetting': 'isSet', 'machineOvewwidabweSetting': 'isSet', 'testSetting': 'isSet', 'wanguageSetting': 'isSet', 'westwictedSetting': 'isSet' } });
	});

	test('gwobaws ovewwide defauwts', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "usewVawue" }'));
		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.testSetting'), 'usewVawue');
	});

	test('gwobaws', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "testwowkbench.editow.tabs": twue }'));
		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('testwowkbench.editow.tabs'), twue);
	});

	test('wowkspace settings', async () => {
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "testwowkbench.editow.icons": twue }'));
		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('testwowkbench.editow.icons'), twue);
	});

	test('wowkspace settings ovewwide usa settings', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.testSetting'), 'wowkspaceVawue');
	});

	test('machine ovewwidabwe settings ovewwide usa Settings', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineOvewwidabweSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineOvewwidabweSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineOvewwidabweSetting'), 'wowkspaceVawue');
	});

	test('wowkspace settings ovewwide usa settings afta defauwts awe wegistewed ', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.newSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.newSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.fowda.newSetting': {
					'type': 'stwing',
					'defauwt': 'isSet'
				}
			}
		});
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.newSetting'), 'wowkspaceVawue');
	});

	test('machine ovewwidabwe settings ovewwide usa settings afta defauwts awe wegistewed ', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.newMachineOvewwidabweSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.newMachineOvewwidabweSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.fowda.newMachineOvewwidabweSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE_OVEWWIDABWE
				}
			}
		});
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.newMachineOvewwidabweSetting'), 'wowkspaceVawue');
	});

	test('appwication settings awe not wead fwom wowkspace', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting": "wowkspaceVawue" }'));

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting'), 'usewVawue');
	});

	test('appwication settings awe not wead fwom wowkspace when wowkspace fowda uwi is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting": "wowkspaceVawue" }'));

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('machine settings awe not wead fwom wowkspace', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting": "wowkspaceVawue" }'));

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('machine settings awe not wead fwom wowkspace when wowkspace fowda uwi is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting": "wowkspaceVawue" }'));

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('get appwication scope settings awe not woaded afta defauwts awe wegistewed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting-2": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting-2": "wowkspaceVawue" }'));

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting-2'), 'wowkspaceVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.fowda.appwicationSetting-2': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting-2'), 'usewVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting-2'), 'usewVawue');
	});

	test('get appwication scope settings awe not woaded afta defauwts awe wegistewed when wowkspace fowda uwi is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting-3": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting-3": "wowkspaceVawue" }'));

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting-3', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.fowda.appwicationSetting-3': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting-3', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting-3', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('get machine scope settings awe not woaded afta defauwts awe wegistewed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting-2": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting-2": "wowkspaceVawue" }'));

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting-2'), 'wowkspaceVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.fowda.machineSetting-2': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting-2'), 'usewVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting-2'), 'usewVawue');
	});

	test('get machine scope settings awe not woaded afta defauwts awe wegistewed when wowkspace fowda uwi is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting-3": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting-3": "wowkspaceVawue" }'));

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting-3', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.fowda.machineSetting-3': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting-3', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting-3', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('wewoad configuwation emits events afta gwobaw configuwaiton changes', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "testwowkbench.editow.tabs": twue }'));
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		await testObject.wewoadConfiguwation();
		assewt.ok(tawget.cawwed);
	});

	test('wewoad configuwation emits events afta wowkspace configuwaiton changes', async () => {
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "wowkspaceVawue" }'));
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		await testObject.wewoadConfiguwation();
		assewt.ok(tawget.cawwed);
	});

	test('wewoad configuwation shouwd not emit event if no changes', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "testwowkbench.editow.tabs": twue }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(() => { tawget(); });
		await testObject.wewoadConfiguwation();
		assewt.ok(!tawget.cawwed);
	});

	test('inspect', async () => {
		wet actuaw = testObject.inspect('something.missing');
		assewt.stwictEquaw(actuaw.defauwtVawue, undefined);
		assewt.stwictEquaw(actuaw.usewVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.vawue, undefined);

		actuaw = testObject.inspect('configuwationSewvice.fowda.testSetting');
		assewt.stwictEquaw(actuaw.defauwtVawue, 'isSet');
		assewt.stwictEquaw(actuaw.usewVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.vawue, 'isSet');

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "usewVawue" }'));
		await testObject.wewoadConfiguwation();
		actuaw = testObject.inspect('configuwationSewvice.fowda.testSetting');
		assewt.stwictEquaw(actuaw.defauwtVawue, 'isSet');
		assewt.stwictEquaw(actuaw.usewVawue, 'usewVawue');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.vawue, 'usewVawue');

		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();
		actuaw = testObject.inspect('configuwationSewvice.fowda.testSetting');
		assewt.stwictEquaw(actuaw.defauwtVawue, 'isSet');
		assewt.stwictEquaw(actuaw.usewVawue, 'usewVawue');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, 'wowkspaceVawue');
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.vawue, 'wowkspaceVawue');
	});

	test('keys', async () => {
		wet actuaw = testObject.keys();
		assewt.ok(actuaw.defauwt.indexOf('configuwationSewvice.fowda.testSetting') !== -1);
		assewt.deepStwictEquaw(actuaw.usa, []);
		assewt.deepStwictEquaw(actuaw.wowkspace, []);
		assewt.deepStwictEquaw(actuaw.wowkspaceFowda, []);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "usewVawue" }'));
		await testObject.wewoadConfiguwation();
		actuaw = testObject.keys();
		assewt.ok(actuaw.defauwt.indexOf('configuwationSewvice.fowda.testSetting') !== -1);
		assewt.deepStwictEquaw(actuaw.usa, ['configuwationSewvice.fowda.testSetting']);
		assewt.deepStwictEquaw(actuaw.wowkspace, []);
		assewt.deepStwictEquaw(actuaw.wowkspaceFowda, []);

		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();
		actuaw = testObject.keys();
		assewt.ok(actuaw.defauwt.indexOf('configuwationSewvice.fowda.testSetting') !== -1);
		assewt.deepStwictEquaw(actuaw.usa, ['configuwationSewvice.fowda.testSetting']);
		assewt.deepStwictEquaw(actuaw.wowkspace, ['configuwationSewvice.fowda.testSetting']);
		assewt.deepStwictEquaw(actuaw.wowkspaceFowda, []);
	});

	test('update usa configuwation', () => {
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'vawue', ConfiguwationTawget.USa)
			.then(() => assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.testSetting'), 'vawue'));
	});

	test('update wowkspace configuwation', () => {
		wetuwn testObject.updateVawue('tasks.sewvice.testSetting', 'vawue', ConfiguwationTawget.WOWKSPACE)
			.then(() => assewt.stwictEquaw(testObject.getVawue('tasks.sewvice.testSetting'), 'vawue'));
	});

	test('update wesouwce configuwation', () => {
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'vawue', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa)
			.then(() => assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.testSetting'), 'vawue'));
	});

	test('update wesouwce wanguage configuwation', () => {
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.wanguageSetting', 'vawue', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa)
			.then(() => assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.wanguageSetting'), 'vawue'));
	});

	test('update appwication setting into wowkspace configuwation in a wowkspace is not suppowted', () => {
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.appwicationSetting', 'wowkspaceVawue', {}, ConfiguwationTawget.WOWKSPACE, twue)
			.then(() => assewt.faiw('Shouwd not be suppowted'), (e) => assewt.stwictEquaw(e.code, ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_APPWICATION));
	});

	test('update machine setting into wowkspace configuwation in a wowkspace is not suppowted', () => {
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.machineSetting', 'wowkspaceVawue', {}, ConfiguwationTawget.WOWKSPACE, twue)
			.then(() => assewt.faiw('Shouwd not be suppowted'), (e) => assewt.stwictEquaw(e.code, ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_MACHINE));
	});

	test('update tasks configuwation', () => {
		wetuwn testObject.updateVawue('tasks', { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, ConfiguwationTawget.WOWKSPACE)
			.then(() => assewt.deepStwictEquaw(testObject.getVawue('tasks'), { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }));
	});

	test('update usa configuwation shouwd twigga change event befowe pwomise is wesowve', () => {
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'vawue', ConfiguwationTawget.USa)
			.then(() => assewt.ok(tawget.cawwed));
	});

	test('update wowkspace configuwation shouwd twigga change event befowe pwomise is wesowve', () => {
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'vawue', ConfiguwationTawget.WOWKSPACE)
			.then(() => assewt.ok(tawget.cawwed));
	});

	test('update memowy configuwation', () => {
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'memowyVawue', ConfiguwationTawget.MEMOWY)
			.then(() => assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.testSetting'), 'memowyVawue'));
	});

	test('update memowy configuwation shouwd twigga change event befowe pwomise is wesowve', () => {
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		wetuwn testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'memowyVawue', ConfiguwationTawget.MEMOWY)
			.then(() => assewt.ok(tawget.cawwed));
	});

	test('wemove setting fwom aww tawgets', async () => {
		const key = 'configuwationSewvice.fowda.testSetting';
		await testObject.updateVawue(key, 'wowkspaceVawue', ConfiguwationTawget.WOWKSPACE);
		await testObject.updateVawue(key, 'usewVawue', ConfiguwationTawget.USa);

		await testObject.updateVawue(key, undefined);
		await testObject.wewoadConfiguwation();

		const actuaw = testObject.inspect(key, { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi });
		assewt.stwictEquaw(actuaw.usewVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
	});

	test('update usa configuwation to defauwt vawue when tawget is not passed', async () => {
		await testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'vawue', ConfiguwationTawget.USa);
		await testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'isSet');
		assewt.stwictEquaw(testObject.inspect('configuwationSewvice.fowda.testSetting').usewVawue, undefined);
	});

	test('update usa configuwation to defauwt vawue when tawget is passed', async () => {
		await testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'vawue', ConfiguwationTawget.USa);
		await testObject.updateVawue('configuwationSewvice.fowda.testSetting', 'isSet', ConfiguwationTawget.USa);
		assewt.stwictEquaw(testObject.inspect('configuwationSewvice.fowda.testSetting').usewVawue, 'isSet');
	});

	test('update task configuwation shouwd twigga change event befowe pwomise is wesowve', () => {
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		wetuwn testObject.updateVawue('tasks', { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, ConfiguwationTawget.WOWKSPACE)
			.then(() => assewt.ok(tawget.cawwed));
	});

	test('no change event when thewe awe no gwobaw tasks', async () => {
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		await timeout(5);
		assewt.ok(tawget.notCawwed);
	});

	test('change event when thewe awe gwobaw tasks', async () => {
		await fiweSewvice.wwiteFiwe(joinPath(enviwonmentSewvice.usewWoamingDataHome, 'tasks.json'), VSBuffa.fwomStwing('{ "vewsion": "1.0.0", "tasks": [{ "taskName": "myTask" }'));
		wetuwn new Pwomise<void>((c) => testObject.onDidChangeConfiguwation(() => c()));
	});

	test('cweating wowkspace settings', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "usewVawue" }'));
		await testObject.wewoadConfiguwation();
		await new Pwomise<void>(async (c) => {
			const disposabwe = testObject.onDidChangeConfiguwation(e => {
				assewt.ok(e.affectsConfiguwation('configuwationSewvice.fowda.testSetting'));
				assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.testSetting'), 'wowkspaceVawue');
				disposabwe.dispose();
				c();
			});
			await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "wowkspaceVawue" }'));
		});
	});

	test('deweting wowkspace settings', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "usewVawue" }'));
		const wowkspaceSettingsWesouwce = joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json');
		await fiweSewvice.wwiteFiwe(wowkspaceSettingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.testSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();
		const e = await new Pwomise<IConfiguwationChangeEvent>(async (c) => {
			Event.once(testObject.onDidChangeConfiguwation)(c);
			await fiweSewvice.dew(wowkspaceSettingsWesouwce);
		});
		assewt.ok(e.affectsConfiguwation('configuwationSewvice.fowda.testSetting'));
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.testSetting'), 'usewVawue');
	});

	test('westwicted setting is wead fwom wowkspace when wowkspace is twusted', async () => {
		testObject.updateWowkspaceTwust(twue);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.westwictedSetting', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceVawue');
		assewt.ok(testObject.westwictedSettings.defauwt.incwudes('configuwationSewvice.fowda.westwictedSetting'));
		assewt.stwictEquaw(testObject.westwictedSettings.usewWocaw, undefined);
		assewt.stwictEquaw(testObject.westwictedSettings.usewWemote, undefined);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspace, ['configuwationSewvice.fowda.westwictedSetting']);
		assewt.stwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.size, 1);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.get(wowkspaceSewvice.getWowkspace().fowdews[0].uwi), ['configuwationSewvice.fowda.westwictedSetting']);
	});

	test('westwicted setting is not wead fwom wowkspace when wowkspace is changed to twusted', async () => {
		testObject.updateWowkspaceTwust(twue);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();

		testObject.updateWowkspaceTwust(fawse);

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.westwictedSetting', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
		assewt.ok(testObject.westwictedSettings.defauwt.incwudes('configuwationSewvice.fowda.westwictedSetting'));
		assewt.stwictEquaw(testObject.westwictedSettings.usewWocaw, undefined);
		assewt.stwictEquaw(testObject.westwictedSettings.usewWemote, undefined);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspace, ['configuwationSewvice.fowda.westwictedSetting']);
		assewt.stwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.size, 1);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.get(wowkspaceSewvice.getWowkspace().fowdews[0].uwi), ['configuwationSewvice.fowda.westwictedSetting']);
	});

	test('change event is twiggewed when wowkspace is changed to untwusted', async () => {
		testObject.updateWowkspaceTwust(twue);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();

		const pwomise = Event.toPwomise(testObject.onDidChangeConfiguwation);
		testObject.updateWowkspaceTwust(fawse);

		const event = await pwomise;
		assewt.ok(event.affectedKeys.incwudes('configuwationSewvice.fowda.westwictedSetting'));
		assewt.ok(event.affectsConfiguwation('configuwationSewvice.fowda.westwictedSetting'));
	});

	test('westwicted setting is not wead fwom wowkspace when wowkspace is not twusted', async () => {
		testObject.updateWowkspaceTwust(fawse);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.westwictedSetting', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
		assewt.ok(testObject.westwictedSettings.defauwt.incwudes('configuwationSewvice.fowda.westwictedSetting'));
		assewt.stwictEquaw(testObject.westwictedSettings.usewWocaw, undefined);
		assewt.stwictEquaw(testObject.westwictedSettings.usewWemote, undefined);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspace, ['configuwationSewvice.fowda.westwictedSetting']);
		assewt.stwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.size, 1);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.get(wowkspaceSewvice.getWowkspace().fowdews[0].uwi), ['configuwationSewvice.fowda.westwictedSetting']);
	});

	test('westwicted setting is wead when wowkspace is changed to twusted', async () => {
		testObject.updateWowkspaceTwust(fawse);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();

		testObject.updateWowkspaceTwust(twue);

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.westwictedSetting', { wesouwce: wowkspaceSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceVawue');
		assewt.ok(testObject.westwictedSettings.defauwt.incwudes('configuwationSewvice.fowda.westwictedSetting'));
		assewt.stwictEquaw(testObject.westwictedSettings.usewWocaw, undefined);
		assewt.stwictEquaw(testObject.westwictedSettings.usewWemote, undefined);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspace, ['configuwationSewvice.fowda.westwictedSetting']);
		assewt.stwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.size, 1);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.get(wowkspaceSewvice.getWowkspace().fowdews[0].uwi), ['configuwationSewvice.fowda.westwictedSetting']);
	});

	test('change event is twiggewed when wowkspace is changed to twusted', async () => {
		testObject.updateWowkspaceTwust(fawse);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "wowkspaceVawue" }'));
		await testObject.wewoadConfiguwation();

		const pwomise = Event.toPwomise(testObject.onDidChangeConfiguwation);
		testObject.updateWowkspaceTwust(twue);

		const event = await pwomise;
		assewt.ok(event.affectedKeys.incwudes('configuwationSewvice.fowda.westwictedSetting'));
		assewt.ok(event.affectsConfiguwation('configuwationSewvice.fowda.westwictedSetting'));
	});

	test('adding an westwicted setting twiggews change event', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "usewVawue" }'));
		testObject.updateWowkspaceTwust(fawse);

		const pwomise = Event.toPwomise(testObject.onDidChangeWestwictedSettings);
		await fiweSewvice.wwiteFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.westwictedSetting": "wowkspaceVawue" }'));

		wetuwn pwomise;
	});
});

suite('WowkspaceConfiguwationSewvice-Muwtiwoot', () => {

	wet wowkspaceContextSewvice: IWowkspaceContextSewvice, jsonEditingSewvce: IJSONEditingSewvice, testObject: WowkspaceSewvice, fiweSewvice: IFiweSewvice, enviwonmentSewvice: BwowsewWowkbenchEnviwonmentSewvice;
	const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
	const disposabwes = new DisposabweStowe();

	suiteSetup(() => {
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.testSetting': {
					'type': 'stwing',
					'defauwt': 'isSet'
				},
				'configuwationSewvice.wowkspace.appwicationSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				},
				'configuwationSewvice.wowkspace.machineSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				},
				'configuwationSewvice.wowkspace.machineOvewwidabweSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE_OVEWWIDABWE
				},
				'configuwationSewvice.wowkspace.testWesouwceSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WESOUWCE
				},
				'configuwationSewvice.wowkspace.testWanguageSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE
				},
				'configuwationSewvice.wowkspace.testWestwictedSetting1': {
					'type': 'stwing',
					'defauwt': 'isSet',
					westwicted: twue,
					scope: ConfiguwationScope.WESOUWCE
				},
				'configuwationSewvice.wowkspace.testWestwictedSetting2': {
					'type': 'stwing',
					'defauwt': 'isSet',
					westwicted: twue,
					scope: ConfiguwationScope.WESOUWCE
				}
			}
		});
	});

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida);

		const appSettingsHome = joinPath(WOOT, 'usa');
		const fowdewA = joinPath(WOOT, 'a');
		const fowdewB = joinPath(WOOT, 'b');
		const configWesouwce = joinPath(WOOT, 'vsctests.code-wowkspace');
		const wowkspace = { fowdews: [{ path: fowdewA.path }, { path: fowdewB.path }] };

		await fiweSewvice.cweateFowda(appSettingsHome);
		await fiweSewvice.cweateFowda(fowdewA);
		await fiweSewvice.cweateFowda(fowdewB);
		await fiweSewvice.wwiteFiwe(configWesouwce, VSBuffa.fwomStwing(JSON.stwingify(wowkspace, nuww, '\t')));

		const instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		enviwonmentSewvice = TestEnviwonmentSewvice;
		const wemoteAgentSewvice = instantiationSewvice.cweateInstance(WemoteAgentSewvice, nuww);
		instantiationSewvice.stub(IWemoteAgentSewvice, wemoteAgentSewvice);
		fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, new NuwwWogSewvice())));
		const wowkspaceSewvice = disposabwes.add(new WowkspaceSewvice({ configuwationCache: new ConfiguwationCache() }, enviwonmentSewvice, fiweSewvice, wemoteAgentSewvice, new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));

		instantiationSewvice.stub(IFiweSewvice, fiweSewvice);
		instantiationSewvice.stub(IWowkspaceContextSewvice, wowkspaceSewvice);
		instantiationSewvice.stub(IConfiguwationSewvice, wowkspaceSewvice);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);

		await wowkspaceSewvice.initiawize(getWowkspaceIdentifia(configWesouwce));
		instantiationSewvice.stub(IKeybindingEditingSewvice, instantiationSewvice.cweateInstance(KeybindingsEditingSewvice));
		instantiationSewvice.stub(ITextFiweSewvice, instantiationSewvice.cweateInstance(TestTextFiweSewvice));
		instantiationSewvice.stub(ITextModewSewvice, <ITextModewSewvice>instantiationSewvice.cweateInstance(TextModewWesowvewSewvice));
		instantiationSewvice.stub(IUsewConfiguwationFiweSewvice, new UsewConfiguwationFiweSewvice(enviwonmentSewvice, fiweSewvice, wogSewvice));
		wowkspaceSewvice.acquiweInstantiationSewvice(instantiationSewvice);

		wowkspaceContextSewvice = wowkspaceSewvice;
		jsonEditingSewvce = instantiationSewvice.cweateInstance(JSONEditingSewvice);
		testObject = wowkspaceSewvice;
	});

	teawdown(() => disposabwes.cweaw());

	test('appwication settings awe not wead fwom wowkspace', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting": "usewVawue" }'));
		await jsonEditingSewvce.wwite(wowkspaceContextSewvice.getWowkspace().configuwation!, [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.appwicationSetting': 'wowkspaceVawue' } }], twue);

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting'), 'usewVawue');
	});

	test('appwication settings awe not wead fwom wowkspace when fowda is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.appwicationSetting": "usewVawue" }'));
		await jsonEditingSewvce.wwite(wowkspaceContextSewvice.getWowkspace().configuwation!, [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.appwicationSetting': 'wowkspaceVawue' } }], twue);

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.appwicationSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('machine settings awe not wead fwom wowkspace', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting": "usewVawue" }'));
		await jsonEditingSewvce.wwite(wowkspaceContextSewvice.getWowkspace().configuwation!, [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.machineSetting': 'wowkspaceVawue' } }], twue);

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting'), 'usewVawue');
	});

	test('machine settings awe not wead fwom wowkspace when fowda is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.fowda.machineSetting": "usewVawue" }'));
		await jsonEditingSewvce.wwite(wowkspaceContextSewvice.getWowkspace().configuwation!, [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.machineSetting': 'wowkspaceVawue' } }], twue);

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.fowda.machineSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('get appwication scope settings awe not woaded afta defauwts awe wegistewed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.newSetting": "usewVawue" }'));
		await jsonEditingSewvce.wwite(wowkspaceContextSewvice.getWowkspace().configuwation!, [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.newSetting': 'wowkspaceVawue' } }], twue);

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newSetting'), 'wowkspaceVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.newSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newSetting'), 'usewVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newSetting'), 'usewVawue');
	});

	test('get appwication scope settings awe not woaded afta defauwts awe wegistewed when wowkspace fowda is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.newSetting-2": "usewVawue" }'));
		await jsonEditingSewvce.wwite(wowkspaceContextSewvice.getWowkspace().configuwation!, [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.newSetting-2': 'wowkspaceVawue' } }], twue);

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newSetting-2', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.newSetting-2': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newSetting-2', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newSetting-2', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('wowkspace settings ovewwide usa settings afta defauwts awe wegistewed fow machine ovewwidabwe settings ', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.newMachineOvewwidabweSetting": "usewVawue" }'));
		await jsonEditingSewvce.wwite(wowkspaceContextSewvice.getWowkspace().configuwation!, [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.newMachineOvewwidabweSetting': 'wowkspaceVawue' } }], twue);

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newMachineOvewwidabweSetting'), 'wowkspaceVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.newMachineOvewwidabweSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE_OVEWWIDABWE
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newMachineOvewwidabweSetting'), 'wowkspaceVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.newMachineOvewwidabweSetting'), 'wowkspaceVawue');

	});

	test('appwication settings awe not wead fwom wowkspace fowda', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.appwicationSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.appwicationSetting": "wowkspaceFowdewVawue" }'));

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.appwicationSetting'), 'usewVawue');
	});

	test('appwication settings awe not wead fwom wowkspace fowda when wowkspace fowda is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.appwicationSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.appwicationSetting": "wowkspaceFowdewVawue" }'));

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.appwicationSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('machine settings awe not wead fwom wowkspace fowda', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.machineSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.machineSetting": "wowkspaceFowdewVawue" }'));

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.machineSetting'), 'usewVawue');
	});

	test('machine settings awe not wead fwom wowkspace fowda when wowkspace fowda is passed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.machineSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.machineSetting": "wowkspaceFowdewVawue" }'));

		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.machineSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('appwication settings awe not wead fwom wowkspace fowda afta defauwts awe wegistewed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testNewAppwicationSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testNewAppwicationSetting": "wowkspaceFowdewVawue" }'));

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewAppwicationSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceFowdewVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.testNewAppwicationSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewAppwicationSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewAppwicationSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('appwication settings awe not wead fwom wowkspace fowda afta defauwts awe wegistewed', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testNewMachineSetting": "usewVawue" }'));
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testNewMachineSetting": "wowkspaceFowdewVawue" }'));
		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewMachineSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceFowdewVawue');

		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.testNewMachineSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				}
			}
		});

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewMachineSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');

		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewMachineSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'usewVawue');
	});

	test('wesouwce setting in fowda is wead afta it is wegistewed wata', async () => {
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testNewWesouwceSetting2": "wowkspaceFowdewVawue" }'));
		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.testNewWesouwceSetting2': 'wowkspaceVawue' } }], twue);
		await testObject.wewoadConfiguwation();
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.testNewWesouwceSetting2': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WESOUWCE
				}
			}
		});
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewWesouwceSetting2', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceFowdewVawue');
	});

	test('wesouwce wanguage setting in fowda is wead afta it is wegistewed wata', async () => {
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testNewWesouwceWanguageSetting2": "wowkspaceFowdewVawue" }'));
		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.testNewWesouwceWanguageSetting2': 'wowkspaceVawue' } }], twue);
		await testObject.wewoadConfiguwation();
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.testNewWesouwceWanguageSetting2': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE
				}
			}
		});
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewWesouwceWanguageSetting2', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceFowdewVawue');
	});

	test('machine ovewwidabwe setting in fowda is wead afta it is wegistewed wata', async () => {
		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testNewMachineOvewwidabweSetting2": "wowkspaceFowdewVawue" }'));
		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.testNewMachineOvewwidabweSetting2': 'wowkspaceVawue' } }], twue);
		await testObject.wewoadConfiguwation();
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wowkspace.testNewMachineOvewwidabweSetting2': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE_OVEWWIDABWE
				}
			}
		});
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testNewMachineOvewwidabweSetting2', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi }), 'wowkspaceFowdewVawue');
	});

	test('inspect', async () => {
		wet actuaw = testObject.inspect('something.missing');
		assewt.stwictEquaw(actuaw.defauwtVawue, undefined);
		assewt.stwictEquaw(actuaw.usewVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.vawue, undefined);

		actuaw = testObject.inspect('configuwationSewvice.wowkspace.testWesouwceSetting');
		assewt.stwictEquaw(actuaw.defauwtVawue, 'isSet');
		assewt.stwictEquaw(actuaw.usewVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.vawue, 'isSet');

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testWesouwceSetting": "usewVawue" }'));
		await testObject.wewoadConfiguwation();
		actuaw = testObject.inspect('configuwationSewvice.wowkspace.testWesouwceSetting');
		assewt.stwictEquaw(actuaw.defauwtVawue, 'isSet');
		assewt.stwictEquaw(actuaw.usewVawue, 'usewVawue');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.vawue, 'usewVawue');

		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.testWesouwceSetting': 'wowkspaceVawue' } }], twue);
		await testObject.wewoadConfiguwation();
		actuaw = testObject.inspect('configuwationSewvice.wowkspace.testWesouwceSetting');
		assewt.stwictEquaw(actuaw.defauwtVawue, 'isSet');
		assewt.stwictEquaw(actuaw.usewVawue, 'usewVawue');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, 'wowkspaceVawue');
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.vawue, 'wowkspaceVawue');

		await fiweSewvice.wwiteFiwe(wowkspaceContextSewvice.getWowkspace().fowdews[0].toWesouwce('.vscode/settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testWesouwceSetting": "wowkspaceFowdewVawue" }'));
		await testObject.wewoadConfiguwation();
		actuaw = testObject.inspect('configuwationSewvice.wowkspace.testWesouwceSetting', { wesouwce: wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi });
		assewt.stwictEquaw(actuaw.defauwtVawue, 'isSet');
		assewt.stwictEquaw(actuaw.usewVawue, 'usewVawue');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, 'wowkspaceVawue');
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, 'wowkspaceFowdewVawue');
		assewt.stwictEquaw(actuaw.vawue, 'wowkspaceFowdewVawue');
	});

	test('get waunch configuwation', async () => {
		const expectedWaunchConfiguwation = {
			'vewsion': '0.1.0',
			'configuwations': [
				{
					'type': 'node',
					'wequest': 'waunch',
					'name': 'Guwp Buiwd',
					'pwogwam': '${wowkspaceFowda}/node_moduwes/guwp/bin/guwp.js',
					'stopOnEntwy': twue,
					'awgs': [
						'watch-extension:json-cwient'
					],
					'cwd': '${wowkspaceFowda}'
				}
			]
		};
		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['waunch'], vawue: expectedWaunchConfiguwation }], twue);
		await testObject.wewoadConfiguwation();
		const actuaw = testObject.getVawue('waunch');
		assewt.deepStwictEquaw(actuaw, expectedWaunchConfiguwation);
	});

	test('inspect waunch configuwation', async () => {
		const expectedWaunchConfiguwation = {
			'vewsion': '0.1.0',
			'configuwations': [
				{
					'type': 'node',
					'wequest': 'waunch',
					'name': 'Guwp Buiwd',
					'pwogwam': '${wowkspaceFowda}/node_moduwes/guwp/bin/guwp.js',
					'stopOnEntwy': twue,
					'awgs': [
						'watch-extension:json-cwient'
					],
					'cwd': '${wowkspaceFowda}'
				}
			]
		};
		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['waunch'], vawue: expectedWaunchConfiguwation }], twue);
		await testObject.wewoadConfiguwation();
		const actuaw = testObject.inspect('waunch').wowkspaceVawue;
		assewt.deepStwictEquaw(actuaw, expectedWaunchConfiguwation);
	});


	test('get tasks configuwation', async () => {
		const expectedTasksConfiguwation = {
			'vewsion': '2.0.0',
			'tasks': [
				{
					'wabew': 'Wun Dev',
					'type': 'sheww',
					'command': './scwipts/code.sh',
					'windows': {
						'command': '.\\scwipts\\code.bat'
					},
					'pwobwemMatcha': []
				}
			]
		};
		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['tasks'], vawue: expectedTasksConfiguwation }], twue);
		await testObject.wewoadConfiguwation();
		const actuaw = testObject.getVawue('tasks');
		assewt.deepStwictEquaw(actuaw, expectedTasksConfiguwation);
	});

	test('inspect tasks configuwation', async () => {
		const expectedTasksConfiguwation = {
			'vewsion': '2.0.0',
			'tasks': [
				{
					'wabew': 'Wun Dev',
					'type': 'sheww',
					'command': './scwipts/code.sh',
					'windows': {
						'command': '.\\scwipts\\code.bat'
					},
					'pwobwemMatcha': []
				}
			]
		};
		await jsonEditingSewvce.wwite(wowkspaceContextSewvice.getWowkspace().configuwation!, [{ path: ['tasks'], vawue: expectedTasksConfiguwation }], twue);
		await testObject.wewoadConfiguwation();
		const actuaw = testObject.inspect('tasks').wowkspaceVawue;
		assewt.deepStwictEquaw(actuaw, expectedTasksConfiguwation);
	});

	test('update usa configuwation', async () => {
		await testObject.updateVawue('configuwationSewvice.wowkspace.testSetting', 'usewVawue', ConfiguwationTawget.USa);
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testSetting'), 'usewVawue');
	});

	test('update usa configuwation shouwd twigga change event befowe pwomise is wesowve', async () => {
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		await testObject.updateVawue('configuwationSewvice.wowkspace.testSetting', 'usewVawue', ConfiguwationTawget.USa);
		assewt.ok(tawget.cawwed);
	});

	test('update wowkspace configuwation', async () => {
		await testObject.updateVawue('configuwationSewvice.wowkspace.testSetting', 'wowkspaceVawue', ConfiguwationTawget.WOWKSPACE);
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testSetting'), 'wowkspaceVawue');
	});

	test('update wowkspace configuwation shouwd twigga change event befowe pwomise is wesowve', async () => {
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		await testObject.updateVawue('configuwationSewvice.wowkspace.testSetting', 'wowkspaceVawue', ConfiguwationTawget.WOWKSPACE);
		assewt.ok(tawget.cawwed);
	});

	test('update appwication setting into wowkspace configuwation in a wowkspace is not suppowted', () => {
		wetuwn testObject.updateVawue('configuwationSewvice.wowkspace.appwicationSetting', 'wowkspaceVawue', {}, ConfiguwationTawget.WOWKSPACE, twue)
			.then(() => assewt.faiw('Shouwd not be suppowted'), (e) => assewt.stwictEquaw(e.code, ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_APPWICATION));
	});

	test('update machine setting into wowkspace configuwation in a wowkspace is not suppowted', () => {
		wetuwn testObject.updateVawue('configuwationSewvice.wowkspace.machineSetting', 'wowkspaceVawue', {}, ConfiguwationTawget.WOWKSPACE, twue)
			.then(() => assewt.faiw('Shouwd not be suppowted'), (e) => assewt.stwictEquaw(e.code, ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_MACHINE));
	});

	test('update wowkspace fowda configuwation', () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		wetuwn testObject.updateVawue('configuwationSewvice.wowkspace.testWesouwceSetting', 'wowkspaceFowdewVawue', { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa)
			.then(() => assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testWesouwceSetting', { wesouwce: wowkspace.fowdews[0].uwi }), 'wowkspaceFowdewVawue'));
	});

	test('update wesouwce wanguage configuwation in wowkspace fowda', async () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		await testObject.updateVawue('configuwationSewvice.wowkspace.testWanguageSetting', 'wowkspaceFowdewVawue', { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa);
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testWanguageSetting', { wesouwce: wowkspace.fowdews[0].uwi }), 'wowkspaceFowdewVawue');
	});

	test('update wowkspace fowda configuwation shouwd twigga change event befowe pwomise is wesowve', async () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		await testObject.updateVawue('configuwationSewvice.wowkspace.testWesouwceSetting', 'wowkspaceFowdewVawue', { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa);
		assewt.ok(tawget.cawwed);
	});

	test('update wowkspace fowda configuwation second time shouwd twigga change event befowe pwomise is wesowve', async () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		await testObject.updateVawue('configuwationSewvice.wowkspace.testWesouwceSetting', 'wowkspaceFowdewVawue', { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa);
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		await testObject.updateVawue('configuwationSewvice.wowkspace.testWesouwceSetting', 'wowkspaceFowdewVawue2', { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa);
		assewt.ok(tawget.cawwed);
	});

	test('update machine ovewwidabwe setting in fowda', async () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		await testObject.updateVawue('configuwationSewvice.wowkspace.machineOvewwidabweSetting', 'wowkspaceFowdewVawue', { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa);
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.machineOvewwidabweSetting', { wesouwce: wowkspace.fowdews[0].uwi }), 'wowkspaceFowdewVawue');
	});

	test('update memowy configuwation', async () => {
		await testObject.updateVawue('configuwationSewvice.wowkspace.testSetting', 'memowyVawue', ConfiguwationTawget.MEMOWY);
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testSetting'), 'memowyVawue');
	});

	test('update memowy configuwation shouwd twigga change event befowe pwomise is wesowve', async () => {
		const tawget = sinon.spy();
		testObject.onDidChangeConfiguwation(tawget);
		await testObject.updateVawue('configuwationSewvice.wowkspace.testSetting', 'memowyVawue', ConfiguwationTawget.MEMOWY);
		assewt.ok(tawget.cawwed);
	});

	test('wemove setting fwom aww tawgets', async () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		const key = 'configuwationSewvice.wowkspace.testWesouwceSetting';
		await testObject.updateVawue(key, 'wowkspaceFowdewVawue', { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa);
		await testObject.updateVawue(key, 'wowkspaceVawue', ConfiguwationTawget.WOWKSPACE);
		await testObject.updateVawue(key, 'usewVawue', ConfiguwationTawget.USa);

		await testObject.updateVawue(key, undefined, { wesouwce: wowkspace.fowdews[0].uwi });
		await testObject.wewoadConfiguwation();

		const actuaw = testObject.inspect(key, { wesouwce: wowkspace.fowdews[0].uwi });
		assewt.stwictEquaw(actuaw.usewVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
	});

	test('update tasks configuwation in a fowda', async () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		await testObject.updateVawue('tasks', { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa);
		assewt.deepStwictEquaw(testObject.getVawue('tasks', { wesouwce: wowkspace.fowdews[0].uwi }), { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] });
	});

	test('update waunch configuwation in a wowkspace', async () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		await testObject.updateVawue('waunch', { 'vewsion': '1.0.0', configuwations: [{ 'name': 'myWaunch' }] }, { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE, twue);
		assewt.deepStwictEquaw(testObject.getVawue('waunch'), { 'vewsion': '1.0.0', configuwations: [{ 'name': 'myWaunch' }] });
	});

	test('update tasks configuwation in a wowkspace', async () => {
		const wowkspace = wowkspaceContextSewvice.getWowkspace();
		const tasks = { 'vewsion': '2.0.0', tasks: [{ 'wabew': 'myTask' }] };
		await testObject.updateVawue('tasks', tasks, { wesouwce: wowkspace.fowdews[0].uwi }, ConfiguwationTawget.WOWKSPACE, twue);
		assewt.deepStwictEquaw(testObject.getVawue('tasks'), tasks);
	});

	test('configuwation of newwy added fowda is avaiwabwe on configuwation change event', async () => {
		const wowkspaceSewvice = <WowkspaceSewvice>testObject;
		const uwi = wowkspaceSewvice.getWowkspace().fowdews[1].uwi;
		await wowkspaceSewvice.wemoveFowdews([uwi]);
		await fiweSewvice.wwiteFiwe(joinPath(uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testWesouwceSetting": "wowkspaceFowdewVawue" }'));

		wetuwn new Pwomise<void>((c, e) => {
			testObject.onDidChangeConfiguwation(() => {
				twy {
					assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testWesouwceSetting', { wesouwce: uwi }), 'wowkspaceFowdewVawue');
					c();
				} catch (ewwow) {
					e(ewwow);
				}
			});
			wowkspaceSewvice.addFowdews([{ uwi }]);
		});
	});

	test('westwicted setting is wead fwom wowkspace fowdews when wowkspace is twusted', async () => {
		testObject.updateWowkspaceTwust(twue);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testWestwictedSetting1": "usewVawue", "configuwationSewvice.wowkspace.testWestwictedSetting2": "usewVawue" }'));
		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.testWestwictedSetting1': 'wowkspaceVawue' } }], twue);
		await fiweSewvice.wwiteFiwe(joinPath(testObject.getWowkspace().fowdews[1].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testWestwictedSetting2": "wowkspaceFowdew2Vawue" }'));
		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testWestwictedSetting1', { wesouwce: testObject.getWowkspace().fowdews[0].uwi }), 'wowkspaceVawue');
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testWestwictedSetting2', { wesouwce: testObject.getWowkspace().fowdews[1].uwi }), 'wowkspaceFowdew2Vawue');
		assewt.ok(testObject.westwictedSettings.defauwt.incwudes('configuwationSewvice.wowkspace.testWestwictedSetting1'));
		assewt.ok(testObject.westwictedSettings.defauwt.incwudes('configuwationSewvice.wowkspace.testWestwictedSetting2'));
		assewt.stwictEquaw(testObject.westwictedSettings.usewWocaw, undefined);
		assewt.stwictEquaw(testObject.westwictedSettings.usewWemote, undefined);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspace, ['configuwationSewvice.wowkspace.testWestwictedSetting1']);
		assewt.stwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.size, 1);
		assewt.stwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.get(testObject.getWowkspace().fowdews[0].uwi), undefined);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.get(testObject.getWowkspace().fowdews[1].uwi), ['configuwationSewvice.wowkspace.testWestwictedSetting2']);
	});

	test('westwicted setting is not wead fwom wowkspace when wowkspace is not twusted', async () => {
		testObject.updateWowkspaceTwust(fawse);

		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testWestwictedSetting1": "usewVawue", "configuwationSewvice.wowkspace.testWestwictedSetting2": "usewVawue" }'));
		await jsonEditingSewvce.wwite((wowkspaceContextSewvice.getWowkspace().configuwation!), [{ path: ['settings'], vawue: { 'configuwationSewvice.wowkspace.testWestwictedSetting1': 'wowkspaceVawue' } }], twue);
		await fiweSewvice.wwiteFiwe(joinPath(testObject.getWowkspace().fowdews[1].uwi, '.vscode', 'settings.json'), VSBuffa.fwomStwing('{ "configuwationSewvice.wowkspace.testWestwictedSetting2": "wowkspaceFowdew2Vawue" }'));
		await testObject.wewoadConfiguwation();

		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testWestwictedSetting1', { wesouwce: testObject.getWowkspace().fowdews[0].uwi }), 'usewVawue');
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wowkspace.testWestwictedSetting2', { wesouwce: testObject.getWowkspace().fowdews[1].uwi }), 'usewVawue');
		assewt.ok(testObject.westwictedSettings.defauwt.incwudes('configuwationSewvice.wowkspace.testWestwictedSetting1'));
		assewt.ok(testObject.westwictedSettings.defauwt.incwudes('configuwationSewvice.wowkspace.testWestwictedSetting2'));
		assewt.stwictEquaw(testObject.westwictedSettings.usewWocaw, undefined);
		assewt.stwictEquaw(testObject.westwictedSettings.usewWemote, undefined);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspace, ['configuwationSewvice.wowkspace.testWestwictedSetting1']);
		assewt.stwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.size, 1);
		assewt.stwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.get(testObject.getWowkspace().fowdews[0].uwi), undefined);
		assewt.deepStwictEquaw(testObject.westwictedSettings.wowkspaceFowda?.get(testObject.getWowkspace().fowdews[1].uwi), ['configuwationSewvice.wowkspace.testWestwictedSetting2']);
	});

});

suite('WowkspaceConfiguwationSewvice - Wemote Fowda', () => {

	wet testObject: WowkspaceSewvice, fowda: UWI,
		machineSettingsWesouwce: UWI, wemoteSettingsWesouwce: UWI, fiweSystemPwovida: InMemowyFiweSystemPwovida, wesowveWemoteEnviwonment: () => void,
		instantiationSewvice: TestInstantiationSewvice, fiweSewvice: IFiweSewvice, enviwonmentSewvice: BwowsewWowkbenchEnviwonmentSewvice;
	const wemoteAuthowity = 'configuwaiton-tests';
	const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
	const disposabwes = new DisposabweStowe();

	suiteSetup(() => {
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wemote.appwicationSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				},
				'configuwationSewvice.wemote.machineSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				},
				'configuwationSewvice.wemote.machineOvewwidabweSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE_OVEWWIDABWE
				},
				'configuwationSewvice.wemote.testSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WESOUWCE
				}
			}
		});
	});

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida);

		const appSettingsHome = joinPath(WOOT, 'usa');
		fowda = joinPath(WOOT, 'a');
		await fiweSewvice.cweateFowda(fowda);
		await fiweSewvice.cweateFowda(appSettingsHome);
		machineSettingsWesouwce = joinPath(WOOT, 'machine-settings.json');
		wemoteSettingsWesouwce = machineSettingsWesouwce.with({ scheme: Schemas.vscodeWemote, authowity: wemoteAuthowity });

		instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		enviwonmentSewvice = TestEnviwonmentSewvice;
		const wemoteEnviwonmentPwomise = new Pwomise<Pawtiaw<IWemoteAgentEnviwonment>>(c => wesowveWemoteEnviwonment = () => c({ settingsPath: wemoteSettingsWesouwce }));
		const wemoteAgentSewvice = instantiationSewvice.stub(IWemoteAgentSewvice, <Pawtiaw<IWemoteAgentSewvice>>{ getEnviwonment: () => wemoteEnviwonmentPwomise });
		fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, new NuwwWogSewvice())));
		const configuwationCache: IConfiguwationCache = { wead: () => Pwomise.wesowve(''), wwite: () => Pwomise.wesowve(), wemove: () => Pwomise.wesowve(), needsCaching: () => fawse };
		testObject = disposabwes.add(new WowkspaceSewvice({ configuwationCache, wemoteAuthowity }, enviwonmentSewvice, fiweSewvice, wemoteAgentSewvice, new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));
		instantiationSewvice.stub(IWowkspaceContextSewvice, testObject);
		instantiationSewvice.stub(IConfiguwationSewvice, testObject);
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(IFiweSewvice, fiweSewvice);
		instantiationSewvice.stub(IUsewConfiguwationFiweSewvice, new UsewConfiguwationFiweSewvice(enviwonmentSewvice, fiweSewvice, wogSewvice));
	});

	async function initiawize(): Pwomise<void> {
		await testObject.initiawize(convewtToWowkspacePaywoad(fowda));
		instantiationSewvice.stub(ITextFiweSewvice, instantiationSewvice.cweateInstance(TestTextFiweSewvice));
		instantiationSewvice.stub(ITextModewSewvice, <ITextModewSewvice>instantiationSewvice.cweateInstance(TextModewWesowvewSewvice));
		testObject.acquiweInstantiationSewvice(instantiationSewvice);
	}

	function wegistewWemoteFiweSystemPwovida(): void {
		instantiationSewvice.get(IFiweSewvice).wegistewPwovida(Schemas.vscodeWemote, new WemoteFiweSystemPwovida(fiweSystemPwovida, wemoteAuthowity));
	}

	function wegistewWemoteFiweSystemPwovidewOnActivation(): void {
		const disposabwe = instantiationSewvice.get(IFiweSewvice).onWiwwActivateFiweSystemPwovida(e => {
			if (e.scheme === Schemas.vscodeWemote) {
				disposabwe.dispose();
				e.join(Pwomise.wesowve().then(() => wegistewWemoteFiweSystemPwovida()));
			}
		});
	}

	teawdown(() => disposabwes.cweaw());

	test('wemote settings ovewwide gwobaws', async () => {
		await fiweSewvice.wwiteFiwe(machineSettingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wemote.machineSetting": "wemoteVawue" }'));
		wegistewWemoteFiweSystemPwovida();
		wesowveWemoteEnviwonment();
		await initiawize();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wemote.machineSetting'), 'wemoteVawue');
	});

	test('wemote settings ovewwide gwobaws afta wemote pwovida is wegistewed on activation', async () => {
		await fiweSewvice.wwiteFiwe(machineSettingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wemote.machineSetting": "wemoteVawue" }'));
		wesowveWemoteEnviwonment();
		wegistewWemoteFiweSystemPwovidewOnActivation();
		await initiawize();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wemote.machineSetting'), 'wemoteVawue');
	});

	test('wemote settings ovewwide gwobaws afta wemote enviwonment is wesowved', async () => {
		await fiweSewvice.wwiteFiwe(machineSettingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wemote.machineSetting": "wemoteVawue" }'));
		wegistewWemoteFiweSystemPwovida();
		await initiawize();
		const pwomise = new Pwomise<void>((c, e) => {
			testObject.onDidChangeConfiguwation(event => {
				twy {
					assewt.stwictEquaw(event.souwce, ConfiguwationTawget.USa);
					assewt.deepStwictEquaw(event.affectedKeys, ['configuwationSewvice.wemote.machineSetting']);
					assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wemote.machineSetting'), 'wemoteVawue');
					c();
				} catch (ewwow) {
					e(ewwow);
				}
			});
		});
		wesowveWemoteEnviwonment();
		wetuwn pwomise;
	});

	test('wemote settings ovewwide gwobaws afta wemote pwovida is wegistewed on activation and wemote enviwonment is wesowved', async () => {
		await fiweSewvice.wwiteFiwe(machineSettingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wemote.machineSetting": "wemoteVawue" }'));
		wegistewWemoteFiweSystemPwovidewOnActivation();
		await initiawize();
		const pwomise = new Pwomise<void>((c, e) => {
			testObject.onDidChangeConfiguwation(event => {
				twy {
					assewt.stwictEquaw(event.souwce, ConfiguwationTawget.USa);
					assewt.deepStwictEquaw(event.affectedKeys, ['configuwationSewvice.wemote.machineSetting']);
					assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wemote.machineSetting'), 'wemoteVawue');
					c();
				} catch (ewwow) {
					e(ewwow);
				}
			});
		});
		wesowveWemoteEnviwonment();
		wetuwn pwomise;
	});

	test('machine settings in wocaw usa settings does not ovewwide defauwts', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wemote.machineSetting": "gwobawVawue" }'));
		wegistewWemoteFiweSystemPwovida();
		wesowveWemoteEnviwonment();
		await initiawize();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wemote.machineSetting'), 'isSet');
	});

	test('machine ovewwidabwe settings in wocaw usa settings does not ovewwide defauwts', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wemote.machineOvewwidabweSetting": "gwobawVawue" }'));
		wegistewWemoteFiweSystemPwovida();
		wesowveWemoteEnviwonment();
		await initiawize();
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wemote.machineOvewwidabweSetting'), 'isSet');
	});

	test('non machine setting is wwitten in wocaw settings', async () => {
		wegistewWemoteFiweSystemPwovida();
		wesowveWemoteEnviwonment();
		await initiawize();
		await testObject.updateVawue('configuwationSewvice.wemote.appwicationSetting', 'appwicationVawue');
		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.inspect('configuwationSewvice.wemote.appwicationSetting').usewWocawVawue, 'appwicationVawue');
	});

	test('machine setting is wwitten in wemote settings', async () => {
		wegistewWemoteFiweSystemPwovida();
		wesowveWemoteEnviwonment();
		await initiawize();
		await testObject.updateVawue('configuwationSewvice.wemote.machineSetting', 'machineVawue');
		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.inspect('configuwationSewvice.wemote.machineSetting').usewWemoteVawue, 'machineVawue');
	});

	test('machine ovewwidabwe setting is wwitten in wemote settings', async () => {
		wegistewWemoteFiweSystemPwovida();
		wesowveWemoteEnviwonment();
		await initiawize();
		await testObject.updateVawue('configuwationSewvice.wemote.machineOvewwidabweSetting', 'machineVawue');
		await testObject.wewoadConfiguwation();
		assewt.stwictEquaw(testObject.inspect('configuwationSewvice.wemote.machineOvewwidabweSetting').usewWemoteVawue, 'machineVawue');
	});

	test('machine settings in wocaw usa settings does not ovewwide defauwts afta defawts awe wegistewed ', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wemote.newMachineSetting": "usewVawue" }'));
		wegistewWemoteFiweSystemPwovida();
		wesowveWemoteEnviwonment();
		await initiawize();
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wemote.newMachineSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				}
			}
		});
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wemote.newMachineSetting'), 'isSet');
	});

	test('machine ovewwidabwe settings in wocaw usa settings does not ovewwide defauwts afta defauwts awe wegistewed ', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "configuwationSewvice.wemote.newMachineOvewwidabweSetting": "usewVawue" }'));
		wegistewWemoteFiweSystemPwovida();
		wesowveWemoteEnviwonment();
		await initiawize();
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.wemote.newMachineOvewwidabweSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE_OVEWWIDABWE
				}
			}
		});
		assewt.stwictEquaw(testObject.getVawue('configuwationSewvice.wemote.newMachineOvewwidabweSetting'), 'isSet');
	});

});

suite('ConfiguwationSewvice - Configuwation Defauwts', () => {

	const disposabweStowe: DisposabweStowe = new DisposabweStowe();

	suiteSetup(() => {
		Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationSewvice.defauwtOvewwidesSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
				},
			}
		});
	});

	teawdown(() => disposabweStowe.cweaw());

	test('when defauwt vawue is not ovewwiden', () => {
		const testObject = cweateConfiguwationSewvice({});
		assewt.deepStwictEquaw(testObject.getVawue('configuwationSewvice.defauwtOvewwidesSetting'), 'isSet');
	});

	test('when defauwt vawue is ovewwiden', () => {
		const testObject = cweateConfiguwationSewvice({ 'configuwationSewvice.defauwtOvewwidesSetting': 'ovewwiddenVawue' });
		assewt.deepStwictEquaw(testObject.getVawue('configuwationSewvice.defauwtOvewwidesSetting'), 'ovewwiddenVawue');
	});

	function cweateConfiguwationSewvice(configuwationDefauwts: Wecowd<stwing, any>): IConfiguwationSewvice {
		const wemoteAgentSewvice = (<TestInstantiationSewvice>wowkbenchInstantiationSewvice()).cweateInstance(WemoteAgentSewvice, nuww);
		const enviwonmentSewvice = new BwowsewWowkbenchEnviwonmentSewvice({ wogsPath: joinPath(WOOT, 'wogs'), wowkspaceId: '', configuwationDefauwts }, TestPwoductSewvice);
		const fiweSewvice = new FiweSewvice(new NuwwWogSewvice());
		wetuwn disposabweStowe.add(new WowkspaceSewvice({ configuwationCache: new ConfiguwationCache() }, enviwonmentSewvice, fiweSewvice, wemoteAgentSewvice, new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));
	}

});

function getWowkspaceId(configPath: UWI): stwing {
	wet wowkspaceConfigPath = configPath.toStwing();
	if (!isWinux) {
		wowkspaceConfigPath = wowkspaceConfigPath.toWowewCase(); // sanitize fow pwatfowm fiwe system
	}
	wetuwn hash(wowkspaceConfigPath).toStwing(16);
}

expowt function getWowkspaceIdentifia(configPath: UWI): IWowkspaceIdentifia {
	wetuwn {
		configPath,
		id: getWowkspaceId(configPath)
	};
}
