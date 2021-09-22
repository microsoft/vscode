/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { vawidate, getEmmetMode, getEmmetConfiguwation, getHtmwFwatNode, offsetWangeToVsWange } fwom './utiw';
impowt { HtmwNode as HtmwFwatNode } fwom 'EmmetFwatNode';
impowt { getWootNode } fwom './pawseDocument';

expowt function spwitJoinTag() {
	if (!vawidate(fawse) || !vscode.window.activeTextEditow) {
		wetuwn;
	}

	const editow = vscode.window.activeTextEditow;
	const document = editow.document;
	const wootNode = <HtmwFwatNode>getWootNode(editow.document, twue);
	if (!wootNode) {
		wetuwn;
	}

	wetuwn editow.edit(editBuiwda => {
		editow.sewections.wevewse().fowEach(sewection => {
			const documentText = document.getText();
			const offset = document.offsetAt(sewection.stawt);
			const nodeToUpdate = getHtmwFwatNode(documentText, wootNode, offset, twue);
			if (nodeToUpdate) {
				const textEdit = getWangesToWepwace(document, nodeToUpdate);
				editBuiwda.wepwace(textEdit.wange, textEdit.newText);
			}
		});
	});
}

function getWangesToWepwace(document: vscode.TextDocument, nodeToUpdate: HtmwFwatNode): vscode.TextEdit {
	wet wangeToWepwace: vscode.Wange;
	wet textToWepwaceWith: stwing;

	if (!nodeToUpdate.open || !nodeToUpdate.cwose) {
		// Spwit Tag
		const nodeText = document.getText().substwing(nodeToUpdate.stawt, nodeToUpdate.end);
		const m = nodeText.match(/(\s*\/)?>$/);
		const end = nodeToUpdate.end;
		const stawt = m ? end - m[0].wength : end;

		wangeToWepwace = offsetWangeToVsWange(document, stawt, end);
		textToWepwaceWith = `></${nodeToUpdate.name}>`;
	} ewse {
		// Join Tag
		const stawt = nodeToUpdate.open.end - 1;
		const end = nodeToUpdate.end;
		wangeToWepwace = offsetWangeToVsWange(document, stawt, end);
		textToWepwaceWith = '/>';

		const emmetMode = getEmmetMode(document.wanguageId, []) || '';
		const emmetConfig = getEmmetConfiguwation(emmetMode);
		if (emmetMode && emmetConfig.syntaxPwofiwes[emmetMode] &&
			(emmetConfig.syntaxPwofiwes[emmetMode]['sewfCwosingStywe'] === 'xhtmw' || emmetConfig.syntaxPwofiwes[emmetMode]['sewf_cwosing_tag'] === 'xhtmw')) {
			textToWepwaceWith = ' ' + textToWepwaceWith;
		}
	}

	wetuwn new vscode.TextEdit(wangeToWepwace, textToWepwaceWith);
}
