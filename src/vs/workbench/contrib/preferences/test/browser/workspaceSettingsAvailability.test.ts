/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationHandle, INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, toWorkspaceFolder, WorkbenchState, Workspace } from '../../../../../platform/workspace/common/workspace.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IJSONEditingService } from '../../../../services/configuration/common/jsonEditing.js';
import { TestJSONEditingService } from '../../../../services/configuration/test/common/testServices.js';
import { PreferencesService } from '../../../../services/preferences/browser/preferencesService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TestRemoteAgentService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { WorkspaceSettingsAvailabilityContribution } from '../../browser/workspaceSettingsAvailability.js';
import { CONTEXT_HAS_WORKSPACE_SETTINGS } from '../../common/preferences.js';

suite('WorkspaceSettingsAvailabilityContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the title button, and shows the commands opening workspace settings, only while the workspace has a settings file, as in and out of Agents mode', async () => {
		const onDidChangeWorkbenchState = disposables.add(new Emitter<WorkbenchState>());
		const onDidChangeAgentsMode = disposables.add(new Emitter<boolean>());
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const onDidChangeWorkspaceName = disposables.add(new Emitter<void>());
		const createWorkspace = (configuration: URI | null, folders: URI[] = []) => new Workspace('workspace', folders.map(folder => toWorkspaceFolder(folder)), false, configuration, () => false);
		// The Agents mode workspace has neither a workspace file nor folders
		let workspace = createWorkspace(null);
		const contextKeyService = new MockContextKeyService();
		const messages: string[] = [];
		class RecordingNotificationService extends TestNotificationService {
			override info(message: NotificationMessage): INotificationHandle {
				messages.push(String(message));
				return super.info(message);
			}
		}

		const testInstantiationService = workbenchInstantiationService(undefined, disposables);
		testInstantiationService.stub(IWorkspaceContextService, { getWorkbenchState: () => WorkbenchState.WORKSPACE, getWorkspace: () => workspace, onDidChangeWorkbenchState: onDidChangeWorkbenchState.event, onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event, onDidChangeWorkspaceName: onDidChangeWorkspaceName.event });
		testInstantiationService.stub(IContextKeyService, contextKeyService);
		testInstantiationService.stub(INotificationService, new RecordingNotificationService());
		testInstantiationService.stub(IAgentsModeService, { onDidChange: onDidChangeAgentsMode.event });
		testInstantiationService.stub(IJSONEditingService, TestJSONEditingService);
		testInstantiationService.stub(IRemoteAgentService, TestRemoteAgentService);
		testInstantiationService.stub(ICommandService, TestCommandService);
		testInstantiationService.stub(IURLService, { registerHandler: () => ({ dispose: () => { } }) });
		const collection = new ServiceCollection();
		collection.set(IPreferencesService, new SyncDescriptor(PreferencesService));
		const instantiationService = disposables.add(testInstantiationService.createChild(collection));
		const preferencesService = disposables.add(instantiationService.createInstance(PreferencesService));
		instantiationService.stub(IPreferencesService, preferencesService);

		const registered = () => {
			const titleButtons = MenuRegistry.getMenuItems(MenuId.EditorTitle).filter(item => isIMenuItem(item) && item.command.id === WorkspaceSettingsAvailabilityContribution.COMMAND_ID);
			return {
				command: !!CommandsRegistry.getCommand(WorkspaceSettingsAvailabilityContribution.COMMAND_ID),
				titleButtons: titleButtons.map(item => /\/workspace\/\w+\.code-workspace/.exec(item.when?.serialize() ?? '')?.[0]),
				hasWorkspaceSettings: contextKeyService.getContextKeyValue(CONTEXT_HAS_WORKSPACE_SETTINGS.key),
			};
		};
		const states: ReturnType<typeof registered>[] = [];

		const contribution = instantiationService.createInstance(WorkspaceSettingsAvailabilityContribution);
		states.push(registered());
		onDidChangeWorkbenchState.fire(WorkbenchState.WORKSPACE);
		states.push(registered());

		// The commands opening workspace settings are disabled in the mode; opened another way, such as from the Settings
		// editor, the user is told there are no workspace settings to open, rather than it failing or doing nothing
		const openInMode = await preferencesService.openWorkspaceSettings({ jsonEditor: false }).then(() => 'opened', error => ({ rejectedWith: error }));

		// Leaving the mode brings the workspace file back
		workspace = createWorkspace(URI.file('/workspace/test.code-workspace'));
		onDidChangeAgentsMode.fire(false);
		states.push(registered());

		// Save Workspace As moves the settings to another file, in the same workbench state
		workspace = createWorkspace(URI.file('/workspace/other.code-workspace'));
		onDidChangeWorkspaceName.fire();
		states.push(registered());

		// Entering it again takes the file away
		workspace = createWorkspace(null);
		onDidChangeAgentsMode.fire(true);
		states.push(registered());

		// A folder mounted in the mode brings settings to open, but not the title button of the workspace file
		workspace = createWorkspace(null, [URI.file('/repo')]);
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		states.push(registered());

		workspace = createWorkspace(URI.file('/workspace/test.code-workspace'));
		onDidChangeAgentsMode.fire(false);
		contribution.dispose();
		states.push(registered());

		assert.deepStrictEqual({ states, openInMode, messages }, {
			states: [
				{ command: false, titleButtons: [], hasWorkspaceSettings: false },
				{ command: false, titleButtons: [], hasWorkspaceSettings: false },
				{ command: true, titleButtons: ['/workspace/test.code-workspace'], hasWorkspaceSettings: true },
				{ command: true, titleButtons: ['/workspace/other.code-workspace'], hasWorkspaceSettings: true },
				{ command: false, titleButtons: [], hasWorkspaceSettings: false },
				{ command: false, titleButtons: [], hasWorkspaceSettings: true },
				{ command: false, titleButtons: [], hasWorkspaceSettings: true },
			],
			openInMode: { rejectedWith: null },
			messages: ['Open a folder or workspace first to create workspace or folder settings.'],
		});
	});
});
