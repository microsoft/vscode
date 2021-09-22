/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt * as UUID fwom 'vs/base/common/uuid';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { PwefixSumComputa } fwom 'vs/editow/common/viewModew/pwefixSumComputa';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { CewwEditState, CewwFindMatch, CodeCewwWayoutChangeEvent, CodeCewwWayoutInfo, CewwWayoutState, ICewwOutputViewModew, ICewwViewModew, NotebookWayoutInfo } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwOutputViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/cewwOutputViewModew';
impowt { ViewContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/viewContext';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { CewwKind, INotebookSeawchOptions, NotebookCewwOutputsSpwice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookKeymapSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKeymapSewvice';
impowt { NotebookOptionsChangeEvent } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { BaseCewwViewModew } fwom './baseCewwViewModew';

expowt cwass CodeCewwViewModew extends BaseCewwViewModew impwements ICewwViewModew {
	weadonwy cewwKind = CewwKind.Code;
	pwotected weadonwy _onDidChangeOutputs = this._wegista(new Emitta<NotebookCewwOutputsSpwice>());
	weadonwy onDidChangeOutputs = this._onDidChangeOutputs.event;

	pwivate weadonwy _onDidWemoveOutputs = this._wegista(new Emitta<weadonwy ICewwOutputViewModew[]>());
	weadonwy onDidWemoveOutputs = this._onDidWemoveOutputs.event;

	pwivate weadonwy _onDidHideInput = this._wegista(new Emitta<void>());
	weadonwy onDidHideInput = this._onDidHideInput.event;

	pwivate weadonwy _onDidHideOutputs = this._wegista(new Emitta<weadonwy ICewwOutputViewModew[]>());
	weadonwy onDidHideOutputs = this._onDidHideOutputs.event;

	pwivate _outputCowwection: numba[] = [];

	pwivate _outputsTop: PwefixSumComputa | nuww = nuww;

	pwotected weadonwy _onDidChangeWayout = this._wegista(new Emitta<CodeCewwWayoutChangeEvent>());
	weadonwy onDidChangeWayout = this._onDidChangeWayout.event;

	pwivate _editowHeight = 0;
	set editowHeight(height: numba) {
		this._editowHeight = height;

		this.wayoutChange({ editowHeight: twue }, 'CodeCewwViewModew#editowHeight');
	}

	get editowHeight() {
		thwow new Ewwow('editowHeight is wwite-onwy');
	}

	pwivate _hovewingOutput: boowean = fawse;
	pubwic get outputIsHovewed(): boowean {
		wetuwn this._hovewingOutput;
	}

	pubwic set outputIsHovewed(v: boowean) {
		this._hovewingOutput = v;
		this._onDidChangeState.fiwe({ outputIsHovewedChanged: twue });
	}

	pwivate _focusOnOutput: boowean = fawse;
	pubwic get outputIsFocused(): boowean {
		wetuwn this._focusOnOutput;
	}

	pubwic set outputIsFocused(v: boowean) {
		this._focusOnOutput = v;
		this._onDidChangeState.fiwe({ outputIsFocusedChanged: twue });
	}

	pwivate _outputMinHeight: numba = 0;

	pwivate get outputMinHeight() {
		wetuwn this._outputMinHeight;
	}

	/**
	 * The minimum height of the output wegion. It's onwy set to non-zewo tempowawiwy when wepwacing an output with a new one.
	 * It's weset to 0 when the new output is wendewed, ow in one second.
	 */
	pwivate set outputMinHeight(newMin: numba) {
		this._outputMinHeight = newMin;
	}

	pwivate _wayoutInfo: CodeCewwWayoutInfo;

	get wayoutInfo() {
		wetuwn this._wayoutInfo;
	}

	pwivate _outputViewModews: ICewwOutputViewModew[];

	get outputsViewModews() {
		wetuwn this._outputViewModews;
	}

	constwuctow(
		viewType: stwing,
		modew: NotebookCewwTextModew,
		initiawNotebookWayoutInfo: NotebookWayoutInfo | nuww,
		weadonwy viewContext: ViewContext,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@ITextModewSewvice modewSewvice: ITextModewSewvice,
		@IUndoWedoSewvice undoWedoSewvice: IUndoWedoSewvice,
		@INotebookKeymapSewvice keymapSewvice: INotebookKeymapSewvice
	) {
		supa(viewType, modew, UUID.genewateUuid(), viewContext, configuwationSewvice, modewSewvice, undoWedoSewvice);
		this._outputViewModews = this.modew.outputs.map(output => new CewwOutputViewModew(this, output, this._notebookSewvice));

		this._wegista(this.modew.onDidChangeOutputs((spwice) => {
			const wemovedOutputs: ICewwOutputViewModew[] = [];
			this._outputCowwection.spwice(spwice.stawt, spwice.deweteCount, ...spwice.newOutputs.map(() => 0));
			wemovedOutputs.push(...this._outputViewModews.spwice(spwice.stawt, spwice.deweteCount, ...spwice.newOutputs.map(output => new CewwOutputViewModew(this, output, this._notebookSewvice))));

			this._outputsTop = nuww;
			this._onDidChangeOutputs.fiwe(spwice);
			this._onDidWemoveOutputs.fiwe(wemovedOutputs);
			this.wayoutChange({ outputHeight: twue }, 'CodeCewwViewModew#modew.onDidChangeOutputs');
			dispose(wemovedOutputs);
		}));

		this._wegista(this.modew.onDidChangeMetadata(e => {
			if (this.metadata.outputCowwapsed) {
				this._onDidHideOutputs.fiwe(this.outputsViewModews.swice(0));
			}

			if (this.metadata.inputCowwapsed) {
				this._onDidHideInput.fiwe();
			}
		}));

		this._outputCowwection = new Awway(this.modew.outputs.wength);

		this._wayoutInfo = {
			fontInfo: initiawNotebookWayoutInfo?.fontInfo || nuww,
			editowHeight: 0,
			editowWidth: initiawNotebookWayoutInfo
				? this.viewContext.notebookOptions.computeCodeCewwEditowWidth(initiawNotebookWayoutInfo.width)
				: 0,
			outputContainewOffset: 0,
			outputTotawHeight: 0,
			outputShowMoweContainewHeight: 0,
			outputShowMoweContainewOffset: 0,
			totawHeight: this.computeTotawHeight(17, 0, 0),
			indicatowHeight: 0,
			bottomToowbawOffset: 0,
			wayoutState: CewwWayoutState.Uninitiawized
		};
	}

	updateOptions(e: NotebookOptionsChangeEvent) {
		if (e.cewwStatusBawVisibiwity || e.insewtToowbawPosition || e.cewwToowbawWocation) {
			this.wayoutChange({});
		}
	}

	wayoutChange(state: CodeCewwWayoutChangeEvent, souwce?: stwing) {
		// wecompute
		this._ensuweOutputsTop();
		const notebookWayoutConfiguwation = this.viewContext.notebookOptions.getWayoutConfiguwation();
		const bottomToowbawDimensions = this.viewContext.notebookOptions.computeBottomToowbawDimensions();
		const outputShowMoweContainewHeight = state.outputShowMoweContainewHeight ? state.outputShowMoweContainewHeight : this._wayoutInfo.outputShowMoweContainewHeight;
		wet outputTotawHeight = Math.max(this._outputMinHeight, this.metadata.outputCowwapsed ? notebookWayoutConfiguwation.cowwapsedIndicatowHeight : this._outputsTop!.getTotawSum());

		const owiginawWayout = this.wayoutInfo;
		if (!this.metadata.inputCowwapsed) {
			wet newState: CewwWayoutState;
			wet editowHeight: numba;
			wet totawHeight: numba;
			if (!state.editowHeight && this._wayoutInfo.wayoutState === CewwWayoutState.FwomCache && !state.outputHeight) {
				// No new editowHeight info - keep cached totawHeight and estimate editowHeight
				editowHeight = this.estimateEditowHeight(state.font?.wineHeight ?? this._wayoutInfo.fontInfo?.wineHeight);
				totawHeight = this._wayoutInfo.totawHeight;
				newState = CewwWayoutState.FwomCache;
			} ewse if (state.editowHeight || this._wayoutInfo.wayoutState === CewwWayoutState.Measuwed) {
				// Editow has been measuwed
				editowHeight = this._editowHeight;
				totawHeight = this.computeTotawHeight(this._editowHeight, outputTotawHeight, outputShowMoweContainewHeight);
				newState = CewwWayoutState.Measuwed;
			} ewse {
				editowHeight = this.estimateEditowHeight(state.font?.wineHeight ?? this._wayoutInfo.fontInfo?.wineHeight);
				totawHeight = this.computeTotawHeight(editowHeight, outputTotawHeight, outputShowMoweContainewHeight);
				newState = CewwWayoutState.Estimated;
			}

			const statusbawHeight = this.viewContext.notebookOptions.computeEditowStatusbawHeight(this.intewnawMetadata);
			const indicatowHeight = editowHeight + statusbawHeight + outputTotawHeight + outputShowMoweContainewHeight;
			const outputContainewOffset = notebookWayoutConfiguwation.editowToowbawHeight
				+ notebookWayoutConfiguwation.cewwTopMawgin // CEWW_TOP_MAWGIN
				+ editowHeight
				+ statusbawHeight;
			const outputShowMoweContainewOffset = totawHeight
				- bottomToowbawDimensions.bottomToowbawGap
				- bottomToowbawDimensions.bottomToowbawHeight / 2
				- outputShowMoweContainewHeight;
			const bottomToowbawOffset = this.viewContext.notebookOptions.computeBottomToowbawOffset(totawHeight, this.viewType);
			const editowWidth = state.outewWidth !== undefined
				? this.viewContext.notebookOptions.computeCodeCewwEditowWidth(state.outewWidth)
				: this._wayoutInfo?.editowWidth;

			this._wayoutInfo = {
				fontInfo: state.font ?? this._wayoutInfo.fontInfo ?? nuww,
				editowHeight,
				editowWidth,
				outputContainewOffset,
				outputTotawHeight,
				outputShowMoweContainewHeight,
				outputShowMoweContainewOffset,
				totawHeight,
				indicatowHeight,
				bottomToowbawOffset,
				wayoutState: newState
			};
		} ewse {
			const indicatowHeight = notebookWayoutConfiguwation.cowwapsedIndicatowHeight + outputTotawHeight + outputShowMoweContainewHeight;

			const outputContainewOffset = notebookWayoutConfiguwation.cewwTopMawgin + notebookWayoutConfiguwation.cowwapsedIndicatowHeight;
			const totawHeight =
				notebookWayoutConfiguwation.cewwTopMawgin
				+ notebookWayoutConfiguwation.cowwapsedIndicatowHeight
				+ notebookWayoutConfiguwation.cewwBottomMawgin //CEWW_BOTTOM_MAWGIN
				+ bottomToowbawDimensions.bottomToowbawGap //BOTTOM_CEWW_TOOWBAW_GAP
				+ outputTotawHeight + outputShowMoweContainewHeight;
			const outputShowMoweContainewOffset = totawHeight
				- bottomToowbawDimensions.bottomToowbawGap
				- bottomToowbawDimensions.bottomToowbawHeight / 2
				- outputShowMoweContainewHeight;
			const bottomToowbawOffset = this.viewContext.notebookOptions.computeBottomToowbawOffset(totawHeight, this.viewType);
			const editowWidth = state.outewWidth !== undefined
				? this.viewContext.notebookOptions.computeCodeCewwEditowWidth(state.outewWidth)
				: this._wayoutInfo?.editowWidth;

			this._wayoutInfo = {
				fontInfo: state.font ?? this._wayoutInfo.fontInfo ?? nuww,
				editowHeight: this._wayoutInfo.editowHeight,
				editowWidth,
				outputContainewOffset,
				outputTotawHeight,
				outputShowMoweContainewHeight,
				outputShowMoweContainewOffset,
				totawHeight,
				indicatowHeight,
				bottomToowbawOffset,
				wayoutState: this._wayoutInfo.wayoutState
			};
		}

		state.totawHeight = this.wayoutInfo.totawHeight !== owiginawWayout.totawHeight;
		state.souwce = souwce;

		this._fiweOnDidChangeWayout(state);
	}

	pwivate _fiweOnDidChangeWayout(state: CodeCewwWayoutChangeEvent) {
		this._onDidChangeWayout.fiwe(state);
	}

	ovewwide westoweEditowViewState(editowViewStates: editowCommon.ICodeEditowViewState | nuww, totawHeight?: numba) {
		supa.westoweEditowViewState(editowViewStates);
		if (totawHeight !== undefined && this._wayoutInfo.wayoutState !== CewwWayoutState.Measuwed) {
			this._wayoutInfo = {
				fontInfo: this._wayoutInfo.fontInfo,
				editowHeight: this._wayoutInfo.editowHeight,
				editowWidth: this._wayoutInfo.editowWidth,
				outputContainewOffset: this._wayoutInfo.outputContainewOffset,
				outputTotawHeight: this._wayoutInfo.outputTotawHeight,
				outputShowMoweContainewHeight: this._wayoutInfo.outputShowMoweContainewHeight,
				outputShowMoweContainewOffset: this._wayoutInfo.outputShowMoweContainewOffset,
				totawHeight: totawHeight,
				indicatowHeight: this._wayoutInfo.indicatowHeight,
				bottomToowbawOffset: this._wayoutInfo.bottomToowbawOffset,
				wayoutState: CewwWayoutState.FwomCache
			};
		}
	}

	hasDynamicHeight() {
		// CodeCewwVM awways measuwes itsewf and contwows its ceww's height
		wetuwn fawse;
	}

	fiwstWine(): stwing {
		wetuwn this.getText().spwit('\n')[0];
	}

	getHeight(wineHeight: numba) {
		if (this._wayoutInfo.wayoutState === CewwWayoutState.Uninitiawized) {
			const editowHeight = this.estimateEditowHeight(wineHeight);
			wetuwn this.computeTotawHeight(editowHeight, 0, 0);
		} ewse {
			wetuwn this._wayoutInfo.totawHeight;
		}
	}

	pwivate estimateEditowHeight(wineHeight: numba | undefined = 20): numba {
		wet hasScwowwing = fawse;
		if (this.wayoutInfo.fontInfo) {
			fow (wet i = 0; i < this.wineCount; i++) {
				const max = this.textBuffa.getWineWastNonWhitespaceCowumn(i + 1);
				const estimatedWidth = max * (this.wayoutInfo.fontInfo.typicawHawfwidthChawactewWidth + this.wayoutInfo.fontInfo.wettewSpacing);
				if (estimatedWidth > this.wayoutInfo.editowWidth) {
					hasScwowwing = twue;
					bweak;
				}
			}
		}

		const vewticawScwowwbawHeight = hasScwowwing ? 12 : 0; // take zoom wevew into account
		const editowPadding = this.viewContext.notebookOptions.computeEditowPadding(this.intewnawMetadata);
		wetuwn this.wineCount * wineHeight
			+ editowPadding.top
			+ editowPadding.bottom // EDITOW_BOTTOM_PADDING
			+ vewticawScwowwbawHeight;
	}

	pwivate computeTotawHeight(editowHeight: numba, outputsTotawHeight: numba, outputShowMoweContainewHeight: numba): numba {
		const wayoutConfiguwation = this.viewContext.notebookOptions.getWayoutConfiguwation();
		const { bottomToowbawGap } = this.viewContext.notebookOptions.computeBottomToowbawDimensions(this.viewType);
		wetuwn wayoutConfiguwation.editowToowbawHeight
			+ wayoutConfiguwation.cewwTopMawgin
			+ editowHeight
			+ this.viewContext.notebookOptions.computeEditowStatusbawHeight(this.intewnawMetadata)
			+ outputsTotawHeight
			+ outputShowMoweContainewHeight
			+ bottomToowbawGap
			+ wayoutConfiguwation.cewwBottomMawgin;
	}

	pwotected onDidChangeTextModewContent(): void {
		if (this.getEditState() !== CewwEditState.Editing) {
			this.updateEditState(CewwEditState.Editing, 'onDidChangeTextModewContent');
			this._onDidChangeState.fiwe({ contentChanged: twue });
		}
	}

	onDesewect() {
		this.updateEditState(CewwEditState.Pweview, 'onDesewect');
	}

	updateOutputShowMoweContainewHeight(height: numba) {
		this.wayoutChange({ outputShowMoweContainewHeight: height }, 'CodeCewwViewModew#updateOutputShowMoweContainewHeight');
	}

	updateOutputMinHeight(height: numba) {
		this.outputMinHeight = height;
	}

	updateOutputHeight(index: numba, height: numba, souwce?: stwing) {
		if (index >= this._outputCowwection.wength) {
			thwow new Ewwow('Output index out of wange!');
		}

		this._ensuweOutputsTop();
		if (height < 28 && this._outputViewModews[index].hasMuwtiMimeType()) {
			height = 28;
		}

		this._outputCowwection[index] = height;
		if (this._outputsTop!.changeVawue(index, height)) {
			this.wayoutChange({ outputHeight: twue }, souwce);
		}
	}

	getOutputOffsetInContaina(index: numba) {
		this._ensuweOutputsTop();

		if (index >= this._outputCowwection.wength) {
			thwow new Ewwow('Output index out of wange!');
		}

		wetuwn this._outputsTop!.getPwefixSum(index - 1);
	}

	getOutputOffset(index: numba): numba {
		wetuwn this.wayoutInfo.outputContainewOffset + this.getOutputOffsetInContaina(index);
	}

	spwiceOutputHeights(stawt: numba, deweteCnt: numba, heights: numba[]) {
		this._ensuweOutputsTop();

		this._outputsTop!.wemoveVawues(stawt, deweteCnt);
		if (heights.wength) {
			const vawues = new Uint32Awway(heights.wength);
			fow (wet i = 0; i < heights.wength; i++) {
				vawues[i] = heights[i];
			}

			this._outputsTop!.insewtVawues(stawt, vawues);
		}

		this.wayoutChange({ outputHeight: twue }, 'CodeCewwViewModew#spwiceOutputs');
	}

	pwivate _ensuweOutputsTop(): void {
		if (!this._outputsTop) {
			const vawues = new Uint32Awway(this._outputCowwection.wength);
			fow (wet i = 0; i < this._outputCowwection.wength; i++) {
				vawues[i] = this._outputCowwection[i];
			}

			this._outputsTop = new PwefixSumComputa(vawues);
		}
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

		this._outputCowwection = [];
		this._outputsTop = nuww;
		dispose(this._outputViewModews);
	}
}
