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
import { localize } from '../../../../nls.js';
import { getLocation, parse } from '../../../../base/common/json.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
let ExtensionsCompletionItemsProvider = class ExtensionsCompletionItemsProvider extends Disposable {
    constructor(extensionManagementService, languageFeaturesService) {
        super();
        this.extensionManagementService = extensionManagementService;
        this._register(languageFeaturesService.completionProvider.register({ language: 'jsonc', pattern: '**/settings.json' }, {
            _debugDisplayName: 'extensionsCompletionProvider',
            provideCompletionItems: async (model, position, _context, token) => {
                const getWordRangeAtPosition = (model, position) => {
                    const wordAtPosition = model.getWordAtPosition(position);
                    return wordAtPosition ? new Range(position.lineNumber, wordAtPosition.startColumn, position.lineNumber, wordAtPosition.endColumn) : null;
                };
                const location = getLocation(model.getValue(), model.getOffsetAt(position));
                const range = getWordRangeAtPosition(model, position) ?? Range.fromPositions(position, position);
                // extensions.supportUntrustedWorkspaces
                if (location.path[0] === 'extensions.supportUntrustedWorkspaces' && location.path.length === 2 && location.isAtPropertyKey) {
                    let alreadyConfigured = [];
                    try {
                        alreadyConfigured = Object.keys(parse(model.getValue())['extensions.supportUntrustedWorkspaces']);
                    }
                    catch (e) { /* ignore error */ }
                    return { suggestions: await this.provideSupportUntrustedWorkspacesExtensionProposals(alreadyConfigured, range) };
                }
                return { suggestions: [] };
            }
        }));
    }
    async provideSupportUntrustedWorkspacesExtensionProposals(alreadyConfigured, range) {
        const suggestions = [];
        const installedExtensions = (await this.extensionManagementService.getInstalled()).filter(e => e.manifest.main);
        const proposedExtensions = installedExtensions.filter(e => alreadyConfigured.indexOf(e.identifier.id) === -1);
        if (proposedExtensions.length) {
            suggestions.push(...proposedExtensions.map(e => {
                const text = `"${e.identifier.id}": {\n\t"supported": true,\n\t"version": "${e.manifest.version}"\n},`;
                return { label: e.identifier.id, kind: 13 /* CompletionItemKind.Value */, insertText: text, filterText: text, range };
            }));
        }
        else {
            const text = '"vscode.csharp": {\n\t"supported": true,\n\t"version": "0.0.0"\n},';
            suggestions.push({ label: localize('exampleExtension', "Example"), kind: 13 /* CompletionItemKind.Value */, insertText: text, filterText: text, range });
        }
        return suggestions;
    }
};
ExtensionsCompletionItemsProvider = __decorate([
    __param(0, IExtensionManagementService),
    __param(1, ILanguageFeaturesService)
], ExtensionsCompletionItemsProvider);
export { ExtensionsCompletionItemsProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc0NvbXBsZXRpb25JdGVtc1Byb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNDb21wbGV0aW9uSXRlbXNQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJbEUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFckgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRzNGLElBQU0saUNBQWlDLEdBQXZDLE1BQU0saUNBQWtDLFNBQVEsVUFBVTtJQUNoRSxZQUMrQywwQkFBdUQsRUFDM0UsdUJBQWlEO1FBRTNFLEtBQUssRUFBRSxDQUFDO1FBSHNDLCtCQUEwQixHQUExQiwwQkFBMEIsQ0FBNkI7UUFLckcsSUFBSSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxFQUFFO1lBQ3RILGlCQUFpQixFQUFFLDhCQUE4QjtZQUNqRCxzQkFBc0IsRUFBRSxLQUFLLEVBQUUsS0FBaUIsRUFBRSxRQUFrQixFQUFFLFFBQTJCLEVBQUUsS0FBd0IsRUFBMkIsRUFBRTtnQkFDdkosTUFBTSxzQkFBc0IsR0FBRyxDQUFDLEtB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