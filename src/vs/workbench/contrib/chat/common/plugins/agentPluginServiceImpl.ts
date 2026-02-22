/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import {
	posix,
	win32
} from '../../../../../base/common/path.js';
import {
	basename,
	extname, joinPath
} from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService, ConfigurationTarget, getConfigValueInTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMcpServerConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ChatConfiguration } from '../constants.js';
import { agentPluginDiscoveryRegistry, IAgentPlugin, IAgentPluginCommand, IAgentPluginDiscovery, IAgentPluginHook, IAgentPluginMcpServerDefinition, IAgentPluginService, IAgentPluginSkill } from './agentPluginService.js';

const COMMAND_FILE_SUFFIX = '.md';

export class AgentPluginService extends Disposable implements IAgentPluginService {

	declare readonly _serviceBrand: undefined;

	public readonly allPlugins: IObservable<readonly IAgentPlugin[]>;
	public readonly plugins: IObservable<readonly IAgentPlugin[]>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const discoveries: IAgentPluginDiscovery[] = [];
		for (const descriptor of agentPluginDiscoveryRegistry.getAll()) {
			const discovery = instantiationService.createInstance(descriptor);
			this._register(discovery);
			discoveries.push(discovery);
			discovery.start();
		}


		this.allPlugins = derived(read => this._dedupeAndSort(discoveries.flatMap(d => d.plugins.read(read))));

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
	private readonly _pluginEntries = new Map<string, { plugin: PluginEntry; store: DisposableStore }>();

	private readonly _plugins = observableValue<readonly IAgentPlugin[]>('discoveredAgentPlugins', []);
	public readonly plugins: IObservable<readonly IAgentPlugin[]> = this._plugins;

	private _discoverVersion = 0;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService,
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
					seenPluginUris.add(key);
					plugins.push(this._toPlugin(stat.resource, path, enabled));
				}
			}
		}

		this._disposePluginEntriesExcept(seenPluginUris);

		plugins.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
		return plugins;
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

	private _toPlugin(uri: URI, configKey: string, initialEnabled: boolean): IAgentPlugin {
		const key = uri.toString();
		const existing = this._pluginEntries.get(key);
		if (existing) {
			existing.plugin.enabled.set(initialEnabled, undefined);
			return existing.plugin;
		}

		const store = new DisposableStore();
		const commands = observableValue<readonly IAgentPluginCommand[]>('agentPluginCommands', []);
		const skills = observableValue<readonly IAgentPluginSkill[]>('agentPluginSkills', []);
		const mcpServerDefinitions = observableValue<readonly IAgentPluginMcpServerDefinition[]>('agentPluginMcpServerDefinitions', []);
		const enabled = observableValue<boolean>('agentPluginEnabled', initialEnabled);

		const commandsDir = joinPath(uri, 'commands');
		const skillsDir = joinPath(uri, 'skills');

		const commandsScheduler = store.add(new RunOnceScheduler(async () => {
			commands.set(await this._readCommands(uri), undefined);
		}, 200));
		const skillsScheduler = store.add(new RunOnceScheduler(async () => {
			skills.set(await this._readSkills(uri), undefined);
		}, 200));
		const mcpScheduler = store.add(new RunOnceScheduler(async () => {
			mcpServerDefinitions.set(await this._readMcpDefinitions(uri), undefined);
		}, 200));

		store.add(this._fileService.watch(uri, { recursive: true, excludes: [] }));
		store.add(this._fileService.onDidFilesChange(e => {
			if (e.affects(commandsDir)) {
				commandsScheduler.schedule();
			}
			if (e.affects(skillsDir)) {
				skillsScheduler.schedule();
			}
			// MCP definitions come from .mcp.json, plugin.json, or .claude-plugin/plugin.json
			if (e.affects(joinPath(uri, '.mcp.json')) || e.affects(joinPath(uri, 'plugin.json')) || e.affects(joinPath(uri, '.claude-plugin'))) {
				mcpScheduler.schedule();
			}
		}));

		commandsScheduler.schedule();
		skillsScheduler.schedule();
		mcpScheduler.schedule();

		const plugin: PluginEntry = {
			uri,
			enabled,
			setEnabled: (value: boolean) => {
				this._updatePluginPathEnabled(configKey, value);
			},
			hooks: observableValue<readonly IAgentPluginHook[]>('agentPluginHooks', []),
			commands,
			skills,
			mcpServerDefinitions,
		};

		this._pluginEntries.set(key, { store, plugin });

		return plugin;
	}

	private async _readMcpDefinitions(pluginUri: URI): Promise<readonly IAgentPluginMcpServerDefinition[]> {
		const mcpUri = joinPath(pluginUri, '.mcp.json');

		const mcpFileConfig = await this._readJsonFile(mcpUri);
		const fileDefinitions = this._parseMcpServerDefinitionMap(mcpFileConfig);

		const pluginJsonDefinitions = await this._readInlinePluginJsonMcpDefinitions(pluginUri);

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

	private async _readInlinePluginJsonMcpDefinitions(pluginUri: URI): Promise<readonly IAgentPluginMcpServerDefinition[]> {
		const manifestPaths = [
			joinPath(pluginUri, 'plugin.json'),
			joinPath(pluginUri, '.claude-plugin', 'plugin.json'),
		];

		for (const manifestPath of manifestPaths) {
			const manifest = await this._readJsonFile(manifestPath);
			if (!manifest || typeof manifest !== 'object') {
				continue;
			}

			const manifestRecord = manifest as Record<string, unknown>;
			const mcpServers = manifestRecord['mcpServers'];
			const definitions = this._parseMcpServerDefinitionMap(mcpServers);
			if (definitions.length > 0) {
				return definitions;
			}
		}

		return [];
	}

	private _parseMcpServerDefinitionMap(raw: unknown): IAgentPluginMcpServerDefinition[] {
		if (!raw || typeof raw !== 'object') {
			return [];
		}

		const definitions: IAgentPluginMcpServerDefinition[] = [];
		for (const [name, configValue] of Object.entries(raw as Record<string, unknown>)) {
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
			if (!child.isFile || extname(child.resource).toLowerCase() !== COMMAND_FILE_SUFFIX) {
				continue;
			}

			const name = basename(child.resource).slice(0, -COMMAND_FILE_SUFFIX.length);

			skills.push({
				uri: child.resource,
				name,
			});
		}

		skills.sort((a, b) => a.name.localeCompare(b.name));
		return skills;
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

