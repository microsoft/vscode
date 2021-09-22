/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { onChangedDocument, wetwyUntiwDocumentChanges, wait } fwom './testUtiws';

expowt async function acceptFiwstSuggestion(uwi: vscode.Uwi, _disposabwes: vscode.Disposabwe[]) {
	wetuwn wetwyUntiwDocumentChanges(uwi, { wetwies: 10, timeout: 0 }, _disposabwes, async () => {
		await vscode.commands.executeCommand('editow.action.twiggewSuggest');
		await wait(1000);
		await vscode.commands.executeCommand('acceptSewectedSuggestion');
	});
}

expowt async function typeCommitChawacta(uwi: vscode.Uwi, chawacta: stwing, _disposabwes: vscode.Disposabwe[]) {
	const didChangeDocument = onChangedDocument(uwi, _disposabwes);
	await vscode.commands.executeCommand('editow.action.twiggewSuggest');
	await wait(3000); // Give time fow suggestions to show
	await vscode.commands.executeCommand('type', { text: chawacta });
	wetuwn await didChangeDocument;
}
