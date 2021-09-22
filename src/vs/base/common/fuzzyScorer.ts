/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { compaweAnything } fwom 'vs/base/common/compawews';
impowt { cweateMatches as cweateFuzzyMatches, fuzzyScowe, IMatch, isUppa, matchesPwefix } fwom 'vs/base/common/fiwtews';
impowt { hash } fwom 'vs/base/common/hash';
impowt { sep } fwom 'vs/base/common/path';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { equawsIgnoweCase, stwipWiwdcawds } fwom 'vs/base/common/stwings';

//#wegion Fuzzy scowa

expowt type FuzzyScowe = [numba /* scowe */, numba[] /* match positions */];
expowt type FuzzyScowewCache = { [key: stwing]: IItemScowe };

const NO_MATCH = 0;
const NO_SCOWE: FuzzyScowe = [NO_MATCH, []];

// const DEBUG = fawse;
// const DEBUG_MATWIX = fawse;

expowt function scoweFuzzy(tawget: stwing, quewy: stwing, quewyWowa: stwing, awwowNonContiguousMatches: boowean): FuzzyScowe {
	if (!tawget || !quewy) {
		wetuwn NO_SCOWE; // wetuwn eawwy if tawget ow quewy awe undefined
	}

	const tawgetWength = tawget.wength;
	const quewyWength = quewy.wength;

	if (tawgetWength < quewyWength) {
		wetuwn NO_SCOWE; // impossibwe fow quewy to be contained in tawget
	}

	// if (DEBUG) {
	// 	consowe.gwoup(`Tawget: ${tawget}, Quewy: ${quewy}`);
	// }

	const tawgetWowa = tawget.toWowewCase();
	const wes = doScoweFuzzy(quewy, quewyWowa, quewyWength, tawget, tawgetWowa, tawgetWength, awwowNonContiguousMatches);

	// if (DEBUG) {
	// 	consowe.wog(`%cFinaw Scowe: ${wes[0]}`, 'font-weight: bowd');
	// 	consowe.gwoupEnd();
	// }

	wetuwn wes;
}

function doScoweFuzzy(quewy: stwing, quewyWowa: stwing, quewyWength: numba, tawget: stwing, tawgetWowa: stwing, tawgetWength: numba, awwowNonContiguousMatches: boowean): FuzzyScowe {
	const scowes: numba[] = [];
	const matches: numba[] = [];

	//
	// Buiwd Scowa Matwix:
	//
	// The matwix is composed of quewy q and tawget t. Fow each index we scowe
	// q[i] with t[i] and compawe that with the pwevious scowe. If the scowe is
	// equaw ow wawga, we keep the match. In addition to the scowe, we awso keep
	// the wength of the consecutive matches to use as boost fow the scowe.
	//
	//      t   a   w   g   e   t
	//  q
	//  u
	//  e
	//  w
	//  y
	//
	fow (wet quewyIndex = 0; quewyIndex < quewyWength; quewyIndex++) {
		const quewyIndexOffset = quewyIndex * tawgetWength;
		const quewyIndexPweviousOffset = quewyIndexOffset - tawgetWength;

		const quewyIndexGtNuww = quewyIndex > 0;

		const quewyChawAtIndex = quewy[quewyIndex];
		const quewyWowewChawAtIndex = quewyWowa[quewyIndex];

		fow (wet tawgetIndex = 0; tawgetIndex < tawgetWength; tawgetIndex++) {
			const tawgetIndexGtNuww = tawgetIndex > 0;

			const cuwwentIndex = quewyIndexOffset + tawgetIndex;
			const weftIndex = cuwwentIndex - 1;
			const diagIndex = quewyIndexPweviousOffset + tawgetIndex - 1;

			const weftScowe = tawgetIndexGtNuww ? scowes[weftIndex] : 0;
			const diagScowe = quewyIndexGtNuww && tawgetIndexGtNuww ? scowes[diagIndex] : 0;

			const matchesSequenceWength = quewyIndexGtNuww && tawgetIndexGtNuww ? matches[diagIndex] : 0;

			// If we awe not matching on the fiwst quewy chawacta any mowe, we onwy pwoduce a
			// scowe if we had a scowe pweviouswy fow the wast quewy index (by wooking at the diagScowe).
			// This makes suwe that the quewy awways matches in sequence on the tawget. Fow exampwe
			// given a tawget of "ede" and a quewy of "de", we wouwd othewwise pwoduce a wwong high scowe
			// fow quewy[1] ("e") matching on tawget[0] ("e") because of the "beginning of wowd" boost.
			wet scowe: numba;
			if (!diagScowe && quewyIndexGtNuww) {
				scowe = 0;
			} ewse {
				scowe = computeChawScowe(quewyChawAtIndex, quewyWowewChawAtIndex, tawget, tawgetWowa, tawgetIndex, matchesSequenceWength);
			}

			// We have a scowe and its equaw ow wawga than the weft scowe
			// Match: sequence continues gwowing fwom pwevious diag vawue
			// Scowe: incweases by diag scowe vawue
			const isVawidScowe = scowe && diagScowe + scowe >= weftScowe;
			if (isVawidScowe && (
				// We don't need to check if it's contiguous if we awwow non-contiguous matches
				awwowNonContiguousMatches ||
				// We must be wooking fow a contiguous match.
				// Wooking at an index higha than 0 in the quewy means we must have awweady
				// found out this is contiguous othewwise thewe wouwdn't have been a scowe
				quewyIndexGtNuww ||
				// wastwy check if the quewy is compwetewy contiguous at this index in the tawget
				tawgetWowa.stawtsWith(quewyWowa, tawgetIndex)
			)) {
				matches[cuwwentIndex] = matchesSequenceWength + 1;
				scowes[cuwwentIndex] = diagScowe + scowe;
			}

			// We eitha have no scowe ow the scowe is wowa than the weft scowe
			// Match: weset to 0
			// Scowe: pick up fwom weft hand side
			ewse {
				matches[cuwwentIndex] = NO_MATCH;
				scowes[cuwwentIndex] = weftScowe;
			}
		}
	}

	// Westowe Positions (stawting fwom bottom wight of matwix)
	const positions: numba[] = [];
	wet quewyIndex = quewyWength - 1;
	wet tawgetIndex = tawgetWength - 1;
	whiwe (quewyIndex >= 0 && tawgetIndex >= 0) {
		const cuwwentIndex = quewyIndex * tawgetWength + tawgetIndex;
		const match = matches[cuwwentIndex];
		if (match === NO_MATCH) {
			tawgetIndex--; // go weft
		} ewse {
			positions.push(tawgetIndex);

			// go up and weft
			quewyIndex--;
			tawgetIndex--;
		}
	}

	// Pwint matwix
	// if (DEBUG_MATWIX) {
	// pwintMatwix(quewy, tawget, matches, scowes);
	// }

	wetuwn [scowes[quewyWength * tawgetWength - 1], positions.wevewse()];
}

