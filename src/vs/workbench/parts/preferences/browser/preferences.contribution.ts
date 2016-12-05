/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { EditorInput, IEditorRegistry, Extensions as EditorExtensions, IEditorInputFactory } from 'vs/workbench/common/editor';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { DefaultPreferencesEditor, DefaultPreferencesEditorInput } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { OpenGlobalSettingsAction, OpenGlobalKeybindingsAction, OpenWorkspaceSettingsAction, StartSearchDefaultSettingsAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { IPreferencesService, CONTEXT_DEFAULT_SETTINGS_EDITOR, DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL } from 'vs/workbench/parts/preferences/common/preferences';
import { PreferencesService } from 'vs/workbench/parts/preferences/browser/preferencesService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

registerSingleton(IPreferencesService, PreferencesService);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		DefaultPreferencesEditor.ID,
		nls.localize('defaultPreferencesEditor', "Default Preferences Editor"),
		'vs/workbench/parts/preferences/browser/preferencesEditor',
		'DefaultPreferencesEditor'
	),
	[
		new SyncDescriptor(DefaultPreferencesEditorInput)
	]
);

interface ISerializedDefaultPreferencesEditorInput {
	resource: string;
	isSettings: boolean;
}

// Register Editor Input Factory for Default Preferences Input
class DefaultPreferencesEditorInputFactory implements IEditorInputFactory {

	public serialize(editorInput: EditorInput): string {
		const input = <DefaultPreferencesEditorInput>editorInput;

		const serialized: ISerializedDefaultPreferencesEditorInput = { resource: input.getResource().toString(), isSettings: input.isSettings };

		return JSON.stringify(serialized);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		const deserialized: ISerializedDefaultPreferencesEditorInput = JSON.parse(serializedEditorInput);

		return new DefaultPreferencesEditorInput(URI.parse(deserialized.resource), deserialized.isSettings);
	}
}

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditorInputFactory(DefaultPreferencesEditorInput.ID, DefaultPreferencesEditorInputFactory);

// Contribute Global Actions
const category = nls.localize('preferences', "Preferences");
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.US_COMMA }
}), 'Preferences: Open User Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsAction, OpenGlobalKeybindingsAction.ID, OpenGlobalKeybindingsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_S) }), 'Preferences: Open Keyboard Shortcuts', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenWorkspaceSettingsAction, OpenWorkspaceSettingsAction.ID, OpenWorkspaceSettingsAction.LABEL), 'Preferences: Open Workspace Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(StartSearchDefaultSettingsAction, StartSearchDefaultSettingsAction.ID, StartSearchDefaultSettingsAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_F }, ContextKeyExpr.and(CONTEXT_DEFAULT_SETTINGS_EDITOR)), '');

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL,
		iconClass: 'collapseAll',
		title: nls.localize('collapseAll', "Collapse All")
	},
	when: ContextKeyExpr.and(CONTEXT_DEFAULT_SETTINGS_EDITOR),
	group: 'navigation'
});