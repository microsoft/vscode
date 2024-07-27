/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MultiDiffEditorWidget } from 'vs/editor/browser/widget/multiDiffEditor/multiDiffEditorWidget';
import { IResourceLabel, IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditor/workbenchUIElementFactory';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { AbstractEditorWithViewState } from 'vs/workbench/browser/parts/editor/editorWithViewState';
import { ICompositeControl } from 'vs/workbench/common/composite';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IDocumentDiffItemWithMultiDiffEditorItem, MultiDiffEditorInput } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { URI } from 'vs/base/common/uri';
import { MultiDiffEditorViewModel } from 'vs/editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel';
import { IMultiDiffEditorOptions, IMultiDiffEditorViewState } from 'vs/editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffEditor } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { MultiDiffEditorItem } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';

export class MultiDiffEditor extends AbstractEditorWithViewState<IMultiDiffEditorViewState> {
	static readonly ID = 'multiDiffEditor';

	private _multiDiffEditorWidget: MultiDiffEditorWidget | undefined = undefined;
	private _viewModel: MultiDiffEditorViewModel | undefined;

	public get viewModel(): MultiDiffEditorViewModel | undefined {
		return this._viewModel;
	}

	constructor(
		group: IEditorGroup,
		@IInstantiationService instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
	) {
		super(
			MultiDiffEditor.ID,
			group,
			'multiDiffEditor',
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
		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(
			MultiDiffEditorWidget,
			parent,
			this.instantiationService.createInstance(WorkbenchUIElementFactory),
		));

		this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
			this._onDidChangeControl.fire();
		}));
	}

	override async setInput(input: MultiDiffEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this._viewModel = await input.getViewModel();
		this._multiDiffEditorWidget!.setViewModel(this._viewModel);

		const viewState = this.loadEditorViewState(input, context);
		if (viewState) {
			this._multiDiffEditorWidget!.setViewState(viewState);
		}
		this._applyOptions(options);
	}

	override setOptions(options: IMultiDiffEditorOptions | undefined): void {
		this._applyOptions(options);
	}

	private _applyOptions(options: IMultiDiffEditorOptions | undefined): void {
		const viewState = options?.viewState;
		if (!viewState || !viewState.revealData) {
			return;
		}
		this._multiDiffEditorWidget?.reveal(viewState.revealData.resource, {
			range: viewState.revealData.range ? Range.lift(viewState.revealData.range) : undefined,
			highlight: true
		});
	}

	override async clearInput(): Promise<void> {
		await super.clearInput();
		this._multiDiffEditorWidget!.setViewModel(undefined);
	}

	layout(dimension: DOM.Dimension): void {
		this._multiDiffEditorWidget!.layout(dimension);
	}

	override getControl(): ICompositeControl | undefined {
		return this._multiDiffEditorWidget!.getActiveControl();
	}

	override focus(): void {
		super.focus();

		this._multiDiffEditorWidget?.getActiveControl()?.focus();
	}

	override hasFocus(): boolean {
		return this._multiDiffEditorWidget?.getActiveControl()?.hasTextFocus() || super.hasFocus();
	}

	protected override computeEditorViewState(resource: URI): IMultiDiffEditorViewState | undefined {
		return this._multiDiffEditorWidget!.getViewState();
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof MultiDiffEditorInput;
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return (input as MultiDiffEditorInput).resource;
	}

	public tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		return this._multiDiffEditorWidget!.tryGetCodeEditor(resource);
	}

	public findDocumentDiffItem(resource: URI): MultiDiffEditorItem | undefined {
		const i = this._multiDiffEditorWidget!.findDocumentDiffItem(resource);
		if (!i) { return undefined; }
		const i2 = i as IDocumentDiffItemWithMultiDiffEditorItem;
		return i2.multiDiffEditorItem;
	}
}


class WorkbenchUIElementFactory implements IWorkbenchUIElementFactory {
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createResourceLabel(element: HTMLElement): IResourceLabel {
		const label = this._instantiationService.createInstance(ResourceLabel, element, {});
		return {
			setUri(uri, options = {}) {
				if (!uri) {
					label.element.clear();
				} else {
					label.element.setFile(uri, { strikethrough: options.strikethrough });
				}
			},
			dispose() {
				label.dispose();
			}
		};
	}
}
