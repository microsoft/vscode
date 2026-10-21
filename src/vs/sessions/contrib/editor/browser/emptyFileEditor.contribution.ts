/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { NEW_UNTITLED_FILE_COMMAND_ID } from '../../../../workbench/contrib/files/browser/fileConstants.js';
import { Menus } from '../../../browser/menus.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING } from '../../../common/sessionConfig.js';
import { EmptyFileEditor } from './emptyFileEditor.js';
import { EmptyFileEditorAccessibilityHelp } from './emptyFileEditorAccessibility.js';
import { EmptyFileEditorInput, EmptyFileEditorSerializer } from './emptyFileEditorInput.js';
import { EmptyFileEditorSearchPickerFocusedContext } from './emptyFileEditorSearch.js';

/**
 * Registers the empty-file editor (the "Select a file or search with <kbd>" placeholder pane) and
 * its serializer, but only in the desktop layout where the "Files" add-tab flow uses it.
 * Registered at startup (before editor restore) so persisted empty-file tabs can be deserialized.
 * Opening it is owned by `addTabActions.ts`'s "Files" action.
 */
class DesktopEmptyFileEditorContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.desktopEmptyFileEditor';

	constructor(
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
	) {
		super();

		if (layoutService.agentWorkbenchLayout !== AgentWorkbenchLayout.Desktop) {
			return;
		}

		this._register(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
			EditorPaneDescriptor.create(
				EmptyFileEditor,
				EmptyFileEditor.ID,
				localize('emptyFileEditor.label', "File")
			),
			[new SyncDescriptor(EmptyFileEditorInput)]
		));

		this._register(Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
			EmptyFileEditorInput.ID,
			EmptyFileEditorSerializer
		));
	}
}

registerWorkbenchContribution2(DesktopEmptyFileEditorContribution.ID, DesktopEmptyFileEditorContribution, WorkbenchPhase.BlockStartup);
AccessibleViewRegistry.register(new EmptyFileEditorAccessibilityHelp());
MenuRegistry.appendMenuItem(Menus.EmptyFileEditorActions, {
	command: {
		id: NEW_UNTITLED_FILE_COMMAND_ID,
		title: localize2('emptyFileEditor.newFile', "New File"),
		icon: Codicon.newFile,
	},
	group: 'navigation',
	order: 1,
});
// The search picker renders outside the editor area, where Cmd+N otherwise starts a new session.
KeybindingsRegistry.registerKeybindingRule({
	id: NEW_UNTITLED_FILE_COMMAND_ID,
	weight: KeybindingWeight.SessionsContrib + 1,
	when: EmptyFileEditorSearchPickerFocusedContext,
	primary: KeyMod.CtrlCmd | KeyCode.KeyN,
});

export const emptyFileEditorConfiguration = {
	id: 'sessions',
	properties: {
		[SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]: {
			type: 'boolean',
			default: product.quality === 'insider',
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('sessions.experimental.emptyFileEditorActions', "Enables file search and a New File action in the empty Files editor."),
		},
	},
} satisfies IConfigurationNode;

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(emptyFileEditorConfiguration);
