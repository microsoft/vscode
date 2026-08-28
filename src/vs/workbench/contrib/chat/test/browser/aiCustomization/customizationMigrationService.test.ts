/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { CustomizationMigrationService } from '../../../browser/aiCustomization/customizationMigrationService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

interface ITelemetryEvent {
	readonly name: string;
	readonly data: unknown;
}

class TestTelemetryService extends NullTelemetryServiceShape {
	constructor(private readonly events: ITelemetryEvent[]) {
		super();
	}

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

class TestPromptsService extends mock<IPromptsService>() {
	override readonly onDidChangeCustomAgents = Event.None;
	override readonly onDidChangeSlashCommands = Event.None;
	override readonly onDidChangeSkills = Event.None;
	override readonly onDidChangeHooks = Event.None;
	override readonly onDidChangeInstructions = Event.None;
	override readonly onDidChangeAgentInstructions = Event.None;

	constructor(private readonly paths: readonly IPromptPath[]) {
		super();
	}

	override async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage): Promise<readonly IPromptPath[]> {
		return this.paths.filter(path => path.type === type && path.storage === storage);
	}
}

suite('CustomizationMigrationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const workspaceRoot = URI.file('/workspace');
	const paths: readonly IPromptPath[] = [
		{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
		{ uri: URI.file('/user/prompts/release.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData },
		{ uri: URI.file('/user/agents/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
		{ uri: URI.file('/user/instructions/style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
		{ uri: URI.file('/user/agents/copilot.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.CopilotPersonal },
	];

	test('assesses and reports categorized findings without names', async () => {
		const telemetry: ITelemetryEvent[] = [];
		const service = disposables.add(new CustomizationMigrationService(
			new TestConfigurationService({ [ChatConfiguration.ChatCustomizationsMigrationAssessmentEnabled]: true }),
			new TestPromptsService(paths),
			new TestTelemetryService(telemetry),
		));

		const assessment = await service.assess({
			workspaceRoot,
			trigger: 'editorNewChat',
		}, CancellationToken.None);
		await service.assess({
			workspaceRoot,
			trigger: 'editorNewChat',
		}, CancellationToken.None);

		assert.deepStrictEqual({
			assessment,
			telemetry,
		}, {
			assessment: {
				state: 'complete',
				attentionNeeded: true,
				severity: 'warning',
				count: 4,
				findings: [
					{
						category: 'promptFiles',
						severity: 'warning',
						count: 2,
						sampleNames: ['review.prompt.md', 'release.prompt.md'],
					},
					{
						category: 'userData',
						severity: 'warning',
						count: 2,
						sampleNames: ['reviewer.agent.md', 'style.instructions.md'],
					},
				],
			},
			telemetry: [
				{
					name: 'chatCustomizationMigration.assessment',
					data: { trigger: 'editorNewChat', category: 'promptFiles', severity: 'warning', count: 2 },
				},
				{
					name: 'chatCustomizationMigration.assessment',
					data: { trigger: 'editorNewChat', category: 'userData', severity: 'warning', count: 2 },
				},
			],
		});
	});

	test('does no discovery or telemetry when disabled', async () => {
		let discoveryCount = 0;
		const promptsService = new class extends TestPromptsService {
			override async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage): Promise<readonly IPromptPath[]> {
				discoveryCount++;
				return super.listPromptFilesForStorage(type, storage);
			}
		}(paths);
		const telemetry: ITelemetryEvent[] = [];
		const service = disposables.add(new CustomizationMigrationService(
			new TestConfigurationService({ [ChatConfiguration.ChatCustomizationsMigrationAssessmentEnabled]: false }),
			promptsService,
			new TestTelemetryService(telemetry),
		));

		const assessment = await service.assess({
			workspaceRoot,
			trigger: 'agentsSessionOpen',
		}, CancellationToken.None);

		assert.deepStrictEqual({ assessment, discoveryCount, telemetry }, {
			assessment: {
				state: 'disabled',
				attentionNeeded: false,
				count: 0,
				findings: [],
			},
			discoveryCount: 0,
			telemetry: [],
		});
	});

	test('coalesces concurrent assessments for the same workspace', async () => {
		const releaseDiscovery = new DeferredPromise<void>();
		let discoveryCount = 0;
		const promptsService = new class extends TestPromptsService {
			override async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage): Promise<readonly IPromptPath[]> {
				discoveryCount++;
				await releaseDiscovery.p;
				return super.listPromptFilesForStorage(type, storage);
			}
		}(paths);
		const service = disposables.add(new CustomizationMigrationService(
			new TestConfigurationService({ [ChatConfiguration.ChatCustomizationsMigrationAssessmentEnabled]: true }),
			promptsService,
			new TestTelemetryService([]),
		));

		const first = service.assess({ workspaceRoot }, CancellationToken.None);
		const second = service.assess({ workspaceRoot }, CancellationToken.None);
		releaseDiscovery.complete();
		const [firstResult, secondResult] = await Promise.all([first, second]);

		assert.deepStrictEqual({
			discoveryCount,
			sharedResult: firstResult === secondResult,
		}, {
			discoveryCount: 4,
			sharedResult: true,
		});
	});
});
