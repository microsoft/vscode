/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ExtensionsRegistry } from '../../services/extensions/common/extensionsRegistry.js';
import * as resources from '../../../base/common/resources.js';
import { isString } from '../../../base/common/types.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Extensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from '../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionManifest } from '../../../platform/extensions/common/extensions.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';

interface IJSONValidationExtensionPoint {
	fileMatch: string | string[];
	url: string;
}

const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IJSONValidationExtensionPoint[]>({
	extensionPoint: 'jsonValidation',
	defaultExtensionKind: ['workspace', 'web'],
	jsonSchema: {
		description: nls.localize('contributes.jsonValidation', 'Contributes json schema configuration.'),
		type: 'array',
		defaultSnippets: [{ body: [{ fileMatch: '${1:file.json}', url: '${2:url}' }] }],
		items: {
			type: 'object',
			defaultSnippets: [{ body: { fileMatch: '${1:file.json}', url: '${2:url}' } }],
			properties: {
				fileMatch: {
					type: ['string', 'array'],
					description: nls.localize('contributes.jsonValidation.fileMatch', 'The file pattern (or an array of patterns) to match, for example "package.json" or "*.launch". Exclusion patterns start with \'!\''),
					items: {
						type: ['string']
					}
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
					if (!isString(extension.fileMatch) && !(Array.isArray(extension.fileMatch) && extension.fileMatch.every(isString))) {
						collector.error(nls.localize('invalid.fileMatch', "'configuration.jsonValidation.fileMatch' must be defined as a string or an array of strings."));
						return;
					}
					const uri = extension.url;
					if (!isString(uri)) {
						collector.error(nls.localize('invalid.url', "'configuration.jsonValidation.url' must be a URL or relative path"));
						return;
					}
					if (uri.startsWith('./')) {
						try {
							const colorThemeLocation = resources.joinPath(extensionLocation, uri);
							if (!resources.isEqualOrParent(colorThemeLocation, extensionLocation)) {
								collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.url` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", configurationExtPoint.name, colorThemeLocation.toString(), extensionLocation.path));
							}
						} catch (e) {
							collector.error(nls.localize('invalid.url.fileschema', "'configuration.jsonValidation.url' is an invalid relative URL: {0}", e.message));
						}
					} else if (!/^[^:/?#]+:\/\//.test(uri)) {
						collector.error(nls.localize('invalid.url.schema', "'configuration.jsonValidation.url' must be an absolute URL or start with './'  to reference schemas located in the extension."));
						return;
					}
				});
			}
		});
	}

}

class JSONValidationDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.jsonValidation;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contrib = manifest.contributes?.jsonValidation || [];
		if (!contrib.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			nls.localize('fileMatch', "File Match"),
			nls.localize('schema', "Schema"),
		];

		const rows: IRowData[][] = contrib.map(v => {
			return [
				new MarkdownString().appendMarkdown(`\`${Array.isArray(v.fileMatch) ? v.fileMatch.join(', ') : v.fileMatch}\``),
				v.url,
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
	id: 'jsonValidation',
	label: nls.localize('jsonValidation', "JSON Validation"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(JSONValidationDataRenderer),
});
