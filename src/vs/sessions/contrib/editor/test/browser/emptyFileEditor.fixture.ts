/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/parts/media/editorPart.css';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { NEW_UNTITLED_FILE_COMMAND_ID } from '../../../../../workbench/contrib/files/browser/fileConstants.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING } from '../../../../common/sessionConfig.js';
import { FixtureKeybindingService, FixtureMenuService, IFixtureEntry } from '../../../../test/browser/addTabFixtureUtils.js';
import { EmptyFileEditor, OPEN_FILE_IN_EMPTY_EDITOR_COMMAND_ID } from '../../browser/emptyFileEditor.js';

const entries: readonly IFixtureEntry[] = [
	{ id: OPEN_FILE_IN_EMPTY_EDITOR_COMMAND_ID, title: 'Open File...', icon: Codicon.goToFile, keybinding: KeyMod.CtrlCmd | KeyCode.KeyP },
	{ id: NEW_UNTITLED_FILE_COMMAND_ID, title: 'New File', icon: Codicon.newFile, keybinding: KeyMod.CtrlCmd | KeyCode.KeyN },
];

export default defineThemedFixtureGroup({ path: 'sessions/emptyFileEditor/' }, {
	Default: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderEditor(context),
	}),
	Narrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderEditor(context, 240),
	}),
	KeyboardFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderEditor(context, 480, 'action'),
	}),
	SearchFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderEditor(context, 480, 'search'),
	}),
});

function renderEditor({ container, disposableStore, theme, focus }: ComponentFixtureContext, width = 480, focusTarget?: 'action' | 'search'): void {
	container.style.width = `${width}px`;
	container.style.height = '360px';
	container.classList.add('agent-sessions-workbench');
	const instantiationService = workbenchInstantiationService(undefined, disposableStore);
	const configurationService = new TestConfigurationService({
		[SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]: true,
	});
	disposableStore.add(configurationService.onDidChangeConfigurationEmitter);
	instantiationService.stub(IConfigurationService, configurationService);
	const themeService = new TestThemeService(theme);
	disposableStore.add(themeService._onThemeChange);
	disposableStore.add(themeService._onFileIconThemeChange);
	disposableStore.add(themeService._onProductIconThemeChange);
	instantiationService.stub(IThemeService, themeService);
	const menuService = new FixtureMenuService(entries);
	menuService.commandService = instantiationService.get(ICommandService);
	instantiationService.stub(IMenuService, menuService);
	instantiationService.stub(IKeybindingService, new FixtureKeybindingService(entries));
	const editor = disposableStore.add(instantiationService.createInstance(EmptyFileEditor, new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}()));
	editor.create(container);
	if (focusTarget) {
		const target = container.querySelector<HTMLElement>(focusTarget === 'action' ? '.sessions-add-tab-watermark-entry' : '.empty-file-editor-search input');
		if (!target) {
			throw new Error(`Expected the ${focusTarget} focus target`);
		}
		focus(target);
	}
}
