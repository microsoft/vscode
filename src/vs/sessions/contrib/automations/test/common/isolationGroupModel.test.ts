/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AutomationIsolationModel, IAutomationIsolationFormState, normalizeAutomationBranchNames } from '../../common/isolationGroupModel.js';

const FOLDER_A = URI.file('/workspace/a');
const FOLDER_B = URI.file('/workspace/b');

function createState(overrides?: Partial<IAutomationIsolationFormState>): IAutomationIsolationFormState {
	return {
		isQuickChat: false,
		folderUri: FOLDER_A,
		isolationMode: 'workspace',
		branch: undefined,
		...overrides,
	};
}

suite('AutomationIsolationModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Folder mode treats a saved branch as legacy derived state', () => {
		const state = createState({ branch: 'stale-head' });
		const model = new AutomationIsolationModel(state);
		model.setHeadBranch('main');

		assert.deepStrictEqual({
			displayBranch: model.displayBranch,
			persistedBranch: model.persistedBranch,
			stateBranch: state.branch,
		}, {
			displayBranch: 'main',
			persistedBranch: undefined,
			stateBranch: undefined,
		});
	});

	test('provider-default isolation displays Folder without selecting it explicitly', () => {
		const state = createState({ isolationMode: undefined });
		const model = new AutomationIsolationModel(state);

		assert.deepStrictEqual({
			displayMode: model.isolationMode,
			persistedMode: state.isolationMode,
		}, {
			displayMode: 'workspace',
			persistedMode: undefined,
		});
	});

	test('preserves an edited Worktree branch when HEAD changes or disappears', () => {
		const state = createState({ isolationMode: 'worktree', branch: 'feature/saved' });
		const model = new AutomationIsolationModel(state);
		model.setSupportsWorktreeConfiguration(true);
		model.setHeadBranch('main');
		model.setHeadBranch(undefined);

		assert.deepStrictEqual({
			displayBranch: model.displayBranch,
			persistedBranch: model.persistedBranch,
			selectedBranch: model.selectedBranch,
		}, {
			displayBranch: 'feature/saved',
			persistedBranch: 'feature/saved',
			selectedBranch: 'feature/saved',
		});
	});

	test('does not use generated worktree HEAD as an implicit branch', () => {
		const state = createState({ isolationMode: 'worktree' });
		const model = new AutomationIsolationModel(state);
		model.setSupportsWorktreeConfiguration(true);
		model.setHeadBranch('copilot-worktree-2026-07-14');

		assert.deepStrictEqual({
			headBranch: model.headBranch,
			displayBranch: model.displayBranch,
			persistedBranch: model.persistedBranch,
		}, {
			headBranch: undefined,
			displayBranch: undefined,
			persistedBranch: undefined,
		});
	});

	test('rejects generated worktree branches from persisted and explicit selection state', () => {
		const state = createState({ isolationMode: 'worktree', branch: 'copilot-worktree-restored' });
		const model = new AutomationIsolationModel(state);
		model.setSupportsWorktreeConfiguration(true);
		model.setHeadBranch('main');
		const restored = {
			selectedBranch: model.selectedBranch,
			persistedBranch: model.persistedBranch,
			stateBranch: state.branch,
		};
		model.selectBranch('feature/selected');
		model.selectBranch('copilot-worktree-explicit');

		assert.deepStrictEqual({
			restored,
			explicit: {
				selectedBranch: model.selectedBranch,
				persistedBranch: model.persistedBranch,
				stateBranch: state.branch,
			},
		}, {
			restored: {
				selectedBranch: undefined,
				persistedBranch: 'main',
				stateBranch: undefined,
			},
			explicit: {
				selectedBranch: 'feature/selected',
				persistedBranch: 'feature/selected',
				stateBranch: 'feature/selected',
			},
		});
	});

	test('keeps explicit branch intent across temporary isolation-mode toggles', () => {
		const state = createState({ isolationMode: 'worktree', branch: 'feature/saved' });
		const model = new AutomationIsolationModel(state);
		model.setSupportsWorktreeConfiguration(true);
		model.setHeadBranch('main');

		assert.strictEqual(model.selectIsolationMode('workspace'), true);
		assert.strictEqual(model.persistedBranch, undefined);
		assert.strictEqual(model.selectIsolationMode('worktree'), true);

		assert.deepStrictEqual({
			displayBranch: model.displayBranch,
			persistedBranch: model.persistedBranch,
		}, {
			displayBranch: 'feature/saved',
			persistedBranch: 'feature/saved',
		});
	});

	test('clears explicit branch intent when the folder changes', () => {
		const state = createState({ isolationMode: 'worktree', branch: 'feature/a' });
		const model = new AutomationIsolationModel(state);
		model.setSupportsWorktreeConfiguration(true);

		model.setWorkspace(FOLDER_B);
		model.setHeadBranch('develop');

		assert.deepStrictEqual({
			folder: model.folderUri?.toString(),
			selectedBranch: model.selectedBranch,
			persistedBranch: model.persistedBranch,
		}, {
			folder: FOLDER_B.toString(),
			selectedBranch: undefined,
			persistedBranch: 'develop',
		});
	});

	test('blocks unsupported Worktree selection without changing the mode', () => {
		const state = createState();
		const model = new AutomationIsolationModel(state);

		assert.deepStrictEqual({
			selected: model.selectIsolationMode('worktree'),
			mode: model.isolationMode,
			pickerAvailable: model.branchPickerAvailable,
		}, {
			selected: false,
			mode: 'workspace',
			pickerAvailable: false,
		});
	});

	test('workspace-less mode clears repository state and returns to Folder mode explicitly', () => {
		const state = createState({ isolationMode: 'worktree', branch: 'feature/saved' });
		const model = new AutomationIsolationModel(state);
		model.setSupportsWorktreeConfiguration(true);
		model.setHeadBranch('main');

		model.setQuickChat(true);
		const quickChatState = {
			isQuickChat: model.isQuickChat,
			folderUri: model.folderUri,
			isolationMode: state.isolationMode,
			branch: model.persistedBranch,
		};
		model.setQuickChat(false, FOLDER_B);

		assert.deepStrictEqual({
			quickChatState,
			workspaceState: {
				isQuickChat: model.isQuickChat,
				folderUri: model.folderUri?.toString(),
				isolationMode: model.isolationMode,
				branch: model.persistedBranch,
			},
		}, {
			quickChatState: {
				isQuickChat: true,
				folderUri: undefined,
				isolationMode: undefined,
				branch: undefined,
			},
			workspaceState: {
				isQuickChat: false,
				folderUri: FOLDER_B.toString(),
				isolationMode: 'workspace',
				branch: undefined,
			},
		});
	});

	test('ignores hidden workspace updates while workspace-less mode is active', () => {
		const state = createState({ isQuickChat: true, folderUri: undefined });
		const model = new AutomationIsolationModel(state);

		const accepted = model.setWorkspace(FOLDER_B);

		assert.deepStrictEqual({
			accepted,
			state: {
				isQuickChat: state.isQuickChat,
				folderUri: state.folderUri,
			},
			observables: {
				isQuickChat: model.isQuickChatObs.get(),
				folderUri: model.folderUriObs.get(),
			},
		}, {
			accepted: false,
			state: {
				isQuickChat: true,
				folderUri: undefined,
			},
			observables: {
				isQuickChat: true,
				folderUri: undefined,
			},
		});
	});

	test('normalizes local branch names', () => {
		assert.deepStrictEqual(normalizeAutomationBranchNames([
			'feature/z',
			'main',
			undefined,
			'main',
			'copilot-worktree-2026-07-13',
			'feature/a',
		]), ['feature/a', 'feature/z', 'main']);
	});
});
