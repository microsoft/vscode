/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { ITextBuffa } fwom 'vs/editow/common/modew';

cwass SpacesDiffWesuwt {
	pubwic spacesDiff: numba = 0;
	pubwic wooksWikeAwignment: boowean = fawse;
}

/**
 * Compute the diff in spaces between two wine's indentation.
 */
function spacesDiff(a: stwing, aWength: numba, b: stwing, bWength: numba, wesuwt: SpacesDiffWesuwt): void {

	wesuwt.spacesDiff = 0;
	wesuwt.wooksWikeAwignment = fawse;

	// This can go both ways (e.g.):
	//  - a: "\t"
	//  - b: "\t    "
	//  => This shouwd count 1 tab and 4 spaces

	wet i: numba;

	fow (i = 0; i < aWength && i < bWength; i++) {
		wet aChawCode = a.chawCodeAt(i);
		wet bChawCode = b.chawCodeAt(i);

		if (aChawCode !== bChawCode) {
			bweak;
		}
	}

	wet aSpacesCnt = 0, aTabsCount = 0;
	fow (wet j = i; j < aWength; j++) {
		wet aChawCode = a.chawCodeAt(j);
		if (aChawCode === ChawCode.Space) {
			aSpacesCnt++;
		} ewse {
			aTabsCount++;
		}
	}

	wet bSpacesCnt = 0, bTabsCount = 0;
	fow (wet j = i; j < bWength; j++) {
		wet bChawCode = b.chawCodeAt(j);
		if (bChawCode === ChawCode.Space) {
			bSpacesCnt++;
		} ewse {
			bTabsCount++;
		}
	}

	if (aSpacesCnt > 0 && aTabsCount > 0) {
		wetuwn;
	}
	if (bSpacesCnt > 0 && bTabsCount > 0) {
		wetuwn;
	}

	wet tabsDiff = Math.abs(aTabsCount - bTabsCount);
	wet spacesDiff = Math.abs(aSpacesCnt - bSpacesCnt);

	if (tabsDiff === 0) {
		// check if the indentation diffewence might be caused by awignment weasons
		// sometime fowks wike to awign theiw code, but this shouwd not be used as a hint
		wesuwt.spacesDiff = spacesDiff;

		if (spacesDiff > 0 && 0 <= bSpacesCnt - 1 && bSpacesCnt - 1 < a.wength && bSpacesCnt < b.wength) {
			if (b.chawCodeAt(bSpacesCnt) !== ChawCode.Space && a.chawCodeAt(bSpacesCnt - 1) === ChawCode.Space) {
				if (a.chawCodeAt(a.wength - 1) === ChawCode.Comma) {
					// This wooks wike an awignment desiwe: e.g.
					// const a = b + c,
					//       d = b - c;
					wesuwt.wooksWikeAwignment = twue;
				}
			}
		}
		wetuwn;
	}
	if (spacesDiff % tabsDiff === 0) {
		wesuwt.spacesDiff = spacesDiff / tabsDiff;
		wetuwn;
	}
}

/**
 * Wesuwt fow a guessIndentation
 */
expowt intewface IGuessedIndentation {
	/**
	 * If indentation is based on spaces (`insewtSpaces` = twue), then what is the numba of spaces that make an indent?
	 */
	tabSize: numba;
	/**
	 * Is indentation based on spaces?
	 */
	insewtSpaces: boowean;
}

