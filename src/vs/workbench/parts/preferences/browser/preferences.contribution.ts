/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { DefaultPreferencesEditor, DefaultSettingsInput, DefaultKeybindingsInput } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { OpenGlobalSettingsAction, OpenGlobalKeybindingsAction, OpenWorkspaceSettingsAction, DefineSettingAction, DefineUserSettingAction, DefineWorkspaceSettingAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { IPreferencesService, CONTEXT_DEFAULT_SETTINGS_EDITOR, DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL } from 'vs/workbench/parts/preferences/common/preferences';
import { PreferencesService } from 'vs/workbench/parts/preferences/browser/preferencesService';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { UserSettingHandler, WorkspaceSettingHandler } from 'vs/workbench/parts/preferences/browser/preferencesQuickOpen';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

registerSingleton(IPreferencesService, PreferencesService);

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(
	new EditorDescriptor(
		DefaultPreferencesEditor.ID,
		nls.localize('defaultSettingsEditor', "Default Settings Editor"),
		'vs/workbench/parts/preferences/browser/preferencesEditor',
		'DefaultPreferencesEditor'
	),
	[
		new SyncDescriptor(DefaultSettingsInput),
		new SyncDescriptor(DefaultKeybindingsInput)
	]
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/preferences/browser/preferencesQuickOpen',
		'UserSettingHandler',
		UserSettingHandler.QUICK_OPEN_PREFIX,
		nls.localize('userSettings', "User Settings"),
		true
	)
);
// TODO: Register only if workspace is there
Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/preferences/browser/preferencesQuickOpen',
		'WorkspaceSettingHandler',
		WorkspaceSettingHandler.QUICK_OPEN_PREFIX,
		nls.localize('workspaceSettings', "Workspace Settings"),
		true
	)
);

// Contribute Global Actions
const category = nls.localize('preferences', "Preferences");
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.US_COMMA }
}), 'Preferences: Open User Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsAction, OpenGlobalKeybindingsAction.ID, OpenGlobalKeybindingsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_S) }), 'Preferences: Open Keyboard Shortcuts', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenWorkspaceSettingsAction, OpenWorkspaceSettingsAction.ID, OpenWorkspaceSettingsAction.LABEL), 'Preferences: Open Workspace Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(DefineSettingAction, DefineSettingAction.ID, DefineSettingAction.LABEL), 'Preferences: Define Setting', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(DefineUserSettingAction, DefineUserSettingAction.ID, DefineUserSettingAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_COMMA) }), 'Preferences: Define User Setting', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(DefineWorkspaceSettingAction, DefineWorkspaceSettingAction.ID, DefineWorkspaceSettingAction.LABEL), 'Preferences: Define Workspace Setting', category);

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL,
		iconClass: 'collapseAll',
		title: nls.localize('collapseAll', "Collapse All")
	},
	when: ContextKeyExpr.and(CONTEXT_DEFAULT_SETTINGS_EDITOR),
	group: 'navigation'
});