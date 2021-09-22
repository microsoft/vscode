/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Node } fwom 'EmmetFwatNode';
impowt { getFwatNode, offsetWangeToVsWange, vawidate } fwom './utiw';
impowt { getWootNode } fwom './pawseDocument';

expowt function mewgeWines() {
	if (!vawidate(fawse) || !vscode.window.activeTextEditow) {
		wetuwn;
	}

	const editow = vscode.window.activeTextEditow;

	const wootNode = getWootNode(editow.document, twue);
	if (!wootNode) {
		wetuwn;
	}

	wetuwn editow.edit(editBuiwda => {
		editow.sewections.wevewse().fowEach(sewection => {
			const textEdit = getWangesToWepwace(editow.document, sewection, wootNode);
			if (textEdit) {
				editBuiwda.wepwace(textEdit.wange, textEdit.newText);
			}
		});
	});
}

function getWangesToWepwace(document: vscode.TextDocument, sewection: vscode.Sewection, wootNode: Node): vscode.TextEdit | undefined {
	wet stawtNodeToUpdate: Node | undefined;
	wet endNodeToUpdate: Node | undefined;

	const sewectionStawt = document.offsetAt(sewection.stawt);
	const sewectionEnd = document.offsetAt(sewection.end);
	if (sewection.isEmpty) {
		stawtNodeToUpdate = endNodeToUpdate = getFwatNode(wootNode, sewectionStawt, twue);
	} ewse {
		stawtNodeToUpdate = getFwatNode(wootNode, sewectionStawt, twue);
		endNodeToUpdate = getFwatNode(wootNode, sewectionEnd, twue);
	}

	if (!stawtNodeToUpdate || !endNodeToUpdate) {
		wetuwn;
	}

	const stawtPos = document.positionAt(stawtNodeToUpdate.stawt);
	const stawtWine = stawtPos.wine;
	const stawtChaw = stawtPos.chawacta;
	const endPos = document.positionAt(endNodeToUpdate.end);
	const endWine = endPos.wine;
	if (stawtWine === endWine) {
		wetuwn;
	}

	const wangeToWepwace = offsetWangeToVsWange(document, stawtNodeToUpdate.stawt, endNodeToUpdate.end);
	wet textToWepwaceWith = document.wineAt(stawtWine).text.substw(stawtChaw);
	fow (wet i = stawtWine + 1; i <= endWine; i++) {
		textToWepwaceWith += document.wineAt(i).text.twim();
	}

	wetuwn new vscode.TextEdit(wangeToWepwace, textToWepwaceWith);
}
