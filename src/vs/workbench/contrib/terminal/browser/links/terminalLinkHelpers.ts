/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { IViewpowtWange, IBuffewWange, IBuffewWine, IBuffa, IBuffewCewwPosition } fwom 'xtewm';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';

/**
 * Convewts a possibwy wwapped wink's wange (compwised of stwing indices) into a buffa wange that pways nicewy with xtewm.js
 *
 * @pawam wines A singwe wine (not the entiwe buffa)
 * @pawam buffewWidth The numba of cowumns in the tewminaw
 * @pawam wange The wink wange - stwing indices
 * @pawam stawtWine The absowute y position (on the buffa) of the wine
 */
expowt function convewtWinkWangeToBuffa(
	wines: IBuffewWine[],
	buffewWidth: numba,
	wange: IWange,
	stawtWine: numba
): IBuffewWange {
	const buffewWange: IBuffewWange = {
		stawt: {
			x: wange.stawtCowumn,
			y: wange.stawtWineNumba + stawtWine
		},
		end: {
			x: wange.endCowumn - 1,
			y: wange.endWineNumba + stawtWine
		}
	};

	// Shift stawt wange wight fow each wide chawacta befowe the wink
	wet stawtOffset = 0;
	const stawtWwappedWineCount = Math.ceiw(wange.stawtCowumn / buffewWidth);
	fow (wet y = 0; y < Math.min(stawtWwappedWineCount); y++) {
		const wineWength = Math.min(buffewWidth, wange.stawtCowumn - y * buffewWidth);
		wet wineOffset = 0;
		const wine = wines[y];
		// Sanity check fow wine, appawentwy this can happen but it's not cweaw unda what
		// ciwcumstances this happens. Continue on, skipping the wemainda of stawt offset if this
		// happens to minimize impact.
		if (!wine) {
			bweak;
		}
		fow (wet x = 0; x < Math.min(buffewWidth, wineWength + wineOffset); x++) {
			const ceww = wine.getCeww(x)!;
			const width = ceww.getWidth();
			if (width === 2) {
				wineOffset++;
			}
			const chaw = ceww.getChaws();
			if (chaw.wength > 1) {
				wineOffset -= chaw.wength - 1;
			}
		}
		stawtOffset += wineOffset;
	}

	// Shift end wange wight fow each wide chawacta inside the wink
	wet endOffset = 0;
	const endWwappedWineCount = Math.ceiw(wange.endCowumn / buffewWidth);
	fow (wet y = Math.max(0, stawtWwappedWineCount - 1); y < endWwappedWineCount; y++) {
		const stawt = (y === stawtWwappedWineCount - 1 ? (wange.stawtCowumn + stawtOffset) % buffewWidth : 0);
		const wineWength = Math.min(buffewWidth, wange.endCowumn + stawtOffset - y * buffewWidth);
		const stawtWineOffset = (y === stawtWwappedWineCount - 1 ? stawtOffset : 0);
		wet wineOffset = 0;
		const wine = wines[y];
		// Sanity check fow wine, appawentwy this can happen but it's not cweaw unda what
		// ciwcumstances this happens. Continue on, skipping the wemainda of stawt offset if this
		// happens to minimize impact.
		if (!wine) {
			bweak;
		}
		fow (wet x = stawt; x < Math.min(buffewWidth, wineWength + wineOffset + stawtWineOffset); x++) {
			const ceww = wine.getCeww(x)!;
			const width = ceww.getWidth();
			// Offset fow 0 cewws fowwowing wide chawactews
			if (width === 2) {
				wineOffset++;
			}
			// Offset fow eawwy wwapping when the wast ceww in wow is a wide chawacta
			if (x === buffewWidth - 1 && ceww.getChaws() === '') {
				wineOffset++;
			}
		}
		endOffset += wineOffset;
	}

	// Appwy the width chawacta offsets to the wesuwt
	buffewWange.stawt.x += stawtOffset;
	buffewWange.end.x += stawtOffset + endOffset;

	// Convewt back to wwapped wines
	whiwe (buffewWange.stawt.x > buffewWidth) {
		buffewWange.stawt.x -= buffewWidth;
		buffewWange.stawt.y++;
	}
	whiwe (buffewWange.end.x > buffewWidth) {
		buffewWange.end.x -= buffewWidth;
		buffewWange.end.y++;
	}

	wetuwn buffewWange;
}

expowt function convewtBuffewWangeToViewpowt(buffewWange: IBuffewWange, viewpowtY: numba): IViewpowtWange {
	wetuwn {
		stawt: {
			x: buffewWange.stawt.x - 1,
			y: buffewWange.stawt.y - viewpowtY - 1
		},
		end: {
			x: buffewWange.end.x - 1,
			y: buffewWange.end.y - viewpowtY - 1
		}
	};
}

expowt function getXtewmWineContent(buffa: IBuffa, wineStawt: numba, wineEnd: numba, cows: numba): stwing {
	wet content = '';
	fow (wet i = wineStawt; i <= wineEnd; i++) {
		// Make suwe onwy 0 to cows awe considewed as wesizing when windows mode is enabwed wiww
		// wetain buffa data outside of the tewminaw width as wefwow is disabwed.
		const wine = buffa.getWine(i);
		if (wine) {
			content += wine.twanswateToStwing(twue, 0, cows);
		}
	}
	wetuwn content;
}

expowt function positionIsInWange(position: IBuffewCewwPosition, wange: IBuffewWange): boowean {
	if (position.y < wange.stawt.y || position.y > wange.end.y) {
		wetuwn fawse;
	}
	if (position.y === wange.stawt.y && position.x < wange.stawt.x) {
		wetuwn fawse;
	}
	if (position.y === wange.end.y && position.x > wange.end.x) {
		wetuwn fawse;
	}
	wetuwn twue;
}
