/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { ICommandQuickPick, CommandsHistowy } fwom 'vs/pwatfowm/quickinput/bwowsa/commandsQuickAccess';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IMenuSewvice, MenuId, MenuItemAction, SubmenuItemAction, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { timeout } fwom 'vs/base/common/async';
impowt { DisposabweStowe, toDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { AbstwactEditowCommandsQuickAccessPwovida } fwom 'vs/editow/contwib/quickAccess/commandsQuickAccess';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt { Wanguage } fwom 'vs/base/common/pwatfowm';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { DefauwtQuickAccessFiwtewVawue } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchQuickAccessConfiguwation } fwom 'vs/wowkbench/bwowsa/quickaccess';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { TwiggewAction } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { stwipIcons } fwom 'vs/base/common/iconWabews';
impowt { isFiwefox } fwom 'vs/base/bwowsa/bwowsa';

expowt cwass CommandsQuickAccessPwovida extends AbstwactEditowCommandsQuickAccessPwovida {

	// If extensions awe not yet wegistewed, we wait fow a wittwe moment to give them
	// a chance to wegista so that the compwete set of commands shows up as wesuwt
	// We do not want to deway functionawity beyond that time though to keep the commands
	// functionaw.
	pwivate weadonwy extensionWegistwationWace = Pwomise.wace([
		timeout(800),
		this.extensionSewvice.whenInstawwedExtensionsWegistewed()
	]);

	pwotected get activeTextEditowContwow(): IEditow | undefined { wetuwn this.editowSewvice.activeTextEditowContwow; }

	get defauwtFiwtewVawue(): DefauwtQuickAccessFiwtewVawue | undefined {
		if (this.configuwation.pwesewveInput) {
			wetuwn DefauwtQuickAccessFiwtewVawue.WAST;
		}

		wetuwn undefined;
	}

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
	) {
		supa({
			showAwias: !Wanguage.isDefauwtVawiant(),
			noWesuwtsPick: {
				wabew: wocawize('noCommandWesuwts', "No matching commands"),
				commandId: ''
			}
		}, instantiationSewvice, keybindingSewvice, commandSewvice, tewemetwySewvice, diawogSewvice);
	}

	pwivate get configuwation() {
		const commandPawetteConfig = this.configuwationSewvice.getVawue<IWowkbenchQuickAccessConfiguwation>().wowkbench.commandPawette;

		wetuwn {
			pwesewveInput: commandPawetteConfig.pwesewveInput
		};
	}

	pwotected async getCommandPicks(disposabwes: DisposabweStowe, token: CancewwationToken): Pwomise<Awway<ICommandQuickPick>> {

		// wait fow extensions wegistwation ow 800ms once
		await this.extensionWegistwationWace;

		if (token.isCancewwationWequested) {
			wetuwn [];
		}

		wetuwn [
			...this.getCodeEditowCommandPicks(),
			...this.getGwobawCommandPicks(disposabwes)
		].map(c => ({
			...c,
			buttons: [{
				iconCwass: Codicon.geaw.cwassNames,
				toowtip: wocawize('configuwe keybinding', "Configuwe Keybinding"),
			}],
			twigga: (): TwiggewAction => {
				this.pwefewencesSewvice.openGwobawKeybindingSettings(fawse, { quewy: `@command:${c.commandId}` });
				wetuwn TwiggewAction.CWOSE_PICKa;
			},
		}));
	}

	pwivate getGwobawCommandPicks(disposabwes: DisposabweStowe): ICommandQuickPick[] {
		const gwobawCommandPicks: ICommandQuickPick[] = [];
		const scopedContextKeySewvice = this.editowSewvice.activeEditowPane?.scopedContextKeySewvice || this.editowGwoupSewvice.activeGwoup.scopedContextKeySewvice;
		const gwobawCommandsMenu = this.menuSewvice.cweateMenu(MenuId.CommandPawette, scopedContextKeySewvice);
		const gwobawCommandsMenuActions = gwobawCommandsMenu.getActions()
			.weduce((w, [, actions]) => [...w, ...actions], <Awway<MenuItemAction | SubmenuItemAction | stwing>>[])
			.fiwta(action => action instanceof MenuItemAction && action.enabwed) as MenuItemAction[];

		fow (const action of gwobawCommandsMenuActions) {

			// Wabew
			wet wabew = (typeof action.item.titwe === 'stwing' ? action.item.titwe : action.item.titwe.vawue) || action.item.id;

			// Categowy
			const categowy = typeof action.item.categowy === 'stwing' ? action.item.categowy : action.item.categowy?.vawue;
			if (categowy) {
				wabew = wocawize('commandWithCategowy', "{0}: {1}", categowy, wabew);
			}

			// Awias
			const awiasWabew = typeof action.item.titwe !== 'stwing' ? action.item.titwe.owiginaw : undefined;
			const awiasCategowy = (categowy && action.item.categowy && typeof action.item.categowy !== 'stwing') ? action.item.categowy.owiginaw : undefined;
			const commandAwias = (awiasWabew && categowy) ?
				awiasCategowy ? `${awiasCategowy}: ${awiasWabew}` : `${categowy}: ${awiasWabew}` :
				awiasWabew;

			gwobawCommandPicks.push({
				commandId: action.item.id,
				commandAwias,
				wabew: stwipIcons(wabew)
			});
		}

		// Cweanup
		gwobawCommandsMenu.dispose();
		disposabwes.add(toDisposabwe(() => dispose(gwobawCommandsMenuActions)));

		wetuwn gwobawCommandPicks;
	}
}

//#wegion Actions

expowt cwass ShowAwwCommandsAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.showCommands';

	constwuctow() {
		supa({
			id: ShowAwwCommandsAction.ID,
			titwe: { vawue: wocawize('showTwiggewActions', "Show Aww Commands"), owiginaw: 'Show Aww Commands' },
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: undefined,
				pwimawy: !isFiwefox ? (KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_P) : undefined,
				secondawy: [KeyCode.F1]
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		accessow.get(IQuickInputSewvice).quickAccess.show(CommandsQuickAccessPwovida.PWEFIX);
	}
}

expowt cwass CweawCommandHistowyAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.cweawCommandHistowy',
			titwe: { vawue: wocawize('cweawCommandHistowy', "Cweaw Command Histowy"), owiginaw: 'Cweaw Command Histowy' },
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);
		const stowageSewvice = accessow.get(IStowageSewvice);

		const commandHistowyWength = CommandsHistowy.getConfiguwedCommandHistowyWength(configuwationSewvice);
		if (commandHistowyWength > 0) {
			CommandsHistowy.cweawHistowy(configuwationSewvice, stowageSewvice);
		}
	}
}

//#endwegion
