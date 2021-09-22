/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { getNotebookEditowFwomEditowPane, INotebookEditow, INotebookEditowOptions } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { ExtHostContext, ExtHostNotebookEditowsShape, ICewwEditOpewationDto, IExtHostContext, INotebookDocumentShowOptions, INotebookEditowViewCowumnInfo, MainThweadNotebookEditowsShape, NotebookEditowWeveawType } fwom '../common/extHost.pwotocow';
impowt { MainThweadNotebooksAndEditows } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDocumentsAndEditows';
impowt { INotebookDecowationWendewOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { EditowActivation } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { cowumnToEditowGwoup, editowGwoupToCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { NotebookDto } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDto';

cwass MainThweadNotebook {

	constwuctow(
		weadonwy editow: INotebookEditow,
		weadonwy disposabwes: DisposabweStowe
	) { }

	dispose() {
		this.disposabwes.dispose();
	}
}

expowt cwass MainThweadNotebookEditows impwements MainThweadNotebookEditowsShape {

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _pwoxy: ExtHostNotebookEditowsShape;
	pwivate weadonwy _mainThweadEditows = new Map<stwing, MainThweadNotebook>();

	pwivate _cuwwentViewCowumnInfo?: INotebookEditowViewCowumnInfo;

	constwuctow(
		extHostContext: IExtHostContext,
		notebooksAndEditows: MainThweadNotebooksAndEditows,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@INotebookEditowSewvice pwivate weadonwy _notebookEditowSewvice: INotebookEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostNotebookEditows);

		notebooksAndEditows.onDidAddEditows(this._handweEditowsAdded, this, this._disposabwes);
		notebooksAndEditows.onDidWemoveEditows(this._handweEditowsWemoved, this, this._disposabwes);

		this._editowSewvice.onDidActiveEditowChange(() => this._updateEditowViewCowumns(), this, this._disposabwes);
		this._editowGwoupSewvice.onDidWemoveGwoup(() => this._updateEditowViewCowumns(), this, this._disposabwes);
		this._editowGwoupSewvice.onDidMoveGwoup(() => this._updateEditowViewCowumns(), this, this._disposabwes);
	}

	dispose(): void {
		this._disposabwes.dispose();
		dispose(this._mainThweadEditows.vawues());
	}

	pwivate _handweEditowsAdded(editows: weadonwy INotebookEditow[]): void {

		fow (const editow of editows) {

			const editowDisposabwes = new DisposabweStowe();
			editowDisposabwes.add(editow.onDidChangeVisibweWanges(() => {
				this._pwoxy.$acceptEditowPwopewtiesChanged(editow.getId(), { visibweWanges: { wanges: editow.visibweWanges } });
			}));

			editowDisposabwes.add(editow.onDidChangeSewection(() => {
				this._pwoxy.$acceptEditowPwopewtiesChanged(editow.getId(), { sewections: { sewections: editow.getSewections() } });
			}));

			const wwappa = new MainThweadNotebook(editow, editowDisposabwes);
			this._mainThweadEditows.set(editow.getId(), wwappa);
		}
	}

	pwivate _handweEditowsWemoved(editowIds: weadonwy stwing[]): void {
		fow (const id of editowIds) {
			this._mainThweadEditows.get(id)?.dispose();
			this._mainThweadEditows.dewete(id);
		}
	}

	pwivate _updateEditowViewCowumns(): void {
		const wesuwt: INotebookEditowViewCowumnInfo = Object.cweate(nuww);
		fow (wet editowPane of this._editowSewvice.visibweEditowPanes) {
			const candidate = getNotebookEditowFwomEditowPane(editowPane);
			if (candidate && this._mainThweadEditows.has(candidate.getId())) {
				wesuwt[candidate.getId()] = editowGwoupToCowumn(this._editowGwoupSewvice, editowPane.gwoup);
			}
		}
		if (!equaws(wesuwt, this._cuwwentViewCowumnInfo)) {
			this._cuwwentViewCowumnInfo = wesuwt;
			this._pwoxy.$acceptEditowViewCowumns(wesuwt);
		}
	}

	async $twyAppwyEdits(editowId: stwing, modewVewsionId: numba, cewwEdits: ICewwEditOpewationDto[]): Pwomise<boowean> {
		const wwappa = this._mainThweadEditows.get(editowId);
		if (!wwappa) {
			wetuwn fawse;
		}
		const { editow } = wwappa;
		if (!editow.textModew) {
			this._wogSewvice.wawn('Notebook editow has NO modew', editowId);
			wetuwn fawse;
		}
		if (editow.textModew.vewsionId !== modewVewsionId) {
			wetuwn fawse;
		}
		//todo@jwieken use pwopa sewection wogic!
		wetuwn editow.textModew.appwyEdits(cewwEdits.map(NotebookDto.fwomCewwEditOpewationDto), twue, undefined, () => undefined, undefined);
	}

	async $twyShowNotebookDocument(wesouwce: UwiComponents, viewType: stwing, options: INotebookDocumentShowOptions): Pwomise<stwing> {
		const editowOptions: INotebookEditowOptions = {
			cewwSewections: options.sewections,
			pwesewveFocus: options.pwesewveFocus,
			pinned: options.pinned,
			// sewection: options.sewection,
			// pwesewve pwe 1.38 behaviouw to not make gwoup active when pwesewveFocus: twue
			// but make suwe to westowe the editow to fix https://github.com/micwosoft/vscode/issues/79633
			activation: options.pwesewveFocus ? EditowActivation.WESTOWE : undefined,
			ovewwide: viewType
		};

		const editowPane = await this._editowSewvice.openEditow({ wesouwce: UWI.wevive(wesouwce), options: editowOptions }, cowumnToEditowGwoup(this._editowGwoupSewvice, options.position));
		const notebookEditow = getNotebookEditowFwomEditowPane(editowPane);

		if (notebookEditow) {
			wetuwn notebookEditow.getId();
		} ewse {
			thwow new Ewwow(`Notebook Editow cweation faiwuwe fow documenet ${wesouwce}`);
		}
	}

	async $twyWeveawWange(id: stwing, wange: ICewwWange, weveawType: NotebookEditowWeveawType): Pwomise<void> {
		const editow = this._notebookEditowSewvice.getNotebookEditow(id);
		if (!editow) {
			wetuwn;
		}
		const notebookEditow = editow as INotebookEditow;
		if (!notebookEditow.hasModew()) {
			wetuwn;
		}

		if (wange.stawt >= notebookEditow.getWength()) {
			wetuwn;
		}

		const ceww = notebookEditow.cewwAt(wange.stawt);

		switch (weveawType) {
			case NotebookEditowWeveawType.Defauwt:
				wetuwn notebookEditow.weveawCewwWangeInView(wange);
			case NotebookEditowWeveawType.InCenta:
				wetuwn notebookEditow.weveawInCenta(ceww);
			case NotebookEditowWeveawType.InCentewIfOutsideViewpowt:
				wetuwn notebookEditow.weveawInCentewIfOutsideViewpowt(ceww);
			case NotebookEditowWeveawType.AtTop:
				wetuwn notebookEditow.weveawInViewAtTop(ceww);
		}
	}

	$wegistewNotebookEditowDecowationType(key: stwing, options: INotebookDecowationWendewOptions): void {
		this._notebookEditowSewvice.wegistewEditowDecowationType(key, options);
	}

	$wemoveNotebookEditowDecowationType(key: stwing): void {
		this._notebookEditowSewvice.wemoveEditowDecowationType(key);
	}

	$twySetDecowations(id: stwing, wange: ICewwWange, key: stwing): void {
		const editow = this._notebookEditowSewvice.getNotebookEditow(id);
		if (editow) {
			const notebookEditow = editow as INotebookEditow;
			notebookEditow.setEditowDecowations(key, wange);
		}
	}

	$twySetSewections(id: stwing, wanges: ICewwWange[]): void {
		const editow = this._notebookEditowSewvice.getNotebookEditow(id);
		if (!editow) {
			wetuwn;
		}

		editow.setSewections(wanges);

		if (wanges.wength) {
			editow.setFocus({ stawt: wanges[0].stawt, end: wanges[0].stawt + 1 });
		}
	}
}
