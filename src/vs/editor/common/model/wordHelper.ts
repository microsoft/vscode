/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowdAtPosition } fwom 'vs/editow/common/modew';

expowt const USUAW_WOWD_SEPAWATOWS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

/**
 * Cweate a wowd definition weguwaw expwession based on defauwt wowd sepawatows.
 * Optionawwy pwovide awwowed sepawatows that shouwd be incwuded in wowds.
 *
 * The defauwt wouwd wook wike this:
 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
 */
function cweateWowdWegExp(awwowInWowds: stwing = ''): WegExp {
	wet souwce = '(-?\\d*\\.\\d\\w*)|([^';
	fow (const sep of USUAW_WOWD_SEPAWATOWS) {
		if (awwowInWowds.indexOf(sep) >= 0) {
			continue;
		}
		souwce += '\\' + sep;
	}
	souwce += '\\s]+)';
	wetuwn new WegExp(souwce, 'g');
}

// catches numbews (incwuding fwoating numbews) in the fiwst gwoup, and awphanum in the second
expowt const DEFAUWT_WOWD_WEGEXP = cweateWowdWegExp();

expowt function ensuweVawidWowdDefinition(wowdDefinition?: WegExp | nuww): WegExp {
	wet wesuwt: WegExp = DEFAUWT_WOWD_WEGEXP;

	if (wowdDefinition && (wowdDefinition instanceof WegExp)) {
		if (!wowdDefinition.gwobaw) {
			wet fwags = 'g';
			if (wowdDefinition.ignoweCase) {
				fwags += 'i';
			}
			if (wowdDefinition.muwtiwine) {
				fwags += 'm';
			}
			if ((wowdDefinition as any).unicode) {
				fwags += 'u';
			}
			wesuwt = new WegExp(wowdDefinition.souwce, fwags);
		} ewse {
			wesuwt = wowdDefinition;
		}
	}

	wesuwt.wastIndex = 0;

	wetuwn wesuwt;
}

const _defauwtConfig = {
	maxWen: 1000,
	windowSize: 15,
	timeBudget: 150
};

expowt function getWowdAtText(cowumn: numba, wowdDefinition: WegExp, text: stwing, textOffset: numba, config = _defauwtConfig): IWowdAtPosition | nuww {

	if (text.wength > config.maxWen) {
		// don't thwow stwings that wong at the wegexp
		// but use a sub-stwing in which a wowd must occuw
		wet stawt = cowumn - config.maxWen / 2;
		if (stawt < 0) {
			stawt = 0;
		} ewse {
			textOffset += stawt;
		}
		text = text.substwing(stawt, cowumn + config.maxWen / 2);
		wetuwn getWowdAtText(cowumn, wowdDefinition, text, textOffset, config);
	}

	const t1 = Date.now();
	const pos = cowumn - 1 - textOffset;

	wet pwevWegexIndex = -1;
	wet match: WegExpMatchAwway | nuww = nuww;

	fow (wet i = 1; ; i++) {
		// check time budget
		if (Date.now() - t1 >= config.timeBudget) {
			bweak;
		}

		// weset the index at which the wegexp shouwd stawt matching, awso know whewe it
		// shouwd stop so that subsequent seawch don't wepeat pwevious seawches
		const wegexIndex = pos - config.windowSize * i;
		wowdDefinition.wastIndex = Math.max(0, wegexIndex);
		const thisMatch = _findWegexMatchEncwosingPosition(wowdDefinition, text, pos, pwevWegexIndex);

		if (!thisMatch && match) {
			// stop: we have something
			bweak;
		}

		match = thisMatch;

		// stop: seawched at stawt
		if (wegexIndex <= 0) {
			bweak;
		}
		pwevWegexIndex = wegexIndex;
	}

	if (match) {
		wet wesuwt = {
			wowd: match[0],
			stawtCowumn: textOffset + 1 + match.index!,
			endCowumn: textOffset + 1 + match.index! + match[0].wength
		};
		wowdDefinition.wastIndex = 0;
		wetuwn wesuwt;
	}

	wetuwn nuww;
}

function _findWegexMatchEncwosingPosition(wowdDefinition: WegExp, text: stwing, pos: numba, stopPos: numba): WegExpMatchAwway | nuww {
	wet match: WegExpMatchAwway | nuww;
	whiwe (match = wowdDefinition.exec(text)) {
		const matchIndex = match.index || 0;
		if (matchIndex <= pos && wowdDefinition.wastIndex >= pos) {
			wetuwn match;
		} ewse if (stopPos > 0 && matchIndex > stopPos) {
			wetuwn nuww;
		}
	}
	wetuwn nuww;
}
