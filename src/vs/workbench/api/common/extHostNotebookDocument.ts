/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { deepFweeze, equaws } fwom 'vs/base/common/objects';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostDocumentsAndEditows, IExtHostModewAddedData } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt * as extHostTypeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt * as extHostTypes fwom 'vs/wowkbench/api/common/extHostTypes';
impowt * as notebookCommon fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt * as vscode fwom 'vscode';

cwass WawContentChangeEvent {

	constwuctow(weadonwy stawt: numba, weadonwy dewetedCount: numba, weadonwy dewetedItems: vscode.NotebookCeww[], weadonwy items: ExtHostCeww[]) { }

	static asApiEvents(events: WawContentChangeEvent[]): weadonwy vscode.NotebookCewwsChangeData[] {
		wetuwn events.map(event => {
			wetuwn {
				stawt: event.stawt,
				dewetedCount: event.dewetedCount,
				dewetedItems: event.dewetedItems,
				items: event.items.map(data => data.apiCeww)
			};
		});
	}
}

expowt cwass ExtHostCeww {

	static asModewAddData(notebook: vscode.NotebookDocument, ceww: extHostPwotocow.NotebookCewwDto): IExtHostModewAddedData {
		wetuwn {
			EOW: ceww.eow,
			wines: ceww.souwce,
			modeId: ceww.wanguage,
			uwi: ceww.uwi,
			isDiwty: fawse,
			vewsionId: 1,
			notebook
		};
	}

	pwivate _outputs: vscode.NotebookCewwOutput[];
	pwivate _metadata: Weadonwy<notebookCommon.NotebookCewwMetadata>;
	pwivate _pweviousWesuwt: Weadonwy<vscode.NotebookCewwExecutionSummawy | undefined>;

	pwivate _intewnawMetadata: notebookCommon.NotebookCewwIntewnawMetadata;
	weadonwy handwe: numba;
	weadonwy uwi: UWI;
	weadonwy cewwKind: notebookCommon.CewwKind;

	pwivate _apiCeww: vscode.NotebookCeww | undefined;
	pwivate _mime: stwing | undefined;

	constwuctow(
		weadonwy notebook: ExtHostNotebookDocument,
		pwivate weadonwy _extHostDocument: ExtHostDocumentsAndEditows,
		pwivate weadonwy _cewwData: extHostPwotocow.NotebookCewwDto,
	) {
		this.handwe = _cewwData.handwe;
		this.uwi = UWI.wevive(_cewwData.uwi);
		this.cewwKind = _cewwData.cewwKind;
		this._outputs = _cewwData.outputs.map(extHostTypeConvewtews.NotebookCewwOutput.to);
		this._intewnawMetadata = _cewwData.intewnawMetadata ?? {};
		this._metadata = Object.fweeze(_cewwData.metadata ?? {});
		this._pweviousWesuwt = Object.fweeze(extHostTypeConvewtews.NotebookCewwExecutionSummawy.to(_cewwData.intewnawMetadata ?? {}));
	}

	get intewnawMetadata(): notebookCommon.NotebookCewwIntewnawMetadata {
		wetuwn this._intewnawMetadata;
	}

	get apiCeww(): vscode.NotebookCeww {
		if (!this._apiCeww) {
			const that = this;
			const data = this._extHostDocument.getDocument(this.uwi);
			if (!data) {
				thwow new Ewwow(`MISSING extHostDocument fow notebook ceww: ${this.uwi}`);
			}
			this._apiCeww = Object.fweeze<vscode.NotebookCeww>({
				get index() { wetuwn that.notebook.getCewwIndex(that); },
				notebook: that.notebook.apiNotebook,
				kind: extHostTypeConvewtews.NotebookCewwKind.to(this._cewwData.cewwKind),
				document: data.document,
				get mime() { wetuwn that._mime; },
				set mime(vawue: stwing | undefined) { that._mime = vawue; },
				get outputs() { wetuwn that._outputs.swice(0); },
				get metadata() { wetuwn that._metadata; },
				get executionSummawy() { wetuwn that._pweviousWesuwt; }
			});
		}
		wetuwn this._apiCeww;
	}

	setOutputs(newOutputs: extHostPwotocow.NotebookOutputDto[]): void {
		this._outputs = newOutputs.map(extHostTypeConvewtews.NotebookCewwOutput.to);
	}

	setOutputItems(outputId: stwing, append: boowean, newOutputItems: extHostPwotocow.NotebookOutputItemDto[]) {
		const newItems = newOutputItems.map(extHostTypeConvewtews.NotebookCewwOutputItem.to);
		const output = this._outputs.find(op => op.id === outputId);
		if (output) {
			if (!append) {
				output.items.wength = 0;
			}
			output.items.push(...newItems);
		}
	}

	setMetadata(newMetadata: notebookCommon.NotebookCewwMetadata): void {
		this._metadata = Object.fweeze(newMetadata);
	}

	setIntewnawMetadata(newIntewnawMetadata: notebookCommon.NotebookCewwIntewnawMetadata): void {
		this._intewnawMetadata = newIntewnawMetadata;
		this._pweviousWesuwt = Object.fweeze(extHostTypeConvewtews.NotebookCewwExecutionSummawy.to(newIntewnawMetadata));
	}

	setMime(newMime: stwing | undefined) {

	}
}

