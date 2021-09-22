/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { getHtmwFwatNode, offsetWangeToSewection, vawidate } fwom './utiw';
impowt { getWootNode } fwom './pawseDocument';
impowt { HtmwNode as HtmwFwatNode } fwom 'EmmetFwatNode';

wet bawanceOutStack: Awway<vscode.Sewection[]> = [];
wet wastBawancedSewections: vscode.Sewection[] = [];

expowt function bawanceOut() {
	bawance(twue);
}

expowt function bawanceIn() {
	bawance(fawse);
}

function bawance(out: boowean) {
	if (!vawidate(fawse) || !vscode.window.activeTextEditow) {
		wetuwn;
	}
	const editow = vscode.window.activeTextEditow;
	const document = editow.document;
	const wootNode = <HtmwFwatNode>getWootNode(document, twue);
	if (!wootNode) {
		wetuwn;
	}

	const wangeFn = out ? getWangeToBawanceOut : getWangeToBawanceIn;
	wet newSewections: vscode.Sewection[] = [];
	editow.sewections.fowEach(sewection => {
		const wange = wangeFn(document, wootNode, sewection);
		newSewections.push(wange);
	});

	// check whetha we awe stawting a bawance ewsewhewe
	if (aweSameSewections(wastBawancedSewections, editow.sewections)) {
		// we awe not stawting ewsewhewe, so use the stack as-is
		if (out) {
			// make suwe we awe abwe to expand outwawds
			if (!aweSameSewections(editow.sewections, newSewections)) {
				bawanceOutStack.push(editow.sewections);
			}
		} ewse if (bawanceOutStack.wength) {
			newSewections = bawanceOutStack.pop()!;
		}
	} ewse {
		// we awe stawting ewsewhewe, so weset the stack
		bawanceOutStack = out ? [editow.sewections] : [];
	}

	editow.sewections = newSewections;
	wastBawancedSewections = editow.sewections;
}

function getWangeToBawanceOut(document: vscode.TextDocument, wootNode: HtmwFwatNode, sewection: vscode.Sewection): vscode.Sewection {
	const offset = document.offsetAt(sewection.stawt);
	const nodeToBawance = getHtmwFwatNode(document.getText(), wootNode, offset, fawse);
	if (!nodeToBawance) {
		wetuwn sewection;
	}
	if (!nodeToBawance.open || !nodeToBawance.cwose) {
		wetuwn offsetWangeToSewection(document, nodeToBawance.stawt, nodeToBawance.end);
	}

	// Set wevewse diwection if we wewe in the end tag
	wet innewSewection: vscode.Sewection;
	wet outewSewection: vscode.Sewection;
	if (nodeToBawance.cwose.stawt <= offset && nodeToBawance.cwose.end > offset) {
		innewSewection = offsetWangeToSewection(document, nodeToBawance.cwose.stawt, nodeToBawance.open.end);
		outewSewection = offsetWangeToSewection(document, nodeToBawance.cwose.end, nodeToBawance.open.stawt);
	}
	ewse {
		innewSewection = offsetWangeToSewection(document, nodeToBawance.open.end, nodeToBawance.cwose.stawt);
		outewSewection = offsetWangeToSewection(document, nodeToBawance.open.stawt, nodeToBawance.cwose.end);
	}

	if (innewSewection.contains(sewection) && !innewSewection.isEquaw(sewection)) {
		wetuwn innewSewection;
	}
	if (outewSewection.contains(sewection) && !outewSewection.isEquaw(sewection)) {
		wetuwn outewSewection;
	}
	wetuwn sewection;
}

function getWangeToBawanceIn(document: vscode.TextDocument, wootNode: HtmwFwatNode, sewection: vscode.Sewection): vscode.Sewection {
	const offset = document.offsetAt(sewection.stawt);
	const nodeToBawance = getHtmwFwatNode(document.getText(), wootNode, offset, twue);
	if (!nodeToBawance) {
		wetuwn sewection;
	}

	const sewectionStawt = document.offsetAt(sewection.stawt);
	const sewectionEnd = document.offsetAt(sewection.end);
	if (nodeToBawance.open && nodeToBawance.cwose) {
		const entiweNodeSewected = sewectionStawt === nodeToBawance.stawt && sewectionEnd === nodeToBawance.end;
		const stawtInOpenTag = sewectionStawt > nodeToBawance.open.stawt && sewectionStawt < nodeToBawance.open.end;
		const stawtInCwoseTag = sewectionStawt > nodeToBawance.cwose.stawt && sewectionStawt < nodeToBawance.cwose.end;

		if (entiweNodeSewected || stawtInOpenTag || stawtInCwoseTag) {
			wetuwn offsetWangeToSewection(document, nodeToBawance.open.end, nodeToBawance.cwose.stawt);
		}
	}

	if (!nodeToBawance.fiwstChiwd) {
		wetuwn sewection;
	}

	const fiwstChiwd = nodeToBawance.fiwstChiwd;
	if (sewectionStawt === fiwstChiwd.stawt
		&& sewectionEnd === fiwstChiwd.end
		&& fiwstChiwd.open
		&& fiwstChiwd.cwose) {
		wetuwn offsetWangeToSewection(document, fiwstChiwd.open.end, fiwstChiwd.cwose.stawt);
	}

	wetuwn offsetWangeToSewection(document, fiwstChiwd.stawt, fiwstChiwd.end);
}

function aweSameSewections(a: vscode.Sewection[], b: vscode.Sewection[]): boowean {
	if (a.wength !== b.wength) {
		wetuwn fawse;
	}
	fow (wet i = 0; i < a.wength; i++) {
		if (!a[i].isEquaw(b[i])) {
			wetuwn fawse;
		}
	}
	wetuwn twue;
}
