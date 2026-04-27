/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { CLAUDE_CONFIG_FOLDER } from '../promptSyntax/config/promptFileLocations.js';
import { IMarketplaceReference, parseMarketplaceReference } from './marketplaceReference.js';

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

export interface IWorkspacePluginSettingsService {
	readonly _serviceBrand: undefined;

	/**
	 * Marketplace references parsed from `extraKnownMarketplaces` in workspace
	 * settings files (`.claude/settings.json`, `.github/copilot/settings.json`).
	 */
	readonly extraMarketplaces: IObservable<readonly IWorkspaceMarketplaceEntry[]>;

	/**
	 * Plugin recommendation map parsed from `enabledPlugins` in workspace
	 * settings files.
	 * Keys are `"pluginName@marketplaceName"`, values indicate recommendation.
	 */
	readonly enabledPlugins: IObservable<ReadonlyMap<string, boolean>>;
}

// --- Parsing helpers ---------------------------------------------------------

interface IMarketplaceSourceJson {
	readonly source?: string;
	readonly repo?: string;
	readonly url?: string;
	readonly path?: string;
}

interface IExtraMarketplaceJson {
	readonly source?: string | IMarketplaceSourceJson;
	readonly repo?: string;
	readonly url?: string;
	readonly path?: string;
}

/**
 * Converts a single `extraKnownMarketplaces` entry into an
 * {@link IMarketplaceReference} by mapping the source format to
 * existing marketplace reference parsing.
 */
function marketplaceEntryToReference(entry: IExtraMarketplaceJson): IMarketplaceReference | undefined {
	// Two shapes supported:
	// 1. { source: "github", repo: "owner/repo" }   →  GitHub shorthand
	// 2. { source: { source: "github", repo: "owner/repo" } }  →  nested
	// 3. { source: "git", url: "https://..." }       →  Git URI

	let sourceType: string | undefined;
	let repo: string | undefined;
	let url: string | undefined;

	if (typeof entry.source === 'object' && entry.source !== null) {
		const nested = entry.source;
		sourceType = nested.source;
		repo = nested.repo;
		url = nested.url;
	} else {
		sourceType = entry.source as string | undefined;
		repo = entry.repo;
		url = entry.url;
	}

	if (sourceType === 'github' && typeof repo === 'string') {
		return parseMarketplaceReference(repo);
	}

	if (sourceType === 'git' && typeof url === 'string') {
		return parseMarketplaceReference(url);
	}

	return undefined;
}

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

		const reference = marketplaceEntryToReference(value as IExtraMarketplaceJson);
		if (!reference) {
			logService.debug(`${logPrefix} Could not parse marketplace reference for: ${name}`);
			continue;
		}

		// Override displayLabel with the user-chosen marketplace name so that
		// fetched plugins use this name in their `marketplace` field, which is
		// what `enabledPlugins` keys reference (e.g. "plugin@claude-settings").
		entries.push({ name, reference: { ...reference, displayLabel: name } });
	}

	return entries;
}

// --- Settings reader (reusable per config folder) ----------------------------

interface IWorkspaceSettingsData {
	readonly marketplaces: readonly IWorkspaceMarketplaceEntry[];
	readonly enabledPlugins: ReadonlyMap<string, boolean>;
}

const EMPTY_DATA: IWorkspaceSettingsData = { marketplaces: [], enabledPlugins: new Map() };

/**
 * Reads `enabledPlugins` and `extraKnownMarketplaces` from a pair of
 * `settings.json` / `settings.local.json` files inside a given config
 * folder (e.g. `.claude/` or `.github/copilot/`) across all workspace
 * folders. Watches for changes and exposes results as an observable.
 */
class WorkspaceSettingsReader extends Disposable {