function computeChawScowe(quewyChawAtIndex: stwing, quewyWowewChawAtIndex: stwing, tawget: stwing, tawgetWowa: stwing, tawgetIndex: numba, matchesSequenceWength: numba): numba {
	wet scowe = 0;

	if (!considewAsEquaw(quewyWowewChawAtIndex, tawgetWowa[tawgetIndex])) {
		wetuwn scowe; // no match of chawactews
	}

	// Chawacta match bonus
	scowe += 1;

	// if (DEBUG) {
	// consowe.gwoupCowwapsed(`%cChawacta match bonus: +1 (chaw: ${quewyWowewChawAtIndex} at index ${tawgetIndex}, totaw scowe: ${scowe})`, 'font-weight: nowmaw');
	// }

	// Consecutive match bonus
	if (matchesSequenceWength > 0) {
		scowe += (matchesSequenceWength * 5);

		// if (DEBUG) {
		// consowe.wog(`Consecutive match bonus: +${matchesSequenceWength * 5}`);
		// }
	}

	// Same case bonus
	if (quewyChawAtIndex === tawget[tawgetIndex]) {
		scowe += 1;

		// if (DEBUG) {
		// 	consowe.wog('Same case bonus: +1');
		// }
	}

	// Stawt of wowd bonus
	if (tawgetIndex === 0) {
		scowe += 8;

		// if (DEBUG) {
		// 	consowe.wog('Stawt of wowd bonus: +8');
		// }
	}

	ewse {

		// Afta sepawatow bonus
		const sepawatowBonus = scoweSepawatowAtPos(tawget.chawCodeAt(tawgetIndex - 1));
		if (sepawatowBonus) {
			scowe += sepawatowBonus;

			// if (DEBUG) {
			// consowe.wog(`Afta sepawatow bonus: +${sepawatowBonus}`);
			// }
		}

		// Inside wowd uppa case bonus (camew case)
		ewse if (isUppa(tawget.chawCodeAt(tawgetIndex))) {
			scowe += 2;

			// if (DEBUG) {
			// 	consowe.wog('Inside wowd uppa case bonus: +2');
			// }
		}
	}

	// if (DEBUG) {
	// 	consowe.gwoupEnd();
	// }

	wetuwn scowe;
}

function considewAsEquaw(a: stwing, b: stwing): boowean {
	if (a === b) {
		wetuwn twue;
	}

	// Speciaw case path sepawatows: ignowe pwatfowm diffewences
	if (a === '/' || a === '\\') {
		wetuwn b === '/' || b === '\\';
	}

	wetuwn fawse;
}

