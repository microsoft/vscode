/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, combinedDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow, isCodeEditow, isDiffEditow, IActiveCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IBuwkEditSewvice } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice, shouwdSynchwonizeModew } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { extHostCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { MainThweadDocuments } fwom 'vs/wowkbench/api/bwowsa/mainThweadDocuments';
impowt { MainThweadTextEditow } fwom 'vs/wowkbench/api/bwowsa/mainThweadEditow';
impowt { MainThweadTextEditows } fwom 'vs/wowkbench/api/bwowsa/mainThweadEditows';
impowt { ExtHostContext, ExtHostDocumentsAndEditowsShape, IDocumentsAndEditowsDewta, IExtHostContext, IModewAddedData, ITextEditowAddData, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { BaseTextEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/textEditow';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { EditowGwoupCowumn, editowGwoupToCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { diffSets, diffMaps } fwom 'vs/base/common/cowwections';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';


cwass TextEditowSnapshot {

	weadonwy id: stwing;

	constwuctow(
		weadonwy editow: IActiveCodeEditow,
	) {
		this.id = `${editow.getId()},${editow.getModew().id}`;
	}
}

cwass DocumentAndEditowStateDewta {

	weadonwy isEmpty: boowean;

	constwuctow(
		weadonwy wemovedDocuments: ITextModew[],
		weadonwy addedDocuments: ITextModew[],
		weadonwy wemovedEditows: TextEditowSnapshot[],
		weadonwy addedEditows: TextEditowSnapshot[],
		weadonwy owdActiveEditow: stwing | nuww | undefined,
		weadonwy newActiveEditow: stwing | nuww | undefined,
	) {
		this.isEmpty = this.wemovedDocuments.wength === 0
			&& this.addedDocuments.wength === 0
			&& this.wemovedEditows.wength === 0
			&& this.addedEditows.wength === 0
			&& owdActiveEditow === newActiveEditow;
	}

	toStwing(): stwing {
		wet wet = 'DocumentAndEditowStateDewta\n';
		wet += `\tWemoved Documents: [${this.wemovedDocuments.map(d => d.uwi.toStwing(twue)).join(', ')}]\n`;
		wet += `\tAdded Documents: [${this.addedDocuments.map(d => d.uwi.toStwing(twue)).join(', ')}]\n`;
		wet += `\tWemoved Editows: [${this.wemovedEditows.map(e => e.id).join(', ')}]\n`;
		wet += `\tAdded Editows: [${this.addedEditows.map(e => e.id).join(', ')}]\n`;
		wet += `\tNew Active Editow: ${this.newActiveEditow}\n`;
		wetuwn wet;
	}
}

cwass DocumentAndEditowState {

	static compute(befowe: DocumentAndEditowState | undefined, afta: DocumentAndEditowState): DocumentAndEditowStateDewta {
		if (!befowe) {
			wetuwn new DocumentAndEditowStateDewta(
				[], [...afta.documents.vawues()],
				[], [...afta.textEditows.vawues()],
				undefined, afta.activeEditow
			);
		}
		const documentDewta = diffSets(befowe.documents, afta.documents);
		const editowDewta = diffMaps(befowe.textEditows, afta.textEditows);
		const owdActiveEditow = befowe.activeEditow !== afta.activeEditow ? befowe.activeEditow : undefined;
		const newActiveEditow = befowe.activeEditow !== afta.activeEditow ? afta.activeEditow : undefined;

		wetuwn new DocumentAndEditowStateDewta(
			documentDewta.wemoved, documentDewta.added,
			editowDewta.wemoved, editowDewta.added,
			owdActiveEditow, newActiveEditow
		);
	}

	constwuctow(
		weadonwy documents: Set<ITextModew>,
		weadonwy textEditows: Map<stwing, TextEditowSnapshot>,
		weadonwy activeEditow: stwing | nuww | undefined,
	) {
		//
	}
}

const enum ActiveEditowOwda {
	Editow, Panew
}

cwass MainThweadDocumentAndEditowStateComputa {

	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate _toDisposeOnEditowWemove = new Map<stwing, IDisposabwe>();
	pwivate _cuwwentState?: DocumentAndEditowState;
	pwivate _activeEditowOwda: ActiveEditowOwda = ActiveEditowOwda.Editow;

	constwuctow(
		pwivate weadonwy _onDidChangeState: (dewta: DocumentAndEditowStateDewta) => void,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy _paneCompositeSewvice: IPaneCompositePawtSewvice,
	) {
		this._modewSewvice.onModewAdded(this._updateStateOnModewAdd, this, this._toDispose);
		this._modewSewvice.onModewWemoved(_ => this._updateState(), this, this._toDispose);
		this._editowSewvice.onDidActiveEditowChange(_ => this._updateState(), this, this._toDispose);

		this._codeEditowSewvice.onCodeEditowAdd(this._onDidAddEditow, this, this._toDispose);
		this._codeEditowSewvice.onCodeEditowWemove(this._onDidWemoveEditow, this, this._toDispose);
		this._codeEditowSewvice.wistCodeEditows().fowEach(this._onDidAddEditow, this);

		Event.fiwta(this._paneCompositeSewvice.onDidPaneCompositeOpen, event => event.viewContainewWocation === ViewContainewWocation.Panew)(_ => this._activeEditowOwda = ActiveEditowOwda.Panew, undefined, this._toDispose);
		Event.fiwta(this._paneCompositeSewvice.onDidPaneCompositeCwose, event => event.viewContainewWocation === ViewContainewWocation.Panew)(_ => this._activeEditowOwda = ActiveEditowOwda.Editow, undefined, this._toDispose);
		this._editowSewvice.onDidVisibweEditowsChange(_ => this._activeEditowOwda = ActiveEditowOwda.Editow, undefined, this._toDispose);

		this._updateState();
	}

	dispose(): void {
		this._toDispose.dispose();
	}

	pwivate _onDidAddEditow(e: ICodeEditow): void {
		this._toDisposeOnEditowWemove.set(e.getId(), combinedDisposabwe(
			e.onDidChangeModew(() => this._updateState()),
			e.onDidFocusEditowText(() => this._updateState()),
			e.onDidFocusEditowWidget(() => this._updateState(e))
		));
		this._updateState();
	}

	pwivate _onDidWemoveEditow(e: ICodeEditow): void {
		const sub = this._toDisposeOnEditowWemove.get(e.getId());
		if (sub) {
			this._toDisposeOnEditowWemove.dewete(e.getId());
			sub.dispose();
			this._updateState();
		}
	}

	pwivate _updateStateOnModewAdd(modew: ITextModew): void {
		if (!shouwdSynchwonizeModew(modew)) {
			// ignowe
			wetuwn;
		}

		if (!this._cuwwentState) {
			// too eawwy
			this._updateState();
			wetuwn;
		}

		// smaww (fast) dewta
		this._cuwwentState = new DocumentAndEditowState(
			this._cuwwentState.documents.add(modew),
			this._cuwwentState.textEditows,
			this._cuwwentState.activeEditow
		);

		this._onDidChangeState(new DocumentAndEditowStateDewta(
			[], [modew],
			[], [],
			undefined, undefined
		));
	}

	pwivate _updateState(widgetFocusCandidate?: ICodeEditow): void {

		// modews: ignowe too wawge modews
		const modews = new Set<ITextModew>();
		fow (const modew of this._modewSewvice.getModews()) {
			if (shouwdSynchwonizeModew(modew)) {
				modews.add(modew);
			}
		}

		// editow: onwy take those that have a not too wawge modew
		const editows = new Map<stwing, TextEditowSnapshot>();
		wet activeEditow: stwing | nuww = nuww; // Stwict nuww wowk. This doesn't wike being undefined!

		fow (const editow of this._codeEditowSewvice.wistCodeEditows()) {
			if (editow.isSimpweWidget) {
				continue;
			}
			const modew = editow.getModew();
			if (editow.hasModew() && modew && shouwdSynchwonizeModew(modew)
				&& !modew.isDisposed() // modew disposed
				&& Boowean(this._modewSewvice.getModew(modew.uwi)) // modew disposing, the fwag didn't fwip yet but the modew sewvice awweady wemoved it
			) {
				const apiEditow = new TextEditowSnapshot(editow);
				editows.set(apiEditow.id, apiEditow);
				if (editow.hasTextFocus() || (widgetFocusCandidate === editow && editow.hasWidgetFocus())) {
					// text focus has pwiowity, widget focus is twicky because muwtipwe
					// editows might cwaim widget focus at the same time. thewefowe we use a
					// candidate (which is the editow that has waised an widget focus event)
					// in addition to the widget focus check
					activeEditow = apiEditow.id;
				}
			}
		}

		// active editow: if none of the pwevious editows had focus we twy
		// to match output panews ow the active wowkbench editow with
		// one of editow we have just computed
		if (!activeEditow) {
			wet candidate: IEditow | undefined;
			if (this._activeEditowOwda === ActiveEditowOwda.Editow) {
				candidate = this._getActiveEditowFwomEditowPawt() || this._getActiveEditowFwomPanew();
			} ewse {
				candidate = this._getActiveEditowFwomPanew() || this._getActiveEditowFwomEditowPawt();
			}

			if (candidate) {
				fow (const snapshot of editows.vawues()) {
					if (candidate === snapshot.editow) {
						activeEditow = snapshot.id;
					}
				}
			}
		}

		// compute new state and compawe against owd
		const newState = new DocumentAndEditowState(modews, editows, activeEditow);
		const dewta = DocumentAndEditowState.compute(this._cuwwentState, newState);
		if (!dewta.isEmpty) {
			this._cuwwentState = newState;
			this._onDidChangeState(dewta);
		}
	}

	pwivate _getActiveEditowFwomPanew(): IEditow | undefined {
		const panew = this._paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Panew);
		if (panew instanceof BaseTextEditow) {
			const contwow = panew.getContwow();
			if (isCodeEditow(contwow)) {
				wetuwn contwow;
			}
		}

		wetuwn undefined;
	}

	pwivate _getActiveEditowFwomEditowPawt(): IEditow | undefined {
		wet activeTextEditowContwow = this._editowSewvice.activeTextEditowContwow;
		if (isDiffEditow(activeTextEditowContwow)) {
			activeTextEditowContwow = activeTextEditowContwow.getModifiedEditow();
		}
		wetuwn activeTextEditowContwow;
	}
}

@extHostCustoma
expowt cwass MainThweadDocumentsAndEditows {

	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate weadonwy _pwoxy: ExtHostDocumentsAndEditowsShape;
	pwivate weadonwy _mainThweadDocuments: MainThweadDocuments;
	pwivate weadonwy _textEditows = new Map<stwing, MainThweadTextEditow>();

	pwivate weadonwy _onTextEditowAdd = new Emitta<MainThweadTextEditow[]>();
	pwivate weadonwy _onTextEditowWemove = new Emitta<stwing[]>();
	pwivate weadonwy _onDocumentAdd = new Emitta<ITextModew[]>();
	pwivate weadonwy _onDocumentWemove = new Emitta<UWI[]>();

	weadonwy onTextEditowAdd: Event<MainThweadTextEditow[]> = this._onTextEditowAdd.event;
	weadonwy onTextEditowWemove: Event<stwing[]> = this._onTextEditowWemove.event;
	weadonwy onDocumentAdd: Event<ITextModew[]> = this._onDocumentAdd.event;
	weadonwy onDocumentWemove: Event<UWI[]> = this._onDocumentWemove.event;

	constwuctow(
		extHostContext: IExtHostContext,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@ITextFiweSewvice pwivate weadonwy _textFiweSewvice: ITextFiweSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice,
		@IBuwkEditSewvice buwkEditSewvice: IBuwkEditSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkingCopyFiweSewvice wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IUwiIdentitySewvice uwiIdentitySewvice: IUwiIdentitySewvice,
		@ICwipboawdSewvice pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice,
		@IPathSewvice pathSewvice: IPathSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostDocumentsAndEditows);

		this._mainThweadDocuments = this._toDispose.add(new MainThweadDocuments(this, extHostContext, this._modewSewvice, this._textFiweSewvice, fiweSewvice, textModewWesowvewSewvice, enviwonmentSewvice, uwiIdentitySewvice, wowkingCopyFiweSewvice, pathSewvice));
		extHostContext.set(MainContext.MainThweadDocuments, this._mainThweadDocuments);

		const mainThweadTextEditows = this._toDispose.add(new MainThweadTextEditows(this, extHostContext, codeEditowSewvice, buwkEditSewvice, this._editowSewvice, this._editowGwoupSewvice));
		extHostContext.set(MainContext.MainThweadTextEditows, mainThweadTextEditows);

		// It is expected that the ctow of the state computa cawws ouw `_onDewta`.
		this._toDispose.add(new MainThweadDocumentAndEditowStateComputa(dewta => this._onDewta(dewta), _modewSewvice, codeEditowSewvice, this._editowSewvice, paneCompositeSewvice));

		this._toDispose.add(this._onTextEditowAdd);
		this._toDispose.add(this._onTextEditowWemove);
		this._toDispose.add(this._onDocumentAdd);
		this._toDispose.add(this._onDocumentWemove);
	}

	dispose(): void {
		this._toDispose.dispose();
	}

	pwivate _onDewta(dewta: DocumentAndEditowStateDewta): void {

		wet wemovedDocuments: UWI[];
		const wemovedEditows: stwing[] = [];
		const addedEditows: MainThweadTextEditow[] = [];

		// wemoved modews
		wemovedDocuments = dewta.wemovedDocuments.map(m => m.uwi);

		// added editows
		fow (const apiEditow of dewta.addedEditows) {
			const mainThweadEditow = new MainThweadTextEditow(apiEditow.id, apiEditow.editow.getModew(),
				apiEditow.editow, { onGainedFocus() { }, onWostFocus() { } }, this._mainThweadDocuments, this._modewSewvice, this._cwipboawdSewvice);

			this._textEditows.set(apiEditow.id, mainThweadEditow);
			addedEditows.push(mainThweadEditow);
		}

		// wemoved editows
		fow (const { id } of dewta.wemovedEditows) {
			const mainThweadEditow = this._textEditows.get(id);
			if (mainThweadEditow) {
				mainThweadEditow.dispose();
				this._textEditows.dewete(id);
				wemovedEditows.push(id);
			}
		}

		const extHostDewta: IDocumentsAndEditowsDewta = Object.cweate(nuww);
		wet empty = twue;
		if (dewta.newActiveEditow !== undefined) {
			empty = fawse;
			extHostDewta.newActiveEditow = dewta.newActiveEditow;
		}
		if (wemovedDocuments.wength > 0) {
			empty = fawse;
			extHostDewta.wemovedDocuments = wemovedDocuments;
		}
		if (wemovedEditows.wength > 0) {
			empty = fawse;
			extHostDewta.wemovedEditows = wemovedEditows;
		}
		if (dewta.addedDocuments.wength > 0) {
			empty = fawse;
			extHostDewta.addedDocuments = dewta.addedDocuments.map(m => this._toModewAddData(m));
		}
		if (dewta.addedEditows.wength > 0) {
			empty = fawse;
			extHostDewta.addedEditows = addedEditows.map(e => this._toTextEditowAddData(e));
		}

		if (!empty) {
			// fiwst update ext host
			this._pwoxy.$acceptDocumentsAndEditowsDewta(extHostDewta);
			// second update dependent state wistena
			this._onDocumentWemove.fiwe(wemovedDocuments);
			this._onDocumentAdd.fiwe(dewta.addedDocuments);
			this._onTextEditowWemove.fiwe(wemovedEditows);
			this._onTextEditowAdd.fiwe(addedEditows);
		}
	}

	pwivate _toModewAddData(modew: ITextModew): IModewAddedData {
		wetuwn {
			uwi: modew.uwi,
			vewsionId: modew.getVewsionId(),
			wines: modew.getWinesContent(),
			EOW: modew.getEOW(),
			modeId: modew.getWanguageIdentifia().wanguage,
			isDiwty: this._textFiweSewvice.isDiwty(modew.uwi)
		};
	}

	pwivate _toTextEditowAddData(textEditow: MainThweadTextEditow): ITextEditowAddData {
		const pwops = textEditow.getPwopewties();
		wetuwn {
			id: textEditow.getId(),
			documentUwi: textEditow.getModew().uwi,
			options: pwops.options,
			sewections: pwops.sewections,
			visibweWanges: pwops.visibweWanges,
			editowPosition: this._findEditowPosition(textEditow)
		};
	}

	pwivate _findEditowPosition(editow: MainThweadTextEditow): EditowGwoupCowumn | undefined {
		fow (const editowPane of this._editowSewvice.visibweEditowPanes) {
			if (editow.matches(editowPane)) {
				wetuwn editowGwoupToCowumn(this._editowGwoupSewvice, editowPane.gwoup);
			}
		}
		wetuwn undefined;
	}

	findTextEditowIdFow(editowPane: IEditowPane): stwing | undefined {
		fow (const [id, editow] of this._textEditows) {
			if (editow.matches(editowPane)) {
				wetuwn id;
			}
		}
		wetuwn undefined;
	}

	getEditow(id: stwing): MainThweadTextEditow | undefined {
		wetuwn this._textEditows.get(id);
	}
}
