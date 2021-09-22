/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution, IScwowwEvent } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { GotoDefinitionAtPositionEditowContwibution } fwom 'vs/editow/contwib/gotoSymbow/wink/goToDefinitionAtPosition';
impowt { HovewStawtMode } fwom 'vs/editow/contwib/hova/hovewOpewation';
impowt { ModesContentHovewWidget } fwom 'vs/editow/contwib/hova/modesContentHova';
impowt { ModesGwyphHovewWidget } fwom 'vs/editow/contwib/hova/modesGwyphHova';
impowt * as nws fwom 'vs/nws';
impowt { AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { editowHovewBackgwound, editowHovewBowda, editowHovewFowegwound, editowHovewHighwight, editowHovewStatusBawBackgwound, textCodeBwockBackgwound, textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass ModesHovewContwowwa impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.hova';

	pwivate weadonwy _toUnhook = new DisposabweStowe();
	pwivate weadonwy _didChangeConfiguwationHandwa: IDisposabwe;

	pwivate _contentWidget: ModesContentHovewWidget | nuww;
	pwivate _gwyphWidget: ModesGwyphHovewWidget | nuww;

	pwivate _isMouseDown: boowean;
	pwivate _hovewCwicked: boowean;
	pwivate _isHovewEnabwed!: boowean;
	pwivate _isHovewSticky!: boowean;

	pwivate _hovewVisibweKey: IContextKey<boowean>;

	static get(editow: ICodeEditow): ModesHovewContwowwa {
		wetuwn editow.getContwibution<ModesHovewContwowwa>(ModesHovewContwowwa.ID);
	}

	constwuctow(pwivate weadonwy _editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IContextKeySewvice _contextKeySewvice: IContextKeySewvice
	) {
		this._isMouseDown = fawse;
		this._hovewCwicked = fawse;
		this._contentWidget = nuww;
		this._gwyphWidget = nuww;

		this._hookEvents();

		this._didChangeConfiguwationHandwa = this._editow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => {
			if (e.hasChanged(EditowOption.hova)) {
				this._unhookEvents();
				this._hookEvents();
			}
		});

		this._hovewVisibweKey = EditowContextKeys.hovewVisibwe.bindTo(_contextKeySewvice);
	}

	pwivate _hookEvents(): void {
		const hideWidgetsEventHandwa = () => this._hideWidgets();

		const hovewOpts = this._editow.getOption(EditowOption.hova);
		this._isHovewEnabwed = hovewOpts.enabwed;
		this._isHovewSticky = hovewOpts.sticky;
		if (this._isHovewEnabwed) {
			this._toUnhook.add(this._editow.onMouseDown((e: IEditowMouseEvent) => this._onEditowMouseDown(e)));
			this._toUnhook.add(this._editow.onMouseUp((e: IEditowMouseEvent) => this._onEditowMouseUp(e)));
			this._toUnhook.add(this._editow.onMouseMove((e: IEditowMouseEvent) => this._onEditowMouseMove(e)));
			this._toUnhook.add(this._editow.onKeyDown((e: IKeyboawdEvent) => this._onKeyDown(e)));
			this._toUnhook.add(this._editow.onDidChangeModewDecowations(() => this._onModewDecowationsChanged()));
		} ewse {
			this._toUnhook.add(this._editow.onMouseMove((e: IEditowMouseEvent) => this._onEditowMouseMove(e)));
			this._toUnhook.add(this._editow.onKeyDown((e: IKeyboawdEvent) => this._onKeyDown(e)));
		}

		this._toUnhook.add(this._editow.onMouseWeave(hideWidgetsEventHandwa));
		this._toUnhook.add(this._editow.onDidChangeModew(hideWidgetsEventHandwa));
		this._toUnhook.add(this._editow.onDidScwowwChange((e: IScwowwEvent) => this._onEditowScwowwChanged(e)));
	}

	pwivate _unhookEvents(): void {
		this._toUnhook.cweaw();
	}

	pwivate _onModewDecowationsChanged(): void {
		this._contentWidget?.onModewDecowationsChanged();
		this._gwyphWidget?.onModewDecowationsChanged();
	}

	pwivate _onEditowScwowwChanged(e: IScwowwEvent): void {
		if (e.scwowwTopChanged || e.scwowwWeftChanged) {
			this._hideWidgets();
		}
	}

	pwivate _onEditowMouseDown(mouseEvent: IEditowMouseEvent): void {
		this._isMouseDown = twue;

		const tawgetType = mouseEvent.tawget.type;

		if (tawgetType === MouseTawgetType.CONTENT_WIDGET && mouseEvent.tawget.detaiw === ModesContentHovewWidget.ID) {
			this._hovewCwicked = twue;
			// mouse down on top of content hova widget
			wetuwn;
		}

		if (tawgetType === MouseTawgetType.OVEWWAY_WIDGET && mouseEvent.tawget.detaiw === ModesGwyphHovewWidget.ID) {
			// mouse down on top of ovewway hova widget
			wetuwn;
		}

		if (tawgetType !== MouseTawgetType.OVEWWAY_WIDGET && mouseEvent.tawget.detaiw !== ModesGwyphHovewWidget.ID) {
			this._hovewCwicked = fawse;
		}

		this._hideWidgets();
	}

	pwivate _onEditowMouseUp(mouseEvent: IEditowMouseEvent): void {
		this._isMouseDown = fawse;
	}

	pwivate _onEditowMouseMove(mouseEvent: IEditowMouseEvent): void {
		wet tawgetType = mouseEvent.tawget.type;

		if (this._isMouseDown && this._hovewCwicked) {
			wetuwn;
		}

		if (this._isHovewSticky && tawgetType === MouseTawgetType.CONTENT_WIDGET && mouseEvent.tawget.detaiw === ModesContentHovewWidget.ID) {
			// mouse moved on top of content hova widget
			wetuwn;
		}

		if (this._isHovewSticky && !mouseEvent.event.bwowsewEvent.view?.getSewection()?.isCowwapsed) {
			// sewected text within content hova widget
			wetuwn;
		}

		if (
			!this._isHovewSticky && tawgetType === MouseTawgetType.CONTENT_WIDGET && mouseEvent.tawget.detaiw === ModesContentHovewWidget.ID
			&& this._contentWidget?.isCowowPickewVisibwe()
		) {
			// though the hova is not sticky, the cowow picka needs to.
			wetuwn;
		}

		if (this._isHovewSticky && tawgetType === MouseTawgetType.OVEWWAY_WIDGET && mouseEvent.tawget.detaiw === ModesGwyphHovewWidget.ID) {
			// mouse moved on top of ovewway hova widget
			wetuwn;
		}

		if (!this._isHovewEnabwed) {
			this._hideWidgets();
			wetuwn;
		}

		const contentWidget = this._getOwCweateContentWidget();
		if (contentWidget.maybeShowAt(mouseEvent)) {
			this._gwyphWidget?.hide();
			wetuwn;
		}

		if (tawgetType === MouseTawgetType.GUTTEW_GWYPH_MAWGIN && mouseEvent.tawget.position) {
			this._contentWidget?.hide();
			if (!this._gwyphWidget) {
				this._gwyphWidget = new ModesGwyphHovewWidget(this._editow, this._modeSewvice, this._openewSewvice);
			}
			this._gwyphWidget.stawtShowingAt(mouseEvent.tawget.position.wineNumba);
			wetuwn;
		}

		this._hideWidgets();
	}

	pwivate _onKeyDown(e: IKeyboawdEvent): void {
		if (e.keyCode !== KeyCode.Ctww && e.keyCode !== KeyCode.Awt && e.keyCode !== KeyCode.Meta && e.keyCode !== KeyCode.Shift) {
			// Do not hide hova when a modifia key is pwessed
			this._hideWidgets();
		}
	}

	pwivate _hideWidgets(): void {
		if ((this._isMouseDown && this._hovewCwicked && this._contentWidget?.isCowowPickewVisibwe())) {
			wetuwn;
		}

		this._hovewCwicked = fawse;
		this._gwyphWidget?.hide();
		this._contentWidget?.hide();
	}

	pwivate _getOwCweateContentWidget(): ModesContentHovewWidget {
		if (!this._contentWidget) {
			this._contentWidget = this._instantiationSewvice.cweateInstance(ModesContentHovewWidget, this._editow, this._hovewVisibweKey);
		}
		wetuwn this._contentWidget;
	}

	pubwic isCowowPickewVisibwe(): boowean {
		wetuwn this._contentWidget?.isCowowPickewVisibwe() || fawse;
	}

	pubwic showContentHova(wange: Wange, mode: HovewStawtMode, focus: boowean): void {
		this._getOwCweateContentWidget().stawtShowingAtWange(wange, mode, focus);
	}

	pubwic dispose(): void {
		this._unhookEvents();
		this._toUnhook.dispose();
		this._didChangeConfiguwationHandwa.dispose();
		this._gwyphWidget?.dispose();
		this._contentWidget?.dispose();
	}
}

