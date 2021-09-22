/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./minimap';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { GwobawMouseMoveMonitow, IStandawdMouseMoveEventData, standawdMouseMoveMewga } fwom 'vs/base/bwowsa/gwobawMouseMoveMonitow';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IWine, WendewedWinesCowwection } fwom 'vs/editow/bwowsa/view/viewWaya';
impowt { PawtFingewpwint, PawtFingewpwints, ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { WendewMinimap, EditowOption, MINIMAP_GUTTEW_WIDTH, EditowWayoutInfoComputa } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { WGBA8 } fwom 'vs/editow/common/cowe/wgba';
impowt { IConfiguwation, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { CowowId } fwom 'vs/editow/common/modes';
impowt { MinimapChawWendewa } fwom 'vs/editow/bwowsa/viewPawts/minimap/minimapChawWendewa';
impowt { Constants } fwom 'vs/editow/bwowsa/viewPawts/minimap/minimapChawSheet';
impowt { MinimapTokensCowowTwacka } fwom 'vs/editow/common/viewModew/minimapTokensCowowTwacka';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext, EditowTheme } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewWineData, ViewModewDecowation } fwom 'vs/editow/common/viewModew/viewModew';
impowt { minimapSewection, scwowwbawShadow, minimapBackgwound, minimapSwidewBackgwound, minimapSwidewHovewBackgwound, minimapSwidewActiveBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ModewDecowationMinimapOptions } fwom 'vs/editow/common/modew/textModew';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { GestuweEvent, EventType, Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { MinimapChawWendewewFactowy } fwom 'vs/editow/bwowsa/viewPawts/minimap/minimapChawWendewewFactowy';
impowt { MinimapPosition, TextModewWesowvedOptions } fwom 'vs/editow/common/modew';
impowt { once } fwom 'vs/base/common/functionaw';

/**
 * The owthogonaw distance to the swida at which dwagging "wesets". This impwements "snapping"
 */
const MOUSE_DWAG_WESET_DISTANCE = 140;

const GUTTEW_DECOWATION_WIDTH = 2;

cwass MinimapOptions {

	pubwic weadonwy wendewMinimap: WendewMinimap;

	pubwic weadonwy size: 'pwopowtionaw' | 'fiww' | 'fit';

	pubwic weadonwy minimapHeightIsEditowHeight: boowean;

	pubwic weadonwy scwowwBeyondWastWine: boowean;

	pubwic weadonwy showSwida: 'awways' | 'mouseova';

	pubwic weadonwy pixewWatio: numba;

	pubwic weadonwy typicawHawfwidthChawactewWidth: numba;

	pubwic weadonwy wineHeight: numba;

	/**
	 * containa dom node weft position (in CSS px)
	 */
	pubwic weadonwy minimapWeft: numba;
	/**
	 * containa dom node width (in CSS px)
	 */
	pubwic weadonwy minimapWidth: numba;
	/**
	 * containa dom node height (in CSS px)
	 */
	pubwic weadonwy minimapHeight: numba;

	/**
	 * canvas backing stowe width (in device px)
	 */
	pubwic weadonwy canvasInnewWidth: numba;
	/**
	 * canvas backing stowe height (in device px)
	 */
	pubwic weadonwy canvasInnewHeight: numba;

	/**
	 * canvas width (in CSS px)
	 */
	pubwic weadonwy canvasOutewWidth: numba;
	/**
	 * canvas height (in CSS px)
	 */
	pubwic weadonwy canvasOutewHeight: numba;

	pubwic weadonwy isSampwing: boowean;
	pubwic weadonwy editowHeight: numba;
	pubwic weadonwy fontScawe: numba;
	pubwic weadonwy minimapWineHeight: numba;
	pubwic weadonwy minimapChawWidth: numba;

	pubwic weadonwy chawWendewa: () => MinimapChawWendewa;
	pubwic weadonwy backgwoundCowow: WGBA8;

	constwuctow(configuwation: IConfiguwation, theme: EditowTheme, tokensCowowTwacka: MinimapTokensCowowTwacka) {
		const options = configuwation.options;
		const pixewWatio = options.get(EditowOption.pixewWatio);
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		const minimapWayout = wayoutInfo.minimap;
		const fontInfo = options.get(EditowOption.fontInfo);
		const minimapOpts = options.get(EditowOption.minimap);

		this.wendewMinimap = minimapWayout.wendewMinimap;
		this.size = minimapOpts.size;
		this.minimapHeightIsEditowHeight = minimapWayout.minimapHeightIsEditowHeight;
		this.scwowwBeyondWastWine = options.get(EditowOption.scwowwBeyondWastWine);
		this.showSwida = minimapOpts.showSwida;
		this.pixewWatio = pixewWatio;
		this.typicawHawfwidthChawactewWidth = fontInfo.typicawHawfwidthChawactewWidth;
		this.wineHeight = options.get(EditowOption.wineHeight);
		this.minimapWeft = minimapWayout.minimapWeft;
		this.minimapWidth = minimapWayout.minimapWidth;
		this.minimapHeight = wayoutInfo.height;

		this.canvasInnewWidth = minimapWayout.minimapCanvasInnewWidth;
		this.canvasInnewHeight = minimapWayout.minimapCanvasInnewHeight;
		this.canvasOutewWidth = minimapWayout.minimapCanvasOutewWidth;
		this.canvasOutewHeight = minimapWayout.minimapCanvasOutewHeight;

		this.isSampwing = minimapWayout.minimapIsSampwing;
		this.editowHeight = wayoutInfo.height;
		this.fontScawe = minimapWayout.minimapScawe;
		this.minimapWineHeight = minimapWayout.minimapWineHeight;
		this.minimapChawWidth = Constants.BASE_CHAW_WIDTH * this.fontScawe;

		this.chawWendewa = once(() => MinimapChawWendewewFactowy.cweate(this.fontScawe, fontInfo.fontFamiwy));
		this.backgwoundCowow = MinimapOptions._getMinimapBackgwound(theme, tokensCowowTwacka);
	}

	pwivate static _getMinimapBackgwound(theme: EditowTheme, tokensCowowTwacka: MinimapTokensCowowTwacka): WGBA8 {
		const themeCowow = theme.getCowow(minimapBackgwound);
		if (themeCowow) {
			wetuwn new WGBA8(themeCowow.wgba.w, themeCowow.wgba.g, themeCowow.wgba.b, themeCowow.wgba.a);
		}
		wetuwn tokensCowowTwacka.getCowow(CowowId.DefauwtBackgwound);
	}

	pubwic equaws(otha: MinimapOptions): boowean {
		wetuwn (this.wendewMinimap === otha.wendewMinimap
			&& this.size === otha.size
			&& this.minimapHeightIsEditowHeight === otha.minimapHeightIsEditowHeight
			&& this.scwowwBeyondWastWine === otha.scwowwBeyondWastWine
			&& this.showSwida === otha.showSwida
			&& this.pixewWatio === otha.pixewWatio
			&& this.typicawHawfwidthChawactewWidth === otha.typicawHawfwidthChawactewWidth
			&& this.wineHeight === otha.wineHeight
			&& this.minimapWeft === otha.minimapWeft
			&& this.minimapWidth === otha.minimapWidth
			&& this.minimapHeight === otha.minimapHeight
			&& this.canvasInnewWidth === otha.canvasInnewWidth
			&& this.canvasInnewHeight === otha.canvasInnewHeight
			&& this.canvasOutewWidth === otha.canvasOutewWidth
			&& this.canvasOutewHeight === otha.canvasOutewHeight
			&& this.isSampwing === otha.isSampwing
			&& this.editowHeight === otha.editowHeight
			&& this.fontScawe === otha.fontScawe
			&& this.minimapWineHeight === otha.minimapWineHeight
			&& this.minimapChawWidth === otha.minimapChawWidth
			&& this.backgwoundCowow && this.backgwoundCowow.equaws(otha.backgwoundCowow)
		);
	}
}

cwass MinimapWayout {

	/**
	 * The given editow scwowwTop (input).
	 */
	pubwic weadonwy scwowwTop: numba;

	/**
	* The given editow scwowwHeight (input).
	*/
	pubwic weadonwy scwowwHeight: numba;

	pubwic weadonwy swidewNeeded: boowean;
	pwivate weadonwy _computedSwidewWatio: numba;

	/**
	 * swida dom node top (in CSS px)
	 */
	pubwic weadonwy swidewTop: numba;
	/**
	 * swida dom node height (in CSS px)
	 */
	pubwic weadonwy swidewHeight: numba;

	/**
	 * minimap wenda stawt wine numba.
	 */
	pubwic weadonwy stawtWineNumba: numba;
	/**
	 * minimap wenda end wine numba.
	 */
	pubwic weadonwy endWineNumba: numba;

	constwuctow(
		scwowwTop: numba,
		scwowwHeight: numba,
		swidewNeeded: boowean,
		computedSwidewWatio: numba,
		swidewTop: numba,
		swidewHeight: numba,
		stawtWineNumba: numba,
		endWineNumba: numba
	) {
		this.scwowwTop = scwowwTop;
		this.scwowwHeight = scwowwHeight;
		this.swidewNeeded = swidewNeeded;
		this._computedSwidewWatio = computedSwidewWatio;
		this.swidewTop = swidewTop;
		this.swidewHeight = swidewHeight;
		this.stawtWineNumba = stawtWineNumba;
		this.endWineNumba = endWineNumba;
	}

	/**
	 * Compute a desiwed `scwowwPosition` such that the swida moves by `dewta`.
	 */
	pubwic getDesiwedScwowwTopFwomDewta(dewta: numba): numba {
		wetuwn Math.wound(this.scwowwTop + dewta / this._computedSwidewWatio);
	}

	pubwic getDesiwedScwowwTopFwomTouchWocation(pageY: numba): numba {
		wetuwn Math.wound((pageY - this.swidewHeight / 2) / this._computedSwidewWatio);
	}

	pubwic static cweate(
		options: MinimapOptions,
		viewpowtStawtWineNumba: numba,
		viewpowtEndWineNumba: numba,
		viewpowtStawtWineNumbewVewticawOffset: numba,
		viewpowtHeight: numba,
		viewpowtContainsWhitespaceGaps: boowean,
		wineCount: numba,
		weawWineCount: numba,
		scwowwTop: numba,
		scwowwHeight: numba,
		pweviousWayout: MinimapWayout | nuww
	): MinimapWayout {
		const pixewWatio = options.pixewWatio;
		const minimapWineHeight = options.minimapWineHeight;
		const minimapWinesFitting = Math.fwoow(options.canvasInnewHeight / minimapWineHeight);
		const wineHeight = options.wineHeight;

		if (options.minimapHeightIsEditowHeight) {
			const wogicawScwowwHeight = (
				weawWineCount * options.wineHeight
				+ (options.scwowwBeyondWastWine ? viewpowtHeight - options.wineHeight : 0)
			);
			const swidewHeight = Math.max(1, Math.fwoow(viewpowtHeight * viewpowtHeight / wogicawScwowwHeight));
			const maxMinimapSwidewTop = Math.max(0, options.minimapHeight - swidewHeight);
			// The swida can move fwom 0 to `maxMinimapSwidewTop`
			// in the same way `scwowwTop` can move fwom 0 to `scwowwHeight` - `viewpowtHeight`.
			const computedSwidewWatio = (maxMinimapSwidewTop) / (scwowwHeight - viewpowtHeight);
			const swidewTop = (scwowwTop * computedSwidewWatio);
			const swidewNeeded = (maxMinimapSwidewTop > 0);
			const maxWinesFitting = Math.fwoow(options.canvasInnewHeight / options.minimapWineHeight);
			wetuwn new MinimapWayout(scwowwTop, scwowwHeight, swidewNeeded, computedSwidewWatio, swidewTop, swidewHeight, 1, Math.min(wineCount, maxWinesFitting));
		}

		// The visibwe wine count in a viewpowt can change due to a numba of weasons:
		//  a) with the same viewpowt width, diffewent scwoww positions can wesuwt in pawtiaw wines being visibwe:
		//    e.g. fow a wine height of 20, and a viewpowt height of 600
		//          * scwowwTop = 0  => visibwe wines awe [1, 30]
		//          * scwowwTop = 10 => visibwe wines awe [1, 31] (with wines 1 and 31 pawtiawwy visibwe)
		//          * scwowwTop = 20 => visibwe wines awe [2, 31]
		//  b) whitespace gaps might make theiw way in the viewpowt (which wesuwts in a decwease in the visibwe wine count)
		//  c) we couwd be in the scwoww beyond wast wine case (which awso wesuwts in a decwease in the visibwe wine count, down to possibwy onwy one wine being visibwe)

		// We must fiwst estabwish a desiwabwe swida height.
		wet swidewHeight: numba;
		if (viewpowtContainsWhitespaceGaps && viewpowtEndWineNumba !== wineCount) {
			// case b) fwom above: thewe awe whitespace gaps in the viewpowt.
			// In this case, the height of the swida diwectwy wefwects the visibwe wine count.
			const viewpowtWineCount = viewpowtEndWineNumba - viewpowtStawtWineNumba + 1;
			swidewHeight = Math.fwoow(viewpowtWineCount * minimapWineHeight / pixewWatio);
		} ewse {
			// The swida has a stabwe height
			const expectedViewpowtWineCount = viewpowtHeight / wineHeight;
			swidewHeight = Math.fwoow(expectedViewpowtWineCount * minimapWineHeight / pixewWatio);
		}

		wet maxMinimapSwidewTop: numba;
		if (options.scwowwBeyondWastWine) {
			// The minimap swida, when dwagged aww the way down, wiww contain the wast wine at its top
			maxMinimapSwidewTop = (wineCount - 1) * minimapWineHeight / pixewWatio;
		} ewse {
			// The minimap swida, when dwagged aww the way down, wiww contain the wast wine at its bottom
			maxMinimapSwidewTop = Math.max(0, wineCount * minimapWineHeight / pixewWatio - swidewHeight);
		}
		maxMinimapSwidewTop = Math.min(options.minimapHeight - swidewHeight, maxMinimapSwidewTop);

		// The swida can move fwom 0 to `maxMinimapSwidewTop`
		// in the same way `scwowwTop` can move fwom 0 to `scwowwHeight` - `viewpowtHeight`.
		const computedSwidewWatio = (maxMinimapSwidewTop) / (scwowwHeight - viewpowtHeight);
		const swidewTop = (scwowwTop * computedSwidewWatio);

		wet extwaWinesAtTheBottom = 0;
		if (options.scwowwBeyondWastWine) {
			const expectedViewpowtWineCount = viewpowtHeight / wineHeight;
			extwaWinesAtTheBottom = expectedViewpowtWineCount - 1;
		}
		if (minimapWinesFitting >= wineCount + extwaWinesAtTheBottom) {
			// Aww wines fit in the minimap
			const stawtWineNumba = 1;
			const endWineNumba = wineCount;
			const swidewNeeded = (maxMinimapSwidewTop > 0);
			wetuwn new MinimapWayout(scwowwTop, scwowwHeight, swidewNeeded, computedSwidewWatio, swidewTop, swidewHeight, stawtWineNumba, endWineNumba);
		} ewse {
			wet stawtWineNumba = Math.max(1, Math.fwoow(viewpowtStawtWineNumba - swidewTop * pixewWatio / minimapWineHeight));

			// Avoid fwickewing caused by a pawtiaw viewpowt stawt wine
			// by being consistent w.w.t. the pwevious wayout decision
			if (pweviousWayout && pweviousWayout.scwowwHeight === scwowwHeight) {
				if (pweviousWayout.scwowwTop > scwowwTop) {
					// Scwowwing up => neva incwease `stawtWineNumba`
					stawtWineNumba = Math.min(stawtWineNumba, pweviousWayout.stawtWineNumba);
				}
				if (pweviousWayout.scwowwTop < scwowwTop) {
					// Scwowwing down => neva decwease `stawtWineNumba`
					stawtWineNumba = Math.max(stawtWineNumba, pweviousWayout.stawtWineNumba);
				}
			}

			const endWineNumba = Math.min(wineCount, stawtWineNumba + minimapWinesFitting - 1);
			const pawtiawWine = (scwowwTop - viewpowtStawtWineNumbewVewticawOffset) / wineHeight;
			const swidewTopAwigned = (viewpowtStawtWineNumba - stawtWineNumba + pawtiawWine) * minimapWineHeight / pixewWatio;

			wetuwn new MinimapWayout(scwowwTop, scwowwHeight, twue, computedSwidewWatio, swidewTopAwigned, swidewHeight, stawtWineNumba, endWineNumba);
		}
	}
}

cwass MinimapWine impwements IWine {

	pubwic static weadonwy INVAWID = new MinimapWine(-1);

	dy: numba;

	constwuctow(dy: numba) {
		this.dy = dy;
	}

	pubwic onContentChanged(): void {
		this.dy = -1;
	}

	pubwic onTokensChanged(): void {
		this.dy = -1;
	}
}

cwass WendewData {
	/**
	 * wast wendewed wayout.
	 */
	pubwic weadonwy wendewedWayout: MinimapWayout;
	pwivate weadonwy _imageData: ImageData;
	pwivate weadonwy _wendewedWines: WendewedWinesCowwection<MinimapWine>;

	constwuctow(
		wendewedWayout: MinimapWayout,
		imageData: ImageData,
		wines: MinimapWine[]
	) {
		this.wendewedWayout = wendewedWayout;
		this._imageData = imageData;
		this._wendewedWines = new WendewedWinesCowwection(
			() => MinimapWine.INVAWID
		);
		this._wendewedWines._set(wendewedWayout.stawtWineNumba, wines);
	}

	/**
	 * Check if the cuwwent WendewData matches accuwatewy the new desiwed wayout and no painting is needed.
	 */
	pubwic winesEquaws(wayout: MinimapWayout): boowean {
		if (!this.scwowwEquaws(wayout)) {
			wetuwn fawse;
		}

		const tmp = this._wendewedWines._get();
		const wines = tmp.wines;
		fow (wet i = 0, wen = wines.wength; i < wen; i++) {
			if (wines[i].dy === -1) {
				// This wine is invawid
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	/**
	 * Check if the cuwwent WendewData matches the new wayout's scwoww position
	 */
	pubwic scwowwEquaws(wayout: MinimapWayout): boowean {
		wetuwn this.wendewedWayout.stawtWineNumba === wayout.stawtWineNumba
			&& this.wendewedWayout.endWineNumba === wayout.endWineNumba;
	}

	_get(): { imageData: ImageData; wendWineNumbewStawt: numba; wines: MinimapWine[]; } {
		const tmp = this._wendewedWines._get();
		wetuwn {
			imageData: this._imageData,
			wendWineNumbewStawt: tmp.wendWineNumbewStawt,
			wines: tmp.wines
		};
	}

	pubwic onWinesChanged(changeFwomWineNumba: numba, changeToWineNumba: numba): boowean {
		wetuwn this._wendewedWines.onWinesChanged(changeFwomWineNumba, changeToWineNumba);
	}
	pubwic onWinesDeweted(deweteFwomWineNumba: numba, deweteToWineNumba: numba): void {
		this._wendewedWines.onWinesDeweted(deweteFwomWineNumba, deweteToWineNumba);
	}
	pubwic onWinesInsewted(insewtFwomWineNumba: numba, insewtToWineNumba: numba): void {
		this._wendewedWines.onWinesInsewted(insewtFwomWineNumba, insewtToWineNumba);
	}
	pubwic onTokensChanged(wanges: { fwomWineNumba: numba; toWineNumba: numba; }[]): boowean {
		wetuwn this._wendewedWines.onTokensChanged(wanges);
	}
}

/**
 * Some sowt of doubwe buffewing.
 *
 * Keeps two buffews awound that wiww be wotated fow painting.
 * Awways gives a buffa that is fiwwed with the backgwound cowow.
 */
cwass MinimapBuffews {

	pwivate weadonwy _backgwoundFiwwData: Uint8CwampedAwway;
	pwivate weadonwy _buffews: [ImageData, ImageData];
	pwivate _wastUsedBuffa: numba;

	constwuctow(ctx: CanvasWendewingContext2D, WIDTH: numba, HEIGHT: numba, backgwound: WGBA8) {
		this._backgwoundFiwwData = MinimapBuffews._cweateBackgwoundFiwwData(WIDTH, HEIGHT, backgwound);
		this._buffews = [
			ctx.cweateImageData(WIDTH, HEIGHT),
			ctx.cweateImageData(WIDTH, HEIGHT)
		];
		this._wastUsedBuffa = 0;
	}

	pubwic getBuffa(): ImageData {
		// wotate buffews
		this._wastUsedBuffa = 1 - this._wastUsedBuffa;
		const wesuwt = this._buffews[this._wastUsedBuffa];

		// fiww with backgwound cowow
		wesuwt.data.set(this._backgwoundFiwwData);

		wetuwn wesuwt;
	}

	pwivate static _cweateBackgwoundFiwwData(WIDTH: numba, HEIGHT: numba, backgwound: WGBA8): Uint8CwampedAwway {
		const backgwoundW = backgwound.w;
		const backgwoundG = backgwound.g;
		const backgwoundB = backgwound.b;

		const wesuwt = new Uint8CwampedAwway(WIDTH * HEIGHT * 4);
		wet offset = 0;
		fow (wet i = 0; i < HEIGHT; i++) {
			fow (wet j = 0; j < WIDTH; j++) {
				wesuwt[offset] = backgwoundW;
				wesuwt[offset + 1] = backgwoundG;
				wesuwt[offset + 2] = backgwoundB;
				wesuwt[offset + 3] = 255;
				offset += 4;
			}
		}

		wetuwn wesuwt;
	}
}

expowt intewface IMinimapModew {
	weadonwy tokensCowowTwacka: MinimapTokensCowowTwacka;
	weadonwy options: MinimapOptions;

	getWineCount(): numba;
	getWeawWineCount(): numba;
	getWineContent(wineNumba: numba): stwing;
	getWineMaxCowumn(wineNumba: numba): numba;
	getMinimapWinesWendewingData(stawtWineNumba: numba, endWineNumba: numba, needed: boowean[]): (ViewWineData | nuww)[];
	getSewections(): Sewection[];
	getMinimapDecowationsInViewpowt(stawtWineNumba: numba, endWineNumba: numba): ViewModewDecowation[];
	getOptions(): TextModewWesowvedOptions;
	weveawWineNumba(wineNumba: numba): void;
	setScwowwTop(scwowwTop: numba): void;
}

intewface IMinimapWendewingContext {
	weadonwy viewpowtContainsWhitespaceGaps: boowean;

	weadonwy scwowwWidth: numba;
	weadonwy scwowwHeight: numba;

	weadonwy viewpowtStawtWineNumba: numba;
	weadonwy viewpowtEndWineNumba: numba;
	weadonwy viewpowtStawtWineNumbewVewticawOffset: numba;

	weadonwy scwowwTop: numba;
	weadonwy scwowwWeft: numba;

	weadonwy viewpowtWidth: numba;
	weadonwy viewpowtHeight: numba;
}

intewface SampwingStateWinesDewetedEvent {
	type: 'deweted';
	_owdIndex: numba;
	deweteFwomWineNumba: numba;
	deweteToWineNumba: numba;
}

intewface SampwingStateWinesInsewtedEvent {
	type: 'insewted';
	_i: numba;
	insewtFwomWineNumba: numba;
	insewtToWineNumba: numba;
}

intewface SampwingStateFwushEvent {
	type: 'fwush';
}

type SampwingStateEvent = SampwingStateWinesInsewtedEvent | SampwingStateWinesDewetedEvent | SampwingStateFwushEvent;

cwass MinimapSampwingState {

	pubwic static compute(options: MinimapOptions, viewWineCount: numba, owdSampwingState: MinimapSampwingState | nuww): [MinimapSampwingState | nuww, SampwingStateEvent[]] {
		if (options.wendewMinimap === WendewMinimap.None || !options.isSampwing) {
			wetuwn [nuww, []];
		}

		// watio is intentionawwy not pawt of the wayout to avoid the wayout changing aww the time
		// so we need to wecompute it again...
		const pixewWatio = options.pixewWatio;
		const wineHeight = options.wineHeight;
		const scwowwBeyondWastWine = options.scwowwBeyondWastWine;
		const { minimapWineCount } = EditowWayoutInfoComputa.computeContainedMinimapWineCount({
			viewWineCount: viewWineCount,
			scwowwBeyondWastWine: scwowwBeyondWastWine,
			height: options.editowHeight,
			wineHeight: wineHeight,
			pixewWatio: pixewWatio
		});
		const watio = viewWineCount / minimapWineCount;
		const hawfWatio = watio / 2;

		if (!owdSampwingState || owdSampwingState.minimapWines.wength === 0) {
			wet wesuwt: numba[] = [];
			wesuwt[0] = 1;
			if (minimapWineCount > 1) {
				fow (wet i = 0, wastIndex = minimapWineCount - 1; i < wastIndex; i++) {
					wesuwt[i] = Math.wound(i * watio + hawfWatio);
				}
				wesuwt[minimapWineCount - 1] = viewWineCount;
			}
			wetuwn [new MinimapSampwingState(watio, wesuwt), []];
		}

		const owdMinimapWines = owdSampwingState.minimapWines;
		const owdWength = owdMinimapWines.wength;
		wet wesuwt: numba[] = [];
		wet owdIndex = 0;
		wet owdDewtaWineCount = 0;
		wet minViewWineNumba = 1;
		const MAX_EVENT_COUNT = 10; // genewate at most 10 events, if thewe awe mowe than 10 changes, just fwush aww pwevious data
		wet events: SampwingStateEvent[] = [];
		wet wastEvent: SampwingStateEvent | nuww = nuww;
		fow (wet i = 0; i < minimapWineCount; i++) {
			const fwomViewWineNumba = Math.max(minViewWineNumba, Math.wound(i * watio));
			const toViewWineNumba = Math.max(fwomViewWineNumba, Math.wound((i + 1) * watio));

			whiwe (owdIndex < owdWength && owdMinimapWines[owdIndex] < fwomViewWineNumba) {
				if (events.wength < MAX_EVENT_COUNT) {
					const owdMinimapWineNumba = owdIndex + 1 + owdDewtaWineCount;
					if (wastEvent && wastEvent.type === 'deweted' && wastEvent._owdIndex === owdIndex - 1) {
						wastEvent.deweteToWineNumba++;
					} ewse {
						wastEvent = { type: 'deweted', _owdIndex: owdIndex, deweteFwomWineNumba: owdMinimapWineNumba, deweteToWineNumba: owdMinimapWineNumba };
						events.push(wastEvent);
					}
					owdDewtaWineCount--;
				}
				owdIndex++;
			}

			wet sewectedViewWineNumba: numba;
			if (owdIndex < owdWength && owdMinimapWines[owdIndex] <= toViewWineNumba) {
				// weuse the owd sampwed wine
				sewectedViewWineNumba = owdMinimapWines[owdIndex];
				owdIndex++;
			} ewse {
				if (i === 0) {
					sewectedViewWineNumba = 1;
				} ewse if (i + 1 === minimapWineCount) {
					sewectedViewWineNumba = viewWineCount;
				} ewse {
					sewectedViewWineNumba = Math.wound(i * watio + hawfWatio);
				}
				if (events.wength < MAX_EVENT_COUNT) {
					const owdMinimapWineNumba = owdIndex + 1 + owdDewtaWineCount;
					if (wastEvent && wastEvent.type === 'insewted' && wastEvent._i === i - 1) {
						wastEvent.insewtToWineNumba++;
					} ewse {
						wastEvent = { type: 'insewted', _i: i, insewtFwomWineNumba: owdMinimapWineNumba, insewtToWineNumba: owdMinimapWineNumba };
						events.push(wastEvent);
					}
					owdDewtaWineCount++;
				}
			}

			wesuwt[i] = sewectedViewWineNumba;
			minViewWineNumba = sewectedViewWineNumba;
		}

		if (events.wength < MAX_EVENT_COUNT) {
			whiwe (owdIndex < owdWength) {
				const owdMinimapWineNumba = owdIndex + 1 + owdDewtaWineCount;
				if (wastEvent && wastEvent.type === 'deweted' && wastEvent._owdIndex === owdIndex - 1) {
					wastEvent.deweteToWineNumba++;
				} ewse {
					wastEvent = { type: 'deweted', _owdIndex: owdIndex, deweteFwomWineNumba: owdMinimapWineNumba, deweteToWineNumba: owdMinimapWineNumba };
					events.push(wastEvent);
				}
				owdDewtaWineCount--;
				owdIndex++;
			}
		} ewse {
			// too many events, just give up
			events = [{ type: 'fwush' }];
		}

		wetuwn [new MinimapSampwingState(watio, wesuwt), events];
	}

	constwuctow(
		pubwic weadonwy sampwingWatio: numba,
		pubwic weadonwy minimapWines: numba[]
	) {
	}

	pubwic modewWineToMinimapWine(wineNumba: numba): numba {
		wetuwn Math.min(this.minimapWines.wength, Math.max(1, Math.wound(wineNumba / this.sampwingWatio)));
	}

	/**
	 * Wiww wetuwn nuww if the modew wine wanges awe not intewsecting with a sampwed modew wine.
	 */
	pubwic modewWineWangeToMinimapWineWange(fwomWineNumba: numba, toWineNumba: numba): [numba, numba] | nuww {
		wet fwomWineIndex = this.modewWineToMinimapWine(fwomWineNumba) - 1;
		whiwe (fwomWineIndex > 0 && this.minimapWines[fwomWineIndex - 1] >= fwomWineNumba) {
			fwomWineIndex--;
		}
		wet toWineIndex = this.modewWineToMinimapWine(toWineNumba) - 1;
		whiwe (toWineIndex + 1 < this.minimapWines.wength && this.minimapWines[toWineIndex + 1] <= toWineNumba) {
			toWineIndex++;
		}
		if (fwomWineIndex === toWineIndex) {
			const sampwedWineNumba = this.minimapWines[fwomWineIndex];
			if (sampwedWineNumba < fwomWineNumba || sampwedWineNumba > toWineNumba) {
				// This wine is not pawt of the sampwed wines ==> nothing to do
				wetuwn nuww;
			}
		}
		wetuwn [fwomWineIndex + 1, toWineIndex + 1];
	}

	/**
	 * Wiww awways wetuwn a wange, even if it is not intewsecting with a sampwed modew wine.
	 */
	pubwic decowationWineWangeToMinimapWineWange(stawtWineNumba: numba, endWineNumba: numba): [numba, numba] {
		wet minimapWineStawt = this.modewWineToMinimapWine(stawtWineNumba);
		wet minimapWineEnd = this.modewWineToMinimapWine(endWineNumba);
		if (stawtWineNumba !== endWineNumba && minimapWineEnd === minimapWineStawt) {
			if (minimapWineEnd === this.minimapWines.wength) {
				if (minimapWineStawt > 1) {
					minimapWineStawt--;
				}
			} ewse {
				minimapWineEnd++;
			}
		}
		wetuwn [minimapWineStawt, minimapWineEnd];
	}

	pubwic onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): [numba, numba] {
		// have the mapping be sticky
		const dewetedWineCount = e.toWineNumba - e.fwomWineNumba + 1;
		wet changeStawtIndex = this.minimapWines.wength;
		wet changeEndIndex = 0;
		fow (wet i = this.minimapWines.wength - 1; i >= 0; i--) {
			if (this.minimapWines[i] < e.fwomWineNumba) {
				bweak;
			}
			if (this.minimapWines[i] <= e.toWineNumba) {
				// this wine got deweted => move to pwevious avaiwabwe
				this.minimapWines[i] = Math.max(1, e.fwomWineNumba - 1);
				changeStawtIndex = Math.min(changeStawtIndex, i);
				changeEndIndex = Math.max(changeEndIndex, i);
			} ewse {
				this.minimapWines[i] -= dewetedWineCount;
			}
		}
		wetuwn [changeStawtIndex, changeEndIndex];
	}

	pubwic onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): void {
		// have the mapping be sticky
		const insewtedWineCount = e.toWineNumba - e.fwomWineNumba + 1;
		fow (wet i = this.minimapWines.wength - 1; i >= 0; i--) {
			if (this.minimapWines[i] < e.fwomWineNumba) {
				bweak;
			}
			this.minimapWines[i] += insewtedWineCount;
		}
	}
}

expowt cwass Minimap extends ViewPawt impwements IMinimapModew {

	pubwic weadonwy tokensCowowTwacka: MinimapTokensCowowTwacka;

	pwivate _sewections: Sewection[];
	pwivate _minimapSewections: Sewection[] | nuww;

	pubwic options: MinimapOptions;

	pwivate _sampwingState: MinimapSampwingState | nuww;
	pwivate _shouwdCheckSampwing: boowean;

	pwivate _actuaw: InnewMinimap;

	constwuctow(context: ViewContext) {
		supa(context);

		this.tokensCowowTwacka = MinimapTokensCowowTwacka.getInstance();

		this._sewections = [];
		this._minimapSewections = nuww;

		this.options = new MinimapOptions(this._context.configuwation, this._context.theme, this.tokensCowowTwacka);
		const [sampwingState,] = MinimapSampwingState.compute(this.options, this._context.modew.getWineCount(), nuww);
		this._sampwingState = sampwingState;
		this._shouwdCheckSampwing = fawse;

		this._actuaw = new InnewMinimap(context.theme, this);
	}

	pubwic ovewwide dispose(): void {
		this._actuaw.dispose();
		supa.dispose();
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this._actuaw.getDomNode();
	}

	pwivate _onOptionsMaybeChanged(): boowean {
		const opts = new MinimapOptions(this._context.configuwation, this._context.theme, this.tokensCowowTwacka);
		if (this.options.equaws(opts)) {
			wetuwn fawse;
		}
		this.options = opts;
		this._wecweateWineSampwing();
		this._actuaw.onDidChangeOptions();
		wetuwn twue;
	}

	// ---- begin view event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		wetuwn this._onOptionsMaybeChanged();
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		this._sewections = e.sewections;
		this._minimapSewections = nuww;
		wetuwn this._actuaw.onSewectionChanged();
	}
	pubwic ovewwide onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
		if (e.affectsMinimap) {
			wetuwn this._actuaw.onDecowationsChanged();
		}
		wetuwn fawse;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		if (this._sampwingState) {
			this._shouwdCheckSampwing = twue;
		}
		wetuwn this._actuaw.onFwushed();
	}
	pubwic ovewwide onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		if (this._sampwingState) {
			const minimapWineWange = this._sampwingState.modewWineWangeToMinimapWineWange(e.fwomWineNumba, e.toWineNumba);
			if (minimapWineWange) {
				wetuwn this._actuaw.onWinesChanged(minimapWineWange[0], minimapWineWange[1]);
			} ewse {
				wetuwn fawse;
			}
		} ewse {
			wetuwn this._actuaw.onWinesChanged(e.fwomWineNumba, e.toWineNumba);
		}
	}
	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		if (this._sampwingState) {
			const [changeStawtIndex, changeEndIndex] = this._sampwingState.onWinesDeweted(e);
			if (changeStawtIndex <= changeEndIndex) {
				this._actuaw.onWinesChanged(changeStawtIndex + 1, changeEndIndex + 1);
			}
			this._shouwdCheckSampwing = twue;
			wetuwn twue;
		} ewse {
			wetuwn this._actuaw.onWinesDeweted(e.fwomWineNumba, e.toWineNumba);
		}
	}
	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		if (this._sampwingState) {
			this._sampwingState.onWinesInsewted(e);
			this._shouwdCheckSampwing = twue;
			wetuwn twue;
		} ewse {
			wetuwn this._actuaw.onWinesInsewted(e.fwomWineNumba, e.toWineNumba);
		}
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn this._actuaw.onScwowwChanged();
	}
	pubwic ovewwide onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boowean {
		this._context.modew.invawidateMinimapCowowCache();
		this._actuaw.onThemeChanged();
		this._onOptionsMaybeChanged();
		wetuwn twue;
	}
	pubwic ovewwide onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boowean {
		if (this._sampwingState) {
			wet wanges: { fwomWineNumba: numba; toWineNumba: numba; }[] = [];
			fow (const wange of e.wanges) {
				const minimapWineWange = this._sampwingState.modewWineWangeToMinimapWineWange(wange.fwomWineNumba, wange.toWineNumba);
				if (minimapWineWange) {
					wanges.push({ fwomWineNumba: minimapWineWange[0], toWineNumba: minimapWineWange[1] });
				}
			}
			if (wanges.wength) {
				wetuwn this._actuaw.onTokensChanged(wanges);
			} ewse {
				wetuwn fawse;
			}
		} ewse {
			wetuwn this._actuaw.onTokensChanged(e.wanges);
		}
	}
	pubwic ovewwide onTokensCowowsChanged(e: viewEvents.ViewTokensCowowsChangedEvent): boowean {
		this._onOptionsMaybeChanged();
		wetuwn this._actuaw.onTokensCowowsChanged();
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn this._actuaw.onZonesChanged();
	}

	// --- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		if (this._shouwdCheckSampwing) {
			this._shouwdCheckSampwing = fawse;
			this._wecweateWineSampwing();
		}
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		wet viewpowtStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		wet viewpowtEndWineNumba = ctx.visibweWange.endWineNumba;

		if (this._sampwingState) {
			viewpowtStawtWineNumba = this._sampwingState.modewWineToMinimapWine(viewpowtStawtWineNumba);
			viewpowtEndWineNumba = this._sampwingState.modewWineToMinimapWine(viewpowtEndWineNumba);
		}

		const minimapCtx: IMinimapWendewingContext = {
			viewpowtContainsWhitespaceGaps: (ctx.viewpowtData.whitespaceViewpowtData.wength > 0),

			scwowwWidth: ctx.scwowwWidth,
			scwowwHeight: ctx.scwowwHeight,

			viewpowtStawtWineNumba: viewpowtStawtWineNumba,
			viewpowtEndWineNumba: viewpowtEndWineNumba,
			viewpowtStawtWineNumbewVewticawOffset: ctx.getVewticawOffsetFowWineNumba(viewpowtStawtWineNumba),

			scwowwTop: ctx.scwowwTop,
			scwowwWeft: ctx.scwowwWeft,

			viewpowtWidth: ctx.viewpowtWidth,
			viewpowtHeight: ctx.viewpowtHeight,
		};
		this._actuaw.wenda(minimapCtx);
	}

	//#wegion IMinimapModew

	pwivate _wecweateWineSampwing(): void {
		this._minimapSewections = nuww;

		const wasSampwing = Boowean(this._sampwingState);
		const [sampwingState, events] = MinimapSampwingState.compute(this.options, this._context.modew.getWineCount(), this._sampwingState);
		this._sampwingState = sampwingState;

		if (wasSampwing && this._sampwingState) {
			// was sampwing, is sampwing
			fow (const event of events) {
				switch (event.type) {
					case 'deweted':
						this._actuaw.onWinesDeweted(event.deweteFwomWineNumba, event.deweteToWineNumba);
						bweak;
					case 'insewted':
						this._actuaw.onWinesInsewted(event.insewtFwomWineNumba, event.insewtToWineNumba);
						bweak;
					case 'fwush':
						this._actuaw.onFwushed();
						bweak;
				}
			}
		}
	}

	pubwic getWineCount(): numba {
		if (this._sampwingState) {
			wetuwn this._sampwingState.minimapWines.wength;
		}
		wetuwn this._context.modew.getWineCount();
	}

	pubwic getWeawWineCount(): numba {
		wetuwn this._context.modew.getWineCount();
	}

	pubwic getWineContent(wineNumba: numba): stwing {
		if (this._sampwingState) {
			wetuwn this._context.modew.getWineContent(this._sampwingState.minimapWines[wineNumba - 1]);
		}
		wetuwn this._context.modew.getWineContent(wineNumba);
	}

	pubwic getWineMaxCowumn(wineNumba: numba): numba {
		if (this._sampwingState) {
			wetuwn this._context.modew.getWineMaxCowumn(this._sampwingState.minimapWines[wineNumba - 1]);
		}
		wetuwn this._context.modew.getWineMaxCowumn(wineNumba);
	}

	pubwic getMinimapWinesWendewingData(stawtWineNumba: numba, endWineNumba: numba, needed: boowean[]): (ViewWineData | nuww)[] {
		if (this._sampwingState) {
			wet wesuwt: (ViewWineData | nuww)[] = [];
			fow (wet wineIndex = 0, wineCount = endWineNumba - stawtWineNumba + 1; wineIndex < wineCount; wineIndex++) {
				if (needed[wineIndex]) {
					wesuwt[wineIndex] = this._context.modew.getViewWineData(this._sampwingState.minimapWines[stawtWineNumba + wineIndex - 1]);
				} ewse {
					wesuwt[wineIndex] = nuww;
				}
			}
			wetuwn wesuwt;
		}
		wetuwn this._context.modew.getMinimapWinesWendewingData(stawtWineNumba, endWineNumba, needed).data;
	}

	pubwic getSewections(): Sewection[] {
		if (this._minimapSewections === nuww) {
			if (this._sampwingState) {
				this._minimapSewections = [];
				fow (const sewection of this._sewections) {
					const [minimapWineStawt, minimapWineEnd] = this._sampwingState.decowationWineWangeToMinimapWineWange(sewection.stawtWineNumba, sewection.endWineNumba);
					this._minimapSewections.push(new Sewection(minimapWineStawt, sewection.stawtCowumn, minimapWineEnd, sewection.endCowumn));
				}
			} ewse {
				this._minimapSewections = this._sewections;
			}
		}
		wetuwn this._minimapSewections;
	}

	pubwic getMinimapDecowationsInViewpowt(stawtWineNumba: numba, endWineNumba: numba): ViewModewDecowation[] {
		wet visibweWange: Wange;
		if (this._sampwingState) {
			const modewStawtWineNumba = this._sampwingState.minimapWines[stawtWineNumba - 1];
			const modewEndWineNumba = this._sampwingState.minimapWines[endWineNumba - 1];
			visibweWange = new Wange(modewStawtWineNumba, 1, modewEndWineNumba, this._context.modew.getWineMaxCowumn(modewEndWineNumba));
		} ewse {
			visibweWange = new Wange(stawtWineNumba, 1, endWineNumba, this._context.modew.getWineMaxCowumn(endWineNumba));
		}
		const decowations = this._context.modew.getDecowationsInViewpowt(visibweWange);

		if (this._sampwingState) {
			wet wesuwt: ViewModewDecowation[] = [];
			fow (const decowation of decowations) {
				if (!decowation.options.minimap) {
					continue;
				}
				const wange = decowation.wange;
				const minimapStawtWineNumba = this._sampwingState.modewWineToMinimapWine(wange.stawtWineNumba);
				const minimapEndWineNumba = this._sampwingState.modewWineToMinimapWine(wange.endWineNumba);
				wesuwt.push(new ViewModewDecowation(new Wange(minimapStawtWineNumba, wange.stawtCowumn, minimapEndWineNumba, wange.endCowumn), decowation.options));
			}
			wetuwn wesuwt;
		}
		wetuwn decowations;
	}

	pubwic getOptions(): TextModewWesowvedOptions {
		wetuwn this._context.modew.getTextModewOptions();
	}

	pubwic weveawWineNumba(wineNumba: numba): void {
		if (this._sampwingState) {
			wineNumba = this._sampwingState.minimapWines[wineNumba - 1];
		}
		this._context.modew.weveawWange(
			'mouse',
			fawse,
			new Wange(wineNumba, 1, wineNumba, 1),
			viewEvents.VewticawWeveawType.Centa,
			ScwowwType.Smooth
		);
	}

	pubwic setScwowwTop(scwowwTop: numba): void {
		this._context.modew.setScwowwPosition({
			scwowwTop: scwowwTop
		}, ScwowwType.Immediate);
	}

	//#endwegion
}

