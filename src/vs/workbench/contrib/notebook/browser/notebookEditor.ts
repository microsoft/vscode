/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, toAction } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { createErrorWithActions } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { extname, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { localize } from 'vs/nls';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, EditorPaneSelectionChangeReason, EditorPaneSelectionCompareResult, EditorResourceAccessor, IEditorMemento, IEditorOpenContext, IEditorPaneSelection, IEditorPaneSelectionChangeEvent, IEditorPaneWithSelection } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { INotebookEditorOptions, INotebookEditorViewState } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IBorrowValue, INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { NotebooKernelActionViewItem } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookKernelActionViewItem';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { NotebookPerfMarks } from 'vs/workbench/contrib/notebook/common/notebookPerformance';
import { IEditorDropService } from 'vs/workbench/services/editor/browser/editorDropService';
import { GroupsOrder, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'NotebookEditorViewState';

export class NotebookEditor extends EditorPane implements IEditorPaneWithSelection {
	static readonly ID: string = NOTEBOOK_EDITOR_ID;

	private readonly _editorMemento: IEditorMemento<INotebookEditorViewState>;
	private readonly _groupListener = this._register(new DisposableStore());
	private readonly _widgetDisposableStore: DisposableStore = this._register(new DisposableStore());
	private _widget: IBorrowValue<NotebookEditorWidget> = { value: undefined };
	private _rootElement!: HTMLElement;
	private _dimension?: DOM.Dimension;

	private readonly _inputListener = this._register(new MutableDisposable());

	// override onDidFocus and onDidBlur to be based on the NotebookEditorWidget element
	private readonly _onDidFocusWidget = this._register(new Emitter<void>());
	override get onDidFocus(): Event<void> { return this._onDidFocusWidget.event; }
	private readonly _onDidBlurWidget = this._register(new Emitter<void>());
	override get onDidBlur(): Event<void> { return this._onDidBlurWidget.event; }

	private readonly _onDidChangeModel = this._register(new Emitter<void>());
	readonly onDidChangeModel: Event<void> = this._onDidChangeModel.event;

	private readonly _onDidChangeSelection = this._register(new Emitter<IEditorPaneSelectionChangeEvent>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IEditorDropService private readonly _editorDropService: IEditorDropService,
		@INotebookEditorService private readonly _notebookWidgetService: INotebookEditorService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IFileService private readonly _fileService: IFileService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService
	) {
		super(NotebookEditor.ID, telemetryService, themeService, storageService);
		this._editorMemento = this.getEditorMemento<INotebookEditorViewState>(_editorGroupService, configurationService, NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY);

		this._register(this._fileService.onDidChangeFileSystemProviderCapabilities(e => this._onDidChangeFileSystemProvider(e.scheme)));
		this._register(this._fileService.onDidChangeFileSystemProviderRegistrations(e => this._onDidChangeFileSystemProvider(e.scheme)));
	}

	private _onDidChangeFileSystemProvider(scheme: string): void {
		if (this.input instanceof NotebookEditorInput && this.input.resource?.scheme === scheme) {
			this._updateReadonly(this.input);
		}
	}

	private _onDidChangeInputCapabilities(input: NotebookEditorInput): void {
		if (this.input === input) {
			this._updateReadonly(input);
		}
	}

	private _updateReadonly(input: NotebookEditorInput): void {
		this._widget.value?.setOptions({ isReadOnly: input.hasCapability(EditorInputCapabilities.Readonly) });
	}

	get textModel(): NotebookTextModel | undefined {
		return this._widget.value?.textModel;
	}

	override get minimumWidth(): number { return 220; }
	override get maximumWidth(): number { return Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from EditorPane
	override set minimumWidth(value: number) { /*noop*/ }
	override set maximumWidth(value: number) { /*noop*/ }

	//#region Editor Core
	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._widget.value?.scopedContextKeyService;
	}

	protected createEditor(parent: HTMLElement): void {
		this._rootElement = DOM.append(parent, DOM.$('.notebook-editor'));
		this._rootElement.id = `notebook-editor-element-${generateUuid()}`;
	}

	override getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === SELECT_KERNEL_ID) {
			// this is being disposed by the consumer
			return this._instantiationService.createInstance(NotebooKernelActionViewItem, action, this);
		}
		return undefined;
	}

	override getControl(): NotebookEditorWidget | undefined {
		return this._widget.value;
	}

	override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);
		if (group) {
			this._groupListener.clear();
			this._groupListener.add(group.onWillCloseEditor(e => this._saveEditorViewState(e.editor)));
			this._groupListener.add(group.onDidModelChange(() => {
				if (this._editorGroupService.activeGroup !== group) {
					this._widget?.value?.updateEditorFocus();
				}
			}));
		}

		if (!visible) {
			this._saveEditorViewState(this.input);
			if (this.input && this._widget.value) {
				// the widget is not transfered to other editor inputs
				this._widget.value.onWillHide();
			}
		}
	}

	override focus() {
		super.focus();
		this._widget.value?.focus();
	}

	override hasFocus(): boolean {
		const activeElement = document.activeElement;
		const value = this._widget.value;

		return !!value && (DOM.isAncestor(activeElement, value.getDomNode() || DOM.isAncestor(activeElement, value.getOverflowContainerDomNode())));
	}

	override async setInput(input: NotebookEditorInput, options: INotebookEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken, noRetry?: boolean): Promise<void> {
		try {
			const perf = new NotebookPerfMarks();
			perf.mark('startTime');
			const group = this.group!;

			this._inputListener.value = input.onDidChangeCapabilities(() => this._onDidChangeInputCapabilities(input));

			this._widgetDisposableStore.clear();

			// there currently is a widget which we still own so
			// we need to hide it before getting a new widget
			this._widget.value?.onWillHide();

			this._widget = <IBorrowValue<NotebookEditorWidget>>this._instantiationService.invokeFunction(this._notebookWidgetService.retrieveWidget, group, input, undefined, this._dimension);

			if (this._rootElement && this._widget.value!.getDomNode()) {
				this._rootElement.setAttribute('aria-flowto', this._widget.value!.getDomNode().id || '');
				DOM.setParentFlowTo(this._widget.value!.getDomNode(), this._rootElement);
			}

			this._widgetDisposableStore.add(this._widget.value!.onDidChangeModel(() => this._onDidChangeModel.fire()));
			this._widgetDisposableStore.add(this._widget.value!.onDidChangeActiveCell(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.USER })));

			if (this._dimension) {
				this._widget.value!.layout(this._dimension, this._rootElement);
			}

			// only now `setInput` and yield/await. this is AFTER the actual widget is ready. This is very important
			// so that others synchronously receive a notebook editor with the correct widget being set
			await super.setInput(input, options, context, token);
			const model = await input.resolve(perf);
			perf.mark('inputLoaded');

			// Check for cancellation
			if (token.isCancellationRequested) {
				return undefined;
			}

			// The widget has been taken away again. This can happen when the tab has been closed while
			// loading was in progress, in particular when open the same resource as different view type.
			// When this happen, retry once
			if (!this._widget.value) {
				if (noRetry) {
					return undefined;
				}
				return this.setInput(input, options, context, token, true);
			}

			if (model === null) {
				throw new Error(localize('fail.noEditor', "Cannot open resource with notebook editor type '{0}', please check if you have the right extension installed and enabled.", input.viewType));
			}

			this._widgetDisposableStore.add(model.notebook.onDidChangeContent(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.EDIT })));

			const viewState = options?.viewState ?? this._loadNotebookEditorViewState(input);

			this._widget.value?.setParentContextKeyService(this._contextKeyService);
			await this._widget.value!.setModel(model.notebook, viewState, perf);
			const isReadOnly = input.hasCapability(EditorInputCapabilities.Readonly);
			await this._widget.value!.setOptions({ ...options, isReadOnly });
			this._widgetDisposableStore.add(this._widget.value!.onDidFocusWidget(() => this._onDidFocusWidget.fire()));
			this._widgetDisposableStore.add(this._widget.value!.onDidBlurWidget(() => this._onDidBlurWidget.fire()));

			this._widgetDisposableStore.add(this._editorDropService.createEditorDropTarget(this._widget.value!.getDomNode(), {
				containsGroup: (group) => this.group?.id === group.id
			}));

			perf.mark('editorLoaded');

			type WorkbenchNotebookOpenClassification = {
				owner: 'rebornix';
				comment: 'The notebook file open metrics. Used to get a better understanding of the performance of notebook file opening';
				scheme: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'File system provider scheme for the notebook resource' };
				ext: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'File extension for the notebook resource' };
				viewType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The view type of the notebook editor' };
				extensionActivated: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Extension activation time for the resource opening' };
				inputLoaded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Editor Input loading time for the resource opening' };
				webviewCommLoaded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Webview initialization time for the resource opening' };
				customMarkdownLoaded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Custom markdown loading time for the resource opening' };
				editorLoaded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Overall editor loading time for the resource opening' };
			};

			type WorkbenchNotebookOpenEvent = {
				scheme: string;
				ext: string;
				viewType: string;
				extensionActivated: number;
				inputLoaded: number;
				webviewCommLoaded: number;
				customMarkdownLoaded: number;
				editorLoaded: number;
			};

			const perfMarks = perf.value;
			if (perfMarks) {
				const startTime = perfMarks['startTime'];
				const extensionActivated = perfMarks['extensionActivated'];
				const inputLoaded = perfMarks['inputLoaded'];
				const customMarkdownLoaded = perfMarks['customMarkdownLoaded'];
				const editorLoaded = perfMarks['editorLoaded'];

				if (
					startTime !== undefined
					&& extensionActivated !== undefined
					&& inputLoaded !== undefined
					&& customMarkdownLoaded !== undefined
					&& editorLoaded !== undefined
				) {
					this.telemetryService.publicLog2<WorkbenchNotebookOpenEvent, WorkbenchNotebookOpenClassification>('notebook/editorOpenPerf', {
						scheme: model.notebook.uri.scheme,
						ext: extname(model.notebook.uri),
						viewType: model.notebook.viewType,
						extensionActivated: extensionActivated - startTime,
						inputLoaded: inputLoaded - startTime,
						webviewCommLoaded: inputLoaded - startTime,
						customMarkdownLoaded: customMarkdownLoaded - startTime,
						editorLoaded: editorLoaded - startTime
					});
				} else {
					console.warn(`notebook file open perf marks are broken: startTime ${startTime}, extensionActiviated ${extensionActivated}, inputLoaded ${inputLoaded}, customMarkdownLoaded ${customMarkdownLoaded}, editorLoaded ${editorLoaded}`);
				}
			}
		} catch (e) {
			const error = createErrorWithActions(e instanceof Error ? e : new Error(e.message), [
				toAction({
					id: 'workbench.notebook.action.openInTextEditor', label: localize('notebookOpenInTextEditor', "Open in Text Editor"), run: async () => {
						const activeEditorPane = this._editorService.activeEditorPane;
						if (!activeEditorPane) {
							return;
						}

						const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
						if (!activeEditorResource) {
							return;
						}

						if (activeEditorResource.toString() === input.resource?.toString()) {
							// Replace the current editor with the text editor
							return this._editorService.openEditor({
								resource: activeEditorResource,
								options: {
									override: DEFAULT_EDITOR_ASSOCIATION.id,
									pinned: true // new file gets pinned by default
								}
							});
						}

						return;
					}
				})
			]);

			throw error;
		}
	}

	override clearInput(): void {
		this._inputListener.clear();

		if (this._widget.value) {
			this._saveEditorViewState(this.input);
			this._widget.value.onWillHide();
		}
		super.clearInput();
	}

	override setOptions(options: INotebookEditorOptions | undefined): void {
		this._widget.value?.setOptions(options);
		super.setOptions(options);
	}

	protected override saveState(): void {
		this._saveEditorViewState(this.input);
		super.saveState();
	}

	override getViewState(): INotebookEditorViewState | undefined {
		const input = this.input;
		if (!(input instanceof NotebookEditorInput)) {
			return undefined;
		}

		this._saveEditorViewState(input);
		return this._loadNotebookEditorViewState(input);
	}

	getSelection(): IEditorPaneSelection | undefined {
		if (this._widget.value) {
			const cellUri = this._widget.value.getActiveCell()?.uri;
			if (cellUri) {
				return new NotebookEditorSelection(cellUri);
			}
		}

		return undefined;
	}


	private _saveEditorViewState(input: EditorInput | undefined): void {
		if (this.group && this._widget.value && input instanceof NotebookEditorInput) {
			if (this._widget.value.isDisposed) {
				return;
			}

			const state = this._widget.value.getEditorViewState();
			this._editorMemento.saveEditorState(this.group, input.resource, state);
		}
	}

	private _loadNotebookEditorViewState(input: NotebookEditorInput): INotebookEditorViewState | undefined {
		let result: INotebookEditorViewState | undefined;
		if (this.group) {
			result = this._editorMemento.loadEditorState(this.group, input.resource);
		}
		if (result) {
			return result;
		}
		// when we don't have a view state for the group/input-tuple then we try to use an existing
		// editor for the same resource.
		for (const group of this._editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			if (group.activeEditorPane !== this && group.activeEditorPane instanceof NotebookEditor && group.activeEditor?.matches(input)) {
				return group.activeEditorPane._widget.value?.getEditorViewState();
			}
		}
		return;
	}

	layout(dimension: DOM.Dimension): void {
		this._rootElement.classList.toggle('mid-width', dimension.width < 1000 && dimension.width >= 600);
		this._rootElement.classList.toggle('narrow-width', dimension.width < 600);
		this._dimension = dimension;

		if (!this._widget.value || !(this._input instanceof NotebookEditorInput)) {
			return;
		}

		if (this._input.resource.toString() !== this.textModel?.uri.toString() && this._widget.value?.hasModel()) {
			// input and widget mismatch
			// this happens when
			// 1. open document A, pin the document
			// 2. open document B
			// 3. close document B
			// 4. a layout is triggered
			return;
		}

		this._widget.value.layout(this._dimension, this._rootElement);
	}

	//#endregion
}

class NotebookEditorSelection implements IEditorPaneSelection {

	constructor(
		private readonly cellUri: URI
	) { }

	compare(other: IEditorPaneSelection): EditorPaneSelectionCompareResult {
		if (!(other instanceof NotebookEditorSelection)) {
			return EditorPaneSelectionCompareResult.DIFFERENT;
		}

		if (isEqual(this.cellUri, other.cellUri)) {
			return EditorPaneSelectionCompareResult.IDENTICAL;
		}

		return EditorPaneSelectionCompareResult.DIFFERENT;
	}

	restore(options: IEditorOptions): INotebookEditorOptions {
		const notebookOptions: INotebookEditorOptions = {
			cellOptions: {
				resource: this.cellUri
			}
		};

		Object.assign(notebookOptions, options);

		return notebookOptions;
	}

	log(): string {
		return this.cellUri.fragment;
	}
}