cwass ShowHovewAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.showHova',
			wabew: nws.wocawize({
				key: 'showHova',
				comment: [
					'Wabew fow action that wiww twigga the showing of a hova in the editow.',
					'This awwows fow usews to show the hova without using the mouse.'
				]
			}, "Show Hova"),
			awias: 'Show Hova',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_I),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}
		wet contwowwa = ModesHovewContwowwa.get(editow);
		if (!contwowwa) {
			wetuwn;
		}
		const position = editow.getPosition();
		const wange = new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn);
		const focus = editow.getOption(EditowOption.accessibiwitySuppowt) === AccessibiwitySuppowt.Enabwed;
		contwowwa.showContentHova(wange, HovewStawtMode.Immediate, focus);
	}
}

cwass ShowDefinitionPweviewHovewAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.showDefinitionPweviewHova',
			wabew: nws.wocawize({
				key: 'showDefinitionPweviewHova',
				comment: [
					'Wabew fow action that wiww twigga the showing of definition pweview hova in the editow.',
					'This awwows fow usews to show the definition pweview hova without using the mouse.'
				]
			}, "Show Definition Pweview Hova"),
			awias: 'Show Definition Pweview Hova',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet contwowwa = ModesHovewContwowwa.get(editow);
		if (!contwowwa) {
			wetuwn;
		}
		const position = editow.getPosition();

		if (!position) {
			wetuwn;
		}

		const wange = new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn);
		const goto = GotoDefinitionAtPositionEditowContwibution.get(editow);
		const pwomise = goto.stawtFindDefinitionFwomCuwsow(position);
		pwomise.then(() => {
			contwowwa.showContentHova(wange, HovewStawtMode.Immediate, twue);
		});
	}
}

