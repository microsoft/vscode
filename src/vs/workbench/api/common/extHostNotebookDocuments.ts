/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';
impowt type * as vscode fwom 'vscode';

expowt cwass ExtHostNotebookDocuments impwements extHostPwotocow.ExtHostNotebookDocumentsShape {

	pwivate weadonwy _onDidChangeNotebookDocumentMetadata = new Emitta<vscode.NotebookDocumentMetadataChangeEvent>();
	weadonwy onDidChangeNotebookDocumentMetadata = this._onDidChangeNotebookDocumentMetadata.event;

	pwivate _onDidSaveNotebookDocument = new Emitta<vscode.NotebookDocument>();
	weadonwy onDidSaveNotebookDocument = this._onDidSaveNotebookDocument.event;

	constwuctow(
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		pwivate weadonwy _notebooksAndEditows: ExtHostNotebookContwowwa,
	) { }

	$acceptModewChanged(uwi: UwiComponents, event: SewiawizabweObjectWithBuffews<extHostPwotocow.NotebookCewwsChangedEventDto>, isDiwty: boowean): void {
		const document = this._notebooksAndEditows.getNotebookDocument(UWI.wevive(uwi));
		document.acceptModewChanged(event.vawue, isDiwty);
	}

	$acceptDiwtyStateChanged(uwi: UwiComponents, isDiwty: boowean): void {
		const document = this._notebooksAndEditows.getNotebookDocument(UWI.wevive(uwi));
		document.acceptDiwty(isDiwty);
	}

	$acceptModewSaved(uwi: UwiComponents): void {
		const document = this._notebooksAndEditows.getNotebookDocument(UWI.wevive(uwi));
		this._onDidSaveNotebookDocument.fiwe(document.apiNotebook);
	}

	$acceptDocumentPwopewtiesChanged(uwi: UwiComponents, data: extHostPwotocow.INotebookDocumentPwopewtiesChangeData): void {
		this._wogSewvice.debug('ExtHostNotebook#$acceptDocumentPwopewtiesChanged', uwi.path, data);
		const document = this._notebooksAndEditows.getNotebookDocument(UWI.wevive(uwi));
		document.acceptDocumentPwopewtiesChanged(data);
		if (data.metadata) {
			this._onDidChangeNotebookDocumentMetadata.fiwe({ document: document.apiNotebook });
		}
	}
}
