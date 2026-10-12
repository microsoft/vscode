/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { dirname, isEqual } from '../../../../../../base/common/resources.js';
import { parseFrontMatter, YamlParseError } from '../../../../../../base/common/yaml.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileType, IFileDeleteOptions, IFileWriteOptions, createFileSystemProviderError, FileSystemProviderErrorCode } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationType, FileCustomizationMigrationFailureReason, IMcpServerCustomizationMigrationCandidate, McpServerCustomizationMigrationFailureReason, type MigratableConfiguration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage, type IPromptPath } from '../../../common/promptSyntax/service/promptsService.js';
import { ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import { createCustomizationMigrationAgentPrompt, createSkillFileUri, getCustomizationMigrationConflictTarget, migrateCustomizations, migratePromptFileToSkill, resolveWorkspaceMigrationTargetFolder, type CustomizationMigrationTargetFolders } from '../../../browser/aiCustomization/customizationMigration.js';
import { CUSTOMIZATION_MIGRATION_CATEGORIES, CustomizationMigrationCategoryId, getCustomizationMigrationCategory } from '../../../browser/aiCustomization/customizationMigrationCategories.js';

class DeleteFailingFileSystemProvider extends InMemoryFileSystemProvider {
	deleteFailureResource: URI | undefined;

	override async delete(resource: URI, options: IFileDeleteOptions): Promise<void> {
		if (this.deleteFailureResource && isEqual(resource, this.deleteFailureResource)) {
			throw new Error('Expected delete failure');
		}
		await super.delete(resource, options);
	}
}

class ConcurrentTargetFileSystemProvider extends InMemoryFileSystemProvider {
	conflictResource: URI | undefined;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		if (this.conflictResource && isEqual(resource, this.conflictResource)) {
			this.conflictResource = undefined;
			await super.writeFile(resource, VSBuffer.fromString('foreign content').buffer, {
				create: true,
				overwrite: true,
				unlock: false,
				atomic: false,
			});
			throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
		}
		await super.writeFile(resource, content, options);
	}
}

