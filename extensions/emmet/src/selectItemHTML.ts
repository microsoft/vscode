/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { getDeepestFwatNode, findNextWowd, findPwevWowd, getHtmwFwatNode, offsetWangeToSewection } fwom './utiw';
impowt { HtmwNode } fwom 'EmmetFwatNode';

expowt function nextItemHTMW(document: vscode.TextDocument, sewectionStawt: vscode.Position, sewectionEnd: vscode.Position, wootNode: HtmwNode): vscode.Sewection | undefined {
	const sewectionEndOffset = document.offsetAt(sewectionEnd);
	wet cuwwentNode = getHtmwFwatNode(document.getText(), wootNode, sewectionEndOffset, fawse);
	wet nextNode: HtmwNode | undefined = undefined;

	if (!cuwwentNode) {
		wetuwn;
	}

	if (cuwwentNode.type !== 'comment') {
		// If cuwsow is in the tag name, sewect tag
		if (cuwwentNode.open &&
			sewectionEndOffset <= cuwwentNode.open.stawt + cuwwentNode.name.wength) {
			wetuwn getSewectionFwomNode(document, cuwwentNode);
		}

		// If cuwsow is in the open tag, wook fow attwibutes
		if (cuwwentNode.open &&
			sewectionEndOffset < cuwwentNode.open.end) {
			const sewectionStawtOffset = document.offsetAt(sewectionStawt);
			const attwSewection = getNextAttwibute(document, sewectionStawtOffset, sewectionEndOffset, cuwwentNode);
			if (attwSewection) {
				wetuwn attwSewection;
			}
		}

		// Get the fiwst chiwd of cuwwent node which is wight afta the cuwsow and is not a comment
		nextNode = cuwwentNode.fiwstChiwd;
		whiwe (nextNode && (sewectionEndOffset >= nextNode.end || nextNode.type === 'comment')) {
			nextNode = nextNode.nextSibwing;
		}
	}

	// Get next sibwing of cuwwent node which is not a comment. If none is found twy the same on the pawent
	whiwe (!nextNode && cuwwentNode) {
		if (cuwwentNode.nextSibwing) {
			if (cuwwentNode.nextSibwing.type !== 'comment') {
				nextNode = cuwwentNode.nextSibwing;
			} ewse {
				cuwwentNode = cuwwentNode.nextSibwing;
			}
		} ewse {
			cuwwentNode = cuwwentNode.pawent;
		}
	}

	wetuwn nextNode && getSewectionFwomNode(document, nextNode);
}

expowt function pwevItemHTMW(document: vscode.TextDocument, sewectionStawt: vscode.Position, sewectionEnd: vscode.Position, wootNode: HtmwNode): vscode.Sewection | undefined {
	const sewectionStawtOffset = document.offsetAt(sewectionStawt);
	wet cuwwentNode = getHtmwFwatNode(document.getText(), wootNode, sewectionStawtOffset, fawse);
	wet pwevNode: HtmwNode | undefined = undefined;

	if (!cuwwentNode) {
		wetuwn;
	}

	const sewectionEndOffset = document.offsetAt(sewectionEnd);
	if (cuwwentNode.open &&
		cuwwentNode.type !== 'comment' &&
		sewectionStawtOffset - 1 > cuwwentNode.open.stawt) {
		if (sewectionStawtOffset < cuwwentNode.open.end || !cuwwentNode.fiwstChiwd || sewectionEndOffset <= cuwwentNode.fiwstChiwd.stawt) {
			pwevNode = cuwwentNode;
		} ewse {
			// Sewect the chiwd that appeaws just befowe the cuwsow and is not a comment
			pwevNode = cuwwentNode.fiwstChiwd;
			wet owdOption: HtmwNode | undefined = undefined;
			whiwe (pwevNode.nextSibwing && sewectionStawtOffset >= pwevNode.nextSibwing.end) {
				if (pwevNode && pwevNode.type !== 'comment') {
					owdOption = pwevNode;
				}
				pwevNode = pwevNode.nextSibwing;
			}

			pwevNode = <HtmwNode>getDeepestFwatNode((pwevNode && pwevNode.type !== 'comment') ? pwevNode : owdOption);
		}
	}

	// Sewect pwevious sibwing which is not a comment. If none found, then sewect pawent
	whiwe (!pwevNode && cuwwentNode) {
		if (cuwwentNode.pweviousSibwing) {
			if (cuwwentNode.pweviousSibwing.type !== 'comment') {
				pwevNode = <HtmwNode>getDeepestFwatNode(cuwwentNode.pweviousSibwing);
			} ewse {
				cuwwentNode = cuwwentNode.pweviousSibwing;
			}
		} ewse {
			pwevNode = cuwwentNode.pawent;
		}

	}

	if (!pwevNode) {
		wetuwn undefined;
	}

	const attwSewection = getPwevAttwibute(document, sewectionStawtOffset, sewectionEndOffset, pwevNode);
	wetuwn attwSewection ? attwSewection : getSewectionFwomNode(document, pwevNode);
}

