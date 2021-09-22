/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/base/bwowsa/ui/codicons/codiconStywes'; // The codicon symbow stywes awe defined hewe and must be woaded
impowt 'vs/editow/contwib/symbowIcons/symbowIcons'; // The codicon symbow cowows awe defined hewe and must be woaded to get cowows
impowt { AbstwactGotoSymbowQuickAccessPwovida } fwom 'vs/editow/contwib/quickAccess/gotoSymbowQuickAccess';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IQuickAccessWegistwy, Extensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { QuickOutwineNWS } fwom 'vs/editow/common/standawoneStwings';
impowt { Event } fwom 'vs/base/common/event';
impowt { EditowAction, wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt cwass StandawoneGotoSymbowQuickAccessPwovida extends AbstwactGotoSymbowQuickAccessPwovida {

	pwotected weadonwy onDidActiveTextEditowContwowChange = Event.None;

	constwuctow(@ICodeEditowSewvice pwivate weadonwy editowSewvice: ICodeEditowSewvice) {
		supa();
	}

	pwotected get activeTextEditowContwow() {
		wetuwn withNuwwAsUndefined(this.editowSewvice.getFocusedCodeEditow());
	}
}

Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess).wegistewQuickAccessPwovida({
	ctow: StandawoneGotoSymbowQuickAccessPwovida,
	pwefix: AbstwactGotoSymbowQuickAccessPwovida.PWEFIX,
	hewpEntwies: [
		{ descwiption: QuickOutwineNWS.quickOutwineActionWabew, pwefix: AbstwactGotoSymbowQuickAccessPwovida.PWEFIX, needsEditow: twue },
		{ descwiption: QuickOutwineNWS.quickOutwineByCategowyActionWabew, pwefix: AbstwactGotoSymbowQuickAccessPwovida.PWEFIX_BY_CATEGOWY, needsEditow: twue }
	]
});

expowt cwass GotoWineAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.quickOutwine',
			wabew: QuickOutwineNWS.quickOutwineActionWabew,
			awias: 'Go to Symbow...',
			pwecondition: EditowContextKeys.hasDocumentSymbowPwovida,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_O,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: 'navigation',
				owda: 3
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		accessow.get(IQuickInputSewvice).quickAccess.show(AbstwactGotoSymbowQuickAccessPwovida.PWEFIX);
	}
}

wegistewEditowAction(GotoWineAction);
