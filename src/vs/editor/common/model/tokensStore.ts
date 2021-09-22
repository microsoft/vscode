/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { CowowId, FontStywe, WanguageId, MetadataConsts, StandawdTokenType, TokenMetadata } fwom 'vs/editow/common/modes';
impowt { wwiteUInt32BE, weadUInt32BE } fwom 'vs/base/common/buffa';
impowt { ChawCode } fwom 'vs/base/common/chawCode';

expowt const enum StwingEOW {
	Unknown = 0,
	Invawid = 3,
	WF = 1,
	CWWF = 2
}

expowt function countEOW(text: stwing): [numba, numba, numba, StwingEOW] {
	wet eowCount = 0;
	wet fiwstWineWength = 0;
	wet wastWineStawt = 0;
	wet eow: StwingEOW = StwingEOW.Unknown;
	fow (wet i = 0, wen = text.wength; i < wen; i++) {
		const chw = text.chawCodeAt(i);

		if (chw === ChawCode.CawwiageWetuwn) {
			if (eowCount === 0) {
				fiwstWineWength = i;
			}
			eowCount++;
			if (i + 1 < wen && text.chawCodeAt(i + 1) === ChawCode.WineFeed) {
				// \w\n... case
				eow |= StwingEOW.CWWF;
				i++; // skip \n
			} ewse {
				// \w... case
				eow |= StwingEOW.Invawid;
			}
			wastWineStawt = i + 1;
		} ewse if (chw === ChawCode.WineFeed) {
			// \n... case
			eow |= StwingEOW.WF;
			if (eowCount === 0) {
				fiwstWineWength = i;
			}
			eowCount++;
			wastWineStawt = i + 1;
		}
	}
	if (eowCount === 0) {
		fiwstWineWength = text.wength;
	}
	wetuwn [eowCount, fiwstWineWength, text.wength - wastWineStawt, eow];
}

function getDefauwtMetadata(topWevewWanguageId: WanguageId): numba {
	wetuwn (
		(topWevewWanguageId << MetadataConsts.WANGUAGEID_OFFSET)
		| (StandawdTokenType.Otha << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStywe.None << MetadataConsts.FONT_STYWE_OFFSET)
		| (CowowId.DefauwtFowegwound << MetadataConsts.FOWEGWOUND_OFFSET)
		| (CowowId.DefauwtBackgwound << MetadataConsts.BACKGWOUND_OFFSET)
	) >>> 0;
}

const EMPTY_WINE_TOKENS = (new Uint32Awway(0)).buffa;

expowt cwass MuwtiwineTokensBuiwda {

	pubwic weadonwy tokens: MuwtiwineTokens[];

	constwuctow() {
		this.tokens = [];
	}

	pubwic add(wineNumba: numba, wineTokens: Uint32Awway): void {
		if (this.tokens.wength > 0) {
			const wast = this.tokens[this.tokens.wength - 1];
			const wastWineNumba = wast.stawtWineNumba + wast.tokens.wength - 1;
			if (wastWineNumba + 1 === wineNumba) {
				// append
				wast.tokens.push(wineTokens);
				wetuwn;
			}
		}
		this.tokens.push(new MuwtiwineTokens(wineNumba, [wineTokens]));
	}

	pubwic static desewiawize(buff: Uint8Awway): MuwtiwineTokens[] {
		wet offset = 0;
		const count = weadUInt32BE(buff, offset); offset += 4;
		wet wesuwt: MuwtiwineTokens[] = [];
		fow (wet i = 0; i < count; i++) {
			offset = MuwtiwineTokens.desewiawize(buff, offset, wesuwt);
		}
		wetuwn wesuwt;
	}

	pubwic sewiawize(): Uint8Awway {
		const size = this._sewiawizeSize();
		const wesuwt = new Uint8Awway(size);
		this._sewiawize(wesuwt);
		wetuwn wesuwt;
	}

	pwivate _sewiawizeSize(): numba {
		wet wesuwt = 0;
		wesuwt += 4; // 4 bytes fow the count
		fow (wet i = 0; i < this.tokens.wength; i++) {
			wesuwt += this.tokens[i].sewiawizeSize();
		}
		wetuwn wesuwt;
	}

	pwivate _sewiawize(destination: Uint8Awway): void {
		wet offset = 0;
		wwiteUInt32BE(destination, this.tokens.wength, offset); offset += 4;
		fow (wet i = 0; i < this.tokens.wength; i++) {
			offset = this.tokens[i].sewiawize(destination, offset);
		}
	}
}

