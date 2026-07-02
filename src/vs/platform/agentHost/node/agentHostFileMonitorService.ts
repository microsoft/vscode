/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { IExpression, ParsedExpression, parse } from '../../../base/common/glob.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { FileChangesEvent, IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export const IAgentHostFileMonitorService = createDecorator<IAgentHostFileMonitorService>('agentHostFileMonitorService');

export const DEFAULT_AGENT_HOST_WATCH_EXCLUDES: readonly string[] = Object.freeze([
	'**/.git/lfs/**',
	'**/.git/logs/**',
	'**/.git/objects/**',
	'**/.git/subtree-cache/**',
	'**/.git/**/*.lock',
	'**/.git/**/FETCH_HEAD',
	'**/.git/**/fsmonitor--daemon/**',
	'**/*.watchman-cookie-*',
]);

export interface IAgentHostFileMonitorOptions {
	readonly excludes?: readonly string[];
	readonly debounceMs?: number;
}

export interface IAgentHostFileMonitorService extends IDisposable {
	readonly _serviceBrand: undefined;
	acquire(folder: URI, callback: () => void, options?: IAgentHostFileMonitorOptions): IDisposable | undefined;
}

interface IMonitorEntry extends IDisposable {
	readonly folder: URI;
	readonly callbacks: Set<() => void>;
	readonly debounce: MutableDisposable<IDisposable>;
	readonly debounceMs: number;
	readonly excludeMatcher: ParsedExpression;
}

function normalizeExcludes(excludes: readonly string[]): readonly string[] {
	return [...excludes].sort();
}

function parseExcludes(excludes: readonly string[]): ParsedExpression {
	const expression: IExpression = Object.create(null);
	for (const exclude of excludes) {
		expression[exclude] = true;
	}
	return parse(expression);
}

export class AgentHostFileMonitorService extends Disposable implements IAgentHostFileMonitorService {
	declare readonly _serviceBrand: undefined;

	private static readonly _DEFAULT_DEBOUNCE_MS = 750;

	private readonly _entries = this._register(new DisposableMap<string, IMonitorEntry>());

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._fileService.onDidFilesChange(event => this._onDidFilesChange(event)));
		this._register(this._fileService.onDidWatchError(error => {
			this._logService.warn('[AgentHostFileMonitorService] File watcher error', error);
		}));
	}

	acquire(folder: URI, callback: () => void, options: IAgentHostFileMonitorOptions = {}): IDisposable | undefined {
		const canonicalFolder = this._canonicalizeFolder(folder);
		const excludes = normalizeExcludes(options.excludes ?? DEFAULT_AGENT_HOST_WATCH_EXCLUDES);
		const debounceMs = options.debounceMs ?? AgentHostFileMonitorService._DEFAULT_DEBOUNCE_MS;
		const key = this._key(canonicalFolder, excludes, debounceMs);

		let entry = this._entries.get(key);
		if (!entry) {
			try {
				entry = this._createEntry(key, canonicalFolder, excludes, debounceMs);
			} catch (err) {
				this._logService.warn(`[AgentHostFileMonitorService] Failed to watch ${canonicalFolder.toString()}`, err);
				return undefined;
			}
			this._entries.set(key, entry);
		}

		entry.callbacks.add(callback);
		return toDisposable(() => {
			const current = this._entries.get(key);
			if (!current) {
				return;
			}
			current.callbacks.delete(callback);
			if (current.callbacks.size === 0) {
				this._entries.deleteAndDispose(key);
			}
		});
	}

	private _createEntry(_key: string, folder: URI, excludes: readonly string[], debounceMs: number): IMonitorEntry {
		const disposable = new DisposableStore();
		try {
			const debounce = disposable.add(new MutableDisposable<IDisposable>());
			const callbacks = new Set<() => void>();
			const excludeMatcher = parseExcludes(excludes);
			disposable.add(this._fileService.watch(folder, { recursive: true, excludes: [...excludes] }));
			return { folder, callbacks, debounce, debounceMs, excludeMatcher, dispose: () => disposable.dispose() };
		} catch (err) {
			disposable.dispose();
			throw err;
		}
	}

	private _onDidFilesChange(event: FileChangesEvent): void {
		for (const key of this._entries.keys()) {
			this._onDidFilesChangeEntry(key, event);
		}
	}

	private _onDidFilesChangeEntry(key: string, event: FileChangesEvent): void {
		const entry = this._entries.get(key);
		if (!entry || entry.callbacks.size === 0) {
			return;
		}
		if (!event.affects(entry.folder) || !this._hasRelevantRawChange(entry, event)) {
			return;
		}
		entry.debounce.value = disposableTimeout(() => {
			entry.debounce.clear();
			for (const callback of [...entry.callbacks]) {
				try {
					callback();
				} catch (err) {
					this._logService.warn('[AgentHostFileMonitorService] Folder change callback failed', err);
				}
			}
		}, entry.debounceMs);
	}

	private _hasRelevantRawChange(entry: IMonitorEntry, event: FileChangesEvent): boolean {
		return this._hasRelevantRawResources(entry, event.rawAdded)
			|| this._hasRelevantRawResources(entry, event.rawUpdated)
			|| this._hasRelevantRawResources(entry, event.rawDeleted);
	}

	private _hasRelevantRawResources(entry: IMonitorEntry, resources: readonly URI[]): boolean {
		for (const resource of resources) {
			if (!extUriBiasedIgnorePathCase.isEqualOrParent(resource, entry.folder)) {
				continue;
			}
			if (!this._isExcluded(entry, resource)) {
				return true;
			}
		}
		return false;
	}

	private _isExcluded(entry: IMonitorEntry, resource: URI): boolean {
		const basename = extUriBiasedIgnorePathCase.basename(resource);
		const relativePath = extUriBiasedIgnorePathCase.relativePath(entry.folder, resource);
		if (relativePath !== undefined && this._matchesExclude(entry, relativePath, basename)) {
			return true;
		}
		return this._matchesExclude(entry, resource.path, basename);
	}

	private _matchesExclude(entry: IMonitorEntry, path: string, basename: string): boolean {
		return typeof entry.excludeMatcher(path, basename) === 'string';
	}

	private _canonicalizeFolder(folder: URI): URI {
		return extUriBiasedIgnorePathCase.removeTrailingPathSeparator(extUriBiasedIgnorePathCase.normalizePath(folder));
	}

	private _key(folder: URI, excludes: readonly string[], debounceMs: number): string {
		return `${extUriBiasedIgnorePathCase.getComparisonKey(folder)}\u0000${debounceMs}\u0000${excludes.join('\n')}`;
	}
}
