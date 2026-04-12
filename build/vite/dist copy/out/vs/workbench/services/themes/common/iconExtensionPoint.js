/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { Extensions as IconRegistryExtensions } from '../../../../platform/theme/common/iconRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as resources from '../../../../base/common/resources.js';
import { extname, posix } from '../../../../base/common/path.js';
const iconRegistry = Registry.as(IconRegistryExtensions.IconContribution);
const iconReferenceSchema = iconRegistry.getIconReferenceSchema();
const iconIdPattern = `^${ThemeIcon.iconNameSegment}(-${ThemeIcon.iconNameSegment})+$`;
const iconConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'icons',
    jsonSchema: {
        description: nls.localize('contributes.icons', 'Contributes extension defined themable icons'),
        type: 'object',
        propertyNames: {
            pattern: iconIdPattern,
            description: nls.localize('contributes.icon.id', 'The identifier of the themable icon'),
            patternErrorMessage: nls.localize('contributes.icon.id.format', 'Identifiers can only contain letters, digits and minuses and need to consist of at least two segments in the form `component-iconname`.'),
        },
        additionalProperties: {
            type: 'object',
            properties: {
                description: {
                    type: 'string',
                    description: nls.localize('contributes.icon.description', 'The description of the themable icon'),
                },
                default: {
                    anyOf: [
                        iconReferenceSchema,
                        {
                            type: 'object',
                            properties: {
                                fontPath: {
                                    description: nls.localize('contributes.icon.default.fontPath', 'The path of the icon font that defines the icon.'),
                                    type: 'string'
                                },
                                fontCharacter: {
                                    description: nls.localize('contributes.icon.default.fontCharacter', 'The character for the icon in the icon font.'),
                                    type: 'string'
                                }
                            },
                            required: ['fontPath', 'fontCharacter'],
                            defaultSnippets: [{ body: { fontPath: '${1:myiconfont.woff}', fontCharacter: '${2:\\\\E001}' } }]
                        }
                    ],
                    description: nls.localize('contributes.icon.default', 'The default of the icon. Either a reference to an existing ThemeIcon or an icon in an icon font.'),
                }
            },
            required: ['description', 'default'],
            defaultSnippets: [{ body: { description: '${1:my icon}', default: { fontPath: '${2:myiconfont.woff}', fontCharacter: '${3:\\\\E001}' } } }]
        },
        defaultSnippets: [{ body: { '${1:my-icon-id}': { description: '${2:my icon}', default: { fontPath: '${3:myiconfont.woff}', fontCharacter: '${4:\\\\E001}' } } } }]
    }
});
export class IconExtensionPoint {
    constructor() {
        iconConfigurationExtPoint.setHandler((extensions, delta) => {
            for (const extension of delta.added) {
                const extensionValue = extension.value;
                const collector = extension.collector;
                if (!extensionValue || typeof extensionValue !== 'object') {
                    collector.error(nls.localize('invalid.icons.configuration', "'configuration.icons' must be an object with the icon names as properties."));
                    return;
                }
                for (const id in extensionValue) {
                    if (!id.match(iconIdPattern)) {
                        collector.error(nls.localize('invalid.icons.id.format', "'configuration.icons' keys represent the icon id and can only contain letter, digits and minuses. They need to consist of at least two segments in the form `component-iconname`."));
                        return;
                    }
                    const iconContribution = extensionValue[id];
                    if (typeof iconContribution.description !== 'string' || iconContribution.description.length === 0) {
                        collector.error(nls.localize('invalid.icons.description', "'configuration.icons.description' must be defined and can not be empty"));
                        return;
                    }
                    const defaultIcon = iconContribution.default;
                    if (typeof defaultIcon === 'string') {
                        iconRegistry.registerIcon(id, { id: defaultIcon }, iconContribution.description);
                    }
                    else if (typeof defaultIcon === 'object' && typeof defaultIcon.fontPath === 'string' && typeof defaultIcon.fontCharacter === 'string') {
                        const fileExt = extname(defaultIcon.fontPath).substring(1);
                        const format = formatMap[fileExt];
                        if (!format) {
                            collector.warn(nls.localize('invalid.icons.default.fontPath.extension', "Expected `contributes.icons.default.fontPath` to have file extension 'woff', woff2' or 'ttf', is '{0}'.", fileExt));
                            return;
                        }
                        const extensionLocation = extension.description.extensionLocation;
                        const iconFontLocation = resources.joinPath(extensionLocation, defaultIcon.fontPath);
                        const fontId = getFontId(extension.description, defaultIcon.fontPath);
                        const definition = iconRegistry.registerIconFont(fontId, { src: [{ location: iconFontLocation, format }] });
                        if (!resources.isEqualOrParent(iconFontLocation, extensionLocation)) {
                            collector.warn(nls.localize('invalid.icons.default.fontPath.path', "Expected `contributes.icons.default.fontPath` ({0}) to be included inside extension's folder ({0}).", iconFontLocation.path, extensionLocation.path));
                            return;
                        }
                        iconRegistry.registerIcon(id, {
                            fontCharacter: defaultIcon.fontCharacter,
                            font: {
                                id: fontId,
                                definition
                            }
                        }, iconContribution.description);
                    }
                    else {
                        collector.error(nls.localize('invalid.icons.default', "'configuration.icons.default' must be either a reference to the id of an other theme icon (string) or a icon definition (object) with properties `fontPath` and `fontCharacter`."));
                    }
                }
            }
            for (const extension of delta.removed) {
                const extensionValue = extension.value;
                for (const id in extensionValue) {
                    iconRegistry.deregisterIcon(id);
                }
            }
        });
    }
}
const formatMap = {
    'ttf': 'truetype',
    'woff': 'woff',
    'woff2': 'woff2'
};
function getFontId(description, fontPath) {
    return posix.join(description.identifier.value, fontPath);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWNvbkV4dGVuc2lvblBvaW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vaWNvbkV4dGVuc2lvblBvaW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbkYsT0FBTyxFQUFpQixVQUFVLElBQUksc0JBQXNCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sS0FBSyxTQUFTLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQVNqRSxNQUFNLFlBQVksR0FBa0IsUUFBUSxDQUFDLEVBQUUsQ0FBZ0Isc0JBQXNCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUV4RyxNQUFNLG1CQUFtQixHQUFHLFlBQVksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO0FBQ2xFLE1BQU0sYUFBYSxHQUFHLElBQUksU0FBUyxDQUFDLGVBQWUsS0FBSyxTQUFTLENBQUMsZUFBZSxLQUFLLENBQUM7QUFFdkYsTUFBTSx5QkFBeUIsR0FBRyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBc0I7SUFDaEcsY0FBYyxFQUFFLE9BQU87SUFDdkIsVUFBVSxFQUFFO1FBQ1gsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUsOENBQThDLENBQUM7UUFDOUYsSUFBSSxFQUFFLFFBQVE7UUFDZCxhQUFhLEVBQUU7WUFD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