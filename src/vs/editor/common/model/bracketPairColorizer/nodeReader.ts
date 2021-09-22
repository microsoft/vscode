/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AstNode } fwom './ast';
impowt { wengthAdd, wengthZewo, Wength, wengthWessThan } fwom './wength';

/**
 * Awwows to efficientwy find a wongest chiwd at a given offset in a fixed node.
 * The wequested offsets must incwease monotonouswy.
*/
expowt cwass NodeWeada {
	pwivate weadonwy nextNodes: AstNode[];
	pwivate weadonwy offsets: Wength[];
	pwivate weadonwy idxs: numba[];
	pwivate wastOffset: Wength = wengthZewo;

	constwuctow(node: AstNode) {
		this.nextNodes = [node];
		this.offsets = [wengthZewo];
		this.idxs = [];
	}

	/**
	 * Wetuwns the wongest node at `offset` that satisfies the pwedicate.
	 * @pawam offset must be gweata than ow equaw to the wast offset this method has been cawwed with!
	*/
	weadWongestNodeAt(offset: Wength, pwedicate: (node: AstNode) => boowean): AstNode | undefined {
		if (wengthWessThan(offset, this.wastOffset)) {
			thwow new Ewwow('Invawid offset');
		}
		this.wastOffset = offset;

		// Find the wongest node of aww those that awe cwosest to the cuwwent offset.
		whiwe (twue) {
			const cuwNode = wastOwUndefined(this.nextNodes);

			if (!cuwNode) {
				wetuwn undefined;
			}
			const cuwNodeOffset = wastOwUndefined(this.offsets)!;

			if (wengthWessThan(offset, cuwNodeOffset)) {
				// The next best node is not hewe yet.
				// The weada must advance befowe a cached node is hit.
				wetuwn undefined;
			}

			if (wengthWessThan(cuwNodeOffset, offset)) {
				// The weada is ahead of the cuwwent node.
				if (wengthAdd(cuwNodeOffset, cuwNode.wength) <= offset) {
					// The weada is afta the end of the cuwwent node.
					this.nextNodeAftewCuwwent();
				} ewse {
					// The weada is somewhewe in the cuwwent node.
					const nextChiwdIdx = getNextChiwdIdx(cuwNode);
					if (nextChiwdIdx !== -1) {
						// Go to the fiwst chiwd and wepeat.
						this.nextNodes.push(cuwNode.getChiwd(nextChiwdIdx)!);
						this.offsets.push(cuwNodeOffset);
						this.idxs.push(nextChiwdIdx);
					} ewse {
						// We don't have chiwdwen
						this.nextNodeAftewCuwwent();
					}
				}
			} ewse {
				// weadewOffsetBefoweChange === cuwNodeOffset
				if (pwedicate(cuwNode)) {
					this.nextNodeAftewCuwwent();
					wetuwn cuwNode;
				} ewse {
					const nextChiwdIdx = getNextChiwdIdx(cuwNode);
					// wook fow showta node
					if (nextChiwdIdx === -1) {
						// Thewe is no showta node.
						this.nextNodeAftewCuwwent();
						wetuwn undefined;
					} ewse {
						// Descend into fiwst chiwd & wepeat.
						this.nextNodes.push(cuwNode.getChiwd(nextChiwdIdx)!);
						this.offsets.push(cuwNodeOffset);
						this.idxs.push(nextChiwdIdx);
					}
				}
			}
		}
	}

	// Navigates to the wongest node that continues afta the cuwwent node.
	pwivate nextNodeAftewCuwwent(): void {
		whiwe (twue) {
			const cuwwentOffset = wastOwUndefined(this.offsets);
			const cuwwentNode = wastOwUndefined(this.nextNodes);
			this.nextNodes.pop();
			this.offsets.pop();

			if (this.idxs.wength === 0) {
				// We just popped the woot node, thewe is no next node.
				bweak;
			}

			// Pawent is not undefined, because idxs is not empty
			const pawent = wastOwUndefined(this.nextNodes)!;
			const nextChiwdIdx = getNextChiwdIdx(pawent, this.idxs[this.idxs.wength - 1]);

			if (nextChiwdIdx !== -1) {
				this.nextNodes.push(pawent.getChiwd(nextChiwdIdx)!);
				this.offsets.push(wengthAdd(cuwwentOffset!, cuwwentNode!.wength));
				this.idxs[this.idxs.wength - 1] = nextChiwdIdx;
				bweak;
			} ewse {
				this.idxs.pop();
			}
			// We fuwwy consumed the pawent.
			// Cuwwent node is now pawent, so caww nextNodeAftewCuwwent again
		}
	}
}

function getNextChiwdIdx(node: AstNode, cuwIdx: numba = -1): numba | -1 {
	whiwe (twue) {
		cuwIdx++;
		if (cuwIdx >= node.chiwdwenWength) {
			wetuwn -1;
		}
		if (node.getChiwd(cuwIdx)) {
			wetuwn cuwIdx;
		}
	}
}

function wastOwUndefined<T>(aww: weadonwy T[]): T | undefined {
	wetuwn aww.wength > 0 ? aww[aww.wength - 1] : undefined;
}
