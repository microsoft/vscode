/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { ITextModel } from '../model.js';
import { TokenStore, TokenUpdate } from './tokenStore.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export interface ITreeSitterTokenizationStoreService {
	readonly _serviceBrand: undefined;
	setTokens(model: ITextModel, tokens: TokenUpdate[]): void;
	getTokens(model: ITextModel, line: number): Uint32Array | undefined;
	updateTokens(model: ITextModel, oldRangeLength: number, newTokens: TokenUpdate[]): void;
	markForRefresh(model: ITextModel, range: Range): void;
	hasTokens(model: ITextModel, accurateForRange?: Range): boolean;
}

export const ITreeSitterTokenizationStoreService = createDecorator<ITreeSitterTokenizationStoreService>('treeSitterTokenizationStoreService');

export interface TokenInformation {
	tokens: Uint32Array;
	needsRefresh?: boolean;
}

class TreeSitterTokenizationStoreService implements ITreeSitterTokenizationStoreService {
	readonly _serviceBrand: undefined;

	private readonly tokens = new Map<ITextModel, TokenStore>();

	constructor() { }

	setTokens(model: ITextModel, tokens: TokenUpdate[]): void {
		const store = new TokenStore(model);
		this.tokens.set(model, store);
		store.buildStore(tokens);
	}

	hasTokens(model: ITextModel, accurateForRange?: Range): boolean {
		const tokens = this.tokens.get(model);
		if (!tokens) {
			return false;
		}
		if (!accurateForRange) {
			return true;
		}

		return !tokens.rangeNeedsRefresh(model.getOffsetAt(accurateForRange.getStartPosition()), model.getOffsetAt(accurateForRange.getEndPosition()));
	}

	getTokens(model: ITextModel, line: number): Uint32Array | undefined {
		const tokens = this.tokens.get(model);
		if (!tokens) {
			return undefined;
		}
		const lineStartOffset = model.getOffsetAt({ lineNumber: line, column: 1 });
		const lineTokens = tokens.getTokensInRange(lineStartOffset, model.getOffsetAt({ lineNumber: line, column: model.getLineMaxColumn(line) }) + 1);
		const result = new Uint32Array(lineTokens.length * 2);
		for (let i = 0; i < lineTokens.length; i++) {
			result[i * 2] = lineTokens[i].startOffsetInclusive - lineStartOffset + lineTokens[i].length;
			result[i * 2 + 1] = lineTokens[i].token;
		}
		return result;
	}

	updateTokens(model: ITextModel, oldRangeLength: number, newTokens: TokenUpdate[]): void {
		const existingTokens = this.tokens.get(model);
		if (!existingTokens) {
			return;
		}
		existingTokens.update(oldRangeLength, newTokens);
	}

	markForRefresh(model: ITextModel, range: Range): void {
		const tree = this.tokens.get(model);
		if (!tree) {
			return;
		}

		tree.markForRefresh(model.getOffsetAt(range.getStartPosition()), model.getOffsetAt(range.getEndPosition()));
	}
}

registerSingleton(ITreeSitterTokenizationStoreService, TreeSitterTokenizationStoreService, InstantiationType.Delayed);

