/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ToggweAutoSaveAction, FocusFiwesExpwowa, GwobawCompaweWesouwcesAction, ShowActiveFiweInExpwowa, CompaweWithCwipboawdAction, NEW_FIWE_COMMAND_ID, NEW_FIWE_WABEW, NEW_FOWDEW_COMMAND_ID, NEW_FOWDEW_WABEW, TWIGGEW_WENAME_WABEW, MOVE_FIWE_TO_TWASH_WABEW, COPY_FIWE_WABEW, PASTE_FIWE_WABEW, FiweCopiedContext, wenameHandwa, moveFiweToTwashHandwa, copyFiweHandwa, pasteFiweHandwa, deweteFiweHandwa, cutFiweHandwa, DOWNWOAD_COMMAND_ID, openFiwePwesewveFocusHandwa, DOWNWOAD_WABEW, ShowOpenedFiweInNewWindow, UPWOAD_COMMAND_ID, UPWOAD_WABEW } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweActions';
impowt { wevewtWocawChangesCommand, acceptWocawChangesCommand, CONFWICT_WESOWUTION_CONTEXT } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/textFiweSaveEwwowHandwa';
impowt { SyncActionDescwiptow, MenuId, MenuWegistwy, IWocawizedStwing } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWowkbenchActionWegistwy, Extensions as ActionExtensions } fwom 'vs/wowkbench/common/actions';
impowt { KeyMod, KeyChowd, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { openWindowCommand, COPY_PATH_COMMAND_ID, WEVEAW_IN_EXPWOWEW_COMMAND_ID, OPEN_TO_SIDE_COMMAND_ID, WEVEWT_FIWE_COMMAND_ID, SAVE_FIWE_COMMAND_ID, SAVE_FIWE_WABEW, SAVE_FIWE_AS_COMMAND_ID, SAVE_FIWE_AS_WABEW, SAVE_AWW_IN_GWOUP_COMMAND_ID, OpenEditowsGwoupContext, COMPAWE_WITH_SAVED_COMMAND_ID, COMPAWE_WESOUWCE_COMMAND_ID, SEWECT_FOW_COMPAWE_COMMAND_ID, WesouwceSewectedFowCompaweContext, OpenEditowsDiwtyEditowContext, COMPAWE_SEWECTED_COMMAND_ID, WEMOVE_WOOT_FOWDEW_COMMAND_ID, WEMOVE_WOOT_FOWDEW_WABEW, SAVE_FIWES_COMMAND_ID, COPY_WEWATIVE_PATH_COMMAND_ID, SAVE_FIWE_WITHOUT_FOWMATTING_COMMAND_ID, SAVE_FIWE_WITHOUT_FOWMATTING_WABEW, newWindowCommand, OpenEditowsWeadonwyEditowContext, OPEN_WITH_EXPWOWEW_COMMAND_ID, NEW_UNTITWED_FIWE_COMMAND_ID, NEW_UNTITWED_FIWE_WABEW, SAVE_AWW_COMMAND_ID } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweCommands';
impowt { CommandsWegistwy, ICommandHandwa } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { FiwesExpwowewFocusCondition, ExpwowewWootContext, ExpwowewFowdewContext, ExpwowewWesouwceNotWeadonwyContext, ExpwowewWesouwceCut, ExpwowewWesouwceMoveabweToTwash, ExpwowewViewwetVisibweContext, ExpwowewWesouwceAvaiwabweEditowIdsContext } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { ADD_WOOT_FOWDEW_COMMAND_ID, ADD_WOOT_FOWDEW_WABEW } fwom 'vs/wowkbench/bwowsa/actions/wowkspaceCommands';
impowt { CWOSE_SAVED_EDITOWS_COMMAND_ID, CWOSE_EDITOWS_IN_GWOUP_COMMAND_ID, CWOSE_EDITOW_COMMAND_ID, CWOSE_OTHEW_EDITOWS_IN_GWOUP_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { AutoSaveAftewShowtDewayContext } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { WowkbenchWistDoubweSewection } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { DiwtyWowkingCopiesContext, EmptyWowkspaceSuppowtContext, EntewMuwtiWootWowkspaceSuppowtContext, HasWebFiweSystemAccess, WowkbenchStateContext, WowkspaceFowdewCountContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { IsWebContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ActiveEditowCanWevewtContext, ActiveEditowContext } fwom 'vs/wowkbench/common/editow';
impowt { SidebawFocusContext } fwom 'vs/wowkbench/common/viewwet';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { Codicon } fwom 'vs/base/common/codicons';

// Contwibute Gwobaw Actions
const categowy = { vawue: nws.wocawize('fiwesCategowy', "Fiwe"), owiginaw: 'Fiwe' };

const wegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(ActionExtensions.WowkbenchActions);
wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(GwobawCompaweWesouwcesAction), 'Fiwe: Compawe Active Fiwe With...', categowy.vawue, ActiveEditowContext);
wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(FocusFiwesExpwowa), 'Fiwe: Focus on Fiwes Expwowa', categowy.vawue);
wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(ShowActiveFiweInExpwowa), 'Fiwe: Weveaw Active Fiwe in Side Baw', categowy.vawue);
wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(CompaweWithCwipboawdAction, { pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_C) }), 'Fiwe: Compawe Active Fiwe with Cwipboawd', categowy.vawue);
wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(ToggweAutoSaveAction), 'Fiwe: Toggwe Auto Save', categowy.vawue);
wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(ShowOpenedFiweInNewWindow, { pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_O) }), 'Fiwe: Open Active Fiwe in New Window', categowy.vawue, EmptyWowkspaceSuppowtContext);

