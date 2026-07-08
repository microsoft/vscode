/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IObservableSignal, IReader, ISettableObservable, observableFromEvent, observableSignal, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { MultiDiffEditorInput } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IMultiDiffEditorOptions } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { IChatResponseFileChangesService } from '../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { IChatEditingService, IEditSessionEntryDiff } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { isRequestVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { budgetBucketPrompts, MAX_TICKS, PromptItem } from './promptBucketing.js';

/** Aggregated diff stats for the edits a prompt (or bucket) produced. */
export interface PromptDiffStat {
	readonly added: number;
	readonly removed: number;
	readonly fileCount: number;
}

/** A single file changed by a prompt, used by the hover card / diff drill-down. */
export interface PromptFileDiff {
	readonly name: string;
	readonly originalURI: URI;
	/** File identity / go-to-file target (may be the live working file). */
	readonly modifiedURI: URI;
	/** RHS content the diff should render; the frozen after-turn snapshot when available. */
	readonly diffModifiedURI: URI;
	readonly added: number;
	readonly removed: number;
}

/** Content-space layout used by the overview-ruler rail to place marks + the viewport thumb. */
export interface IPromptScrollLayout {
	/** Each prompt's top offset in transcript content pixels. */
	readonly marks: readonly { readonly requestId: string; readonly top: number }[];
	/** Total transcript content height in pixels. */
	readonly total: number;
	/** Current scroll offset in content pixels. */
	readonly scrollTop: number;
}

/** A single tick shown on the prompt timeline rail. */
export interface PromptTick {
	/** Jump target: the request id of the first prompt in the bucket. */
	readonly requestId: string;
	/** Request ids of every prompt this tick represents (for active tracking). */
	readonly allRequestIds: readonly string[];
	/** Preview text (first prompt in the bucket). */
	readonly text: string;
	/** Creation time (ms since epoch) of the first prompt in the bucket. */
	readonly timestamp: number;
	/** How many prompts this tick represents. */
	readonly count: number;
	/** Accessible label announced for the tick. */
	readonly ariaLabel: string;
	/** Diff summary of the edits this tick produced, if any. */
	readonly stat?: PromptDiffStat;
}

const MAX_PREVIEW_LENGTH = 80;

/** First non-empty line of a prompt, trimmed and length-capped for previews. */
function getPromptPreview(text: string): string {
	const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? '';
	return firstLine.length <= MAX_PREVIEW_LENGTH ? firstLine : `${firstLine.slice(0, MAX_PREVIEW_LENGTH)}…`;
}

/** Whether two derived prompt lists are equivalent (order, id, text and time). */
function promptsEqual(a: readonly PromptItem[], b: readonly PromptItem[]): boolean {
	return a.length === b.length && a.every((p, i) =>
		p.requestId === b[i].requestId && p.text === b[i].text && p.timestamp === b[i].timestamp);
}

/** A user prompt entry (used by the keyboard "Go to Prompt" picker, independent of rail density). */
export interface PromptEntry {
	readonly requestId: string;
	readonly text: string;
	readonly timestamp: number;
	readonly stat?: PromptDiffStat;
}

/**
 * Derives the prompt timeline (bucketed ticks + the active tick) from a chat
 * widget's view model, and reveals prompts on request.
 */
export class PromptTimelineModel extends Disposable {

	/** All user prompts in the chat, updated as the transcript changes. */
	private readonly _prompts: ISettableObservable<readonly PromptItem[]> = observableValue<readonly PromptItem[]>(this, []);

	/** The chat session resource, tracked reactively so the editing session can be resolved. */
	private readonly _sessionResource: IObservable<URI | undefined>;

	/** The chat editing session for this chat, if one exists (local or agent-host). */
	private readonly _editingSession = derived(this, reader => {
		const resource = this._sessionResource.read(reader);
		if (!resource) {
			return undefined;
		}
		return this.chatEditingService.editingSessionsObs.read(reader).find(s => isEqual(s.chatSessionResource, resource));
	});

