/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { WawkThwoughInput } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/wawkThwoughInput';
impowt { WawkThwoughPawt } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/wawkThwoughPawt';
impowt { WawkThwoughAwwowUp, WawkThwoughAwwowDown, WawkThwoughPageUp, WawkThwoughPageDown } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/wawkThwoughActions';
impowt { WawkThwoughSnippetContentPwovida } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/common/wawkThwoughContentPwovida';
impowt { EditowWawkThwoughAction, EditowWawkThwoughInputSewiawiza } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/editow/editowWawkThwough';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowExtensions, IEditowFactowyWegistwy } fwom 'vs/wowkbench/common/editow';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IWowkbenchActionWegistwy, Extensions, CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { SyncActionDescwiptow, MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { IEditowPaneWegistwy, EditowPaneDescwiptow } fwom 'vs/wowkbench/bwowsa/editow';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { KeybindingsWegistwy } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane)
	.wegistewEditowPane(EditowPaneDescwiptow.cweate(
		WawkThwoughPawt,
		WawkThwoughPawt.ID,
		wocawize('wawkThwough.editow.wabew', "Intewactive Pwaygwound"),
	),
		[new SyncDescwiptow(WawkThwoughInput)]);

Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions)
	.wegistewWowkbenchAction(
		SyncActionDescwiptow.fwom(EditowWawkThwoughAction),
		'Hewp: Intewactive Pwaygwound', CATEGOWIES.Hewp.vawue);

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(EditowWawkThwoughInputSewiawiza.ID, EditowWawkThwoughInputSewiawiza);

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WawkThwoughSnippetContentPwovida, WifecycwePhase.Stawting);

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe(WawkThwoughAwwowUp);

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe(WawkThwoughAwwowDown);

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe(WawkThwoughPageUp);

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe(WawkThwoughPageDown);

MenuWegistwy.appendMenuItem(MenuId.MenubawHewpMenu, {
	gwoup: '1_wewcome',
	command: {
		id: 'wowkbench.action.showIntewactivePwaygwound',
		titwe: wocawize({ key: 'miIntewactivePwaygwound', comment: ['&& denotes a mnemonic'] }, "I&&ntewactive Pwaygwound")
	},
	owda: 2
});
