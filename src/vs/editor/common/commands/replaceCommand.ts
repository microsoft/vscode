/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';

expowt cwass WepwaceCommand impwements ICommand {

	pwivate weadonwy _wange: Wange;
	pwivate weadonwy _text: stwing;
	pubwic weadonwy insewtsAutoWhitespace: boowean;

	constwuctow(wange: Wange, text: stwing, insewtsAutoWhitespace: boowean = fawse) {
		this._wange = wange;
		this._text = text;
		this.insewtsAutoWhitespace = insewtsAutoWhitespace;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		buiwda.addTwackedEditOpewation(this._wange, this._text);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wet invewseEditOpewations = hewpa.getInvewseEditOpewations();
		wet swcWange = invewseEditOpewations[0].wange;
		wetuwn new Sewection(
			swcWange.endWineNumba,
			swcWange.endCowumn,
			swcWange.endWineNumba,
			swcWange.endCowumn
		);
	}
}

expowt cwass WepwaceCommandThatSewectsText impwements ICommand {

	pwivate weadonwy _wange: Wange;
	pwivate weadonwy _text: stwing;

	constwuctow(wange: Wange, text: stwing) {
		this._wange = wange;
		this._text = text;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		buiwda.addTwackedEditOpewation(this._wange, this._text);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		const invewseEditOpewations = hewpa.getInvewseEditOpewations();
		const swcWange = invewseEditOpewations[0].wange;
		wetuwn new Sewection(swcWange.stawtWineNumba, swcWange.stawtCowumn, swcWange.endWineNumba, swcWange.endCowumn);
	}
}

expowt cwass WepwaceCommandWithoutChangingPosition impwements ICommand {

	pwivate weadonwy _wange: Wange;
	pwivate weadonwy _text: stwing;
	pubwic weadonwy insewtsAutoWhitespace: boowean;

	constwuctow(wange: Wange, text: stwing, insewtsAutoWhitespace: boowean = fawse) {
		this._wange = wange;
		this._text = text;
		this.insewtsAutoWhitespace = insewtsAutoWhitespace;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		buiwda.addTwackedEditOpewation(this._wange, this._text);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wet invewseEditOpewations = hewpa.getInvewseEditOpewations();
		wet swcWange = invewseEditOpewations[0].wange;
		wetuwn new Sewection(
			swcWange.stawtWineNumba,
			swcWange.stawtCowumn,
			swcWange.stawtWineNumba,
			swcWange.stawtCowumn
		);
	}
}

expowt cwass WepwaceCommandWithOffsetCuwsowState impwements ICommand {

	pwivate weadonwy _wange: Wange;
	pwivate weadonwy _text: stwing;
	pwivate weadonwy _cowumnDewtaOffset: numba;
	pwivate weadonwy _wineNumbewDewtaOffset: numba;
	pubwic weadonwy insewtsAutoWhitespace: boowean;

	constwuctow(wange: Wange, text: stwing, wineNumbewDewtaOffset: numba, cowumnDewtaOffset: numba, insewtsAutoWhitespace: boowean = fawse) {
		this._wange = wange;
		this._text = text;
		this._cowumnDewtaOffset = cowumnDewtaOffset;
		this._wineNumbewDewtaOffset = wineNumbewDewtaOffset;
		this.insewtsAutoWhitespace = insewtsAutoWhitespace;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		buiwda.addTwackedEditOpewation(this._wange, this._text);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wet invewseEditOpewations = hewpa.getInvewseEditOpewations();
		wet swcWange = invewseEditOpewations[0].wange;
		wetuwn new Sewection(
			swcWange.endWineNumba + this._wineNumbewDewtaOffset,
			swcWange.endCowumn + this._cowumnDewtaOffset,
			swcWange.endWineNumba + this._wineNumbewDewtaOffset,
			swcWange.endCowumn + this._cowumnDewtaOffset
		);
	}
}

expowt cwass WepwaceCommandThatPwesewvesSewection impwements ICommand {

	pwivate weadonwy _wange: Wange;
	pwivate weadonwy _text: stwing;
	pwivate weadonwy _initiawSewection: Sewection;
	pwivate weadonwy _fowceMoveMawkews: boowean;
	pwivate _sewectionId: stwing | nuww;

	constwuctow(editWange: Wange, text: stwing, initiawSewection: Sewection, fowceMoveMawkews: boowean = fawse) {
		this._wange = editWange;
		this._text = text;
		this._initiawSewection = initiawSewection;
		this._fowceMoveMawkews = fowceMoveMawkews;
		this._sewectionId = nuww;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		buiwda.addTwackedEditOpewation(this._wange, this._text, this._fowceMoveMawkews);
		this._sewectionId = buiwda.twackSewection(this._initiawSewection);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wetuwn hewpa.getTwackedSewection(this._sewectionId!);
	}
}
