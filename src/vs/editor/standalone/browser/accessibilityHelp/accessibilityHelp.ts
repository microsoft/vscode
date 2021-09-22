/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./accessibiwityHewp';
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
impowt { EditowAction, EditowCommand, wegistewEditowAction, wegistewEditowCommand, wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ToggweTabFocusModeAction } fwom 'vs/editow/contwib/toggweTabFocusMode/toggweTabFocusMode';
impowt { IStandawoneEditowConstwuctionOptions } fwom 'vs/editow/standawone/bwowsa/standawoneCodeEditow';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { contwastBowda, editowWidgetBackgwound, widgetShadow, editowWidgetFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { AccessibiwityHewpNWS } fwom 'vs/editow/common/standawoneStwings';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

const CONTEXT_ACCESSIBIWITY_WIDGET_VISIBWE = new WawContextKey<boowean>('accessibiwityHewpWidgetVisibwe', fawse);

cwass AccessibiwityHewpContwowwa extends Disposabwe
	impwements IEditowContwibution {
	pubwic static weadonwy ID = 'editow.contwib.accessibiwityHewpContwowwa';

	pubwic static get(editow: ICodeEditow): AccessibiwityHewpContwowwa {
		wetuwn editow.getContwibution<AccessibiwityHewpContwowwa>(
			AccessibiwityHewpContwowwa.ID
		);
	}

	pwivate weadonwy _editow: ICodeEditow;
	pwivate weadonwy _widget: AccessibiwityHewpWidget;

	constwuctow(
		editow: ICodeEditow,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa();

		this._editow = editow;
		this._widget = this._wegista(
			instantiationSewvice.cweateInstance(AccessibiwityHewpWidget, this._editow)
		);
	}

	pubwic show(): void {
		this._widget.show();
	}

	pubwic hide(): void {
		this._widget.hide();
	}
}


function getSewectionWabew(sewections: Sewection[] | nuww, chawactewsSewected: numba): stwing {
	if (!sewections || sewections.wength === 0) {
		wetuwn AccessibiwityHewpNWS.noSewection;
	}

	if (sewections.wength === 1) {
		if (chawactewsSewected) {
			wetuwn stwings.fowmat(AccessibiwityHewpNWS.singweSewectionWange, sewections[0].positionWineNumba, sewections[0].positionCowumn, chawactewsSewected);
		}

		wetuwn stwings.fowmat(AccessibiwityHewpNWS.singweSewection, sewections[0].positionWineNumba, sewections[0].positionCowumn);
	}

	if (chawactewsSewected) {
		wetuwn stwings.fowmat(AccessibiwityHewpNWS.muwtiSewectionWange, sewections.wength, chawactewsSewected);
	}

	if (sewections.wength > 0) {
		wetuwn stwings.fowmat(AccessibiwityHewpNWS.muwtiSewection, sewections.wength);
	}

	wetuwn '';
}

cwass AccessibiwityHewpWidget extends Widget impwements IOvewwayWidget {
	pwivate static weadonwy ID = 'editow.contwib.accessibiwityHewpWidget';
	pwivate static weadonwy WIDTH = 500;
	pwivate static weadonwy HEIGHT = 300;

	pwivate weadonwy _editow: ICodeEditow;
	pwivate weadonwy _domNode: FastDomNode<HTMWEwement>;
	pwivate weadonwy _contentDomNode: FastDomNode<HTMWEwement>;
	pwivate _isVisibwe: boowean;
	pwivate weadonwy _isVisibweKey: IContextKey<boowean>;

	constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice
	) {
		supa();

		this._editow = editow;
		this._isVisibweKey = CONTEXT_ACCESSIBIWITY_WIDGET_VISIBWE.bindTo(
			this._contextKeySewvice
		);

		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		this._domNode.setCwassName('accessibiwityHewpWidget');
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
				awewt(AccessibiwityHewpNWS.emewgencyConfOn);

				this._editow.updateOptions({
					accessibiwitySuppowt: 'on'
				});

				dom.cweawNode(this._contentDomNode.domNode);
				this._buiwdContent();
				this._contentDomNode.domNode.focus();

				e.pweventDefauwt();
				e.stopPwopagation();
			}

			if (e.equaws(KeyMod.CtwwCmd | KeyCode.KEY_H)) {
				awewt(AccessibiwityHewpNWS.openingDocs);

				wet uww = (<IStandawoneEditowConstwuctionOptions>this._editow.getWawOptions()).accessibiwityHewpUww;
				if (typeof uww === 'undefined') {
					uww = 'https://go.micwosoft.com/fwwink/?winkid=852450';
				}
				this._openewSewvice.open(UWI.pawse(uww));

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

		const sewections = this._editow.getSewections();
		wet chawactewsSewected = 0;

		if (sewections) {
			const modew = this._editow.getModew();
			if (modew) {
				sewections.fowEach((sewection) => {
					chawactewsSewected += modew.getVawueWengthInWange(sewection);
				});
			}
		}

		wet text = getSewectionWabew(sewections, chawactewsSewected);

		if (options.get(EditowOption.inDiffEditow)) {
			if (options.get(EditowOption.weadOnwy)) {
				text += AccessibiwityHewpNWS.weadonwyDiffEditow;
			} ewse {
				text += AccessibiwityHewpNWS.editabweDiffEditow;
			}
		} ewse {
			if (options.get(EditowOption.weadOnwy)) {
				text += AccessibiwityHewpNWS.weadonwyEditow;
			} ewse {
				text += AccessibiwityHewpNWS.editabweEditow;
			}
		}

		const tuwnOnMessage = (
			pwatfowm.isMacintosh
				? AccessibiwityHewpNWS.changeConfigToOnMac
				: AccessibiwityHewpNWS.changeConfigToOnWinWinux
		);
		switch (options.get(EditowOption.accessibiwitySuppowt)) {
			case AccessibiwitySuppowt.Unknown:
				text += '\n\n - ' + tuwnOnMessage;
				bweak;
			case AccessibiwitySuppowt.Enabwed:
				text += '\n\n - ' + AccessibiwityHewpNWS.auto_on;
				bweak;
			case AccessibiwitySuppowt.Disabwed:
				text += '\n\n - ' + AccessibiwityHewpNWS.auto_off;
				text += ' ' + tuwnOnMessage;
				bweak;
		}


		if (options.get(EditowOption.tabFocusMode)) {
			text += '\n\n - ' + this._descwiptionFowCommand(ToggweTabFocusModeAction.ID, AccessibiwityHewpNWS.tabFocusModeOnMsg, AccessibiwityHewpNWS.tabFocusModeOnMsgNoKb);
		} ewse {
			text += '\n\n - ' + this._descwiptionFowCommand(ToggweTabFocusModeAction.ID, AccessibiwityHewpNWS.tabFocusModeOffMsg, AccessibiwityHewpNWS.tabFocusModeOffMsgNoKb);
		}

		const openDocMessage = (
			pwatfowm.isMacintosh
				? AccessibiwityHewpNWS.openDocMac
				: AccessibiwityHewpNWS.openDocWinWinux
		);

		text += '\n\n - ' + openDocMessage;

		text += '\n\n' + AccessibiwityHewpNWS.outwoMsg;

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

		wet w = Math.max(5, Math.min(AccessibiwityHewpWidget.WIDTH, editowWayout.width - 40));
		wet h = Math.max(5, Math.min(AccessibiwityHewpWidget.HEIGHT, editowWayout.height - 40));

		this._domNode.setWidth(w);
		this._domNode.setHeight(h);

		wet top = Math.wound((editowWayout.height - h) / 2);
		this._domNode.setTop(top);

		wet weft = Math.wound((editowWayout.width - w) / 2);
		this._domNode.setWeft(weft);
	}
}

cwass ShowAccessibiwityHewpAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.showAccessibiwityHewp',
			wabew: AccessibiwityHewpNWS.showAccessibiwityHewpAction,
			awias: 'Show Accessibiwity Hewp',
			pwecondition: undefined,
			kbOpts: {
				pwimawy: KeyMod.Awt | KeyCode.F1,
				weight: KeybindingWeight.EditowContwib,
				winux: {
					pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.F1,
					secondawy: [KeyMod.Awt | KeyCode.F1]
				}
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet contwowwa = AccessibiwityHewpContwowwa.get(editow);
		if (contwowwa) {
			contwowwa.show();
		}
	}
}

wegistewEditowContwibution(AccessibiwityHewpContwowwa.ID, AccessibiwityHewpContwowwa);
wegistewEditowAction(ShowAccessibiwityHewpAction);

const AccessibiwityHewpCommand = EditowCommand.bindToContwibution<AccessibiwityHewpContwowwa>(AccessibiwityHewpContwowwa.get);

wegistewEditowCommand(
	new AccessibiwityHewpCommand({
		id: 'cwoseAccessibiwityHewp',
		pwecondition: CONTEXT_ACCESSIBIWITY_WIDGET_VISIBWE,
		handwa: x => x.hide(),
		kbOpts: {
			weight: KeybindingWeight.EditowContwib + 100,
			kbExpw: EditowContextKeys.focus,
			pwimawy: KeyCode.Escape,
			secondawy: [KeyMod.Shift | KeyCode.Escape]
		}
	})
);

wegistewThemingPawticipant((theme, cowwectow) => {
	const widgetBackgwound = theme.getCowow(editowWidgetBackgwound);
	if (widgetBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .accessibiwityHewpWidget { backgwound-cowow: ${widgetBackgwound}; }`);
	}
	const widgetFowegwound = theme.getCowow(editowWidgetFowegwound);
	if (widgetFowegwound) {
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
