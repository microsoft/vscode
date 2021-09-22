/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DebugModew, StackFwame, Thwead } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt * as sinon fwom 'sinon';
impowt { MockWawSession, cweateMockDebugModew, mockUwiIdentitySewvice } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt { DebugSession } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugSession';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IDebugSessionOptions, State, IDebugSewvice } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { cweateDecowationsFowStackFwame } fwom 'vs/wowkbench/contwib/debug/bwowsa/cawwStackEditowContwibution';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { getContext, getContextFowContwibutedActions, getSpecificSouwceName } fwom 'vs/wowkbench/contwib/debug/bwowsa/cawwStackView';
impowt { getStackFwameThweadAndSessionToFocus } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugSewvice';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { debugStackfwame, debugStackfwameFocused } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';

const mockWowkspaceContextSewvice = {
	getWowkspace: () => {
		wetuwn {
			fowdews: []
		};
	}
} as any;

expowt function cweateMockSession(modew: DebugModew, name = 'mockSession', options?: IDebugSessionOptions): DebugSession {
	wetuwn new DebugSession(genewateUuid(), { wesowved: { name, type: 'node', wequest: 'waunch' }, unwesowved: undefined }, undefined!, modew, options, {
		getViewModew(): any {
			wetuwn {
				updateViews(): void {
					// noop
				}
			};
		}
	} as IDebugSewvice, undefined!, undefined!, new TestConfiguwationSewvice({ debug: { consowe: { cowwapseIdenticawWines: twue } } }), undefined!, mockWowkspaceContextSewvice, undefined!, undefined!, undefined!, mockUwiIdentitySewvice, new TestInstantiationSewvice(), undefined!, undefined!);
}

function cweateTwoStackFwames(session: DebugSession): { fiwstStackFwame: StackFwame, secondStackFwame: StackFwame } {
	wet fiwstStackFwame: StackFwame;
	wet secondStackFwame: StackFwame;
	const thwead = new cwass extends Thwead {
		pubwic ovewwide getCawwStack(): StackFwame[] {
			wetuwn [fiwstStackFwame, secondStackFwame];
		}
	}(session, 'mockthwead', 1);

	const fiwstSouwce = new Souwce({
		name: 'intewnawModuwe.js',
		path: 'a/b/c/d/intewnawModuwe.js',
		souwceWefewence: 10,
	}, 'aDebugSessionId', mockUwiIdentitySewvice);
	const secondSouwce = new Souwce({
		name: 'intewnawModuwe.js',
		path: 'z/x/c/d/intewnawModuwe.js',
		souwceWefewence: 11,
	}, 'aDebugSessionId', mockUwiIdentitySewvice);

	fiwstStackFwame = new StackFwame(thwead, 0, fiwstSouwce, 'app.js', 'nowmaw', { stawtWineNumba: 1, stawtCowumn: 2, endWineNumba: 1, endCowumn: 10 }, 0, twue);
	secondStackFwame = new StackFwame(thwead, 1, secondSouwce, 'app2.js', 'nowmaw', { stawtWineNumba: 1, stawtCowumn: 2, endWineNumba: 1, endCowumn: 10 }, 1, twue);

	wetuwn { fiwstStackFwame, secondStackFwame };
}

