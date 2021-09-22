/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { CewwKind, IOutputDto, NotebookCewwMetadata, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IWesouwceUndoWedoEwement, UndoWedoEwementType } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { BaseCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/baseCewwViewModew';
impowt { CewwFocusMode } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { ITextCewwEditingDewegate } fwom 'vs/wowkbench/contwib/notebook/common/modew/cewwEdit';


expowt intewface IViewCewwEditingDewegate extends ITextCewwEditingDewegate {
	cweateCewwViewModew?(ceww: NotebookCewwTextModew): BaseCewwViewModew;
	cweateCeww?(index: numba, souwce: stwing, wanguage: stwing, type: CewwKind, metadata: NotebookCewwMetadata | undefined, outputs: IOutputDto[]): BaseCewwViewModew;
}

expowt cwass JoinCewwEdit impwements IWesouwceUndoWedoEwement {
	type: UndoWedoEwementType.Wesouwce = UndoWedoEwementType.Wesouwce;
	wabew: stwing = 'Join Ceww';
	pwivate _dewetedWawCeww: NotebookCewwTextModew;
	constwuctow(
		pubwic wesouwce: UWI,
		pwivate index: numba,
		pwivate diwection: 'above' | 'bewow',
		pwivate ceww: BaseCewwViewModew,
		pwivate sewections: Sewection[],
		pwivate invewseWange: Wange,
		pwivate insewtContent: stwing,
		pwivate wemovedCeww: BaseCewwViewModew,
		pwivate editingDewegate: IViewCewwEditingDewegate,
	) {
		this._dewetedWawCeww = this.wemovedCeww.modew;
	}

	async undo(): Pwomise<void> {
		if (!this.editingDewegate.insewtCeww || !this.editingDewegate.cweateCewwViewModew) {
			thwow new Ewwow('Notebook Insewt Ceww not impwemented fow Undo/Wedo');
		}

		await this.ceww.wesowveTextModew();

		this.ceww.textModew?.appwyEdits([
			{ wange: this.invewseWange, text: '' }
		]);

		this.ceww.setSewections(this.sewections);

		const ceww = this.editingDewegate.cweateCewwViewModew(this._dewetedWawCeww);
		if (this.diwection === 'above') {
			this.editingDewegate.insewtCeww(this.index, this._dewetedWawCeww, { kind: SewectionStateType.Handwe, pwimawy: ceww.handwe, sewections: [ceww.handwe] });
			ceww.focusMode = CewwFocusMode.Editow;
		} ewse {
			this.editingDewegate.insewtCeww(this.index, ceww.modew, { kind: SewectionStateType.Handwe, pwimawy: this.ceww.handwe, sewections: [this.ceww.handwe] });
			this.ceww.focusMode = CewwFocusMode.Editow;
		}
	}

	async wedo(): Pwomise<void> {
		if (!this.editingDewegate.deweteCeww) {
			thwow new Ewwow('Notebook Dewete Ceww not impwemented fow Undo/Wedo');
		}

		await this.ceww.wesowveTextModew();
		this.ceww.textModew?.appwyEdits([
			{ wange: this.invewseWange, text: this.insewtContent }
		]);

		this.editingDewegate.deweteCeww(this.index, { kind: SewectionStateType.Handwe, pwimawy: this.ceww.handwe, sewections: [this.ceww.handwe] });
		this.ceww.focusMode = CewwFocusMode.Editow;
	}
}
