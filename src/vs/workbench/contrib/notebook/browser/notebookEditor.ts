/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { EditorOptions, IEditorCloseEvent, IEditorMemento } from 'vs/workbench/common/editor';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { INotebookEditorViewState, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { NotebookRegistry } from 'vs/workbench/contrib/notebook/browser/notebookRegistry';

const NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'NotebookEditorViewState';

export class NotebookEditor extends BaseEditor {
	static readonly ID: string = 'workbench.editor.notebook';
	private editorMemento: IEditorMemento<INotebookEditorViewState>;
	private readonly groupListener = this._register(new MutableDisposable());
	private _widget?: NotebookEditorWidget;
	private _rootElement!: HTMLElement;
	private dimension: DOM.Dimension | null = null;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService) {
		super(NotebookEditor.ID, telemetryService, themeService, storageService);

		// this._widget = this.instantiationService.createInstance(NotebookEditorWidget);
		this.editorMemento = this.getEditorMemento<INotebookEditorViewState>(editorGroupService, NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY);
	}

	private readonly _onDidChangeModel = new Emitter<void>();
	readonly onDidChangeModel: Event<void> = this._onDidChangeModel.event;


	set viewModel(newModel: NotebookViewModel | undefined) {
		if (this._widget) {
			this._widget.viewModel = newModel;
			this._onDidChangeModel.fire();
		}
	}

	get viewModel() {
		return this._widget?.viewModel;
	}

	get minimumWidth(): number { return 375; }
	get maximumWidth(): number { return Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /*noop*/ }
	set maximumWidth(value: number) { /*noop*/ }


	//#region Editor Core


	public get isNotebookEditor() {
		return true;
	}

	protected createEditor(parent: HTMLElement): void {
		this._rootElement = DOM.append(parent, DOM.$('.notebook-editor'));

		// this._widget.createEditor();
		this._register(this.onDidFocus(() => this._widget?.updateEditorFocus()));
		this._register(this.onDidBlur(() => this._widget?.updateEditorFocus()));
	}

	getDomNode() {
		return this._rootElement;
	}

	getControl() {
		return this._widget;
	}

	onWillHide() {
		if (this.input && this.input instanceof NotebookEditorInput && !this.input.isDisposed()) {
			this.saveEditorViewState(this.input);
		}

		this._widget?.onWillHide();
		super.onHide();
	}

	setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);
		this.groupListener.value = ((group as IEditorGroupView).onWillCloseEditor(e => this.onWillCloseEditorInGroup(e)));
	}

	private onWillCloseEditorInGroup(e: IEditorCloseEvent): void {
		const editor = e.editor;
		if (!(editor instanceof NotebookEditorInput)) {
			return; // only handle files
		}

		if (editor === this.input) {
			this.saveEditorViewState(editor);
		}
	}

	focus() {
		super.focus();
		this._widget?.focus();
	}

	async setInput(input: NotebookEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		if (this.input instanceof NotebookEditorInput) {
			if (!this.input.isDisposed()) {
				// set a new input, let's hide previous input
				this.saveEditorViewState(this.input as NotebookEditorInput);
				this._widget?.onWillHide();
			}
		}

		await super.setInput(input, options, token);

		// input attached
		Event.once(input.onDispose)(() => {
			// make sure the editor widget is removed from the view
			const existingEditorWidgetForInput = NotebookRegistry.getNotebookEditorWidget(this.input as NotebookEditorInput);
			existingEditorWidgetForInput?.getDomNode().remove();
			existingEditorWidgetForInput?.dispose();
			NotebookRegistry.releaseNotebookEditorWidget(this.input as NotebookEditorInput);
		});


		const model = await input.resolve();
		const viewState = this.loadTextEditorViewState(input);
		const existingEditorWidgetForInput = NotebookRegistry.getNotebookEditorWidget(input);
		if (existingEditorWidgetForInput) {
			// hide current widget
			this._widget?.onWillHide();
			// previous widget is then detached
			// set the new one
			this._widget = existingEditorWidgetForInput;
		} else {
			// hide current widget
			this._widget?.onWillHide();
			// create a new widget
			this._widget = this.instantiationService.createInstance(NotebookEditorWidget);
			this._widget.createEditor();
			NotebookRegistry.claimNotebookEditorWidget(input, this._widget);
		}

		if (this.dimension) {
			this._widget.layout(this.dimension, this._rootElement);
		}

		this._widget.setModel(model.notebook, viewState, options);
	}

	clearInput(): void {
		this._widget?.onWillHide();
		this._widget = undefined;
		super.clearInput();
	}

	private saveEditorViewState(input: NotebookEditorInput): void {
		if (this.group && this._widget) {
			const state = this._widget.getEditorViewState();
			this.editorMemento.saveEditorState(this.group, input.resource, state);
		}
	}

	private loadTextEditorViewState(input: NotebookEditorInput): INotebookEditorViewState | undefined {
		if (this.group) {
			return this.editorMemento.loadEditorState(this.group, input.resource);
		}

		return;
	}

	layout(dimension: DOM.Dimension): void {
		DOM.toggleClass(this._rootElement, 'mid-width', dimension.width < 1000 && dimension.width >= 600);
		DOM.toggleClass(this._rootElement, 'narrow-width', dimension.width < 600);
		this.dimension = dimension;

		if (this._input === undefined || this._widget === undefined) {
			return;
		}

		if (this._input.resource?.toString() !== this._widget?.viewModel?.uri.toString()) {
			// input and widget mismatch
			// this happens when
			// 1. open document A, pin the document
			// 2. open document B
			// 3. close document B
			// 4. a layout is triggered
			return;
		}

		this._widget?.layout(this.dimension, this._rootElement);
	}

	protected saveState(): void {
		if (this.input instanceof NotebookEditorInput) {
			this.saveEditorViewState(this.input);
		}

		super.saveState();
	}

	//#endregion

	//#region Editor Features

	//#endregion

	dispose() {
		super.dispose();
	}

	toJSON(): any {
		return {
			notebookHandle: this.viewModel?.handle
		};
	}
}

