/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { pickSnippet } from 'vs/workbench/contrib/snippets/browser/snippetPicker';
import { ISnippetsService } from './snippets.contribution';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionProvider, CodeActionContext, CodeActionList } from 'vs/editor/common/languages';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/browser/types';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Snippet } from 'vs/workbench/contrib/snippets/browser/snippetsFile';

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

class SurroundWithSnippet {
	constructor(
		private readonly _editor: ICodeEditor,
		@ISnippetsService private readonly _snippetService: ISnippetsService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) { }

	async getSurroundableSnippets(): Promise<Snippet[]> {
		if (!this._editor.hasModel()) {
			return [];
		}

		const model = this._editor.getModel();
		const { lineNumber, column } = this._editor.getPosition();
		model.tokenization.tokenizeIfCheap(lineNumber);
		const languageId = model.getLanguageIdAtPosition(lineNumber, column);

		const allSnippets = await this._snippetService.getSnippets(languageId, { includeNoPrefixSnippets: true, includeDisabledSnippets: true });
		return allSnippets.filter(snippet => snippet.usesSelection);
	}

	canExecute(): boolean {
		return this._contextKeyService.contextMatchesRules(options.precondition);
	}

	async run() {
		if (!this.canExecute()) {
			return;
		}

		const snippets = await this.getSurroundableSnippets();
		if (!snippets.length) {
			return;
		}

		const snippet = await this._instaService.invokeFunction(pickSnippet, snippets);
		if (!snippet) {
			return;
		}

		let clipboardText: string | undefined;
		if (snippet.needsClipboard) {
			clipboardText = await this._clipboardService.readText();
		}

		SnippetController2.get(this._editor)?.insert(snippet.codeSnippet, { clipboardText });
	}
}

class SurroundWithSnippetEditorAction extends EditorAction2 {
	constructor() {
		super(options);
	}
	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		const instaService = accessor.get(IInstantiationService);
		const core = instaService.createInstance(SurroundWithSnippet, editor);
		await core.run();
	}
}

registerAction2(SurroundWithSnippetEditorAction);


export class SurroundWithSnippetCodeActionProvider extends Disposable implements CodeActionProvider {
	private static readonly codeAction: CodeAction = {
		kind: CodeActionKind.Refactor.value,
		title: options.title.value,
		command: {
			id: options.id,
			title: options.title.value,
		},
	};

	private core: SurroundWithSnippet;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super();
		this.core = instaService.createInstance(SurroundWithSnippet, editor);
		this._register(languageFeaturesService.codeActionProvider.register('*', this));
	}

	async provideCodeActions(model: ITextModel, range: Range | Selection, context: CodeActionContext, token: CancellationToken): Promise<CodeActionList> {
		if (!this.core.canExecute()) {
			return { actions: [], dispose: () => { } };
		}
		const snippets = await this.core.getSurroundableSnippets();
		return {
			actions: snippets.length ? [SurroundWithSnippetCodeActionProvider.codeAction] : [],
			dispose: () => { }
		};
	}
}

registerEditorContribution(options.id, SurroundWithSnippetCodeActionProvider);
