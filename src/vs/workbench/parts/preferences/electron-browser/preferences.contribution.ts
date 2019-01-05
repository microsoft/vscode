/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import 'vs/css!../browser/media/preferences';
import { Command } from 'vs/editor/browser/editorExtensions';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/suggest';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorInput, Extensions as EditorInputExtensions, IEditorInputFactory, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { KeybindingsEditor } from 'vs/workbench/parts/preferences/browser/keybindingsEditor';
import { ConfigureLanguageBasedSettingsAction, OpenDefaultKeybindingsFileAction, OpenFolderSettingsAction, OpenGlobalKeybindingsAction, OpenGlobalKeybindingsFileAction, OpenGlobalSettingsAction, OpenRawDefaultSettingsAction, OpenSettings2Action, OpenSettingsJsonAction, OpenWorkspaceSettingsAction, OPEN_FOLDER_SETTINGS_COMMAND } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { PreferencesEditor } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDING_FOCUS, CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_JSON_EDITOR, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, IKeybindingsEditor, IPreferencesSearchService, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_SEARCH, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS, KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS, MODIFIED_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_EDIT_FOCUSED_SETTING, SETTINGS_EDITOR_COMMAND_FILTER_MODIFIED, SETTINGS_EDITOR_COMMAND_FILTER_ONLINE, SETTINGS_EDITOR_COMMAND_FOCUS_FILE, SETTINGS_EDITOR_COMMAND_FOCUS_NEXT_SETTING, SETTINGS_EDITOR_COMMAND_FOCUS_PREVIOUS_SETTING, SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH, SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST, SETTINGS_EDITOR_COMMAND_SEARCH, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU, SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON, SETTINGS_COMMAND_OPEN_SETTINGS } from 'vs/workbench/parts/preferences/common/preferences';
import { PreferencesContribution } from 'vs/workbench/parts/preferences/common/preferencesContribution';
import { PreferencesSearchService } from 'vs/workbench/parts/preferences/electron-browser/preferencesSearch';
import { SettingsEditor2 } from 'vs/workbench/parts/preferences/electron-browser/settingsEditor2';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { DefaultPreferencesEditorInput, KeybindingsEditorInput, PreferencesEditorInput, SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';

registerSingleton(IPreferencesSearchService, PreferencesSearchService, true);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		PreferencesEditor,
		PreferencesEditor.ID,
		nls.localize('defaultPreferencesEditor', "Default Preferences Editor")
	),
	[
		new SyncDescriptor(PreferencesEditorInput)
	]
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		SettingsEditor2,
		SettingsEditor2.ID,
		nls.localize('settingsEditor2', "Settings Editor 2")
	),
	[
		new SyncDescriptor(SettingsEditor2Input)
	]
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		KeybindingsEditor,
		KeybindingsEditor.ID,
		nls.localize('keybindingsEditor', "Keybindings Editor")
	),
	[
		new SyncDescriptor(KeybindingsEditorInput)
	]
);

interface ISerializedPreferencesEditorInput {
	name: string;
	description: string;

	detailsSerialized: string;
	masterSerialized: string;

	detailsTypeId: string;
	masterTypeId: string;
}

// Register Preferences Editor Input Factory
class PreferencesEditorInputFactory implements IEditorInputFactory {

	serialize(editorInput: EditorInput): string {
		const input = <PreferencesEditorInput>editorInput;

		if (input.details && input.master) {
			const registry = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories);
			const detailsInputFactory = registry.getEditorInputFactory(input.details.getTypeId());
			const masterInputFactory = registry.getEditorInputFactory(input.master.getTypeId());

			if (detailsInputFactory && masterInputFactory) {
				const detailsSerialized = detailsInputFactory.serialize(input.details);
				const masterSerialized = masterInputFactory.serialize(input.master);

				if (detailsSerialized && masterSerialized) {
					return JSON.stringify(<ISerializedPreferencesEditorInput>{
						name: input.getName(),
						description: input.getDescription(),
						detailsSerialized,
						masterSerialized,
						detailsTypeId: input.details.getTypeId(),
						masterTypeId: input.master.getTypeId()
					});
				}
			}
		}

