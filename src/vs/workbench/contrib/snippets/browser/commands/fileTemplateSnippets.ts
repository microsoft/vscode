/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy, isFalsyOrEmpty } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { localize, localize2 } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { SnippetsAction } from 'vs/workbench/contrib/snippets/browser/commands/abstractSnippetsActions';
import { ISnippetsService } from 'vs/workbench/contrib/snippets/browser/snippets';
import { Snippet } from 'vs/workbench/contrib/snippets/browser/snippetsFile';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class ApplyFileSnippetAction extends SnippetsAction {

	static readonly Id = 'workbench.action.populateFileFromSnippet';

	constructor() {
		super({
			id: ApplyFileSnippetAction.Id,
			title: localize2('label', "Fill File with Snippet"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const snippetService = accessor.get(ISnippetsService);
		const quickInputService = accessor.get(IQuickInputService);
		const editorService = accessor.get(IEditorService);
		const langService = accessor.get(ILanguageService);

		const editor = getCodeEditor(editorService.activeTextEditorControl);
		if (!editor || !editor.hasModel()) {
			return;
		}

		const snippets = await snippetService.getSnippets(undefined, { fileTemplateSnippets: true, noRecencySort: true, includeNoPrefixSnippets: true });
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

	private async _pick(quickInputService: IQuickInputService, langService: ILanguageService, snippets: Snippet[]) {

		// spread snippet onto each language it supports
		type SnippetAndLanguage = { langId: string; snippet: Snippet };
		const all: SnippetAndLanguage[] = [];
		for (const snippet of snippets) {
			if (isFalsyOrEmpty(snippet.scopes)) {
				all.push({ langId: '', snippet });
			} else {
				for (const langId of snippet.scopes) {
					all.push({ langId, snippet });
				}
			}
		}

		type SnippetAndLanguagePick = IQuickPickItem & { snippet: SnippetAndLanguage };
		const picks: (SnippetAndLanguagePick | IQuickPickSeparator)[] = [];

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
