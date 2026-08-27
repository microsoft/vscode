/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParseError, parse as parseJSONC } from '../../../../../base/common/json.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { CLAUDE_CONFIG_FOLDER } from '../promptSyntax/config/promptFileLocations.js';
import { IMarketplaceReference, parseMarketplaceObjectEntry } from './marketplaceReference.js';
import { AgentPluginConfigurationEntryPoint, AgentPluginConfigurationTelemetryClassification, IAgentPluginConfigurationTelemetryEvent } from './agentPluginTelemetry.js';

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
	readonly marketplaces: readonly IWorkspaceMarketplaceEntry[];
	readonly enabledPlugins: ReadonlyMap<string, boolean>;
	readonly telemetryRows: readonly IWorkspacePluginSettingsTelemetryRow[];
}

export enum WorkspacePluginSettingsFileKind {
	ClaudeShared = 'claudeShared',
	ClaudeLocal = 'claudeLocal',
	CopilotShared = 'copilotShared',
	CopilotLocal = 'copilotLocal',
}

interface IWorkspacePluginSettingsTelemetryRow {
	readonly settingsFileKind: WorkspacePluginSettingsFileKind;
	readonly configurationPresent: number;
	readonly marketplaceCount: number;
	readonly enabledPluginCount: number;
	readonly disabledPluginCount: number;
	readonly parseErrorCount: number;
	readonly unreadableCount: number;
}

/**
 * Reads `enabledPlugins` and `extraKnownMarketplaces` from a pair of
 * `settings.json` / `settings.local.json` files inside a given config
 * folder (e.g. `.claude/` or `.github/copilot/`) across all workspace
 * folders. Watches for changes and exposes results as an observable.
 */
class WorkspaceSettingsReader extends Disposable {

	private readonly _data = observableValue<IWorkspaceSettingsData | undefined>('data', undefined);
	readonly data: IObservable<IWorkspaceSettingsData | undefined> = this._data;

