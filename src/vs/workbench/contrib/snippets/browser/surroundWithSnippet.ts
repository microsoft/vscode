/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { pickSnippet } from 'vs/workbench/contrib/snippets/browser/snippetPicker';
import { ISnippetsService } from './snippets.contribution';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionProvider, CodeActionList } from 'vs/editor/common/languages';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/browser/types';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Range, IRange } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Snippet } from 'vs/workbench/contrib/snippets/browser/snippetsFile';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';

async function getSurroundableSnippets(snippetsService: ISnippetsService, model: ITextModel, position: Position): Promise<Snippet[]> {

	const { lineNumber, column } = position;
	model.tokenization.tokenizeIfCheap(lineNumber);
	const languageId = model.getLanguageIdAtPosition(lineNumber, column);

	const allSnippets = await snippetsService.getSnippets(languageId, { includeNoPrefixSnippets: true, includeDisabledSnippets: true });
	return allSnippets.filter(snippet => snippet.usesSelection);
}

class SurroundWithSnippetEditorAction extends EditorAction2 {

	static readonly options = {
		id: 'editor.action.surroundWithSnippet',
		title: {
			value: localize('label', 'Surround With Snippet...'),
			original: 'Surround With Snippet...'
		}
	};

	constructor() {
		super({
			...SurroundWithSnippetEditorAction.options,
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				EditorContextKeys.hasNonEmptySelection
			),
			f1: true,
		});
	}

	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor) {
		if (!editor.hasModel()) {
			return;
		}

		const instaService = accessor.get(IInstantiationService);
		const snippetsService = accessor.get(ISnippetsService);
		const clipboardService = accessor.get(IClipboardService);

		const snippets = await getSurroundableSnippets(snippetsService, editor.getModel(), editor.getPosition());
		if (!snippets.length) {
			return;
		}

		const snippet = await instaService.invokeFunction(pickSnippet, snippets);
		if (!snippet) {
			return;
		}

		let clipboardText: string | undefined;
		if (snippet.needsClipboard) {
			clipboardText = await clipboardService.readText();
		}

		SnippetController2.get(editor)?.insert(snippet.codeSnippet, { clipboardText });
		snippetsService.updateUsageTimestamp(snippet);
	}
}


class SurroundWithSnippetCodeActionProvider implements CodeActionProvider, IWorkbenchContribution {

	private static readonly _MAX_CODE_ACTIONS = 4;

	private static readonly _overflowCommandCodeAction: CodeAction = {
		kind: CodeActionKind.Refactor.value,
		title: SurroundWithSnippetEditorAction.options.title.value,
		command: {
			id: SurroundWithSnippetEditorAction.options.id,
			title: SurroundWithSnippetEditorAction.options.title.value,
		},
	};

	private readonly _registration: IDisposable;

	constructor(
		@ISnippetsService private readonly _snippetService: ISnippetsService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		this._registration = languageFeaturesService.codeActionProvider.register('*', this);
	}

	dispose(): void {
		this._registration.dispose();
	}

	async provideCodeActions(model: ITextModel, range: Range | Selection): Promise<CodeActionList | undefined> {

		const snippets = await getSurroundableSnippets(this._snippetService, model, range.getEndPosition());
		if (!snippets.length) {
			return undefined;
		}

		const actions: CodeAction[] = [];
		const hasMore = snippets.length > SurroundWithSnippetCodeActionProvider._MAX_CODE_ACTIONS;
		const len = Math.min(snippets.length, SurroundWithSnippetCodeActionProvider._MAX_CODE_ACTIONS);

		for (let i = 0; i < len; i++) {
			actions.push(this._makeCodeActionForSnippet(snippets[i], model, range));
		}
		if (hasMore) {
			actions.push(SurroundWithSnippetCodeActionProvider._overflowCommandCodeAction);
		}
		return {
			actions,
			dispose() { }
		};
	}

	private _makeCodeActionForSnippet(snippet: Snippet, model: ITextModel, range: IRange): CodeAction {
		return {
			title: localize('codeAction', "Surround With: {0}", snippet.name),
			kind: CodeActionKind.Refactor.value,
			edit: {
				edits: [{
					versionId: model.getVersionId(),
					resource: model.uri,
					textEdit: {
						range,
						text: snippet.body,
						insertAsSnippet: true,
					}
				}]
			}
		};
	}
}

registerAction2(SurroundWithSnippetEditorAction);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SurroundWithSnippetCodeActionProvider, LifecyclePhase.Restored);
