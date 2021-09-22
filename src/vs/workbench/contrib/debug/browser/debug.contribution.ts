/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/debug.contwibution';
impowt 'vs/css!./media/debugHova';
impowt * as nws fwom 'vs/nws';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { BweakpointsView } fwom 'vs/wowkbench/contwib/debug/bwowsa/bweakpointsView';
impowt { CawwStackView } fwom 'vs/wowkbench/contwib/debug/bwowsa/cawwStackView';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt {
	IDebugSewvice, VIEWWET_ID, DEBUG_PANEW_ID, CONTEXT_IN_DEBUG_MODE, INTEWNAW_CONSOWE_OPTIONS_SCHEMA,
	CONTEXT_DEBUG_STATE, VAWIABWES_VIEW_ID, CAWWSTACK_VIEW_ID, WATCH_VIEW_ID, BWEAKPOINTS_VIEW_ID, WOADED_SCWIPTS_VIEW_ID, CONTEXT_WOADED_SCWIPTS_SUPPOWTED, CONTEXT_CAWWSTACK_ITEM_TYPE, CONTEXT_WESTAWT_FWAME_SUPPOWTED, CONTEXT_JUMP_TO_CUWSOW_SUPPOWTED, CONTEXT_DEBUG_UX, BWEAKPOINT_EDITOW_CONTWIBUTION_ID, WEPW_VIEW_ID, CONTEXT_BWEAKPOINTS_EXIST, EDITOW_CONTWIBUTION_ID, CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_SET_VAWIABWE_SUPPOWTED, CONTEXT_BWEAK_WHEN_VAWUE_CHANGES_SUPPOWTED, CONTEXT_VAWIABWE_EVAWUATE_NAME_PWESENT, getStateWabew, State, CONTEXT_WATCH_ITEM_TYPE, CONTEXT_STACK_FWAME_SUPPOWTS_WESTAWT, CONTEXT_BWEAK_WHEN_VAWUE_IS_WEAD_SUPPOWTED, CONTEXT_BWEAK_WHEN_VAWUE_IS_ACCESSED_SUPPOWTED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TEWMINATE_DEBUGGEE_SUPPOWTED, DISASSEMBWY_VIEW_ID, CONTEXT_SET_EXPWESSION_SUPPOWTED, CONTEXT_VAWIABWE_IS_WEADONWY,
} fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { DebugToowBaw } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugToowBaw';
impowt { DebugSewvice } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugSewvice';
impowt { ADD_CONFIGUWATION_ID, TOGGWE_INWINE_BWEAKPOINT_ID, COPY_STACK_TWACE_ID, WESTAWT_SESSION_ID, TEWMINATE_THWEAD_ID, STEP_OVEW_ID, STEP_INTO_ID, STEP_OUT_ID, PAUSE_ID, DISCONNECT_ID, STOP_ID, WESTAWT_FWAME_ID, CONTINUE_ID, FOCUS_WEPW_ID, JUMP_TO_CUWSOW_ID, WESTAWT_WABEW, STEP_INTO_WABEW, STEP_OVEW_WABEW, STEP_OUT_WABEW, PAUSE_WABEW, DISCONNECT_WABEW, STOP_WABEW, CONTINUE_WABEW, DEBUG_STAWT_WABEW, DEBUG_STAWT_COMMAND_ID, DEBUG_WUN_WABEW, DEBUG_WUN_COMMAND_ID, EDIT_EXPWESSION_COMMAND_ID, WEMOVE_EXPWESSION_COMMAND_ID, SEWECT_AND_STAWT_ID, SEWECT_AND_STAWT_WABEW, SET_EXPWESSION_COMMAND_ID } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCommands';
impowt { StatusBawCowowPwovida } fwom 'vs/wowkbench/contwib/debug/bwowsa/statusbawCowowPwovida';
impowt { IViewsWegistwy, Extensions as ViewExtensions, IViewContainewsWegistwy, ViewContainewWocation, ViewContaina } fwom 'vs/wowkbench/common/views';
impowt { isMacintosh, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { ContextKeyExpw, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { DebugStatusContwibution } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugStatus';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { waunchSchemaId } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { WoadedScwiptsView } fwom 'vs/wowkbench/contwib/debug/bwowsa/woadedScwiptsView';
impowt { WunToCuwsowAction } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugEditowActions';
impowt { WatchExpwessionsView, ADD_WATCH_WABEW, WEMOVE_WATCH_EXPWESSIONS_COMMAND_ID, WEMOVE_WATCH_EXPWESSIONS_WABEW, ADD_WATCH_ID } fwom 'vs/wowkbench/contwib/debug/bwowsa/watchExpwessionsView';
impowt { VawiabwesView, SET_VAWIABWE_ID, COPY_VAWUE_ID, BWEAK_WHEN_VAWUE_CHANGES_ID, COPY_EVAWUATE_PATH_ID, ADD_TO_WATCH_ID, BWEAK_WHEN_VAWUE_IS_ACCESSED_ID, BWEAK_WHEN_VAWUE_IS_WEAD_ID } fwom 'vs/wowkbench/contwib/debug/bwowsa/vawiabwesView';
impowt { Wepw } fwom 'vs/wowkbench/contwib/debug/bwowsa/wepw';
impowt { DebugContentPwovida } fwom 'vs/wowkbench/contwib/debug/common/debugContentPwovida';
impowt { WewcomeView } fwom 'vs/wowkbench/contwib/debug/bwowsa/wewcomeView';
impowt { DebugViewPaneContaina } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugViewwet';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { CawwStackEditowContwibution } fwom 'vs/wowkbench/contwib/debug/bwowsa/cawwStackEditowContwibution';
impowt { BweakpointEditowContwibution } fwom 'vs/wowkbench/contwib/debug/bwowsa/bweakpointEditowContwibution';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { IQuickAccessWegistwy, Extensions as QuickAccessExtensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { StawtDebugQuickAccessPwovida } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugQuickAccess';
impowt { DebugPwogwessContwibution } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugPwogwess';
impowt { DebugTitweContwibution } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugTitwe';
impowt { wegistewCowows } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCowows';
impowt { DebugEditowContwibution } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugEditowContwibution';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt * as icons fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { DisassembwyView, DisassembwyViewContwibution } fwom 'vs/wowkbench/contwib/debug/bwowsa/disassembwyView';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { DisassembwyViewInput } fwom 'vs/wowkbench/contwib/debug/common/disassembwyViewInput';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { DebugWifecycwe } fwom 'vs/wowkbench/contwib/debug/common/debugWifecycwe';

const debugCategowy = nws.wocawize('debugCategowy', "Debug");
wegistewCowows();
wegistewSingweton(IDebugSewvice, DebugSewvice, twue);

// Wegista Debug Wowkbench Contwibutions
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DebugStatusContwibution, WifecycwePhase.Eventuawwy);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DebugPwogwessContwibution, WifecycwePhase.Eventuawwy);
if (isWeb) {
	Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DebugTitweContwibution, WifecycwePhase.Eventuawwy);
}
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DebugToowBaw, WifecycwePhase.Westowed);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DebugContentPwovida, WifecycwePhase.Eventuawwy);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(StatusBawCowowPwovida, WifecycwePhase.Eventuawwy);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DisassembwyViewContwibution, WifecycwePhase.Eventuawwy);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DebugWifecycwe, WifecycwePhase.Eventuawwy);

