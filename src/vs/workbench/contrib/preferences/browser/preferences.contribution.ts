/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isBoolean, isObject, isString } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/preferences';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/browser/suggest';
import * as nls from 'vs/nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, IsMacNativeContext } from 'vs/platform/contextkey/common/contextkeys';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILabelService } from 'vs/platform/label/common/label';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ResourceContextKey, RemoteNameContext, WorkbenchStateContext } from 'vs/workbench/common/contextkeys';
import { ExplorerFolderContext, ExplorerRootContext } from 'vs/workbench/contrib/files/common/files';
import { KeybindingsEditor } from 'vs/workbench/contrib/preferences/browser/keybindingsEditor';
import { ConfigureLanguageBasedSettingsAction } from 'vs/workbench/contrib/preferences/browser/preferencesActions';
import { SettingsEditorContribution } from 'vs/workbench/contrib/preferences/browser/preferencesEditor';
import { preferencesOpenSettingsIcon } from 'vs/workbench/contrib/preferences/browser/preferencesIcons';
import { SettingsEditor2, SettingsFocusContext } from 'vs/workbench/contrib/preferences/browser/settingsEditor2';
import { CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDING_FOCUS, CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_JSON_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, CONTEXT_WHEN_FOCUS, KEYBINDINGS_EDITOR_COMMAND_ACCEPT_WHEN, KEYBINDINGS_EDITOR_COMMAND_ADD, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_HISTORY, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN, KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_REJECT_WHEN, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_SEARCH, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS, KEYBINDINGS_EDITOR_SHOW_EXTENSION_KEYBINDINGS, KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU } from 'vs/workbench/contrib/preferences/common/preferences';
import { PreferencesContribution } from 'vs/workbench/contrib/preferences/common/preferencesContribution';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { KeybindingsEditorInput } from 'vs/workbench/services/preferences/browser/keybindingsEditorInput';
import { DEFINE_KEYBINDING_EDITOR_CONTRIB_ID, IDefineKeybindingEditorContribution, IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { IUserDataProfileService, CURRENT_PROFILE_CONTEXT } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';

const SETTINGS_EDITOR_COMMAND_SEARCH = 'settings.action.search';

const SETTINGS_EDITOR_COMMAND_FOCUS_FILE = 'settings.action.focusSettingsFile';
const SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH = 'settings.action.focusSettingsFromSearch';
const SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST = 'settings.action.focusSettingsList';
const SETTINGS_EDITOR_COMMAND_FOCUS_TOC = 'settings.action.focusTOC';
const SETTINGS_EDITOR_COMMAND_FOCUS_CONTROL = 'settings.action.focusSettingControl';
const SETTINGS_EDITOR_COMMAND_FOCUS_UP = 'settings.action.focusLevelUp';

const SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON = 'settings.switchToJSON';
const SETTINGS_EDITOR_COMMAND_FILTER_ONLINE = 'settings.filterByOnline';
const SETTINGS_EDITOR_COMMAND_FILTER_UNTRUSTED = 'settings.filterUntrusted';

const SETTINGS_COMMAND_OPEN_SETTINGS = 'workbench.action.openSettings';
const SETTINGS_COMMAND_FILTER_TELEMETRY = 'settings.filterByTelemetry';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		SettingsEditor2,
		SettingsEditor2.ID,
		nls.localize('settingsEditor2', "Settings Editor 2")
	),
	[
		new SyncDescriptor(SettingsEditor2Input)
	]
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		KeybindingsEditor,
		KeybindingsEditor.ID,
		nls.localize('keybindingsEditor', "Keybindings Editor")
	),
	[
		new SyncDescriptor(KeybindingsEditorInput)
	]
);

class KeybindingsEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): EditorInput {
		return instantiationService.createInstance(KeybindingsEditorInput);
	}
}

