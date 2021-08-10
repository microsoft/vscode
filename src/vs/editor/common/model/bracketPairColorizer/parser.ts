/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AstNode, AstNodeKind, BracketAstNode, InvalidBracketAstNode, ListAstNode, PairAstNode, TextAstNode } from './ast';
import { BeforeEditPositionMapper, TextEditInfo } from './beforeEditPositionMapper';
import { DenseKeyProvider, SmallImmutableSet } from './smallImmutableSet';
import { lengthGetLineCount, lengthIsZero, lengthLessThanEqual } from './length';
import { concat23Trees } from './concat23Trees';
import { NodeReader } from './nodeReader';
import { Tokenizer, TokenKind } from './tokenizer';

export function parseDocument(tokenizer: Tokenizer, edits: TextEditInfo[], oldNode: AstNode | undefined, denseKeyProvider: DenseKeyProvider<number>): AstNode {
	const parser = new Parser(tokenizer, edits, oldNode, denseKeyProvider);
	return parser.parseDocument();
}

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
		private readonly denseKeyProvider: DenseKeyProvider<number>,
	) {
		this.oldNodeReader = oldNode ? new NodeReader(oldNode) : undefined;
		this.positionMapper = new BeforeEditPositionMapper(edits, tokenizer.length);
	}

	parseDocument(): AstNode {
		this._itemsConstructed = 0;
		this._itemsFromCache = 0;

		let result = this.parseList(SmallImmutableSet.getEmpty());
		if (!result) {
			result = ListAstNode.create([]);
		}

		return result;
	}

	private parseList(
		expectedClosingCategories: SmallImmutableSet<number>,
	): AstNode | null {
		const items = new Array<AstNode>();

		while (true) {
			const token = this.tokenizer.peek();
			if (
				!token ||
				(token.kind === TokenKind.ClosingBracket &&
					expectedClosingCategories.has(token.category, this.denseKeyProvider))
			) {
				break;
			}

			const child = this.parseChild(expectedClosingCategories);
			if (child.kind === AstNodeKind.List && child.children.length === 0) {
				continue;
			}

			items.push(child);
		}

		const result = concat23Trees(items);
		return result;
	}

	private parseChild(
		expectingClosingCategories: SmallImmutableSet<number>,
	): AstNode {
		if (this.oldNodeReader) {
			const maxCacheableLength = this.positionMapper.getDistanceToNextChange(this.tokenizer.offset);
			if (!lengthIsZero(maxCacheableLength)) {
				const cachedNode = this.oldNodeReader.readLongestNodeAt(this.positionMapper.getOffsetBeforeChange(this.tokenizer.offset), curNode => {
					if (!lengthLessThanEqual(curNode.length, maxCacheableLength)) {
						return false;
					}

					const endLineDidChange = lengthGetLineCount(curNode.length) === lengthGetLineCount(maxCacheableLength);
					const canBeReused = curNode.canBeReused(expectingClosingCategories, endLineDidChange);
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
				return new InvalidBracketAstNode(token.category, token.length, this.denseKeyProvider);

			case TokenKind.Text:
				return token.astNode as TextAstNode;

			case TokenKind.OpeningBracket:
				const set = expectingClosingCategories.add(token.category, this.denseKeyProvider);
				const child = this.parseList(set);

				const nextToken = this.tokenizer.peek();
				if (
					nextToken &&
					nextToken.kind === TokenKind.ClosingBracket &&
					nextToken.category === token.category
				) {
					this.tokenizer.read();
					return PairAstNode.create(
						token.category,
						token.astNode as BracketAstNode,
						child,
						nextToken.astNode as BracketAstNode
					);
				} else {
					return PairAstNode.create(
						token.category,
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
