/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import * as nls from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorInputWithOptions } from '../../../common/editor.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { RegisteredEditorPriority, IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { ITextEditorService } from '../../../services/textfile/common/textEditorService.js';
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, IPreferencesService, USE_SPLIT_JSON_SETTING } from '../../../services/preferences/common/preferences.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { SettingsFileSystemProvider } from './settingsFilesystemProvider.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export class PreferencesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.preferences';

	private editorOpeningListener: IDisposable | undefined;

	constructor(
		@IFileService fileService: IFileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@ITextEditorService private readonly textEditorService: ITextEditorService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(USE_SPLIT_JSON_SETTING) || e.affectsConfiguration(DEFAULT_SETTINGS_EDITOR_SETTING)) {
				this.handleSettingsEditorRegistration();
			}
		}));
		this.handleSettingsEditorRegistration();

		const fileSystemProvider = this._register(this.instantiationService.createInstance(SettingsFileSystemProvider));
		this._register(fileService.registerProvider(SettingsFileSystemProvider.SCHEMA, fileSystemProvider));
	}

	private handleSettingsEditorRegistration(): void {

		// dispose any old listener we had
		dispose(this.editorOpeningListener);

		// install editor opening listener unless user has disabled this
		if (!!this.configurationService.getValue(USE_SPLIT_JSON_SETTING) || !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING)) {
			this.editorOpeningListener = this.editorResolverService.registerEditor(
				'**/settings.json',
				{
					id: SideBySideEditorInput.ID,
					label: nls.localize('splitSettingsEditorLabel', "Split Settings Editor"),
					priority: RegisteredEditorPriority.builtin,
				},
				{},
				{
					createEditorInput: ({ resource, options }): EditorInputWithOptions => {
						// Global User Settings File
						if (isEqual(resource, this.userDataProfileService.currentProfile.settingsResource)) {
							return { editor: this.preferencesService.createSplitJsonEditorInput(ConfigurationTarget.USER_LOCAL, resource), options };
						}

						// Single Folder Workspace Settings File
						const state = this.workspaceService.getWorkbenchState();
						if (state === WorkbenchState.FOLDER) {
							const folders = this.workspaceService.getWorkspace().folders;
							if (isEqual(resource, folders[0].toResource(FOLDER_SETTINGS_PATH))) {
								return { editor: this.preferencesService.createSplitJsonEditorInput(ConfigurationTarget.WORKSPACE, resource), options };
							}
						}

						// Multi Folder Workspace Settings File
						else if (state === WorkbenchState.WORKSPACE) {
							const folders = this.workspaceService.getWorkspace().folders;
							for (const folder of folders) {
								if (isEqual(resource, folder.toResource(FOLDER_SETTINGS_PATH))) {
									return { editor: this.preferencesService.createSplitJsonEditorInput(ConfigurationTarget.WORKSPACE_FOLDER, resource), options };
								}
							}
						}

						return { editor: this.textEditorService.createTextEditor({ resource }), options };
					}
				}
			);
		}
	}
	override dispose(): void {
		dispose(this.editorOpeningListener);
		super.dispose();
	}
}


const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
registry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	'properties': {
		'workbench.settings.enableNaturalLanguageSearch': {
			'type': 'boolean',
			'description': nls.localize('enableNaturalLanguageSettingsSearch', "Controls whether to enable the natural language search mode for settings. The natural language search is provided by a Microsoft online service."),
			'default': true,
			'scope': ConfigurationScope.WINDOW,
			'tags': ['usesOnlineServices']
		},
		'workbench.settings.settingsSearchTocBehavior': {
			'type': 'string',
			'enum': ['hide', 'filter'],
			'enumDescriptions': [
				nls.localize('settingsSearchTocBehavior.hide', "Hide the Table of Contents while searching."),
				nls.localize('settingsSearchTocBehavior.filter', "Filter the Table of Contents to just categories that have matching settings. Clicking on a category will filter the results to that category."),
			],
			'description': nls.localize('settingsSearchTocBehavior', "Controls the behavior of the Settings editor Table of Contents while searching. If this setting is being changed in the Settings editor, the setting will take effect after the search query is modified."),
			'default': 'filter',
			'scope': ConfigurationScope.WINDOW
		}
	}
});