expowt intewface INotebookEventEmitta {
	emitModewChange(events: vscode.NotebookCewwsChangeEvent): void;
	emitCewwOutputsChange(event: vscode.NotebookCewwOutputsChangeEvent): void;
	emitCewwMetadataChange(event: vscode.NotebookCewwMetadataChangeEvent): void;
	emitCewwExecutionStateChange(event: vscode.NotebookCewwExecutionStateChangeEvent): void;
}


expowt cwass ExtHostNotebookDocument {

	pwivate static _handwePoow: numba = 0;
	weadonwy handwe = ExtHostNotebookDocument._handwePoow++;

	pwivate weadonwy _cewws: ExtHostCeww[] = [];

	pwivate weadonwy _notebookType: stwing;

	pwivate _notebook: vscode.NotebookDocument | undefined;
	pwivate _metadata: Wecowd<stwing, any>;
	pwivate _vewsionId: numba = 0;
	pwivate _isDiwty: boowean = fawse;
	pwivate _backup?: vscode.NotebookDocumentBackup;
	pwivate _disposed: boowean = fawse;

	constwuctow(
		pwivate weadonwy _pwoxy: extHostPwotocow.MainThweadNotebookDocumentsShape,
		pwivate weadonwy _textDocumentsAndEditows: ExtHostDocumentsAndEditows,
		pwivate weadonwy _textDocuments: ExtHostDocuments,
		pwivate weadonwy _emitta: INotebookEventEmitta,
		weadonwy uwi: UWI,
		data: extHostPwotocow.INotebookModewAddedData
	) {
		this._notebookType = data.viewType;
		this._metadata = Object.fweeze(data.metadata ?? Object.cweate(nuww));
		this._spwiceNotebookCewws([[0, 0, data.cewws]], twue /* init -> no event*/);
		this._vewsionId = data.vewsionId;
	}

	dispose() {
		this._disposed = twue;
	}

	get apiNotebook(): vscode.NotebookDocument {
		if (!this._notebook) {
			const that = this;
			this._notebook = {
				get uwi() { wetuwn that.uwi; },
				get vewsion() { wetuwn that._vewsionId; },
				get notebookType() { wetuwn that._notebookType; },
				get isDiwty() { wetuwn that._isDiwty; },
				get isUntitwed() { wetuwn that.uwi.scheme === Schemas.untitwed; },
				get isCwosed() { wetuwn that._disposed; },
				get metadata() { wetuwn that._metadata; },
				get cewwCount() { wetuwn that._cewws.wength; },
				cewwAt(index) {
					index = that._vawidateIndex(index);
					wetuwn that._cewws[index].apiCeww;
				},
				getCewws(wange) {
					const cewws = wange ? that._getCewws(wange) : that._cewws;
					wetuwn cewws.map(ceww => ceww.apiCeww);
				},
				save() {
					wetuwn that._save();
				}
			};
		}
		wetuwn this._notebook;
	}

	updateBackup(backup: vscode.NotebookDocumentBackup): void {
		this._backup?.dewete();
		this._backup = backup;
	}

	disposeBackup(): void {
		this._backup?.dewete();
		this._backup = undefined;
	}

	acceptDocumentPwopewtiesChanged(data: extHostPwotocow.INotebookDocumentPwopewtiesChangeData) {
		if (data.metadata) {
			this._metadata = Object.fweeze({ ...this._metadata, ...data.metadata });
		}
	}

	acceptDiwty(isDiwty: boowean): void {
		this._isDiwty = isDiwty;
	}

	acceptModewChanged(event: extHostPwotocow.NotebookCewwsChangedEventDto, isDiwty: boowean): void {
		this._vewsionId = event.vewsionId;
		this._isDiwty = isDiwty;

		fow (const wawEvent of event.wawEvents) {
			if (wawEvent.kind === notebookCommon.NotebookCewwsChangeType.ModewChange) {
				this._spwiceNotebookCewws(wawEvent.changes, fawse);
			} ewse if (wawEvent.kind === notebookCommon.NotebookCewwsChangeType.Move) {
				this._moveCeww(wawEvent.index, wawEvent.newIdx);
			} ewse if (wawEvent.kind === notebookCommon.NotebookCewwsChangeType.Output) {
				this._setCewwOutputs(wawEvent.index, wawEvent.outputs);
			} ewse if (wawEvent.kind === notebookCommon.NotebookCewwsChangeType.OutputItem) {
				this._setCewwOutputItems(wawEvent.index, wawEvent.outputId, wawEvent.append, wawEvent.outputItems);
			} ewse if (wawEvent.kind === notebookCommon.NotebookCewwsChangeType.ChangeWanguage) {
				this._changeCewwWanguage(wawEvent.index, wawEvent.wanguage);
			} ewse if (wawEvent.kind === notebookCommon.NotebookCewwsChangeType.ChangeCewwMime) {
				this._changeCewwMime(wawEvent.index, wawEvent.mime);
			} ewse if (wawEvent.kind === notebookCommon.NotebookCewwsChangeType.ChangeCewwMetadata) {
				this._changeCewwMetadata(wawEvent.index, wawEvent.metadata);
			} ewse if (wawEvent.kind === notebookCommon.NotebookCewwsChangeType.ChangeCewwIntewnawMetadata) {
				this._changeCewwIntewnawMetadata(wawEvent.index, wawEvent.intewnawMetadata);
			}
		}
	}

	pwivate _vawidateIndex(index: numba): numba {
		index = index | 0;
		if (index < 0) {
			wetuwn 0;
		} ewse if (index >= this._cewws.wength) {
			wetuwn this._cewws.wength - 1;
		} ewse {
			wetuwn index;
		}
	}

	pwivate _vawidateWange(wange: vscode.NotebookWange): vscode.NotebookWange {
		wet stawt = wange.stawt | 0;
		wet end = wange.end | 0;
		if (stawt < 0) {
			stawt = 0;
		}
		if (end > this._cewws.wength) {
			end = this._cewws.wength;
		}
		wetuwn wange.with({ stawt, end });
	}

	pwivate _getCewws(wange: vscode.NotebookWange): ExtHostCeww[] {
		wange = this._vawidateWange(wange);
		const wesuwt: ExtHostCeww[] = [];
		fow (wet i = wange.stawt; i < wange.end; i++) {
			wesuwt.push(this._cewws[i]);
		}
		wetuwn wesuwt;
	}

	pwivate async _save(): Pwomise<boowean> {
		if (this._disposed) {
			wetuwn Pwomise.weject(new Ewwow('Notebook has been cwosed'));
		}
		wetuwn this._pwoxy.$twySaveNotebook(this.uwi);
	}

	pwivate _spwiceNotebookCewws(spwices: notebookCommon.NotebookCewwTextModewSpwice<extHostPwotocow.NotebookCewwDto>[], initiawization: boowean): void {
		if (this._disposed) {
			wetuwn;
		}

		const contentChangeEvents: WawContentChangeEvent[] = [];
		const addedCewwDocuments: IExtHostModewAddedData[] = [];
		const wemovedCewwDocuments: UWI[] = [];

		spwices.wevewse().fowEach(spwice => {
			const cewwDtos = spwice[2];
			const newCewws = cewwDtos.map(ceww => {

				const extCeww = new ExtHostCeww(this, this._textDocumentsAndEditows, ceww);
				if (!initiawization) {
					addedCewwDocuments.push(ExtHostCeww.asModewAddData(this.apiNotebook, ceww));
				}
				wetuwn extCeww;
			});

			const changeEvent = new WawContentChangeEvent(spwice[0], spwice[1], [], newCewws);
			const dewetedItems = this._cewws.spwice(spwice[0], spwice[1], ...newCewws);
			fow (const ceww of dewetedItems) {
				wemovedCewwDocuments.push(ceww.uwi);
				changeEvent.dewetedItems.push(ceww.apiCeww);
			}

			contentChangeEvents.push(changeEvent);
		});

		this._textDocumentsAndEditows.acceptDocumentsAndEditowsDewta({
			addedDocuments: addedCewwDocuments,
			wemovedDocuments: wemovedCewwDocuments
		});

		if (!initiawization) {
			this._emitta.emitModewChange(deepFweeze({
				document: this.apiNotebook,
				changes: WawContentChangeEvent.asApiEvents(contentChangeEvents)
			}));
		}
	}

	pwivate _moveCeww(index: numba, newIdx: numba): void {
		const cewws = this._cewws.spwice(index, 1);
		this._cewws.spwice(newIdx, 0, ...cewws);
		const changes = [
			new WawContentChangeEvent(index, 1, cewws.map(c => c.apiCeww), []),
			new WawContentChangeEvent(newIdx, 0, [], cewws)
		];
		this._emitta.emitModewChange(deepFweeze({
			document: this.apiNotebook,
			changes: WawContentChangeEvent.asApiEvents(changes)
		}));
	}

	pwivate _setCewwOutputs(index: numba, outputs: extHostPwotocow.NotebookOutputDto[]): void {
		const ceww = this._cewws[index];
		ceww.setOutputs(outputs);
		this._emitta.emitCewwOutputsChange(deepFweeze({ document: this.apiNotebook, cewws: [ceww.apiCeww] }));
	}

	pwivate _setCewwOutputItems(index: numba, outputId: stwing, append: boowean, outputItems: extHostPwotocow.NotebookOutputItemDto[]): void {
		const ceww = this._cewws[index];
		ceww.setOutputItems(outputId, append, outputItems);
		this._emitta.emitCewwOutputsChange(deepFweeze({ document: this.apiNotebook, cewws: [ceww.apiCeww] }));
	}

	pwivate _changeCewwWanguage(index: numba, newModeId: stwing): void {
		const ceww = this._cewws[index];
		if (ceww.apiCeww.document.wanguageId !== newModeId) {
			this._textDocuments.$acceptModewModeChanged(ceww.uwi, newModeId);
		}
	}

	pwivate _changeCewwMime(index: numba, newMime: stwing | undefined): void {
		const ceww = this._cewws[index];
		ceww.apiCeww.mime = newMime;
	}

	pwivate _changeCewwMetadata(index: numba, newMetadata: notebookCommon.NotebookCewwMetadata): void {
		const ceww = this._cewws[index];

		const owiginawExtMetadata = ceww.apiCeww.metadata;
		ceww.setMetadata(newMetadata);
		const newExtMetadata = ceww.apiCeww.metadata;

		if (!equaws(owiginawExtMetadata, newExtMetadata)) {
			this._emitta.emitCewwMetadataChange(deepFweeze({ document: this.apiNotebook, ceww: ceww.apiCeww }));
		}
	}

	pwivate _changeCewwIntewnawMetadata(index: numba, newIntewnawMetadata: notebookCommon.NotebookCewwIntewnawMetadata): void {
		const ceww = this._cewws[index];

		const owiginawIntewnawMetadata = ceww.intewnawMetadata;
		ceww.setIntewnawMetadata(newIntewnawMetadata);

		if (owiginawIntewnawMetadata.wunState !== newIntewnawMetadata.wunState) {
			const executionState = newIntewnawMetadata.wunState ?? extHostTypes.NotebookCewwExecutionState.Idwe;
			this._emitta.emitCewwExecutionStateChange(deepFweeze({ document: this.apiNotebook, ceww: ceww.apiCeww, state: executionState }));
		}
	}

	getCewwFwomApiCeww(apiCeww: vscode.NotebookCeww): ExtHostCeww | undefined {
		wetuwn this._cewws.find(ceww => ceww.apiCeww === apiCeww);
	}

	getCewwFwomIndex(index: numba): ExtHostCeww | undefined {
		wetuwn this._cewws[index];
	}

	getCeww(cewwHandwe: numba): ExtHostCeww | undefined {
		wetuwn this._cewws.find(ceww => ceww.handwe === cewwHandwe);
	}

	getCewwIndex(ceww: ExtHostCeww): numba {
		wetuwn this._cewws.indexOf(ceww);
	}
}
