/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { CLAUDE_CONFIG_FOLDER } from '../promptSyntax/config/promptFileLocations.js';
import { IMarketplaceReference, parseMarketplaceObjectEntry } from './marketplaceReference.js';

const SETTINGS_FILENAME = 'settings.json';
const SETTINGS_LOCAL_FILENAME = 'settings.local.json';

/** Copilot CLI settings folder inside `.github/`. */
const COPILOT_CONFIG_FOLDER = '.github/copilot';

/**
 * Minimal representation of a marketplace entry from `extraKnownMarketplaces`.
 */
export interface IWorkspaceMarketplaceEntry {
	readonly name: string;
	readonly reference: IMarketplaceReference;
}

export const IWorkspacePluginSettingsService = createDecorator<IWorkspacePluginSettingsService>('workspacePluginSettingsService');

export interface IWorkspacePluginSettings {
	readonly workspaceFolder: URI;
	readonly extraMarketplaces: readonly IWorkspaceMarketplaceEntry[];
	readonly enabledPlugins: ReadonlyMap<string, boolean>;
}

export interface IWorkspacePluginSettingsService {
	readonly _serviceBrand: undefined;

	/** Repository plugin settings keyed by their source workspace folder. */
	readonly workspaceSettings: IObservable<readonly IWorkspacePluginSettings[]>;

	/**
	 * Marketplace references parsed from `extraKnownMarketplaces` in trusted
	 * workspace settings files (`.claude/settings.json`, `.github/copilot/settings.json`).
	 */
	readonly extraMarketplaces: IObservable<readonly IWorkspaceMarketplaceEntry[]>;

	/**
	 * Repository-scoped plugin activation map parsed from `enabledPlugins` in
	 * trusted workspace settings files. Keys are `"pluginName@marketplaceName"`.
	 */
	readonly enabledPlugins: IObservable<ReadonlyMap<string, boolean>>;

	/** Resolves after the current workspace settings reads have completed. */
	whenSettled(): Promise<void>;

	/** Returns settings for the workspace folder containing `resource`. */
	getWorkspaceSettings(resource: URI, reader?: IReader): IWorkspacePluginSettings | undefined;
}

// --- Parsing helpers ---------------------------------------------------------

/**
 * Parses `enabledPlugins` from a JSON object.
 */
function parseEnabledPlugins(json: unknown): ReadonlyMap<string, boolean> {
	const result = new Map<string, boolean>();

	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		return result;
	}

	const obj = json as Record<string, unknown>;
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'boolean') {
			result.set(key, value);
		}
	}

	return result;
}

/**
 * Parses `extraKnownMarketplaces` from a JSON object.
 */
function parseExtraMarketplaces(json: unknown, logPrefix: string, logService: ILogService): readonly IWorkspaceMarketplaceEntry[] {
	const entries: IWorkspaceMarketplaceEntry[] = [];

	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		return entries;
	}

	const obj = json as Record<string, unknown>;
	for (const [name, value] of Object.entries(obj)) {
		if (!value || typeof value !== 'object') {
			logService.debug(`${logPrefix} Ignoring non-object extraKnownMarketplaces entry: ${name}`);
			continue;
		}

		const reference = parseMarketplaceObjectEntry({ ...value, name });
		if (!reference) {
			logService.debug(`${logPrefix} Could not parse marketplace reference for: ${name}`);
			continue;
		}

		entries.push({ name, reference });
	}

	return entries;
}

// --- Settings reader (reusable per config folder) ----------------------------

interface IWorkspaceSettingsData {
	readonly workspaceFolder: URI;
	readonly marketplaces: readonly IWorkspaceMarketplaceEntry[];
	readonly enabledPlugins: ReadonlyMap<string, boolean>;
}

interface IWorkspaceSettingsDirectory {
	readonly workspaceFolder: URI;
	readonly settingsDirectory: URI;
}