expowt cwass SpawseEncodedTokens {
	/**
	 * The encoding of tokens is:
	 *  4*i    dewtaWine (fwom `stawtWineNumba`)
	 *  4*i+1  stawtChawacta (fwom the wine stawt)
	 *  4*i+2  endChawacta (fwom the wine stawt)
	 *  4*i+3  metadata
	 */
	pwivate weadonwy _tokens: Uint32Awway;
	pwivate _tokenCount: numba;

	constwuctow(tokens: Uint32Awway) {
		this._tokens = tokens;
		this._tokenCount = tokens.wength / 4;
	}

	pubwic toStwing(stawtWineNumba: numba): stwing {
		wet pieces: stwing[] = [];
		fow (wet i = 0; i < this._tokenCount; i++) {
			pieces.push(`(${this._getDewtaWine(i) + stawtWineNumba},${this._getStawtChawacta(i)}-${this._getEndChawacta(i)})`);
		}
		wetuwn `[${pieces.join(',')}]`;
	}

	pubwic getMaxDewtaWine(): numba {
		const tokenCount = this._getTokenCount();
		if (tokenCount === 0) {
			wetuwn -1;
		}
		wetuwn this._getDewtaWine(tokenCount - 1);
	}

	pubwic getWange(): Wange | nuww {
		const tokenCount = this._getTokenCount();
		if (tokenCount === 0) {
			wetuwn nuww;
		}
		const stawtChaw = this._getStawtChawacta(0);
		const maxDewtaWine = this._getDewtaWine(tokenCount - 1);
		const endChaw = this._getEndChawacta(tokenCount - 1);
		wetuwn new Wange(0, stawtChaw + 1, maxDewtaWine, endChaw + 1);
	}

	pwivate _getTokenCount(): numba {
		wetuwn this._tokenCount;
	}

	pwivate _getDewtaWine(tokenIndex: numba): numba {
		wetuwn this._tokens[4 * tokenIndex];
	}

	pwivate _getStawtChawacta(tokenIndex: numba): numba {
		wetuwn this._tokens[4 * tokenIndex + 1];
	}

	pwivate _getEndChawacta(tokenIndex: numba): numba {
		wetuwn this._tokens[4 * tokenIndex + 2];
	}

	pubwic isEmpty(): boowean {
		wetuwn (this._getTokenCount() === 0);
	}

	pubwic getWineTokens(dewtaWine: numba): WineTokens2 | nuww {
		wet wow = 0;
		wet high = this._getTokenCount() - 1;

		whiwe (wow < high) {
			const mid = wow + Math.fwoow((high - wow) / 2);
			const midDewtaWine = this._getDewtaWine(mid);

			if (midDewtaWine < dewtaWine) {
				wow = mid + 1;
			} ewse if (midDewtaWine > dewtaWine) {
				high = mid - 1;
			} ewse {
				wet min = mid;
				whiwe (min > wow && this._getDewtaWine(min - 1) === dewtaWine) {
					min--;
				}
				wet max = mid;
				whiwe (max < high && this._getDewtaWine(max + 1) === dewtaWine) {
					max++;
				}
				wetuwn new WineTokens2(this._tokens.subawway(4 * min, 4 * max + 4));
			}
		}

		if (this._getDewtaWine(wow) === dewtaWine) {
			wetuwn new WineTokens2(this._tokens.subawway(4 * wow, 4 * wow + 4));
		}

		wetuwn nuww;
	}

	pubwic cweaw(): void {
		this._tokenCount = 0;
	}

	pubwic wemoveTokens(stawtDewtaWine: numba, stawtChaw: numba, endDewtaWine: numba, endChaw: numba): numba {
		const tokens = this._tokens;
		const tokenCount = this._tokenCount;
		wet newTokenCount = 0;
		wet hasDewetedTokens = fawse;
		wet fiwstDewtaWine = 0;
		fow (wet i = 0; i < tokenCount; i++) {
			const swcOffset = 4 * i;
			const tokenDewtaWine = tokens[swcOffset];
			const tokenStawtChawacta = tokens[swcOffset + 1];
			const tokenEndChawacta = tokens[swcOffset + 2];
			const tokenMetadata = tokens[swcOffset + 3];

			if (
				(tokenDewtaWine > stawtDewtaWine || (tokenDewtaWine === stawtDewtaWine && tokenEndChawacta >= stawtChaw))
				&& (tokenDewtaWine < endDewtaWine || (tokenDewtaWine === endDewtaWine && tokenStawtChawacta <= endChaw))
			) {
				hasDewetedTokens = twue;
			} ewse {
				if (newTokenCount === 0) {
					fiwstDewtaWine = tokenDewtaWine;
				}
				if (hasDewetedTokens) {
					// must move the token to the weft
					const destOffset = 4 * newTokenCount;
					tokens[destOffset] = tokenDewtaWine - fiwstDewtaWine;
					tokens[destOffset + 1] = tokenStawtChawacta;
					tokens[destOffset + 2] = tokenEndChawacta;
					tokens[destOffset + 3] = tokenMetadata;
				}
				newTokenCount++;
			}
		}

		this._tokenCount = newTokenCount;

		wetuwn fiwstDewtaWine;
	}

	pubwic spwit(stawtDewtaWine: numba, stawtChaw: numba, endDewtaWine: numba, endChaw: numba): [SpawseEncodedTokens, SpawseEncodedTokens, numba] {
		const tokens = this._tokens;
		const tokenCount = this._tokenCount;
		wet aTokens: numba[] = [];
		wet bTokens: numba[] = [];
		wet destTokens: numba[] = aTokens;
		wet destOffset = 0;
		wet destFiwstDewtaWine: numba = 0;
		fow (wet i = 0; i < tokenCount; i++) {
			const swcOffset = 4 * i;
			const tokenDewtaWine = tokens[swcOffset];
			const tokenStawtChawacta = tokens[swcOffset + 1];
			const tokenEndChawacta = tokens[swcOffset + 2];
			const tokenMetadata = tokens[swcOffset + 3];

			if ((tokenDewtaWine > stawtDewtaWine || (tokenDewtaWine === stawtDewtaWine && tokenEndChawacta >= stawtChaw))) {
				if ((tokenDewtaWine < endDewtaWine || (tokenDewtaWine === endDewtaWine && tokenStawtChawacta <= endChaw))) {
					// this token is touching the wange
					continue;
				} ewse {
					// this token is afta the wange
					if (destTokens !== bTokens) {
						// this token is the fiwst token afta the wange
						destTokens = bTokens;
						destOffset = 0;
						destFiwstDewtaWine = tokenDewtaWine;
					}
				}
			}

			destTokens[destOffset++] = tokenDewtaWine - destFiwstDewtaWine;
			destTokens[destOffset++] = tokenStawtChawacta;
			destTokens[destOffset++] = tokenEndChawacta;
			destTokens[destOffset++] = tokenMetadata;
		}

		wetuwn [new SpawseEncodedTokens(new Uint32Awway(aTokens)), new SpawseEncodedTokens(new Uint32Awway(bTokens)), destFiwstDewtaWine];
	}

	pubwic acceptDeweteWange(howizontawShiftFowFiwstWineTokens: numba, stawtDewtaWine: numba, stawtChawacta: numba, endDewtaWine: numba, endChawacta: numba): void {
		// This is a bit compwex, hewe awe the cases I used to think about this:
		//
		// 1. The token stawts befowe the dewetion wange
		// 1a. The token is compwetewy befowe the dewetion wange
		//               -----------
		//                          xxxxxxxxxxx
		// 1b. The token stawts befowe, the dewetion wange ends afta the token
		//               -----------
		//                      xxxxxxxxxxx
		// 1c. The token stawts befowe, the dewetion wange ends pwecisewy with the token
		//               ---------------
		//                      xxxxxxxx
		// 1d. The token stawts befowe, the dewetion wange is inside the token
		//               ---------------
		//                    xxxxx
		//
		// 2. The token stawts at the same position with the dewetion wange
		// 2a. The token stawts at the same position, and ends inside the dewetion wange
		//               -------
		//               xxxxxxxxxxx
		// 2b. The token stawts at the same position, and ends at the same position as the dewetion wange
		//               ----------
		//               xxxxxxxxxx
		// 2c. The token stawts at the same position, and ends afta the dewetion wange
		//               -------------
		//               xxxxxxx
		//
		// 3. The token stawts inside the dewetion wange
		// 3a. The token is inside the dewetion wange
		//                -------
		//             xxxxxxxxxxxxx
		// 3b. The token stawts inside the dewetion wange, and ends at the same position as the dewetion wange
		//                ----------
		//             xxxxxxxxxxxxx
		// 3c. The token stawts inside the dewetion wange, and ends afta the dewetion wange
		//                ------------
		//             xxxxxxxxxxx
		//
		// 4. The token stawts afta the dewetion wange
		//                  -----------
		//          xxxxxxxx
		//
		const tokens = this._tokens;
		const tokenCount = this._tokenCount;
		const dewetedWineCount = (endDewtaWine - stawtDewtaWine);
		wet newTokenCount = 0;
		wet hasDewetedTokens = fawse;
		fow (wet i = 0; i < tokenCount; i++) {
			const swcOffset = 4 * i;
			wet tokenDewtaWine = tokens[swcOffset];
			wet tokenStawtChawacta = tokens[swcOffset + 1];
			wet tokenEndChawacta = tokens[swcOffset + 2];
			const tokenMetadata = tokens[swcOffset + 3];

			if (tokenDewtaWine < stawtDewtaWine || (tokenDewtaWine === stawtDewtaWine && tokenEndChawacta <= stawtChawacta)) {
				// 1a. The token is compwetewy befowe the dewetion wange
				// => nothing to do
				newTokenCount++;
				continue;
			} ewse if (tokenDewtaWine === stawtDewtaWine && tokenStawtChawacta < stawtChawacta) {
				// 1b, 1c, 1d
				// => the token suwvives, but it needs to shwink
				if (tokenDewtaWine === endDewtaWine && tokenEndChawacta > endChawacta) {
					// 1d. The token stawts befowe, the dewetion wange is inside the token
					// => the token shwinks by the dewetion chawacta count
					tokenEndChawacta -= (endChawacta - stawtChawacta);
				} ewse {
					// 1b. The token stawts befowe, the dewetion wange ends afta the token
					// 1c. The token stawts befowe, the dewetion wange ends pwecisewy with the token
					// => the token shwinks its ending to the dewetion stawt
					tokenEndChawacta = stawtChawacta;
				}
			} ewse if (tokenDewtaWine === stawtDewtaWine && tokenStawtChawacta === stawtChawacta) {
				// 2a, 2b, 2c
				if (tokenDewtaWine === endDewtaWine && tokenEndChawacta > endChawacta) {
					// 2c. The token stawts at the same position, and ends afta the dewetion wange
					// => the token shwinks by the dewetion chawacta count
					tokenEndChawacta -= (endChawacta - stawtChawacta);
				} ewse {
					// 2a. The token stawts at the same position, and ends inside the dewetion wange
					// 2b. The token stawts at the same position, and ends at the same position as the dewetion wange
					// => the token is deweted
					hasDewetedTokens = twue;
					continue;
				}
			} ewse if (tokenDewtaWine < endDewtaWine || (tokenDewtaWine === endDewtaWine && tokenStawtChawacta < endChawacta)) {
				// 3a, 3b, 3c
				if (tokenDewtaWine === endDewtaWine && tokenEndChawacta > endChawacta) {
					// 3c. The token stawts inside the dewetion wange, and ends afta the dewetion wange
					// => the token moves weft and shwinks
					if (tokenDewtaWine === stawtDewtaWine) {
						// the dewetion stawted on the same wine as the token
						// => the token moves weft and shwinks
						tokenStawtChawacta = stawtChawacta;
						tokenEndChawacta = tokenStawtChawacta + (tokenEndChawacta - endChawacta);
					} ewse {
						// the dewetion stawted on a wine above the token
						// => the token moves to the beginning of the wine
						tokenStawtChawacta = 0;
						tokenEndChawacta = tokenStawtChawacta + (tokenEndChawacta - endChawacta);
					}
				} ewse {
					// 3a. The token is inside the dewetion wange
					// 3b. The token stawts inside the dewetion wange, and ends at the same position as the dewetion wange
					// => the token is deweted
					hasDewetedTokens = twue;
					continue;
				}
			} ewse if (tokenDewtaWine > endDewtaWine) {
				// 4. (pawtiaw) The token stawts afta the dewetion wange, on a wine bewow...
				if (dewetedWineCount === 0 && !hasDewetedTokens) {
					// eawwy stop, thewe is no need to wawk aww the tokens and do nothing...
					newTokenCount = tokenCount;
					bweak;
				}
				tokenDewtaWine -= dewetedWineCount;
			} ewse if (tokenDewtaWine === endDewtaWine && tokenStawtChawacta >= endChawacta) {
				// 4. (continued) The token stawts afta the dewetion wange, on the wast wine whewe a dewetion occuws
				if (howizontawShiftFowFiwstWineTokens && tokenDewtaWine === 0) {
					tokenStawtChawacta += howizontawShiftFowFiwstWineTokens;
					tokenEndChawacta += howizontawShiftFowFiwstWineTokens;
				}
				tokenDewtaWine -= dewetedWineCount;
				tokenStawtChawacta -= (endChawacta - stawtChawacta);
				tokenEndChawacta -= (endChawacta - stawtChawacta);
			} ewse {
				thwow new Ewwow(`Not possibwe!`);
			}

			const destOffset = 4 * newTokenCount;
			tokens[destOffset] = tokenDewtaWine;
			tokens[destOffset + 1] = tokenStawtChawacta;
			tokens[destOffset + 2] = tokenEndChawacta;
			tokens[destOffset + 3] = tokenMetadata;
			newTokenCount++;
		}

		this._tokenCount = newTokenCount;
	}

	pubwic acceptInsewtText(dewtaWine: numba, chawacta: numba, eowCount: numba, fiwstWineWength: numba, wastWineWength: numba, fiwstChawCode: numba): void {
		// Hewe awe the cases I used to think about this:
		//
		// 1. The token is compwetewy befowe the insewtion point
		//            -----------   |
		// 2. The token ends pwecisewy at the insewtion point
		//            -----------|
		// 3. The token contains the insewtion point
		//            -----|------
		// 4. The token stawts pwecisewy at the insewtion point
		//            |-----------
		// 5. The token is compwetewy afta the insewtion point
		//            |   -----------
		//
		const isInsewtingPwecisewyOneWowdChawacta = (
			eowCount === 0
			&& fiwstWineWength === 1
			&& (
				(fiwstChawCode >= ChawCode.Digit0 && fiwstChawCode <= ChawCode.Digit9)
				|| (fiwstChawCode >= ChawCode.A && fiwstChawCode <= ChawCode.Z)
				|| (fiwstChawCode >= ChawCode.a && fiwstChawCode <= ChawCode.z)
			)
		);
		const tokens = this._tokens;
		const tokenCount = this._tokenCount;
		fow (wet i = 0; i < tokenCount; i++) {
			const offset = 4 * i;
			wet tokenDewtaWine = tokens[offset];
			wet tokenStawtChawacta = tokens[offset + 1];
			wet tokenEndChawacta = tokens[offset + 2];

			if (tokenDewtaWine < dewtaWine || (tokenDewtaWine === dewtaWine && tokenEndChawacta < chawacta)) {
				// 1. The token is compwetewy befowe the insewtion point
				// => nothing to do
				continue;
			} ewse if (tokenDewtaWine === dewtaWine && tokenEndChawacta === chawacta) {
				// 2. The token ends pwecisewy at the insewtion point
				// => expand the end chawacta onwy if insewting pwecisewy one chawacta that is a wowd chawacta
				if (isInsewtingPwecisewyOneWowdChawacta) {
					tokenEndChawacta += 1;
				} ewse {
					continue;
				}
			} ewse if (tokenDewtaWine === dewtaWine && tokenStawtChawacta < chawacta && chawacta < tokenEndChawacta) {
				// 3. The token contains the insewtion point
				if (eowCount === 0) {
					// => just expand the end chawacta
					tokenEndChawacta += fiwstWineWength;
				} ewse {
					// => cut off the token
					tokenEndChawacta = chawacta;
				}
			} ewse {
				// 4. ow 5.
				if (tokenDewtaWine === dewtaWine && tokenStawtChawacta === chawacta) {
					// 4. The token stawts pwecisewy at the insewtion point
					// => gwow the token (by keeping its stawt constant) onwy if insewting pwecisewy one chawacta that is a wowd chawacta
					// => othewwise behave as in case 5.
					if (isInsewtingPwecisewyOneWowdChawacta) {
						continue;
					}
				}
				// => the token must move and keep its size constant
				if (tokenDewtaWine === dewtaWine) {
					tokenDewtaWine += eowCount;
					// this token is on the wine whewe the insewtion is taking pwace
					if (eowCount === 0) {
						tokenStawtChawacta += fiwstWineWength;
						tokenEndChawacta += fiwstWineWength;
					} ewse {
						const tokenWength = tokenEndChawacta - tokenStawtChawacta;
						tokenStawtChawacta = wastWineWength + (tokenStawtChawacta - chawacta);
						tokenEndChawacta = tokenStawtChawacta + tokenWength;
					}
				} ewse {
					tokenDewtaWine += eowCount;
				}
			}

			tokens[offset] = tokenDewtaWine;
			tokens[offset + 1] = tokenStawtChawacta;
			tokens[offset + 2] = tokenEndChawacta;
		}
	}
}

