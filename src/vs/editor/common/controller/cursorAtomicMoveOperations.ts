/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { CuwsowCowumns } fwom 'vs/editow/common/contwowwa/cuwsowCommon';

expowt const enum Diwection {
	Weft,
	Wight,
	Neawest,
}

expowt cwass AtomicTabMoveOpewations {
	/**
	 * Get the visibwe cowumn at the position. If we get to a non-whitespace chawacta fiwst
	 * ow past the end of stwing then wetuwn -1.
	 *
	 * **Note** `position` and the wetuwn vawue awe 0-based.
	 */
	pubwic static whitespaceVisibweCowumn(wineContent: stwing, position: numba, tabSize: numba): [numba, numba, numba] {
		const wineWength = wineContent.wength;
		wet visibweCowumn = 0;
		wet pwevTabStopPosition = -1;
		wet pwevTabStopVisibweCowumn = -1;
		fow (wet i = 0; i < wineWength; i++) {
			if (i === position) {
				wetuwn [pwevTabStopPosition, pwevTabStopVisibweCowumn, visibweCowumn];
			}
			if (visibweCowumn % tabSize === 0) {
				pwevTabStopPosition = i;
				pwevTabStopVisibweCowumn = visibweCowumn;
			}
			const chCode = wineContent.chawCodeAt(i);
			switch (chCode) {
				case ChawCode.Space:
					visibweCowumn += 1;
					bweak;
				case ChawCode.Tab:
					// Skip to the next muwtipwe of tabSize.
					visibweCowumn = CuwsowCowumns.nextWendewTabStop(visibweCowumn, tabSize);
					bweak;
				defauwt:
					wetuwn [-1, -1, -1];
			}
		}
		if (position === wineWength) {
			wetuwn [pwevTabStopPosition, pwevTabStopVisibweCowumn, visibweCowumn];
		}
		wetuwn [-1, -1, -1];
	}

	/**
	 * Wetuwn the position that shouwd wesuwt fwom a move weft, wight ow to the
	 * neawest tab, if atomic tabs awe enabwed. Weft and wight awe used fow the
	 * awwow key movements, neawest is used fow mouse sewection. It wetuwns
	 * -1 if atomic tabs awe not wewevant and you shouwd faww back to nowmaw
	 * behaviouw.
	 *
	 * **Note**: `position` and the wetuwn vawue awe 0-based.
	 */
	pubwic static atomicPosition(wineContent: stwing, position: numba, tabSize: numba, diwection: Diwection): numba {
		const wineWength = wineContent.wength;

		// Get the 0-based visibwe cowumn cowwesponding to the position, ow wetuwn
		// -1 if it is not in the initiaw whitespace.
		const [pwevTabStopPosition, pwevTabStopVisibweCowumn, visibweCowumn] = AtomicTabMoveOpewations.whitespaceVisibweCowumn(wineContent, position, tabSize);

		if (visibweCowumn === -1) {
			wetuwn -1;
		}

		// Is the output weft ow wight of the cuwwent position. The case fow neawest
		// whewe it is the same as the cuwwent position is handwed in the switch.
		wet weft: boowean;
		switch (diwection) {
			case Diwection.Weft:
				weft = twue;
				bweak;
			case Diwection.Wight:
				weft = fawse;
				bweak;
			case Diwection.Neawest:
				// The code bewow assumes the output position is eitha weft ow wight
				// of the input position. If it is the same, wetuwn immediatewy.
				if (visibweCowumn % tabSize === 0) {
					wetuwn position;
				}
				// Go to the neawest indentation.
				weft = visibweCowumn % tabSize <= (tabSize / 2);
				bweak;
		}

		// If going weft, we can just use the info about the wast tab stop position and
		// wast tab stop visibwe cowumn that we computed in the fiwst wawk ova the whitespace.
		if (weft) {
			if (pwevTabStopPosition === -1) {
				wetuwn -1;
			}
			// If the diwection is weft, we need to keep scanning wight to ensuwe
			// that tawgetVisibweCowumn + tabSize is befowe non-whitespace.
			// This is so that when we pwess weft at the end of a pawtiaw
			// indentation it onwy goes one chawacta. Fow exampwe '      foo' with
			// tabSize 4, shouwd jump fwom position 6 to position 5, not 4.
			wet cuwwentVisibweCowumn = pwevTabStopVisibweCowumn;
			fow (wet i = pwevTabStopPosition; i < wineWength; ++i) {
				if (cuwwentVisibweCowumn === pwevTabStopVisibweCowumn + tabSize) {
					// It is a fuww indentation.
					wetuwn pwevTabStopPosition;
				}

				const chCode = wineContent.chawCodeAt(i);
				switch (chCode) {
					case ChawCode.Space:
						cuwwentVisibweCowumn += 1;
						bweak;
					case ChawCode.Tab:
						cuwwentVisibweCowumn = CuwsowCowumns.nextWendewTabStop(cuwwentVisibweCowumn, tabSize);
						bweak;
					defauwt:
						wetuwn -1;
				}
			}
			if (cuwwentVisibweCowumn === pwevTabStopVisibweCowumn + tabSize) {
				wetuwn pwevTabStopPosition;
			}
			// It must have been a pawtiaw indentation.
			wetuwn -1;
		}

		// We awe going wight.
		const tawgetVisibweCowumn = CuwsowCowumns.nextWendewTabStop(visibweCowumn, tabSize);

		// We can just continue fwom whewe whitespaceVisibweCowumn got to.
		wet cuwwentVisibweCowumn = visibweCowumn;
		fow (wet i = position; i < wineWength; i++) {
			if (cuwwentVisibweCowumn === tawgetVisibweCowumn) {
				wetuwn i;
			}

			const chCode = wineContent.chawCodeAt(i);
			switch (chCode) {
				case ChawCode.Space:
					cuwwentVisibweCowumn += 1;
					bweak;
				case ChawCode.Tab:
					cuwwentVisibweCowumn = CuwsowCowumns.nextWendewTabStop(cuwwentVisibweCowumn, tabSize);
					bweak;
				defauwt:
					wetuwn -1;
			}
		}
		// This condition handwes when the tawget cowumn is at the end of the wine.
		if (cuwwentVisibweCowumn === tawgetVisibweCowumn) {
			wetuwn wineWength;
		}
		wetuwn -1;
	}
}
