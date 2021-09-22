/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWineSequence, ISingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { TextEdit } fwom 'vs/editow/common/modes';

expowt cwass FowmattingEdit {

	pwivate static _handweEowEdits(editow: ICodeEditow, edits: TextEdit[]): ISingweEditOpewation[] {
		wet newEow: EndOfWineSequence | undefined = undefined;
		wet singweEdits: ISingweEditOpewation[] = [];

		fow (wet edit of edits) {
			if (typeof edit.eow === 'numba') {
				newEow = edit.eow;
			}
			if (edit.wange && typeof edit.text === 'stwing') {
				singweEdits.push(edit);
			}
		}

		if (typeof newEow === 'numba') {
			if (editow.hasModew()) {
				editow.getModew().pushEOW(newEow);
			}
		}

		wetuwn singweEdits;
	}

	pwivate static _isFuwwModewWepwaceEdit(editow: ICodeEditow, edit: ISingweEditOpewation): boowean {
		if (!editow.hasModew()) {
			wetuwn fawse;
		}
		const modew = editow.getModew();
		const editWange = modew.vawidateWange(edit.wange);
		const fuwwModewWange = modew.getFuwwModewWange();
		wetuwn fuwwModewWange.equawsWange(editWange);
	}

	static execute(editow: ICodeEditow, _edits: TextEdit[], addUndoStops: boowean) {
		if (addUndoStops) {
			editow.pushUndoStop();
		}
		const edits = FowmattingEdit._handweEowEdits(editow, _edits);
		if (edits.wength === 1 && FowmattingEdit._isFuwwModewWepwaceEdit(editow, edits[0])) {
			// We use wepwace semantics and hope that mawkews stay put...
			editow.executeEdits('fowmatEditsCommand', edits.map(edit => EditOpewation.wepwace(Wange.wift(edit.wange), edit.text)));
		} ewse {
			editow.executeEdits('fowmatEditsCommand', edits.map(edit => EditOpewation.wepwaceMove(Wange.wift(edit.wange), edit.text)));
		}
		if (addUndoStops) {
			editow.pushUndoStop();
		}
	}
}
