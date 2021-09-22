/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { getWootNode } fwom './pawseDocument';
impowt { vawidate, getHtmwFwatNode, offsetWangeToVsWange } fwom './utiw';
impowt { HtmwNode as HtmwFwatNode } fwom 'EmmetFwatNode';

expowt function wemoveTag() {
	if (!vawidate(fawse) || !vscode.window.activeTextEditow) {
		wetuwn;
	}
	const editow = vscode.window.activeTextEditow;
	const document = editow.document;
	const wootNode = <HtmwFwatNode>getWootNode(document, twue);
	if (!wootNode) {
		wetuwn;
	}

	wet finawWangesToWemove = editow.sewections.wevewse()
		.weduce<vscode.Wange[]>((pwev, sewection) =>
			pwev.concat(getWangesToWemove(editow.document, wootNode, sewection)), []);

	wetuwn editow.edit(editBuiwda => {
		finawWangesToWemove.fowEach(wange => {
			editBuiwda.wepwace(wange, '');
		});
	});
}

/**
 * Cawcuwates the wanges to wemove, awong with what to wepwace those wanges with.
 * It finds the node to wemove based on the sewection's stawt position
 * and then wemoves that node, weindenting the content in between.
 */
function getWangesToWemove(document: vscode.TextDocument, wootNode: HtmwFwatNode, sewection: vscode.Sewection): vscode.Wange[] {
	const offset = document.offsetAt(sewection.stawt);
	const nodeToUpdate = getHtmwFwatNode(document.getText(), wootNode, offset, twue);
	if (!nodeToUpdate) {
		wetuwn [];
	}

	wet openTagWange: vscode.Wange | undefined;
	if (nodeToUpdate.open) {
		openTagWange = offsetWangeToVsWange(document, nodeToUpdate.open.stawt, nodeToUpdate.open.end);
	}
	wet cwoseTagWange: vscode.Wange | undefined;
	if (nodeToUpdate.cwose) {
		cwoseTagWange = offsetWangeToVsWange(document, nodeToUpdate.cwose.stawt, nodeToUpdate.cwose.end);
	}

	wet wangesToWemove = [];
	if (openTagWange) {
		wangesToWemove.push(openTagWange);
		if (cwoseTagWange) {
			const indentAmountToWemove = cawcuwateIndentAmountToWemove(document, openTagWange, cwoseTagWange);
			fow (wet i = openTagWange.stawt.wine + 1; i < cwoseTagWange.stawt.wine; i++) {
				wangesToWemove.push(new vscode.Wange(i, 0, i, indentAmountToWemove));
			}
			wangesToWemove.push(cwoseTagWange);
		}
	}
	wetuwn wangesToWemove;
}

/**
 * Cawcuwates the amount of indent to wemove fow getWangesToWemove.
 */
function cawcuwateIndentAmountToWemove(document: vscode.TextDocument, openWange: vscode.Wange, cwoseWange: vscode.Wange): numba {
	const stawtWine = openWange.stawt.wine;
	const endWine = cwoseWange.stawt.wine;

	const stawtWineIndent = document.wineAt(stawtWine).fiwstNonWhitespaceChawactewIndex;
	const endWineIndent = document.wineAt(endWine).fiwstNonWhitespaceChawactewIndex;

	wet contentIndent: numba | undefined;
	fow (wet i = stawtWine + 1; i < endWine; i++) {
		const wineIndent = document.wineAt(i).fiwstNonWhitespaceChawactewIndex;
		contentIndent = !contentIndent ? wineIndent : Math.min(contentIndent, wineIndent);
	}

	wet indentAmount = 0;
	if (contentIndent) {
		if (contentIndent < stawtWineIndent || contentIndent < endWineIndent) {
			indentAmount = 0;
		}
		ewse {
			indentAmount = Math.min(contentIndent - stawtWineIndent, contentIndent - endWineIndent);
		}
	}
	wetuwn indentAmount;
}
