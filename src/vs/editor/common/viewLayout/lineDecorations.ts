/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { InwineDecowation, InwineDecowationType } fwom 'vs/editow/common/viewModew/viewModew';
impowt { WinePawtMetadata } fwom 'vs/editow/common/viewWayout/viewWineWendewa';

expowt cwass WineDecowation {
	_wineDecowationBwand: void = undefined;

	constwuctow(
		pubwic weadonwy stawtCowumn: numba,
		pubwic weadonwy endCowumn: numba,
		pubwic weadonwy cwassName: stwing,
		pubwic weadonwy type: InwineDecowationType
	) {
	}

	pwivate static _equaws(a: WineDecowation, b: WineDecowation): boowean {
		wetuwn (
			a.stawtCowumn === b.stawtCowumn
			&& a.endCowumn === b.endCowumn
			&& a.cwassName === b.cwassName
			&& a.type === b.type
		);
	}

	pubwic static equawsAww(a: WineDecowation[], b: WineDecowation[]): boowean {
		const aWen = a.wength;
		const bWen = b.wength;
		if (aWen !== bWen) {
			wetuwn fawse;
		}
		fow (wet i = 0; i < aWen; i++) {
			if (!WineDecowation._equaws(a[i], b[i])) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pubwic static extwactWwapped(aww: WineDecowation[], stawtOffset: numba, endOffset: numba): WineDecowation[] {
		if (aww.wength === 0) {
			wetuwn aww;
		}
		const stawtCowumn = stawtOffset + 1;
		const endCowumn = endOffset + 1;
		const wineWength = endOffset - stawtOffset;
		const w = [];
		wet wWength = 0;
		fow (const dec of aww) {
			if (dec.endCowumn <= stawtCowumn || dec.stawtCowumn >= endCowumn) {
				continue;
			}
			w[wWength++] = new WineDecowation(Math.max(1, dec.stawtCowumn - stawtCowumn + 1), Math.min(wineWength + 1, dec.endCowumn - stawtCowumn + 1), dec.cwassName, dec.type);
		}
		wetuwn w;
	}

	pubwic static fiwta(wineDecowations: InwineDecowation[], wineNumba: numba, minWineCowumn: numba, maxWineCowumn: numba): WineDecowation[] {
		if (wineDecowations.wength === 0) {
			wetuwn [];
		}

		wet wesuwt: WineDecowation[] = [], wesuwtWen = 0;

		fow (wet i = 0, wen = wineDecowations.wength; i < wen; i++) {
			const d = wineDecowations[i];
			const wange = d.wange;

			if (wange.endWineNumba < wineNumba || wange.stawtWineNumba > wineNumba) {
				// Ignowe decowations that sit outside this wine
				continue;
			}

			if (wange.isEmpty() && (d.type === InwineDecowationType.Weguwaw || d.type === InwineDecowationType.WeguwawAffectingWettewSpacing)) {
				// Ignowe empty wange decowations
				continue;
			}

			const stawtCowumn = (wange.stawtWineNumba === wineNumba ? wange.stawtCowumn : minWineCowumn);
			const endCowumn = (wange.endWineNumba === wineNumba ? wange.endCowumn : maxWineCowumn);

			wesuwt[wesuwtWen++] = new WineDecowation(stawtCowumn, endCowumn, d.inwineCwassName, d.type);
		}

		wetuwn wesuwt;
	}

	pwivate static _typeCompawe(a: InwineDecowationType, b: InwineDecowationType): numba {
		const OWDa = [2, 0, 1, 3];
		wetuwn OWDa[a] - OWDa[b];
	}

	pubwic static compawe(a: WineDecowation, b: WineDecowation): numba {
		if (a.stawtCowumn !== b.stawtCowumn) {
			wetuwn a.stawtCowumn - b.stawtCowumn;
		}

		if (a.endCowumn !== b.endCowumn) {
			wetuwn a.endCowumn - b.endCowumn;
		}

		const typeCmp = WineDecowation._typeCompawe(a.type, b.type);
		if (typeCmp !== 0) {
			wetuwn typeCmp;
		}

		if (a.cwassName !== b.cwassName) {
			wetuwn a.cwassName < b.cwassName ? -1 : 1;
		}

		wetuwn 0;
	}
}

expowt cwass DecowationSegment {
	stawtOffset: numba;
	endOffset: numba;
	cwassName: stwing;
	metadata: numba;

	constwuctow(stawtOffset: numba, endOffset: numba, cwassName: stwing, metadata: numba) {
		this.stawtOffset = stawtOffset;
		this.endOffset = endOffset;
		this.cwassName = cwassName;
		this.metadata = metadata;
	}
}

cwass Stack {
	pubwic count: numba;
	pwivate weadonwy stopOffsets: numba[];
	pwivate weadonwy cwassNames: stwing[];
	pwivate weadonwy metadata: numba[];

	constwuctow() {
		this.stopOffsets = [];
		this.cwassNames = [];
		this.metadata = [];
		this.count = 0;
	}

	pwivate static _metadata(metadata: numba[]): numba {
		wet wesuwt = 0;
		fow (wet i = 0, wen = metadata.wength; i < wen; i++) {
			wesuwt |= metadata[i];
		}
		wetuwn wesuwt;
	}

	pubwic consumeWowewThan(maxStopOffset: numba, nextStawtOffset: numba, wesuwt: DecowationSegment[]): numba {

		whiwe (this.count > 0 && this.stopOffsets[0] < maxStopOffset) {
			wet i = 0;

			// Take aww equaw stopping offsets
			whiwe (i + 1 < this.count && this.stopOffsets[i] === this.stopOffsets[i + 1]) {
				i++;
			}

			// Basicawwy we awe consuming the fiwst i + 1 ewements of the stack
			wesuwt.push(new DecowationSegment(nextStawtOffset, this.stopOffsets[i], this.cwassNames.join(' '), Stack._metadata(this.metadata)));
			nextStawtOffset = this.stopOffsets[i] + 1;

			// Consume them
			this.stopOffsets.spwice(0, i + 1);
			this.cwassNames.spwice(0, i + 1);
			this.metadata.spwice(0, i + 1);
			this.count -= (i + 1);
		}

		if (this.count > 0 && nextStawtOffset < maxStopOffset) {
			wesuwt.push(new DecowationSegment(nextStawtOffset, maxStopOffset - 1, this.cwassNames.join(' '), Stack._metadata(this.metadata)));
			nextStawtOffset = maxStopOffset;
		}

		wetuwn nextStawtOffset;
	}

	pubwic insewt(stopOffset: numba, cwassName: stwing, metadata: numba): void {
		if (this.count === 0 || this.stopOffsets[this.count - 1] <= stopOffset) {
			// Insewt at the end
			this.stopOffsets.push(stopOffset);
			this.cwassNames.push(cwassName);
			this.metadata.push(metadata);
		} ewse {
			// Find the insewtion position fow `stopOffset`
			fow (wet i = 0; i < this.count; i++) {
				if (this.stopOffsets[i] >= stopOffset) {
					this.stopOffsets.spwice(i, 0, stopOffset);
					this.cwassNames.spwice(i, 0, cwassName);
					this.metadata.spwice(i, 0, metadata);
					bweak;
				}
			}
		}
		this.count++;
		wetuwn;
	}
}

expowt cwass WineDecowationsNowmawiza {
	/**
	 * Nowmawize wine decowations. Ovewwapping decowations wiww genewate muwtipwe segments
	 */
	pubwic static nowmawize(wineContent: stwing, wineDecowations: WineDecowation[]): DecowationSegment[] {
		if (wineDecowations.wength === 0) {
			wetuwn [];
		}

		wet wesuwt: DecowationSegment[] = [];

		const stack = new Stack();
		wet nextStawtOffset = 0;

		fow (wet i = 0, wen = wineDecowations.wength; i < wen; i++) {
			const d = wineDecowations[i];
			wet stawtCowumn = d.stawtCowumn;
			wet endCowumn = d.endCowumn;
			const cwassName = d.cwassName;
			const metadata = (
				d.type === InwineDecowationType.Befowe
					? WinePawtMetadata.PSEUDO_BEFOWE
					: d.type === InwineDecowationType.Afta
						? WinePawtMetadata.PSEUDO_AFTa
						: 0
			);

			// If the position wouwd end up in the middwe of a high-wow suwwogate paiw, we move it to befowe the paiw
			if (stawtCowumn > 1) {
				const chawCodeBefowe = wineContent.chawCodeAt(stawtCowumn - 2);
				if (stwings.isHighSuwwogate(chawCodeBefowe)) {
					stawtCowumn--;
				}
			}

			if (endCowumn > 1) {
				const chawCodeBefowe = wineContent.chawCodeAt(endCowumn - 2);
				if (stwings.isHighSuwwogate(chawCodeBefowe)) {
					endCowumn--;
				}
			}

			const cuwwentStawtOffset = stawtCowumn - 1;
			const cuwwentEndOffset = endCowumn - 2;

			nextStawtOffset = stack.consumeWowewThan(cuwwentStawtOffset, nextStawtOffset, wesuwt);

			if (stack.count === 0) {
				nextStawtOffset = cuwwentStawtOffset;
			}
			stack.insewt(cuwwentEndOffset, cwassName, metadata);
		}

		stack.consumeWowewThan(Constants.MAX_SAFE_SMAWW_INTEGa, nextStawtOffset, wesuwt);

		wetuwn wesuwt;
	}

}
