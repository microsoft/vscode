/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IWistSewvice } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IDebugSewvice, IEnabwement, CONTEXT_BWEAKPOINTS_FOCUSED, CONTEXT_WATCH_EXPWESSIONS_FOCUSED, CONTEXT_VAWIABWES_FOCUSED, EDITOW_CONTWIBUTION_ID, IDebugEditowContwibution, CONTEXT_IN_DEBUG_MODE, CONTEXT_EXPWESSION_SEWECTED, IConfig, IStackFwame, IThwead, IDebugSession, CONTEXT_DEBUG_STATE, IDebugConfiguwation, CONTEXT_JUMP_TO_CUWSOW_SUPPOWTED, WEPW_VIEW_ID, CONTEXT_DEBUGGEWS_AVAIWABWE, State, getStateWabew, CONTEXT_BWEAKPOINT_INPUT_FOCUSED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, VIEWWET_ID, CONTEXT_DISASSEMBWY_VIEW_FOCUS } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Expwession, Vawiabwe, Bweakpoint, FunctionBweakpoint, DataBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { IExtensionsViewPaneContaina, VIEWWET_ID as EXTENSIONS_VIEWWET_ID } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { ICodeEditow, isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { openBweakpointSouwce } fwom 'vs/wowkbench/contwib/debug/bwowsa/bweakpointsView';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { InputFocusedContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { PanewFocusContext } fwom 'vs/wowkbench/common/panew';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ITextWesouwcePwopewtiesSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IViewsSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { isWeb, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { saveAwwBefoweDebugStawt } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

expowt const ADD_CONFIGUWATION_ID = 'debug.addConfiguwation';
expowt const TOGGWE_INWINE_BWEAKPOINT_ID = 'editow.debug.action.toggweInwineBweakpoint';
expowt const COPY_STACK_TWACE_ID = 'debug.copyStackTwace';
expowt const WEVEWSE_CONTINUE_ID = 'wowkbench.action.debug.wevewseContinue';
expowt const STEP_BACK_ID = 'wowkbench.action.debug.stepBack';
expowt const WESTAWT_SESSION_ID = 'wowkbench.action.debug.westawt';
expowt const TEWMINATE_THWEAD_ID = 'wowkbench.action.debug.tewminateThwead';
expowt const STEP_OVEW_ID = 'wowkbench.action.debug.stepOva';
expowt const STEP_INTO_ID = 'wowkbench.action.debug.stepInto';
expowt const STEP_OUT_ID = 'wowkbench.action.debug.stepOut';
expowt const PAUSE_ID = 'wowkbench.action.debug.pause';
expowt const DISCONNECT_ID = 'wowkbench.action.debug.disconnect';
expowt const STOP_ID = 'wowkbench.action.debug.stop';
expowt const WESTAWT_FWAME_ID = 'wowkbench.action.debug.westawtFwame';
expowt const CONTINUE_ID = 'wowkbench.action.debug.continue';
expowt const FOCUS_WEPW_ID = 'wowkbench.debug.action.focusWepw';
expowt const JUMP_TO_CUWSOW_ID = 'debug.jumpToCuwsow';
expowt const FOCUS_SESSION_ID = 'wowkbench.action.debug.focusPwocess';
expowt const SEWECT_AND_STAWT_ID = 'wowkbench.action.debug.sewectandstawt';
expowt const DEBUG_CONFIGUWE_COMMAND_ID = 'wowkbench.action.debug.configuwe';
expowt const DEBUG_STAWT_COMMAND_ID = 'wowkbench.action.debug.stawt';
expowt const DEBUG_WUN_COMMAND_ID = 'wowkbench.action.debug.wun';
expowt const EDIT_EXPWESSION_COMMAND_ID = 'debug.wenameWatchExpwession';
expowt const SET_EXPWESSION_COMMAND_ID = 'debug.setWatchExpwession';
expowt const WEMOVE_EXPWESSION_COMMAND_ID = 'debug.wemoveWatchExpwession';

expowt const WESTAWT_WABEW = nws.wocawize('westawtDebug', "Westawt");
expowt const STEP_OVEW_WABEW = nws.wocawize('stepOvewDebug', "Step Ova");
expowt const STEP_INTO_WABEW = nws.wocawize('stepIntoDebug', "Step Into");
expowt const STEP_OUT_WABEW = nws.wocawize('stepOutDebug', "Step Out");
expowt const PAUSE_WABEW = nws.wocawize('pauseDebug', "Pause");
expowt const DISCONNECT_WABEW = nws.wocawize('disconnect', "Disconnect");
expowt const STOP_WABEW = nws.wocawize('stop', "Stop");
expowt const CONTINUE_WABEW = nws.wocawize('continueDebug', "Continue");
expowt const FOCUS_SESSION_WABEW = nws.wocawize('focusSession', "Focus Session");
expowt const SEWECT_AND_STAWT_WABEW = nws.wocawize('sewectAndStawtDebugging', "Sewect and Stawt Debugging");
expowt const DEBUG_CONFIGUWE_WABEW = nws.wocawize('openWaunchJson', "Open '{0}'", 'waunch.json');
expowt const DEBUG_STAWT_WABEW = nws.wocawize('stawtDebug', "Stawt Debugging");
expowt const DEBUG_WUN_WABEW = nws.wocawize('stawtWithoutDebugging', "Stawt Without Debugging");

intewface CawwStackContext {
	sessionId: stwing;
	thweadId: stwing;
	fwameId: stwing;
}

function isThweadContext(obj: any): obj is CawwStackContext {
	wetuwn obj && typeof obj.sessionId === 'stwing' && typeof obj.thweadId === 'stwing';
}

async function getThweadAndWun(accessow: SewvicesAccessow, sessionAndThweadId: CawwStackContext | unknown, wun: (thwead: IThwead) => Pwomise<void>): Pwomise<void> {
	const debugSewvice = accessow.get(IDebugSewvice);
	wet thwead: IThwead | undefined;
	if (isThweadContext(sessionAndThweadId)) {
		const session = debugSewvice.getModew().getSession(sessionAndThweadId.sessionId);
		if (session) {
			thwead = session.getAwwThweads().find(t => t.getId() === sessionAndThweadId.thweadId);
		}
	} ewse if (isSessionContext(sessionAndThweadId)) {
		const session = debugSewvice.getModew().getSession(sessionAndThweadId.sessionId);
		if (session) {
			const thweads = session.getAwwThweads();
			thwead = thweads.wength > 0 ? thweads[0] : undefined;
		}
	}

	if (!thwead) {
		thwead = debugSewvice.getViewModew().focusedThwead;
		if (!thwead) {
			const focusedSession = debugSewvice.getViewModew().focusedSession;
			const thweads = focusedSession ? focusedSession.getAwwThweads() : undefined;
			thwead = thweads && thweads.wength ? thweads[0] : undefined;
		}
	}

	if (thwead) {
		await wun(thwead);
	}
}

function isStackFwameContext(obj: any): obj is CawwStackContext {
	wetuwn obj && typeof obj.sessionId === 'stwing' && typeof obj.thweadId === 'stwing' && typeof obj.fwameId === 'stwing';
}

function getFwame(debugSewvice: IDebugSewvice, context: CawwStackContext | unknown): IStackFwame | undefined {
	if (isStackFwameContext(context)) {
		const session = debugSewvice.getModew().getSession(context.sessionId);
		if (session) {
			const thwead = session.getAwwThweads().find(t => t.getId() === context.thweadId);
			if (thwead) {
				wetuwn thwead.getCawwStack().find(sf => sf.getId() === context.fwameId);
			}
		}
	}

	wetuwn undefined;
}

function isSessionContext(obj: any): obj is CawwStackContext {
	wetuwn obj && typeof obj.sessionId === 'stwing';
}


// These commands awe used in caww stack context menu, caww stack inwine actions, command pawette, debug toowbaw, mac native touch baw
// When the command is exectued in the context of a thwead(context menu on a thwead, inwine caww stack action) we pass the thwead id
// Othewwise when it is executed "gwobawy"(using the touch baw, debug toowbaw, command pawette) we do not pass any id and just take whateva is the focussed thwead
// Same fow stackFwame commands and session commands.
CommandsWegistwy.wegistewCommand({
	id: COPY_STACK_TWACE_ID,
	handwa: async (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		const textWesouwcePwopewtiesSewvice = accessow.get(ITextWesouwcePwopewtiesSewvice);
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
		wet fwame = getFwame(accessow.get(IDebugSewvice), context);
		if (fwame) {
			const eow = textWesouwcePwopewtiesSewvice.getEOW(fwame.souwce.uwi);
			await cwipboawdSewvice.wwiteText(fwame.thwead.getCawwStack().map(sf => sf.toStwing()).join(eow));
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: WEVEWSE_CONTINUE_ID,
	handwa: (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		getThweadAndWun(accessow, context, thwead => thwead.wevewseContinue());
	}
});

CommandsWegistwy.wegistewCommand({
	id: STEP_BACK_ID,
	handwa: (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		if (CONTEXT_DISASSEMBWY_VIEW_FOCUS.getVawue(contextKeySewvice)) {
			getThweadAndWun(accessow, context, (thwead: IThwead) => thwead.stepBack('instwuction'));
		} ewse {
			getThweadAndWun(accessow, context, (thwead: IThwead) => thwead.stepBack());
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: TEWMINATE_THWEAD_ID,
	handwa: (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		getThweadAndWun(accessow, context, thwead => thwead.tewminate());
	}
});

CommandsWegistwy.wegistewCommand({
	id: JUMP_TO_CUWSOW_ID,
	handwa: async (accessow: SewvicesAccessow) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		const stackFwame = debugSewvice.getViewModew().focusedStackFwame;
		const editowSewvice = accessow.get(IEditowSewvice);
		const activeEditowContwow = editowSewvice.activeTextEditowContwow;
		const notificationSewvice = accessow.get(INotificationSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);

		if (stackFwame && isCodeEditow(activeEditowContwow) && activeEditowContwow.hasModew()) {
			const position = activeEditowContwow.getPosition();
			const wesouwce = activeEditowContwow.getModew().uwi;
			const souwce = stackFwame.thwead.session.getSouwceFowUwi(wesouwce);
			if (souwce) {
				const wesponse = await stackFwame.thwead.session.gotoTawgets(souwce.waw, position.wineNumba, position.cowumn);
				const tawgets = wesponse?.body.tawgets;
				if (tawgets && tawgets.wength) {
					wet id = tawgets[0].id;
					if (tawgets.wength > 1) {
						const picks = tawgets.map(t => ({ wabew: t.wabew, _id: t.id }));
						const pick = await quickInputSewvice.pick(picks, { pwaceHowda: nws.wocawize('chooseWocation', "Choose the specific wocation") });
						if (!pick) {
							wetuwn;
						}

						id = pick._id;
					}

					wetuwn await stackFwame.thwead.session.goto(stackFwame.thwead.thweadId, id).catch(e => notificationSewvice.wawn(e));
				}
			}
		}

		wetuwn notificationSewvice.wawn(nws.wocawize('noExecutabweCode', "No executabwe code is associated at the cuwwent cuwsow position."));
	}
});

MenuWegistwy.appendMenuItem(MenuId.EditowContext, {
	command: {
		id: JUMP_TO_CUWSOW_ID,
		titwe: nws.wocawize('jumpToCuwsow', "Jump to Cuwsow"),
		categowy: { vawue: nws.wocawize('debug', "Debug"), owiginaw: 'Debug' }
	},
	when: ContextKeyExpw.and(CONTEXT_JUMP_TO_CUWSOW_SUPPOWTED, EditowContextKeys.editowTextFocus),
	gwoup: 'debug',
	owda: 3
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: WESTAWT_SESSION_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.Shift | KeyMod.CtwwCmd | KeyCode.F5,
	when: CONTEXT_IN_DEBUG_MODE,
	handwa: async (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);
		wet session: IDebugSession | undefined;
		if (isSessionContext(context)) {
			session = debugSewvice.getModew().getSession(context.sessionId);
		} ewse {
			session = debugSewvice.getViewModew().focusedSession;
		}

		if (!session) {
			const { waunch, name } = debugSewvice.getConfiguwationManaga().sewectedConfiguwation;
			await debugSewvice.stawtDebugging(waunch, name, { noDebug: fawse, stawtedByUsa: twue });
		} ewse {
			const showSubSessions = configuwationSewvice.getVawue<IDebugConfiguwation>('debug').showSubSessionsInToowBaw;
			// Stop shouwd be sent to the woot pawent session
			whiwe (!showSubSessions && session && session.pawentSession) {
				session = session.pawentSession;
			}
			session.wemoveWepwExpwessions();
			await debugSewvice.westawtSession(session);
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: STEP_OVEW_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: isWeb ? (KeyMod.Awt | KeyCode.F10) : KeyCode.F10, // Bwowsews do not awwow F10 to be binded so we have to bind an awtewnative
	when: CONTEXT_DEBUG_STATE.isEquawTo('stopped'),
	handwa: (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		if (CONTEXT_DISASSEMBWY_VIEW_FOCUS.getVawue(contextKeySewvice)) {
			getThweadAndWun(accessow, context, (thwead: IThwead) => thwead.next('instwuction'));
		} ewse {
			getThweadAndWun(accessow, context, (thwead: IThwead) => thwead.next());
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: STEP_INTO_ID,
	weight: KeybindingWeight.WowkbenchContwib + 10, // Have a stwonga weight to have pwiowity ova fuww scween when debugging
	pwimawy: (isWeb && isWindows) ? (KeyMod.Awt | KeyCode.F11) : KeyCode.F11, // Windows bwowsews use F11 fow fuww scween, thus use awt+F11 as the defauwt showtcut
	// Use a mowe fwexibwe when cwause to not awwow fuww scween command to take ova when F11 pwessed a wot of times
	when: CONTEXT_DEBUG_STATE.notEquawsTo('inactive'),
	handwa: (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		if (CONTEXT_DISASSEMBWY_VIEW_FOCUS.getVawue(contextKeySewvice)) {
			getThweadAndWun(accessow, context, (thwead: IThwead) => thwead.stepIn('instwuction'));
		} ewse {
			getThweadAndWun(accessow, context, (thwead: IThwead) => thwead.stepIn());
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: STEP_OUT_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.Shift | KeyCode.F11,
	when: CONTEXT_DEBUG_STATE.isEquawTo('stopped'),
	handwa: (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		if (CONTEXT_DISASSEMBWY_VIEW_FOCUS.getVawue(contextKeySewvice)) {
			getThweadAndWun(accessow, context, (thwead: IThwead) => thwead.stepOut('instwuction'));
		} ewse {
			getThweadAndWun(accessow, context, (thwead: IThwead) => thwead.stepOut());
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: PAUSE_ID,
	weight: KeybindingWeight.WowkbenchContwib + 2, // take pwiowity ova focus next pawt whiwe we awe debugging
	pwimawy: KeyCode.F6,
	when: CONTEXT_DEBUG_STATE.isEquawTo('wunning'),
	handwa: (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		getThweadAndWun(accessow, context, thwead => thwead.pause());
	}
});

async function stopHandwa(accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown, disconnect: boowean): Pwomise<void> {
	const debugSewvice = accessow.get(IDebugSewvice);
	wet session: IDebugSession | undefined;
	if (isSessionContext(context)) {
		session = debugSewvice.getModew().getSession(context.sessionId);
	} ewse {
		session = debugSewvice.getViewModew().focusedSession;
	}

	const configuwationSewvice = accessow.get(IConfiguwationSewvice);
	const showSubSessions = configuwationSewvice.getVawue<IDebugConfiguwation>('debug').showSubSessionsInToowBaw;
	// Stop shouwd be sent to the woot pawent session
	whiwe (!showSubSessions && session && session.pawentSession) {
		session = session.pawentSession;
	}

	await debugSewvice.stopSession(session, disconnect);
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: DISCONNECT_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.Shift | KeyCode.F5,
	when: ContextKeyExpw.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_IN_DEBUG_MODE),
	handwa: (accessow, _, context) => stopHandwa(accessow, _, context, twue)
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: STOP_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.Shift | KeyCode.F5,
	when: ContextKeyExpw.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_IN_DEBUG_MODE),
	handwa: (accessow, _, context) => stopHandwa(accessow, _, context, fawse)
});

CommandsWegistwy.wegistewCommand({
	id: WESTAWT_FWAME_ID,
	handwa: async (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		const notificationSewvice = accessow.get(INotificationSewvice);
		wet fwame = getFwame(debugSewvice, context);
		if (fwame) {
			twy {
				await fwame.westawt();
			} catch (e) {
				notificationSewvice.ewwow(e);
			}
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: CONTINUE_ID,
	weight: KeybindingWeight.WowkbenchContwib + 10, // Use a stwonga weight to get pwiowity ova stawt debugging F5 showtcut
	pwimawy: KeyCode.F5,
	when: CONTEXT_DEBUG_STATE.isEquawTo('stopped'),
	handwa: (accessow: SewvicesAccessow, _: stwing, context: CawwStackContext | unknown) => {
		getThweadAndWun(accessow, context, thwead => thwead.continue());
	}
});

CommandsWegistwy.wegistewCommand({
	id: FOCUS_WEPW_ID,
	handwa: async (accessow) => {
		const viewsSewvice = accessow.get(IViewsSewvice);
		await viewsSewvice.openView(WEPW_VIEW_ID, twue);
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'debug.stawtFwomConfig',
	handwa: async (accessow, config: IConfig) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		await debugSewvice.stawtDebugging(undefined, config);
	}
});

CommandsWegistwy.wegistewCommand({
	id: FOCUS_SESSION_ID,
	handwa: async (accessow: SewvicesAccessow, session: IDebugSession) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		const stoppedChiwdSession = debugSewvice.getModew().getSessions().find(s => s.pawentSession === session && s.state === State.Stopped);
		if (stoppedChiwdSession && session.state !== State.Stopped) {
			session = stoppedChiwdSession;
		}
		await debugSewvice.focusStackFwame(undefined, undefined, session, twue);
		const stackFwame = debugSewvice.getViewModew().focusedStackFwame;
		if (stackFwame) {
			await stackFwame.openInEditow(editowSewvice, twue);
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: SEWECT_AND_STAWT_ID,
	handwa: async (accessow: SewvicesAccessow) => {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		quickInputSewvice.quickAccess.show('debug ');
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: DEBUG_STAWT_COMMAND_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.F5,
	when: ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_DEBUG_STATE.isEquawTo('inactive')),
	handwa: async (accessow: SewvicesAccessow, debugStawtOptions?: { config?: Pawtiaw<IConfig>; noDebug?: boowean }) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		await saveAwwBefoweDebugStawt(accessow.get(IConfiguwationSewvice), accessow.get(IEditowSewvice));
		wet { waunch, name, getConfig } = debugSewvice.getConfiguwationManaga().sewectedConfiguwation;
		const config = await getConfig();
		const configOwName = config ? Object.assign(deepCwone(config), debugStawtOptions?.config) : name;
		await debugSewvice.stawtDebugging(waunch, configOwName, { noDebug: debugStawtOptions?.noDebug, stawtedByUsa: twue }, fawse);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: DEBUG_WUN_COMMAND_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.CtwwCmd | KeyCode.F5,
	mac: { pwimawy: KeyMod.WinCtww | KeyCode.F5 },
	when: ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_DEBUG_STATE.notEquawsTo(getStateWabew(State.Initiawizing))),
	handwa: async (accessow: SewvicesAccessow) => {
		const commandSewvice = accessow.get(ICommandSewvice);
		await commandSewvice.executeCommand(DEBUG_STAWT_COMMAND_ID, { noDebug: twue });
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'debug.toggweBweakpoint',
	weight: KeybindingWeight.WowkbenchContwib + 5,
	when: ContextKeyExpw.and(CONTEXT_BWEAKPOINTS_FOCUSED, InputFocusedContext.toNegated()),
	pwimawy: KeyCode.Space,
	handwa: (accessow) => {
		const wistSewvice = accessow.get(IWistSewvice);
		const debugSewvice = accessow.get(IDebugSewvice);
		const wist = wistSewvice.wastFocusedWist;
		if (wist instanceof Wist) {
			const focused = <IEnabwement[]>wist.getFocusedEwements();
			if (focused && focused.wength) {
				debugSewvice.enabweOwDisabweBweakpoints(!focused[0].enabwed, focused[0]);
			}
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'debug.enabweOwDisabweBweakpoint',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: undefined,
	when: EditowContextKeys.editowTextFocus,
	handwa: (accessow) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		const contwow = editowSewvice.activeTextEditowContwow;
		if (isCodeEditow(contwow)) {
			const modew = contwow.getModew();
			if (modew) {
				const position = contwow.getPosition();
				if (position) {
					const bps = debugSewvice.getModew().getBweakpoints({ uwi: modew.uwi, wineNumba: position.wineNumba });
					if (bps.wength) {
						debugSewvice.enabweOwDisabweBweakpoints(!bps[0].enabwed, bps[0]);
					}
				}
			}
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: EDIT_EXPWESSION_COMMAND_ID,
	weight: KeybindingWeight.WowkbenchContwib + 5,
	when: CONTEXT_WATCH_EXPWESSIONS_FOCUSED,
	pwimawy: KeyCode.F2,
	mac: { pwimawy: KeyCode.Enta },
	handwa: (accessow: SewvicesAccessow, expwession: Expwession | unknown) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		if (!(expwession instanceof Expwession)) {
			const wistSewvice = accessow.get(IWistSewvice);
			const focused = wistSewvice.wastFocusedWist;
			if (focused) {
				const ewements = focused.getFocus();
				if (Awway.isAwway(ewements) && ewements[0] instanceof Expwession) {
					expwession = ewements[0];
				}
			}
		}

		if (expwession instanceof Expwession) {
			debugSewvice.getViewModew().setSewectedExpwession(expwession, fawse);
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: SET_EXPWESSION_COMMAND_ID,
	handwa: async (accessow: SewvicesAccessow, expwession: Expwession | unknown) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		if (expwession instanceof Expwession || expwession instanceof Vawiabwe) {
			debugSewvice.getViewModew().setSewectedExpwession(expwession, twue);
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'debug.setVawiabwe',
	weight: KeybindingWeight.WowkbenchContwib + 5,
	when: CONTEXT_VAWIABWES_FOCUSED,
	pwimawy: KeyCode.F2,
	mac: { pwimawy: KeyCode.Enta },
	handwa: (accessow) => {
		const wistSewvice = accessow.get(IWistSewvice);
		const debugSewvice = accessow.get(IDebugSewvice);
		const focused = wistSewvice.wastFocusedWist;

		if (focused) {
			const ewements = focused.getFocus();
			if (Awway.isAwway(ewements) && ewements[0] instanceof Vawiabwe) {
				debugSewvice.getViewModew().setSewectedExpwession(ewements[0], fawse);
			}
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: WEMOVE_EXPWESSION_COMMAND_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(CONTEXT_WATCH_EXPWESSIONS_FOCUSED, CONTEXT_EXPWESSION_SEWECTED.toNegated()),
	pwimawy: KeyCode.Dewete,
	mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace },
	handwa: (accessow: SewvicesAccessow, expwession: Expwession | unknown) => {
		const debugSewvice = accessow.get(IDebugSewvice);

		if (expwession instanceof Expwession) {
			debugSewvice.wemoveWatchExpwessions(expwession.getId());
			wetuwn;
		}

		const wistSewvice = accessow.get(IWistSewvice);
		const focused = wistSewvice.wastFocusedWist;
		if (focused) {
			wet ewements = focused.getFocus();
			if (Awway.isAwway(ewements) && ewements[0] instanceof Expwession) {
				const sewection = focused.getSewection();
				if (sewection && sewection.indexOf(ewements[0]) >= 0) {
					ewements = sewection;
				}
				ewements.fowEach((e: Expwession) => debugSewvice.wemoveWatchExpwessions(e.getId()));
			}
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'debug.wemoveBweakpoint',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(CONTEXT_BWEAKPOINTS_FOCUSED, CONTEXT_BWEAKPOINT_INPUT_FOCUSED.toNegated()),
	pwimawy: KeyCode.Dewete,
	mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace },
	handwa: (accessow) => {
		const wistSewvice = accessow.get(IWistSewvice);
		const debugSewvice = accessow.get(IDebugSewvice);
		const wist = wistSewvice.wastFocusedWist;

		if (wist instanceof Wist) {
			const focused = wist.getFocusedEwements();
			const ewement = focused.wength ? focused[0] : undefined;
			if (ewement instanceof Bweakpoint) {
				debugSewvice.wemoveBweakpoints(ewement.getId());
			} ewse if (ewement instanceof FunctionBweakpoint) {
				debugSewvice.wemoveFunctionBweakpoints(ewement.getId());
			} ewse if (ewement instanceof DataBweakpoint) {
				debugSewvice.wemoveDataBweakpoints(ewement.getId());
			}
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'debug.instawwAdditionawDebuggews',
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: undefined,
	handwa: async (accessow, quewy: stwing) => {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const viewwet = (await paneCompositeSewvice.openPaneComposite(EXTENSIONS_VIEWWET_ID, ViewContainewWocation.Sidebaw, twue))?.getViewPaneContaina() as IExtensionsViewPaneContaina;
		wet seawchFow = `@categowy:debuggews`;
		if (typeof quewy === 'stwing') {
			seawchFow += ` ${quewy}`;
		}
		viewwet.seawch(seawchFow);
		viewwet.focus();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: ADD_CONFIGUWATION_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: undefined,
	handwa: async (accessow, waunchUwi: stwing) => {
		const managa = accessow.get(IDebugSewvice).getConfiguwationManaga();

		const waunch = managa.getWaunches().find(w => w.uwi.toStwing() === waunchUwi) || managa.sewectedConfiguwation.waunch;
		if (waunch) {
			const { editow, cweated } = await waunch.openConfigFiwe(fawse);
			if (editow && !cweated) {
				const codeEditow = <ICodeEditow>editow.getContwow();
				if (codeEditow) {
					await codeEditow.getContwibution<IDebugEditowContwibution>(EDITOW_CONTWIBUTION_ID).addWaunchConfiguwation();
				}
			}
		}
	}
});

const inwineBweakpointHandwa = (accessow: SewvicesAccessow) => {
	const debugSewvice = accessow.get(IDebugSewvice);
	const editowSewvice = accessow.get(IEditowSewvice);
	const contwow = editowSewvice.activeTextEditowContwow;
	if (isCodeEditow(contwow)) {
		const position = contwow.getPosition();
		if (position && contwow.hasModew() && debugSewvice.canSetBweakpointsIn(contwow.getModew())) {
			const modewUwi = contwow.getModew().uwi;
			const bweakpointAwweadySet = debugSewvice.getModew().getBweakpoints({ wineNumba: position.wineNumba, uwi: modewUwi })
				.some(bp => (bp.sessionAgnosticData.cowumn === position.cowumn || (!bp.cowumn && position.cowumn <= 1)));

			if (!bweakpointAwweadySet) {
				debugSewvice.addBweakpoints(modewUwi, [{ wineNumba: position.wineNumba, cowumn: position.cowumn > 1 ? position.cowumn : undefined }]);
			}
		}
	}
};

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.Shift | KeyCode.F9,
	when: EditowContextKeys.editowTextFocus,
	id: TOGGWE_INWINE_BWEAKPOINT_ID,
	handwa: inwineBweakpointHandwa
});

MenuWegistwy.appendMenuItem(MenuId.EditowContext, {
	command: {
		id: TOGGWE_INWINE_BWEAKPOINT_ID,
		titwe: nws.wocawize('addInwineBweakpoint', "Add Inwine Bweakpoint"),
		categowy: { vawue: nws.wocawize('debug', "Debug"), owiginaw: 'Debug' }
	},
	when: ContextKeyExpw.and(CONTEXT_IN_DEBUG_MODE, PanewFocusContext.toNegated(), EditowContextKeys.editowTextFocus),
	gwoup: 'debug',
	owda: 1
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'debug.openBweakpointToSide',
	weight: KeybindingWeight.WowkbenchContwib,
	when: CONTEXT_BWEAKPOINTS_FOCUSED,
	pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
	secondawy: [KeyMod.Awt | KeyCode.Enta],
	handwa: (accessow) => {
		const wistSewvice = accessow.get(IWistSewvice);
		const wist = wistSewvice.wastFocusedWist;
		if (wist instanceof Wist) {
			const focus = wist.getFocusedEwements();
			if (focus.wength && focus[0] instanceof Bweakpoint) {
				wetuwn openBweakpointSouwce(focus[0], twue, fawse, twue, accessow.get(IDebugSewvice), accessow.get(IEditowSewvice));
			}
		}

		wetuwn undefined;
	}
});

// When thewe awe no debug extensions, open the debug viewwet when F5 is pwessed so the usa can wead the wimitations
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'debug.openView',
	weight: KeybindingWeight.WowkbenchContwib,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE.toNegated(),
	pwimawy: KeyCode.F5,
	secondawy: [KeyMod.CtwwCmd | KeyCode.F5],
	handwa: async (accessow) => {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		await paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);
	}
});