	private readonly _data = observableValue<IWorkspaceSettingsData>('data', EMPTY_DATA);
	readonly data: IObservable<IWorkspaceSettingsData> = this._data;

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
			() => workspaceContextService.getWorkspace().folders.map(f => f.uri.path ? joinPath(f.uri, configFolder) : joinPath(f.uri.with({ path: '/' }), configFolder)),
		);

		const watcherStore = this._register(new DisposableStore());
		this._register(autorun(reader => {
			const dirs = settingsDirs.read(reader);
			watcherStore.clear();

			// Coalesce rapid file-change events into a single read.
			const scheduler = new RunOnceScheduler(() => this._readSettings(dirs, logPrefix, fileService), 100);
			watcherStore.add(scheduler);

			for (const dir of dirs) {
				const watcher = fileService.createWatcher(dir, { recursive: false, excludes: [] });
				watcherStore.add(watcher);
				watcherStore.add(watcher.onDidChange(e => {
					if (e.affects(joinPath(dir, SETTINGS_FILENAME)) || e.affects(joinPath(dir, SETTINGS_LOCAL_FILENAME))) {
						scheduler.schedule();
					}
				}));
			}

			// Perform initial read immediately.
			this._readSettings(dirs, logPrefix, fileService);
		}));
	}

	private async _readSettings(dirs: readonly URI[], logPrefix: string, fileService: IFileService): Promise<void> {
		const allMarketplaces: IWorkspaceMarketplaceEntry[] = [];
		const mergedEnabled = new Map<string, boolean>();

		for (const dir of dirs) {
			const sharedUri = joinPath(dir, SETTINGS_FILENAME);
			const localUri = joinPath(dir, SETTINGS_LOCAL_FILENAME);

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
						if (!allMarketplaces.some(e => e.reference.canonicalId === entry.reference.canonicalId)) {
							allMarketplaces.push(entry);
						}
					}

					const enabled = parseEnabledPlugins(root.enabledPlugins);
					for (const [key, value] of enabled) {
						mergedEnabled.set(key, value);
					}
				} catch {
					this._logService.debug(`${logPrefix} Could not read ${uri.toString()}`);
				}
			}
		}

		this._data.set({ marketplaces: allMarketplaces, enabledPlugins: mergedEnabled }, undefined);
	}
}

// --- Aggregating service implementation --------------------------------------

export class WorkspacePluginSettingsService extends Disposable implements IWorkspacePluginSettingsService {
	declare readonly _serviceBrand: undefined;

	readonly extraMarketplaces: IObservable<readonly IWorkspaceMarketplaceEntry[]>;
	readonly enabledPlugins: IObservable<ReadonlyMap<string, boolean>>;

	constructor(
		@IFileService fileService: IFileService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ILogService logService: ILogService,
	) {
		super();

		const claudeReader = this._register(new WorkspaceSettingsReader(
			CLAUDE_CONFIG_FOLDER, '[ClaudePluginSettings]',
			fileService, workspaceContextService, logService,
		));

		const copilotReader = this._register(new WorkspaceSettingsReader(
			COPILOT_CONFIG_FOLDER, '[CopilotPluginSettings]',
			fileService, workspaceContextService, logService,
		));

		// Merge marketplaces from all readers, deduplicating by canonical ID.
		this.extraMarketplaces = derived(reader => {
			const claude = claudeReader.data.read(reader).marketplaces;
			const copilot = copilotReader.data.read(reader).marketplaces;
			const byCanonicalId = new Map<string, IWorkspaceMarketplaceEntry>();
			for (const entry of [...claude, ...copilot]) {
				if (!byCanonicalId.has(entry.reference.canonicalId)) {
					byCanonicalId.set(entry.reference.canonicalId, entry);
				}
			}
			return [...byCanonicalId.values()];
		});

		// Merge enabledPlugins from all readers. Claude entries take
		// precedence for keys that exist in both (first-writer wins).
		this.enabledPlugins = derived(reader => {
			const claude = claudeReader.data.read(reader).enabledPlugins;
			const copilot = copilotReader.data.read(reader).enabledPlugins;
			const merged = new Map<string, boolean>();
			for (const [key, value] of claude) {
				merged.set(key, value);
			}
			for (const [key, value] of copilot) {
				if (!merged.has(key)) {
					merged.set(key, value);
				}
			}
			return merged;
		});
	}
}
