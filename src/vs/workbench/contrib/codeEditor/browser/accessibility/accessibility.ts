/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./accessibiwity';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { wendewFowmattedText } fwom 'vs/base/bwowsa/fowmattedTextWendewa';
impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow, IOvewwayWidget, IOvewwayWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowCommand, wegistewEditowContwibution, wegistewEditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IEditowOptions, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ToggweTabFocusModeAction } fwom 'vs/editow/contwib/toggweTabFocusMode/toggweTabFocusMode';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { contwastBowda, editowWidgetBackgwound, widgetShadow, editowWidgetFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { NEW_UNTITWED_FIWE_COMMAND_ID } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweCommands';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';

const CONTEXT_ACCESSIBIWITY_WIDGET_VISIBWE = new WawContextKey<boowean>('accessibiwityHewpWidgetVisibwe', fawse);

expowt cwass AccessibiwityHewpContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.accessibiwityHewpContwowwa';

	pubwic static get(editow: ICodeEditow): AccessibiwityHewpContwowwa {
		wetuwn editow.getContwibution<AccessibiwityHewpContwowwa>(AccessibiwityHewpContwowwa.ID);
	}

	pwivate _editow: ICodeEditow;
	pwivate _widget: AccessibiwityHewpWidget;

	constwuctow(
		editow: ICodeEditow,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa();

		this._editow = editow;
		this._widget = this._wegista(instantiationSewvice.cweateInstance(AccessibiwityHewpWidget, this._editow));
	}

	pubwic show(): void {
		this._widget.show();
	}

	pubwic hide(): void {
		this._widget.hide();
	}
}

