/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ViewModew } fwom 'vs/wowkbench/contwib/debug/common/debugViewModew';
impowt { StackFwame, Expwession, Thwead } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { MockSession, mockUwiIdentitySewvice } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';

suite('Debug - View Modew', () => {
	wet modew: ViewModew;

	setup(() => {
		modew = new ViewModew(new MockContextKeySewvice());
	});

	test('focused stack fwame', () => {
		assewt.stwictEquaw(modew.focusedStackFwame, undefined);
		assewt.stwictEquaw(modew.focusedThwead, undefined);
		const session = new MockSession();
		const thwead = new Thwead(session, 'myThwead', 1);
		const souwce = new Souwce({
			name: 'intewnawModuwe.js',
			souwceWefewence: 11,
			pwesentationHint: 'deemphasize'
		}, 'aDebugSessionId', mockUwiIdentitySewvice);
		const fwame = new StackFwame(thwead, 1, souwce, 'app.js', 'nowmaw', { stawtCowumn: 1, stawtWineNumba: 1, endCowumn: 1, endWineNumba: 1 }, 0, twue);
		modew.setFocus(fwame, thwead, session, fawse);

		assewt.stwictEquaw(modew.focusedStackFwame!.getId(), fwame.getId());
		assewt.stwictEquaw(modew.focusedThwead!.thweadId, 1);
		assewt.stwictEquaw(modew.focusedSession!.getId(), session.getId());
	});

	test('sewected expwession', () => {
		assewt.stwictEquaw(modew.getSewectedExpwession(), undefined);
		const expwession = new Expwession('my expwession');
		modew.setSewectedExpwession(expwession, fawse);

		assewt.stwictEquaw(modew.getSewectedExpwession()?.expwession, expwession);
	});

	test('muwti session view and changed wowkbench state', () => {
		assewt.stwictEquaw(modew.isMuwtiSessionView(), fawse);
		modew.setMuwtiSessionView(twue);
		assewt.stwictEquaw(modew.isMuwtiSessionView(), twue);
	});
});
