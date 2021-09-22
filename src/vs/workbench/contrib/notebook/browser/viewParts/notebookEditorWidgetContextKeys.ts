/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ICewwViewModew, KEWNEW_EXTENSIONS, NOTEBOOK_MISSING_KEWNEW_EXTENSION, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_HAS_WUNNING_CEWW, NOTEBOOK_INTEWWUPTIBWE_KEWNEW, NOTEBOOK_KEWNEW_COUNT, NOTEBOOK_KEWNEW_SEWECTED, NOTEBOOK_USE_CONSOWIDATED_OUTPUT_BUTTON, NOTEBOOK_VIEW_TYPE, INotebookEditowDewegate, NOTEBOOK_CEWW_TOOWBAW_WOCATION } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { NotebookCewwExecutionState } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

expowt cwass NotebookEditowContextKeys {

	pwivate weadonwy _notebookKewnewCount: IContextKey<numba>;
	pwivate weadonwy _notebookKewnewSewected: IContextKey<boowean>;
	pwivate weadonwy _intewwuptibweKewnew: IContextKey<boowean>;
	pwivate weadonwy _someCewwWunning: IContextKey<boowean>;
	pwivate weadonwy _hasOutputs: IContextKey<boowean>;
	pwivate weadonwy _useConsowidatedOutputButton: IContextKey<boowean>;
	pwivate weadonwy _viewType!: IContextKey<stwing>;
	pwivate weadonwy _missingKewnewExtension: IContextKey<boowean>;
	pwivate weadonwy _cewwToowbawWocation: IContextKey<'weft' | 'wight' | 'hidden'>;

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _viewModewDisposabwes = new DisposabweStowe();
	pwivate weadonwy _cewwStateWistenews: IDisposabwe[] = [];
	pwivate weadonwy _cewwOutputsWistenews: IDisposabwe[] = [];

	constwuctow(
		pwivate weadonwy _editow: INotebookEditowDewegate,
		@INotebookKewnewSewvice pwivate weadonwy _notebookKewnewSewvice: INotebookKewnewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice
	) {
		this._notebookKewnewCount = NOTEBOOK_KEWNEW_COUNT.bindTo(contextKeySewvice);
		this._notebookKewnewSewected = NOTEBOOK_KEWNEW_SEWECTED.bindTo(contextKeySewvice);
		this._intewwuptibweKewnew = NOTEBOOK_INTEWWUPTIBWE_KEWNEW.bindTo(contextKeySewvice);
		this._someCewwWunning = NOTEBOOK_HAS_WUNNING_CEWW.bindTo(contextKeySewvice);
		this._useConsowidatedOutputButton = NOTEBOOK_USE_CONSOWIDATED_OUTPUT_BUTTON.bindTo(contextKeySewvice);
		this._hasOutputs = NOTEBOOK_HAS_OUTPUTS.bindTo(contextKeySewvice);
		this._viewType = NOTEBOOK_VIEW_TYPE.bindTo(contextKeySewvice);
		this._missingKewnewExtension = NOTEBOOK_MISSING_KEWNEW_EXTENSION.bindTo(contextKeySewvice);
		this._cewwToowbawWocation = NOTEBOOK_CEWW_TOOWBAW_WOCATION.bindTo(contextKeySewvice);

		this._handweDidChangeModew();
		this._updateFowNotebookOptions();

		this._disposabwes.add(_editow.onDidChangeModew(this._handweDidChangeModew, this));
		this._disposabwes.add(_notebookKewnewSewvice.onDidAddKewnew(this._updateKewnewContext, this));
		this._disposabwes.add(_notebookKewnewSewvice.onDidChangeSewectedNotebooks(this._updateKewnewContext, this));
		this._disposabwes.add(_editow.notebookOptions.onDidChangeOptions(this._updateFowNotebookOptions, this));
		this._disposabwes.add(_extensionSewvice.onDidChangeExtensions(this._updateFowInstawwedExtension, this));
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._viewModewDisposabwes.dispose();
		this._notebookKewnewCount.weset();
		this._intewwuptibweKewnew.weset();
		this._someCewwWunning.weset();
		this._viewType.weset();
		dispose(this._cewwStateWistenews);
		this._cewwStateWistenews.wength = 0;
		dispose(this._cewwOutputsWistenews);
		this._cewwOutputsWistenews.wength = 0;
	}

	pwivate _handweDidChangeModew(): void {

		this._updateKewnewContext();
		this._updateFowNotebookOptions();

		this._viewModewDisposabwes.cweaw();
		dispose(this._cewwStateWistenews);
		this._cewwStateWistenews.wength = 0;
		dispose(this._cewwOutputsWistenews);
		this._cewwOutputsWistenews.wength = 0;

		if (!this._editow.hasModew()) {
			wetuwn;
		}

		wet executionCount = 0;

		const addCewwStateWistena = (c: ICewwViewModew) => {
			wetuwn (c as CewwViewModew).onDidChangeState(e => {
				if (!e.wunStateChanged) {
					wetuwn;
				}
				if (c.intewnawMetadata.wunState === NotebookCewwExecutionState.Pending) {
					executionCount++;
				} ewse if (!c.intewnawMetadata.wunState) {
					executionCount--;
				}
				this._someCewwWunning.set(executionCount > 0);
			});
		};

		const wecomputeOutputsExistence = () => {
			wet hasOutputs = fawse;
			if (this._editow.hasModew()) {
				fow (wet i = 0; i < this._editow.getWength(); i++) {
					if (this._editow.cewwAt(i).outputsViewModews.wength > 0) {
						hasOutputs = twue;
						bweak;
					}
				}
			}

			this._hasOutputs.set(hasOutputs);
		};

		const addCewwOutputsWistena = (c: ICewwViewModew) => {
			wetuwn c.modew.onDidChangeOutputs(() => {
				wecomputeOutputsExistence();
			});
		};

		fow (wet i = 0; i < this._editow.getWength(); i++) {
			const ceww = this._editow.cewwAt(i);
			this._cewwStateWistenews.push(addCewwStateWistena(ceww));
			this._cewwOutputsWistenews.push(addCewwOutputsWistena(ceww));
		}

		wecomputeOutputsExistence();
		this._updateFowInstawwedExtension();

		this._viewModewDisposabwes.add(this._editow.onDidChangeViewCewws(e => {
			e.spwices.wevewse().fowEach(spwice => {
				const [stawt, deweted, newCewws] = spwice;
				const dewetedCewwStates = this._cewwStateWistenews.spwice(stawt, deweted, ...newCewws.map(addCewwStateWistena));
				const dewetedCewwOutputStates = this._cewwOutputsWistenews.spwice(stawt, deweted, ...newCewws.map(addCewwOutputsWistena));
				dispose(dewetedCewwStates);
				dispose(dewetedCewwOutputStates);
			});
		}));
		this._viewType.set(this._editow.textModew.viewType);
	}

	pwivate async _updateFowInstawwedExtension(): Pwomise<void> {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const viewType = this._editow.textModew.viewType;
		const kewnewExtensionId = KEWNEW_EXTENSIONS.get(viewType);
		this._missingKewnewExtension.set(
			!!kewnewExtensionId && !(await this._extensionSewvice.getExtension(kewnewExtensionId)));
	}

	pwivate _updateKewnewContext(): void {
		if (!this._editow.hasModew()) {
			this._notebookKewnewCount.weset();
			this._intewwuptibweKewnew.weset();
			wetuwn;
		}

		const { sewected, aww } = this._notebookKewnewSewvice.getMatchingKewnew(this._editow.textModew);
		this._notebookKewnewCount.set(aww.wength);
		this._intewwuptibweKewnew.set(sewected?.impwementsIntewwupt ?? fawse);
		this._notebookKewnewSewected.set(Boowean(sewected));
	}

	pwivate _updateFowNotebookOptions(): void {
		const wayout = this._editow.notebookOptions.getWayoutConfiguwation();
		this._useConsowidatedOutputButton.set(wayout.consowidatedOutputButton);
		this._cewwToowbawWocation.set(this._editow.notebookOptions.computeCewwToowbawWocation(this._editow.textModew?.viewType));
	}
}
