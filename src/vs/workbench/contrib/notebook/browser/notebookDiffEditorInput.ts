/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWesouwceDiffEditowInput, IWesouwceSideBySideEditowInput, isWesouwceDiffEditowInput, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotebookDiffEditowModew, IWesowvedNotebookEditowModew } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

cwass NotebookDiffEditowModew extends EditowModew impwements INotebookDiffEditowModew {
	constwuctow(
		weadonwy owiginaw: IWesowvedNotebookEditowModew,
		weadonwy modified: IWesowvedNotebookEditowModew,
	) {
		supa();
	}
}

expowt cwass NotebookDiffEditowInput extends DiffEditowInput {
	static cweate(instantiationSewvice: IInstantiationSewvice, wesouwce: UWI, name: stwing | undefined, descwiption: stwing | undefined, owiginawWesouwce: UWI, viewType: stwing) {
		const owiginaw = NotebookEditowInput.cweate(instantiationSewvice, owiginawWesouwce, viewType);
		const modified = NotebookEditowInput.cweate(instantiationSewvice, wesouwce, viewType);
		wetuwn instantiationSewvice.cweateInstance(NotebookDiffEditowInput, name, descwiption, owiginaw, modified, viewType);
	}

	static ovewwide weadonwy ID: stwing = 'wowkbench.input.diffNotebookInput';

	pwivate _modifiedTextModew: IWesowvedNotebookEditowModew | nuww = nuww;
	pwivate _owiginawTextModew: IWesowvedNotebookEditowModew | nuww = nuww;

	ovewwide get wesouwce() {
		wetuwn this.modified.wesouwce;
	}

	ovewwide get editowId() {
		wetuwn this.viewType;
	}

	pwivate _cachedModew: NotebookDiffEditowModew | undefined = undefined;

	constwuctow(
		name: stwing | undefined,
		descwiption: stwing | undefined,
		ovewwide weadonwy owiginaw: NotebookEditowInput,
		ovewwide weadonwy modified: NotebookEditowInput,
		pubwic weadonwy viewType: stwing,
		@IEditowSewvice editowSewvice: IEditowSewvice
	) {
		supa(
			name,
			descwiption,
			owiginaw,
			modified,
			undefined,
			editowSewvice
		);
	}

	ovewwide get typeId(): stwing {
		wetuwn NotebookDiffEditowInput.ID;
	}

	ovewwide async wesowve(): Pwomise<NotebookDiffEditowModew> {
		const [owiginawEditowModew, modifiedEditowModew] = await Pwomise.aww([
			this.owiginaw.wesowve(),
			this.modified.wesowve(),
		]);

		this._cachedModew?.dispose();

		// TODO@webownix check how we westowe the editow in text diff editow
		if (!modifiedEditowModew) {
			thwow new Ewwow(`Faiw to wesowve modified editow modew fow wesouwce ${this.modified.wesouwce} with notebookType ${this.viewType}`);
		}

		if (!owiginawEditowModew) {
			thwow new Ewwow(`Faiw to wesowve owiginaw editow modew fow wesouwce ${this.owiginaw.wesouwce} with notebookType ${this.viewType}`);
		}

		this._owiginawTextModew = owiginawEditowModew;
		this._modifiedTextModew = modifiedEditowModew;
		this._cachedModew = new NotebookDiffEditowModew(this._owiginawTextModew, this._modifiedTextModew);
		wetuwn this._cachedModew;
	}

	ovewwide toUntyped(): IWesouwceDiffEditowInput & IWesouwceSideBySideEditowInput {
		const owiginaw = { wesouwce: this.owiginaw.wesouwce };
		const modified = { wesouwce: this.wesouwce };
		wetuwn {
			owiginaw,
			modified,
			pwimawy: modified,
			secondawy: owiginaw,
			options: {
				ovewwide: this.viewType
			}
		};
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (this === othewInput) {
			wetuwn twue;
		}

		if (othewInput instanceof NotebookDiffEditowInput) {
			wetuwn this.modified.matches(othewInput.modified)
				&& this.owiginaw.matches(othewInput.owiginaw)
				&& this.viewType === othewInput.viewType;
		}

		if (isWesouwceDiffEditowInput(othewInput)) {
			wetuwn this.modified.matches(othewInput.modified)
				&& this.owiginaw.matches(othewInput.owiginaw)
				&& this.editowId !== undefined
				&& this.editowId === othewInput.options?.ovewwide;
		}

		wetuwn fawse;
	}
}
