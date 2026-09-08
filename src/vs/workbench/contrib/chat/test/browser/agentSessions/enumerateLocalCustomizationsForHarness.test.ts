/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { enumerateLocalCustomizationsForHarness } from '../../../browser/agentSessions/agentHost/agentHostLocalCustomizations.js';
import { AICustomizationSources, BUILTIN_STORAGE } from '../../../common/aiCustomizationWorkspaceService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type IPromptPath, type IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { SessionType } from '../../../common/chatSessionsService.js';

function makePromptPath(uri: URI, type: PromptsType, storage: PromptsStorage): IPromptPath {
	return { uri, type, storage } as IPromptPath;
}

function makePromptsService(
	files: ReadonlyMap<string, readonly IPromptPath[]>,
	disabledPromptFiles: ReadonlyMap<PromptsType, ResourceSet> = new Map(),
): IPromptsService {
	return {
		async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage): Promise<readonly IPromptPath[]> {
			return files.get(`${type}/${storage}`) ?? [];
		},
		getDisabledPromptFiles(type: PromptsType): ResourceSet {
			return disabledPromptFiles.get(type) ?? new ResourceSet();
		},
	} as unknown as IPromptsService;
}

class FakeSyncProvider implements ICustomizationSyncProvider {
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;
	constructor(private readonly _disabled: ReadonlySet<string> = new Set()) { }
	isDisabled(uri: URI): boolean { return this._disabled.has(uri.toString()); }
	setDisabled(): void { /* no-op */ }
}

suite('enumerateLocalCustomizationsForHarness', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('emits built-in skills with BUILTIN_STORAGE even when no other storage source has files', async () => {
		const builtin = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));

		const result = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, undefined);

		assert.deepStrictEqual(result, [{
			uri: builtin,
			type: PromptsType.skill,
			source: AICustomizationSources.builtin,
			pluginUri: undefined,
			extensionId: undefined,
			disabled: false,
		}]);
	});

	test('combines extension and built-in storage entries without workspace-local files', async () => {
		const extensionAgent = URI.file('/extension/agents/foo.agent.md');
		const builtinSkill = URI.file('/builtin/merge/SKILL.md');
		const workspaceAgent = URI.file('/workspace/.github/agents/local.agent.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.agent}/${PromptsStorage.extension}`, [makePromptPath(extensionAgent, PromptsType.agent, PromptsStorage.extension)]],
			[`${PromptsType.agent}/${PromptsStorage.local}`, [makePromptPath(workspaceAgent, PromptsType.agent, PromptsStorage.local)]],
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtinSkill, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));

		const result = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, undefined);

		assert.deepStrictEqual(result.map((e: { uri: URI; type: PromptsType; source: unknown; disabled: boolean }) => ({ uri: e.uri.toString(), type: e.type, source: e.source, disabled: e.disabled })), [
			{ uri: extensionAgent.toString(), type: PromptsType.agent, source: AICustomizationSources.extension, disabled: false },
			{ uri: builtinSkill.toString(), type: PromptsType.skill, source: AICustomizationSources.builtin, disabled: false },
		]);
	});

	test('marks built-in skills disabled when the sync provider says so', async () => {
		const builtin = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));
		const syncProvider = new FakeSyncProvider(new Set([builtin.toString()]));

		const result = await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, SessionType.CopilotCLI, CancellationToken.None, undefined);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].disabled, true);
	});

	test('honors user enablement only for built-in skills', async () => {
		const builtinSkill = URI.file('/builtin/create-pr/SKILL.md');
		const extensionAgent = URI.file('/extension/agents/reviewer.agent.md');
		const promptsService = makePromptsService(
			new Map([
				[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtinSkill, PromptsType.skill, PromptsStorage.builtIn)]],
				[`${PromptsType.agent}/${PromptsStorage.extension}`, [makePromptPath(extensionAgent, PromptsType.agent, PromptsStorage.extension)]],
			]),
			new Map([
				[PromptsType.skill, new ResourceSet([builtinSkill])],
				[PromptsType.agent, new ResourceSet([extensionAgent])],
			]),
		);

		const result = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, undefined);

		assert.deepStrictEqual(result.map(item => ({ uri: item.uri.toString(), disabled: item.disabled })), [
			{ uri: extensionAgent.toString(), disabled: false },
			{ uri: builtinSkill.toString(), disabled: true },
		]);
	});

	test('includes all user prompt types only when user storage is enabled', async () => {
		const userAgent = URI.file('/home/user/.copilot/agents/user.agent.md');
		const userSkill = URI.file('/home/user/.claude/skills/user-skill/SKILL.md');
		const userInstructions = URI.file('/home/user/.claude/rules/user.instructions.md');
		const userPrompt = URI.file('/profile/prompts/user.prompt.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.agent}/${PromptsStorage.user}`, [makePromptPath(userAgent, PromptsType.agent, PromptsStorage.user)]],
			[`${PromptsType.skill}/${PromptsStorage.user}`, [makePromptPath(userSkill, PromptsType.skill, PromptsStorage.user)]],
			[`${PromptsType.instructions}/${PromptsStorage.user}`, [makePromptPath(userInstructions, PromptsType.instructions, PromptsStorage.user)]],
			[`${PromptsType.prompt}/${PromptsStorage.user}`, [makePromptPath(userPrompt, PromptsType.prompt, PromptsStorage.user)]],
		]));

		const localResult = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, undefined);
		const remoteResult = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, { includeUserStorage: true });

		assert.deepStrictEqual({
			local: localResult,
			remote: remoteResult.map(item => ({ uri: item.uri.toString(), type: item.type, source: item.source })),
		}, {
			local: [],
			remote: [
				{ uri: userAgent.toString(), type: PromptsType.agent, source: AICustomizationSources.user },
				{ uri: userSkill.toString(), type: PromptsType.skill, source: AICustomizationSources.user },
				{ uri: userInstructions.toString(), type: PromptsType.instructions, source: AICustomizationSources.user },
				{ uri: userPrompt.toString(), type: PromptsType.prompt, source: AICustomizationSources.user },
			],
		});
	});

	test('keeps per-file user opt-out when user storage is enabled', async () => {
		const enabled = URI.file('/home/user/.copilot/instructions/enabled.instructions.md');
		const disabled = URI.file('/home/user/.claude/rules/disabled.instructions.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.instructions}/${PromptsStorage.user}`, [
				makePromptPath(enabled, PromptsType.instructions, PromptsStorage.user),
				makePromptPath(disabled, PromptsType.instructions, PromptsStorage.user),
			]],
		]));

		const result = await enumerateLocalCustomizationsForHarness(
			promptsService,
			new FakeSyncProvider(new Set([disabled.toString()])),
			SessionType.CopilotCLI,
			CancellationToken.None,
			{ includeUserStorage: true },
		);

		assert.deepStrictEqual(result.map(item => ({ uri: item.uri.toString(), disabled: item.disabled })), [
			{ uri: enabled.toString(), disabled: false },
			{ uri: disabled.toString(), disabled: true },
		]);
	});

	test('returns empty when the prompts service exposes no built-in skills (regular workbench)', async () => {
		// The regular workbench's PromptsServiceImpl treats `builtin` as a
		// first-class storage that simply yields no files (rather than
		// throwing). Model that here to confirm enumeration is a no-op outside
		// Sessions.
		const promptsService = makePromptsService(new Map());
		const result = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, undefined);
		assert.deepStrictEqual(result, []);
	});
});