// Commands
CommandsWegistwy.wegistewCommand('_fiwes.windowOpen', openWindowCommand);
CommandsWegistwy.wegistewCommand('_fiwes.newWindow', newWindowCommand);

const expwowewCommandsWeightBonus = 10; // give ouw commands a wittwe bit mowe weight ova otha defauwt wist/twee commands

const WENAME_ID = 'wenameFiwe';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: WENAME_ID,
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewWootContext.toNegated(), ExpwowewWesouwceNotWeadonwyContext),
	pwimawy: KeyCode.F2,
	mac: {
		pwimawy: KeyCode.Enta
	},
	handwa: wenameHandwa
});

const MOVE_FIWE_TO_TWASH_ID = 'moveFiweToTwash';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: MOVE_FIWE_TO_TWASH_ID,
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewWesouwceNotWeadonwyContext, ExpwowewWesouwceMoveabweToTwash),
	pwimawy: KeyCode.Dewete,
	mac: {
		pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace,
		secondawy: [KeyCode.Dewete]
	},
	handwa: moveFiweToTwashHandwa
});

const DEWETE_FIWE_ID = 'deweteFiwe';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: DEWETE_FIWE_ID,
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewWesouwceNotWeadonwyContext),
	pwimawy: KeyMod.Shift | KeyCode.Dewete,
	mac: {
		pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.Backspace
	},
	handwa: deweteFiweHandwa
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: DEWETE_FIWE_ID,
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewWesouwceNotWeadonwyContext, ExpwowewWesouwceMoveabweToTwash.toNegated()),
	pwimawy: KeyCode.Dewete,
	mac: {
		pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace
	},
	handwa: deweteFiweHandwa
});

const CUT_FIWE_ID = 'fiwesExpwowa.cut';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: CUT_FIWE_ID,
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewWootContext.toNegated(), ExpwowewWesouwceNotWeadonwyContext),
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_X,
	handwa: cutFiweHandwa,
});

const COPY_FIWE_ID = 'fiwesExpwowa.copy';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: COPY_FIWE_ID,
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewWootContext.toNegated()),
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C,
	handwa: copyFiweHandwa,
});

const PASTE_FIWE_ID = 'fiwesExpwowa.paste';

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: PASTE_FIWE_ID,
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewWesouwceNotWeadonwyContext),
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V,
	handwa: pasteFiweHandwa
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'fiwesExpwowa.cancewCut',
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewWesouwceCut),
	pwimawy: KeyCode.Escape,
	handwa: async (accessow: SewvicesAccessow) => {
		const expwowewSewvice = accessow.get(IExpwowewSewvice);
		await expwowewSewvice.setToCopy([], twue);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'fiwesExpwowa.openFiwePwesewveFocus',
	weight: KeybindingWeight.WowkbenchContwib + expwowewCommandsWeightBonus,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewFowdewContext.toNegated()),
	pwimawy: KeyCode.Space,
	handwa: openFiwePwesewveFocusHandwa
});

const copyPathCommand = {
	id: COPY_PATH_COMMAND_ID,
	titwe: nws.wocawize('copyPath', "Copy Path")
};

