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
var SurroundWithSnippetCodeActionProvider_1, FileTemplateCodeActionProvider_1;
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ApplyFileSnippetAction } from './commands/fileTemplateSnippets.js';
import { getSurroundableSnippets, SurroundWithSnippetEditorAction } from './commands/surroundWithSnippet.js';
import { ISnippetsService } from './snippets.js';
let SurroundWithSnippetCodeActionProvider = class SurroundWithSnippetCodeActionProvider {
    static { SurroundWithSnippetCodeActionProvider_1 = this; }
    static { this._MAX_CODE_ACTIONS = 4; }
    static { this._overflowCommandCodeAction = {
        kind: CodeActionKind.SurroundWith.value,
        title: localize('more', "More..."),
        command: {
            id: SurroundWithSnippetEditorAction.options.id,
            title: SurroundWithSnippetEditorAction.options.title.value,
        },
    }; }
    constructor(_snippetService) {
        this._snippetService = _snippetService;
    }
    async provideCodeActions(model, range) {
        if (range.isEmpty()) {
            return undefined;
        }
        const position = Selection.isISelection(range) ? range.getPosition() : range.getStartPosition();
        const snippets = await getSurroundableSnippets(this._snippetService, model, position, false);
        if (!snippets.length) {
            return undefined;
        }
        const actions = [];
        for (const snippet of snippets) {
            if (actions.length >= SurroundWithSnippetCodeActionProvider_1._MAX_CODE_ACTIONS) {
                actions.push(SurroundWithSnippetCodeActionProvider_1._overflowCommandCodeAction);
                break;
            }
            actions.push({
                title: localize('codeAction', "{0}", snippet.name),
                kind: CodeActionKind.SurroundWith.value,
                edit: asWorkspaceEdit(model, range, snippet)
            });
        }
        return {
            actions,
            dispose() { }
        };
    }
};
SurroundWithSnippetCodeActionProvider = SurroundWithSnippetCodeActionProvider_1 = __decorate([
    __param(0, ISnippetsService)
], SurroundWithSnippetCodeActionProvider);
let FileTemplateCodeActionProvider = class FileTemplateCodeActionProvider {
    static { FileTemplateCodeActionProvider_1 = this; }
    static { this._MAX_CODE_ACTIONS = 4; }
    static { this._overflowCommandCodeAction = {
        title: localize('overflow.start.title', 'Start with Snippet'),
        kind: CodeActionKind.SurroundWith.value,
        command: {
            id: ApplyFileSnippetAction.Id,
            title: ''
        }
    }; }
    constructor(_snippetService) {
        this._snippetService = _snippetService;
        this.providedCodeActionKinds = [CodeActionKind.SurroundWith.value];
    }
    async provideCodeActions(model) {
        if (model.getValueLength() !== 0) {
            return undefined;
        }
        const snippets = await this._snippetService.getSnippets(model.getLanguageId(), model.uri, { fileTemplateSnippets: true, includeNoPrefixSnippets: true });
        const actions = [];
        for (const snippet of snippets) {
            if (actions.length >= FileTemplateCodeActionProvider_1._MAX_CODE_ACTIONS) {
                actions.push(FileTemplateCodeActionProvider_1._overflowCommandCodeAction);
                break;
            }
            actions.push({
                title: localize('title', 'Start with: {0}', snippet.name),
                kind: CodeActionKind.SurroundWith.value,
                edit: asWorkspaceEdit(model, model.getFullModelRange(), snippet)
            });
        }
        return {
            actions,
            dispose() { }
        };
    }
};
FileTemplateCodeActionProvider = FileTemplateCodeActionProvider_1 = __decorate([
    __param(0, ISnippetsService)
], FileTemplateCodeActionProvider);
function asWorkspaceEdit(model, range, snippet) {
    return {
        edits: [{
                versionId: model.getVersionId(),
                resource: model.uri,
                textEdit: {
                    range,
                    text: snippet.body,
                    insertAsSnippet: true,
                }
            }]
    };
}
let SnippetCodeActions = class SnippetCodeActions {
    constructor(instantiationService, languageFeaturesService, configService) {
        this._store = new DisposableStore();
        const setting = 'editor.snippets.codeActions.enabled';
        const sessionStore = new DisposableStore();
        const update = () => {
            sessionStore.clear();
            if (configService.getValue(setting)) {
                sessionStore.add(languageFeaturesService.codeActionProvider.register('*', instantiationService.createInstance(SurroundWithSnippetCodeActionProvider)));
                sessionStore.add(languageFeaturesService.codeActionProvider.register('*', instantiationService.createInstance(FileTemplateCodeActionProvider)));
            }
        };
        update();
        this._store.add(configService.onDidChangeConfiguration(e => e.affectsConfiguration(setting) && update()));
        this._store.add(sessionStore);
    }
    dispose() {
        this._store.dispose();
    }
};
SnippetCodeActions = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILanguageFeaturesService),
    __param(2, IConfigurationService)
], SnippetCodeActions);
export { SnippetCodeActions };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldENvZGVBY3Rpb25Qcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NuaXBwZXRzL2Jyb3dzZXIvc25pcHBldENvZGVBY3Rpb25Qcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUd4RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDdkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTdHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUVqRCxJQUFNLHFDQUFxQyxHQUEzQyxNQUFNLHFDQUFxQzs7YUFFbEIsc0JBQWlCLEdBQUcsQ0FBQyxBQUFKLENBQUs7YUFFdEIsK0JBQTBCLEdBQWU7UUFDaEUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxZQUFZLENBQUMsS0FBSztRQUN2QyxLQUFLLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUM7UUFDbEMsT0FBTyxFQUFFO1lBQ1IsRUFBRSxFQUFFLCtCQUErQixD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