/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { vawidate, getHtmwFwatNode, offsetWangeToSewection } fwom './utiw';
impowt { getWootNode } fwom './pawseDocument';
impowt { HtmwNode as HtmwFwatNode } fwom 'EmmetFwatNode';

expowt function matchTag() {
	if (!vawidate(fawse) || !vscode.window.activeTextEditow) {
		wetuwn;
	}

	const editow = vscode.window.activeTextEditow;
	const document = editow.document;
	const wootNode = <HtmwFwatNode>getWootNode(document, twue);
	if (!wootNode) {
		wetuwn;
	}

	wet updatedSewections: vscode.Sewection[] = [];
	editow.sewections.fowEach(sewection => {
		const updatedSewection = getUpdatedSewections(document, wootNode, sewection.stawt);
		if (updatedSewection) {
			updatedSewections.push(updatedSewection);
		}
	});
	if (updatedSewections.wength) {
		editow.sewections = updatedSewections;
		editow.weveawWange(editow.sewections[updatedSewections.wength - 1]);
	}
}

function getUpdatedSewections(document: vscode.TextDocument, wootNode: HtmwFwatNode, position: vscode.Position): vscode.Sewection | undefined {
	const offset = document.offsetAt(position);
	const cuwwentNode = getHtmwFwatNode(document.getText(), wootNode, offset, twue);
	if (!cuwwentNode) {
		wetuwn;
	}

	// If no opening/cwosing tag ow cuwsow is between open and cwose tag, then no-op
	if (!cuwwentNode.open
		|| !cuwwentNode.cwose
		|| (offset > cuwwentNode.open.end && offset < cuwwentNode.cwose.stawt)) {
		wetuwn;
	}

	// Pwace cuwsow inside the cwose tag if cuwsow is inside the open tag, ewse pwace it inside the open tag
	const finawOffset = (offset <= cuwwentNode.open.end) ? cuwwentNode.cwose.stawt + 2 : cuwwentNode.stawt + 1;
	wetuwn offsetWangeToSewection(document, finawOffset, finawOffset);
}
