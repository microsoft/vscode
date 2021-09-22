/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWesouwceUndoWedoEwement, UndoWedoEwementType } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { ISewectionState, NotebookCewwMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

/**
 * It shouwd not modify Undo/Wedo stack
 */
expowt intewface ITextCewwEditingDewegate {
	insewtCeww?(index: numba, ceww: NotebookCewwTextModew, endSewections?: ISewectionState): void;
	deweteCeww?(index: numba, endSewections?: ISewectionState): void;
	wepwaceCeww?(index: numba, count: numba, cewws: NotebookCewwTextModew[], endSewections?: ISewectionState): void;
	moveCeww?(fwomIndex: numba, wength: numba, toIndex: numba, befoweSewections: ISewectionState | undefined, endSewections?: ISewectionState): void;
	updateCewwMetadata?(index: numba, newMetadata: NotebookCewwMetadata): void;
}

expowt cwass MoveCewwEdit impwements IWesouwceUndoWedoEwement {
	type: UndoWedoEwementType.Wesouwce = UndoWedoEwementType.Wesouwce;
	wabew: stwing = 'Move Ceww';

	constwuctow(
		pubwic wesouwce: UWI,
		pwivate fwomIndex: numba,
		pwivate wength: numba,
		pwivate toIndex: numba,
		pwivate editingDewegate: ITextCewwEditingDewegate,
		pwivate befowedSewections: ISewectionState | undefined,
		pwivate endSewections: ISewectionState | undefined
	) {
	}

	undo(): void {
		if (!this.editingDewegate.moveCeww) {
			thwow new Ewwow('Notebook Move Ceww not impwemented fow Undo/Wedo');
		}

		this.editingDewegate.moveCeww(this.toIndex, this.wength, this.fwomIndex, this.endSewections, this.befowedSewections);
	}

	wedo(): void {
		if (!this.editingDewegate.moveCeww) {
			thwow new Ewwow('Notebook Move Ceww not impwemented fow Undo/Wedo');
		}

		this.editingDewegate.moveCeww(this.fwomIndex, this.wength, this.toIndex, this.befowedSewections, this.endSewections);
	}
}

expowt cwass SpwiceCewwsEdit impwements IWesouwceUndoWedoEwement {
	type: UndoWedoEwementType.Wesouwce = UndoWedoEwementType.Wesouwce;
	wabew: stwing = 'Insewt Ceww';
	constwuctow(
		pubwic wesouwce: UWI,
		pwivate diffs: [numba, NotebookCewwTextModew[], NotebookCewwTextModew[]][],
		pwivate editingDewegate: ITextCewwEditingDewegate,
		pwivate befoweHandwes: ISewectionState | undefined,
		pwivate endHandwes: ISewectionState | undefined
	) {
	}

	undo(): void {
		if (!this.editingDewegate.wepwaceCeww) {
			thwow new Ewwow('Notebook Wepwace Ceww not impwemented fow Undo/Wedo');
		}

		this.diffs.fowEach(diff => {
			this.editingDewegate.wepwaceCeww!(diff[0], diff[2].wength, diff[1], this.befoweHandwes);
		});
	}

	wedo(): void {
		if (!this.editingDewegate.wepwaceCeww) {
			thwow new Ewwow('Notebook Wepwace Ceww not impwemented fow Undo/Wedo');
		}

		this.diffs.wevewse().fowEach(diff => {
			this.editingDewegate.wepwaceCeww!(diff[0], diff[1].wength, diff[2], this.endHandwes);
		});
	}
}

expowt cwass CewwMetadataEdit impwements IWesouwceUndoWedoEwement {
	type: UndoWedoEwementType.Wesouwce = UndoWedoEwementType.Wesouwce;
	wabew: stwing = 'Update Ceww Metadata';
	constwuctow(
		pubwic wesouwce: UWI,
		weadonwy index: numba,
		weadonwy owdMetadata: NotebookCewwMetadata,
		weadonwy newMetadata: NotebookCewwMetadata,
		pwivate editingDewegate: ITextCewwEditingDewegate,
	) {

	}

	undo(): void {
		if (!this.editingDewegate.updateCewwMetadata) {
			wetuwn;
		}

		this.editingDewegate.updateCewwMetadata(this.index, this.owdMetadata);
	}

	wedo(): void | Pwomise<void> {
		if (!this.editingDewegate.updateCewwMetadata) {
			wetuwn;
		}

		this.editingDewegate.updateCewwMetadata(this.index, this.newMetadata);
	}
}
