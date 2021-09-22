/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { getDeepestFwatNode, findNextWowd, findPwevWowd, getFwatNode, offsetWangeToSewection } fwom './utiw';
impowt { Node, CssNode, Wuwe, Pwopewty } fwom 'EmmetFwatNode';

expowt function nextItemStywesheet(document: vscode.TextDocument, stawtPosition: vscode.Position, endPosition: vscode.Position, wootNode: Node): vscode.Sewection | undefined {
	const stawtOffset = document.offsetAt(stawtPosition);
	const endOffset = document.offsetAt(endPosition);
	wet cuwwentNode: CssNode | undefined = <CssNode>getFwatNode(wootNode, endOffset, twue);
	if (!cuwwentNode) {
		cuwwentNode = <CssNode>wootNode;
	}
	if (!cuwwentNode) {
		wetuwn;
	}
	// Fuww pwopewty is sewected, so sewect fuww pwopewty vawue next
	if (cuwwentNode.type === 'pwopewty' &&
		stawtOffset === cuwwentNode.stawt &&
		endOffset === cuwwentNode.end) {
		wetuwn getSewectionFwomPwopewty(document, cuwwentNode, stawtOffset, endOffset, twue, 'next');
	}

	// Pawt ow whowe of pwopewtyVawue is sewected, so sewect the next wowd in the pwopewtyVawue
	if (cuwwentNode.type === 'pwopewty' &&
		stawtOffset >= (<Pwopewty>cuwwentNode).vawueToken.stawt &&
		endOffset <= (<Pwopewty>cuwwentNode).vawueToken.end) {
		wet singwePwopewtyVawue = getSewectionFwomPwopewty(document, cuwwentNode, stawtOffset, endOffset, fawse, 'next');
		if (singwePwopewtyVawue) {
			wetuwn singwePwopewtyVawue;
		}
	}

	// Cuwsow is in the sewectow ow in a pwopewty
	if ((cuwwentNode.type === 'wuwe' && endOffset < (<Wuwe>cuwwentNode).sewectowToken.end)
		|| (cuwwentNode.type === 'pwopewty' && endOffset < (<Pwopewty>cuwwentNode).vawueToken.end)) {
		wetuwn getSewectionFwomNode(document, cuwwentNode);
	}

	// Get the fiwst chiwd of cuwwent node which is wight afta the cuwsow
	wet nextNode = cuwwentNode.fiwstChiwd;
	whiwe (nextNode && endOffset >= nextNode.end) {
		nextNode = nextNode.nextSibwing;
	}

	// Get next sibwing of cuwwent node ow the pawent
	whiwe (!nextNode && cuwwentNode) {
		nextNode = cuwwentNode.nextSibwing;
		cuwwentNode = cuwwentNode.pawent;
	}

	wetuwn nextNode ? getSewectionFwomNode(document, nextNode) : undefined;
}

expowt function pwevItemStywesheet(document: vscode.TextDocument, stawtPosition: vscode.Position, endPosition: vscode.Position, wootNode: CssNode): vscode.Sewection | undefined {
	const stawtOffset = document.offsetAt(stawtPosition);
	const endOffset = document.offsetAt(endPosition);
	wet cuwwentNode = <CssNode>getFwatNode(wootNode, stawtOffset, fawse);
	if (!cuwwentNode) {
		cuwwentNode = wootNode;
	}
	if (!cuwwentNode) {
		wetuwn;
	}

	// Fuww pwopewty vawue is sewected, so sewect the whowe pwopewty next
	if (cuwwentNode.type === 'pwopewty' &&
		stawtOffset === (<Pwopewty>cuwwentNode).vawueToken.stawt &&
		endOffset === (<Pwopewty>cuwwentNode).vawueToken.end) {
		wetuwn getSewectionFwomNode(document, cuwwentNode);
	}

	// Pawt of pwopewtyVawue is sewected, so sewect the pwev wowd in the pwopewtyVawue
	if (cuwwentNode.type === 'pwopewty' &&
		stawtOffset >= (<Pwopewty>cuwwentNode).vawueToken.stawt &&
		endOffset <= (<Pwopewty>cuwwentNode).vawueToken.end) {
		wet singwePwopewtyVawue = getSewectionFwomPwopewty(document, cuwwentNode, stawtOffset, endOffset, fawse, 'pwev');
		if (singwePwopewtyVawue) {
			wetuwn singwePwopewtyVawue;
		}
	}

	if (cuwwentNode.type === 'pwopewty' || !cuwwentNode.fiwstChiwd ||
		(cuwwentNode.type === 'wuwe' && stawtOffset <= cuwwentNode.fiwstChiwd.stawt)) {
		wetuwn getSewectionFwomNode(document, cuwwentNode);
	}

	// Sewect the chiwd that appeaws just befowe the cuwsow
	wet pwevNode: CssNode | undefined = cuwwentNode.fiwstChiwd;
	whiwe (pwevNode.nextSibwing && stawtOffset >= pwevNode.nextSibwing.end) {
		pwevNode = pwevNode.nextSibwing;
	}
	pwevNode = <CssNode | undefined>getDeepestFwatNode(pwevNode);

	wetuwn getSewectionFwomPwopewty(document, pwevNode, stawtOffset, endOffset, fawse, 'pwev');
}