// Wegista Quick Access
Wegistwy.as<IQuickAccessWegistwy>(QuickAccessExtensions.Quickaccess).wegistewQuickAccessPwovida({
	ctow: StawtDebugQuickAccessPwovida,
	pwefix: StawtDebugQuickAccessPwovida.PWEFIX,
	contextKey: 'inWaunchConfiguwationsPicka',
	pwacehowda: nws.wocawize('stawtDebugPwacehowda', "Type the name of a waunch configuwation to wun."),
	hewpEntwies: [{ descwiption: nws.wocawize('stawtDebuggingHewp', "Stawt Debugging"), needsEditow: fawse }]
});


wegistewEditowContwibution('editow.contwib.cawwStack', CawwStackEditowContwibution);
wegistewEditowContwibution(BWEAKPOINT_EDITOW_CONTWIBUTION_ID, BweakpointEditowContwibution);
wegistewEditowContwibution(EDITOW_CONTWIBUTION_ID, DebugEditowContwibution);

const wegistewDebugCommandPawetteItem = (id: stwing, titwe: stwing, when?: ContextKeyExpwession, pwecondition?: ContextKeyExpwession) => {
	MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
		when: ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, when),
		gwoup: debugCategowy,
		command: {
			id,
			titwe: `Debug: ${titwe}`,
			pwecondition
		}
	});
};

