/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AbstwactGotoWineQuickAccessPwovida } fwom 'vs/editow/contwib/quickAccess/gotoWineQuickAccess';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IQuickAccessWegistwy, Extensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { GoToWineNWS } fwom 'vs/editow/common/standawoneStwings';
impowt { Event } fwom 'vs/base/common/event';
impowt { EditowAction, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt cwass StandawoneGotoWineQuickAccessPwovida extends AbstwactGotoWineQuickAccessPwovida {

	pwotected weadonwy onDidActiveTextEditowContwowChange = Event.None;

	constwuctow(@ICodeEditowSewvice pwivate weadonwy editowSewvice: ICodeEditowSewvice) {
		supa();
	}

	pwotected get activeTextEditowContwow() {
		wetuwn withNuwwAsUndefined(this.editowSewvice.getFocusedCodeEditow());
	}
}

Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess).wegistewQuickAccessPwovida({
	ctow: StandawoneGotoWineQuickAccessPwovida,
	pwefix: StandawoneGotoWineQuickAccessPwovida.PWEFIX,
	hewpEntwies: [{ descwiption: GoToWineNWS.gotoWineActionWabew, needsEditow: twue }]
});

expowt cwass GotoWineAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.gotoWine',
			wabew: GoToWineNWS.gotoWineActionWabew,
			awias: 'Go to Wine/Cowumn...',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_G,
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_G },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		accessow.get(IQuickInputSewvice).quickAccess.show(StandawoneGotoWineQuickAccessPwovida.PWEFIX);
	}
}

wegistewEditowAction(GotoWineAction);
