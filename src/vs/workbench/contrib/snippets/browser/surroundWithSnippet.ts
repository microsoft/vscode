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
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionProvider, CodeActionContext, CodeActionList } from 'vs/editor/common/languages';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/browser/types';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Range, IRange } from 'vs/editor/common/core/range';
import { URI } from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import { Snippet } from 'vs/workbench/contrib/snippets/browser/snippetsFile';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInputCapabilities } from 'vs/workbench/common/editor';

const options = {
	id: 'editor.action.surroundWithSnippet',
	title: {
		value: localize('label', 'Surround With Snippet...'),
		original: 'Surround With Snippet...'
	},
	precondition: ContextKeyExpr.and(
		EditorContextKeys.writable,
		EditorContextKeys.hasNonEmptySelection
	),
	f1: true,
};

const MAX_SNIPPETS_ON_CODE_ACTIONS_MENU = 6;

function makeCodeActionForSnippet(snippet: Snippet, resource: URI, range: IRange): CodeAction {
	const title = localize('codeAction', "Surround With Snippet: {0}", snippet.name);
	return {
		title,
		edit: {
			edits: [
				{
					versionId: undefined,
					resource: resource,
					textEdit: {
						insertAsSnippet: true,
						text: snippet.body,
						range: range
					}
				}
			]
		}
	};
}

async function getSurroundableSnippets(accessor: ServicesAccessor, model: ITextModel | null, position: Position | null): Promise<Snippet[]> {
	if (!model) {
		return [];
	}

	const snippetsService = accessor.get(ISnippetsService);

	let languageId: string;
	if (position) {
		const { lineNumber, column } = position;
		model.tokenization.tokenizeIfCheap(lineNumber);
		languageId = model.getLanguageIdAtPosition(lineNumber, column);
	} else {
		languageId = model.getLanguageId();
	}

	const allSnippets = await snippetsService.getSnippets(languageId, { includeNoPrefixSnippets: true, includeDisabledSnippets: true });
	return allSnippets.filter(snippet => snippet.usesSelection);
}

function canExecute(accessor: ServicesAccessor): boolean {
	const editorService = accessor.get(IEditorService);

	const editor = editorService.activeEditor;
	if (!editor || editor.hasCapability(EditorInputCapabilities.Readonly)) {
		return false;
	}
	const selections = editorService.activeTextEditorControl?.getSelections();
	return !!selections && selections.length > 0;
}

async function surroundWithSnippet(accessor: ServicesAccessor, editor: ICodeEditor) {
	const instaService = accessor.get(IInstantiationService);
	const clipboardService = accessor.get(IClipboardService);

	if (!canExecute(accessor)) {
		return;
	}

	const snippets = await getSurroundableSnippets(accessor, editor.getModel(), editor.getPosition());
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
}


registerAction2(class SurroundWithSnippetEditorAction extends EditorAction2 {
	constructor() {
		super(options);
	}
	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		await surroundWithSnippet(accessor, editor);
	}
});

export class SurroundWithSnippetCodeActionProvider extends Disposable implements CodeActionProvider, IWorkbenchContribution {
	private static readonly codeAction: CodeAction = {
		kind: CodeActionKind.Refactor.value,
		title: options.title.value,
		command: {
			id: options.id,
			title: options.title.value,
		},
	};

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instaService: IInstantiationService,
	) {
		super();
		this._register(languageFeaturesService.codeActionProvider.register('*', this));
	}

	async provideCodeActions(model: ITextModel, range: Range | Selection, context: CodeActionContext, token: CancellationToken): Promise<CodeActionList> {
		if (!this.instaService.invokeFunction(canExecute)) {
			return { actions: [], dispose: () => { } };
		}

		const snippets = await this.instaService.invokeFunction(accessor => getSurroundableSnippets(accessor, model, range.getEndPosition()));
		if (!snippets.length) {
			return { actions: [], dispose: () => { } };
		}
		return {
			actions: snippets.length <= MAX_SNIPPETS_ON_CODE_ACTIONS_MENU
				? snippets.map(x => makeCodeActionForSnippet(x, model.uri, range))
				: [SurroundWithSnippetCodeActionProvider.codeAction],
			dispose: () => { }
		};
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SurroundWithSnippetCodeActionProvider, LifecyclePhase.Restored);