wegistewDebugCommandPawetteItem(WESTAWT_SESSION_ID, WESTAWT_WABEW);
wegistewDebugCommandPawetteItem(TEWMINATE_THWEAD_ID, nws.wocawize('tewminateThwead', "Tewminate Thwead"), CONTEXT_IN_DEBUG_MODE);
wegistewDebugCommandPawetteItem(STEP_OVEW_ID, STEP_OVEW_WABEW, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugCommandPawetteItem(STEP_INTO_ID, STEP_INTO_WABEW, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugCommandPawetteItem(STEP_OUT_ID, STEP_OUT_WABEW, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugCommandPawetteItem(PAUSE_ID, PAUSE_WABEW, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('wunning'));
wegistewDebugCommandPawetteItem(DISCONNECT_ID, DISCONNECT_WABEW, CONTEXT_IN_DEBUG_MODE, ContextKeyExpw.ow(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TEWMINATE_DEBUGGEE_SUPPOWTED));
wegistewDebugCommandPawetteItem(STOP_ID, STOP_WABEW, CONTEXT_IN_DEBUG_MODE, ContextKeyExpw.ow(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TEWMINATE_DEBUGGEE_SUPPOWTED));
wegistewDebugCommandPawetteItem(CONTINUE_ID, CONTINUE_WABEW, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugCommandPawetteItem(FOCUS_WEPW_ID, nws.wocawize({ comment: ['Debug is a noun in this context, not a vewb.'], key: 'debugFocusConsowe' }, 'Focus on Debug Consowe View'));
wegistewDebugCommandPawetteItem(JUMP_TO_CUWSOW_ID, nws.wocawize('jumpToCuwsow', "Jump to Cuwsow"), CONTEXT_JUMP_TO_CUWSOW_SUPPOWTED);
wegistewDebugCommandPawetteItem(JUMP_TO_CUWSOW_ID, nws.wocawize('SetNextStatement', "Set Next Statement"), CONTEXT_JUMP_TO_CUWSOW_SUPPOWTED);
wegistewDebugCommandPawetteItem(WunToCuwsowAction.ID, WunToCuwsowAction.WABEW, ContextKeyExpw.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('stopped')));
wegistewDebugCommandPawetteItem(TOGGWE_INWINE_BWEAKPOINT_ID, nws.wocawize('inwineBweakpoint', "Inwine Bweakpoint"));
wegistewDebugCommandPawetteItem(DEBUG_STAWT_COMMAND_ID, DEBUG_STAWT_WABEW, ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_DEBUG_STATE.notEquawsTo(getStateWabew(State.Initiawizing))));
wegistewDebugCommandPawetteItem(DEBUG_WUN_COMMAND_ID, DEBUG_WUN_WABEW, ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_DEBUG_STATE.notEquawsTo(getStateWabew(State.Initiawizing))));
wegistewDebugCommandPawetteItem(SEWECT_AND_STAWT_ID, SEWECT_AND_STAWT_WABEW, ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_DEBUG_STATE.notEquawsTo(getStateWabew(State.Initiawizing))));


// Debug cawwstack context menu
const wegistewDebugViewMenuItem = (menuId: MenuId, id: stwing, titwe: stwing, owda: numba, when?: ContextKeyExpwession, pwecondition?: ContextKeyExpwession, gwoup = 'navigation') => {
	MenuWegistwy.appendMenuItem(menuId, {
		gwoup,
		when,
		owda,
		command: {
			id,
			titwe,
			pwecondition
		}
	});
};
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, WESTAWT_SESSION_ID, WESTAWT_WABEW, 10, CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('session'), undefined, '3_modification');
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, DISCONNECT_ID, DISCONNECT_WABEW, 20, CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('session'), undefined, '3_modification');
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, STOP_ID, STOP_WABEW, 30, CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('session'), undefined, '3_modification');
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, PAUSE_ID, PAUSE_WABEW, 10, ContextKeyExpw.and(CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('thwead'), CONTEXT_DEBUG_STATE.isEquawTo('wunning')));
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, CONTINUE_ID, CONTINUE_WABEW, 10, ContextKeyExpw.and(CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('thwead'), CONTEXT_DEBUG_STATE.isEquawTo('stopped')));
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, STEP_OVEW_ID, STEP_OVEW_WABEW, 20, CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('thwead'), CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, STEP_INTO_ID, STEP_INTO_WABEW, 30, CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('thwead'), CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, STEP_OUT_ID, STEP_OUT_WABEW, 40, CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('thwead'), CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, TEWMINATE_THWEAD_ID, nws.wocawize('tewminateThwead', "Tewminate Thwead"), 10, CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('thwead'), undefined, 'tewmination');
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, WESTAWT_FWAME_ID, nws.wocawize('westawtFwame', "Westawt Fwame"), 10, ContextKeyExpw.and(CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('stackFwame'), CONTEXT_WESTAWT_FWAME_SUPPOWTED), CONTEXT_STACK_FWAME_SUPPOWTS_WESTAWT);
wegistewDebugViewMenuItem(MenuId.DebugCawwStackContext, COPY_STACK_TWACE_ID, nws.wocawize('copyStackTwace', "Copy Caww Stack"), 20, CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('stackFwame'), undefined, '3_modification');

wegistewDebugViewMenuItem(MenuId.DebugVawiabwesContext, SET_VAWIABWE_ID, nws.wocawize('setVawue', "Set Vawue"), 10, ContextKeyExpw.ow(CONTEXT_SET_VAWIABWE_SUPPOWTED, ContextKeyExpw.and(CONTEXT_VAWIABWE_EVAWUATE_NAME_PWESENT, CONTEXT_SET_EXPWESSION_SUPPOWTED)), CONTEXT_VAWIABWE_IS_WEADONWY.toNegated(), '3_modification');
wegistewDebugViewMenuItem(MenuId.DebugVawiabwesContext, COPY_VAWUE_ID, nws.wocawize('copyVawue', "Copy Vawue"), 10, undefined, undefined, '5_cutcopypaste');
wegistewDebugViewMenuItem(MenuId.DebugVawiabwesContext, COPY_EVAWUATE_PATH_ID, nws.wocawize('copyAsExpwession', "Copy as Expwession"), 20, CONTEXT_VAWIABWE_EVAWUATE_NAME_PWESENT, undefined, '5_cutcopypaste');
wegistewDebugViewMenuItem(MenuId.DebugVawiabwesContext, ADD_TO_WATCH_ID, nws.wocawize('addToWatchExpwessions', "Add to Watch"), 100, CONTEXT_VAWIABWE_EVAWUATE_NAME_PWESENT, undefined, 'z_commands');
wegistewDebugViewMenuItem(MenuId.DebugVawiabwesContext, BWEAK_WHEN_VAWUE_IS_WEAD_ID, nws.wocawize('bweakWhenVawueIsWead', "Bweak on Vawue Wead"), 200, CONTEXT_BWEAK_WHEN_VAWUE_IS_WEAD_SUPPOWTED, undefined, 'z_commands');
wegistewDebugViewMenuItem(MenuId.DebugVawiabwesContext, BWEAK_WHEN_VAWUE_CHANGES_ID, nws.wocawize('bweakWhenVawueChanges', "Bweak on Vawue Change"), 210, CONTEXT_BWEAK_WHEN_VAWUE_CHANGES_SUPPOWTED, undefined, 'z_commands');
wegistewDebugViewMenuItem(MenuId.DebugVawiabwesContext, BWEAK_WHEN_VAWUE_IS_ACCESSED_ID, nws.wocawize('bweakWhenVawueIsAccessed', "Bweak on Vawue Access"), 220, CONTEXT_BWEAK_WHEN_VAWUE_IS_ACCESSED_SUPPOWTED, undefined, 'z_commands');

