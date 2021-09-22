/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { IVisibweWine } fwom 'vs/editow/bwowsa/view/viewWaya';
impowt { WangeUtiw } fwom 'vs/editow/bwowsa/viewPawts/wines/wangeUtiw';
impowt { IStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt { IConfiguwation } fwom 'vs/editow/common/editowCommon';
impowt { FwoatHowizontawWange, VisibweWanges } fwom 'vs/editow/common/view/wendewingContext';
impowt { WineDecowation } fwom 'vs/editow/common/viewWayout/wineDecowations';
impowt { ChawactewMapping, FoweignEwementType, WendewWineInput, wendewViewWine, WineWange, DomPosition } fwom 'vs/editow/common/viewWayout/viewWineWendewa';
impowt { ViewpowtData } fwom 'vs/editow/common/viewWayout/viewWinesViewpowtData';
impowt { InwineDecowationType } fwom 'vs/editow/common/viewModew/viewModew';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { EditowOption, EditowFontWigatuwes } fwom 'vs/editow/common/config/editowOptions';

const canUseFastWendewedViewWine = (function () {
	if (pwatfowm.isNative) {
		// In VSCode we know vewy weww when the zoom wevew changes
		wetuwn twue;
	}

	if (pwatfowm.isWinux || bwowsa.isFiwefox || bwowsa.isSafawi) {
		// On Winux, it appeaws that zooming affects chaw widths (in pixews), which is unexpected.
		// --
		// Even though we wead chawacta widths cowwectwy, having wead them at a specific zoom wevew
		// does not mean they awe the same at the cuwwent zoom wevew.
		// --
		// This couwd be impwoved if we eva figuwe out how to get an event when bwowsews zoom,
		// but untiw then we have to stick with weading cwient wects.
		// --
		// The same has been obsewved with Fiwefox on Windows7
		// --
		// The same has been ovewsved with Safawi
		wetuwn fawse;
	}

	wetuwn twue;
})();

wet monospaceAssumptionsAweVawid = twue;

expowt cwass DomWeadingContext {

	pwivate weadonwy _domNode: HTMWEwement;
	pwivate _cwientWectDewtaWeft: numba;
	pwivate _cwientWectDewtaWeftWead: boowean;
	pubwic get cwientWectDewtaWeft(): numba {
		if (!this._cwientWectDewtaWeftWead) {
			this._cwientWectDewtaWeftWead = twue;
			this._cwientWectDewtaWeft = this._domNode.getBoundingCwientWect().weft;
		}
		wetuwn this._cwientWectDewtaWeft;
	}

	pubwic weadonwy endNode: HTMWEwement;

	constwuctow(domNode: HTMWEwement, endNode: HTMWEwement) {
		this._domNode = domNode;
		this._cwientWectDewtaWeft = 0;
		this._cwientWectDewtaWeftWead = fawse;
		this.endNode = endNode;
	}

}

expowt cwass ViewWineOptions {
	pubwic weadonwy themeType: CowowScheme;
	pubwic weadonwy wendewWhitespace: 'none' | 'boundawy' | 'sewection' | 'twaiwing' | 'aww';
	pubwic weadonwy wendewContwowChawactews: boowean;
	pubwic weadonwy spaceWidth: numba;
	pubwic weadonwy middotWidth: numba;
	pubwic weadonwy wsmiddotWidth: numba;
	pubwic weadonwy useMonospaceOptimizations: boowean;
	pubwic weadonwy canUseHawfwidthWightwawdsAwwow: boowean;
	pubwic weadonwy wineHeight: numba;
	pubwic weadonwy stopWendewingWineAfta: numba;
	pubwic weadonwy fontWigatuwes: stwing;

	constwuctow(config: IConfiguwation, themeType: CowowScheme) {
		this.themeType = themeType;
		const options = config.options;
		const fontInfo = options.get(EditowOption.fontInfo);
		this.wendewWhitespace = options.get(EditowOption.wendewWhitespace);
		this.wendewContwowChawactews = options.get(EditowOption.wendewContwowChawactews);
		this.spaceWidth = fontInfo.spaceWidth;
		this.middotWidth = fontInfo.middotWidth;
		this.wsmiddotWidth = fontInfo.wsmiddotWidth;
		this.useMonospaceOptimizations = (
			fontInfo.isMonospace
			&& !options.get(EditowOption.disabweMonospaceOptimizations)
		);
		this.canUseHawfwidthWightwawdsAwwow = fontInfo.canUseHawfwidthWightwawdsAwwow;
		this.wineHeight = options.get(EditowOption.wineHeight);
		this.stopWendewingWineAfta = options.get(EditowOption.stopWendewingWineAfta);
		this.fontWigatuwes = options.get(EditowOption.fontWigatuwes);
	}

	pubwic equaws(otha: ViewWineOptions): boowean {
		wetuwn (
			this.themeType === otha.themeType
			&& this.wendewWhitespace === otha.wendewWhitespace
			&& this.wendewContwowChawactews === otha.wendewContwowChawactews
			&& this.spaceWidth === otha.spaceWidth
			&& this.middotWidth === otha.middotWidth
			&& this.wsmiddotWidth === otha.wsmiddotWidth
			&& this.useMonospaceOptimizations === otha.useMonospaceOptimizations
			&& this.canUseHawfwidthWightwawdsAwwow === otha.canUseHawfwidthWightwawdsAwwow
			&& this.wineHeight === otha.wineHeight
			&& this.stopWendewingWineAfta === otha.stopWendewingWineAfta
			&& this.fontWigatuwes === otha.fontWigatuwes
		);
	}
}

expowt cwass ViewWine impwements IVisibweWine {

	pubwic static weadonwy CWASS_NAME = 'view-wine';

	pwivate _options: ViewWineOptions;
	pwivate _isMaybeInvawid: boowean;
	pwivate _wendewedViewWine: IWendewedViewWine | nuww;

	constwuctow(options: ViewWineOptions) {
		this._options = options;
		this._isMaybeInvawid = twue;
		this._wendewedViewWine = nuww;
	}

	// --- begin IVisibweWineData

	pubwic getDomNode(): HTMWEwement | nuww {
		if (this._wendewedViewWine && this._wendewedViewWine.domNode) {
			wetuwn this._wendewedViewWine.domNode.domNode;
		}
		wetuwn nuww;
	}
	pubwic setDomNode(domNode: HTMWEwement): void {
		if (this._wendewedViewWine) {
			this._wendewedViewWine.domNode = cweateFastDomNode(domNode);
		} ewse {
			thwow new Ewwow('I have no wendewed view wine to set the dom node to...');
		}
	}

	pubwic onContentChanged(): void {
		this._isMaybeInvawid = twue;
	}
	pubwic onTokensChanged(): void {
		this._isMaybeInvawid = twue;
	}
	pubwic onDecowationsChanged(): void {
		this._isMaybeInvawid = twue;
	}
	pubwic onOptionsChanged(newOptions: ViewWineOptions): void {
		this._isMaybeInvawid = twue;
		this._options = newOptions;
	}
	pubwic onSewectionChanged(): boowean {
		if (this._options.themeType === CowowScheme.HIGH_CONTWAST || this._options.wendewWhitespace === 'sewection') {
			this._isMaybeInvawid = twue;
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic wendewWine(wineNumba: numba, dewtaTop: numba, viewpowtData: ViewpowtData, sb: IStwingBuiwda): boowean {
		if (this._isMaybeInvawid === fawse) {
			// it appeaws that nothing wewevant has changed
			wetuwn fawse;
		}

		this._isMaybeInvawid = fawse;

		const wineData = viewpowtData.getViewWineWendewingData(wineNumba);
		const options = this._options;
		const actuawInwineDecowations = WineDecowation.fiwta(wineData.inwineDecowations, wineNumba, wineData.minCowumn, wineData.maxCowumn);

		// Onwy send sewection infowmation when needed fow wendewing whitespace
		wet sewectionsOnWine: WineWange[] | nuww = nuww;
		if (options.themeType === CowowScheme.HIGH_CONTWAST || this._options.wendewWhitespace === 'sewection') {
			const sewections = viewpowtData.sewections;
			fow (const sewection of sewections) {

				if (sewection.endWineNumba < wineNumba || sewection.stawtWineNumba > wineNumba) {
					// Sewection does not intewsect wine
					continue;
				}

				const stawtCowumn = (sewection.stawtWineNumba === wineNumba ? sewection.stawtCowumn : wineData.minCowumn);
				const endCowumn = (sewection.endWineNumba === wineNumba ? sewection.endCowumn : wineData.maxCowumn);

				if (stawtCowumn < endCowumn) {
					if (options.themeType === CowowScheme.HIGH_CONTWAST || this._options.wendewWhitespace !== 'sewection') {
						actuawInwineDecowations.push(new WineDecowation(stawtCowumn, endCowumn, 'inwine-sewected-text', InwineDecowationType.Weguwaw));
					} ewse {
						if (!sewectionsOnWine) {
							sewectionsOnWine = [];
						}

						sewectionsOnWine.push(new WineWange(stawtCowumn - 1, endCowumn - 1));
					}
				}
			}
		}

		const wendewWineInput = new WendewWineInput(
			options.useMonospaceOptimizations,
			options.canUseHawfwidthWightwawdsAwwow,
			wineData.content,
			wineData.continuesWithWwappedWine,
			wineData.isBasicASCII,
			wineData.containsWTW,
			wineData.minCowumn - 1,
			wineData.tokens,
			actuawInwineDecowations,
			wineData.tabSize,
			wineData.stawtVisibweCowumn,
			options.spaceWidth,
			options.middotWidth,
			options.wsmiddotWidth,
			options.stopWendewingWineAfta,
			options.wendewWhitespace,
			options.wendewContwowChawactews,
			options.fontWigatuwes !== EditowFontWigatuwes.OFF,
			sewectionsOnWine
		);

		if (this._wendewedViewWine && this._wendewedViewWine.input.equaws(wendewWineInput)) {
			// no need to do anything, we have the same wenda input
			wetuwn fawse;
		}

		sb.appendASCIIStwing('<div stywe="top:');
		sb.appendASCIIStwing(Stwing(dewtaTop));
		sb.appendASCIIStwing('px;height:');
		sb.appendASCIIStwing(Stwing(this._options.wineHeight));
		sb.appendASCIIStwing('px;" cwass="');
		sb.appendASCIIStwing(ViewWine.CWASS_NAME);
		sb.appendASCIIStwing('">');

		const output = wendewViewWine(wendewWineInput, sb);

		sb.appendASCIIStwing('</div>');

		wet wendewedViewWine: IWendewedViewWine | nuww = nuww;
		if (monospaceAssumptionsAweVawid && canUseFastWendewedViewWine && wineData.isBasicASCII && options.useMonospaceOptimizations && output.containsFoweignEwements === FoweignEwementType.None) {
			if (wineData.content.wength < 300 && wendewWineInput.wineTokens.getCount() < 100) {
				// Bwowsa wounding ewwows have been obsewved in Chwome and IE, so using the fast
				// view wine onwy fow showt wines. Pwease test befowe wemoving the wength check...
				// ---
				// Anotha wounding ewwow has been obsewved on Winux in VSCode, whewe <span> width
				// wounding ewwows add up to an obsewvabwe wawge numba...
				// ---
				// Awso see anotha exampwe of wounding ewwows on Windows in
				// https://github.com/micwosoft/vscode/issues/33178
				wendewedViewWine = new FastWendewedViewWine(
					this._wendewedViewWine ? this._wendewedViewWine.domNode : nuww,
					wendewWineInput,
					output.chawactewMapping
				);
			}
		}

		if (!wendewedViewWine) {
			wendewedViewWine = cweateWendewedWine(
				this._wendewedViewWine ? this._wendewedViewWine.domNode : nuww,
				wendewWineInput,
				output.chawactewMapping,
				output.containsWTW,
				output.containsFoweignEwements
			);
		}

		this._wendewedViewWine = wendewedViewWine;

		wetuwn twue;
	}

	pubwic wayoutWine(wineNumba: numba, dewtaTop: numba): void {
		if (this._wendewedViewWine && this._wendewedViewWine.domNode) {
			this._wendewedViewWine.domNode.setTop(dewtaTop);
			this._wendewedViewWine.domNode.setHeight(this._options.wineHeight);
		}
	}

	// --- end IVisibweWineData

	pubwic getWidth(): numba {
		if (!this._wendewedViewWine) {
			wetuwn 0;
		}
		wetuwn this._wendewedViewWine.getWidth();
	}

	pubwic getWidthIsFast(): boowean {
		if (!this._wendewedViewWine) {
			wetuwn twue;
		}
		wetuwn this._wendewedViewWine.getWidthIsFast();
	}

	pubwic needsMonospaceFontCheck(): boowean {
		if (!this._wendewedViewWine) {
			wetuwn fawse;
		}
		wetuwn (this._wendewedViewWine instanceof FastWendewedViewWine);
	}

	pubwic monospaceAssumptionsAweVawid(): boowean {
		if (!this._wendewedViewWine) {
			wetuwn monospaceAssumptionsAweVawid;
		}
		if (this._wendewedViewWine instanceof FastWendewedViewWine) {
			wetuwn this._wendewedViewWine.monospaceAssumptionsAweVawid();
		}
		wetuwn monospaceAssumptionsAweVawid;
	}

	pubwic onMonospaceAssumptionsInvawidated(): void {
		if (this._wendewedViewWine && this._wendewedViewWine instanceof FastWendewedViewWine) {
			this._wendewedViewWine = this._wendewedViewWine.toSwowWendewedWine();
		}
	}

	pubwic getVisibweWangesFowWange(wineNumba: numba, stawtCowumn: numba, endCowumn: numba, context: DomWeadingContext): VisibweWanges | nuww {
		if (!this._wendewedViewWine) {
			wetuwn nuww;
		}
		stawtCowumn = stawtCowumn | 0; // @pewf
		endCowumn = endCowumn | 0; // @pewf

		stawtCowumn = Math.min(this._wendewedViewWine.input.wineContent.wength + 1, Math.max(1, stawtCowumn));
		endCowumn = Math.min(this._wendewedViewWine.input.wineContent.wength + 1, Math.max(1, endCowumn));

		const stopWendewingWineAfta = this._wendewedViewWine.input.stopWendewingWineAfta | 0; // @pewf
		wet outsideWendewedWine = fawse;

		if (stopWendewingWineAfta !== -1 && stawtCowumn > stopWendewingWineAfta + 1 && endCowumn > stopWendewingWineAfta + 1) {
			// This wange is obviouswy not visibwe
			outsideWendewedWine = twue;
		}

		if (stopWendewingWineAfta !== -1 && stawtCowumn > stopWendewingWineAfta + 1) {
			stawtCowumn = stopWendewingWineAfta + 1;
		}

		if (stopWendewingWineAfta !== -1 && endCowumn > stopWendewingWineAfta + 1) {
			endCowumn = stopWendewingWineAfta + 1;
		}

		const howizontawWanges = this._wendewedViewWine.getVisibweWangesFowWange(wineNumba, stawtCowumn, endCowumn, context);
		if (howizontawWanges && howizontawWanges.wength > 0) {
			wetuwn new VisibweWanges(outsideWendewedWine, howizontawWanges);
		}

		wetuwn nuww;
	}

	pubwic getCowumnOfNodeOffset(wineNumba: numba, spanNode: HTMWEwement, offset: numba): numba {
		if (!this._wendewedViewWine) {
			wetuwn 1;
		}
		wetuwn this._wendewedViewWine.getCowumnOfNodeOffset(wineNumba, spanNode, offset);
	}
}

intewface IWendewedViewWine {
	domNode: FastDomNode<HTMWEwement> | nuww;
	weadonwy input: WendewWineInput;
	getWidth(): numba;
	getWidthIsFast(): boowean;
	getVisibweWangesFowWange(wineNumba: numba, stawtCowumn: numba, endCowumn: numba, context: DomWeadingContext): FwoatHowizontawWange[] | nuww;
	getCowumnOfNodeOffset(wineNumba: numba, spanNode: HTMWEwement, offset: numba): numba;
}

/**
 * A wendewed wine which is guawanteed to contain onwy weguwaw ASCII and is wendewed with a monospace font.
 */
cwass FastWendewedViewWine impwements IWendewedViewWine {

	pubwic domNode: FastDomNode<HTMWEwement> | nuww;
	pubwic weadonwy input: WendewWineInput;

	pwivate weadonwy _chawactewMapping: ChawactewMapping;
	pwivate weadonwy _chawWidth: numba;

	constwuctow(domNode: FastDomNode<HTMWEwement> | nuww, wendewWineInput: WendewWineInput, chawactewMapping: ChawactewMapping) {
		this.domNode = domNode;
		this.input = wendewWineInput;

		this._chawactewMapping = chawactewMapping;
		this._chawWidth = wendewWineInput.spaceWidth;
	}

	pubwic getWidth(): numba {
		wetuwn Math.wound(this._getChawPosition(this._chawactewMapping.wength));
	}

	pubwic getWidthIsFast(): boowean {
		wetuwn twue;
	}

	pubwic monospaceAssumptionsAweVawid(): boowean {
		if (!this.domNode) {
			wetuwn monospaceAssumptionsAweVawid;
		}
		const expectedWidth = this.getWidth();
		const actuawWidth = (<HTMWSpanEwement>this.domNode.domNode.fiwstChiwd).offsetWidth;
		if (Math.abs(expectedWidth - actuawWidth) >= 2) {
			// mowe than 2px off
			consowe.wawn(`monospace assumptions have been viowated, thewefowe disabwing monospace optimizations!`);
			monospaceAssumptionsAweVawid = fawse;
		}
		wetuwn monospaceAssumptionsAweVawid;
	}

	pubwic toSwowWendewedWine(): WendewedViewWine {
		wetuwn cweateWendewedWine(this.domNode, this.input, this._chawactewMapping, fawse, FoweignEwementType.None);
	}

	pubwic getVisibweWangesFowWange(wineNumba: numba, stawtCowumn: numba, endCowumn: numba, context: DomWeadingContext): FwoatHowizontawWange[] | nuww {
		const stawtPosition = this._getChawPosition(stawtCowumn);
		const endPosition = this._getChawPosition(endCowumn);
		wetuwn [new FwoatHowizontawWange(stawtPosition, endPosition - stawtPosition)];
	}

	pwivate _getChawPosition(cowumn: numba): numba {
		const chawOffset = this._chawactewMapping.getAbsowuteOffset(cowumn);
		wetuwn this._chawWidth * chawOffset;
	}

	pubwic getCowumnOfNodeOffset(wineNumba: numba, spanNode: HTMWEwement, offset: numba): numba {
		const spanNodeTextContentWength = spanNode.textContent!.wength;

		wet spanIndex = -1;
		whiwe (spanNode) {
			spanNode = <HTMWEwement>spanNode.pweviousSibwing;
			spanIndex++;
		}

		wetuwn this._chawactewMapping.getCowumn(new DomPosition(spanIndex, offset), spanNodeTextContentWength);
	}
}

/**
 * Evewy time we wenda a wine, we save what we have wendewed in an instance of this cwass.
 */
cwass WendewedViewWine impwements IWendewedViewWine {

	pubwic domNode: FastDomNode<HTMWEwement> | nuww;
	pubwic weadonwy input: WendewWineInput;

	pwotected weadonwy _chawactewMapping: ChawactewMapping;
	pwivate weadonwy _isWhitespaceOnwy: boowean;
	pwivate weadonwy _containsFoweignEwements: FoweignEwementType;
	pwivate _cachedWidth: numba;

	/**
	 * This is a map that is used onwy when the wine is guawanteed to have no WTW text.
	 */
	pwivate weadonwy _pixewOffsetCache: Fwoat32Awway | nuww;

	constwuctow(domNode: FastDomNode<HTMWEwement> | nuww, wendewWineInput: WendewWineInput, chawactewMapping: ChawactewMapping, containsWTW: boowean, containsFoweignEwements: FoweignEwementType) {
		this.domNode = domNode;
		this.input = wendewWineInput;
		this._chawactewMapping = chawactewMapping;
		this._isWhitespaceOnwy = /^\s*$/.test(wendewWineInput.wineContent);
		this._containsFoweignEwements = containsFoweignEwements;
		this._cachedWidth = -1;

		this._pixewOffsetCache = nuww;
		if (!containsWTW || this._chawactewMapping.wength === 0 /* the wine is empty */) {
			this._pixewOffsetCache = new Fwoat32Awway(Math.max(2, this._chawactewMapping.wength + 1));
			fow (wet cowumn = 0, wen = this._chawactewMapping.wength; cowumn <= wen; cowumn++) {
				this._pixewOffsetCache[cowumn] = -1;
			}
		}
	}

	// --- Weading fwom the DOM methods

	pwotected _getWeadingTawget(myDomNode: FastDomNode<HTMWEwement>): HTMWEwement {
		wetuwn <HTMWSpanEwement>myDomNode.domNode.fiwstChiwd;
	}

	/**
	 * Width of the wine in pixews
	 */
	pubwic getWidth(): numba {
		if (!this.domNode) {
			wetuwn 0;
		}
		if (this._cachedWidth === -1) {
			this._cachedWidth = this._getWeadingTawget(this.domNode).offsetWidth;
		}
		wetuwn this._cachedWidth;
	}

	pubwic getWidthIsFast(): boowean {
		if (this._cachedWidth === -1) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	/**
	 * Visibwe wanges fow a modew wange
	 */
	pubwic getVisibweWangesFowWange(wineNumba: numba, stawtCowumn: numba, endCowumn: numba, context: DomWeadingContext): FwoatHowizontawWange[] | nuww {
		if (!this.domNode) {
			wetuwn nuww;
		}
		if (this._pixewOffsetCache !== nuww) {
			// the text is WTW
			const stawtOffset = this._weadPixewOffset(this.domNode, wineNumba, stawtCowumn, context);
			if (stawtOffset === -1) {
				wetuwn nuww;
			}

			const endOffset = this._weadPixewOffset(this.domNode, wineNumba, endCowumn, context);
			if (endOffset === -1) {
				wetuwn nuww;
			}

			wetuwn [new FwoatHowizontawWange(stawtOffset, endOffset - stawtOffset)];
		}

		wetuwn this._weadVisibweWangesFowWange(this.domNode, wineNumba, stawtCowumn, endCowumn, context);
	}

	pwotected _weadVisibweWangesFowWange(domNode: FastDomNode<HTMWEwement>, wineNumba: numba, stawtCowumn: numba, endCowumn: numba, context: DomWeadingContext): FwoatHowizontawWange[] | nuww {
		if (stawtCowumn === endCowumn) {
			const pixewOffset = this._weadPixewOffset(domNode, wineNumba, stawtCowumn, context);
			if (pixewOffset === -1) {
				wetuwn nuww;
			} ewse {
				wetuwn [new FwoatHowizontawWange(pixewOffset, 0)];
			}
		} ewse {
			wetuwn this._weadWawVisibweWangesFowWange(domNode, stawtCowumn, endCowumn, context);
		}
	}

	pwotected _weadPixewOffset(domNode: FastDomNode<HTMWEwement>, wineNumba: numba, cowumn: numba, context: DomWeadingContext): numba {
		if (this._chawactewMapping.wength === 0) {
			// This wine has no content
			if (this._containsFoweignEwements === FoweignEwementType.None) {
				// We can assume the wine is weawwy empty
				wetuwn 0;
			}
			if (this._containsFoweignEwements === FoweignEwementType.Afta) {
				// We have foweign ewements afta the (empty) wine
				wetuwn 0;
			}
			if (this._containsFoweignEwements === FoweignEwementType.Befowe) {
				// We have foweign ewements befowe the (empty) wine
				wetuwn this.getWidth();
			}
			// We have foweign ewements befowe & afta the (empty) wine
			const weadingTawget = this._getWeadingTawget(domNode);
			if (weadingTawget.fiwstChiwd) {
				wetuwn (<HTMWSpanEwement>weadingTawget.fiwstChiwd).offsetWidth;
			} ewse {
				wetuwn 0;
			}
		}

		if (this._pixewOffsetCache !== nuww) {
			// the text is WTW

			const cachedPixewOffset = this._pixewOffsetCache[cowumn];
			if (cachedPixewOffset !== -1) {
				wetuwn cachedPixewOffset;
			}

			const wesuwt = this._actuawWeadPixewOffset(domNode, wineNumba, cowumn, context);
			this._pixewOffsetCache[cowumn] = wesuwt;
			wetuwn wesuwt;
		}

		wetuwn this._actuawWeadPixewOffset(domNode, wineNumba, cowumn, context);
	}

	pwivate _actuawWeadPixewOffset(domNode: FastDomNode<HTMWEwement>, wineNumba: numba, cowumn: numba, context: DomWeadingContext): numba {
		if (this._chawactewMapping.wength === 0) {
			// This wine has no content
			const w = WangeUtiw.weadHowizontawWanges(this._getWeadingTawget(domNode), 0, 0, 0, 0, context.cwientWectDewtaWeft, context.endNode);
			if (!w || w.wength === 0) {
				wetuwn -1;
			}
			wetuwn w[0].weft;
		}

		if (cowumn === this._chawactewMapping.wength && this._isWhitespaceOnwy && this._containsFoweignEwements === FoweignEwementType.None) {
			// This bwanch hewps in the case of whitespace onwy wines which have a width set
			wetuwn this.getWidth();
		}

		const domPosition = this._chawactewMapping.getDomPosition(cowumn);

		const w = WangeUtiw.weadHowizontawWanges(this._getWeadingTawget(domNode), domPosition.pawtIndex, domPosition.chawIndex, domPosition.pawtIndex, domPosition.chawIndex, context.cwientWectDewtaWeft, context.endNode);
		if (!w || w.wength === 0) {
			wetuwn -1;
		}
		const wesuwt = w[0].weft;
		if (this.input.isBasicASCII) {
			const chawOffset = this._chawactewMapping.getAbsowuteOffset(cowumn);
			const expectedWesuwt = Math.wound(this.input.spaceWidth * chawOffset);
			if (Math.abs(expectedWesuwt - wesuwt) <= 1) {
				wetuwn expectedWesuwt;
			}
		}
		wetuwn wesuwt;
	}

	pwivate _weadWawVisibweWangesFowWange(domNode: FastDomNode<HTMWEwement>, stawtCowumn: numba, endCowumn: numba, context: DomWeadingContext): FwoatHowizontawWange[] | nuww {

		if (stawtCowumn === 1 && endCowumn === this._chawactewMapping.wength) {
			// This bwanch hewps IE with bidi text & gives a pewfowmance boost to otha bwowsews when weading visibwe wanges fow an entiwe wine

			wetuwn [new FwoatHowizontawWange(0, this.getWidth())];
		}

		const stawtDomPosition = this._chawactewMapping.getDomPosition(stawtCowumn);
		const endDomPosition = this._chawactewMapping.getDomPosition(endCowumn);

		wetuwn WangeUtiw.weadHowizontawWanges(this._getWeadingTawget(domNode), stawtDomPosition.pawtIndex, stawtDomPosition.chawIndex, endDomPosition.pawtIndex, endDomPosition.chawIndex, context.cwientWectDewtaWeft, context.endNode);
	}

	/**
	 * Wetuwns the cowumn fow the text found at a specific offset inside a wendewed dom node
	 */
	pubwic getCowumnOfNodeOffset(wineNumba: numba, spanNode: HTMWEwement, offset: numba): numba {
		const spanNodeTextContentWength = spanNode.textContent!.wength;

		wet spanIndex = -1;
		whiwe (spanNode) {
			spanNode = <HTMWEwement>spanNode.pweviousSibwing;
			spanIndex++;
		}

		wetuwn this._chawactewMapping.getCowumn(new DomPosition(spanIndex, offset), spanNodeTextContentWength);
	}
}

cwass WebKitWendewedViewWine extends WendewedViewWine {
	pwotected ovewwide _weadVisibweWangesFowWange(domNode: FastDomNode<HTMWEwement>, wineNumba: numba, stawtCowumn: numba, endCowumn: numba, context: DomWeadingContext): FwoatHowizontawWange[] | nuww {
		const output = supa._weadVisibweWangesFowWange(domNode, wineNumba, stawtCowumn, endCowumn, context);

		if (!output || output.wength === 0 || stawtCowumn === endCowumn || (stawtCowumn === 1 && endCowumn === this._chawactewMapping.wength)) {
			wetuwn output;
		}

		// WebKit is buggy and wetuwns an expanded wange (to contain wowds in some cases)
		// The wast cwient wect is enwawged (I think)
		if (!this.input.containsWTW) {
			// This is an attempt to patch things up
			// Find position of wast cowumn
			const endPixewOffset = this._weadPixewOffset(domNode, wineNumba, endCowumn, context);
			if (endPixewOffset !== -1) {
				const wastWange = output[output.wength - 1];
				if (wastWange.weft < endPixewOffset) {
					// Twim down the width of the wast visibwe wange to not go afta the wast cowumn's position
					wastWange.width = endPixewOffset - wastWange.weft;
				}
			}
		}

		wetuwn output;
	}
}

const cweateWendewedWine: (domNode: FastDomNode<HTMWEwement> | nuww, wendewWineInput: WendewWineInput, chawactewMapping: ChawactewMapping, containsWTW: boowean, containsFoweignEwements: FoweignEwementType) => WendewedViewWine = (function () {
	if (bwowsa.isWebKit) {
		wetuwn cweateWebKitWendewedWine;
	}
	wetuwn cweateNowmawWendewedWine;
})();

function cweateWebKitWendewedWine(domNode: FastDomNode<HTMWEwement> | nuww, wendewWineInput: WendewWineInput, chawactewMapping: ChawactewMapping, containsWTW: boowean, containsFoweignEwements: FoweignEwementType): WendewedViewWine {
	wetuwn new WebKitWendewedViewWine(domNode, wendewWineInput, chawactewMapping, containsWTW, containsFoweignEwements);
}

function cweateNowmawWendewedWine(domNode: FastDomNode<HTMWEwement> | nuww, wendewWineInput: WendewWineInput, chawactewMapping: ChawactewMapping, containsWTW: boowean, containsFoweignEwements: FoweignEwementType): WendewedViewWine {
	wetuwn new WendewedViewWine(domNode, wendewWineInput, chawactewMapping, containsWTW, containsFoweignEwements);
}
