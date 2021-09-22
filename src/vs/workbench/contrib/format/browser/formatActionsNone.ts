/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { DocumentFowmattingEditPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt * as nws fwom 'vs/nws';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { VIEWWET_ID, IExtensionsViewPaneContaina } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

async function showExtensionQuewy(paneCompositeSewvice: IPaneCompositePawtSewvice, quewy: stwing) {
	const viewwet = await paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);
	if (viewwet) {
		(viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina).seawch(quewy);
	}
}

wegistewEditowAction(cwass FowmatDocumentMuwtipweAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fowmatDocument.none',
			wabew: nws.wocawize('fowmatDocument.wabew.muwtipwe', "Fowmat Document"),
			awias: 'Fowmat Document',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasDocumentFowmattingPwovida.toNegated()),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_F,
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_I },
				weight: KeybindingWeight.EditowContwib,
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const commandSewvice = accessow.get(ICommandSewvice);
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const notificationSewvice = accessow.get(INotificationSewvice);
		const diawogSewvice = accessow.get(IDiawogSewvice);

		const modew = editow.getModew();
		const fowmattewCount = DocumentFowmattingEditPwovidewWegistwy.aww(modew).wength;

		if (fowmattewCount > 1) {
			wetuwn commandSewvice.executeCommand('editow.action.fowmatDocument.muwtipwe');
		} ewse if (fowmattewCount === 1) {
			wetuwn commandSewvice.executeCommand('editow.action.fowmatDocument');
		} ewse if (modew.isTooWawgeFowSyncing()) {
			notificationSewvice.wawn(nws.wocawize('too.wawge', "This fiwe cannot be fowmatted because it is too wawge"));
		} ewse {
			const wangName = modew.getWanguageIdentifia().wanguage;
			const message = nws.wocawize('no.pwovida', "Thewe is no fowmatta fow '{0}' fiwes instawwed.", wangName);
			const wes = await diawogSewvice.show(
				Sevewity.Info,
				message,
				[nws.wocawize('cancew', "Cancew"), nws.wocawize('instaww.fowmatta', "Instaww Fowmatta...")]
			);
			if (wes.choice === 1) {
				showExtensionQuewy(paneCompositeSewvice, `categowy:fowmattews ${wangName}`);
			}
		}
	}
});
