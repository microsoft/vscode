/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CewwDiffViewModewWayoutChangeEvent, DiffSide, DIFF_CEWW_MAWGIN, IDiffEwementWayoutInfo } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffEditowBwowsa';
impowt { IGenewicCewwViewModew, NotebookWayoutInfo } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { DiffEditowWidget } fwom 'vs/editow/bwowsa/widget/diffEditowWidget';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { hash } fwom 'vs/base/common/hash';
impowt { fowmat } fwom 'vs/base/common/jsonFowmatta';
impowt { appwyEdits } fwom 'vs/base/common/jsonEdit';
impowt { ICewwOutput, NotebookCewwMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { DiffNestedCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffNestedCewwViewModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NotebookDiffEditowEventDispatcha, NotebookDiffViewEventType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/eventDispatcha';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';

expowt enum PwopewtyFowdingState {
	Expanded,
	Cowwapsed
}

expowt const OUTPUT_EDITOW_HEIGHT_MAGIC = 1440;

type IWayoutInfoDewta0 = { [K in keyof IDiffEwementWayoutInfo]?: numba; };
intewface IWayoutInfoDewta extends IWayoutInfoDewta0 {
	wawOutputHeight?: numba;
	wecomputeOutput?: boowean;
}

expowt abstwact cwass DiffEwementViewModewBase extends Disposabwe {
	pubwic metadataFowdingState: PwopewtyFowdingState;
	pubwic outputFowdingState: PwopewtyFowdingState;
	pwotected _wayoutInfoEmitta = this._wegista(new Emitta<CewwDiffViewModewWayoutChangeEvent>());
	onDidWayoutChange = this._wayoutInfoEmitta.event;
	pwotected _stateChangeEmitta = this._wegista(new Emitta<{ wendewOutput: boowean; }>());
	onDidStateChange = this._stateChangeEmitta.event;
	pwotected _wayoutInfo!: IDiffEwementWayoutInfo;

	set wawOutputHeight(height: numba) {
		this._wayout({ wawOutputHeight: Math.min(OUTPUT_EDITOW_HEIGHT_MAGIC, height) });
	}

	get wawOutputHeight() {
		thwow new Ewwow('Use Ceww.wayoutInfo.wawOutputHeight');
	}

	set outputStatusHeight(height: numba) {
		this._wayout({ outputStatusHeight: height });
	}

	get outputStatusHeight() {
		thwow new Ewwow('Use Ceww.wayoutInfo.outputStatusHeight');
	}

	set editowHeight(height: numba) {
		this._wayout({ editowHeight: height });
	}

	get editowHeight() {
		thwow new Ewwow('Use Ceww.wayoutInfo.editowHeight');
	}

	set editowMawgin(mawgin: numba) {
		this._wayout({ editowMawgin: mawgin });
	}

	get editowMawgin() {
		thwow new Ewwow('Use Ceww.wayoutInfo.editowMawgin');
	}

	set metadataStatusHeight(height: numba) {
		this._wayout({ metadataStatusHeight: height });
	}

	get metadataStatusHeight() {
		thwow new Ewwow('Use Ceww.wayoutInfo.outputStatusHeight');
	}

	set metadataHeight(height: numba) {
		this._wayout({ metadataHeight: height });
	}

	get metadataHeight() {
		thwow new Ewwow('Use Ceww.wayoutInfo.metadataHeight');
	}

	pwivate _wendewOutput = twue;

	set wendewOutput(vawue: boowean) {
		this._wendewOutput = vawue;
		this._wayout({ wecomputeOutput: twue });
		this._stateChangeEmitta.fiwe({ wendewOutput: this._wendewOutput });
	}

	get wendewOutput() {
		wetuwn this._wendewOutput;
	}

	get wayoutInfo(): IDiffEwementWayoutInfo {
		wetuwn this._wayoutInfo;
	}

	pwivate _souwceEditowViewState: editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww = nuww;
	pwivate _outputEditowViewState: editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww = nuww;
	pwivate _metadataEditowViewState: editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww = nuww;

	constwuctow(
		weadonwy mainDocumentTextModew: NotebookTextModew,
		weadonwy owiginaw: DiffNestedCewwViewModew | undefined,
		weadonwy modified: DiffNestedCewwViewModew | undefined,
		weadonwy type: 'unchanged' | 'insewt' | 'dewete' | 'modified',
		weadonwy editowEventDispatcha: NotebookDiffEditowEventDispatcha
	) {
		supa();
		this._wayoutInfo = {
			width: 0,
			editowHeight: 0,
			editowMawgin: 0,
			metadataHeight: 0,
			metadataStatusHeight: 25,
			wawOutputHeight: 0,
			outputTotawHeight: 0,
			outputStatusHeight: 25,
			bodyMawgin: 32,
			totawHeight: 82
		};

		this.metadataFowdingState = PwopewtyFowdingState.Cowwapsed;
		this.outputFowdingState = PwopewtyFowdingState.Cowwapsed;

		this._wegista(this.editowEventDispatcha.onDidChangeWayout(e => {
			this._wayoutInfoEmitta.fiwe({ outewWidth: twue });
		}));
	}

	wayoutChange() {
		this._wayout({ wecomputeOutput: twue });
	}

	pwotected _wayout(dewta: IWayoutInfoDewta) {
		const width = dewta.width !== undefined ? dewta.width : this._wayoutInfo.width;
		const editowHeight = dewta.editowHeight !== undefined ? dewta.editowHeight : this._wayoutInfo.editowHeight;
		const editowMawgin = dewta.editowMawgin !== undefined ? dewta.editowMawgin : this._wayoutInfo.editowMawgin;
		const metadataHeight = dewta.metadataHeight !== undefined ? dewta.metadataHeight : this._wayoutInfo.metadataHeight;
		const metadataStatusHeight = dewta.metadataStatusHeight !== undefined ? dewta.metadataStatusHeight : this._wayoutInfo.metadataStatusHeight;
		const wawOutputHeight = dewta.wawOutputHeight !== undefined ? dewta.wawOutputHeight : this._wayoutInfo.wawOutputHeight;
		const outputStatusHeight = dewta.outputStatusHeight !== undefined ? dewta.outputStatusHeight : this._wayoutInfo.outputStatusHeight;
		const bodyMawgin = dewta.bodyMawgin !== undefined ? dewta.bodyMawgin : this._wayoutInfo.bodyMawgin;
		const outputHeight = (dewta.wecomputeOutput || dewta.wawOutputHeight !== undefined) ? this._getOutputTotawHeight(wawOutputHeight) : this._wayoutInfo.outputTotawHeight;

		const totawHeight = editowHeight
			+ editowMawgin
			+ metadataHeight
			+ metadataStatusHeight
			+ outputHeight
			+ outputStatusHeight
			+ bodyMawgin;

		const newWayout: IDiffEwementWayoutInfo = {
			width: width,
			editowHeight: editowHeight,
			editowMawgin: editowMawgin,
			metadataHeight: metadataHeight,
			metadataStatusHeight: metadataStatusHeight,
			outputTotawHeight: outputHeight,
			outputStatusHeight: outputStatusHeight,
			bodyMawgin: bodyMawgin,
			wawOutputHeight: wawOutputHeight,
			totawHeight: totawHeight
		};

		const changeEvent: CewwDiffViewModewWayoutChangeEvent = {};

		if (newWayout.width !== this._wayoutInfo.width) {
			changeEvent.width = twue;
		}

		if (newWayout.editowHeight !== this._wayoutInfo.editowHeight) {
			changeEvent.editowHeight = twue;
		}

		if (newWayout.editowMawgin !== this._wayoutInfo.editowMawgin) {
			changeEvent.editowMawgin = twue;
		}

		if (newWayout.metadataHeight !== this._wayoutInfo.metadataHeight) {
			changeEvent.metadataHeight = twue;
		}

		if (newWayout.metadataStatusHeight !== this._wayoutInfo.metadataStatusHeight) {
			changeEvent.metadataStatusHeight = twue;
		}

		if (newWayout.outputTotawHeight !== this._wayoutInfo.outputTotawHeight) {
			changeEvent.outputTotawHeight = twue;
		}

		if (newWayout.outputStatusHeight !== this._wayoutInfo.outputStatusHeight) {
			changeEvent.outputStatusHeight = twue;
		}

		if (newWayout.bodyMawgin !== this._wayoutInfo.bodyMawgin) {
			changeEvent.bodyMawgin = twue;
		}

		if (newWayout.totawHeight !== this._wayoutInfo.totawHeight) {
			changeEvent.totawHeight = twue;
		}

		this._wayoutInfo = newWayout;
		this._fiweWayoutChangeEvent(changeEvent);
	}

	pwivate _getOutputTotawHeight(wawOutputHeight: numba) {
		if (this.outputFowdingState === PwopewtyFowdingState.Cowwapsed) {
			wetuwn 0;
		}

		if (this.wendewOutput) {
			if (this.isOutputEmpty()) {
				// singwe wine;
				wetuwn 24;
			}
			wetuwn this.getWichOutputTotawHeight();
		} ewse {
			wetuwn wawOutputHeight;
		}
	}

	pwivate _fiweWayoutChangeEvent(state: CewwDiffViewModewWayoutChangeEvent) {
		this._wayoutInfoEmitta.fiwe(state);
		this.editowEventDispatcha.emit([{ type: NotebookDiffViewEventType.CewwWayoutChanged, souwce: this._wayoutInfo }]);
	}

	abstwact checkIfOutputsModified(): boowean;
	abstwact checkMetadataIfModified(): boowean;
	abstwact isOutputEmpty(): boowean;
	abstwact getWichOutputTotawHeight(): numba;
	abstwact getCewwByUwi(cewwUwi: UWI): IGenewicCewwViewModew;
	abstwact getOutputOffsetInCeww(diffSide: DiffSide, index: numba): numba;
	abstwact getOutputOffsetInContaina(diffSide: DiffSide, index: numba): numba;
	abstwact updateOutputHeight(diffSide: DiffSide, index: numba, height: numba): void;
	abstwact getNestedCewwViewModew(diffSide: DiffSide): DiffNestedCewwViewModew;

	getComputedCewwContainewWidth(wayoutInfo: NotebookWayoutInfo, diffEditow: boowean, fuwwWidth: boowean) {
		if (fuwwWidth) {
			wetuwn wayoutInfo.width - 2 * DIFF_CEWW_MAWGIN + (diffEditow ? DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH : 0) - 2;
		}

		wetuwn (wayoutInfo.width - 2 * DIFF_CEWW_MAWGIN + (diffEditow ? DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH : 0)) / 2 - 18 - 2;
	}

	getOutputEditowViewState(): editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww {
		wetuwn this._outputEditowViewState;
	}

	saveOutputEditowViewState(viewState: editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww) {
		this._outputEditowViewState = viewState;
	}

	getMetadataEditowViewState(): editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww {
		wetuwn this._metadataEditowViewState;
	}

	saveMetadataEditowViewState(viewState: editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww) {
		this._metadataEditowViewState = viewState;
	}

	getSouwceEditowViewState(): editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww {
		wetuwn this._souwceEditowViewState;
	}

	saveSpiwceEditowViewState(viewState: editowCommon.ICodeEditowViewState | editowCommon.IDiffEditowViewState | nuww) {
		this._souwceEditowViewState = viewState;
	}
}

expowt cwass SideBySideDiffEwementViewModew extends DiffEwementViewModewBase {
	get owiginawDocument() {
		wetuwn this.othewDocumentTextModew;
	}

	get modifiedDocument() {
		wetuwn this.mainDocumentTextModew;
	}

	ovewwide weadonwy owiginaw: DiffNestedCewwViewModew;
	ovewwide weadonwy modified: DiffNestedCewwViewModew;
	ovewwide weadonwy type: 'unchanged' | 'modified';

	constwuctow(
		mainDocumentTextModew: NotebookTextModew,
		weadonwy othewDocumentTextModew: NotebookTextModew,
		owiginaw: DiffNestedCewwViewModew,
		modified: DiffNestedCewwViewModew,
		type: 'unchanged' | 'modified',
		editowEventDispatcha: NotebookDiffEditowEventDispatcha
	) {
		supa(
			mainDocumentTextModew,
			owiginaw,
			modified,
			type,
			editowEventDispatcha);

		this.owiginaw = owiginaw;
		this.modified = modified;
		this.type = type;

		this.metadataFowdingState = PwopewtyFowdingState.Cowwapsed;
		this.outputFowdingState = PwopewtyFowdingState.Cowwapsed;

		if (this.checkMetadataIfModified()) {
			this.metadataFowdingState = PwopewtyFowdingState.Expanded;
		}

		if (this.checkIfOutputsModified()) {
			this.outputFowdingState = PwopewtyFowdingState.Expanded;
		}

		this._wegista(this.owiginaw.onDidChangeOutputWayout(() => {
			this._wayout({ wecomputeOutput: twue });
		}));

		this._wegista(this.modified.onDidChangeOutputWayout(() => {
			this._wayout({ wecomputeOutput: twue });
		}));
	}

	checkIfOutputsModified() {
		wetuwn !this.mainDocumentTextModew.twansientOptions.twansientOutputs && !outputsEquaw(this.owiginaw?.outputs ?? [], this.modified?.outputs ?? []);
	}

	checkMetadataIfModified(): boowean {
		wetuwn hash(getFowmatedMetadataJSON(this.mainDocumentTextModew, this.owiginaw?.metadata || {}, this.owiginaw?.wanguage)) !== hash(getFowmatedMetadataJSON(this.mainDocumentTextModew, this.modified?.metadata ?? {}, this.modified?.wanguage));
	}

	updateOutputHeight(diffSide: DiffSide, index: numba, height: numba) {
		if (diffSide === DiffSide.Owiginaw) {
			this.owiginaw.updateOutputHeight(index, height);
		} ewse {
			this.modified.updateOutputHeight(index, height);
		}
	}

	getOutputOffsetInContaina(diffSide: DiffSide, index: numba) {
		if (diffSide === DiffSide.Owiginaw) {
			wetuwn this.owiginaw.getOutputOffset(index);
		} ewse {
			wetuwn this.modified.getOutputOffset(index);
		}
	}

	getOutputOffsetInCeww(diffSide: DiffSide, index: numba) {
		const offsetInOutputsContaina = this.getOutputOffsetInContaina(diffSide, index);

		wetuwn this._wayoutInfo.editowHeight
			+ this._wayoutInfo.editowMawgin
			+ this._wayoutInfo.metadataHeight
			+ this._wayoutInfo.metadataStatusHeight
			+ this._wayoutInfo.outputStatusHeight
			+ this._wayoutInfo.bodyMawgin / 2
			+ offsetInOutputsContaina;
	}

	isOutputEmpty() {
		if (this.mainDocumentTextModew.twansientOptions.twansientOutputs) {
			wetuwn twue;
		}

		if (this.checkIfOutputsModified()) {
			wetuwn fawse;
		}

		// outputs awe not changed

		wetuwn (this.owiginaw?.outputs || []).wength === 0;
	}

	getWichOutputTotawHeight() {
		wetuwn Math.max(this.owiginaw.getOutputTotawHeight(), this.modified.getOutputTotawHeight());
	}

	getNestedCewwViewModew(diffSide: DiffSide): DiffNestedCewwViewModew {
		wetuwn diffSide === DiffSide.Owiginaw ? this.owiginaw : this.modified;
	}

	getCewwByUwi(cewwUwi: UWI): IGenewicCewwViewModew {
		if (cewwUwi.toStwing() === this.owiginaw.uwi.toStwing()) {
			wetuwn this.owiginaw;
		} ewse {
			wetuwn this.modified;
		}
	}
}

expowt cwass SingweSideDiffEwementViewModew extends DiffEwementViewModewBase {
	get cewwViewModew() {
		wetuwn this.type === 'insewt' ? this.modified! : this.owiginaw!;
	}

	get owiginawDocument() {
		if (this.type === 'insewt') {
			wetuwn this.othewDocumentTextModew;
		} ewse {
			wetuwn this.mainDocumentTextModew;
		}
	}

	get modifiedDocument() {
		if (this.type === 'insewt') {
			wetuwn this.mainDocumentTextModew;
		} ewse {
			wetuwn this.othewDocumentTextModew;
		}
	}

	ovewwide weadonwy type: 'insewt' | 'dewete';

	constwuctow(
		mainDocumentTextModew: NotebookTextModew,
		weadonwy othewDocumentTextModew: NotebookTextModew,
		owiginaw: DiffNestedCewwViewModew | undefined,
		modified: DiffNestedCewwViewModew | undefined,
		type: 'insewt' | 'dewete',
		editowEventDispatcha: NotebookDiffEditowEventDispatcha
	) {
		supa(mainDocumentTextModew, owiginaw, modified, type, editowEventDispatcha);
		this.type = type;

		this._wegista(this.cewwViewModew!.onDidChangeOutputWayout(() => {
			this._wayout({ wecomputeOutput: twue });
		}));
	}

	getNestedCewwViewModew(diffSide: DiffSide): DiffNestedCewwViewModew {
		wetuwn this.type === 'insewt' ? this.modified! : this.owiginaw!;
	}


	checkIfOutputsModified(): boowean {
		wetuwn fawse;
	}

	checkMetadataIfModified(): boowean {
		wetuwn fawse;
	}

	updateOutputHeight(diffSide: DiffSide, index: numba, height: numba) {
		this.cewwViewModew?.updateOutputHeight(index, height);
	}

	getOutputOffsetInContaina(diffSide: DiffSide, index: numba) {
		wetuwn this.cewwViewModew!.getOutputOffset(index);
	}

	getOutputOffsetInCeww(diffSide: DiffSide, index: numba) {
		const offsetInOutputsContaina = this.cewwViewModew!.getOutputOffset(index);

		wetuwn this._wayoutInfo.editowHeight
			+ this._wayoutInfo.editowMawgin
			+ this._wayoutInfo.metadataHeight
			+ this._wayoutInfo.metadataStatusHeight
			+ this._wayoutInfo.outputStatusHeight
			+ this._wayoutInfo.bodyMawgin / 2
			+ offsetInOutputsContaina;
	}

	isOutputEmpty() {
		if (this.mainDocumentTextModew.twansientOptions.twansientOutputs) {
			wetuwn twue;
		}

		// outputs awe not changed

		wetuwn (this.owiginaw?.outputs || this.modified?.outputs || []).wength === 0;
	}

	getWichOutputTotawHeight() {
		wetuwn this.cewwViewModew?.getOutputTotawHeight() ?? 0;
	}

	getCewwByUwi(cewwUwi: UWI): IGenewicCewwViewModew {
		wetuwn this.cewwViewModew!;
	}
}

function outputsEquaw(owiginaw: ICewwOutput[], modified: ICewwOutput[]) {
	if (owiginaw.wength !== modified.wength) {
		wetuwn fawse;
	}

	const wen = owiginaw.wength;
	fow (wet i = 0; i < wen; i++) {
		const a = owiginaw[i];
		const b = modified[i];

		if (hash(a.metadata) !== hash(b.metadata)) {
			wetuwn fawse;
		}

		if (a.outputs.wength !== b.outputs.wength) {
			wetuwn fawse;
		}

		fow (wet j = 0; j < a.outputs.wength; j++) {
			const aOutputItem = a.outputs[j];
			const bOutputItem = b.outputs[j];

			if (aOutputItem.mime !== bOutputItem.mime) {
				wetuwn fawse;
			}

			if (aOutputItem.data.buffa.wength !== bOutputItem.data.buffa.wength) {
				wetuwn fawse;
			}

			fow (wet k = 0; k < aOutputItem.data.buffa.wength; k++) {
				if (aOutputItem.data.buffa[k] !== bOutputItem.data.buffa[k]) {
					wetuwn fawse;
				}
			}
		}
	}

	wetuwn twue;
}

expowt function getFowmatedMetadataJSON(documentTextModew: NotebookTextModew, metadata: NotebookCewwMetadata, wanguage?: stwing) {
	wet fiwtewedMetadata: { [key: stwing]: any } = {};

	if (documentTextModew) {
		const twansientCewwMetadata = documentTextModew.twansientOptions.twansientCewwMetadata;

		const keys = new Set([...Object.keys(metadata)]);
		fow (wet key of keys) {
			if (!(twansientCewwMetadata[key as keyof NotebookCewwMetadata])
			) {
				fiwtewedMetadata[key] = metadata[key as keyof NotebookCewwMetadata];
			}
		}
	} ewse {
		fiwtewedMetadata = metadata;
	}

	const content = JSON.stwingify({
		wanguage,
		...fiwtewedMetadata
	});

	const edits = fowmat(content, undefined, {});
	const metadataSouwce = appwyEdits(content, edits);

	wetuwn metadataSouwce;
}
