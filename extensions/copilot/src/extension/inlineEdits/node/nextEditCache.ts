/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { IObservableDocument, ObservableWorkspace } from '../../../platform/inlineEdits/common/observableWorkspace';
import { autorunWithChanges } from '../../../platform/inlineEdits/common/utils/observable';
import { ILogger, ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { LRUCache } from '../../../util/common/cache';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { mapObservableArrayCached } from '../../../util/vs/base/common/observableInternal';
import { AnnotatedStringReplacement, StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { checkEditConsistency, EditDataWithIndex, NesRebaseConfigs, tryRebase } from '../common/editRebase';
import { NextEditFetchRequest } from './nextEditProvider';
import { RebaseFailureInfo, type RebaseResult } from './rebaseResult';

export interface CachedEditOpts {
	isFromCursorJump: boolean;
	/**
	 * For cursor jump edits, this is the edit window around the original cursor position
	 * (before the jump), allowing the edit to be served from cache when the cursor is
	 * in either the original location or the jump target location.
	 */
	originalEditWindow?: OffsetRange;
	/**
	 * The cursor offset at the time the edit was cached.
	 * Used for cursor-distance filtering: if the user moves farther from the edit,
	 * the cached entry is not served.
	 */
	cursorOffset?: number;
}

export interface CachedEdit {
	docId: DocumentId;
	documentBeforeEdit: StringText;
	editWindow?: OffsetRange;
	/**
	 * For cursor jump edits, the edit window around the original cursor position.
	 * @see CachedEditOpts.originalEditWindow
	 */
	originalEditWindow?: OffsetRange;
	edit: StringReplacement | undefined;
	isFromCursorJump: boolean;
	edits?: StringReplacement[];
	detailedEdits: AnnotatedStringReplacement<EditDataWithIndex>[][];
	userEditSince?: StringEdit;
	rebaseFailed?: boolean;
	rejected?: boolean;

	/**
	 * When caching multiple edits, this is the order in which they were applied.
	 */
	subsequentN?: number;
	source: NextEditFetchRequest;
	cacheTime: number;
	/**
	 * The cursor offset at the time the edit was cached.
	 * @see CachedEditOpts.cursorOffset
	 */
	cursorOffsetAtCacheTime?: number;
}

export type CachedOrRebasedEdit = CachedEdit & { rebasedEdit?: StringReplacement; rebasedEditIndex?: number; isFromSpeculativeRequest?: boolean };

export class NextEditCache extends Disposable {
	private readonly _documentCaches = new Map<DocumentId, DocumentEditCache>();
	private readonly _sharedCache = new LRUCache<CachedEdit>(50);

	constructor(
		public readonly workspace: ObservableWorkspace,
		private readonly _logService: ILogService,
		private readonly _configService: IConfigurationService,
		private readonly _expService: IExperimentationService,
	) {
		super();

		mapObservableArrayCached(this, workspace.openDocuments, (doc, store) => {
			const state = new DocumentEditCache(this, doc.id, doc, this._sharedCache, this._logService);
			this._documentCaches.set(state.docId, state);

			store.add(autorunWithChanges(this, {
				value: doc.value,
			}, (data) => {
				for (const edit of data.value.changes) {
					if (!edit.isEmpty()) {
						state.handleEdit(edit);
					}
				}
				// if editor-change triggering is allowed,
				// 	it means an edit in file A can result in a cached edit for file B to be less relevant than with the edits in file A included
				if (this._configService.getExperimentBasedConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, this._expService) !== undefined) {
					for (const [k, v] of this._sharedCache.entries()) {
						if (v.docId !== doc.id) {
							this._sharedCache.deleteKey(k);
						}
					}
				}
			}));

			store.add(toDisposable(() => {
				this._documentCaches.delete(doc.id);
			}));
		}).recomputeInitiallyAndOnChange(this._store);
	}

	public setKthNextEdit(docId: DocumentId, documentContents: StringText, editWindow: OffsetRange | undefined, nextEdit: StringReplacement, subsequentN: number, nextEdits: StringReplacement[] | undefined, userEditSince: StringEdit | undefined, source: NextEditFetchRequest, opts: CachedEditOpts): CachedEdit | undefined {
		const docCache = this._documentCaches.get(docId);
		if (!docCache) {
			return;
		}
		return docCache.setKthNextEdit(documentContents, editWindow, nextEdit, nextEdits, userEditSince, subsequentN, source, opts);
	}

	public setNoNextEdit(docId: DocumentId, documentContents: StringText, editWindow: OffsetRange | undefined, source: NextEditFetchRequest) {
		const docCache = this._documentCaches.get(docId);
		if (!docCache) {
			return;
		}
		docCache.setNoNextEdit(documentContents, editWindow, source);
	}

	private _getNesRebaseConfigs(): NesRebaseConfigs {
		return {
			absorbSubsequenceTyping: this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsAbsorbSubsequenceTyping, this._expService),
		};
	}

	public lookupNextEdit(docId: DocumentId, currentDocumentContents: StringText, currentSelection: readonly OffsetRange[]): CachedOrRebasedEdit | undefined {
		const docCache = this._documentCaches.get(docId);
		if (!docCache) {
			return undefined;
		}
		const cacheCursorDistanceCheck = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsCacheCursorDistanceCheck, this._expService) ?? false;
		return docCache.lookupNextEdit(currentDocumentContents, currentSelection, this._getNesRebaseConfigs(), cacheCursorDistanceCheck);
	}

	public tryRebaseCacheEntry(cachedEdit: CachedEdit, currentDocumentContents: StringText, currentSelection: readonly OffsetRange[]): RebaseResult {
		const docCache = this._documentCaches.get(cachedEdit.docId);
		if (!docCache) {
			return { edit: undefined };
		}
		return docCache.tryRebaseCacheEntry(cachedEdit, currentDocumentContents, currentSelection, this._getNesRebaseConfigs());
	}

	public rejectedNextEdit(requestId: string): void {
		this._sharedCache.getValues()
			.filter(v => v.source.headerRequestId === requestId)
			.forEach(v => v.rejected = true);
	}

	public isRejectedNextEdit(docId: DocumentId, currentDocumentContents: StringText, edit: StringReplacement) {
		const docCache = this._documentCaches.get(docId);
		if (!docCache) {
			return false;
		}
		return docCache.isRejectedNextEdit(currentDocumentContents, edit);
	}

	public evictedCachedEdit(cachedEdit: CachedEdit) {
		const docCache = this._documentCaches.get(cachedEdit.docId);
		if (docCache) {
			docCache.evictedCachedEdit(cachedEdit);
		}
	}

	public clear() {
		this._documentCaches.forEach(cache => cache.clear());
		this._sharedCache.clear();
	}
}

