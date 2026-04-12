/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import * as nls from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { SnippetEditorAction } from './abstractSnippetsActions.js';
import { pickSnippet } from '../snippetPicker.js';
import { ISnippetsService } from '../snippets.js';
import { Snippet } from '../snippetsFile.js';
class Args {
    static fromUser(arg) {
        if (!arg || typeof arg !== 'object') {
            return Args._empty;
        }
        let { snippet, name, langId } = arg;
        if (typeof snippet !== 'string') {
            snippet = undefined;
        }
        if (typeof name !== 'string') {
            name = undefined;
        }
        if (typeof langId !== 'string') {
            langId = undefined;
        }
        return new Args(snippet, name, langId);
    }
    static { this._empty = new Args(undefined, undefined, undefined); }
    constructor(snippet, name, langId) {
        this.snippet = snippet;
        this.name = name;
        this.langId = langId;
    }
}
export class InsertSnippetAction extends SnippetEditorAction {
    constructor() {
        super({
            id: 'editor.action.insertSnippet',
            title: nls.localize2('snippet.suggestions.label', "Insert Snippet"),
            f1: true,
            precondition: EditorContextKeys.writable,
            metadata: {
                description: `Insert Snippet`,
                args: [{
                        name: 'args',
                        schema: {
                            'type': 'object',
                            'properties': {
                                'snippet': {
                                    'type': 'string'
                                },
                                'langId': {
                                    'type': 'string',
                                },
                                'name': {
                                    'type': 'string'
                                }
                            },
                        }
                    }]
            }
        });
    }
    async runEditorCommand(accessor, editor, arg) {
        const languageService = accessor.get(ILanguageService);
        const snippetService = accessor.get(ISnippetsService);
        if (!editor.hasModel()) {
            return;
        }
        const clipboardService = accessor.get(IClipboardService);
        const instaService = accessor.get(IInstantiationService);
        const snippet = await new Promise((resolve, reject) => {
            const { lineNumber, column } = editor.getPosition();
            const { snippet, name, langId } = Args.fromUser(arg);
            if (snippet) {
                return resolve(new Snippet(false, [], '', '', '', snippet, '', 1 /* SnippetSource.User */, `random/${Math.random()}`));
            }
            let languageId;
            if (langId) {
                if (!languageService.isRegisteredLanguageId(langId)) {
                    return resolve(undefined);
                }
                languageId = langId;
            }
            else {
                editor.getModel().tokenization.tokenizeIfCheap(lineNumber);
                languageId = editor.getModel().getLanguageIdAtPosition(lineNumber, column);
                // validate the `languageId` to ensure this is a user
                // facing language with a name and the chance to have
                // snippets, else fall back to the outer language
                if (!languageService.getLanguageName(languageId)) {
                    languageId = editor.getModel().getLanguageId();
                }
            }
            if (name) {
                // take selected snippet
                snippetService.getSnippets(languageId, undefined, { includeNoPrefixSnippets: true })
                    .then(snippets => snippets.find(snippet => snippet.name === name))
                    .then(resolve, reject);
            }
            else {
                // let user pick a snippet
                resolve(instaService.invokeFunction(pickSnippet, languageId, editor.getModel().uri));
            }
        });
        if (!snippet) {
            return;
        }
        let clipboardText;
        if (snippet.needsClipboard) {
            clipboardText = await clipboardService.readText();
        }
        editor.focus();
        SnippetController2.get(editor)?.insert(snippet.codeSnippet, { clipboardText });
        snippetService.updateUsageTimestamp(snippet);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zZXJ0U25pcHBldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NuaXBwZXRzL2Jyb3dzZXIvY29tbWFuZHMvaW5zZXJ0U25pcHBldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUN6RyxPQUFPLEtBQUssR0FBRyxNQUFNLHVCQUF1QixDQUFDO0FBQzdDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNsRCxPQUFPLEVBQUUsT0FBTyxFQUFpQixNQUFNLG9CQUFvQixDQUFDO0FBRTVELE1BQU0sSUFBSTtJQUVULE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBUTtRQUN2QixJQUFJLENBQUMsR0FBRyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3JDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUNwQixDQUFDO1FBQ0QsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDO1FBQ3BDLElBQUksT0FBTyxPQUFPLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDakMs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