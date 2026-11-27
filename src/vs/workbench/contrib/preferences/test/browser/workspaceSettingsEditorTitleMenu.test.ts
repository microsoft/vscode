/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { WorkspaceSettingsEditorTitleMenuContribution } from '../../browser/workspaceSettingsEditorTitleMenu.js';
import { CONTEXT_WORKSPACE_SETTINGS_UNAVAILABLE } from '../../common/preferences.js';

suite('WorkspaceSettingsEditorTitleMenuContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the title button, and shows the commands opening workspace settings, only while the workspace has a settings file, as in and out of Agents mode', () => {
		const onDidChangeWorkbenchState = disposables.add(new Emitter<WorkbenchState>());
		const onDidChangeAgentsMode = disposables.add(new Emitter<boolean>());
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const contextKeyService = new MockContextKeyService();
		let workspaceSettingsResource: URI | null = null;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => WorkbenchState.WORKSPACE, onDidChangeWorkbenchState: onDidChangeWorkbenchState.event, onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event });
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IPreferencesService, { get workspaceSettingsResource() { return workspaceSettingsResource; } });
		instantiationService.stub(IAgentsModeService, { onDidChange: onDidChangeAgentsMode.event });

		const registered = () => {
			const titleButtons = MenuRegistry.getMenuItems(MenuId.EditorTitle).filter(item => isIMenuItem(item) && item.command.id === WorkspaceSettingsEditorTitleMenuContribution.COMMAND_ID);
			return {
				command: !!CommandsRegistry.getCommand(WorkspaceSettingsEditorTitleMenuContribution.COMMAND_ID),
				titleButtons: titleButtons.length,
				settingsUnavailable: contextKeyService.getContextKeyValue(CONTEXT_WORKSPACE_SETTINGS_UNAVAILABLE.key),
			};
		};
		const states: ReturnType<typeof registered>[] = [];

		// The Agents mode workspace has no settings file
		const contribution = instantiationService.createInstance(WorkspaceSettingsEditorTitleMenuContribution);
		states.push(registered());
		onDidChangeWorkbenchState.fire(WorkbenchState.WORKSPACE);
		states.push(registered());

		// Leaving the mode brings the workspace file back
		workspaceSettingsResource = URI.file('/workspace/test.code-workspace');
		onDidChangeAgentsMode.fire(false);
		states.push(registered());

		// Entering it again takes the file away
		workspaceSettingsResource = null;
		onDidChangeAgentsMode.fire(true);
		states.push(registered());

		// A folder mounted in the mode brings settings to open, but not the title button of the workspace file
		workspaceSettingsResource = URI.file('/repo/.vscode/settings.json');
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		states.push(registered());

		workspaceSettingsResource = URI.file('/workspace/test.code-workspace');
		onDidChangeAgentsMode.fire(false);
		contribution.dispose();
		states.push(registered());

		assert.deepStrictEqual(states, [
			{ command: false, titleButtons: 0, settingsUnavailable: true },
			{ command: false, titleButtons: 0, settingsUnavailable: true },
			{ command: true, titleButtons: 1, settingsUnavailable: false },
			{ command: false, titleButtons: 0, settingsUnavailable: true },
			{ command: false, titleButtons: 0, settingsUnavailable: false },
			{ command: false, titleButtons: 0, settingsUnavailable: false },
		]);
	});
});
