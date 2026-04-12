/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../nls.js';
import { ExtensionsRegistry } from '../../services/extensions/common/extensionsRegistry.js';
import * as resources from '../../../base/common/resources.js';
import { isString } from '../../../base/common/types.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Extensions } from '../../services/extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
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
                const extensionValue = extension.value;
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
                        }
                        catch (e) {
                            collector.error(nls.localize('invalid.url.fileschema', "'configuration.jsonValidation.url' is an invalid relative URL: {0}", e.message));
                        }
                    }
                    else if (!/^[^:/?#]+:\/\//.test(uri)) {
                        collector.error(nls.localize('invalid.url.schema', "'configuration.jsonValidation.url' must be an absolute URL or start with './'  to reference schemas located in the extension."));
                        return;
                    }
                });
            }
        });
    }
}
class JSONValidationDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.jsonValidation;
    }
    render(manifest) {
        const contrib = manifest.contributes?.jsonValidation || [];
        if (!contrib.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            nls.localize('fileMatch', "File Match"),
            nls.localize('schema', "Schema"),
        ];
        const rows = contrib.map(v => {
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
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'jsonValidation',
    label: nls.localize('jsonValidation', "JSON Validation"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(JSONValidationDataRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblZhbGlkYXRpb25FeHRlbnNpb25Qb2ludC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2pzb25WYWxpZGF0aW9uRXh0ZW5zaW9uUG9pbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUN2QyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RixPQUFPLEtBQUssU0FBUyxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBbUcsTUFBTSxnRUFBZ0UsQ0FBQztBQUU3TCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDekUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQU9yRSxNQUFNLHFCQUFxQixHQUFHLGtCQUFrQixDQUFDLHNCQUFzQixDQUFrQztJQUN4RyxjQUFjLEVBQUUsZ0JBQWdCO0lBQ2hDLG9CQUFvQixFQUFFLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQztJQUMxQyxVQUFVLEVBQUU7UUFDWCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSx3Q0FBd0MsQ0FBQztRQUNqRyxJQUFJLEVBQUUsT0FBTztRQUNiLGVBQWUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVB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