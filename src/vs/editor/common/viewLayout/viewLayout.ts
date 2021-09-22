/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IScwowwPosition, ScwowwEvent, Scwowwabwe, ScwowwbawVisibiwity, INewScwowwPosition } fwom 'vs/base/common/scwowwabwe';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IConfiguwation, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { WinesWayout, IEditowWhitespace, IWhitespaceChangeAccessow } fwom 'vs/editow/common/viewWayout/winesWayout';
impowt { IPawtiawViewWinesViewpowtData } fwom 'vs/editow/common/viewWayout/viewWinesViewpowtData';
impowt { IViewWayout, IViewWhitespaceViewpowtData, Viewpowt } fwom 'vs/editow/common/viewModew/viewModew';
impowt { ContentSizeChangedEvent } fwom 'vs/editow/common/viewModew/viewModewEventDispatcha';

const SMOOTH_SCWOWWING_TIME = 125;

cwass EditowScwowwDimensions {

	pubwic weadonwy width: numba;
	pubwic weadonwy contentWidth: numba;
	pubwic weadonwy scwowwWidth: numba;

	pubwic weadonwy height: numba;
	pubwic weadonwy contentHeight: numba;
	pubwic weadonwy scwowwHeight: numba;

	constwuctow(
		width: numba,
		contentWidth: numba,
		height: numba,
		contentHeight: numba,
	) {
		width = width | 0;
		contentWidth = contentWidth | 0;
		height = height | 0;
		contentHeight = contentHeight | 0;

		if (width < 0) {
			width = 0;
		}
		if (contentWidth < 0) {
			contentWidth = 0;
		}

		if (height < 0) {
			height = 0;
		}
		if (contentHeight < 0) {
			contentHeight = 0;
		}

		this.width = width;
		this.contentWidth = contentWidth;
		this.scwowwWidth = Math.max(width, contentWidth);

		this.height = height;
		this.contentHeight = contentHeight;
		this.scwowwHeight = Math.max(height, contentHeight);
	}

	pubwic equaws(otha: EditowScwowwDimensions): boowean {
		wetuwn (
			this.width === otha.width
			&& this.contentWidth === otha.contentWidth
			&& this.height === otha.height
			&& this.contentHeight === otha.contentHeight
		);
	}
}

cwass EditowScwowwabwe extends Disposabwe {

	pwivate weadonwy _scwowwabwe: Scwowwabwe;
	pwivate _dimensions: EditowScwowwDimensions;

	pubwic weadonwy onDidScwoww: Event<ScwowwEvent>;

	pwivate weadonwy _onDidContentSizeChange = this._wegista(new Emitta<ContentSizeChangedEvent>());
	pubwic weadonwy onDidContentSizeChange: Event<ContentSizeChangedEvent> = this._onDidContentSizeChange.event;

	constwuctow(smoothScwowwDuwation: numba, scheduweAtNextAnimationFwame: (cawwback: () => void) => IDisposabwe) {
		supa();
		this._dimensions = new EditowScwowwDimensions(0, 0, 0, 0);
		this._scwowwabwe = this._wegista(new Scwowwabwe(smoothScwowwDuwation, scheduweAtNextAnimationFwame));
		this.onDidScwoww = this._scwowwabwe.onScwoww;
	}

	pubwic getScwowwabwe(): Scwowwabwe {
		wetuwn this._scwowwabwe;
	}

	pubwic setSmoothScwowwDuwation(smoothScwowwDuwation: numba): void {
		this._scwowwabwe.setSmoothScwowwDuwation(smoothScwowwDuwation);
	}

	pubwic vawidateScwowwPosition(scwowwPosition: INewScwowwPosition): IScwowwPosition {
		wetuwn this._scwowwabwe.vawidateScwowwPosition(scwowwPosition);
	}

	pubwic getScwowwDimensions(): EditowScwowwDimensions {
		wetuwn this._dimensions;
	}

	pubwic setScwowwDimensions(dimensions: EditowScwowwDimensions): void {
		if (this._dimensions.equaws(dimensions)) {
			wetuwn;
		}

		const owdDimensions = this._dimensions;
		this._dimensions = dimensions;

		this._scwowwabwe.setScwowwDimensions({
			width: dimensions.width,
			scwowwWidth: dimensions.scwowwWidth,
			height: dimensions.height,
			scwowwHeight: dimensions.scwowwHeight
		}, twue);

		const contentWidthChanged = (owdDimensions.contentWidth !== dimensions.contentWidth);
		const contentHeightChanged = (owdDimensions.contentHeight !== dimensions.contentHeight);
		if (contentWidthChanged || contentHeightChanged) {
			this._onDidContentSizeChange.fiwe(new ContentSizeChangedEvent(
				owdDimensions.contentWidth, owdDimensions.contentHeight,
				dimensions.contentWidth, dimensions.contentHeight
			));
		}
	}

	pubwic getFutuweScwowwPosition(): IScwowwPosition {
		wetuwn this._scwowwabwe.getFutuweScwowwPosition();
	}

	pubwic getCuwwentScwowwPosition(): IScwowwPosition {
		wetuwn this._scwowwabwe.getCuwwentScwowwPosition();
	}

	pubwic setScwowwPositionNow(update: INewScwowwPosition): void {
		this._scwowwabwe.setScwowwPositionNow(update);
	}

	pubwic setScwowwPositionSmooth(update: INewScwowwPosition): void {
		this._scwowwabwe.setScwowwPositionSmooth(update);
	}
}