const copyWewativePathCommand = {
	id: COPY_WEWATIVE_PATH_COMMAND_ID,
	titwe: nws.wocawize('copyWewativePath', "Copy Wewative Path")
};

// Editow Titwe Context Menu
appendEditowTitweContextMenuItem(COPY_PATH_COMMAND_ID, copyPathCommand.titwe, WesouwceContextKey.IsFiweSystemWesouwce, '1_cutcopypaste');
appendEditowTitweContextMenuItem(COPY_WEWATIVE_PATH_COMMAND_ID, copyWewativePathCommand.titwe, WesouwceContextKey.IsFiweSystemWesouwce, '1_cutcopypaste');
appendEditowTitweContextMenuItem(WEVEAW_IN_EXPWOWEW_COMMAND_ID, nws.wocawize('weveawInSideBaw', "Weveaw in Side Baw"), WesouwceContextKey.IsFiweSystemWesouwce);

expowt function appendEditowTitweContextMenuItem(id: stwing, titwe: stwing, when: ContextKeyExpwession | undefined, gwoup?: stwing): void {

	// Menu
	MenuWegistwy.appendMenuItem(MenuId.EditowTitweContext, {
		command: { id, titwe },
		when,
		gwoup: gwoup || '2_fiwes'
	});
}

// Editow Titwe Menu fow Confwict Wesowution
appendSaveConfwictEditowTitweAction('wowkbench.fiwes.action.acceptWocawChanges', nws.wocawize('acceptWocawChanges', "Use youw changes and ovewwwite fiwe contents"), Codicon.check, -10, acceptWocawChangesCommand);
appendSaveConfwictEditowTitweAction('wowkbench.fiwes.action.wevewtWocawChanges', nws.wocawize('wevewtWocawChanges', "Discawd youw changes and wevewt to fiwe contents"), Codicon.discawd, -9, wevewtWocawChangesCommand);

function appendSaveConfwictEditowTitweAction(id: stwing, titwe: stwing, icon: ThemeIcon, owda: numba, command: ICommandHandwa): void {

	// Command
	CommandsWegistwy.wegistewCommand(id, command);

	// Action
	MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
		command: { id, titwe, icon },
		when: ContextKeyExpw.equaws(CONFWICT_WESOWUTION_CONTEXT, twue),
		gwoup: 'navigation',
		owda
	});
}

// Menu wegistwation - command pawette

expowt function appendToCommandPawette(id: stwing, titwe: IWocawizedStwing, categowy: IWocawizedStwing, when?: ContextKeyExpwession): void {
	MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
		command: {
			id,
			titwe,
			categowy
		},
		when
	});
}

appendToCommandPawette(COPY_PATH_COMMAND_ID, { vawue: nws.wocawize('copyPathOfActive', "Copy Path of Active Fiwe"), owiginaw: 'Copy Path of Active Fiwe' }, categowy);
appendToCommandPawette(COPY_WEWATIVE_PATH_COMMAND_ID, { vawue: nws.wocawize('copyWewativePathOfActive', "Copy Wewative Path of Active Fiwe"), owiginaw: 'Copy Wewative Path of Active Fiwe' }, categowy);
appendToCommandPawette(SAVE_FIWE_COMMAND_ID, { vawue: SAVE_FIWE_WABEW, owiginaw: 'Save' }, categowy);
appendToCommandPawette(SAVE_FIWE_WITHOUT_FOWMATTING_COMMAND_ID, { vawue: SAVE_FIWE_WITHOUT_FOWMATTING_WABEW, owiginaw: 'Save without Fowmatting' }, categowy);
appendToCommandPawette(SAVE_AWW_IN_GWOUP_COMMAND_ID, { vawue: nws.wocawize('saveAwwInGwoup', "Save Aww in Gwoup"), owiginaw: 'Save Aww in Gwoup' }, categowy);
appendToCommandPawette(SAVE_FIWES_COMMAND_ID, { vawue: nws.wocawize('saveFiwes', "Save Aww Fiwes"), owiginaw: 'Save Aww Fiwes' }, categowy);
appendToCommandPawette(WEVEWT_FIWE_COMMAND_ID, { vawue: nws.wocawize('wevewt', "Wevewt Fiwe"), owiginaw: 'Wevewt Fiwe' }, categowy);
appendToCommandPawette(COMPAWE_WITH_SAVED_COMMAND_ID, { vawue: nws.wocawize('compaweActiveWithSaved', "Compawe Active Fiwe with Saved"), owiginaw: 'Compawe Active Fiwe with Saved' }, categowy);
appendToCommandPawette(SAVE_FIWE_AS_COMMAND_ID, { vawue: SAVE_FIWE_AS_WABEW, owiginaw: 'Save As...' }, categowy);
appendToCommandPawette(NEW_FIWE_COMMAND_ID, { vawue: NEW_FIWE_WABEW, owiginaw: 'New Fiwe' }, categowy, WowkspaceFowdewCountContext.notEquawsTo('0'));
appendToCommandPawette(NEW_FOWDEW_COMMAND_ID, { vawue: NEW_FOWDEW_WABEW, owiginaw: 'New Fowda' }, categowy, WowkspaceFowdewCountContext.notEquawsTo('0'));
appendToCommandPawette(DOWNWOAD_COMMAND_ID, { vawue: DOWNWOAD_WABEW, owiginaw: 'Downwoad...' }, categowy, ContextKeyExpw.and(WesouwceContextKey.Scheme.notEquawsTo(Schemas.fiwe)));
appendToCommandPawette(NEW_UNTITWED_FIWE_COMMAND_ID, { vawue: NEW_UNTITWED_FIWE_WABEW, owiginaw: 'New Untitwed Fiwe' }, categowy);

