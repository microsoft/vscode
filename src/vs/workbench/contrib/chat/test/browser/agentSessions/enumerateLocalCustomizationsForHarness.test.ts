/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { enumerateLocalCustomizationsForHarness } from '../../../browser/agentSessions/agentHost/agentHostLocalCustomizations.js';
import { BUILTIN_STORAGE } from '../../../common/aiCustomizationWorkspaceService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type IPromptPath, type IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

function makePromptPath(uri: URI, type: PromptsType, storage: PromptsStorage): IPromptPath {
	return { uri, type, storage } as IPromptPath;
}

function makePromptsService(
	files: ReadonlyMap<string, readonly IPromptPath[]>,
): IPromptsService {
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

suite('enumerateLocalCustomizationsForHarness', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('emits built-in skills with BUILTIN_STORAGE even when no other storage source has files', async () => {
		const builtin = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));

		const result = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), CancellationToken.None);

		assert.deepStrictEqual(result, [{
			uri: builtin,
			type: PromptsType.skill,
			storage: BUILTIN_STORAGE,
			disabled: false,
		}]);
	});

	test('combines core storage entries with built-in skills', async () => {
		const userAgent = URI.file('/user/agents/foo.agent.md');
		const builtinSkill = URI.file('/builtin/merge/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.agent}/${PromptsStorage.user}`, [makePromptPath(userAgent, PromptsType.agent, PromptsStorage.user)]],
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtinSkill, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));

		const result = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), CancellationToken.None);

		assert.deepStrictEqual(result.map((e: { uri: URI; type: PromptsType; storage: unknown; disabled: boolean }) => ({ uri: e.uri.toString(), type: e.type, storage: e.storage, disabled: e.disabled })), [
			{ uri: userAgent.toString(), type: PromptsType.agent, storage: PromptsStorage.user, disabled: false },
			{ uri: builtinSkill.toString(), type: PromptsType.skill, storage: BUILTIN_STORAGE, disabled: false },
		]);
	});

	test('marks built-in skills disabled when the sync provider says so', async () => {
		const builtin = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));
		const syncProvider = new FakeSyncProvider(new Set([builtin.toString()]));

		const result = await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, CancellationToken.None);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].disabled, true);
	});

	test('returns empty when the prompts service exposes no built-in skills (regular workbench)', async () => {
		// The regular workbench's PromptsServiceImpl throws for unknown
		// storage values like BUILTIN_STORAGE. Model that here so the
		// try/catch in enumerateLocalCustomizationsForHarness is covered.
		const promptsService = {
			async listPromptFilesForStorage(_type: PromptsType, storage: PromptsStorage): Promise<readonly IPromptPath[]> {
				if ((storage as unknown as string) === BUILTIN_STORAGE) {
					throw new Error(`Unsupported storage: ${storage}`);
				}
				return [];
			},
		} as unknown as IPromptsService;
		const result = await enumerateLocalCustomizationsForHarness(promptsService, new FakeSyncProvider(), CancellationToken.None);
		assert.deepStrictEqual(result, []);
	});
});
