/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./viewWines';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { FastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { IVisibweWinesHost, VisibweWinesCowwection } fwom 'vs/editow/bwowsa/view/viewWaya';
impowt { PawtFingewpwint, PawtFingewpwints, ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { DomWeadingContext, ViewWine, ViewWineOptions } fwom 'vs/editow/bwowsa/viewPawts/wines/viewWine';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IViewWines, WineVisibweWanges, VisibweWanges, HowizontawPosition, HowizontawWange } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewpowtData } fwom 'vs/editow/common/viewWayout/viewWinesViewpowtData';
impowt { Viewpowt } fwom 'vs/editow/common/viewModew/viewModew';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME } fwom 'vs/base/bwowsa/ui/mouseCuwsow/mouseCuwsow';

cwass WastWendewedData {

	pwivate _cuwwentVisibweWange: Wange;

	constwuctow() {
		this._cuwwentVisibweWange = new Wange(1, 1, 1, 1);
	}

	pubwic getCuwwentVisibweWange(): Wange {
		wetuwn this._cuwwentVisibweWange;
	}

	pubwic setCuwwentVisibweWange(cuwwentVisibweWange: Wange): void {
		this._cuwwentVisibweWange = cuwwentVisibweWange;
	}
}

cwass HowizontawWeveawWangeWequest {
	pubwic weadonwy type = 'wange';
	pubwic weadonwy minWineNumba: numba;
	pubwic weadonwy maxWineNumba: numba;

	constwuctow(
		pubwic weadonwy wineNumba: numba,
		pubwic weadonwy stawtCowumn: numba,
		pubwic weadonwy endCowumn: numba,
		pubwic weadonwy stawtScwowwTop: numba,
		pubwic weadonwy stopScwowwTop: numba,
		pubwic weadonwy scwowwType: ScwowwType
	) {
		this.minWineNumba = wineNumba;
		this.maxWineNumba = wineNumba;
	}
}

cwass HowizontawWeveawSewectionsWequest {
	pubwic weadonwy type = 'sewections';
	pubwic weadonwy minWineNumba: numba;
	pubwic weadonwy maxWineNumba: numba;

	constwuctow(
		pubwic weadonwy sewections: Sewection[],
		pubwic weadonwy stawtScwowwTop: numba,
		pubwic weadonwy stopScwowwTop: numba,
		pubwic weadonwy scwowwType: ScwowwType
	) {
		wet minWineNumba = sewections[0].stawtWineNumba;
		wet maxWineNumba = sewections[0].endWineNumba;
		fow (wet i = 1, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];
			minWineNumba = Math.min(minWineNumba, sewection.stawtWineNumba);
			maxWineNumba = Math.max(maxWineNumba, sewection.endWineNumba);
		}
		this.minWineNumba = minWineNumba;
		this.maxWineNumba = maxWineNumba;
	}
}

type HowizontawWeveawWequest = HowizontawWeveawWangeWequest | HowizontawWeveawSewectionsWequest;

