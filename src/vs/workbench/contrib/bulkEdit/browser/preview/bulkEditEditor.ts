/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MultiDiffEditorWidget } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidget';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { AbstractEditorWithViewState } from 'vs/workbench/browser/parts/editor/editorWithViewState';
import { ICompositeControl } from 'vs/workbench/common/composite';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { URI } from 'vs/base/common/uri';
import { MultiDiffEditorViewModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorViewModel';
import { IMultiDiffEditorOptions, IMultiDiffEditorViewState } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { BulkEditTreeView } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditTreeView';
import { ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { WorkbenchUIElementFactory } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditor';
import { BulkEditEditorInput } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditEditorInput';
import { FileElement, TextEditElement } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditTree';
import { Range } from 'vs/editor/common/core/range';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { DetailedLineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export class BulkEditEditor extends AbstractEditorWithViewState<IMultiDiffEditorViewState> {

	static readonly ID = 'bulkEditEditor';

	private _multiDiffEditorWidget: MultiDiffEditorWidget | undefined = undefined;
	private _viewModel: MultiDiffEditorViewModel | undefined;

	private _refactorViewPane: BulkEditTreeView | undefined;
	private _refactorViewContainer: HTMLElement | undefined;
	private _multiDiffEditorContainer: HTMLElement | undefined;

	private _edits: ResourceEdit[] = [];
	private _promiseResolvedEdits: Promise<ResourceEdit[] | undefined> | undefined;
	private _mapOfReverseEdits: Map<string, Map<DetailedLineRangeMapping, ISingleEditOperation>> = new Map();
	private _lineRangeMapping: readonly DetailedLineRangeMapping[] | undefined;

	public get viewModel(): MultiDiffEditorViewModel | undefined {
		return this._viewModel;
	}

	constructor(
		@IInstantiationService instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IViewsService viewsService: IViewsService
	) {
		super(
			BulkEditEditor.ID,
			'bulkEditEditor',
			telemetryService,
			instantiationService,
			storageService,
			textResourceConfigurationService,
			themeService,
			editorService,
			editorGroupService
		);
	}

	protected createEditor(parent: HTMLElement): void {
		console.log('createEditor of BulkEditEditor');
		this._refactorViewContainer = document.createElement('div');
		this._refactorViewContainer.classList.add('bulk-edit-panel', 'show-file-icons');
		this._multiDiffEditorContainer = document.createElement('div');
		this._multiDiffEditorContainer.classList.add('bulk-edit-editor-diff');

		parent.appendChild(this._refactorViewContainer);
		parent.appendChild(this._multiDiffEditorContainer);
		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(
			MultiDiffEditorWidget,
			this._multiDiffEditorContainer,
			this.instantiationService.createInstance(WorkbenchUIElementFactory),
		));
		// console.log('this._multiDiffEditorWidget : ', this._multiDiffEditorWidget);
		// console.log('before getBulkEditPane2');
		this._refactorViewPane = this.instantiationService.createInstance(BulkEditTreeView);
		// console.log('view of getBulkEditPane2: ', this._refactorViewPane);
		this._renderRefactorPreviewPane();
		this._registerRefactorPreviewPaneListeners();

		this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
			this._onDidChangeControl.fire();
		}));
	}

	private _renderRefactorPreviewPane() {
		if (this._refactorViewPane && this._refactorViewContainer) {
			DOM.clearNode(this._refactorViewContainer);
			this._promiseResolvedEdits = this._refactorViewPane.setInput(this._edits, CancellationToken.None);
			// TODO: Do we neeed to save the input in the refactor view pane?
			// if (this._bulkEditEditorInput) {
			// 	this._refactorViewPane.input = this._bulkEditEditorInput;
			// }
			this._refactorViewPane.renderBody(this._refactorViewContainer);
			// TODO: How to make the height not a set number but the minimum between 200 and the actual height?
			this._refactorViewPane.layoutBody(200, this._refactorViewContainer.clientWidth);
			this._refactorViewPane.focus();
		}
	}

	private _registerRefactorPreviewPaneListeners() {

		console.log('inside of _registerRefactorPreviewPaneListeners');
		if (!this._refactorViewPane) {
			return;
		}
		console.log('before adding listeners');

		// Need to reveal the appropriate part of the editor on click of the tree element
		this._refactorViewPane.onDidTreeOpen(e => {

			console.log('inside of onDidTreeOpen of _registerRefactorPreviewPaneListeners');
			const fileOperations = this._refactorViewPane?.currentInput?.fileOperations;
			if (!fileOperations) {
				return;
			}
			let fileElement: FileElement;
			if (e.element instanceof TextEditElement) {
				fileElement = e.element.parent;
			} else if (e.element instanceof FileElement) {
				fileElement = e.element;
			} else {
				// invalid event
				return;
			}

			this._reveal({
				viewState: {
					revealData: {
						resource: { original: fileElement.edit.uri },
						range: new Range(1, 1, 1, 1)
					}
				}
			});
		});
	}

	override async setInput(input: BulkEditEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		console.log('setInput of bulkEditEditor');
		// console.log('input : ', input);
		// console.log('this._multiDiffEditorWidget : ', this._multiDiffEditorWidget);
		// this._bulkEditEditorInput = input;

		// TODO: how much of the following code do we need?
		this._edits = input.inputEdits;
		console.log('input.inputEdits : ', input.inputEdits);

		await super.setInput(input, options, context, token);
		this._viewModel = await input.getViewModel();
		// console.log('this._viewModel : ', this._viewModel);
		this._multiDiffEditorWidget!.setViewModel(this._viewModel);

		const viewState = this.loadEditorViewState(input, context);
		// console.log('viewState : ', viewState);
		if (viewState) {
			this._multiDiffEditorWidget!.setViewState(viewState);
		}
		// TODO: Needs to be there so that the rendering is done as expected
		this._renderRefactorPreviewPane();
		this._reveal(options);
		console.log('end of setInput of bulkEditEditor');

		this._refactorViewPane?.onToggleChecked((e) => {
			console.log('e of setInput : ', e);
			if (!(e instanceof ResourceTextEdit)) {
				return;
			}

			const codeEditor = this._multiDiffEditorWidget?.tryGetCodeEditor(e.resource);
			// put in modified resource to get modified resource
			const diffEditor = codeEditor?.diffEditor as DiffEditorWidget;

			if (!this._lineRangeMapping) {
				const computationalResult = diffEditor.getDiffComputationResult()?.changes2;
				console.log('computationalResult : ', computationalResult);
				if (!computationalResult) {
					return;
				}
				this._lineRangeMapping = computationalResult;
			}

			const range = e.textEdit.range;
			const rangeMappingToRevert = this._lineRangeMapping.find((res) => {
				const innerChanges = res.innerChanges;
				if (!innerChanges) {
					return false;
				}
				return innerChanges[0].originalRange.startLineNumber === range.startLineNumber && innerChanges[0].originalRange.endLineNumber === range.endLineNumber;
			});

			if (!rangeMappingToRevert) {
				return;
			}

			// Resource has been removed now, so need to revert the change and save it to the array
			if (!this._refactorViewPane?.isResourceChecked(e)) {
				console.log('inside of the first if statement');
				const rangeMapping = rangeMappingToRevert.innerChanges?.[0];
				if (!rangeMapping) {
					return;
				}

				console.log('rangeMappingToRevert : ', rangeMappingToRevert);
				const reverseEdit = {
					range: rangeMapping.originalRange,
					text: diffEditor.getValueInRangeInModifiedEditor(rangeMapping.modifiedRange)
				};

				let currentMap: Map<DetailedLineRangeMapping, ISingleEditOperation>;
				if (this._mapOfReverseEdits.has(e.resource.toString())) {
					currentMap = this._mapOfReverseEdits.get(e.resource.toString())!;
				} else {
					currentMap = new Map();
					this._mapOfReverseEdits.set(e.resource.toString(), currentMap);
				}
				currentMap.set(rangeMappingToRevert, reverseEdit);

				diffEditor.revert(rangeMappingToRevert);
				console.log('diffEditor : ', diffEditor);
			} else {

				console.log('inside of else statement');
				const edit = this._mapOfReverseEdits.get(e.resource.toString())?.get(rangeMappingToRevert);
				console.log('edit : ', edit);
				if (edit) {
					diffEditor.executeEditsOnModifiedEditor([edit]);
				}
			}
			console.log('this._mapOfReverseEdits : ', this._mapOfReverseEdits);
		});
	}

	override async setOptions(options: IMultiDiffEditorOptions | undefined): Promise<void> {
		console.log('setOptions options : ', options);
		this._reveal(options);
	}

	private _reveal(options: IMultiDiffEditorOptions | undefined): void {
		console.log('inside of _reveal, options : ', options);
		const viewState = options?.viewState;
		if (!viewState || !viewState.revealData) {
			return;
		}
		this._multiDiffEditorWidget?.reveal(viewState.revealData.resource, viewState.revealData.range);
	}

	public hasInput(): boolean {
		return this._refactorViewPane?.hasInput() ?? false;
	}

	override clearInput(): void {
		console.log('inside of clearInput');
		super.clearInput();
		this._multiDiffEditorWidget!.setViewModel(undefined);
		console.log('at the end of clearInput');
	}

	layout(dimension: DOM.Dimension): void {
		const newDimension = {
			height: dimension.height - (this._refactorViewPane?.getHeight() ?? 0),
			width: dimension.width
		};
		this._multiDiffEditorWidget!.layout(DOM.Dimension.lift(newDimension));
	}

	override getControl(): ICompositeControl | undefined {
		return this._multiDiffEditorWidget!.getActiveControl();
	}

	override focus(): void {
		super.focus();
		this._refactorViewPane?.focus();
	}

	override hasFocus(): boolean {
		// TODO: Also check if this._refactorViewContainer has focus
		return this._multiDiffEditorWidget?.getActiveControl()?.hasTextFocus() || super.hasFocus();
	}

	protected override computeEditorViewState(resource: URI): IMultiDiffEditorViewState | undefined {
		return this._multiDiffEditorWidget!.getViewState();
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof BulkEditEditorInput;
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return (input as BulkEditEditorInput).resource;
	}

	public get promiseResolvedEdits(): Promise<ResourceEdit[] | undefined> | undefined {
		return this._promiseResolvedEdits;
	}

	public accept(): void {
		this._refactorViewPane?.accept();
	}

	public discard(): void {
		this._refactorViewPane?.discard();
	}

	public toggleChecked(): void {
		this._refactorViewPane?.toggleChecked();
	}

	public groupByFile(): void {
		this._refactorViewPane?.groupByFile();
	}

	public groupByType(): void {
		this._refactorViewPane?.groupByType();
	}

	public toggleGrouping(): void {
		this._refactorViewPane?.toggleGrouping();
	}
}
