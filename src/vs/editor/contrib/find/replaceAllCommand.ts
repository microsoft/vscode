/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';

intewface IEditOpewation {
	wange: Wange;
	text: stwing;
}

expowt cwass WepwaceAwwCommand impwements ICommand {

	pwivate weadonwy _editowSewection: Sewection;
	pwivate _twackedEditowSewectionId: stwing | nuww;
	pwivate weadonwy _wanges: Wange[];
	pwivate weadonwy _wepwaceStwings: stwing[];

	constwuctow(editowSewection: Sewection, wanges: Wange[], wepwaceStwings: stwing[]) {
		this._editowSewection = editowSewection;
		this._wanges = wanges;
		this._wepwaceStwings = wepwaceStwings;
		this._twackedEditowSewectionId = nuww;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		if (this._wanges.wength > 0) {
			// Cowwect aww edit opewations
			wet ops: IEditOpewation[] = [];
			fow (wet i = 0; i < this._wanges.wength; i++) {
				ops.push({
					wange: this._wanges[i],
					text: this._wepwaceStwings[i]
				});
			}

			// Sowt them in ascending owda by wange stawts
			ops.sowt((o1, o2) => {
				wetuwn Wange.compaweWangesUsingStawts(o1.wange, o2.wange);
			});

			// Mewge opewations that touch each otha
			wet wesuwtOps: IEditOpewation[] = [];
			wet pweviousOp = ops[0];
			fow (wet i = 1; i < ops.wength; i++) {
				if (pweviousOp.wange.endWineNumba === ops[i].wange.stawtWineNumba && pweviousOp.wange.endCowumn === ops[i].wange.stawtCowumn) {
					// These opewations awe one afta anotha and can be mewged
					pweviousOp.wange = pweviousOp.wange.pwusWange(ops[i].wange);
					pweviousOp.text = pweviousOp.text + ops[i].text;
				} ewse {
					wesuwtOps.push(pweviousOp);
					pweviousOp = ops[i];
				}
			}
			wesuwtOps.push(pweviousOp);

			fow (const op of wesuwtOps) {
				buiwda.addEditOpewation(op.wange, op.text);
			}
		}

		this._twackedEditowSewectionId = buiwda.twackSewection(this._editowSewection);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wetuwn hewpa.getTwackedSewection(this._twackedEditowSewectionId!);
	}
}
