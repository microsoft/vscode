/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { CodeAction, CodeActionList, CodeActionProvider, WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ApplyFileSnippetAction } from 'vs/workbench/contrib/snippets/browser/commands/fileTemplateSnippets';
import { getSurroundableSnippets, SurroundWithSnippetEditorAction } from 'vs/workbench/contrib/snippets/browser/commands/surroundWithSnippet';
import { Snippet } from 'vs/workbench/contrib/snippets/browser/snippetsFile';
import { ISnippetsService } from './snippets';

class SurroundWithSnippetCodeActionProvider implements CodeActionProvider {

	private static readonly _MAX_CODE_ACTIONS = 4;

	private static readonly _overflowCommandCodeAction: CodeAction = {
		kind: CodeActionKind.SurroundWith.value,
		title: localize('more', "More..."),
		command: {
			id: SurroundWithSnippetEditorAction.options.id,
			title: SurroundWithSnippetEditorAction.options.title.value,
		},
	};

	constructor(@ISnippetsService private readonly _snippetService: ISnippetsService) { }

	async provideCodeActions(model: ITextModel, range: Range | Selection): Promise<CodeActionList | undefined> {

		if (range.isEmpty()) {
			return undefined;
		}

		const position = Selection.isISelection(range) ? range.getPosition() : range.getStartPosition();
		const snippets = await getSurroundableSnippets(this._snippetService, model, position, false);
		if (!snippets.length) {
			return undefined;
		}

		const actions: CodeAction[] = [];
		for (const snippet of snippets) {
			if (actions.length >= SurroundWithSnippetCodeActionProvider._MAX_CODE_ACTIONS) {
				actions.push(SurroundWithSnippetCodeActionProvider._overflowCommandCodeAction);
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
}

class FileTemplateCodeActionProvider implements CodeActionProvider {

	private static readonly _MAX_CODE_ACTIONS = 4;

	private static readonly _overflowCommandCodeAction: CodeAction = {
		title: localize('overflow.start.title', 'Start with Snippet'),
		kind: CodeActionKind.SurroundWith.value,
		command: {
			id: ApplyFileSnippetAction.Id,
			title: ''
		}
	};

	readonly providedCodeActionKinds?: readonly string[] = [CodeActionKind.SurroundWith.value];

	constructor(@ISnippetsService private readonly _snippetService: ISnippetsService) { }

	async provideCodeActions(model: ITextModel) {
		if (model.getValueLength() !== 0) {
			return undefined;
		}

		const snippets = await this._snippetService.getSnippets(model.getLanguageId(), { fileTemplateSnippets: true, includeNoPrefixSnippets: true });
		const actions: CodeAction[] = [];
		for (const snippet of snippets) {
			if (actions.length >= FileTemplateCodeActionProvider._MAX_CODE_ACTIONS) {
				actions.push(FileTemplateCodeActionProvider._overflowCommandCodeAction);
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
}

function asWorkspaceEdit(model: ITextModel, range: IRange, snippet: Snippet): WorkspaceEdit {
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

export class SnippetCodeActions implements IWorkbenchContribution {

	private readonly _store = new DisposableStore();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService configService: IConfigurationService,
	) {

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

	dispose(): void {
		this._store.dispose();
	}
}
