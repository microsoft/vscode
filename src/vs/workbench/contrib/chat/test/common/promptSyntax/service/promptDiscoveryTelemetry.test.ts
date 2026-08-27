/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationValue } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import { PromptFileFormat, PromptFileSource, PromptRootKind, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { ILocalPromptPath, IPromptDiscoveryInfo, IPromptFileDiscoveryResult, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { aggregatePromptDiscovery, PromptDiscoveryTelemetry } from '../../../../common/promptSyntax/service/promptDiscoveryTelemetry.js';

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

suite('PromptDiscoveryTelemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function candidate(index: number, type: PromptsType, source: PromptFileSource, format: PromptFileFormat, rootKind: PromptRootKind, status: IPromptFileDiscoveryResult['status'] = 'loaded', skipReason?: IPromptFileDiscoveryResult['skipReason']): IPromptFileDiscoveryResult {
		const promptPath: ILocalPromptPath = {
			uri: URI.file(`/candidate-${index}`),
			storage: PromptsStorage.local,
			type,
			source,
			format,
			rootKind,
		};
		return { status, skipReason, promptPath };
	}

	test('aggregates every prompt-family origin, format, and status without identities', () => {
		const files: IPromptFileDiscoveryResult[] = [
			candidate(1, PromptsType.prompt, PromptFileSource.GitHubWorkspace, PromptFileFormat.PromptMarkdown, PromptRootKind.Workspace),
			candidate(2, PromptsType.prompt, PromptFileSource.UserData, PromptFileFormat.PromptMarkdown, PromptRootKind.Profile),
			candidate(3, PromptsType.prompt, PromptFileSource.ConfigWorkspace, PromptFileFormat.PromptMarkdown, PromptRootKind.ParentRepository),
			candidate(4, PromptsType.prompt, PromptFileSource.ConfigPersonal, PromptFileFormat.PromptMarkdown, PromptRootKind.UserHome),
			candidate(5, PromptsType.prompt, PromptFileSource.ExtensionContribution, PromptFileFormat.PromptMarkdown, PromptRootKind.Extension),
			candidate(6, PromptsType.prompt, PromptFileSource.ExtensionAPI, PromptFileFormat.PromptMarkdown, PromptRootKind.Extension),
			candidate(7, PromptsType.prompt, PromptFileSource.Plugin, PromptFileFormat.PluginCommandMarkdown, PromptRootKind.Plugin),
			candidate(8, PromptsType.agent, PromptFileSource.GitHubWorkspace, PromptFileFormat.AgentMarkdown, PromptRootKind.Workspace),
			candidate(9, PromptsType.agent, PromptFileSource.ClaudeWorkspace, PromptFileFormat.LegacyChatModeMarkdown, PromptRootKind.Workspace),
			candidate(10, PromptsType.agent, PromptFileSource.CopilotPersonal, PromptFileFormat.PlainMarkdown, PromptRootKind.UserHome),
			candidate(11, PromptsType.agent, PromptFileSource.ClaudePersonal, PromptFileFormat.PlainMarkdown, PromptRootKind.UserHome),
			candidate(12, PromptsType.agent, PromptFileSource.Plugin, PromptFileFormat.PluginAgentMarkdown, PromptRootKind.Plugin, 'skipped', 'disabled'),
		];
		const info: IPromptDiscoveryInfo = { type: PromptsType.prompt, files, durationInMillis: 1 };
		const summarize = (type: PromptsType) => aggregatePromptDiscovery(info, type, type === PromptsType.instructions ? 'agent' : 'notApplicable')
			.map(row => [row.origin, row.format, row.rootKind, row.candidateCount, row.loadedCount, row.disabledCount, row.parseErrorCount, row.otherRejectedCount]);

		assert.deepStrictEqual({
			prompts: summarize(PromptsType.prompt),
			agents: summarize(PromptsType.agent),
		}, {
			prompts: [
				['configPersonal', 'promptMarkdown', 'userHome', 1, 1, 0, 0, 0],
				['configWorkspace', 'promptMarkdown', 'parentRepository', 1, 1, 0, 0, 0],
				['extensionAPI', 'promptMarkdown', 'extension', 1, 1, 0, 0, 0],
				['extensionContribution', 'promptMarkdown', 'extension', 1, 1, 0, 0, 0],
				['githubWorkspace', 'promptMarkdown', 'workspace', 1, 1, 0, 0, 0],
				['plugin', 'pluginCommandMarkdown', 'plugin', 1, 1, 0, 0, 0],
				['userData', 'promptMarkdown', 'profile', 1, 1, 0, 0, 0],
			],
			agents: [
				['claudePersonal', 'plainMarkdown', 'userHome', 1, 1, 0, 0, 0],
				['claudeWorkspace', 'legacyChatModeMarkdown', 'workspace', 1, 1, 0, 0, 0],
				['copilotPersonal', 'plainMarkdown', 'userHome', 1, 1, 0, 0, 0],
				['githubWorkspace', 'agentMarkdown', 'workspace', 1, 1, 0, 0, 0],
				['plugin', 'pluginAgentMarkdown', 'plugin', 1, 0, 1, 0, 0],
			],
		});
	});

	test('emits one zero row and suppresses duplicate snapshots', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = new PromptDiscoveryTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));
		reporter.logEmptyDiscovery('promptFilesFound', 'test');
		reporter.logEmptyDiscovery('promptFilesFound', 'test');
		reporter.logConfiguration();
		reporter.logConfiguration();

		assert.deepStrictEqual({
			zeroEventCount: telemetryService.events.filter(event => event.name === 'promptFilesFound').length,
			configurationEventCount: telemetryService.events.filter(event => event.name.endsWith('Configured')).length,
		}, {
			zeroEventCount: 1,
			configurationEventCount: 3,
		});
	});

	test('reports disabled storage and application/policy lockdown layers exactly', () => {
		const telemetryService = new TestTelemetryService();
		const storageService = store.add(new TestStorageService());
		storageService.store('chat.disabledPromptFiles.agent', JSON.stringify([{ path: '/agent' }]), StorageScope.PROFILE, StorageTarget.USER);
		const reporter = new PromptDiscoveryTelemetry(
			telemetryService,
			new LayeredConfigurationService({
				[COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG]: { applicationValue: { agents: true }, policyValue: { instructions: true } },
			}),
			storageService,
		);

		reporter.logConfiguration();

		const rows = telemetryService.events
			.filter(event => event.name === 'customAgentLocationsConfigured' && event.data && typeof event.data === 'object')
			.map(event => event.data as Record<string, unknown>);
		const summarize = (row: Record<string, unknown>) => ({
			scope: row.scope,
			entryPoint: row.entryPoint,
			configurationPresent: row.configurationPresent,
			configuredEntryCount: row.configuredEntryCount,
			enabledEntryCount: row.enabledEntryCount,
			disabledEntryCount: row.disabledEntryCount,
		});
		assert.deepStrictEqual({
			agents: rows.map(summarize),
		}, {
			agents: [
				{ scope: 'profile', entryPoint: 'profileDisablement', configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 0, disabledEntryCount: 1 },
				{ scope: 'application', entryPoint: 'standaloneLockdown', configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 1, disabledEntryCount: 0 },
				{ scope: 'policy', entryPoint: 'standaloneLockdown', configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 1, disabledEntryCount: 0 },
			],
		});
	});

	test('emits only a changed configuration dimension and tombstones its removal', async () => {
		const telemetryService = new TestTelemetryService();
		const configurationService = new TestConfigurationService({ 'chat.promptFilesLocations': { location: true } });
		const reporter = new PromptDiscoveryTelemetry(telemetryService, configurationService, store.add(new TestStorageService()));
		reporter.logConfiguration();
		telemetryService.events.length = 0;

		await configurationService.setUserConfiguration('chat.promptFilesLocations', { location: false });
		reporter.logConfiguration();
		await configurationService.setUserConfiguration('chat.promptFilesLocations', undefined);
		reporter.logConfiguration();

		assert.deepStrictEqual(telemetryService.events.filter(event => event.name === 'promptFileLocationsConfigured').map(event => event.data), [
			{ scope: 'user', entryPoint: 'locations', configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 0, disabledEntryCount: 1 },
			{ scope: 'all', entryPoint: 'all', configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0 },
			{ scope: 'user', entryPoint: 'locations', configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0 },
		]);
	});
});
