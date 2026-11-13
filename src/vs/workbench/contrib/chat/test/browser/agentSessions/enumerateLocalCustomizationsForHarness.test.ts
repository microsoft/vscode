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
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type IPromptPath, type IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { SessionType } from '../../../common/chatSessionsService.js';

function makePromptPath(uri: URI, type: PromptsType, storage: PromptsStorage, sessionTypes?: readonly string[], source?: PromptFileSource): IPromptPath {
	return { uri, type, storage, sessionTypes, source } as IPromptPath;
}

function makePromptsService(
	files: ReadonlyMap<string, readonly IPromptPath[]>,
	disabledPromptFiles: ReadonlyMap<PromptsType, ResourceSet> = new Map(),
): IPromptsService {
	return {
		async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, _token: CancellationToken, root?: URI): Promise<readonly IPromptPath[]> {
			// Like the real service, `root` only scopes workspace (local) storage.
			const key = root && storage === PromptsStorage.local ? `${type}/${storage}@${root.toString()}` : `${type}/${storage}`;
			return files.get(key) ?? [];
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

	test('matches logical harness types for local and remote agent-host resource schemes', async () => {
		const copilotSkill = URI.file('/extension/skills/copilot/SKILL.md');
		const claudeSkill = URI.file('/extension/skills/claude/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${PromptsStorage.extension}`, [
				makePromptPath(copilotSkill, PromptsType.skill, PromptsStorage.extension, [SessionType.CopilotCLI]),
				makePromptPath(claudeSkill, PromptsType.skill, PromptsStorage.extension, ['claude']),
			]],
		]));

		const sessionTypes = [
			SessionType.CopilotCLI,
			SessionType.AgentHostCopilot,
			'remote-devbox-copilotcli',
			'agent-host-claude',
			'remote-devbox-claude',
		];
		const results = await Promise.all(sessionTypes.map(async sessionType =>
			(await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), sessionType, CancellationToken.None, undefined))
				.map(item => item.uri.toString())
		));

		assert.deepStrictEqual(results, [
			[copilotSkill.toString()],
			[copilotSkill.toString()],
			[copilotSkill.toString()],
			[claudeSkill.toString()],
			[claudeSkill.toString()],
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

	for (const sessionType of [SessionType.AgentHostCopilot, 'agent-host-claude', 'agent-host-codex', 'remote-devbox-copilotcli']) {
		test(`adapts only non-default configured locations for ${sessionType}`, async () => {
			const files = new Map<string, readonly IPromptPath[]>();
			const expected: { uri: URI; type: PromptsType; source: PromptsStorage }[] = [];
			for (const type of [PromptsType.agent, PromptsType.skill, PromptsType.instructions, PromptsType.prompt, PromptsType.hook]) {
				for (const storage of [PromptsStorage.local, PromptsStorage.user] as const) {
					const configured: IPromptPath = {
						uri: URI.file(`/${storage}/configured/${type}.md`), type, storage,
						source: storage === PromptsStorage.local ? PromptFileSource.ConfigWorkspace : PromptFileSource.ConfigPersonal,
					};
					files.set(`${type}/${storage}`, [
						configured,
						{ uri: URI.file(`/${storage}/default/${type}.md`), type, storage, source: PromptFileSource.GitHubWorkspace },
						{ uri: URI.file(`/${storage}/profile/${type}.md`), type, storage, source: PromptFileSource.UserData },
					]);
					if (type !== PromptsType.prompt && type !== PromptsType.hook) {
						expected.push({ uri: configured.uri, type, source: storage });
					}
				}
			}

			const result = await enumerateLocalCustomizationsForHarness(makePromptsService(files), new FakeSyncProvider(), sessionType, CancellationToken.None, undefined);

			assert.deepStrictEqual(result.map(({ uri, type, source }) => ({ uri, type, source })), expected);
		});
	}

	test('deduplicates configured files and preserves sync opt-outs and session filtering', async () => {
		const enabled = URI.file('/configured/enabled.agent.md');
		const disabled = URI.file('/configured/disabled.agent.md');
		const otherHarness = URI.file('/configured/other.agent.md');
		const configuredFiles: IPromptPath[] = [enabled, disabled, otherHarness].map((uri, index) => ({
			uri,
			type: PromptsType.agent,
			storage: PromptsStorage.local,
			sessionTypes: index === 2 ? ['claude'] : undefined,
			source: PromptFileSource.ConfigWorkspace,
		}));
		const promptsService = makePromptsService(new Map<string, readonly IPromptPath[]>([
			[`${PromptsType.agent}/${PromptsStorage.local}`, configuredFiles],
			[`${PromptsType.agent}/${PromptsStorage.user}`, configuredFiles.map(file => ({ ...file, storage: PromptsStorage.user }))],
		]));

		const results = await Promise.all([undefined, { includeUserStorage: true }].map(options =>
			enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(new Set([disabled.toString()])), SessionType.AgentHostCopilot, CancellationToken.None, options)
		));

		assert.deepStrictEqual(results.map(result => result.map(({ uri, disabled }) => ({ uri, disabled }))), [
			[{ uri: enabled, disabled: false }, { uri: disabled, disabled: true }],
			[{ uri: enabled, disabled: false }, { uri: disabled, disabled: true }],
		]);
	});

	test('omits built-in skills overridden by a workspace or user skill with the same name', async () => {
		const workspaceSkill = URI.file('/workspace/.github/skills/code-review/SKILL.md');
		const userSkill = URI.file('/home/user/.copilot/skills/merge/SKILL.md');
		const claudeOnlySkill = URI.file('/workspace/.claude/skills/create-pr/SKILL.md');
		const builtinCodeReview = URI.file('/builtin/code-review/SKILL.md');
		const builtinMerge = URI.file('/builtin/merge/SKILL.md');
		const builtinCreatePr = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${PromptsStorage.local}`, [
				makePromptPath(workspaceSkill, PromptsType.skill, PromptsStorage.local, undefined, PromptFileSource.GitHubWorkspace),
				makePromptPath(claudeOnlySkill, PromptsType.skill, PromptsStorage.local, ['claude'], PromptFileSource.ClaudeWorkspace),
			]],
			[`${PromptsType.skill}/${PromptsStorage.user}`, [makePromptPath(userSkill, PromptsType.skill, PromptsStorage.user, undefined, PromptFileSource.CopilotPersonal)]],
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [
				makePromptPath(builtinCodeReview, PromptsType.skill, PromptsStorage.builtIn),
				makePromptPath(builtinMerge, PromptsType.skill, PromptsStorage.builtIn),
				makePromptPath(builtinCreatePr, PromptsType.skill, PromptsStorage.builtIn),
			]],
		]));

		const results = await Promise.all([undefined, { includeUserStorage: true }].map(async options =>
			(await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, options))
				.map(item => item.uri.toString())
		));

		// A remote host (`includeUserStorage`) cannot discover the client's window workspace, so only the synced user skill overrides there.
		assert.deepStrictEqual(results, [
			[builtinCreatePr.toString()],
			[userSkill.toString(), builtinCodeReview.toString(), builtinCreatePr.toString()],
		]);
	});

	test('keeps built-in skills whose override sits in a folder the harness does not discover', async () => {
		const githubSkill = URI.file('/workspace/.github/skills/code-review/SKILL.md');
		const claudeSkill = URI.file('/workspace/.claude/skills/merge/SKILL.md');
		const builtinCodeReview = URI.file('/builtin/code-review/SKILL.md');
		const builtinMerge = URI.file('/builtin/merge/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${PromptsStorage.local}`, [
				makePromptPath(githubSkill, PromptsType.skill, PromptsStorage.local, undefined, PromptFileSource.GitHubWorkspace),
				makePromptPath(claudeSkill, PromptsType.skill, PromptsStorage.local, undefined, PromptFileSource.ClaudeWorkspace),
			]],
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [
				makePromptPath(builtinCodeReview, PromptsType.skill, PromptsStorage.builtIn),
				makePromptPath(builtinMerge, PromptsType.skill, PromptsStorage.builtIn),
			]],
		]));

		const results = await Promise.all([SessionType.AgentHostClaude, SessionType.AgentHostCodex, SessionType.CopilotCLI].map(async sessionType =>
			(await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), sessionType, CancellationToken.None, undefined))
				.map(item => item.uri.toString())
		));

		assert.deepStrictEqual(results, [
			[builtinCodeReview.toString()],
			[builtinMerge.toString()],
			[],
		]);
	});

	test('looks up workspace overrides in the session folders instead of the window workspace', async () => {
		const sessionFolder = URI.file('/repo-b');
		const windowSkill = URI.file('/repo-a/.github/skills/code-review/SKILL.md');
		const sessionSkill = URI.file('/repo-b/.github/skills/merge/SKILL.md');
		const builtinCodeReview = URI.file('/builtin/code-review/SKILL.md');
		const builtinMerge = URI.file('/builtin/merge/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${PromptsStorage.local}`, [makePromptPath(windowSkill, PromptsType.skill, PromptsStorage.local, undefined, PromptFileSource.GitHubWorkspace)]],
			[`${PromptsType.skill}/${PromptsStorage.local}@${sessionFolder.toString()}`, [makePromptPath(sessionSkill, PromptsType.skill, PromptsStorage.local, undefined, PromptFileSource.GitHubWorkspace)]],
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [
				makePromptPath(builtinCodeReview, PromptsType.skill, PromptsStorage.builtIn),
				makePromptPath(builtinMerge, PromptsType.skill, PromptsStorage.builtIn),
			]],
		]));

		const results = await Promise.all([undefined, [sessionFolder], []].map(async roots =>
			(await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, undefined, roots))
				.map(item => item.uri.toString())
		));

		// `undefined` roots stand for the window's workspace, an empty array for a session without a workspace.
		assert.deepStrictEqual(results, [
			[builtinMerge.toString()],
			[builtinCodeReview.toString()],
			[builtinCodeReview.toString(), builtinMerge.toString()],
		]);
	});

	test('counts only synced skills and skills in the session folders as overrides on a remote host', async () => {
		const sessionFolder = URI.file('/repo');
		const syncDisabledUserSkill = URI.file('/home/user/.copilot/skills/code-review/SKILL.md');
		const syncedUserSkill = URI.file('/home/user/.copilot/skills/create-pr/SKILL.md');
		const windowSkill = URI.file('/workspace/.github/skills/merge/SKILL.md');
		const sessionSkill = URI.file('/repo/.github/skills/merge/SKILL.md');
		const builtins = ['code-review', 'merge', 'create-pr'].map(name => URI.file(`/builtin/${name}/SKILL.md`));
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${PromptsStorage.local}`, [makePromptPath(windowSkill, PromptsType.skill, PromptsStorage.local, undefined, PromptFileSource.GitHubWorkspace)]],
			[`${PromptsType.skill}/${PromptsStorage.local}@${sessionFolder.toString()}`, [makePromptPath(sessionSkill, PromptsType.skill, PromptsStorage.local, undefined, PromptFileSource.GitHubWorkspace)]],
			[`${PromptsType.skill}/${PromptsStorage.user}`, [
				makePromptPath(syncDisabledUserSkill, PromptsType.skill, PromptsStorage.user, undefined, PromptFileSource.CopilotPersonal),
				makePromptPath(syncedUserSkill, PromptsType.skill, PromptsStorage.user, undefined, PromptFileSource.CopilotPersonal),
			]],
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, builtins.map(uri => makePromptPath(uri, PromptsType.skill, PromptsStorage.builtIn))],
		]));
		const syncProvider = new FakeSyncProvider(new Set([syncDisabledUserSkill.toString()]));

		const results = await Promise.all([undefined, [sessionFolder]].map(async roots =>
			(await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, 'remote-devbox-copilotcli', CancellationToken.None, { includeUserStorage: true }, roots))
				.filter(item => !item.disabled)
				.map(item => item.uri.toString())
		));

		// The remote host receives only the synced user skill and discovers none of the client's own files, but it does discover skills in the folders the session works in.
		assert.deepStrictEqual(results, [
			[syncedUserSkill.toString(), builtins[0].toString(), builtins[1].toString()],
			[syncedUserSkill.toString(), builtins[0].toString()],
		]);
	});

	test('skips the session-folder lookup when there are no built-in skills to override', async () => {
		const roots: string[] = [];
		const promptsService = makePromptsService(new Map());
		const listPromptFilesForStorage = promptsService.listPromptFilesForStorage;
		promptsService.listPromptFilesForStorage = (type, storage, token, root) => {
			if (root) {
				roots.push(root.toString());
			}
			return listPromptFilesForStorage(type, storage, token, root);
		};

		const result = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), SessionType.CopilotCLI, CancellationToken.None, undefined, [URI.file('/repo-a'), URI.file('/repo-b')]);

		assert.deepStrictEqual({ result, roots }, { result: [], roots: [] });
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