/**
 * Reads `enabledPlugins` and `extraKnownMarketplaces` from a pair of
 * `settings.json` / `settings.local.json` files inside a given config
 * folder (e.g. `.claude/` or `.github/copilot/`) across all workspace
 * folders. Watches for changes and exposes results as an observable.
 */
class WorkspaceSettingsReader extends Disposable {

	private readonly _data = observableValue<readonly IWorkspaceSettingsData[]>('data', []);
	private _readVersion = 0;
	private _pendingRead: Promise<void> = Promise.resolve();
	readonly data: IObservable<readonly IWorkspaceSettingsData[]> = this._data;

	constructor(
		/** Workspace-relative config folder (e.g. `.claude`). */
		configFolder: string,
		logPrefix: string,
		fileService: IFileService,
		workspaceContextService: IWorkspaceContextService,
		private readonly _logService: ILogService,
	) {
		super();

		const settingsDirs = observableFromEvent(
			this,
			workspaceContextService.onDidChangeWorkspaceFolders,
			() => workspaceContextService.getWorkspace().folders.map(folder => ({
				workspaceFolder: folder.uri,
				settingsDirectory: folder.uri.path ? joinPath(folder.uri, configFolder) : joinPath(folder.uri.with({ path: '/' }), configFolder),
			})),
		);

		const watcherStore = this._register(new DisposableStore());
		this._register(autorun(reader => {
			const dirs = settingsDirs.read(reader);
			watcherStore.clear();

			const scheduler = new RunOnceScheduler(() => {
				this._pendingRead = this._readSettings(dirs, logPrefix, fileService);
			}, 100);
			watcherStore.add(scheduler);

			for (const { settingsDirectory } of dirs) {
				const watcher = fileService.createWatcher(settingsDirectory, { recursive: false, excludes: [] });
				watcherStore.add(watcher);
				watcherStore.add(watcher.onDidChange(e => {
					if (e.affects(joinPath(settingsDirectory, SETTINGS_FILENAME)) || e.affects(joinPath(settingsDirectory, SETTINGS_LOCAL_FILENAME))) {
						scheduler.schedule();
					}
				}));
			}

			this._data.set([], undefined);
			this._pendingRead = this._readSettings(dirs, logPrefix, fileService);
		}));
	}

	async whenSettled(): Promise<void> {
		while (true) {
			const pendingRead = this._pendingRead;
			await pendingRead;
			if (pendingRead === this._pendingRead) {
				return;
			}
		}
	}

	private async _readSettings(dirs: readonly IWorkspaceSettingsDirectory[], logPrefix: string, fileService: IFileService): Promise<void> {
		const readVersion = ++this._readVersion;
		const result: IWorkspaceSettingsData[] = [];

		for (const { workspaceFolder, settingsDirectory } of dirs) {
			const mergedMarketplaces = new Map<string, IWorkspaceMarketplaceEntry>();
			const mergedEnabled = new Map<string, boolean>();
			const sharedUri = joinPath(settingsDirectory, SETTINGS_FILENAME);
			const localUri = joinPath(settingsDirectory, SETTINGS_LOCAL_FILENAME);

			for (const uri of [sharedUri, localUri]) {
				try {
					const content = await fileService.readFile(uri);
					const json = parseJSONC(content.value.toString());

					if (!json || typeof json !== 'object') {
						continue;
					}

					const root = json as Record<string, unknown>;

					const marketplaces = parseExtraMarketplaces(root.extraKnownMarketplaces, logPrefix, this._logService);
					for (const entry of marketplaces) {
						mergedMarketplaces.set(entry.name, entry);
					}

					const enabled = parseEnabledPlugins(root.enabledPlugins);
					for (const [key, value] of enabled) {
						mergedEnabled.set(key, value);
					}
				} catch {
					this._logService.debug(`${logPrefix} Could not read ${uri.toString()}`);
				}
			}

			result.push({
				workspaceFolder,
				marketplaces: [...mergedMarketplaces.values()],
				enabledPlugins: mergedEnabled,
			});
		}

		if (readVersion === this._readVersion) {
			this._data.set(result, undefined);
		}
	}
}

