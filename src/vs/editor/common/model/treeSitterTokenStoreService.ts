/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { ITextModel } from '../model.js';
import { TokenStore, TokenUpdate } from './tokenStore.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';

export interface ITreeSitterTokenizationStoreService {
	readonly _serviceBrand: undefined;
	setTokens(model: ITextModel, tokens: TokenUpdate[]): void;
	getTokens(model: ITextModel, line: number): Uint32Array | undefined;
	updateTokens(model: ITextModel, version: number, updates: { oldRangeLength: number; newTokens: TokenUpdate[] }[]): void;
	markForRefresh(model: ITextModel, range: Range): void;
	getNeedsRefresh(model: ITextModel): { range: Range; startOffset: number; endOffset: number }[];
	hasTokens(model: ITextModel, accurateForRange?: Range): boolean;
}

export const ITreeSitterTokenizationStoreService = createDecorator<ITreeSitterTokenizationStoreService>('treeSitterTokenizationStoreService');

export interface TokenInformation {
	tokens: Uint32Array;
	needsRefresh?: boolean;
}

class TreeSitterTokenizationStoreService implements ITreeSitterTokenizationStoreService, IDisposable {
	readonly _serviceBrand: undefined;

	private readonly tokens = new Map<ITextModel, { store: TokenStore; accurateVersion: number; guessVersion: number; readonly disposables: DisposableStore }>();

	constructor() { }

	setTokens(model: ITextModel, tokens: TokenUpdate[]): void {
		const disposables = new DisposableStore();
		const store = disposables.add(new TokenStore(model));
		this.tokens.set(model, { store: store, accurateVersion: model.getVersionId(), disposables, guessVersion: model.getVersionId() });

		store.buildStore(tokens);
		disposables.add(model.onDidChangeContent(e => {
			const storeInfo = this.tokens.get(model);
			if (!storeInfo) {
				return;
			}

			storeInfo.guessVersion = e.versionId;
			for (const change of e.changes) {
				storeInfo.store.markForRefresh(change.rangeOffset, change.rangeOffset + change.rangeLength);
				if (change.text.length > change.rangeLength) {
					const oldToken = storeInfo.store.getTokenAt(change.rangeOffset)!;
					// Insert. Just grow the token at this position to include the insert.
					const newToken = { startOffsetInclusive: oldToken.startOffsetInclusive, length: oldToken.length + change.text.length - change.rangeLength, token: oldToken.token };
					storeInfo.store.update(oldToken.length, [newToken]);
				} else if (change.text.length < change.rangeLength) {
					// Delete. Delete the tokens at the corresponding range.
					const deletedCharCount = change.rangeLength - change.text.length;
					storeInfo.store.delete(deletedCharCount, change.rangeOffset);
				}
			}
		}));
		disposables.add(model.onWillDispose(() => {
			const storeInfo = this.tokens.get(model);
			if (storeInfo) {
				storeInfo.disposables.dispose();
				this.tokens.delete(model);
			}
		}));
	}

	hasTokens(model: ITextModel, accurateForRange?: Range): boolean {
		const tokens = this.tokens.get(model);
		if (!tokens) {
			return false;
		}
		if (!accurateForRange || (tokens.guessVersion === tokens.accurateVersion)) {
			return true;
		}

		return !tokens.store.rangeNeedsRefresh(model.getOffsetAt(accurateForRange.getStartPosition()), model.getOffsetAt(accurateForRange.getEndPosition()));
	}

	getTokens(model: ITextModel, line: number): Uint32Array | undefined {
		const tokens = this.tokens.get(model)?.store;
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
		for (const update of updates) {
			const lastToken = update.newTokens[update.newTokens.length - 1];
			const oldRangeLength = (existingTokens.guessVersion >= version) ? (lastToken.startOffsetInclusive + lastToken.length - update.newTokens[0].startOffsetInclusive) : update.oldRangeLength;
			existingTokens.store.update(oldRangeLength, update.newTokens);
		}
	}

	markForRefresh(model: ITextModel, range: Range): void {
		const tree = this.tokens.get(model)?.store;
		if (!tree) {
			return;
		}

		tree.markForRefresh(model.getOffsetAt(range.getStartPosition()), model.getOffsetAt(range.getEndPosition()));
	}

	getNeedsRefresh(model: ITextModel): { range: Range; startOffset: number; endOffset: number }[] {
		const needsRefreshOffsetRanges = this.tokens.get(model)?.store.getNeedsRefresh();
		if (!needsRefreshOffsetRanges) {
			return [];
		}
		return needsRefreshOffsetRanges.map(range => ({
			range: Range.fromPositions(model.getPositionAt(range.startOffset), model.getPositionAt(range.endOffset)),
			startOffset: range.startOffset,
			endOffset: range.endOffset
		}));
	}

	dispose(): void {
		for (const [, value] of this.tokens) {
			value.disposables.dispose();
		}
	}
}

registerSingleton(ITreeSitterTokenizationStoreService, TreeSitterTokenizationStoreService, InstantiationType.Delayed);
