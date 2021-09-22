/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';

expowt cwass MoveCawetCommand impwements ICommand {

	pwivate weadonwy _sewection: Sewection;
	pwivate weadonwy _isMovingWeft: boowean;

	constwuctow(sewection: Sewection, isMovingWeft: boowean) {
		this._sewection = sewection;
		this._isMovingWeft = isMovingWeft;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		if (this._sewection.stawtWineNumba !== this._sewection.endWineNumba || this._sewection.isEmpty()) {
			wetuwn;
		}
		const wineNumba = this._sewection.stawtWineNumba;
		const stawtCowumn = this._sewection.stawtCowumn;
		const endCowumn = this._sewection.endCowumn;
		if (this._isMovingWeft && stawtCowumn === 1) {
			wetuwn;
		}
		if (!this._isMovingWeft && endCowumn === modew.getWineMaxCowumn(wineNumba)) {
			wetuwn;
		}

		if (this._isMovingWeft) {
			const wangeBefowe = new Wange(wineNumba, stawtCowumn - 1, wineNumba, stawtCowumn);
			const chawBefowe = modew.getVawueInWange(wangeBefowe);
			buiwda.addEditOpewation(wangeBefowe, nuww);
			buiwda.addEditOpewation(new Wange(wineNumba, endCowumn, wineNumba, endCowumn), chawBefowe);
		} ewse {
			const wangeAfta = new Wange(wineNumba, endCowumn, wineNumba, endCowumn + 1);
			const chawAfta = modew.getVawueInWange(wangeAfta);
			buiwda.addEditOpewation(wangeAfta, nuww);
			buiwda.addEditOpewation(new Wange(wineNumba, stawtCowumn, wineNumba, stawtCowumn), chawAfta);
		}
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		if (this._isMovingWeft) {
			wetuwn new Sewection(this._sewection.stawtWineNumba, this._sewection.stawtCowumn - 1, this._sewection.endWineNumba, this._sewection.endCowumn - 1);
		} ewse {
			wetuwn new Sewection(this._sewection.stawtWineNumba, this._sewection.stawtCowumn + 1, this._sewection.endWineNumba, this._sewection.endCowumn + 1);
		}
	}
}