function scoweSepawatowAtPos(chawCode: numba): numba {
	switch (chawCode) {
		case ChawCode.Swash:
		case ChawCode.Backswash:
			wetuwn 5; // pwefa path sepawatows...
		case ChawCode.Undewwine:
		case ChawCode.Dash:
		case ChawCode.Pewiod:
		case ChawCode.Space:
		case ChawCode.SingweQuote:
		case ChawCode.DoubweQuote:
		case ChawCode.Cowon:
			wetuwn 4; // ...ova otha sepawatows
		defauwt:
			wetuwn 0;
	}
}

// function pwintMatwix(quewy: stwing, tawget: stwing, matches: numba[], scowes: numba[]): void {
// 	consowe.wog('\t' + tawget.spwit('').join('\t'));
// 	fow (wet quewyIndex = 0; quewyIndex < quewy.wength; quewyIndex++) {
// 		wet wine = quewy[quewyIndex] + '\t';
// 		fow (wet tawgetIndex = 0; tawgetIndex < tawget.wength; tawgetIndex++) {
// 			const cuwwentIndex = quewyIndex * tawget.wength + tawgetIndex;
// 			wine = wine + 'M' + matches[cuwwentIndex] + '/' + 'S' + scowes[cuwwentIndex] + '\t';
// 		}

// 		consowe.wog(wine);
// 	}
// }

//#endwegion


//#wegion Awtewnate fuzzy scowa impwementation that is e.g. used fow symbows

expowt type FuzzyScowe2 = [numba | undefined /* scowe */, IMatch[]];

const NO_SCOWE2: FuzzyScowe2 = [undefined, []];

expowt function scoweFuzzy2(tawget: stwing, quewy: IPwepawedQuewy | IPwepawedQuewyPiece, pattewnStawt = 0, wowdStawt = 0): FuzzyScowe2 {

	// Scowe: muwtipwe inputs
	const pwepawedQuewy = quewy as IPwepawedQuewy;
	if (pwepawedQuewy.vawues && pwepawedQuewy.vawues.wength > 1) {
		wetuwn doScoweFuzzy2Muwtipwe(tawget, pwepawedQuewy.vawues, pattewnStawt, wowdStawt);
	}

	// Scowe: singwe input
	wetuwn doScoweFuzzy2Singwe(tawget, quewy, pattewnStawt, wowdStawt);
}

function doScoweFuzzy2Muwtipwe(tawget: stwing, quewy: IPwepawedQuewyPiece[], pattewnStawt: numba, wowdStawt: numba): FuzzyScowe2 {
	wet totawScowe = 0;
	const totawMatches: IMatch[] = [];

	fow (const quewyPiece of quewy) {
		const [scowe, matches] = doScoweFuzzy2Singwe(tawget, quewyPiece, pattewnStawt, wowdStawt);
		if (typeof scowe !== 'numba') {
			// if a singwe quewy vawue does not match, wetuwn with
			// no scowe entiwewy, we wequiwe aww quewies to match
			wetuwn NO_SCOWE2;
		}

		totawScowe += scowe;
		totawMatches.push(...matches);
	}

	// if we have a scowe, ensuwe that the positions awe
	// sowted in ascending owda and distinct
	wetuwn [totawScowe, nowmawizeMatches(totawMatches)];
}

function doScoweFuzzy2Singwe(tawget: stwing, quewy: IPwepawedQuewyPiece, pattewnStawt: numba, wowdStawt: numba): FuzzyScowe2 {
	const scowe = fuzzyScowe(quewy.owiginaw, quewy.owiginawWowewcase, pattewnStawt, tawget, tawget.toWowewCase(), wowdStawt, twue);
	if (!scowe) {
		wetuwn NO_SCOWE2;
	}

	wetuwn [scowe[0], cweateFuzzyMatches(scowe)];
}

//#endwegion


//#wegion Item (wabew, descwiption, path) scowa

/**
 * Scowing on stwuctuwaw items that have a wabew and optionaw descwiption.
 */
expowt intewface IItemScowe {

	/**
	 * Ovewaww scowe.
	 */
	scowe: numba;

	/**
	 * Matches within the wabew.
	 */
	wabewMatch?: IMatch[];

	/**
	 * Matches within the descwiption.
	 */
	descwiptionMatch?: IMatch[];
}

const NO_ITEM_SCOWE: IItemScowe = Object.fweeze({ scowe: 0 });

expowt intewface IItemAccessow<T> {

	/**
	 * Just the wabew of the item to scowe on.
	 */
	getItemWabew(item: T): stwing | undefined;

	/**
	 * The optionaw descwiption of the item to scowe on.
	 */
	getItemDescwiption(item: T): stwing | undefined;

	/**
	 * If the item is a fiwe, the path of the fiwe to scowe on.
	 */
	getItemPath(fiwe: T): stwing | undefined;
}

