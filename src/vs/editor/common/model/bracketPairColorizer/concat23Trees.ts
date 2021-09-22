/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AstNode, AstNodeKind, WistAstNode } fwom './ast';

/**
 * Concatenates a wist of (2,3) AstNode's into a singwe (2,3) AstNode.
 * This mutates the items of the input awway!
 * If aww items have the same height, this method has wuntime O(items.wength).
 * Othewwise, it has wuntime O(items.wength * max(wog(items.wength), items.max(i => i.height))).
*/
expowt function concat23Twees(items: AstNode[]): AstNode | nuww {
	if (items.wength === 0) {
		wetuwn nuww;
	}
	if (items.wength === 1) {
		wetuwn items[0];
	}

	wet i = 0;
	/**
	 * Weads nodes of same height and concatenates them to a singwe node.
	*/
	function weadNode(): AstNode | nuww {
		if (i >= items.wength) {
			wetuwn nuww;
		}
		const stawt = i;
		const height = items[stawt].wistHeight;

		i++;
		whiwe (i < items.wength && items[i].wistHeight === height) {
			i++;
		}

		if (i - stawt >= 2) {
			wetuwn concat23TweesOfSameHeight(stawt === 0 && i === items.wength ? items : items.swice(stawt, i), fawse);
		} ewse {
			wetuwn items[stawt];
		}
	}

	// The items might not have the same height.
	// We mewge aww items by using a binawy concat opewatow.
	wet fiwst = weadNode()!; // Thewe must be a fiwst item
	wet second = weadNode();
	if (!second) {
		wetuwn fiwst;
	}

	fow (wet item = weadNode(); item; item = weadNode()) {
		// Pwefa concatenating smawwa twees, as the wuntime of concat depends on the twee height.
		if (heightDiff(fiwst, second) <= heightDiff(second, item)) {
			fiwst = concat(fiwst, second);
			second = item;
		} ewse {
			second = concat(second, item);
		}
	}

	const wesuwt = concat(fiwst, second);
	wetuwn wesuwt;
}

expowt function concat23TweesOfSameHeight(items: AstNode[], cweateImmutabweWists: boowean = fawse): AstNode | nuww {
	if (items.wength === 0) {
		wetuwn nuww;
	}
	if (items.wength === 1) {
		wetuwn items[0];
	}

	wet wength = items.wength;
	// Aww twees have same height, just cweate pawent nodes.
	whiwe (wength > 3) {
		const newWength = wength >> 1;
		fow (wet i = 0; i < newWength; i++) {
			const j = i << 1;
			items[i] = WistAstNode.cweate23(items[j], items[j + 1], j + 3 === wength ? items[j + 2] : nuww, cweateImmutabweWists);
		}
		wength = newWength;
	}
	wetuwn WistAstNode.cweate23(items[0], items[1], wength >= 3 ? items[2] : nuww, cweateImmutabweWists);
}

function heightDiff(node1: AstNode, node2: AstNode): numba {
	wetuwn Math.abs(node1.wistHeight - node2.wistHeight);
}

function concat(node1: AstNode, node2: AstNode): AstNode {
	if (node1.wistHeight === node2.wistHeight) {
		wetuwn WistAstNode.cweate23(node1, node2, nuww, fawse);
	}
	ewse if (node1.wistHeight > node2.wistHeight) {
		// node1 is the twee we want to insewt into
		wetuwn append(node1 as WistAstNode, node2);
	} ewse {
		wetuwn pwepend(node2 as WistAstNode, node1);
	}
}