class DocumentEditCache {

	private readonly _trackedCachedEdits: CachedEdit[] = [];
	private _logger: ILogger;

	constructor(
		private readonly _nextEditCache: NextEditCache,
		public readonly docId: DocumentId,
		private readonly _doc: IObservableDocument,
		private readonly _sharedCache: LRUCache<CachedEdit>,
		_logService: ILogService,
	) {
		this._logger = _logService.createSubLogger(['NES', 'DocumentEditCache']);
	}

	public handleEdit(edit: StringEdit): void {
		const logger = this._logger.createSubLogger('handleEdit');
		for (const cachedEdit of this._trackedCachedEdits) {
			if (cachedEdit.userEditSince) {
				cachedEdit.userEditSince = cachedEdit.userEditSince.compose(edit);
				cachedEdit.rebaseFailed = false;
				if (!checkEditConsistency(cachedEdit.documentBeforeEdit.value, cachedEdit.userEditSince, this._doc.value.get().value, logger)) {
					cachedEdit.userEditSince = undefined;
				}
			}
		}
	}

	public evictedCachedEdit(cachedEdit: CachedEdit) {
		const index = this._trackedCachedEdits.indexOf(cachedEdit);
		if (index !== -1) {
			this._trackedCachedEdits.splice(index, 1);
		}
	}

