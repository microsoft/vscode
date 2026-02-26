/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { cloneAndChange } from '../../../../../base/common/objects.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import {
	posix,
	win32
} from '../../../../../base/common/path.js';
import {
	basename,
	extname, joinPath
} from '../../../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { Mutable } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMcpServerConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ChatConfiguration } from '../constants.js';
import { parseClaudeHooks } from '../promptSyntax/hookClaudeCompat.js';
import { parseCopilotHooks } from '../promptSyntax/hookCompatibility.js';
import { IHookCommand } from '../promptSyntax/hookSchema.js';
import { agentPluginDiscoveryRegistry, IAgentPlugin, IAgentPluginAgent, IAgentPluginCommand, IAgentPluginDiscovery, IAgentPluginHook, IAgentPluginMcpServerDefinition, IAgentPluginService, IAgentPluginSkill } from './agentPluginService.js';
import { IPluginInstallService } from './pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from './pluginMarketplaceService.js';

const COMMAND_FILE_SUFFIX = '.md';

const enum AgentPluginFormat {
	Copilot,
	Claude,
}

interface IAgentPluginFormatAdapter {
	readonly format: AgentPluginFormat;
	readonly manifestPaths: readonly string[];
	readonly hookConfigPaths: readonly string[];
	readonly hookWatchPaths: readonly string[];
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
	readonly manifestPaths = ['plugin.json'];
	readonly hookConfigPaths = ['hooks.json'];
	readonly hookWatchPaths = ['hooks.json'];

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
export function shellQuotePluginRootInCommand(command: string, fsPath: string, token: string = '${CLAUDE_PLUGIN_ROOT}'): string {
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

class ClaudePluginFormatAdapter implements IAgentPluginFormatAdapter {
	readonly format = AgentPluginFormat.Claude;
	readonly manifestPaths = ['.claude-plugin/plugin.json'];
	readonly hookConfigPaths = ['hooks/hooks.json'];
	readonly hookWatchPaths = ['hooks'];

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	parseHooks(json: unknown, pluginUri: URI, userHome: string): IAgentPluginHook[] {
		const token = '${CLAUDE_PLUGIN_ROOT}';
		const fsPath = pluginUri.fsPath;
		const typedJson = json as { hooks?: Record<string, unknown[]> };

		const mutateHookCommand = (hook: Mutable<IHookCommand>): void => {
			for (const field of ['command', 'windows', 'linux', 'osx'] as const) {
				if (typeof hook[field] === 'string') {
					hook[field] = shellQuotePluginRootInCommand(hook[field], fsPath, token);
				}
			}

			hook.env ??= {};
			hook.env.CLAUDE_PLUGIN_ROOT = fsPath;
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
				? v.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginUri.fsPath)
				: undefined;
		};

		const workspaceRoot = resolveWorkspaceRoot(pluginUri, this._workspaceContextService);
		const { hooks, disabledAllHooks } = parseClaudeHooks(cloneAndChange(json, replacer), workspaceRoot, userHome);
		if (disabledAllHooks) {
			return [];
		}

		return mapParsedHooks(hooks);
	}
}

export class AgentPluginService extends Disposable implements IAgentPluginService {

	declare readonly _serviceBrand: undefined;

	public readonly allPlugins: IObservable<readonly IAgentPlugin[]>;
	public readonly plugins: IObservable<readonly IAgentPlugin[]>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const pluginsEnabled = observableConfigValue(ChatConfiguration.PluginsEnabled, true, configurationService);

		const discoveries: IAgentPluginDiscovery[] = [];
		for (const descriptor of agentPluginDiscoveryRegistry.getAll()) {
			const discovery = instantiationService.createInstance(descriptor);
			this._register(discovery);
			discoveries.push(discovery);
			discovery.start();
		}


		this.allPlugins = derived(read => {
			if (!pluginsEnabled.read(read)) {
				return [];
			}
			return this._dedupeAndSort(discoveries.flatMap(d => d.plugins.read(read)));
		});

		this.plugins = derived(reader => {
			const all = this.allPlugins.read(reader);
			return all.filter(p => p.enabled.read(reader));
		});
	}

