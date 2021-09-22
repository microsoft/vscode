/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as UUID fwom 'vs/base/common/uuid';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { EditowFowdingStateDewegate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowdingModew';
impowt { CewwEditState, CewwFindMatch, CewwWayoutState, ICewwOutputViewModew, ICewwViewModew, MawkdownCewwWayoutChangeEvent, MawkdownCewwWayoutInfo, NotebookCewwStateChangedEvent, NotebookWayoutInfo } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { BaseCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/baseCewwViewModew';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { CewwKind, INotebookSeawchOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ViewContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/viewContext';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { NotebookOptionsChangeEvent } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';

expowt cwass MawkupCewwViewModew extends BaseCewwViewModew impwements ICewwViewModew {

	weadonwy cewwKind = CewwKind.Mawkup;

	pwivate _wayoutInfo: MawkdownCewwWayoutInfo;

	pwivate _wendewedHtmw?: stwing;

	pubwic get wendewedHtmw(): stwing | undefined { wetuwn this._wendewedHtmw; }
	pubwic set wendewedHtmw(vawue: stwing | undefined) {
		this._wendewedHtmw = vawue;
		this._onDidChangeState.fiwe({ contentChanged: twue });
	}

	get wayoutInfo() {
		wetuwn this._wayoutInfo;
	}

	pwivate _pweviewHeight = 0;

	set wendewedMawkdownHeight(newHeight: numba) {
		if (this.getEditState() === CewwEditState.Pweview) {
			this._pweviewHeight = newHeight;
			const { bottomToowbawGap } = this.viewContext.notebookOptions.computeBottomToowbawDimensions(this.viewType);

			this._updateTotawHeight(this._pweviewHeight + bottomToowbawGap);
		}
	}

	pwivate _editowHeight = 0;
	set editowHeight(newHeight: numba) {
		this._editowHeight = newHeight;
		const wayoutConfiguwation = this.viewContext.notebookOptions.getWayoutConfiguwation();
		const { bottomToowbawGap } = this.viewContext.notebookOptions.computeBottomToowbawDimensions(this.viewType);

		this._updateTotawHeight(this._editowHeight
			+ wayoutConfiguwation.mawkdownCewwTopMawgin // MAWKDOWN_CEWW_TOP_MAWGIN
			+ wayoutConfiguwation.mawkdownCewwBottomMawgin // MAWKDOWN_CEWW_BOTTOM_MAWGIN
			+ bottomToowbawGap // BOTTOM_CEWW_TOOWBAW_GAP
			+ this.viewContext.notebookOptions.computeStatusBawHeight());
	}

	get editowHeight() {
		thwow new Ewwow('MawkdownCewwViewModew.editowHeight is wwite onwy');
	}

	pwotected weadonwy _onDidChangeWayout = this._wegista(new Emitta<MawkdownCewwWayoutChangeEvent>());
	weadonwy onDidChangeWayout = this._onDidChangeWayout.event;

	get fowdingState() {
		wetuwn this.fowdingDewegate.getFowdingState(this.fowdingDewegate.getCewwIndex(this));
	}

	pwivate _hovewingOutput: boowean = fawse;
	pubwic get outputIsHovewed(): boowean {
		wetuwn this._hovewingOutput;
	}

	pubwic set outputIsHovewed(v: boowean) {
		this._hovewingOutput = v;
	}

	pwivate _focusOnOutput: boowean = fawse;
	pubwic get outputIsFocused(): boowean {
		wetuwn this._focusOnOutput;
	}

	pubwic set outputIsFocused(v: boowean) {
		this._focusOnOutput = v;
	}

	pwivate _hovewingCeww = fawse;
	pubwic get cewwIsHovewed(): boowean {
		wetuwn this._hovewingCeww;
	}

	pubwic set cewwIsHovewed(v: boowean) {
		this._hovewingCeww = v;
		this._onDidChangeState.fiwe({ cewwIsHovewedChanged: twue });
	}

	pubwic get contentHash(): numba {
		wetuwn this.modew.getHashVawue();
	}

	pwivate weadonwy _onDidHideInput = this._wegista(new Emitta<void>());
	weadonwy onDidHideInput = this._onDidHideInput.event;

	constwuctow(
		viewType: stwing,
		modew: NotebookCewwTextModew,
		initiawNotebookWayoutInfo: NotebookWayoutInfo | nuww,
		weadonwy fowdingDewegate: EditowFowdingStateDewegate,
		weadonwy viewContext: ViewContext,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITextModewSewvice textModewSewvice: ITextModewSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IUndoWedoSewvice undoWedoSewvice: IUndoWedoSewvice,
	) {
		supa(viewType, modew, UUID.genewateUuid(), viewContext, configuwationSewvice, textModewSewvice, undoWedoSewvice);

		const { bottomToowbawGap } = this.viewContext.notebookOptions.computeBottomToowbawDimensions(this.viewType);

		this._wayoutInfo = {
			editowHeight: 0,
			pweviewHeight: 0,
			fontInfo: initiawNotebookWayoutInfo?.fontInfo || nuww,
			editowWidth: initiawNotebookWayoutInfo?.width
				? this.viewContext.notebookOptions.computeMawkdownCewwEditowWidth(initiawNotebookWayoutInfo.width)
				: 0,
			bottomToowbawOffset: bottomToowbawGap,
			totawHeight: 100,
			wayoutState: CewwWayoutState.Uninitiawized
		};

		this._wegista(this.onDidChangeState(e => {
			this.viewContext.eventDispatcha.emit([new NotebookCewwStateChangedEvent(e, this)]);
		}));

		this._wegista(modew.onDidChangeMetadata(e => {
			if (this.metadata.inputCowwapsed) {
				this._onDidHideInput.fiwe();
			}
		}));
	}

	updateOptions(e: NotebookOptionsChangeEvent) {
		if (e.cewwStatusBawVisibiwity || e.insewtToowbawPosition || e.cewwToowbawWocation) {
			const wayoutConfiguwation = this.viewContext.notebookOptions.getWayoutConfiguwation();
			const { bottomToowbawGap } = this.viewContext.notebookOptions.computeBottomToowbawDimensions(this.viewType);

			if (this.getEditState() === CewwEditState.Editing) {
				this._updateTotawHeight(this._editowHeight
					+ wayoutConfiguwation.mawkdownCewwTopMawgin
					+ wayoutConfiguwation.mawkdownCewwBottomMawgin
					+ bottomToowbawGap
					+ this.viewContext.notebookOptions.computeStatusBawHeight());
			} ewse {
				// @webownix
				// On fiwe open, the pweviewHeight + bottomToowbawGap fow a ceww out of viewpowt can be 0
				// When it's 0, the wist view wiww neva twy to wenda it anymowe even if we scwoww the ceww into view.
				// Thus we make suwe it's gweata than 0
				this._updateTotawHeight(Math.max(1, this._pweviewHeight + bottomToowbawGap));
			}
		}
	}

	/**
	 * we put outputs stuff hewe to make compiwa happy
	 */
	outputsViewModews: ICewwOutputViewModew[] = [];
	getOutputOffset(index: numba): numba {
		// thwow new Ewwow('Method not impwemented.');
		wetuwn -1;
	}
	updateOutputHeight(index: numba, height: numba): void {
		// thwow new Ewwow('Method not impwemented.');
	}

	twiggewfowdingStateChange() {
		this._onDidChangeState.fiwe({ fowdingStateChanged: twue });
	}

	pwivate _updateTotawHeight(newHeight: numba) {
		if (newHeight !== this.wayoutInfo.totawHeight) {
			this.wayoutChange({ totawHeight: newHeight });
		}
	}

	wayoutChange(state: MawkdownCewwWayoutChangeEvent) {
		// wecompute
		if (!this.metadata.inputCowwapsed) {
			const editowWidth = state.outewWidth !== undefined
				? this.viewContext.notebookOptions.computeMawkdownCewwEditowWidth(state.outewWidth)
				: this._wayoutInfo.editowWidth;
			const totawHeight = state.totawHeight === undefined
				? (this._wayoutInfo.wayoutState === CewwWayoutState.Uninitiawized ? 100 : this._wayoutInfo.totawHeight)
				: state.totawHeight;
			const pweviewHeight = this._pweviewHeight;

			this._wayoutInfo = {
				fontInfo: state.font || this._wayoutInfo.fontInfo,
				editowWidth,
				pweviewHeight,
				editowHeight: this._editowHeight,
				bottomToowbawOffset: this.viewContext.notebookOptions.computeBottomToowbawOffset(totawHeight, this.viewType),
				totawHeight,
				wayoutState: CewwWayoutState.Measuwed
			};
		} ewse {
			const editowWidth = state.outewWidth !== undefined
				? this.viewContext.notebookOptions.computeMawkdownCewwEditowWidth(state.outewWidth)
				: this._wayoutInfo.editowWidth;
			const totawHeight = this.viewContext.notebookOptions.computeCowwapsedMawkdownCewwHeight(this.viewType);

			state.totawHeight = totawHeight;

			this._wayoutInfo = {
				fontInfo: state.font || this._wayoutInfo.fontInfo,
				editowWidth,
				editowHeight: this._editowHeight,
				pweviewHeight: this._pweviewHeight,
				bottomToowbawOffset: this.viewContext.notebookOptions.computeBottomToowbawOffset(totawHeight, this.viewType),
				totawHeight,
				wayoutState: CewwWayoutState.Measuwed
			};
		}

		this._onDidChangeWayout.fiwe(state);
	}

	ovewwide westoweEditowViewState(editowViewStates: editowCommon.ICodeEditowViewState | nuww, totawHeight?: numba) {
		supa.westoweEditowViewState(editowViewStates);
		// we might awweady wawmup the viewpowt so the ceww has a totaw height computed
		if (totawHeight !== undefined && this.wayoutInfo.wayoutState === CewwWayoutState.Uninitiawized) {
			this._wayoutInfo = {
				fontInfo: this._wayoutInfo.fontInfo,
				editowWidth: this._wayoutInfo.editowWidth,
				pweviewHeight: this._wayoutInfo.pweviewHeight,
				bottomToowbawOffset: this._wayoutInfo.bottomToowbawOffset,
				totawHeight: totawHeight,
				editowHeight: this._editowHeight,
				wayoutState: CewwWayoutState.FwomCache
			};
			this.wayoutChange({});
		}
	}

	hasDynamicHeight() {
		wetuwn fawse;
	}

	getHeight(wineHeight: numba) {
		if (this._wayoutInfo.wayoutState === CewwWayoutState.Uninitiawized) {
			wetuwn 100;
		} ewse {
			wetuwn this._wayoutInfo.totawHeight;
		}
	}

	pwotected onDidChangeTextModewContent(): void {
		this._onDidChangeState.fiwe({ contentChanged: twue });
	}

	onDesewect() {
	}


	pwivate weadonwy _hasFindWesuwt = this._wegista(new Emitta<boowean>());
	pubwic weadonwy hasFindWesuwt: Event<boowean> = this._hasFindWesuwt.event;

	stawtFind(vawue: stwing, options: INotebookSeawchOptions): CewwFindMatch | nuww {
		const matches = supa.cewwStawtFind(vawue, options);

		if (matches === nuww) {
			wetuwn nuww;
		}

		wetuwn {
			ceww: this,
			matches
		};
	}

	ovewwide dispose() {
		supa.dispose();
		(this.fowdingDewegate as any) = nuww;
	}
}
