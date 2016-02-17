/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel} from 'vs/editor/common/editorCommon';
import JSONContributionRegistry = require('vs/platform/jsonschemas/common/jsonContributionRegistry');
import {Registry} from 'vs/platform/platform';
import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/contributions';

let schemaRegistry = <JSONContributionRegistry.IJSONContributionRegistry>Registry.as(JSONContributionRegistry.Extensions.JSONContribution);

export class WorkbenchContentProvider implements IWorkbenchContribution {

	private modelService: IModelService;
	private modeService: IModeService;

	constructor(
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService
	) {
		this.modelService = modelService;
		this.modeService = modeService;

		this.start();
	}

	public getId(): string {
		return 'vs.contentprovider';
	}

	private start(): void {
		ResourceEditorInput.registerResourceContentProvider('vscode', {
			provideTextContent: (uri: URI): TPromise<IModel> => {
				if (uri.scheme !== 'vscode') {
					return null;
				}
				if (uri.authority === 'schemas') {
					let schemas = schemaRegistry.getSchemaContributions().schemas;
					let schema = schemas[uri.toString()];
					if (schema) {
						let modelContent = JSON.stringify(schema);
						let mode = this.modeService.getOrCreateMode('json');
						return TPromise.as(this.modelService.createModel(modelContent, mode, uri));
					}
				}
				return null;
			}
		});
	}
}

(<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(WorkbenchContentProvider);