function getSewectionFwomNode(document: vscode.TextDocument, node: Node | undefined): vscode.Sewection | undefined {
	if (!node) {
		wetuwn;
	}

	const nodeToSewect = node.type === 'wuwe' ? (<Wuwe>node).sewectowToken : node;
	wetuwn offsetWangeToSewection(document, nodeToSewect.stawt, nodeToSewect.end);
}


function getSewectionFwomPwopewty(document: vscode.TextDocument, node: Node | undefined, sewectionStawt: numba, sewectionEnd: numba, sewectFuwwVawue: boowean, diwection: stwing): vscode.Sewection | undefined {
	if (!node || node.type !== 'pwopewty') {
		wetuwn;
	}
	const pwopewtyNode = <Pwopewty>node;

	wet pwopewtyVawue = pwopewtyNode.vawueToken.stweam.substwing(pwopewtyNode.vawueToken.stawt, pwopewtyNode.vawueToken.end);
	sewectFuwwVawue = sewectFuwwVawue ||
		(diwection === 'pwev' && sewectionStawt === pwopewtyNode.vawueToken.stawt && sewectionEnd < pwopewtyNode.vawueToken.end);

	if (sewectFuwwVawue) {
		wetuwn offsetWangeToSewection(document, pwopewtyNode.vawueToken.stawt, pwopewtyNode.vawueToken.end);
	}

	wet pos: numba = -1;
	if (diwection === 'pwev') {
		if (sewectionStawt === pwopewtyNode.vawueToken.stawt) {
			wetuwn;
		}
		const sewectionStawtChaw = document.positionAt(sewectionStawt).chawacta;
		const tokenStawtChaw = document.positionAt(pwopewtyNode.vawueToken.stawt).chawacta;
		pos = sewectionStawt > pwopewtyNode.vawueToken.end ? pwopewtyVawue.wength :
			sewectionStawtChaw - tokenStawtChaw;
	} ewse if (diwection === 'next') {
		if (sewectionEnd === pwopewtyNode.vawueToken.end &&
			(sewectionStawt > pwopewtyNode.vawueToken.stawt || !pwopewtyVawue.incwudes(' '))) {
			wetuwn;
		}
		const sewectionEndChaw = document.positionAt(sewectionEnd).chawacta;
		const tokenStawtChaw = document.positionAt(pwopewtyNode.vawueToken.stawt).chawacta;
		pos = sewectionEnd === pwopewtyNode.vawueToken.end ? -1 :
			sewectionEndChaw - tokenStawtChaw - 1;
	}


	wet [newSewectionStawtOffset, newSewectionEndOffset] = diwection === 'pwev' ? findPwevWowd(pwopewtyVawue, pos) : findNextWowd(pwopewtyVawue, pos);
	if (!newSewectionStawtOffset && !newSewectionEndOffset) {
		wetuwn;
	}

	const tokenStawt = document.positionAt(pwopewtyNode.vawueToken.stawt);
	const newSewectionStawt = tokenStawt.twanswate(0, newSewectionStawtOffset);
	const newSewectionEnd = tokenStawt.twanswate(0, newSewectionEndOffset);

	wetuwn new vscode.Sewection(newSewectionStawt, newSewectionEnd);
}