	/** Recency-bucketed ticks, capped to a fixed maximum so each keeps a >=24px slot. */
	private readonly _baseTicks = derived<readonly PromptTick[]>(this, reader => {
		const prompts = this._prompts.read(reader);
		return budgetBucketPrompts(prompts, Date.now(), MAX_TICKS).map((bucket): PromptTick => ({
			requestId: bucket.prompt.requestId,
			allRequestIds: bucket.prompts.map(p => p.requestId),
			text: bucket.prompt.text,
			timestamp: bucket.prompt.timestamp,
			count: bucket.count,
			ariaLabel: bucket.count === 1
				? localize('promptTimeline.tick', "Prompt: {0}", bucket.prompt.text)
				: localize('promptTimeline.tickGrouped', "{0} prompts starting with: {1}", bucket.count, bucket.prompt.text),
		}));
	});

	/** Ticks decorated with per-prompt diff stats (server per-turn changeset, else editing session). */
	private readonly _ticks = derived<readonly PromptTick[]>(this, reader => {
		const base = this._baseTicks.read(reader);
		return base.map(tick => {
			const stat = this._statForRequests(tick.allRequestIds, reader);
			return stat ? { ...tick, stat } : tick;
		});
	});
	get ticks(): IObservable<readonly PromptTick[]> { return this._ticks; }

	private readonly _activeRequestId: ISettableObservable<string | undefined> = observableValue<string | undefined>(this, undefined);
	get activeRequestId(): IObservable<string | undefined> { return this._activeRequestId; }

	/** Fires when the transcript scroll offset or content height changes (drives the ruler rail). */
	private readonly _scrollLayoutSignal: IObservableSignal<void> = observableSignal<void>(this);
	get onDidChangeScrollLayout(): IObservable<void> { return this._scrollLayoutSignal; }

	private readonly _viewModelListener = this._register(new MutableDisposable());

	constructor(
		private readonly widget: ChatWidget,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IChatResponseFileChangesService private readonly chatResponseFileChangesService: IChatResponseFileChangesService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		// Assigned here (not as a field initializer) because it reads `this.widget`,
		// which parameter properties only assign once the constructor body runs.
		this._sessionResource = observableFromEvent(this, this.widget.onDidChangeViewModel, () => this.widget.viewModel?.sessionResource);
		this._register(this.widget.onDidChangeViewModel(() => this._bindViewModel()));
		this._register(this.widget.onDidScroll(() => { this._updateActive(); this._triggerScrollLayout(); }));
		this._register(this.widget.onDidChangeContentHeight(() => this._triggerScrollLayout()));
		// Re-evaluate the active tick whenever the ticks change.
		this._register(autorun(reader => {
			this._baseTicks.read(reader);
			this._updateActive();
			this._triggerScrollLayout();
		}));
		this._bindViewModel();
	}

	private _triggerScrollLayout(): void {
		transaction(tx => this._scrollLayoutSignal.trigger(tx));
	}

	/**
	 * The prompts' positions in transcript content space, for the overview-ruler
	 * rail. Each prompt's top comes from the chat list's layout height model
	 * (`ChatWidget.getElementTop`), the same virtualization-safe source the
	 * scrollbar uses, so off-screen prompts get correct positions without waiting
	 * for their rows to render. Marks, `total`, and `scrollTop` all share the
	 * list's content-pixel space, so the viewport thumb stays aligned.
	 */
	getScrollLayout(): IPromptScrollLayout | undefined {
		const items = this.widget.viewModel?.getItems();
		if (!items) {
			return undefined;
		}
		const marks: { requestId: string; top: number }[] = [];
		for (const item of items) {
			if (isRequestVM(item)) {
				const top = this.widget.getElementTop(item);
				if (top !== undefined) {
					marks.push({ requestId: item.id, top });
				}
			}
		}
		return { marks, total: this.widget.scrollHeight, scrollTop: this.widget.scrollTop };
	}

	private _bindViewModel(): void {
		this._viewModelListener.value = this.widget.viewModel?.onDidChange(() => this._recompute());
		this._recompute();
	}

	private _recompute(): void {
		const prompts: PromptItem[] = [];
		for (const item of this.widget.viewModel?.getItems() ?? []) {
			if (isRequestVM(item)) {
				prompts.push({ requestId: item.id, text: getPromptPreview(item.messageText), timestamp: item.timestamp });
			}
		}

		// Streaming fires onDidChange for every token; only rebuild ticks when the
		// set of prompts actually changed. Rendered heights still shift, so refresh
		// the active tick either way.
		if (promptsEqual(prompts, this._prompts.get())) {
			this._updateActive();
			return;
		}
		this._prompts.set(prompts, undefined);
	}

