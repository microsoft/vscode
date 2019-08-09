/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dispose, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { endsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorInput } from 'vs/workbench/common/editor';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { FOLDER_SETTINGS_PATH, IPreferencesService, USE_SPLIT_JSON_SETTING } from 'vs/workbench/services/preferences/common/preferences';

const schemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);

export class PreferencesContribution implements IWorkbenchContribution {
	private editorOpeningListener: IDisposable;
	private settingsListener: IDisposable;

	constructor(
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IModeService private readonly modeService: IModeService,
		@IEditorService private readonly editorService: IEditorService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this.settingsListener = this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(USE_SPLIT_JSON_SETTING)) {
				this.handleSettingsEditorOverride();
			}
		});
		this.handleSettingsEditorOverride();

		this.start();
	}

	private handleSettingsEditorOverride(): void {

		// dispose any old listener we had
		dispose(this.editorOpeningListener);

		// install editor opening listener unless user has disabled this
		if (!!this.configurationService.getValue(USE_SPLIT_JSON_SETTING)) {
			this.editorOpeningListener = this.editorService.overrideOpenEditor((editor, options, group) => this.onEditorOpening(editor, options, group));
		}
	}

	private onEditorOpening(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined {
		const resource = editor.getResource();
		if (
			!resource ||
			!endsWith(resource.path, 'settings.json') ||								// resource must end in settings.json
			!this.configurationService.getValue(USE_SPLIT_JSON_SETTING)					// user has not disabled default settings editor
		) {
			return undefined;
		}

		// If the resource was already opened before in the group, do not prevent
		// the opening of that resource. Otherwise we would have the same settings
		// opened twice (https://github.com/Microsoft/vscode/issues/36447)
		if (group.isOpened(editor)) {
			return undefined;
		}

		// Global User Settings File
		if (isEqual(resource, this.environmentService.settingsResource)) {
			return { override: this.preferencesService.openGlobalSettings(true, options, group) };
		}

		// Single Folder Workspace Settings File
		const state = this.workspaceService.getWorkbenchState();
		if (state === WorkbenchState.FOLDER) {
			const folders = this.workspaceService.getWorkspace().folders;
			if (isEqual(resource, folders[0].toResource(FOLDER_SETTINGS_PATH))) {
				return { override: this.preferencesService.openWorkspaceSettings(true, options, group) };
			}
		}

		// Multi Folder Workspace Settings File
		else if (state === WorkbenchState.WORKSPACE) {
			const folders = this.workspaceService.getWorkspace().folders;
			for (const folder of folders) {
				if (isEqual(resource, folder.toResource(FOLDER_SETTINGS_PATH))) {
					return { override: this.preferencesService.openFolderSettings(folder.uri, true, options, group) };
				}
			}
		}

		return undefined;
	}

	private start(): void {

		this.textModelResolverService.registerTextModelContentProvider('vscode', {
			provideTextContent: (uri: URI): Promise<ITextModel | null> | null => {
				if (uri.scheme !== 'vscode') {
					return null;
				}
				if (uri.authority === 'schemas') {
					const schemaModel = this.getSchemaModel(uri);
					if (schemaModel) {
						return Promise.resolve(schemaModel);
					}
				}
				return this.preferencesService.resolveModel(uri);
			}
		});
	}

	private getSchemaModel(uri: URI): ITextModel | null {
		let schema = schemaRegistry.getSchemaContributions().schemas[uri.toString()];
		if (schema) {
			const modelContent = JSON.stringify(schema);
			const languageSelection = this.modeService.create('jsonc');
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
		return null;
	}

	dispose(): void {
		dispose(this.editorOpeningListener);
		dispose(this.settingsListener);
	}
}