	public setPluginEnabled(pluginUri: URI, enabled: boolean): void {
		const plugin = this.allPlugins.get().find(p => p.uri.toString() === pluginUri.toString());
		if (plugin) {
			plugin.setEnabled(enabled);
		}
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

type PluginEntry = IAgentPlugin & { enabled: ISettableObservable<boolean> };

export class ConfiguredAgentPluginDiscovery extends Disposable implements IAgentPluginDiscovery {

	private readonly _pluginPathsConfig: IObservable<Record<string, boolean>>;
	private readonly _pluginEntries = new Map<string, { plugin: PluginEntry; store: DisposableStore; adapter: IAgentPluginFormatAdapter }>();

	private readonly _plugins = observableValue<readonly IAgentPlugin[]>('discoveredAgentPlugins', []);
	public readonly plugins: IObservable<readonly IAgentPlugin[]> = this._plugins;

	private _discoverVersion = 0;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IPathService private readonly _pathService: IPathService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._pluginPathsConfig = observableConfigValue<Record<string, boolean>>(ChatConfiguration.PluginPaths, {}, _configurationService);
	}

	public start(): void {
		const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
		this._register(autorun(reader => {
			this._pluginPathsConfig.read(reader);
			scheduler.schedule();
		}));
		scheduler.schedule();
	}

	private async _refreshPlugins(): Promise<void> {
		const version = ++this._discoverVersion;
		const plugins = await this._discoverPlugins();
		if (version !== this._discoverVersion || this._store.isDisposed) {
			return;
		}

		this._plugins.set(plugins, undefined);
	}

	private async _discoverPlugins(): Promise<readonly IAgentPlugin[]> {
		const plugins: IAgentPlugin[] = [];
		const seenPluginUris = new Set<string>();
		const config = this._pluginPathsConfig.get();
		// todo: temporary, we should have a dedicated discovery from the marketplace
		const marketplacePluginsByInstallUri = await this._getMarketplacePluginsByInstallUri();

		for (const [path, enabled] of Object.entries(config)) {
			if (!path.trim()) {
				continue;
			}

			const resources = this._resolvePluginPath(path.trim());
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

				const key = stat.resource.toString();
				if (!seenPluginUris.has(key)) {
					const adapter = await this._detectPluginFormatAdapter(stat.resource);
					seenPluginUris.add(key);
					plugins.push(this._toPlugin(stat.resource, path, enabled, adapter, marketplacePluginsByInstallUri.get(key)));
				}
			}
		}

		this._disposePluginEntriesExcept(seenPluginUris);

		plugins.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return plugins;
	}

	private async _getMarketplacePluginsByInstallUri(): Promise<Map<string, IMarketplacePlugin>> {
		const result = new Map<string, IMarketplacePlugin>();
		let marketplacePlugins: readonly IMarketplacePlugin[];
		try {
			marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(CancellationToken.None);
		} catch (err) {
			this._logService.debug('[ConfiguredAgentPluginDiscovery] Failed to fetch marketplace plugins for provenance mapping:', err);
			return result;
		}

		for (const marketplacePlugin of marketplacePlugins) {
			const installUri = this._pluginInstallService.getPluginInstallUri(marketplacePlugin);
			result.set(installUri.toString(), marketplacePlugin);
		}

		return result;
	}

	/**
	 * Resolves a plugin path to one or more resource URIs. Absolute paths are
	 * used directly; relative paths are resolved against each workspace folder.
	 */
	private _resolvePluginPath(path: string): URI[] {
		if (win32.isAbsolute(path) || posix.isAbsolute(path)) {
			return [URI.file(path)];
		}

		return this._workspaceContextService.getWorkspace().folders.map(
			folder => joinPath(folder.uri, path)
		);
	}

	/**
	 * Updates the enabled state of a plugin path in the configuration,
	 * writing to the most specific config target where the key is defined.
	 */
	private _updatePluginPathEnabled(configKey: string, value: boolean): void {
		const inspected = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.PluginPaths);

