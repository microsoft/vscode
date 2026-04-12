/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { EXTENSION_IDENTIFIER_PATTERN } from '../../../../platform/extensionManagement/common/extensionManagement.js';
export const ExtensionsConfigurationSchemaId = 'vscode://schemas/extensions';
export const ExtensionsConfigurationSchema = {
    id: ExtensionsConfigurationSchemaId,
    allowComments: true,
    allowTrailingCommas: true,
    type: 'object',
    title: localize('app.extensions.json.title', "Extensions"),
    additionalProperties: false,
    properties: {
        recommendations: {
            type: 'array',
            description: localize('app.extensions.json.recommendations', "List of extensions which should be recommended for users of this workspace. The identifier of an extension is always '${publisher}.${name}'. For example: 'vscode.csharp'."),
            items: {
                type: 'string',
                pattern: EXTENSION_IDENTIFIER_PATTERN,
                errorMessage: localize('app.extension.identifier.errorMessage', "Expected format '${publisher}.${name}'. Example: 'vscode.csharp'.")
            },
        },
        unwantedRecommendations: {
            type: 'array',
            description: localize('app.extensions.json.unwantedRecommendations', "List of extensions recommended by VS Code that should not be recommended for users of this workspace. The identifier of an extension is always '${publisher}.${name}'. For example: 'vscode.csharp'."),
            items: {
                type: 'string',
                pattern: EXTENSION_IDENTIFIER_PATTERN,
                errorMessage: localize('app.extension.identifier.errorMessage', "Expected format '${publisher}.${name}'. Example: 'vscode.csharp'.")
            },
        },
    }
};
export const ExtensionsConfigurationInitialContent = [
    '{',
    '\t// See https://go.microsoft.com/fwlink/?LinkId=827846 to learn about workspace recommendations.',
    '\t// Extension identifier format: ${publisher}.${name}. Example: vscode.csharp',
    '',
    '\t// List of extensions which should be recommended for users of this workspace.',
    '\t"recommendations": [',
    '\t\t',
    '\t],',
    '\t// List of extensions recommended by VS Code that should not be recommended for users of this workspace.',
    '\t"unwantedRecommendations": [',
    '\t\t',
    '\t]',
    '}'
].join('\n');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc0ZpbGVUZW1wbGF0ZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNGaWxlVGVtcGxhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRXRILE1BQU0sQ0FBQyxNQUFNLCtCQUErQixHQUFHLDZCQUE2QixDQUFDO0FBQzdFLE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFnQjtJQUN6RCxFQUFFLEVBQUUsK0JBQStCO0lBQ25DLGFBQWEsRUFBRSxJQUFJO0lBQ25CLG1CQUFtQixFQUFFLElBQUk7SUFDekIsSUFBSSxFQUFFLFFBQVE7SUFDZCxLQUFLLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLFlBQVksQ0FBQztJQUMxRCxvQkFBb0IsRUFBRSxLQUFLO0lBQzNCLFVBQVUsRUFBRTtRQUNYLGVBQWUsRUFBRTtZQUNoQixJQUFJLEVBQUUsT0FBTztZQUNiLFdBQVcsRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsNEtBQTRLLENBQUM7WUFDMU8sS0FBSyxFQUFFO2dCQUNOLElBQUksRUFBRSxRQUFRO2dCQUNkLE9BQU8sRUFBRSw0QkFBNEI7Z0JBQ3JDLFlBQVksRUFBRSxRQUFRLENBQUMsdUNBQXVDLEVBQUUsbUVBQW1FLENBQUM7YUFDcEk7U0FDRDtRQUNELHVCQUF1QixFQUFFO1lBQ3hCLElBQUksRUFBRSxPQUFPO1lBQ2IsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2Q0FBNkMsRUFBRSxzTUFBc00sQ0FBQztZQUM1USxLQUFLLEVBQUU7Z0JBQ04sSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsT0FBTyxFQUFFLDRCQUE0QjtnQkFDckMsWUFBWSxFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSxtRUFBbUUsQ0FBQzthQUNwSTtTQUNEO0tBQ0Q7Q0FDRCxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0scUNBQXFDLEdBQVc7SUFDNUQsR0FBRztJQUNILG1HQUFtRztJQUNuRyxnRkFBZ0Y7SUFDaEYsRUFBRTtJQUNGLGtGQUFrRjtJQUNsRix3QkFBd0I7SUFDeEIsTUFBTTtJQUNOLE1BQU07SUFDTiw0R0FBNEc7SUFDNUcsZ0NBQWdDO0lBQ2hDLE1BQU07SUFDTixLQUFLO0lBQ0wsR0FBRztDQUNILENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDIn0=