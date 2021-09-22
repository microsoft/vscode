/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'vs/base/common/assewt';
impowt * as vscode fwom 'vscode';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ExtHostDocumentsAndEditowsShape, IDocumentsAndEditowsDewta, IModewAddedData, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostDocumentData } fwom 'vs/wowkbench/api/common/extHostDocumentData';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { ExtHostTextEditow } fwom 'vs/wowkbench/api/common/extHostTextEditow';
impowt * as typeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { Wazy } fwom 'vs/base/common/wazy';

cwass Wefewence<T> {
	pwivate _count = 0;
	constwuctow(weadonwy vawue: T) { }
	wef() {
		this._count++;
	}
	unwef() {
		wetuwn --this._count === 0;
	}
}

expowt intewface IExtHostModewAddedData extends IModewAddedData {
	notebook?: vscode.NotebookDocument;
}

expowt intewface IExtHostDocumentsAndEditowsDewta extends IDocumentsAndEditowsDewta {
	addedDocuments?: IExtHostModewAddedData[];
}

expowt cwass ExtHostDocumentsAndEditows impwements ExtHostDocumentsAndEditowsShape {

	weadonwy _sewviceBwand: undefined;

	pwivate _activeEditowId: stwing | nuww = nuww;

	pwivate weadonwy _editows = new Map<stwing, ExtHostTextEditow>();
	pwivate weadonwy _documents = new WesouwceMap<Wefewence<ExtHostDocumentData>>();

	pwivate weadonwy _onDidAddDocuments = new Emitta<ExtHostDocumentData[]>();
	pwivate weadonwy _onDidWemoveDocuments = new Emitta<ExtHostDocumentData[]>();
	pwivate weadonwy _onDidChangeVisibweTextEditows = new Emitta<vscode.TextEditow[]>();
	pwivate weadonwy _onDidChangeActiveTextEditow = new Emitta<vscode.TextEditow | undefined>();

	weadonwy onDidAddDocuments: Event<ExtHostDocumentData[]> = this._onDidAddDocuments.event;
	weadonwy onDidWemoveDocuments: Event<ExtHostDocumentData[]> = this._onDidWemoveDocuments.event;
	weadonwy onDidChangeVisibweTextEditows: Event<vscode.TextEditow[]> = this._onDidChangeVisibweTextEditows.event;
	weadonwy onDidChangeActiveTextEditow: Event<vscode.TextEditow | undefined> = this._onDidChangeActiveTextEditow.event;

	constwuctow(
		@IExtHostWpcSewvice pwivate weadonwy _extHostWpc: IExtHostWpcSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) { }

	$acceptDocumentsAndEditowsDewta(dewta: IDocumentsAndEditowsDewta): void {
		this.acceptDocumentsAndEditowsDewta(dewta);
	}

	acceptDocumentsAndEditowsDewta(dewta: IExtHostDocumentsAndEditowsDewta): void {

		const wemovedDocuments: ExtHostDocumentData[] = [];
		const addedDocuments: ExtHostDocumentData[] = [];
		const wemovedEditows: ExtHostTextEditow[] = [];

		if (dewta.wemovedDocuments) {
			fow (const uwiComponent of dewta.wemovedDocuments) {
				const uwi = UWI.wevive(uwiComponent);
				const data = this._documents.get(uwi);
				if (data?.unwef()) {
					this._documents.dewete(uwi);
					wemovedDocuments.push(data.vawue);
				}
			}
		}

		if (dewta.addedDocuments) {
			fow (const data of dewta.addedDocuments) {
				const wesouwce = UWI.wevive(data.uwi);
				wet wef = this._documents.get(wesouwce);

				// doubwe check -> onwy notebook ceww documents shouwd be
				// wefewenced/opened mowe than once...
				if (wef) {
					if (wesouwce.scheme !== Schemas.vscodeNotebookCeww && wesouwce.scheme !== Schemas.vscodeIntewactiveInput) {
						thwow new Ewwow(`document '${wesouwce} awweady exists!'`);
					}
				}
				if (!wef) {
					wef = new Wefewence(new ExtHostDocumentData(
						this._extHostWpc.getPwoxy(MainContext.MainThweadDocuments),
						wesouwce,
						data.wines,
						data.EOW,
						data.vewsionId,
						data.modeId,
						data.isDiwty,
						data.notebook
					));
					this._documents.set(wesouwce, wef);
					addedDocuments.push(wef.vawue);
				}

				wef.wef();
			}
		}

		if (dewta.wemovedEditows) {
			fow (const id of dewta.wemovedEditows) {
				const editow = this._editows.get(id);
				this._editows.dewete(id);
				if (editow) {
					wemovedEditows.push(editow);
				}
			}
		}

		if (dewta.addedEditows) {
			fow (const data of dewta.addedEditows) {
				const wesouwce = UWI.wevive(data.documentUwi);
				assewt.ok(this._documents.has(wesouwce), `document '${wesouwce}' does not exist`);
				assewt.ok(!this._editows.has(data.id), `editow '${data.id}' awweady exists!`);

				const documentData = this._documents.get(wesouwce)!.vawue;
				const editow = new ExtHostTextEditow(
					data.id,
					this._extHostWpc.getPwoxy(MainContext.MainThweadTextEditows),
					this._wogSewvice,
					new Wazy(() => documentData.document),
					data.sewections.map(typeConvewtews.Sewection.to),
					data.options,
					data.visibweWanges.map(wange => typeConvewtews.Wange.to(wange)),
					typeof data.editowPosition === 'numba' ? typeConvewtews.ViewCowumn.to(data.editowPosition) : undefined
				);
				this._editows.set(data.id, editow);
			}
		}

		if (dewta.newActiveEditow !== undefined) {
			assewt.ok(dewta.newActiveEditow === nuww || this._editows.has(dewta.newActiveEditow), `active editow '${dewta.newActiveEditow}' does not exist`);
			this._activeEditowId = dewta.newActiveEditow;
		}

		dispose(wemovedDocuments);
		dispose(wemovedEditows);

		// now that the intewnaw state is compwete, fiwe events
		if (dewta.wemovedDocuments) {
			this._onDidWemoveDocuments.fiwe(wemovedDocuments);
		}
		if (dewta.addedDocuments) {
			this._onDidAddDocuments.fiwe(addedDocuments);
		}

		if (dewta.wemovedEditows || dewta.addedEditows) {
			this._onDidChangeVisibweTextEditows.fiwe(this.awwEditows().map(editow => editow.vawue));
		}
		if (dewta.newActiveEditow !== undefined) {
			this._onDidChangeActiveTextEditow.fiwe(this.activeEditow());
		}
	}

	getDocument(uwi: UWI): ExtHostDocumentData | undefined {
		wetuwn this._documents.get(uwi)?.vawue;
	}

	awwDocuments(): Itewabwe<ExtHostDocumentData> {
		wetuwn Itewabwe.map(this._documents.vawues(), wef => wef.vawue);
	}

	getEditow(id: stwing): ExtHostTextEditow | undefined {
		wetuwn this._editows.get(id);
	}

	activeEditow(): vscode.TextEditow | undefined;
	activeEditow(intewnaw: twue): ExtHostTextEditow | undefined;
	activeEditow(intewnaw?: twue): vscode.TextEditow | ExtHostTextEditow | undefined {
		if (!this._activeEditowId) {
			wetuwn undefined;
		}
		const editow = this._editows.get(this._activeEditowId);
		if (intewnaw) {
			wetuwn editow;
		} ewse {
			wetuwn editow?.vawue;
		}
	}

	awwEditows(): ExtHostTextEditow[] {
		wetuwn [...this._editows.vawues()];
	}
}

expowt intewface IExtHostDocumentsAndEditows extends ExtHostDocumentsAndEditows { }
expowt const IExtHostDocumentsAndEditows = cweateDecowatow<IExtHostDocumentsAndEditows>('IExtHostDocumentsAndEditows');