	/** Recomputes which tick maps to the prompt currently scrolled into view. */
	private _updateActive(): void {
		const ticks = this._baseTicks.get();
		const items = this.widget.viewModel?.getItems();
		if (!items || ticks.length === 0) {
			this._activeRequestId.set(undefined, undefined);
			return;
		}

		// The active prompt is the last request whose top edge is at or above the
		// viewport top. Positions come from the list's layout height model, so
		// off-screen prompts resolve correctly (not just rendered ones).
		const scrollTop = this.widget.scrollTop;
		const threshold = 24;
		let activeRequestId: string | undefined;
		let activeTimestamp = 0;
		for (const item of items) {
			if (isRequestVM(item)) {
				const top = this.widget.getElementTop(item);
				if (top !== undefined && top <= scrollTop + threshold) {
					activeRequestId = item.id;
					activeTimestamp = item.timestamp;
				}
			}
		}

		if (activeRequestId === undefined) {
			// Scrolled above the oldest prompt: the oldest tick is the active one
			// (the loop advances oldest -> newest as you scroll down).
			this._activeRequestId.set(ticks.at(0)?.requestId, undefined);
			return;
		}

		let activeTick = ticks.find(t => t.allRequestIds.includes(activeRequestId!));
		if (!activeTick) {
			// The active prompt's bucket may have been sampled away; fall back to the
			// nearest surviving tick at or before it (ticks are chronological).
			for (const tick of ticks) {
				if (tick.timestamp <= activeTimestamp) {
					activeTick = tick;
				} else {
					break;
				}
			}
		}
		this._activeRequestId.set((activeTick ?? ticks[ticks.length - 1]).requestId, undefined);
	}

	/** Reveals the request with the given id near the top of the transcript. */
	reveal(requestId: string): void {
		const item = this.widget.viewModel?.getItems().find(i => isRequestVM(i) && i.id === requestId);
		if (item) {
			this.widget.reveal(item, 0);
		}
		// Normalize to the owning tick's representative id so the active highlight
		// works even when the id is a mid-bucket prompt (picker).
		const owningTick = this._baseTicks.get().find(t => t.allRequestIds.includes(requestId));
		this._activeRequestId.set(owningTick?.requestId ?? requestId, undefined);
	}

	/** The changed files for a tick's prompts, aggregated per file (for the hover card / drill-down). */
	getRequestFiles(tick: PromptTick): readonly PromptFileDiff[] {
		const byPath = new Map<string, PromptFileDiff>();
		for (const requestId of tick.allRequestIds) {
			for (const diff of this._diffsForRequest(requestId)) {
				if (diff.identical) {
					continue;
				}
				const key = diff.modifiedURI.toString();
				const existing = byPath.get(key);
				if (existing) {
					// Grouped tick, same file across prompts: the prompts are
					// chronological, so keep the earliest `originalURI` (before) but
					// advance `diffModifiedURI` to this later prompt's after-snapshot
					// so the opened diff spans the whole tick, not just the first edit.
					byPath.set(key, {
						...existing,
						diffModifiedURI: diff.modifiedSnapshotURI ?? diff.modifiedURI,
						added: existing.added + diff.added,
						removed: existing.removed + diff.removed,
					});
				} else {
					byPath.set(key, {
						name: basename(diff.modifiedURI),
						originalURI: diff.originalURI,
						modifiedURI: diff.modifiedURI,
						diffModifiedURI: diff.modifiedSnapshotURI ?? diff.modifiedURI,
						added: diff.added,
						removed: diff.removed,
					});
				}
			}
		}
		return [...byPath.values()];
	}

	/**
	 * Opens the per-prompt changes as a multi-file diff. When a specific file is
	 * given (a file row in the card), the same multi-diff is opened but revealed
	 * at that file, so per-file and whole-prompt review share one experience.
	 */
	async reviewChanges(tick: PromptTick, file?: URI): Promise<void> {
		const files = this.getRequestFiles(tick);
		if (files.length === 0) {
			return;
		}
		const items: MultiDiffEditorItem[] = [];
		let revealResource: { original: URI | undefined; modified: URI | undefined } | undefined;
		for (const f of files) {
			const [originalURI, modifiedURI] = await this._readableSides(f);
			if (!originalURI && !modifiedURI) {
				continue;
			}
			// Diff the best-available before/after content, but let "go to file" open the live file.
			items.push(new MultiDiffEditorItem(originalURI, modifiedURI, f.modifiedURI));
			if (file && isEqual(f.modifiedURI, file)) {
				revealResource = { original: originalURI, modified: modifiedURI };
			}
		}
		if (items.length === 0) {
			return;
		}
		const source = URI.parse(`multi-diff-editor:prompt-timeline/${generateUuid()}`);
		const input = this.instantiationService.createInstance(
			MultiDiffEditorInput,
			source,
			localize('promptTimeline.reviewTitle', "Changes · {0}", tick.text),
			items,
			false,
		);
		const options: IMultiDiffEditorOptions | undefined = revealResource
			? { viewState: { revealData: { resource: revealResource } } }
			: undefined;
		await this.editorService.openEditor(input, options);
	}