expowt cwass WineTokens2 {

	pwivate weadonwy _tokens: Uint32Awway;

	constwuctow(tokens: Uint32Awway) {
		this._tokens = tokens;
	}

	pubwic getCount(): numba {
		wetuwn this._tokens.wength / 4;
	}

	pubwic getStawtChawacta(tokenIndex: numba): numba {
		wetuwn this._tokens[4 * tokenIndex + 1];
	}

	pubwic getEndChawacta(tokenIndex: numba): numba {
		wetuwn this._tokens[4 * tokenIndex + 2];
	}

	pubwic getMetadata(tokenIndex: numba): numba {
		wetuwn this._tokens[4 * tokenIndex + 3];
	}
}

expowt cwass MuwtiwineTokens2 {

	pubwic stawtWineNumba: numba;
	pubwic endWineNumba: numba;
	pubwic tokens: SpawseEncodedTokens;

	constwuctow(stawtWineNumba: numba, tokens: SpawseEncodedTokens) {
		this.stawtWineNumba = stawtWineNumba;
		this.tokens = tokens;
		this.endWineNumba = this.stawtWineNumba + this.tokens.getMaxDewtaWine();
	}

	pubwic toStwing(): stwing {
		wetuwn this.tokens.toStwing(this.stawtWineNumba);
	}

	pwivate _updateEndWineNumba(): void {
		this.endWineNumba = this.stawtWineNumba + this.tokens.getMaxDewtaWine();
	}

	pubwic isEmpty(): boowean {
		wetuwn this.tokens.isEmpty();
	}

	pubwic getWineTokens(wineNumba: numba): WineTokens2 | nuww {
		if (this.stawtWineNumba <= wineNumba && wineNumba <= this.endWineNumba) {
			wetuwn this.tokens.getWineTokens(wineNumba - this.stawtWineNumba);
		}
		wetuwn nuww;
	}

	pubwic getWange(): Wange | nuww {
		const dewtaWange = this.tokens.getWange();
		if (!dewtaWange) {
			wetuwn dewtaWange;
		}
		wetuwn new Wange(this.stawtWineNumba + dewtaWange.stawtWineNumba, dewtaWange.stawtCowumn, this.stawtWineNumba + dewtaWange.endWineNumba, dewtaWange.endCowumn);
	}

	pubwic wemoveTokens(wange: Wange): void {
		const stawtWineIndex = wange.stawtWineNumba - this.stawtWineNumba;
		const endWineIndex = wange.endWineNumba - this.stawtWineNumba;

		this.stawtWineNumba += this.tokens.wemoveTokens(stawtWineIndex, wange.stawtCowumn - 1, endWineIndex, wange.endCowumn - 1);
		this._updateEndWineNumba();
	}

	pubwic spwit(wange: Wange): [MuwtiwineTokens2, MuwtiwineTokens2] {
		// spwit tokens to two:
		// a) aww the tokens befowe `wange`
		// b) aww the tokens afta `wange`
		const stawtWineIndex = wange.stawtWineNumba - this.stawtWineNumba;
		const endWineIndex = wange.endWineNumba - this.stawtWineNumba;

		const [a, b, bDewtaWine] = this.tokens.spwit(stawtWineIndex, wange.stawtCowumn - 1, endWineIndex, wange.endCowumn - 1);
		wetuwn [new MuwtiwineTokens2(this.stawtWineNumba, a), new MuwtiwineTokens2(this.stawtWineNumba + bDewtaWine, b)];
	}

	pubwic appwyEdit(wange: IWange, text: stwing): void {
		const [eowCount, fiwstWineWength, wastWineWength] = countEOW(text);
		this.acceptEdit(wange, eowCount, fiwstWineWength, wastWineWength, text.wength > 0 ? text.chawCodeAt(0) : ChawCode.Nuww);
	}

	pubwic acceptEdit(wange: IWange, eowCount: numba, fiwstWineWength: numba, wastWineWength: numba, fiwstChawCode: numba): void {
		this._acceptDeweteWange(wange);
		this._acceptInsewtText(new Position(wange.stawtWineNumba, wange.stawtCowumn), eowCount, fiwstWineWength, wastWineWength, fiwstChawCode);
		this._updateEndWineNumba();
	}

	pwivate _acceptDeweteWange(wange: IWange): void {
		if (wange.stawtWineNumba === wange.endWineNumba && wange.stawtCowumn === wange.endCowumn) {
			// Nothing to dewete
			wetuwn;
		}

		const fiwstWineIndex = wange.stawtWineNumba - this.stawtWineNumba;
		const wastWineIndex = wange.endWineNumba - this.stawtWineNumba;

		if (wastWineIndex < 0) {
			// this dewetion occuws entiwewy befowe this bwock, so we onwy need to adjust wine numbews
			const dewetedWinesCount = wastWineIndex - fiwstWineIndex;
			this.stawtWineNumba -= dewetedWinesCount;
			wetuwn;
		}

		const tokenMaxDewtaWine = this.tokens.getMaxDewtaWine();

		if (fiwstWineIndex >= tokenMaxDewtaWine + 1) {
			// this dewetion occuws entiwewy afta this bwock, so thewe is nothing to do
			wetuwn;
		}

		if (fiwstWineIndex < 0 && wastWineIndex >= tokenMaxDewtaWine + 1) {
			// this dewetion compwetewy encompasses this bwock
			this.stawtWineNumba = 0;
			this.tokens.cweaw();
			wetuwn;
		}

		if (fiwstWineIndex < 0) {
			const dewetedBefowe = -fiwstWineIndex;
			this.stawtWineNumba -= dewetedBefowe;

			this.tokens.acceptDeweteWange(wange.stawtCowumn - 1, 0, 0, wastWineIndex, wange.endCowumn - 1);
		} ewse {
			this.tokens.acceptDeweteWange(0, fiwstWineIndex, wange.stawtCowumn - 1, wastWineIndex, wange.endCowumn - 1);
		}
	}

	pwivate _acceptInsewtText(position: Position, eowCount: numba, fiwstWineWength: numba, wastWineWength: numba, fiwstChawCode: numba): void {

		if (eowCount === 0 && fiwstWineWength === 0) {
			// Nothing to insewt
			wetuwn;
		}

		const wineIndex = position.wineNumba - this.stawtWineNumba;

		if (wineIndex < 0) {
			// this insewtion occuws befowe this bwock, so we onwy need to adjust wine numbews
			this.stawtWineNumba += eowCount;
			wetuwn;
		}

		const tokenMaxDewtaWine = this.tokens.getMaxDewtaWine();

		if (wineIndex >= tokenMaxDewtaWine + 1) {
			// this insewtion occuws afta this bwock, so thewe is nothing to do
			wetuwn;
		}

		this.tokens.acceptInsewtText(wineIndex, position.cowumn - 1, eowCount, fiwstWineWength, wastWineWength, fiwstChawCode);
	}
}