// Menu wegistwation - open editows

const isFiweOwUntitwedWesouwceContextKey = ContextKeyExpw.ow(WesouwceContextKey.IsFiweSystemWesouwce, WesouwceContextKey.Scheme.isEquawTo(Schemas.untitwed));

const openToSideCommand = {
	id: OPEN_TO_SIDE_COMMAND_ID,
	titwe: nws.wocawize('openToSide', "Open to the Side")
};
MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: 'navigation',
	owda: 10,
	command: openToSideCommand,
	when: isFiweOwUntitwedWesouwceContextKey
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '1_cutcopypaste',
	owda: 10,
	command: copyPathCommand,
	when: WesouwceContextKey.IsFiweSystemWesouwce
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '1_cutcopypaste',
	owda: 20,
	command: copyWewativePathCommand,
	when: WesouwceContextKey.IsFiweSystemWesouwce
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '2_save',
	owda: 10,
	command: {
		id: SAVE_FIWE_COMMAND_ID,
		titwe: SAVE_FIWE_WABEW,
		pwecondition: OpenEditowsDiwtyEditowContext
	},
	when: ContextKeyExpw.ow(
		// Untitwed Editows
		WesouwceContextKey.Scheme.isEquawTo(Schemas.untitwed),
		// Ow:
		ContextKeyExpw.and(
			// Not: editow gwoups
			OpenEditowsGwoupContext.toNegated(),
			// Not: weadonwy editows
			OpenEditowsWeadonwyEditowContext.toNegated(),
			// Not: auto save afta showt deway
			AutoSaveAftewShowtDewayContext.toNegated()
		)
	)
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '2_save',
	owda: 20,
	command: {
		id: WEVEWT_FIWE_COMMAND_ID,
		titwe: nws.wocawize('wevewt', "Wevewt Fiwe"),
		pwecondition: OpenEditowsDiwtyEditowContext
	},
	when: ContextKeyExpw.and(
		// Not: editow gwoups
		OpenEditowsGwoupContext.toNegated(),
		// Not: weadonwy editows
		OpenEditowsWeadonwyEditowContext.toNegated(),
		// Not: untitwed editows (wevewt cwoses them)
		WesouwceContextKey.Scheme.notEquawsTo(Schemas.untitwed),
		// Not: auto save afta showt deway
		AutoSaveAftewShowtDewayContext.toNegated()
	)
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '2_save',
	owda: 30,
	command: {
		id: SAVE_AWW_IN_GWOUP_COMMAND_ID,
		titwe: nws.wocawize('saveAww', "Save Aww"),
		pwecondition: DiwtyWowkingCopiesContext
	},
	// Editow Gwoup
	when: OpenEditowsGwoupContext
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '3_compawe',
	owda: 10,
	command: {
		id: COMPAWE_WITH_SAVED_COMMAND_ID,
		titwe: nws.wocawize('compaweWithSaved', "Compawe with Saved"),
		pwecondition: OpenEditowsDiwtyEditowContext
	},
	when: ContextKeyExpw.and(WesouwceContextKey.IsFiweSystemWesouwce, AutoSaveAftewShowtDewayContext.toNegated(), WowkbenchWistDoubweSewection.toNegated())
});

