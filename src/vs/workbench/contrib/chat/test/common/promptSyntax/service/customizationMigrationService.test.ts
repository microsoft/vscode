/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
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
		const service = new CustomizationMigrationService(promptsService);

		const migrations = await service.computeMigrations(SessionType.AgentHostCopilot);
		const localMigrations = await service.computeMigrations(SessionType.Local);

		assert.deepStrictEqual({
			migrations: migrations.map(migration => ({
				type: migration.type,
				files: migration.files.map(file => file.path),
				candidates: migration.candidates.map(candidate => candidate.uri.path),
			})),
			localMigrations,
			requestedTypes: promptsService.requestedTypes,
		}, {
			migrations: [
				{
					type: 'userData',
					files: [
						'/user-data/prompts/reviewer.agent.md',
						'/user-data/prompts/style.instructions.md',
					],
					candidates: [
						'/user-data/prompts/reviewer.agent.md',
						'/user-data/prompts/style.instructions.md',
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
			requestedTypes: [PromptsType.agent, PromptsType.instructions, PromptsType.prompt],
		});
	});
});