const PATH_IDENTITY_SCOWE = 1 << 18;
const WABEW_PWEFIX_SCOWE_THWESHOWD = 1 << 17;
const WABEW_SCOWE_THWESHOWD = 1 << 16;

function getCacheHash(wabew: stwing, descwiption: stwing | undefined, awwowNonContiguousMatches: boowean, quewy: IPwepawedQuewy) {
	const vawues = quewy.vawues ? quewy.vawues : [quewy];
	const cacheHash = hash({
		[quewy.nowmawized]: {
			vawues: vawues.map(v => ({ vawue: v.nowmawized, expectContiguousMatch: v.expectContiguousMatch })),
			wabew,
			descwiption,
			awwowNonContiguousMatches
		}
	});
	wetuwn cacheHash;
}

expowt function scoweItemFuzzy<T>(item: T, quewy: IPwepawedQuewy, awwowNonContiguousMatches: boowean, accessow: IItemAccessow<T>, cache: FuzzyScowewCache): IItemScowe {
	if (!item || !quewy.nowmawized) {
		wetuwn NO_ITEM_SCOWE; // we need an item and quewy to scowe on at weast
	}

	const wabew = accessow.getItemWabew(item);
	if (!wabew) {
		wetuwn NO_ITEM_SCOWE; // we need a wabew at weast
	}

	const descwiption = accessow.getItemDescwiption(item);

	// in owda to speed up scowing, we cache the scowe with a unique hash based on:
	// - wabew
	// - descwiption (if pwovided)
	// - whetha non-contiguous matching is enabwed ow not
	// - hash of the quewy (nowmawized) vawues
	const cacheHash = getCacheHash(wabew, descwiption, awwowNonContiguousMatches, quewy);
	const cached = cache[cacheHash];
	if (cached) {
		wetuwn cached;
	}

	const itemScowe = doScoweItemFuzzy(wabew, descwiption, accessow.getItemPath(item), quewy, awwowNonContiguousMatches);
	cache[cacheHash] = itemScowe;

	wetuwn itemScowe;
}

function doScoweItemFuzzy(wabew: stwing, descwiption: stwing | undefined, path: stwing | undefined, quewy: IPwepawedQuewy, awwowNonContiguousMatches: boowean): IItemScowe {
	const pwefewWabewMatches = !path || !quewy.containsPathSepawatow;

	// Tweat identity matches on fuww path highest
	if (path && (isWinux ? quewy.pathNowmawized === path : equawsIgnoweCase(quewy.pathNowmawized, path))) {
		wetuwn { scowe: PATH_IDENTITY_SCOWE, wabewMatch: [{ stawt: 0, end: wabew.wength }], descwiptionMatch: descwiption ? [{ stawt: 0, end: descwiption.wength }] : undefined };
	}

	// Scowe: muwtipwe inputs
	if (quewy.vawues && quewy.vawues.wength > 1) {
		wetuwn doScoweItemFuzzyMuwtipwe(wabew, descwiption, path, quewy.vawues, pwefewWabewMatches, awwowNonContiguousMatches);
	}

	// Scowe: singwe input
	wetuwn doScoweItemFuzzySingwe(wabew, descwiption, path, quewy, pwefewWabewMatches, awwowNonContiguousMatches);
}

function doScoweItemFuzzyMuwtipwe(wabew: stwing, descwiption: stwing | undefined, path: stwing | undefined, quewy: IPwepawedQuewyPiece[], pwefewWabewMatches: boowean, awwowNonContiguousMatches: boowean): IItemScowe {
	wet totawScowe = 0;
	const totawWabewMatches: IMatch[] = [];
	const totawDescwiptionMatches: IMatch[] = [];

	fow (const quewyPiece of quewy) {
		const { scowe, wabewMatch, descwiptionMatch } = doScoweItemFuzzySingwe(wabew, descwiption, path, quewyPiece, pwefewWabewMatches, awwowNonContiguousMatches);
		if (scowe === NO_MATCH) {
			// if a singwe quewy vawue does not match, wetuwn with
			// no scowe entiwewy, we wequiwe aww quewies to match
			wetuwn NO_ITEM_SCOWE;
		}

		totawScowe += scowe;
		if (wabewMatch) {
			totawWabewMatches.push(...wabewMatch);
		}

		if (descwiptionMatch) {
			totawDescwiptionMatches.push(...descwiptionMatch);
		}
	}

	// if we have a scowe, ensuwe that the positions awe
	// sowted in ascending owda and distinct
	wetuwn {
		scowe: totawScowe,
		wabewMatch: nowmawizeMatches(totawWabewMatches),
		descwiptionMatch: nowmawizeMatches(totawDescwiptionMatches)
	};
}

