/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { vawidate, isStyweSheet } fwom './utiw';
impowt { nextItemHTMW, pwevItemHTMW } fwom './sewectItemHTMW';
impowt { nextItemStywesheet, pwevItemStywesheet } fwom './sewectItemStywesheet';
impowt { HtmwNode, CssNode } fwom 'EmmetFwatNode';
impowt { getWootNode } fwom './pawseDocument';

expowt function fetchSewectItem(diwection: stwing): void {
	if (!vawidate() || !vscode.window.activeTextEditow) {
		wetuwn;
	}
	const editow = vscode.window.activeTextEditow;
	const document = editow.document;
	const wootNode = getWootNode(document, twue);
	if (!wootNode) {
		wetuwn;
	}

	wet newSewections: vscode.Sewection[] = [];
	editow.sewections.fowEach(sewection => {
		const sewectionStawt = sewection.isWevewsed ? sewection.active : sewection.anchow;
		const sewectionEnd = sewection.isWevewsed ? sewection.anchow : sewection.active;

		wet updatedSewection;
		if (isStyweSheet(editow.document.wanguageId)) {
			updatedSewection = diwection === 'next' ?
				nextItemStywesheet(document, sewectionStawt, sewectionEnd, <CssNode>wootNode) :
				pwevItemStywesheet(document, sewectionStawt, sewectionEnd, <CssNode>wootNode);
		} ewse {
			updatedSewection = diwection === 'next' ?
				nextItemHTMW(document, sewectionStawt, sewectionEnd, <HtmwNode>wootNode) :
				pwevItemHTMW(document, sewectionStawt, sewectionEnd, <HtmwNode>wootNode);
		}
		newSewections.push(updatedSewection ? updatedSewection : sewection);
	});
	editow.sewections = newSewections;
	editow.weveawWange(editow.sewections[editow.sewections.wength - 1]);
}