	public clear() {
		this._trackedCachedEdits.length = 0;
	}

	public setKthNextEdit(documentContents: StringText, editWindow: OffsetRange | undefined, nextEdit: StringReplacement, nextEdits: StringReplacement[] | undefined, userEditSince: StringEdit | undefined, subsequentN: number, source: NextEditFetchRequest, opts: CachedEditOpts): CachedEdit {
		const key = this._getKey(documentContents.value);
		const cachedEdit: CachedEdit = { docId: this.docId, edit: nextEdit, edits: nextEdits, detailedEdits: [], userEditSince, subsequentN, source, documentBeforeEdit: documentContents, editWindow, originalEditWindow: opts.originalEditWindow, cacheTime: Date.now(), isFromCursorJump: opts.isFromCursorJump, cursorOffsetAtCacheTime: opts.cursorOffset };
		if (userEditSince) {
			if (!checkEditConsistency(cachedEdit.documentBeforeEdit.value, userEditSince, this._doc.value.get().value, this._logger.createSubLogger('setKthNextEdit'))) {
				cachedEdit.userEditSince = undefined;
			} else {
				this._trackedCachedEdits.unshift(cachedEdit);
			}
		}
		const existing = this._sharedCache.get(key);
		if (existing) {
			this.evictedCachedEdit(existing);
		}
		const evicted = this._sharedCache.put(key, cachedEdit);
		if (evicted) {
			this._nextEditCache.evictedCachedEdit(evicted[1]);
		}
		return cachedEdit;
	}

	public setNoNextEdit(documentContents: StringText, editWindow: OffsetRange | undefined, source: NextEditFetchRequest) {
		const key = this._getKey(documentContents.value);
		const cachedEdit: CachedEdit = { docId: this.docId, edit: undefined, edits: [], detailedEdits: [], source, documentBeforeEdit: documentContents, editWindow, cacheTime: Date.now(), isFromCursorJump: false };
		const existing = this._sharedCache.get(key);
		if (existing) {
			this.evictedCachedEdit(existing);
		}
		const evicted = this._sharedCache.put(key, cachedEdit);
		if (evicted) {
			this._nextEditCache.evictedCachedEdit(evicted[1]);
		}
	}

	public lookupNextEdit(currentDocumentContents: StringText, currentSelection: readonly OffsetRange[], nesRebaseConfigs: NesRebaseConfigs, cacheCursorDistanceCheck: boolean = false): CachedOrRebasedEdit | undefined {
		// TODO@chrmarti: Update entries i > 1 with user edits and edit window and start tracking.
		const key = this._getKey(currentDocumentContents.value);
		const cachedEdit = this._sharedCache.get(key);
		if (cachedEdit) {
			const editWindow = cachedEdit.editWindow;
			const originalEditWindow = cachedEdit.originalEditWindow;
			const cursorRange = currentSelection[0];
			// For cursor jump edits, allow cache hits when cursor is in either the jump target window
			// (editWindow) or the original cursor location window (originalEditWindow)
			const inEditWindow = editWindow?.containsRange(cursorRange);
			const inOriginalWindow = originalEditWindow?.containsRange(cursorRange);
			if (editWindow && !inEditWindow && !inOriginalWindow) {
				return undefined;
			}
			// If the cursor moved farther from the edit's start line than it was at cache time,
			// reject the cached edit so the same suggestion is not shown again.
			// Only applies to non-rebased, non-subsequent edits.
			if (cacheCursorDistanceCheck
				&& cachedEdit.edit
				&& (cachedEdit.subsequentN === undefined || cachedEdit.subsequentN === 0)
				&& cachedEdit.cursorOffsetAtCacheTime !== undefined
				&& cursorRange
			) {
				const transformer = currentDocumentContents.getTransformer();
				const editStartLine = transformer.getPosition(cachedEdit.edit.replaceRange.start).lineNumber;
				const originalCursorLine = transformer.getPosition(cachedEdit.cursorOffsetAtCacheTime).lineNumber;
				const currentCursorLine = transformer.getPosition(cursorRange.start).lineNumber;
				if (Math.abs(currentCursorLine - editStartLine) > Math.abs(originalCursorLine - editStartLine)) {
					cachedEdit.rejected = true;
					return cachedEdit;
				}
			}
			return cachedEdit;
		}
		for (const cachedEdit of this._trackedCachedEdits) {
			const result = this.tryRebaseCacheEntry(cachedEdit, currentDocumentContents, currentSelection, nesRebaseConfigs);
			if (result.edit) {
				return result.edit;
			}
		}
		return undefined;
	}

