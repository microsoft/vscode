/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { CodeWindow } from '../../../../../../base/browser/window.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { NotebookDiffEditorInput } from '../../../common/notebookDiffEditorInput.js';
import { NotebookInlineDiffDecorationContribution } from './notebookInlineDiff.js';
import { INotebookEditorOptions } from '../../notebookBrowser.js';
import { NotebookEditorExtensionsRegistry } from '../../notebookEditorExtensions.js';
import { NotebookEditorWidget } from '../../notebookEditorWidget.js';
import { NotebookOptions } from '../../notebookOptions.js';
import { IBorrowValue, INotebookEditorService } from '../../services/notebookEditorService.js';

export class NotebookInlineDiffWidget extends Disposable {

	private widget: IBorrowValue<NotebookEditorWidget> = { value: undefined };
	private position: DOM.IDomPosition | undefined;

	get editorWidget() {
		return this.widget.value;
	}

	constructor(
		private readonly rootElement: HTMLElement,
		private readonly groupId: number,
		private readonly window: CodeWindow,
		private readonly options: NotebookOptions,
		private dimension: DOM.Dimension | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookEditorService private readonly widgetService: INotebookEditorService) {
		super();
	}

	async show(input: NotebookDiffEditorInput, model: NotebookTextModel | undefined, previousModel: NotebookTextModel | undefined, options: INotebookEditorOptions | undefined) {
		if (!this.widget.value) {
			this.createNotebookWidget(input, this.groupId, this.rootElement);
		}

		if (this.dimension) {
			this.widget.value?.layout(this.dimension, this.rootElement, this.position);
		}

		if (model) {
			await this.widget.value?.setOptions({ ...options });
			this.widget.value?.notebookOptions.previousModelToCompare.set(previousModel, undefined);

			await this.widget.value!.setModel(model, options?.viewState);
		}
	}

	hide() {
		if (this.widget.value) {
			this.widget.value.notebookOptions.previousModelToCompare.set(undefined, undefined);
			this.widget.value.onWillHide();
		}
	}

	setLayout(dimension: DOM.Dimension, position: DOM.IDomPosition) {
		this.dimension = dimension;
		this.position = position;
	}

	private createNotebookWidget(input: NotebookDiffEditorInput, groupId: number, rootElement: HTMLElement | undefined) {
		const contributions = NotebookEditorExtensionsRegistry.getSomeEditorContributions([NotebookInlineDiffDecorationContribution.ID]);
		const menuIds = {
			notebookToolbar: MenuId.NotebookToolbar,
			cellTitleToolbar: MenuId.NotebookCellTitle,
			cellDeleteToolbar: MenuId.NotebookCellDelete,
			cellInsertToolbar: MenuId.NotebookCellBetween,
			cellTopInsertToolbar: MenuId.NotebookCellListTop,
			cellExecuteToolbar: MenuId.NotebookCellExecute,
			cellExecutePrimary: undefined,
		};
		const skipContributions = [
			'editor.contrib.review',
			'editor.contrib.floatingClickMenu',
			'editor.contrib.dirtydiff',
			'editor.contrib.testingOutputPeek',
			'editor.contrib.testingDecorations',
			'store.contrib.stickyScrollController',
			'editor.contrib.findController',
			'editor.contrib.emptyTextEditorHint',
		];
		const cellEditorContributions = EditorExtensionsRegistry.getEditorContributions().filter(c => skipContributions.indexOf(c.id) === -1);

		this.widget = <IBorrowValue<NotebookEditorWidget>>this.instantiationService.invokeFunction(this.widgetService.retrieveWidget,
			groupId, input, { contributions, menuIds, cellEditorContributions, options: this.options }, this.dimension, this.window);
		if (this.rootElement && this.widget.value!.getDomNode()) {
			this.rootElement.setAttribute('aria-flowto', this.widget.value!.getDomNode().id || '');
			DOM.setParentFlowTo(this.widget.value!.getDomNode(), this.rootElement);
		}
	}

	override dispose(): void {
		super.dispose();
		if (this.widget.value) {
			this.widget.value.dispose();
		}
	}
}
