/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { CodeAction, CodeActionList, CodeActionProvider, WorkspaceEdit } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ApplyFileSnippetAction } from './commands/fileTemplateSnippets.js';
import { getSurroundableSnippets, SurroundWithSnippetEditorAction } from './commands/surroundWithSnippet.js';
import { Snippet } from './snippetsFile.js';
import { ISnippetsService } from './snippets.js';

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