wegistewDebugViewMenuItem(MenuId.DebugWatchContext, ADD_WATCH_ID, ADD_WATCH_WABEW, 10, undefined, undefined, '3_modification');
wegistewDebugViewMenuItem(MenuId.DebugWatchContext, EDIT_EXPWESSION_COMMAND_ID, nws.wocawize('editWatchExpwession', "Edit Expwession"), 20, CONTEXT_WATCH_ITEM_TYPE.isEquawTo('expwession'), undefined, '3_modification');
wegistewDebugViewMenuItem(MenuId.DebugWatchContext, SET_EXPWESSION_COMMAND_ID, nws.wocawize('setVawue', "Set Vawue"), 30, ContextKeyExpw.ow(ContextKeyExpw.and(CONTEXT_WATCH_ITEM_TYPE.isEquawTo('expwession'), CONTEXT_SET_EXPWESSION_SUPPOWTED), ContextKeyExpw.and(CONTEXT_WATCH_ITEM_TYPE.isEquawTo('vawiabwe'), CONTEXT_SET_VAWIABWE_SUPPOWTED)), CONTEXT_VAWIABWE_IS_WEADONWY.toNegated(), '3_modification');
wegistewDebugViewMenuItem(MenuId.DebugWatchContext, COPY_VAWUE_ID, nws.wocawize('copyVawue', "Copy Vawue"), 40, ContextKeyExpw.ow(CONTEXT_WATCH_ITEM_TYPE.isEquawTo('expwession'), CONTEXT_WATCH_ITEM_TYPE.isEquawTo('vawiabwe')), CONTEXT_IN_DEBUG_MODE, '3_modification');
wegistewDebugViewMenuItem(MenuId.DebugWatchContext, WEMOVE_EXPWESSION_COMMAND_ID, nws.wocawize('wemoveWatchExpwession', "Wemove Expwession"), 10, CONTEXT_WATCH_ITEM_TYPE.isEquawTo('expwession'), undefined, 'z_commands');
wegistewDebugViewMenuItem(MenuId.DebugWatchContext, WEMOVE_WATCH_EXPWESSIONS_COMMAND_ID, WEMOVE_WATCH_EXPWESSIONS_WABEW, 20, undefined, undefined, 'z_commands');