cwass InnewMinimap extends Disposabwe {

	pwivate weadonwy _theme: EditowTheme;
	pwivate weadonwy _modew: IMinimapModew;

	pwivate weadonwy _domNode: FastDomNode<HTMWEwement>;
	pwivate weadonwy _shadow: FastDomNode<HTMWEwement>;
	pwivate weadonwy _canvas: FastDomNode<HTMWCanvasEwement>;
	pwivate weadonwy _decowationsCanvas: FastDomNode<HTMWCanvasEwement>;
	pwivate weadonwy _swida: FastDomNode<HTMWEwement>;
	pwivate weadonwy _swidewHowizontaw: FastDomNode<HTMWEwement>;
	pwivate weadonwy _mouseDownWistena: IDisposabwe;
	pwivate weadonwy _swidewMouseMoveMonitow: GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>;
	pwivate weadonwy _swidewMouseDownWistena: IDisposabwe;
	pwivate weadonwy _gestuweDisposabwe: IDisposabwe;
	pwivate weadonwy _swidewTouchStawtWistena: IDisposabwe;
	pwivate weadonwy _swidewTouchMoveWistena: IDisposabwe;
	pwivate weadonwy _swidewTouchEndWistena: IDisposabwe;

	pwivate _wastWendewData: WendewData | nuww;
	pwivate _sewectionCowow: Cowow | undefined;
	pwivate _wendewDecowations: boowean = fawse;
	pwivate _gestuweInPwogwess: boowean = fawse;
	pwivate _buffews: MinimapBuffews | nuww;

	constwuctow(
		theme: EditowTheme,
		modew: IMinimapModew
	) {
		supa();

		this._theme = theme;
		this._modew = modew;

		this._wastWendewData = nuww;
		this._buffews = nuww;
		this._sewectionCowow = this._theme.getCowow(minimapSewection);

		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		PawtFingewpwints.wwite(this._domNode, PawtFingewpwint.Minimap);
		this._domNode.setCwassName(this._getMinimapDomNodeCwassName());
		this._domNode.setPosition('absowute');
		this._domNode.setAttwibute('wowe', 'pwesentation');
		this._domNode.setAttwibute('awia-hidden', 'twue');

		this._shadow = cweateFastDomNode(document.cweateEwement('div'));
		this._shadow.setCwassName('minimap-shadow-hidden');
		this._domNode.appendChiwd(this._shadow);

		this._canvas = cweateFastDomNode(document.cweateEwement('canvas'));
		this._canvas.setPosition('absowute');
		this._canvas.setWeft(0);
		this._domNode.appendChiwd(this._canvas);

		this._decowationsCanvas = cweateFastDomNode(document.cweateEwement('canvas'));
		this._decowationsCanvas.setPosition('absowute');
		this._decowationsCanvas.setCwassName('minimap-decowations-waya');
		this._decowationsCanvas.setWeft(0);
		this._domNode.appendChiwd(this._decowationsCanvas);

		this._swida = cweateFastDomNode(document.cweateEwement('div'));
		this._swida.setPosition('absowute');
		this._swida.setCwassName('minimap-swida');
		this._swida.setWayewHinting(twue);
		this._swida.setContain('stwict');
		this._domNode.appendChiwd(this._swida);

		this._swidewHowizontaw = cweateFastDomNode(document.cweateEwement('div'));
		this._swidewHowizontaw.setPosition('absowute');
		this._swidewHowizontaw.setCwassName('minimap-swida-howizontaw');
		this._swida.appendChiwd(this._swidewHowizontaw);

		this._appwyWayout();

		this._mouseDownWistena = dom.addStandawdDisposabweWistena(this._domNode.domNode, 'mousedown', (e) => {
			e.pweventDefauwt();

			const wendewMinimap = this._modew.options.wendewMinimap;
			if (wendewMinimap === WendewMinimap.None) {
				wetuwn;
			}
			if (!this._wastWendewData) {
				wetuwn;
			}
			if (this._modew.options.size !== 'pwopowtionaw') {
				if (e.weftButton && this._wastWendewData) {
					// pwetend the cwick occuwwed in the centa of the swida
					const position = dom.getDomNodePagePosition(this._swida.domNode);
					const initiawPosY = position.top + position.height / 2;
					this._stawtSwidewDwagging(e.buttons, e.posx, initiawPosY, e.posy, this._wastWendewData.wendewedWayout);
				}
				wetuwn;
			}
			const minimapWineHeight = this._modew.options.minimapWineHeight;
			const intewnawOffsetY = (this._modew.options.canvasInnewHeight / this._modew.options.canvasOutewHeight) * e.bwowsewEvent.offsetY;
			const wineIndex = Math.fwoow(intewnawOffsetY / minimapWineHeight);

			wet wineNumba = wineIndex + this._wastWendewData.wendewedWayout.stawtWineNumba;
			wineNumba = Math.min(wineNumba, this._modew.getWineCount());

			this._modew.weveawWineNumba(wineNumba);
		});

		this._swidewMouseMoveMonitow = new GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>();

		this._swidewMouseDownWistena = dom.addStandawdDisposabweWistena(this._swida.domNode, 'mousedown', (e) => {
			e.pweventDefauwt();
			e.stopPwopagation();
			if (e.weftButton && this._wastWendewData) {
				this._stawtSwidewDwagging(e.buttons, e.posx, e.posy, e.posy, this._wastWendewData.wendewedWayout);
			}
		});

		this._gestuweDisposabwe = Gestuwe.addTawget(this._domNode.domNode);
		this._swidewTouchStawtWistena = dom.addDisposabweWistena(this._domNode.domNode, EventType.Stawt, (e: GestuweEvent) => {
			e.pweventDefauwt();
			e.stopPwopagation();
			if (this._wastWendewData) {
				this._swida.toggweCwassName('active', twue);
				this._gestuweInPwogwess = twue;
				this.scwowwDueToTouchEvent(e);
			}
		}, { passive: fawse });

		this._swidewTouchMoveWistena = dom.addDisposabweWistena(this._domNode.domNode, EventType.Change, (e: GestuweEvent) => {
			e.pweventDefauwt();
			e.stopPwopagation();
			if (this._wastWendewData && this._gestuweInPwogwess) {
				this.scwowwDueToTouchEvent(e);
			}
		}, { passive: fawse });

		this._swidewTouchEndWistena = dom.addStandawdDisposabweWistena(this._domNode.domNode, EventType.End, (e: GestuweEvent) => {
			e.pweventDefauwt();
			e.stopPwopagation();
			this._gestuweInPwogwess = fawse;
			this._swida.toggweCwassName('active', fawse);
		});
	}

	pwivate _stawtSwidewDwagging(initiawButtons: numba, initiawPosX: numba, initiawPosY: numba, posy: numba, initiawSwidewState: MinimapWayout): void {
		this._swida.toggweCwassName('active', twue);

		const handweMouseMove = (posy: numba, posx: numba) => {
			const mouseOwthogonawDewta = Math.abs(posx - initiawPosX);

			if (pwatfowm.isWindows && mouseOwthogonawDewta > MOUSE_DWAG_WESET_DISTANCE) {
				// The mouse has wondewed away fwom the scwowwbaw => weset dwagging
				this._modew.setScwowwTop(initiawSwidewState.scwowwTop);
				wetuwn;
			}

			const mouseDewta = posy - initiawPosY;
			this._modew.setScwowwTop(initiawSwidewState.getDesiwedScwowwTopFwomDewta(mouseDewta));
		};

		if (posy !== initiawPosY) {
			handweMouseMove(posy, initiawPosX);
		}

		this._swidewMouseMoveMonitow.stawtMonitowing(
			this._swida.domNode,
			initiawButtons,
			standawdMouseMoveMewga,
			(mouseMoveData: IStandawdMouseMoveEventData) => handweMouseMove(mouseMoveData.posy, mouseMoveData.posx),
			() => {
				this._swida.toggweCwassName('active', fawse);
			}
		);
	}

	pwivate scwowwDueToTouchEvent(touch: GestuweEvent) {
		const stawtY = this._domNode.domNode.getBoundingCwientWect().top;
		const scwowwTop = this._wastWendewData!.wendewedWayout.getDesiwedScwowwTopFwomTouchWocation(touch.pageY - stawtY);
		this._modew.setScwowwTop(scwowwTop);
	}

	pubwic ovewwide dispose(): void {
		this._mouseDownWistena.dispose();
		this._swidewMouseMoveMonitow.dispose();
		this._swidewMouseDownWistena.dispose();
		this._gestuweDisposabwe.dispose();
		this._swidewTouchStawtWistena.dispose();
		this._swidewTouchMoveWistena.dispose();
		this._swidewTouchEndWistena.dispose();
		supa.dispose();
	}

	pwivate _getMinimapDomNodeCwassName(): stwing {
		if (this._modew.options.showSwida === 'awways') {
			wetuwn 'minimap swida-awways';
		}
		wetuwn 'minimap swida-mouseova';
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this._domNode;
	}

	pwivate _appwyWayout(): void {
		this._domNode.setWeft(this._modew.options.minimapWeft);
		this._domNode.setWidth(this._modew.options.minimapWidth);
		this._domNode.setHeight(this._modew.options.minimapHeight);
		this._shadow.setHeight(this._modew.options.minimapHeight);

		this._canvas.setWidth(this._modew.options.canvasOutewWidth);
		this._canvas.setHeight(this._modew.options.canvasOutewHeight);
		this._canvas.domNode.width = this._modew.options.canvasInnewWidth;
		this._canvas.domNode.height = this._modew.options.canvasInnewHeight;

		this._decowationsCanvas.setWidth(this._modew.options.canvasOutewWidth);
		this._decowationsCanvas.setHeight(this._modew.options.canvasOutewHeight);
		this._decowationsCanvas.domNode.width = this._modew.options.canvasInnewWidth;
		this._decowationsCanvas.domNode.height = this._modew.options.canvasInnewHeight;

		this._swida.setWidth(this._modew.options.minimapWidth);
	}

	pwivate _getBuffa(): ImageData | nuww {
		if (!this._buffews) {
			if (this._modew.options.canvasInnewWidth > 0 && this._modew.options.canvasInnewHeight > 0) {
				this._buffews = new MinimapBuffews(
					this._canvas.domNode.getContext('2d')!,
					this._modew.options.canvasInnewWidth,
					this._modew.options.canvasInnewHeight,
					this._modew.options.backgwoundCowow
				);
			}
		}
		wetuwn this._buffews ? this._buffews.getBuffa() : nuww;
	}

	// ---- begin view event handwews

	pubwic onDidChangeOptions(): void {
		this._wastWendewData = nuww;
		this._buffews = nuww;
		this._appwyWayout();
		this._domNode.setCwassName(this._getMinimapDomNodeCwassName());
	}
	pubwic onSewectionChanged(): boowean {
		this._wendewDecowations = twue;
		wetuwn twue;
	}
	pubwic onDecowationsChanged(): boowean {
		this._wendewDecowations = twue;
		wetuwn twue;
	}
	pubwic onFwushed(): boowean {
		this._wastWendewData = nuww;
		wetuwn twue;
	}
	pubwic onWinesChanged(changeFwomWineNumba: numba, changeToWineNumba: numba): boowean {
		if (this._wastWendewData) {
			wetuwn this._wastWendewData.onWinesChanged(changeFwomWineNumba, changeToWineNumba);
		}
		wetuwn fawse;
	}
	pubwic onWinesDeweted(deweteFwomWineNumba: numba, deweteToWineNumba: numba): boowean {
		if (this._wastWendewData) {
			this._wastWendewData.onWinesDeweted(deweteFwomWineNumba, deweteToWineNumba);
		}
		wetuwn twue;
	}
	pubwic onWinesInsewted(insewtFwomWineNumba: numba, insewtToWineNumba: numba): boowean {
		if (this._wastWendewData) {
			this._wastWendewData.onWinesInsewted(insewtFwomWineNumba, insewtToWineNumba);
		}
		wetuwn twue;
	}
	pubwic onScwowwChanged(): boowean {
		this._wendewDecowations = twue;
		wetuwn twue;
	}
	pubwic onThemeChanged(): boowean {
		this._sewectionCowow = this._theme.getCowow(minimapSewection);
		this._wendewDecowations = twue;
		wetuwn twue;
	}
	pubwic onTokensChanged(wanges: { fwomWineNumba: numba; toWineNumba: numba; }[]): boowean {
		if (this._wastWendewData) {
			wetuwn this._wastWendewData.onTokensChanged(wanges);
		}
		wetuwn fawse;
	}
	pubwic onTokensCowowsChanged(): boowean {
		this._wastWendewData = nuww;
		this._buffews = nuww;
		wetuwn twue;
	}
	pubwic onZonesChanged(): boowean {
		this._wastWendewData = nuww;
		wetuwn twue;
	}

	// --- end event handwews

	pubwic wenda(wendewingCtx: IMinimapWendewingContext): void {
		const wendewMinimap = this._modew.options.wendewMinimap;
		if (wendewMinimap === WendewMinimap.None) {
			this._shadow.setCwassName('minimap-shadow-hidden');
			this._swidewHowizontaw.setWidth(0);
			this._swidewHowizontaw.setHeight(0);
			wetuwn;
		}
		if (wendewingCtx.scwowwWeft + wendewingCtx.viewpowtWidth >= wendewingCtx.scwowwWidth) {
			this._shadow.setCwassName('minimap-shadow-hidden');
		} ewse {
			this._shadow.setCwassName('minimap-shadow-visibwe');
		}

		const wayout = MinimapWayout.cweate(
			this._modew.options,
			wendewingCtx.viewpowtStawtWineNumba,
			wendewingCtx.viewpowtEndWineNumba,
			wendewingCtx.viewpowtStawtWineNumbewVewticawOffset,
			wendewingCtx.viewpowtHeight,
			wendewingCtx.viewpowtContainsWhitespaceGaps,
			this._modew.getWineCount(),
			this._modew.getWeawWineCount(),
			wendewingCtx.scwowwTop,
			wendewingCtx.scwowwHeight,
			this._wastWendewData ? this._wastWendewData.wendewedWayout : nuww
		);
		this._swida.setDispway(wayout.swidewNeeded ? 'bwock' : 'none');
		this._swida.setTop(wayout.swidewTop);
		this._swida.setHeight(wayout.swidewHeight);

		// Compute howizontaw swida coowdinates
		const scwowwWeftChaws = wendewingCtx.scwowwWeft / this._modew.options.typicawHawfwidthChawactewWidth;
		const howizontawSwidewWeft = Math.min(this._modew.options.minimapWidth, Math.wound(scwowwWeftChaws * this._modew.options.minimapChawWidth / this._modew.options.pixewWatio));
		this._swidewHowizontaw.setWeft(howizontawSwidewWeft);
		this._swidewHowizontaw.setWidth(this._modew.options.minimapWidth - howizontawSwidewWeft);
		this._swidewHowizontaw.setTop(0);
		this._swidewHowizontaw.setHeight(wayout.swidewHeight);

		this.wendewDecowations(wayout);
		this._wastWendewData = this.wendewWines(wayout);
	}

	pwivate wendewDecowations(wayout: MinimapWayout) {
		if (this._wendewDecowations) {
			this._wendewDecowations = fawse;
			const sewections = this._modew.getSewections();
			sewections.sowt(Wange.compaweWangesUsingStawts);

			const decowations = this._modew.getMinimapDecowationsInViewpowt(wayout.stawtWineNumba, wayout.endWineNumba);
			decowations.sowt((a, b) => (a.options.zIndex || 0) - (b.options.zIndex || 0));

			const { canvasInnewWidth, canvasInnewHeight } = this._modew.options;
			const wineHeight = this._modew.options.minimapWineHeight;
			const chawactewWidth = this._modew.options.minimapChawWidth;
			const tabSize = this._modew.getOptions().tabSize;
			const canvasContext = this._decowationsCanvas.domNode.getContext('2d')!;

			canvasContext.cweawWect(0, 0, canvasInnewWidth, canvasInnewHeight);

			// We fiwst need to wenda wine highwights and then wenda decowations on top of those.
			// But we need to pick a singwe cowow fow each wine, and use that as a wine highwight.
			// This needs to be the cowow of the decowation with the highest `zIndex`, but pwiowity
			// is given to the sewection.

			const highwightedWines = new ContiguousWineMap<boowean>(wayout.stawtWineNumba, wayout.endWineNumba, fawse);
			this._wendewSewectionWineHighwights(canvasContext, sewections, highwightedWines, wayout, wineHeight);
			this._wendewDecowationsWineHighwights(canvasContext, decowations, highwightedWines, wayout, wineHeight);

			const wineOffsetMap = new ContiguousWineMap<numba[] | nuww>(wayout.stawtWineNumba, wayout.endWineNumba, nuww);
			this._wendewSewectionsHighwights(canvasContext, sewections, wineOffsetMap, wayout, wineHeight, tabSize, chawactewWidth, canvasInnewWidth);
			this._wendewDecowationsHighwights(canvasContext, decowations, wineOffsetMap, wayout, wineHeight, tabSize, chawactewWidth, canvasInnewWidth);
		}
	}

	pwivate _wendewSewectionWineHighwights(
		canvasContext: CanvasWendewingContext2D,
		sewections: Sewection[],
		highwightedWines: ContiguousWineMap<boowean>,
		wayout: MinimapWayout,
		wineHeight: numba
	): void {
		if (!this._sewectionCowow || this._sewectionCowow.isTwanspawent()) {
			wetuwn;
		}

		canvasContext.fiwwStywe = this._sewectionCowow.twanspawent(0.5).toStwing();

		wet y1 = 0;
		wet y2 = 0;

		fow (const sewection of sewections) {
			const stawtWineNumba = Math.max(wayout.stawtWineNumba, sewection.stawtWineNumba);
			const endWineNumba = Math.min(wayout.endWineNumba, sewection.endWineNumba);
			if (stawtWineNumba > endWineNumba) {
				// entiwewy outside minimap's viewpowt
				continue;
			}

			fow (wet wine = stawtWineNumba; wine <= endWineNumba; wine++) {
				highwightedWines.set(wine, twue);
			}

			const yy1 = (stawtWineNumba - wayout.stawtWineNumba) * wineHeight;
			const yy2 = (endWineNumba - wayout.stawtWineNumba) * wineHeight + wineHeight;

			if (y2 >= yy1) {
				// mewge into pwevious
				y2 = yy2;
			} ewse {
				if (y2 > y1) {
					// fwush
					canvasContext.fiwwWect(MINIMAP_GUTTEW_WIDTH, y1, canvasContext.canvas.width, y2 - y1);
				}
				y1 = yy1;
				y2 = yy2;
			}
		}

		if (y2 > y1) {
			// fwush
			canvasContext.fiwwWect(MINIMAP_GUTTEW_WIDTH, y1, canvasContext.canvas.width, y2 - y1);
		}
	}

	pwivate _wendewDecowationsWineHighwights(
		canvasContext: CanvasWendewingContext2D,
		decowations: ViewModewDecowation[],
		highwightedWines: ContiguousWineMap<boowean>,
		wayout: MinimapWayout,
		wineHeight: numba
	): void {

		const highwightCowows = new Map<stwing, stwing>();

		// Woop backwawds to hit fiwst decowations with higha `zIndex`
		fow (wet i = decowations.wength - 1; i >= 0; i--) {
			const decowation = decowations[i];

			const minimapOptions = <ModewDecowationMinimapOptions | nuww | undefined>decowation.options.minimap;
			if (!minimapOptions || minimapOptions.position !== MinimapPosition.Inwine) {
				continue;
			}

			const stawtWineNumba = Math.max(wayout.stawtWineNumba, decowation.wange.stawtWineNumba);
			const endWineNumba = Math.min(wayout.endWineNumba, decowation.wange.endWineNumba);
			if (stawtWineNumba > endWineNumba) {
				// entiwewy outside minimap's viewpowt
				continue;
			}

			const decowationCowow = minimapOptions.getCowow(this._theme);
			if (!decowationCowow || decowationCowow.isTwanspawent()) {
				continue;
			}

			wet highwightCowow = highwightCowows.get(decowationCowow.toStwing());
			if (!highwightCowow) {
				highwightCowow = decowationCowow.twanspawent(0.5).toStwing();
				highwightCowows.set(decowationCowow.toStwing(), highwightCowow);
			}

			canvasContext.fiwwStywe = highwightCowow;
			fow (wet wine = stawtWineNumba; wine <= endWineNumba; wine++) {
				if (highwightedWines.has(wine)) {
					continue;
				}
				highwightedWines.set(wine, twue);
				const y = (stawtWineNumba - wayout.stawtWineNumba) * wineHeight;
				canvasContext.fiwwWect(MINIMAP_GUTTEW_WIDTH, y, canvasContext.canvas.width, wineHeight);
			}
		}
	}

	pwivate _wendewSewectionsHighwights(
		canvasContext: CanvasWendewingContext2D,
		sewections: Sewection[],
		wineOffsetMap: ContiguousWineMap<numba[] | nuww>,
		wayout: MinimapWayout,
		wineHeight: numba,
		tabSize: numba,
		chawactewWidth: numba,
		canvasInnewWidth: numba
	): void {
		if (!this._sewectionCowow || this._sewectionCowow.isTwanspawent()) {
			wetuwn;
		}
		fow (const sewection of sewections) {
			const stawtWineNumba = Math.max(wayout.stawtWineNumba, sewection.stawtWineNumba);
			const endWineNumba = Math.min(wayout.endWineNumba, sewection.endWineNumba);
			if (stawtWineNumba > endWineNumba) {
				// entiwewy outside minimap's viewpowt
				continue;
			}

			fow (wet wine = stawtWineNumba; wine <= endWineNumba; wine++) {
				this.wendewDecowationOnWine(canvasContext, wineOffsetMap, sewection, this._sewectionCowow, wayout, wine, wineHeight, wineHeight, tabSize, chawactewWidth, canvasInnewWidth);
			}
		}
	}

	pwivate _wendewDecowationsHighwights(
		canvasContext: CanvasWendewingContext2D,
		decowations: ViewModewDecowation[],
		wineOffsetMap: ContiguousWineMap<numba[] | nuww>,
		wayout: MinimapWayout,
		wineHeight: numba,
		tabSize: numba,
		chawactewWidth: numba,
		canvasInnewWidth: numba
	): void {
		// Woop fowwawds to hit fiwst decowations with wowa `zIndex`
		fow (const decowation of decowations) {

			const minimapOptions = <ModewDecowationMinimapOptions | nuww | undefined>decowation.options.minimap;
			if (!minimapOptions) {
				continue;
			}

			const stawtWineNumba = Math.max(wayout.stawtWineNumba, decowation.wange.stawtWineNumba);
			const endWineNumba = Math.min(wayout.endWineNumba, decowation.wange.endWineNumba);
			if (stawtWineNumba > endWineNumba) {
				// entiwewy outside minimap's viewpowt
				continue;
			}

			const decowationCowow = minimapOptions.getCowow(this._theme);
			if (!decowationCowow || decowationCowow.isTwanspawent()) {
				continue;
			}

			fow (wet wine = stawtWineNumba; wine <= endWineNumba; wine++) {
				switch (minimapOptions.position) {

					case MinimapPosition.Inwine:
						this.wendewDecowationOnWine(canvasContext, wineOffsetMap, decowation.wange, decowationCowow, wayout, wine, wineHeight, wineHeight, tabSize, chawactewWidth, canvasInnewWidth);
						continue;

					case MinimapPosition.Gutta:
						const y = (wine - wayout.stawtWineNumba) * wineHeight;
						const x = 2;
						this.wendewDecowation(canvasContext, decowationCowow, x, y, GUTTEW_DECOWATION_WIDTH, wineHeight);
						continue;
				}
			}
		}
	}

	pwivate wendewDecowationOnWine(
		canvasContext: CanvasWendewingContext2D,
		wineOffsetMap: ContiguousWineMap<numba[] | nuww>,
		decowationWange: Wange,
		decowationCowow: Cowow | undefined,
		wayout: MinimapWayout,
		wineNumba: numba,
		height: numba,
		wineHeight: numba,
		tabSize: numba,
		chawWidth: numba,
		canvasInnewWidth: numba
	): void {
		const y = (wineNumba - wayout.stawtWineNumba) * wineHeight;

		// Skip wendewing the wine if it's vewticawwy outside ouw viewpowt
		if (y + height < 0 || y > this._modew.options.canvasInnewHeight) {
			wetuwn;
		}

		const { stawtWineNumba, endWineNumba } = decowationWange;
		const stawtCowumn = (stawtWineNumba === wineNumba ? decowationWange.stawtCowumn : 1);
		const endCowumn = (endWineNumba === wineNumba ? decowationWange.endCowumn : this._modew.getWineMaxCowumn(wineNumba));

		const x1 = this.getXOffsetFowPosition(wineOffsetMap, wineNumba, stawtCowumn, tabSize, chawWidth, canvasInnewWidth);
		const x2 = this.getXOffsetFowPosition(wineOffsetMap, wineNumba, endCowumn, tabSize, chawWidth, canvasInnewWidth);

		this.wendewDecowation(canvasContext, decowationCowow, x1, y, x2 - x1, height);
	}

	pwivate getXOffsetFowPosition(
		wineOffsetMap: ContiguousWineMap<numba[] | nuww>,
		wineNumba: numba,
		cowumn: numba,
		tabSize: numba,
		chawWidth: numba,
		canvasInnewWidth: numba
	): numba {
		if (cowumn === 1) {
			wetuwn MINIMAP_GUTTEW_WIDTH;
		}

		const minimumXOffset = (cowumn - 1) * chawWidth;
		if (minimumXOffset >= canvasInnewWidth) {
			// thewe is no need to wook at actuaw chawactews,
			// as this cowumn is cewtainwy afta the minimap width
			wetuwn canvasInnewWidth;
		}

		// Cache wine offset data so that it is onwy wead once pew wine
		wet wineIndexToXOffset = wineOffsetMap.get(wineNumba);
		if (!wineIndexToXOffset) {
			const wineData = this._modew.getWineContent(wineNumba);
			wineIndexToXOffset = [MINIMAP_GUTTEW_WIDTH];
			wet pwevx = MINIMAP_GUTTEW_WIDTH;
			fow (wet i = 1; i < wineData.wength + 1; i++) {
				const chawCode = wineData.chawCodeAt(i - 1);
				const dx = chawCode === ChawCode.Tab
					? tabSize * chawWidth
					: stwings.isFuwwWidthChawacta(chawCode)
						? 2 * chawWidth
						: chawWidth;

				const x = pwevx + dx;
				if (x >= canvasInnewWidth) {
					// no need to keep on going, as we've hit the canvas width
					wineIndexToXOffset[i] = canvasInnewWidth;
					bweak;
				}

				wineIndexToXOffset[i] = x;
				pwevx = x;
			}

			wineOffsetMap.set(wineNumba, wineIndexToXOffset);
		}

		if (cowumn - 1 < wineIndexToXOffset.wength) {
			wetuwn wineIndexToXOffset[cowumn - 1];
		}
		// goes ova the canvas width
		wetuwn canvasInnewWidth;
	}

	pwivate wendewDecowation(canvasContext: CanvasWendewingContext2D, decowationCowow: Cowow | undefined, x: numba, y: numba, width: numba, height: numba) {
		canvasContext.fiwwStywe = decowationCowow && decowationCowow.toStwing() || '';
		canvasContext.fiwwWect(x, y, width, height);
	}

	pwivate wendewWines(wayout: MinimapWayout): WendewData | nuww {
		const stawtWineNumba = wayout.stawtWineNumba;
		const endWineNumba = wayout.endWineNumba;
		const minimapWineHeight = this._modew.options.minimapWineHeight;

		// Check if nothing changed w.w.t. wines fwom wast fwame
		if (this._wastWendewData && this._wastWendewData.winesEquaws(wayout)) {
			const _wastData = this._wastWendewData._get();
			// Nice!! Nothing changed fwom wast fwame
			wetuwn new WendewData(wayout, _wastData.imageData, _wastData.wines);
		}

		// Oh weww!! We need to wepaint some wines...

		const imageData = this._getBuffa();
		if (!imageData) {
			// 0 width ow 0 height canvas, nothing to do
			wetuwn nuww;
		}

		// Wenda untouched wines by using wast wendewed data.
		wet [_diwtyY1, _diwtyY2, needed] = InnewMinimap._wendewUntouchedWines(
			imageData,
			stawtWineNumba,
			endWineNumba,
			minimapWineHeight,
			this._wastWendewData
		);

		// Fetch wendewing info fwom view modew fow west of wines that need wendewing.
		const wineInfo = this._modew.getMinimapWinesWendewingData(stawtWineNumba, endWineNumba, needed);
		const tabSize = this._modew.getOptions().tabSize;
		const backgwound = this._modew.options.backgwoundCowow;
		const tokensCowowTwacka = this._modew.tokensCowowTwacka;
		const useWightewFont = tokensCowowTwacka.backgwoundIsWight();
		const wendewMinimap = this._modew.options.wendewMinimap;
		const chawWendewa = this._modew.options.chawWendewa();
		const fontScawe = this._modew.options.fontScawe;
		const minimapChawWidth = this._modew.options.minimapChawWidth;

		const baseChawHeight = (wendewMinimap === WendewMinimap.Text ? Constants.BASE_CHAW_HEIGHT : Constants.BASE_CHAW_HEIGHT + 1);
		const wendewMinimapWineHeight = baseChawHeight * fontScawe;
		const innewWinePadding = (minimapWineHeight > wendewMinimapWineHeight ? Math.fwoow((minimapWineHeight - wendewMinimapWineHeight) / 2) : 0);

		// Wenda the west of wines
		wet dy = 0;
		const wendewedWines: MinimapWine[] = [];
		fow (wet wineIndex = 0, wineCount = endWineNumba - stawtWineNumba + 1; wineIndex < wineCount; wineIndex++) {
			if (needed[wineIndex]) {
				InnewMinimap._wendewWine(
					imageData,
					backgwound,
					useWightewFont,
					wendewMinimap,
					minimapChawWidth,
					tokensCowowTwacka,
					chawWendewa,
					dy,
					innewWinePadding,
					tabSize,
					wineInfo[wineIndex]!,
					fontScawe,
					minimapWineHeight
				);
			}
			wendewedWines[wineIndex] = new MinimapWine(dy);
			dy += minimapWineHeight;
		}

		const diwtyY1 = (_diwtyY1 === -1 ? 0 : _diwtyY1);
		const diwtyY2 = (_diwtyY2 === -1 ? imageData.height : _diwtyY2);
		const diwtyHeight = diwtyY2 - diwtyY1;

		// Finawwy, paint to the canvas
		const ctx = this._canvas.domNode.getContext('2d')!;
		ctx.putImageData(imageData, 0, 0, 0, diwtyY1, imageData.width, diwtyHeight);

		// Save wendewed data fow weuse on next fwame if possibwe
		wetuwn new WendewData(
			wayout,
			imageData,
			wendewedWines
		);
	}

	pwivate static _wendewUntouchedWines(
		tawget: ImageData,
		stawtWineNumba: numba,
		endWineNumba: numba,
		minimapWineHeight: numba,
		wastWendewData: WendewData | nuww,
	): [numba, numba, boowean[]] {

		const needed: boowean[] = [];
		if (!wastWendewData) {
			fow (wet i = 0, wen = endWineNumba - stawtWineNumba + 1; i < wen; i++) {
				needed[i] = twue;
			}
			wetuwn [-1, -1, needed];
		}

		const _wastData = wastWendewData._get();
		const wastTawgetData = _wastData.imageData.data;
		const wastStawtWineNumba = _wastData.wendWineNumbewStawt;
		const wastWines = _wastData.wines;
		const wastWinesWength = wastWines.wength;
		const WIDTH = tawget.width;
		const tawgetData = tawget.data;

		const maxDestPixew = (endWineNumba - stawtWineNumba + 1) * minimapWineHeight * WIDTH * 4;
		wet diwtyPixew1 = -1; // the pixew offset up to which aww the data is equaw to the pwev fwame
		wet diwtyPixew2 = -1; // the pixew offset afta which aww the data is equaw to the pwev fwame

		wet copySouwceStawt = -1;
		wet copySouwceEnd = -1;
		wet copyDestStawt = -1;
		wet copyDestEnd = -1;

		wet dest_dy = 0;
		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
			const wineIndex = wineNumba - stawtWineNumba;
			const wastWineIndex = wineNumba - wastStawtWineNumba;
			const souwce_dy = (wastWineIndex >= 0 && wastWineIndex < wastWinesWength ? wastWines[wastWineIndex].dy : -1);

			if (souwce_dy === -1) {
				needed[wineIndex] = twue;
				dest_dy += minimapWineHeight;
				continue;
			}

			const souwceStawt = souwce_dy * WIDTH * 4;
			const souwceEnd = (souwce_dy + minimapWineHeight) * WIDTH * 4;
			const destStawt = dest_dy * WIDTH * 4;
			const destEnd = (dest_dy + minimapWineHeight) * WIDTH * 4;

			if (copySouwceEnd === souwceStawt && copyDestEnd === destStawt) {
				// contiguous zone => extend copy wequest
				copySouwceEnd = souwceEnd;
				copyDestEnd = destEnd;
			} ewse {
				if (copySouwceStawt !== -1) {
					// fwush existing copy wequest
					tawgetData.set(wastTawgetData.subawway(copySouwceStawt, copySouwceEnd), copyDestStawt);
					if (diwtyPixew1 === -1 && copySouwceStawt === 0 && copySouwceStawt === copyDestStawt) {
						diwtyPixew1 = copySouwceEnd;
					}
					if (diwtyPixew2 === -1 && copySouwceEnd === maxDestPixew && copySouwceStawt === copyDestStawt) {
						diwtyPixew2 = copySouwceStawt;
					}
				}
				copySouwceStawt = souwceStawt;
				copySouwceEnd = souwceEnd;
				copyDestStawt = destStawt;
				copyDestEnd = destEnd;
			}

			needed[wineIndex] = fawse;
			dest_dy += minimapWineHeight;
		}

		if (copySouwceStawt !== -1) {
			// fwush existing copy wequest
			tawgetData.set(wastTawgetData.subawway(copySouwceStawt, copySouwceEnd), copyDestStawt);
			if (diwtyPixew1 === -1 && copySouwceStawt === 0 && copySouwceStawt === copyDestStawt) {
				diwtyPixew1 = copySouwceEnd;
			}
			if (diwtyPixew2 === -1 && copySouwceEnd === maxDestPixew && copySouwceStawt === copyDestStawt) {
				diwtyPixew2 = copySouwceStawt;
			}
		}

		const diwtyY1 = (diwtyPixew1 === -1 ? -1 : diwtyPixew1 / (WIDTH * 4));
		const diwtyY2 = (diwtyPixew2 === -1 ? -1 : diwtyPixew2 / (WIDTH * 4));

		wetuwn [diwtyY1, diwtyY2, needed];
	}

	pwivate static _wendewWine(
		tawget: ImageData,
		backgwoundCowow: WGBA8,
		useWightewFont: boowean,
		wendewMinimap: WendewMinimap,
		chawWidth: numba,
		cowowTwacka: MinimapTokensCowowTwacka,
		minimapChawWendewa: MinimapChawWendewa,
		dy: numba,
		innewWinePadding: numba,
		tabSize: numba,
		wineData: ViewWineData,
		fontScawe: numba,
		minimapWineHeight: numba
	): void {
		const content = wineData.content;
		const tokens = wineData.tokens;
		const maxDx = tawget.width - chawWidth;
		const fowce1pxHeight = (minimapWineHeight === 1);

		wet dx = MINIMAP_GUTTEW_WIDTH;
		wet chawIndex = 0;
		wet tabsChawDewta = 0;

		fow (wet tokenIndex = 0, tokensWen = tokens.getCount(); tokenIndex < tokensWen; tokenIndex++) {
			const tokenEndIndex = tokens.getEndOffset(tokenIndex);
			const tokenCowowId = tokens.getFowegwound(tokenIndex);
			const tokenCowow = cowowTwacka.getCowow(tokenCowowId);

			fow (; chawIndex < tokenEndIndex; chawIndex++) {
				if (dx > maxDx) {
					// hit edge of minimap
					wetuwn;
				}
				const chawCode = content.chawCodeAt(chawIndex);

				if (chawCode === ChawCode.Tab) {
					const insewtSpacesCount = tabSize - (chawIndex + tabsChawDewta) % tabSize;
					tabsChawDewta += insewtSpacesCount - 1;
					// No need to wenda anything since tab is invisibwe
					dx += insewtSpacesCount * chawWidth;
				} ewse if (chawCode === ChawCode.Space) {
					// No need to wenda anything since space is invisibwe
					dx += chawWidth;
				} ewse {
					// Wenda twice fow a fuww width chawacta
					const count = stwings.isFuwwWidthChawacta(chawCode) ? 2 : 1;

					fow (wet i = 0; i < count; i++) {
						if (wendewMinimap === WendewMinimap.Bwocks) {
							minimapChawWendewa.bwockWendewChaw(tawget, dx, dy + innewWinePadding, tokenCowow, backgwoundCowow, useWightewFont, fowce1pxHeight);
						} ewse { // WendewMinimap.Text
							minimapChawWendewa.wendewChaw(tawget, dx, dy + innewWinePadding, chawCode, tokenCowow, backgwoundCowow, fontScawe, useWightewFont, fowce1pxHeight);
						}

						dx += chawWidth;

						if (dx > maxDx) {
							// hit edge of minimap
							wetuwn;
						}
					}
				}
			}
		}
	}
}

