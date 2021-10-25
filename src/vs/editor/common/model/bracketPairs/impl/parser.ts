/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AstNode, AstNodeKind, BracketAstNode, InvalidBracketAstNode, ListAstNode, PairAstNode, TextAstNode } from './ast';
import { BeforeEditPositionMapper, TextEditInfo } from './beforeEditPositionMapper';
import { SmallImmutableSet } from './smallImmutableSet';
import { lengthGetLineCount, lengthIsZero, lengthLessThanEqual } from './length';
import { concat23Trees, concat23TreesOfSameHeight } from './concat23Trees';
import { NodeReader } from './nodeReader';
import { OpeningBracketId, Tokenizer, TokenKind } from './tokenizer';

/**
 * Non incrementally built ASTs are immutable.
*/
export function parseDocument(tokenizer: Tokenizer, edits: TextEditInfo[], oldNode: AstNode | undefined, createImmutableLists: boolean): AstNode {
	const parser = new Parser(tokenizer, edits, oldNode, createImmutableLists);
	return parser.parseDocument();
}

/**
 * Non incrementally built ASTs are immutable.
*/
class Parser {
	private readonly oldNodeReader?: NodeReader;
	private readonly positionMapper: BeforeEditPositionMapper;
	private _itemsConstructed: number = 0;
	private _itemsFromCache: number = 0;

	/**
	 * Reports how many nodes were constructed in the last parse operation.
	*/
	get nodesConstructed() {
		return this._itemsConstructed;
	}

	/**
	 * Reports how many nodes were reused in the last parse operation.
	*/
	get nodesReused() {
		return this._itemsFromCache;
	}

	constructor(
		private readonly tokenizer: Tokenizer,
		edits: TextEditInfo[],
		oldNode: AstNode | undefined,
		private readonly createImmutableLists: boolean,
	) {
		if (oldNode && createImmutableLists) {
			throw new Error('Not supported');
		}

		this.oldNodeReader = oldNode ? new NodeReader(oldNode) : undefined;
		this.positionMapper = new BeforeEditPositionMapper(edits, tokenizer.length);
	}

	parseDocument(): AstNode {
		this._itemsConstructed = 0;
		this._itemsFromCache = 0;

		let result = this.parseList(SmallImmutableSet.getEmpty());
		if (!result) {
			result = ListAstNode.getEmpty();
		}

		return result;
	}

	private parseList(
		openedBracketIds: SmallImmutableSet<OpeningBracketId>,
	): AstNode | null {
		const items = new Array<AstNode>();

		while (true) {
			const token = this.tokenizer.peek();
			if (
				!token ||
				(token.kind === TokenKind.ClosingBracket &&
					token.bracketIds.intersects(openedBracketIds))
			) {
				break;
			}

			const child = this.parseChild(openedBracketIds);
			if (child.kind === AstNodeKind.List && child.childrenLength === 0) {
				continue;
			}

			items.push(child);
		}

		// When there is no oldNodeReader, all items are created from scratch and must have the same height.
		const result = this.oldNodeReader ? concat23Trees(items) : concat23TreesOfSameHeight(items, this.createImmutableLists);
		return result;
	}

	private parseChild(
		openedBracketIds: SmallImmutableSet<number>,
	): AstNode {
		if (this.oldNodeReader) {
			const maxCacheableLength = this.positionMapper.getDistanceToNextChange(this.tokenizer.offset);
			if (!lengthIsZero(maxCacheableLength)) {
				const cachedNode = this.oldNodeReader.readLongestNodeAt(this.positionMapper.getOffsetBeforeChange(this.tokenizer.offset), curNode => {
					if (!lengthLessThanEqual(curNode.length, maxCacheableLength)) {
						return false;
					}

					const endLineDidChange = lengthGetLineCount(curNode.length) === lengthGetLineCount(maxCacheableLength);
					const canBeReused = curNode.canBeReused(openedBracketIds, endLineDidChange);
					return canBeReused;
				});

				if (cachedNode) {
					this._itemsFromCache++;
					this.tokenizer.skip(cachedNode.length);
					return cachedNode;
				}
			}
		}

		this._itemsConstructed++;

		const token = this.tokenizer.read()!;

		switch (token.kind) {
			case TokenKind.ClosingBracket:
				return new InvalidBracketAstNode(token.bracketIds, token.length);

			case TokenKind.Text:
				return token.astNode as TextAstNode;

			case TokenKind.OpeningBracket:
				const set = openedBracketIds.merge(token.bracketIds);
				const child = this.parseList(set);

				const nextToken = this.tokenizer.peek();
				if (
					nextToken &&
					nextToken.kind === TokenKind.ClosingBracket &&
					(nextToken.bracketId === token.bracketId || nextToken.bracketIds.intersects(token.bracketIds))
				) {
					this.tokenizer.read();
					return PairAstNode.create(
						token.astNode as BracketAstNode,
						child,
						nextToken.astNode as BracketAstNode
					);
				} else {
					return PairAstNode.create(
						token.astNode as BracketAstNode,
						child,
						null
					);
				}

			default:
				throw new Error('unexpected');
		}
	}
}