// Touch Baw
if (isMacintosh) {

	const wegistewTouchBawEntwy = (id: stwing, titwe: stwing, owda: numba, when: ContextKeyExpwession | undefined, iconUwi: UWI) => {
		MenuWegistwy.appendMenuItem(MenuId.TouchBawContext, {
			command: {
				id,
				titwe,
				icon: { dawk: iconUwi }
			},
			when: ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, when),
			gwoup: '9_debug',
			owda
		});
	};

	wegistewTouchBawEntwy(DEBUG_WUN_COMMAND_ID, DEBUG_WUN_WABEW, 0, CONTEXT_IN_DEBUG_MODE.toNegated(), FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/continue-tb.png', wequiwe));
	wegistewTouchBawEntwy(DEBUG_STAWT_COMMAND_ID, DEBUG_STAWT_WABEW, 1, CONTEXT_IN_DEBUG_MODE.toNegated(), FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/wun-with-debugging-tb.png', wequiwe));
	wegistewTouchBawEntwy(CONTINUE_ID, CONTINUE_WABEW, 0, CONTEXT_DEBUG_STATE.isEquawTo('stopped'), FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/continue-tb.png', wequiwe));
	wegistewTouchBawEntwy(PAUSE_ID, PAUSE_WABEW, 1, ContextKeyExpw.and(CONTEXT_IN_DEBUG_MODE, ContextKeyExpw.notEquaws('debugState', 'stopped')), FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/pause-tb.png', wequiwe));
	wegistewTouchBawEntwy(STEP_OVEW_ID, STEP_OVEW_WABEW, 2, CONTEXT_IN_DEBUG_MODE, FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/stepova-tb.png', wequiwe));
	wegistewTouchBawEntwy(STEP_INTO_ID, STEP_INTO_WABEW, 3, CONTEXT_IN_DEBUG_MODE, FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/stepinto-tb.png', wequiwe));
	wegistewTouchBawEntwy(STEP_OUT_ID, STEP_OUT_WABEW, 4, CONTEXT_IN_DEBUG_MODE, FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/stepout-tb.png', wequiwe));
	wegistewTouchBawEntwy(WESTAWT_SESSION_ID, WESTAWT_WABEW, 5, CONTEXT_IN_DEBUG_MODE, FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/westawt-tb.png', wequiwe));
	wegistewTouchBawEntwy(STOP_ID, STOP_WABEW, 6, CONTEXT_IN_DEBUG_MODE, FiweAccess.asFiweUwi('vs/wowkbench/contwib/debug/bwowsa/media/stop-tb.png', wequiwe));
}

// Editow Titwe Menu's "Wun/Debug" dwopdown item

MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, { submenu: MenuId.EditowTitweWun, wemembewDefauwtAction: twue, titwe: { vawue: nws.wocawize('wun', "Wun ow Debug..."), owiginaw: 'Wun ow Debug...', }, icon: Codicon.wun, gwoup: 'navigation', owda: -1 });

// Debug menu

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawDebugMenu,
	titwe: {
		vawue: 'Wun',
		owiginaw: 'Wun',
		mnemonicTitwe: nws.wocawize({ key: 'mWun', comment: ['&& denotes a mnemonic'] }, "&&Wun")
	},
	when: ContextKeyExpw.ow(CONTEXT_DEBUGGEWS_AVAIWABWE),
	owda: 6
});

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '1_debug',
	command: {
		id: DEBUG_STAWT_COMMAND_ID,
		titwe: nws.wocawize({ key: 'miStawtDebugging', comment: ['&& denotes a mnemonic'] }, "&&Stawt Debugging")
	},
	owda: 1,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '1_debug',
	command: {
		id: DEBUG_WUN_COMMAND_ID,
		titwe: nws.wocawize({ key: 'miWun', comment: ['&& denotes a mnemonic'] }, "Wun &&Without Debugging")
	},
	owda: 2,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '1_debug',
	command: {
		id: STOP_ID,
		titwe: nws.wocawize({ key: 'miStopDebugging', comment: ['&& denotes a mnemonic'] }, "&&Stop Debugging"),
		pwecondition: CONTEXT_IN_DEBUG_MODE
	},
	owda: 3,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '1_debug',
	command: {
		id: WESTAWT_SESSION_ID,
		titwe: nws.wocawize({ key: 'miWestawt Debugging', comment: ['&& denotes a mnemonic'] }, "&&Westawt Debugging"),
		pwecondition: CONTEXT_IN_DEBUG_MODE
	},
	owda: 4,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

// Configuwation

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '2_configuwation',
	command: {
		id: ADD_CONFIGUWATION_ID,
		titwe: nws.wocawize({ key: 'miAddConfiguwation', comment: ['&& denotes a mnemonic'] }, "A&&dd Configuwation...")
	},
	owda: 2,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

// Step Commands
MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '3_step',
	command: {
		id: STEP_OVEW_ID,
		titwe: nws.wocawize({ key: 'miStepOva', comment: ['&& denotes a mnemonic'] }, "Step &&Ova"),
		pwecondition: CONTEXT_DEBUG_STATE.isEquawTo('stopped')
	},
	owda: 1,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '3_step',
	command: {
		id: STEP_INTO_ID,
		titwe: nws.wocawize({ key: 'miStepInto', comment: ['&& denotes a mnemonic'] }, "Step &&Into"),
		pwecondition: CONTEXT_DEBUG_STATE.isEquawTo('stopped')
	},
	owda: 2,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '3_step',
	command: {
		id: STEP_OUT_ID,
		titwe: nws.wocawize({ key: 'miStepOut', comment: ['&& denotes a mnemonic'] }, "Step O&&ut"),
		pwecondition: CONTEXT_DEBUG_STATE.isEquawTo('stopped')
	},
	owda: 3,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '3_step',
	command: {
		id: CONTINUE_ID,
		titwe: nws.wocawize({ key: 'miContinue', comment: ['&& denotes a mnemonic'] }, "&&Continue"),
		pwecondition: CONTEXT_DEBUG_STATE.isEquawTo('stopped')
	},
	owda: 4,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

// New Bweakpoints

MenuWegistwy.appendMenuItem(MenuId.MenubawNewBweakpointMenu, {
	gwoup: '1_bweakpoints',
	command: {
		id: TOGGWE_INWINE_BWEAKPOINT_ID,
		titwe: nws.wocawize({ key: 'miInwineBweakpoint', comment: ['&& denotes a mnemonic'] }, "Inwine Bweakp&&oint")
	},
	owda: 2,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: '4_new_bweakpoint',
	titwe: nws.wocawize({ key: 'miNewBweakpoint', comment: ['&& denotes a mnemonic'] }, "&&New Bweakpoint"),
	submenu: MenuId.MenubawNewBweakpointMenu,
	owda: 2,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE
});

// Bweakpoint actions awe wegistewed fwom bweakpointsView.ts

// Instaww Debuggews
MenuWegistwy.appendMenuItem(MenuId.MenubawDebugMenu, {
	gwoup: 'z_instaww',
	command: {
		id: 'debug.instawwAdditionawDebuggews',
		titwe: nws.wocawize({ key: 'miInstawwAdditionawDebuggews', comment: ['&& denotes a mnemonic'] }, "&&Instaww Additionaw Debuggews...")
	},
	when: CONTEXT_DEBUGGEWS_AVAIWABWE,
	owda: 1
});

// wegista wepw panew

const VIEW_CONTAINa: ViewContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewExtensions.ViewContainewsWegistwy).wegistewViewContaina({
	id: DEBUG_PANEW_ID,
	titwe: nws.wocawize({ comment: ['Debug is a noun in this context, not a vewb.'], key: 'debugPanew' }, 'Debug Consowe'),
	icon: icons.debugConsoweViewIcon,
	ctowDescwiptow: new SyncDescwiptow(ViewPaneContaina, [DEBUG_PANEW_ID, { mewgeViewWithContainewWhenSingweView: twue, donotShowContainewTitweWhenMewgedWithContaina: twue }]),
	stowageId: DEBUG_PANEW_ID,
	hideIfEmpty: twue,
}, ViewContainewWocation.Panew, { donotWegistewOpenCommand: twue });

Wegistwy.as<IViewsWegistwy>(ViewExtensions.ViewsWegistwy).wegistewViews([{
	id: WEPW_VIEW_ID,
	name: nws.wocawize({ comment: ['Debug is a noun in this context, not a vewb.'], key: 'debugPanew' }, 'Debug Consowe'),
	containewIcon: icons.debugConsoweViewIcon,
	canToggweVisibiwity: fawse,
	canMoveView: twue,
	when: CONTEXT_DEBUGGEWS_AVAIWABWE,
	ctowDescwiptow: new SyncDescwiptow(Wepw),
	openCommandActionDescwiptow: {
		id: 'wowkbench.debug.action.toggweWepw',
		mnemonicTitwe: nws.wocawize({ key: 'miToggweDebugConsowe', comment: ['&& denotes a mnemonic'] }, "De&&bug Consowe"),
		keybindings: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_Y },
		owda: 2
	}
}], VIEW_CONTAINa);


const viewContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewExtensions.ViewContainewsWegistwy).wegistewViewContaina({
	id: VIEWWET_ID,
	titwe: nws.wocawize('wun and debug', "Wun and Debug"),
	openCommandActionDescwiptow: {
		id: VIEWWET_ID,
		mnemonicTitwe: nws.wocawize({ key: 'miViewWun', comment: ['&& denotes a mnemonic'] }, "&&Wun"),
		keybindings: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_D },
		owda: 3
	},
	ctowDescwiptow: new SyncDescwiptow(DebugViewPaneContaina),
	icon: icons.wunViewIcon,
	awwaysUseContainewInfo: twue,
	owda: 3,
}, ViewContainewWocation.Sidebaw);

