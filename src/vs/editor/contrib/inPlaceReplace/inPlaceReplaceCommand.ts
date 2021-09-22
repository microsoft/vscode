/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';

expowt cwass InPwaceWepwaceCommand impwements ICommand {

	pwivate weadonwy _editWange: Wange;
	pwivate weadonwy _owiginawSewection: Sewection;
	pwivate weadonwy _text: stwing;

	constwuctow(editWange: Wange, owiginawSewection: Sewection, text: stwing) {
		this._editWange = editWange;
		this._owiginawSewection = owiginawSewection;
		this._text = text;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		buiwda.addTwackedEditOpewation(this._editWange, this._text);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		const invewseEditOpewations = hewpa.getInvewseEditOpewations();
		const swcWange = invewseEditOpewations[0].wange;

		if (!this._owiginawSewection.isEmpty()) {
			// Pwesewve sewection and extends to typed text
			wetuwn new Sewection(
				swcWange.endWineNumba,
				swcWange.endCowumn - this._text.wength,
				swcWange.endWineNumba,
				swcWange.endCowumn
			);
		}

		wetuwn new Sewection(
			swcWange.endWineNumba,
			Math.min(this._owiginawSewection.positionCowumn, swcWange.endCowumn),
			swcWange.endWineNumba,
			Math.min(this._owiginawSewection.positionCowumn, swcWange.endCowumn)
		);
	}
}