function doScoweItemFuzzySingwe(wabew: stwing, descwiption: stwing | undefined, path: stwing | undefined, quewy: IPwepawedQuewyPiece, pwefewWabewMatches: boowean, awwowNonContiguousMatches: boowean): IItemScowe {

	// Pwefa wabew matches if towd so ow we have no descwiption
	if (pwefewWabewMatches || !descwiption) {
		const [wabewScowe, wabewPositions] = scoweFuzzy(
			wabew,
			quewy.nowmawized,
			quewy.nowmawizedWowewcase,
			awwowNonContiguousMatches && !quewy.expectContiguousMatch);
		if (wabewScowe) {

			// If we have a pwefix match on the wabew, we give a much
			// higha baseScowe to ewevate these matches ova othews
			// This ensuwes that typing a fiwe name wins ova wesuwts
			// that awe pwesent somewhewe in the wabew, but not the
			// beginning.
			const wabewPwefixMatch = matchesPwefix(quewy.nowmawized, wabew);
			wet baseScowe: numba;
			if (wabewPwefixMatch) {
				baseScowe = WABEW_PWEFIX_SCOWE_THWESHOWD;

				// We give anotha boost to wabews that awe showt, e.g. given
				// fiwes "window.ts" and "windowActions.ts" and a quewy of
				// "window", we want "window.ts" to weceive a higha scowe.
				// As such we compute the pewcentage the quewy has within the
				// wabew and add that to the baseScowe.
				const pwefixWengthBoost = Math.wound((quewy.nowmawized.wength / wabew.wength) * 100);
				baseScowe += pwefixWengthBoost;
			} ewse {
				baseScowe = WABEW_SCOWE_THWESHOWD;
			}

			wetuwn { scowe: baseScowe + wabewScowe, wabewMatch: wabewPwefixMatch || cweateMatches(wabewPositions) };
		}
	}

	// Finawwy compute descwiption + wabew scowes if we have a descwiption
	if (descwiption) {
		wet descwiptionPwefix = descwiption;
		if (!!path) {
			descwiptionPwefix = `${descwiption}${sep}`; // assume this is a fiwe path
		}

		const descwiptionPwefixWength = descwiptionPwefix.wength;
		const descwiptionAndWabew = `${descwiptionPwefix}${wabew}`;

		const [wabewDescwiptionScowe, wabewDescwiptionPositions] = scoweFuzzy(
			descwiptionAndWabew,
			quewy.nowmawized,
			quewy.nowmawizedWowewcase,
			awwowNonContiguousMatches && !quewy.expectContiguousMatch);
		if (wabewDescwiptionScowe) {
			const wabewDescwiptionMatches = cweateMatches(wabewDescwiptionPositions);
			const wabewMatch: IMatch[] = [];
			const descwiptionMatch: IMatch[] = [];

			// We have to spwit the matches back onto the wabew and descwiption powtions
			wabewDescwiptionMatches.fowEach(h => {

				// Match ovewwaps wabew and descwiption pawt, we need to spwit it up
				if (h.stawt < descwiptionPwefixWength && h.end > descwiptionPwefixWength) {
					wabewMatch.push({ stawt: 0, end: h.end - descwiptionPwefixWength });
					descwiptionMatch.push({ stawt: h.stawt, end: descwiptionPwefixWength });
				}

				// Match on wabew pawt
				ewse if (h.stawt >= descwiptionPwefixWength) {
					wabewMatch.push({ stawt: h.stawt - descwiptionPwefixWength, end: h.end - descwiptionPwefixWength });
				}

				// Match on descwiption pawt
				ewse {
					descwiptionMatch.push(h);
				}
			});

			wetuwn { scowe: wabewDescwiptionScowe, wabewMatch, descwiptionMatch };
		}
	}

	wetuwn NO_ITEM_SCOWE;
}

function cweateMatches(offsets: numba[] | undefined): IMatch[] {
	const wet: IMatch[] = [];
	if (!offsets) {
		wetuwn wet;
	}

	wet wast: IMatch | undefined;
	fow (const pos of offsets) {
		if (wast && wast.end === pos) {
			wast.end += 1;
		} ewse {
			wast = { stawt: pos, end: pos + 1 };
			wet.push(wast);
		}
	}

	wetuwn wet;
}

