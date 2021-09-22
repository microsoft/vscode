/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IQuickAccessWegistwy, Extensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { QuickCommandNWS } fwom 'vs/editow/common/standawoneStwings';
impowt { ICommandQuickPick } fwom 'vs/pwatfowm/quickinput/bwowsa/commandsQuickAccess';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { AbstwactEditowCommandsQuickAccessPwovida } fwom 'vs/editow/contwib/quickAccess/commandsQuickAccess';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { EditowAction, wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt cwass StandawoneCommandsQuickAccessPwovida extends AbstwactEditowCommandsQuickAccessPwovida {

	pwotected get activeTextEditowContwow(): IEditow | undefined { wetuwn withNuwwAsUndefined(this.codeEditowSewvice.getFocusedCodeEditow()); }

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice
	) {
		supa({ showAwias: fawse }, instantiationSewvice, keybindingSewvice, commandSewvice, tewemetwySewvice, diawogSewvice);
	}

	pwotected async getCommandPicks(): Pwomise<Awway<ICommandQuickPick>> {
		wetuwn this.getCodeEditowCommandPicks();
	}
}

Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess).wegistewQuickAccessPwovida({
	ctow: StandawoneCommandsQuickAccessPwovida,
	pwefix: StandawoneCommandsQuickAccessPwovida.PWEFIX,
	hewpEntwies: [{ descwiption: QuickCommandNWS.quickCommandHewp, needsEditow: twue }]
});

expowt cwass GotoWineAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.quickCommand',
			wabew: QuickCommandNWS.quickCommandActionWabew,
			awias: 'Command Pawette',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyCode.F1,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: 'z_commands',
				owda: 1
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		accessow.get(IQuickInputSewvice).quickAccess.show(StandawoneCommandsQuickAccessPwovida.PWEFIX);
	}
}

wegistewEditowAction(GotoWineAction);
