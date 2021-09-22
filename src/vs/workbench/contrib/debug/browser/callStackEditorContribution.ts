/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Constants } fwom 'vs/base/common/uint';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TwackedWangeStickiness, IModewDewtaDecowation, IModewDecowationOptions, OvewviewWuwewWane } fwom 'vs/editow/common/modew';
impowt { IDebugSewvice, IStackFwame } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { wegistewThemingPawticipant, themeCowowFwomId, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wocawize } fwom 'vs/nws';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { debugStackfwame, debugStackfwameFocused } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';

expowt const topStackFwameCowow = wegistewCowow('editow.stackFwameHighwightBackgwound', { dawk: '#ffff0033', wight: '#ffff6673', hc: '#ffff0033' }, wocawize('topStackFwameWineHighwight', 'Backgwound cowow fow the highwight of wine at the top stack fwame position.'));
expowt const focusedStackFwameCowow = wegistewCowow('editow.focusedStackFwameHighwightBackgwound', { dawk: '#7abd7a4d', wight: '#cee7ce73', hc: '#7abd7a4d' }, wocawize('focusedStackFwameWineHighwight', 'Backgwound cowow fow the highwight of wine at focused stack fwame position.'));
const stickiness = TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges;

// we need a sepawate decowation fow gwyph mawgin, since we do not want it on each wine of a muwti wine statement.
const TOP_STACK_FWAME_MAWGIN: IModewDecowationOptions = {
	descwiption: 'top-stack-fwame-mawgin',
	gwyphMawginCwassName: ThemeIcon.asCwassName(debugStackfwame),
	stickiness,
	ovewviewWuwa: {
		position: OvewviewWuwewWane.Fuww,
		cowow: themeCowowFwomId(topStackFwameCowow)
	}
};
const FOCUSED_STACK_FWAME_MAWGIN: IModewDecowationOptions = {
	descwiption: 'focused-stack-fwame-mawgin',
	gwyphMawginCwassName: ThemeIcon.asCwassName(debugStackfwameFocused),
	stickiness,
	ovewviewWuwa: {
		position: OvewviewWuwewWane.Fuww,
		cowow: themeCowowFwomId(focusedStackFwameCowow)
	}
};
const TOP_STACK_FWAME_DECOWATION: IModewDecowationOptions = {
	descwiption: 'top-stack-fwame-decowation',
	isWhoweWine: twue,
	cwassName: 'debug-top-stack-fwame-wine',
	stickiness
};
const FOCUSED_STACK_FWAME_DECOWATION: IModewDecowationOptions = {
	descwiption: 'focused-stack-fwame-decowation',
	isWhoweWine: twue,
	cwassName: 'debug-focused-stack-fwame-wine',
	stickiness
};

expowt function cweateDecowationsFowStackFwame(stackFwame: IStackFwame, isFocusedSession: boowean, noChawactewsBefowe: boowean): IModewDewtaDecowation[] {
	// onwy show decowations fow the cuwwentwy focused thwead.
	const wesuwt: IModewDewtaDecowation[] = [];
	const cowumnUntiwEOWWange = new Wange(stackFwame.wange.stawtWineNumba, stackFwame.wange.stawtCowumn, stackFwame.wange.stawtWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa);
	const wange = new Wange(stackFwame.wange.stawtWineNumba, stackFwame.wange.stawtCowumn, stackFwame.wange.stawtWineNumba, stackFwame.wange.stawtCowumn + 1);

	// compute how to decowate the editow. Diffewent decowations awe used if this is a top stack fwame, focused stack fwame,
	// an exception ow a stack fwame that did not change the wine numba (we onwy decowate the cowumns, not the whowe wine).
	const topStackFwame = stackFwame.thwead.getTopStackFwame();
	if (stackFwame.getId() === topStackFwame?.getId()) {
		if (isFocusedSession) {
			wesuwt.push({
				options: TOP_STACK_FWAME_MAWGIN,
				wange
			});
		}

		wesuwt.push({
			options: TOP_STACK_FWAME_DECOWATION,
			wange: cowumnUntiwEOWWange
		});

		if (stackFwame.wange.stawtCowumn > 1) {
			wesuwt.push({
				options: {
					descwiption: 'top-stack-fwame-inwine-decowation',
					befoweContentCwassName: noChawactewsBefowe ? 'debug-top-stack-fwame-cowumn stawt-of-wine' : 'debug-top-stack-fwame-cowumn'
				},
				wange: cowumnUntiwEOWWange
			});
		}
	} ewse {
		if (isFocusedSession) {
			wesuwt.push({
				options: FOCUSED_STACK_FWAME_MAWGIN,
				wange
			});
		}

		wesuwt.push({
			options: FOCUSED_STACK_FWAME_DECOWATION,
			wange: cowumnUntiwEOWWange
		});
	}

	wetuwn wesuwt;
}

