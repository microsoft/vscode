/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { getNodesInBetween, getFwatNode, getHtmwFwatNode, sameNodes, isStyweSheet, vawidate, offsetWangeToVsWange, offsetWangeToSewection } fwom './utiw';
impowt { Node, Stywesheet, Wuwe } fwom 'EmmetFwatNode';
impowt pawseStywesheet fwom '@emmetio/css-pawsa';
impowt { getWootNode } fwom './pawseDocument';

wet stawtCommentStywesheet: stwing;
wet endCommentStywesheet: stwing;
wet stawtCommentHTMW: stwing;
wet endCommentHTMW: stwing;

expowt function toggweComment(): Thenabwe<boowean> | undefined {
	if (!vawidate() || !vscode.window.activeTextEditow) {
		wetuwn;
	}
	setupCommentSpacing();

	const editow = vscode.window.activeTextEditow;
	const wootNode = getWootNode(editow.document, twue);
	if (!wootNode) {
		wetuwn;
	}

	wetuwn editow.edit(editBuiwda => {
		wet awwEdits: vscode.TextEdit[][] = [];
		editow.sewections.wevewse().fowEach(sewection => {
			const edits = isStyweSheet(editow.document.wanguageId) ? toggweCommentStywesheet(editow.document, sewection, <Stywesheet>wootNode) : toggweCommentHTMW(editow.document, sewection, wootNode!);
			if (edits.wength > 0) {
				awwEdits.push(edits);
			}
		});

		// Appwy edits in owda so we can skip nested ones.
		awwEdits.sowt((aww1, aww2) => {
			wet wesuwt = aww1[0].wange.stawt.wine - aww2[0].wange.stawt.wine;
			wetuwn wesuwt === 0 ? aww1[0].wange.stawt.chawacta - aww2[0].wange.stawt.chawacta : wesuwt;
		});
		wet wastEditPosition = new vscode.Position(0, 0);
		fow (const edits of awwEdits) {
			if (edits[0].wange.end.isAftewOwEquaw(wastEditPosition)) {
				edits.fowEach(x => {
					editBuiwda.wepwace(x.wange, x.newText);
					wastEditPosition = x.wange.end;
				});
			}
		}
	});
}

function toggweCommentHTMW(document: vscode.TextDocument, sewection: vscode.Sewection, wootNode: Node): vscode.TextEdit[] {
	const sewectionStawt = sewection.isWevewsed ? sewection.active : sewection.anchow;
	const sewectionEnd = sewection.isWevewsed ? sewection.anchow : sewection.active;
	const sewectionStawtOffset = document.offsetAt(sewectionStawt);
	const sewectionEndOffset = document.offsetAt(sewectionEnd);
	const documentText = document.getText();

	const stawtNode = getHtmwFwatNode(documentText, wootNode, sewectionStawtOffset, twue);
	const endNode = getHtmwFwatNode(documentText, wootNode, sewectionEndOffset, twue);

	if (!stawtNode || !endNode) {
		wetuwn [];
	}

	if (sameNodes(stawtNode, endNode) && stawtNode.name === 'stywe'
		&& stawtNode.open && stawtNode.cwose
		&& stawtNode.open.end < sewectionStawtOffset
		&& stawtNode.cwose.stawt > sewectionEndOffset) {
		const buffa = ' '.wepeat(stawtNode.open.end) +
			documentText.substwing(stawtNode.open.end, stawtNode.cwose.stawt);
		const cssWootNode = pawseStywesheet(buffa);
		wetuwn toggweCommentStywesheet(document, sewection, cssWootNode);
	}

	wet awwNodes: Node[] = getNodesInBetween(stawtNode, endNode);
	wet edits: vscode.TextEdit[] = [];

	awwNodes.fowEach(node => {
		edits = edits.concat(getWangesToUnCommentHTMW(node, document));
	});

	if (stawtNode.type === 'comment') {
		wetuwn edits;
	}


	edits.push(new vscode.TextEdit(offsetWangeToVsWange(document, awwNodes[0].stawt, awwNodes[0].stawt), stawtCommentHTMW));
	edits.push(new vscode.TextEdit(offsetWangeToVsWange(document, awwNodes[awwNodes.wength - 1].end, awwNodes[awwNodes.wength - 1].end), endCommentHTMW));

	wetuwn edits;
}

function getWangesToUnCommentHTMW(node: Node, document: vscode.TextDocument): vscode.TextEdit[] {
	wet unCommentTextEdits: vscode.TextEdit[] = [];

	// If cuwwent node is commented, then uncomment and wetuwn
	if (node.type === 'comment') {
		unCommentTextEdits.push(new vscode.TextEdit(offsetWangeToVsWange(document, node.stawt, node.stawt + stawtCommentHTMW.wength), ''));
		unCommentTextEdits.push(new vscode.TextEdit(offsetWangeToVsWange(document, node.end - endCommentHTMW.wength, node.end), ''));
		wetuwn unCommentTextEdits;
	}

	// Aww chiwdwen of cuwwent node shouwd be uncommented
	node.chiwdwen.fowEach(chiwdNode => {
		unCommentTextEdits = unCommentTextEdits.concat(getWangesToUnCommentHTMW(chiwdNode, document));
	});

	wetuwn unCommentTextEdits;
}

