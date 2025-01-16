/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { ITextModel } from '../model.js';
import { TokenStore, TokenUpdate } from './tokenStore.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../base/common/lifecycle.js';

export interface ITreeSitterTokenizationStoreService {
	readonly _serviceBrand: undefined;
	setTokens(model: ITextModel, tokens: TokenUpdate[]): void;
	getTokens(model: ITextModel, line: number): Uint32Array | undefined;
	updateTokens(model: ITextModel, version: number, updates: { oldRangeLength: number; newTokens: TokenUpdate[] }[]): void;
	markForRefresh(model: ITextModel, range: Range): void;
	hasTokens(model: ITextModel, accurateForRange?: Range): boolean;
}

export const ITreeSitterTokenizationStoreService = createDecorator<ITreeSitterTokenizationStoreService>('treeSitterTokenizationStoreService');

export interface TokenInformation {
	tokens: Uint32Array;
	needsRefresh?: boolean;
}

class TreeSitterTokenizationStoreService extends Disposable implements ITreeSitterTokenizationStoreService {
	readonly _serviceBrand: undefined;

	private readonly tokens = new Map<ITextModel, { accurateStore: TokenStore; guessStore?: TokenStore; accurateVersion: number; guessVersion?: number }>();

	constructor() {
		super();
	}

	setTokens(model: ITextModel, tokens: TokenUpdate[]): void {
		const store = new TokenStore(model);
		this.tokens.set(model, { accurateStore: store, accurateVersion: model.getVersionId() });
		store.buildStore(tokens);
		this._register(model.onDidChangeContent(e => {
			const storeInfo = this.tokens.get(model);
			if (!storeInfo) {
				return;
			}
			if (!storeInfo.guessStore) {
				storeInfo.guessStore = storeInfo.accurateStore.deepCopy();
			}
			storeInfo.guessVersion = e.versionId;
			for (const change of e.changes) {
				storeInfo.accurateStore.markForRefresh(change.rangeOffset, change.rangeOffset + change.rangeLength);
				if (change.text.length > change.rangeLength) {
					const oldToken = storeInfo.accurateStore.getTokenAt(change.rangeOffset)!;
					// Insert. Just grow the token at this position to include the insert.
					const newToken = { startOffsetInclusive: oldToken.startOffsetInclusive, length: oldToken.length + change.text.length - change.rangeLength, token: oldToken.token };
					storeInfo.guessStore.update(oldToken.length, [newToken]);
				} else if (change.text.length < change.rangeLength) {
					// Delete. Delete the tokens at the corresponding range.
					const deletedCharCount = change.rangeLength - change.text.length;
					storeInfo.guessStore.delete(deletedCharCount, change.rangeOffset);
				}
			}
		}));
	}

	private getStore(model: ITextModel): TokenStore | undefined {
		const store = this.tokens.get(model);
		if (!store) {
			return undefined;
		}

		return store.guessStore ?? store.accurateStore;
	}

	hasTokens(model: ITextModel, accurateForRange?: Range): boolean {
		const tokens = accurateForRange ? this.tokens.get(model)?.accurateStore : this.getStore(model);
		if (!tokens) {
			return false;
		}
		if (!accurateForRange) {
			return true;
		}

		return !tokens.rangeNeedsRefresh(model.getOffsetAt(accurateForRange.getStartPosition()), model.getOffsetAt(accurateForRange.getEndPosition()));
	}

	getTokens(model: ITextModel, line: number): Uint32Array | undefined {
		const tokens = this.getStore(model);
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

	updateTokens(model: ITextModel, version: number, updates: { oldRangeLength: number; newTokens: TokenUpdate[] }[]): void {
		const existingTokens = this.tokens.get(model);
		if (!existingTokens) {
			return;
		}

		existingTokens.accurateVersion = version;
		if (existingTokens.guessStore && existingTokens.guessVersion === version) {
			existingTokens.guessStore = undefined;
			existingTokens.guessVersion = undefined;
		}
		for (const update of updates) {
			existingTokens.accurateStore.update(update.oldRangeLength, update.newTokens);
		}
	}

	markForRefresh(model: ITextModel, range: Range): void {
		const tree = this.tokens.get(model)?.accurateStore;
		if (!tree) {
			return;
		}

		tree.markForRefresh(model.getOffsetAt(range.getStartPosition()), model.getOffsetAt(range.getEndPosition()));
	}
}

registerSingleton(ITreeSitterTokenizationStoreService, TreeSitterTokenizationStoreService, InstantiationType.Delayed);
