/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { groupBy, isFalsyOrEmpty } from '../../../../../base/common/arrays.js';
import { compare } from '../../../../../base/common/strings.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { SnippetsAction } from './abstractSnippetsActions.js';
import { ISnippetsService } from '../snippets.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
export class ApplyFileSnippetAction extends SnippetsAction {
    static { this.Id = 'workbench.action.populateFileFromSnippet'; }
    constructor() {
        super({
            id: ApplyFileSnippetAction.Id,
            title: localize2('label', "Fill File with Snippet"),
            f1: true,
        });
    }
    async run(accessor) {
        const snippetService = accessor.get(ISnippetsService);
        const quickInputService = accessor.get(IQuickInputService);
        const editorService = accessor.get(IEditorService);
        const langService = accessor.get(ILanguageService);
        const editor = getCodeEditor(editorService.activeTextEditorControl);
        if (!editor || !editor.hasModel()) {
            return;
        }
        const resourceUri = editor.getModel().uri;
        const snippets = await snippetService.getSnippets(undefined, resourceUri, { fileTemplateSnippets: true, noRecencySort: true, includeNoPrefixSnippets: true });
        if (snippets.length === 0) {
            return;
        }
        const selection = await this._pick(quickInputService, langService, snippets);
        if (!selection) {
            return;
        }
        if (editor.hasModel()) {
            // apply snippet edit -> replaces everything
            SnippetController2.get(editor)?.apply([{
                    range: editor.getModel().getFullModelRange(),
                    template: selection.snippet.body
                }]);
            // set language if possible
            editor.getModel().setLanguage(langService.createById(selection.langId), ApplyFileSnippetAction.Id);
            editor.focus();
        }
    }
    async _pick(quickInputService, langService, snippets) {
        const all = [];
        for (const snippet of snippets) {
            if (isFalsyOrEmpty(snippet.scopes)) {
                all.push({ langId: '', snippet });
            }
            else {
                for (const langId of snippet.scopes) {
                    all.push({ langId, snippet });
                }
            }
        }
        const picks = [];
        const groups = groupBy(all, (a, b) => compare(a.langId, b.langId));
        for (const group of groups) {
            let first = true;
            for (const item of group) {
                if (first) {
                    picks.push({
                        type: 'separator',
                        label: langService.getLanguageName(item.langId) ?? item.langId
                    });
                    first = false;
                }
                picks.push({
                    snippet: item,
                    label: item.snippet.prefix || item.snippet.name,
                    detail: item.snippet.description
                });
            }
        }
        const pick = await quickInputService.pick(picks, {
            placeHolder: localize('placeholder', 'Select a snippet'),
            matchOnDetail: true,
        });
        return pick?.snippet;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZVRlbXBsYXRlU25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zbmlwcGV0cy9icm93c2VyL2NvbW1hbmRzL2ZpbGVUZW1wbGF0ZVNuaXBwZXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUN6RyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRTVELE9BQU8sRUFBRSxrQkFBa0IsRUFBdUMsTUFBTSx5REFBeUQsQ0FBQztBQUNsSSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFFbEQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXJGLE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxjQUFjO2FBRXpDLE9BQUUsR0FBRywwQ0FBMEMsQ0FBQztJQUVoRTtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxzQkFBc0IsQ0FBQyxFQUFFO1lBQzdCLEtBQUssRUFBRSxTQUFTLENBQUMsT0FBTyxFQUFFLHdCQUF3QixDQUFDO1lBQ25ELEVBQUUsRUFBRSxJQUFJO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUss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