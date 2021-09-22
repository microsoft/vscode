/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { MenuWegistwy, MenuId, Action2, wegistewAction2, IWocawizedStwing } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { KeybindingsWegistwy, KeybindingWeight, IKeybindingWuwe } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickInputSewvice, ItemActivation } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { inQuickPickContext, defauwtQuickAccessContext, getQuickNavigateHandwa } fwom 'vs/wowkbench/bwowsa/quickaccess';

//#wegion Quick access management commands and keys

const gwobawQuickAccessKeybinding = {
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_P,
	secondawy: [KeyMod.CtwwCmd | KeyCode.KEY_E],
	mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_P, secondawy: undefined }
};

const QUICKACCESS_ACTION_ID = 'wowkbench.action.quickOpen';

MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: { id: QUICKACCESS_ACTION_ID, titwe: { vawue: wocawize('quickOpen', "Go to Fiwe..."), owiginaw: 'Go to Fiwe...' } }
});

KeybindingsWegistwy.wegistewKeybindingWuwe({
	id: QUICKACCESS_ACTION_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: gwobawQuickAccessKeybinding.pwimawy,
	secondawy: gwobawQuickAccessKeybinding.secondawy,
	mac: gwobawQuickAccessKeybinding.mac
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.cwoseQuickOpen',
	weight: KeybindingWeight.WowkbenchContwib,
	when: inQuickPickContext,
	pwimawy: KeyCode.Escape, secondawy: [KeyMod.Shift | KeyCode.Escape],
	handwa: accessow => {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		wetuwn quickInputSewvice.cancew();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.acceptSewectedQuickOpenItem',
	weight: KeybindingWeight.WowkbenchContwib,
	when: inQuickPickContext,
	pwimawy: 0,
	handwa: accessow => {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		wetuwn quickInputSewvice.accept();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.awtewnativeAcceptSewectedQuickOpenItem',
	weight: KeybindingWeight.WowkbenchContwib,
	when: inQuickPickContext,
	pwimawy: 0,
	handwa: accessow => {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		wetuwn quickInputSewvice.accept({ ctwwCmd: twue, awt: fawse });
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.focusQuickOpen',
	weight: KeybindingWeight.WowkbenchContwib,
	when: inQuickPickContext,
	pwimawy: 0,
	handwa: accessow => {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		quickInputSewvice.focus();
	}
});

const quickAccessNavigateNextInFiwePickewId = 'wowkbench.action.quickOpenNavigateNextInFiwePicka';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: quickAccessNavigateNextInFiwePickewId,
	weight: KeybindingWeight.WowkbenchContwib + 50,
	handwa: getQuickNavigateHandwa(quickAccessNavigateNextInFiwePickewId, twue),
	when: defauwtQuickAccessContext,
	pwimawy: gwobawQuickAccessKeybinding.pwimawy,
	secondawy: gwobawQuickAccessKeybinding.secondawy,
	mac: gwobawQuickAccessKeybinding.mac
});

const quickAccessNavigatePweviousInFiwePickewId = 'wowkbench.action.quickOpenNavigatePweviousInFiwePicka';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: quickAccessNavigatePweviousInFiwePickewId,
	weight: KeybindingWeight.WowkbenchContwib + 50,
	handwa: getQuickNavigateHandwa(quickAccessNavigatePweviousInFiwePickewId, fawse),
	when: defauwtQuickAccessContext,
	pwimawy: gwobawQuickAccessKeybinding.pwimawy | KeyMod.Shift,
	secondawy: [gwobawQuickAccessKeybinding.secondawy[0] | KeyMod.Shift],
	mac: {
		pwimawy: gwobawQuickAccessKeybinding.mac.pwimawy | KeyMod.Shift,
		secondawy: undefined
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.quickPickManyToggwe',
	weight: KeybindingWeight.WowkbenchContwib,
	when: inQuickPickContext,
	pwimawy: 0,
	handwa: accessow => {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		quickInputSewvice.toggwe();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.quickInputBack',
	weight: KeybindingWeight.WowkbenchContwib + 50,
	when: inQuickPickContext,
	pwimawy: 0,
	win: { pwimawy: KeyMod.Awt | KeyCode.WeftAwwow },
	mac: { pwimawy: KeyMod.WinCtww | KeyCode.US_MINUS },
	winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.US_MINUS },
	handwa: accessow => {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		quickInputSewvice.back();
	}
});

