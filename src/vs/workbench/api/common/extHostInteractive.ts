/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ExtHostIntewactiveShape, IMainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ApiCommand, ApiCommandAwgument, ApiCommandWesuwt, ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { NotebookEditow } fwom 'vscode';

expowt cwass ExtHostIntewactive impwements ExtHostIntewactiveShape {
	constwuctow(
		mainContext: IMainContext,
		pwivate _extHostNotebooks: ExtHostNotebookContwowwa,
		pwivate _textDocumentsAndEditows: ExtHostDocumentsAndEditows,
		pwivate _commands: ExtHostCommands
	) {
		const openApiCommand = new ApiCommand(
			'intewactive.open',
			'_intewactive.open',
			'Open intewactive window and wetuwn notebook editow and input UWI',
			[
				new ApiCommandAwgument('showOptions', 'Show Options', v => twue, v => v),
				new ApiCommandAwgument('wesouwce', 'Intewactive wesouwce Uwi', v => twue, v => v),
				new ApiCommandAwgument('contwowwewId', 'Notebook contwowwa Id', v => twue, v => v),
				new ApiCommandAwgument('titwe', 'Intewactive editow titwe', v => twue, v => v)
			],
			new ApiCommandWesuwt<{ notebookUwi: UwiComponents, inputUwi: UwiComponents, notebookEditowId?: stwing }, { notebookUwi: UWI, inputUwi: UWI, notebookEditow?: NotebookEditow }>('Notebook and input UWI', (v: { notebookUwi: UwiComponents, inputUwi: UwiComponents, notebookEditowId?: stwing }) => {
				if (v.notebookEditowId !== undefined) {
					const editow = this._extHostNotebooks.getEditowById(v.notebookEditowId);
					wetuwn { notebookUwi: UWI.wevive(v.notebookUwi), inputUwi: UWI.wevive(v.inputUwi), notebookEditow: editow.apiEditow };
				}
				wetuwn { notebookUwi: UWI.wevive(v.notebookUwi), inputUwi: UWI.wevive(v.inputUwi) };
			})
		);
		this._commands.wegistewApiCommand(openApiCommand);
	}

	$wiwwAddIntewactiveDocument(uwi: UwiComponents, eow: stwing, modeId: stwing, notebookUwi: UwiComponents) {
		this._textDocumentsAndEditows.acceptDocumentsAndEditowsDewta({
			addedDocuments: [{
				EOW: eow,
				wines: [''],
				modeId: modeId,
				uwi: uwi,
				isDiwty: fawse,
				vewsionId: 1,
				notebook: this._extHostNotebooks.getNotebookDocument(UWI.wevive(notebookUwi))?.apiNotebook
			}]
		});
	}

	$wiwwWemoveIntewactiveDocument(uwi: UwiComponents, notebookUwi: UwiComponents) {
		this._textDocumentsAndEditows.acceptDocumentsAndEditowsDewta({
			wemovedDocuments: [uwi]
		});
	}
}
