/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITextModel } from 'vs/editor/common/model';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IPreferencesService, FOLDER_SETTINGS_PATH, DEFAULT_SETTINGS_EDITOR_SETTING } from 'vs/workbench/services/preferences/common/preferences';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { endsWith } from 'vs/base/common/strings';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEditorOpeningEvent } from 'vs/workbench/common/editor';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const schemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);

export class PreferencesContribution implements IWorkbenchContribution {
	private editorOpeningListener: IDisposable;
	private settingsListener: IDisposable;

	constructor(
		@IModelService private modelService: IModelService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IModeService private modeService: IModeService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private workspaceService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.settingsListener = this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(DEFAULT_SETTINGS_EDITOR_SETTING)) {
				this.handleSettingsEditorOverride();
			}
		});
		this.handleSettingsEditorOverride();

		this.start();
	}

	private handleSettingsEditorOverride(): void {

		// dispose any old listener we had
		this.editorOpeningListener = dispose(this.editorOpeningListener);

		// install editor opening listener unless user has disabled this
		if (!!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING)) {
			this.editorOpeningListener = this.editorGroupService.onEditorOpening(e => this.onEditorOpening(e));
		}
	}

	private onEditorOpening(event: IEditorOpeningEvent): void {
		const resource = event.input.getResource();
		if (
			!resource || resource.scheme !== 'file' ||									// require a file path opening
			!endsWith(resource.fsPath, 'settings.json') ||								// file must end in settings.json
			!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING)	// user has not disabled default settings editor
		) {
			return;
		}

		// If the file resource was already opened before in the group, do not prevent
		// the opening of that resource. Otherwise we would have the same settings
		// opened twice (https://github.com/Microsoft/vscode/issues/36447)
		const stacks = this.editorGroupService.getStacksModel();
		const group = stacks.groupAt(event.position);
		if (group && group.contains(event.input)) {
			return;
		}

		// Global User Settings File
		if (resource.fsPath === this.environmentService.appSettingsPath) {
			return event.prevent(() => this.preferencesService.openGlobalSettings(event.options, event.position));
		}

		// Single Folder Workspace Settings File
		const state = this.workspaceService.getWorkbenchState();
		if (state === WorkbenchState.FOLDER) {
			const folders = this.workspaceService.getWorkspace().folders;
			if (resource.fsPath === folders[0].toResource(FOLDER_SETTINGS_PATH).fsPath) {
				return event.prevent(() => this.preferencesService.openWorkspaceSettings(event.options, event.position));
			}
		}

		// Multi Folder Workspace Settings File
		else if (state === WorkbenchState.WORKSPACE) {
			const folders = this.workspaceService.getWorkspace().folders;
			for (let i = 0; i < folders.length; i++) {
				if (resource.fsPath === folders[i].toResource(FOLDER_SETTINGS_PATH).fsPath) {
					return event.prevent(() => this.preferencesService.openFolderSettings(folders[i].uri, event.options, event.position));
				}
			}
		}
	}

	private start(): void {

		this.textModelResolverService.registerTextModelContentProvider('vscode', {
			provideTextContent: (uri: URI): TPromise<ITextModel> => {
				if (uri.scheme !== 'vscode') {
					return null;
				}
				if (uri.authority === 'schemas') {
					const schemaModel = this.getSchemaModel(uri);
					if (schemaModel) {
						return TPromise.as(schemaModel);
					}
				}
				return this.preferencesService.resolveModel(uri);
			}
		});
	}

	private getSchemaModel(uri: URI): ITextModel {
		let schema = schemaRegistry.getSchemaContributions().schemas[uri.toString()];
		if (schema) {
			const modelContent = JSON.stringify(schema);
			const mode = this.modeService.getOrCreateMode('jsonc');
			const model = this.modelService.createModel(modelContent, mode, uri);

			let disposables = [];
			disposables.push(schemaRegistry.onDidChangeSchema(schemaUri => {
				if (schemaUri === uri.toString()) {
					schema = schemaRegistry.getSchemaContributions().schemas[uri.toString()];
					model.setValue(JSON.stringify(schema));
				}
			}));
			disposables.push(model.onWillDispose(() => dispose(disposables)));

			return model;
		}
		return null;
	}

	public dispose(): void {
		this.editorOpeningListener = dispose(this.editorOpeningListener);
		this.settingsListener = dispose(this.settingsListener);
	}
}