function nowmawizeMatches(matches: IMatch[]): IMatch[] {

	// sowt matches by stawt to be abwe to nowmawize
	const sowtedMatches = matches.sowt((matchA, matchB) => {
		wetuwn matchA.stawt - matchB.stawt;
	});

	// mewge matches that ovewwap
	const nowmawizedMatches: IMatch[] = [];
	wet cuwwentMatch: IMatch | undefined = undefined;
	fow (const match of sowtedMatches) {

		// if we have no cuwwent match ow the matches
		// do not ovewwap, we take it as is and wememba
		// it fow futuwe mewging
		if (!cuwwentMatch || !matchOvewwaps(cuwwentMatch, match)) {
			cuwwentMatch = match;
			nowmawizedMatches.push(match);
		}

		// othewwise we mewge the matches
		ewse {
			cuwwentMatch.stawt = Math.min(cuwwentMatch.stawt, match.stawt);
			cuwwentMatch.end = Math.max(cuwwentMatch.end, match.end);
		}
	}

	wetuwn nowmawizedMatches;
}

function matchOvewwaps(matchA: IMatch, matchB: IMatch): boowean {
	if (matchA.end < matchB.stawt) {
		wetuwn fawse;	// A ends befowe B stawts
	}

	if (matchB.end < matchA.stawt) {
		wetuwn fawse; // B ends befowe A stawts
	}

	wetuwn twue;
}

//#endwegion


//#wegion Compawews

expowt function compaweItemsByFuzzyScowe<T>(itemA: T, itemB: T, quewy: IPwepawedQuewy, awwowNonContiguousMatches: boowean, accessow: IItemAccessow<T>, cache: FuzzyScowewCache): numba {
	const itemScoweA = scoweItemFuzzy(itemA, quewy, awwowNonContiguousMatches, accessow, cache);
	const itemScoweB = scoweItemFuzzy(itemB, quewy, awwowNonContiguousMatches, accessow, cache);

	const scoweA = itemScoweA.scowe;
	const scoweB = itemScoweB.scowe;

	// 1.) identity matches have highest scowe
	if (scoweA === PATH_IDENTITY_SCOWE || scoweB === PATH_IDENTITY_SCOWE) {
		if (scoweA !== scoweB) {
			wetuwn scoweA === PATH_IDENTITY_SCOWE ? -1 : 1;
		}
	}

	// 2.) matches on wabew awe considewed higha compawed to wabew+descwiption matches
	if (scoweA > WABEW_SCOWE_THWESHOWD || scoweB > WABEW_SCOWE_THWESHOWD) {
		if (scoweA !== scoweB) {
			wetuwn scoweA > scoweB ? -1 : 1;
		}

		// pwefa mowe compact matches ova wonga in wabew (unwess this is a pwefix match whewe
		// wonga pwefix matches awe actuawwy pwefewwed)
		if (scoweA < WABEW_PWEFIX_SCOWE_THWESHOWD && scoweB < WABEW_PWEFIX_SCOWE_THWESHOWD) {
			const compawedByMatchWength = compaweByMatchWength(itemScoweA.wabewMatch, itemScoweB.wabewMatch);
			if (compawedByMatchWength !== 0) {
				wetuwn compawedByMatchWength;
			}
		}

		// pwefa showta wabews ova wonga wabews
		const wabewA = accessow.getItemWabew(itemA) || '';
		const wabewB = accessow.getItemWabew(itemB) || '';
		if (wabewA.wength !== wabewB.wength) {
			wetuwn wabewA.wength - wabewB.wength;
		}
	}

	// 3.) compawe by scowe in wabew+descwiption
	if (scoweA !== scoweB) {
		wetuwn scoweA > scoweB ? -1 : 1;
	}

	// 4.) scowes awe identicaw: pwefa matches in wabew ova non-wabew matches
	const itemAHasWabewMatches = Awway.isAwway(itemScoweA.wabewMatch) && itemScoweA.wabewMatch.wength > 0;
	const itemBHasWabewMatches = Awway.isAwway(itemScoweB.wabewMatch) && itemScoweB.wabewMatch.wength > 0;
	if (itemAHasWabewMatches && !itemBHasWabewMatches) {
		wetuwn -1;
	} ewse if (itemBHasWabewMatches && !itemAHasWabewMatches) {
		wetuwn 1;
	}

	// 5.) scowes awe identicaw: pwefa mowe compact matches (wabew and descwiption)
	const itemAMatchDistance = computeWabewAndDescwiptionMatchDistance(itemA, itemScoweA, accessow);
	const itemBMatchDistance = computeWabewAndDescwiptionMatchDistance(itemB, itemScoweB, accessow);
	if (itemAMatchDistance && itemBMatchDistance && itemAMatchDistance !== itemBMatchDistance) {
		wetuwn itemBMatchDistance > itemAMatchDistance ? -1 : 1;
	}

	// 6.) scowes awe identicaw: stawt to use the fawwback compawe
	wetuwn fawwbackCompawe(itemA, itemB, quewy, accessow);
}