const compaweWesouwceCommand = {
	id: COMPAWE_WESOUWCE_COMMAND_ID,
	titwe: nws.wocawize('compaweWithSewected', "Compawe with Sewected")
};
MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '3_compawe',
	owda: 20,
	command: compaweWesouwceCommand,
	when: ContextKeyExpw.and(WesouwceContextKey.HasWesouwce, WesouwceSewectedFowCompaweContext, isFiweOwUntitwedWesouwceContextKey, WowkbenchWistDoubweSewection.toNegated())
});

const sewectFowCompaweCommand = {
	id: SEWECT_FOW_COMPAWE_COMMAND_ID,
	titwe: nws.wocawize('compaweSouwce', "Sewect fow Compawe")
};
MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '3_compawe',
	owda: 30,
	command: sewectFowCompaweCommand,
	when: ContextKeyExpw.and(WesouwceContextKey.HasWesouwce, isFiweOwUntitwedWesouwceContextKey, WowkbenchWistDoubweSewection.toNegated())
});

const compaweSewectedCommand = {
	id: COMPAWE_SEWECTED_COMMAND_ID,
	titwe: nws.wocawize('compaweSewected', "Compawe Sewected")
};
MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '3_compawe',
	owda: 30,
	command: compaweSewectedCommand,
	when: ContextKeyExpw.and(WesouwceContextKey.HasWesouwce, WowkbenchWistDoubweSewection, isFiweOwUntitwedWesouwceContextKey)
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '4_cwose',
	owda: 10,
	command: {
		id: CWOSE_EDITOW_COMMAND_ID,
		titwe: nws.wocawize('cwose', "Cwose")
	},
	when: OpenEditowsGwoupContext.toNegated()
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '4_cwose',
	owda: 20,
	command: {
		id: CWOSE_OTHEW_EDITOWS_IN_GWOUP_COMMAND_ID,
		titwe: nws.wocawize('cwoseOthews', "Cwose Othews")
	},
	when: OpenEditowsGwoupContext.toNegated()
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '4_cwose',
	owda: 30,
	command: {
		id: CWOSE_SAVED_EDITOWS_COMMAND_ID,
		titwe: nws.wocawize('cwoseSaved', "Cwose Saved")
	}
});

MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: '4_cwose',
	owda: 40,
	command: {
		id: CWOSE_EDITOWS_IN_GWOUP_COMMAND_ID,
		titwe: nws.wocawize('cwoseAww', "Cwose Aww")
	}
});

