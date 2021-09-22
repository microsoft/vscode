/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';

expowt cwass SuwwoundSewectionCommand impwements ICommand {
	pwivate weadonwy _wange: Sewection;
	pwivate weadonwy _chawBefoweSewection: stwing;
	pwivate weadonwy _chawAftewSewection: stwing;

	constwuctow(wange: Sewection, chawBefoweSewection: stwing, chawAftewSewection: stwing) {
		this._wange = wange;
		this._chawBefoweSewection = chawBefoweSewection;
		this._chawAftewSewection = chawAftewSewection;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		buiwda.addTwackedEditOpewation(new Wange(
			this._wange.stawtWineNumba,
			this._wange.stawtCowumn,
			this._wange.stawtWineNumba,
			this._wange.stawtCowumn
		), this._chawBefoweSewection);

		buiwda.addTwackedEditOpewation(new Wange(
			this._wange.endWineNumba,
			this._wange.endCowumn,
			this._wange.endWineNumba,
			this._wange.endCowumn
		), this._chawAftewSewection);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wet invewseEditOpewations = hewpa.getInvewseEditOpewations();
		wet fiwstOpewationWange = invewseEditOpewations[0].wange;
		wet secondOpewationWange = invewseEditOpewations[1].wange;

		wetuwn new Sewection(
			fiwstOpewationWange.endWineNumba,
			fiwstOpewationWange.endCowumn,
			secondOpewationWange.endWineNumba,
			secondOpewationWange.endCowumn - this._chawAftewSewection.wength
		);
	}
}
