/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { ITextModel } from '../model.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { RangeTreeLeafNode, TokenRangeTree } from './rangeTree.js';

export class StorableToken {
	constructor(readonly offsetStartInclusive: number, readonly offsetEndExclusive: number, readonly metadata: number) { }
	equals(other: unknown): boolean {
		return (
			this.offsetStartInclusive === (other as StorableToken).offsetStartInclusive
			&& this.offsetEndExclusive === (other as StorableToken).offsetEndExclusive
			&& this.metadata === (other as StorableToken).metadata
		);
	}
}

export interface ITreeSitterTokenizationStoreService {
	readonly _serviceBrand: undefined;
	getTokens(model: ITextModel, range: Range): Uint32Array | undefined;
	updateTokens(model: ITextModel, tokens: StorableToken[]): void;
	markForRefresh(model: ITextModel, range: Range): void;
	hasTokens(model: ITextModel, accurateForRange?: Range): boolean;
}

export const ITreeSitterTokenizationStoreService = createDecorator<ITreeSitterTokenizationStoreService>('treeSitterTokenizationStoreService');

interface TokenInformation {
	metadata: number;
	needsRefresh: boolean;
}

class TreeSitterTokenizationStoreService implements ITreeSitterTokenizationStoreService {
	readonly _serviceBrand: undefined;

	private readonly tokens = new Map<ITextModel, TokenRangeTree<TokenInformation>>();

	constructor() { }

	hasTokens(model: ITextModel, accurateForRange?: Range): boolean {
		const tree = this.tokens.get(model);
		if (!tree) {
			return false;
		}
		if (!accurateForRange) {
			return true;
		}

		let hasAccurate = true;
		tree.traverseInOrder(accurateForRange, (node) => {
			if (node.data.needsRefresh) {
				hasAccurate = false;
			}
			return true;
		});
		return hasAccurate;
	}

	getTokens(model: ITextModel, range: Range): Uint32Array | undefined {
		const tree = this.tokens.get(model);
		if (!tree) {
			return undefined;
		}
		const storableTokens: RangeTreeLeafNode<TokenInformation>[] = [];
		tree.traverseInOrder(range, (node) => {
			storableTokens.push(node);
		});
		const tokens: Uint32Array = new Uint32Array(storableTokens.length * 2);
		for (let i = 0; i < storableTokens.length; i++) {
			const position = model.getPositionAt(storableTokens[i].endExclusive - 1);
			tokens[i * 2] = position.column;
			tokens[i * 2 + 1] = storableTokens[i].data.metadata;
		}
		return tokens;
	}

	updateTokens(model: ITextModel, tokens: StorableToken[]): void {
		console.log(`Updating: ${tokens.map(token => `[${token.offsetStartInclusive}, ${token.offsetEndExclusive}]`).join(', ')}`);
		let tree = this.tokens.get(model);
		if (!tree) {
			tree = new TokenRangeTree(model);
			this.tokens.set(model, tree);
		}

		for (const token of tokens) {
			tree.insert(token.offsetStartInclusive, token.offsetEndExclusive, { metadata: token.metadata, needsRefresh: false });
		}
	}

	markForRefresh(model: ITextModel, range: Range): void {
		const tree = this.tokens.get(model);
		if (!tree) {
			return;
		}
		tree.traverseInOrder(range, (node) => {
			node.data.needsRefresh = true;
		});
	}

}

registerSingleton(ITreeSitterTokenizationStoreService, TreeSitterTokenizationStoreService, InstantiationType.Delayed);

