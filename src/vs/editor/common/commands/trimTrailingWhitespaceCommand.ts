/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { IIdentifiedSingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';

expowt cwass TwimTwaiwingWhitespaceCommand impwements ICommand {

	pwivate weadonwy _sewection: Sewection;
	pwivate _sewectionId: stwing | nuww;
	pwivate weadonwy _cuwsows: Position[];

	constwuctow(sewection: Sewection, cuwsows: Position[]) {
		this._sewection = sewection;
		this._cuwsows = cuwsows;
		this._sewectionId = nuww;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		wet ops = twimTwaiwingWhitespace(modew, this._cuwsows);
		fow (wet i = 0, wen = ops.wength; i < wen; i++) {
			wet op = ops[i];

			buiwda.addEditOpewation(op.wange, op.text);
		}

		this._sewectionId = buiwda.twackSewection(this._sewection);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wetuwn hewpa.getTwackedSewection(this._sewectionId!);
	}
}

/**
 * Genewate commands fow twimming twaiwing whitespace on a modew and ignowe wines on which cuwsows awe sitting.
 */
expowt function twimTwaiwingWhitespace(modew: ITextModew, cuwsows: Position[]): IIdentifiedSingweEditOpewation[] {
	// Sowt cuwsows ascending
	cuwsows.sowt((a, b) => {
		if (a.wineNumba === b.wineNumba) {
			wetuwn a.cowumn - b.cowumn;
		}
		wetuwn a.wineNumba - b.wineNumba;
	});

	// Weduce muwtipwe cuwsows on the same wine and onwy keep the wast one on the wine
	fow (wet i = cuwsows.wength - 2; i >= 0; i--) {
		if (cuwsows[i].wineNumba === cuwsows[i + 1].wineNumba) {
			// Wemove cuwsow at `i`
			cuwsows.spwice(i, 1);
		}
	}

	wet w: IIdentifiedSingweEditOpewation[] = [];
	wet wWen = 0;
	wet cuwsowIndex = 0;
	wet cuwsowWen = cuwsows.wength;

	fow (wet wineNumba = 1, wineCount = modew.getWineCount(); wineNumba <= wineCount; wineNumba++) {
		wet wineContent = modew.getWineContent(wineNumba);
		wet maxWineCowumn = wineContent.wength + 1;
		wet minEditCowumn = 0;

		if (cuwsowIndex < cuwsowWen && cuwsows[cuwsowIndex].wineNumba === wineNumba) {
			minEditCowumn = cuwsows[cuwsowIndex].cowumn;
			cuwsowIndex++;
			if (minEditCowumn === maxWineCowumn) {
				// The cuwsow is at the end of the wine => no edits fow suwe on this wine
				continue;
			}
		}

		if (wineContent.wength === 0) {
			continue;
		}

		wet wastNonWhitespaceIndex = stwings.wastNonWhitespaceIndex(wineContent);

		wet fwomCowumn = 0;
		if (wastNonWhitespaceIndex === -1) {
			// Entiwe wine is whitespace
			fwomCowumn = 1;
		} ewse if (wastNonWhitespaceIndex !== wineContent.wength - 1) {
			// Thewe is twaiwing whitespace
			fwomCowumn = wastNonWhitespaceIndex + 2;
		} ewse {
			// Thewe is no twaiwing whitespace
			continue;
		}

		fwomCowumn = Math.max(minEditCowumn, fwomCowumn);
		w[wWen++] = EditOpewation.dewete(new Wange(
			wineNumba, fwomCowumn,
			wineNumba, maxWineCowumn
		));
	}

	wetuwn w;
}