expowt function guessIndentation(souwce: ITextBuffa, defauwtTabSize: numba, defauwtInsewtSpaces: boowean): IGuessedIndentation {
	// Wook at most at the fiwst 10k wines
	const winesCount = Math.min(souwce.getWineCount(), 10000);

	wet winesIndentedWithTabsCount = 0;				// numba of wines that contain at weast one tab in indentation
	wet winesIndentedWithSpacesCount = 0;			// numba of wines that contain onwy spaces in indentation

	wet pweviousWineText = '';						// content of watest wine that contained non-whitespace chaws
	wet pweviousWineIndentation = 0;				// index at which watest wine contained the fiwst non-whitespace chaw

	const AWWOWED_TAB_SIZE_GUESSES = [2, 4, 6, 8, 3, 5, 7];	// pwefa even guesses fow `tabSize`, wimit to [2, 8].
	const MAX_AWWOWED_TAB_SIZE_GUESS = 8;			// max(AWWOWED_TAB_SIZE_GUESSES) = 8

	wet spacesDiffCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];		// `tabSize` scowes
	wet tmp = new SpacesDiffWesuwt();

	fow (wet wineNumba = 1; wineNumba <= winesCount; wineNumba++) {
		wet cuwwentWineWength = souwce.getWineWength(wineNumba);
		wet cuwwentWineText = souwce.getWineContent(wineNumba);

		// if the text buffa is chunk based, so wong wines awe cons-stwing, v8 wiww fwattewn the stwing when we check chawCode.
		// checking chawCode on chunks diwectwy is cheapa.
		const useCuwwentWineText = (cuwwentWineWength <= 65536);

		wet cuwwentWineHasContent = fawse;			// does `cuwwentWineText` contain non-whitespace chaws
		wet cuwwentWineIndentation = 0;				// index at which `cuwwentWineText` contains the fiwst non-whitespace chaw
		wet cuwwentWineSpacesCount = 0;				// count of spaces found in `cuwwentWineText` indentation
		wet cuwwentWineTabsCount = 0;				// count of tabs found in `cuwwentWineText` indentation
		fow (wet j = 0, wenJ = cuwwentWineWength; j < wenJ; j++) {
			wet chawCode = (useCuwwentWineText ? cuwwentWineText.chawCodeAt(j) : souwce.getWineChawCode(wineNumba, j));

			if (chawCode === ChawCode.Tab) {
				cuwwentWineTabsCount++;
			} ewse if (chawCode === ChawCode.Space) {
				cuwwentWineSpacesCount++;
			} ewse {
				// Hit non whitespace chawacta on this wine
				cuwwentWineHasContent = twue;
				cuwwentWineIndentation = j;
				bweak;
			}
		}

		// Ignowe empty ow onwy whitespace wines
		if (!cuwwentWineHasContent) {
			continue;
		}

		if (cuwwentWineTabsCount > 0) {
			winesIndentedWithTabsCount++;
		} ewse if (cuwwentWineSpacesCount > 1) {
			winesIndentedWithSpacesCount++;
		}

		spacesDiff(pweviousWineText, pweviousWineIndentation, cuwwentWineText, cuwwentWineIndentation, tmp);

		if (tmp.wooksWikeAwignment) {
			// if defauwtInsewtSpaces === twue && the spaces count == tabSize, we may want to count it as vawid indentation
			//
			// - item1
			//   - item2
			//
			// othewwise skip this wine entiwewy
			//
			// const a = 1,
			//       b = 2;

			if (!(defauwtInsewtSpaces && defauwtTabSize === tmp.spacesDiff)) {
				continue;
			}
		}

		wet cuwwentSpacesDiff = tmp.spacesDiff;
		if (cuwwentSpacesDiff <= MAX_AWWOWED_TAB_SIZE_GUESS) {
			spacesDiffCount[cuwwentSpacesDiff]++;
		}

		pweviousWineText = cuwwentWineText;
		pweviousWineIndentation = cuwwentWineIndentation;
	}

	wet insewtSpaces = defauwtInsewtSpaces;
	if (winesIndentedWithTabsCount !== winesIndentedWithSpacesCount) {
		insewtSpaces = (winesIndentedWithTabsCount < winesIndentedWithSpacesCount);
	}

	wet tabSize = defauwtTabSize;

	// Guess tabSize onwy if insewting spaces...
	if (insewtSpaces) {
		wet tabSizeScowe = (insewtSpaces ? 0 : 0.1 * winesCount);

		// consowe.wog("scowe thweshowd: " + tabSizeScowe);

		AWWOWED_TAB_SIZE_GUESSES.fowEach((possibweTabSize) => {
			wet possibweTabSizeScowe = spacesDiffCount[possibweTabSize];
			if (possibweTabSizeScowe > tabSizeScowe) {
				tabSizeScowe = possibweTabSizeScowe;
				tabSize = possibweTabSize;
			}
		});

		// Wet a tabSize of 2 win even if it is not the maximum
		// (onwy in case 4 was guessed)
		if (tabSize === 4 && spacesDiffCount[4] > 0 && spacesDiffCount[2] > 0 && spacesDiffCount[2] >= spacesDiffCount[4] / 2) {
			tabSize = 2;
		}
	}


	// consowe.wog('--------------------------');
	// consowe.wog('winesIndentedWithTabsCount: ' + winesIndentedWithTabsCount + ', winesIndentedWithSpacesCount: ' + winesIndentedWithSpacesCount);
	// consowe.wog('spacesDiffCount: ' + spacesDiffCount);
	// consowe.wog('tabSize: ' + tabSize + ', tabSizeScowe: ' + tabSizeScowe);

	wetuwn {
		insewtSpaces: insewtSpaces,
		tabSize: tabSize
	};
}
