/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { NotebookPromptCellController } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatController';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';

export class CellChatPart extends CellContentPart {
	// private _controller: NotebookCellChatController | undefined;

	get activeCell() {
		return this.currentCell;
	}

	private _mutableDisposable = this._register(new MutableDisposable());

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		_partContainer: HTMLElement,
		private readonly _editor: ICodeEditor | undefined,
		@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService

	) {
		super();
	}

	override didRenderCell(element: ICellViewModel): void {
		super.didRenderCell(element);

		if (this._editor?.hasModel() && element.language === 'prompt-cell') {
			this.fetchSession(this._editor, element);
		}

		this._mutableDisposable.value = this._editor?.onDidChangeModel(async e => {
			if (e.newModelUrl?.toString() === element.uri.toString() && this._editor?.hasModel() && element.language === 'prompt-cell') {
				this.fetchSession(this._editor, element);
			}
		});
	}

	private async fetchSession(activeEditor: IActiveCodeEditor, element: ICellViewModel) {
		const controller = NotebookPromptCellController.get(this._notebookEditor);
		const session = await controller?.acquireSession(activeEditor);
		console.log(session);

		if (session && element.getText() === '') {
			const placeholder = session.session.placeholder;

			const decoration = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: placeholder ?? 'Ask a question',
							color: '#A6A6A6'
						}
					}
				}
			];

			const decorationDescription = 'chat';
			const placeholderDecorationType = 'chat-session-detail';
			activeEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, decoration);

			this.cellDisposables.add(activeEditor.getModel()?.onDidChangeContent(() => {
				if (activeEditor.getModel().getValueLength() > 0) {
					activeEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, []);
				}
			}));

			this.cellDisposables.add(this._languageFeatureService.completionProvider.register({ scheme: Schemas.vscodeNotebookCell, language: 'prompt-cell', hasAccessToAllModels: true }, {
				_debugDisplayName: 'notebook cell chat commands',
				triggerCharacters: ['/'],
				provideCompletionItems: (model, position, context, token) => {
					const slashCommands = session.session.slashCommands ?? [];
					const result: CompletionList = { suggestions: [], incomplete: false };
					slashCommands.forEach(command => {
						result.suggestions.push({
							label: { label: `/${command.command}`, description: command.detail ?? '' },
							kind: CompletionItemKind.Text,
							insertText: `/${command.command}`,
							range: Range.fromPositions(new Position(1, 1), position),
						});
					});

					return result;
				}
			}));
		}
	}

	override unrenderCell(element: ICellViewModel): void {
		super.unrenderCell(element);
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
	}

	override dispose() {
		super.dispose();
	}
}

