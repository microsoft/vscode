/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { TypeFromJsonSchema, IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { CustomEditorPriority } from './customEditor.js';
import { Extensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { languagesExtPoint } from '../../../services/language/common/languageService.js';

const Fields = Object.freeze({
	viewType: 'viewType',
	displayName: 'displayName',
	selector: 'selector',
	priority: 'priority',
});

const customEditorsContributionSchema = {
	type: 'object',
	required: [
		Fields.viewType,
		Fields.displayName,
		Fields.selector,
	],
	additionalProperties: false,
	properties: {
		[Fields.viewType]: {
			type: 'string',
			markdownDescription: nls.localize('contributes.viewType', 'Identifier for the custom editor. This must be unique across all custom editors, so we recommend including your extension id as part of `viewType`. The `viewType` is used when registering custom editors with `vscode.registerCustomEditorProvider` and in the `onCustomEditor:${id}` [activation event](https://code.visualstudio.com/api/references/activation-events).'),
		},
		[Fields.displayName]: {
			type: 'string',
			description: nls.localize('contributes.displayName', 'Human readable name of the custom editor. This is displayed to users when selecting which editor to use.'),
		},
		[Fields.selector]: {
			type: 'array',
			description: nls.localize('contributes.selector', 'Set of globs that the custom editor is enabled for.'),
			items: {
				type: 'object',
				defaultSnippets: [{
					body: {
						filenamePattern: '$1',
					}
				}],
				additionalProperties: false,
				properties: {
					filenamePattern: {
						type: 'string',
						description: nls.localize('contributes.selector.filenamePattern', 'Glob that the custom editor is enabled for.'),
					},
				}
			}
		},
		[Fields.priority]: {
			type: 'string',
			markdownDeprecationMessage: nls.localize('contributes.priority', 'Controls if the custom editor is enabled automatically when the user opens a file. This may be overridden by users using the `workbench.editorAssociations` setting.'),
			enum: [
				CustomEditorPriority.default,
				CustomEditorPriority.option,
			],
			markdownEnumDescriptions: [
				nls.localize('contributes.priority.default', 'The editor is automatically used when the user opens a resource, provided that no other default custom editors are registered for that resource.'),
				nls.localize('contributes.priority.option', 'The editor is not automatically used when the user opens a resource, but a user can switch to the editor using the `Reopen With` command.'),
			],
			default: CustomEditorPriority.default
		}
	}
} as const satisfies IJSONSchema;

export type ICustomEditorsExtensionPoint = TypeFromJsonSchema<typeof customEditorsContributionSchema>;

export const customEditorsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<ICustomEditorsExtensionPoint[]>({
	extensionPoint: 'customEditors',
	deps: [languagesExtPoint],
	jsonSchema: {
		description: nls.localize('contributes.customEditors', 'Contributed custom editors.'),
		type: 'array',
		defaultSnippets: [{
			body: [{
				[Fields.viewType]: '$1',
				[Fields.displayName]: '$2',
				[Fields.selector]: [{
					filenamePattern: '$3'
				}],
			}]
		}],
		items: customEditorsContributionSchema
	},
	activationEventsGenerator: function* (contribs: readonly ICustomEditorsExtensionPoint[]) {
		for (const contrib of contribs) {
			const viewType = contrib[Fields.viewType];
			if (viewType) {
				yield `onCustomEditor:${viewType}`;
			}
		}
	},
});

class CustomEditorsDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.customEditors;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const customEditors = manifest.contributes?.customEditors || [];
		if (!customEditors.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			nls.localize('customEditors view type', "View Type"),
			nls.localize('customEditors priority', "Priority"),
			nls.localize('customEditors filenamePattern', "Filename Pattern"),
		];

		const rows: IRowData[][] = customEditors
			.map(customEditor => {
				return [
					customEditor.viewType,
					customEditor.priority ?? '',
					coalesce(customEditor.selector.map(x => x.filenamePattern)).join(', ')
				];
			});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'customEditors',
	label: nls.localize('customEditors', "Custom Editors"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(CustomEditorsDataRenderer),
});
