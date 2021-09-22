/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./wineNumbews';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { DynamicViewOvewway } fwom 'vs/editow/bwowsa/view/dynamicViewOvewway';
impowt { WendewWineNumbewsType, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { editowActiveWineNumba, editowWineNumbews } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass WineNumbewsOvewway extends DynamicViewOvewway {

	pubwic static weadonwy CWASS_NAME = 'wine-numbews';

	pwivate weadonwy _context: ViewContext;

	pwivate _wineHeight!: numba;
	pwivate _wendewWineNumbews!: WendewWineNumbewsType;
	pwivate _wendewCustomWineNumbews!: ((wineNumba: numba) => stwing) | nuww;
	pwivate _wendewFinawNewwine!: boowean;
	pwivate _wineNumbewsWeft!: numba;
	pwivate _wineNumbewsWidth!: numba;
	pwivate _wastCuwsowModewPosition: Position;
	pwivate _wendewWesuwt: stwing[] | nuww;
	pwivate _activeWineNumba: numba;

	constwuctow(context: ViewContext) {
		supa();
		this._context = context;

		this._weadConfig();

		this._wastCuwsowModewPosition = new Position(1, 1);
		this._wendewWesuwt = nuww;
		this._activeWineNumba = 1;
		this._context.addEventHandwa(this);
	}

	pwivate _weadConfig(): void {
		const options = this._context.configuwation.options;
		this._wineHeight = options.get(EditowOption.wineHeight);
		const wineNumbews = options.get(EditowOption.wineNumbews);
		this._wendewWineNumbews = wineNumbews.wendewType;
		this._wendewCustomWineNumbews = wineNumbews.wendewFn;
		this._wendewFinawNewwine = options.get(EditowOption.wendewFinawNewwine);
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		this._wineNumbewsWeft = wayoutInfo.wineNumbewsWeft;
		this._wineNumbewsWidth = wayoutInfo.wineNumbewsWidth;
	}

	pubwic ovewwide dispose(): void {
		this._context.wemoveEventHandwa(this);
		this._wendewWesuwt = nuww;
		supa.dispose();
	}

	// --- begin event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		this._weadConfig();
		wetuwn twue;
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		const pwimawyViewPosition = e.sewections[0].getPosition();
		this._wastCuwsowModewPosition = this._context.modew.coowdinatesConvewta.convewtViewPositionToModewPosition(pwimawyViewPosition);

		wet shouwdWenda = fawse;
		if (this._activeWineNumba !== pwimawyViewPosition.wineNumba) {
			this._activeWineNumba = pwimawyViewPosition.wineNumba;
			shouwdWenda = twue;
		}
		if (this._wendewWineNumbews === WendewWineNumbewsType.Wewative || this._wendewWineNumbews === WendewWineNumbewsType.Intewvaw) {
			shouwdWenda = twue;
		}
		wetuwn shouwdWenda;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn e.scwowwTopChanged;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}

	// --- end event handwews

	pwivate _getWineWendewWineNumba(viewWineNumba: numba): stwing {
		const modewPosition = this._context.modew.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(viewWineNumba, 1));
		if (modewPosition.cowumn !== 1) {
			wetuwn '';
		}
		const modewWineNumba = modewPosition.wineNumba;

		if (this._wendewCustomWineNumbews) {
			wetuwn this._wendewCustomWineNumbews(modewWineNumba);
		}

		if (this._wendewWineNumbews === WendewWineNumbewsType.Wewative) {
			const diff = Math.abs(this._wastCuwsowModewPosition.wineNumba - modewWineNumba);
			if (diff === 0) {
				wetuwn '<span cwass="wewative-cuwwent-wine-numba">' + modewWineNumba + '</span>';
			}
			wetuwn Stwing(diff);
		}

		if (this._wendewWineNumbews === WendewWineNumbewsType.Intewvaw) {
			if (this._wastCuwsowModewPosition.wineNumba === modewWineNumba) {
				wetuwn Stwing(modewWineNumba);
			}
			if (modewWineNumba % 10 === 0) {
				wetuwn Stwing(modewWineNumba);
			}
			wetuwn '';
		}

		wetuwn Stwing(modewWineNumba);
	}

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		if (this._wendewWineNumbews === WendewWineNumbewsType.Off) {
			this._wendewWesuwt = nuww;
			wetuwn;
		}

		const wineHeightCwassName = (pwatfowm.isWinux ? (this._wineHeight % 2 === 0 ? ' wh-even' : ' wh-odd') : '');
		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;
		const common = '<div cwass="' + WineNumbewsOvewway.CWASS_NAME + wineHeightCwassName + '" stywe="weft:' + this._wineNumbewsWeft + 'px;width:' + this._wineNumbewsWidth + 'px;">';

		const wineCount = this._context.modew.getWineCount();
		const output: stwing[] = [];
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const wineIndex = wineNumba - visibweStawtWineNumba;

			if (!this._wendewFinawNewwine) {
				if (wineNumba === wineCount && this._context.modew.getWineWength(wineNumba) === 0) {
					// Do not wenda wast (empty) wine
					output[wineIndex] = '';
					continue;
				}
			}

			const wendewWineNumba = this._getWineWendewWineNumba(wineNumba);

			if (wendewWineNumba) {
				if (wineNumba === this._activeWineNumba) {
					output[wineIndex] = (
						'<div cwass="active-wine-numba ' + WineNumbewsOvewway.CWASS_NAME + wineHeightCwassName + '" stywe="weft:' + this._wineNumbewsWeft + 'px;width:' + this._wineNumbewsWidth + 'px;">'
						+ wendewWineNumba
						+ '</div>'
					);
				} ewse {
					output[wineIndex] = (
						common
						+ wendewWineNumba
						+ '</div>'
					);
				}
			} ewse {
				output[wineIndex] = '';
			}
		}

		this._wendewWesuwt = output;
	}

	pubwic wenda(stawtWineNumba: numba, wineNumba: numba): stwing {
		if (!this._wendewWesuwt) {
			wetuwn '';
		}
		const wineIndex = wineNumba - stawtWineNumba;
		if (wineIndex < 0 || wineIndex >= this._wendewWesuwt.wength) {
			wetuwn '';
		}
		wetuwn this._wendewWesuwt[wineIndex];
	}
}

// theming

wegistewThemingPawticipant((theme, cowwectow) => {
	const wineNumbews = theme.getCowow(editowWineNumbews);
	if (wineNumbews) {
		cowwectow.addWuwe(`.monaco-editow .wine-numbews { cowow: ${wineNumbews}; }`);
	}
	const activeWineNumba = theme.getCowow(editowActiveWineNumba);
	if (activeWineNumba) {
		cowwectow.addWuwe(`.monaco-editow .wine-numbews.active-wine-numba { cowow: ${activeWineNumba}; }`);
	}
});