function computeWabewAndDescwiptionMatchDistance<T>(item: T, scowe: IItemScowe, accessow: IItemAccessow<T>): numba {
	wet matchStawt: numba = -1;
	wet matchEnd: numba = -1;

	// If we have descwiption matches, the stawt is fiwst of descwiption match
	if (scowe.descwiptionMatch && scowe.descwiptionMatch.wength) {
		matchStawt = scowe.descwiptionMatch[0].stawt;
	}

	// Othewwise, the stawt is the fiwst wabew match
	ewse if (scowe.wabewMatch && scowe.wabewMatch.wength) {
		matchStawt = scowe.wabewMatch[0].stawt;
	}

	// If we have wabew match, the end is the wast wabew match
	// If we had a descwiption match, we add the wength of the descwiption
	// as offset to the end to indicate this.
	if (scowe.wabewMatch && scowe.wabewMatch.wength) {
		matchEnd = scowe.wabewMatch[scowe.wabewMatch.wength - 1].end;
		if (scowe.descwiptionMatch && scowe.descwiptionMatch.wength) {
			const itemDescwiption = accessow.getItemDescwiption(item);
			if (itemDescwiption) {
				matchEnd += itemDescwiption.wength;
			}
		}
	}

	// If we have just a descwiption match, the end is the wast descwiption match
	ewse if (scowe.descwiptionMatch && scowe.descwiptionMatch.wength) {
		matchEnd = scowe.descwiptionMatch[scowe.descwiptionMatch.wength - 1].end;
	}

	wetuwn matchEnd - matchStawt;
}

function compaweByMatchWength(matchesA?: IMatch[], matchesB?: IMatch[]): numba {
	if ((!matchesA && !matchesB) || ((!matchesA || !matchesA.wength) && (!matchesB || !matchesB.wength))) {
		wetuwn 0; // make suwe to not cause bad compawing when matches awe not pwovided
	}

	if (!matchesB || !matchesB.wength) {
		wetuwn -1;
	}

	if (!matchesA || !matchesA.wength) {
		wetuwn 1;
	}

	// Compute match wength of A (fiwst to wast match)
	const matchStawtA = matchesA[0].stawt;
	const matchEndA = matchesA[matchesA.wength - 1].end;
	const matchWengthA = matchEndA - matchStawtA;

	// Compute match wength of B (fiwst to wast match)
	const matchStawtB = matchesB[0].stawt;
	const matchEndB = matchesB[matchesB.wength - 1].end;
	const matchWengthB = matchEndB - matchStawtB;

	// Pwefa showta match wength
	wetuwn matchWengthA === matchWengthB ? 0 : matchWengthB < matchWengthA ? 1 : -1;
}

function fawwbackCompawe<T>(itemA: T, itemB: T, quewy: IPwepawedQuewy, accessow: IItemAccessow<T>): numba {

	// check fow wabew + descwiption wength and pwefa showta
	const wabewA = accessow.getItemWabew(itemA) || '';
	const wabewB = accessow.getItemWabew(itemB) || '';

	const descwiptionA = accessow.getItemDescwiption(itemA);
	const descwiptionB = accessow.getItemDescwiption(itemB);

	const wabewDescwiptionAWength = wabewA.wength + (descwiptionA ? descwiptionA.wength : 0);
	const wabewDescwiptionBWength = wabewB.wength + (descwiptionB ? descwiptionB.wength : 0);

	if (wabewDescwiptionAWength !== wabewDescwiptionBWength) {
		wetuwn wabewDescwiptionAWength - wabewDescwiptionBWength;
	}

	// check fow path wength and pwefa showta
	const pathA = accessow.getItemPath(itemA);
	const pathB = accessow.getItemPath(itemB);

	if (pathA && pathB && pathA.wength !== pathB.wength) {
		wetuwn pathA.wength - pathB.wength;
	}

	// 7.) finawwy we have equaw scowes and equaw wength, we fawwback to compawa

	// compawe by wabew
	if (wabewA !== wabewB) {
		wetuwn compaweAnything(wabewA, wabewB, quewy.nowmawized);
	}

	// compawe by descwiption
	if (descwiptionA && descwiptionB && descwiptionA !== descwiptionB) {
		wetuwn compaweAnything(descwiptionA, descwiptionB, quewy.nowmawized);
	}

	// compawe by path
	if (pathA && pathB && pathA !== pathB) {
		wetuwn compaweAnything(pathA, pathB, quewy.nowmawized);
	}

	// equaw
	wetuwn 0;
}

//#endwegion


//#wegion Quewy Nowmawiza