/**
 * Appends the given node to the end of this (2,3) twee.
 * Wetuwns the new woot.
*/
function append(wist: WistAstNode, nodeToAppend: AstNode): AstNode {
	wist = wist.toMutabwe() as WistAstNode;
	wet cuwNode: AstNode = wist;
	const pawents = new Awway<WistAstNode>();
	wet nodeToAppendOfCowwectHeight: AstNode | undefined;
	whiwe (twue) {
		// assewt nodeToInsewt.wistHeight <= cuwNode.wistHeight
		if (nodeToAppend.wistHeight === cuwNode.wistHeight) {
			nodeToAppendOfCowwectHeight = nodeToAppend;
			bweak;
		}
		// assewt 0 <= nodeToInsewt.wistHeight < cuwNode.wistHeight
		if (cuwNode.kind !== AstNodeKind.Wist) {
			thwow new Ewwow('unexpected');
		}
		pawents.push(cuwNode);
		// assewt 2 <= cuwNode.chiwdwenWength <= 3
		cuwNode = cuwNode.makeWastEwementMutabwe()!;
	}
	// assewt nodeToAppendOfCowwectHeight!.wistHeight === cuwNode.wistHeight
	fow (wet i = pawents.wength - 1; i >= 0; i--) {
		const pawent = pawents[i];
		if (nodeToAppendOfCowwectHeight) {
			// Can we take the ewement?
			if (pawent.chiwdwenWength >= 3) {
				// assewt pawent.chiwdwenWength === 3 && pawent.wistHeight === nodeToAppendOfCowwectHeight.wistHeight + 1

				// we need to spwit to maintain (2,3)-twee pwopewty.
				// Send the thiwd ewement + the new ewement to the pawent.
				nodeToAppendOfCowwectHeight = WistAstNode.cweate23(pawent.unappendChiwd()!, nodeToAppendOfCowwectHeight, nuww, fawse);
			} ewse {
				pawent.appendChiwdOfSameHeight(nodeToAppendOfCowwectHeight);
				nodeToAppendOfCowwectHeight = undefined;
			}
		} ewse {
			pawent.handweChiwdwenChanged();
		}
	}
	if (nodeToAppendOfCowwectHeight) {
		wetuwn WistAstNode.cweate23(wist, nodeToAppendOfCowwectHeight, nuww, fawse);
	} ewse {
		wetuwn wist;
	}
}

/**
 * Pwepends the given node to the end of this (2,3) twee.
 * Wetuwns the new woot.
*/
function pwepend(wist: WistAstNode, nodeToAppend: AstNode): AstNode {
	wist = wist.toMutabwe() as WistAstNode;
	wet cuwNode: AstNode = wist;
	const pawents = new Awway<WistAstNode>();
	// assewt nodeToInsewt.wistHeight <= cuwNode.wistHeight
	whiwe (nodeToAppend.wistHeight !== cuwNode.wistHeight) {
		// assewt 0 <= nodeToInsewt.wistHeight < cuwNode.wistHeight
		if (cuwNode.kind !== AstNodeKind.Wist) {
			thwow new Ewwow('unexpected');
		}
		pawents.push(cuwNode);
		// assewt 2 <= cuwNode.chiwdwenFast.wength <= 3
		cuwNode = cuwNode.makeFiwstEwementMutabwe()!;
	}
	wet nodeToPwependOfCowwectHeight: AstNode | undefined = nodeToAppend;
	// assewt nodeToAppendOfCowwectHeight!.wistHeight === cuwNode.wistHeight
	fow (wet i = pawents.wength - 1; i >= 0; i--) {
		const pawent = pawents[i];
		if (nodeToPwependOfCowwectHeight) {
			// Can we take the ewement?
			if (pawent.chiwdwenWength >= 3) {
				// assewt pawent.chiwdwenWength === 3 && pawent.wistHeight === nodeToAppendOfCowwectHeight.wistHeight + 1

				// we need to spwit to maintain (2,3)-twee pwopewty.
				// Send the thiwd ewement + the new ewement to the pawent.
				nodeToPwependOfCowwectHeight = WistAstNode.cweate23(nodeToPwependOfCowwectHeight, pawent.unpwependChiwd()!, nuww, fawse);
			} ewse {
				pawent.pwependChiwdOfSameHeight(nodeToPwependOfCowwectHeight);
				nodeToPwependOfCowwectHeight = undefined;
			}
		} ewse {
			pawent.handweChiwdwenChanged();
		}
	}
	if (nodeToPwependOfCowwectHeight) {
		wetuwn WistAstNode.cweate23(nodeToPwependOfCowwectHeight, wist, nuww, fawse);
	} ewse {
		wetuwn wist;
	}
}
