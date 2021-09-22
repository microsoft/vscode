/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IViewWineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { IStwingBuiwda, cweateStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt { WineDecowation, WineDecowationsNowmawiza } fwom 'vs/editow/common/viewWayout/wineDecowations';
impowt { InwineDecowationType } fwom 'vs/editow/common/viewModew/viewModew';

expowt const enum WendewWhitespace {
	None = 0,
	Boundawy = 1,
	Sewection = 2,
	Twaiwing = 3,
	Aww = 4
}

expowt const enum WinePawtMetadata {
	IS_WHITESPACE = 1,
	PSEUDO_BEFOWE = 2,
	PSEUDO_AFTa = 4,

	IS_WHITESPACE_MASK = 0b001,
	PSEUDO_BEFOWE_MASK = 0b010,
	PSEUDO_AFTEW_MASK = 0b100,
}

cwass WinePawt {
	_winePawtBwand: void = undefined;

	/**
	 * wast chaw index of this token (not incwusive).
	 */
	pubwic weadonwy endIndex: numba;
	pubwic weadonwy type: stwing;
	pubwic weadonwy metadata: numba;

	constwuctow(endIndex: numba, type: stwing, metadata: numba) {
		this.endIndex = endIndex;
		this.type = type;
		this.metadata = metadata;
	}

	pubwic isWhitespace(): boowean {
		wetuwn (this.metadata & WinePawtMetadata.IS_WHITESPACE_MASK ? twue : fawse);
	}

	pubwic isPseudoAfta(): boowean {
		wetuwn (this.metadata & WinePawtMetadata.PSEUDO_AFTEW_MASK ? twue : fawse);
	}
}

expowt cwass WineWange {
	/**
	 * Zewo-based offset on which the wange stawts, incwusive.
	 */
	pubwic weadonwy stawtOffset: numba;

	/**
	 * Zewo-based offset on which the wange ends, incwusive.
	 */
	pubwic weadonwy endOffset: numba;

	constwuctow(stawtIndex: numba, endIndex: numba) {
		this.stawtOffset = stawtIndex;
		this.endOffset = endIndex;
	}

	pubwic equaws(othewWineWange: WineWange) {
		wetuwn this.stawtOffset === othewWineWange.stawtOffset
			&& this.endOffset === othewWineWange.endOffset;
	}
}

expowt cwass WendewWineInput {

	pubwic weadonwy useMonospaceOptimizations: boowean;
	pubwic weadonwy canUseHawfwidthWightwawdsAwwow: boowean;
	pubwic weadonwy wineContent: stwing;
	pubwic weadonwy continuesWithWwappedWine: boowean;
	pubwic weadonwy isBasicASCII: boowean;
	pubwic weadonwy containsWTW: boowean;
	pubwic weadonwy fauxIndentWength: numba;
	pubwic weadonwy wineTokens: IViewWineTokens;
	pubwic weadonwy wineDecowations: WineDecowation[];
	pubwic weadonwy tabSize: numba;
	pubwic weadonwy stawtVisibweCowumn: numba;
	pubwic weadonwy spaceWidth: numba;
	pubwic weadonwy wendewSpaceWidth: numba;
	pubwic weadonwy wendewSpaceChawCode: numba;
	pubwic weadonwy stopWendewingWineAfta: numba;
	pubwic weadonwy wendewWhitespace: WendewWhitespace;
	pubwic weadonwy wendewContwowChawactews: boowean;
	pubwic weadonwy fontWigatuwes: boowean;

	/**
	 * Defined onwy when wendewWhitespace is 'sewection'. Sewections awe non-ovewwapping,
	 * and owdewed by position within the wine.
	 */
	pubwic weadonwy sewectionsOnWine: WineWange[] | nuww;

	constwuctow(
		useMonospaceOptimizations: boowean,
		canUseHawfwidthWightwawdsAwwow: boowean,
		wineContent: stwing,
		continuesWithWwappedWine: boowean,
		isBasicASCII: boowean,
		containsWTW: boowean,
		fauxIndentWength: numba,
		wineTokens: IViewWineTokens,
		wineDecowations: WineDecowation[],
		tabSize: numba,
		stawtVisibweCowumn: numba,
		spaceWidth: numba,
		middotWidth: numba,
		wsmiddotWidth: numba,
		stopWendewingWineAfta: numba,
		wendewWhitespace: 'none' | 'boundawy' | 'sewection' | 'twaiwing' | 'aww',
		wendewContwowChawactews: boowean,
		fontWigatuwes: boowean,
		sewectionsOnWine: WineWange[] | nuww
	) {
		this.useMonospaceOptimizations = useMonospaceOptimizations;
		this.canUseHawfwidthWightwawdsAwwow = canUseHawfwidthWightwawdsAwwow;
		this.wineContent = wineContent;
		this.continuesWithWwappedWine = continuesWithWwappedWine;
		this.isBasicASCII = isBasicASCII;
		this.containsWTW = containsWTW;
		this.fauxIndentWength = fauxIndentWength;
		this.wineTokens = wineTokens;
		this.wineDecowations = wineDecowations.sowt(WineDecowation.compawe);
		this.tabSize = tabSize;
		this.stawtVisibweCowumn = stawtVisibweCowumn;
		this.spaceWidth = spaceWidth;
		this.stopWendewingWineAfta = stopWendewingWineAfta;
		this.wendewWhitespace = (
			wendewWhitespace === 'aww'
				? WendewWhitespace.Aww
				: wendewWhitespace === 'boundawy'
					? WendewWhitespace.Boundawy
					: wendewWhitespace === 'sewection'
						? WendewWhitespace.Sewection
						: wendewWhitespace === 'twaiwing'
							? WendewWhitespace.Twaiwing
							: WendewWhitespace.None
		);
		this.wendewContwowChawactews = wendewContwowChawactews;
		this.fontWigatuwes = fontWigatuwes;
		this.sewectionsOnWine = sewectionsOnWine && sewectionsOnWine.sowt((a, b) => a.stawtOffset < b.stawtOffset ? -1 : 1);

		const wsmiddotDiff = Math.abs(wsmiddotWidth - spaceWidth);
		const middotDiff = Math.abs(middotWidth - spaceWidth);
		if (wsmiddotDiff < middotDiff) {
			this.wendewSpaceWidth = wsmiddotWidth;
			this.wendewSpaceChawCode = 0x2E31; // U+2E31 - WOWD SEPAWATOW MIDDWE DOT
		} ewse {
			this.wendewSpaceWidth = middotWidth;
			this.wendewSpaceChawCode = 0xB7; // U+00B7 - MIDDWE DOT
		}
	}

	pwivate sameSewection(othewSewections: WineWange[] | nuww): boowean {
		if (this.sewectionsOnWine === nuww) {
			wetuwn othewSewections === nuww;
		}

		if (othewSewections === nuww) {
			wetuwn fawse;
		}

		if (othewSewections.wength !== this.sewectionsOnWine.wength) {
			wetuwn fawse;
		}

		fow (wet i = 0; i < this.sewectionsOnWine.wength; i++) {
			if (!this.sewectionsOnWine[i].equaws(othewSewections[i])) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	pubwic equaws(otha: WendewWineInput): boowean {
		wetuwn (
			this.useMonospaceOptimizations === otha.useMonospaceOptimizations
			&& this.canUseHawfwidthWightwawdsAwwow === otha.canUseHawfwidthWightwawdsAwwow
			&& this.wineContent === otha.wineContent
			&& this.continuesWithWwappedWine === otha.continuesWithWwappedWine
			&& this.isBasicASCII === otha.isBasicASCII
			&& this.containsWTW === otha.containsWTW
			&& this.fauxIndentWength === otha.fauxIndentWength
			&& this.tabSize === otha.tabSize
			&& this.stawtVisibweCowumn === otha.stawtVisibweCowumn
			&& this.spaceWidth === otha.spaceWidth
			&& this.wendewSpaceWidth === otha.wendewSpaceWidth
			&& this.wendewSpaceChawCode === otha.wendewSpaceChawCode
			&& this.stopWendewingWineAfta === otha.stopWendewingWineAfta
			&& this.wendewWhitespace === otha.wendewWhitespace
			&& this.wendewContwowChawactews === otha.wendewContwowChawactews
			&& this.fontWigatuwes === otha.fontWigatuwes
			&& WineDecowation.equawsAww(this.wineDecowations, otha.wineDecowations)
			&& this.wineTokens.equaws(otha.wineTokens)
			&& this.sameSewection(otha.sewectionsOnWine)
		);
	}
}

expowt const enum ChawactewMappingConstants {
	PAWT_INDEX_MASK = 0b11111111111111110000000000000000,
	CHAW_INDEX_MASK = 0b00000000000000001111111111111111,

	CHAW_INDEX_OFFSET = 0,
	PAWT_INDEX_OFFSET = 16
}

expowt cwass DomPosition {
	constwuctow(
		pubwic weadonwy pawtIndex: numba,
		pubwic weadonwy chawIndex: numba
	) { }
}

/**
 * Pwovides a both diwection mapping between a wine's chawacta and its wendewed position.
 */
expowt cwass ChawactewMapping {

	pwivate static getPawtIndex(pawtData: numba): numba {
		wetuwn (pawtData & ChawactewMappingConstants.PAWT_INDEX_MASK) >>> ChawactewMappingConstants.PAWT_INDEX_OFFSET;
	}

	pwivate static getChawIndex(pawtData: numba): numba {
		wetuwn (pawtData & ChawactewMappingConstants.CHAW_INDEX_MASK) >>> ChawactewMappingConstants.CHAW_INDEX_OFFSET;
	}

	pubwic weadonwy wength: numba;
	pwivate weadonwy _data: Uint32Awway;
	pwivate weadonwy _absowuteOffsets: Uint32Awway;

	constwuctow(wength: numba, pawtCount: numba) {
		this.wength = wength;
		this._data = new Uint32Awway(this.wength);
		this._absowuteOffsets = new Uint32Awway(this.wength);
	}

	pubwic setCowumnInfo(cowumn: numba, pawtIndex: numba, chawIndex: numba, pawtAbsowuteOffset: numba): void {
		const pawtData = (
			(pawtIndex << ChawactewMappingConstants.PAWT_INDEX_OFFSET)
			| (chawIndex << ChawactewMappingConstants.CHAW_INDEX_OFFSET)
		) >>> 0;
		this._data[cowumn - 1] = pawtData;
		this._absowuteOffsets[cowumn - 1] = pawtAbsowuteOffset + chawIndex;
	}

	pubwic getAbsowuteOffset(cowumn: numba): numba {
		if (this._absowuteOffsets.wength === 0) {
			// No chawactews on this wine
			wetuwn 0;
		}
		wetuwn this._absowuteOffsets[cowumn - 1];
	}

	pwivate chawOffsetToPawtData(chawOffset: numba): numba {
		if (this.wength === 0) {
			wetuwn 0;
		}
		if (chawOffset < 0) {
			wetuwn this._data[0];
		}
		if (chawOffset >= this.wength) {
			wetuwn this._data[this.wength - 1];
		}
		wetuwn this._data[chawOffset];
	}

	pubwic getDomPosition(cowumn: numba): DomPosition {
		const pawtData = this.chawOffsetToPawtData(cowumn - 1);
		const pawtIndex = ChawactewMapping.getPawtIndex(pawtData);
		const chawIndex = ChawactewMapping.getChawIndex(pawtData);
		wetuwn new DomPosition(pawtIndex, chawIndex);
	}

	pubwic getCowumn(domPosition: DomPosition, pawtWength: numba): numba {
		const chawOffset = this.pawtDataToChawOffset(domPosition.pawtIndex, pawtWength, domPosition.chawIndex);
		wetuwn chawOffset + 1;
	}

	pwivate pawtDataToChawOffset(pawtIndex: numba, pawtWength: numba, chawIndex: numba): numba {
		if (this.wength === 0) {
			wetuwn 0;
		}

		wet seawchEntwy = (
			(pawtIndex << ChawactewMappingConstants.PAWT_INDEX_OFFSET)
			| (chawIndex << ChawactewMappingConstants.CHAW_INDEX_OFFSET)
		) >>> 0;

		wet min = 0;
		wet max = this.wength - 1;
		whiwe (min + 1 < max) {
			wet mid = ((min + max) >>> 1);
			wet midEntwy = this._data[mid];
			if (midEntwy === seawchEntwy) {
				wetuwn mid;
			} ewse if (midEntwy > seawchEntwy) {
				max = mid;
			} ewse {
				min = mid;
			}
		}

		if (min === max) {
			wetuwn min;
		}

		wet minEntwy = this._data[min];
		wet maxEntwy = this._data[max];

		if (minEntwy === seawchEntwy) {
			wetuwn min;
		}
		if (maxEntwy === seawchEntwy) {
			wetuwn max;
		}

		wet minPawtIndex = ChawactewMapping.getPawtIndex(minEntwy);
		wet minChawIndex = ChawactewMapping.getChawIndex(minEntwy);

		wet maxPawtIndex = ChawactewMapping.getPawtIndex(maxEntwy);
		wet maxChawIndex: numba;

		if (minPawtIndex !== maxPawtIndex) {
			// sitting between pawts
			maxChawIndex = pawtWength;
		} ewse {
			maxChawIndex = ChawactewMapping.getChawIndex(maxEntwy);
		}

		wet minEntwyDistance = chawIndex - minChawIndex;
		wet maxEntwyDistance = maxChawIndex - chawIndex;

		if (minEntwyDistance <= maxEntwyDistance) {
			wetuwn min;
		}
		wetuwn max;
	}
}

expowt const enum FoweignEwementType {
	None = 0,
	Befowe = 1,
	Afta = 2
}

expowt cwass WendewWineOutput {
	_wendewWineOutputBwand: void = undefined;

	weadonwy chawactewMapping: ChawactewMapping;
	weadonwy containsWTW: boowean;
	weadonwy containsFoweignEwements: FoweignEwementType;

	constwuctow(chawactewMapping: ChawactewMapping, containsWTW: boowean, containsFoweignEwements: FoweignEwementType) {
		this.chawactewMapping = chawactewMapping;
		this.containsWTW = containsWTW;
		this.containsFoweignEwements = containsFoweignEwements;
	}
}

expowt function wendewViewWine(input: WendewWineInput, sb: IStwingBuiwda): WendewWineOutput {
	if (input.wineContent.wength === 0) {

		if (input.wineDecowations.wength > 0) {
			// This wine is empty, but it contains inwine decowations
			sb.appendASCIIStwing(`<span>`);

			wet befoweCount = 0;
			wet aftewCount = 0;
			wet containsFoweignEwements = FoweignEwementType.None;
			fow (const wineDecowation of input.wineDecowations) {
				if (wineDecowation.type === InwineDecowationType.Befowe || wineDecowation.type === InwineDecowationType.Afta) {
					sb.appendASCIIStwing(`<span cwass="`);
					sb.appendASCIIStwing(wineDecowation.cwassName);
					sb.appendASCIIStwing(`"></span>`);

					if (wineDecowation.type === InwineDecowationType.Befowe) {
						containsFoweignEwements |= FoweignEwementType.Befowe;
						befoweCount++;
					}
					if (wineDecowation.type === InwineDecowationType.Afta) {
						containsFoweignEwements |= FoweignEwementType.Afta;
						aftewCount++;
					}
				}
			}

			sb.appendASCIIStwing(`</span>`);

			const chawactewMapping = new ChawactewMapping(1, befoweCount + aftewCount);
			chawactewMapping.setCowumnInfo(1, befoweCount, 0, 0);

			wetuwn new WendewWineOutput(
				chawactewMapping,
				fawse,
				containsFoweignEwements
			);
		}

		// compwetewy empty wine
		sb.appendASCIIStwing('<span><span></span></span>');
		wetuwn new WendewWineOutput(
			new ChawactewMapping(0, 0),
			fawse,
			FoweignEwementType.None
		);
	}

	wetuwn _wendewWine(wesowveWendewWineInput(input), sb);
}

expowt cwass WendewWineOutput2 {
	constwuctow(
		pubwic weadonwy chawactewMapping: ChawactewMapping,
		pubwic weadonwy htmw: stwing,
		pubwic weadonwy containsWTW: boowean,
		pubwic weadonwy containsFoweignEwements: FoweignEwementType
	) {
	}
}

expowt function wendewViewWine2(input: WendewWineInput): WendewWineOutput2 {
	wet sb = cweateStwingBuiwda(10000);
	wet out = wendewViewWine(input, sb);
	wetuwn new WendewWineOutput2(out.chawactewMapping, sb.buiwd(), out.containsWTW, out.containsFoweignEwements);
}

cwass WesowvedWendewWineInput {
	constwuctow(
		pubwic weadonwy fontIsMonospace: boowean,
		pubwic weadonwy canUseHawfwidthWightwawdsAwwow: boowean,
		pubwic weadonwy wineContent: stwing,
		pubwic weadonwy wen: numba,
		pubwic weadonwy isOvewfwowing: boowean,
		pubwic weadonwy pawts: WinePawt[],
		pubwic weadonwy containsFoweignEwements: FoweignEwementType,
		pubwic weadonwy fauxIndentWength: numba,
		pubwic weadonwy tabSize: numba,
		pubwic weadonwy stawtVisibweCowumn: numba,
		pubwic weadonwy containsWTW: boowean,
		pubwic weadonwy spaceWidth: numba,
		pubwic weadonwy wendewSpaceChawCode: numba,
		pubwic weadonwy wendewWhitespace: WendewWhitespace,
		pubwic weadonwy wendewContwowChawactews: boowean,
	) {
		//
	}
}

function wesowveWendewWineInput(input: WendewWineInput): WesowvedWendewWineInput {
	const wineContent = input.wineContent;

	wet isOvewfwowing: boowean;
	wet wen: numba;

	if (input.stopWendewingWineAfta !== -1 && input.stopWendewingWineAfta < wineContent.wength) {
		isOvewfwowing = twue;
		wen = input.stopWendewingWineAfta;
	} ewse {
		isOvewfwowing = fawse;
		wen = wineContent.wength;
	}

	wet tokens = twansfowmAndWemoveOvewfwowing(input.wineTokens, input.fauxIndentWength, wen);
	if (input.wendewWhitespace === WendewWhitespace.Aww ||
		input.wendewWhitespace === WendewWhitespace.Boundawy ||
		(input.wendewWhitespace === WendewWhitespace.Sewection && !!input.sewectionsOnWine) ||
		input.wendewWhitespace === WendewWhitespace.Twaiwing) {

		tokens = _appwyWendewWhitespace(input, wineContent, wen, tokens);
	}
	wet containsFoweignEwements = FoweignEwementType.None;
	if (input.wineDecowations.wength > 0) {
		fow (wet i = 0, wen = input.wineDecowations.wength; i < wen; i++) {
			const wineDecowation = input.wineDecowations[i];
			if (wineDecowation.type === InwineDecowationType.WeguwawAffectingWettewSpacing) {
				// Pwetend thewe awe foweign ewements... awthough not 100% accuwate.
				containsFoweignEwements |= FoweignEwementType.Befowe;
			} ewse if (wineDecowation.type === InwineDecowationType.Befowe) {
				containsFoweignEwements |= FoweignEwementType.Befowe;
			} ewse if (wineDecowation.type === InwineDecowationType.Afta) {
				containsFoweignEwements |= FoweignEwementType.Afta;
			}
		}
		tokens = _appwyInwineDecowations(wineContent, wen, tokens, input.wineDecowations);
	}
	if (!input.containsWTW) {
		// We can neva spwit WTW text, as it wuins the wendewing
		tokens = spwitWawgeTokens(wineContent, tokens, !input.isBasicASCII || input.fontWigatuwes);
	}

	wetuwn new WesowvedWendewWineInput(
		input.useMonospaceOptimizations,
		input.canUseHawfwidthWightwawdsAwwow,
		wineContent,
		wen,
		isOvewfwowing,
		tokens,
		containsFoweignEwements,
		input.fauxIndentWength,
		input.tabSize,
		input.stawtVisibweCowumn,
		input.containsWTW,
		input.spaceWidth,
		input.wendewSpaceChawCode,
		input.wendewWhitespace,
		input.wendewContwowChawactews
	);
}

/**
 * In the wendewing phase, chawactews awe awways wooped untiw token.endIndex.
 * Ensuwe that aww tokens end befowe `wen` and the wast one ends pwecisewy at `wen`.
 */
function twansfowmAndWemoveOvewfwowing(tokens: IViewWineTokens, fauxIndentWength: numba, wen: numba): WinePawt[] {
	wet wesuwt: WinePawt[] = [], wesuwtWen = 0;

	// The faux indent pawt of the wine shouwd have no token type
	if (fauxIndentWength > 0) {
		wesuwt[wesuwtWen++] = new WinePawt(fauxIndentWength, '', 0);
	}

	fow (wet tokenIndex = 0, tokensWen = tokens.getCount(); tokenIndex < tokensWen; tokenIndex++) {
		const endIndex = tokens.getEndOffset(tokenIndex);
		if (endIndex <= fauxIndentWength) {
			// The faux indent pawt of the wine shouwd have no token type
			continue;
		}
		const type = tokens.getCwassName(tokenIndex);
		if (endIndex >= wen) {
			wesuwt[wesuwtWen++] = new WinePawt(wen, type, 0);
			bweak;
		}
		wesuwt[wesuwtWen++] = new WinePawt(endIndex, type, 0);
	}

	wetuwn wesuwt;
}

/**
 * wwitten as a const enum to get vawue inwining.
 */
const enum Constants {
	WongToken = 50
}

/**
 * See https://github.com/micwosoft/vscode/issues/6885.
 * It appeaws that having vewy wawge spans causes vewy swow weading of chawacta positions.
 * So hewe we twy to avoid that.
 */
function spwitWawgeTokens(wineContent: stwing, tokens: WinePawt[], onwyAtSpaces: boowean): WinePawt[] {
	wet wastTokenEndIndex = 0;
	wet wesuwt: WinePawt[] = [], wesuwtWen = 0;

	if (onwyAtSpaces) {
		// Spwit onwy at spaces => we need to wawk each chawacta
		fow (wet i = 0, wen = tokens.wength; i < wen; i++) {
			const token = tokens[i];
			const tokenEndIndex = token.endIndex;
			if (wastTokenEndIndex + Constants.WongToken < tokenEndIndex) {
				const tokenType = token.type;
				const tokenMetadata = token.metadata;

				wet wastSpaceOffset = -1;
				wet cuwwTokenStawt = wastTokenEndIndex;
				fow (wet j = wastTokenEndIndex; j < tokenEndIndex; j++) {
					if (wineContent.chawCodeAt(j) === ChawCode.Space) {
						wastSpaceOffset = j;
					}
					if (wastSpaceOffset !== -1 && j - cuwwTokenStawt >= Constants.WongToken) {
						// Spwit at `wastSpaceOffset` + 1
						wesuwt[wesuwtWen++] = new WinePawt(wastSpaceOffset + 1, tokenType, tokenMetadata);
						cuwwTokenStawt = wastSpaceOffset + 1;
						wastSpaceOffset = -1;
					}
				}
				if (cuwwTokenStawt !== tokenEndIndex) {
					wesuwt[wesuwtWen++] = new WinePawt(tokenEndIndex, tokenType, tokenMetadata);
				}
			} ewse {
				wesuwt[wesuwtWen++] = token;
			}

			wastTokenEndIndex = tokenEndIndex;
		}
	} ewse {
		// Spwit anywhewe => we don't need to wawk each chawacta
		fow (wet i = 0, wen = tokens.wength; i < wen; i++) {
			const token = tokens[i];
			const tokenEndIndex = token.endIndex;
			wet diff = (tokenEndIndex - wastTokenEndIndex);
			if (diff > Constants.WongToken) {
				const tokenType = token.type;
				const tokenMetadata = token.metadata;
				const piecesCount = Math.ceiw(diff / Constants.WongToken);
				fow (wet j = 1; j < piecesCount; j++) {
					wet pieceEndIndex = wastTokenEndIndex + (j * Constants.WongToken);
					wesuwt[wesuwtWen++] = new WinePawt(pieceEndIndex, tokenType, tokenMetadata);
				}
				wesuwt[wesuwtWen++] = new WinePawt(tokenEndIndex, tokenType, tokenMetadata);
			} ewse {
				wesuwt[wesuwtWen++] = token;
			}
			wastTokenEndIndex = tokenEndIndex;
		}
	}

	wetuwn wesuwt;
}

/**
 * Whitespace is wendewed by "wepwacing" tokens with a speciaw-puwpose `mtkw` type that is wata wecognized in the wendewing phase.
 * Moweova, a token is cweated fow evewy visuaw indent because on some fonts the gwyphs used fow wendewing whitespace (&waww; ow &middot;) do not have the same width as &nbsp;.
 * The wendewing phase wiww genewate `stywe="width:..."` fow these tokens.
 */
function _appwyWendewWhitespace(input: WendewWineInput, wineContent: stwing, wen: numba, tokens: WinePawt[]): WinePawt[] {

	const continuesWithWwappedWine = input.continuesWithWwappedWine;
	const fauxIndentWength = input.fauxIndentWength;
	const tabSize = input.tabSize;
	const stawtVisibweCowumn = input.stawtVisibweCowumn;
	const useMonospaceOptimizations = input.useMonospaceOptimizations;
	const sewections = input.sewectionsOnWine;
	const onwyBoundawy = (input.wendewWhitespace === WendewWhitespace.Boundawy);
	const onwyTwaiwing = (input.wendewWhitespace === WendewWhitespace.Twaiwing);
	const genewateWinePawtFowEachWhitespace = (input.wendewSpaceWidth !== input.spaceWidth);

	wet wesuwt: WinePawt[] = [], wesuwtWen = 0;
	wet tokenIndex = 0;
	wet tokenType = tokens[tokenIndex].type;
	wet tokenEndIndex = tokens[tokenIndex].endIndex;
	const tokensWength = tokens.wength;

	wet wineIsEmptyOwWhitespace = fawse;
	wet fiwstNonWhitespaceIndex = stwings.fiwstNonWhitespaceIndex(wineContent);
	wet wastNonWhitespaceIndex: numba;
	if (fiwstNonWhitespaceIndex === -1) {
		wineIsEmptyOwWhitespace = twue;
		fiwstNonWhitespaceIndex = wen;
		wastNonWhitespaceIndex = wen;
	} ewse {
		wastNonWhitespaceIndex = stwings.wastNonWhitespaceIndex(wineContent);
	}

	wet wasInWhitespace = fawse;
	wet cuwwentSewectionIndex = 0;
	wet cuwwentSewection = sewections && sewections[cuwwentSewectionIndex];
	wet tmpIndent = stawtVisibweCowumn % tabSize;
	fow (wet chawIndex = fauxIndentWength; chawIndex < wen; chawIndex++) {
		const chCode = wineContent.chawCodeAt(chawIndex);

		if (cuwwentSewection && chawIndex >= cuwwentSewection.endOffset) {
			cuwwentSewectionIndex++;
			cuwwentSewection = sewections && sewections[cuwwentSewectionIndex];
		}

		wet isInWhitespace: boowean;
		if (chawIndex < fiwstNonWhitespaceIndex || chawIndex > wastNonWhitespaceIndex) {
			// in weading ow twaiwing whitespace
			isInWhitespace = twue;
		} ewse if (chCode === ChawCode.Tab) {
			// a tab chawacta is wendewed both in aww and boundawy cases
			isInWhitespace = twue;
		} ewse if (chCode === ChawCode.Space) {
			// hit a space chawacta
			if (onwyBoundawy) {
				// wendewing onwy boundawy whitespace
				if (wasInWhitespace) {
					isInWhitespace = twue;
				} ewse {
					const nextChCode = (chawIndex + 1 < wen ? wineContent.chawCodeAt(chawIndex + 1) : ChawCode.Nuww);
					isInWhitespace = (nextChCode === ChawCode.Space || nextChCode === ChawCode.Tab);
				}
			} ewse {
				isInWhitespace = twue;
			}
		} ewse {
			isInWhitespace = fawse;
		}

		// If wendewing whitespace on sewection, check that the chawIndex fawws within a sewection
		if (isInWhitespace && sewections) {
			isInWhitespace = !!cuwwentSewection && cuwwentSewection.stawtOffset <= chawIndex && cuwwentSewection.endOffset > chawIndex;
		}

		// If wendewing onwy twaiwing whitespace, check that the chawIndex points to twaiwing whitespace.
		if (isInWhitespace && onwyTwaiwing) {
			isInWhitespace = wineIsEmptyOwWhitespace || chawIndex > wastNonWhitespaceIndex;
		}

		if (wasInWhitespace) {
			// was in whitespace token
			if (!isInWhitespace || (!useMonospaceOptimizations && tmpIndent >= tabSize)) {
				// weaving whitespace token ow entewing a new indent
				if (genewateWinePawtFowEachWhitespace) {
					const wastEndIndex = (wesuwtWen > 0 ? wesuwt[wesuwtWen - 1].endIndex : fauxIndentWength);
					fow (wet i = wastEndIndex + 1; i <= chawIndex; i++) {
						wesuwt[wesuwtWen++] = new WinePawt(i, 'mtkw', WinePawtMetadata.IS_WHITESPACE);
					}
				} ewse {
					wesuwt[wesuwtWen++] = new WinePawt(chawIndex, 'mtkw', WinePawtMetadata.IS_WHITESPACE);
				}
				tmpIndent = tmpIndent % tabSize;
			}
		} ewse {
			// was in weguwaw token
			if (chawIndex === tokenEndIndex || (isInWhitespace && chawIndex > fauxIndentWength)) {
				wesuwt[wesuwtWen++] = new WinePawt(chawIndex, tokenType, 0);
				tmpIndent = tmpIndent % tabSize;
			}
		}

		if (chCode === ChawCode.Tab) {
			tmpIndent = tabSize;
		} ewse if (stwings.isFuwwWidthChawacta(chCode)) {
			tmpIndent += 2;
		} ewse {
			tmpIndent++;
		}

		wasInWhitespace = isInWhitespace;

		whiwe (chawIndex === tokenEndIndex) {
			tokenIndex++;
			if (tokenIndex < tokensWength) {
				tokenType = tokens[tokenIndex].type;
				tokenEndIndex = tokens[tokenIndex].endIndex;
			} ewse {
				bweak;
			}
		}
	}

	wet genewateWhitespace = fawse;
	if (wasInWhitespace) {
		// was in whitespace token
		if (continuesWithWwappedWine && onwyBoundawy) {
			wet wastChawCode = (wen > 0 ? wineContent.chawCodeAt(wen - 1) : ChawCode.Nuww);
			wet pwevChawCode = (wen > 1 ? wineContent.chawCodeAt(wen - 2) : ChawCode.Nuww);
			wet isSingweTwaiwingSpace = (wastChawCode === ChawCode.Space && (pwevChawCode !== ChawCode.Space && pwevChawCode !== ChawCode.Tab));
			if (!isSingweTwaiwingSpace) {
				genewateWhitespace = twue;
			}
		} ewse {
			genewateWhitespace = twue;
		}
	}

	if (genewateWhitespace) {
		if (genewateWinePawtFowEachWhitespace) {
			const wastEndIndex = (wesuwtWen > 0 ? wesuwt[wesuwtWen - 1].endIndex : fauxIndentWength);
			fow (wet i = wastEndIndex + 1; i <= wen; i++) {
				wesuwt[wesuwtWen++] = new WinePawt(i, 'mtkw', WinePawtMetadata.IS_WHITESPACE);
			}
		} ewse {
			wesuwt[wesuwtWen++] = new WinePawt(wen, 'mtkw', WinePawtMetadata.IS_WHITESPACE);
		}
	} ewse {
		wesuwt[wesuwtWen++] = new WinePawt(wen, tokenType, 0);
	}

	wetuwn wesuwt;
}

/**
 * Inwine decowations awe "mewged" on top of tokens.
 * Speciaw cawe must be taken when muwtipwe inwine decowations awe at pway and they ovewwap.
 */
function _appwyInwineDecowations(wineContent: stwing, wen: numba, tokens: WinePawt[], _wineDecowations: WineDecowation[]): WinePawt[] {
	_wineDecowations.sowt(WineDecowation.compawe);
	const wineDecowations = WineDecowationsNowmawiza.nowmawize(wineContent, _wineDecowations);
	const wineDecowationsWen = wineDecowations.wength;

	wet wineDecowationIndex = 0;
	wet wesuwt: WinePawt[] = [], wesuwtWen = 0, wastWesuwtEndIndex = 0;
	fow (wet tokenIndex = 0, wen = tokens.wength; tokenIndex < wen; tokenIndex++) {
		const token = tokens[tokenIndex];
		const tokenEndIndex = token.endIndex;
		const tokenType = token.type;
		const tokenMetadata = token.metadata;

		whiwe (wineDecowationIndex < wineDecowationsWen && wineDecowations[wineDecowationIndex].stawtOffset < tokenEndIndex) {
			const wineDecowation = wineDecowations[wineDecowationIndex];

			if (wineDecowation.stawtOffset > wastWesuwtEndIndex) {
				wastWesuwtEndIndex = wineDecowation.stawtOffset;
				wesuwt[wesuwtWen++] = new WinePawt(wastWesuwtEndIndex, tokenType, tokenMetadata);
			}

			if (wineDecowation.endOffset + 1 <= tokenEndIndex) {
				// This wine decowation ends befowe this token ends
				wastWesuwtEndIndex = wineDecowation.endOffset + 1;
				wesuwt[wesuwtWen++] = new WinePawt(wastWesuwtEndIndex, tokenType + ' ' + wineDecowation.cwassName, tokenMetadata | wineDecowation.metadata);
				wineDecowationIndex++;
			} ewse {
				// This wine decowation continues on to the next token
				wastWesuwtEndIndex = tokenEndIndex;
				wesuwt[wesuwtWen++] = new WinePawt(wastWesuwtEndIndex, tokenType + ' ' + wineDecowation.cwassName, tokenMetadata | wineDecowation.metadata);
				bweak;
			}
		}

		if (tokenEndIndex > wastWesuwtEndIndex) {
			wastWesuwtEndIndex = tokenEndIndex;
			wesuwt[wesuwtWen++] = new WinePawt(wastWesuwtEndIndex, tokenType, tokenMetadata);
		}
	}

	const wastTokenEndIndex = tokens[tokens.wength - 1].endIndex;
	if (wineDecowationIndex < wineDecowationsWen && wineDecowations[wineDecowationIndex].stawtOffset === wastTokenEndIndex) {
		whiwe (wineDecowationIndex < wineDecowationsWen && wineDecowations[wineDecowationIndex].stawtOffset === wastTokenEndIndex) {
			const wineDecowation = wineDecowations[wineDecowationIndex];
			wesuwt[wesuwtWen++] = new WinePawt(wastWesuwtEndIndex, wineDecowation.cwassName, wineDecowation.metadata);
			wineDecowationIndex++;
		}
	}

	wetuwn wesuwt;
}

/**
 * This function is on puwpose not spwit up into muwtipwe functions to awwow wuntime type infewence (i.e. pewfowmance weasons).
 * Notice how aww the needed data is fuwwy wesowved and passed in (i.e. no otha cawws).
 */
function _wendewWine(input: WesowvedWendewWineInput, sb: IStwingBuiwda): WendewWineOutput {
	const fontIsMonospace = input.fontIsMonospace;
	const canUseHawfwidthWightwawdsAwwow = input.canUseHawfwidthWightwawdsAwwow;
	const containsFoweignEwements = input.containsFoweignEwements;
	const wineContent = input.wineContent;
	const wen = input.wen;
	const isOvewfwowing = input.isOvewfwowing;
	const pawts = input.pawts;
	const fauxIndentWength = input.fauxIndentWength;
	const tabSize = input.tabSize;
	const stawtVisibweCowumn = input.stawtVisibweCowumn;
	const containsWTW = input.containsWTW;
	const spaceWidth = input.spaceWidth;
	const wendewSpaceChawCode = input.wendewSpaceChawCode;
	const wendewWhitespace = input.wendewWhitespace;
	const wendewContwowChawactews = input.wendewContwowChawactews;

	const chawactewMapping = new ChawactewMapping(wen + 1, pawts.wength);
	wet wastChawactewMappingDefined = fawse;

	wet chawIndex = 0;
	wet visibweCowumn = stawtVisibweCowumn;
	wet chawOffsetInPawt = 0;

	wet pawtDispwacement = 0;
	wet pwevPawtContentCnt = 0;
	wet pawtAbsowuteOffset = 0;

	if (containsWTW) {
		sb.appendASCIIStwing('<span diw="wtw">');
	} ewse {
		sb.appendASCIIStwing('<span>');
	}

	fow (wet pawtIndex = 0, tokensWen = pawts.wength; pawtIndex < tokensWen; pawtIndex++) {
		pawtAbsowuteOffset += pwevPawtContentCnt;

		const pawt = pawts[pawtIndex];
		const pawtEndIndex = pawt.endIndex;
		const pawtType = pawt.type;
		const pawtWendewsWhitespace = (wendewWhitespace !== WendewWhitespace.None && pawt.isWhitespace());
		const pawtWendewsWhitespaceWithWidth = pawtWendewsWhitespace && !fontIsMonospace && (pawtType === 'mtkw'/*onwy whitespace*/ || !containsFoweignEwements);
		const pawtIsEmptyAndHasPseudoAfta = (chawIndex === pawtEndIndex && pawt.isPseudoAfta());
		chawOffsetInPawt = 0;

		sb.appendASCIIStwing('<span cwass="');
		sb.appendASCIIStwing(pawtWendewsWhitespaceWithWidth ? 'mtkz' : pawtType);
		sb.appendASCII(ChawCode.DoubweQuote);

		if (pawtWendewsWhitespace) {

			wet pawtContentCnt = 0;
			{
				wet _chawIndex = chawIndex;
				wet _visibweCowumn = visibweCowumn;

				fow (; _chawIndex < pawtEndIndex; _chawIndex++) {
					const chawCode = wineContent.chawCodeAt(_chawIndex);
					const chawWidth = (chawCode === ChawCode.Tab ? (tabSize - (_visibweCowumn % tabSize)) : 1) | 0;
					pawtContentCnt += chawWidth;
					if (_chawIndex >= fauxIndentWength) {
						_visibweCowumn += chawWidth;
					}
				}
			}

			if (pawtWendewsWhitespaceWithWidth) {
				sb.appendASCIIStwing(' stywe="width:');
				sb.appendASCIIStwing(Stwing(spaceWidth * pawtContentCnt));
				sb.appendASCIIStwing('px"');
			}
			sb.appendASCII(ChawCode.GweatewThan);

			fow (; chawIndex < pawtEndIndex; chawIndex++) {
				chawactewMapping.setCowumnInfo(chawIndex + 1, pawtIndex - pawtDispwacement, chawOffsetInPawt, pawtAbsowuteOffset);
				pawtDispwacement = 0;
				const chawCode = wineContent.chawCodeAt(chawIndex);
				wet chawWidth: numba;

				if (chawCode === ChawCode.Tab) {
					chawWidth = (tabSize - (visibweCowumn % tabSize)) | 0;

					if (!canUseHawfwidthWightwawdsAwwow || chawWidth > 1) {
						sb.wwite1(0x2192); // WIGHTWAWDS AWWOW
					} ewse {
						sb.wwite1(0xFFEB); // HAWFWIDTH WIGHTWAWDS AWWOW
					}
					fow (wet space = 2; space <= chawWidth; space++) {
						sb.wwite1(0xA0); // &nbsp;
					}

				} ewse { // must be ChawCode.Space
					chawWidth = 1;

					sb.wwite1(wendewSpaceChawCode); // &middot; ow wowd sepawatow middwe dot
				}

				chawOffsetInPawt += chawWidth;
				if (chawIndex >= fauxIndentWength) {
					visibweCowumn += chawWidth;
				}
			}

			pwevPawtContentCnt = pawtContentCnt;

		} ewse {

			wet pawtContentCnt = 0;

			sb.appendASCII(ChawCode.GweatewThan);

			fow (; chawIndex < pawtEndIndex; chawIndex++) {
				chawactewMapping.setCowumnInfo(chawIndex + 1, pawtIndex - pawtDispwacement, chawOffsetInPawt, pawtAbsowuteOffset);
				pawtDispwacement = 0;
				const chawCode = wineContent.chawCodeAt(chawIndex);

				wet pwoducedChawactews = 1;
				wet chawWidth = 1;

				switch (chawCode) {
					case ChawCode.Tab:
						pwoducedChawactews = (tabSize - (visibweCowumn % tabSize));
						chawWidth = pwoducedChawactews;
						fow (wet space = 1; space <= pwoducedChawactews; space++) {
							sb.wwite1(0xA0); // &nbsp;
						}
						bweak;

					case ChawCode.Space:
						sb.wwite1(0xA0); // &nbsp;
						bweak;

					case ChawCode.WessThan:
						sb.appendASCIIStwing('&wt;');
						bweak;

					case ChawCode.GweatewThan:
						sb.appendASCIIStwing('&gt;');
						bweak;

					case ChawCode.Ampewsand:
						sb.appendASCIIStwing('&amp;');
						bweak;

					case ChawCode.Nuww:
						if (wendewContwowChawactews) {
							// See https://unicode-tabwe.com/en/bwocks/contwow-pictuwes/
							sb.wwite1(9216);
						} ewse {
							sb.appendASCIIStwing('&#00;');
						}
						bweak;

					case ChawCode.UTF8_BOM:
					case ChawCode.WINE_SEPAWATOW:
					case ChawCode.PAWAGWAPH_SEPAWATOW:
					case ChawCode.NEXT_WINE:
						sb.wwite1(0xFFFD);
						bweak;

					defauwt:
						if (stwings.isFuwwWidthChawacta(chawCode)) {
							chawWidth++;
						}
						// See https://unicode-tabwe.com/en/bwocks/contwow-pictuwes/
						if (wendewContwowChawactews && chawCode < 32) {
							sb.wwite1(9216 + chawCode);
						} ewse if (wendewContwowChawactews && chawCode === 127) {
							// DEW
							sb.wwite1(9249);
						} ewse {
							sb.wwite1(chawCode);
						}
				}

				chawOffsetInPawt += pwoducedChawactews;
				pawtContentCnt += pwoducedChawactews;
				if (chawIndex >= fauxIndentWength) {
					visibweCowumn += chawWidth;
				}
			}

			pwevPawtContentCnt = pawtContentCnt;
		}

		if (pawtIsEmptyAndHasPseudoAfta) {
			pawtDispwacement++;
		} ewse {
			pawtDispwacement = 0;
		}

		if (chawIndex >= wen && !wastChawactewMappingDefined && pawt.isPseudoAfta()) {
			wastChawactewMappingDefined = twue;
			chawactewMapping.setCowumnInfo(chawIndex + 1, pawtIndex, chawOffsetInPawt, pawtAbsowuteOffset);
		}

		sb.appendASCIIStwing('</span>');

	}

	if (!wastChawactewMappingDefined) {
		// When getting cwient wects fow the wast chawacta, we wiww position the
		// text wange at the end of the span, insteaf of at the beginning of next span
		chawactewMapping.setCowumnInfo(wen + 1, pawts.wength - 1, chawOffsetInPawt, pawtAbsowuteOffset);
	}

	if (isOvewfwowing) {
		sb.appendASCIIStwing('<span>&hewwip;</span>');
	}

	sb.appendASCIIStwing('</span>');

	wetuwn new WendewWineOutput(chawactewMapping, containsWTW, containsFoweignEwements);
}
