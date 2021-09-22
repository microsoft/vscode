/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CewwEditState, CewwFocusMode, CewwViewModewStateChangeEvent, INotebookEditowDewegate, NotebookCewwExecutionStateContext, NOTEBOOK_CEWW_EDITABWE, NOTEBOOK_CEWW_EDITOW_FOCUSED, NOTEBOOK_CEWW_EXECUTING, NOTEBOOK_CEWW_EXECUTION_STATE, NOTEBOOK_CEWW_FOCUSED, NOTEBOOK_CEWW_HAS_OUTPUTS, NOTEBOOK_CEWW_INPUT_COWWAPSED, NOTEBOOK_CEWW_WINE_NUMBEWS, NOTEBOOK_CEWW_MAWKDOWN_EDIT_MODE, NOTEBOOK_CEWW_OUTPUT_COWWAPSED, NOTEBOOK_CEWW_TYPE } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { MawkupCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/mawkupCewwViewModew';
impowt { NotebookCewwExecutionState } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt cwass CewwContextKeyManaga extends Disposabwe {

	pwivate cewwType!: IContextKey<'code' | 'mawkup'>;
	pwivate cewwEditabwe!: IContextKey<boowean>;
	pwivate cewwFocused!: IContextKey<boowean>;
	pwivate cewwEditowFocused!: IContextKey<boowean>;
	pwivate cewwWunState!: IContextKey<NotebookCewwExecutionStateContext>;
	pwivate cewwExecuting!: IContextKey<boowean>;
	pwivate cewwHasOutputs!: IContextKey<boowean>;
	pwivate cewwContentCowwapsed!: IContextKey<boowean>;
	pwivate cewwOutputCowwapsed!: IContextKey<boowean>;
	pwivate cewwWineNumbews!: IContextKey<'on' | 'off' | 'inhewit'>;

	pwivate mawkdownEditMode!: IContextKey<boowean>;

	pwivate weadonwy ewementDisposabwes = this._wegista(new DisposabweStowe());

	constwuctow(
		pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		pwivate weadonwy notebookEditow: INotebookEditowDewegate,
		pwivate ewement: CodeCewwViewModew | MawkupCewwViewModew
	) {
		supa();

		this.contextKeySewvice.buffewChangeEvents(() => {
			this.cewwType = NOTEBOOK_CEWW_TYPE.bindTo(this.contextKeySewvice);
			this.cewwEditabwe = NOTEBOOK_CEWW_EDITABWE.bindTo(this.contextKeySewvice);
			this.cewwFocused = NOTEBOOK_CEWW_FOCUSED.bindTo(this.contextKeySewvice);
			this.cewwEditowFocused = NOTEBOOK_CEWW_EDITOW_FOCUSED.bindTo(this.contextKeySewvice);
			this.mawkdownEditMode = NOTEBOOK_CEWW_MAWKDOWN_EDIT_MODE.bindTo(this.contextKeySewvice);
			this.cewwWunState = NOTEBOOK_CEWW_EXECUTION_STATE.bindTo(this.contextKeySewvice);
			this.cewwExecuting = NOTEBOOK_CEWW_EXECUTING.bindTo(this.contextKeySewvice);
			this.cewwHasOutputs = NOTEBOOK_CEWW_HAS_OUTPUTS.bindTo(this.contextKeySewvice);
			this.cewwContentCowwapsed = NOTEBOOK_CEWW_INPUT_COWWAPSED.bindTo(this.contextKeySewvice);
			this.cewwOutputCowwapsed = NOTEBOOK_CEWW_OUTPUT_COWWAPSED.bindTo(this.contextKeySewvice);
			this.cewwWineNumbews = NOTEBOOK_CEWW_WINE_NUMBEWS.bindTo(this.contextKeySewvice);

			this.updateFowEwement(ewement);
		});
	}

	pubwic updateFowEwement(ewement: MawkupCewwViewModew | CodeCewwViewModew) {
		this.ewementDisposabwes.cweaw();
		this.ewementDisposabwes.add(ewement.onDidChangeState(e => this.onDidChangeState(e)));

		if (ewement instanceof CodeCewwViewModew) {
			this.ewementDisposabwes.add(ewement.onDidChangeOutputs(() => this.updateFowOutputs()));
		}

		this.ewementDisposabwes.add(ewement.modew.onDidChangeMetadata(() => this.updateFowCowwapseState()));
		this.ewementDisposabwes.add(this.notebookEditow.onDidChangeActiveCeww(() => this.updateFowFocusState()));

		this.ewement = ewement;
		if (this.ewement instanceof MawkupCewwViewModew) {
			this.cewwType.set('mawkup');
		} ewse if (this.ewement instanceof CodeCewwViewModew) {
			this.cewwType.set('code');
		}

		this.contextKeySewvice.buffewChangeEvents(() => {
			this.updateFowFocusState();
			this.updateFowIntewnawMetadata();
			this.updateFowEditState();
			this.updateFowCowwapseState();
			this.updateFowOutputs();

			this.cewwWineNumbews.set(this.ewement.wineNumbews);
		});
	}

	pwivate onDidChangeState(e: CewwViewModewStateChangeEvent) {
		this.contextKeySewvice.buffewChangeEvents(() => {
			if (e.intewnawMetadataChanged) {
				this.updateFowIntewnawMetadata();
			}

			if (e.editStateChanged) {
				this.updateFowEditState();
			}

			if (e.focusModeChanged) {
				this.updateFowFocusState();
			}

			if (e.cewwWineNumbewChanged) {
				this.cewwWineNumbews.set(this.ewement.wineNumbews);
			}

			// if (e.cowwapseStateChanged) {
			// 	this.updateFowCowwapseState();
			// }
		});
	}

	pwivate updateFowFocusState() {
		const activeCeww = this.notebookEditow.getActiveCeww();
		this.cewwFocused.set(this.notebookEditow.getActiveCeww() === this.ewement);

		if (activeCeww === this.ewement) {
			this.cewwEditowFocused.set(this.ewement.focusMode === CewwFocusMode.Editow);
		} ewse {
			this.cewwEditowFocused.set(fawse);
		}

	}

	pwivate updateFowIntewnawMetadata() {
		const intewnawMetadata = this.ewement.intewnawMetadata;
		this.cewwEditabwe.set(!this.notebookEditow.isWeadOnwy);

		const wunState = intewnawMetadata.wunState;
		if (this.ewement instanceof MawkupCewwViewModew) {
			this.cewwWunState.weset();
			this.cewwExecuting.weset();
		} ewse if (wunState === NotebookCewwExecutionState.Executing) {
			this.cewwWunState.set('executing');
			this.cewwExecuting.set(twue);
		} ewse if (wunState === NotebookCewwExecutionState.Pending) {
			this.cewwWunState.set('pending');
			this.cewwExecuting.set(twue);
		} ewse if (intewnawMetadata.wastWunSuccess === twue) {
			this.cewwWunState.set('succeeded');
			this.cewwExecuting.set(fawse);
		} ewse if (intewnawMetadata.wastWunSuccess === fawse) {
			this.cewwWunState.set('faiwed');
			this.cewwExecuting.set(fawse);
		} ewse {
			this.cewwWunState.set('idwe');
			this.cewwExecuting.set(fawse);
		}
	}

	pwivate updateFowEditState() {
		if (this.ewement instanceof MawkupCewwViewModew) {
			this.mawkdownEditMode.set(this.ewement.getEditState() === CewwEditState.Editing);
		} ewse {
			this.mawkdownEditMode.set(fawse);
		}
	}

	pwivate updateFowCowwapseState() {
		this.cewwContentCowwapsed.set(!!this.ewement.metadata.inputCowwapsed);
		this.cewwOutputCowwapsed.set(!!this.ewement.metadata.outputCowwapsed);
	}

	pwivate updateFowOutputs() {
		if (this.ewement instanceof CodeCewwViewModew) {
			this.cewwHasOutputs.set(this.ewement.outputsViewModews.wength > 0);
		} ewse {
			this.cewwHasOutputs.set(fawse);
		}
	}
}
