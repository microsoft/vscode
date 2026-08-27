/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { makeMcpServerCustomization, PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { getCanonicalAgentPluginCollisionGroups, IDiscoveredAgentPlugins } from '../../../common/plugins/agentPluginEnablement.js';
import { AgentPluginDiscoveryOrigin, AgentPluginDiscoveryOutcome, AgentPluginDiscoveryPriority, IAgentPlugin, IAgentPluginDiscoverySnapshot } from '../../../common/plugins/agentPluginService.js';
import { AgentPluginTelemetry } from '../../../common/plugins/agentPluginTelemetry.js';
import { MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { HookType } from '../../../common/promptSyntax/hookTypes.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

class LayeredConfigurationService extends TestConfigurationService {
	constructor(private readonly values: Readonly<Record<string, IConfigurationValue<unknown>>>) {
		super();
	}

	override inspect<T>(key: string): IConfigurationValue<T> {
		return (this.values[key] ?? {}) as IConfigurationValue<T>;
	}
}

interface IFoundRow {
	readonly origin: string;
	readonly format: string;
	readonly candidateCount: number;
	readonly loadedCount: number;
	readonly disabledCount: number;
	readonly policyBlockedCount: number;
	readonly parseErrorCount: number;
	readonly unreadableCount: number;
	readonly collisionCount: number;
	readonly pluginParseErrorCount: number;
	readonly pluginUnreadableCount: number;
	readonly commandCount: number;
	readonly skillCount: number;
	readonly agentCount: number;
	readonly instructionCount: number;
	readonly hookCount: number;
	readonly mcpServerCount: number;
}

function isFoundRow(value: unknown): value is IFoundRow {
	return typeof value === 'object' && value !== null && 'origin' in value && 'format' in value && 'candidateCount' in value;
}

suite('AgentPluginTelemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function plugin(name: string, origin: AgentPluginDiscoveryOrigin, format: PluginFormat, blocked = false, manifestParseError = false, manifestUnreadable = false): IAgentPlugin {
		const uri = URI.file(`/plugins/${name}`);
		return {
			uri,
			format,
			discoveryOrigin: origin,
			label: name,
			enablement: constObservable(ContributionEnablementState.EnabledProfile),
			policyBlocked: constObservable(blocked),
			manifestParseError: constObservable(manifestParseError),
			manifestUnreadable: constObservable(manifestUnreadable),
			commands: constObservable([{ uri: URI.joinPath(uri, 'commands', 'command.md'), name: 'command' }]),
			skills: constObservable([{ uri: URI.joinPath(uri, 'skills', 'skill', 'SKILL.md'), name: 'skill' }]),
			agents: constObservable([{ uri: URI.joinPath(uri, 'agents', 'agent.md'), name: 'agent' }]),
			instructions: constObservable([{ uri: URI.joinPath(uri, 'rules', 'rule.md'), name: 'rule' }]),
			hooks: constObservable([{ type: HookType.PreToolUse, hooks: [], uri: URI.joinPath(uri, 'hooks.json'), originalId: 'hook' }]),
			mcpServerDefinitions: constObservable([{
				uri: URI.joinPath(uri, '.mcp.json'),
				name: 'server',
				configuration: { type: McpServerType.LOCAL, command: 'server' },
				customization: makeMcpServerCustomization(URI.joinPath(uri, '.mcp.json'), 'server'),
			}]),
		};
	}

	function components(candidate: IAgentPlugin) {
		return {
			commandCount: candidate.commands.get().length,
			skillCount: candidate.skills.get().length,
			agentCount: candidate.agents.get().length,
			instructionCount: candidate.instructions.get().length,
			hookCount: candidate.hooks.get().length,
			mcpServerCount: candidate.mcpServerDefinitions.get().length,
			manifestParseError: candidate.manifestParseError?.get() ?? false,
			manifestUnreadable: candidate.manifestUnreadable?.get() ?? false,
		};
	}

	test('covers all origins, formats, outcomes, components, zero rows, and deduplication', () => {
		const configuredPath = plugin('configured-path', AgentPluginDiscoveryOrigin.ConfiguredPath, PluginFormat.Copilot, false, true);
		const configuredId = plugin('configured-id', AgentPluginDiscoveryOrigin.ConfiguredPluginId, PluginFormat.Claude);
		const installed = plugin('installed', AgentPluginDiscoveryOrigin.VSCodeInstalled, PluginFormat.OpenPlugin, false, false, true);
		const cliMarketplace = plugin('cli-marketplace', AgentPluginDiscoveryOrigin.CopilotCliMarketplace, PluginFormat.AgentPlugin);
		const policyBlocked = plugin('extension', AgentPluginDiscoveryOrigin.ExtensionContribution, PluginFormat.Claude, true);
		const snapshots: IAgentPluginDiscoverySnapshot[] = [{
			candidates: [
				{ origin: AgentPluginDiscoveryOrigin.ConfiguredPath, format: PluginFormat.Copilot, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: configuredPath, components: components(configuredPath) },
				{ origin: AgentPluginDiscoveryOrigin.ConfiguredPluginId, format: PluginFormat.Claude, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: configuredId, components: components(configuredId) },
				{ origin: AgentPluginDiscoveryOrigin.VSCodeInstalled, format: PluginFormat.OpenPlugin, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: installed, components: components(installed) },
				{ origin: AgentPluginDiscoveryOrigin.CopilotCliMarketplace, format: PluginFormat.AgentPlugin, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: cliMarketplace, components: components(cliMarketplace) },
				{ origin: AgentPluginDiscoveryOrigin.CopilotCliDirect, format: undefined, outcome: AgentPluginDiscoveryOutcome.Disabled },
				{ origin: AgentPluginDiscoveryOrigin.ExtensionContribution, format: PluginFormat.Claude, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: policyBlocked, components: components(policyBlocked) },
				{ origin: AgentPluginDiscoveryOrigin.ExtensionContribution, format: undefined, outcome: AgentPluginDiscoveryOutcome.ParseError },
				{ origin: AgentPluginDiscoveryOrigin.ExtensionContribution, format: undefined, outcome: AgentPluginDiscoveryOutcome.Unreadable },
				{ origin: AgentPluginDiscoveryOrigin.ExtensionContribution, format: undefined, outcome: AgentPluginDiscoveryOutcome.Collision },
			],
		}];
		const finalPlugins = [configuredPath, configuredId, installed, cliMarketplace, policyBlocked];
		const telemetryService = new TestTelemetryService();
		const reporter = new AgentPluginTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));
		store.add(autorun(reader => {
			reporter.logDiscovery(snapshots, finalPlugins, new Map(), true, reader);
			reporter.logDiscovery(snapshots, finalPlugins, new Map(), true, reader);
		}));

		const rows = telemetryService.events.filter(event => event.name === 'agentPluginsFound').map(event => event.data).filter(isFoundRow);
		assert.deepStrictEqual(rows.map(row => [
			row.origin,
			row.format,
			row.candidateCount,
			row.loadedCount,
			row.disabledCount,
			row.policyBlockedCount,
			row.parseErrorCount,
			row.unreadableCount,
			row.collisionCount,
			row.pluginParseErrorCount,
			row.pluginUnreadableCount,
			row.commandCount,
			row.skillCount,
			row.agentCount,
			row.instructionCount,
			row.hookCount,
			row.mcpServerCount,
		]), [
			['configuredPath', 'copilot', 1, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1],
			['configuredPluginId', 'claude', 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
			['copilotCliDirect', 'unknown', 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			['copilotCliMarketplace', 'agentPlugin', 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
			['extensionContribution', 'claude', 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
			['extensionContribution', 'unknown', 3, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			['vscodeInstalled', 'openPlugin', 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
		]);
	});

	test('reports explicit configuration layers and stored enablement without values', () => {
		const telemetryService = new TestTelemetryService();
		const configurationService = new LayeredConfigurationService({
			'chat.plugins.enabled': { userValue: false, workspaceValue: true, policyValue: false },
			'chat.pluginLocations': { userLocalValue: { '/local': true }, userRemoteValue: { '/remote': false } },
			'chat.plugins.marketplaces': { applicationValue: ['application'], userValue: ['user'] },
			'chat.plugins.extraMarketplaces': { policyValue: { managed: true } },
			'chat.plugins.strictMarketplaces': { applicationValue: ['application'], policyValue: ['policy'] },
			'chat.plugins.enabledPlugins': { applicationValue: { application: false }, policyValue: { policy: true } },
		});
		const storageService = store.add(new TestStorageService());
		storageService.store('agentPlugins.enablement', JSON.stringify([['private-plugin', false]]), StorageScope.PROFILE, StorageTarget.MACHINE);
		const reporter = new AgentPluginTelemetry(telemetryService, configurationService, storageService);
		reporter.logConfiguration();
		reporter.logConfiguration();

		const rows = telemetryService.events.map(event => ({ name: event.name, data: event.data as Record<string, unknown> }));
		assert.deepStrictEqual({
			counts: rows.reduce<Record<string, number>>((counts, row) => {
				counts[row.name] = (counts[row.name] ?? 0) + 1;
				return counts;
			}, {}),
			pluginGate: rows.filter(row => row.data.entryPoint === 'pluginsEnabled').map(row => [row.data.scope, row.data.enabledEntryCount, row.data.disabledEntryCount]),
			strictMarketplaces: rows.filter(row => row.data.entryPoint === 'strictMarketplaces').map(row => row.data.scope),
			enabledPlugins: rows.filter(row => row.data.entryPoint === 'enabledPlugins').map(row => [row.data.scope, row.data.enabledEntryCount, row.data.disabledEntryCount]),
		}, {
			counts: {
				agentPluginLocationsConfigured: 5,
				agentPluginMarketplacesConfigured: 5,
				agentPluginEnablementConfigured: 3,
			},
			pluginGate: [['policy', 0, 1], ['user', 0, 1], ['workspace', 1, 0]],
			strictMarketplaces: ['application', 'policy'],
			enabledPlugins: [['application', 0, 1], ['policy', 1, 0]],
		});
	});

	test('caps absent configuration telemetry at one marker per event family', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = new AgentPluginTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));

		reporter.logConfiguration();
		reporter.logConfiguration();

		assert.deepStrictEqual(telemetryService.events.map(event => event.name), [
			'agentPluginLocationsConfigured',
			'agentPluginMarketplacesConfigured',
			'agentPluginEnablementConfigured',
		]);
	});

	test('classifies the global integration gate as disabled rather than a collision', () => {
		const candidatePlugin = plugin('globally-disabled', AgentPluginDiscoveryOrigin.ConfiguredPath, PluginFormat.Copilot);
		const telemetryService = new TestTelemetryService();
		const reporter = new AgentPluginTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));
		store.add(autorun(reader => reporter.logDiscovery([{
			candidates: [{ origin: AgentPluginDiscoveryOrigin.ConfiguredPath, format: PluginFormat.Copilot, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: candidatePlugin, components: components(candidatePlugin) }],
		}], [], new Map(), false, reader)));

		const [row] = telemetryService.events.map(event => event.data).filter(isFoundRow);
		assert.deepStrictEqual({
			disabledCount: row.disabledCount,
			collisionCount: row.collisionCount,
			mcpServerCount: row.mcpServerCount,
		}, {
			disabledCount: 1,
			collisionCount: 0,
			mcpServerCount: 1,
		});
	});

	test('classifies a lower-priority Copilot CLI copy as a canonical collision', () => {
		const marketplaceUri = URI.file('/Users/test/.vscode-insiders/agent-plugins/github.com/microsoft/vscode-team-kit/model-council');
		const cliUri = URI.file('/Users/test/.copilot/installed-plugins/_direct/microsoft--vscode-team-kit--model-council');
		const marketplaceReference = parseMarketplaceReference('microsoft/vscode-team-kit');
		assert.ok(marketplaceReference);
		const marketplacePlugin: IAgentPlugin = {
			...plugin('marketplace', AgentPluginDiscoveryOrigin.VSCodeInstalled, PluginFormat.Copilot),
			uri: marketplaceUri,
			fromMarketplace: {
				name: 'model-council',
				description: '',
				version: '',
				source: 'model-council',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'model-council' },
				marketplace: 'microsoft/vscode-team-kit',
				marketplaceReference,
				marketplaceType: MarketplaceType.Copilot,
			},
		};
		const cliPlugin: IAgentPlugin = {
			...plugin('cli', AgentPluginDiscoveryOrigin.CopilotCliDirect, PluginFormat.Copilot),
			uri: cliUri,
		};
		const discoveries: IDiscoveredAgentPlugins[] = [
			{ priority: AgentPluginDiscoveryPriority.CopilotCli, order: 1, plugins: [cliPlugin] },
			{ priority: AgentPluginDiscoveryPriority.Marketplace, order: 0, plugins: [marketplacePlugin] },
		];
		const snapshots: IAgentPluginDiscoverySnapshot[] = [{
			candidates: [
				{ origin: AgentPluginDiscoveryOrigin.VSCodeInstalled, format: PluginFormat.Copilot, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: marketplacePlugin, components: components(marketplacePlugin) },
				{ origin: AgentPluginDiscoveryOrigin.CopilotCliDirect, format: PluginFormat.Copilot, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: cliPlugin, components: components(cliPlugin) },
			],
		}];
		const telemetryService = new TestTelemetryService();
		const reporter = new AgentPluginTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));
		const collisionGroups = getCanonicalAgentPluginCollisionGroups(discoveries);
		store.add(autorun(reader => reporter.logDiscovery(snapshots, [marketplacePlugin, cliPlugin], collisionGroups, true, reader)));

		const rows = telemetryService.events.map(event => event.data).filter(isFoundRow);
		assert.deepStrictEqual(rows.map(row => ({
			origin: row.origin,
			loadedCount: row.loadedCount,
			disabledCount: row.disabledCount,
			collisionCount: row.collisionCount,
		})), [
			{ origin: 'copilotCliDirect', loadedCount: 0, disabledCount: 0, collisionCount: 1 },
			{ origin: 'vscodeInstalled', loadedCount: 1, disabledCount: 0, collisionCount: 0 },
		]);
	});

	test('re-emits only the changed plugin dimension', () => {
		const first = plugin('first', AgentPluginDiscoveryOrigin.ConfiguredPath, PluginFormat.Copilot);
		const second = plugin('second', AgentPluginDiscoveryOrigin.ExtensionContribution, PluginFormat.Claude);
		const firstComponents = components(first);
		const snapshots = (updatedCommandCount: number): IAgentPluginDiscoverySnapshot[] => [{
			candidates: [
				{ origin: AgentPluginDiscoveryOrigin.ConfiguredPath, format: PluginFormat.Copilot, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: first, components: { ...firstComponents, commandCount: updatedCommandCount } },
				{ origin: AgentPluginDiscoveryOrigin.ExtensionContribution, format: PluginFormat.Claude, outcome: AgentPluginDiscoveryOutcome.Loaded, plugin: second, components: components(second) },
			],
		}];
		const telemetryService = new TestTelemetryService();
		const reporter = new AgentPluginTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));
		store.add(autorun(reader => {
			reporter.logDiscovery(snapshots(1), [first, second], new Map(), true, reader);
			reporter.logDiscovery(snapshots(2), [first, second], new Map(), true, reader);
		}));

		assert.deepStrictEqual(telemetryService.events.map(event => {
			const row = event.data as IFoundRow;
			return [row.origin, row.commandCount];
		}), [
			['configuredPath', 1],
			['extensionContribution', 1],
			['configuredPath', 2],
		]);
	});
});
