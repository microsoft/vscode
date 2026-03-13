/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { untildify } from '../../../../../base/common/labels.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { cloneAndChange, equals } from '../../../../../base/common/objects.js';
import { autorun, derived, derivedOpts, IObservable, ObservablePromise, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import {
	posix,
	win32
} from '../../../../../base/common/path.js';
import {
	basename,
	extname, isEqualOrParent, joinPath, normalizePath
} from '../../../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { hasKey, Mutable } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMcpServerConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ChatConfiguration } from '../constants.js';
import { EnablementModel, IEnablementModel } from '../enablement.js';
import { parseClaudeHooks } from '../promptSyntax/hookClaudeCompat.js';
import { parseCopilotHooks } from '../promptSyntax/hookCompatibility.js';
import { IHookCommand } from '../promptSyntax/hookSchema.js';
import { IAgentPluginRepositoryService } from './agentPluginRepositoryService.js';
import { agentPluginDiscoveryRegistry, IAgentPlugin, IAgentPluginDiscovery, IAgentPluginHook, IAgentPluginInstruction, IAgentPluginMcpServerDefinition, IAgentPluginService, IAgentPluginSkill } from './agentPluginService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from './pluginMarketplaceService.js';

const COMMAND_FILE_SUFFIX = '.md';

/** File suffixes accepted for rule/instruction files (longest first for correct name stripping). */
const RULE_FILE_SUFFIXES = ['.instructions.md', '.mdc', '.md'];

const enum AgentPluginFormat {
	Copilot,
	Claude,
	OpenPlugin,
}

interface IAgentPluginFormatAdapter {
	readonly format: AgentPluginFormat;
	readonly manifestPath: string;
	readonly hookConfigPath: string;
	parseHooks(json: unknown, pluginUri: URI, userHome: string): IAgentPluginHook[];
}

function mapParsedHooks(parsed: Map<IAgentPluginHook['type'], { hooks: IAgentPluginHook['hooks']; originalId: string }>): IAgentPluginHook[] {
	return [...parsed.entries()].map(([type, { hooks, originalId }]) => ({ type, hooks, originalId }));
}

/**
 * Resolves the workspace folder that contains the plugin URI for cwd resolution,
 * falling back to the first workspace folder for plugins outside the workspace.
 */
function resolveWorkspaceRoot(pluginUri: URI, workspaceContextService: IWorkspaceContextService): URI | undefined {
	const defaultFolder = workspaceContextService.getWorkspace().folders[0];
	const folder = workspaceContextService.getWorkspaceFolder(pluginUri) ?? defaultFolder;
	return folder?.uri;
}

class CopilotPluginFormatAdapter implements IAgentPluginFormatAdapter {
	readonly format = AgentPluginFormat.Copilot;
	readonly manifestPath = 'plugin.json';
	readonly hookConfigPath = 'hooks.json';

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	parseHooks(json: unknown, pluginUri: URI, userHome: string): IAgentPluginHook[] {
		const workspaceRoot = resolveWorkspaceRoot(pluginUri, this._workspaceContextService);
		return mapParsedHooks(parseCopilotHooks(json, workspaceRoot, userHome));
	}
}

/**
 * Characters in a file path that require shell quoting to prevent
 * word splitting or interpretation by common shells (bash, zsh, cmd, PowerShell).
 */
const shellUnsafeChars = /[\s&|<>()^;!`"']/;

/**
 * Replaces `${CLAUDE_PLUGIN_ROOT}` in a shell command string with the
 * given fsPath. If the path contains characters that would break shell
 * parsing (e.g. spaces), occurrences are wrapped in double-quotes.
 *
 * The token may be followed by additional path segments like
 * `${CLAUDE_PLUGIN_ROOT}/scripts/run.sh`; the entire resulting path
 * (including suffix) is quoted as one unit.
 *
 */
export function shellQuotePluginRootInCommand(command: string, fsPath: string, token: string) {
	if (!command.includes(token)) {
		return command;
	}

	if (!shellUnsafeChars.test(fsPath)) {
		// Path is shell-safe; plain replacement is fine.
		return command.replaceAll(token, fsPath);
	}

	// Replace each token occurrence (plus any trailing path chars that form
	// a single filesystem argument) with a properly double-quoted expansion.
	const escapedToken = escapeRegExpCharacters(token);
	const pattern = new RegExp(
		// Capture an optional leading quote so we know if it's already quoted
		`(["']?)` + escapedToken + `([\\w./\\\\~:-]*)`,
		'g',
	);

	return command.replace(pattern, (_match, leadingQuote: string, suffix: string) => {
		const fullPath = fsPath + suffix;
		if (leadingQuote) {
			// Already inside quotes — don't add more, just expand.
			return leadingQuote + fullPath;
		}
		// Wrap in double quotes, escaping any embedded double-quote chars.
		return '"' + fullPath.replace(/"/g, '\\"') + '"';
	});
}

/**
 * Shared hook-parsing logic for plugin formats that use the Claude/open-plugin
 * hook schema. Replaces `${token}` references in hook commands with the plugin
 * root path (shell-quoted when necessary), injects an environment variable, and
 * delegates to {@link parseClaudeHooks} for the actual hook resolution.
 */
function parsePluginRootHooks(
	json: unknown,
	pluginUri: URI,
	userHome: string,
	workspaceContextService: IWorkspaceContextService,
	token: string,
	envVar: string,
): IAgentPluginHook[] {
	const fsPath = pluginUri.fsPath;
	const typedJson = json as { hooks?: Record<string, unknown[]> };

	const mutateHookCommand = (hook: Mutable<IHookCommand>): void => {
		for (const field of ['command', 'windows', 'linux', 'osx'] as const) {
			if (typeof hook[field] === 'string') {
				hook[field] = shellQuotePluginRootInCommand(hook[field], fsPath, token);
			}
		}

		hook.env ??= {};
		hook.env[envVar] = fsPath;
	};

	for (const lifecycle of Object.values(typedJson.hooks ?? {})) {
		if (!Array.isArray(lifecycle)) {
			continue;
		}

		for (const lifecycleEntry of lifecycle) {
			if (!lifecycleEntry || typeof lifecycleEntry !== 'object') {
				continue;
			}

			const entry = lifecycleEntry as { hooks?: Mutable<IHookCommand>[] } & Mutable<IHookCommand>;
			if (Array.isArray(entry.hooks)) {
				for (const hook of entry.hooks) {
					mutateHookCommand(hook);
				}
			} else {
				mutateHookCommand(entry);
			}
		}
	}

	const replacer = (v: unknown): unknown => {
		return typeof v === 'string'
			? v.replaceAll(token, pluginUri.fsPath)
			: undefined;
	};

	const workspaceRoot = resolveWorkspaceRoot(pluginUri, workspaceContextService);
	const { hooks, disabledAllHooks } = parseClaudeHooks(cloneAndChange(json, replacer), workspaceRoot, userHome);
	if (disabledAllHooks) {
		return [];
	}

	return mapParsedHooks(hooks);
}

class ClaudePluginFormatAdapter implements IAgentPluginFormatAdapter {
	readonly format = AgentPluginFormat.Claude;
	readonly manifestPath = '.claude-plugin/plugin.json';
	readonly hookConfigPath = 'hooks/hooks.json';

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	parseHooks(json: unknown, pluginUri: URI, userHome: string): IAgentPluginHook[] {
		return parsePluginRootHooks(json, pluginUri, userHome, this._workspaceContextService, '${CLAUDE_PLUGIN_ROOT}', 'CLAUDE_PLUGIN_ROOT');
	}
}

class OpenPluginFormatAdapter implements IAgentPluginFormatAdapter {
	readonly format = AgentPluginFormat.OpenPlugin;
	readonly manifestPath = '.plugin/plugin.json';
	readonly hookConfigPath = 'hooks/hooks.json';

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	parseHooks(json: unknown, pluginUri: URI, userHome: string): IAgentPluginHook[] {
		return parsePluginRootHooks(json, pluginUri, userHome, this._workspaceContextService, '${PLUGIN_ROOT}', 'PLUGIN_ROOT');
	}
}

interface IComponentPathConfig {
	readonly paths: readonly string[];
	readonly exclusive: boolean;
}

const emptyComponentPathConfig: IComponentPathConfig = { paths: [], exclusive: false };

/**
 * Parses a manifest component path field (e.g. `commands`, `skills`, `agents`)
 * into a normalized config. Supports:
 * - `undefined` → empty supplemental config
 * - `string` → single supplemental path
 * - `string[]` → multiple supplemental paths
 * - `{ paths: string[], exclusive?: boolean }` → as-is
 *
 * Paths that resolve outside the plugin root are silently dropped
 * in {@link resolveComponentDirs}.
 */
function parseComponentPathConfig(raw: unknown): IComponentPathConfig {
	if (raw === undefined || raw === null) {
		return emptyComponentPathConfig;
	}

	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		return trimmed ? { paths: [trimmed], exclusive: false } : emptyComponentPathConfig;
	}

	if (Array.isArray(raw)) {
		const paths = raw
			.filter(v => typeof v === 'string')
			.map(v => v.trim())
			.filter(v => v.length > 0);
		return { paths, exclusive: false };
	}

	if (typeof raw === 'object') {
		const obj = raw as Record<string, unknown>;
		if (Array.isArray(obj['paths'])) {
			const paths = (obj['paths'] as unknown[])
				.filter(v => typeof v === 'string')
				.map(v => v.trim())
				.filter(v => v.length > 0);
			const exclusive = obj['exclusive'] === true;
			return { paths, exclusive };
		}
	}

	return emptyComponentPathConfig;
}

/**
 * Resolves the directories to scan for a given component type, combining
 * the default directory with any custom paths from the manifest config.
 * Paths that resolve outside the plugin root are silently ignored.
 */
function resolveComponentDirs(pluginUri: URI, defaultDir: string, config: IComponentPathConfig): readonly URI[] {
	const dirs: URI[] = [];
	if (!config.exclusive) {
		dirs.push(joinPath(pluginUri, defaultDir));
	}
	for (const p of config.paths) {
		const resolved = normalizePath(joinPath(pluginUri, p));
		if (isEqualOrParent(resolved, pluginUri)) {
			dirs.push(resolved);
		}
	}
	return dirs;
}

export class AgentPluginService extends Disposable implements IAgentPluginService {

	declare readonly _serviceBrand: undefined;

	public readonly plugins: IObservable<readonly IAgentPlugin[]>;
	public readonly enablementModel: IEnablementModel;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this.enablementModel = this._register(new EnablementModel('agentPlugins.enablement', storageService));

		const pluginsEnabled = observableConfigValue(ChatConfiguration.PluginsEnabled, true, configurationService);

		const discoveries: IAgentPluginDiscovery[] = [];
		for (const descriptor of agentPluginDiscoveryRegistry.getAll()) {
			const discovery = instantiationService.createInstance(descriptor);
			this._register(discovery);
			discoveries.push(discovery);
			discovery.start(this.enablementModel);
		}


		this.plugins = derived(read => {
			if (!pluginsEnabled.read(read)) {
				return [];
			}
			return this._dedupeAndSort(discoveries.flatMap(d => d.plugins.read(read)));
		});
	}

	private _dedupeAndSort(plugins: readonly IAgentPlugin[]): readonly IAgentPlugin[] {
		const unique: IAgentPlugin[] = [];
		const seen = new ResourceSet();

		for (const plugin of plugins) {
			if (seen.has(plugin.uri)) {
				continue;
			}

			seen.add(plugin.uri);
			unique.push(plugin);
		}

		unique.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return unique;
	}
}

type PluginEntry = IAgentPlugin;

/**
 * Describes a single discovered plugin source, before the shared
 * infrastructure builds the full {@link IAgentPlugin} from it.
 */
interface IPluginSource {
	readonly uri: URI;
	readonly fromMarketplace: IMarketplacePlugin | undefined;
	/** Called when remove is invoked on the plugin */
	remove(): void;
}

/**
 * Shared base class for plugin discovery implementations. Contains the common
 * logic for reading plugin contents (commands, skills, agents, hooks, MCP server
 * definitions) from the filesystem and watching for live updates.
 *
 * Subclasses implement {@link _discoverPluginSources} to determine *which*
 * plugins exist, while this class handles the rest.
 */
export abstract class AbstractAgentPluginDiscovery extends Disposable implements IAgentPluginDiscovery {

	private readonly _pluginEntries = new Map<string, { plugin: PluginEntry; store: DisposableStore; adapter: IAgentPluginFormatAdapter }>();

	private readonly _plugins = observableValue<readonly IAgentPlugin[]>('discoveredAgentPlugins', []);
	public readonly plugins: IObservable<readonly IAgentPlugin[]> = this._plugins;

	private _discoverVersion = 0;
	protected _enablementModel!: IEnablementModel;

	constructor(
		protected readonly _fileService: IFileService,
		protected readonly _pathService: IPathService,
		protected readonly _logService: ILogService,
		protected readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	public abstract start(enablementModel: IEnablementModel): void;

	protected async _refreshPlugins(): Promise<void> {
		const version = ++this._discoverVersion;
		const plugins = await this._discoverAndBuildPlugins();
		if (version !== this._discoverVersion || this._store.isDisposed) {
			return;
		}

		this._plugins.set(plugins, undefined);
	}

	/** Subclasses return plugin sources to discover. */
	protected abstract _discoverPluginSources(): Promise<readonly IPluginSource[]>;

	private async _discoverAndBuildPlugins(): Promise<readonly IAgentPlugin[]> {
		const sources = await this._discoverPluginSources();
		const plugins: IAgentPlugin[] = [];
		const seenPluginUris = new Set<string>();

		for (const source of sources) {
			const key = source.uri.toString();
			if (!seenPluginUris.has(key)) {
				seenPluginUris.add(key);
				const adapter = await this._detectPluginFormatAdapter(source.uri);
				plugins.push(this._toPlugin(source.uri, adapter, source.fromMarketplace, () => source.remove()));
			}
		}

		this._disposePluginEntriesExcept(seenPluginUris);

		plugins.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return plugins;
	}

	private async _detectPluginFormatAdapter(pluginUri: URI): Promise<IAgentPluginFormatAdapter> {
		if (await this._pathExists(joinPath(pluginUri, '.plugin', 'plugin.json'))) {
			return this._instantiationService.createInstance(OpenPluginFormatAdapter);
		}

		const isInClaudeDirectory = pluginUri.path.split('/').includes('.claude');
		if (isInClaudeDirectory || await this._pathExists(joinPath(pluginUri, '.claude-plugin', 'plugin.json'))) {
			return this._instantiationService.createInstance(ClaudePluginFormatAdapter);
		}

		return this._instantiationService.createInstance(CopilotPluginFormatAdapter);
	}

	protected async _pathExists(resource: URI): Promise<boolean> {
		try {
			await this._fileService.resolve(resource);
			return true;
		} catch {
			return false;
		}
	}

	private _toPlugin(uri: URI, adapter: IAgentPluginFormatAdapter, fromMarketplace: IMarketplacePlugin | undefined, removeCallback: () => void): IAgentPlugin {
		const key = uri.toString();
		const existing = this._pluginEntries.get(key);
		if (existing) {
			if (existing.adapter.format !== adapter.format) {
				existing.store.dispose();
				this._pluginEntries.delete(key);
			} else {
				return existing.plugin;
			}
		}

		const store = new DisposableStore();
		const enablement = derived(r => this._enablementModel.readEnabled(key, r));

		// Track current component directories for the file watcher. These are
		// updated whenever the manifest is read (inside each component reader).
		const manifest = observableValue<Record<string, unknown> | undefined>('agentPluginManifest', undefined);

		const observeComponent = <T>(
			prop: string,
			doRead: (uris: readonly URI[]) => Promise<readonly T[]>,
			tryReadEmbedded?: (section: unknown) => Promise<T[] | undefined>,
			defaultPath = prop,
		): IObservable<readonly T[]> => {
			const secondObs = derivedOpts({ equalsFn: equals }, reader => manifest.read(reader)?.[prop]);

			const wrapped = derived(reader => {
				const section = secondObs.read(reader);
				if (tryReadEmbedded) {
					if (section && typeof section === 'object' && !Array.isArray(section) && !(hasKey(section, { paths: true }))) {
						return { kind: 'const', data: new ObservablePromise(tryReadEmbedded(section)) } as const;
					}
				}

				const paths = parseComponentPathConfig(section);
				const dirs = resolveComponentDirs(uri, defaultPath, paths);
				for (const d of dirs) {
					const watcher = this._fileService.createWatcher(d, { recursive: false, excludes: [] });
					reader.store.add(watcher);
					reader.store.add(watcher.onDidChange(() => changeTrigger.trigger(undefined)));
				}

				return { kind: 'dirs', dirs: dirs } as const;
			});

			const changeTrigger = observableSignal('fileChange');

			const promised = derived(reader => {
				const w = wrapped.read(reader);
				if (w.kind === 'const') {
					return w.data.promiseResult;
				} else {
					changeTrigger.read(reader); // re-run when a relevant file change occurs
					const promise = new ObservablePromise(doRead(w.dirs));
					return promise.promiseResult;
				}
			});

			const result = promised.map((w, r) => w.read(r)?.data ?? Iterable.empty());

			return result.recomputeInitiallyAndOnChange(store);
		};

		const commands = observeComponent('commands', d => this._readMarkdownComponents(d));
		const skills = observeComponent('skills', d => this._readSkills(uri, d));
		const agents = observeComponent('agents', d => this._readMarkdownComponents(d));
		const instructions = observeComponent('rules', d => this._readRules(d));
		const hooks = observeComponent(
			'hooks',
			paths => this._readHooksFromPaths(uri, paths, adapter),
			async section => {
				const userHome = (await this._pathService.userHome()).fsPath;
				return adapter.parseHooks(section, uri, userHome);
			},
			adapter.hookConfigPath,
		);

		const mcpServerDefinitions = observeComponent(
			'mcpServers',
			paths => this._readMcpDefinitionsFromPaths(paths),
			async section => this._parseMcpServerDefinitionMap({ mcpServers: section }),
			'.mcp.json',
		);

		// Read the manifest initially and re-read whenever manifest files change.
		const readManifest = async () => {
			manifest.set(await this._readManifest(uri, adapter), undefined);
		};

		const manifestWatcher = this._fileService.createWatcher(
			joinPath(uri, adapter.manifestPath),
			{ recursive: false, excludes: [] },
		);
		store.add(manifestWatcher);
		store.add(manifestWatcher.onDidChange(() => readManifest()));

		readManifest();

		const plugin: PluginEntry = {
			uri,
			label: fromMarketplace?.name ?? basename(uri),
			enablement,
			remove: removeCallback,
			hooks,
			commands,
			skills,
			agents,
			instructions,
			mcpServerDefinitions,
			fromMarketplace,
		};

		this._pluginEntries.set(key, { store, plugin, adapter });

		return plugin;
	}

	private async _readManifest(pluginUri: URI, adapter: IAgentPluginFormatAdapter): Promise<Record<string, unknown> | undefined> {
		const json = await this._readJsonFile(joinPath(pluginUri, adapter.manifestPath));
		if (json && typeof json === 'object') {
			return json as Record<string, unknown>;
		}
		return undefined;
	}

	/**
	 * Reads hook definitions from a list of resolved paths (JSON files).
	 * Each path is tried in order; the first one that contains valid hook
	 * JSON is used.
	 */
	private async _readHooksFromPaths(pluginUri: URI, paths: readonly URI[], adapter: IAgentPluginFormatAdapter): Promise<readonly IAgentPluginHook[]> {
		const userHome = (await this._pathService.userHome()).fsPath;
		for (const hookPath of paths) {
			const json = await this._readJsonFile(hookPath);
			if (json) {
				try {
					return adapter.parseHooks(json, pluginUri, userHome);
				} catch (e) {
					this._logService.info(`[AgentPluginDiscovery] Failed to parse hooks from ${hookPath.toString()}:`, e);
				}
			}
		}
		return [];
	}

	/**
	 * Reads MCP server definitions from a list of resolved paths (JSON files).
	 * Definitions from all files are merged; the first definition for a given
	 * server name wins.
	 */
	private async _readMcpDefinitionsFromPaths(paths: readonly URI[]): Promise<readonly IAgentPluginMcpServerDefinition[]> {
		const merged = new Map<string, IMcpServerConfiguration>();
		for (const mcpPath of paths) {
			const json = await this._readJsonFile(mcpPath);
			for (const def of this._parseMcpServerDefinitionMap(json)) {
				if (!merged.has(def.name)) {
					merged.set(def.name, def.configuration);
				}
			}
		}
		return [...merged.entries()]
			.map(([name, configuration]) => ({ name, configuration } satisfies IAgentPluginMcpServerDefinition))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	private _parseMcpServerDefinitionMap(raw: unknown): IAgentPluginMcpServerDefinition[] {
		if (!raw || typeof raw !== 'object' || !raw.hasOwnProperty('mcpServers')) {
			return [];
		}

		const definitions: IAgentPluginMcpServerDefinition[] = [];
		for (const [name, configValue] of Object.entries((raw as { mcpServers: Record<string, unknown> }).mcpServers)) {
			const configuration = this._normalizeMcpServerConfiguration(configValue);
			if (!configuration) {
				continue;
			}

			definitions.push({ name, configuration });
		}

		return definitions;
	}

	private _normalizeMcpServerConfiguration(rawConfig: unknown): IMcpServerConfiguration | undefined {
		if (!rawConfig || typeof rawConfig !== 'object') {
			return undefined;
		}

		const candidate = rawConfig as Record<string, unknown>;
		const type = typeof candidate['type'] === 'string' ? candidate['type'] : undefined;

		const command = typeof candidate['command'] === 'string' ? candidate['command'] : undefined;
		const url = typeof candidate['url'] === 'string' ? candidate['url'] : undefined;
		const args = Array.isArray(candidate['args']) ? candidate['args'].filter((value): value is string => typeof value === 'string') : undefined;
		const env = candidate['env'] && typeof candidate['env'] === 'object'
			? Object.fromEntries(Object.entries(candidate['env'] as Record<string, unknown>)
				.filter(([, value]) => typeof value === 'string' || typeof value === 'number' || value === null)
				.map(([key, value]) => [key, value as string | number | null]))
			: undefined;
		const envFile = typeof candidate['envFile'] === 'string' ? candidate['envFile'] : undefined;
		const cwd = typeof candidate['cwd'] === 'string' ? candidate['cwd'] : undefined;
		const headers = candidate['headers'] && typeof candidate['headers'] === 'object'
			? Object.fromEntries(Object.entries(candidate['headers'] as Record<string, unknown>)
				.filter(([, value]) => typeof value === 'string')
				.map(([key, value]) => [key, value as string]))
			: undefined;
		const dev = candidate['dev'] && typeof candidate['dev'] === 'object' ? candidate['dev'] as IMcpStdioServerConfiguration['dev'] : undefined;

		if (type === 'ws') {
			return undefined;
		}

		if (type === McpServerType.LOCAL || (!type && command)) {
			if (!command) {
				return undefined;
			}

			return {
				type: McpServerType.LOCAL,
				command,
				args,
				env,
				envFile,
				cwd,
				dev,
			};
		}

		if (type === McpServerType.REMOTE || type === 'sse' || (!type && url)) {
			if (!url) {
				return undefined;
			}

			return {
				type: McpServerType.REMOTE,
				url,
				headers,
				dev,
			};
		}

		return undefined;
	}

	private async _readJsonFile(uri: URI): Promise<unknown | undefined> {
		try {
			const fileContents = await this._fileService.readFile(uri);
			return parseJSONC(fileContents.value.toString());
		} catch {
			return undefined;
		}
	}

	private async _readSkills(pluginRoot: URI, dirs: readonly URI[]): Promise<readonly IAgentPluginSkill[]> {
		const seen = new Set<string>();
		const skills: IAgentPluginSkill[] = [];

		const addSkill = (name: string, skillMd: URI) => {
			if (!seen.has(name)) {
				seen.add(name);
				skills.push({ uri: skillMd, name });
			}
		};

		for (const dir of dirs) {
			// If the path points directly to a skill directory (contains SKILL.md),
			// add it as a single skill instead of scanning its children.
			const skillMd = URI.joinPath(dir, 'SKILL.md');
			if (await this._pathExists(skillMd)) {
				addSkill(basename(dir), skillMd);
				continue;
			}

			let stat;
			try {
				stat = await this._fileService.resolve(dir);
			} catch {
				continue;
			}

			if (!stat.isDirectory || !stat.children) {
				continue;
			}

			for (const child of stat.children) {
				const childSkillMd = URI.joinPath(child.resource, 'SKILL.md');
				if (await this._pathExists(childSkillMd)) {
					addSkill(basename(child.resource), childSkillMd);
				}
			}
		}

		// Fallback: support single-skill plugins with SKILL.md at the plugin root
		if (skills.length === 0) {
			const rootSkillMd = URI.joinPath(pluginRoot, 'SKILL.md');
			if (await this._pathExists(rootSkillMd)) {
				addSkill(basename(pluginRoot), rootSkillMd);
			}
		}

		skills.sort((a, b) => a.name.localeCompare(b.name));
		return skills;
	}

	/**
	 * Scans directories for rule/instruction files (`.mdc`, `.md`,
	 * `.instructions.md`), returning `{ uri, name }` entries where name is
	 * derived from the filename minus the matched suffix.
	 */
	private async _readRules(dirs: readonly URI[]): Promise<readonly IAgentPluginInstruction[]> {
		const seen = new Set<string>();
		const items: IAgentPluginInstruction[] = [];

		const matchSuffix = (filename: string): string | undefined => {
			const lower = filename.toLowerCase();
			return RULE_FILE_SUFFIXES.find(s => lower.endsWith(s));
		};

		const addItem = (name: string, uri: URI) => {
			if (!seen.has(name)) {
				seen.add(name);
				items.push({ uri, name });
			}
		};

		for (const dir of dirs) {
			let stat;
			try {
				stat = await this._fileService.resolve(dir);
			} catch {
				continue;
			}

			if (stat.isFile) {
				const suffix = matchSuffix(basename(dir));
				if (suffix) {
					addItem(basename(dir).slice(0, -suffix.length), dir);
				}
				continue;
			}

			if (!stat.isDirectory || !stat.children) {
				continue;
			}

			for (const child of stat.children) {
				if (!child.isFile) {
					continue;
				}
				const suffix = matchSuffix(child.name);
				if (suffix) {
					addItem(child.name.slice(0, -suffix.length), child.resource);
				}
			}
		}

		items.sort((a, b) => a.name.localeCompare(b.name));
		return items;
	}

	/**
	 * Scans directories for `.md` files, returning `{ uri, name }` entries
	 * where name is derived from the filename (minus the `.md` extension).
	 * If a path points to a specific `.md` file, it is included directly.
	 * Used for both commands and agents.
	 */
	private async _readMarkdownComponents(dirs: readonly URI[]): Promise<readonly { uri: URI; name: string }[]> {
		const seen = new Set<string>();
		const items: { uri: URI; name: string }[] = [];

		const addItem = (name: string, uri: URI) => {
			if (!seen.has(name)) {
				seen.add(name);
				items.push({ uri, name });
			}
		};

		for (const dir of dirs) {
			let stat;
			try {
				stat = await this._fileService.resolve(dir);
			} catch {
				continue;
			}


			// If the path points to a specific .md file, include it directly.
			if (stat.isFile && extname(dir).toLowerCase() === COMMAND_FILE_SUFFIX) {
				addItem(basename(dir).slice(0, -COMMAND_FILE_SUFFIX.length), dir);
				continue;
			}


			if (!stat.isDirectory || !stat.children) {
				continue;
			}

			for (const child of stat.children) {
				if (!child.isFile || extname(child.resource).toLowerCase() !== COMMAND_FILE_SUFFIX) {
					continue;
				}
				addItem(basename(child.resource).slice(0, -COMMAND_FILE_SUFFIX.length), child.resource);
			}
		}

		items.sort((a, b) => a.name.localeCompare(b.name));
		return items;
	}

	private _disposePluginEntriesExcept(keep: Set<string>): void {
		for (const [key, entry] of this._pluginEntries) {
			if (!keep.has(key)) {
				entry.store.dispose();
				this._pluginEntries.delete(key);
			}
		}
	}

	public override dispose(): void {
		this._disposePluginEntriesExcept(new Set<string>());
		super.dispose();
	}
}

export class ConfiguredAgentPluginDiscovery extends AbstractAgentPluginDiscovery {

	private readonly _pluginLocationsConfig: IObservable<Record<string, boolean>>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IPathService pathService: IPathService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(fileService, pathService, logService, instantiationService);
		this._pluginLocationsConfig = observableConfigValue<Record<string, boolean>>(ChatConfiguration.PluginLocations, {}, _configurationService);
	}

	public override start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
		this._register(autorun(reader => {
			this._pluginLocationsConfig.read(reader);
			scheduler.schedule();
		}));
		scheduler.schedule();
	}

	protected override async _discoverPluginSources(): Promise<readonly IPluginSource[]> {
		const sources: IPluginSource[] = [];
		const config = this._pluginLocationsConfig.get();
		const userHome = await this._getUserHome();

		for (const [path, enabled] of Object.entries(config)) {
			if (!path.trim() || enabled === false) {
				continue;
			}

			const resources = this._resolvePluginPath(path.trim(), userHome);
			for (const resource of resources) {
				let stat;
				try {
					stat = await this._fileService.resolve(resource);
				} catch {
					this._logService.debug(`[ConfiguredAgentPluginDiscovery] Could not resolve plugin path: ${resource.toString()}`);
					continue;
				}

				if (!stat.isDirectory) {
					this._logService.debug(`[ConfiguredAgentPluginDiscovery] Plugin path is not a directory: ${resource.toString()}`);
					continue;
				}

				const fromMarketplace = this._pluginMarketplaceService.getMarketplacePluginMetadata(stat.resource);
				const configKey = path;
				sources.push({
					uri: stat.resource,
					fromMarketplace,
					remove: () => this._removePluginPath(configKey),
				});
			}
		}

		return sources;
	}

	private async _getUserHome(): Promise<string> {
		const userHome = await this._pathService.userHome();
		return userHome.scheme === 'file' ? userHome.fsPath : userHome.path;
	}

	/**
	 * Resolves a plugin path to one or more resource URIs. Supports:
	 * - Absolute paths (used directly)
	 * - Tilde paths (expanded to user home directory)
	 * - Relative paths (resolved against each workspace folder)
	 */
	private _resolvePluginPath(path: string, userHome: string): URI[] {
		if (path.startsWith('~')) {
			path = untildify(path, userHome);
		}

		// Handle absolute paths
		if (win32.isAbsolute(path) || posix.isAbsolute(path)) {
			return [URI.file(path)];
		}

		return this._workspaceContextService.getWorkspace().folders.map(
			folder => joinPath(folder.uri, path)
		);
	}

	/**
	 * Removes a plugin path from `chat.pluginLocations` in the most specific
	 * config target where the key is defined.
	 */
	private _removePluginPath(configKey: string): void {
		const inspected = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.PluginLocations);

		const targets = [
			ConfigurationTarget.WORKSPACE_FOLDER,
			ConfigurationTarget.WORKSPACE,
			ConfigurationTarget.USER_LOCAL,
			ConfigurationTarget.USER_REMOTE,
			ConfigurationTarget.USER,
			ConfigurationTarget.APPLICATION,
		];

		for (const target of targets) {
			const mapping = getConfigValueInTarget(inspected, target);
			if (mapping && Object.prototype.hasOwnProperty.call(mapping, configKey)) {
				const updated = { ...mapping };
				delete updated[configKey];
				this._configurationService.updateValue(
					ChatConfiguration.PluginLocations,
					updated,
					target,
				);
				return;
			}
		}
	}
}