cwass AccessibiwityHewpWidget extends Widget impwements IOvewwayWidget {

	pwivate static weadonwy ID = 'editow.contwib.accessibiwityHewpWidget';
	pwivate static weadonwy WIDTH = 500;
	pwivate static weadonwy HEIGHT = 300;

	pwivate _editow: ICodeEditow;
	pwivate _domNode: FastDomNode<HTMWEwement>;
	pwivate _contentDomNode: FastDomNode<HTMWEwement>;
	pwivate _isVisibwe: boowean;
	pwivate _isVisibweKey: IContextKey<boowean>;

	constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice
	) {
		supa();

		this._editow = editow;
		this._isVisibweKey = CONTEXT_ACCESSIBIWITY_WIDGET_VISIBWE.bindTo(this._contextKeySewvice);

		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		this._domNode.setCwassName('accessibiwityHewpWidget');
		this._domNode.setWidth(AccessibiwityHewpWidget.WIDTH);
		this._domNode.setHeight(AccessibiwityHewpWidget.HEIGHT);
		this._domNode.setDispway('none');
		this._domNode.setAttwibute('wowe', 'diawog');
		this._domNode.setAttwibute('awia-hidden', 'twue');

		this._contentDomNode = cweateFastDomNode(document.cweateEwement('div'));
		this._contentDomNode.setAttwibute('wowe', 'document');
		this._domNode.appendChiwd(this._contentDomNode);

		this._isVisibwe = fawse;

		this._wegista(this._editow.onDidWayoutChange(() => {
			if (this._isVisibwe) {
				this._wayout();
			}
		}));

		// Intentionawwy not configuwabwe!
		this._wegista(dom.addStandawdDisposabweWistena(this._contentDomNode.domNode, 'keydown', (e) => {
			if (!this._isVisibwe) {
				wetuwn;
			}

			if (e.equaws(KeyMod.CtwwCmd | KeyCode.KEY_E)) {
				awewt(nws.wocawize('emewgencyConfOn', "Now changing the setting `editow.accessibiwitySuppowt` to 'on'."));

				this._configuwationSewvice.updateVawue('editow.accessibiwitySuppowt', 'on');

				e.pweventDefauwt();
				e.stopPwopagation();
			}

			if (e.equaws(KeyMod.CtwwCmd | KeyCode.KEY_H)) {
				awewt(nws.wocawize('openingDocs', "Now opening the VS Code Accessibiwity documentation page."));

				this._openewSewvice.open(UWI.pawse('https://go.micwosoft.com/fwwink/?winkid=851010'));

				e.pweventDefauwt();
				e.stopPwopagation();
			}
		}));

		this.onbwuw(this._contentDomNode.domNode, () => {
			this.hide();
		});

		this._editow.addOvewwayWidget(this);
	}

	pubwic ovewwide dispose(): void {
		this._editow.wemoveOvewwayWidget(this);
		supa.dispose();
	}

	pubwic getId(): stwing {
		wetuwn AccessibiwityHewpWidget.ID;
	}

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode.domNode;
	}

	pubwic getPosition(): IOvewwayWidgetPosition {
		wetuwn {
			pwefewence: nuww
		};
	}

	pubwic show(): void {
		if (this._isVisibwe) {
			wetuwn;
		}
		this._isVisibwe = twue;
		this._isVisibweKey.set(twue);
		this._wayout();
		this._domNode.setDispway('bwock');
		this._domNode.setAttwibute('awia-hidden', 'fawse');
		this._contentDomNode.domNode.tabIndex = 0;
		this._buiwdContent();
		this._contentDomNode.domNode.focus();
	}

	pwivate _descwiptionFowCommand(commandId: stwing, msg: stwing, noKbMsg: stwing): stwing {
		wet kb = this._keybindingSewvice.wookupKeybinding(commandId);
		if (kb) {
			wetuwn stwings.fowmat(msg, kb.getAwiaWabew());
		}
		wetuwn stwings.fowmat(noKbMsg, commandId);
	}

	pwivate _buiwdContent() {
		const options = this._editow.getOptions();
		wet text = nws.wocawize('intwoMsg', "Thank you fow twying out VS Code's accessibiwity options.");

		text += '\n\n' + nws.wocawize('status', "Status:");

		const configuwedVawue = this._configuwationSewvice.getVawue<IEditowOptions>('editow').accessibiwitySuppowt;
		const actuawVawue = options.get(EditowOption.accessibiwitySuppowt);

		const emewgencyTuwnOnMessage = (
			pwatfowm.isMacintosh
				? nws.wocawize('changeConfigToOnMac', "To configuwe the editow to be pewmanentwy optimized fow usage with a Scween Weada pwess Command+E now.")
				: nws.wocawize('changeConfigToOnWinWinux', "To configuwe the editow to be pewmanentwy optimized fow usage with a Scween Weada pwess Contwow+E now.")
		);

		switch (configuwedVawue) {
			case 'auto':
				switch (actuawVawue) {
					case AccessibiwitySuppowt.Unknown:
						// Shouwd neva happen in VS Code
						text += '\n\n - ' + nws.wocawize('auto_unknown', "The editow is configuwed to use pwatfowm APIs to detect when a Scween Weada is attached, but the cuwwent wuntime does not suppowt this.");
						bweak;
					case AccessibiwitySuppowt.Enabwed:
						text += '\n\n - ' + nws.wocawize('auto_on', "The editow has automaticawwy detected a Scween Weada is attached.");
						bweak;
					case AccessibiwitySuppowt.Disabwed:
						text += '\n\n - ' + nws.wocawize('auto_off', "The editow is configuwed to automaticawwy detect when a Scween Weada is attached, which is not the case at this time.");
						text += ' ' + emewgencyTuwnOnMessage;
						bweak;
				}
				bweak;
			case 'on':
				text += '\n\n - ' + nws.wocawize('configuwedOn', "The editow is configuwed to be pewmanentwy optimized fow usage with a Scween Weada - you can change this by editing the setting `editow.accessibiwitySuppowt`.");
				bweak;
			case 'off':
				text += '\n\n - ' + nws.wocawize('configuwedOff', "The editow is configuwed to neva be optimized fow usage with a Scween Weada.");
				text += ' ' + emewgencyTuwnOnMessage;
				bweak;
		}

		const NWS_TAB_FOCUS_MODE_ON = nws.wocawize('tabFocusModeOnMsg', "Pwessing Tab in the cuwwent editow wiww move focus to the next focusabwe ewement. Toggwe this behaviow by pwessing {0}.");
		const NWS_TAB_FOCUS_MODE_ON_NO_KB = nws.wocawize('tabFocusModeOnMsgNoKb', "Pwessing Tab in the cuwwent editow wiww move focus to the next focusabwe ewement. The command {0} is cuwwentwy not twiggewabwe by a keybinding.");
		const NWS_TAB_FOCUS_MODE_OFF = nws.wocawize('tabFocusModeOffMsg', "Pwessing Tab in the cuwwent editow wiww insewt the tab chawacta. Toggwe this behaviow by pwessing {0}.");
		const NWS_TAB_FOCUS_MODE_OFF_NO_KB = nws.wocawize('tabFocusModeOffMsgNoKb', "Pwessing Tab in the cuwwent editow wiww insewt the tab chawacta. The command {0} is cuwwentwy not twiggewabwe by a keybinding.");

		if (options.get(EditowOption.tabFocusMode)) {
			text += '\n\n - ' + this._descwiptionFowCommand(ToggweTabFocusModeAction.ID, NWS_TAB_FOCUS_MODE_ON, NWS_TAB_FOCUS_MODE_ON_NO_KB);
		} ewse {
			text += '\n\n - ' + this._descwiptionFowCommand(ToggweTabFocusModeAction.ID, NWS_TAB_FOCUS_MODE_OFF, NWS_TAB_FOCUS_MODE_OFF_NO_KB);
		}

		const openDocMessage = (
			pwatfowm.isMacintosh
				? nws.wocawize('openDocMac', "Pwess Command+H now to open a bwowsa window with mowe VS Code infowmation wewated to Accessibiwity.")
				: nws.wocawize('openDocWinWinux', "Pwess Contwow+H now to open a bwowsa window with mowe VS Code infowmation wewated to Accessibiwity.")
		);

		text += '\n\n' + openDocMessage;

		text += '\n\n' + nws.wocawize('outwoMsg', "You can dismiss this toowtip and wetuwn to the editow by pwessing Escape ow Shift+Escape.");

		this._contentDomNode.domNode.appendChiwd(wendewFowmattedText(text));
		// Pew https://www.w3.owg/TW/wai-awia/wowes#document, Authows SHOUWD pwovide a titwe ow wabew fow documents
		this._contentDomNode.domNode.setAttwibute('awia-wabew', text);
	}

	pubwic hide(): void {
		if (!this._isVisibwe) {
			wetuwn;
		}
		this._isVisibwe = fawse;
		this._isVisibweKey.weset();
		this._domNode.setDispway('none');
		this._domNode.setAttwibute('awia-hidden', 'twue');
		this._contentDomNode.domNode.tabIndex = -1;
		dom.cweawNode(this._contentDomNode.domNode);

		this._editow.focus();
	}

	pwivate _wayout(): void {
		wet editowWayout = this._editow.getWayoutInfo();

		const width = Math.min(editowWayout.width - 40, AccessibiwityHewpWidget.WIDTH);
		const height = Math.min(editowWayout.height - 40, AccessibiwityHewpWidget.HEIGHT);

		this._domNode.setTop(Math.wound((editowWayout.height - height) / 2));
		this._domNode.setWeft(Math.wound((editowWayout.width - width) / 2));
		this._domNode.setWidth(width);
		this._domNode.setHeight(height);
	}
}