		return null;
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		const deserialized: ISerializedPreferencesEditorInput = JSON.parse(serializedEditorInput);

		const registry = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories);
		const detailsInputFactory = registry.getEditorInputFactory(deserialized.detailsTypeId);
		const masterInputFactory = registry.getEditorInputFactory(deserialized.masterTypeId);

		if (detailsInputFactory && masterInputFactory) {
			const detailsInput = detailsInputFactory.deserialize(instantiationService, deserialized.detailsSerialized);
			const masterInput = masterInputFactory.deserialize(instantiationService, deserialized.masterSerialized);

			if (detailsInput && masterInput) {
				return new PreferencesEditorInput(deserialized.name, deserialized.description, detailsInput, masterInput);
			}
		}

		return null;
	}
}

class KeybindingsEditorInputFactory implements IEditorInputFactory {

	serialize(editorInput: EditorInput): string {
		const input = <KeybindingsEditorInput>editorInput;
		return JSON.stringify({
			name: input.getName(),
			typeId: input.getTypeId()
		});
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		return instantiationService.createInstance(KeybindingsEditorInput);
	}
}

interface ISerializedSettingsEditor2EditorInput {
}

class SettingsEditor2InputFactory implements IEditorInputFactory {

	serialize(input: SettingsEditor2Input): string {
		const serialized: ISerializedSettingsEditor2EditorInput = {
		};

		return JSON.stringify(serialized);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SettingsEditor2Input {
		return instantiationService.createInstance(
			SettingsEditor2Input);
	}
}

interface ISerializedDefaultPreferencesEditorInput {
	resource: string;
}

// Register Default Preferences Editor Input Factory
class DefaultPreferencesEditorInputFactory implements IEditorInputFactory {

	serialize(editorInput: EditorInput): string {
		const input = <DefaultPreferencesEditorInput>editorInput;

		const serialized: ISerializedDefaultPreferencesEditorInput = { resource: input.getResource().toString() };

		return JSON.stringify(serialized);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		const deserialized: ISerializedDefaultPreferencesEditorInput = JSON.parse(serializedEditorInput);

		return instantiationService.createInstance(DefaultPreferencesEditorInput, URI.parse(deserialized.resource));
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(PreferencesEditorInput.ID, PreferencesEditorInputFactory);
Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(DefaultPreferencesEditorInput.ID, DefaultPreferencesEditorInputFactory);
Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(KeybindingsEditorInput.ID, KeybindingsEditorInputFactory);
Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(SettingsEditor2Input.ID, SettingsEditor2InputFactory);

// Contribute Global Actions
const category = nls.localize('preferences', "Preferences");
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenRawDefaultSettingsAction, OpenRawDefaultSettingsAction.ID, OpenRawDefaultSettingsAction.LABEL), 'Preferences: Open Raw Default Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenSettingsJsonAction, OpenSettingsJsonAction.ID, OpenSettingsJsonAction.LABEL), 'Preferences: Open Settings (JSON)', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenSettings2Action, OpenSettings2Action.ID, OpenSettings2Action.LABEL), 'Preferences: Open Settings (UI)', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL), 'Preferences: Open User Settings', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsAction, OpenGlobalKeybindingsAction.ID, OpenGlobalKeybindingsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_S) }), 'Preferences: Open Keyboard Shortcuts', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDefaultKeybindingsFileAction, OpenDefaultKeybindingsFileAction.ID, OpenDefaultKeybindingsFileAction.LABEL), 'Preferences: Open Default Keyboard Shortcuts File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsFileAction, OpenGlobalKeybindingsFileAction.ID, OpenGlobalKeybindingsFileAction.LABEL, { primary: 0 }), 'Preferences: Open Keyboard Shortcuts File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureLanguageBasedSettingsAction, ConfigureLanguageBasedSettingsAction.ID, ConfigureLanguageBasedSettingsAction.LABEL), 'Preferences: Configure Language Specific Settings...', category);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SETTINGS_COMMAND_OPEN_SETTINGS,
	weight: KeybindingWeight.WorkbenchContrib,
	when: null,
	primary: KeyMod.CtrlCmd | KeyCode.US_COMMA,
	handler: (accessor, args: any) => {
		accessor.get(IPreferencesService).openSettings();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K),
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control && control instanceof KeybindingsEditor) {
			control.defineKeybinding(control.activeKeybindingEntry);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.Backspace)
	},
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control && control instanceof KeybindingsEditor) {
			control.removeKeybinding(control.activeKeybindingEntry);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_RESET,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: 0,
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control && control instanceof KeybindingsEditor) {
			control.resetKeybinding(control.activeKeybindingEntry);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_SEARCH,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS.toNegated()),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control && control instanceof KeybindingsEditor) {
			control.focusSearch();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
	primary: KeyMod.Alt | KeyCode.KEY_K,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_K },
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control && control instanceof KeybindingsEditor) {
			control.recordSearchKeys();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
	primary: KeyMod.Alt | KeyCode.KEY_P,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_P },
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control && control instanceof KeybindingsEditor) {
			control.toggleSortByPrecedence();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: 0,
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control) {
			control.showSimilarKeybindings(control.activeKeybindingEntry);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_COPY,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control) {
			control.copyKeybinding(control.activeKeybindingEntry);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: 0,
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control) {
			control.copyKeybindingCommand(control.activeKeybindingEntry);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
	primary: KeyCode.DownArrow,
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control) {
			control.focusKeybindings();
		}
	}
});

class PreferencesActionsContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IWorkspaceContextService private readonly workpsaceContextService: IWorkspaceContextService
	) {
		super();
		MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: {
				id: OpenGlobalKeybindingsAction.ID,
				title: OpenGlobalKeybindingsAction.LABEL,
				iconLocation: {
					light: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/preferences-editor.svg`)),
					dark: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/preferences-editor-inverse.svg`))
				}
			},
			when: ResourceContextKey.Resource.isEqualTo(URI.file(environmentService.appKeybindingsPath).toString()),
			group: 'navigation',
			order: 1
		});

		const commandId = '_workbench.openUserSettingsEditor';
		CommandsRegistry.registerCommand(commandId, () => this.preferencesService.openGlobalSettings(false));
		MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: {
				id: commandId,
				title: OpenSettings2Action.LABEL,
				iconLocation: {
					light: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/preferences-editor.svg`)),
					dark: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/preferences-editor-inverse.svg`))
				}
			},
			when: ResourceContextKey.Resource.isEqualTo(URI.file(environmentService.appSettingsPath).toString()),
			group: 'navigation',
			order: 1
		});


		this.updatePreferencesEditorMenuItem();
		this._register(workpsaceContextService.onDidChangeWorkbenchState(() => this.updatePreferencesEditorMenuItem()));
		this._register(workpsaceContextService.onDidChangeWorkspaceFolders(() => this.updatePreferencesEditorMenuItemForWorkspaceFolders()));
	}

	private updatePreferencesEditorMenuItem() {
		const commandId = '_workbench.openWorkspaceSettingsEditor';
		if (this.workpsaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && !CommandsRegistry.getCommand(commandId)) {
			CommandsRegistry.registerCommand(commandId, () => this.preferencesService.openWorkspaceSettings(false));
			MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
				command: {
					id: commandId,
					title: OpenSettings2Action.LABEL,
					iconLocation: {
						light: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/preferences-editor.svg`)),
						dark: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/preferences-editor-inverse.svg`))
					}
				},
				when: ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(this.preferencesService.workspaceSettingsResource.toString()), new RawContextKey<string>('workbenchState', '').isEqualTo('workspace')),
				group: 'navigation',
				order: 1
			});
		}
		this.updatePreferencesEditorMenuItemForWorkspaceFolders();
	}

	private updatePreferencesEditorMenuItemForWorkspaceFolders() {
		for (const folder of this.workpsaceContextService.getWorkspace().folders) {
			const commandId = `_workbench.openFolderSettings.${folder.uri.toString()}`;
			if (!CommandsRegistry.getCommand(commandId)) {
				CommandsRegistry.registerCommand(commandId, () => {
					if (this.workpsaceContextService.getWorkbenchState() === WorkbenchState.FOLDER) {
						return this.preferencesService.openWorkspaceSettings(false);
					} else {
						return this.preferencesService.openFolderSettings(folder.uri, false);
					}
				});
				MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
					command: {
						id: commandId,
						title: OpenSettings2Action.LABEL,
						iconLocation: {
							light: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/preferences-editor.svg`)),
							dark: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/preferences-editor-inverse.svg`))
						}
					},
					when: ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(this.preferencesService.getFolderSettingsResource(folder.uri).toString())),
					group: 'navigation',
					order: 1
				});
			}
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(PreferencesActionsContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(PreferencesContribution, LifecyclePhase.Starting);

CommandsRegistry.registerCommand(OPEN_FOLDER_SETTINGS_COMMAND, function (accessor: ServicesAccessor, resource: URI) {
	const preferencesService = accessor.get(IPreferencesService);
	return preferencesService.openFolderSettings(resource);
});

CommandsRegistry.registerCommand(OpenFolderSettingsAction.ID, serviceAccessor => {
	serviceAccessor.get(IInstantiationService).createInstance(OpenFolderSettingsAction, OpenFolderSettingsAction.ID, OpenFolderSettingsAction.LABEL).run();
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: OpenFolderSettingsAction.ID,
		title: { value: `${category}: ${OpenFolderSettingsAction.LABEL}`, original: 'Preferences: Open Folder Settings' },
	},
	when: new RawContextKey<string>('workbenchState', '').isEqualTo('workspace')
});