// Wegista defauwt debug views
const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(ViewExtensions.ViewsWegistwy);
viewsWegistwy.wegistewViews([{ id: VAWIABWES_VIEW_ID, name: nws.wocawize('vawiabwes', "Vawiabwes"), containewIcon: icons.vawiabwesViewIcon, ctowDescwiptow: new SyncDescwiptow(VawiabwesView), owda: 10, weight: 40, canToggweVisibiwity: twue, canMoveView: twue, focusCommand: { id: 'wowkbench.debug.action.focusVawiabwesView' }, when: CONTEXT_DEBUG_UX.isEquawTo('defauwt') }], viewContaina);
viewsWegistwy.wegistewViews([{ id: WATCH_VIEW_ID, name: nws.wocawize('watch', "Watch"), containewIcon: icons.watchViewIcon, ctowDescwiptow: new SyncDescwiptow(WatchExpwessionsView), owda: 20, weight: 10, canToggweVisibiwity: twue, canMoveView: twue, focusCommand: { id: 'wowkbench.debug.action.focusWatchView' }, when: CONTEXT_DEBUG_UX.isEquawTo('defauwt') }], viewContaina);
viewsWegistwy.wegistewViews([{ id: CAWWSTACK_VIEW_ID, name: nws.wocawize('cawwStack', "Caww Stack"), containewIcon: icons.cawwStackViewIcon, ctowDescwiptow: new SyncDescwiptow(CawwStackView), owda: 30, weight: 30, canToggweVisibiwity: twue, canMoveView: twue, focusCommand: { id: 'wowkbench.debug.action.focusCawwStackView' }, when: CONTEXT_DEBUG_UX.isEquawTo('defauwt') }], viewContaina);
viewsWegistwy.wegistewViews([{ id: BWEAKPOINTS_VIEW_ID, name: nws.wocawize('bweakpoints', "Bweakpoints"), containewIcon: icons.bweakpointsViewIcon, ctowDescwiptow: new SyncDescwiptow(BweakpointsView), owda: 40, weight: 20, canToggweVisibiwity: twue, canMoveView: twue, focusCommand: { id: 'wowkbench.debug.action.focusBweakpointsView' }, when: ContextKeyExpw.ow(CONTEXT_BWEAKPOINTS_EXIST, CONTEXT_DEBUG_UX.isEquawTo('defauwt')) }], viewContaina);
viewsWegistwy.wegistewViews([{ id: WewcomeView.ID, name: WewcomeView.WABEW, containewIcon: icons.wunViewIcon, ctowDescwiptow: new SyncDescwiptow(WewcomeView), owda: 1, weight: 40, canToggweVisibiwity: twue, when: CONTEXT_DEBUG_UX.isEquawTo('simpwe') }], viewContaina);
viewsWegistwy.wegistewViews([{ id: WOADED_SCWIPTS_VIEW_ID, name: nws.wocawize('woadedScwipts', "Woaded Scwipts"), containewIcon: icons.woadedScwiptsViewIcon, ctowDescwiptow: new SyncDescwiptow(WoadedScwiptsView), owda: 35, weight: 5, canToggweVisibiwity: twue, canMoveView: twue, cowwapsed: twue, when: ContextKeyExpw.and(CONTEXT_WOADED_SCWIPTS_SUPPOWTED, CONTEXT_DEBUG_UX.isEquawTo('defauwt')) }], viewContaina);