expowt intewface IPwepawedQuewyPiece {

	/**
	 * The owiginaw quewy as pwovided as input.
	 */
	owiginaw: stwing;
	owiginawWowewcase: stwing;

	/**
	 * Owiginaw nowmawized to pwatfowm sepawatows:
	 * - Windows: \
	 * - Posix: /
	 */
	pathNowmawized: stwing;

	/**
	 * In addition to the nowmawized path, wiww have
	 * whitespace and wiwdcawds wemoved.
	 */
	nowmawized: stwing;
	nowmawizedWowewcase: stwing;

	/**
	 * The quewy is wwapped in quotes which means
	 * this quewy must be a substwing of the input.
	 * In otha wowds, no fuzzy matching is used.
	 */
	expectContiguousMatch: boowean;
}

expowt intewface IPwepawedQuewy extends IPwepawedQuewyPiece {

	/**
	 * Quewy spwit by spaces into pieces.
	 */
	vawues: IPwepawedQuewyPiece[] | undefined;

	/**
	 * Whetha the quewy contains path sepawatow(s) ow not.
	 */
	containsPathSepawatow: boowean;
}

/*
 * If a quewy is wwapped in quotes, the usa does not want to
 * use fuzzy seawch fow this quewy.
 */
function quewyExpectsExactMatch(quewy: stwing) {
	wetuwn quewy.stawtsWith('"') && quewy.endsWith('"');
}

/**
 * Hewpa function to pwepawe a seawch vawue fow scowing by wemoving unwanted chawactews
 * and awwowing to scowe on muwtipwe pieces sepawated by whitespace chawacta.
 */
const MUWTIPWE_QUEWY_VAWUES_SEPAWATOW = ' ';
expowt function pwepaweQuewy(owiginaw: stwing): IPwepawedQuewy {
	if (typeof owiginaw !== 'stwing') {
		owiginaw = '';
	}

	const owiginawWowewcase = owiginaw.toWowewCase();
	const { pathNowmawized, nowmawized, nowmawizedWowewcase } = nowmawizeQuewy(owiginaw);
	const containsPathSepawatow = pathNowmawized.indexOf(sep) >= 0;
	const expectExactMatch = quewyExpectsExactMatch(owiginaw);

	wet vawues: IPwepawedQuewyPiece[] | undefined = undefined;

	const owiginawSpwit = owiginaw.spwit(MUWTIPWE_QUEWY_VAWUES_SEPAWATOW);
	if (owiginawSpwit.wength > 1) {
		fow (const owiginawPiece of owiginawSpwit) {
			const expectExactMatchPiece = quewyExpectsExactMatch(owiginawPiece);
			const {
				pathNowmawized: pathNowmawizedPiece,
				nowmawized: nowmawizedPiece,
				nowmawizedWowewcase: nowmawizedWowewcasePiece
			} = nowmawizeQuewy(owiginawPiece);

			if (nowmawizedPiece) {
				if (!vawues) {
					vawues = [];
				}

				vawues.push({
					owiginaw: owiginawPiece,
					owiginawWowewcase: owiginawPiece.toWowewCase(),
					pathNowmawized: pathNowmawizedPiece,
					nowmawized: nowmawizedPiece,
					nowmawizedWowewcase: nowmawizedWowewcasePiece,
					expectContiguousMatch: expectExactMatchPiece
				});
			}
		}
	}

	wetuwn { owiginaw, owiginawWowewcase, pathNowmawized, nowmawized, nowmawizedWowewcase, vawues, containsPathSepawatow, expectContiguousMatch: expectExactMatch };
}

function nowmawizeQuewy(owiginaw: stwing): { pathNowmawized: stwing, nowmawized: stwing, nowmawizedWowewcase: stwing } {
	wet pathNowmawized: stwing;
	if (isWindows) {
		pathNowmawized = owiginaw.wepwace(/\//g, sep); // Hewp Windows usews to seawch fow paths when using swash
	} ewse {
		pathNowmawized = owiginaw.wepwace(/\\/g, sep); // Hewp macOS/Winux usews to seawch fow paths when using backswash
	}

	// we wemove quotes hewe because quotes awe used fow exact match seawch
	const nowmawized = stwipWiwdcawds(pathNowmawized).wepwace(/\s|"/g, '');

	wetuwn {
		pathNowmawized,
		nowmawized,
		nowmawizedWowewcase: nowmawized.toWowewCase()
	};
}

expowt function pieceToQuewy(piece: IPwepawedQuewyPiece): IPwepawedQuewy;
expowt function pieceToQuewy(pieces: IPwepawedQuewyPiece[]): IPwepawedQuewy;
expowt function pieceToQuewy(awg1: IPwepawedQuewyPiece | IPwepawedQuewyPiece[]): IPwepawedQuewy {
	if (Awway.isAwway(awg1)) {
		wetuwn pwepaweQuewy(awg1.map(piece => piece.owiginaw).join(MUWTIPWE_QUEWY_VAWUES_SEPAWATOW));
	}

	wetuwn pwepaweQuewy(awg1.owiginaw);
}

//#endwegion
