/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Separator } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IRecentlyOpened, IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { IOpenRecentAction, MenubarControl } from '../../../../browser/parts/titlebar/menubarControl.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { TestMenuService, workbenchInstantiationService } from '../../workbenchTestServices.js';

class TestMenubarMenuService extends TestMenuService {
	override createMenu(): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => [['', []]]
		};
	}
}

class TestMenubarControl extends MenubarControl {
	constructor(
		@IMenuService menuService: IMenuService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILabelService labelService: ILabelService,
		@IUpdateService updateService: IUpdateService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IPreferencesService preferencesService: IPreferencesService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IHostService hostService: IHostService,
		@ICommandService commandService: ICommandService
	) {
		super(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService);
	}

	protected override doUpdateMenubar(_firstTime: boolean): void { }

	getOpenRecentActionsForTest(recentlyOpened: IRecentlyOpened): IOpenRecentAction[] {
		this.recentlyOpened = recentlyOpened;

		return this.getOpenRecentActions().filter((action): action is IOpenRecentAction => !(action instanceof Separator));
	}
}

suite('MenubarControl', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('bounds open recent menu labels without splitting surrogate pairs', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IMenuService, new TestMenubarMenuService());
		instantiationService.stub(IUpdateService, new class extends mock<IUpdateService>() {
			override readonly onStateChange = Event.None;
			override readonly state = State.Uninitialized;
		});
		instantiationService.stub(IPreferencesService, new class extends mock<IPreferencesService>() { });
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });

		const control = disposables.add(instantiationService.createInstance(TestMenubarControl));
		const folderUri = URI.file('folder');
		const workspaceUri = URI.file('workspace.code-workspace');
		const fileUri = URI.file('file.txt');
		const folderLabel = `${'a'.repeat(58)}😀${'b'.repeat(61)}`;
		const workspaceLabel = 'workspace.code-workspace';
		const fileLabel = `${'a'.repeat(60)}😀${'b'.repeat(59)}`;

		const actions = control.getOpenRecentActionsForTest({
			workspaces: [
				{ folderUri, label: folderLabel },
				{ workspace: { id: 'workspace', configPath: workspaceUri }, label: workspaceLabel }
			],
			files: [{ fileUri, label: fileLabel, remoteAuthority: 'remote' }]
		});

		assert.deepStrictEqual(actions.map(action => ({
			label: action.label,
			labelLength: action.label.length,
			uri: action.uri,
			remoteAuthority: action.remoteAuthority
		})), [
			{ label: `${'a'.repeat(58)}…${'b'.repeat(60)}`, labelLength: 119, uri: folderUri, remoteAuthority: undefined },
			{ label: workspaceLabel, labelLength: workspaceLabel.length, uri: workspaceUri, remoteAuthority: undefined },
			{ label: `${'a'.repeat(59)}…${'b'.repeat(59)}`, labelLength: 119, uri: fileUri, remoteAuthority: 'remote' }
		]);
	});
});
