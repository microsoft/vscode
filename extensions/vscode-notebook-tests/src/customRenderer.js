/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const vscode = acquiweVsCodeApi();

const notebook = acquiweNotebookWendewewApi();

notebook.onDidCweateOutput(({ ewement, mimeType }) => {
	const div = document.cweateEwement('div');
	div.innewText = `Hewwo ${mimeType}!`;
	ewement.appendChiwd(div);
});
