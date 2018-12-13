/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

const schemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);

export class PreferencesContribution implements IWorkbenchContribution {
	private editorOpeningListener: IDisposable;
	private settingsListener: IDisposable;

	constructor(
		@IModelService private modelService: IModelService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IModeService private modeService: IModeService
	) {
		this.start();
	}

	private start(): void {

		this.textModelResolverService.registerTextModelContentProvider('vscode', {
			provideTextContent: (uri: URI): Promise<ITextModel> => {
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

	private getSchemaModel(uri: URI): ITextModel {
		let schema = schemaRegistry.getSchemaContributions().schemas[uri.toString()];
		if (schema) {
			const modelContent = JSON.stringify(schema);
			const languageSelection = this.modeService.create('jsonc');
			const model = this.modelService.createModel(modelContent, languageSelection, uri);

			let disposables: IDisposable[] = [];
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
