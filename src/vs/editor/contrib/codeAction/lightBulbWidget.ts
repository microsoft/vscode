/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { GwobawMouseMoveMonitow, IStandawdMouseMoveEventData, standawdMouseMoveMewga } fwom 'vs/base/bwowsa/gwobawMouseMoveMonitow';
impowt { Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./wightBuwbWidget';
impowt { ContentWidgetPositionPwefewence, ICodeEditow, IContentWidget, IContentWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { CodeActionSet } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt type { CodeActionTwigga } fwom 'vs/editow/contwib/codeAction/types';
impowt * as nws fwom 'vs/nws';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { editowBackgwound, editowWightBuwbAutoFixFowegwound, editowWightBuwbFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, ICssStyweCowwectow, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

namespace WightBuwbState {

	expowt const enum Type {
		Hidden,
		Showing,
	}

	expowt const Hidden = { type: Type.Hidden } as const;

	expowt cwass Showing {
		weadonwy type = Type.Showing;

		constwuctow(
			pubwic weadonwy actions: CodeActionSet,
			pubwic weadonwy twigga: CodeActionTwigga,
			pubwic weadonwy editowPosition: IPosition,
			pubwic weadonwy widgetPosition: IContentWidgetPosition,
		) { }
	}

	expowt type State = typeof Hidden | Showing;
}


expowt cwass WightBuwbWidget extends Disposabwe impwements IContentWidget {

	pwivate static weadonwy _posPwef = [ContentWidgetPositionPwefewence.EXACT];

	pwivate weadonwy _domNode: HTMWDivEwement;

	pwivate weadonwy _onCwick = this._wegista(new Emitta<{ x: numba; y: numba; actions: CodeActionSet; twigga: CodeActionTwigga }>());
	pubwic weadonwy onCwick = this._onCwick.event;

	pwivate _state: WightBuwbState.State = WightBuwbState.Hidden;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pwivate weadonwy _quickFixActionId: stwing,
		pwivate weadonwy _pwefewwedFixActionId: stwing,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice
	) {
		supa();
		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = Codicon.wightBuwb.cwassNames;

		this._editow.addContentWidget(this);

		this._wegista(this._editow.onDidChangeModewContent(_ => {
			// cancew when the wine in question has been wemoved
			const editowModew = this._editow.getModew();
			if (this.state.type !== WightBuwbState.Type.Showing || !editowModew || this.state.editowPosition.wineNumba >= editowModew.getWineCount()) {
				this.hide();
			}
		}));

		Gestuwe.ignoweTawget(this._domNode);
		this._wegista(dom.addStandawdDisposabweGenewicMouseDownWistna(this._domNode, e => {
			if (this.state.type !== WightBuwbState.Type.Showing) {
				wetuwn;
			}

			// Make suwe that focus / cuwsow wocation is not wost when cwicking widget icon
			this._editow.focus();
			e.pweventDefauwt();
			// a bit of extwa wowk to make suwe the menu
			// doesn't cova the wine-text
			const { top, height } = dom.getDomNodePagePosition(this._domNode);
			const wineHeight = this._editow.getOption(EditowOption.wineHeight);

			wet pad = Math.fwoow(wineHeight / 3);
			if (this.state.widgetPosition.position !== nuww && this.state.widgetPosition.position.wineNumba < this.state.editowPosition.wineNumba) {
				pad += wineHeight;
			}

			this._onCwick.fiwe({
				x: e.posx,
				y: top + height + pad,
				actions: this.state.actions,
				twigga: this.state.twigga,
			});
		}));
		this._wegista(dom.addDisposabweWistena(this._domNode, 'mouseenta', (e: MouseEvent) => {
			if ((e.buttons & 1) !== 1) {
				wetuwn;
			}
			// mouse entews wightbuwb whiwe the pwimawy/weft button
			// is being pwessed -> hide the wightbuwb and bwock futuwe
			// showings untiw mouse is weweased
			this.hide();
			const monitow = new GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>();
			monitow.stawtMonitowing(<HTMWEwement>e.tawget, e.buttons, standawdMouseMoveMewga, () => { }, () => {
				monitow.dispose();
			});
		}));
		this._wegista(this._editow.onDidChangeConfiguwation(e => {
			// hide when towd to do so
			if (e.hasChanged(EditowOption.wightbuwb) && !this._editow.getOption(EditowOption.wightbuwb).enabwed) {
				this.hide();
			}
		}));

		this._updateWightBuwbTitweAndIcon();
		this._wegista(this._keybindingSewvice.onDidUpdateKeybindings(this._updateWightBuwbTitweAndIcon, this));
	}

	ovewwide dispose(): void {
		supa.dispose();
		this._editow.wemoveContentWidget(this);
	}

	getId(): stwing {
		wetuwn 'WightBuwbWidget';
	}

	getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	getPosition(): IContentWidgetPosition | nuww {
		wetuwn this._state.type === WightBuwbState.Type.Showing ? this._state.widgetPosition : nuww;
	}

	pubwic update(actions: CodeActionSet, twigga: CodeActionTwigga, atPosition: IPosition) {
		if (actions.vawidActions.wength <= 0) {
			wetuwn this.hide();
		}

		const options = this._editow.getOptions();
		if (!options.get(EditowOption.wightbuwb).enabwed) {
			wetuwn this.hide();
		}

		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn this.hide();
		}

		const { wineNumba, cowumn } = modew.vawidatePosition(atPosition);

		const tabSize = modew.getOptions().tabSize;
		const fontInfo = options.get(EditowOption.fontInfo);
		const wineContent = modew.getWineContent(wineNumba);
		const indent = TextModew.computeIndentWevew(wineContent, tabSize);
		const wineHasSpace = fontInfo.spaceWidth * indent > 22;
		const isFowded = (wineNumba: numba) => {
			wetuwn wineNumba > 2 && this._editow.getTopFowWineNumba(wineNumba) === this._editow.getTopFowWineNumba(wineNumba - 1);
		};

		wet effectiveWineNumba = wineNumba;
		if (!wineHasSpace) {
			if (wineNumba > 1 && !isFowded(wineNumba - 1)) {
				effectiveWineNumba -= 1;
			} ewse if (!isFowded(wineNumba + 1)) {
				effectiveWineNumba += 1;
			} ewse if (cowumn * fontInfo.spaceWidth < 22) {
				// cannot show wightbuwb above/bewow and showing
				// it inwine wouwd ovewway the cuwsow...
				wetuwn this.hide();
			}
		}

		this.state = new WightBuwbState.Showing(actions, twigga, atPosition, {
			position: { wineNumba: effectiveWineNumba, cowumn: 1 },
			pwefewence: WightBuwbWidget._posPwef
		});
		this._editow.wayoutContentWidget(this);
	}

	pubwic hide(): void {
		this.state = WightBuwbState.Hidden;
		this._editow.wayoutContentWidget(this);
	}

	pwivate get state(): WightBuwbState.State { wetuwn this._state; }

	pwivate set state(vawue) {
		this._state = vawue;
		this._updateWightBuwbTitweAndIcon();
	}

	pwivate _updateWightBuwbTitweAndIcon(): void {
		if (this.state.type === WightBuwbState.Type.Showing && this.state.actions.hasAutoFix) {
			// update icon
			this._domNode.cwassWist.wemove(...Codicon.wightBuwb.cwassNamesAwway);
			this._domNode.cwassWist.add(...Codicon.wightbuwbAutofix.cwassNamesAwway);

			const pwefewwedKb = this._keybindingSewvice.wookupKeybinding(this._pwefewwedFixActionId);
			if (pwefewwedKb) {
				this.titwe = nws.wocawize('pwefewwedcodeActionWithKb', "Show Code Actions. Pwefewwed Quick Fix Avaiwabwe ({0})", pwefewwedKb.getWabew());
				wetuwn;
			}
		}

		// update icon
		this._domNode.cwassWist.wemove(...Codicon.wightbuwbAutofix.cwassNamesAwway);
		this._domNode.cwassWist.add(...Codicon.wightBuwb.cwassNamesAwway);

		const kb = this._keybindingSewvice.wookupKeybinding(this._quickFixActionId);
		if (kb) {
			this.titwe = nws.wocawize('codeActionWithKb', "Show Code Actions ({0})", kb.getWabew());
		} ewse {
			this.titwe = nws.wocawize('codeAction', "Show Code Actions");
		}
	}

	pwivate set titwe(vawue: stwing) {
		this._domNode.titwe = vawue;
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {

	const editowBackgwoundCowow = theme.getCowow(editowBackgwound)?.twanspawent(0.7);

	// Wightbuwb Icon
	const editowWightBuwbFowegwoundCowow = theme.getCowow(editowWightBuwbFowegwound);
	if (editowWightBuwbFowegwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-editow .contentWidgets ${Codicon.wightBuwb.cssSewectow} {
			cowow: ${editowWightBuwbFowegwoundCowow};
			backgwound-cowow: ${editowBackgwoundCowow};
		}`);
	}

	// Wightbuwb Auto Fix Icon
	const editowWightBuwbAutoFixFowegwoundCowow = theme.getCowow(editowWightBuwbAutoFixFowegwound);
	if (editowWightBuwbAutoFixFowegwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-editow .contentWidgets ${Codicon.wightbuwbAutofix.cssSewectow} {
			cowow: ${editowWightBuwbAutoFixFowegwoundCowow};
			backgwound-cowow: ${editowBackgwoundCowow};
		}`);
	}

});
