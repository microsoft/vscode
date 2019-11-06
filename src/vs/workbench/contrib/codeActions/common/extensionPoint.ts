/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';
import { languagesExtPoint } from 'vs/workbench/services/mode/common/workbenchModeService';

export enum CodeActionExtensionPointFields {
	kind = 'kind',
	title = 'title',
	selector = 'selector',
	selectorLanguage = 'language',
	selectorScheme = 'scheme',
}

export interface CodeActionsExtensionPoint {
	readonly [CodeActionExtensionPointFields.kind]: string;
	readonly [CodeActionExtensionPointFields.title]: string;
	readonly [CodeActionExtensionPointFields.selector]: {
		readonly [CodeActionExtensionPointFields.selectorLanguage]: string;
		readonly [CodeActionExtensionPointFields.selectorScheme]: string;
	};
}

const codeActionsExtensionPointSchema: IConfigurationPropertySchema = {
	type: 'array',
	markdownDescription: nls.localize('contributes.codeActions', "Configure which editor to use for a resource."),
	items: {
		type: 'object',
		required: [CodeActionExtensionPointFields.kind, CodeActionExtensionPointFields.title, CodeActionExtensionPointFields.selector],
		properties: {
			[CodeActionExtensionPointFields.kind]: {
				type: 'string',
				markdownDescription: nls.localize('contributes.codeActions.kind', "`CodeActionKind` of the contributed code action."),
			},
			[CodeActionExtensionPointFields.title]: {
				type: 'string',
				description: nls.localize('contributes.codeActions.title', "Human readable name for the code action."),
			},
			[CodeActionExtensionPointFields.selector]: {
				type: 'array',
				description: nls.localize('contributes.codeActions.selector', "Files that the code actions are enabled for."),
				items: {
					type: 'object',
					required: [CodeActionExtensionPointFields.selectorLanguage],
					properties: {
						[CodeActionExtensionPointFields.selectorLanguage]: {
							type: 'string',
							description: nls.localize('contributes.codeActions.selector.language', "Language mode that the code action is enabled for."),
						},
						[CodeActionExtensionPointFields.selectorScheme]: {
							type: 'string',
							description: nls.localize('contributes.codeActions.selector.scheme', "File scheme that the code action is enabled for."),
						}
					},
				}
			},
		}
	}
};

export const codeActionsExtensionPointDescriptor = {
	extensionPoint: 'codeActions',
	deps: [languagesExtPoint],
	jsonSchema: codeActionsExtensionPointSchema
};