export class MarketplaceAgentPluginDiscovery extends AbstractAgentPluginDiscovery {

	constructor(
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IAgentPluginRepositoryService private readonly _pluginRepositoryService: IAgentPluginRepositoryService,
		@IFileService fileService: IFileService,
		@IPathService pathService: IPathService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(fileService, pathService, logService, instantiationService);
	}

	public override start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
		this._register(autorun(reader => {
			this._pluginMarketplaceService.installedPlugins.read(reader);
			scheduler.schedule();
		}));
		scheduler.schedule();
	}

	protected override async _discoverPluginSources(): Promise<readonly IPluginSource[]> {
		const installed = this._pluginMarketplaceService.installedPlugins.get();
		const sources: IPluginSource[] = [];

		for (const entry of installed) {
			let stat;
			try {
				stat = await this._fileService.resolve(entry.pluginUri);
			} catch {
				this._logService.debug(`[MarketplaceAgentPluginDiscovery] Could not resolve installed plugin: ${entry.pluginUri.toString()}`);
				continue;
			}

			if (!stat.isDirectory) {
				this._logService.debug(`[MarketplaceAgentPluginDiscovery] Installed plugin path is not a directory: ${entry.pluginUri.toString()}`);
				continue;
			}

			sources.push({
				uri: stat.resource,
				fromMarketplace: entry.plugin,
				remove: () => {
					this._pluginMarketplaceService.removeInstalledPlugin(entry.pluginUri);
					this._pluginRepositoryService.cleanupPluginSource(entry.plugin).catch(error => {
						this._logService.error('[MarketplaceAgentPluginDiscovery] Failed to clean up plugin source', error);
					});
				},
			});
		}

		return sources;
	}
}
