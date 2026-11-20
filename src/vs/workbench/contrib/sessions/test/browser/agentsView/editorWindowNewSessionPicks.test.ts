/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { applyRememberedNewSessionPicks, EDITOR_WINDOW_NEW_SESSION_PICKS_STORAGE_KEY, EditorWindowNewSessionPicks, IRememberedPicksContext } from '../../../browser/agentsView/editorWindowNewSessionPicks.js';
import { INewSessionTarget } from '../../../browser/parts/chatView.js';

suite('EditorWindowNewSessionPicks', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const windowFolder = URI.file('/work/window');
	const otherFolder = URI.file('/work/other');
	const remembered: INewSessionTarget = { folderUri: otherFolder, providerId: 'agent-host', sessionTypeId: 'copilot', modelId: 'gpt', modeId: 'file:///agents/plan.agent.md', placement: 'worktree' };

	function context(options: { folders?: URI[]; agents?: string[] } = {}): IRememberedPicksContext {
		const folders = options.folders ?? [windowFolder, otherFolder];
		const agents = options.agents ?? ['agent-host/copilot'];
		return {
			toAllowedFolder: uri => folders.find(folder => folder.toString() === uri.toString()),
			isAgentAvailable: (providerId, sessionTypeId) => agents.includes(`${providerId}/${sessionTypeId}`),
		};
	}

	test('stores per workspace and reads back what was picked', () => {
		const storage = store.add(new InMemoryStorageService());
		const picks = new EditorWindowNewSessionPicks(storage);
		assert.strictEqual(picks.read(), undefined);

		picks.store(remembered);

		assert.deepStrictEqual({
			read: new EditorWindowNewSessionPicks(storage).read(),
			workspace: storage.get(EDITOR_WINDOW_NEW_SESSION_PICKS_STORAGE_KEY, StorageScope.WORKSPACE) !== undefined,
			profile: storage.get(EDITOR_WINDOW_NEW_SESSION_PICKS_STORAGE_KEY, StorageScope.PROFILE),
		}, { read: remembered, workspace: true, profile: undefined });
	});

	test('reads nothing from invalid stored values', () => {
		const storage = store.add(new InMemoryStorageService());
		const picks = new EditorWindowNewSessionPicks(storage);
		const reads = ['not json', '{"providerId":3}', '{"placement":"other"}', 'null', '{"folderUri":{"scheme":"file","path":42}}', '{"folderUri":[]}', '{"folderUri":{}}'].map(value => {
			storage.store(EDITOR_WINDOW_NEW_SESSION_PICKS_STORAGE_KEY, value, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			return picks.read();
		});
		assert.deepStrictEqual(reads, reads.map(() => undefined));
	});

	test('a target that names only the window folder starts with the remembered folder and agent', () => {
		assert.deepStrictEqual(applyRememberedNewSessionPicks({ folderUri: windowFolder }, remembered, context()), { ...remembered, placementIsPreference: true });
	});

	test('a remembered folder the window no longer offers is left out, keeping the agent', () => {
		assert.deepStrictEqual(applyRememberedNewSessionPicks({ folderUri: windowFolder }, remembered, context({ folders: [windowFolder] })), {
			folderUri: windowFolder, providerId: 'agent-host', sessionTypeId: 'copilot', modelId: 'gpt', modeId: 'file:///agents/plan.agent.md',
		});
	});

	test('a remembered agent that is gone is left out, keeping the folder', () => {
		assert.deepStrictEqual(applyRememberedNewSessionPicks({ folderUri: windowFolder }, remembered, context({ agents: [] })), { folderUri: otherFolder, placement: 'worktree', placementIsPreference: true });
	});

	test('what the caller names is not replaced', () => {
		const requested: INewSessionTarget = { folderUri: windowFolder, providerId: 'claude', placement: 'worktree' };
		assert.deepStrictEqual(applyRememberedNewSessionPicks(requested, remembered, context()), requested);
	});

	test('an explicit folder with an agent and no placement is not replaced', () => {
		const requested: INewSessionTarget = { folderUri: windowFolder, providerId: 'agent-host', sessionTypeId: 'copilot' };
		assert.deepStrictEqual(applyRememberedNewSessionPicks(requested, remembered, context()), requested);
	});

	test('a remembered Dev Container is not replayed', () => {
		assert.deepStrictEqual(applyRememberedNewSessionPicks({ folderUri: windowFolder }, { folderUri: otherFolder, requireDevContainer: true }, context()), { folderUri: otherFolder });
	});

	test('an empty window without a target starts with the remembered picks', () => {
		assert.deepStrictEqual(applyRememberedNewSessionPicks(undefined, remembered, context()), { ...remembered, placementIsPreference: true });
	});

	test('nothing remembered, or nothing that applies, leaves the target as it is', () => {
		assert.deepStrictEqual([
			applyRememberedNewSessionPicks({ folderUri: windowFolder }, undefined, context()),
			applyRememberedNewSessionPicks(undefined, remembered, context({ folders: [], agents: [] })),
		], [{ folderUri: windowFolder }, undefined]);
	});
});
