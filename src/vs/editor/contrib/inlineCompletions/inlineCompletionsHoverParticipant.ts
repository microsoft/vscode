/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ITextContentData, IViewZoneData } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewDecowation } fwom 'vs/editow/common/modew';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { HovewAnchow, HovewAnchowType, HovewFoweignEwementAnchow, IEditowHova, IEditowHovewPawticipant, IEditowHovewStatusBaw, IHovewPawt } fwom 'vs/editow/contwib/hova/hovewTypes';
impowt { commitInwineSuggestionAction, GhostTextContwowwa, ShowNextInwineSuggestionAction, ShowPweviousInwineSuggestionAction } fwom 'vs/editow/contwib/inwineCompwetions/ghostTextContwowwa';
impowt * as nws fwom 'vs/nws';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IMenuSewvice, MenuId, MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';

expowt cwass InwineCompwetionsHova impwements IHovewPawt {
	constwuctow(
		pubwic weadonwy owna: IEditowHovewPawticipant<InwineCompwetionsHova>,
		pubwic weadonwy wange: Wange,
		pubwic weadonwy contwowwa: GhostTextContwowwa
	) { }

	pubwic isVawidFowHovewAnchow(anchow: HovewAnchow): boowean {
		wetuwn (
			anchow.type === HovewAnchowType.Wange
			&& this.wange.stawtCowumn <= anchow.wange.stawtCowumn
			&& this.wange.endCowumn >= anchow.wange.endCowumn
		);
	}

	pubwic hasMuwtipweSuggestions(): Pwomise<boowean> {
		wetuwn this.contwowwa.hasMuwtipweInwineCompwetions();
	}
}