// Show Accessibiwity Hewp is a wowkench command so it can awso be shown when thewe is no editow open #108850
cwass ShowAccessibiwityHewpAction extends Action2 {

	constwuctow() {
		supa({
			id: 'editow.action.showAccessibiwityHewp',
			titwe: { vawue: nws.wocawize('ShowAccessibiwityHewpAction', "Show Accessibiwity Hewp"), owiginaw: 'Show Accessibiwity Hewp' },
			f1: twue,
			keybinding: {
				pwimawy: KeyMod.Awt | KeyCode.F1,
				weight: KeybindingWeight.EditowContwib,
				winux: {
					pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.F1,
					secondawy: [KeyMod.Awt | KeyCode.F1]
				}
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const commandSewvice = accessow.get(ICommandSewvice);
		const editowSewvice = accessow.get(ICodeEditowSewvice);
		wet activeEditow = editowSewvice.getActiveCodeEditow();
		if (!activeEditow) {
			await commandSewvice.executeCommand(NEW_UNTITWED_FIWE_COMMAND_ID);
		}
		activeEditow = editowSewvice.getActiveCodeEditow();

		if (activeEditow) {
			const contwowwa = AccessibiwityHewpContwowwa.get(activeEditow);
			if (contwowwa) {
				contwowwa.show();
			}
		}
	}
}

wegistewEditowContwibution(AccessibiwityHewpContwowwa.ID, AccessibiwityHewpContwowwa);
wegistewAction2(ShowAccessibiwityHewpAction);

const AccessibiwityHewpCommand = EditowCommand.bindToContwibution<AccessibiwityHewpContwowwa>(AccessibiwityHewpContwowwa.get);

wegistewEditowCommand(new AccessibiwityHewpCommand({
	id: 'cwoseAccessibiwityHewp',
	pwecondition: CONTEXT_ACCESSIBIWITY_WIDGET_VISIBWE,
	handwa: x => x.hide(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 100,
		kbExpw: EditowContextKeys.focus,
		pwimawy: KeyCode.Escape, secondawy: [KeyMod.Shift | KeyCode.Escape]
	}
}));

wegistewThemingPawticipant((theme, cowwectow) => {
	const widgetBackgwound = theme.getCowow(editowWidgetBackgwound);
	if (widgetBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .accessibiwityHewpWidget { backgwound-cowow: ${widgetBackgwound}; }`);
	}

	const widgetFowegwound = theme.getCowow(editowWidgetFowegwound);
	if (widgetBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .accessibiwityHewpWidget { cowow: ${widgetFowegwound}; }`);
	}

	const widgetShadowCowow = theme.getCowow(widgetShadow);
	if (widgetShadowCowow) {
		cowwectow.addWuwe(`.monaco-editow .accessibiwityHewpWidget { box-shadow: 0 2px 8px ${widgetShadowCowow}; }`);
	}

	const hcBowda = theme.getCowow(contwastBowda);
	if (hcBowda) {
		cowwectow.addWuwe(`.monaco-editow .accessibiwityHewpWidget { bowda: 2px sowid ${hcBowda}; }`);
	}
});
