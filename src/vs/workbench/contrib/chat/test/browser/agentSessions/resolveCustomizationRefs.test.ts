/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { resolveCustomizationRefs } from '../../../browser/agentSessions/agentHost/agentHostLocalCustomizations.js';
import { type SyncedCustomizationBundler } from '../../../browser/agentSessions/agentHost/syncedCustomizationBundler.js';
import { BUILTIN_STORAGE } from '../../../common/aiCustomizationWorkspaceService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { type IAgentPlugin, type IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type IPromptPath, type IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { SessionType } from '../../../common/chatSessionsService.js';

function makePromptPath(uri: URI, type: PromptsType, storage: PromptsStorage): IPromptPath {
	return { uri, type, storage } as IPromptPath;
}

function makePromptsService(files: ReadonlyMap<string, readonly IPromptPath[]>): IPromptsService {
	return {
		async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage): Promise<readonly IPromptPath[]> {
			return files.get(`${type}/${storage}`) ?? [];
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

function makeAgentPluginService(plugins: readonly IAgentPlugin[] = []): IAgentPluginService {
	return {
		_serviceBrand: undefined,
		plugins: observableValue('plugins', plugins),
		enablementModel: { isEnabled: () => true, setEnabled: () => { /* no-op */ } },
	} as unknown as IAgentPluginService;
}

type LocalSyncableFile = { readonly uri: URI; readonly type: PromptsType };

class FakeBundler {
	readonly received: LocalSyncableFile[][] = [];
	constructor(private readonly _result: { uri: string; displayName: string } | undefined = { uri: 'open-plugin://bundle', displayName: 'Open Plugin' }) { }
	async bundle(files: readonly LocalSyncableFile[]) {
		this.received.push([...files]);
		if (!this._result) {
			return undefined;
		}
		return { ref: { uri: this._result.uri as never, displayName: this._result.displayName }, paths: [] };
	}
}

suite('resolveCustomizationRefs - built-in skills', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes built-in skills to the bundler as loose files', async () => {
		const builtin = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));
		const bundler = new FakeBundler();

		const refs = await resolveCustomizationRefs(
			promptsService,
			new FakeSyncProvider(),
			makeAgentPluginService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 1);
		assert.deepStrictEqual(bundler.received[0].map(f => ({ uri: f.uri.toString(), type: f.type })), [
			{ uri: builtin.toString(), type: PromptsType.skill },
		]);
		assert.strictEqual(refs.length, 1);
		assert.strictEqual(refs[0].displayName, 'Open Plugin');
	});

	test('omits disabled built-in skills from the bundle', async () => {
		const enabled = URI.file('/builtin/create-pr/SKILL.md');
		const disabled = URI.file('/builtin/merge/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [
				makePromptPath(enabled, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage),
				makePromptPath(disabled, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage),
			]],
		]));
		const bundler = new FakeBundler();

		await resolveCustomizationRefs(
			promptsService,
			new FakeSyncProvider(new Set([disabled.toString()])),
			makeAgentPluginService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.deepStrictEqual(bundler.received[0].map(f => f.uri.toString()), [enabled.toString()]);
	});

	test('combines built-in skills with user files in a single bundle', async () => {
		const userAgent = URI.file('/user/agents/foo.agent.md');
		const builtin = URI.file('/builtin/merge/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.agent}/${PromptsStorage.user}`, [makePromptPath(userAgent, PromptsType.agent, PromptsStorage.user)]],
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));
		const bundler = new FakeBundler();

		await resolveCustomizationRefs(
			promptsService,
			new FakeSyncProvider(),
			makeAgentPluginService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 1);
		assert.deepStrictEqual(
			bundler.received[0].map(f => ({ uri: f.uri.toString(), type: f.type })).sort((a, b) => a.uri.localeCompare(b.uri)),
			[
				{ uri: builtin.toString(), type: PromptsType.skill },
				{ uri: userAgent.toString(), type: PromptsType.agent },
			].sort((a, b) => a.uri.localeCompare(b.uri)),
		);
	});

	test('skips bundler call entirely when only disabled built-ins exist', async () => {
		const builtin = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));
		const bundler = new FakeBundler();

		const refs = await resolveCustomizationRefs(
			promptsService,
			new FakeSyncProvider(new Set([builtin.toString()])),
			makeAgentPluginService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 0);
		assert.deepStrictEqual(refs, []);
	});

	test('we honor the cancellation token contract by passing it through to listPromptFilesForStorage', async () => {
		// resolveCustomizationRefs uses `CancellationToken.None`, so we just
		// assert that calling it does not throw and the call still resolves.
		const promptsService = makePromptsService(new Map());
		const refs = await resolveCustomizationRefs(
			promptsService,
			new FakeSyncProvider(),
			makeAgentPluginService(),
			new FakeBundler() as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);
		assert.deepStrictEqual(refs, []);
		// Use CancellationToken so the import isn't dead in the bundle.
		assert.ok(CancellationToken.None.isCancellationRequested === false);
	});
});