class SettingsEditor2InputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(input: SettingsEditor2Input): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): SettingsEditor2Input {
		return instantiationService.createInstance(SettingsEditor2Input);
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(KeybindingsEditorInput.ID, KeybindingsEditorInputSerializer);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(SettingsEditor2Input.ID, SettingsEditor2InputSerializer);

const OPEN_USER_SETTINGS_UI_TITLE = { value: nls.localize('openSettings2', "Open Settings (UI)"), original: 'Open Settings (UI)' };
const OPEN_USER_SETTINGS_JSON_TITLE = { value: nls.localize('openUserSettingsJson', "Open User Settings (JSON)"), original: 'Open User Settings (JSON)' };
const OPEN_APPLICATION_SETTINGS_JSON_TITLE = { value: nls.localize('openApplicationSettingsJson', "Open Application Settings (JSON)"), original: 'Open Application Settings (JSON)' };
const category = { value: nls.localize('preferences', "Preferences"), original: 'Preferences' };

interface IOpenSettingsActionOptions {
	openToSide?: boolean;
	query?: string;
	revealSetting?: {
		key: string;
		edit?: boolean;
	};
	focusSearch?: boolean;
}

function sanitizeBoolean(arg: any): boolean | undefined {
	return isBoolean(arg) ? arg : undefined;
}

function sanitizeString(arg: any): string | undefined {
	return isString(arg) ? arg : undefined;
}

function sanitizeOpenSettingsArgs(args: any): IOpenSettingsActionOptions {
	if (!isObject(args)) {
		args = {};
	}

	let sanitizedObject: IOpenSettingsActionOptions = {
		focusSearch: sanitizeBoolean(args?.focusSearch),
		openToSide: sanitizeBoolean(args?.openToSide),
		query: sanitizeString(args?.query)
	};

	if (isString(args?.revealSetting?.key)) {
		sanitizedObject = {
			...sanitizedObject,
			revealSetting: {
				key: args.revealSetting.key,
				edit: sanitizeBoolean(args.revealSetting?.edit)
			}
		};
	}

	return sanitizedObject;
}

class PreferencesActionsContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();

		this.registerSettingsActions();
		this.registerKeybindingsActions();

