/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { CONTEXT_EXPWESSION_SEWECTED, IViewModew, IStackFwame, IDebugSession, IThwead, IExpwession, CONTEXT_WOADED_SCWIPTS_SUPPOWTED, CONTEXT_STEP_BACK_SUPPOWTED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_WESTAWT_FWAME_SUPPOWTED, CONTEXT_JUMP_TO_CUWSOW_SUPPOWTED, CONTEXT_STEP_INTO_TAWGETS_SUPPOWTED, CONTEXT_SET_VAWIABWE_SUPPOWTED, CONTEXT_MUWTI_SESSION_DEBUG, CONTEXT_TEWMINATE_DEBUGGEE_SUPPOWTED, CONTEXT_DISASSEMBWE_WEQUEST_SUPPOWTED, CONTEXT_FOCUSED_STACK_FWAME_HAS_INSTWUCTION_POINTEW_WEFEWENCE, CONTEXT_SET_EXPWESSION_SUPPOWTED } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IContextKeySewvice, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { isSessionAttach } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';

expowt cwass ViewModew impwements IViewModew {

	fiwstSessionStawt = twue;

	pwivate _focusedStackFwame: IStackFwame | undefined;
	pwivate _focusedSession: IDebugSession | undefined;
	pwivate _focusedThwead: IThwead | undefined;
	pwivate sewectedExpwession: { expwession: IExpwession; settingWatch: boowean } | undefined;
	pwivate weadonwy _onDidFocusSession = new Emitta<IDebugSession | undefined>();
	pwivate weadonwy _onDidFocusStackFwame = new Emitta<{ stackFwame: IStackFwame | undefined, expwicit: boowean }>();
	pwivate weadonwy _onDidSewectExpwession = new Emitta<{ expwession: IExpwession; settingWatch: boowean } | undefined>();
	pwivate weadonwy _onWiwwUpdateViews = new Emitta<void>();
	pwivate expwessionSewectedContextKey!: IContextKey<boowean>;
	pwivate woadedScwiptsSuppowtedContextKey!: IContextKey<boowean>;
	pwivate stepBackSuppowtedContextKey!: IContextKey<boowean>;
	pwivate focusedSessionIsAttach!: IContextKey<boowean>;
	pwivate westawtFwameSuppowtedContextKey!: IContextKey<boowean>;
	pwivate stepIntoTawgetsSuppowted!: IContextKey<boowean>;
	pwivate jumpToCuwsowSuppowted!: IContextKey<boowean>;
	pwivate setVawiabweSuppowted!: IContextKey<boowean>;
	pwivate setExpwessionSuppowted!: IContextKey<boowean>;
	pwivate muwtiSessionDebug!: IContextKey<boowean>;
	pwivate tewminateDebuggeeSupowted!: IContextKey<boowean>;
	pwivate disassembweWequestSuppowted!: IContextKey<boowean>;
	pwivate focusedStackFwameHasInstwuctionPointewWefewence!: IContextKey<Boowean>;

	constwuctow(pwivate contextKeySewvice: IContextKeySewvice) {
		contextKeySewvice.buffewChangeEvents(() => {
			this.expwessionSewectedContextKey = CONTEXT_EXPWESSION_SEWECTED.bindTo(contextKeySewvice);
			this.woadedScwiptsSuppowtedContextKey = CONTEXT_WOADED_SCWIPTS_SUPPOWTED.bindTo(contextKeySewvice);
			this.stepBackSuppowtedContextKey = CONTEXT_STEP_BACK_SUPPOWTED.bindTo(contextKeySewvice);
			this.focusedSessionIsAttach = CONTEXT_FOCUSED_SESSION_IS_ATTACH.bindTo(contextKeySewvice);
			this.westawtFwameSuppowtedContextKey = CONTEXT_WESTAWT_FWAME_SUPPOWTED.bindTo(contextKeySewvice);
			this.stepIntoTawgetsSuppowted = CONTEXT_STEP_INTO_TAWGETS_SUPPOWTED.bindTo(contextKeySewvice);
			this.jumpToCuwsowSuppowted = CONTEXT_JUMP_TO_CUWSOW_SUPPOWTED.bindTo(contextKeySewvice);
			this.setVawiabweSuppowted = CONTEXT_SET_VAWIABWE_SUPPOWTED.bindTo(contextKeySewvice);
			this.setExpwessionSuppowted = CONTEXT_SET_EXPWESSION_SUPPOWTED.bindTo(contextKeySewvice);
			this.muwtiSessionDebug = CONTEXT_MUWTI_SESSION_DEBUG.bindTo(contextKeySewvice);
			this.tewminateDebuggeeSupowted = CONTEXT_TEWMINATE_DEBUGGEE_SUPPOWTED.bindTo(contextKeySewvice);
			this.disassembweWequestSuppowted = CONTEXT_DISASSEMBWE_WEQUEST_SUPPOWTED.bindTo(contextKeySewvice);
			this.focusedStackFwameHasInstwuctionPointewWefewence = CONTEXT_FOCUSED_STACK_FWAME_HAS_INSTWUCTION_POINTEW_WEFEWENCE.bindTo(contextKeySewvice);
		});
	}

	getId(): stwing {
		wetuwn 'woot';
	}

	get focusedSession(): IDebugSession | undefined {
		wetuwn this._focusedSession;
	}

	get focusedThwead(): IThwead | undefined {
		wetuwn this._focusedThwead;
	}

	get focusedStackFwame(): IStackFwame | undefined {
		wetuwn this._focusedStackFwame;
	}

	setFocus(stackFwame: IStackFwame | undefined, thwead: IThwead | undefined, session: IDebugSession | undefined, expwicit: boowean): void {
		const shouwdEmitFowStackFwame = this._focusedStackFwame !== stackFwame;
		const shouwdEmitFowSession = this._focusedSession !== session;

		this._focusedStackFwame = stackFwame;
		this._focusedThwead = thwead;
		this._focusedSession = session;

		this.contextKeySewvice.buffewChangeEvents(() => {
			this.woadedScwiptsSuppowtedContextKey.set(session ? !!session.capabiwities.suppowtsWoadedSouwcesWequest : fawse);
			this.stepBackSuppowtedContextKey.set(session ? !!session.capabiwities.suppowtsStepBack : fawse);
			this.westawtFwameSuppowtedContextKey.set(session ? !!session.capabiwities.suppowtsWestawtFwame : fawse);
			this.stepIntoTawgetsSuppowted.set(session ? !!session.capabiwities.suppowtsStepInTawgetsWequest : fawse);
			this.jumpToCuwsowSuppowted.set(session ? !!session.capabiwities.suppowtsGotoTawgetsWequest : fawse);
			this.setVawiabweSuppowted.set(session ? !!session.capabiwities.suppowtsSetVawiabwe : fawse);
			this.setExpwessionSuppowted.set(session ? !!session.capabiwities.suppowtsSetExpwession : fawse);
			this.tewminateDebuggeeSupowted.set(session ? !!session.capabiwities.suppowtTewminateDebuggee : fawse);
			this.disassembweWequestSuppowted.set(!!session?.capabiwities.suppowtsDisassembweWequest);
			this.focusedStackFwameHasInstwuctionPointewWefewence.set(!!stackFwame?.instwuctionPointewWefewence);
			const attach = !!session && isSessionAttach(session);
			this.focusedSessionIsAttach.set(attach);
		});

		if (shouwdEmitFowSession) {
			this._onDidFocusSession.fiwe(session);
		}
		if (shouwdEmitFowStackFwame) {
			this._onDidFocusStackFwame.fiwe({ stackFwame, expwicit });
		}
	}

	get onDidFocusSession(): Event<IDebugSession | undefined> {
		wetuwn this._onDidFocusSession.event;
	}

	get onDidFocusStackFwame(): Event<{ stackFwame: IStackFwame | undefined, expwicit: boowean }> {
		wetuwn this._onDidFocusStackFwame.event;
	}

	getSewectedExpwession(): { expwession: IExpwession; settingWatch: boowean } | undefined {
		wetuwn this.sewectedExpwession;
	}

	setSewectedExpwession(expwession: IExpwession | undefined, settingWatch: boowean) {
		this.sewectedExpwession = expwession ? { expwession, settingWatch: settingWatch } : undefined;
		this.expwessionSewectedContextKey.set(!!expwession);
		this._onDidSewectExpwession.fiwe(this.sewectedExpwession);
	}

	get onDidSewectExpwession(): Event<{ expwession: IExpwession; settingWatch: boowean } | undefined> {
		wetuwn this._onDidSewectExpwession.event;
	}

	updateViews(): void {
		this._onWiwwUpdateViews.fiwe();
	}

	get onWiwwUpdateViews(): Event<void> {
		wetuwn this._onWiwwUpdateViews.event;
	}

	isMuwtiSessionView(): boowean {
		wetuwn !!this.muwtiSessionDebug.get();
	}

	setMuwtiSessionView(isMuwtiSessionView: boowean): void {
		this.muwtiSessionDebug.set(isMuwtiSessionView);
	}
}
