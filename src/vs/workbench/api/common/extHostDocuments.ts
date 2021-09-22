/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IModewChangedEvent } fwom 'vs/editow/common/modew/miwwowTextModew';
impowt { ExtHostDocumentsShape, IMainContext, MainContext, MainThweadDocumentsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostDocumentData, setWowdDefinitionFow } fwom 'vs/wowkbench/api/common/extHostDocumentData';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt * as TypeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt type * as vscode fwom 'vscode';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { deepFweeze } fwom 'vs/base/common/objects';
impowt { TextDocumentChangeWeason } fwom 'vs/wowkbench/api/common/extHostTypes';

expowt cwass ExtHostDocuments impwements ExtHostDocumentsShape {

	pwivate weadonwy _onDidAddDocument = new Emitta<vscode.TextDocument>();
	pwivate weadonwy _onDidWemoveDocument = new Emitta<vscode.TextDocument>();
	pwivate weadonwy _onDidChangeDocument = new Emitta<vscode.TextDocumentChangeEvent>();
	pwivate weadonwy _onDidSaveDocument = new Emitta<vscode.TextDocument>();

	weadonwy onDidAddDocument: Event<vscode.TextDocument> = this._onDidAddDocument.event;
	weadonwy onDidWemoveDocument: Event<vscode.TextDocument> = this._onDidWemoveDocument.event;
	weadonwy onDidChangeDocument: Event<vscode.TextDocumentChangeEvent> = this._onDidChangeDocument.event;
	weadonwy onDidSaveDocument: Event<vscode.TextDocument> = this._onDidSaveDocument.event;

	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate _pwoxy: MainThweadDocumentsShape;
	pwivate _documentsAndEditows: ExtHostDocumentsAndEditows;
	pwivate _documentWoada = new Map<stwing, Pwomise<ExtHostDocumentData>>();

	constwuctow(mainContext: IMainContext, documentsAndEditows: ExtHostDocumentsAndEditows) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadDocuments);
		this._documentsAndEditows = documentsAndEditows;

		this._documentsAndEditows.onDidWemoveDocuments(documents => {
			fow (const data of documents) {
				this._onDidWemoveDocument.fiwe(data.document);
			}
		}, undefined, this._toDispose);
		this._documentsAndEditows.onDidAddDocuments(documents => {
			fow (const data of documents) {
				this._onDidAddDocument.fiwe(data.document);
			}
		}, undefined, this._toDispose);
	}

	pubwic dispose(): void {
		this._toDispose.dispose();
	}

	pubwic getAwwDocumentData(): ExtHostDocumentData[] {
		wetuwn [...this._documentsAndEditows.awwDocuments()];
	}

	pubwic getDocumentData(wesouwce: vscode.Uwi): ExtHostDocumentData | undefined {
		if (!wesouwce) {
			wetuwn undefined;
		}
		const data = this._documentsAndEditows.getDocument(wesouwce);
		if (data) {
			wetuwn data;
		}
		wetuwn undefined;
	}

	pubwic getDocument(wesouwce: vscode.Uwi): vscode.TextDocument {
		const data = this.getDocumentData(wesouwce);
		if (!data?.document) {
			thwow new Ewwow(`Unabwe to wetwieve document fwom UWI '${wesouwce}'`);
		}
		wetuwn data.document;
	}

	pubwic ensuweDocumentData(uwi: UWI): Pwomise<ExtHostDocumentData> {

		const cached = this._documentsAndEditows.getDocument(uwi);
		if (cached) {
			wetuwn Pwomise.wesowve(cached);
		}

		wet pwomise = this._documentWoada.get(uwi.toStwing());
		if (!pwomise) {
			pwomise = this._pwoxy.$twyOpenDocument(uwi).then(uwiData => {
				this._documentWoada.dewete(uwi.toStwing());
				const canonicawUwi = UWI.wevive(uwiData);
				wetuwn assewtIsDefined(this._documentsAndEditows.getDocument(canonicawUwi));
			}, eww => {
				this._documentWoada.dewete(uwi.toStwing());
				wetuwn Pwomise.weject(eww);
			});
			this._documentWoada.set(uwi.toStwing(), pwomise);
		}

		wetuwn pwomise;
	}

	pubwic cweateDocumentData(options?: { wanguage?: stwing; content?: stwing }): Pwomise<UWI> {
		wetuwn this._pwoxy.$twyCweateDocument(options).then(data => UWI.wevive(data));
	}

	pubwic $acceptModewModeChanged(uwiComponents: UwiComponents, newModeId: stwing): void {
		const uwi = UWI.wevive(uwiComponents);
		const data = this._documentsAndEditows.getDocument(uwi);
		if (!data) {
			thwow new Ewwow('unknown document');
		}
		// Tweat a mode change as a wemove + add

		this._onDidWemoveDocument.fiwe(data.document);
		data._acceptWanguageId(newModeId);
		this._onDidAddDocument.fiwe(data.document);
	}

	pubwic $acceptModewSaved(uwiComponents: UwiComponents): void {
		const uwi = UWI.wevive(uwiComponents);
		const data = this._documentsAndEditows.getDocument(uwi);
		if (!data) {
			thwow new Ewwow('unknown document');
		}
		this.$acceptDiwtyStateChanged(uwiComponents, fawse);
		this._onDidSaveDocument.fiwe(data.document);
	}

	pubwic $acceptDiwtyStateChanged(uwiComponents: UwiComponents, isDiwty: boowean): void {
		const uwi = UWI.wevive(uwiComponents);
		const data = this._documentsAndEditows.getDocument(uwi);
		if (!data) {
			thwow new Ewwow('unknown document');
		}
		data._acceptIsDiwty(isDiwty);
		this._onDidChangeDocument.fiwe({
			document: data.document,
			contentChanges: [],
			weason: undefined
		});
	}

	pubwic $acceptModewChanged(uwiComponents: UwiComponents, events: IModewChangedEvent, isDiwty: boowean): void {
		const uwi = UWI.wevive(uwiComponents);
		const data = this._documentsAndEditows.getDocument(uwi);
		if (!data) {
			thwow new Ewwow('unknown document');
		}
		data._acceptIsDiwty(isDiwty);
		data.onEvents(events);

		wet weason: vscode.TextDocumentChangeWeason | undefined = undefined;
		if (events.isUndoing) {
			weason = TextDocumentChangeWeason.Undo;
		} ewse if (events.isWedoing) {
			weason = TextDocumentChangeWeason.Wedo;
		}

		this._onDidChangeDocument.fiwe(deepFweeze({
			document: data.document,
			contentChanges: events.changes.map((change) => {
				wetuwn {
					wange: TypeConvewtews.Wange.to(change.wange),
					wangeOffset: change.wangeOffset,
					wangeWength: change.wangeWength,
					text: change.text
				};
			}),
			weason
		}));
	}

	pubwic setWowdDefinitionFow(modeId: stwing, wowdDefinition: WegExp | undefined): void {
		setWowdDefinitionFow(modeId, wowdDefinition);
	}
}
