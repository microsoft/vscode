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
import { AgentInstructionFileSource, AgentInstructionFileType, ILocalPromptPath, IPromptDiscoveryInfo, IPromptFileDiscoveryResult, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { aggregateAutomaticInstructions, aggregatePromptDiscovery, aggregateSpeechInstructions, PromptDiscoveryTelemetry } from '../../../../common/promptSyntax/service/promptDiscoveryTelemetry.js';

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
			candidate(13, PromptsType.skill, PromptFileSource.AgentsWorkspace, PromptFileFormat.SkillMarkdown, PromptRootKind.Workspace),
			candidate(14, PromptsType.skill, PromptFileSource.AgentsPersonal, PromptFileFormat.SkillMarkdown, PromptRootKind.UserHome),
			candidate(15, PromptsType.skill, PromptFileSource.BuiltIn, PromptFileFormat.SkillMarkdown, PromptRootKind.BuiltIn),
			candidate(16, PromptsType.skill, PromptFileSource.ExtensionContribution, PromptFileFormat.SkillMarkdown, PromptRootKind.Extension, 'skipped', 'parse-error'),
			candidate(17, PromptsType.instructions, PromptFileSource.GitHubWorkspace, PromptFileFormat.InstructionsMarkdown, PromptRootKind.Workspace),
			candidate(18, PromptsType.instructions, PromptFileSource.CopilotPersonal, PromptFileFormat.CopilotInstructionsMarkdown, PromptRootKind.UserHome),
			candidate(19, PromptsType.instructions, PromptFileSource.ClaudeWorkspace, PromptFileFormat.ClaudeRuleMarkdown, PromptRootKind.ParentRepository),
			candidate(20, PromptsType.instructions, PromptFileSource.Plugin, PromptFileFormat.PluginInstructionsMarkdown, PromptRootKind.Plugin),
			candidate(21, PromptsType.instructions, PromptFileSource.Plugin, PromptFileFormat.PluginMdc, PromptRootKind.Plugin),
			candidate(22, PromptsType.instructions, PromptFileSource.Plugin, PromptFileFormat.PluginMarkdown, PromptRootKind.Plugin, 'skipped', 'duplicate-name'),
		];
		const info: IPromptDiscoveryInfo = { type: PromptsType.prompt, files, durationInMillis: 1 };
		const summarize = (type: PromptsType) => aggregatePromptDiscovery(info, type, type === PromptsType.instructions ? 'agent' : 'notApplicable')
			.map(row => [row.origin, row.format, row.rootKind, row.candidateCount, row.loadedCount, row.disabledCount, row.parseErrorCount, row.otherRejectedCount]);

		assert.deepStrictEqual({
			prompts: summarize(PromptsType.prompt),
			agents: summarize(PromptsType.agent),
			skills: summarize(PromptsType.skill),
			instructions: summarize(PromptsType.instructions),
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
			skills: [
				['agentsPersonal', 'skillMarkdown', 'userHome', 1, 1, 0, 0, 0],
				['agentsWorkspace', 'skillMarkdown', 'workspace', 1, 1, 0, 0, 0],
				['builtIn', 'skillMarkdown', 'builtIn', 1, 1, 0, 0, 0],
				['extensionContribution', 'skillMarkdown', 'extension', 1, 0, 0, 1, 0],
			],
			instructions: [
				['claudeWorkspace', 'claudeRuleMarkdown', 'parentRepository', 1, 1, 0, 0, 0],
				['copilotPersonal', 'copilotInstructionsMarkdown', 'userHome', 1, 1, 0, 0, 0],
				['githubWorkspace', 'instructionsMarkdown', 'workspace', 1, 1, 0, 0, 0],
				['plugin', 'pluginInstructionsMarkdown', 'plugin', 1, 1, 0, 0, 0],
				['plugin', 'pluginMarkdown', 'plugin', 1, 0, 0, 0, 1],
				['plugin', 'pluginMdc', 'plugin', 1, 1, 0, 0, 0],
			],
		});
	});

	test('covers automatic, speech, zero rows, and duplicate suppression', () => {
		const automatic = aggregateAutomaticInstructions([
			{ uri: URI.file('/workspace/AGENTS.md'), realPath: undefined, type: AgentInstructionFileType.agentsMd, source: AgentInstructionFileSource.WorkspaceRoot, rootKind: PromptRootKind.Workspace },
			{ uri: URI.file('/parent/CLAUDE.md'), realPath: undefined, type: AgentInstructionFileType.claudeMd, source: AgentInstructionFileSource.ParentRepository, rootKind: PromptRootKind.ParentRepository },
			{ uri: URI.file('/home/.copilot/copilot-instructions.md'), realPath: undefined, type: AgentInstructionFileType.copilotInstructionsMd, source: AgentInstructionFileSource.CopilotPersonal, rootKind: PromptRootKind.UserHome },
		]);
		const speech = aggregateSpeechInstructions('voice', [
			{ origin: 'githubWorkspace', rootKind: PromptRootKind.Workspace, status: 'loaded' },
			{ origin: 'copilotPersonal', rootKind: PromptRootKind.UserHome, status: 'rejected' },
		]);
		const telemetryService = new TestTelemetryService();
		const reporter = new PromptDiscoveryTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));
		reporter.logEmptyDiscovery('promptFilesFound', 'test');
		reporter.logEmptyDiscovery('promptFilesFound', 'test');
		reporter.logConfiguration();
		reporter.logConfiguration();

		assert.deepStrictEqual({
			automatic: automatic.map(row => [row.origin, row.format, row.rootKind]),
			speech: speech.map(row => [row.origin, row.format, row.loadedCount, row.otherRejectedCount]),
			zeroEventCount: telemetryService.events.filter(event => event.name === 'promptFilesFound').length,
			configurationEventCount: telemetryService.events.filter(event => event.name.endsWith('Configured')).length,
		}, {
			automatic: [
				['copilotPersonal', 'copilotInstructionsMd', 'userHome'],
				['parentRepository', 'claudeMd', 'parentRepository'],
				['workspaceRoot', 'agentsMd', 'workspace'],
			],
			speech: [
				['copilotPersonal', 'voiceMarkdown', 0, 1],
				['githubWorkspace', 'voiceMarkdown', 1, 0],
			],
			zeroEventCount: 1,
			configurationEventCount: 6,
		});
	});

	test('reports disabled storage and application/policy lockdown layers exactly', () => {
		const telemetryService = new TestTelemetryService();
		const storageService = store.add(new TestStorageService());
		storageService.store('chat.disabledPromptFiles.agent', JSON.stringify([{ path: '/agent' }]), StorageScope.PROFILE, StorageTarget.USER);
		storageService.store('chat.disabledPromptFiles.skill', JSON.stringify([{ path: '/skill' }]), StorageScope.PROFILE, StorageTarget.USER);
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
		const skillProfile = telemetryService.events
			.filter(event => event.name === 'agentSkillLocationsConfigured' && event.data && typeof event.data === 'object')
			.map(event => event.data as Record<string, unknown>)
			.find(row => row.entryPoint === 'profileDisablement');
		assert.deepStrictEqual({
			agents: rows.map(summarize),
			skillProfile: skillProfile && summarize(skillProfile),
		}, {
			agents: [
				{ scope: 'profile', entryPoint: 'profileDisablement', configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 0, disabledEntryCount: 1 },
				{ scope: 'application', entryPoint: 'standaloneLockdown', configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 1, disabledEntryCount: 0 },
				{ scope: 'policy', entryPoint: 'standaloneLockdown', configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 1, disabledEntryCount: 0 },
			],
			skillProfile: { scope: 'profile', entryPoint: 'profileDisablement', configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 0, disabledEntryCount: 1 },
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