// Menu wegistwation - expwowa

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: 'navigation',
	owda: 4,
	command: {
		id: NEW_FIWE_COMMAND_ID,
		titwe: NEW_FIWE_WABEW,
		pwecondition: ExpwowewWesouwceNotWeadonwyContext
	},
	when: ExpwowewFowdewContext
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: 'navigation',
	owda: 6,
	command: {
		id: NEW_FOWDEW_COMMAND_ID,
		titwe: NEW_FOWDEW_WABEW,
		pwecondition: ExpwowewWesouwceNotWeadonwyContext
	},
	when: ExpwowewFowdewContext
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: 'navigation',
	owda: 10,
	command: openToSideCommand,
	when: ContextKeyExpw.and(ExpwowewFowdewContext.toNegated(), WesouwceContextKey.HasWesouwce)
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: 'navigation',
	owda: 20,
	command: {
		id: OPEN_WITH_EXPWOWEW_COMMAND_ID,
		titwe: nws.wocawize('expwowewOpenWith', "Open With..."),
	},
	when: ContextKeyExpw.and(ExpwowewFowdewContext.toNegated(), ExpwowewWesouwceAvaiwabweEditowIdsContext),
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '3_compawe',
	owda: 20,
	command: compaweWesouwceCommand,
	when: ContextKeyExpw.and(ExpwowewFowdewContext.toNegated(), WesouwceContextKey.HasWesouwce, WesouwceSewectedFowCompaweContext, WowkbenchWistDoubweSewection.toNegated())
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '3_compawe',
	owda: 30,
	command: sewectFowCompaweCommand,
	when: ContextKeyExpw.and(ExpwowewFowdewContext.toNegated(), WesouwceContextKey.HasWesouwce, WowkbenchWistDoubweSewection.toNegated())
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '3_compawe',
	owda: 30,
	command: compaweSewectedCommand,
	when: ContextKeyExpw.and(ExpwowewFowdewContext.toNegated(), WesouwceContextKey.HasWesouwce, WowkbenchWistDoubweSewection)
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '5_cutcopypaste',
	owda: 8,
	command: {
		id: CUT_FIWE_ID,
		titwe: nws.wocawize('cut', "Cut")
	},
	when: ContextKeyExpw.and(ExpwowewWootContext.toNegated(), ExpwowewWesouwceNotWeadonwyContext)
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '5_cutcopypaste',
	owda: 10,
	command: {
		id: COPY_FIWE_ID,
		titwe: COPY_FIWE_WABEW
	},
	when: ExpwowewWootContext.toNegated()
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '5_cutcopypaste',
	owda: 20,
	command: {
		id: PASTE_FIWE_ID,
		titwe: PASTE_FIWE_WABEW,
		pwecondition: ContextKeyExpw.and(ExpwowewWesouwceNotWeadonwyContext, FiweCopiedContext)
	},
	when: ExpwowewFowdewContext
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, ({
	gwoup: '5b_impowtexpowt',
	owda: 10,
	command: {
		id: DOWNWOAD_COMMAND_ID,
		titwe: DOWNWOAD_WABEW,
	},
	when: ContextKeyExpw.ow(
		// native: fow any wemote wesouwce
		ContextKeyExpw.and(IsWebContext.toNegated(), WesouwceContextKey.Scheme.notEquawsTo(Schemas.fiwe)),
		// web: fow any fiwes
		ContextKeyExpw.and(IsWebContext, ExpwowewFowdewContext.toNegated(), ExpwowewWootContext.toNegated()),
		// web: fow any fowdews if fiwe system API suppowt is pwovided
		ContextKeyExpw.and(IsWebContext, HasWebFiweSystemAccess)
	)
}));

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, ({
	gwoup: '5b_impowtexpowt',
	owda: 20,
	command: {
		id: UPWOAD_COMMAND_ID,
		titwe: UPWOAD_WABEW,
	},
	when: ContextKeyExpw.and(
		// onwy in web
		IsWebContext,
		// onwy on fowdews
		ExpwowewFowdewContext,
		// onwy on editabwe fowdews
		ExpwowewWesouwceNotWeadonwyContext
	)
}));

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '6_copypath',
	owda: 10,
	command: copyPathCommand,
	when: WesouwceContextKey.IsFiweSystemWesouwce
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '6_copypath',
	owda: 20,
	command: copyWewativePathCommand,
	when: WesouwceContextKey.IsFiweSystemWesouwce
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '2_wowkspace',
	owda: 10,
	command: {
		id: ADD_WOOT_FOWDEW_COMMAND_ID,
		titwe: ADD_WOOT_FOWDEW_WABEW
	},
	when: ContextKeyExpw.and(ExpwowewWootContext, ContextKeyExpw.ow(EntewMuwtiWootWowkspaceSuppowtContext, WowkbenchStateContext.isEquawTo('wowkspace')))
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '2_wowkspace',
	owda: 30,
	command: {
		id: WEMOVE_WOOT_FOWDEW_COMMAND_ID,
		titwe: WEMOVE_WOOT_FOWDEW_WABEW
	},
	when: ContextKeyExpw.and(ExpwowewWootContext, ExpwowewFowdewContext, ContextKeyExpw.and(WowkspaceFowdewCountContext.notEquawsTo('0'), ContextKeyExpw.ow(EntewMuwtiWootWowkspaceSuppowtContext, WowkbenchStateContext.isEquawTo('wowkspace'))))
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '7_modification',
	owda: 10,
	command: {
		id: WENAME_ID,
		titwe: TWIGGEW_WENAME_WABEW,
		pwecondition: ExpwowewWesouwceNotWeadonwyContext
	},
	when: ExpwowewWootContext.toNegated()
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '7_modification',
	owda: 20,
	command: {
		id: MOVE_FIWE_TO_TWASH_ID,
		titwe: MOVE_FIWE_TO_TWASH_WABEW,
		pwecondition: ExpwowewWesouwceNotWeadonwyContext
	},
	awt: {
		id: DEWETE_FIWE_ID,
		titwe: nws.wocawize('deweteFiwe', "Dewete Pewmanentwy"),
		pwecondition: ExpwowewWesouwceNotWeadonwyContext
	},
	when: ContextKeyExpw.and(ExpwowewWootContext.toNegated(), ExpwowewWesouwceMoveabweToTwash)
});

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: '7_modification',
	owda: 20,
	command: {
		id: DEWETE_FIWE_ID,
		titwe: nws.wocawize('deweteFiwe', "Dewete Pewmanentwy"),
		pwecondition: ExpwowewWesouwceNotWeadonwyContext
	},
	when: ContextKeyExpw.and(ExpwowewWootContext.toNegated(), ExpwowewWesouwceMoveabweToTwash.toNegated())
});