suite('customizationMigration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('splits candidates into focused, non-overlapping categories', () => {
		const customizations: IPromptPath[] = [
			{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/user-data/prompts/release.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
			{ uri: URI.file('/home/test/.copilot/agents/planner.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.CopilotPersonal },
			{ uri: URI.file('/workspace/.github/skills/deploy/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/workspace/custom-agents/reviewer.agent.md'), storage: PromptsStorage.local, type: PromptsType.agent, source: PromptFileSource.ConfigWorkspace },
			{ uri: URI.file('/home/test/custom-instructions/style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.ConfigPersonal },
			{ uri: URI.file('/workspace/custom-skills/deploy/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.ConfigWorkspace },
		];
		const candidatesFor = (id: CustomizationMigrationCategoryId) => customizations
			.filter(customization => getCustomizationMigrationCategory(id).isCandidate?.(customization) === true)
			.map(customization => customization.uri.path);

		assert.deepStrictEqual({
			promptFiles: candidatesFor(CustomizationMigrationCategoryId.PromptFiles),
			userData: candidatesFor(CustomizationMigrationCategoryId.UserData),
			configuredLocations: candidatesFor(CustomizationMigrationCategoryId.ConfiguredLocations),
			sourceTypes: CUSTOMIZATION_MIGRATION_CATEGORIES.map(category => [category.id, [...(category.sourceTypes ?? [])]]),
		}, {
			promptFiles: [
				'/workspace/.github/prompts/review.prompt.md',
				'/user-data/prompts/release.prompt.md',
			],
			userData: [
				'/user-data/prompts/reviewer.agent.md',
				'/user-data/prompts/style.instructions.md',
			],
			configuredLocations: [
				'/workspace/custom-agents/reviewer.agent.md',
				'/home/test/custom-instructions/style.instructions.md',
				'/workspace/custom-skills/deploy/SKILL.md',
			],
			sourceTypes: [
				[CustomizationMigrationCategoryId.PromptFiles, [PromptsType.prompt]],
				[CustomizationMigrationCategoryId.UserData, [PromptsType.agent, PromptsType.instructions]],
				[CustomizationMigrationCategoryId.ConfiguredLocations, [PromptsType.agent, PromptsType.instructions, PromptsType.skill]],
				[CustomizationMigrationCategoryId.McpServers, []],
			],
		});
	});

	test('presents MCP source-to-target migration without file-only behavior', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers);
		const candidate = {
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.local,
			id: 'server',
			name: 'Server',
			sourceUri: URI.file('/workspace/.vscode/mcp.json'),
			targetUri: URI.file('/workspace/.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		} as const;

		assert.deepStrictEqual({
			confirmation: category.getConfirmation([candidate], 'Copilot'),
			failure: category.getMcpServerFailureMessage?.([{
				storage: candidate.storage,
				id: candidate.id,
				name: candidate.name,
				sourceUri: candidate.sourceUri,
				targetUri: candidate.targetUri,
				reason: McpServerCustomizationMigrationFailureReason.TargetConflict,
			}]),
		}, {
			confirmation: {
				message: 'Migrate 1 MCP server to .mcp.json?',
				detail: 'Eligible entries are removed from .vscode/mcp.json after they are written and verified in .mcp.json. Entries that cannot be migrated stay in place.',
				primaryButton: 'Migrate',
			},
			failure: 'Could not migrate \'Server\' because the destination already contains a different server with that name.',
		});
	});

	test('explains prompt-to-skill metadata loss and invocation behavior before migration', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.PromptFiles);
		const workspacePrompt: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const userPrompt: MigratableConfiguration = {
			...workspacePrompt,
			uri: URI.file('/user-data/prompts/release.prompt.md'),
			storage: PromptsStorage.user,
			source: PromptFileSource.UserData,
		};
		const consequences = 'Unsupported prompt-only headers are removed. Converted skills set disable-model-invocation: true, so the agent will not load them automatically; invoke them manually with /name.';

		assert.deepStrictEqual({
			consequences: category.preMigrationConsequences,
			candidateWarnings: category.getCandidateWarnings?.(workspacePrompt, 'Copilot'),
			confirmation: category.getConfirmation([workspacePrompt, userPrompt], 'Copilot'),
		}, {
			consequences,
			candidateWarnings: undefined,
			confirmation: {
				message: 'Convert prompt files to skills?',
				detail: `This converts 1 workspace prompt files and 1 user prompt files into skills.\n\n${consequences}`,
				primaryButton: 'Convert to Skills',
				deleteOriginalsLabel: 'Delete original prompt files after migration',
			},
		});
	});

	test('builds an agent prompt from discovered sources and harness-reported targets', () => {
		const recoveryBundleFolder = URI.file('/recovery/vscode-customization-migration');
		const prompt = createCustomizationMigrationAgentPrompt(
			{ id: 'agent-host-copilotcli', label: 'Copilot' },
			'migration-flow-id',
			recoveryBundleFolder,
			[
				{
					category: CustomizationMigrationType.PromptFiles,
					customization: { uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt },
				},
				{
					category: CustomizationMigrationType.McpServers,
					customization: {
						type: CustomizationMigrationType.McpServers,
						storage: PromptsStorage.user,
						id: 'server',
						name: 'Server',
						sourceUri: URI.file('/profile/mcp.json'),
						targetUri: URI.file('/home/.copilot/mcp-config.json'),
						projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
					},
				},
				{
					category: CustomizationMigrationType.ConfiguredLocations,
					customization: { uri: URI.file('/workspace/custom/review.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions },
				},
			],
			new Map([
				[PromptsType.skill, [
					{ uri: URI.file('/workspace/.github/skills'), label: 'Workspace skills', source: 'local' },
					{ uri: URI.file('/home/.copilot/skills'), label: 'User skills', source: 'user' },
				]],
			]),
		);

		assert.strictEqual(prompt.replace(/\\/g, '/'), [
			'/migrate-customizations',
			'',
			'Selected harness: Copilot (agent-host-copilotcli)',
			'Migration telemetry flow: migration-flow-id',
			'Recovery bundle folder: file:///recovery/vscode-customization-migration',
			`Recovery bundle filesystem path: ${recoveryBundleFolder.path}`,
			'',
			'Customizations that need migration:',
			'- promptFiles: prompt (local): file:///workspace/.github/prompts/review.prompt.md',
			'- mcpServers: MCP server "Server" (user): file:///profile/mcp.json -> file:///home/.copilot/mcp-config.json',
			'- configuredLocations: instructions (local): file:///workspace/custom/review.instructions.md',
			'',
			'Valid target folders reported by the selected harness:',
			'- skill (local, Workspace skills): file:///workspace/.github/skills',
			'- skill (user, User skills): file:///home/.copilot/skills',
		].join('\n'));
	});

	test('configured locations copy explains harness discovery and setting scope', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.ConfiguredLocations);
		const agent: IPromptPath = {
			uri: URI.file('/workspace/.custom/agents/super.agent.md'),
			storage: PromptsStorage.local,
			type: PromptsType.agent,
			source: PromptFileSource.ConfigWorkspace,
		};

		assert.deepStrictEqual({
			settingIds: category.configurationSettingIds,
			card: category.getCardDescription([agent], 'Copilot'),
			actionAriaLabel: category.cardActionAriaLabel,
			confirmationDetail: category.getConfirmation([agent], 'Copilot').detail,
		}, {
			settingIds: [
				PromptsConfig.AGENTS_LOCATION_KEY,
				PromptsConfig.MODE_LOCATION_KEY,
				PromptsConfig.SKILLS_LOCATION_KEY,
				PromptsConfig.INSTRUCTIONS_LOCATION_KEY,
			],
			card: 'Found 1 customization in a location observed only by the Local agent harness. Copilot picks it up when running in VS Code. Move it to a supported location for use outside VS Code.',
			actionAriaLabel: 'Migrate customizations from VS Code-configured locations',
			confirmationDetail: 'This moves 1 customization out of a VS Code-configured location. If all customizations that use the affected location setting migrate successfully, that setting is cleared.',
		});
	});

	test('scopes MCP confirmation to the selected servers', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers);
		const user = {
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.user,
			id: 'user',
			name: 'User server',
			sourceUri: URI.file('/profile/mcp.json'),
			targetUri: URI.file('/home/.copilot/mcp-config.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		} as const;
		const workspace = { ...user, id: 'workspace', storage: PromptsStorage.local } as const;
		const confirmations = [[user], [user, { ...user, id: 'secondUser' }], [user, workspace]]
			.map(candidates => category.getConfirmation(candidates, 'Copilot'));
		assert.deepStrictEqual({
			confirmations,
		}, {
			confirmations: [
				{
					message: 'Migrate 1 MCP server?',
					detail: 'Move to Copilot home for use across profiles and workspaces. The original entry will be removed.\n\nDisabled servers may become enabled.',
					primaryButton: 'Migrate',
				},
				{
					message: 'Migrate 2 MCP servers?',
					detail: 'Move to Copilot home for use across profiles and workspaces. The original entries will be removed.\n\nDisabled servers may become enabled.',
					primaryButton: 'Migrate',
				},
				{
					message: 'Migrate 2 MCP servers?',
					detail: 'Move user servers to Copilot home and workspace servers to .mcp.json. The original entries will be removed.\n\nDisabled user servers may become enabled.',
					primaryButton: 'Migrate',
				},
			],
		});
	});

	test('describes MCP property removals', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers);
		const server: IMcpServerCustomizationMigrationCandidate = {
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.user,
			id: 'changed',
			name: 'Changed',
			sourceUri: URI.file('/profile/mcp.json'),
			targetUri: URI.file('/home/.copilot/mcp-config.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
			removedProperties: { gallery: true },
		};
		const warning = 'Removes \'gallery\'. Registry updates will stop.';

		assert.deepStrictEqual(category.getCandidateWarnings?.(server, 'Copilot'), [warning]);
	});

	test('explains MCP target conflicts and prioritizes rollback guidance', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers);
		const failure = {
			storage: PromptsStorage.local as const,
			id: 'demo',
			name: 'demo',
			sourceUri: URI.file('/secondary/.vscode/mcp.json'),
			targetUri: URI.file('/secondary/.mcp.json'),
			reason: McpServerCustomizationMigrationFailureReason.TargetConflict,
		};

		assert.deepStrictEqual({
			single: category.getMcpServerFailureMessage?.([failure]),
			rollback: category.getMcpServerFailureMessage?.([failure, { ...failure, reason: McpServerCustomizationMigrationFailureReason.RollbackFailed }]),
		}, {
			single: 'Could not migrate \'demo\' because the destination already contains a different server with that name.',
			rollback: 'Some MCP server migrations could not be safely completed or rolled back. Review the affected source and destination MCP configuration files.',
		});
	});


	test('uses singular copy for one User Data customization', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.UserData);
		const harnessLabel = 'Copilot';
		const agent: IPromptPath = {
			uri: URI.file('/user-data/prompts/reviewer.agent.md'),
			storage: PromptsStorage.user,
			type: PromptsType.agent,
			source: PromptFileSource.UserData,
		};
		const instruction: IPromptPath = {
			uri: URI.file('/user-data/prompts/style.instructions.md'),
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};

		assert.deepStrictEqual({
			agent: {
				card: category.getCardDescription([agent], harnessLabel),
				confirmation: category.getConfirmation([agent], harnessLabel, '~/.copilot/agents'),
			},
			instruction: {
				card: category.getCardDescription([instruction], harnessLabel),
				confirmation: category.getConfirmation([instruction], harnessLabel).detail,
			},
			mixed: {
				card: category.getCardDescription([agent, instruction], harnessLabel),
				confirmation: category.getConfirmation([agent, instruction], harnessLabel).detail,
			},
			migrated: category.getMigratedMessage(1),
			failed: category.getFailedMessage(['reviewer.agent.md'], 0),
		}, {
			agent: {
				card: 'User data customizations are only used by VS Code. Found 1 agent that Copilot ignores. Move it to keep it available.',
				confirmation: {
					message: 'Migrate user data customizations to \'~/.copilot/agents\'?',
					detail: 'This moves 1 agent out of user data.',
					primaryButton: 'Migrate',
					deleteOriginalsLabel: 'Delete the original files from user data after migration',
				},
			},
			instruction: {
				card: 'User data customizations are only used by VS Code. Found 1 instruction file that Copilot ignores. Move it to keep it available.',
				confirmation: 'This moves 1 instruction file out of user data.',
			},
			mixed: {
				card: 'User data customizations are only used by VS Code. Found 2 customizations that Copilot ignores. Move them to keep them available.',
				confirmation: 'This moves 2 customizations out of user data.',
			},
			migrated: 'Migrated 1 user data customization.',
			failed: 'Failed to migrate 1 user data customization: reviewer.agent.md.',
		});
	});

	test('migrates prompt headers into a skill file', () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review Prompt',
			description: 'Review the active change',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const content = [
			'---',
			'name: "Review Prompt"',
			'description: "Review the active change"',
			'argument-hint: "[diff]"',
			'tools: [read_file, edit_file]',
			'mode: code',
			'---',
			'## Steps',
			'',
			'- Review the diff',
		].join('\n');

		const migrated = migratePromptFileToSkill(promptFile, content);
		const errors: YamlParseError[] = [];
		const parsed = parseFrontMatter(migrated.content, errors);
		const headerKeys = parsed?.header?.type === 'map'
			? parsed.header.properties.map(property => property.key.value)
			: [];

		assert.deepStrictEqual({
			skillName: migrated.skillName,
			unsupportedHeaderKeys: migrated.unsupportedHeaderKeys,
			errors,
			headerKeys,
			name: parsed?.getStringValue('name'),
			description: parsed?.getStringValue('description'),
			disableModelInvocation: parsed?.getBooleanValue('disable-model-invocation'),
			argumentHint: parsed?.getStringValue('argument-hint'),
			body: parsed?.body,
		}, {
			skillName: 'review-prompt',
			unsupportedHeaderKeys: ['tools', 'mode'],
			errors: [],
			headerKeys: ['name', 'description', 'disable-model-invocation', 'argument-hint'],
			name: 'review-prompt',
			description: 'Review the active change',
			disableModelInvocation: true,
			argumentHint: '[diff]',
			body: '## Steps\n\n- Review the diff',
		});
	});

	test('serializes migrated skill descriptions as valid YAML strings', () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review Prompt',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const cases = [
			{
				content: 'description: "Review: changes #42"',
				expectedLine: 'description: "Review: changes #42"',
				expectedDescription: 'Review: changes #42',
			},
			{
				content: 'description: \'Review the author\'\'s changes\'',
				expectedLine: 'description: \'Review the author\'\'s changes\'',
				expectedDescription: 'Review the author\'s changes',
			},
			{
				content: 'description: Review the author\'s changes',
				expectedLine: 'description: Review the author\'s changes',
				expectedDescription: 'Review the author\'s changes',
			},
			{
				content: ['description: |-', '  Review the first change.', '  Review the second change.'].join('\n'),
				expectedLine: 'description: "Review the first change.\\nReview the second change."',
				expectedDescription: 'Review the first change.\nReview the second change.',
			},
			{
				content: 'description: "Review\\x7Fchanges"',
				expectedLine: 'description: "Review\\u007fchanges"',
				expectedDescription: 'Review\u007Fchanges',
			},
		];

		const actual = cases.map(testCase => {
			const content = ['---', 'name: Review Prompt', testCase.content, '---', 'Review body'].join('\n');
			const migrated = migratePromptFileToSkill(promptFile, content);
			const errors: YamlParseError[] = [];
			const parsed = parseFrontMatter(migrated.content, errors);
			return {
				descriptionLine: migrated.content.split('\n').find(line => line.startsWith('description:')),
				description: parsed?.getStringValue('description'),
				errors,
			};
		});

		assert.deepStrictEqual(actual, cases.map(testCase => ({
			descriptionLine: testCase.expectedLine,
			description: testCase.expectedDescription,
			errors: [],
		})));
	});

	test('quotes YAML-sensitive description metadata without source formatting', () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review Prompt',
			description: 'Review: changes #42',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const migrated = migratePromptFileToSkill(promptFile, 'Review body');
		const errors: YamlParseError[] = [];
		const parsed = parseFrontMatter(migrated.content, errors);

		assert.deepStrictEqual({
			descriptionLine: migrated.content.split('\n').find(line => line.startsWith('description:')),
			description: parsed?.getStringValue('description'),
			errors,
		}, {
			descriptionLine: 'description: "Review: changes #42"',
			description: 'Review: changes #42',
			errors: [],
		});
	});

	test('normalizes HTML-like prompt names with the skill name allowlist', () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: '<script>alert(1)</script>',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};

		const migrated = migratePromptFileToSkill(promptFile, 'Review body');

		assert.strictEqual(migrated.skillName, 'script-alert-1-script');
	});

	test('preserves argument-hint formatting from source prompt', () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review Prompt',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const content = [
			'---',
			'name: Review Prompt',
			'description: Review the active change',
			'argument-hint: diff',
			'---',
			'Review body',
		].join('\n');

		const migrated = migratePromptFileToSkill(promptFile, content);
		assert.ok(migrated.content.includes('argument-hint: diff'));
	});

	test('migrates mixed customizations and continues after per-file failures', async () => {
		const customizations: IPromptPath[] = [
			{
				uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
				name: 'Review Prompt',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			},
			{
				uri: URI.file('/home/test/.vscode/prompts/planner.agent.md'),
				name: 'Planner',
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/home/test/.vscode/prompts/style.instructions.md'),
				name: 'Style',
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/home/test/.vscode/prompts/failing.prompt.md'),
				name: 'Failing Prompt',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
				source: PromptFileSource.UserData,
			},
		];
		const workspaceSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const userSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/skills'), label: '~/.copilot/skills', source: PromptsStorage.user };
		const userAgentRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/agents'), label: '~/.copilot/agents', source: PromptsStorage.user };
		const userInstructionsRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot/instructions', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, workspaceSkillRoot], [PromptsStorage.user, userSkillRoot]])],
			[PromptsType.agent, new Map([[PromptsStorage.user, userAgentRoot]])],
			[PromptsType.instructions, new Map([[PromptsStorage.user, userInstructionsRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(customizations[0].uri, VSBuffer.fromString(['---', 'name: "Review Prompt"', 'mode: code', '---', 'Review body'].join('\n')));
		await fileService.writeFile(customizations[1].uri, VSBuffer.fromString('---\ndescription: Plan work\n---\nPlan.'));
		await fileService.writeFile(customizations[2].uri, VSBuffer.fromString('---\ndescription: Use tabs\n---\nUse tabs.'));
		await fileService.writeFile(URI.joinPath(userAgentRoot.uri, 'planner.agent.md'), VSBuffer.fromString('existing'));

		const migrationErrors: Error[] = [];
		const failureReasons: FileCustomizationMigrationFailureReason[] = [];
		const result = await migrateCustomizations(customizations, targetFolders, fileService, (error, reasons) => {
			migrationErrors.push(error);
			failureReasons.push(...reasons);
		});
		const migratedSkillUri = createSkillFileUri(workspaceSkillRoot.uri, 'review-prompt');
		const existingAgentUri = URI.joinPath(userAgentRoot.uri, 'planner.agent.md');
		const migratedInstructionsUri = URI.joinPath(userInstructionsRoot.uri, 'style.instructions.md');
		const migratedSkillContent = (await fileService.readFile(migratedSkillUri)).value.toString();

		assert.deepStrictEqual({
			result: {
				...result,
				migratedCustomizations: result.migratedCustomizations.map(customization => ({ uri: customization.uri.path, type: customization.type })),
				migratedSources: result.migratedSources.map(source => ({ uri: source.uri.path, storage: source.storage })),
			},
			migratedSkillHasManualInvocation: migratedSkillContent.includes('disable-model-invocation: true'),
			existingAgentContent: (await fileService.readFile(existingAgentUri)).value.toString(),
			suffixedAgentExists: await fileService.exists(URI.joinPath(userAgentRoot.uri, 'planner-2.agent.md')),
			migratedInstructionsContent: (await fileService.readFile(migratedInstructionsUri)).value.toString(),
			originalsExist: await Promise.all(customizations.slice(0, 3).map(customization => fileService.exists(customization.uri))),
			migrationErrorCount: migrationErrors.length,
			failureReasons,
		}, {
			result: {
				migratedCount: 2,
				failedCustomizationFileNames: ['planner.agent.md', 'failing.prompt.md'],
				unsupportedHeaderKeys: ['mode'],
				migratedCustomizations: [
					{ uri: migratedSkillUri.path, type: PromptsType.skill },
					{ uri: migratedInstructionsUri.path, type: PromptsType.instructions },
				],
				migratedSources: [customizations[0], customizations[2]].map(customization => ({ uri: customization.uri.path, storage: customization.storage })),
			},
			migratedSkillHasManualInvocation: true,
			existingAgentContent: 'existing',
			suffixedAgentExists: false,
			migratedInstructionsContent: '---\ndescription: Use tabs\n---\nUse tabs.',
			originalsExist: [false, true, false],
			migrationErrorCount: 2,
			failureReasons: [
				FileCustomizationMigrationFailureReason.TargetAlreadyExists,
				FileCustomizationMigrationFailureReason.SourceReadFailed,
			],
		});
	});

	test('fails prompt migration when the target skill name already exists', async () => {
		const prompt: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/existing-target-test.prompt.md'),
			name: 'Existing Target Test',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const targetRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, targetRoot]])],
		]);
		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(prompt.uri, VSBuffer.fromString('---\ndescription: Migrated content\n---\nMigrate me.'));
		const existingTargetUri = createSkillFileUri(targetRoot.uri, 'existing-target-test');
		await fileService.writeFile(existingTargetUri, VSBuffer.fromString('Existing content'));

		const migrationErrors: Error[] = [];
		const failureReasons: FileCustomizationMigrationFailureReason[] = [];
		const result = await migrateCustomizations([prompt], targetFolders, fileService, (error, reasons) => {
			migrationErrors.push(error);
			failureReasons.push(...reasons);
		});

		assert.deepStrictEqual({
			result,
			sourceExists: await fileService.exists(prompt.uri),
			existingTargetContent: (await fileService.readFile(existingTargetUri)).value.toString(),
			suffixedTargetExists: await fileService.exists(createSkillFileUri(targetRoot.uri, 'existing-target-test-2')),
			migrationErrorCount: migrationErrors.length,
			failureReasons,
		}, {
			result: {
				migratedCount: 0,
				failedCustomizationFileNames: ['existing-target-test.prompt.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
				migratedSources: [],
			},
			sourceExists: true,
			existingTargetContent: 'Existing content',
			suffixedTargetExists: false,
			migrationErrorCount: 1,
			failureReasons: [FileCustomizationMigrationFailureReason.TargetAlreadyExists],
		});
	});

	test('fails complete skill migration without overwriting an existing directory', async () => {
		const skill: IPromptPath = {
			uri: URI.file('/workspace/custom-skills/release/SKILL.md'),
			name: 'Release',
			storage: PromptsStorage.local,
			type: PromptsType.skill,
			source: PromptFileSource.ConfigWorkspace,
		};
		const targetRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, targetRoot]])],
		]);
		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(skill.uri, VSBuffer.fromString('---\nname: release\n---\nRelease safely.'));
		await fileService.writeFile(URI.joinPath(dirname(skill.uri), 'references', 'release.md'), VSBuffer.fromString('Release reference'));
		await fileService.writeFile(URI.joinPath(dirname(skill.uri), 'scripts', 'release.sh'), VSBuffer.fromString('#!/bin/sh'));
		await fileService.writeFile(URI.joinPath(dirname(skill.uri), 'assets', 'release.svg'), VSBuffer.fromString('<svg></svg>'));
		const existingSkillFolder = URI.joinPath(targetRoot.uri, 'release');
		await fileService.writeFile(URI.joinPath(existingSkillFolder, 'README.md'), VSBuffer.fromString('Existing directory'));

		const migrationErrors: Error[] = [];
		const failureReasons: FileCustomizationMigrationFailureReason[] = [];
		const result = await migrateCustomizations([skill], targetFolders, fileService, (error, reasons) => {
			migrationErrors.push(error);
			failureReasons.push(...reasons);
		});

		assert.deepStrictEqual({
			result,
			sourceFolderExists: await fileService.exists(dirname(skill.uri)),
			existingDirectoryContent: (await fileService.readFile(URI.joinPath(existingSkillFolder, 'README.md'))).value.toString(),
			suffixedTargetExists: await fileService.exists(URI.joinPath(targetRoot.uri, 'release-2')),
			migrationErrorCount: migrationErrors.length,
			failureReasons,
		}, {
			result: {
				migratedCount: 0,
				failedCustomizationFileNames: ['SKILL.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
				migratedSources: [],
			},
			sourceFolderExists: true,
			existingDirectoryContent: 'Existing directory',
			suffixedTargetExists: false,
			migrationErrorCount: 1,
			failureReasons: [FileCustomizationMigrationFailureReason.TargetAlreadyExists],
		});
	});

	test('rolls back the complete skill directory when deleting its source fails', async () => {
		const skill: IPromptPath = {
			uri: URI.file('/workspace/custom-skills/release/SKILL.md'),
			name: 'Release',
			storage: PromptsStorage.local,
			type: PromptsType.skill,
			source: PromptFileSource.ConfigWorkspace,
		};
		const targetRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, targetRoot]])],
		]);
		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new DeleteFailingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		const sourceFolder = dirname(skill.uri);
		await fileService.writeFile(skill.uri, VSBuffer.fromString('---\nname: release\n---\nRelease safely.'));
		await fileService.writeFile(URI.joinPath(sourceFolder, 'references', 'release.md'), VSBuffer.fromString('Release reference'));
		fileSystemProvider.deleteFailureResource = sourceFolder;

		const migrationErrors: Error[] = [];
		const failureReasons: FileCustomizationMigrationFailureReason[] = [];
		const result = await migrateCustomizations([skill], targetFolders, fileService, (error, reasons) => {
			migrationErrors.push(error);
			failureReasons.push(...reasons);
		});

		assert.deepStrictEqual({
			result,
			sourceContents: await Promise.all([
				skill.uri,
				URI.joinPath(sourceFolder, 'references', 'release.md'),
			].map(async uri => (await fileService.readFile(uri)).value.toString())),
			targetEntries: await fileSystemProvider.readdir(targetRoot.uri),
			migrationErrorCount: migrationErrors.length,
			failureReasons,
		}, {
			result: {
				migratedCount: 0,
				failedCustomizationFileNames: ['SKILL.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
				migratedSources: [],
			},
			sourceContents: [
				'---\nname: release\n---\nRelease safely.',
				'Release reference',
			],
			targetEntries: [],
			migrationErrorCount: 1,
			failureReasons: [FileCustomizationMigrationFailureReason.SourceDeleteFailed],
		});
	});

	test('migrates duplicate source identities before deleting the source', async () => {
		const sourceUri = URI.file('/home/test/shared.prompt.md');
		const customizations: IPromptPath[] = [
			{ uri: sourceUri, name: 'Shared', storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.ConfigWorkspace },
			{ uri: sourceUri, name: 'Shared', storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.ConfigPersonal },
		];
		const workspaceSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const userSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/skills'), label: '~/.copilot/skills', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, workspaceSkillRoot], [PromptsStorage.user, userSkillRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('---\nname: Shared\n---\nShared body'));

		const result = await migrateCustomizations(customizations, targetFolders, fileService);
		const workspaceSkillUri = createSkillFileUri(workspaceSkillRoot.uri, 'shared');
		const userSkillUri = createSkillFileUri(userSkillRoot.uri, 'shared');

		assert.deepStrictEqual({
			result: {
				...result,
				migratedCustomizations: result.migratedCustomizations.map(customization => ({ uri: customization.uri.path, type: customization.type })),
				migratedSources: result.migratedSources.map(source => ({ uri: source.uri.path, storage: source.storage })),
			},
			sourceExists: await fileService.exists(sourceUri),
			workspaceTargetExists: await fileService.exists(workspaceSkillUri),
			userTargetExists: await fileService.exists(userSkillUri),
		}, {
			result: {
				migratedCount: 2,
				failedCustomizationFileNames: [],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [
					{ uri: workspaceSkillUri.path, type: PromptsType.skill },
					{ uri: userSkillUri.path, type: PromptsType.skill },
				],
				migratedSources: [
					{ uri: sourceUri.path, storage: PromptsStorage.local },
					{ uri: sourceUri.path, storage: PromptsStorage.user },
				],
			},
			sourceExists: false,
			workspaceTargetExists: true,
			userTargetExists: true,
		});
	});

	test('retries a prompt migration after rolling back a conflicting target', async () => {
		const sourceUri = URI.file('/home/test/shared.prompt.md');
		const customizations: IPromptPath[] = [
			{ uri: sourceUri, name: 'Shared', storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.ConfigWorkspace },
			{ uri: sourceUri, name: 'Shared', storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.ConfigPersonal },
		];
		const workspaceSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const userSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/skills'), label: '~/.copilot/skills', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, workspaceSkillRoot], [PromptsStorage.user, userSkillRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('---\nname: Shared\n---\nShared body'));
		const workspaceSkillUri = createSkillFileUri(workspaceSkillRoot.uri, 'shared');
		const userSkillUri = createSkillFileUri(userSkillRoot.uri, 'shared');
		await fileService.writeFile(userSkillUri, VSBuffer.fromString('Existing content'));

		const failedResult = await migrateCustomizations(customizations, targetFolders, fileService);
		const afterFailure = {
			sourceExists: await fileService.exists(sourceUri),
			workspaceSkillFolderExists: await fileService.exists(dirname(workspaceSkillUri)),
			userTargetContent: (await fileService.readFile(userSkillUri)).value.toString(),
		};

		await fileService.del(dirname(userSkillUri), { recursive: true });
		const retriedResult = await migrateCustomizations(customizations, targetFolders, fileService);

		assert.deepStrictEqual({
			failedResult,
			afterFailure,
			retriedResult: {
				...retriedResult,
				migratedCustomizations: retriedResult.migratedCustomizations.map(customization => ({ uri: customization.uri.path, type: customization.type })),
				migratedSources: retriedResult.migratedSources.map(source => ({ uri: source.uri.path, storage: source.storage })),
			},
			afterRetry: {
				sourceExists: await fileService.exists(sourceUri),
				workspaceTargetExists: await fileService.exists(workspaceSkillUri),
				userTargetExists: await fileService.exists(userSkillUri),
			},
		}, {
			failedResult: {
				migratedCount: 0,
				failedCustomizationFileNames: ['shared.prompt.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
				migratedSources: [],
			},
			afterFailure: {
				sourceExists: true,
				workspaceSkillFolderExists: false,
				userTargetContent: 'Existing content',
			},
			retriedResult: {
				migratedCount: 2,
				failedCustomizationFileNames: [],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [
					{ uri: workspaceSkillUri.path, type: PromptsType.skill },
					{ uri: userSkillUri.path, type: PromptsType.skill },
				],
				migratedSources: [
					{ uri: sourceUri.path, storage: PromptsStorage.local },
					{ uri: sourceUri.path, storage: PromptsStorage.user },
				],
			},
			afterRetry: {
				sourceExists: false,
				workspaceTargetExists: true,
				userTargetExists: true,
			},
		});
	});

	test('preserves a name conflict target when rollback also fails', async () => {
		const sourceUri = URI.file('/home/test/shared.prompt.md');
		const customizations: IPromptPath[] = [
			{ uri: sourceUri, name: 'Shared', storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.ConfigWorkspace },
			{ uri: sourceUri, name: 'Shared', storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.ConfigPersonal },
		];
		const workspaceSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const userSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/skills'), label: '~/.copilot/skills', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, workspaceSkillRoot], [PromptsStorage.user, userSkillRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new DeleteFailingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('---\nname: Shared\n---\nShared body'));
		const workspaceSkillUri = createSkillFileUri(workspaceSkillRoot.uri, 'shared');
		const userSkillUri = createSkillFileUri(userSkillRoot.uri, 'shared');
		await fileService.writeFile(userSkillUri, VSBuffer.fromString('Existing content'));
		fileSystemProvider.deleteFailureResource = dirname(workspaceSkillUri);

		const migrationErrors: Error[] = [];
		const failureReasons: FileCustomizationMigrationFailureReason[] = [];
		const conflictTargets: URI[] = [];
		const result = await migrateCustomizations(customizations, targetFolders, fileService, (error, reasons) => {
			migrationErrors.push(error);
			failureReasons.push(...reasons);
			const conflictTarget = getCustomizationMigrationConflictTarget(error);
			if (conflictTarget) {
				conflictTargets.push(conflictTarget);
			}
		});

		assert.deepStrictEqual({
			result,
			sourceExists: await fileService.exists(sourceUri),
			workspaceTargetExists: await fileService.exists(workspaceSkillUri),
			userTargetContent: (await fileService.readFile(userSkillUri)).value.toString(),
			migrationErrorTypes: migrationErrors.map(error => error.constructor.name),
			failureReasons,
			conflictTargets: conflictTargets.map(uri => uri.path),
		}, {
			result: {
				migratedCount: 0,
				failedCustomizationFileNames: ['shared.prompt.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
				migratedSources: [],
			},
			sourceExists: true,
			workspaceTargetExists: true,
			userTargetContent: 'Existing content',
			migrationErrorTypes: ['AggregateError'],
			failureReasons: [
				FileCustomizationMigrationFailureReason.TargetAlreadyExists,
				FileCustomizationMigrationFailureReason.RollbackFailed,
			],
			conflictTargets: [dirname(userSkillUri).path],
		});
	});

	test('rolls back the target when deleting the source fails', async () => {
		const sourceUri = URI.file('/user-data/style.instructions.md');
		const customization: IPromptPath = {
			uri: sourceUri,
			name: 'Style',
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};
		const instructionsRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot/instructions', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.instructions, new Map([[PromptsStorage.user, instructionsRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new DeleteFailingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('Use tabs.'));
		fileSystemProvider.deleteFailureResource = sourceUri;

		const migrationErrors: Error[] = [];
		const failedResult = await migrateCustomizations([customization], targetFolders, fileService, error => migrationErrors.push(error));
		const targetUri = URI.joinPath(instructionsRoot.uri, 'style.instructions.md');
		const afterFailure = {
			sourceExists: await fileService.exists(sourceUri),
			targetExists: await fileService.exists(targetUri),
			migrationErrorCount: migrationErrors.length,
		};

		fileSystemProvider.deleteFailureResource = undefined;
		const retriedResult = await migrateCustomizations([customization], targetFolders, fileService);

		assert.deepStrictEqual({
			failedResult: {
				...failedResult,
				migratedSources: failedResult.migratedSources.map(source => ({ uri: source.uri.path, storage: source.storage })),
			},
			afterFailure,
			retriedResult: {
				...retriedResult,
				migratedCustomizations: retriedResult.migratedCustomizations.map(item => item.uri.path),
				migratedSources: retriedResult.migratedSources.map(source => ({ uri: source.uri.path, storage: source.storage })),
			},
			afterRetry: {
				sourceExists: await fileService.exists(sourceUri),
				targetExists: await fileService.exists(targetUri),
				suffixedTargetExists: await fileService.exists(URI.joinPath(instructionsRoot.uri, 'style-2.instructions.md')),
			},
		}, {
			failedResult: {
				migratedCount: 0,
				failedCustomizationFileNames: ['style.instructions.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
				migratedSources: [],
			},
			afterFailure: {
				sourceExists: true,
				targetExists: false,
				migrationErrorCount: 1,
			},
			retriedResult: {
				migratedCount: 1,
				failedCustomizationFileNames: [],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [targetUri.path],
				migratedSources: [{ uri: sourceUri.path, storage: PromptsStorage.user }],
			},
			afterRetry: {
				sourceExists: false,
				targetExists: true,
				suffixedTargetExists: false,
			},
		});
	});

	test('does not overwrite or roll back a concurrently created target', async () => {
		const sourceUri = URI.file('/user-data/style.instructions.md');
		const customization: IPromptPath = {
			uri: sourceUri,
			name: 'Style',
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};
		const instructionsRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot/instructions', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.instructions, new Map([[PromptsStorage.user, instructionsRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new ConcurrentTargetFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('Use tabs.'));
		const targetUri = URI.joinPath(instructionsRoot.uri, 'style.instructions.md');
		fileSystemProvider.conflictResource = targetUri;

		const migrationErrors: Error[] = [];
		const failureReasons: FileCustomizationMigrationFailureReason[] = [];
		const conflictTargets: URI[] = [];
		const result = await migrateCustomizations([customization], targetFolders, fileService, (error, reasons) => {
			migrationErrors.push(error);
			failureReasons.push(...reasons);
			const conflictTarget = getCustomizationMigrationConflictTarget(error);
			if (conflictTarget) {
				conflictTargets.push(conflictTarget);
			}
		});
		const targetEntries = await fileSystemProvider.readdir(instructionsRoot.uri);

		assert.deepStrictEqual({
			result,
			sourceExists: await fileService.exists(sourceUri),
			targetContent: (await fileService.readFile(targetUri)).value.toString(),
			targetEntries,
			migrationErrorCount: migrationErrors.length,
			failureReasons,
			conflictTargets: conflictTargets.map(uri => uri.path),
		}, {
			result: {
				migratedCount: 0,
				failedCustomizationFileNames: ['style.instructions.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
				migratedSources: [],
			},
			sourceExists: true,
			targetContent: 'foreign content',
			targetEntries: [['style.instructions.md', FileType.File]],
			migrationErrorCount: 1,
			failureReasons: [FileCustomizationMigrationFailureReason.TargetAlreadyExists],
			conflictTargets: [targetUri.path],
		});
	});

	test('can keep original customization files after migration', async () => {
		const customization: IPromptPath = {
			uri: URI.file('/home/test/.vscode/prompts/style.instructions.md'),
			name: 'Style',
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};
		const instructionsRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot/instructions', source: PromptsStorage.user };

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(customization.uri, VSBuffer.fromString('Use tabs.'));

		const result = await migrateCustomizations(
			[customization],
			new Map([[PromptsType.instructions, new Map([[PromptsStorage.user, instructionsRoot]])]]),
			fileService,
			undefined,
			{ deleteOriginalFiles: false },
		);
		const migratedUri = URI.joinPath(instructionsRoot.uri, 'style.instructions.md');

		assert.deepStrictEqual({
			migratedCount: result.migratedCount,
			migratedUris: result.migratedCustomizations.map(item => item.uri.path),
			originalExists: await fileService.exists(customization.uri),
			migratedExists: await fileService.exists(migratedUri),
		}, {
			migratedCount: 1,
			migratedUris: [migratedUri.path],
			originalExists: true,
			migratedExists: true,
		});
	});

	test('keeps a workspace prompt in its own workspace folder of a multi-root workspace', async () => {
		const customization: MigratableConfiguration = {
			uri: URI.file('/workspace-b/.github/prompts/review.prompt.md'),
			name: 'Review',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
			workspaceGroupId: 'workspace-b',
		};
		const availableFolders: ICustomizationSourceFolder[] = [
			{ uri: URI.file('/workspace-a/.github/skills'), label: '.github/skills', source: PromptsStorage.local, workspaceGroupId: 'workspace-a' },
			{ uri: URI.file('/workspace-b/.github/skills'), label: '.github/skills', source: PromptsStorage.local, workspaceGroupId: 'workspace-b' },
		];

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(customization.uri, VSBuffer.fromString('Review the change.'));

		const result = await migrateCustomizations(
			[customization],
			new Map([[PromptsType.skill, new Map([[PromptsStorage.local, availableFolders[0]]])]]),
			fileService,
			undefined,
			{
				resolveTargetFolder: migrated => resolveWorkspaceMigrationTargetFolder(migrated.workspaceGroupId, availableFolders[0], availableFolders),
			},
		);

		assert.deepStrictEqual({
			migratedCount: result.migratedCount,
			migratedUris: result.migratedCustomizations.map(item => item.uri.path),
			sourceExists: await fileService.exists(customization.uri),
		}, {
			migratedCount: 1,
			migratedUris: [createSkillFileUri(availableFolders[1].uri, 'review').path],
			sourceExists: false,
		});
	});

	test('resolves the migration target folder in the originating workspace group', () => {
		const workspaceFolders: ICustomizationSourceFolder[] = [
			{ uri: URI.file('/workspace-a/.github/skills'), label: '.github/skills', source: PromptsStorage.local, workspaceGroupId: 'workspace-a' },
			{ uri: URI.file('/workspace-b/.claude/skills'), label: '.claude/skills', source: PromptsStorage.local, workspaceGroupId: 'workspace-b' },
			{ uri: URI.file('/workspace-b/.github/skills'), label: '.github/skills', source: PromptsStorage.local, workspaceGroupId: 'workspace-b' },
		];
		const resolve = (workspaceGroupId: string | undefined, target: ICustomizationSourceFolder) =>
			resolveWorkspaceMigrationTargetFolder(workspaceGroupId, target, workspaceFolders).uri.path;

		assert.deepStrictEqual({
			otherWorkspaceFolder: resolve('workspace-b', workspaceFolders[0]),
			preservedDestination: resolve('workspace-b', { uri: URI.file('/workspace-a/.claude/skills'), label: '.claude/skills', source: PromptsStorage.local, workspaceGroupId: 'workspace-a' }),
			sameWorkspaceFolder: resolve('workspace-a', workspaceFolders[0]),
			unknownWorkspaceFolder: resolve(undefined, workspaceFolders[0]),
		}, {
			otherWorkspaceFolder: '/workspace-b/.github/skills',
			preservedDestination: '/workspace-b/.claude/skills',
			sameWorkspaceFolder: '/workspace-a/.github/skills',
			unknownWorkspaceFolder: '/workspace-a/.github/skills',
		});
	});
});