	/**
	 * Resolves which sides of a file diff can actually be read. Prefers the frozen
	 * before/after snapshots so only this turn's changes show, but the agent-host
	 * checkpoint blobs backing them can be missing (an added file's original, or a
	 * pruned/restored session where whole checkpoints are gone). The modified side
	 * then falls back to the live working file so review still opens with the best
	 * available fidelity; an unreadable side is dropped so the file still renders
	 * as a pure add/delete instead of crashing the diff editor.
	 */
	private async _readableSides(file: PromptFileDiff): Promise<[URI | undefined, URI | undefined]> {
		// The provider sets originalURI === modifiedURI when there is no "before"
		// (a created file); treat that as no frozen original.
		const hasFrozenOriginal = !isEqual(file.originalURI, file.modifiedURI);
		const hasFrozenModified = !isEqual(file.diffModifiedURI, file.modifiedURI);
		const [frozenOriginalReadable, frozenModifiedReadable, liveModifiedReadable] = await Promise.all([
			hasFrozenOriginal ? this._canRead(file.originalURI) : Promise.resolve(false),
			hasFrozenModified ? this._canRead(file.diffModifiedURI) : Promise.resolve(false),
			this._canRead(file.modifiedURI),
		]);
		const modified = frozenModifiedReadable ? file.diffModifiedURI
			: liveModifiedReadable ? file.modifiedURI
				: undefined;
		return [frozenOriginalReadable ? file.originalURI : undefined, modified];
	}

	private async _canRead(resource: URI): Promise<boolean> {
		// Agent-host git-blob URIs always `stat` successfully even when the blob
		// is missing, so probe with an actual read to detect unreadable sides.
		// Read a single byte: enough to surface a not-found error without pulling
		// whole (potentially large) file contents just to test availability.
		try {
			await this.fileService.readFile(resource, { length: 1 });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * All user prompts (with diff stats where available) for the picker,
	 * independent of the rail's bucketing. Stats are resolved one-shot, so
	 * agent-host prompts not currently observed by the rail fall back to their
	 * timestamp in the picker rather than holding a subscription per prompt.
	 */
	getAllPrompts(): readonly PromptEntry[] {
		return this._prompts.get().map(prompt => {
			const stat = this._statForRequests([prompt.requestId]);
			return stat ? { ...prompt, stat } : { ...prompt };
		});
	}

	/**
	 * Per-request file diffs, preferring the session type's authoritative
	 * provider (agent-host sessions expose a server-computed per-turn changeset
	 * that survives reload), and falling back to the chat editing session.
	 */
	private _diffsForRequest(requestId: string, reader?: IReader): readonly IEditSessionEntryDiff[] {
		const resource = reader ? this._sessionResource.read(reader) : this._sessionResource.get();
		if (resource) {
			const provided = this.chatResponseFileChangesService.getChangesForRequest(resource, requestId);
			if (provided) {
				return reader ? provided.read(reader) : provided.get();
			}
		}
		const session = reader ? this._editingSession.read(reader) : this._editingSession.get();
		if (session) {
			const obs = session.getDiffsForFilesInRequest(requestId);
			return reader ? obs.read(reader) : obs.get();
		}
		return [];
	}

	/** Sums the diff stats across the given requests, or undefined when nothing changed. */
	private _statForRequests(requestIds: readonly string[], reader?: IReader): PromptDiffStat | undefined {
		let added = 0;
		let removed = 0;
		const files = new Set<string>();
		for (const requestId of requestIds) {
			for (const diff of this._diffsForRequest(requestId, reader)) {
				if (diff.identical) {
					continue;
				}
				added += diff.added;
				removed += diff.removed;
				files.add(diff.modifiedURI.toString());
			}
		}
		return files.size > 0 ? { added, removed, fileCount: files.size } : undefined;
	}
}
