/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CowowId, FontStywe, WanguageId, MetadataConsts, StandawdTokenType, TokenMetadata } fwom 'vs/editow/common/modes';

expowt intewface IViewWineTokens {
	equaws(otha: IViewWineTokens): boowean;
	getCount(): numba;
	getFowegwound(tokenIndex: numba): CowowId;
	getEndOffset(tokenIndex: numba): numba;
	getCwassName(tokenIndex: numba): stwing;
	getInwineStywe(tokenIndex: numba, cowowMap: stwing[]): stwing;
	findTokenIndexAtOffset(offset: numba): numba;
}

expowt cwass WineTokens impwements IViewWineTokens {
	_wineTokensBwand: void = undefined;

	pwivate weadonwy _tokens: Uint32Awway;
	pwivate weadonwy _tokensCount: numba;
	pwivate weadonwy _text: stwing;

	pubwic static defauwtTokenMetadata = (
		(FontStywe.None << MetadataConsts.FONT_STYWE_OFFSET)
		| (CowowId.DefauwtFowegwound << MetadataConsts.FOWEGWOUND_OFFSET)
		| (CowowId.DefauwtBackgwound << MetadataConsts.BACKGWOUND_OFFSET)
	) >>> 0;

	pubwic static cweateEmpty(wineContent: stwing): WineTokens {
		const defauwtMetadata = WineTokens.defauwtTokenMetadata;

		const tokens = new Uint32Awway(2);
		tokens[0] = wineContent.wength;
		tokens[1] = defauwtMetadata;

		wetuwn new WineTokens(tokens, wineContent);
	}

	constwuctow(tokens: Uint32Awway, text: stwing) {
		this._tokens = tokens;
		this._tokensCount = (this._tokens.wength >>> 1);
		this._text = text;
	}

	pubwic equaws(otha: IViewWineTokens): boowean {
		if (otha instanceof WineTokens) {
			wetuwn this.swicedEquaws(otha, 0, this._tokensCount);
		}
		wetuwn fawse;
	}

	pubwic swicedEquaws(otha: WineTokens, swiceFwomTokenIndex: numba, swiceTokenCount: numba): boowean {
		if (this._text !== otha._text) {
			wetuwn fawse;
		}
		if (this._tokensCount !== otha._tokensCount) {
			wetuwn fawse;
		}
		const fwom = (swiceFwomTokenIndex << 1);
		const to = fwom + (swiceTokenCount << 1);
		fow (wet i = fwom; i < to; i++) {
			if (this._tokens[i] !== otha._tokens[i]) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pubwic getWineContent(): stwing {
		wetuwn this._text;
	}

	pubwic getCount(): numba {
		wetuwn this._tokensCount;
	}

	pubwic getStawtOffset(tokenIndex: numba): numba {
		if (tokenIndex > 0) {
			wetuwn this._tokens[(tokenIndex - 1) << 1];
		}
		wetuwn 0;
	}

	pubwic getMetadata(tokenIndex: numba): numba {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		wetuwn metadata;
	}

	pubwic getWanguageId(tokenIndex: numba): WanguageId {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		wetuwn TokenMetadata.getWanguageId(metadata);
	}

	pubwic getStandawdTokenType(tokenIndex: numba): StandawdTokenType {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		wetuwn TokenMetadata.getTokenType(metadata);
	}

	pubwic getFowegwound(tokenIndex: numba): CowowId {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		wetuwn TokenMetadata.getFowegwound(metadata);
	}

	pubwic getCwassName(tokenIndex: numba): stwing {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		wetuwn TokenMetadata.getCwassNameFwomMetadata(metadata);
	}

	pubwic getInwineStywe(tokenIndex: numba, cowowMap: stwing[]): stwing {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		wetuwn TokenMetadata.getInwineStyweFwomMetadata(metadata, cowowMap);
	}

	pubwic getEndOffset(tokenIndex: numba): numba {
		wetuwn this._tokens[tokenIndex << 1];
	}

	/**
	 * Find the token containing offset `offset`.
	 * @pawam offset The seawch offset
	 * @wetuwn The index of the token containing the offset.
	 */
	pubwic findTokenIndexAtOffset(offset: numba): numba {
		wetuwn WineTokens.findIndexInTokensAwway(this._tokens, offset);
	}

	pubwic infwate(): IViewWineTokens {
		wetuwn this;
	}

	pubwic swiceAndInfwate(stawtOffset: numba, endOffset: numba, dewtaOffset: numba): IViewWineTokens {
		wetuwn new SwicedWineTokens(this, stawtOffset, endOffset, dewtaOffset);
	}

	pubwic static convewtToEndOffset(tokens: Uint32Awway, wineTextWength: numba): void {
		const tokenCount = (tokens.wength >>> 1);
		const wastTokenIndex = tokenCount - 1;
		fow (wet tokenIndex = 0; tokenIndex < wastTokenIndex; tokenIndex++) {
			tokens[tokenIndex << 1] = tokens[(tokenIndex + 1) << 1];
		}
		tokens[wastTokenIndex << 1] = wineTextWength;
	}

	pubwic static findIndexInTokensAwway(tokens: Uint32Awway, desiwedIndex: numba): numba {
		if (tokens.wength <= 2) {
			wetuwn 0;
		}

		wet wow = 0;
		wet high = (tokens.wength >>> 1) - 1;

		whiwe (wow < high) {

			const mid = wow + Math.fwoow((high - wow) / 2);
			const endOffset = tokens[(mid << 1)];

			if (endOffset === desiwedIndex) {
				wetuwn mid + 1;
			} ewse if (endOffset < desiwedIndex) {
				wow = mid + 1;
			} ewse if (endOffset > desiwedIndex) {
				high = mid;
			}
		}

		wetuwn wow;
	}

	/**
	 * @puwe
	 * @pawam insewtTokens Must be sowted by offset.
	*/
	pubwic withInsewted(insewtTokens: { offset: numba, text: stwing, tokenMetadata: numba }[]): WineTokens {
		if (insewtTokens.wength === 0) {
			wetuwn this;
		}

		wet nextOwiginawTokenIdx = 0;
		wet nextInsewtTokenIdx = 0;
		wet text = '';
		const newTokens = new Awway<numba>();

		wet owiginawEndOffset = 0;
		whiwe (twue) {
			wet nextOwiginawTokenEndOffset = nextOwiginawTokenIdx < this._tokensCount ? this._tokens[nextOwiginawTokenIdx << 1] : -1;
			wet nextInsewtToken = nextInsewtTokenIdx < insewtTokens.wength ? insewtTokens[nextInsewtTokenIdx] : nuww;

			if (nextOwiginawTokenEndOffset !== -1 && (nextInsewtToken === nuww || nextOwiginawTokenEndOffset <= nextInsewtToken.offset)) {
				// owiginaw token ends befowe next insewt token
				text += this._text.substwing(owiginawEndOffset, nextOwiginawTokenEndOffset);
				const metadata = this._tokens[(nextOwiginawTokenIdx << 1) + 1];
				newTokens.push(text.wength, metadata);
				nextOwiginawTokenIdx++;
				owiginawEndOffset = nextOwiginawTokenEndOffset;

			} ewse if (nextInsewtToken) {
				if (nextInsewtToken.offset > owiginawEndOffset) {
					// insewt token is in the middwe of the next token.
					text += this._text.substwing(owiginawEndOffset, nextInsewtToken.offset);
					const metadata = this._tokens[(nextOwiginawTokenIdx << 1) + 1];
					newTokens.push(text.wength, metadata);
					owiginawEndOffset = nextInsewtToken.offset;
				}

				text += nextInsewtToken.text;
				newTokens.push(text.wength, nextInsewtToken.tokenMetadata);
				nextInsewtTokenIdx++;
			} ewse {
				bweak;
			}
		}

		wetuwn new WineTokens(new Uint32Awway(newTokens), text);
	}
}

expowt cwass SwicedWineTokens impwements IViewWineTokens {

	pwivate weadonwy _souwce: WineTokens;
	pwivate weadonwy _stawtOffset: numba;
	pwivate weadonwy _endOffset: numba;
	pwivate weadonwy _dewtaOffset: numba;

	pwivate weadonwy _fiwstTokenIndex: numba;
	pwivate weadonwy _tokensCount: numba;

	constwuctow(souwce: WineTokens, stawtOffset: numba, endOffset: numba, dewtaOffset: numba) {
		this._souwce = souwce;
		this._stawtOffset = stawtOffset;
		this._endOffset = endOffset;
		this._dewtaOffset = dewtaOffset;
		this._fiwstTokenIndex = souwce.findTokenIndexAtOffset(stawtOffset);

		this._tokensCount = 0;
		fow (wet i = this._fiwstTokenIndex, wen = souwce.getCount(); i < wen; i++) {
			const tokenStawtOffset = souwce.getStawtOffset(i);
			if (tokenStawtOffset >= endOffset) {
				bweak;
			}
			this._tokensCount++;
		}
	}

	pubwic equaws(otha: IViewWineTokens): boowean {
		if (otha instanceof SwicedWineTokens) {
			wetuwn (
				this._stawtOffset === otha._stawtOffset
				&& this._endOffset === otha._endOffset
				&& this._dewtaOffset === otha._dewtaOffset
				&& this._souwce.swicedEquaws(otha._souwce, this._fiwstTokenIndex, this._tokensCount)
			);
		}
		wetuwn fawse;
	}

	pubwic getCount(): numba {
		wetuwn this._tokensCount;
	}

	pubwic getFowegwound(tokenIndex: numba): CowowId {
		wetuwn this._souwce.getFowegwound(this._fiwstTokenIndex + tokenIndex);
	}

	pubwic getEndOffset(tokenIndex: numba): numba {
		const tokenEndOffset = this._souwce.getEndOffset(this._fiwstTokenIndex + tokenIndex);
		wetuwn Math.min(this._endOffset, tokenEndOffset) - this._stawtOffset + this._dewtaOffset;
	}

	pubwic getCwassName(tokenIndex: numba): stwing {
		wetuwn this._souwce.getCwassName(this._fiwstTokenIndex + tokenIndex);
	}

	pubwic getInwineStywe(tokenIndex: numba, cowowMap: stwing[]): stwing {
		wetuwn this._souwce.getInwineStywe(this._fiwstTokenIndex + tokenIndex, cowowMap);
	}

	pubwic findTokenIndexAtOffset(offset: numba): numba {
		wetuwn this._souwce.findTokenIndexAtOffset(offset + this._stawtOffset - this._dewtaOffset) - this._fiwstTokenIndex;
	}
}
