/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../common/customizationHarnessService.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { PromptFileSource, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationService } from '../../../../common/promptSyntax/service/customizationMigrationServiceImpl.js';
import { IPromptPath, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { MockPromptsService } from './mockPromptsService.js';

class TestPromptsService extends MockPromptsService {
	readonly requestedTypes: PromptsType[] = [];

	constructor(private readonly files: readonly IPromptPath[]) {
		super();
	}

	override async listPromptFiles(type: PromptsType): Promise<readonly IPromptPath[]> {
		this.requestedTypes.push(type);
		return this.files.filter(file => file.type === type);
	}
}

class TestCustomizationHarnessService extends mock<ICustomizationHarnessService>() {
	readonly requestedSourceFolderTypes: PromptsType[] = [];

	constructor(
		private readonly sessionType = SessionType.AgentHostCopilot,
		private readonly harnessLabel = 'Copilot',
	) {
		super();
	}

	override findHarnessById(sessionType: string): IHarnessDescriptor | undefined {
		if (sessionType !== this.sessionType) {
			return undefined;
		}
		return {
			id: sessionType,
			label: this.harnessLabel,
			icon: Codicon.copilot,
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: async () => [],
				provideSourceFolders: async (_sessionResource, type) => {
					this.requestedSourceFolderTypes.push(type);
					switch (type) {
						case PromptsType.agent:
							return [{ uri: URI.file('/copilot/agents'), label: 'Agents', source: PromptsStorage.user }];
						case PromptsType.skill:
							return [
								{ uri: URI.file('/workspace/.github/skills'), label: 'Workspace Skills', source: PromptsStorage.local },
								{ uri: URI.file('/copilot/skills'), label: 'User Skills', source: PromptsStorage.user },
							];
						default:
							return [];
					}
				},
			},
		};
	}
}

suite('CustomizationMigrationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('computes the dialog migration candidates for Agent Host sessions', async () => {
		const promptsService = store.add(new TestPromptsService([
			{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/user-data/prompts/release.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
			{ uri: URI.file('/home/test/.copilot/agents/planner.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.CopilotPersonal },
			{ uri: URI.file('/workspace/.github/skills/deploy/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.GitHubWorkspace },
		]));
		const harnessService = new TestCustomizationHarnessService();
		const service = new CustomizationMigrationService(promptsService, harnessService);
		const agentHostSessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' });
		const localSessionResource = URI.from({ scheme: SessionType.Local, path: '/session' });

		const migrations = await service.computeMigrations(agentHostSessionResource);
		const localMigrations = await service.computeMigrations(localSessionResource);
		const hint = await service.computeMigrationHint(agentHostSessionResource);
		const localHint = await service.computeMigrationHint(localSessionResource);

		assert.deepStrictEqual({
			migrations: migrations.map(migration => ({
				type: migration.type,
				files: migration.files.map(file => file.path),
				candidates: migration.candidates.map(candidate => candidate.uri.path),
			})),
			localMigrations,
			hint,
			localHint,
			requestedTypes: promptsService.requestedTypes,
			requestedSourceFolderTypes: harnessService.requestedSourceFolderTypes.toSorted(),
		}, {
			migrations: [
				{
					type: 'userData',
					files: [
						'/user-data/prompts/reviewer.agent.md',
					],
					candidates: [
						'/user-data/prompts/reviewer.agent.md',
					],
				},
				{
					type: 'promptFiles',
					files: [
						'/workspace/.github/prompts/review.prompt.md',
						'/user-data/prompts/release.prompt.md',
					],
					candidates: [
						'/workspace/.github/prompts/review.prompt.md',
						'/user-data/prompts/release.prompt.md',
					],
				},
			],
			localMigrations: [
				{ type: 'userData', files: [], candidates: [] },
				{ type: 'promptFiles', files: [], candidates: [] },
			],
			hint: 'Found 3 customization files that are present but not used by Copilot and could be migrated.',
			localHint: undefined,
			requestedTypes: [
				PromptsType.agent, PromptsType.instructions, PromptsType.prompt,
				PromptsType.agent, PromptsType.instructions, PromptsType.prompt,
			],
			requestedSourceFolderTypes: [
				PromptsType.agent, PromptsType.agent, PromptsType.instructions,
				PromptsType.instructions, PromptsType.skill, PromptsType.skill,
			],
		});
	});

	test('uses the session harness label in migration hints', async () => {
		const promptsService = store.add(new TestPromptsService([
			{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
		]));
		const harnessService = new TestCustomizationHarnessService(SessionType.AgentHostClaude, 'Claude');
		const service = new CustomizationMigrationService(promptsService, harnessService);

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostClaude, path: '/session' }));

		assert.strictEqual(hint, 'Found 1 customization file that is present but not used by Claude and could be migrated.');
	});
});
