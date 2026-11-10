/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { basename, dirname, extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import type { URI } from '../../../../base/common/uri.js';
import { FileChangeType, FileOperationResult, IFileService, toFileOperationResult, type FileChangesEvent } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { MODEL_ROUTER_MAX_FILE_BYTES, modelRouterNameFromFileName, modelRouterNameFromModelId, ModelRouterDiagnosticSeverity, parseModelRouter, type IModelRouter, type IModelRouterDiagnostic, type IModelRouterParseResult } from '../../common/modelRouter.js';

export type ModelRouterScope = 'user' | 'workspace' | 'plugin';

export interface IModelRouterFile {
	readonly uri: URI;
	readonly scope: ModelRouterScope;
	readonly name: string;
	/** Undefined when the file has errors. */
	readonly router: IModelRouter | undefined;
	readonly diagnostics: readonly IModelRouterDiagnostic[];
}

export interface IModelRouterSnapshot {
	/** Every router file found, valid or not, in precedence order with one file per name. */
	readonly files: readonly IModelRouterFile[];
}

/** Where routers come from. v1 reads only the user's folders; workspace and plugin sources can be added later. */
export interface IModelRouterSource extends IDisposable {
	readonly scope: ModelRouterScope;
	readonly onDidChange: Event<void>;
	read(token: CancellationToken): Promise<readonly IModelRouterFile[]>;
}

const RESCAN_DELAY_MS = 200;

/**
 * Router files in the user's folders, in order: `~/.agents/model-routers/` and then
 * `~/.copilot/model-routers/`. A name found in an earlier folder wins over a later one.
 */
export class UserModelRouterSource extends Disposable implements IModelRouterSource {
	readonly scope = 'user';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _watchers = this._register(new MutableDisposable<DisposableStore>());
	/** The `name` each file last parsed with, so a router keeps its id while an edit has errors. */
	private readonly _lastNames = new ResourceMap<string>();

	constructor(
		private readonly _folders: readonly URI[],
		/** The highest folder to watch while a router folder doesn't exist yet. */
		private readonly _watchRoot: URI,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		void this._watch();
	}

	async read(token: CancellationToken): Promise<readonly IModelRouterFile[]> {
		const files: IModelRouterFile[] = [];
		const seen = new Map<string, URI>();
		for (const folder of this._folders) {
			let children;
			try {
				children = (await this._fileService.resolve(folder)).children ?? [];
			} catch {
				continue;
			}
			const routerFiles = children
				.filter(child => child.isFile && modelRouterNameFromFileName(child.name) !== undefined)
				.sort((a, b) => a.name.localeCompare(b.name));
			for (const child of routerFiles) {
				if (token.isCancellationRequested) {
					return files;
				}
				const fileName = basename(child.resource);
				let result: IModelRouterParseResult;
				try {
					result = parseModelRouter((await this._fileService.readFile(child.resource, { limits: { size: MODEL_ROUTER_MAX_FILE_BYTES } })).value.toString(), fileName);
				} catch (error) {
					if (toFileOperationResult(error) !== FileOperationResult.FILE_TOO_LARGE) {
						this._logService.warn(`[ModelRouter] Could not read ${child.resource.toString()}`, error);
						continue;
					}
					result = { router: undefined, diagnostics: [{ severity: ModelRouterDiagnosticSeverity.Error, message: `A model router file is at most ${MODEL_ROUTER_MAX_FILE_BYTES / 1024} KiB.` }] };
				}
				const name = result.router?.name ?? result.name ?? this._lastNames.get(child.resource) ?? modelRouterNameFromFileName(fileName)!;
				if (result.name) {
					this._lastNames.set(child.resource, result.name);
				}
				const shadowing = seen.get(name);
				if (shadowing) {
					this._logService.warn(`[ModelRouter] ${child.resource.toString()} is ignored: ${shadowing.toString()} has the same name`);
					continue;
				}
				seen.set(name, child.resource);
				files.push({ uri: child.resource, scope: this.scope, name, router: result.router, diagnostics: result.diagnostics });
			}
		}
		return files;
	}

	/**
	 * Watches each folder, or its nearest existing parent so a folder created later is noticed.
	 * Events come from every watcher in the process, so a parent only counts the creation or
	 * deletion of a folder on the way to a router folder, not every change beneath it.
	 */
	private async _watch(): Promise<void> {
		const store = new DisposableStore();
		const watched: URI[] = [];
		/** Folders between a watched parent and a router folder, including the router folder. */
		const pending: URI[] = [];
		for (const folder of this._folders) {
			let target = folder;
			while (!(await this._fileService.exists(target)) && extUriBiasedIgnorePathCase.isEqualOrParent(dirname(target), this._watchRoot) && !isEqual(target, this._watchRoot)) {
				pending.push(target);
				target = dirname(target);
			}
			if (this._store.isDisposed) {
				store.dispose();
				return;
			}
			if (!watched.some(uri => isEqual(uri, target))) {
				watched.push(target);
				store.add(this._fileService.watch(target, { recursive: false, excludes: [] }));
			}
		}
		const isRouterChange = (event: FileChangesEvent) => this._folders.some(folder => event.affects(folder));
		const isFolderAddedOrRemoved = (event: FileChangesEvent) => pending.some(folder => event.contains(folder, FileChangeType.ADDED, FileChangeType.DELETED));
		store.add(this._fileService.onDidFilesChange(event => {
			const folderChanged = isFolderAddedOrRemoved(event);
			if (!folderChanged && !isRouterChange(event)) {
				return;
			}
			this._onDidChange.fire();
			if (folderChanged) {
				void this._watch();
			}
		}));
		this._watchers.value = store;
	}
}

/**
 * The model routers on this host. It rescans when a source changes, and a newer scan
 * always wins, so a slow scan never publishes stale routers.
 */
export class CopilotModelRouterCatalog extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when a scan publishes a new snapshot. */
	readonly onDidChange = this._onDidChange.event;

	private _generation = 0;
	private _scan!: Promise<IModelRouterSnapshot>;
	private _snapshot: IModelRouterSnapshot | undefined;
	private readonly _rescan = this._register(new RunOnceScheduler(() => this._startScan(), RESCAN_DELAY_MS));

	constructor(
		private readonly _sources: readonly IModelRouterSource[],
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		for (const source of _sources) {
			this._register(source);
			this._register(source.onDidChange(() => this._rescan.schedule()));
		}
		this._startScan();
	}

	/** The latest finished scan, or `undefined` before the first one finishes. */
	get snapshot(): IModelRouterSnapshot | undefined {
		return this._snapshot;
	}

	/** The snapshot after the latest scan, following any scan that starts in the meantime. */
	async whenSettled(token: CancellationToken = CancellationToken.None): Promise<IModelRouterSnapshot | undefined> {
		while (!token.isCancellationRequested) {
			// A change already seen should be in the result, so don't wait out the rescan delay.
			this._rescan.flush();
			const generation = this._generation;
			const snapshot = await raceCancellation(this._scan, token);
			if (snapshot === undefined || (generation === this._generation && !this._rescan.isScheduled())) {
				return snapshot;
			}
		}
		return undefined;
	}

	private _startScan(): void {
		const generation = ++this._generation;
		this._scan = this._read().then(snapshot => {
			if (generation === this._generation && !this._store.isDisposed) {
				this._snapshot = snapshot;
				this._onDidChange.fire();
			}
			return snapshot;
		});
	}

	private async _read(): Promise<IModelRouterSnapshot> {
		const files: IModelRouterFile[] = [];
		const names = new Set<string>();
		for (const source of this._sources) {
			let read: readonly IModelRouterFile[];
			try {
				read = await source.read(CancellationToken.None);
			} catch (error) {
				this._logService.error(`[ModelRouter] Could not read ${source.scope} routers`, error);
				continue;
			}
			for (const file of read) {
				if (!names.has(file.name)) {
					names.add(file.name);
					files.push(file);
				}
			}
		}
		const invalid = files.filter(file => !file.router).length;
		this._logService.info(`[ModelRouter] Found ${files.length} router${files.length === 1 ? '' : 's'}${invalid ? ` (${invalid} with errors)` : ''}`);
		return { files };
	}
}

/**
 * The router a turn's model id selects. `chat` is unused while routers come only from the
 * user's folders; workspace routers will resolve against the chat's own workspace.
 */
export function findModelRouter(snapshot: IModelRouterSnapshot | undefined, _chat: URI, modelId: string): IModelRouterFile | undefined {
	const name = modelRouterNameFromModelId(modelId);
	return name === undefined ? undefined : snapshot?.files.find(file => file.name === name);
}

/** The first error in a router file, for notices. */
export function firstModelRouterError(file: IModelRouterFile): string | undefined {
	return file.diagnostics.find(diagnostic => diagnostic.severity === ModelRouterDiagnosticSeverity.Error)?.message;
}