	constructor(
		/** Workspace-relative config folder (e.g. `.claude`). */
		configFolder: string,
		settingsFileKinds: readonly [WorkspacePluginSettingsFileKind, WorkspacePluginSettingsFileKind],
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
			const scheduler = new RunOnceScheduler(() => this._readSettings(dirs, settingsFileKinds, logPrefix, fileService), 100);
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
			this._readSettings(dirs, settingsFileKinds, logPrefix, fileService);
		}));
	}

	private async _readSettings(dirs: readonly URI[], settingsFileKinds: readonly [WorkspacePluginSettingsFileKind, WorkspacePluginSettingsFileKind], logPrefix: string, fileService: IFileService): Promise<void> {
		const allMarketplaces: IWorkspaceMarketplaceEntry[] = [];
		const mergedEnabled = new Map<string, boolean>();
		const telemetryRows: IWorkspacePluginSettingsTelemetryRow[] = [];

		for (const dir of dirs) {
			const sharedUri = joinPath(dir, SETTINGS_FILENAME);
			const localUri = joinPath(dir, SETTINGS_LOCAL_FILENAME);

			for (const [uri, settingsFileKind] of [[sharedUri, settingsFileKinds[0]], [localUri, settingsFileKinds[1]]] as const) {
				try {
					const content = await fileService.readFile(uri);
					const errors: ParseError[] = [];
					const json = parseJSONC(content.value.toString(), errors);

					if (!json || typeof json !== 'object' || Array.isArray(json)) {
						telemetryRows.push({ settingsFileKind, configurationPresent: 1, marketplaceCount: 0, enabledPluginCount: 0, disabledPluginCount: 0, parseErrorCount: 1, unreadableCount: 0 });
						continue;
					}

					const root = json as Record<string, unknown>;
					const hasInvalidMarketplaceShape = root.extraKnownMarketplaces !== undefined
						&& (!root.extraKnownMarketplaces || typeof root.extraKnownMarketplaces !== 'object' || Array.isArray(root.extraKnownMarketplaces));
					const hasInvalidEnablementShape = root.enabledPlugins !== undefined
						&& (!root.enabledPlugins || typeof root.enabledPlugins !== 'object' || Array.isArray(root.enabledPlugins));

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
					telemetryRows.push({
						settingsFileKind,
						configurationPresent: 1,
						marketplaceCount: marketplaces.length,
						enabledPluginCount: [...enabled.values()].filter(value => value).length,
						disabledPluginCount: [...enabled.values()].filter(value => !value).length,
						parseErrorCount: errors.length > 0 || hasInvalidMarketplaceShape || hasInvalidEnablementShape ? 1 : 0,
						unreadableCount: 0,
					});
				} catch (error) {
					telemetryRows.push({
						settingsFileKind,
						configurationPresent: toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND ? 0 : 1,
						marketplaceCount: 0,
						enabledPluginCount: 0,
						disabledPluginCount: 0,
						parseErrorCount: 0,
						unreadableCount: toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND ? 0 : 1,
					});
					this._logService.debug(`${logPrefix} Could not read ${uri.toString()}`);
				}
			}
		}

		this._data.set({ marketplaces: allMarketplaces, enabledPlugins: mergedEnabled, telemetryRows }, undefined);
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
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		const claudeReader = this._register(new WorkspaceSettingsReader(
			CLAUDE_CONFIG_FOLDER, [WorkspacePluginSettingsFileKind.ClaudeShared, WorkspacePluginSettingsFileKind.ClaudeLocal], '[ClaudePluginSettings]',
			fileService, workspaceContextService, logService,
		));

		const copilotReader = this._register(new WorkspaceSettingsReader(
			COPILOT_CONFIG_FOLDER, [WorkspacePluginSettingsFileKind.CopilotShared, WorkspacePluginSettingsFileKind.CopilotLocal], '[CopilotPluginSettings]',
			fileService, workspaceContextService, logService,
		));

		// Merge marketplaces from all readers, deduplicating by canonical ID.
		this.extraMarketplaces = derived(reader => {
			const claude = claudeReader.data.read(reader)?.marketplaces ?? [];
			const copilot = copilotReader.data.read(reader)?.marketplaces ?? [];
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
			const claude = claudeReader.data.read(reader)?.enabledPlugins ?? new Map();
			const copilot = copilotReader.data.read(reader)?.enabledPlugins ?? new Map();
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

		const lastMarketplaceRows = new Map<string, IAgentPluginConfigurationTelemetryEvent>();
		const lastEnablementRows = new Map<string, IAgentPluginConfigurationTelemetryEvent>();
		const emitChangedRows = (
			eventName: 'agentPluginMarketplacesConfigured' | 'agentPluginEnablementConfigured',
			rows: readonly IAgentPluginConfigurationTelemetryEvent[],
			previous: Map<string, IAgentPluginConfigurationTelemetryEvent>,
		) => {
			const current = new Map<string, IAgentPluginConfigurationTelemetryEvent>(rows
				.filter(row => row.configurationPresent > 0)
				.map(row => [row.settingsFileKind, row] as const));
			const changed: IAgentPluginConfigurationTelemetryEvent[] = [];
			for (const [key, row] of current) {
				if (JSON.stringify(previous.get(key)) !== JSON.stringify(row)) {
					changed.push(row);
				}
			}
			for (const [key, row] of previous) {
				if (!current.has(key)) {
					changed.push({ ...row, configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 });
				}
			}
			previous.clear();
			for (const [key, row] of current) {
				previous.set(key, row);
			}
			for (const row of changed.sort((a, b) => a.settingsFileKind.localeCompare(b.settingsFileKind))) {
				telemetryService.publicLog2<IAgentPluginConfigurationTelemetryEvent, AgentPluginConfigurationTelemetryClassification>(eventName, row);
			}
		};
		this._register(autorun(reader => {
			const claudeData = claudeReader.data.read(reader);
			const copilotData = copilotReader.data.read(reader);
			if (!claudeData || !copilotData) {
				return;
			}
			const rows = [...claudeData.telemetryRows, ...copilotData.telemetryRows];
			const aggregated = Object.values(WorkspacePluginSettingsFileKind).map(settingsFileKind => {
				const matching = rows.filter(row => row.settingsFileKind === settingsFileKind);
				return matching.reduce<IWorkspacePluginSettingsTelemetryRow>((result, row) => ({
					settingsFileKind,
					configurationPresent: result.configurationPresent + row.configurationPresent,
					marketplaceCount: result.marketplaceCount + row.marketplaceCount,
					enabledPluginCount: result.enabledPluginCount + row.enabledPluginCount,
					disabledPluginCount: result.disabledPluginCount + row.disabledPluginCount,
					parseErrorCount: result.parseErrorCount + row.parseErrorCount,
					unreadableCount: result.unreadableCount + row.unreadableCount,
				}), { settingsFileKind, configurationPresent: 0, marketplaceCount: 0, enabledPluginCount: 0, disabledPluginCount: 0, parseErrorCount: 0, unreadableCount: 0 });
			});
			const marketplaceRows = aggregated.map(row => this.toTelemetryRow(row, 'workspaceMarketplaces', row.marketplaceCount, row.marketplaceCount, 0));
			emitChangedRows('agentPluginMarketplacesConfigured', marketplaceRows, lastMarketplaceRows);
			const enablementRows = aggregated.map(row => this.toTelemetryRow(row, 'workspaceEnabledPlugins', row.enabledPluginCount + row.disabledPluginCount, row.enabledPluginCount, row.disabledPluginCount));
			emitChangedRows('agentPluginEnablementConfigured', enablementRows, lastEnablementRows);
		}));
	}

	private toTelemetryRow(row: IWorkspacePluginSettingsTelemetryRow, entryPoint: Extract<AgentPluginConfigurationEntryPoint, 'workspaceMarketplaces' | 'workspaceEnabledPlugins'>, configuredEntryCount: number, enabledEntryCount: number, disabledEntryCount: number): IAgentPluginConfigurationTelemetryEvent {
		return {
			scope: 'workspace',
			entryPoint,
			settingsFileKind: row.settingsFileKind,
			configurationPresent: row.configurationPresent,
			configuredEntryCount,
			enabledEntryCount,
			disabledEntryCount,
			parseErrorCount: row.parseErrorCount,
			unreadableCount: row.unreadableCount,
		};
	}
}
