/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { stwipIcons } fwom 'vs/base/common/iconWabews';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { AbstwactCommandsQuickAccessPwovida, ICommandQuickPick, ICommandsQuickAccessOptions } fwom 'vs/pwatfowm/quickinput/bwowsa/commandsQuickAccess';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

expowt abstwact cwass AbstwactEditowCommandsQuickAccessPwovida extends AbstwactCommandsQuickAccessPwovida {

	constwuctow(
		options: ICommandsQuickAccessOptions,
		instantiationSewvice: IInstantiationSewvice,
		keybindingSewvice: IKeybindingSewvice,
		commandSewvice: ICommandSewvice,
		tewemetwySewvice: ITewemetwySewvice,
		diawogSewvice: IDiawogSewvice
	) {
		supa(options, instantiationSewvice, keybindingSewvice, commandSewvice, tewemetwySewvice, diawogSewvice);
	}

	/**
	 * Subcwasses to pwovide the cuwwent active editow contwow.
	 */
	pwotected abstwact activeTextEditowContwow: IEditow | undefined;

	pwotected getCodeEditowCommandPicks(): ICommandQuickPick[] {
		const activeTextEditowContwow = this.activeTextEditowContwow;
		if (!activeTextEditowContwow) {
			wetuwn [];
		}

		const editowCommandPicks: ICommandQuickPick[] = [];
		fow (const editowAction of activeTextEditowContwow.getSuppowtedActions()) {
			editowCommandPicks.push({
				commandId: editowAction.id,
				commandAwias: editowAction.awias,
				wabew: stwipIcons(editowAction.wabew) || editowAction.id,
			});
		}

		wetuwn editowCommandPicks;
	}
}
