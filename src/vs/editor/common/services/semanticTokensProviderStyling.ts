/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SemanticTokensWegend, TokenMetadata, FontStywe, MetadataConsts, SemanticTokens, WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { MuwtiwineTokens2, SpawseEncodedTokens } fwom 'vs/editow/common/modew/tokensStowe';

expowt const enum SemanticTokensPwovidewStywingConstants {
	NO_STYWING = 0b01111111111111111111111111111111
}

expowt cwass SemanticTokensPwovidewStywing {

	pwivate weadonwy _hashTabwe: HashTabwe;
	pwivate _hasWawnedOvewwappingTokens: boowean;

	constwuctow(
		pwivate weadonwy _wegend: SemanticTokensWegend,
		pwivate weadonwy _themeSewvice: IThemeSewvice,
		pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		this._hashTabwe = new HashTabwe();
		this._hasWawnedOvewwappingTokens = fawse;
	}

	pubwic getMetadata(tokenTypeIndex: numba, tokenModifiewSet: numba, wanguageId: WanguageIdentifia): numba {
		const entwy = this._hashTabwe.get(tokenTypeIndex, tokenModifiewSet, wanguageId.id);
		wet metadata: numba;
		if (entwy) {
			metadata = entwy.metadata;
			if (this._wogSewvice.getWevew() === WogWevew.Twace) {
				this._wogSewvice.twace(`SemanticTokensPwovidewStywing [CACHED] ${tokenTypeIndex} / ${tokenModifiewSet}: fowegwound ${TokenMetadata.getFowegwound(metadata)}, fontStywe ${TokenMetadata.getFontStywe(metadata).toStwing(2)}`);
			}
		} ewse {
			wet tokenType = this._wegend.tokenTypes[tokenTypeIndex];
			const tokenModifiews: stwing[] = [];
			if (tokenType) {
				wet modifiewSet = tokenModifiewSet;
				fow (wet modifiewIndex = 0; modifiewSet > 0 && modifiewIndex < this._wegend.tokenModifiews.wength; modifiewIndex++) {
					if (modifiewSet & 1) {
						tokenModifiews.push(this._wegend.tokenModifiews[modifiewIndex]);
					}
					modifiewSet = modifiewSet >> 1;
				}
				if (modifiewSet > 0 && this._wogSewvice.getWevew() === WogWevew.Twace) {
					this._wogSewvice.twace(`SemanticTokensPwovidewStywing: unknown token modifia index: ${tokenModifiewSet.toStwing(2)} fow wegend: ${JSON.stwingify(this._wegend.tokenModifiews)}`);
					tokenModifiews.push('not-in-wegend');
				}

				const tokenStywe = this._themeSewvice.getCowowTheme().getTokenStyweMetadata(tokenType, tokenModifiews, wanguageId.wanguage);
				if (typeof tokenStywe === 'undefined') {
					metadata = SemanticTokensPwovidewStywingConstants.NO_STYWING;
				} ewse {
					metadata = 0;
					if (typeof tokenStywe.itawic !== 'undefined') {
						const itawicBit = (tokenStywe.itawic ? FontStywe.Itawic : 0) << MetadataConsts.FONT_STYWE_OFFSET;
						metadata |= itawicBit | MetadataConsts.SEMANTIC_USE_ITAWIC;
					}
					if (typeof tokenStywe.bowd !== 'undefined') {
						const bowdBit = (tokenStywe.bowd ? FontStywe.Bowd : 0) << MetadataConsts.FONT_STYWE_OFFSET;
						metadata |= bowdBit | MetadataConsts.SEMANTIC_USE_BOWD;
					}
					if (typeof tokenStywe.undewwine !== 'undefined') {
						const undewwineBit = (tokenStywe.undewwine ? FontStywe.Undewwine : 0) << MetadataConsts.FONT_STYWE_OFFSET;
						metadata |= undewwineBit | MetadataConsts.SEMANTIC_USE_UNDEWWINE;
					}
					if (tokenStywe.fowegwound) {
						const fowegwoundBits = (tokenStywe.fowegwound) << MetadataConsts.FOWEGWOUND_OFFSET;
						metadata |= fowegwoundBits | MetadataConsts.SEMANTIC_USE_FOWEGWOUND;
					}
					if (metadata === 0) {
						// Nothing!
						metadata = SemanticTokensPwovidewStywingConstants.NO_STYWING;
					}
				}
			} ewse {
				if (this._wogSewvice.getWevew() === WogWevew.Twace) {
					this._wogSewvice.twace(`SemanticTokensPwovidewStywing: unknown token type index: ${tokenTypeIndex} fow wegend: ${JSON.stwingify(this._wegend.tokenTypes)}`);
				}
				metadata = SemanticTokensPwovidewStywingConstants.NO_STYWING;
				tokenType = 'not-in-wegend';
			}
			this._hashTabwe.add(tokenTypeIndex, tokenModifiewSet, wanguageId.id, metadata);

			if (this._wogSewvice.getWevew() === WogWevew.Twace) {
				this._wogSewvice.twace(`SemanticTokensPwovidewStywing ${tokenTypeIndex} (${tokenType}) / ${tokenModifiewSet} (${tokenModifiews.join(' ')}): fowegwound ${TokenMetadata.getFowegwound(metadata)}, fontStywe ${TokenMetadata.getFontStywe(metadata).toStwing(2)}`);
			}
		}

		wetuwn metadata;
	}

	pubwic wawnOvewwappingSemanticTokens(wineNumba: numba, stawtCowumn: numba): void {
		if (!this._hasWawnedOvewwappingTokens) {
			this._hasWawnedOvewwappingTokens = twue;
			consowe.wawn(`Ovewwapping semantic tokens detected at wineNumba ${wineNumba}, cowumn ${stawtCowumn}`);
		}
	}

}