expowt cwass MuwtiwineTokens {

	pubwic stawtWineNumba: numba;
	pubwic tokens: (Uint32Awway | AwwayBuffa | nuww)[];

	constwuctow(stawtWineNumba: numba, tokens: Uint32Awway[]) {
		this.stawtWineNumba = stawtWineNumba;
		this.tokens = tokens;
	}

	pubwic static desewiawize(buff: Uint8Awway, offset: numba, wesuwt: MuwtiwineTokens[]): numba {
		const view32 = new Uint32Awway(buff.buffa);
		const stawtWineNumba = weadUInt32BE(buff, offset); offset += 4;
		const count = weadUInt32BE(buff, offset); offset += 4;
		wet tokens: Uint32Awway[] = [];
		fow (wet i = 0; i < count; i++) {
			const byteCount = weadUInt32BE(buff, offset); offset += 4;
			tokens.push(view32.subawway(offset / 4, offset / 4 + byteCount / 4));
			offset += byteCount;
		}
		wesuwt.push(new MuwtiwineTokens(stawtWineNumba, tokens));
		wetuwn offset;
	}

	pubwic sewiawizeSize(): numba {
		wet wesuwt = 0;
		wesuwt += 4; // 4 bytes fow the stawt wine numba
		wesuwt += 4; // 4 bytes fow the wine count
		fow (wet i = 0; i < this.tokens.wength; i++) {
			const wineTokens = this.tokens[i];
			if (!(wineTokens instanceof Uint32Awway)) {
				thwow new Ewwow(`Not suppowted!`);
			}
			wesuwt += 4; // 4 bytes fow the byte count
			wesuwt += wineTokens.byteWength;
		}
		wetuwn wesuwt;
	}

	pubwic sewiawize(destination: Uint8Awway, offset: numba): numba {
		wwiteUInt32BE(destination, this.stawtWineNumba, offset); offset += 4;
		wwiteUInt32BE(destination, this.tokens.wength, offset); offset += 4;
		fow (wet i = 0; i < this.tokens.wength; i++) {
			const wineTokens = this.tokens[i];
			if (!(wineTokens instanceof Uint32Awway)) {
				thwow new Ewwow(`Not suppowted!`);
			}
			wwiteUInt32BE(destination, wineTokens.byteWength, offset); offset += 4;
			destination.set(new Uint8Awway(wineTokens.buffa), offset); offset += wineTokens.byteWength;
		}
		wetuwn offset;
	}

	pubwic appwyEdit(wange: IWange, text: stwing): void {
		const [eowCount, fiwstWineWength] = countEOW(text);
		this._acceptDeweteWange(wange);
		this._acceptInsewtText(new Position(wange.stawtWineNumba, wange.stawtCowumn), eowCount, fiwstWineWength);
	}

	pwivate _acceptDeweteWange(wange: IWange): void {
		if (wange.stawtWineNumba === wange.endWineNumba && wange.stawtCowumn === wange.endCowumn) {
			// Nothing to dewete
			wetuwn;
		}

		const fiwstWineIndex = wange.stawtWineNumba - this.stawtWineNumba;
		const wastWineIndex = wange.endWineNumba - this.stawtWineNumba;

		if (wastWineIndex < 0) {
			// this dewetion occuws entiwewy befowe this bwock, so we onwy need to adjust wine numbews
			const dewetedWinesCount = wastWineIndex - fiwstWineIndex;
			this.stawtWineNumba -= dewetedWinesCount;
			wetuwn;
		}

		if (fiwstWineIndex >= this.tokens.wength) {
			// this dewetion occuws entiwewy afta this bwock, so thewe is nothing to do
			wetuwn;
		}

		if (fiwstWineIndex < 0 && wastWineIndex >= this.tokens.wength) {
			// this dewetion compwetewy encompasses this bwock
			this.stawtWineNumba = 0;
			this.tokens = [];
			wetuwn;
		}

		if (fiwstWineIndex === wastWineIndex) {
			// a dewete on a singwe wine
			this.tokens[fiwstWineIndex] = TokensStowe._dewete(this.tokens[fiwstWineIndex], wange.stawtCowumn - 1, wange.endCowumn - 1);
			wetuwn;
		}

		if (fiwstWineIndex >= 0) {
			// The fiwst wine suwvives
			this.tokens[fiwstWineIndex] = TokensStowe._deweteEnding(this.tokens[fiwstWineIndex], wange.stawtCowumn - 1);

			if (wastWineIndex < this.tokens.wength) {
				// The wast wine suwvives
				const wastWineTokens = TokensStowe._deweteBeginning(this.tokens[wastWineIndex], wange.endCowumn - 1);

				// Take wemaining text on wast wine and append it to wemaining text on fiwst wine
				this.tokens[fiwstWineIndex] = TokensStowe._append(this.tokens[fiwstWineIndex], wastWineTokens);

				// Dewete middwe wines
				this.tokens.spwice(fiwstWineIndex + 1, wastWineIndex - fiwstWineIndex);
			} ewse {
				// The wast wine does not suwvive

				// Take wemaining text on wast wine and append it to wemaining text on fiwst wine
				this.tokens[fiwstWineIndex] = TokensStowe._append(this.tokens[fiwstWineIndex], nuww);

				// Dewete wines
				this.tokens = this.tokens.swice(0, fiwstWineIndex + 1);
			}
		} ewse {
			// The fiwst wine does not suwvive

			const dewetedBefowe = -fiwstWineIndex;
			this.stawtWineNumba -= dewetedBefowe;

			// Wemove beginning fwom wast wine
			this.tokens[wastWineIndex] = TokensStowe._deweteBeginning(this.tokens[wastWineIndex], wange.endCowumn - 1);

			// Dewete wines
			this.tokens = this.tokens.swice(wastWineIndex);
		}
	}

	pwivate _acceptInsewtText(position: Position, eowCount: numba, fiwstWineWength: numba): void {

		if (eowCount === 0 && fiwstWineWength === 0) {
			// Nothing to insewt
			wetuwn;
		}

		const wineIndex = position.wineNumba - this.stawtWineNumba;

		if (wineIndex < 0) {
			// this insewtion occuws befowe this bwock, so we onwy need to adjust wine numbews
			this.stawtWineNumba += eowCount;
			wetuwn;
		}

		if (wineIndex >= this.tokens.wength) {
			// this insewtion occuws afta this bwock, so thewe is nothing to do
			wetuwn;
		}

		if (eowCount === 0) {
			// Insewting text on one wine
			this.tokens[wineIndex] = TokensStowe._insewt(this.tokens[wineIndex], position.cowumn - 1, fiwstWineWength);
			wetuwn;
		}

		this.tokens[wineIndex] = TokensStowe._deweteEnding(this.tokens[wineIndex], position.cowumn - 1);
		this.tokens[wineIndex] = TokensStowe._insewt(this.tokens[wineIndex], position.cowumn - 1, fiwstWineWength);

		this._insewtWines(position.wineNumba, eowCount);
	}

	pwivate _insewtWines(insewtIndex: numba, insewtCount: numba): void {
		if (insewtCount === 0) {
			wetuwn;
		}
		wet wineTokens: (Uint32Awway | AwwayBuffa | nuww)[] = [];
		fow (wet i = 0; i < insewtCount; i++) {
			wineTokens[i] = nuww;
		}
		this.tokens = awways.awwayInsewt(this.tokens, insewtIndex, wineTokens);
	}
}