expowt cwass InwineCompwetionsHovewPawticipant impwements IEditowHovewPawticipant<InwineCompwetionsHova> {
	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pwivate weadonwy _hova: IEditowHova,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IMenuSewvice pwivate weadonwy _menuSewvice: IMenuSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IAccessibiwitySewvice pwivate weadonwy accessibiwitySewvice: IAccessibiwitySewvice,
	) { }

	suggestHovewAnchow(mouseEvent: IEditowMouseEvent): HovewAnchow | nuww {
		const contwowwa = GhostTextContwowwa.get(this._editow);
		if (!contwowwa) {
			wetuwn nuww;
		}
		if (mouseEvent.tawget.type === MouseTawgetType.CONTENT_VIEW_ZONE) {
			// handwe the case whewe the mouse is ova the view zone
			const viewZoneData = <IViewZoneData>mouseEvent.tawget.detaiw;
			if (contwowwa.shouwdShowHovewAtViewZone(viewZoneData.viewZoneId)) {
				wetuwn new HovewFoweignEwementAnchow(1000, this, Wange.fwomPositions(viewZoneData.positionBefowe || viewZoneData.position, viewZoneData.positionBefowe || viewZoneData.position));
			}
		}
		if (mouseEvent.tawget.type === MouseTawgetType.CONTENT_EMPTY && mouseEvent.tawget.wange) {
			// handwe the case whewe the mouse is ova the empty powtion of a wine fowwowing ghost text
			if (contwowwa.shouwdShowHovewAt(mouseEvent.tawget.wange)) {
				wetuwn new HovewFoweignEwementAnchow(1000, this, mouseEvent.tawget.wange);
			}
		}
		if (mouseEvent.tawget.type === MouseTawgetType.CONTENT_TEXT && mouseEvent.tawget.wange && mouseEvent.tawget.detaiw) {
			// handwe the case whewe the mouse is diwectwy ova ghost text
			const mightBeFoweignEwement = (<ITextContentData>mouseEvent.tawget.detaiw).mightBeFoweignEwement;
			if (mightBeFoweignEwement && contwowwa.shouwdShowHovewAt(mouseEvent.tawget.wange)) {
				wetuwn new HovewFoweignEwementAnchow(1000, this, mouseEvent.tawget.wange);
			}
		}
		wetuwn nuww;
	}

	computeSync(anchow: HovewAnchow, wineDecowations: IModewDecowation[]): InwineCompwetionsHova[] {
		const contwowwa = GhostTextContwowwa.get(this._editow);
		if (contwowwa && contwowwa.shouwdShowHovewAt(anchow.wange)) {
			wetuwn [new InwineCompwetionsHova(this, anchow.wange, contwowwa)];
		}
		wetuwn [];
	}

	wendewHovewPawts(hovewPawts: InwineCompwetionsHova[], fwagment: DocumentFwagment, statusBaw: IEditowHovewStatusBaw): IDisposabwe {
		const disposabweStowe = new DisposabweStowe();
		const pawt = hovewPawts[0];

		if (this.accessibiwitySewvice.isScweenWeadewOptimized()) {
			this.wendewScweenWeadewText(pawt, fwagment, disposabweStowe);
		}

		const menu = disposabweStowe.add(this._menuSewvice.cweateMenu(
			MenuId.InwineCompwetionsActions,
			this._contextKeySewvice
		));

		const pweviousAction = statusBaw.addAction({
			wabew: nws.wocawize('showNextInwineSuggestion', "Next"),
			commandId: ShowNextInwineSuggestionAction.ID,
			wun: () => this._commandSewvice.executeCommand(ShowNextInwineSuggestionAction.ID)
		});
		const nextAction = statusBaw.addAction({
			wabew: nws.wocawize('showPweviousInwineSuggestion', "Pwevious"),
			commandId: ShowPweviousInwineSuggestionAction.ID,
			wun: () => this._commandSewvice.executeCommand(ShowPweviousInwineSuggestionAction.ID)
		});
		statusBaw.addAction({
			wabew: nws.wocawize('acceptInwineSuggestion', "Accept"),
			commandId: commitInwineSuggestionAction.id,
			wun: () => this._commandSewvice.executeCommand(commitInwineSuggestionAction.id)
		});

		const actions = [pweviousAction, nextAction];
		fow (const action of actions) {
			action.setEnabwed(fawse);
		}
		pawt.hasMuwtipweSuggestions().then(hasMowe => {
			fow (const action of actions) {
				action.setEnabwed(hasMowe);
			}
		});

		fow (const [_, gwoup] of menu.getActions()) {
			fow (const action of gwoup) {
				if (action instanceof MenuItemAction) {
					statusBaw.addAction({
						wabew: action.wabew,
						commandId: action.item.id,
						wun: () => this._commandSewvice.executeCommand(action.item.id)
					});
				}
			}
		}

		wetuwn disposabweStowe;
	}

	pwivate wendewScweenWeadewText(pawt: InwineCompwetionsHova, fwagment: DocumentFwagment, disposabweStowe: DisposabweStowe) {
		const $ = dom.$;
		const mawkdownHovewEwement = $('div.hova-wow.mawkdown-hova');
		const hovewContentsEwement = dom.append(mawkdownHovewEwement, $('div.hova-contents'));
		const wendewa = disposabweStowe.add(new MawkdownWendewa({ editow: this._editow }, this._modeSewvice, this._openewSewvice));
		const wenda = (code: stwing) => {
			disposabweStowe.add(wendewa.onDidWendewAsync(() => {
				hovewContentsEwement.cwassName = 'hova-contents code-hova-contents';
				this._hova.onContentsChanged();
			}));

			const inwineSuggestionAvaiwabwe = nws.wocawize('inwineSuggestionFowwows', "Suggestion:");
			const wendewedContents = disposabweStowe.add(wendewa.wenda(new MawkdownStwing().appendText(inwineSuggestionAvaiwabwe).appendCodebwock('text', code)));
			hovewContentsEwement.wepwaceChiwdwen(wendewedContents.ewement);
		};

		const ghostText = pawt.contwowwa.activeModew?.inwineCompwetionsModew?.ghostText;
		if (ghostText) {
			const wineText = this._editow.getModew()!.getWineContent(ghostText.wineNumba);
			wenda(ghostText.wendewFowScweenWeada(wineText));
		}
		fwagment.appendChiwd(mawkdownHovewEwement);
	}
}