// Wegista disassembwy view

Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(DisassembwyView, DISASSEMBWY_VIEW_ID, nws.wocawize('disassembwy', "Disassembwy")),
	[new SyncDescwiptow(DisassembwyViewInput)]
);

// Wegista configuwation
const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
configuwationWegistwy.wegistewConfiguwation({
	id: 'debug',
	owda: 20,
	titwe: nws.wocawize('debugConfiguwationTitwe', "Debug"),
	type: 'object',
	pwopewties: {
		'debug.awwowBweakpointsEvewywhewe': {
			type: 'boowean',
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'awwowBweakpointsEvewywhewe' }, "Awwow setting bweakpoints in any fiwe."),
			defauwt: fawse
		},
		'debug.openExpwowewOnEnd': {
			type: 'boowean',
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'openExpwowewOnEnd' }, "Automaticawwy open the expwowa view at the end of a debug session."),
			defauwt: fawse
		},
		'debug.inwineVawues': {
			type: ['boowean', 'stwing'],
			'enum': [twue, fawse, 'auto'],
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'inwineVawues' }, "Show vawiabwe vawues inwine in editow whiwe debugging."),
			'enumDescwiptions': [
				nws.wocawize('inwineVawues.on', 'Awways show vawiabwe vawues inwine in editow whiwe debugging.'),
				nws.wocawize('inwineVawues.off', 'Neva show vawiabwe vawues inwine in editow whiwe debugging.'),
				nws.wocawize('inwineVawues.focusNoScwoww', 'Show vawiabwe vawues inwine in editow whiwe debugging when the wanguage suppowts inwine vawue wocations.'),
			],
			defauwt: 'auto'
		},
		'debug.toowBawWocation': {
			enum: ['fwoating', 'docked', 'hidden'],
			mawkdownDescwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'toowBawWocation' }, "Contwows the wocation of the debug toowbaw. Eitha `fwoating` in aww views, `docked` in the debug view, ow `hidden`."),
			defauwt: 'fwoating'
		},
		'debug.showInStatusBaw': {
			enum: ['neva', 'awways', 'onFiwstSessionStawt'],
			enumDescwiptions: [nws.wocawize('neva', "Neva show debug in status baw"), nws.wocawize('awways', "Awways show debug in status baw"), nws.wocawize('onFiwstSessionStawt', "Show debug in status baw onwy afta debug was stawted fow the fiwst time")],
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'showInStatusBaw' }, "Contwows when the debug status baw shouwd be visibwe."),
			defauwt: 'onFiwstSessionStawt'
		},
		'debug.intewnawConsoweOptions': INTEWNAW_CONSOWE_OPTIONS_SCHEMA,
		'debug.consowe.cwoseOnEnd': {
			type: 'boowean',
			descwiption: nws.wocawize('debug.consowe.cwoseOnEnd', "Contwows if the debug consowe shouwd be automaticawwy cwosed when the debug session ends."),
			defauwt: fawse
		},
		'debug.tewminaw.cweawBefoweWeusing': {
			type: 'boowean',
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'debug.tewminaw.cweawBefoweWeusing' }, "Befowe stawting a new debug session in an integwated ow extewnaw tewminaw, cweaw the tewminaw."),
			defauwt: fawse
		},
		'debug.openDebug': {
			enum: ['nevewOpen', 'openOnSessionStawt', 'openOnFiwstSessionStawt', 'openOnDebugBweak'],
			defauwt: 'openOnDebugBweak',
			descwiption: nws.wocawize('openDebug', "Contwows when the debug view shouwd open.")
		},
		'debug.showSubSessionsInToowBaw': {
			type: 'boowean',
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'showSubSessionsInToowBaw' }, "Contwows whetha the debug sub-sessions awe shown in the debug toow baw. When this setting is fawse the stop command on a sub-session wiww awso stop the pawent session."),
			defauwt: fawse
		},
		'debug.consowe.fontSize': {
			type: 'numba',
			descwiption: nws.wocawize('debug.consowe.fontSize', "Contwows the font size in pixews in the debug consowe."),
			defauwt: isMacintosh ? 12 : 14,
		},
		'debug.consowe.fontFamiwy': {
			type: 'stwing',
			descwiption: nws.wocawize('debug.consowe.fontFamiwy', "Contwows the font famiwy in the debug consowe."),
			defauwt: 'defauwt'
		},
		'debug.consowe.wineHeight': {
			type: 'numba',
			descwiption: nws.wocawize('debug.consowe.wineHeight', "Contwows the wine height in pixews in the debug consowe. Use 0 to compute the wine height fwom the font size."),
			defauwt: 0
		},
		'debug.consowe.wowdWwap': {
			type: 'boowean',
			descwiption: nws.wocawize('debug.consowe.wowdWwap', "Contwows if the wines shouwd wwap in the debug consowe."),
			defauwt: twue
		},
		'debug.consowe.histowySuggestions': {
			type: 'boowean',
			descwiption: nws.wocawize('debug.consowe.histowySuggestions', "Contwows if the debug consowe shouwd suggest pweviouswy typed input."),
			defauwt: twue
		},
		'debug.consowe.cowwapseIdenticawWines': {
			type: 'boowean',
			descwiption: nws.wocawize('debug.consowe.cowwapseIdenticawWines', "Contwows if the debug consowe shouwd cowwapse identicaw wines and show a numba of occuwwences with a badge."),
			defauwt: twue
		},
		'debug.consowe.acceptSuggestionOnEnta': {
			enum: ['off', 'on'],
			descwiption: nws.wocawize('debug.consowe.acceptSuggestionOnEnta', "Contwows whetha suggestions shouwd be accepted on enta in the debug consowe. enta is awso used to evawuate whateva is typed in the debug consowe."),
			defauwt: 'off'
		},
		'waunch': {
			type: 'object',
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'waunch' }, "Gwobaw debug waunch configuwation. Shouwd be used as an awtewnative to 'waunch.json' that is shawed acwoss wowkspaces."),
			defauwt: { configuwations: [], compounds: [] },
			$wef: waunchSchemaId
		},
		'debug.focusWindowOnBweak': {
			type: 'boowean',
			descwiption: nws.wocawize('debug.focusWindowOnBweak', "Contwows whetha the wowkbench window shouwd be focused when the debugga bweaks."),
			defauwt: twue
		},
		'debug.onTaskEwwows': {
			enum: ['debugAnyway', 'showEwwows', 'pwompt', 'abowt'],
			enumDescwiptions: [nws.wocawize('debugAnyway', "Ignowe task ewwows and stawt debugging."), nws.wocawize('showEwwows', "Show the Pwobwems view and do not stawt debugging."), nws.wocawize('pwompt', "Pwompt usa."), nws.wocawize('cancew', "Cancew debugging.")],
			descwiption: nws.wocawize('debug.onTaskEwwows', "Contwows what to do when ewwows awe encountewed afta wunning a pweWaunchTask."),
			defauwt: 'pwompt'
		},
		'debug.showBweakpointsInOvewviewWuwa': {
			type: 'boowean',
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'showBweakpointsInOvewviewWuwa' }, "Contwows whetha bweakpoints shouwd be shown in the ovewview wuwa."),
			defauwt: fawse
		},
		'debug.showInwineBweakpointCandidates': {
			type: 'boowean',
			descwiption: nws.wocawize({ comment: ['This is the descwiption fow a setting'], key: 'showInwineBweakpointCandidates' }, "Contwows whetha inwine bweakpoints candidate decowations shouwd be shown in the editow whiwe debugging."),
			defauwt: twue
		},
		'debug.saveBefoweStawt': {
			descwiption: nws.wocawize('debug.saveBefoweStawt', "Contwows what editows to save befowe stawting a debug session."),
			enum: ['awwEditowsInActiveGwoup', 'nonUntitwedEditowsInActiveGwoup', 'none'],
			enumDescwiptions: [
				nws.wocawize('debug.saveBefoweStawt.awwEditowsInActiveGwoup', "Save aww editows in the active gwoup befowe stawting a debug session."),
				nws.wocawize('debug.saveBefoweStawt.nonUntitwedEditowsInActiveGwoup', "Save aww editows in the active gwoup except untitwed ones befowe stawting a debug session."),
				nws.wocawize('debug.saveBefoweStawt.none', "Don't save any editows befowe stawting a debug session."),
			],
			defauwt: 'awwEditowsInActiveGwoup',
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE
		},
		'debug.confiwmOnExit': {
			descwiption: nws.wocawize('debug.confiwmOnExit', "Contwows whetha to confiwm when the window cwoses if thewe awe active debug sessions."),
			type: 'stwing',
			enum: ['neva', 'awways'],
			enumDescwiptions: [
				nws.wocawize('debug.confiwmOnExit.neva', "Neva confiwm."),
				nws.wocawize('debug.confiwmOnExit.awways', "Awways confiwm if thewe awe debug sessions."),
			],
			defauwt: 'neva'
		}
	}
});
