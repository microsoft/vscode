/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { languagesExtPoint } from '../../language/common/languageService.js';
export const grammarsExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'grammars',
    deps: [languagesExtPoint],
    jsonSchema: {
        description: nls.localize('vscode.extension.contributes.grammars', 'Contributes textmate tokenizers.'),
        type: 'array',
        defaultSnippets: [{ body: [{ language: '${1:id}', scopeName: 'source.${2:id}', path: './syntaxes/${3:id}.tmLanguage.' }] }],
        items: {
            type: 'object',
            defaultSnippets: [{ body: { language: '${1:id}', scopeName: 'source.${2:id}', path: './syntaxes/${3:id}.tmLanguage.' } }],
            properties: {
                language: {
                    description: nls.localize('vscode.extension.contributes.grammars.language', 'Language identifier for which this syntax is contributed to.'),
                    type: 'string'
                },
                scopeName: {
                    description: nls.localize('vscode.extension.contributes.grammars.scopeName', 'Textmate scope name used by the tmLanguage file.'),
                    type: 'string'
                },
                path: {
                    description: nls.localize('vscode.extension.contributes.grammars.path', 'Path of the tmLanguage file. The path is relative to the extension folder and typically starts with \'./syntaxes/\'.'),
                    type: 'string'
                },
                embeddedLanguages: {
                    description: nls.localize('vscode.extension.contributes.grammars.embeddedLanguages', 'A map of scope name to language id if this grammar contains embedded languages.'),
                    type: 'object'
                },
                tokenTypes: {
                    description: nls.localize('vscode.extension.contributes.grammars.tokenTypes', 'A map of scope name to token types.'),
                    type: 'object',
                    additionalProperties: {
                        enum: ['string', 'comment', 'other']
                    }
                },
                injectTo: {
                    description: nls.localize('vscode.extension.contributes.grammars.injectTo', 'List of language scope names to which this grammar is injected to.'),
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                balancedBracketScopes: {
                    description: nls.localize('vscode.extension.contributes.grammars.balancedBracketScopes', 'Defines which scope names contain balanced brackets.'),
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    default: ['*'],
                },
                unbalancedBracketScopes: {
                    description: nls.localize('vscode.extension.contributes.grammars.unbalancedBracketScopes', 'Defines which scope names do not contain balanced brackets.'),
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    default: [],
                },
            },
            required: ['scopeName', 'path']
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVE1HcmFtbWFycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0TWF0ZS9jb21tb24vVE1HcmFtbWFycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxrQkFBa0IsRUFBbUIsTUFBTSwrQ0FBK0MsQ0FBQztBQUNwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQXFCN0UsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQStDLGtCQUFrQixDQUFDLHNCQUFzQixDQUE0QjtJQUNoSixjQUFjLEVBQUUsVUFBVTtJQUMxQixJQUFJLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQztJQUN6QixVQUFVLEVBQUU7UUFDWCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSxrQ0FBa0MsQ0FBQztRQUN0RyxJQUFJLEVBQUUsT0FBTztRQUNiLGVBQWUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsZ0NBQWdDLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDM0gsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLFFBQVE7WUFDZCxlQUFlLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxnQ0FBZ0MsRUFBRSxFQUFFLENBQUM7WUFDekgsVUFBVSxFQUFFO2dCQUNYLFFBQVEsRUFBRTtvQkFDVCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxnREFBZ0QsRUFBRSw4REFBOEQsQ0FBQztvQkFDM0ksSUFBSSxFQUFFLFFBQVE7aUJBQ2Q7Z0JBQ0QsU0FBUyxFQUFFO29CQUNWLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGlEQUFpRCxFQUFFLGtEQUFrRCxDQUFDO29CQUNoSSxJQUFJLEVBQUUsUUFBUTtpQkFDZDtnQkFDRCxJQUFJLEVBQUU7b0JBQ0wsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsNENBQTRDLEVBQUUsc0hBQXNILENBQUM7b0JBQy9MLElBQUksRUFBRSxRQUFRO2lCQUNkO2dCQUNELGlCQUFpQixFQUFFO29CQUNsQixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx5REFBeUQsRUFBRSxpRkFBaUYsQ0FBQztvQkFDdkssSUFBSSxFQUFFLFFBQVE7aUJBQ2Q7Z0JBQ0QsVUFBVSxFQUFFO29CQUNYLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGtEQUFrRCxFQUFFLHFDQUFxQyxDQUFDO29CQUNwSCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxvQkFBb0IsRUFBRTt3QkFDckIsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUM7cUJBQ3BDO2lCQUNEO2dCQUNELFFBQVEsRUFBRTtvQkFDVCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxnREFBZ0QsRUFBRSxvRUFBb0UsQ0FBQztvQkFDakosSUFBSSxFQUFFLE9BQU87b0JBQ2IsS0FBSyxFQUFFO3dCQUNOLElBQUksRUFBRSxRQUFRO3FCQUNkO2lCQUNEO2dCQUNELHFCQUFxQixFQUFFO29CQUN0QixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw2REFBNkQsRUFBRSxzREFBc0QsQ0FBQztvQkFDaEosSUFBSSxFQUFFLE9BQU87b0JBQ2IsS0FBSyxFQUFFO3dCQUNOLElBQUksRUFBRSxRQUFRO3FCQUNkO29CQUNELE9BQU8sRUFBRSxDQUFDLEdBQUcsQ0FBQztpQkFDZDtnQkFDRCx1QkFBdUIsRUFBRTtvQkFDeEIsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsK0RBQStELEVBQUUsNkRBQTZELENBQUM7b0JBQ3pKLElBQUksRUFBRSxPQUFPO29CQUNiLEtBQUssRUFBRTt3QkFDTixJQUFJLEVBQUUsUUFBUTtxQkFDZDtvQkFDRCxPQUFPLEVBQUUsRUFBRTtpQkFDWDthQUNEO1lBQ0QsUUFBUSxFQUFFLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQztTQUMvQjtLQUNEO0NBQ0QsQ0FBQyxDQUFDIn0=