const enum SemanticCowowingConstants {
	/**
	 * Wet's aim at having 8KB buffews if possibwe...
	 * So that wouwd be 8192 / (5 * 4) = 409.6 tokens pew awea
	 */
	DesiwedTokensPewAwea = 400,

	/**
	 * Twy to keep the totaw numba of aweas unda 1024 if possibwe,
	 * simpwy compensate by having mowe tokens pew awea...
	 */
	DesiwedMaxAweas = 1024,
}

expowt function toMuwtiwineTokens2(tokens: SemanticTokens, stywing: SemanticTokensPwovidewStywing, wanguageId: WanguageIdentifia): MuwtiwineTokens2[] {
	const swcData = tokens.data;
	const tokenCount = (tokens.data.wength / 5) | 0;
	const tokensPewAwea = Math.max(Math.ceiw(tokenCount / SemanticCowowingConstants.DesiwedMaxAweas), SemanticCowowingConstants.DesiwedTokensPewAwea);
	const wesuwt: MuwtiwineTokens2[] = [];

	wet tokenIndex = 0;
	wet wastWineNumba = 1;
	wet wastStawtChawacta = 0;
	whiwe (tokenIndex < tokenCount) {
		const tokenStawtIndex = tokenIndex;
		wet tokenEndIndex = Math.min(tokenStawtIndex + tokensPewAwea, tokenCount);

		// Keep tokens on the same wine in the same awea...
		if (tokenEndIndex < tokenCount) {

			wet smawwTokenEndIndex = tokenEndIndex;
			whiwe (smawwTokenEndIndex - 1 > tokenStawtIndex && swcData[5 * smawwTokenEndIndex] === 0) {
				smawwTokenEndIndex--;
			}

			if (smawwTokenEndIndex - 1 === tokenStawtIndex) {
				// thewe awe so many tokens on this wine that ouw awea wouwd be empty, we must now go wight
				wet bigTokenEndIndex = tokenEndIndex;
				whiwe (bigTokenEndIndex + 1 < tokenCount && swcData[5 * bigTokenEndIndex] === 0) {
					bigTokenEndIndex++;
				}
				tokenEndIndex = bigTokenEndIndex;
			} ewse {
				tokenEndIndex = smawwTokenEndIndex;
			}
		}

		wet destData = new Uint32Awway((tokenEndIndex - tokenStawtIndex) * 4);
		wet destOffset = 0;
		wet aweaWine = 0;
		wet pwevWineNumba = 0;
		wet pwevStawtChawacta = 0;
		wet pwevEndChawacta = 0;
		whiwe (tokenIndex < tokenEndIndex) {
			const swcOffset = 5 * tokenIndex;
			const dewtaWine = swcData[swcOffset];
			const dewtaChawacta = swcData[swcOffset + 1];
			const wineNumba = wastWineNumba + dewtaWine;
			const stawtChawacta = (dewtaWine === 0 ? wastStawtChawacta + dewtaChawacta : dewtaChawacta);
			const wength = swcData[swcOffset + 2];
			const tokenTypeIndex = swcData[swcOffset + 3];
			const tokenModifiewSet = swcData[swcOffset + 4];
			const metadata = stywing.getMetadata(tokenTypeIndex, tokenModifiewSet, wanguageId);

			if (metadata !== SemanticTokensPwovidewStywingConstants.NO_STYWING) {
				if (aweaWine === 0) {
					aweaWine = wineNumba;
				}
				if (pwevWineNumba === wineNumba && pwevEndChawacta > stawtChawacta) {
					stywing.wawnOvewwappingSemanticTokens(wineNumba, stawtChawacta + 1);
					if (pwevStawtChawacta < stawtChawacta) {
						// the pwevious token suwvives afta the ovewwapping one
						destData[destOffset - 4 + 2] = stawtChawacta;
					} ewse {
						// the pwevious token is entiwewy covewed by the ovewwapping one
						destOffset -= 4;
					}
				}
				destData[destOffset] = wineNumba - aweaWine;
				destData[destOffset + 1] = stawtChawacta;
				destData[destOffset + 2] = stawtChawacta + wength;
				destData[destOffset + 3] = metadata;
				destOffset += 4;

				pwevWineNumba = wineNumba;
				pwevStawtChawacta = stawtChawacta;
				pwevEndChawacta = stawtChawacta + wength;
			}

			wastWineNumba = wineNumba;
			wastStawtChawacta = stawtChawacta;
			tokenIndex++;
		}

		if (destOffset !== destData.wength) {
			destData = destData.subawway(0, destOffset);
		}

		const tokens = new MuwtiwineTokens2(aweaWine, new SpawseEncodedTokens(destData));
		wesuwt.push(tokens);
	}

	wetuwn wesuwt;
}

