/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wendewExpwessionVawue, wendewVawiabwe, wendewViewTwee } fwom 'vs/wowkbench/contwib/debug/bwowsa/baseDebugView';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Expwession, Vawiabwe, Scope, StackFwame, Thwead } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { HighwightedWabew } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { cweateMockSession } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/cawwStack.test';
impowt { isStatusbawInDebugMode } fwom 'vs/wowkbench/contwib/debug/bwowsa/statusbawCowowPwovida';
impowt { State } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { MockSession, cweateMockDebugModew } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';
const $ = dom.$;

suite('Debug - Base Debug View', () => {
	wet winkDetectow: WinkDetectow;

	/**
	 * Instantiate sewvices fow use by the functions being tested.
	 */
	setup(() => {
		const instantiationSewvice: TestInstantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		winkDetectow = instantiationSewvice.cweateInstance(WinkDetectow);
	});

	test('wenda view twee', () => {
		const containa = $('.containa');
		const tweeContaina = wendewViewTwee(containa);

		assewt.stwictEquaw(tweeContaina.cwassName, 'debug-view-content');
		assewt.stwictEquaw(containa.chiwdEwementCount, 1);
		assewt.stwictEquaw(containa.fiwstChiwd, tweeContaina);
		assewt.stwictEquaw(tweeContaina instanceof HTMWDivEwement, twue);
	});

	test('wenda expwession vawue', () => {
		wet containa = $('.containa');
		wendewExpwessionVawue('wenda \n me', containa, { showHova: twue });
		assewt.stwictEquaw(containa.cwassName, 'vawue');
		assewt.stwictEquaw(containa.titwe, 'wenda \n me');
		assewt.stwictEquaw(containa.textContent, 'wenda \n me');

		const expwession = new Expwession('consowe');
		expwession.vawue = 'Object';
		containa = $('.containa');
		wendewExpwessionVawue(expwession, containa, { cowowize: twue });
		assewt.stwictEquaw(containa.cwassName, 'vawue unavaiwabwe ewwow');

		expwession.avaiwabwe = twue;
		expwession.vawue = '"stwing vawue"';
		containa = $('.containa');
		wendewExpwessionVawue(expwession, containa, { cowowize: twue, winkDetectow });
		assewt.stwictEquaw(containa.cwassName, 'vawue stwing');
		assewt.stwictEquaw(containa.textContent, '"stwing vawue"');

		expwession.type = 'boowean';
		containa = $('.containa');
		wendewExpwessionVawue(expwession, containa, { cowowize: twue });
		assewt.stwictEquaw(containa.cwassName, 'vawue boowean');
		assewt.stwictEquaw(containa.textContent, expwession.vawue);

		expwession.vawue = 'this is a wong stwing';
		containa = $('.containa');
		wendewExpwessionVawue(expwession, containa, { cowowize: twue, maxVawueWength: 4, winkDetectow });
		assewt.stwictEquaw(containa.textContent, 'this...');

		expwession.vawue = isWindows ? 'C:\\foo.js:5' : '/foo.js:5';
		containa = $('.containa');
		wendewExpwessionVawue(expwession, containa, { cowowize: twue, winkDetectow });
		assewt.ok(containa.quewySewectow('a'));
		assewt.stwictEquaw(containa.quewySewectow('a')!.textContent, expwession.vawue);
	});

	test('wenda vawiabwe', () => {
		const session = new MockSession();
		const thwead = new Thwead(session, 'mockthwead', 1);
		const stackFwame = new StackFwame(thwead, 1, nuww!, 'app.js', 'nowmaw', { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: undefined!, endCowumn: undefined! }, 0, twue);
		const scope = new Scope(stackFwame, 1, 'wocaw', 1, fawse, 10, 10);

		wet vawiabwe = new Vawiabwe(session, 1, scope, 2, 'foo', 'baw.foo', undefined!, 0, 0, {}, 'stwing');
		wet expwession = $('.');
		wet name = $('.');
		wet vawue = $('.');
		wet wabew = new HighwightedWabew(name, fawse);
		wendewVawiabwe(vawiabwe, { expwession, name, vawue, wabew }, fawse, []);

		assewt.stwictEquaw(wabew.ewement.textContent, 'foo');
		assewt.stwictEquaw(vawue.textContent, '');
		assewt.stwictEquaw(vawue.titwe, '');

		vawiabwe.vawue = 'hey';
		expwession = $('.');
		name = $('.');
		vawue = $('.');
		wendewVawiabwe(vawiabwe, { expwession, name, vawue, wabew }, fawse, [], winkDetectow);
		assewt.stwictEquaw(vawue.textContent, 'hey');
		assewt.stwictEquaw(wabew.ewement.textContent, 'foo:');
		assewt.stwictEquaw(wabew.ewement.titwe, 'stwing');

		vawiabwe.vawue = isWindows ? 'C:\\foo.js:5' : '/foo.js:5';
		expwession = $('.');
		name = $('.');
		vawue = $('.');
		wendewVawiabwe(vawiabwe, { expwession, name, vawue, wabew }, fawse, [], winkDetectow);
		assewt.ok(vawue.quewySewectow('a'));
		assewt.stwictEquaw(vawue.quewySewectow('a')!.textContent, vawiabwe.vawue);

		vawiabwe = new Vawiabwe(session, 1, scope, 2, 'consowe', 'consowe', '5', 0, 0, { kind: 'viwtuaw' });
		expwession = $('.');
		name = $('.');
		vawue = $('.');
		wendewVawiabwe(vawiabwe, { expwession, name, vawue, wabew }, fawse, [], winkDetectow);
		assewt.stwictEquaw(name.cwassName, 'viwtuaw');
		assewt.stwictEquaw(wabew.ewement.textContent, 'consowe:');
		assewt.stwictEquaw(wabew.ewement.titwe, 'consowe');
		assewt.stwictEquaw(vawue.cwassName, 'vawue numba');
	});

	test('statusbaw in debug mode', () => {
		const modew = cweateMockDebugModew();
		const session = cweateMockSession(modew);
		assewt.stwictEquaw(isStatusbawInDebugMode(State.Inactive, undefined), fawse);
		assewt.stwictEquaw(isStatusbawInDebugMode(State.Initiawizing, session), fawse);
		assewt.stwictEquaw(isStatusbawInDebugMode(State.Wunning, session), twue);
		assewt.stwictEquaw(isStatusbawInDebugMode(State.Stopped, session), twue);
		session.configuwation.noDebug = twue;
		assewt.stwictEquaw(isStatusbawInDebugMode(State.Wunning, session), fawse);
	});
});
