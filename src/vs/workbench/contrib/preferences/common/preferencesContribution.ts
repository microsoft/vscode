/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import * as nls from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { EditorInputWithOptions } from 'vs/workbench/common/editor';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { RegisteredEditorPriority, IEditorResolverService } from 'vs/workbench/services/editor/common/editorResolverService';
import { ITextEditorService } from 'vs/workbench/services/textfile/common/textEditorService';
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, IPreferencesService, USE_SPLIT_JSON_SETTING } from 'vs/workbench/services/preferences/common/preferences';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

const schemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);

export class PreferencesContribution implements IWorkbenchContribution {
	private editorOpeningListener: IDisposable | undefined;
	private settingsListener: IDisposable;

	constructor(
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@ITextEditorService private readonly textEditorService: ITextEditorService
	) {
		this.settingsListener = this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(USE_SPLIT_JSON_SETTING) || e.affectsConfiguration(DEFAULT_SETTINGS_EDITOR_SETTING)) {
				this.handleSettingsEditorRegistration();
			}
		});
		this.handleSettingsEditorRegistration();

		this.start();
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

	private start(): void {

		this.textModelResolverService.registerTextModelContentProvider('vscode', {
			provideTextContent: async (uri: URI): Promise<ITextModel | null> => {
				if (uri.scheme !== 'vscode') {
					return null;
				}
				if (uri.authority === 'schemas') {
					return this.getSchemaModel(uri);
				}
				return this.preferencesService.resolveModel(uri);
			}
		});
	}

	private getSchemaModel(uri: URI): ITextModel {
		let schema = schemaRegistry.getSchemaContributions().schemas[uri.toString()] ?? {} /* Use empty schema if not yet registered */;
		const modelContent = JSON.stringify(schema);
		const languageSelection = this.languageService.createById('jsonc');
		const model = this.modelService.createModel(modelContent, languageSelection, uri);
		const disposables = new DisposableStore();
		disposables.add(schemaRegistry.onDidChangeSchema(schemaUri => {
			if (schemaUri === uri.toString()) {
				schema = schemaRegistry.getSchemaContributions().schemas[uri.toString()];
				model.setValue(JSON.stringify(schema));
			}
		}));
		disposables.add(model.onWillDispose(() => disposables.dispose()));
		return model;
	}

	dispose(): void {
		dispose(this.editorOpeningListener);
		dispose(this.settingsListener);
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
				nls.localize('settingsSearchTocBehavior.hide', "Hide the Table of Contents while searching. The search results will not be grouped by category, and instead will be sorted by similarity to the query, with exact keyword matches coming first."),
				nls.localize('settingsSearchTocBehavior.filter', "Filter the Table of Contents to just categories that have matching settings. Clicking a category will filter the results to that category. The search results will be grouped by category."),
			],
			'description': nls.localize('settingsSearchTocBehavior', "Controls the behavior of the settings editor Table of Contents while searching."),
			'default': 'filter',
			'scope': ConfigurationScope.WINDOW
		},
	}
});
