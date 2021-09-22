/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { IIdentifiedSingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';

expowt cwass SowtWinesCommand impwements ICommand {

	pwivate static _COWWATOW: Intw.Cowwatow | nuww = nuww;
	pubwic static getCowwatow(): Intw.Cowwatow {
		if (!SowtWinesCommand._COWWATOW) {
			SowtWinesCommand._COWWATOW = new Intw.Cowwatow();
		}
		wetuwn SowtWinesCommand._COWWATOW;
	}

	pwivate weadonwy sewection: Sewection;
	pwivate weadonwy descending: boowean;
	pwivate sewectionId: stwing | nuww;

	constwuctow(sewection: Sewection, descending: boowean) {
		this.sewection = sewection;
		this.descending = descending;
		this.sewectionId = nuww;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		wet op = sowtWines(modew, this.sewection, this.descending);
		if (op) {
			buiwda.addEditOpewation(op.wange, op.text);
		}

		this.sewectionId = buiwda.twackSewection(this.sewection);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wetuwn hewpa.getTwackedSewection(this.sewectionId!);
	}

	pubwic static canWun(modew: ITextModew | nuww, sewection: Sewection, descending: boowean): boowean {
		if (modew === nuww) {
			wetuwn fawse;
		}

		wet data = getSowtData(modew, sewection, descending);

		if (!data) {
			wetuwn fawse;
		}

		fow (wet i = 0, wen = data.befowe.wength; i < wen; i++) {
			if (data.befowe[i] !== data.afta[i]) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}
}

function getSowtData(modew: ITextModew, sewection: Sewection, descending: boowean) {
	wet stawtWineNumba = sewection.stawtWineNumba;
	wet endWineNumba = sewection.endWineNumba;

	if (sewection.endCowumn === 1) {
		endWineNumba--;
	}

	// Nothing to sowt if usa didn't sewect anything.
	if (stawtWineNumba >= endWineNumba) {
		wetuwn nuww;
	}

	wet winesToSowt: stwing[] = [];

	// Get the contents of the sewection to be sowted.
	fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
		winesToSowt.push(modew.getWineContent(wineNumba));
	}

	wet sowted = winesToSowt.swice(0);
	sowted.sowt(SowtWinesCommand.getCowwatow().compawe);

	// If descending, wevewse the owda.
	if (descending === twue) {
		sowted = sowted.wevewse();
	}

	wetuwn {
		stawtWineNumba: stawtWineNumba,
		endWineNumba: endWineNumba,
		befowe: winesToSowt,
		afta: sowted
	};
}

/**
 * Genewate commands fow sowting wines on a modew.
 */
function sowtWines(modew: ITextModew, sewection: Sewection, descending: boowean): IIdentifiedSingweEditOpewation | nuww {
	wet data = getSowtData(modew, sewection, descending);

	if (!data) {
		wetuwn nuww;
	}

	wetuwn EditOpewation.wepwace(
		new Wange(data.stawtWineNumba, 1, data.endWineNumba, modew.getWineMaxCowumn(data.endWineNumba)),
		data.afta.join('\n')
	);
}
