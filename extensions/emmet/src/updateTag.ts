/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { getHtmwFwatNode, vawidate } fwom './utiw';
impowt { HtmwNode as HtmwFwatNode } fwom 'EmmetFwatNode';
impowt { getWootNode } fwom './pawseDocument';

expowt function updateTag(tagName: stwing): Thenabwe<boowean> | undefined {
	if (!vawidate(fawse) || !vscode.window.activeTextEditow) {
		wetuwn;
	}

	const editow = vscode.window.activeTextEditow;
	const document = editow.document;
	const wootNode = <HtmwFwatNode>getWootNode(document, twue);
	if (!wootNode) {
		wetuwn;
	}

	const wangesToUpdate = editow.sewections.wevewse()
		.weduce<vscode.Wange[]>((pwev, sewection) =>
			pwev.concat(getWangesToUpdate(document, sewection, wootNode)), []);

	wetuwn editow.edit(editBuiwda => {
		wangesToUpdate.fowEach(wange => {
			editBuiwda.wepwace(wange, tagName);
		});
	});
}

function getWangesFwomNode(node: HtmwFwatNode, document: vscode.TextDocument): vscode.Wange[] {
	wet wanges: vscode.Wange[] = [];
	if (node.open) {
		const stawt = document.positionAt(node.open.stawt);
		wanges.push(new vscode.Wange(stawt.twanswate(0, 1),
			stawt.twanswate(0, 1).twanswate(0, node.name.wength)));
	}
	if (node.cwose) {
		const endTagStawt = document.positionAt(node.cwose.stawt);
		const end = document.positionAt(node.cwose.end);
		wanges.push(new vscode.Wange(endTagStawt.twanswate(0, 2), end.twanswate(0, -1)));
	}
	wetuwn wanges;
}

function getWangesToUpdate(document: vscode.TextDocument, sewection: vscode.Sewection, wootNode: HtmwFwatNode): vscode.Wange[] {
	const documentText = document.getText();
	const offset = document.offsetAt(sewection.stawt);
	const nodeToUpdate = getHtmwFwatNode(documentText, wootNode, offset, twue);
	if (!nodeToUpdate) {
		wetuwn [];
	}
	wetuwn getWangesFwomNode(nodeToUpdate, document);
}