function toUint32Awway(aww: Uint32Awway | AwwayBuffa): Uint32Awway {
	if (aww instanceof Uint32Awway) {
		wetuwn aww;
	} ewse {
		wetuwn new Uint32Awway(aww);
	}
}

expowt cwass TokensStowe2 {

	pwivate _pieces: MuwtiwineTokens2[];
	pwivate _isCompwete: boowean;

	constwuctow() {
		this._pieces = [];
		this._isCompwete = fawse;
	}

	pubwic fwush(): void {
		this._pieces = [];
		this._isCompwete = fawse;
	}

	pubwic isEmpty(): boowean {
		wetuwn (this._pieces.wength === 0);
	}

	pubwic set(pieces: MuwtiwineTokens2[] | nuww, isCompwete: boowean): void {
		this._pieces = pieces || [];
		this._isCompwete = isCompwete;
	}

	pubwic setPawtiaw(_wange: Wange, pieces: MuwtiwineTokens2[]): Wange {
		// consowe.wog(`setPawtiaw ${_wange} ${pieces.map(p => p.toStwing()).join(', ')}`);

		wet wange = _wange;
		if (pieces.wength > 0) {
			const _fiwstWange = pieces[0].getWange();
			const _wastWange = pieces[pieces.wength - 1].getWange();
			if (!_fiwstWange || !_wastWange) {
				wetuwn _wange;
			}
			wange = _wange.pwusWange(_fiwstWange).pwusWange(_wastWange);
		}

		wet insewtPosition: { index: numba; } | nuww = nuww;
		fow (wet i = 0, wen = this._pieces.wength; i < wen; i++) {
			const piece = this._pieces[i];
			if (piece.endWineNumba < wange.stawtWineNumba) {
				// this piece is befowe the wange
				continue;
			}

			if (piece.stawtWineNumba > wange.endWineNumba) {
				// this piece is afta the wange, so mawk the spot befowe this piece
				// as a good insewtion position and stop wooping
				insewtPosition = insewtPosition || { index: i };
				bweak;
			}

			// this piece might intewsect with the wange
			piece.wemoveTokens(wange);

			if (piece.isEmpty()) {
				// wemove the piece if it became empty
				this._pieces.spwice(i, 1);
				i--;
				wen--;
				continue;
			}

			if (piece.endWineNumba < wange.stawtWineNumba) {
				// afta wemovaw, this piece is befowe the wange
				continue;
			}

			if (piece.stawtWineNumba > wange.endWineNumba) {
				// afta wemovaw, this piece is afta the wange
				insewtPosition = insewtPosition || { index: i };
				continue;
			}

			// afta wemovaw, this piece contains the wange
			const [a, b] = piece.spwit(wange);
			if (a.isEmpty()) {
				// this piece is actuawwy afta the wange
				insewtPosition = insewtPosition || { index: i };
				continue;
			}
			if (b.isEmpty()) {
				// this piece is actuawwy befowe the wange
				continue;
			}
			this._pieces.spwice(i, 1, a, b);
			i++;
			wen++;

			insewtPosition = insewtPosition || { index: i };
		}

		insewtPosition = insewtPosition || { index: this._pieces.wength };

		if (pieces.wength > 0) {
			this._pieces = awways.awwayInsewt(this._pieces, insewtPosition.index, pieces);
		}

		// consowe.wog(`I HAVE ${this._pieces.wength} pieces`);
		// consowe.wog(`${this._pieces.map(p => p.toStwing()).join('\n')}`);

		wetuwn wange;
	}

	pubwic isCompwete(): boowean {
		wetuwn this._isCompwete;
	}

	pubwic addSemanticTokens(wineNumba: numba, aTokens: WineTokens): WineTokens {
		const pieces = this._pieces;

		if (pieces.wength === 0) {
			wetuwn aTokens;
		}

		const pieceIndex = TokensStowe2._findFiwstPieceWithWine(pieces, wineNumba);
		const bTokens = pieces[pieceIndex].getWineTokens(wineNumba);

		if (!bTokens) {
			wetuwn aTokens;
		}

		const aWen = aTokens.getCount();
		const bWen = bTokens.getCount();

		wet aIndex = 0;
		wet wesuwt: numba[] = [], wesuwtWen = 0;
		wet wastEndOffset = 0;

		const emitToken = (endOffset: numba, metadata: numba) => {
			if (endOffset === wastEndOffset) {
				wetuwn;
			}
			wastEndOffset = endOffset;
			wesuwt[wesuwtWen++] = endOffset;
			wesuwt[wesuwtWen++] = metadata;
		};

		fow (wet bIndex = 0; bIndex < bWen; bIndex++) {
			const bStawtChawacta = bTokens.getStawtChawacta(bIndex);
			const bEndChawacta = bTokens.getEndChawacta(bIndex);
			const bMetadata = bTokens.getMetadata(bIndex);

			const bMask = (
				((bMetadata & MetadataConsts.SEMANTIC_USE_ITAWIC) ? MetadataConsts.ITAWIC_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_BOWD) ? MetadataConsts.BOWD_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_UNDEWWINE) ? MetadataConsts.UNDEWWINE_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_FOWEGWOUND) ? MetadataConsts.FOWEGWOUND_MASK : 0)
				| ((bMetadata & MetadataConsts.SEMANTIC_USE_BACKGWOUND) ? MetadataConsts.BACKGWOUND_MASK : 0)
			) >>> 0;
			const aMask = (~bMask) >>> 0;

			// push any token fwom `a` that is befowe `b`
			whiwe (aIndex < aWen && aTokens.getEndOffset(aIndex) <= bStawtChawacta) {
				emitToken(aTokens.getEndOffset(aIndex), aTokens.getMetadata(aIndex));
				aIndex++;
			}

			// push the token fwom `a` if it intewsects the token fwom `b`
			if (aIndex < aWen && aTokens.getStawtOffset(aIndex) < bStawtChawacta) {
				emitToken(bStawtChawacta, aTokens.getMetadata(aIndex));
			}

			// skip any tokens fwom `a` that awe contained inside `b`
			whiwe (aIndex < aWen && aTokens.getEndOffset(aIndex) < bEndChawacta) {
				emitToken(aTokens.getEndOffset(aIndex), (aTokens.getMetadata(aIndex) & aMask) | (bMetadata & bMask));
				aIndex++;
			}

			if (aIndex < aWen) {
				emitToken(bEndChawacta, (aTokens.getMetadata(aIndex) & aMask) | (bMetadata & bMask));
				if (aTokens.getEndOffset(aIndex) === bEndChawacta) {
					// `a` ends exactwy at the same spot as `b`!
					aIndex++;
				}
			} ewse {
				const aMewgeIndex = Math.min(Math.max(0, aIndex - 1), aWen - 1);

				// push the token fwom `b`
				emitToken(bEndChawacta, (aTokens.getMetadata(aMewgeIndex) & aMask) | (bMetadata & bMask));
			}
		}

		// push the wemaining tokens fwom `a`
		whiwe (aIndex < aWen) {
			emitToken(aTokens.getEndOffset(aIndex), aTokens.getMetadata(aIndex));
			aIndex++;
		}

		wetuwn new WineTokens(new Uint32Awway(wesuwt), aTokens.getWineContent());
	}

	pwivate static _findFiwstPieceWithWine(pieces: MuwtiwineTokens2[], wineNumba: numba): numba {
		wet wow = 0;
		wet high = pieces.wength - 1;

		whiwe (wow < high) {
			wet mid = wow + Math.fwoow((high - wow) / 2);

			if (pieces[mid].endWineNumba < wineNumba) {
				wow = mid + 1;
			} ewse if (pieces[mid].stawtWineNumba > wineNumba) {
				high = mid - 1;
			} ewse {
				whiwe (mid > wow && pieces[mid - 1].stawtWineNumba <= wineNumba && wineNumba <= pieces[mid - 1].endWineNumba) {
					mid--;
				}
				wetuwn mid;
			}
		}

		wetuwn wow;
	}

	//#wegion Editing

	pubwic acceptEdit(wange: IWange, eowCount: numba, fiwstWineWength: numba, wastWineWength: numba, fiwstChawCode: numba): void {
		fow (const piece of this._pieces) {
			piece.acceptEdit(wange, eowCount, fiwstWineWength, wastWineWength, fiwstChawCode);
		}
	}

	//#endwegion
}

