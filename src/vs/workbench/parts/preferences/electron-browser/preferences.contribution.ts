/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!../browser/media/preferences';
import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { EditorInput, IEditorInputFactory, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions } from 'vs/workbench/common/editor';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { PreferencesEditor } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { SettingsEditor2 } from 'vs/workbench/parts/preferences/browser/settingsEditor2';
import { DefaultPreferencesEditorInput, PreferencesEditorInput, KeybindingsEditorInput, SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { KeybindingsEditor } from 'vs/workbench/parts/preferences/browser/keybindingsEditor';
import { OpenDefaultKeybindingsFileAction, OpenRawDefaultSettingsAction, OpenSettingsAction, OpenGlobalSettingsAction, OpenGlobalKeybindingsFileAction, OpenWorkspaceSettingsAction, OpenFolderSettingsAction, ConfigureLanguageBasedSettingsAction, OPEN_FOLDER_SETTINGS_COMMAND, OpenGlobalKeybindingsAction, OpenSettings2Action, OpenSettingsJsonAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import {
	IKeybindingsEditor, IPreferencesSearchService, CONTEXT_KEYBINDING_FOCUS, CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_SEARCH, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE,
	KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SEARCH, CONTEXT_SETTINGS_EDITOR, SETTINGS_EDITOR_COMMAND_FOCUS_FILE, CONTEXT_SETTINGS_SEARCH_FOCUS, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_FOCUS_NEXT_SETTING, SETTINGS_EDITOR_COMMAND_FOCUS_PREVIOUS_SETTING, SETTINGS_EDITOR_COMMAND_EDIT_FOCUSED_SETTING, SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH, CONTEXT_TOC_ROW_FOCUS, SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU
} from 'vs/workbench/parts/preferences/common/preferences';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { PreferencesContribution } from 'vs/workbench/parts/preferences/common/preferencesContribution';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { PreferencesSearchService } from 'vs/workbench/parts/preferences/electron-browser/preferencesSearch';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { Command } from 'vs/editor/browser/editorExtensions';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/suggest';

registerSingleton(IPreferencesSearchService, PreferencesSearchService);

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

	public serialize(editorInput: EditorInput): string {
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

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
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

	public serialize(editorInput: EditorInput): string {
		const input = <KeybindingsEditorInput>editorInput;
		return JSON.stringify({
			name: input.getName(),
			typeId: input.getTypeId()
		});
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		return instantiationService.createInstance(KeybindingsEditorInput);
	}
}

interface ISerializedSettingsEditor2EditorInput {
}

class SettingsEditor2InputFactory implements IEditorInputFactory {

	public serialize(input: SettingsEditor2Input): string {
		const serialized: ISerializedSettingsEditor2EditorInput = {
		};

		return JSON.stringify(serialized);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): SettingsEditor2Input {
		return instantiationService.createInstance(
			SettingsEditor2Input);
	}
}

interface ISerializedDefaultPreferencesEditorInput {
	resource: string;
}

// Register Default Preferences Editor Input Factory
class DefaultPreferencesEditorInputFactory implements IEditorInputFactory {

	public serialize(editorInput: EditorInput): string {
		const input = <DefaultPreferencesEditorInput>editorInput;

		const serialized: ISerializedDefaultPreferencesEditorInput = { resource: input.getResource().toString() };

		return JSON.stringify(serialized);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
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
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenSettingsAction, OpenSettingsAction.ID, OpenSettingsAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_COMMA }), 'Preferences: Open Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenSettingsJsonAction, OpenSettingsJsonAction.ID, OpenSettingsJsonAction.LABEL), 'Preferences: Open Settings (JSON)', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenSettings2Action, OpenSettings2Action.ID, OpenSettings2Action.LABEL), 'Preferences: Open Settings (UI)', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL), 'Preferences: Open User Settings', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsAction, OpenGlobalKeybindingsAction.ID, OpenGlobalKeybindingsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_S) }), 'Preferences: Open Keyboard Shortcuts', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDefaultKeybindingsFileAction, OpenDefaultKeybindingsFileAction.ID, OpenDefaultKeybindingsFileAction.LABEL), 'Preferences: Open Default Keyboard Shortcuts File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsFileAction, OpenGlobalKeybindingsFileAction.ID, OpenGlobalKeybindingsFileAction.LABEL, { primary: null }), 'Preferences: Open Keyboard Shortcuts File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureLanguageBasedSettingsAction, ConfigureLanguageBasedSettingsAction.ID, ConfigureLanguageBasedSettingsAction.LABEL), 'Preferences: Configure Language Specific Settings...', category);

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
	primary: null,
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
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
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
	primary: null,
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
	primary: null,
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

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(PreferencesContribution, LifecyclePhase.Starting);

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

	public runCommand(accessor: ServicesAccessor, args: any): void {
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

	public runCommand(accessor: ServicesAccessor, args: any): void {
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

	public runCommand(accessor: ServicesAccessor, args: any): void {
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

	public runCommand(accessor: ServicesAccessor, args: any): void {
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

	public runCommand(accessor: ServicesAccessor, args: any): void {
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

	public runCommand(accessor: ServicesAccessor, args: any): void {
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

	public runCommand(accessor: ServicesAccessor, args: any): void {
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
	public runCommand(accessor: ServicesAccessor, args: any): void {
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

// Preferences menu

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '1_settings',
	command: {
		id: OpenSettingsAction.ID,
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