	public tryRebaseCacheEntry(cachedEdit: CachedEdit, currentDocumentContents: StringText, currentSelection: readonly OffsetRange[], nesRebaseConfigs: NesRebaseConfigs): RebaseResult {
		const logger = this._logger.createSubLogger('tryRebaseCacheEntry');
		if (cachedEdit.userEditSince && !cachedEdit.rebaseFailed) {
			const originalEdits = cachedEdit.edits || (cachedEdit.edit ? [cachedEdit.edit] : []);

			// For cursor jump edits, try rebasing with the primary edit window first.
			// If that fails due to cursor being outside, try with the original edit window
			// (the window around the cursor's original position before the jump).
			const windowsToTry = cachedEdit.originalEditWindow
				? [cachedEdit.editWindow, cachedEdit.originalEditWindow]
				: [cachedEdit.editWindow];

			for (const window of windowsToTry) {
				const res = tryRebase(cachedEdit.documentBeforeEdit.value, window, originalEdits, cachedEdit.detailedEdits, cachedEdit.userEditSince, currentDocumentContents.value, currentSelection, 'strict', logger, nesRebaseConfigs);
				if (res === 'rebaseFailed') {
					cachedEdit.rebaseFailed = true;
					return {
						edit: undefined,
						failureInfo: new RebaseFailureInfo(cachedEdit.documentBeforeEdit.value, window, originalEdits, cachedEdit.userEditSince, currentDocumentContents.value, currentSelection, nesRebaseConfigs),
					};
				} else if (res === 'inconsistentEdits' || res === 'error') {
					cachedEdit.userEditSince = undefined;
					return { edit: undefined };
				} else if (res === 'outsideEditWindow') {
					// Try the next window (if available)
					continue;
				} else if (res.length) {
					if (!cachedEdit.rejected && this.isRejectedNextEdit(currentDocumentContents, res[0].rebasedEdit)) {
						cachedEdit.rejected = true;
					}
					return { edit: { ...cachedEdit, ...res[0] } };
				} else if (!originalEdits.length) {
					return { edit: cachedEdit }; // cached 'no edits'
				}
			}
		}
		return { edit: undefined };
	}

	public isRejectedNextEdit(currentDocumentContents: StringText, edit: StringReplacement) {
		const logger = this._logger.createSubLogger('isRejectedNextEdit');
		const resultEdit = edit.removeCommonSuffixAndPrefix(currentDocumentContents.value);
		for (const rejectedEdit of this._trackedCachedEdits.filter(edit => edit.rejected)) {
			if (!rejectedEdit.userEditSince) {
				continue;
			}
			const edits = rejectedEdit.edits || (rejectedEdit.edit ? [rejectedEdit.edit] : []);
			if (!edits.length) {
				continue; // cached 'no edits'
			}
			const rejectedEdits = tryRebase(rejectedEdit.documentBeforeEdit.value, undefined, edits, rejectedEdit.detailedEdits, rejectedEdit.userEditSince, currentDocumentContents.value, [], 'lenient', logger);
			if (typeof rejectedEdits === 'string') {
				continue;
			}
			const rejected = rejectedEdits.some(rejected => rejected.rebasedEdit.removeCommonSuffixAndPrefix(currentDocumentContents.value).equals(resultEdit));
			if (rejected) {
				logger.trace('Found rejected edit that matches current edit');
				return true;
			}
		}
		return false;
	}

	private _getKey(val: string): string {
		return JSON.stringify([this.docId.uri, val]);
	}
}