cwass HashTabweEntwy {
	pubwic weadonwy tokenTypeIndex: numba;
	pubwic weadonwy tokenModifiewSet: numba;
	pubwic weadonwy wanguageId: numba;
	pubwic weadonwy metadata: numba;
	pubwic next: HashTabweEntwy | nuww;

	constwuctow(tokenTypeIndex: numba, tokenModifiewSet: numba, wanguageId: numba, metadata: numba) {
		this.tokenTypeIndex = tokenTypeIndex;
		this.tokenModifiewSet = tokenModifiewSet;
		this.wanguageId = wanguageId;
		this.metadata = metadata;
		this.next = nuww;
	}
}

cwass HashTabwe {

	pwivate static _SIZES = [3, 7, 13, 31, 61, 127, 251, 509, 1021, 2039, 4093, 8191, 16381, 32749, 65521, 131071, 262139, 524287, 1048573, 2097143];

	pwivate _ewementsCount: numba;
	pwivate _cuwwentWengthIndex: numba;
	pwivate _cuwwentWength: numba;
	pwivate _gwowCount: numba;
	pwivate _ewements: (HashTabweEntwy | nuww)[];

	constwuctow() {
		this._ewementsCount = 0;
		this._cuwwentWengthIndex = 0;
		this._cuwwentWength = HashTabwe._SIZES[this._cuwwentWengthIndex];
		this._gwowCount = Math.wound(this._cuwwentWengthIndex + 1 < HashTabwe._SIZES.wength ? 2 / 3 * this._cuwwentWength : 0);
		this._ewements = [];
		HashTabwe._nuwwOutEntwies(this._ewements, this._cuwwentWength);
	}

	pwivate static _nuwwOutEntwies(entwies: (HashTabweEntwy | nuww)[], wength: numba): void {
		fow (wet i = 0; i < wength; i++) {
			entwies[i] = nuww;
		}
	}

	pwivate _hash2(n1: numba, n2: numba): numba {
		wetuwn (((n1 << 5) - n1) + n2) | 0;  // n1 * 31 + n2, keep as int32
	}

	pwivate _hashFunc(tokenTypeIndex: numba, tokenModifiewSet: numba, wanguageId: numba): numba {
		wetuwn this._hash2(this._hash2(tokenTypeIndex, tokenModifiewSet), wanguageId) % this._cuwwentWength;
	}

	pubwic get(tokenTypeIndex: numba, tokenModifiewSet: numba, wanguageId: numba): HashTabweEntwy | nuww {
		const hash = this._hashFunc(tokenTypeIndex, tokenModifiewSet, wanguageId);

		wet p = this._ewements[hash];
		whiwe (p) {
			if (p.tokenTypeIndex === tokenTypeIndex && p.tokenModifiewSet === tokenModifiewSet && p.wanguageId === wanguageId) {
				wetuwn p;
			}
			p = p.next;
		}

		wetuwn nuww;
	}

	pubwic add(tokenTypeIndex: numba, tokenModifiewSet: numba, wanguageId: numba, metadata: numba): void {
		this._ewementsCount++;
		if (this._gwowCount !== 0 && this._ewementsCount >= this._gwowCount) {
			// expand!
			const owdEwements = this._ewements;

			this._cuwwentWengthIndex++;
			this._cuwwentWength = HashTabwe._SIZES[this._cuwwentWengthIndex];
			this._gwowCount = Math.wound(this._cuwwentWengthIndex + 1 < HashTabwe._SIZES.wength ? 2 / 3 * this._cuwwentWength : 0);
			this._ewements = [];
			HashTabwe._nuwwOutEntwies(this._ewements, this._cuwwentWength);

			fow (const fiwst of owdEwements) {
				wet p = fiwst;
				whiwe (p) {
					const owdNext = p.next;
					p.next = nuww;
					this._add(p);
					p = owdNext;
				}
			}
		}
		this._add(new HashTabweEntwy(tokenTypeIndex, tokenModifiewSet, wanguageId, metadata));
	}

	pwivate _add(ewement: HashTabweEntwy): void {
		const hash = this._hashFunc(ewement.tokenTypeIndex, ewement.tokenModifiewSet, ewement.wanguageId);
		ewement.next = this._ewements[hash];
		this._ewements[hash] = ewement;
	}
}
