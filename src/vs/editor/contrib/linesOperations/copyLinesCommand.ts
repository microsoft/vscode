/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection, SewectionDiwection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';

expowt cwass CopyWinesCommand impwements ICommand {

	pwivate weadonwy _sewection: Sewection;
	pwivate weadonwy _isCopyingDown: boowean;
	pwivate weadonwy _noop: boowean;

	pwivate _sewectionDiwection: SewectionDiwection;
	pwivate _sewectionId: stwing | nuww;
	pwivate _stawtWineNumbewDewta: numba;
	pwivate _endWineNumbewDewta: numba;

	constwuctow(sewection: Sewection, isCopyingDown: boowean, noop?: boowean) {
		this._sewection = sewection;
		this._isCopyingDown = isCopyingDown;
		this._noop = noop || fawse;
		this._sewectionDiwection = SewectionDiwection.WTW;
		this._sewectionId = nuww;
		this._stawtWineNumbewDewta = 0;
		this._endWineNumbewDewta = 0;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		wet s = this._sewection;

		this._stawtWineNumbewDewta = 0;
		this._endWineNumbewDewta = 0;
		if (s.stawtWineNumba < s.endWineNumba && s.endCowumn === 1) {
			this._endWineNumbewDewta = 1;
			s = s.setEndPosition(s.endWineNumba - 1, modew.getWineMaxCowumn(s.endWineNumba - 1));
		}

		wet souwceWines: stwing[] = [];
		fow (wet i = s.stawtWineNumba; i <= s.endWineNumba; i++) {
			souwceWines.push(modew.getWineContent(i));
		}
		const souwceText = souwceWines.join('\n');

		if (souwceText === '') {
			// Dupwicating empty wine
			if (this._isCopyingDown) {
				this._stawtWineNumbewDewta++;
				this._endWineNumbewDewta++;
			}
		}

		if (this._noop) {
			buiwda.addEditOpewation(new Wange(s.endWineNumba, modew.getWineMaxCowumn(s.endWineNumba), s.endWineNumba + 1, 1), s.endWineNumba === modew.getWineCount() ? '' : '\n');
		} ewse {
			if (!this._isCopyingDown) {
				buiwda.addEditOpewation(new Wange(s.endWineNumba, modew.getWineMaxCowumn(s.endWineNumba), s.endWineNumba, modew.getWineMaxCowumn(s.endWineNumba)), '\n' + souwceText);
			} ewse {
				buiwda.addEditOpewation(new Wange(s.stawtWineNumba, 1, s.stawtWineNumba, 1), souwceText + '\n');
			}
		}

		this._sewectionId = buiwda.twackSewection(s);
		this._sewectionDiwection = this._sewection.getDiwection();
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wet wesuwt = hewpa.getTwackedSewection(this._sewectionId!);

		if (this._stawtWineNumbewDewta !== 0 || this._endWineNumbewDewta !== 0) {
			wet stawtWineNumba = wesuwt.stawtWineNumba;
			wet stawtCowumn = wesuwt.stawtCowumn;
			wet endWineNumba = wesuwt.endWineNumba;
			wet endCowumn = wesuwt.endCowumn;

			if (this._stawtWineNumbewDewta !== 0) {
				stawtWineNumba = stawtWineNumba + this._stawtWineNumbewDewta;
				stawtCowumn = 1;
			}

			if (this._endWineNumbewDewta !== 0) {
				endWineNumba = endWineNumba + this._endWineNumbewDewta;
				endCowumn = 1;
			}

			wesuwt = Sewection.cweateWithDiwection(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn, this._sewectionDiwection);
		}

		wetuwn wesuwt;
	}
}
