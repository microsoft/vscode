/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';

namespace schema {

	// --localizations contribution point

	export interface ILocalizationDescriptor {
		languageId: string;
		languageName: string;
		translations: string;
	}

	export function validateLocalizationDescriptors(localizationDescriptors: ILocalizationDescriptor[], collector: ExtensionMessageCollector): boolean {
		if (!Array.isArray(localizationDescriptors)) {
			collector.error(localize('requirearray', "localizations must be an array"));
			return false;
		}

		for (let descriptor of localizationDescriptors) {
			if (typeof descriptor.languageId !== 'string') {
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'languageId'));
				return false;
			}
			if (typeof descriptor.languageName !== 'string') {
				collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'languageName'));
				return false;
			}
			if (descriptor.translations && typeof descriptor.translations !== 'string') {
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'translations'));
				return false;
			}
		}

		return true;
	}

	export const localizationsContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.localizations', "Contributes localizations to the editor"),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					description: localize('vscode.extension.contributes.localizations.languageId', 'Id of the language into which the display strings are translated.'),
					type: 'string'
				},
				name: {
					description: localize('vscode.extension.contributes.localizations.languageName', 'Name of the language into which the display strings are translated.'),
					type: 'string'
				},
				translations: {
					description: localize('vscode.extension.contributes.localizations.translations', 'A relative path to the folder containing all translation files for the contributed language.'),
					type: 'string',
					default: 'translations'
				}
			}
		}
	};
}

ExtensionsRegistry.registerExtensionPoint<schema.ILocalizationDescriptor[]>('localizations', [], schema.localizationsContribution)
	.setHandler((extensions) => extensions.forEach(extension => schema.validateLocalizationDescriptors(extension.value, extension.collector)));