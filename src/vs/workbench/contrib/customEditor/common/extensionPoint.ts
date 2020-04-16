/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import * as nls from 'vs/nls';
import { CustomEditorPriority, CustomEditorSelector } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { languagesExtPoint } from 'vs/workbench/services/mode/common/workbenchModeService';

namespace Fields {
	export const viewType = 'viewType';
	export const displayName = 'displayName';
	export const selector = 'selector';
	export const priority = 'priority';
}

export interface ICustomEditorsExtensionPoint {
	readonly [Fields.viewType]: string;
	readonly [Fields.displayName]: string;
	readonly [Fields.selector]?: readonly CustomEditorSelector[];
	readonly [Fields.priority]?: string;
}

const CustomEditorsContribution: IJSONSchema = {
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
	items: {
		type: 'object',
		required: [
			Fields.viewType,
			Fields.displayName,
			Fields.selector,
		],
		properties: {
			[Fields.viewType]: {
				type: 'string',
				description: nls.localize('contributes.viewType', 'Unique identifier of the custom editor.'),
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
				description: nls.localize('contributes.priority', 'Controls when the custom editor is used. May be overridden by users.'),
				enum: [
					CustomEditorPriority.default,
					CustomEditorPriority.option,
				],
				markdownEnumDescriptions: [
					nls.localize('contributes.priority.default', 'Editor is automatically used for a resource if no other default custom editors are registered for it.'),
					nls.localize('contributes.priority.option', 'Editor is not automatically used but can be selected by a user.'),
				],
				default: 'default'
			}
		}
	}
};

export const customEditorsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<ICustomEditorsExtensionPoint[]>({
	extensionPoint: 'customEditors',
	deps: [languagesExtPoint],
	jsonSchema: CustomEditorsContribution
});
