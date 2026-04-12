/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { EXTENSION_CATEGORIES } from '../../../../platform/extensions/common/extensions.js';
import { ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';
export const SearchExtensionsToolId = 'vscode_searchExtensions_internal';
export const SearchExtensionsToolData = {
    id: SearchExtensionsToolId,
    toolReferenceName: 'extensions',
    legacyToolReferenceFullNames: ['extensions'],
    icon: ThemeIcon.fromId(Codicon.extensions.id),
    displayName: localize('searchExtensionsTool.displayName', 'Search Extensions'),
    modelDescription: 'This is a tool for browsing Visual Studio Code Extensions Marketplace. It allows the model to search for extensions and retrieve detailed information about them. The model should use this tool whenever it needs to discover extensions or resolve information about known ones. To use the tool, the model has to provide the category of the extensions, relevant search keywords, or known extension IDs. Note that search results may include false positives, so reviewing and filtering is recommended.',
    userDescription: localize('searchExtensionsTool.userDescription', 'Search for VS Code extensions'),
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            category: {
                type: 'string',
                description: 'The category of extensions to search for',
                enum: EXTENSION_CATEGORIES,
            },
            keywords: {
                type: 'array',
                items: {
                    type: 'string',
                },
                description: 'The keywords to search for',
            },
            ids: {
                type: 'array',
                items: {
                    type: 'string',
                },
                description: 'The ids of the extensions to search for',
            },
        },
    }
};
let SearchExtensionsTool = class SearchExtensionsTool {
    constructor(extensionWorkbenchService) {
        this.extensionWorkbenchService = extensionWorkbenchService;
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const params = invocation.parameters;
        if (!params.keywords?.length && !params.category && !params.ids?.length) {
            return {
                content: [{
                        kind: 'text',
                        value: localize('searchExtensionsTool.noInput', 'Please provide a category or keywords or ids to search for.')
                    }]
            };
        }
        const extensionsMap = new Map();
        const addExtension = (extensions) => {
            for (const extension of extensions) {
                if (extension.deprecationInfo || extension.isMalicious) {
                    continue;
                }
                extensionsMap.set(extension.identifier.id.toLowerCase(), {
                    id: extension.identifier.id,
                    name: extension.displayName,
                    description: extension.description,
                    installed: extension.state === 1 /* ExtensionState.Installed */,
                    installCount: extension.installCount ?? 0,
                    rating: extension.rating ?? 0,
                    categories: extension.categories ?? [],
                    tags: extension.gallery?.tags ?? []
                });
            }
        };
        const queryAndAddExtensions = async (text) => {
            const extensions = await this.extensionWorkbenchService.queryGallery({
                text,
                pageSize: 10,
                sortBy: "InstallCount" /* SortBy.InstallCount */
            }, token);
            if (extensions.firstPage.length) {
                addExtension(extensions.firstPage);
            }
        };
        // Search for extensions by their ids
        if (params.ids?.length) {
            const extensions = await this.extensionWorkbenchService.getExtensions(params.ids.map(id => ({ id })), token);
            addExtension(extensions);
        }
        if (params.keywords?.length) {
            for (const keyword of params.keywords ?? []) {
                if (keyword === 'featured') {
                    await queryAndAddExtensions('featured');
                }
                else {
                    let text = params.category ? `category:"${params.category}"` : '';
                    text = keyword ? `${text} ${keyword}`.trim() : text;
                    await queryAndAddExtensions(text);
                }
            }
        }
        else {
            await queryAndAddExtensions(`category:"${params.category}"`);
        }
        const result = Array.from(extensionsMap.values());
        return {
            content: [{
                    kind: 'text',
                    value: `Here are the list of extensions:\n${JSON.stringify(result)}\n. Important: Use the following format to display extensions to the user because there is a renderer available to parse these extensions in this format and display them with all details. So, do not describe about the extensions to the user.\n\`\`\`vscode-extensions\nextensionId1,extensionId2\n\`\`\`\n.`
                }],
            toolResultDetails: {
                input: JSON.stringify(params),
                output: [{ type: 'embed', isText: true, value: JSON.stringify(result.map(extension => extension.id)) }]
            }
        };
    }
};
SearchExtensionsTool = __decorate([
    __param(0, IExtensionsWorkbenchService)
], SearchExtensionsTool);
export { SearchExtensionsTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRXh0ZW5zaW9uc1Rvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2NvbW1vbi9zZWFyY2hFeHRlbnNpb25zVG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RixPQUFPLEVBQTJFLGNBQWMsRUFBZ0IsTUFBTSxzREFBc0QsQ0FBQztBQUM3SyxPQUFPLEVBQThCLDJCQUEyQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFbEcsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsa0NBQWtDLENBQUM7QUFFekUsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQWM7SUFDbEQsRUFBRSxFQUFFLHNCQUFzQjtJQUMxQixpQkFBaUIsRUFBRSxZQUFZO0lBQy9CLDRCQUE0QixFQUFFLENBQUMsWUFBWSxDQUFDO0lBQzVDLElBQUksRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO0lBQzdDLFdBQVcsRUFBRSxRQUFRLENBQUMsa0NBQWtDLEVBQUUsbUJBQW1CLENBQUM7SUFDOUUsZ0JBQWdCLEVBQUUsaWZBQWlmO0lBQ25nQixlQUFlLEVBQUUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLCtCQUErQixDQUFDO0lBQ2xHLE1BQU0sRUFBRSxjQUFjLENBQUMsUUFBUTtJQUMvQixXQUFXLEVBQUU7UUFDWixJQUFJLEVBQUUs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