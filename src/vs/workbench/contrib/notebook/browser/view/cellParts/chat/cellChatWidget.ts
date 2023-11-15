/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, addDisposableListener, append, getTotalWidth, h } from 'vs/base/browser/dom';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Disposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { URI } from 'vs/base/common/uri';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { localize } from 'vs/nls';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { _inputEditorOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellFocusMode, ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export const CTX_NOTEBOOK_CELL_CHAT_FOCUSED = new RawContextKey<boolean>('notebookCellChatFocused', false, localize('notebookCellChatFocused', "Whether the cell chat editor is focused"));
export const MENU_NOTEBOOK_CELL_CHAT_WIDGET = MenuId.for('notebookCellChatWidget');

export class CellChatWidget extends Disposable {
	private static _modelPool: number = 1;

	private readonly _elements = h(
		'div.cell-chat-container@root',
		[
			h('div.body', [
				h('div.content@content', [
					h('div.input@input', [
						h('div.editor-placeholder@placeholder'),
						h('div.editor-container@editor'),
					]),
					h('div.toolbar@editorToolbar'),
				]),
			]),
			h('div.progress@progress'),
			h('div.status@status')
		]
	);
	private readonly _progressBar: ProgressBar;
	private readonly _toolbar: MenuWorkbenchToolBar;

	private readonly _inputEditor: IActiveCodeEditor;
	private readonly _inputModel: ITextModel;
	private readonly _ctxInputEditorFocused: IContextKey<boolean>;

	private _activeCell: ICellViewModel | undefined;

	set placeholder(value: string) {
		this._elements.placeholder.innerText = value;
	}


	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		private readonly _partContainer: HTMLElement,
		@IModelService private readonly _modelService: IModelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		append(_partContainer, this._elements.root);
		this._elements.input.style.height = '24px';

		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				SnippetController2.ID,
				SuggestController.ID
			])
		};

		this._inputEditor = <IActiveCodeEditor>this._instantiationService.createInstance(CodeEditorWidget, this._elements.editor, {
			..._inputEditorOptions,
			ariaLabel: localize('cell-chat-aria-label', "Cell Chat Input"),
		}, codeEditorWidgetOptions);
		this._register(this._inputEditor);
		const uri = URI.from({ scheme: 'vscode', authority: 'inline-chat', path: `/notebook-cell-chat/model${CellChatWidget._modelPool++}.txt` });
		this._inputModel = this._register(this._modelService.getModel(uri) ?? this._modelService.createModel('', null, uri));
		this._inputEditor.setModel(this._inputModel);

		// placeholder
		this._elements.placeholder.style.fontSize = `${this._inputEditor.getOption(EditorOption.fontSize)}px`;
		this._elements.placeholder.style.lineHeight = `${this._inputEditor.getOption(EditorOption.lineHeight)}px`;
		this._register(addDisposableListener(this._elements.placeholder, 'click', () => this._inputEditor.focus()));

		const togglePlaceholder = () => {
			const hasText = this._inputModel.getValueLength() > 0;
			this._elements.placeholder.classList.toggle('hidden', hasText);
		};
		this._store.add(this._inputModel.onDidChangeContent(togglePlaceholder));
		togglePlaceholder();

		// toolbar
		this._toolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.editorToolbar, MENU_NOTEBOOK_CELL_CHAT_WIDGET, {
			telemetrySource: 'interactiveEditorWidget-toolbar',
			toolbarOptions: { primaryGroup: 'main' }
		}));

		// Create chat response div
		const copilotGeneratedCodeSpan = $('span.copilot-generated-code', {}, 'Copilot generated code may be incorrect');
		this._elements.status.appendChild(copilotGeneratedCodeSpan);

		this._register(this._inputEditor.onDidFocusEditorWidget(() => {
			if (this._activeCell) {
				this._activeCell.focusMode = CellFocusMode.ChatInput;
			}
		}));

		this._ctxInputEditorFocused = CTX_NOTEBOOK_CELL_CHAT_FOCUSED.bindTo(this._contextKeyService);
		this._register(this._inputEditor.onDidFocusEditorWidget(() => {
			this._ctxInputEditorFocused.set(true);
		}));
		this._register(this._inputEditor.onDidBlurEditorWidget(() => {
			this._ctxInputEditorFocused.set(false);
		}));

		this._progressBar = new ProgressBar(this._elements.progress);
		this._register(this._progressBar);
	}

	show(element: ICellViewModel) {
		this._partContainer.style.display = 'block';

		this._activeCell = element;

		this._toolbar.context = <INotebookCellActionContext>{
			ui: true,
			cell: element,
			notebookEditor: this._notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};

		this.layout();
		this._inputEditor.focus();
		this._activeCell.chatHeight = 82 + 8 /* bottom margin*/;
	}

	hide() {
		this._partContainer.style.display = 'none';
		if (this._activeCell) {
			this._activeCell.chatHeight = 0;
		}
	}

	getInput() {
		return this._inputEditor.getValue();
	}

	updateProgress(show: boolean) {
		if (show) {
			this._progressBar.infinite();
		} else {
			this._progressBar.stop();
		}
	}

	layout() {
		if (this._activeCell) {
			const innerEditorWidth = this._activeCell.layoutInfo.editorWidth - (getTotalWidth(this._elements.editorToolbar) + 8 /* L/R-padding */);
			this._inputEditor.layout(new Dimension(innerEditorWidth, this._inputEditor.getContentHeight()));
		}
	}
}