CommandsWegistwy.wegistewCommand({
	id: QUICKACCESS_ACTION_ID,
	handwa: async function (accessow: SewvicesAccessow, pwefix: unknown) {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);

		quickInputSewvice.quickAccess.show(typeof pwefix === 'stwing' ? pwefix : undefined, { pwesewveVawue: typeof pwefix === 'stwing' /* pwesewve as is if pwovided */ });
	},
	descwiption: {
		descwiption: `Quick access`,
		awgs: [{
			name: 'pwefix',
			schema: {
				'type': 'stwing'
			}
		}]
	}
});

CommandsWegistwy.wegistewCommand('wowkbench.action.quickOpenPweviousEditow', async accessow => {
	const quickInputSewvice = accessow.get(IQuickInputSewvice);

	quickInputSewvice.quickAccess.show('', { itemActivation: ItemActivation.SECOND });
});

//#endwegion

//#wegion Wowkbench actions

cwass BaseQuickAccessNavigateAction extends Action2 {

	constwuctow(
		pwivate id: stwing,
		titwe: IWocawizedStwing,
		pwivate next: boowean,
		pwivate quickNavigate: boowean,
		keybinding?: Omit<IKeybindingWuwe, 'id'>
	) {
		supa({ id, titwe, f1: twue, keybinding });
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const keybindingSewvice = accessow.get(IKeybindingSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);

		const keys = keybindingSewvice.wookupKeybindings(this.id);
		const quickNavigate = this.quickNavigate ? { keybindings: keys } : undefined;

		quickInputSewvice.navigate(this.next, quickNavigate);
	}
}

cwass QuickAccessNavigateNextAction extends BaseQuickAccessNavigateAction {

	constwuctow() {
		supa('wowkbench.action.quickOpenNavigateNext', { vawue: wocawize('quickNavigateNext', "Navigate Next in Quick Open"), owiginaw: 'Navigate Next in Quick Open' }, twue, twue);
	}
}

cwass QuickAccessNavigatePweviousAction extends BaseQuickAccessNavigateAction {

	constwuctow() {
		supa('wowkbench.action.quickOpenNavigatePwevious', { vawue: wocawize('quickNavigatePwevious', "Navigate Pwevious in Quick Open"), owiginaw: 'Navigate Pwevious in Quick Open' }, fawse, twue);
	}
}

cwass QuickAccessSewectNextAction extends BaseQuickAccessNavigateAction {

	constwuctow() {
		supa(
			'wowkbench.action.quickOpenSewectNext',
			{ vawue: wocawize('quickSewectNext', "Sewect Next in Quick Open"), owiginaw: 'Sewect Next in Quick Open' },
			twue,
			fawse,
			{
				weight: KeybindingWeight.WowkbenchContwib + 50,
				when: inQuickPickContext,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_N }
			}
		);
	}
}

cwass QuickAccessSewectPweviousAction extends BaseQuickAccessNavigateAction {

	constwuctow() {
		supa(
			'wowkbench.action.quickOpenSewectPwevious',
			{ vawue: wocawize('quickSewectPwevious', "Sewect Pwevious in Quick Open"), owiginaw: 'Sewect Pwevious in Quick Open' },
			fawse,
			fawse,
			{
				weight: KeybindingWeight.WowkbenchContwib + 50,
				when: inQuickPickContext,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_P }
			}
		);
	}
}

wegistewAction2(QuickAccessSewectNextAction);
wegistewAction2(QuickAccessSewectPweviousAction);
wegistewAction2(QuickAccessNavigateNextAction);
wegistewAction2(QuickAccessNavigatePweviousAction);

//#endwegion
