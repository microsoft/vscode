/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, mapObservableArrayCached, runOnChange } from '../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { EditSourceBase } from './helpers/documentWithAnnotatedEdits.js';
import { ObservableWorkspace } from './helpers/observableWorkspace.js';

export type AiContributionLevel = 'chatAndAgent' | 'all';

const STORAGE_KEY = 'aiEdits.contributions';
const SAVE_DEBOUNCE_MS = 250;

/**
 * Tracks which URIs have received AI-generated edits, so the git extension
 * can add a `Co-authored-by: Copilot` trailer to commits that touch them.
 *
 * Attribution is recorded per URI: once an AI edit lands in a file, the
 * file is considered AI-contributed until explicitly cleared. State is
 * persisted per workspace so the trailer is still applied after a window
 * reload, after the file is closed, or for files that the agent edited
 * without the user ever opening them in an editor.
 */
export class AiContributionFeature extends Disposable {

	private readonly _contributions = new ResourceMap<AiContributionLevel>();

	private readonly _saveScheduler: RunOnceScheduler;
	private _dirty = false;

	constructor(
		workspace: ObservableWorkspace,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._loadFromStorage();

		this._saveScheduler = this._register(new RunOnceScheduler(() => this._saveToStorage(), SAVE_DEBOUNCE_MS));
		this._register(this._storageService.onWillSaveState(() => {
			if (this._dirty) {
				this._saveScheduler.cancel();
				this._saveToStorage();
			}
		}));

		// Track every loaded document, regardless of editor visibility: the
		// trailer must apply to agent-only edits and survive closing the file.
		const trackedDocs = mapObservableArrayCached(this, workspace.documents, (doc, store) => {
			store.add(runOnChange(doc.value, (_val, _prev, edits) => {
				for (const e of edits) {
					const source = EditSourceBase.create(e.reason);
					if (source.category !== 'ai') {
						continue;
					}
					const level: AiContributionLevel = source.feature === 'chat' ? 'chatAndAgent' : 'all';
					this._record(doc.uri, level);
				}
			}));
		});

		// Force the cached array so per-document subscriptions get wired up.
		this._register(autorun(reader => { trackedDocs.read(reader); }));

		this._register(CommandsRegistry.registerCommand('_aiEdits.hasAiContributions',
			(_acc, resources: UriComponents[], level: AiContributionLevel) => this._hasAiContributions(resources, level)));
		this._register(CommandsRegistry.registerCommand('_aiEdits.clearAiContributions',
			(_acc, resources: UriComponents[]) => this._clearAiContributions(resources)));
		this._register(CommandsRegistry.registerCommand('_aiEdits.clearAllAiContributions',
			() => this._clearAiContributions()));
	}

	public override dispose(): void {
		this._saveScheduler.cancel();
		super.dispose();
		if (this._dirty) {
			this._saveToStorage();
		}
	}

	private _record(uri: URI, level: AiContributionLevel): void {
		const existing = this._contributions.get(uri);
		// `chatAndAgent` is the stronger attribution; never downgrade to `all`.
		if (existing === 'chatAndAgent' || existing === level) {
			return;
		}
		this._contributions.set(uri, level);
		this._markDirty();
	}

	private _markDirty(): void {
		this._dirty = true;
		this._saveScheduler.schedule();
	}

	private _hasAiContributions(resources: UriComponents[], level: AiContributionLevel): boolean {
		for (const r of resources) {
			const recorded = this._contributions.get(URI.from(r, true));
			if (recorded === undefined) {
				continue;
			}
			if (level === 'all' || recorded === 'chatAndAgent') {
				return true;
			}
		}
		return false;
	}

	private _clearAiContributions(resources?: UriComponents[]): void {
		let changed = false;
		if (!resources) {
			if (this._contributions.size > 0) {
				this._contributions.clear();
				changed = true;
			}
		} else {
			for (const r of resources) {
				if (this._contributions.delete(URI.from(r, true))) {
					changed = true;
				}
			}
		}
		if (changed) {
			this._markDirty();
		}
	}

	private _loadFromStorage(): void {
		const raw = this._storageService.get(STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return;
		}
		for (const [uriString, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (value !== 'chatAndAgent' && value !== 'all') {
				continue;
			}
			let uri: URI;
			try {
				uri = URI.parse(uriString);
			} catch {
				continue;
			}
			this._contributions.set(uri, value);
		}
	}

	private _saveToStorage(): void {
		// Only clear `_dirty` after a successful write so retries can flush
		// pending state on the next save attempt.
		try {
			if (this._contributions.size === 0) {
				this._storageService.remove(STORAGE_KEY, StorageScope.WORKSPACE);
			} else {
				const obj: Record<string, AiContributionLevel> = Object.create(null);
				for (const [uri, level] of this._contributions) {
					obj[uri.toString()] = level;
				}
				// MACHINE: attribution is tied to on-disk content of this
				// workspace, which differs per machine.
				this._storageService.store(STORAGE_KEY, JSON.stringify(obj), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}
			this._dirty = false;
		} catch {
			// Keep `_dirty` so the next save can retry.
		}
	}
}