		// Walk from most specific to least specific to find where this key is defined
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
				this._configurationService.updateValue(
					ChatConfiguration.PluginPaths,
					{ ...mapping, [configKey]: value },
					target,
				);
				return;
			}
		}

		// Key not found in any target; write to USER_LOCAL as default
		const current = getConfigValueInTarget(inspected, ConfigurationTarget.USER_LOCAL) ?? {};
		this._configurationService.updateValue(
			ChatConfiguration.PluginPaths,
			{ ...current, [configKey]: value },
			ConfigurationTarget.USER_LOCAL,
		);
	}

	private async _detectPluginFormatAdapter(pluginUri: URI): Promise<IAgentPluginFormatAdapter> {
		const isInClaudeDirectory = pluginUri.path.split('/').includes('.claude');
		if (isInClaudeDirectory || await this._pathExists(joinPath(pluginUri, '.claude-plugin', 'plugin.json'))) {
			return this._instantiationService.createInstance(ClaudePluginFormatAdapter);
		}

		return this._instantiationService.createInstance(CopilotPluginFormatAdapter);
	}

	private async _pathExists(resource: URI): Promise<boolean> {
		try {
			await this._fileService.resolve(resource);
			return true;
		} catch {
			return false;
		}
	}

	private _toPlugin(uri: URI, configKey: string, initialEnabled: boolean, adapter: IAgentPluginFormatAdapter, fromMarketplace: IMarketplacePlugin | undefined): IAgentPlugin {
		const key = uri.toString();
		const existing = this._pluginEntries.get(key);
		if (existing) {
			if (existing.adapter.format !== adapter.format) {
				existing.store.dispose();
				this._pluginEntries.delete(key);
			} else {
				existing.plugin.enabled.set(initialEnabled, undefined);
				return existing.plugin;
			}
		}

		const store = new DisposableStore();
		const commands = observableValue<readonly IAgentPluginCommand[]>('agentPluginCommands', []);
		const skills = observableValue<readonly IAgentPluginSkill[]>('agentPluginSkills', []);
		const agents = observableValue<readonly IAgentPluginAgent[]>('agentPluginAgents', []);
		const hooks = observableValue<readonly IAgentPluginHook[]>('agentPluginHooks', []);
		const mcpServerDefinitions = observableValue<readonly IAgentPluginMcpServerDefinition[]>('agentPluginMcpServerDefinitions', []);
		const enabled = observableValue<boolean>('agentPluginEnabled', initialEnabled);

		const commandsDir = joinPath(uri, 'commands');
		const skillsDir = joinPath(uri, 'skills');
		const agentsDir = joinPath(uri, 'agents');

		const commandsScheduler = store.add(new RunOnceScheduler(async () => {
			commands.set(await this._readCommands(uri), undefined);
		}, 200));
		const skillsScheduler = store.add(new RunOnceScheduler(async () => {
			skills.set(await this._readSkills(uri), undefined);
		}, 200));
		const agentsScheduler = store.add(new RunOnceScheduler(async () => {
			agents.set(await this._readAgents(uri), undefined);
		}, 200));
		const hooksScheduler = store.add(new RunOnceScheduler(async () => {
			hooks.set(await this._readHooks(uri, adapter), undefined);
		}, 200));
		const mcpScheduler = store.add(new RunOnceScheduler(async () => {
			mcpServerDefinitions.set(await this._readMcpDefinitions(uri, adapter), undefined);
		}, 200));

		store.add(this._fileService.watch(uri, { recursive: true, excludes: [] }));
		store.add(this._fileService.onDidFilesChange(e => {
			if (e.affects(commandsDir)) {
				commandsScheduler.schedule();
			}
			if (e.affects(skillsDir)) {
				skillsScheduler.schedule();
			}
			if (e.affects(agentsDir)) {
				agentsScheduler.schedule();
			}
			if (adapter.hookWatchPaths.some(path => e.affects(joinPath(uri, path)))) {
				hooksScheduler.schedule();
			}
			if (e.affects(joinPath(uri, '.mcp.json')) || adapter.manifestPaths.some(path => e.affects(joinPath(uri, path)))) {
				mcpScheduler.schedule();
				hooksScheduler.schedule();
			}
		}));

		commandsScheduler.schedule();
		skillsScheduler.schedule();
		agentsScheduler.schedule();
		hooksScheduler.schedule();
		mcpScheduler.schedule();

		const plugin: PluginEntry = {
			uri,
			enabled,
			setEnabled: (value: boolean) => {
				this._updatePluginPathEnabled(configKey, value);
			},
			hooks,
			commands,
			skills,
			agents,
			mcpServerDefinitions,
			fromMarketplace,
		};

		this._pluginEntries.set(key, { store, plugin, adapter });

		return plugin;
	}

	private async _readMcpDefinitions(pluginUri: URI, adapter: IAgentPluginFormatAdapter): Promise<readonly IAgentPluginMcpServerDefinition[]> {
		const mcpUri = joinPath(pluginUri, '.mcp.json');

		const mcpFileConfig = await this._readJsonFile(mcpUri);
		const fileDefinitions = this._parseMcpServerDefinitionMap(mcpFileConfig);

		const pluginJsonDefinitions = await this._readInlinePluginJsonMcpDefinitions(pluginUri, adapter);

		const merged = new Map<string, IMcpServerConfiguration>();
		for (const definition of fileDefinitions) {
			merged.set(definition.name, definition.configuration);
		}
		for (const definition of pluginJsonDefinitions) {
			if (!merged.has(definition.name)) {
				merged.set(definition.name, definition.configuration);
			}
		}

		const definitions = [...merged.entries()]
			.map(([name, configuration]) => ({ name, configuration } satisfies IAgentPluginMcpServerDefinition))
			.sort((a, b) => a.name.localeCompare(b.name));

		return definitions;
	}

	private async _readInlinePluginJsonMcpDefinitions(pluginUri: URI, adapter: IAgentPluginFormatAdapter): Promise<readonly IAgentPluginMcpServerDefinition[]> {
		for (const manifestPath of adapter.manifestPaths.map(path => joinPath(pluginUri, path))) {
			const manifest = await this._readJsonFile(manifestPath);
			if (!manifest || typeof manifest !== 'object') {
				continue;
			}

			const definitions = this._parseMcpServerDefinitionMap(manifest);
			if (definitions.length > 0) {
				return definitions;
			}
		}

		return [];
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

	private async _readHooks(pluginUri: URI, adapter: IAgentPluginFormatAdapter): Promise<readonly IAgentPluginHook[]> {
		const userHome = (await this._pathService.userHome()).fsPath;
		for (const hooksUri of adapter.hookConfigPaths.map(path => joinPath(pluginUri, path))) {
			const json = await this._readJsonFile(hooksUri);
			if (json) {
				try {
					return adapter.parseHooks(json, pluginUri, userHome);
				} catch (e) {
					this._logService.info(`[ConfiguredAgentPluginDiscovery] Failed to parse hooks from ${hooksUri.toString()}:`, e);
				}
			}
		}

		for (const manifestPath of adapter.manifestPaths.map(path => joinPath(pluginUri, path))) {
			const manifest = await this._readJsonFile(manifestPath);
			if (manifest && typeof manifest === 'object') {
				const hooks = (manifest as Record<string, unknown>)['hooks'];
				if (hooks && typeof hooks === 'object') {
					try {
						return adapter.parseHooks({ hooks }, pluginUri, userHome);
					} catch (e) {
						this._logService.info(`[ConfiguredAgentPluginDiscovery] Failed to parse hooks from manifest ${manifestPath.toString()}:`, e);
					}
				}
			}
		}

		return [];
	}

	private async _readJsonFile(uri: URI): Promise<unknown | undefined> {
		try {
			const fileContents = await this._fileService.readFile(uri);
			return parseJSONC(fileContents.value.toString());
		} catch {
			return undefined;
		}
	}

	private async _readSkills(uri: URI): Promise<readonly IAgentPluginSkill[]> {
		const skillsDir = joinPath(uri, 'skills');
		let stat;
		try {
			stat = await this._fileService.resolve(skillsDir);
		} catch {
			return [];
		}

		if (!stat.isDirectory || !stat.children) {
			return [];
		}

		const skills: IAgentPluginSkill[] = [];
		for (const child of stat.children) {
			const skillMd = URI.joinPath(child.resource, 'SKILL.md');
			if (!(await this._pathExists(skillMd))) {
				continue;
			}

			skills.push({
				uri: skillMd,
				name: basename(child.resource),
			});
		}

		skills.sort((a, b) => a.name.localeCompare(b.name));
		return skills;
	}

	private async _readAgents(uri: URI): Promise<readonly IAgentPluginAgent[]> {
		const agentsDir = joinPath(uri, 'agents');
		let stat;
		try {
			stat = await this._fileService.resolve(agentsDir);
		} catch {
			return [];
		}

		if (!stat.isDirectory || !stat.children) {
			return [];
		}

		const agents: IAgentPluginAgent[] = [];
		for (const child of stat.children) {
			if (!child.isFile || extname(child.resource).toLowerCase() !== COMMAND_FILE_SUFFIX) {
				continue;
			}

			const name = basename(child.resource).slice(0, -COMMAND_FILE_SUFFIX.length);

			agents.push({
				uri: child.resource,
				name,
			});
		}

		agents.sort((a, b) => a.name.localeCompare(b.name));
		return agents;
	}

	private async _readCommands(uri: URI): Promise<readonly IAgentPluginCommand[]> {
		const commandsDir = joinPath(uri, 'commands');
		let stat;
		try {
			stat = await this._fileService.resolve(commandsDir);
		} catch {
			return [];
		}

		if (!stat.isDirectory || !stat.children) {
			return [];
		}

		const commands: IAgentPluginCommand[] = [];
		for (const child of stat.children) {
			if (!child.isFile || extname(child.resource).toLowerCase() !== COMMAND_FILE_SUFFIX) {
				continue;
			}

			const name = basename(child.resource).slice(0, -COMMAND_FILE_SUFFIX.length);

			commands.push({
				uri: child.resource,
				name,
			});
		}

		commands.sort((a, b) => a.name.localeCompare(b.name));
		return commands;
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