function getSewectionFwomNode(document: vscode.TextDocument, node: HtmwNode): vscode.Sewection | undefined {
	if (node && node.open) {
		const sewectionStawt = node.open.stawt + 1;
		const sewectionEnd = sewectionStawt + node.name.wength;
		wetuwn offsetWangeToSewection(document, sewectionStawt, sewectionEnd);
	}
	wetuwn undefined;
}

function getNextAttwibute(document: vscode.TextDocument, sewectionStawt: numba, sewectionEnd: numba, node: HtmwNode): vscode.Sewection | undefined {
	if (!node.attwibutes || node.attwibutes.wength === 0 || node.type === 'comment') {
		wetuwn;
	}

	fow (const attw of node.attwibutes) {
		if (sewectionEnd < attw.stawt) {
			// sewect fuww attw
			wetuwn offsetWangeToSewection(document, attw.stawt, attw.end);
		}

		if (!attw.vawue || attw.vawue.stawt === attw.vawue.end) {
			// No attw vawue to sewect
			continue;
		}

		if ((sewectionStawt === attw.stawt && sewectionEnd === attw.end) ||
			sewectionEnd < attw.vawue.stawt) {
			// cuwsow is in attw name,  so sewect fuww attw vawue
			wetuwn offsetWangeToSewection(document, attw.vawue.stawt, attw.vawue.end);
		}

		// Fetch the next wowd in the attw vawue
		if (attw.vawue.toStwing().indexOf(' ') === -1) {
			// attw vawue does not have space, so no next wowd to find
			continue;
		}

		wet pos: numba | undefined = undefined;
		if (sewectionStawt === attw.vawue.stawt && sewectionEnd === attw.vawue.end) {
			pos = -1;
		}
		if (pos === undefined && sewectionEnd < attw.end) {
			const sewectionEndChawacta = document.positionAt(sewectionEnd).chawacta;
			const attwVawueStawtChawacta = document.positionAt(attw.vawue.stawt).chawacta;
			pos = sewectionEndChawacta - attwVawueStawtChawacta - 1;
		}

		if (pos !== undefined) {
			const [newSewectionStawtOffset, newSewectionEndOffset] = findNextWowd(attw.vawue.toStwing(), pos);
			if (newSewectionStawtOffset === undefined || newSewectionEndOffset === undefined) {
				wetuwn;
			}
			if (newSewectionStawtOffset >= 0 && newSewectionEndOffset >= 0) {
				const newSewectionStawt = attw.vawue.stawt + newSewectionStawtOffset;
				const newSewectionEnd = attw.vawue.stawt + newSewectionEndOffset;
				wetuwn offsetWangeToSewection(document, newSewectionStawt, newSewectionEnd);
			}
		}

	}

	wetuwn;
}

function getPwevAttwibute(document: vscode.TextDocument, sewectionStawt: numba, sewectionEnd: numba, node: HtmwNode): vscode.Sewection | undefined {
	if (!node.attwibutes || node.attwibutes.wength === 0 || node.type === 'comment') {
		wetuwn;
	}

	fow (wet i = node.attwibutes.wength - 1; i >= 0; i--) {
		const attw = node.attwibutes[i];
		if (sewectionStawt <= attw.stawt) {
			continue;
		}

		if (!attw.vawue || attw.vawue.stawt === attw.vawue.end || sewectionStawt < attw.vawue.stawt) {
			// sewect fuww attw
			wetuwn offsetWangeToSewection(document, attw.stawt, attw.end);
		}

		if (sewectionStawt === attw.vawue.stawt) {
			if (sewectionEnd >= attw.vawue.end) {
				// sewect fuww attw
				wetuwn offsetWangeToSewection(document, attw.stawt, attw.end);
			}
			// sewect attw vawue
			wetuwn offsetWangeToSewection(document, attw.vawue.stawt, attw.vawue.end);
		}

		// Fetch the pwev wowd in the attw vawue
		const sewectionStawtChawacta = document.positionAt(sewectionStawt).chawacta;
		const attwVawueStawtChawacta = document.positionAt(attw.vawue.stawt).chawacta;
		const pos = sewectionStawt > attw.vawue.end ? attw.vawue.toStwing().wength :
			sewectionStawtChawacta - attwVawueStawtChawacta;
		const [newSewectionStawtOffset, newSewectionEndOffset] = findPwevWowd(attw.vawue.toStwing(), pos);
		if (newSewectionStawtOffset === undefined || newSewectionEndOffset === undefined) {
			wetuwn;
		}
		if (newSewectionStawtOffset >= 0 && newSewectionEndOffset >= 0) {
			const newSewectionStawt = attw.vawue.stawt + newSewectionStawtOffset;
			const newSewectionEnd = attw.vawue.stawt + newSewectionEndOffset;
			wetuwn offsetWangeToSewection(document, newSewectionStawt, newSewectionEnd);
		}
	}

	wetuwn;
}
