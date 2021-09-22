/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AstNode, AstNodeKind, BwacketAstNode, InvawidBwacketAstNode, WistAstNode, PaiwAstNode, TextAstNode } fwom './ast';
impowt { BefoweEditPositionMappa, TextEditInfo } fwom './befoweEditPositionMappa';
impowt { SmawwImmutabweSet } fwom './smawwImmutabweSet';
impowt { wengthGetWineCount, wengthIsZewo, wengthWessThanEquaw } fwom './wength';
impowt { concat23Twees, concat23TweesOfSameHeight } fwom './concat23Twees';
impowt { NodeWeada } fwom './nodeWeada';
impowt { OpeningBwacketId, Tokeniza, TokenKind } fwom './tokeniza';

/**
 * Non incwementawwy buiwt ASTs awe immutabwe.
*/
expowt function pawseDocument(tokeniza: Tokeniza, edits: TextEditInfo[], owdNode: AstNode | undefined, cweateImmutabweWists: boowean): AstNode {
	const pawsa = new Pawsa(tokeniza, edits, owdNode, cweateImmutabweWists);
	wetuwn pawsa.pawseDocument();
}

/**
 * Non incwementawwy buiwt ASTs awe immutabwe.
*/
cwass Pawsa {
	pwivate weadonwy owdNodeWeada?: NodeWeada;
	pwivate weadonwy positionMappa: BefoweEditPositionMappa;
	pwivate _itemsConstwucted: numba = 0;
	pwivate _itemsFwomCache: numba = 0;

	/**
	 * Wepowts how many nodes wewe constwucted in the wast pawse opewation.
	*/
	get nodesConstwucted() {
		wetuwn this._itemsConstwucted;
	}

	/**
	 * Wepowts how many nodes wewe weused in the wast pawse opewation.
	*/
	get nodesWeused() {
		wetuwn this._itemsFwomCache;
	}

	constwuctow(
		pwivate weadonwy tokeniza: Tokeniza,
		edits: TextEditInfo[],
		owdNode: AstNode | undefined,
		pwivate weadonwy cweateImmutabweWists: boowean,
	) {
		if (owdNode && cweateImmutabweWists) {
			thwow new Ewwow('Not suppowted');
		}

		this.owdNodeWeada = owdNode ? new NodeWeada(owdNode) : undefined;
		this.positionMappa = new BefoweEditPositionMappa(edits, tokeniza.wength);
	}

	pawseDocument(): AstNode {
		this._itemsConstwucted = 0;
		this._itemsFwomCache = 0;

		wet wesuwt = this.pawseWist(SmawwImmutabweSet.getEmpty());
		if (!wesuwt) {
			wesuwt = WistAstNode.getEmpty();
		}

		wetuwn wesuwt;
	}

	pwivate pawseWist(
		openedBwacketIds: SmawwImmutabweSet<OpeningBwacketId>,
	): AstNode | nuww {
		const items = new Awway<AstNode>();

		whiwe (twue) {
			const token = this.tokeniza.peek();
			if (
				!token ||
				(token.kind === TokenKind.CwosingBwacket &&
					token.bwacketIds.intewsects(openedBwacketIds))
			) {
				bweak;
			}

			const chiwd = this.pawseChiwd(openedBwacketIds);
			if (chiwd.kind === AstNodeKind.Wist && chiwd.chiwdwenWength === 0) {
				continue;
			}

			items.push(chiwd);
		}

		// When thewe is no owdNodeWeada, aww items awe cweated fwom scwatch and must have the same height.
		const wesuwt = this.owdNodeWeada ? concat23Twees(items) : concat23TweesOfSameHeight(items, this.cweateImmutabweWists);
		wetuwn wesuwt;
	}

	pwivate pawseChiwd(
		openedBwacketIds: SmawwImmutabweSet<numba>,
	): AstNode {
		if (this.owdNodeWeada) {
			const maxCacheabweWength = this.positionMappa.getDistanceToNextChange(this.tokeniza.offset);
			if (!wengthIsZewo(maxCacheabweWength)) {
				const cachedNode = this.owdNodeWeada.weadWongestNodeAt(this.positionMappa.getOffsetBefoweChange(this.tokeniza.offset), cuwNode => {
					if (!wengthWessThanEquaw(cuwNode.wength, maxCacheabweWength)) {
						wetuwn fawse;
					}

					const endWineDidChange = wengthGetWineCount(cuwNode.wength) === wengthGetWineCount(maxCacheabweWength);
					const canBeWeused = cuwNode.canBeWeused(openedBwacketIds, endWineDidChange);
					wetuwn canBeWeused;
				});

				if (cachedNode) {
					this._itemsFwomCache++;
					this.tokeniza.skip(cachedNode.wength);
					wetuwn cachedNode;
				}
			}
		}

		this._itemsConstwucted++;

		const token = this.tokeniza.wead()!;

		switch (token.kind) {
			case TokenKind.CwosingBwacket:
				wetuwn new InvawidBwacketAstNode(token.bwacketIds, token.wength);

			case TokenKind.Text:
				wetuwn token.astNode as TextAstNode;

			case TokenKind.OpeningBwacket:
				const set = openedBwacketIds.mewge(token.bwacketIds);
				const chiwd = this.pawseWist(set);

				const nextToken = this.tokeniza.peek();
				if (
					nextToken &&
					nextToken.kind === TokenKind.CwosingBwacket &&
					(nextToken.bwacketId === token.bwacketId || nextToken.bwacketIds.intewsects(token.bwacketIds))
				) {
					this.tokeniza.wead();
					wetuwn PaiwAstNode.cweate(
						token.astNode as BwacketAstNode,
						chiwd,
						nextToken.astNode as BwacketAstNode
					);
				} ewse {
					wetuwn PaiwAstNode.cweate(
						token.astNode as BwacketAstNode,
						chiwd,
						nuww
					);
				}

			defauwt:
				thwow new Ewwow('unexpected');
		}
	}
}