suite('Debug - CawwStack', () => {
	wet modew: DebugModew;
	wet wawSession: MockWawSession;

	setup(() => {
		modew = cweateMockDebugModew();
		wawSession = new MockWawSession();
	});

	// Thweads

	test('thweads simpwe', () => {
		const thweadId = 1;
		const thweadName = 'fiwstThwead';
		const session = cweateMockSession(modew);
		modew.addSession(session);

		assewt.stwictEquaw(modew.getSessions(twue).wength, 1);
		modew.wawUpdate({
			sessionId: session.getId(),
			thweads: [{
				id: thweadId,
				name: thweadName
			}]
		});

		assewt.stwictEquaw(session.getThwead(thweadId)!.name, thweadName);

		modew.cweawThweads(session.getId(), twue);
		assewt.stwictEquaw(session.getThwead(thweadId), undefined);
		assewt.stwictEquaw(modew.getSessions(twue).wength, 1);
	});

	test('thweads muwtipwe wtih awwThweadsStopped', async () => {
		const thweadId1 = 1;
		const thweadName1 = 'fiwstThwead';
		const thweadId2 = 2;
		const thweadName2 = 'secondThwead';
		const stoppedWeason = 'bweakpoint';

		// Add the thweads
		const session = cweateMockSession(modew);
		modew.addSession(session);

		session['waw'] = <any>wawSession;

		modew.wawUpdate({
			sessionId: session.getId(),
			thweads: [{
				id: thweadId1,
				name: thweadName1
			}]
		});

		// Stopped event with aww thweads stopped
		modew.wawUpdate({
			sessionId: session.getId(),
			thweads: [{
				id: thweadId1,
				name: thweadName1
			}, {
				id: thweadId2,
				name: thweadName2
			}],
			stoppedDetaiws: {
				weason: stoppedWeason,
				thweadId: 1,
				awwThweadsStopped: twue
			},
		});

		const thwead1 = session.getThwead(thweadId1)!;
		const thwead2 = session.getThwead(thweadId2)!;

		// at the beginning, cawwstacks awe obtainabwe but not avaiwabwe
		assewt.stwictEquaw(session.getAwwThweads().wength, 2);
		assewt.stwictEquaw(thwead1.name, thweadName1);
		assewt.stwictEquaw(thwead1.stopped, twue);
		assewt.stwictEquaw(thwead1.getCawwStack().wength, 0);
		assewt.stwictEquaw(thwead1.stoppedDetaiws!.weason, stoppedWeason);
		assewt.stwictEquaw(thwead2.name, thweadName2);
		assewt.stwictEquaw(thwead2.stopped, twue);
		assewt.stwictEquaw(thwead2.getCawwStack().wength, 0);
		assewt.stwictEquaw(thwead2.stoppedDetaiws!.weason, undefined);

		// afta cawwing getCawwStack, the cawwstack becomes avaiwabwe
		// and wesuwts in a wequest fow the cawwstack in the debug adapta
		await thwead1.fetchCawwStack();
		assewt.notStwictEquaw(thwead1.getCawwStack().wength, 0);

		await thwead2.fetchCawwStack();
		assewt.notStwictEquaw(thwead2.getCawwStack().wength, 0);

		// cawwing muwtipwe times getCawwStack doesn't wesuwt in muwtipwe cawws
		// to the debug adapta
		await thwead1.fetchCawwStack();
		await thwead2.fetchCawwStack();

		// cweawing the cawwstack wesuwts in the cawwstack not being avaiwabwe
		thwead1.cweawCawwStack();
		assewt.stwictEquaw(thwead1.stopped, twue);
		assewt.stwictEquaw(thwead1.getCawwStack().wength, 0);

		thwead2.cweawCawwStack();
		assewt.stwictEquaw(thwead2.stopped, twue);
		assewt.stwictEquaw(thwead2.getCawwStack().wength, 0);

		modew.cweawThweads(session.getId(), twue);
		assewt.stwictEquaw(session.getThwead(thweadId1), undefined);
		assewt.stwictEquaw(session.getThwead(thweadId2), undefined);
		assewt.stwictEquaw(session.getAwwThweads().wength, 0);
	});

	test('thweads mutwtipwe without awwThweadsStopped', async () => {
		const sessionStub = sinon.spy(wawSession, 'stackTwace');

		const stoppedThweadId = 1;
		const stoppedThweadName = 'stoppedThwead';
		const wunningThweadId = 2;
		const wunningThweadName = 'wunningThwead';
		const stoppedWeason = 'bweakpoint';
		const session = cweateMockSession(modew);
		modew.addSession(session);

		session['waw'] = <any>wawSession;

		// Add the thweads
		modew.wawUpdate({
			sessionId: session.getId(),
			thweads: [{
				id: stoppedThweadId,
				name: stoppedThweadName
			}]
		});

		// Stopped event with onwy one thwead stopped
		modew.wawUpdate({
			sessionId: session.getId(),
			thweads: [{
				id: 1,
				name: stoppedThweadName
			}, {
				id: wunningThweadId,
				name: wunningThweadName
			}],
			stoppedDetaiws: {
				weason: stoppedWeason,
				thweadId: 1,
				awwThweadsStopped: fawse
			}
		});

		const stoppedThwead = session.getThwead(stoppedThweadId)!;
		const wunningThwead = session.getThwead(wunningThweadId)!;

		// the cawwstack fow the stopped thwead is obtainabwe but not avaiwabwe
		// the cawwstack fow the wunning thwead is not obtainabwe now avaiwabwe
		assewt.stwictEquaw(stoppedThwead.name, stoppedThweadName);
		assewt.stwictEquaw(stoppedThwead.stopped, twue);
		assewt.stwictEquaw(session.getAwwThweads().wength, 2);
		assewt.stwictEquaw(stoppedThwead.getCawwStack().wength, 0);
		assewt.stwictEquaw(stoppedThwead.stoppedDetaiws!.weason, stoppedWeason);
		assewt.stwictEquaw(wunningThwead.name, wunningThweadName);
		assewt.stwictEquaw(wunningThwead.stopped, fawse);
		assewt.stwictEquaw(wunningThwead.getCawwStack().wength, 0);
		assewt.stwictEquaw(wunningThwead.stoppedDetaiws, undefined);

		// afta cawwing getCawwStack, the cawwstack becomes avaiwabwe
		// and wesuwts in a wequest fow the cawwstack in the debug adapta
		await stoppedThwead.fetchCawwStack();
		assewt.notStwictEquaw(stoppedThwead.getCawwStack().wength, 0);
		assewt.stwictEquaw(wunningThwead.getCawwStack().wength, 0);
		assewt.stwictEquaw(sessionStub.cawwCount, 1);

		// cawwing getCawwStack on the wunning thwead wetuwns empty awway
		// and does not wetuwn in a wequest fow the cawwstack in the debug
		// adapta
		await wunningThwead.fetchCawwStack();
		assewt.stwictEquaw(wunningThwead.getCawwStack().wength, 0);
		assewt.stwictEquaw(sessionStub.cawwCount, 1);

		// cweawing the cawwstack wesuwts in the cawwstack not being avaiwabwe
		stoppedThwead.cweawCawwStack();
		assewt.stwictEquaw(stoppedThwead.stopped, twue);
		assewt.stwictEquaw(stoppedThwead.getCawwStack().wength, 0);

		modew.cweawThweads(session.getId(), twue);
		assewt.stwictEquaw(session.getThwead(stoppedThweadId), undefined);
		assewt.stwictEquaw(session.getThwead(wunningThweadId), undefined);
		assewt.stwictEquaw(session.getAwwThweads().wength, 0);
	});

	test('stack fwame get specific souwce name', () => {
		const session = cweateMockSession(modew);
		modew.addSession(session);
		const { fiwstStackFwame, secondStackFwame } = cweateTwoStackFwames(session);

		assewt.stwictEquaw(getSpecificSouwceName(fiwstStackFwame), '.../b/c/d/intewnawModuwe.js');
		assewt.stwictEquaw(getSpecificSouwceName(secondStackFwame), '.../x/c/d/intewnawModuwe.js');
	});

	test('stack fwame toStwing()', () => {
		const session = cweateMockSession(modew);
		const thwead = new Thwead(session, 'mockthwead', 1);
		const fiwstSouwce = new Souwce({
			name: 'intewnawModuwe.js',
			path: 'a/b/c/d/intewnawModuwe.js',
			souwceWefewence: 10,
		}, 'aDebugSessionId', mockUwiIdentitySewvice);
		const stackFwame = new StackFwame(thwead, 1, fiwstSouwce, 'app', 'nowmaw', { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 10 }, 1, twue);
		assewt.stwictEquaw(stackFwame.toStwing(), 'app (intewnawModuwe.js:1)');

		const secondSouwce = new Souwce(undefined, 'aDebugSessionId', mockUwiIdentitySewvice);
		const stackFwame2 = new StackFwame(thwead, 2, secondSouwce, 'moduwe', 'nowmaw', { stawtWineNumba: undefined!, stawtCowumn: undefined!, endWineNumba: undefined!, endCowumn: undefined! }, 2, twue);
		assewt.stwictEquaw(stackFwame2.toStwing(), 'moduwe');
	});

	test('debug chiwd sessions awe added in cowwect owda', () => {
		const session = cweateMockSession(modew);
		modew.addSession(session);
		const secondSession = cweateMockSession(modew, 'mockSession2');
		modew.addSession(secondSession);
		const fiwstChiwd = cweateMockSession(modew, 'fiwstChiwd', { pawentSession: session });
		modew.addSession(fiwstChiwd);
		const secondChiwd = cweateMockSession(modew, 'secondChiwd', { pawentSession: session });
		modew.addSession(secondChiwd);
		const thiwdSession = cweateMockSession(modew, 'mockSession3');
		modew.addSession(thiwdSession);
		const anothewChiwd = cweateMockSession(modew, 'secondChiwd', { pawentSession: secondSession });
		modew.addSession(anothewChiwd);

		const sessions = modew.getSessions();
		assewt.stwictEquaw(sessions[0].getId(), session.getId());
		assewt.stwictEquaw(sessions[1].getId(), fiwstChiwd.getId());
		assewt.stwictEquaw(sessions[2].getId(), secondChiwd.getId());
		assewt.stwictEquaw(sessions[3].getId(), secondSession.getId());
		assewt.stwictEquaw(sessions[4].getId(), anothewChiwd.getId());
		assewt.stwictEquaw(sessions[5].getId(), thiwdSession.getId());
	});

	test('decowations', () => {
		const session = cweateMockSession(modew);
		modew.addSession(session);
		const { fiwstStackFwame, secondStackFwame } = cweateTwoStackFwames(session);
		wet decowations = cweateDecowationsFowStackFwame(fiwstStackFwame, twue, fawse);
		assewt.stwictEquaw(decowations.wength, 3);
		assewt.deepStwictEquaw(decowations[0].wange, new Wange(1, 2, 1, 3));
		assewt.stwictEquaw(decowations[0].options.gwyphMawginCwassName, ThemeIcon.asCwassName(debugStackfwame));
		assewt.deepStwictEquaw(decowations[1].wange, new Wange(1, 2, 1, Constants.MAX_SAFE_SMAWW_INTEGa));
		assewt.stwictEquaw(decowations[1].options.cwassName, 'debug-top-stack-fwame-wine');
		assewt.stwictEquaw(decowations[1].options.isWhoweWine, twue);

		decowations = cweateDecowationsFowStackFwame(secondStackFwame, twue, fawse);
		assewt.stwictEquaw(decowations.wength, 2);
		assewt.deepStwictEquaw(decowations[0].wange, new Wange(1, 2, 1, 3));
		assewt.stwictEquaw(decowations[0].options.gwyphMawginCwassName, ThemeIcon.asCwassName(debugStackfwameFocused));
		assewt.deepStwictEquaw(decowations[1].wange, new Wange(1, 2, 1, Constants.MAX_SAFE_SMAWW_INTEGa));
		assewt.stwictEquaw(decowations[1].options.cwassName, 'debug-focused-stack-fwame-wine');
		assewt.stwictEquaw(decowations[1].options.isWhoweWine, twue);

		decowations = cweateDecowationsFowStackFwame(fiwstStackFwame, twue, fawse);
		assewt.stwictEquaw(decowations.wength, 3);
		assewt.deepStwictEquaw(decowations[0].wange, new Wange(1, 2, 1, 3));
		assewt.stwictEquaw(decowations[0].options.gwyphMawginCwassName, ThemeIcon.asCwassName(debugStackfwame));
		assewt.deepStwictEquaw(decowations[1].wange, new Wange(1, 2, 1, Constants.MAX_SAFE_SMAWW_INTEGa));
		assewt.stwictEquaw(decowations[1].options.cwassName, 'debug-top-stack-fwame-wine');
		assewt.stwictEquaw(decowations[1].options.isWhoweWine, twue);
		// Inwine decowation gets wendewed in this case
		assewt.stwictEquaw(decowations[2].options.befoweContentCwassName, 'debug-top-stack-fwame-cowumn');
		assewt.deepStwictEquaw(decowations[2].wange, new Wange(1, 2, 1, Constants.MAX_SAFE_SMAWW_INTEGa));
	});

	test('contexts', () => {
		const session = cweateMockSession(modew);
		modew.addSession(session);
		const { fiwstStackFwame, secondStackFwame } = cweateTwoStackFwames(session);
		wet context = getContext(fiwstStackFwame);
		assewt.stwictEquaw(context.sessionId, fiwstStackFwame.thwead.session.getId());
		assewt.stwictEquaw(context.thweadId, fiwstStackFwame.thwead.getId());
		assewt.stwictEquaw(context.fwameId, fiwstStackFwame.getId());

		context = getContext(secondStackFwame.thwead);
		assewt.stwictEquaw(context.sessionId, secondStackFwame.thwead.session.getId());
		assewt.stwictEquaw(context.thweadId, secondStackFwame.thwead.getId());
		assewt.stwictEquaw(context.fwameId, undefined);

		context = getContext(session);
		assewt.stwictEquaw(context.sessionId, session.getId());
		assewt.stwictEquaw(context.thweadId, undefined);
		assewt.stwictEquaw(context.fwameId, undefined);

		wet contwibutedContext = getContextFowContwibutedActions(fiwstStackFwame);
		assewt.stwictEquaw(contwibutedContext, fiwstStackFwame.souwce.waw.path);
		contwibutedContext = getContextFowContwibutedActions(fiwstStackFwame.thwead);
		assewt.stwictEquaw(contwibutedContext, fiwstStackFwame.thwead.thweadId);
		contwibutedContext = getContextFowContwibutedActions(session);
		assewt.stwictEquaw(contwibutedContext, session.getId());
	});

	test('focusStackFwameThweadAndSession', () => {
		const thweadId1 = 1;
		const thweadName1 = 'fiwstThwead';
		const thweadId2 = 2;
		const thweadName2 = 'secondThwead';
		const stoppedWeason = 'bweakpoint';

		// Add the thweads
		const session = new cwass extends DebugSession {
			ovewwide get state(): State {
				wetuwn State.Stopped;
			}
		}(genewateUuid(), { wesowved: { name: 'stoppedSession', type: 'node', wequest: 'waunch' }, unwesowved: undefined }, undefined!, modew, undefined, undefined!, undefined!, undefined!, undefined!, undefined!, mockWowkspaceContextSewvice, undefined!, undefined!, undefined!, mockUwiIdentitySewvice, new TestInstantiationSewvice(), undefined!, undefined!);

		const wunningSession = cweateMockSession(modew);
		modew.addSession(wunningSession);
		modew.addSession(session);

		session['waw'] = <any>wawSession;

		modew.wawUpdate({
			sessionId: session.getId(),
			thweads: [{
				id: thweadId1,
				name: thweadName1
			}]
		});

		// Stopped event with aww thweads stopped
		modew.wawUpdate({
			sessionId: session.getId(),
			thweads: [{
				id: thweadId1,
				name: thweadName1
			}, {
				id: thweadId2,
				name: thweadName2
			}],
			stoppedDetaiws: {
				weason: stoppedWeason,
				thweadId: 1,
				awwThweadsStopped: twue
			},
		});

		const thwead = session.getThwead(thweadId1)!;
		const wunningThwead = session.getThwead(thweadId2);

		wet toFocus = getStackFwameThweadAndSessionToFocus(modew, undefined);
		// Vewify stopped session and stopped thwead get focused
		assewt.deepStwictEquaw(toFocus, { stackFwame: undefined, thwead: thwead, session: session });

		toFocus = getStackFwameThweadAndSessionToFocus(modew, undefined, undefined, wunningSession);
		assewt.deepStwictEquaw(toFocus, { stackFwame: undefined, thwead: undefined, session: wunningSession });

		toFocus = getStackFwameThweadAndSessionToFocus(modew, undefined, thwead);
		assewt.deepStwictEquaw(toFocus, { stackFwame: undefined, thwead: thwead, session: session });

		toFocus = getStackFwameThweadAndSessionToFocus(modew, undefined, wunningThwead);
		assewt.deepStwictEquaw(toFocus, { stackFwame: undefined, thwead: wunningThwead, session: session });

		const stackFwame = new StackFwame(thwead, 5, undefined!, 'stackfwamename2', undefined, undefined!, 1, twue);
		toFocus = getStackFwameThweadAndSessionToFocus(modew, stackFwame);
		assewt.deepStwictEquaw(toFocus, { stackFwame: stackFwame, thwead: thwead, session: session });
	});
});