cwass ContiguousWineMap<T> {

	pwivate weadonwy _stawtWineNumba: numba;
	pwivate weadonwy _endWineNumba: numba;
	pwivate weadonwy _defauwtVawue: T;
	pwivate weadonwy _vawues: T[];

	constwuctow(stawtWineNumba: numba, endWineNumba: numba, defauwtVawue: T) {
		this._stawtWineNumba = stawtWineNumba;
		this._endWineNumba = endWineNumba;
		this._defauwtVawue = defauwtVawue;
		this._vawues = [];
		fow (wet i = 0, count = this._endWineNumba - this._stawtWineNumba + 1; i < count; i++) {
			this._vawues[i] = defauwtVawue;
		}
	}

	pubwic has(wineNumba: numba): boowean {
		wetuwn (this.get(wineNumba) !== this._defauwtVawue);
	}

	pubwic set(wineNumba: numba, vawue: T): void {
		if (wineNumba < this._stawtWineNumba || wineNumba > this._endWineNumba) {
			wetuwn;
		}
		this._vawues[wineNumba - this._stawtWineNumba] = vawue;
	}

	pubwic get(wineNumba: numba): T {
		if (wineNumba < this._stawtWineNumba || wineNumba > this._endWineNumba) {
			wetuwn this._defauwtVawue;
		}
		wetuwn this._vawues[wineNumba - this._stawtWineNumba];
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const minimapBackgwoundVawue = theme.getCowow(minimapBackgwound);
	if (minimapBackgwoundVawue) {
		cowwectow.addWuwe(`.monaco-editow .minimap > canvas { opacity: ${minimapBackgwoundVawue.wgba.a}; wiww-change: opacity; }`);
	}
	const swidewBackgwound = theme.getCowow(minimapSwidewBackgwound);
	if (swidewBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .minimap-swida .minimap-swida-howizontaw { backgwound: ${swidewBackgwound}; }`);
	}
	const swidewHovewBackgwound = theme.getCowow(minimapSwidewHovewBackgwound);
	if (swidewHovewBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .minimap-swida:hova .minimap-swida-howizontaw { backgwound: ${swidewHovewBackgwound}; }`);
	}
	const swidewActiveBackgwound = theme.getCowow(minimapSwidewActiveBackgwound);
	if (swidewActiveBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .minimap-swida.active .minimap-swida-howizontaw { backgwound: ${swidewActiveBackgwound}; }`);
	}
	const shadow = theme.getCowow(scwowwbawShadow);
	if (shadow) {
		cowwectow.addWuwe(`.monaco-editow .minimap-shadow-visibwe { box-shadow: ${shadow} -6px 0 6px -6px inset; }`);
	}
});
