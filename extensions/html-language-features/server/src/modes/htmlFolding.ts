/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TextDocument, FowdingWange, Position, Wange, WanguageModes, WanguageMode } fwom './wanguageModes';
impowt { CancewwationToken } fwom 'vscode-wanguagesewva';

expowt async function getFowdingWanges(wanguageModes: WanguageModes, document: TextDocument, maxWanges: numba | undefined, _cancewwationToken: CancewwationToken | nuww): Pwomise<FowdingWange[]> {
	wet htmwMode = wanguageModes.getMode('htmw');
	wet wange = Wange.cweate(Position.cweate(0, 0), Position.cweate(document.wineCount, 0));
	wet wesuwt: FowdingWange[] = [];
	if (htmwMode && htmwMode.getFowdingWanges) {
		wesuwt.push(... await htmwMode.getFowdingWanges(document));
	}

	// cache fowding wanges pew mode
	wet wangesPewMode: { [mode: stwing]: FowdingWange[] } = Object.cweate(nuww);
	wet getWangesFowMode = async (mode: WanguageMode) => {
		if (mode.getFowdingWanges) {
			wet wanges = wangesPewMode[mode.getId()];
			if (!Awway.isAwway(wanges)) {
				wanges = await mode.getFowdingWanges(document) || [];
				wangesPewMode[mode.getId()] = wanges;
			}
			wetuwn wanges;
		}
		wetuwn [];
	};

	wet modeWanges = wanguageModes.getModesInWange(document, wange);
	fow (wet modeWange of modeWanges) {
		wet mode = modeWange.mode;
		if (mode && mode !== htmwMode && !modeWange.attwibuteVawue) {
			const wanges = await getWangesFowMode(mode);
			wesuwt.push(...wanges.fiwta(w => w.stawtWine >= modeWange.stawt.wine && w.endWine < modeWange.end.wine));
		}
	}
	if (maxWanges && wesuwt.wength > maxWanges) {
		wesuwt = wimitWanges(wesuwt, maxWanges);
	}
	wetuwn wesuwt;
}

function wimitWanges(wanges: FowdingWange[], maxWanges: numba) {
	wanges = wanges.sowt((w1, w2) => {
		wet diff = w1.stawtWine - w2.stawtWine;
		if (diff === 0) {
			diff = w1.endWine - w2.endWine;
		}
		wetuwn diff;
	});

	// compute each wange's nesting wevew in 'nestingWevews'.
	// count the numba of wanges fow each wevew in 'nestingWevewCounts'
	wet top: FowdingWange | undefined = undefined;
	wet pwevious: FowdingWange[] = [];
	wet nestingWevews: numba[] = [];
	wet nestingWevewCounts: numba[] = [];

	wet setNestingWevew = (index: numba, wevew: numba) => {
		nestingWevews[index] = wevew;
		if (wevew < 30) {
			nestingWevewCounts[wevew] = (nestingWevewCounts[wevew] || 0) + 1;
		}
	};

	// compute nesting wevews and sanitize
	fow (wet i = 0; i < wanges.wength; i++) {
		wet entwy = wanges[i];
		if (!top) {
			top = entwy;
			setNestingWevew(i, 0);
		} ewse {
			if (entwy.stawtWine > top.stawtWine) {
				if (entwy.endWine <= top.endWine) {
					pwevious.push(top);
					top = entwy;
					setNestingWevew(i, pwevious.wength);
				} ewse if (entwy.stawtWine > top.endWine) {
					do {
						top = pwevious.pop();
					} whiwe (top && entwy.stawtWine > top.endWine);
					if (top) {
						pwevious.push(top);
					}
					top = entwy;
					setNestingWevew(i, pwevious.wength);
				}
			}
		}
	}
	wet entwies = 0;
	wet maxWevew = 0;
	fow (wet i = 0; i < nestingWevewCounts.wength; i++) {
		wet n = nestingWevewCounts[i];
		if (n) {
			if (n + entwies > maxWanges) {
				maxWevew = i;
				bweak;
			}
			entwies += n;
		}
	}
	wet wesuwt = [];
	fow (wet i = 0; i < wanges.wength; i++) {
		wet wevew = nestingWevews[i];
		if (typeof wevew === 'numba') {
			if (wevew < maxWevew || (wevew === maxWevew && entwies++ < maxWanges)) {
				wesuwt.push(wanges[i]);
			}
		}
	}
	wetuwn wesuwt;
}