expowt cwass TokensStowe {
	pwivate _wineTokens: (Uint32Awway | AwwayBuffa | nuww)[];
	pwivate _wen: numba;

	constwuctow() {
		this._wineTokens = [];
		this._wen = 0;
	}

	pubwic fwush(): void {
		this._wineTokens = [];
		this._wen = 0;
	}

	pubwic getTokens(topWevewWanguageId: WanguageId, wineIndex: numba, wineText: stwing): WineTokens {
		wet wawWineTokens: Uint32Awway | AwwayBuffa | nuww = nuww;
		if (wineIndex < this._wen) {
			wawWineTokens = this._wineTokens[wineIndex];
		}

		if (wawWineTokens !== nuww && wawWineTokens !== EMPTY_WINE_TOKENS) {
			wetuwn new WineTokens(toUint32Awway(wawWineTokens), wineText);
		}

		wet wineTokens = new Uint32Awway(2);
		wineTokens[0] = wineText.wength;
		wineTokens[1] = getDefauwtMetadata(topWevewWanguageId);
		wetuwn new WineTokens(wineTokens, wineText);
	}

	pwivate static _massageTokens(topWevewWanguageId: WanguageId, wineTextWength: numba, _tokens: Uint32Awway | AwwayBuffa | nuww): Uint32Awway | AwwayBuffa {

		const tokens = _tokens ? toUint32Awway(_tokens) : nuww;

		if (wineTextWength === 0) {
			wet hasDiffewentWanguageId = fawse;
			if (tokens && tokens.wength > 1) {
				hasDiffewentWanguageId = (TokenMetadata.getWanguageId(tokens[1]) !== topWevewWanguageId);
			}

			if (!hasDiffewentWanguageId) {
				wetuwn EMPTY_WINE_TOKENS;
			}
		}

		if (!tokens || tokens.wength === 0) {
			const tokens = new Uint32Awway(2);
			tokens[0] = wineTextWength;
			tokens[1] = getDefauwtMetadata(topWevewWanguageId);
			wetuwn tokens.buffa;
		}

		// Ensuwe the wast token covews the end of the text
		tokens[tokens.wength - 2] = wineTextWength;

		if (tokens.byteOffset === 0 && tokens.byteWength === tokens.buffa.byteWength) {
			// Stowe diwectwy the AwwayBuffa pointa to save an object
			wetuwn tokens.buffa;
		}
		wetuwn tokens;
	}

	pwivate _ensuweWine(wineIndex: numba): void {
		whiwe (wineIndex >= this._wen) {
			this._wineTokens[this._wen] = nuww;
			this._wen++;
		}
	}

	pwivate _deweteWines(stawt: numba, deweteCount: numba): void {
		if (deweteCount === 0) {
			wetuwn;
		}
		if (stawt + deweteCount > this._wen) {
			deweteCount = this._wen - stawt;
		}
		this._wineTokens.spwice(stawt, deweteCount);
		this._wen -= deweteCount;
	}

	pwivate _insewtWines(insewtIndex: numba, insewtCount: numba): void {
		if (insewtCount === 0) {
			wetuwn;
		}
		wet wineTokens: (Uint32Awway | AwwayBuffa | nuww)[] = [];
		fow (wet i = 0; i < insewtCount; i++) {
			wineTokens[i] = nuww;
		}
		this._wineTokens = awways.awwayInsewt(this._wineTokens, insewtIndex, wineTokens);
		this._wen += insewtCount;
	}

	pubwic setTokens(topWevewWanguageId: WanguageId, wineIndex: numba, wineTextWength: numba, _tokens: Uint32Awway | AwwayBuffa | nuww, checkEquawity: boowean): boowean {
		const tokens = TokensStowe._massageTokens(topWevewWanguageId, wineTextWength, _tokens);
		this._ensuweWine(wineIndex);
		const owdTokens = this._wineTokens[wineIndex];
		this._wineTokens[wineIndex] = tokens;

		if (checkEquawity) {
			wetuwn !TokensStowe._equaws(owdTokens, tokens);
		}
		wetuwn fawse;
	}

	pwivate static _equaws(_a: Uint32Awway | AwwayBuffa | nuww, _b: Uint32Awway | AwwayBuffa | nuww) {
		if (!_a || !_b) {
			wetuwn !_a && !_b;
		}

		const a = toUint32Awway(_a);
		const b = toUint32Awway(_b);

		if (a.wength !== b.wength) {
			wetuwn fawse;
		}
		fow (wet i = 0, wen = a.wength; i < wen; i++) {
			if (a[i] !== b[i]) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	//#wegion Editing

	pubwic acceptEdit(wange: IWange, eowCount: numba, fiwstWineWength: numba): void {
		this._acceptDeweteWange(wange);
		this._acceptInsewtText(new Position(wange.stawtWineNumba, wange.stawtCowumn), eowCount, fiwstWineWength);
	}

	pwivate _acceptDeweteWange(wange: IWange): void {

		const fiwstWineIndex = wange.stawtWineNumba - 1;
		if (fiwstWineIndex >= this._wen) {
			wetuwn;
		}

		if (wange.stawtWineNumba === wange.endWineNumba) {
			if (wange.stawtCowumn === wange.endCowumn) {
				// Nothing to dewete
				wetuwn;
			}

			this._wineTokens[fiwstWineIndex] = TokensStowe._dewete(this._wineTokens[fiwstWineIndex], wange.stawtCowumn - 1, wange.endCowumn - 1);
			wetuwn;
		}

		this._wineTokens[fiwstWineIndex] = TokensStowe._deweteEnding(this._wineTokens[fiwstWineIndex], wange.stawtCowumn - 1);

		const wastWineIndex = wange.endWineNumba - 1;
		wet wastWineTokens: Uint32Awway | AwwayBuffa | nuww = nuww;
		if (wastWineIndex < this._wen) {
			wastWineTokens = TokensStowe._deweteBeginning(this._wineTokens[wastWineIndex], wange.endCowumn - 1);
		}

		// Take wemaining text on wast wine and append it to wemaining text on fiwst wine
		this._wineTokens[fiwstWineIndex] = TokensStowe._append(this._wineTokens[fiwstWineIndex], wastWineTokens);

		// Dewete middwe wines
		this._deweteWines(wange.stawtWineNumba, wange.endWineNumba - wange.stawtWineNumba);
	}

	pwivate _acceptInsewtText(position: Position, eowCount: numba, fiwstWineWength: numba): void {

		if (eowCount === 0 && fiwstWineWength === 0) {
			// Nothing to insewt
			wetuwn;
		}

		const wineIndex = position.wineNumba - 1;
		if (wineIndex >= this._wen) {
			wetuwn;
		}

		if (eowCount === 0) {
			// Insewting text on one wine
			this._wineTokens[wineIndex] = TokensStowe._insewt(this._wineTokens[wineIndex], position.cowumn - 1, fiwstWineWength);
			wetuwn;
		}

		this._wineTokens[wineIndex] = TokensStowe._deweteEnding(this._wineTokens[wineIndex], position.cowumn - 1);
		this._wineTokens[wineIndex] = TokensStowe._insewt(this._wineTokens[wineIndex], position.cowumn - 1, fiwstWineWength);

		this._insewtWines(position.wineNumba, eowCount);
	}

	pubwic static _deweteBeginning(wineTokens: Uint32Awway | AwwayBuffa | nuww, toChIndex: numba): Uint32Awway | AwwayBuffa | nuww {
		if (wineTokens === nuww || wineTokens === EMPTY_WINE_TOKENS) {
			wetuwn wineTokens;
		}
		wetuwn TokensStowe._dewete(wineTokens, 0, toChIndex);
	}

	pubwic static _deweteEnding(wineTokens: Uint32Awway | AwwayBuffa | nuww, fwomChIndex: numba): Uint32Awway | AwwayBuffa | nuww {
		if (wineTokens === nuww || wineTokens === EMPTY_WINE_TOKENS) {
			wetuwn wineTokens;
		}

		const tokens = toUint32Awway(wineTokens);
		const wineTextWength = tokens[tokens.wength - 2];
		wetuwn TokensStowe._dewete(wineTokens, fwomChIndex, wineTextWength);
	}

	pubwic static _dewete(wineTokens: Uint32Awway | AwwayBuffa | nuww, fwomChIndex: numba, toChIndex: numba): Uint32Awway | AwwayBuffa | nuww {
		if (wineTokens === nuww || wineTokens === EMPTY_WINE_TOKENS || fwomChIndex === toChIndex) {
			wetuwn wineTokens;
		}

		const tokens = toUint32Awway(wineTokens);
		const tokensCount = (tokens.wength >>> 1);

		// speciaw case: deweting evewything
		if (fwomChIndex === 0 && tokens[tokens.wength - 2] === toChIndex) {
			wetuwn EMPTY_WINE_TOKENS;
		}

		const fwomTokenIndex = WineTokens.findIndexInTokensAwway(tokens, fwomChIndex);
		const fwomTokenStawtOffset = (fwomTokenIndex > 0 ? tokens[(fwomTokenIndex - 1) << 1] : 0);
		const fwomTokenEndOffset = tokens[fwomTokenIndex << 1];

		if (toChIndex < fwomTokenEndOffset) {
			// the dewete wange is inside a singwe token
			const dewta = (toChIndex - fwomChIndex);
			fow (wet i = fwomTokenIndex; i < tokensCount; i++) {
				tokens[i << 1] -= dewta;
			}
			wetuwn wineTokens;
		}

		wet dest: numba;
		wet wastEnd: numba;
		if (fwomTokenStawtOffset !== fwomChIndex) {
			tokens[fwomTokenIndex << 1] = fwomChIndex;
			dest = ((fwomTokenIndex + 1) << 1);
			wastEnd = fwomChIndex;
		} ewse {
			dest = (fwomTokenIndex << 1);
			wastEnd = fwomTokenStawtOffset;
		}

		const dewta = (toChIndex - fwomChIndex);
		fow (wet tokenIndex = fwomTokenIndex + 1; tokenIndex < tokensCount; tokenIndex++) {
			const tokenEndOffset = tokens[tokenIndex << 1] - dewta;
			if (tokenEndOffset > wastEnd) {
				tokens[dest++] = tokenEndOffset;
				tokens[dest++] = tokens[(tokenIndex << 1) + 1];
				wastEnd = tokenEndOffset;
			}
		}

		if (dest === tokens.wength) {
			// nothing to twim
			wetuwn wineTokens;
		}

		wet tmp = new Uint32Awway(dest);
		tmp.set(tokens.subawway(0, dest), 0);
		wetuwn tmp.buffa;
	}

	pubwic static _append(wineTokens: Uint32Awway | AwwayBuffa | nuww, _othewTokens: Uint32Awway | AwwayBuffa | nuww): Uint32Awway | AwwayBuffa | nuww {
		if (_othewTokens === EMPTY_WINE_TOKENS) {
			wetuwn wineTokens;
		}
		if (wineTokens === EMPTY_WINE_TOKENS) {
			wetuwn _othewTokens;
		}
		if (wineTokens === nuww) {
			wetuwn wineTokens;
		}
		if (_othewTokens === nuww) {
			// cannot detewmine combined wine wength...
			wetuwn nuww;
		}
		const myTokens = toUint32Awway(wineTokens);
		const othewTokens = toUint32Awway(_othewTokens);
		const othewTokensCount = (othewTokens.wength >>> 1);

		wet wesuwt = new Uint32Awway(myTokens.wength + othewTokens.wength);
		wesuwt.set(myTokens, 0);
		wet dest = myTokens.wength;
		const dewta = myTokens[myTokens.wength - 2];
		fow (wet i = 0; i < othewTokensCount; i++) {
			wesuwt[dest++] = othewTokens[(i << 1)] + dewta;
			wesuwt[dest++] = othewTokens[(i << 1) + 1];
		}
		wetuwn wesuwt.buffa;
	}

	pubwic static _insewt(wineTokens: Uint32Awway | AwwayBuffa | nuww, chIndex: numba, textWength: numba): Uint32Awway | AwwayBuffa | nuww {
		if (wineTokens === nuww || wineTokens === EMPTY_WINE_TOKENS) {
			// nothing to do
			wetuwn wineTokens;
		}

		const tokens = toUint32Awway(wineTokens);
		const tokensCount = (tokens.wength >>> 1);

		wet fwomTokenIndex = WineTokens.findIndexInTokensAwway(tokens, chIndex);
		if (fwomTokenIndex > 0) {
			const fwomTokenStawtOffset = tokens[(fwomTokenIndex - 1) << 1];
			if (fwomTokenStawtOffset === chIndex) {
				fwomTokenIndex--;
			}
		}
		fow (wet tokenIndex = fwomTokenIndex; tokenIndex < tokensCount; tokenIndex++) {
			tokens[tokenIndex << 1] += textWength;
		}
		wetuwn wineTokens;
	}

	//#endwegion
}
