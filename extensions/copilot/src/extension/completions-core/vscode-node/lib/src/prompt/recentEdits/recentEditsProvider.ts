/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservableDocument } from '../../../../../../../platform/inlineEdits/common/observableWorkspace';
import { autorunWithChanges } from '../../../../../../../platform/inlineEdits/common/utils/observable';
import { createServiceIdentifier } from '../../../../../../../util/common/services';
import { Disposable } from '../../../../../../../util/vs/base/common/lifecycle';
import { mapObservableArrayCached } from '../../../../../../../util/vs/base/common/observableInternal';
import { ICompletionsObservableWorkspace } from '../../completionsObservableWorkspace';
import {
	getAllRecentEditsByTimestamp,
	RecentEdit,
	RecentEditMap,
	recentEditsReducer,
	summarizeEdit,
} from './recentEditsReducer';

export const ICompletionsRecentEditsProviderService = createServiceIdentifier<ICompletionsRecentEditsProviderService>('ICompletionsRecentEditsProviderService');
export interface ICompletionsRecentEditsProviderService {
	readonly _serviceBrand: undefined;
	isEnabled(): boolean;
	getRecentEdits(): RecentEdit[];
	getEditSummary(edit: RecentEdit): string | null;
	start(): void;
}

export interface RecentEditsConfig {
	// the maximum number of recent files to include in the prompt
	maxFiles: number;
	// the number of recent edits to include in the prompt
	maxEdits: number;
	// the number of context lines around the edit to include in the prompt
	diffContextLines: number;
	// the distance between edits to merge them into one edit
	editMergeLineDistance: number;
	// the maximum number of characters per edit to include in the prompt
	maxCharsPerEdit: number;
	// the debounce timeout for tracking recent edits
	debounceTimeout: number;
	// the type of summarization we use for recent edits
	summarizationFormat: string;
	// whether to remove deleted lines from diff in the prompt
	removeDeletedLines: boolean;
	// whether to organize insertions before deletions in the diff format
	insertionsBeforeDeletions: boolean;
	// whether to append a no-reply marker to the end of deletions in the diff format
	appendNoReplyMarker: boolean;
	// the filtered-out window limit between active-file recent edits and cursor
	activeDocDistanceLimitFromCursor: number | undefined;
	// the maximum number of lines per edit to include in the prompt
	maxLinesPerEdit: number;
}

const RECENT_EDITS_DEFAULT_CONFIG: RecentEditsConfig = Object.freeze({
	maxFiles: 20,
	maxEdits: 8,
	diffContextLines: 3,
	editMergeLineDistance: 1,
	maxCharsPerEdit: 2000,
	debounceTimeout: 500,
	summarizationFormat: 'diff',
	removeDeletedLines: false,
	insertionsBeforeDeletions: true,
	appendNoReplyMarker: true,
	activeDocDistanceLimitFromCursor: 100,
	maxLinesPerEdit: 10,
});

export class FullRecentEditsProvider extends Disposable implements ICompletionsRecentEditsProviderService {
	declare _serviceBrand: undefined;

	private _started: boolean = false;
	private recentEditMap: RecentEditMap = {};
	private recentEdits: RecentEdit[] = [];
	private recentEditSummaries: WeakMap<RecentEdit, string | null> = new WeakMap();
	private debounceTimeouts: { [key: string]: TimeoutHandle } = {};
	private readonly _config: RecentEditsConfig;

	constructor(
		config: RecentEditsConfig | undefined,
		@ICompletionsObservableWorkspace private readonly observableWorkspace: ICompletionsObservableWorkspace,
	) {
		super();
		this._config = config ?? Object.assign({}, RECENT_EDITS_DEFAULT_CONFIG);
	}

	get config(): RecentEditsConfig {
		return this._config;
	}

	isEnabled(): boolean {
		return true;
	}

	getRecentEdits(): RecentEdit[] {
		return this.recentEdits;
	}

	getEditSummary(edit: RecentEdit): string | null {
		return this.recentEditSummaries.get(edit) ?? null;
	}

	protected updateRecentEdits(docId: string, newContents: string): void {
		this.recentEditMap = recentEditsReducer(this.recentEditMap, docId, newContents, this._config);
		this.recentEdits = getAllRecentEditsByTimestamp(this.recentEditMap);

		this.recentEdits.forEach(edit => {
			if (!this.recentEditSummaries.has(edit)) {
				// Generate a summary for the edit if it doesn't already exist
				const summary = summarizeEdit(edit, this._config);
				this.recentEditSummaries.set(edit, summary);
			}
		});
	}

	start() {
		// By the default, the provider starts lazily on the first completion request.
		if (this._started) {
			return;
		}
		this._started = true;

		mapObservableArrayCached(
			this,
			this.observableWorkspace.openDocuments,
			(doc: IObservableDocument, store) => {
				store.add(
					autorunWithChanges(
						this,
						{
							value: doc.value,
							selection: doc.selection,
							languageId: doc.languageId,
						},
						data => {
							if (data.value.changes.length > 0) {
								const prevText = data.value.previous?.value;
								const newText = data.value.value.value;
								const docId = doc.id.toString();

								// clear any existing debounce timeout for this document
								// note that you can call clearTimeout on undefined, so we don't need to check if it exists
								clearTimeout(this.debounceTimeouts[docId]);

								if (!this.recentEditMap[docId] && prevText) {
									// This is the first time the edit is being stored, but we also know what the previous text was.
									// We need to add the previous text to the reducer so that we can get a diff.
									this.updateRecentEdits(docId, prevText);
								} else if (this._config.debounceTimeout === 0) {
									// allow setting debounce to 0 in experiments / settings for immediate updates
									this.updateRecentEdits(docId, newText);
								} else {
									// update in a few milliseconds
									this.debounceTimeouts[docId] = setTimeout(() => {
										this.updateRecentEdits(docId, newText);
									}, this._config.debounceTimeout ?? 500);
								}
							}
						}
					)
				);
			},
			d => d.id
		).recomputeInitiallyAndOnChange(this._store);
	}
}