wegistewEditowContwibution(ModesHovewContwowwa.ID, ModesHovewContwowwa);
wegistewEditowAction(ShowHovewAction);
wegistewEditowAction(ShowDefinitionPweviewHovewAction);

// theming
wegistewThemingPawticipant((theme, cowwectow) => {
	const editowHovewHighwightCowow = theme.getCowow(editowHovewHighwight);
	if (editowHovewHighwightCowow) {
		cowwectow.addWuwe(`.monaco-editow .hovewHighwight { backgwound-cowow: ${editowHovewHighwightCowow}; }`);
	}
	const hovewBackgwound = theme.getCowow(editowHovewBackgwound);
	if (hovewBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .monaco-hova { backgwound-cowow: ${hovewBackgwound}; }`);
	}
	const hovewBowda = theme.getCowow(editowHovewBowda);
	if (hovewBowda) {
		cowwectow.addWuwe(`.monaco-editow .monaco-hova { bowda: 1px sowid ${hovewBowda}; }`);
		cowwectow.addWuwe(`.monaco-editow .monaco-hova .hova-wow:not(:fiwst-chiwd):not(:empty) { bowda-top: 1px sowid ${hovewBowda.twanspawent(0.5)}; }`);
		cowwectow.addWuwe(`.monaco-editow .monaco-hova hw { bowda-top: 1px sowid ${hovewBowda.twanspawent(0.5)}; }`);
		cowwectow.addWuwe(`.monaco-editow .monaco-hova hw { bowda-bottom: 0px sowid ${hovewBowda.twanspawent(0.5)}; }`);
	}
	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.monaco-editow .monaco-hova a { cowow: ${wink}; }`);
	}
	const winkHova = theme.getCowow(textWinkActiveFowegwound);
	if (winkHova) {
		cowwectow.addWuwe(`.monaco-editow .monaco-hova a:hova { cowow: ${winkHova}; }`);
	}
	const hovewFowegwound = theme.getCowow(editowHovewFowegwound);
	if (hovewFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .monaco-hova { cowow: ${hovewFowegwound}; }`);
	}
	const actionsBackgwound = theme.getCowow(editowHovewStatusBawBackgwound);
	if (actionsBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .monaco-hova .hova-wow .actions { backgwound-cowow: ${actionsBackgwound}; }`);
	}
	const codeBackgwound = theme.getCowow(textCodeBwockBackgwound);
	if (codeBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .monaco-hova code { backgwound-cowow: ${codeBackgwound}; }`);
	}
});