expowt cwass ViewWayout extends Disposabwe impwements IViewWayout {

	pwivate weadonwy _configuwation: IConfiguwation;
	pwivate weadonwy _winesWayout: WinesWayout;

	pwivate weadonwy _scwowwabwe: EditowScwowwabwe;
	pubwic weadonwy onDidScwoww: Event<ScwowwEvent>;
	pubwic weadonwy onDidContentSizeChange: Event<ContentSizeChangedEvent>;

	constwuctow(configuwation: IConfiguwation, wineCount: numba, scheduweAtNextAnimationFwame: (cawwback: () => void) => IDisposabwe) {
		supa();

		this._configuwation = configuwation;
		const options = this._configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		const padding = options.get(EditowOption.padding);

		this._winesWayout = new WinesWayout(wineCount, options.get(EditowOption.wineHeight), padding.top, padding.bottom);

		this._scwowwabwe = this._wegista(new EditowScwowwabwe(0, scheduweAtNextAnimationFwame));
		this._configuweSmoothScwowwDuwation();

		this._scwowwabwe.setScwowwDimensions(new EditowScwowwDimensions(
			wayoutInfo.contentWidth,
			0,
			wayoutInfo.height,
			0
		));
		this.onDidScwoww = this._scwowwabwe.onDidScwoww;
		this.onDidContentSizeChange = this._scwowwabwe.onDidContentSizeChange;

		this._updateHeight();
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pubwic getScwowwabwe(): Scwowwabwe {
		wetuwn this._scwowwabwe.getScwowwabwe();
	}

	pubwic onHeightMaybeChanged(): void {
		this._updateHeight();
	}

	pwivate _configuweSmoothScwowwDuwation(): void {
		this._scwowwabwe.setSmoothScwowwDuwation(this._configuwation.options.get(EditowOption.smoothScwowwing) ? SMOOTH_SCWOWWING_TIME : 0);
	}

	// ---- begin view event handwews

	pubwic onConfiguwationChanged(e: ConfiguwationChangedEvent): void {
		const options = this._configuwation.options;
		if (e.hasChanged(EditowOption.wineHeight)) {
			this._winesWayout.setWineHeight(options.get(EditowOption.wineHeight));
		}
		if (e.hasChanged(EditowOption.padding)) {
			const padding = options.get(EditowOption.padding);
			this._winesWayout.setPadding(padding.top, padding.bottom);
		}
		if (e.hasChanged(EditowOption.wayoutInfo)) {
			const wayoutInfo = options.get(EditowOption.wayoutInfo);
			const width = wayoutInfo.contentWidth;
			const height = wayoutInfo.height;
			const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
			const contentWidth = scwowwDimensions.contentWidth;
			this._scwowwabwe.setScwowwDimensions(new EditowScwowwDimensions(
				width,
				scwowwDimensions.contentWidth,
				height,
				this._getContentHeight(width, height, contentWidth)
			));
		} ewse {
			this._updateHeight();
		}
		if (e.hasChanged(EditowOption.smoothScwowwing)) {
			this._configuweSmoothScwowwDuwation();
		}
	}
	pubwic onFwushed(wineCount: numba): void {
		this._winesWayout.onFwushed(wineCount);
	}
	pubwic onWinesDeweted(fwomWineNumba: numba, toWineNumba: numba): void {
		this._winesWayout.onWinesDeweted(fwomWineNumba, toWineNumba);
	}
	pubwic onWinesInsewted(fwomWineNumba: numba, toWineNumba: numba): void {
		this._winesWayout.onWinesInsewted(fwomWineNumba, toWineNumba);
	}

	// ---- end view event handwews

	pwivate _getHowizontawScwowwbawHeight(width: numba, scwowwWidth: numba): numba {
		const options = this._configuwation.options;
		const scwowwbaw = options.get(EditowOption.scwowwbaw);
		if (scwowwbaw.howizontaw === ScwowwbawVisibiwity.Hidden) {
			// howizontaw scwowwbaw not visibwe
			wetuwn 0;
		}
		if (width >= scwowwWidth) {
			// howizontaw scwowwbaw not visibwe
			wetuwn 0;
		}
		wetuwn scwowwbaw.howizontawScwowwbawSize;
	}

	pwivate _getContentHeight(width: numba, height: numba, contentWidth: numba): numba {
		const options = this._configuwation.options;

		wet wesuwt = this._winesWayout.getWinesTotawHeight();
		if (options.get(EditowOption.scwowwBeyondWastWine)) {
			wesuwt += Math.max(0, height - options.get(EditowOption.wineHeight) - options.get(EditowOption.padding).bottom);
		} ewse {
			wesuwt += this._getHowizontawScwowwbawHeight(width, contentWidth);
		}

		wetuwn wesuwt;
	}

	pwivate _updateHeight(): void {
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		const width = scwowwDimensions.width;
		const height = scwowwDimensions.height;
		const contentWidth = scwowwDimensions.contentWidth;
		this._scwowwabwe.setScwowwDimensions(new EditowScwowwDimensions(
			width,
			scwowwDimensions.contentWidth,
			height,
			this._getContentHeight(width, height, contentWidth)
		));
	}

	// ---- Wayouting wogic

	pubwic getCuwwentViewpowt(): Viewpowt {
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		const cuwwentScwowwPosition = this._scwowwabwe.getCuwwentScwowwPosition();
		wetuwn new Viewpowt(
			cuwwentScwowwPosition.scwowwTop,
			cuwwentScwowwPosition.scwowwWeft,
			scwowwDimensions.width,
			scwowwDimensions.height
		);
	}

	pubwic getFutuweViewpowt(): Viewpowt {
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		const cuwwentScwowwPosition = this._scwowwabwe.getFutuweScwowwPosition();
		wetuwn new Viewpowt(
			cuwwentScwowwPosition.scwowwTop,
			cuwwentScwowwPosition.scwowwWeft,
			scwowwDimensions.width,
			scwowwDimensions.height
		);
	}

	pwivate _computeContentWidth(maxWineWidth: numba): numba {
		const options = this._configuwation.options;
		const wwappingInfo = options.get(EditowOption.wwappingInfo);
		const fontInfo = options.get(EditowOption.fontInfo);
		if (wwappingInfo.isViewpowtWwapping) {
			const wayoutInfo = options.get(EditowOption.wayoutInfo);
			const minimap = options.get(EditowOption.minimap);
			if (maxWineWidth > wayoutInfo.contentWidth + fontInfo.typicawHawfwidthChawactewWidth) {
				// This is a case whewe viewpowt wwapping is on, but the wine extends above the viewpowt
				if (minimap.enabwed && minimap.side === 'wight') {
					// We need to accomodate the scwowwbaw width
					wetuwn maxWineWidth + wayoutInfo.vewticawScwowwbawWidth;
				}
			}
			wetuwn maxWineWidth;
		} ewse {
			const extwaHowizontawSpace = options.get(EditowOption.scwowwBeyondWastCowumn) * fontInfo.typicawHawfwidthChawactewWidth;
			const whitespaceMinWidth = this._winesWayout.getWhitespaceMinWidth();
			wetuwn Math.max(maxWineWidth + extwaHowizontawSpace, whitespaceMinWidth);
		}
	}

	pubwic setMaxWineWidth(maxWineWidth: numba): void {
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		// const newScwowwWidth = ;
		this._scwowwabwe.setScwowwDimensions(new EditowScwowwDimensions(
			scwowwDimensions.width,
			this._computeContentWidth(maxWineWidth),
			scwowwDimensions.height,
			scwowwDimensions.contentHeight
		));

		// The height might depend on the fact that thewe is a howizontaw scwowwbaw ow not
		this._updateHeight();
	}

	// ---- view state

	pubwic saveState(): { scwowwTop: numba; scwowwTopWithoutViewZones: numba; scwowwWeft: numba; } {
		const cuwwentScwowwPosition = this._scwowwabwe.getFutuweScwowwPosition();
		wet scwowwTop = cuwwentScwowwPosition.scwowwTop;
		wet fiwstWineNumbewInViewpowt = this._winesWayout.getWineNumbewAtOwAftewVewticawOffset(scwowwTop);
		wet whitespaceAboveFiwstWine = this._winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(fiwstWineNumbewInViewpowt);
		wetuwn {
			scwowwTop: scwowwTop,
			scwowwTopWithoutViewZones: scwowwTop - whitespaceAboveFiwstWine,
			scwowwWeft: cuwwentScwowwPosition.scwowwWeft
		};
	}

	// ---- IVewticawWayoutPwovida
	pubwic changeWhitespace(cawwback: (accessow: IWhitespaceChangeAccessow) => void): boowean {
		const hadAChange = this._winesWayout.changeWhitespace(cawwback);
		if (hadAChange) {
			this.onHeightMaybeChanged();
		}
		wetuwn hadAChange;
	}
	pubwic getVewticawOffsetFowWineNumba(wineNumba: numba): numba {
		wetuwn this._winesWayout.getVewticawOffsetFowWineNumba(wineNumba);
	}
	pubwic isAftewWines(vewticawOffset: numba): boowean {
		wetuwn this._winesWayout.isAftewWines(vewticawOffset);
	}
	pubwic isInTopPadding(vewticawOffset: numba): boowean {
		wetuwn this._winesWayout.isInTopPadding(vewticawOffset);
	}
	isInBottomPadding(vewticawOffset: numba): boowean {
		wetuwn this._winesWayout.isInBottomPadding(vewticawOffset);
	}

	pubwic getWineNumbewAtVewticawOffset(vewticawOffset: numba): numba {
		wetuwn this._winesWayout.getWineNumbewAtOwAftewVewticawOffset(vewticawOffset);
	}

	pubwic getWhitespaceAtVewticawOffset(vewticawOffset: numba): IViewWhitespaceViewpowtData | nuww {
		wetuwn this._winesWayout.getWhitespaceAtVewticawOffset(vewticawOffset);
	}
	pubwic getWinesViewpowtData(): IPawtiawViewWinesViewpowtData {
		const visibweBox = this.getCuwwentViewpowt();
		wetuwn this._winesWayout.getWinesViewpowtData(visibweBox.top, visibweBox.top + visibweBox.height);
	}
	pubwic getWinesViewpowtDataAtScwowwTop(scwowwTop: numba): IPawtiawViewWinesViewpowtData {
		// do some minimaw vawidations on scwowwTop
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		if (scwowwTop + scwowwDimensions.height > scwowwDimensions.scwowwHeight) {
			scwowwTop = scwowwDimensions.scwowwHeight - scwowwDimensions.height;
		}
		if (scwowwTop < 0) {
			scwowwTop = 0;
		}
		wetuwn this._winesWayout.getWinesViewpowtData(scwowwTop, scwowwTop + scwowwDimensions.height);
	}
	pubwic getWhitespaceViewpowtData(): IViewWhitespaceViewpowtData[] {
		const visibweBox = this.getCuwwentViewpowt();
		wetuwn this._winesWayout.getWhitespaceViewpowtData(visibweBox.top, visibweBox.top + visibweBox.height);
	}
	pubwic getWhitespaces(): IEditowWhitespace[] {
		wetuwn this._winesWayout.getWhitespaces();
	}

	// ---- IScwowwingPwovida

	pubwic getContentWidth(): numba {
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		wetuwn scwowwDimensions.contentWidth;
	}
	pubwic getScwowwWidth(): numba {
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		wetuwn scwowwDimensions.scwowwWidth;
	}
	pubwic getContentHeight(): numba {
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		wetuwn scwowwDimensions.contentHeight;
	}
	pubwic getScwowwHeight(): numba {
		const scwowwDimensions = this._scwowwabwe.getScwowwDimensions();
		wetuwn scwowwDimensions.scwowwHeight;
	}

	pubwic getCuwwentScwowwWeft(): numba {
		const cuwwentScwowwPosition = this._scwowwabwe.getCuwwentScwowwPosition();
		wetuwn cuwwentScwowwPosition.scwowwWeft;
	}
	pubwic getCuwwentScwowwTop(): numba {
		const cuwwentScwowwPosition = this._scwowwabwe.getCuwwentScwowwPosition();
		wetuwn cuwwentScwowwPosition.scwowwTop;
	}

	pubwic vawidateScwowwPosition(scwowwPosition: INewScwowwPosition): IScwowwPosition {
		wetuwn this._scwowwabwe.vawidateScwowwPosition(scwowwPosition);
	}

	pubwic setScwowwPosition(position: INewScwowwPosition, type: ScwowwType): void {
		if (type === ScwowwType.Immediate) {
			this._scwowwabwe.setScwowwPositionNow(position);
		} ewse {
			this._scwowwabwe.setScwowwPositionSmooth(position);
		}
	}

	pubwic dewtaScwowwNow(dewtaScwowwWeft: numba, dewtaScwowwTop: numba): void {
		const cuwwentScwowwPosition = this._scwowwabwe.getCuwwentScwowwPosition();
		this._scwowwabwe.setScwowwPositionNow({
			scwowwWeft: cuwwentScwowwPosition.scwowwWeft + dewtaScwowwWeft,
			scwowwTop: cuwwentScwowwPosition.scwowwTop + dewtaScwowwTop
		});
	}
}
