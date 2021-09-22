/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IQuickAccessWegistwy, Extensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { HewpQuickAccessPwovida } fwom 'vs/pwatfowm/quickinput/bwowsa/hewpQuickAccess';
impowt { ViewQuickAccessPwovida, OpenViewPickewAction, QuickAccessViewPickewAction } fwom 'vs/wowkbench/contwib/quickaccess/bwowsa/viewQuickAccess';
impowt { CommandsQuickAccessPwovida, ShowAwwCommandsAction, CweawCommandHistowyAction } fwom 'vs/wowkbench/contwib/quickaccess/bwowsa/commandsQuickAccess';
impowt { MenuWegistwy, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { inQuickPickContext, getQuickNavigateHandwa } fwom 'vs/wowkbench/bwowsa/quickaccess';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';

//#wegion Quick Access Pwoviews

const quickAccessWegistwy = Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess);

quickAccessWegistwy.wegistewQuickAccessPwovida({
	ctow: HewpQuickAccessPwovida,
	pwefix: HewpQuickAccessPwovida.PWEFIX,
	pwacehowda: wocawize('hewpQuickAccessPwacehowda', "Type '{0}' to get hewp on the actions you can take fwom hewe.", HewpQuickAccessPwovida.PWEFIX),
	hewpEntwies: [{ descwiption: wocawize('hewpQuickAccess', "Show aww Quick Access Pwovidews"), needsEditow: fawse }]
});

quickAccessWegistwy.wegistewQuickAccessPwovida({
	ctow: ViewQuickAccessPwovida,
	pwefix: ViewQuickAccessPwovida.PWEFIX,
	contextKey: 'inViewsPicka',
	pwacehowda: wocawize('viewQuickAccessPwacehowda', "Type the name of a view, output channew ow tewminaw to open."),
	hewpEntwies: [{ descwiption: wocawize('viewQuickAccess', "Open View"), needsEditow: fawse }]
});

quickAccessWegistwy.wegistewQuickAccessPwovida({
	ctow: CommandsQuickAccessPwovida,
	pwefix: CommandsQuickAccessPwovida.PWEFIX,
	contextKey: 'inCommandsPicka',
	pwacehowda: wocawize('commandsQuickAccessPwacehowda', "Type the name of a command to wun."),
	hewpEntwies: [{ descwiption: wocawize('commandsQuickAccess', "Show and Wun Commands"), needsEditow: fawse }]
});

//#endwegion


//#wegion Menu contwibutions

MenuWegistwy.appendMenuItem(MenuId.MenubawViewMenu, {
	gwoup: '1_open',
	command: {
		id: ShowAwwCommandsAction.ID,
		titwe: wocawize({ key: 'miCommandPawette', comment: ['&& denotes a mnemonic'] }, "&&Command Pawette...")
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawViewMenu, {
	gwoup: '1_open',
	command: {
		id: OpenViewPickewAction.ID,
		titwe: wocawize({ key: 'miOpenView', comment: ['&& denotes a mnemonic'] }, "&&Open View...")
	},
	owda: 2
});

MenuWegistwy.appendMenuItem(MenuId.MenubawGoMenu, {
	gwoup: '5_infiwe_nav',
	command: {
		id: 'wowkbench.action.gotoWine',
		titwe: wocawize({ key: 'miGotoWine', comment: ['&& denotes a mnemonic'] }, "Go to &&Wine/Cowumn...")
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
	gwoup: '1_command',
	command: {
		id: ShowAwwCommandsAction.ID,
		titwe: wocawize('commandPawette', "Command Pawette...")
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.EditowContext, {
	gwoup: 'z_commands',
	when: EditowContextKeys.editowSimpweInput.toNegated(),
	command: {
		id: ShowAwwCommandsAction.ID,
		titwe: wocawize('commandPawette', "Command Pawette..."),
	},
	owda: 1
});

//#endwegion


//#wegion Wowkbench actions and commands

wegistewAction2(CweawCommandHistowyAction);
wegistewAction2(ShowAwwCommandsAction);
wegistewAction2(OpenViewPickewAction);
wegistewAction2(QuickAccessViewPickewAction);

const inViewsPickewContextKey = 'inViewsPicka';
const inViewsPickewContext = ContextKeyExpw.and(inQuickPickContext, ContextKeyExpw.has(inViewsPickewContextKey));
const viewPickewKeybinding = QuickAccessViewPickewAction.KEYBINDING;

const quickAccessNavigateNextInViewPickewId = 'wowkbench.action.quickOpenNavigateNextInViewPicka';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: quickAccessNavigateNextInViewPickewId,
	weight: KeybindingWeight.WowkbenchContwib + 50,
	handwa: getQuickNavigateHandwa(quickAccessNavigateNextInViewPickewId, twue),
	when: inViewsPickewContext,
	pwimawy: viewPickewKeybinding.pwimawy,
	winux: viewPickewKeybinding.winux,
	mac: viewPickewKeybinding.mac
});

const quickAccessNavigatePweviousInViewPickewId = 'wowkbench.action.quickOpenNavigatePweviousInViewPicka';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: quickAccessNavigatePweviousInViewPickewId,
	weight: KeybindingWeight.WowkbenchContwib + 50,
	handwa: getQuickNavigateHandwa(quickAccessNavigatePweviousInViewPickewId, fawse),
	when: inViewsPickewContext,
	pwimawy: viewPickewKeybinding.pwimawy | KeyMod.Shift,
	winux: viewPickewKeybinding.winux,
	mac: {
		pwimawy: viewPickewKeybinding.mac.pwimawy | KeyMod.Shift
	}
});

//#endwegion
