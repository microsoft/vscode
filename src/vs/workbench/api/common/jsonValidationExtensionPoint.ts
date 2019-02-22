/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import * as strings from 'vs/base/common/strings';
import * as resources from 'vs/base/common/resources';

interface IJSONValidationExtensionPoint {
	fileMatch: string;
	url: string;
}

const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IJSONValidationExtensionPoint[]>({
	extensionPoint: 'jsonValidation',
	jsonSchema: {
		description: nls.localize('contributes.jsonValidation', 'Contributes json schema configuration.'),
		type: 'array',
		defaultSnippets: [{ body: [{ fileMatch: '${1:file.json}', url: '${2:url}' }] }],
		items: {
			type: 'object',
			defaultSnippets: [{ body: { fileMatch: '${1:file.json}', url: '${2:url}' } }],
			properties: {
				fileMatch: {
					type: 'string',
					description: nls.localize('contributes.jsonValidation.fileMatch', 'The file pattern to match, for example "package.json" or "*.launch".'),
				},
				url: {
					description: nls.localize('contributes.jsonValidation.url', 'A schema URL (\'http:\', \'https:\') or relative path to the extension folder (\'./\').'),
					type: 'string'
				}
			}
		}
	}
});

export class JSONValidationExtensionPoint {

	constructor() {
		configurationExtPoint.setHandler((extensions) => {
			for (const extension of extensions) {
				const extensionValue = <IJSONValidationExtensionPoint[]>extension.value;
				const collector = extension.collector;
				const extensionLocation = extension.description.extensionLocation;

				if (!extensionValue || !Array.isArray(extensionValue)) {
					collector.error(nls.localize('invalid.jsonValidation', "'configuration.jsonValidation' must be a array"));
					return;
				}
				extensionValue.forEach(extension => {
					if (typeof extension.fileMatch !== 'string') {
						collector.error(nls.localize('invalid.fileMatch', "'configuration.jsonValidation.fileMatch' must be defined"));
						return;
					}
					let uri = extension.url;
					if (typeof extension.url !== 'string') {
						collector.error(nls.localize('invalid.url', "'configuration.jsonValidation.url' must be a URL or relative path"));
						return;
					}
					if (strings.startsWith(uri, './')) {
						try {
							const colorThemeLocation = resources.joinPath(extensionLocation, uri);
							if (!resources.isEqualOrParent(colorThemeLocation, extensionLocation)) {
								collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.url` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", configurationExtPoint.name, colorThemeLocation.toString(), extensionLocation.path));
							}
						} catch (e) {
							collector.error(nls.localize('invalid.url.fileschema', "'configuration.jsonValidation.url' is an invalid relative URL: {0}", e.message));
						}
					} else if (!strings.startsWith(uri, 'https:/') && strings.startsWith(uri, 'https:/')) {
						collector.error(nls.localize('invalid.url.schema', "'configuration.jsonValidation.url' must start with 'http:', 'https:' or './' to reference schemas located in the extension"));
						return;
					}
				});
			}
		});
	}

}