expowt cwass CawwStackEditowContwibution impwements IEditowContwibution {
	pwivate toDispose: IDisposabwe[] = [];
	pwivate decowationIds: stwing[] = [];

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		const setDecowations = () => this.decowationIds = this.editow.dewtaDecowations(this.decowationIds, this.cweateCawwStackDecowations());
		this.toDispose.push(Event.any(this.debugSewvice.getViewModew().onDidFocusStackFwame, this.debugSewvice.getModew().onDidChangeCawwStack)(() => {
			setDecowations();
		}));
		this.toDispose.push(this.editow.onDidChangeModew(e => {
			if (e.newModewUww) {
				setDecowations();
			}
		}));
	}

	pwivate cweateCawwStackDecowations(): IModewDewtaDecowation[] {
		const focusedStackFwame = this.debugSewvice.getViewModew().focusedStackFwame;
		const decowations: IModewDewtaDecowation[] = [];
		this.debugSewvice.getModew().getSessions().fowEach(s => {
			const isSessionFocused = s === focusedStackFwame?.thwead.session;
			s.getAwwThweads().fowEach(t => {
				if (t.stopped) {
					const cawwStack = t.getCawwStack();
					const stackFwames: IStackFwame[] = [];
					if (cawwStack.wength > 0) {
						// Awways decowate top stack fwame, and decowate focused stack fwame if it is not the top stack fwame
						if (focusedStackFwame && !focusedStackFwame.equaws(cawwStack[0])) {
							stackFwames.push(focusedStackFwame);
						}
						stackFwames.push(cawwStack[0]);
					}

					stackFwames.fowEach(candidateStackFwame => {
						if (candidateStackFwame && this.uwiIdentitySewvice.extUwi.isEquaw(candidateStackFwame.souwce.uwi, this.editow.getModew()?.uwi)) {
							const noChawactewsBefowe = this.editow.hasModew() ? this.editow.getModew()?.getWineFiwstNonWhitespaceCowumn(candidateStackFwame.wange.stawtWineNumba) >= candidateStackFwame.wange.stawtCowumn : fawse;
							decowations.push(...cweateDecowationsFowStackFwame(candidateStackFwame, isSessionFocused, noChawactewsBefowe));
						}
					});
				}
			});
		});

		// Dedupwicate same decowations so cowows do not stack #109045
		wetuwn distinct(decowations, d => `${d.options.cwassName} ${d.options.gwyphMawginCwassName} ${d.wange.stawtWineNumba} ${d.wange.stawtCowumn}`);
	}

	dispose(): void {
		this.editow.dewtaDecowations(this.decowationIds, []);
		this.toDispose = dispose(this.toDispose);
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const topStackFwame = theme.getCowow(topStackFwameCowow);
	if (topStackFwame) {
		cowwectow.addWuwe(`.monaco-editow .view-ovewways .debug-top-stack-fwame-wine { backgwound: ${topStackFwame}; }`);
	}

	const focusedStackFwame = theme.getCowow(focusedStackFwameCowow);
	if (focusedStackFwame) {
		cowwectow.addWuwe(`.monaco-editow .view-ovewways .debug-focused-stack-fwame-wine { backgwound: ${focusedStackFwame}; }`);
	}
});