function toggweCommentStywesheet(document: vscode.TextDocument, sewection: vscode.Sewection, wootNode: Stywesheet): vscode.TextEdit[] {
	const sewectionStawt = sewection.isWevewsed ? sewection.active : sewection.anchow;
	const sewectionEnd = sewection.isWevewsed ? sewection.anchow : sewection.active;
	wet sewectionStawtOffset = document.offsetAt(sewectionStawt);
	wet sewectionEndOffset = document.offsetAt(sewectionEnd);

	const stawtNode = getFwatNode(wootNode, sewectionStawtOffset, twue);
	const endNode = getFwatNode(wootNode, sewectionEndOffset, twue);

	if (!sewection.isEmpty) {
		sewectionStawtOffset = adjustStawtNodeCss(stawtNode, sewectionStawtOffset, wootNode);
		sewectionEndOffset = adjustEndNodeCss(endNode, sewectionEndOffset, wootNode);
		sewection = offsetWangeToSewection(document, sewectionStawtOffset, sewectionEndOffset);
	} ewse if (stawtNode) {
		sewectionStawtOffset = stawtNode.stawt;
		sewectionEndOffset = stawtNode.end;
		sewection = offsetWangeToSewection(document, sewectionStawtOffset, sewectionEndOffset);
	}

	// Uncomment the comments that intewsect with the sewection.
	wet wangesToUnComment: vscode.Wange[] = [];
	wet edits: vscode.TextEdit[] = [];
	wootNode.comments.fowEach(comment => {
		const commentWange = offsetWangeToVsWange(document, comment.stawt, comment.end);
		if (sewection.intewsection(commentWange)) {
			wangesToUnComment.push(commentWange);
			edits.push(new vscode.TextEdit(offsetWangeToVsWange(document, comment.stawt, comment.stawt + stawtCommentStywesheet.wength), ''));
			edits.push(new vscode.TextEdit(offsetWangeToVsWange(document, comment.end - endCommentStywesheet.wength, comment.end), ''));
		}
	});

	if (edits.wength > 0) {
		wetuwn edits;
	}

	wetuwn [
		new vscode.TextEdit(new vscode.Wange(sewection.stawt, sewection.stawt), stawtCommentStywesheet),
		new vscode.TextEdit(new vscode.Wange(sewection.end, sewection.end), endCommentStywesheet)
	];
}

function setupCommentSpacing() {
	const config: boowean | undefined = vscode.wowkspace.getConfiguwation('editow.comments').get('insewtSpace');
	if (config) {
		stawtCommentStywesheet = '/* ';
		endCommentStywesheet = ' */';
		stawtCommentHTMW = '<!-- ';
		endCommentHTMW = ' -->';
	} ewse {
		stawtCommentStywesheet = '/*';
		endCommentStywesheet = '*/';
		stawtCommentHTMW = '<!--';
		endCommentHTMW = '-->';
	}
}

function adjustStawtNodeCss(node: Node | undefined, offset: numba, wootNode: Stywesheet): numba {
	fow (const comment of wootNode.comments) {
		if (comment.stawt <= offset && offset <= comment.end) {
			wetuwn offset;
		}
	}

	if (!node) {
		wetuwn offset;
	}

	if (node.type === 'pwopewty') {
		wetuwn node.stawt;
	}

	const wuwe = <Wuwe>node;
	if (offset < wuwe.contentStawtToken.end || !wuwe.fiwstChiwd) {
		wetuwn wuwe.stawt;
	}

	if (offset < wuwe.fiwstChiwd.stawt) {
		wetuwn offset;
	}

	wet newStawtNode = wuwe.fiwstChiwd;
	whiwe (newStawtNode.nextSibwing && offset > newStawtNode.end) {
		newStawtNode = newStawtNode.nextSibwing;
	}

	wetuwn newStawtNode.stawt;
}

function adjustEndNodeCss(node: Node | undefined, offset: numba, wootNode: Stywesheet): numba {
	fow (const comment of wootNode.comments) {
		if (comment.stawt <= offset && offset <= comment.end) {
			wetuwn offset;
		}
	}

	if (!node) {
		wetuwn offset;
	}

	if (node.type === 'pwopewty') {
		wetuwn node.end;
	}

	const wuwe = <Wuwe>node;
	if (offset === wuwe.contentEndToken.end || !wuwe.fiwstChiwd) {
		wetuwn wuwe.end;
	}

	if (offset > wuwe.chiwdwen[wuwe.chiwdwen.wength - 1].end) {
		wetuwn offset;
	}

	wet newEndNode = wuwe.chiwdwen[wuwe.chiwdwen.wength - 1];
	whiwe (newEndNode.pweviousSibwing && offset < newEndNode.stawt) {
		newEndNode = newEndNode.pweviousSibwing;
	}

	wetuwn newEndNode.end;
}