		this.updatePreferencesEditorMenuItem();
		this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.updatePreferencesEditorMenuItem()));
		this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.updatePreferencesEditorMenuItemForWorkspaceFolders()));
	}

	private registerSettingsActions() {
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_COMMAND_OPEN_SETTINGS,
					title: {
						value: nls.localize('settings', "Settings"),
						mnemonicTitle: nls.localize({ key: 'miOpenSettings', comment: ['&& denotes a mnemonic'] }, "&&Settings"),
						original: 'Settings'
					},
					keybinding: {
						weight: KeybindingWeight.WorkbenchContrib,
						when: null,
						primary: KeyMod.CtrlCmd | KeyCode.Comma,
					},
					menu: [{
						id: MenuId.GlobalActivity,
						group: '2_configuration',
						order: 1
					}, {
						id: MenuId.MenubarPreferencesMenu,
						group: '2_configuration',
						order: 1
					}],
				});
			}
			run(accessor: ServicesAccessor, args: string | IOpenSettingsActionOptions) {
				// args takes a string for backcompat
				const opts = typeof args === 'string' ? { query: args } : sanitizeOpenSettingsArgs(args);
				return accessor.get(IPreferencesService).openSettings(opts);
			}
		}));
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openSettings2',
					title: { value: nls.localize('openSettings2', "Open Settings (UI)"), original: 'Open Settings (UI)' },
					category,
					f1: true,
				});
			}
			run(accessor: ServicesAccessor, args: IOpenSettingsActionOptions) {
				args = sanitizeOpenSettingsArgs(args);
				return accessor.get(IPreferencesService).openSettings({ jsonEditor: false, ...args });
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openSettingsJson',
					title: OPEN_USER_SETTINGS_JSON_TITLE,
					category,
					f1: true,
				});
			}
			run(accessor: ServicesAccessor, args: IOpenSettingsActionOptions) {
				args = sanitizeOpenSettingsArgs(args);
				return accessor.get(IPreferencesService).openSettings({ jsonEditor: true, ...args });
			}
		});

		const that = this;
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openApplicationSettingsJson',
					title: OPEN_APPLICATION_SETTINGS_JSON_TITLE,
					category,
					menu: {
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.notEquals(CURRENT_PROFILE_CONTEXT.key, that.userDataProfilesService.defaultProfile.id)
					}
				});
			}
			run(accessor: ServicesAccessor, args: IOpenSettingsActionOptions) {
				args = sanitizeOpenSettingsArgs(args);
				return accessor.get(IPreferencesService).openApplicationSettings({ jsonEditor: true, ...args });
			}
		});

		// Opens the User tab of the Settings editor
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openGlobalSettings',
					title: { value: nls.localize('openGlobalSettings', "Open User Settings"), original: 'Open User Settings' },
					category,
					f1: true,
				});
			}
			run(accessor: ServicesAccessor, args: IOpenSettingsActionOptions) {
				args = sanitizeOpenSettingsArgs(args);
				return accessor.get(IPreferencesService).openUserSettings(args);
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openRawDefaultSettings',
					title: { value: nls.localize('openRawDefaultSettings', "Open Default Settings (JSON)"), original: 'Open Default Settings (JSON)' },
					category,
					f1: true,
				});
			}
			run(accessor: ServicesAccessor) {
				return accessor.get(IPreferencesService).openRawDefaultSettings();
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: ConfigureLanguageBasedSettingsAction.ID,
					title: ConfigureLanguageBasedSettingsAction.LABEL,
					category,
					f1: true,
				});
			}
			run(accessor: ServicesAccessor) {
				return accessor.get(IInstantiationService).createInstance(ConfigureLanguageBasedSettingsAction, ConfigureLanguageBasedSettingsAction.ID, ConfigureLanguageBasedSettingsAction.LABEL.value).run();
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openWorkspaceSettings',
					title: { value: nls.localize('openWorkspaceSettings', "Open Workspace Settings"), original: 'Open Workspace Settings' },
					category,
					menu: {
						id: MenuId.CommandPalette,
						when: WorkbenchStateContext.notEqualsTo('empty')
					}
				});
			}
			run(accessor: ServicesAccessor, args?: string | IOpenSettingsActionOptions) {
				// Match the behaviour of workbench.action.openSettings
				args = typeof args === 'string' ? { query: args } : sanitizeOpenSettingsArgs(args);
				return accessor.get(IPreferencesService).openWorkspaceSettings(args);
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openAccessibilitySettings',
					title: { value: nls.localize('openAccessibilitySettings', "Open Accessibility Settings"), original: 'Open Accessibility Settings' },
					category,
					menu: {
						id: MenuId.CommandPalette,
						when: WorkbenchStateContext.notEqualsTo('empty')
					}
				});
			}
			async run(accessor: ServicesAccessor) {
				await accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@tag:accessibility' });
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openWorkspaceSettingsFile',
					title: { value: nls.localize('openWorkspaceSettingsFile', "Open Workspace Settings (JSON)"), original: 'Open Workspace Settings (JSON)' },
					category,
					menu: {
						id: MenuId.CommandPalette,
						when: WorkbenchStateContext.notEqualsTo('empty')
					}
				});
			}
			run(accessor: ServicesAccessor, args?: IOpenSettingsActionOptions) {
				args = sanitizeOpenSettingsArgs(args);
				return accessor.get(IPreferencesService).openWorkspaceSettings({ jsonEditor: true, ...args });
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openFolderSettings',
					title: { value: nls.localize('openFolderSettings', "Open Folder Settings"), original: 'Open Folder Settings' },
					category,
					menu: {
						id: MenuId.CommandPalette,
						when: WorkbenchStateContext.isEqualTo('workspace')
					}
				});
			}
			async run(accessor: ServicesAccessor, args?: IOpenSettingsActionOptions) {
				const commandService = accessor.get(ICommandService);
				const preferencesService = accessor.get(IPreferencesService);
				const workspaceFolder = await commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
				if (workspaceFolder) {
					args = sanitizeOpenSettingsArgs(args);
					await preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, ...args });
				}
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openFolderSettingsFile',
					title: { value: nls.localize('openFolderSettingsFile', "Open Folder Settings (JSON)"), original: 'Open Folder Settings (JSON)' },
					category,
					menu: {
						id: MenuId.CommandPalette,
						when: WorkbenchStateContext.isEqualTo('workspace')
					}
				});
			}
			async run(accessor: ServicesAccessor, args?: IOpenSettingsActionOptions) {
				const commandService = accessor.get(ICommandService);
				const preferencesService = accessor.get(IPreferencesService);
				const workspaceFolder = await commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
				if (workspaceFolder) {
					args = sanitizeOpenSettingsArgs(args);
					await preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, jsonEditor: true, ...args });
				}
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: '_workbench.action.openFolderSettings',
					title: { value: nls.localize('openFolderSettings', "Open Folder Settings"), original: 'Open Folder Settings' },
					category,
					menu: {
						id: MenuId.ExplorerContext,
						group: '2_workspace',
						order: 20,
						when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext)
					}
				});
			}
			run(accessor: ServicesAccessor, resource: URI) {
				return accessor.get(IPreferencesService).openFolderSettings({ folderUri: resource });
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_FILTER_ONLINE,
					title: nls.localize({ key: 'miOpenOnlineSettings', comment: ['&& denotes a mnemonic'] }, "&&Online Services Settings"),
					menu: {
						id: MenuId.MenubarPreferencesMenu,
						group: '3_settings',
						order: 1,
					}
				});
			}
			run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof SettingsEditor2) {
					editorPane.focusSearch(`@tag:usesOnlineServices`);
				} else {
					accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@tag:usesOnlineServices' });
				}
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_FILTER_UNTRUSTED,
					title: { value: nls.localize('filterUntrusted', "Show untrusted workspace settings"), original: 'Show untrusted workspace settings' },
				});
			}
			run(accessor: ServicesAccessor) {
				accessor.get(IPreferencesService).openWorkspaceSettings({ jsonEditor: false, query: `@tag:${REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG}` });
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_COMMAND_FILTER_TELEMETRY,
					title: nls.localize({ key: 'miOpenTelemetrySettings', comment: ['&& denotes a mnemonic'] }, "&&Telemetry Settings")
				});
			}
			run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof SettingsEditor2) {
					editorPane.focusSearch(`@tag:telemetry`);
				} else {
					accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@tag:telemetry' });
				}
			}
		});

		this.registerSettingsEditorActions();

		this.extensionService.whenInstalledExtensionsRegistered()
			.then(() => {
				const remoteAuthority = this.environmentService.remoteAuthority;
				const hostLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority) || remoteAuthority;
				const label = nls.localize('openRemoteSettings', "Open Remote Settings ({0})", hostLabel);
				registerAction2(class extends Action2 {
					constructor() {
						super({
							id: 'workbench.action.openRemoteSettings',
							title: { value: label, original: `Open Remote Settings (${hostLabel})` },
							category,
							menu: {
								id: MenuId.CommandPalette,
								when: RemoteNameContext.notEqualsTo('')
							}
						});
					}
					run(accessor: ServicesAccessor, args?: IOpenSettingsActionOptions) {
						args = sanitizeOpenSettingsArgs(args);
						return accessor.get(IPreferencesService).openRemoteSettings(args);
					}
				});
				const jsonLabel = nls.localize('openRemoteSettingsJSON', "Open Remote Settings (JSON) ({0})", hostLabel);
				registerAction2(class extends Action2 {
					constructor() {
						super({
							id: 'workbench.action.openRemoteSettingsFile',
							title: { value: jsonLabel, original: `Open Remote Settings (JSON) (${hostLabel})` },
							category,
							menu: {
								id: MenuId.CommandPalette,
								when: RemoteNameContext.notEqualsTo('')
							}
						});
					}
					run(accessor: ServicesAccessor, args?: IOpenSettingsActionOptions) {
						args = sanitizeOpenSettingsArgs(args);
						return accessor.get(IPreferencesService).openRemoteSettings({ jsonEditor: true, ...args });
					}
				});
			});
	}

	private registerSettingsEditorActions() {
		function getPreferencesEditor(accessor: ServicesAccessor): SettingsEditor2 | null {
			const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
			if (activeEditorPane instanceof SettingsEditor2) {
				return activeEditorPane;
			}
			return null;
		}

		function settingsEditorFocusSearch(accessor: ServicesAccessor) {
			const preferencesEditor = getPreferencesEditor(accessor);
			preferencesEditor?.focusSearch();
		}

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_SEARCH,
					precondition: CONTEXT_SETTINGS_EDITOR,
					keybinding: {
						primary: KeyMod.CtrlCmd | KeyCode.KeyF,
						weight: KeybindingWeight.EditorContrib,
						when: null
					},
					category,
					f1: true,
					title: { value: nls.localize('settings.focusSearch', "Focus Settings Search"), original: 'Focus Settings Search' }
				});
			}

			run(accessor: ServicesAccessor) { settingsEditorFocusSearch(accessor); }
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
					precondition: CONTEXT_SETTINGS_EDITOR,
					keybinding: {
						primary: KeyCode.Escape,
						weight: KeybindingWeight.EditorContrib,
						when: CONTEXT_SETTINGS_SEARCH_FOCUS
					},
					category,
					f1: true,
					title: { value: nls.localize('settings.clearResults', "Clear Settings Search Results"), original: 'Clear Settings Search Results' }
				});
			}

			run(accessor: ServicesAccessor) {
				const preferencesEditor = getPreferencesEditor(accessor);
				preferencesEditor?.clearSearchResults();
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_FOCUS_FILE,
					precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
					keybinding: {
						primary: KeyCode.DownArrow,
						weight: KeybindingWeight.EditorContrib,
						when: null
					},
					title: nls.localize('settings.focusFile', "Focus settings file")
				});
			}

			run(accessor: ServicesAccessor, args: any): void {
				const preferencesEditor = getPreferencesEditor(accessor);
				preferencesEditor?.focusSettings();
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH,
					precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
					keybinding: {
						primary: KeyCode.DownArrow,
						weight: KeybindingWeight.WorkbenchContrib,
						when: null
					},
					title: nls.localize('settings.focusFile', "Focus settings file")
				});
			}

			run(accessor: ServicesAccessor, args: any): void {
				const preferencesEditor = getPreferencesEditor(accessor);
				preferencesEditor?.focusSettings();
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST,
					precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_TOC_ROW_FOCUS),
					keybinding: {
						primary: KeyCode.Enter,
						weight: KeybindingWeight.WorkbenchContrib,
						when: null
					},
					title: nls.localize('settings.focusSettingsList', "Focus settings list")
				});
			}

			run(accessor: ServicesAccessor): void {
				const preferencesEditor = getPreferencesEditor(accessor);
				if (preferencesEditor instanceof SettingsEditor2) {
					preferencesEditor.focusSettings();
				}
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_FOCUS_TOC,
					precondition: CONTEXT_SETTINGS_EDITOR,
					f1: true,
					keybinding: [
						{
							primary: KeyCode.LeftArrow,
							weight: KeybindingWeight.WorkbenchContrib,
							when: CONTEXT_SETTINGS_ROW_FOCUS
						}],
					category,
					title: { value: nls.localize('settings.focusSettingsTOC', "Focus Settings Table of Contents"), original: 'Focus Settings Table of Contents' }
				});
			}

			run(accessor: ServicesAccessor): void {
				const preferencesEditor = getPreferencesEditor(accessor);
				if (!(preferencesEditor instanceof SettingsEditor2)) {
					return;
				}

				preferencesEditor.focusTOC();
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_FOCUS_CONTROL,
					precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS),
					keybinding: {
						primary: KeyCode.Enter,
						weight: KeybindingWeight.WorkbenchContrib,
					},
					title: nls.localize('settings.focusSettingControl', "Focus Setting Control")
				});
			}

			run(accessor: ServicesAccessor): void {
				const preferencesEditor = getPreferencesEditor(accessor);
				if (!(preferencesEditor instanceof SettingsEditor2)) {
					return;
				}

				if (document.activeElement?.classList.contains('monaco-list')) {
					preferencesEditor.focusSettings(true);
				}
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU,
					precondition: CONTEXT_SETTINGS_EDITOR,
					keybinding: {
						primary: KeyMod.Shift | KeyCode.F9,
						weight: KeybindingWeight.WorkbenchContrib,
						when: null
					},
					f1: true,
					category,
					title: { value: nls.localize('settings.showContextMenu', "Show Setting Context Menu"), original: 'Show Setting Context Menu' }
				});
			}

			run(accessor: ServicesAccessor): void {
				const preferencesEditor = getPreferencesEditor(accessor);
				if (preferencesEditor instanceof SettingsEditor2) {
					preferencesEditor.showContextMenu();
				}
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_FOCUS_UP,
					precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_SEARCH_FOCUS.toNegated(), CONTEXT_SETTINGS_JSON_EDITOR.toNegated()),
					keybinding: {
						primary: KeyCode.Escape,
						weight: KeybindingWeight.WorkbenchContrib,
						when: null
					},
					f1: true,
					category,
					title: { value: nls.localize('settings.focusLevelUp', "Move Focus Up One Level"), original: 'Move Focus Up One Level' }
				});
			}

			run(accessor: ServicesAccessor): void {
				const preferencesEditor = getPreferencesEditor(accessor);
				if (!(preferencesEditor instanceof SettingsEditor2)) {
					return;
				}

				if (preferencesEditor.currentFocusContext === SettingsFocusContext.SettingControl) {
					preferencesEditor.focusSettings();
				} else if (preferencesEditor.currentFocusContext === SettingsFocusContext.SettingTree) {
					preferencesEditor.focusTOC();
				} else if (preferencesEditor.currentFocusContext === SettingsFocusContext.TableOfContents) {
					preferencesEditor.focusSearch();
				}
			}
		});
	}

	private registerKeybindingsActions() {
		const that = this;
		const category = { value: nls.localize('preferences', "Preferences"), original: 'Preferences' };
		const id = 'workbench.action.openGlobalKeybindings';
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id,
					title: { value: nls.localize('openGlobalKeybindings', "Open Keyboard Shortcuts"), original: 'Open Keyboard Shortcuts' },
					shortTitle: nls.localize('keyboardShortcuts', "Keyboard Shortcuts"),
					category,
					icon: preferencesOpenSettingsIcon,
					keybinding: {
						when: null,
						weight: KeybindingWeight.WorkbenchContrib,
						primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyS)
					},
					menu: [
						{ id: MenuId.CommandPalette },
						{
							id: MenuId.EditorTitle,
							when: ResourceContextKey.Resource.isEqualTo(that.userDataProfileService.currentProfile.keybindingsResource.toString()),
							group: 'navigation',
							order: 1,
						},
						{
							id: MenuId.GlobalActivity,
							group: '2_configuration',
							order: 3
						}
					]
				});
			}
			run(accessor: ServicesAccessor, args: string | undefined) {
				const query = typeof args === 'string' ? args : undefined;
				return accessor.get(IPreferencesService).openGlobalKeybindingSettings(false, { query });
			}
		}));
		this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
			command: {
				id,
				title: nls.localize('keyboardShortcuts', "Keyboard Shortcuts"),
			},
			group: '2_configuration',
			order: 3
		}));
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openDefaultKeybindingsFile',
					title: { value: nls.localize('openDefaultKeybindingsFile', "Open Default Keyboard Shortcuts (JSON)"), original: 'Open Default Keyboard Shortcuts (JSON)' },
					category,
					menu: { id: MenuId.CommandPalette }
				});
			}
			run(accessor: ServicesAccessor) {
				return accessor.get(IPreferencesService).openDefaultKeybindingsFile();
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openGlobalKeybindingsFile',
					title: { value: nls.localize('openGlobalKeybindingsFile', "Open Keyboard Shortcuts (JSON)"), original: 'Open Keyboard Shortcuts (JSON)' },
					category,
					icon: preferencesOpenSettingsIcon,
					menu: [
						{ id: MenuId.CommandPalette },
						{
							id: MenuId.EditorTitle,
							when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
							group: 'navigation',
						}
					]
				});
			}
			run(accessor: ServicesAccessor) {
				return accessor.get(IPreferencesService).openGlobalKeybindingSettings(true);
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS,
					title: { value: nls.localize('showDefaultKeybindings', "Show System Keybindings"), original: 'Show System Keyboard Shortcuts' },
					menu: [
						{
							id: MenuId.EditorTitle,
							when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
							group: '1_keyboard_preferences_actions'
						}
					]
				});
			}
			run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.search('@source:system');
				}
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: KEYBINDINGS_EDITOR_SHOW_EXTENSION_KEYBINDINGS,
					title: { value: nls.localize('showExtensionKeybindings', "Show Extension Keybindings"), original: 'Show Extension Keyboard Shortcuts' },
					menu: [
						{
							id: MenuId.EditorTitle,
							when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
							group: '1_keyboard_preferences_actions'
						}
					]
				});
			}
			run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.search('@source:extension');
				}
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS,
					title: { value: nls.localize('showUserKeybindings', "Show User Keybindings"), original: 'Show User Keyboard Shortcuts' },
					menu: [
						{
							id: MenuId.EditorTitle,
							when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
							group: '1_keyboard_preferences_actions'
						}
					]
				});
			}
			run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.search('@source:user');
				}
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
					title: nls.localize('clear', "Clear Search Results"),
					keybinding: {
						weight: KeybindingWeight.WorkbenchContrib,
						when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
						primary: KeyCode.Escape,
					}
				});
			}
			run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.clearSearchResults();
				}
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_HISTORY,
					title: nls.localize('clearHistory', "Clear Keyboard Shortcuts Search History"),
					category,
					menu: [
						{
							id: MenuId.CommandPalette,
							when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
						}
					]
				});
			}
			run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.clearKeyboardShortcutSearchHistory();
				}
			}
		});

		this.registerKeybindingEditorActions();
	}

	private registerKeybindingEditorActions(): void {
		const that = this;

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, CONTEXT_WHEN_FOCUS.toNegated()),
			primary: KeyCode.Enter,
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.defineKeybinding(editorPane.activeKeybindingEntry!, false);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_ADD,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
			primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyA),
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.defineKeybinding(editorPane.activeKeybindingEntry!, true);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
			primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyE),
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor && editorPane.activeKeybindingEntry!.keybindingItem.keybinding) {
					editorPane.defineWhenExpression(editorPane.activeKeybindingEntry!);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, InputFocusedContext.toNegated()),
			primary: KeyCode.Delete,
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.Backspace
			},
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.removeKeybinding(editorPane.activeKeybindingEntry!);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_RESET,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
			primary: 0,
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.resetKeybinding(editorPane.activeKeybindingEntry!);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_SEARCH,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
			primary: KeyMod.CtrlCmd | KeyCode.KeyF,
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.focusSearch();
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
			primary: KeyMod.Alt | KeyCode.KeyK,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyK },
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.recordSearchKeys();
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
			primary: KeyMod.Alt | KeyCode.KeyP,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP },
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.toggleSortByPrecedence();
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
			primary: 0,
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.showSimilarKeybindings(editorPane.activeKeybindingEntry!);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_COPY,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, CONTEXT_WHEN_FOCUS.negate()),
			primary: KeyMod.CtrlCmd | KeyCode.KeyC,
			handler: async (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					await editorPane.copyKeybinding(editorPane.activeKeybindingEntry!);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
			primary: 0,
			handler: async (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					await editorPane.copyKeybindingCommand(editorPane.activeKeybindingEntry!);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
			primary: 0,
			handler: async (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					await editorPane.copyKeybindingCommandTitle(editorPane.activeKeybindingEntry!);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
			primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			handler: (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.focusKeybindings();
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_REJECT_WHEN,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_WHEN_FOCUS, SuggestContext.Visible.toNegated()),
			primary: KeyCode.Escape,
			handler: async (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.rejectWhenExpression(editorPane.activeKeybindingEntry!);
				}
			}
		});

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: KEYBINDINGS_EDITOR_COMMAND_ACCEPT_WHEN,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_WHEN_FOCUS, SuggestContext.Visible.toNegated()),
			primary: KeyCode.Enter,
			handler: async (accessor, args: any) => {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof KeybindingsEditor) {
					editorPane.acceptWhenExpression(editorPane.activeKeybindingEntry!);
				}
			}
		});

		const profileScopedActionDisposables = this._register(new DisposableStore());
		const registerProfileScopedActions = () => {
			profileScopedActionDisposables.clear();
			profileScopedActionDisposables.add(registerAction2(class DefineKeybindingAction extends Action2 {
				constructor() {
					const when = ResourceContextKey.Resource.isEqualTo(that.userDataProfileService.currentProfile.keybindingsResource.toString());
					super({
						id: 'editor.action.defineKeybinding',
						title: { value: nls.localize('defineKeybinding.start', "Define Keybinding"), original: 'Define Keybinding' },
						f1: true,
						precondition: when,
						keybinding: {
							weight: KeybindingWeight.WorkbenchContrib,
							when,
							primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK)
						},
						menu: {
							id: MenuId.EditorContent,
							when,
						}
					});
				}

				async run(accessor: ServicesAccessor): Promise<void> {
					const codeEditor = accessor.get(IEditorService).activeTextEditorControl;
					if (isCodeEditor(codeEditor)) {
						codeEditor.getContribution<IDefineKeybindingEditorContribution>(DEFINE_KEYBINDING_EDITOR_CONTRIB_ID)?.showDefineKeybindingWidget();
					}
				}
			}));
		};

		registerProfileScopedActions();
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => registerProfileScopedActions()));
	}

	private updatePreferencesEditorMenuItem() {
		const commandId = '_workbench.openWorkspaceSettingsEditor';
		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && !CommandsRegistry.getCommand(commandId)) {
			CommandsRegistry.registerCommand(commandId, () => this.preferencesService.openWorkspaceSettings({ jsonEditor: false }));
			MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
				command: {
					id: commandId,
					title: OPEN_USER_SETTINGS_UI_TITLE,
					icon: preferencesOpenSettingsIcon
				},
				when: ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(this.preferencesService.workspaceSettingsResource!.toString()), WorkbenchStateContext.isEqualTo('workspace'), ContextKeyExpr.not('isInDiffEditor')),
				group: 'navigation',
				order: 1
			});
		}
		this.updatePreferencesEditorMenuItemForWorkspaceFolders();
	}

	private updatePreferencesEditorMenuItemForWorkspaceFolders() {
		for (const folder of this.workspaceContextService.getWorkspace().folders) {
			const commandId = `_workbench.openFolderSettings.${folder.uri.toString()}`;
			if (!CommandsRegistry.getCommand(commandId)) {
				CommandsRegistry.registerCommand(commandId, () => {
					if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER) {
						return this.preferencesService.openWorkspaceSettings({ jsonEditor: false });
					} else {
						return this.preferencesService.openFolderSettings({ folderUri: folder.uri, jsonEditor: false });
					}
				});
				MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
					command: {
						id: commandId,
						title: OPEN_USER_SETTINGS_UI_TITLE,
						icon: preferencesOpenSettingsIcon
					},
					when: ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(this.preferencesService.getFolderSettingsResource(folder.uri)!.toString()), ContextKeyExpr.not('isInDiffEditor')),
					group: 'navigation',
					order: 1
				});
			}
		}
	}
}

class SettingsEditorTitleContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();
		this.registerSettingsEditorTitleActions();
	}

	private registerSettingsEditorTitleActions() {
		const registerOpenUserSettingsEditorFromJsonActionDisposables = this._register(new MutableDisposable());
		const openUserSettingsEditorWhen = ContextKeyExpr.and(
			ContextKeyExpr.or(
				ResourceContextKey.Resource.isEqualTo(this.userDataProfileService.currentProfile.settingsResource.toString()),
				ResourceContextKey.Resource.isEqualTo(this.userDataProfilesService.defaultProfile.settingsResource.toString())),
			ContextKeyExpr.not('isInDiffEditor'));
		const registerOpenUserSettingsEditorFromJsonAction = () => {
			registerOpenUserSettingsEditorFromJsonActionDisposables.value = registerAction2(class extends Action2 {
				constructor() {
					super({
						id: '_workbench.openUserSettingsEditor',
						title: OPEN_USER_SETTINGS_UI_TITLE,
						icon: preferencesOpenSettingsIcon,
						menu: [{
							id: MenuId.EditorTitle,
							when: openUserSettingsEditorWhen,
							group: 'navigation',
							order: 1
						}]
					});
				}
				run(accessor: ServicesAccessor, args: IOpenSettingsActionOptions) {
					args = sanitizeOpenSettingsArgs(args);
					return accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, ...args });
				}
			});
		};

		registerOpenUserSettingsEditorFromJsonAction();
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => {
			// Force the action to check the context again.
			registerOpenUserSettingsEditorFromJsonAction();
		}));

		const openSettingsJsonWhen = ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_JSON_EDITOR.toNegated());
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON,
					title: { value: nls.localize('openSettingsJson', "Open Settings (JSON)"), original: 'Open Settings (JSON)' },
					icon: preferencesOpenSettingsIcon,
					menu: [{
						id: MenuId.EditorTitle,
						when: openSettingsJsonWhen,
						group: 'navigation',
						order: 1
					}]
				});
			}
			run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof SettingsEditor2) {
					return editorPane.switchToSettingsFile();
				}
				return null;
			}
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(PreferencesActionsContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(PreferencesContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(SettingsEditorTitleContribution, LifecyclePhase.Restored);

registerEditorContribution(SettingsEditorContribution.ID, SettingsEditorContribution, EditorContributionInstantiation.AfterFirstRender);

// Preferences menu

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	title: nls.localize({ key: 'miPreferences', comment: ['&& denotes a mnemonic'] }, "&&Preferences"),
	submenu: MenuId.MenubarPreferencesMenu,
	group: '5_autosave',
	order: 2,
	when: IsMacNativeContext.toNegated() // on macOS native the preferences menu is separate under the application menu
});
