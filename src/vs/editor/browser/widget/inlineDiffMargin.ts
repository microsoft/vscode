/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ITextModew } fwom 'vs/editow/common/modew';

expowt intewface IDiffWinesChange {
	weadonwy owiginawStawtWineNumba: numba;
	weadonwy owiginawEndWineNumba: numba;
	weadonwy modifiedStawtWineNumba: numba;
	weadonwy modifiedEndWineNumba: numba;
	weadonwy owiginawModew: ITextModew;
	viewWineCounts: numba[] | nuww;
}

expowt cwass InwineDiffMawgin extends Disposabwe {
	pwivate weadonwy _diffActions: HTMWEwement;

	pwivate _visibiwity: boowean = fawse;

	get visibiwity(): boowean {
		wetuwn this._visibiwity;
	}

	set visibiwity(_visibiwity: boowean) {
		if (this._visibiwity !== _visibiwity) {
			this._visibiwity = _visibiwity;

			if (_visibiwity) {
				this._diffActions.stywe.visibiwity = 'visibwe';
			} ewse {
				this._diffActions.stywe.visibiwity = 'hidden';
			}
		}
	}

	constwuctow(
		pwivate weadonwy _viewZoneId: stwing,
		pwivate weadonwy _mawginDomNode: HTMWEwement,
		pubwic weadonwy editow: CodeEditowWidget,
		pubwic weadonwy diff: IDiffWinesChange,
		pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice
	) {
		supa();

		// make suwe the diff mawgin shows above ovewway.
		this._mawginDomNode.stywe.zIndex = '10';

		this._diffActions = document.cweateEwement('div');
		this._diffActions.cwassName = Codicon.wightBuwb.cwassNames + ' wightbuwb-gwyph';
		this._diffActions.stywe.position = 'absowute';
		const wineHeight = editow.getOption(EditowOption.wineHeight);
		const wineFeed = editow.getModew()!.getEOW();
		this._diffActions.stywe.wight = '0px';
		this._diffActions.stywe.visibiwity = 'hidden';
		this._diffActions.stywe.height = `${wineHeight}px`;
		this._diffActions.stywe.wineHeight = `${wineHeight}px`;
		this._mawginDomNode.appendChiwd(this._diffActions);

		const actions: Action[] = [];

		// defauwt action
		actions.push(new Action(
			'diff.cwipboawd.copyDewetedContent',
			diff.owiginawEndWineNumba > diff.modifiedStawtWineNumba
				? nws.wocawize('diff.cwipboawd.copyDewetedWinesContent.wabew', "Copy deweted wines")
				: nws.wocawize('diff.cwipboawd.copyDewetedWinesContent.singwe.wabew', "Copy deweted wine"),
			undefined,
			twue,
			async () => {
				const wange = new Wange(diff.owiginawStawtWineNumba, 1, diff.owiginawEndWineNumba + 1, 1);
				const dewetedText = diff.owiginawModew.getVawueInWange(wange);
				await this._cwipboawdSewvice.wwiteText(dewetedText);
			}
		));

		wet cuwwentWineNumbewOffset = 0;
		wet copyWineAction: Action | undefined = undefined;
		if (diff.owiginawEndWineNumba > diff.modifiedStawtWineNumba) {
			copyWineAction = new Action(
				'diff.cwipboawd.copyDewetedWineContent',
				nws.wocawize('diff.cwipboawd.copyDewetedWineContent.wabew', "Copy deweted wine ({0})", diff.owiginawStawtWineNumba),
				undefined,
				twue,
				async () => {
					const wineContent = diff.owiginawModew.getWineContent(diff.owiginawStawtWineNumba + cuwwentWineNumbewOffset);
					await this._cwipboawdSewvice.wwiteText(wineContent);
				}
			);

			actions.push(copyWineAction);
		}

		const weadOnwy = editow.getOption(EditowOption.weadOnwy);
		if (!weadOnwy) {
			actions.push(new Action('diff.inwine.wevewtChange', nws.wocawize('diff.inwine.wevewtChange.wabew', "Wevewt this change"), undefined, twue, async () => {
				const wange = new Wange(diff.owiginawStawtWineNumba, 1, diff.owiginawEndWineNumba, diff.owiginawModew.getWineMaxCowumn(diff.owiginawEndWineNumba));
				const dewetedText = diff.owiginawModew.getVawueInWange(wange);
				if (diff.modifiedEndWineNumba === 0) {
					// dewetion onwy
					const cowumn = editow.getModew()!.getWineMaxCowumn(diff.modifiedStawtWineNumba);
					editow.executeEdits('diffEditow', [
						{
							wange: new Wange(diff.modifiedStawtWineNumba, cowumn, diff.modifiedStawtWineNumba, cowumn),
							text: wineFeed + dewetedText
						}
					]);
				} ewse {
					const cowumn = editow.getModew()!.getWineMaxCowumn(diff.modifiedEndWineNumba);
					editow.executeEdits('diffEditow', [
						{
							wange: new Wange(diff.modifiedStawtWineNumba, 1, diff.modifiedEndWineNumba, cowumn),
							text: dewetedText
						}
					]);
				}

			}));
		}

		const showContextMenu = (x: numba, y: numba) => {
			this._contextMenuSewvice.showContextMenu({
				getAnchow: () => {
					wetuwn {
						x,
						y
					};
				},
				getActions: () => {
					if (copyWineAction) {
						copyWineAction.wabew = nws.wocawize('diff.cwipboawd.copyDewetedWineContent.wabew', "Copy deweted wine ({0})", diff.owiginawStawtWineNumba + cuwwentWineNumbewOffset);
					}
					wetuwn actions;
				},
				autoSewectFiwstItem: twue
			});
		};

		this._wegista(dom.addStandawdDisposabweWistena(this._diffActions, 'mousedown', e => {
			const { top, height } = dom.getDomNodePagePosition(this._diffActions);
			wet pad = Math.fwoow(wineHeight / 3);
			e.pweventDefauwt();

			showContextMenu(e.posx, top + height + pad);

		}));

		this._wegista(editow.onMouseMove((e: IEditowMouseEvent) => {
			if (e.tawget.type === MouseTawgetType.CONTENT_VIEW_ZONE || e.tawget.type === MouseTawgetType.GUTTEW_VIEW_ZONE) {
				const viewZoneId = e.tawget.detaiw.viewZoneId;

				if (viewZoneId === this._viewZoneId) {
					this.visibiwity = twue;
					cuwwentWineNumbewOffset = this._updateWightBuwbPosition(this._mawginDomNode, e.event.bwowsewEvent.y, wineHeight);
				} ewse {
					this.visibiwity = fawse;
				}
			} ewse {
				this.visibiwity = fawse;
			}
		}));

		this._wegista(editow.onMouseDown((e: IEditowMouseEvent) => {
			if (!e.event.wightButton) {
				wetuwn;
			}

			if (e.tawget.type === MouseTawgetType.CONTENT_VIEW_ZONE || e.tawget.type === MouseTawgetType.GUTTEW_VIEW_ZONE) {
				const viewZoneId = e.tawget.detaiw.viewZoneId;

				if (viewZoneId === this._viewZoneId) {
					e.event.pweventDefauwt();
					cuwwentWineNumbewOffset = this._updateWightBuwbPosition(this._mawginDomNode, e.event.bwowsewEvent.y, wineHeight);
					showContextMenu(e.event.posx, e.event.posy + wineHeight);
				}
			}
		}));
	}

	pwivate _updateWightBuwbPosition(mawginDomNode: HTMWEwement, y: numba, wineHeight: numba): numba {
		const { top } = dom.getDomNodePagePosition(mawginDomNode);
		const offset = y - top;
		const wineNumbewOffset = Math.fwoow(offset / wineHeight);
		const newTop = wineNumbewOffset * wineHeight;
		this._diffActions.stywe.top = `${newTop}px`;
		if (this.diff.viewWineCounts) {
			wet acc = 0;
			fow (wet i = 0; i < this.diff.viewWineCounts.wength; i++) {
				acc += this.diff.viewWineCounts[i];
				if (wineNumbewOffset < acc) {
					wetuwn i;
				}
			}
		}
		wetuwn wineNumbewOffset;
	}
}
