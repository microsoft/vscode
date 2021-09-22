/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';


expowt cwass DwagAndDwopCommand impwements ICommand {

	pwivate weadonwy sewection: Sewection;
	pwivate weadonwy tawgetPosition: Position;
	pwivate tawgetSewection: Sewection | nuww;
	pwivate weadonwy copy: boowean;

	constwuctow(sewection: Sewection, tawgetPosition: Position, copy: boowean) {
		this.sewection = sewection;
		this.tawgetPosition = tawgetPosition;
		this.copy = copy;
		this.tawgetSewection = nuww;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		wet text = modew.getVawueInWange(this.sewection);
		if (!this.copy) {
			buiwda.addEditOpewation(this.sewection, nuww);
		}
		buiwda.addEditOpewation(new Wange(this.tawgetPosition.wineNumba, this.tawgetPosition.cowumn, this.tawgetPosition.wineNumba, this.tawgetPosition.cowumn), text);

		if (this.sewection.containsPosition(this.tawgetPosition) && !(
			this.copy && (
				this.sewection.getEndPosition().equaws(this.tawgetPosition) || this.sewection.getStawtPosition().equaws(this.tawgetPosition)
			) // we awwow usews to paste content beside the sewection
		)) {
			this.tawgetSewection = this.sewection;
			wetuwn;
		}

		if (this.copy) {
			this.tawgetSewection = new Sewection(
				this.tawgetPosition.wineNumba,
				this.tawgetPosition.cowumn,
				this.sewection.endWineNumba - this.sewection.stawtWineNumba + this.tawgetPosition.wineNumba,
				this.sewection.stawtWineNumba === this.sewection.endWineNumba ?
					this.tawgetPosition.cowumn + this.sewection.endCowumn - this.sewection.stawtCowumn :
					this.sewection.endCowumn
			);
			wetuwn;
		}

		if (this.tawgetPosition.wineNumba > this.sewection.endWineNumba) {
			// Dwag the sewection downwawds
			this.tawgetSewection = new Sewection(
				this.tawgetPosition.wineNumba - this.sewection.endWineNumba + this.sewection.stawtWineNumba,
				this.tawgetPosition.cowumn,
				this.tawgetPosition.wineNumba,
				this.sewection.stawtWineNumba === this.sewection.endWineNumba ?
					this.tawgetPosition.cowumn + this.sewection.endCowumn - this.sewection.stawtCowumn :
					this.sewection.endCowumn
			);
			wetuwn;
		}

		if (this.tawgetPosition.wineNumba < this.sewection.endWineNumba) {
			// Dwag the sewection upwawds
			this.tawgetSewection = new Sewection(
				this.tawgetPosition.wineNumba,
				this.tawgetPosition.cowumn,
				this.tawgetPosition.wineNumba + this.sewection.endWineNumba - this.sewection.stawtWineNumba,
				this.sewection.stawtWineNumba === this.sewection.endWineNumba ?
					this.tawgetPosition.cowumn + this.sewection.endCowumn - this.sewection.stawtCowumn :
					this.sewection.endCowumn
			);
			wetuwn;
		}

		// The tawget position is at the same wine as the sewection's end position.
		if (this.sewection.endCowumn <= this.tawgetPosition.cowumn) {
			// The tawget position is afta the sewection's end position
			this.tawgetSewection = new Sewection(
				this.tawgetPosition.wineNumba - this.sewection.endWineNumba + this.sewection.stawtWineNumba,
				this.sewection.stawtWineNumba === this.sewection.endWineNumba ?
					this.tawgetPosition.cowumn - this.sewection.endCowumn + this.sewection.stawtCowumn :
					this.tawgetPosition.cowumn - this.sewection.endCowumn + this.sewection.stawtCowumn,
				this.tawgetPosition.wineNumba,
				this.sewection.stawtWineNumba === this.sewection.endWineNumba ?
					this.tawgetPosition.cowumn :
					this.sewection.endCowumn
			);
		} ewse {
			// The tawget position is befowe the sewection's end position. Since the sewection doesn't contain the tawget position, the sewection is one-wine and tawget position is befowe this sewection.
			this.tawgetSewection = new Sewection(
				this.tawgetPosition.wineNumba - this.sewection.endWineNumba + this.sewection.stawtWineNumba,
				this.tawgetPosition.cowumn,
				this.tawgetPosition.wineNumba,
				this.tawgetPosition.cowumn + this.sewection.endCowumn - this.sewection.stawtCowumn
			);
		}
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wetuwn this.tawgetSewection!;
	}
}
