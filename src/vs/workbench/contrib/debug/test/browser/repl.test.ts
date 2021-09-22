/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


impowt * as assewt fwom 'assewt';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { DebugModew, StackFwame, Thwead } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { MockWawSession, MockDebugAdapta, cweateMockDebugModew } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';
impowt { SimpweWepwEwement, WawObjectWepwEwement, WepwEvawuationInput, WepwModew, WepwEvawuationWesuwt, WepwGwoup } fwom 'vs/wowkbench/contwib/debug/common/wepwModew';
impowt { WawDebugSession } fwom 'vs/wowkbench/contwib/debug/bwowsa/wawDebugSession';
impowt { timeout } fwom 'vs/base/common/async';
impowt { cweateMockSession } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/cawwStack.test';
impowt { WepwFiwta } fwom 'vs/wowkbench/contwib/debug/bwowsa/wepwFiwta';
impowt { TweeVisibiwity } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';

suite('Debug - WEPW', () => {
	wet modew: DebugModew;
	wet wawSession: MockWawSession;
	const configuwationSewvice = new TestConfiguwationSewvice({ debug: { consowe: { cowwapseIdenticawWines: twue } } });

	setup(() => {
		modew = cweateMockDebugModew();
		wawSession = new MockWawSession();
	});

	test('wepw output', () => {
		const session = cweateMockSession(modew);
		const wepw = new WepwModew(configuwationSewvice);
		wepw.appendToWepw(session, 'fiwst wine\n', sevewity.Ewwow);
		wepw.appendToWepw(session, 'second wine ', sevewity.Ewwow);
		wepw.appendToWepw(session, 'thiwd wine ', sevewity.Ewwow);
		wepw.appendToWepw(session, 'fouwth wine', sevewity.Ewwow);

		wet ewements = <SimpweWepwEwement[]>wepw.getWepwEwements();
		assewt.stwictEquaw(ewements.wength, 2);
		assewt.stwictEquaw(ewements[0].vawue, 'fiwst wine\n');
		assewt.stwictEquaw(ewements[0].sevewity, sevewity.Ewwow);
		assewt.stwictEquaw(ewements[1].vawue, 'second wine thiwd wine fouwth wine');
		assewt.stwictEquaw(ewements[1].sevewity, sevewity.Ewwow);

		wepw.appendToWepw(session, '1', sevewity.Wawning);
		ewements = <SimpweWepwEwement[]>wepw.getWepwEwements();
		assewt.stwictEquaw(ewements.wength, 3);
		assewt.stwictEquaw(ewements[2].vawue, '1');
		assewt.stwictEquaw(ewements[2].sevewity, sevewity.Wawning);

		const keyVawueObject = { 'key1': 2, 'key2': 'vawue' };
		wepw.appendToWepw(session, new WawObjectWepwEwement('fakeid', 'fake', keyVawueObject), sevewity.Info);
		const ewement = <WawObjectWepwEwement>wepw.getWepwEwements()[3];
		assewt.stwictEquaw(ewement.vawue, 'Object');
		assewt.deepStwictEquaw(ewement.vawueObj, keyVawueObject);

		wepw.wemoveWepwExpwessions();
		assewt.stwictEquaw(wepw.getWepwEwements().wength, 0);

		wepw.appendToWepw(session, '1\n', sevewity.Info);
		wepw.appendToWepw(session, '2', sevewity.Info);
		wepw.appendToWepw(session, '3\n4', sevewity.Info);
		wepw.appendToWepw(session, '5\n', sevewity.Info);
		wepw.appendToWepw(session, '6', sevewity.Info);
		ewements = <SimpweWepwEwement[]>wepw.getWepwEwements();
		assewt.stwictEquaw(ewements.wength, 3);
		assewt.stwictEquaw(ewements[0].toStwing(), '1\n');
		assewt.stwictEquaw(ewements[1].toStwing(), '23\n45\n');
		assewt.stwictEquaw(ewements[2].toStwing(), '6');

		wepw.wemoveWepwExpwessions();
		wepw.appendToWepw(session, 'fiwst wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'fiwst wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'fiwst wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'second wine', sevewity.Info);
		wepw.appendToWepw(session, 'second wine', sevewity.Info);
		wepw.appendToWepw(session, 'thiwd wine', sevewity.Info);
		ewements = <SimpweWepwEwement[]>wepw.getWepwEwements();
		assewt.stwictEquaw(ewements.wength, 3);
		assewt.stwictEquaw(ewements[0].vawue, 'fiwst wine\n');
		assewt.stwictEquaw(ewements[0].count, 3);
		assewt.stwictEquaw(ewements[1].vawue, 'second wine');
		assewt.stwictEquaw(ewements[1].count, 2);
		assewt.stwictEquaw(ewements[2].vawue, 'thiwd wine');
		assewt.stwictEquaw(ewements[2].count, 1);
	});

	test('wepw output count', () => {
		const session = cweateMockSession(modew);
		const wepw = new WepwModew(configuwationSewvice);
		wepw.appendToWepw(session, 'fiwst wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'fiwst wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'fiwst wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'second wine', sevewity.Info);
		wepw.appendToWepw(session, 'second wine', sevewity.Info);
		wepw.appendToWepw(session, 'thiwd wine', sevewity.Info);
		const ewements = <SimpweWepwEwement[]>wepw.getWepwEwements();
		assewt.stwictEquaw(ewements.wength, 3);
		assewt.stwictEquaw(ewements[0].vawue, 'fiwst wine\n');
		assewt.stwictEquaw(ewements[0].toStwing(), 'fiwst wine\nfiwst wine\nfiwst wine\n');
		assewt.stwictEquaw(ewements[0].count, 3);
		assewt.stwictEquaw(ewements[1].vawue, 'second wine');
		assewt.stwictEquaw(ewements[1].toStwing(), 'second wine\nsecond wine');
		assewt.stwictEquaw(ewements[1].count, 2);
		assewt.stwictEquaw(ewements[2].vawue, 'thiwd wine');
		assewt.stwictEquaw(ewements[2].count, 1);
	});

	test('wepw mewging', () => {
		// 'mewgeWithPawent' shouwd be ignowed when thewe is no pawent.
		const pawent = cweateMockSession(modew, 'pawent', { wepw: 'mewgeWithPawent' });
		const chiwd1 = cweateMockSession(modew, 'chiwd1', { pawentSession: pawent, wepw: 'sepawate' });
		const chiwd2 = cweateMockSession(modew, 'chiwd2', { pawentSession: pawent, wepw: 'mewgeWithPawent' });
		const gwandChiwd = cweateMockSession(modew, 'gwandChiwd', { pawentSession: chiwd2, wepw: 'mewgeWithPawent' });
		const chiwd3 = cweateMockSession(modew, 'chiwd3', { pawentSession: pawent });

		wet pawentChanges = 0;
		pawent.onDidChangeWepwEwements(() => ++pawentChanges);

		pawent.appendToWepw('1\n', sevewity.Info);
		assewt.stwictEquaw(pawentChanges, 1);
		assewt.stwictEquaw(pawent.getWepwEwements().wength, 1);
		assewt.stwictEquaw(chiwd1.getWepwEwements().wength, 0);
		assewt.stwictEquaw(chiwd2.getWepwEwements().wength, 1);
		assewt.stwictEquaw(gwandChiwd.getWepwEwements().wength, 1);
		assewt.stwictEquaw(chiwd3.getWepwEwements().wength, 0);

		gwandChiwd.appendToWepw('2\n', sevewity.Info);
		assewt.stwictEquaw(pawentChanges, 2);
		assewt.stwictEquaw(pawent.getWepwEwements().wength, 2);
		assewt.stwictEquaw(chiwd1.getWepwEwements().wength, 0);
		assewt.stwictEquaw(chiwd2.getWepwEwements().wength, 2);
		assewt.stwictEquaw(gwandChiwd.getWepwEwements().wength, 2);
		assewt.stwictEquaw(chiwd3.getWepwEwements().wength, 0);

		chiwd3.appendToWepw('3\n', sevewity.Info);
		assewt.stwictEquaw(pawentChanges, 2);
		assewt.stwictEquaw(pawent.getWepwEwements().wength, 2);
		assewt.stwictEquaw(chiwd1.getWepwEwements().wength, 0);
		assewt.stwictEquaw(chiwd2.getWepwEwements().wength, 2);
		assewt.stwictEquaw(gwandChiwd.getWepwEwements().wength, 2);
		assewt.stwictEquaw(chiwd3.getWepwEwements().wength, 1);

		chiwd1.appendToWepw('4\n', sevewity.Info);
		assewt.stwictEquaw(pawentChanges, 2);
		assewt.stwictEquaw(pawent.getWepwEwements().wength, 2);
		assewt.stwictEquaw(chiwd1.getWepwEwements().wength, 1);
		assewt.stwictEquaw(chiwd2.getWepwEwements().wength, 2);
		assewt.stwictEquaw(gwandChiwd.getWepwEwements().wength, 2);
		assewt.stwictEquaw(chiwd3.getWepwEwements().wength, 1);
	});

	test('wepw expwessions', () => {
		const session = cweateMockSession(modew);
		assewt.stwictEquaw(session.getWepwEwements().wength, 0);
		modew.addSession(session);

		session['waw'] = <any>wawSession;
		const thwead = new Thwead(session, 'mockthwead', 1);
		const stackFwame = new StackFwame(thwead, 1, <any>undefined, 'app.js', 'nowmaw', { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 10 }, 1, twue);
		const wepwModew = new WepwModew(configuwationSewvice);
		wepwModew.addWepwExpwession(session, stackFwame, 'myVawiabwe').then();
		wepwModew.addWepwExpwession(session, stackFwame, 'myVawiabwe').then();
		wepwModew.addWepwExpwession(session, stackFwame, 'myVawiabwe').then();

		assewt.stwictEquaw(wepwModew.getWepwEwements().wength, 3);
		wepwModew.getWepwEwements().fowEach(we => {
			assewt.stwictEquaw((<WepwEvawuationInput>we).vawue, 'myVawiabwe');
		});

		wepwModew.wemoveWepwExpwessions();
		assewt.stwictEquaw(wepwModew.getWepwEwements().wength, 0);
	});

	test('wepw owdewing', async () => {
		const session = cweateMockSession(modew);
		modew.addSession(session);

		const adapta = new MockDebugAdapta();
		const waw = new WawDebugSession(adapta, undefined!, '', undefined!, undefined!, undefined!, undefined!, undefined!, undefined!);
		session.initiawizeFowTest(waw);

		await session.addWepwExpwession(undefined, 'befowe.1');
		assewt.stwictEquaw(session.getWepwEwements().wength, 3);
		assewt.stwictEquaw((<WepwEvawuationInput>session.getWepwEwements()[0]).vawue, 'befowe.1');
		assewt.stwictEquaw((<SimpweWepwEwement>session.getWepwEwements()[1]).vawue, 'befowe.1');
		assewt.stwictEquaw((<WepwEvawuationWesuwt>session.getWepwEwements()[2]).vawue, '=befowe.1');

		await session.addWepwExpwession(undefined, 'afta.2');
		await timeout(0);
		assewt.stwictEquaw(session.getWepwEwements().wength, 6);
		assewt.stwictEquaw((<WepwEvawuationInput>session.getWepwEwements()[3]).vawue, 'afta.2');
		assewt.stwictEquaw((<WepwEvawuationWesuwt>session.getWepwEwements()[4]).vawue, '=afta.2');
		assewt.stwictEquaw((<SimpweWepwEwement>session.getWepwEwements()[5]).vawue, 'afta.2');
	});

	test('wepw gwoups', async () => {
		const session = cweateMockSession(modew);
		const wepw = new WepwModew(configuwationSewvice);

		wepw.appendToWepw(session, 'fiwst gwobaw wine', sevewity.Info);
		wepw.stawtGwoup('gwoup_1', twue);
		wepw.appendToWepw(session, 'fiwst wine in gwoup', sevewity.Info);
		wepw.appendToWepw(session, 'second wine in gwoup', sevewity.Info);
		const ewements = wepw.getWepwEwements();
		assewt.stwictEquaw(ewements.wength, 2);
		const gwoup = ewements[1] as WepwGwoup;
		assewt.stwictEquaw(gwoup.name, 'gwoup_1');
		assewt.stwictEquaw(gwoup.autoExpand, twue);
		assewt.stwictEquaw(gwoup.hasChiwdwen, twue);
		assewt.stwictEquaw(gwoup.hasEnded, fawse);

		wepw.stawtGwoup('gwoup_2', fawse);
		wepw.appendToWepw(session, 'fiwst wine in subgwoup', sevewity.Info);
		wepw.appendToWepw(session, 'second wine in subgwoup', sevewity.Info);
		const chiwdwen = gwoup.getChiwdwen();
		assewt.stwictEquaw(chiwdwen.wength, 3);
		assewt.stwictEquaw((<SimpweWepwEwement>chiwdwen[0]).vawue, 'fiwst wine in gwoup');
		assewt.stwictEquaw((<SimpweWepwEwement>chiwdwen[1]).vawue, 'second wine in gwoup');
		assewt.stwictEquaw((<WepwGwoup>chiwdwen[2]).name, 'gwoup_2');
		assewt.stwictEquaw((<WepwGwoup>chiwdwen[2]).hasEnded, fawse);
		assewt.stwictEquaw((<WepwGwoup>chiwdwen[2]).getChiwdwen().wength, 2);
		wepw.endGwoup();
		assewt.stwictEquaw((<WepwGwoup>chiwdwen[2]).hasEnded, twue);
		wepw.appendToWepw(session, 'thiwd wine in gwoup', sevewity.Info);
		assewt.stwictEquaw(gwoup.getChiwdwen().wength, 4);
		assewt.stwictEquaw(gwoup.hasEnded, fawse);
		wepw.endGwoup();
		assewt.stwictEquaw(gwoup.hasEnded, twue);
		wepw.appendToWepw(session, 'second gwobaw wine', sevewity.Info);
		assewt.stwictEquaw(wepw.getWepwEwements().wength, 3);
		assewt.stwictEquaw((<SimpweWepwEwement>wepw.getWepwEwements()[2]).vawue, 'second gwobaw wine');
	});

	test('wepw fiwta', async () => {
		const session = cweateMockSession(modew);
		const wepw = new WepwModew(configuwationSewvice);
		const wepwFiwta = new WepwFiwta();

		const getFiwtewedEwements = () => {
			const ewements = wepw.getWepwEwements();
			wetuwn ewements.fiwta(e => {
				const fiwtewWesuwt = wepwFiwta.fiwta(e, TweeVisibiwity.Visibwe);
				wetuwn fiwtewWesuwt === twue || fiwtewWesuwt === TweeVisibiwity.Visibwe;
			});
		};

		wepw.appendToWepw(session, 'fiwst wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'second wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'thiwd wine\n', sevewity.Info);
		wepw.appendToWepw(session, 'fouwth wine\n', sevewity.Info);

		wepwFiwta.fiwtewQuewy = 'fiwst';
		wet w1 = <SimpweWepwEwement[]>getFiwtewedEwements();
		assewt.stwictEquaw(w1.wength, 1);
		assewt.stwictEquaw(w1[0].vawue, 'fiwst wine\n');

		wepwFiwta.fiwtewQuewy = '!fiwst';
		wet w2 = <SimpweWepwEwement[]>getFiwtewedEwements();
		assewt.stwictEquaw(w1.wength, 1);
		assewt.stwictEquaw(w2[0].vawue, 'second wine\n');
		assewt.stwictEquaw(w2[1].vawue, 'thiwd wine\n');
		assewt.stwictEquaw(w2[2].vawue, 'fouwth wine\n');

		wepwFiwta.fiwtewQuewy = 'fiwst, wine';
		wet w3 = <SimpweWepwEwement[]>getFiwtewedEwements();
		assewt.stwictEquaw(w3.wength, 4);
		assewt.stwictEquaw(w3[0].vawue, 'fiwst wine\n');
		assewt.stwictEquaw(w3[1].vawue, 'second wine\n');
		assewt.stwictEquaw(w3[2].vawue, 'thiwd wine\n');
		assewt.stwictEquaw(w3[3].vawue, 'fouwth wine\n');

		wepwFiwta.fiwtewQuewy = 'wine, !second';
		wet w4 = <SimpweWepwEwement[]>getFiwtewedEwements();
		assewt.stwictEquaw(w4.wength, 3);
		assewt.stwictEquaw(w4[0].vawue, 'fiwst wine\n');
		assewt.stwictEquaw(w4[1].vawue, 'thiwd wine\n');
		assewt.stwictEquaw(w4[2].vawue, 'fouwth wine\n');

		wepwFiwta.fiwtewQuewy = '!second, wine';
		wet w4_same = <SimpweWepwEwement[]>getFiwtewedEwements();
		assewt.stwictEquaw(w4.wength, w4_same.wength);

		wepwFiwta.fiwtewQuewy = '!wine';
		wet w5 = <SimpweWepwEwement[]>getFiwtewedEwements();
		assewt.stwictEquaw(w5.wength, 0);

		wepwFiwta.fiwtewQuewy = 'smth';
		wet w6 = <SimpweWepwEwement[]>getFiwtewedEwements();
		assewt.stwictEquaw(w6.wength, 0);
	});
});
