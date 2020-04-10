/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import * as nls from 'vs/nls';
import { IConfigurationNode, IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { CustomEditorSelector } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { ContributedCustomEditors, defaultCustomEditor } from 'vs/workbench/contrib/customEditor/common/contributedCustomEditors';
import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';

export const customEditorsAssociationsSettingId = 'workbench.editorAssociations';

export type CustomEditorAssociation = CustomEditorSelector & {
	readonly viewType: string;
};

export type CustomEditorsAssociations = readonly CustomEditorAssociation[];

const viewTypeSchamaAddition: IJSONSchema = {
	type: 'string',
	enum: []
};

export const editorAssociationsConfigurationNode: IConfigurationNode = {
	...workbenchConfigurationNodeBase,
	properties: {
		[customEditorsAssociationsSettingId]: {
			type: 'array',
			markdownDescription: nls.localize('editor.editorAssociations', "Configure which editor to use for specific file types."),
			items: {
				type: 'object',
				defaultSnippets: [{
					body: {
						'viewType': '$1',
						'filenamePattern': '$2'
					}
				}],
				properties: {
					'viewType': {
						anyOf: [
							{
								type: 'string',
								description: nls.localize('editor.editorAssociations.viewType', "The unique id of the editor to use."),
							},
							viewTypeSchamaAddition
						]
					},
					'filenamePattern': {
						type: 'string',
						description: nls.localize('editor.editorAssociations.filenamePattern', "Glob pattern specifying which files the editor should be used for."),
					}
				}
			}
		}
	}
};

export class CustomEditorAssociationsSettingIntelliSense extends Disposable {

	constructor(
		private readonly _contributedCustomEditors: ContributedCustomEditors,
	) {
		super();

		this._register(_contributedCustomEditors.onChange(() => {
			this.updateSchema();
		}));
		this.updateSchema();
	}

	private updateSchema() {
		const enumValues: string[] = [];
		const enumDescriptions: string[] = [];
		for (const info of [defaultCustomEditor, ...this._contributedCustomEditors]) {
			enumValues.push(info.id);
			enumDescriptions.push(nls.localize('editorAssociations.viewType.sourceDescription', "Source: {0}", info.providerDisplayName));
		}
		viewTypeSchamaAddition.enum = enumValues;
		viewTypeSchamaAddition.enumDescriptions = enumDescriptions;

		Registry.as<IConfigurationRegistry>(Extensions.Configuration)
			.notifyConfigurationSchemaUpdated(editorAssociationsConfigurationNode);
	}
}
