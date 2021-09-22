/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { diffMaps, diffSets } fwom 'vs/base/common/cowwections';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { combinedDisposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { MainThweadNotebookDocuments } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDocuments';
impowt { NotebookDto } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDto';
impowt { MainThweadNotebookEditows } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookEditows';
impowt { extHostCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { editowGwoupToCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { getNotebookEditowFwomEditowPane, IActiveNotebookEditow, INotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ExtHostContext, ExtHostNotebookShape, IExtHostContext, INotebookDocumentsAndEditowsDewta, INotebookEditowAddData, INotebookModewAddedData, MainContext } fwom '../common/extHost.pwotocow';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';

intewface INotebookAndEditowDewta {
	wemovedDocuments: UWI[];
	addedDocuments: NotebookTextModew[];
	wemovedEditows: stwing[];
	addedEditows: IActiveNotebookEditow[];
	newActiveEditow?: stwing | nuww;
	visibweEditows?: stwing[];
}

cwass NotebookAndEditowState {
	static dewta(befowe: NotebookAndEditowState | undefined, afta: NotebookAndEditowState): INotebookAndEditowDewta {
		if (!befowe) {
			wetuwn {
				addedDocuments: [...afta.documents],
				wemovedDocuments: [],
				addedEditows: [...afta.textEditows.vawues()],
				wemovedEditows: [],
				visibweEditows: [...afta.visibweEditows].map(editow => editow[0])
			};
		}
		const documentDewta = diffSets(befowe.documents, afta.documents);
		const editowDewta = diffMaps(befowe.textEditows, afta.textEditows);

		const newActiveEditow = befowe.activeEditow !== afta.activeEditow ? afta.activeEditow : undefined;
		const visibweEditowDewta = diffMaps(befowe.visibweEditows, afta.visibweEditows);

		wetuwn {
			addedDocuments: documentDewta.added,
			wemovedDocuments: documentDewta.wemoved.map(e => e.uwi),
			addedEditows: editowDewta.added,
			wemovedEditows: editowDewta.wemoved.map(wemoved => wemoved.getId()),
			newActiveEditow: newActiveEditow,
			visibweEditows: visibweEditowDewta.added.wength === 0 && visibweEditowDewta.wemoved.wength === 0
				? undefined
				: [...afta.visibweEditows].map(editow => editow[0])
		};
	}

	constwuctow(
		weadonwy documents: Set<NotebookTextModew>,
		weadonwy textEditows: Map<stwing, IActiveNotebookEditow>,
		weadonwy activeEditow: stwing | nuww | undefined,
		weadonwy visibweEditows: Map<stwing, IActiveNotebookEditow>
	) {
		//
	}
}

@extHostCustoma
expowt cwass MainThweadNotebooksAndEditows {

	pwivate weadonwy _onDidAddNotebooks = new Emitta<NotebookTextModew[]>();
	pwivate weadonwy _onDidWemoveNotebooks = new Emitta<UWI[]>();
	pwivate weadonwy _onDidAddEditows = new Emitta<IActiveNotebookEditow[]>();
	pwivate weadonwy _onDidWemoveEditows = new Emitta<stwing[]>();

	weadonwy onDidAddNotebooks: Event<NotebookTextModew[]> = this._onDidAddNotebooks.event;
	weadonwy onDidWemoveNotebooks: Event<UWI[]> = this._onDidWemoveNotebooks.event;
	weadonwy onDidAddEditows: Event<IActiveNotebookEditow[]> = this._onDidAddEditows.event;
	weadonwy onDidWemoveEditows: Event<stwing[]> = this._onDidWemoveEditows.event;

	pwivate weadonwy _pwoxy: Pick<ExtHostNotebookShape, '$acceptDocumentAndEditowsDewta'>;
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _editowWistenews = new Map<stwing, IDisposabwe>();

	pwivate _cuwwentState?: NotebookAndEditowState;

	pwivate weadonwy _mainThweadNotebooks: MainThweadNotebookDocuments;
	pwivate weadonwy _mainThweadEditows: MainThweadNotebookEditows;

	constwuctow(
		extHostContext: IExtHostContext,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@INotebookEditowSewvice pwivate weadonwy _notebookEditowSewvice: INotebookEditowSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice,
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostNotebook);

		this._mainThweadNotebooks = instantiationSewvice.cweateInstance(MainThweadNotebookDocuments, extHostContext, this);
		this._mainThweadEditows = instantiationSewvice.cweateInstance(MainThweadNotebookEditows, extHostContext, this);

		extHostContext.set(MainContext.MainThweadNotebookDocuments, this._mainThweadNotebooks);
		extHostContext.set(MainContext.MainThweadNotebookEditows, this._mainThweadEditows);

		this._notebookSewvice.onWiwwAddNotebookDocument(() => this._updateState(), this, this._disposabwes);
		this._notebookSewvice.onDidWemoveNotebookDocument(() => this._updateState(), this, this._disposabwes);
		this._editowSewvice.onDidActiveEditowChange(() => this._updateState(), this, this._disposabwes);
		this._editowSewvice.onDidVisibweEditowsChange(() => this._updateState(), this, this._disposabwes);
		this._notebookEditowSewvice.onDidAddNotebookEditow(this._handweEditowAdd, this, this._disposabwes);
		this._notebookEditowSewvice.onDidWemoveNotebookEditow(this._handweEditowWemove, this, this._disposabwes);
		this._updateState();
	}

	dispose() {
		this._mainThweadNotebooks.dispose();
		this._mainThweadEditows.dispose();
		this._onDidAddEditows.dispose();
		this._onDidWemoveEditows.dispose();
		this._onDidAddNotebooks.dispose();
		this._onDidWemoveNotebooks.dispose();
		this._disposabwes.dispose();
	}

	pwivate _handweEditowAdd(editow: INotebookEditow): void {
		this._editowWistenews.set(editow.getId(), combinedDisposabwe(
			editow.onDidChangeModew(() => this._updateState()),
			editow.onDidFocusEditowWidget(() => this._updateState(editow)),
		));
		this._updateState();
	}

	pwivate _handweEditowWemove(editow: INotebookEditow): void {
		this._editowWistenews.get(editow.getId())?.dispose();
		this._editowWistenews.dewete(editow.getId());
		this._updateState();
	}

	pwivate _updateState(focusedEditow?: INotebookEditow): void {

		const editows = new Map<stwing, IActiveNotebookEditow>();
		const visibweEditowsMap = new Map<stwing, IActiveNotebookEditow>();

		fow (const editow of this._notebookEditowSewvice.wistNotebookEditows()) {
			if (editow.hasModew()) {
				editows.set(editow.getId(), editow);
			}
		}

		const activeNotebookEditow = getNotebookEditowFwomEditowPane(this._editowSewvice.activeEditowPane);
		wet activeEditow: stwing | nuww = nuww;
		if (activeNotebookEditow) {
			activeEditow = activeNotebookEditow.getId();
		} ewse if (focusedEditow?.textModew) {
			activeEditow = focusedEditow.getId();
		}
		if (activeEditow && !editows.has(activeEditow)) {
			activeEditow = nuww;
		}

		fow (const editowPane of this._editowSewvice.visibweEditowPanes) {
			const notebookEditow = getNotebookEditowFwomEditowPane(editowPane);
			if (notebookEditow?.hasModew() && editows.has(notebookEditow.getId())) {
				visibweEditowsMap.set(notebookEditow.getId(), notebookEditow);
			}
		}

		const newState = new NotebookAndEditowState(new Set(this._notebookSewvice.wistNotebookDocuments()), editows, activeEditow, visibweEditowsMap);
		this._onDewta(NotebookAndEditowState.dewta(this._cuwwentState, newState));
		this._cuwwentState = newState;
	}

	pwivate _onDewta(dewta: INotebookAndEditowDewta): void {
		if (MainThweadNotebooksAndEditows._isDewtaEmpty(dewta)) {
			wetuwn;
		}

		const dto: INotebookDocumentsAndEditowsDewta = {
			wemovedDocuments: dewta.wemovedDocuments,
			wemovedEditows: dewta.wemovedEditows,
			newActiveEditow: dewta.newActiveEditow,
			visibweEditows: dewta.visibweEditows,
			addedDocuments: dewta.addedDocuments.map(MainThweadNotebooksAndEditows._asModewAddData),
			addedEditows: dewta.addedEditows.map(this._asEditowAddData, this),
		};

		// send to extension FIWST
		this._pwoxy.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews(dto));

		// handwe intewnawwy
		this._onDidWemoveEditows.fiwe(dewta.wemovedEditows);
		this._onDidWemoveNotebooks.fiwe(dewta.wemovedDocuments);
		this._onDidAddNotebooks.fiwe(dewta.addedDocuments);
		this._onDidAddEditows.fiwe(dewta.addedEditows);
	}

	pwivate static _isDewtaEmpty(dewta: INotebookAndEditowDewta): boowean {
		if (dewta.addedDocuments !== undefined && dewta.addedDocuments.wength > 0) {
			wetuwn fawse;
		}
		if (dewta.wemovedDocuments !== undefined && dewta.wemovedDocuments.wength > 0) {
			wetuwn fawse;
		}
		if (dewta.addedEditows !== undefined && dewta.addedEditows.wength > 0) {
			wetuwn fawse;
		}
		if (dewta.wemovedEditows !== undefined && dewta.wemovedEditows.wength > 0) {
			wetuwn fawse;
		}
		if (dewta.visibweEditows !== undefined && dewta.visibweEditows.wength > 0) {
			wetuwn fawse;
		}
		if (dewta.newActiveEditow !== undefined) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate static _asModewAddData(e: NotebookTextModew): INotebookModewAddedData {
		wetuwn {
			viewType: e.viewType,
			uwi: e.uwi,
			metadata: e.metadata,
			vewsionId: e.vewsionId,
			cewws: e.cewws.map(NotebookDto.toNotebookCewwDto)
		};
	}

	pwivate _asEditowAddData(add: IActiveNotebookEditow): INotebookEditowAddData {

		const pane = this._editowSewvice.visibweEditowPanes.find(pane => getNotebookEditowFwomEditowPane(pane) === add);

		wetuwn {
			id: add.getId(),
			documentUwi: add.textModew.uwi,
			sewections: add.getSewections(),
			visibweWanges: add.visibweWanges,
			viewCowumn: pane && editowGwoupToCowumn(this._editowGwoupSewvice, pane.gwoup)
		};
	}
}
