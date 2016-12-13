/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');

interface IJSONValidationExtensionPoint {
	fileMatch: string;
	url: string;
}

let configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IJSONValidationExtensionPoint[]>('jsonValidation', [], {
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
});

export class JSONValidationExtensionPoint {

	constructor() {
		configurationExtPoint.setHandler((extensions) => {
			for (var i = 0; i < extensions.length; i++) {
				var extensionValue = <IJSONValidationExtensionPoint[]>extensions[i].value;
				var collector = extensions[i].collector;
				var extensionPath = extensions[i].description.extensionFolderPath;

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
							uri = URI.file(paths.normalize(paths.join(extensionPath, uri))).toString();
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