CommandsRegistry.registerCommand(OpenWorkspaceSettingsAction.ID, serviceAccessor => {
	serviceAccessor.get(IInstantiationService).createInstance(OpenWorkspaceSettingsAction, OpenWorkspaceSettingsAction.ID, OpenWorkspaceSettingsAction.LABEL).run();
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: OpenWorkspaceSettingsAction.ID,
		title: { value: `${category}: ${OpenWorkspaceSettingsAction.LABEL}`, original: 'Preferences: Open Workspace Settings' },
	},
	when: new RawContextKey<string>('workbenchState', '').notEqualsTo('empty')
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
	primary: KeyCode.Escape,
	handler: (accessor, args: any) => {
		const control = accessor.get(IEditorService).activeControl as IKeybindingsEditor;
		if (control) {
			control.clearSearchResults();
		}
	}
});

CommandsRegistry.registerCommand(OpenGlobalKeybindingsFileAction.ID, serviceAccessor => {
	serviceAccessor.get(IInstantiationService).createInstance(OpenGlobalKeybindingsFileAction, OpenGlobalKeybindingsFileAction.ID, OpenGlobalKeybindingsFileAction.LABEL).run();
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: OpenGlobalKeybindingsFileAction.ID,
		title: OpenGlobalKeybindingsFileAction.LABEL,
		iconLocation: {
			light: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/edit-json.svg`)),
			dark: URI.parse(require.toUrl(`vs/workbench/parts/preferences/electron-browser/media/edit-json-inverse.svg`))
		}
	},
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
	group: 'navigation',
});

CommandsRegistry.registerCommand(KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS, serviceAccessor => {
	const control = serviceAccessor.get(IEditorService).activeControl as IKeybindingsEditor;
	if (control) {
		control.search('@source:default');
	}
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS,
		title: nls.localize('showDefaultKeybindings', "Show Default Keybindings")
	},
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
	group: '1_keyboard_preferences_actions'
});

CommandsRegistry.registerCommand(KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS, serviceAccessor => {
	const control = serviceAccessor.get(IEditorService).activeControl as IKeybindingsEditor;
	if (control) {
		control.search('@source:user');
	}
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS,
		title: nls.localize('showUserKeybindings', "Show User Keybindings")
	},
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
	group: '1_keyboard_preferences_actions'
});

abstract class SettingsCommand extends Command {

	protected getPreferencesEditor(accessor: ServicesAccessor): PreferencesEditor | SettingsEditor2 {
		const activeControl = accessor.get(IEditorService).activeControl;
		if (activeControl instanceof PreferencesEditor || activeControl instanceof SettingsEditor2) {
			return activeControl;
		}

		return null;
	}

}
class StartSearchDefaultSettingsCommand extends SettingsCommand {

	runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor) {
			preferencesEditor.focusSearch();
		}
	}
}
const startSearchCommand = new StartSearchDefaultSettingsCommand({
	id: SETTINGS_EDITOR_COMMAND_SEARCH,
	precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR),
	kbOpts: { primary: KeyMod.CtrlCmd | KeyCode.KEY_F, weight: KeybindingWeight.EditorContrib }
});
startSearchCommand.register();

class ClearSearchResultsCommand extends SettingsCommand {

	runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor) {
			preferencesEditor.clearSearchResults();
		}
	}
}
const clearSearchResultsCommand = new ClearSearchResultsCommand({
	id: SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyCode.Escape, weight: KeybindingWeight.EditorContrib }
});
clearSearchResultsCommand.register();

class FocusSettingsFileEditorCommand extends SettingsCommand {

	runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor instanceof PreferencesEditor) {
			preferencesEditor.focusSettingsFileEditor();
		} else {
			preferencesEditor.focusSettings();
		}
	}
}
const focusSettingsFileEditorCommand = new FocusSettingsFileEditorCommand({
	id: SETTINGS_EDITOR_COMMAND_FOCUS_FILE,
	precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
	kbOpts: { primary: KeyCode.DownArrow, weight: KeybindingWeight.EditorContrib }
});
focusSettingsFileEditorCommand.register();

const focusSettingsFromSearchCommand = new FocusSettingsFileEditorCommand({
	id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH,
	precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
	kbOpts: { primary: KeyCode.DownArrow, weight: KeybindingWeight.WorkbenchContrib }
});
focusSettingsFromSearchCommand.register();

class FocusNextSearchResultCommand extends SettingsCommand {

	runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor instanceof PreferencesEditor) {
			preferencesEditor.focusNextResult();
		}
	}
}
const focusNextSearchResultCommand = new FocusNextSearchResultCommand({
	id: SETTINGS_EDITOR_COMMAND_FOCUS_NEXT_SETTING,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyCode.Enter, weight: KeybindingWeight.EditorContrib }
});
focusNextSearchResultCommand.register();

class FocusPreviousSearchResultCommand extends SettingsCommand {

	runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor instanceof PreferencesEditor) {
			preferencesEditor.focusPreviousResult();
		}
	}
}
const focusPreviousSearchResultCommand = new FocusPreviousSearchResultCommand({
	id: SETTINGS_EDITOR_COMMAND_FOCUS_PREVIOUS_SETTING,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyMod.Shift | KeyCode.Enter, weight: KeybindingWeight.EditorContrib }
});
focusPreviousSearchResultCommand.register();

class EditFocusedSettingCommand extends SettingsCommand {

	runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor instanceof PreferencesEditor) {
			preferencesEditor.editFocusedPreference();
		}
	}
}
const editFocusedSettingCommand = new EditFocusedSettingCommand({
	id: SETTINGS_EDITOR_COMMAND_EDIT_FOCUSED_SETTING,
	precondition: CONTEXT_SETTINGS_SEARCH_FOCUS,
	kbOpts: { primary: KeyMod.CtrlCmd | KeyCode.US_DOT, weight: KeybindingWeight.EditorContrib }
});
editFocusedSettingCommand.register();

class FocusSettingsListCommand extends SettingsCommand {

	runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor instanceof SettingsEditor2) {
			preferencesEditor.focusSettings();
		}
	}
}

const focusSettingsListCommand = new FocusSettingsListCommand({
	id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST,
	precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_TOC_ROW_FOCUS),
	kbOpts: { primary: KeyCode.Enter, weight: KeybindingWeight.WorkbenchContrib }
});
focusSettingsListCommand.register();

class ShowContextMenuCommand extends SettingsCommand {
	runCommand(accessor: ServicesAccessor, args: any): void {
		const preferencesEditor = this.getPreferencesEditor(accessor);
		if (preferencesEditor instanceof SettingsEditor2) {
			preferencesEditor.showContextMenu();
		}
	}
}

const showContextMenuCommand = new ShowContextMenuCommand({
	id: SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU,
	precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR),
	kbOpts: { primary: KeyMod.Shift | KeyCode.F9, weight: KeybindingWeight.WorkbenchContrib }
});
showContextMenuCommand.register();

CommandsRegistry.registerCommand(SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON, serviceAccessor => {
	const control = serviceAccessor.get(IEditorService).activeControl as SettingsEditor2;
	if (control instanceof SettingsEditor2) {
		return control.switchToSettingsFile();
	}

	return Promise.resolve(null);
});

CommandsRegistry.registerCommand(SETTINGS_EDITOR_COMMAND_FILTER_MODIFIED, serviceAccessor => {
	const control = serviceAccessor.get(IEditorService).activeControl as SettingsEditor2;
	if (control instanceof SettingsEditor2) {
		control.focusSearch(`@${MODIFIED_SETTING_TAG}`);
	}
});

CommandsRegistry.registerCommand(SETTINGS_EDITOR_COMMAND_FILTER_ONLINE, serviceAccessor => {
	const control = serviceAccessor.get(IEditorService).activeControl as SettingsEditor2;
	if (control instanceof SettingsEditor2) {
		control.focusSearch(`@tag:usesOnlineServices`);
	}
});

// Preferences menu

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '1_settings',
	command: {
		id: SETTINGS_COMMAND_OPEN_SETTINGS,
		title: nls.localize({ key: 'miOpenSettings', comment: ['&& denotes a mnemonic'] }, "&&Settings")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '2_keybindings',
	command: {
		id: OpenGlobalKeybindingsAction.ID,
		title: nls.localize({ key: 'miOpenKeymap', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts")
	},
	order: 1
});

// Editor tool items

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON,
		title: nls.localize('openSettingsJson', "Open Settings (JSON)"),
		iconLocation: {
			dark: URI.parse(require.toUrl('vs/workbench/parts/preferences/electron-browser/media/edit-json-inverse.svg')),
			light: URI.parse(require.toUrl('vs/workbench/parts/preferences/electron-browser/media/edit-json.svg'))
		}
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		CONTEXT_SETTINGS_EDITOR,
		CONTEXT_SETTINGS_JSON_EDITOR.toNegated()
	)
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: SETTINGS_EDITOR_COMMAND_FILTER_MODIFIED,
		title: nls.localize('filterModifiedLabel', "Show modified settings")
	},
	group: '1_filter',
	order: 1,
	when: ContextKeyExpr.and(
		CONTEXT_SETTINGS_EDITOR,
		CONTEXT_SETTINGS_JSON_EDITOR.toNegated()
	)
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: SETTINGS_EDITOR_COMMAND_FILTER_ONLINE,
		title: nls.localize('filterOnlineServicesLabel', "Show settings for online services"),
	},
	group: '1_filter',
	order: 2,
	when: ContextKeyExpr.and(
		CONTEXT_SETTINGS_EDITOR,
		CONTEXT_SETTINGS_JSON_EDITOR.toNegated()
	)
});