// --- Aggregating service implementation --------------------------------------

export class WorkspacePluginSettingsService extends Disposable implements IWorkspacePluginSettingsService {
	declare readonly _serviceBrand: undefined;

	readonly workspaceSettings: IObservable<readonly IWorkspacePluginSettings[]>;
	readonly extraMarketplaces: IObservable<readonly IWorkspaceMarketplaceEntry[]>;
	readonly enabledPlugins: IObservable<ReadonlyMap<string, boolean>>;

	constructor(
		@IFileService fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService logService: ILogService,
		@IWorkspaceTrustManagementService workspaceTrustService: IWorkspaceTrustManagementService,
	) {
		super();

		const claudeReader = this._register(new WorkspaceSettingsReader(
			CLAUDE_CONFIG_FOLDER, '[ClaudePluginSettings]',
			fileService, this._workspaceContextService, logService,
		));

		const copilotReader = this._register(new WorkspaceSettingsReader(
			COPILOT_CONFIG_FOLDER, '[CopilotPluginSettings]',
			fileService, this._workspaceContextService, logService,
		));

		const workspaceTrusted = observableFromEvent(this, workspaceTrustService.onDidChangeTrust, () => workspaceTrustService.isWorkspaceTrusted());

		this.workspaceSettings = derived(reader => {
			if (!workspaceTrusted.read(reader)) {
				return [];
			}

			const claudeSettings = claudeReader.data.read(reader);
			const copilotSettings = copilotReader.data.read(reader);
			return copilotSettings.map(copilot => {
				const claude = claudeSettings.find(candidate => isEqual(candidate.workspaceFolder, copilot.workspaceFolder));
				const extraMarketplaces: IWorkspaceMarketplaceEntry[] = [];
				const seenNames = new Set<string>();
				const seenCanonicalIds = new Set<string>();
				for (const entry of [...copilot.marketplaces, ...(claude?.marketplaces ?? [])]) {
					if (!seenNames.has(entry.name) && !seenCanonicalIds.has(entry.reference.canonicalId)) {
						extraMarketplaces.push(entry);
						seenNames.add(entry.name);
						seenCanonicalIds.add(entry.reference.canonicalId);
					}
				}

				const enabledPlugins = new Map(copilot.enabledPlugins);
				for (const [key, value] of claude?.enabledPlugins ?? []) {
					if (!enabledPlugins.has(key)) {
						enabledPlugins.set(key, value);
					}
				}

				return {
					workspaceFolder: copilot.workspaceFolder,
					extraMarketplaces,
					enabledPlugins,
				};
			});
		});

		this.extraMarketplaces = derived(reader => {
			const result: IWorkspaceMarketplaceEntry[] = [];
			const seenCanonicalIds = new Set<string>();
			for (const settings of this.workspaceSettings.read(reader)) {
				for (const entry of settings.extraMarketplaces) {
					if (!seenCanonicalIds.has(entry.reference.canonicalId)) {
						result.push(entry);
						seenCanonicalIds.add(entry.reference.canonicalId);
					}
				}
			}
			return result;
		});

		this.enabledPlugins = derived(reader => {
			const merged = new Map<string, boolean>();
			for (const settings of this.workspaceSettings.read(reader)) {
				for (const [key, value] of settings.enabledPlugins) {
					merged.set(key, value || merged.get(key) === true);
				}
			}
			return merged;
		});

		this.whenSettled = async () => {
			await Promise.all([claudeReader.whenSettled(), copilotReader.whenSettled()]);
		};
	}

	readonly whenSettled: () => Promise<void>;

	getWorkspaceSettings(resource: URI, reader?: IReader): IWorkspacePluginSettings | undefined {
		const workspaceFolder = this._workspaceContextService.getWorkspaceFolder(resource);
		if (!workspaceFolder) {
			return undefined;
		}
		const settings = reader ? this.workspaceSettings.read(reader) : this.workspaceSettings.get();
		return settings.find(candidate => isEqual(candidate.workspaceFolder, workspaceFolder.uri));
	}
}
