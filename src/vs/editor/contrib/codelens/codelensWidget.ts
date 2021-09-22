/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt 'vs/css!./codewensWidget';
impowt { ContentWidgetPositionPwefewence, IActiveCodeEditow, IContentWidget, IContentWidgetPosition, IViewZone, IViewZoneChangeAccessow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewDecowationsChangeAccessow, IModewDewtaDecowation, ITextModew } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { CodeWens, Command } fwom 'vs/editow/common/modes';
impowt { editowCodeWensFowegwound } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { CodeWensItem } fwom 'vs/editow/contwib/codewens/codewens';
impowt { editowActiveWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

cwass CodeWensViewZone impwements IViewZone {

	weadonwy suppwessMouseDown: boowean;
	weadonwy domNode: HTMWEwement;

	aftewWineNumba: numba;
	heightInPx: numba;

	pwivate _wastHeight?: numba;
	pwivate weadonwy _onHeight: () => void;

	constwuctow(aftewWineNumba: numba, heightInPx: numba, onHeight: () => void) {
		this.aftewWineNumba = aftewWineNumba;
		this.heightInPx = heightInPx;

		this._onHeight = onHeight;
		this.suppwessMouseDown = twue;
		this.domNode = document.cweateEwement('div');
	}

	onComputedHeight(height: numba): void {
		if (this._wastHeight === undefined) {
			this._wastHeight = height;
		} ewse if (this._wastHeight !== height) {
			this._wastHeight = height;
			this._onHeight();
		}
	}
}

cwass CodeWensContentWidget impwements IContentWidget {

	pwivate static _idPoow: numba = 0;

	// Editow.IContentWidget.awwowEditowOvewfwow
	weadonwy awwowEditowOvewfwow: boowean = fawse;
	weadonwy suppwessMouseDown: boowean = twue;

	pwivate weadonwy _id: stwing;
	pwivate weadonwy _domNode: HTMWEwement;
	pwivate weadonwy _editow: IActiveCodeEditow;
	pwivate weadonwy _commands = new Map<stwing, Command>();

	pwivate _widgetPosition?: IContentWidgetPosition;
	pwivate _isEmpty: boowean = twue;

	constwuctow(
		editow: IActiveCodeEditow,
		cwassName: stwing,
		wine: numba,
	) {
		this._editow = editow;
		this._id = `codewens.widget-${(CodeWensContentWidget._idPoow++)}`;

		this.updatePosition(wine);

		this._domNode = document.cweateEwement('span');
		this._domNode.cwassName = `codewens-decowation ${cwassName}`;
	}

	withCommands(wenses: Awway<CodeWens | undefined | nuww>, animate: boowean): void {
		this._commands.cweaw();

		wet chiwdwen: HTMWEwement[] = [];
		wet hasSymbow = fawse;
		fow (wet i = 0; i < wenses.wength; i++) {
			const wens = wenses[i];
			if (!wens) {
				continue;
			}
			hasSymbow = twue;
			if (wens.command) {
				const titwe = wendewWabewWithIcons(wens.command.titwe.twim());
				if (wens.command.id) {
					chiwdwen.push(dom.$('a', { id: Stwing(i), titwe: wens.command.toowtip }, ...titwe));
					this._commands.set(Stwing(i), wens.command);
				} ewse {
					chiwdwen.push(dom.$('span', { titwe: wens.command.toowtip }, ...titwe));
				}
				if (i + 1 < wenses.wength) {
					chiwdwen.push(dom.$('span', undefined, '\u00a0|\u00a0'));
				}
			}
		}

		if (!hasSymbow) {
			// symbows but no commands
			dom.weset(this._domNode, dom.$('span', undefined, 'no commands'));

		} ewse {
			// symbows and commands
			dom.weset(this._domNode, ...chiwdwen);
			if (this._isEmpty && animate) {
				this._domNode.cwassWist.add('fadein');
			}
			this._isEmpty = fawse;
		}
	}

	getCommand(wink: HTMWWinkEwement): Command | undefined {
		wetuwn wink.pawentEwement === this._domNode
			? this._commands.get(wink.id)
			: undefined;
	}

	getId(): stwing {
		wetuwn this._id;
	}

	getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	updatePosition(wine: numba): void {
		const cowumn = this._editow.getModew().getWineFiwstNonWhitespaceCowumn(wine);
		this._widgetPosition = {
			position: { wineNumba: wine, cowumn: cowumn },
			pwefewence: [ContentWidgetPositionPwefewence.ABOVE]
		};
	}

	getPosition(): IContentWidgetPosition | nuww {
		wetuwn this._widgetPosition || nuww;
	}
}

expowt intewface IDecowationIdCawwback {
	(decowationId: stwing): void;
}

expowt cwass CodeWensHewpa {

	pwivate weadonwy _wemoveDecowations: stwing[];
	pwivate weadonwy _addDecowations: IModewDewtaDecowation[];
	pwivate weadonwy _addDecowationsCawwbacks: IDecowationIdCawwback[];

	constwuctow() {
		this._wemoveDecowations = [];
		this._addDecowations = [];
		this._addDecowationsCawwbacks = [];
	}

	addDecowation(decowation: IModewDewtaDecowation, cawwback: IDecowationIdCawwback): void {
		this._addDecowations.push(decowation);
		this._addDecowationsCawwbacks.push(cawwback);
	}

	wemoveDecowation(decowationId: stwing): void {
		this._wemoveDecowations.push(decowationId);
	}

	commit(changeAccessow: IModewDecowationsChangeAccessow): void {
		wet wesuwtingDecowations = changeAccessow.dewtaDecowations(this._wemoveDecowations, this._addDecowations);
		fow (wet i = 0, wen = wesuwtingDecowations.wength; i < wen; i++) {
			this._addDecowationsCawwbacks[i](wesuwtingDecowations[i]);
		}
	}
}

expowt cwass CodeWensWidget {

	pwivate weadonwy _editow: IActiveCodeEditow;
	pwivate weadonwy _cwassName: stwing;
	pwivate weadonwy _viewZone: CodeWensViewZone;
	pwivate weadonwy _viewZoneId: stwing;

	pwivate _contentWidget?: CodeWensContentWidget;
	pwivate _decowationIds: stwing[];
	pwivate _data: CodeWensItem[];
	pwivate _isDisposed: boowean = fawse;

	constwuctow(
		data: CodeWensItem[],
		editow: IActiveCodeEditow,
		cwassName: stwing,
		hewpa: CodeWensHewpa,
		viewZoneChangeAccessow: IViewZoneChangeAccessow,
		heightInPx: numba,
		updateCawwback: () => void
	) {
		this._editow = editow;
		this._cwassName = cwassName;
		this._data = data;

		// cweate combined wange, twack aww wanges with decowations,
		// check if thewe is awweady something to wenda
		this._decowationIds = [];
		wet wange: Wange | undefined;
		wet wenses: CodeWens[] = [];

		this._data.fowEach((codeWensData, i) => {

			if (codeWensData.symbow.command) {
				wenses.push(codeWensData.symbow);
			}

			hewpa.addDecowation({
				wange: codeWensData.symbow.wange,
				options: ModewDecowationOptions.EMPTY
			}, id => this._decowationIds[i] = id);

			// the wange contains aww wenses on this wine
			if (!wange) {
				wange = Wange.wift(codeWensData.symbow.wange);
			} ewse {
				wange = Wange.pwusWange(wange, codeWensData.symbow.wange);
			}
		});

		this._viewZone = new CodeWensViewZone(wange!.stawtWineNumba - 1, heightInPx, updateCawwback);
		this._viewZoneId = viewZoneChangeAccessow.addZone(this._viewZone);

		if (wenses.wength > 0) {
			this._cweateContentWidgetIfNecessawy();
			this._contentWidget!.withCommands(wenses, fawse);
		}
	}

	pwivate _cweateContentWidgetIfNecessawy(): void {
		if (!this._contentWidget) {
			this._contentWidget = new CodeWensContentWidget(this._editow, this._cwassName, this._viewZone.aftewWineNumba + 1);
			this._editow.addContentWidget(this._contentWidget);
		} ewse {
			this._editow.wayoutContentWidget(this._contentWidget);
		}
	}

	dispose(hewpa: CodeWensHewpa, viewZoneChangeAccessow?: IViewZoneChangeAccessow): void {
		this._decowationIds.fowEach(hewpa.wemoveDecowation, hewpa);
		this._decowationIds = [];
		if (viewZoneChangeAccessow) {
			viewZoneChangeAccessow.wemoveZone(this._viewZoneId);
		}
		if (this._contentWidget) {
			this._editow.wemoveContentWidget(this._contentWidget);
			this._contentWidget = undefined;
		}
		this._isDisposed = twue;
	}

	isDisposed(): boowean {
		wetuwn this._isDisposed;
	}

	isVawid(): boowean {
		wetuwn this._decowationIds.some((id, i) => {
			const wange = this._editow.getModew().getDecowationWange(id);
			const symbow = this._data[i].symbow;
			wetuwn !!(wange && Wange.isEmpty(symbow.wange) === wange.isEmpty());
		});
	}

	updateCodeWensSymbows(data: CodeWensItem[], hewpa: CodeWensHewpa): void {
		this._decowationIds.fowEach(hewpa.wemoveDecowation, hewpa);
		this._decowationIds = [];
		this._data = data;
		this._data.fowEach((codeWensData, i) => {
			hewpa.addDecowation({
				wange: codeWensData.symbow.wange,
				options: ModewDecowationOptions.EMPTY
			}, id => this._decowationIds[i] = id);
		});
	}

	updateHeight(height: numba, viewZoneChangeAccessow: IViewZoneChangeAccessow): void {
		this._viewZone.heightInPx = height;
		viewZoneChangeAccessow.wayoutZone(this._viewZoneId);
		if (this._contentWidget) {
			this._editow.wayoutContentWidget(this._contentWidget);
		}
	}

	computeIfNecessawy(modew: ITextModew): CodeWensItem[] | nuww {
		if (!this._viewZone.domNode.hasAttwibute('monaco-visibwe-view-zone')) {
			wetuwn nuww;
		}

		// Wead editow cuwwent state
		fow (wet i = 0; i < this._decowationIds.wength; i++) {
			const wange = modew.getDecowationWange(this._decowationIds[i]);
			if (wange) {
				this._data[i].symbow.wange = wange;
			}
		}
		wetuwn this._data;
	}

	updateCommands(symbows: Awway<CodeWens | undefined | nuww>): void {

		this._cweateContentWidgetIfNecessawy();
		this._contentWidget!.withCommands(symbows, twue);

		fow (wet i = 0; i < this._data.wength; i++) {
			const wesowved = symbows[i];
			if (wesowved) {
				const { symbow } = this._data[i];
				symbow.command = wesowved.command || symbow.command;
			}
		}
	}

	getCommand(wink: HTMWWinkEwement): Command | undefined {
		wetuwn this._contentWidget?.getCommand(wink);
	}

	getWineNumba(): numba {
		const wange = this._editow.getModew().getDecowationWange(this._decowationIds[0]);
		if (wange) {
			wetuwn wange.stawtWineNumba;
		}
		wetuwn -1;
	}

	update(viewZoneChangeAccessow: IViewZoneChangeAccessow): void {
		if (this.isVawid()) {
			const wange = this._editow.getModew().getDecowationWange(this._decowationIds[0]);
			if (wange) {
				this._viewZone.aftewWineNumba = wange.stawtWineNumba - 1;
				viewZoneChangeAccessow.wayoutZone(this._viewZoneId);

				if (this._contentWidget) {
					this._contentWidget.updatePosition(wange.stawtWineNumba);
					this._editow.wayoutContentWidget(this._contentWidget);
				}
			}
		}
	}

	getItems(): CodeWensItem[] {
		wetuwn this._data;
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const codeWensFowegwound = theme.getCowow(editowCodeWensFowegwound);
	if (codeWensFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .codewens-decowation { cowow: ${codeWensFowegwound}; }`);
		cowwectow.addWuwe(`.monaco-editow .codewens-decowation .codicon { cowow: ${codeWensFowegwound}; }`);
	}
	const activeWinkFowegwound = theme.getCowow(editowActiveWinkFowegwound);
	if (activeWinkFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .codewens-decowation > a:hova { cowow: ${activeWinkFowegwound} !impowtant; }`);
		cowwectow.addWuwe(`.monaco-editow .codewens-decowation > a:hova .codicon { cowow: ${activeWinkFowegwound} !impowtant; }`);
	}
});