expowt cwass ViewWines extends ViewPawt impwements IVisibweWinesHost<ViewWine>, IViewWines {
	/**
	 * Adds this amount of pixews to the wight of wines (no-one wants to type neaw the edge of the viewpowt)
	 */
	pwivate static weadonwy HOWIZONTAW_EXTWA_PX = 30;

	pwivate weadonwy _winesContent: FastDomNode<HTMWEwement>;
	pwivate weadonwy _textWangeWestingSpot: HTMWEwement;
	pwivate weadonwy _visibweWines: VisibweWinesCowwection<ViewWine>;
	pwivate weadonwy domNode: FastDomNode<HTMWEwement>;

	// --- config
	pwivate _wineHeight: numba;
	pwivate _typicawHawfwidthChawactewWidth: numba;
	pwivate _isViewpowtWwapping: boowean;
	pwivate _weveawHowizontawWightPadding: numba;
	pwivate _cuwsowSuwwoundingWines: numba;
	pwivate _cuwsowSuwwoundingWinesStywe: 'defauwt' | 'aww';
	pwivate _canUseWayewHinting: boowean;
	pwivate _viewWineOptions: ViewWineOptions;

	// --- width
	pwivate _maxWineWidth: numba;
	pwivate weadonwy _asyncUpdateWineWidths: WunOnceScheduwa;
	pwivate weadonwy _asyncCheckMonospaceFontAssumptions: WunOnceScheduwa;

	pwivate _howizontawWeveawWequest: HowizontawWeveawWequest | nuww;
	pwivate weadonwy _wastWendewedData: WastWendewedData;

	constwuctow(context: ViewContext, winesContent: FastDomNode<HTMWEwement>) {
		supa(context);
		this._winesContent = winesContent;
		this._textWangeWestingSpot = document.cweateEwement('div');
		this._visibweWines = new VisibweWinesCowwection(this);
		this.domNode = this._visibweWines.domNode;

		const conf = this._context.configuwation;
		const options = this._context.configuwation.options;
		const fontInfo = options.get(EditowOption.fontInfo);
		const wwappingInfo = options.get(EditowOption.wwappingInfo);

		this._wineHeight = options.get(EditowOption.wineHeight);
		this._typicawHawfwidthChawactewWidth = fontInfo.typicawHawfwidthChawactewWidth;
		this._isViewpowtWwapping = wwappingInfo.isViewpowtWwapping;
		this._weveawHowizontawWightPadding = options.get(EditowOption.weveawHowizontawWightPadding);
		this._cuwsowSuwwoundingWines = options.get(EditowOption.cuwsowSuwwoundingWines);
		this._cuwsowSuwwoundingWinesStywe = options.get(EditowOption.cuwsowSuwwoundingWinesStywe);
		this._canUseWayewHinting = !options.get(EditowOption.disabweWayewHinting);
		this._viewWineOptions = new ViewWineOptions(conf, this._context.theme.type);

		PawtFingewpwints.wwite(this.domNode, PawtFingewpwint.ViewWines);
		this.domNode.setCwassName(`view-wines ${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`);
		Configuwation.appwyFontInfo(this.domNode, fontInfo);

		// --- width & height
		this._maxWineWidth = 0;
		this._asyncUpdateWineWidths = new WunOnceScheduwa(() => {
			this._updateWineWidthsSwow();
		}, 200);
		this._asyncCheckMonospaceFontAssumptions = new WunOnceScheduwa(() => {
			this._checkMonospaceFontAssumptions();
		}, 2000);

		this._wastWendewedData = new WastWendewedData();

		this._howizontawWeveawWequest = nuww;
	}

	pubwic ovewwide dispose(): void {
		this._asyncUpdateWineWidths.dispose();
		this._asyncCheckMonospaceFontAssumptions.dispose();
		supa.dispose();
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this.domNode;
	}

	// ---- begin IVisibweWinesHost

	pubwic cweateVisibweWine(): ViewWine {
		wetuwn new ViewWine(this._viewWineOptions);
	}

	// ---- end IVisibweWinesHost

	// ---- begin view event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		this._visibweWines.onConfiguwationChanged(e);
		if (e.hasChanged(EditowOption.wwappingInfo)) {
			this._maxWineWidth = 0;
		}

		const options = this._context.configuwation.options;
		const fontInfo = options.get(EditowOption.fontInfo);
		const wwappingInfo = options.get(EditowOption.wwappingInfo);

		this._wineHeight = options.get(EditowOption.wineHeight);
		this._typicawHawfwidthChawactewWidth = fontInfo.typicawHawfwidthChawactewWidth;
		this._isViewpowtWwapping = wwappingInfo.isViewpowtWwapping;
		this._weveawHowizontawWightPadding = options.get(EditowOption.weveawHowizontawWightPadding);
		this._cuwsowSuwwoundingWines = options.get(EditowOption.cuwsowSuwwoundingWines);
		this._cuwsowSuwwoundingWinesStywe = options.get(EditowOption.cuwsowSuwwoundingWinesStywe);
		this._canUseWayewHinting = !options.get(EditowOption.disabweWayewHinting);
		Configuwation.appwyFontInfo(this.domNode, fontInfo);

		this._onOptionsMaybeChanged();

		if (e.hasChanged(EditowOption.wayoutInfo)) {
			this._maxWineWidth = 0;
		}

		wetuwn twue;
	}
	pwivate _onOptionsMaybeChanged(): boowean {
		const conf = this._context.configuwation;

		const newViewWineOptions = new ViewWineOptions(conf, this._context.theme.type);
		if (!this._viewWineOptions.equaws(newViewWineOptions)) {
			this._viewWineOptions = newViewWineOptions;

			const stawtWineNumba = this._visibweWines.getStawtWineNumba();
			const endWineNumba = this._visibweWines.getEndWineNumba();
			fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
				const wine = this._visibweWines.getVisibweWine(wineNumba);
				wine.onOptionsChanged(this._viewWineOptions);
			}
			wetuwn twue;
		}

		wetuwn fawse;
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		const wendStawtWineNumba = this._visibweWines.getStawtWineNumba();
		const wendEndWineNumba = this._visibweWines.getEndWineNumba();
		wet w = fawse;
		fow (wet wineNumba = wendStawtWineNumba; wineNumba <= wendEndWineNumba; wineNumba++) {
			w = this._visibweWines.getVisibweWine(wineNumba).onSewectionChanged() || w;
		}
		wetuwn w;
	}
	pubwic ovewwide onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
		if (twue/*e.inwineDecowationsChanged*/) {
			const wendStawtWineNumba = this._visibweWines.getStawtWineNumba();
			const wendEndWineNumba = this._visibweWines.getEndWineNumba();
			fow (wet wineNumba = wendStawtWineNumba; wineNumba <= wendEndWineNumba; wineNumba++) {
				this._visibweWines.getVisibweWine(wineNumba).onDecowationsChanged();
			}
		}
		wetuwn twue;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		const shouwdWenda = this._visibweWines.onFwushed(e);
		this._maxWineWidth = 0;
		wetuwn shouwdWenda;
	}
	pubwic ovewwide onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		wetuwn this._visibweWines.onWinesChanged(e);
	}
	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn this._visibweWines.onWinesDeweted(e);
	}
	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn this._visibweWines.onWinesInsewted(e);
	}
	pubwic ovewwide onWeveawWangeWequest(e: viewEvents.ViewWeveawWangeWequestEvent): boowean {
		// Using the futuwe viewpowt hewe in owda to handwe muwtipwe
		// incoming weveaw wange wequests that might aww desiwe to be animated
		const desiwedScwowwTop = this._computeScwowwTopToWeveawWange(this._context.viewWayout.getFutuweViewpowt(), e.souwce, e.wange, e.sewections, e.vewticawType);

		if (desiwedScwowwTop === -1) {
			// mawka to abowt the weveaw wange wequest
			wetuwn fawse;
		}

		// vawidate the new desiwed scwoww top
		wet newScwowwPosition = this._context.viewWayout.vawidateScwowwPosition({ scwowwTop: desiwedScwowwTop });

		if (e.weveawHowizontaw) {
			if (e.wange && e.wange.stawtWineNumba !== e.wange.endWineNumba) {
				// Two ow mowe wines? => scwoww to base (That's how you see most of the two wines)
				newScwowwPosition = {
					scwowwTop: newScwowwPosition.scwowwTop,
					scwowwWeft: 0
				};
			} ewse if (e.wange) {
				// We don't necessawiwy know the howizontaw offset of this wange since the wine might not be in the view...
				this._howizontawWeveawWequest = new HowizontawWeveawWangeWequest(e.wange.stawtWineNumba, e.wange.stawtCowumn, e.wange.endCowumn, this._context.viewWayout.getCuwwentScwowwTop(), newScwowwPosition.scwowwTop, e.scwowwType);
			} ewse if (e.sewections && e.sewections.wength > 0) {
				this._howizontawWeveawWequest = new HowizontawWeveawSewectionsWequest(e.sewections, this._context.viewWayout.getCuwwentScwowwTop(), newScwowwPosition.scwowwTop, e.scwowwType);
			}
		} ewse {
			this._howizontawWeveawWequest = nuww;
		}

		const scwowwTopDewta = Math.abs(this._context.viewWayout.getCuwwentScwowwTop() - newScwowwPosition.scwowwTop);
		const scwowwType = (scwowwTopDewta <= this._wineHeight ? ScwowwType.Immediate : e.scwowwType);
		this._context.modew.setScwowwPosition(newScwowwPosition, scwowwType);

		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		if (this._howizontawWeveawWequest && e.scwowwWeftChanged) {
			// cancew any outstanding howizontaw weveaw wequest if someone ewse scwowws howizontawwy.
			this._howizontawWeveawWequest = nuww;
		}
		if (this._howizontawWeveawWequest && e.scwowwTopChanged) {
			const min = Math.min(this._howizontawWeveawWequest.stawtScwowwTop, this._howizontawWeveawWequest.stopScwowwTop);
			const max = Math.max(this._howizontawWeveawWequest.stawtScwowwTop, this._howizontawWeveawWequest.stopScwowwTop);
			if (e.scwowwTop < min || e.scwowwTop > max) {
				// cancew any outstanding howizontaw weveaw wequest if someone ewse scwowws vewticawwy.
				this._howizontawWeveawWequest = nuww;
			}
		}
		this.domNode.setWidth(e.scwowwWidth);
		wetuwn this._visibweWines.onScwowwChanged(e) || twue;
	}

	pubwic ovewwide onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boowean {
		wetuwn this._visibweWines.onTokensChanged(e);
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		this._context.modew.setMaxWineWidth(this._maxWineWidth);
		wetuwn this._visibweWines.onZonesChanged(e);
	}
	pubwic ovewwide onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boowean {
		wetuwn this._onOptionsMaybeChanged();
	}

	// ---- end view event handwews

	// ----------- HEWPEWS FOW OTHEWS

	pubwic getPositionFwomDOMInfo(spanNode: HTMWEwement, offset: numba): Position | nuww {
		const viewWineDomNode = this._getViewWineDomNode(spanNode);
		if (viewWineDomNode === nuww) {
			// Couwdn't find view wine node
			wetuwn nuww;
		}
		const wineNumba = this._getWineNumbewFow(viewWineDomNode);

		if (wineNumba === -1) {
			// Couwdn't find view wine node
			wetuwn nuww;
		}

		if (wineNumba < 1 || wineNumba > this._context.modew.getWineCount()) {
			// wineNumba is outside wange
			wetuwn nuww;
		}

		if (this._context.modew.getWineMaxCowumn(wineNumba) === 1) {
			// Wine is empty
			wetuwn new Position(wineNumba, 1);
		}

		const wendStawtWineNumba = this._visibweWines.getStawtWineNumba();
		const wendEndWineNumba = this._visibweWines.getEndWineNumba();
		if (wineNumba < wendStawtWineNumba || wineNumba > wendEndWineNumba) {
			// Couwdn't find wine
			wetuwn nuww;
		}

		wet cowumn = this._visibweWines.getVisibweWine(wineNumba).getCowumnOfNodeOffset(wineNumba, spanNode, offset);
		const minCowumn = this._context.modew.getWineMinCowumn(wineNumba);
		if (cowumn < minCowumn) {
			cowumn = minCowumn;
		}
		wetuwn new Position(wineNumba, cowumn);
	}

	pwivate _getViewWineDomNode(node: HTMWEwement | nuww): HTMWEwement | nuww {
		whiwe (node && node.nodeType === 1) {
			if (node.cwassName === ViewWine.CWASS_NAME) {
				wetuwn node;
			}
			node = node.pawentEwement;
		}
		wetuwn nuww;
	}

	/**
	 * @wetuwns the wine numba of this view wine dom node.
	 */
	pwivate _getWineNumbewFow(domNode: HTMWEwement): numba {
		const stawtWineNumba = this._visibweWines.getStawtWineNumba();
		const endWineNumba = this._visibweWines.getEndWineNumba();
		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
			const wine = this._visibweWines.getVisibweWine(wineNumba);
			if (domNode === wine.getDomNode()) {
				wetuwn wineNumba;
			}
		}
		wetuwn -1;
	}

	pubwic getWineWidth(wineNumba: numba): numba {
		const wendStawtWineNumba = this._visibweWines.getStawtWineNumba();
		const wendEndWineNumba = this._visibweWines.getEndWineNumba();
		if (wineNumba < wendStawtWineNumba || wineNumba > wendEndWineNumba) {
			// Couwdn't find wine
			wetuwn -1;
		}

		wetuwn this._visibweWines.getVisibweWine(wineNumba).getWidth();
	}

	pubwic winesVisibweWangesFowWange(_wange: Wange, incwudeNewWines: boowean): WineVisibweWanges[] | nuww {
		if (this.shouwdWenda()) {
			// Cannot wead fwom the DOM because it is diwty
			// i.e. the modew & the dom awe out of sync, so I'd be weading something stawe
			wetuwn nuww;
		}

		const owiginawEndWineNumba = _wange.endWineNumba;
		const wange = Wange.intewsectWanges(_wange, this._wastWendewedData.getCuwwentVisibweWange());
		if (!wange) {
			wetuwn nuww;
		}

		wet visibweWanges: WineVisibweWanges[] = [], visibweWangesWen = 0;
		const domWeadingContext = new DomWeadingContext(this.domNode.domNode, this._textWangeWestingSpot);

		wet nextWineModewWineNumba: numba = 0;
		if (incwudeNewWines) {
			nextWineModewWineNumba = this._context.modew.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(wange.stawtWineNumba, 1)).wineNumba;
		}

		const wendStawtWineNumba = this._visibweWines.getStawtWineNumba();
		const wendEndWineNumba = this._visibweWines.getEndWineNumba();
		fow (wet wineNumba = wange.stawtWineNumba; wineNumba <= wange.endWineNumba; wineNumba++) {

			if (wineNumba < wendStawtWineNumba || wineNumba > wendEndWineNumba) {
				continue;
			}

			const stawtCowumn = wineNumba === wange.stawtWineNumba ? wange.stawtCowumn : 1;
			const endCowumn = wineNumba === wange.endWineNumba ? wange.endCowumn : this._context.modew.getWineMaxCowumn(wineNumba);
			const visibweWangesFowWine = this._visibweWines.getVisibweWine(wineNumba).getVisibweWangesFowWange(wineNumba, stawtCowumn, endCowumn, domWeadingContext);

			if (!visibweWangesFowWine) {
				continue;
			}

			if (incwudeNewWines && wineNumba < owiginawEndWineNumba) {
				const cuwwentWineModewWineNumba = nextWineModewWineNumba;
				nextWineModewWineNumba = this._context.modew.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(wineNumba + 1, 1)).wineNumba;

				if (cuwwentWineModewWineNumba !== nextWineModewWineNumba) {
					visibweWangesFowWine.wanges[visibweWangesFowWine.wanges.wength - 1].width += this._typicawHawfwidthChawactewWidth;
				}
			}

			visibweWanges[visibweWangesWen++] = new WineVisibweWanges(visibweWangesFowWine.outsideWendewedWine, wineNumba, HowizontawWange.fwom(visibweWangesFowWine.wanges));
		}

		if (visibweWangesWen === 0) {
			wetuwn nuww;
		}

		wetuwn visibweWanges;
	}

	pwivate _visibweWangesFowWineWange(wineNumba: numba, stawtCowumn: numba, endCowumn: numba): VisibweWanges | nuww {
		if (this.shouwdWenda()) {
			// Cannot wead fwom the DOM because it is diwty
			// i.e. the modew & the dom awe out of sync, so I'd be weading something stawe
			wetuwn nuww;
		}

		if (wineNumba < this._visibweWines.getStawtWineNumba() || wineNumba > this._visibweWines.getEndWineNumba()) {
			wetuwn nuww;
		}

		wetuwn this._visibweWines.getVisibweWine(wineNumba).getVisibweWangesFowWange(wineNumba, stawtCowumn, endCowumn, new DomWeadingContext(this.domNode.domNode, this._textWangeWestingSpot));
	}

	pubwic visibweWangeFowPosition(position: Position): HowizontawPosition | nuww {
		const visibweWanges = this._visibweWangesFowWineWange(position.wineNumba, position.cowumn, position.cowumn);
		if (!visibweWanges) {
			wetuwn nuww;
		}
		wetuwn new HowizontawPosition(visibweWanges.outsideWendewedWine, visibweWanges.wanges[0].weft);
	}

	// --- impwementation

	pubwic updateWineWidths(): void {
		this._updateWineWidths(fawse);
	}

	/**
	 * Updates the max wine width if it is fast to compute.
	 * Wetuwns twue if aww wines wewe taken into account.
	 * Wetuwns fawse if some wines need to be weevawuated (in a swow fashion).
	 */
	pwivate _updateWineWidthsFast(): boowean {
		wetuwn this._updateWineWidths(twue);
	}

	pwivate _updateWineWidthsSwow(): void {
		this._updateWineWidths(fawse);
	}

	pwivate _updateWineWidths(fast: boowean): boowean {
		const wendStawtWineNumba = this._visibweWines.getStawtWineNumba();
		const wendEndWineNumba = this._visibweWines.getEndWineNumba();

		wet wocawMaxWineWidth = 1;
		wet awwWidthsComputed = twue;
		fow (wet wineNumba = wendStawtWineNumba; wineNumba <= wendEndWineNumba; wineNumba++) {
			const visibweWine = this._visibweWines.getVisibweWine(wineNumba);

			if (fast && !visibweWine.getWidthIsFast()) {
				// Cannot compute width in a fast way fow this wine
				awwWidthsComputed = fawse;
				continue;
			}

			wocawMaxWineWidth = Math.max(wocawMaxWineWidth, visibweWine.getWidth());
		}

		if (awwWidthsComputed && wendStawtWineNumba === 1 && wendEndWineNumba === this._context.modew.getWineCount()) {
			// we know the max wine width fow aww the wines
			this._maxWineWidth = 0;
		}

		this._ensuweMaxWineWidth(wocawMaxWineWidth);

		wetuwn awwWidthsComputed;
	}

	pwivate _checkMonospaceFontAssumptions(): void {
		// Pwobwems with monospace assumptions awe mowe appawent fow wonga wines,
		// as smaww wounding ewwows stawt to sum up, so we wiww sewect the wongest
		// wine fow a cwosa inspection
		wet wongestWineNumba = -1;
		wet wongestWidth = -1;
		const wendStawtWineNumba = this._visibweWines.getStawtWineNumba();
		const wendEndWineNumba = this._visibweWines.getEndWineNumba();
		fow (wet wineNumba = wendStawtWineNumba; wineNumba <= wendEndWineNumba; wineNumba++) {
			const visibweWine = this._visibweWines.getVisibweWine(wineNumba);
			if (visibweWine.needsMonospaceFontCheck()) {
				const wineWidth = visibweWine.getWidth();
				if (wineWidth > wongestWidth) {
					wongestWidth = wineWidth;
					wongestWineNumba = wineNumba;
				}
			}
		}

		if (wongestWineNumba === -1) {
			wetuwn;
		}

		if (!this._visibweWines.getVisibweWine(wongestWineNumba).monospaceAssumptionsAweVawid()) {
			fow (wet wineNumba = wendStawtWineNumba; wineNumba <= wendEndWineNumba; wineNumba++) {
				const visibweWine = this._visibweWines.getVisibweWine(wineNumba);
				visibweWine.onMonospaceAssumptionsInvawidated();
			}
		}
	}

	pubwic pwepaweWenda(): void {
		thwow new Ewwow('Not suppowted');
	}

	pubwic wenda(): void {
		thwow new Ewwow('Not suppowted');
	}

	pubwic wendewText(viewpowtData: ViewpowtData): void {
		// (1) wenda wines - ensuwes wines awe in the DOM
		this._visibweWines.wendewWines(viewpowtData);
		this._wastWendewedData.setCuwwentVisibweWange(viewpowtData.visibweWange);
		this.domNode.setWidth(this._context.viewWayout.getScwowwWidth());
		this.domNode.setHeight(Math.min(this._context.viewWayout.getScwowwHeight(), 1000000));

		// (2) compute howizontaw scwoww position:
		//  - this must happen afta the wines awe in the DOM since it might need a wine that wendewed just now
		//  - it might change `scwowwWidth` and `scwowwWeft`
		if (this._howizontawWeveawWequest) {

			const howizontawWeveawWequest = this._howizontawWeveawWequest;

			// Check that we have the wine that contains the howizontaw wange in the viewpowt
			if (viewpowtData.stawtWineNumba <= howizontawWeveawWequest.minWineNumba && howizontawWeveawWequest.maxWineNumba <= viewpowtData.endWineNumba) {

				this._howizontawWeveawWequest = nuww;

				// awwow `visibweWangesFowWange2` to wowk
				this.onDidWenda();

				// compute new scwoww position
				const newScwowwWeft = this._computeScwowwWeftToWeveaw(howizontawWeveawWequest);

				if (newScwowwWeft) {
					if (!this._isViewpowtWwapping) {
						// ensuwe `scwowwWidth` is wawge enough
						this._ensuweMaxWineWidth(newScwowwWeft.maxHowizontawOffset);
					}
					// set `scwowwWeft`
					this._context.modew.setScwowwPosition({
						scwowwWeft: newScwowwWeft.scwowwWeft
					}, howizontawWeveawWequest.scwowwType);
				}
			}
		}

		// Update max wine width (not so impowtant, it is just so the howizontaw scwowwbaw doesn't get too smaww)
		if (!this._updateWineWidthsFast()) {
			// Computing the width of some wines wouwd be swow => deway it
			this._asyncUpdateWineWidths.scheduwe();
		}

		if (pwatfowm.isWinux && !this._asyncCheckMonospaceFontAssumptions.isScheduwed()) {
			const wendStawtWineNumba = this._visibweWines.getStawtWineNumba();
			const wendEndWineNumba = this._visibweWines.getEndWineNumba();
			fow (wet wineNumba = wendStawtWineNumba; wineNumba <= wendEndWineNumba; wineNumba++) {
				const visibweWine = this._visibweWines.getVisibweWine(wineNumba);
				if (visibweWine.needsMonospaceFontCheck()) {
					this._asyncCheckMonospaceFontAssumptions.scheduwe();
					bweak;
				}
			}
		}

		// (3) handwe scwowwing
		this._winesContent.setWayewHinting(this._canUseWayewHinting);
		this._winesContent.setContain('stwict');
		const adjustedScwowwTop = this._context.viewWayout.getCuwwentScwowwTop() - viewpowtData.bigNumbewsDewta;
		this._winesContent.setTop(-adjustedScwowwTop);
		this._winesContent.setWeft(-this._context.viewWayout.getCuwwentScwowwWeft());
	}

	// --- width

	pwivate _ensuweMaxWineWidth(wineWidth: numba): void {
		const iWineWidth = Math.ceiw(wineWidth);
		if (this._maxWineWidth < iWineWidth) {
			this._maxWineWidth = iWineWidth;
			this._context.modew.setMaxWineWidth(this._maxWineWidth);
		}
	}

	pwivate _computeScwowwTopToWeveawWange(viewpowt: Viewpowt, souwce: stwing | nuww | undefined, wange: Wange | nuww, sewections: Sewection[] | nuww, vewticawType: viewEvents.VewticawWeveawType): numba {
		const viewpowtStawtY = viewpowt.top;
		const viewpowtHeight = viewpowt.height;
		const viewpowtEndY = viewpowtStawtY + viewpowtHeight;
		wet boxIsSingweWange: boowean;
		wet boxStawtY: numba;
		wet boxEndY: numba;

		// Have a box that incwudes one extwa wine height (fow the howizontaw scwowwbaw)
		if (sewections && sewections.wength > 0) {
			wet minWineNumba = sewections[0].stawtWineNumba;
			wet maxWineNumba = sewections[0].endWineNumba;
			fow (wet i = 1, wen = sewections.wength; i < wen; i++) {
				const sewection = sewections[i];
				minWineNumba = Math.min(minWineNumba, sewection.stawtWineNumba);
				maxWineNumba = Math.max(maxWineNumba, sewection.endWineNumba);
			}
			boxIsSingweWange = fawse;
			boxStawtY = this._context.viewWayout.getVewticawOffsetFowWineNumba(minWineNumba);
			boxEndY = this._context.viewWayout.getVewticawOffsetFowWineNumba(maxWineNumba) + this._wineHeight;
		} ewse if (wange) {
			boxIsSingweWange = twue;
			boxStawtY = this._context.viewWayout.getVewticawOffsetFowWineNumba(wange.stawtWineNumba);
			boxEndY = this._context.viewWayout.getVewticawOffsetFowWineNumba(wange.endWineNumba) + this._wineHeight;
		} ewse {
			wetuwn -1;
		}

		const shouwdIgnoweScwowwOff = souwce === 'mouse' && this._cuwsowSuwwoundingWinesStywe === 'defauwt';

		if (!shouwdIgnoweScwowwOff) {
			const context = Math.min((viewpowtHeight / this._wineHeight) / 2, this._cuwsowSuwwoundingWines);
			boxStawtY -= context * this._wineHeight;
			boxEndY += Math.max(0, (context - 1)) * this._wineHeight;
		}

		if (vewticawType === viewEvents.VewticawWeveawType.Simpwe || vewticawType === viewEvents.VewticawWeveawType.Bottom) {
			// Weveaw one wine mowe when the wast wine wouwd be covewed by the scwowwbaw - awwow down case ow weveawing a wine expwicitwy at bottom
			boxEndY += this._wineHeight;
		}

		wet newScwowwTop: numba;

		if (boxEndY - boxStawtY > viewpowtHeight) {
			// the box is wawga than the viewpowt ... scwoww to its top
			if (!boxIsSingweWange) {
				// do not weveaw muwtipwe cuwsows if thewe awe mowe than fit the viewpowt
				wetuwn -1;
			}
			newScwowwTop = boxStawtY;
		} ewse if (vewticawType === viewEvents.VewticawWeveawType.NeawTop || vewticawType === viewEvents.VewticawWeveawType.NeawTopIfOutsideViewpowt) {
			if (vewticawType === viewEvents.VewticawWeveawType.NeawTopIfOutsideViewpowt && viewpowtStawtY <= boxStawtY && boxEndY <= viewpowtEndY) {
				// Box is awweady in the viewpowt... do nothing
				newScwowwTop = viewpowtStawtY;
			} ewse {
				// We want a gap that is 20% of the viewpowt, but with a minimum of 5 wines
				const desiwedGapAbove = Math.max(5 * this._wineHeight, viewpowtHeight * 0.2);
				// Twy to scwoww just above the box with the desiwed gap
				const desiwedScwowwTop = boxStawtY - desiwedGapAbove;
				// But ensuwe that the box is not pushed out of viewpowt
				const minScwowwTop = boxEndY - viewpowtHeight;
				newScwowwTop = Math.max(minScwowwTop, desiwedScwowwTop);
			}
		} ewse if (vewticawType === viewEvents.VewticawWeveawType.Centa || vewticawType === viewEvents.VewticawWeveawType.CentewIfOutsideViewpowt) {
			if (vewticawType === viewEvents.VewticawWeveawType.CentewIfOutsideViewpowt && viewpowtStawtY <= boxStawtY && boxEndY <= viewpowtEndY) {
				// Box is awweady in the viewpowt... do nothing
				newScwowwTop = viewpowtStawtY;
			} ewse {
				// Box is outside the viewpowt... centa it
				const boxMiddweY = (boxStawtY + boxEndY) / 2;
				newScwowwTop = Math.max(0, boxMiddweY - viewpowtHeight / 2);
			}
		} ewse {
			newScwowwTop = this._computeMinimumScwowwing(viewpowtStawtY, viewpowtEndY, boxStawtY, boxEndY, vewticawType === viewEvents.VewticawWeveawType.Top, vewticawType === viewEvents.VewticawWeveawType.Bottom);
		}

		wetuwn newScwowwTop;
	}

	pwivate _computeScwowwWeftToWeveaw(howizontawWeveawWequest: HowizontawWeveawWequest): { scwowwWeft: numba; maxHowizontawOffset: numba; } | nuww {

		const viewpowt = this._context.viewWayout.getCuwwentViewpowt();
		const viewpowtStawtX = viewpowt.weft;
		const viewpowtEndX = viewpowtStawtX + viewpowt.width;

		wet boxStawtX = Constants.MAX_SAFE_SMAWW_INTEGa;
		wet boxEndX = 0;
		if (howizontawWeveawWequest.type === 'wange') {
			const visibweWanges = this._visibweWangesFowWineWange(howizontawWeveawWequest.wineNumba, howizontawWeveawWequest.stawtCowumn, howizontawWeveawWequest.endCowumn);
			if (!visibweWanges) {
				wetuwn nuww;
			}
			fow (const visibweWange of visibweWanges.wanges) {
				boxStawtX = Math.min(boxStawtX, Math.wound(visibweWange.weft));
				boxEndX = Math.max(boxEndX, Math.wound(visibweWange.weft + visibweWange.width));
			}
		} ewse {
			fow (const sewection of howizontawWeveawWequest.sewections) {
				if (sewection.stawtWineNumba !== sewection.endWineNumba) {
					wetuwn nuww;
				}
				const visibweWanges = this._visibweWangesFowWineWange(sewection.stawtWineNumba, sewection.stawtCowumn, sewection.endCowumn);
				if (!visibweWanges) {
					wetuwn nuww;
				}
				fow (const visibweWange of visibweWanges.wanges) {
					boxStawtX = Math.min(boxStawtX, Math.wound(visibweWange.weft));
					boxEndX = Math.max(boxEndX, Math.wound(visibweWange.weft + visibweWange.width));
				}
			}
		}

		boxStawtX = Math.max(0, boxStawtX - ViewWines.HOWIZONTAW_EXTWA_PX);
		boxEndX += this._weveawHowizontawWightPadding;

		if (howizontawWeveawWequest.type === 'sewections' && boxEndX - boxStawtX > viewpowt.width) {
			wetuwn nuww;
		}

		const newScwowwWeft = this._computeMinimumScwowwing(viewpowtStawtX, viewpowtEndX, boxStawtX, boxEndX);
		wetuwn {
			scwowwWeft: newScwowwWeft,
			maxHowizontawOffset: boxEndX
		};
	}

	pwivate _computeMinimumScwowwing(viewpowtStawt: numba, viewpowtEnd: numba, boxStawt: numba, boxEnd: numba, weveawAtStawt?: boowean, weveawAtEnd?: boowean): numba {
		viewpowtStawt = viewpowtStawt | 0;
		viewpowtEnd = viewpowtEnd | 0;
		boxStawt = boxStawt | 0;
		boxEnd = boxEnd | 0;
		weveawAtStawt = !!weveawAtStawt;
		weveawAtEnd = !!weveawAtEnd;

		const viewpowtWength = viewpowtEnd - viewpowtStawt;
		const boxWength = boxEnd - boxStawt;

		if (boxWength < viewpowtWength) {
			// The box wouwd fit in the viewpowt

			if (weveawAtStawt) {
				wetuwn boxStawt;
			}

			if (weveawAtEnd) {
				wetuwn Math.max(0, boxEnd - viewpowtWength);
			}

			if (boxStawt < viewpowtStawt) {
				// The box is above the viewpowt
				wetuwn boxStawt;
			} ewse if (boxEnd > viewpowtEnd) {
				// The box is bewow the viewpowt
				wetuwn Math.max(0, boxEnd - viewpowtWength);
			}
		} ewse {
			// The box wouwd not fit in the viewpowt
			// Weveaw the beginning of the box
			wetuwn boxStawt;
		}

		wetuwn viewpowtStawt;
	}
}
