/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/interactive';
import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { InteractiveEditorInput } from 'vs/workbench/contrib/interactive/browser/interactiveEditorInput';
import { INotebookEditorOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IBorrowValue, INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

export class InteractiveEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.interactive';

	#rootElement!: HTMLElement;
	#notebookEditorContainer!: HTMLElement;
	#notebookWidget: IBorrowValue<NotebookEditorWidget> = { value: undefined };
	#inputEditorContainer!: HTMLElement;
	#codeEditorWidget!: CodeEditorWidget;
	// #inputLineCount = 1;
	#notebookWidgetService: INotebookEditorService;
	#instantiationService: IInstantiationService;
	#modelService: IModelService;
	#dimension?: DOM.Dimension;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookEditorService notebookWidgetService: INotebookEditorService,
		@IModelService modelService: IModelService,
	) {
		super(
			InteractiveEditor.ID,
			telemetryService,
			themeService,
			storageService
		);
		this.#instantiationService = instantiationService;
		this.#notebookWidgetService = notebookWidgetService;
		this.#modelService = modelService;
	}

	protected createEditor(parent: HTMLElement): void {
		this.#rootElement = DOM.append(parent, DOM.$('.interactive-editor'));
		this.#rootElement.style.position = 'relative';

		// throw new Error('Method not implemented.');
		this.#notebookEditorContainer = DOM.append(this.#rootElement, DOM.$('.notebook-editor-container'));
		this.#inputEditorContainer = DOM.append(this.#rootElement, DOM.$('.input-editor-container'));
		this.#inputEditorContainer.style.position = 'absolute';
		this.#inputEditorContainer.style.height = `${19}px`;
	}

	override async setInput(input: InteractiveEditorInput, options: INotebookEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const group = this.group!;
		const notebookInput = input.notebookEditorInput;

		// there currently is a widget which we still own so
		// we need to hide it before getting a new widget
		if (this.#notebookWidget.value) {
			this.#notebookWidget.value.onWillHide();
		}

		this.#notebookWidget = this.#instantiationService.invokeFunction(this.#notebookWidgetService.retrieveWidget, group, notebookInput);
		this.#codeEditorWidget = this.#instantiationService.createInstance(CodeEditorWidget, this.#inputEditorContainer, getSimpleEditorOptions(), getSimpleCodeEditorWidgetOptions());

		if (this.#dimension) {
			this.#notebookWidget.value!.layout(this.#dimension.with(this.#dimension.width, this.#dimension.height - 19), this.#rootElement);
			this.#codeEditorWidget.layout(new DOM.Dimension(this.#dimension.width, 19));
			this.#inputEditorContainer.style.top = `${this.#dimension.height - 19}px`;
		}

		await super.setInput(input, options, context, token);
		const model = await input.resolve();

		if (model === null) {
			throw new Error('?');
		}

		// this.#widget.value?.setParentContextKeyService(this._contextKeyService);
		await this.#notebookWidget.value!.setModel(model.notebook, undefined);
		this.#notebookWidget.value!.setOptions({
			isReadOnly: true
		});

		const editorModel = this.#modelService.getModel(URI.parse(`interactive:replinput`)) || this.#modelService.createModel('', null, URI.parse(`interactive:replinput`), true);
		this.#codeEditorWidget.setModel(editorModel);
		this.#codeEditorWidget.onDidContentSizeChange(e => {
			if (!e.contentHeightChanged) {
				return;
			}

			const contentHeight = this.#codeEditorWidget.getContentHeight();

			if (this.#dimension) {
				this.#notebookWidget.value!.layout(this.#dimension.with(this.#dimension.width, this.#dimension.height - contentHeight), this.#rootElement);
				this.#codeEditorWidget.layout(new DOM.Dimension(this.#dimension.width, contentHeight));
				this.#inputEditorContainer.style.top = `${this.#dimension.height - contentHeight}px`;
			}
		});
	}

	layout(dimension: DOM.Dimension): void {
		this.#rootElement.classList.toggle('mid-width', dimension.width < 1000 && dimension.width >= 600);
		this.#rootElement.classList.toggle('narrow-width', dimension.width < 600);
		this.#dimension = dimension;

		if (!this.#notebookWidget.value) {
			return;
		}

		this.#notebookEditorContainer.style.height = `${this.#dimension.height - 19}px`;
		this.#inputEditorContainer.style.top = `${this.#dimension.height - 19}px`;

		this.#codeEditorWidget.layout(new DOM.Dimension(this.#dimension.width, 19));
		this.#notebookWidget.value!.layout(this.#dimension.with(this.#dimension.width, this.#dimension.height - 19), this.#rootElement);
	}

	override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);

		if (!visible) {
			if (this.input && this.#notebookWidget.value) {
				this.#notebookWidget.value.onWillHide();
			}
		}
	}

	override clearInput() {
		if (this.#notebookWidget.value) {
			this.#notebookWidget.value.onWillHide();
		}

		super.clearInput();
	}

	override getControl(): { notebookEditor: NotebookEditorWidget | undefined, codeEditor: CodeEditorWidget; } {
		return {
			notebookEditor: this.#notebookWidget.value,
			codeEditor: this.#codeEditorWidget
		};
	}
}