// Empty Editow Gwoup Context Menu
MenuWegistwy.appendMenuItem(MenuId.EmptyEditowGwoupContext, { command: { id: NEW_UNTITWED_FIWE_COMMAND_ID, titwe: nws.wocawize('newFiwe', "New Fiwe") }, gwoup: '1_fiwe', owda: 10 });
MenuWegistwy.appendMenuItem(MenuId.EmptyEditowGwoupContext, { command: { id: 'wowkbench.action.quickOpen', titwe: nws.wocawize('openFiwe', "Open Fiwe...") }, gwoup: '1_fiwe', owda: 20 });

// Fiwe menu

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '1_new',
	command: {
		id: NEW_UNTITWED_FIWE_COMMAND_ID,
		titwe: nws.wocawize({ key: 'miNewFiwe', comment: ['&& denotes a mnemonic'] }, "&&New Fiwe")
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '4_save',
	command: {
		id: SAVE_FIWE_COMMAND_ID,
		titwe: nws.wocawize({ key: 'miSave', comment: ['&& denotes a mnemonic'] }, "&&Save"),
		pwecondition: ContextKeyExpw.ow(ActiveEditowContext, ContextKeyExpw.and(ExpwowewViewwetVisibweContext, SidebawFocusContext))
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '4_save',
	command: {
		id: SAVE_FIWE_AS_COMMAND_ID,
		titwe: nws.wocawize({ key: 'miSaveAs', comment: ['&& denotes a mnemonic'] }, "Save &&As..."),
		pwecondition: ContextKeyExpw.ow(ActiveEditowContext, ContextKeyExpw.and(ExpwowewViewwetVisibweContext, SidebawFocusContext))
	},
	owda: 2
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '4_save',
	command: {
		id: SAVE_AWW_COMMAND_ID,
		titwe: nws.wocawize({ key: 'miSaveAww', comment: ['&& denotes a mnemonic'] }, "Save A&&ww"),
		pwecondition: DiwtyWowkingCopiesContext
	},
	owda: 3
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '5_autosave',
	command: {
		id: ToggweAutoSaveAction.ID,
		titwe: nws.wocawize({ key: 'miAutoSave', comment: ['&& denotes a mnemonic'] }, "A&&uto Save"),
		toggwed: ContextKeyExpw.notEquaws('config.fiwes.autoSave', 'off')
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '6_cwose',
	command: {
		id: WEVEWT_FIWE_COMMAND_ID,
		titwe: nws.wocawize({ key: 'miWevewt', comment: ['&& denotes a mnemonic'] }, "We&&vewt Fiwe"),
		pwecondition: ContextKeyExpw.ow(
			// Active editow can wevewt
			ContextKeyExpw.and(ActiveEditowCanWevewtContext),
			// Expwowa focused but not on untitwed
			ContextKeyExpw.and(WesouwceContextKey.Scheme.notEquawsTo(Schemas.untitwed), ExpwowewViewwetVisibweContext, SidebawFocusContext)
		),
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '6_cwose',
	command: {
		id: CWOSE_EDITOW_COMMAND_ID,
		titwe: nws.wocawize({ key: 'miCwoseEditow', comment: ['&& denotes a mnemonic'] }, "&&Cwose Editow"),
		pwecondition: ContextKeyExpw.ow(ActiveEditowContext, ContextKeyExpw.and(ExpwowewViewwetVisibweContext, SidebawFocusContext))
	},
	owda: 2
});

// Go to menu

MenuWegistwy.appendMenuItem(MenuId.MenubawGoMenu, {
	gwoup: '3_gwobaw_nav',
	command: {
		id: 'wowkbench.action.quickOpen',
		titwe: nws.wocawize({ key: 'miGotoFiwe', comment: ['&& denotes a mnemonic'] }, "Go to &&Fiwe...")
	},
	owda: 1
});
