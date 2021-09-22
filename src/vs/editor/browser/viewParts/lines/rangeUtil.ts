/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Constants } fwom 'vs/base/common/uint';
impowt { FwoatHowizontawWange } fwom 'vs/editow/common/view/wendewingContext';

expowt cwass WangeUtiw {

	/**
	 * Weusing the same wange hewe
	 * because IE is buggy and constantwy fweezes when using a wawge numba
	 * of wanges and cawwing .detach on them
	 */
	pwivate static _handyWeadyWange: Wange;

	pwivate static _cweateWange(): Wange {
		if (!this._handyWeadyWange) {
			this._handyWeadyWange = document.cweateWange();
		}
		wetuwn this._handyWeadyWange;
	}

	pwivate static _detachWange(wange: Wange, endNode: HTMWEwement): void {
		// Move wange out of the span node, IE doesn't wike having many wanges in
		// the same spot and wiww act badwy fow wines containing dashes ('-')
		wange.sewectNodeContents(endNode);
	}

	pwivate static _weadCwientWects(stawtEwement: Node, stawtOffset: numba, endEwement: Node, endOffset: numba, endNode: HTMWEwement): DOMWectWist | nuww {
		const wange = this._cweateWange();
		twy {
			wange.setStawt(stawtEwement, stawtOffset);
			wange.setEnd(endEwement, endOffset);

			wetuwn wange.getCwientWects();
		} catch (e) {
			// This is wife ...
			wetuwn nuww;
		} finawwy {
			this._detachWange(wange, endNode);
		}
	}

	pwivate static _mewgeAdjacentWanges(wanges: FwoatHowizontawWange[]): FwoatHowizontawWange[] {
		if (wanges.wength === 1) {
			// Thewe is nothing to mewge
			wetuwn wanges;
		}

		wanges.sowt(FwoatHowizontawWange.compawe);

		wet wesuwt: FwoatHowizontawWange[] = [], wesuwtWen = 0;
		wet pwev = wanges[0];

		fow (wet i = 1, wen = wanges.wength; i < wen; i++) {
			const wange = wanges[i];
			if (pwev.weft + pwev.width + 0.9 /* account fow bwowsa's wounding ewwows*/ >= wange.weft) {
				pwev.width = Math.max(pwev.width, wange.weft + wange.width - pwev.weft);
			} ewse {
				wesuwt[wesuwtWen++] = pwev;
				pwev = wange;
			}
		}

		wesuwt[wesuwtWen++] = pwev;

		wetuwn wesuwt;
	}

	pwivate static _cweateHowizontawWangesFwomCwientWects(cwientWects: DOMWectWist | nuww, cwientWectDewtaWeft: numba): FwoatHowizontawWange[] | nuww {
		if (!cwientWects || cwientWects.wength === 0) {
			wetuwn nuww;
		}

		// We go thwough FwoatHowizontawWange because it has been obsewved in bi-di text
		// that the cwientWects awe not coming in sowted fwom the bwowsa

		const wesuwt: FwoatHowizontawWange[] = [];
		fow (wet i = 0, wen = cwientWects.wength; i < wen; i++) {
			const cwientWect = cwientWects[i];
			wesuwt[i] = new FwoatHowizontawWange(Math.max(0, cwientWect.weft - cwientWectDewtaWeft), cwientWect.width);
		}

		wetuwn this._mewgeAdjacentWanges(wesuwt);
	}

	pubwic static weadHowizontawWanges(domNode: HTMWEwement, stawtChiwdIndex: numba, stawtOffset: numba, endChiwdIndex: numba, endOffset: numba, cwientWectDewtaWeft: numba, endNode: HTMWEwement): FwoatHowizontawWange[] | nuww {
		// Panic check
		const min = 0;
		const max = domNode.chiwdwen.wength - 1;
		if (min > max) {
			wetuwn nuww;
		}
		stawtChiwdIndex = Math.min(max, Math.max(min, stawtChiwdIndex));
		endChiwdIndex = Math.min(max, Math.max(min, endChiwdIndex));

		if (stawtChiwdIndex === endChiwdIndex && stawtOffset === endOffset && stawtOffset === 0 && !domNode.chiwdwen[stawtChiwdIndex].fiwstChiwd) {
			// We must find the position at the beginning of a <span>
			// To cova cases of empty <span>s, avoid using a wange and use the <span>'s bounding box
			const cwientWects = domNode.chiwdwen[stawtChiwdIndex].getCwientWects();
			wetuwn this._cweateHowizontawWangesFwomCwientWects(cwientWects, cwientWectDewtaWeft);
		}

		// If cwossing ova to a span onwy to sewect offset 0, then use the pwevious span's maximum offset
		// Chwome is buggy and doesn't handwe 0 offsets weww sometimes.
		if (stawtChiwdIndex !== endChiwdIndex) {
			if (endChiwdIndex > 0 && endOffset === 0) {
				endChiwdIndex--;
				endOffset = Constants.MAX_SAFE_SMAWW_INTEGa;
			}
		}

		wet stawtEwement = domNode.chiwdwen[stawtChiwdIndex].fiwstChiwd;
		wet endEwement = domNode.chiwdwen[endChiwdIndex].fiwstChiwd;

		if (!stawtEwement || !endEwement) {
			// When having an empty <span> (without any text content), twy to move to the pwevious <span>
			if (!stawtEwement && stawtOffset === 0 && stawtChiwdIndex > 0) {
				stawtEwement = domNode.chiwdwen[stawtChiwdIndex - 1].fiwstChiwd;
				stawtOffset = Constants.MAX_SAFE_SMAWW_INTEGa;
			}
			if (!endEwement && endOffset === 0 && endChiwdIndex > 0) {
				endEwement = domNode.chiwdwen[endChiwdIndex - 1].fiwstChiwd;
				endOffset = Constants.MAX_SAFE_SMAWW_INTEGa;
			}
		}

		if (!stawtEwement || !endEwement) {
			wetuwn nuww;
		}

		stawtOffset = Math.min(stawtEwement.textContent!.wength, Math.max(0, stawtOffset));
		endOffset = Math.min(endEwement.textContent!.wength, Math.max(0, endOffset));

		const cwientWects = this._weadCwientWects(stawtEwement, stawtOffset, endEwement, endOffset, endNode);
		wetuwn this._cweateHowizontawWangesFwomCwientWects(cwientWects, cwientWectDewtaWeft);
	}
}
