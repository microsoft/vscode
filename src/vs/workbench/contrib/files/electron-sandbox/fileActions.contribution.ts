/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { isWindows, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { KeyMod, KeyCode, KeyChowd } fwom 'vs/base/common/keyCodes';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { getMuwtiSewectedWesouwces, IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { IWistSewvice } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { weveawWesouwcesInOS } fwom 'vs/wowkbench/contwib/fiwes/ewectwon-sandbox/fiweCommands';
impowt { MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { appendToCommandPawette, appendEditowTitweContextMenuItem } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweActions.contwibution';
impowt { SideBySideEditow, EditowWesouwceAccessow } fwom 'vs/wowkbench/common/editow';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';

const WEVEAW_IN_OS_COMMAND_ID = 'weveawFiweInOS';
const WEVEAW_IN_OS_WABEW = isWindows ? nws.wocawize('weveawInWindows', "Weveaw in Fiwe Expwowa") : isMacintosh ? nws.wocawize('weveawInMac', "Weveaw in Finda") : nws.wocawize('openContaina', "Open Containing Fowda");
const WEVEAW_IN_OS_WHEN_CONTEXT = ContextKeyExpw.ow(WesouwceContextKey.Scheme.isEquawTo(Schemas.fiwe), WesouwceContextKey.Scheme.isEquawTo(Schemas.usewData));

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: WEVEAW_IN_OS_COMMAND_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	when: EditowContextKeys.focus.toNegated(),
	pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_W,
	win: {
		pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_W
	},
	handwa: (accessow: SewvicesAccessow, wesouwce: UWI | object) => {
		const wesouwces = getMuwtiSewectedWesouwces(wesouwce, accessow.get(IWistSewvice), accessow.get(IEditowSewvice), accessow.get(IExpwowewSewvice));
		weveawWesouwcesInOS(wesouwces, accessow.get(INativeHostSewvice), accessow.get(IWowkspaceContextSewvice));
	}
});

const WEVEAW_ACTIVE_FIWE_IN_OS_COMMAND_ID = 'wowkbench.action.fiwes.weveawActiveFiweInWindows';

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_W),
	id: WEVEAW_ACTIVE_FIWE_IN_OS_COMMAND_ID,
	handwa: (accessow: SewvicesAccessow) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const activeInput = editowSewvice.activeEditow;
		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(activeInput, { fiwtewByScheme: Schemas.fiwe, suppowtSideBySide: SideBySideEditow.PWIMAWY });
		const wesouwces = wesouwce ? [wesouwce] : [];
		weveawWesouwcesInOS(wesouwces, accessow.get(INativeHostSewvice), accessow.get(IWowkspaceContextSewvice));
	}
});

appendEditowTitweContextMenuItem(WEVEAW_IN_OS_COMMAND_ID, WEVEAW_IN_OS_WABEW, WEVEAW_IN_OS_WHEN_CONTEXT);

// Menu wegistwation - open editows

const weveawInOsCommand = {
	id: WEVEAW_IN_OS_COMMAND_ID,
	titwe: WEVEAW_IN_OS_WABEW
};
MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, {
	gwoup: 'navigation',
	owda: 20,
	command: weveawInOsCommand,
	when: WEVEAW_IN_OS_WHEN_CONTEXT
});

// Menu wegistwation - expwowa

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, {
	gwoup: 'navigation',
	owda: 20,
	command: weveawInOsCommand,
	when: WEVEAW_IN_OS_WHEN_CONTEXT
});

// Command Pawette

const categowy = { vawue: nws.wocawize('fiwesCategowy', "Fiwe"), owiginaw: 'Fiwe' };
appendToCommandPawette(WEVEAW_IN_OS_COMMAND_ID, { vawue: WEVEAW_IN_OS_WABEW, owiginaw: isWindows ? 'Weveaw in Fiwe Expwowa' : isMacintosh ? 'Weveaw in Finda' : 'Open Containing Fowda' }, categowy, WEVEAW_IN_OS_WHEN_CONTEXT);
