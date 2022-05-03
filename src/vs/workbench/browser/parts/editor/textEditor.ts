/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { distinct, deepClone } from 'vs/base/common/objects';
import { Emitter, Event } from 'vs/base/common/event';
import { isObject, assertIsDefined, withNullAsUndefined } from 'vs/base/common/types';
import { Dimension } from 'vs/base/browser/dom';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOpenContext, EditorInputCapabilities, IEditorPaneSelection, EditorPaneSelectionCompareResult, EditorPaneSelectionChangeReason, IEditorPaneWithSelection, IEditorPaneSelectionChangeEvent } from 'vs/workbench/common/editor';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { computeEditorAriaLabel } from 'vs/workbench/browser/editor';
import { AbstractEditorWithViewState } from 'vs/workbench/browser/parts/editor/editorWithViewState';
import { IEditorViewState, IEditor, ScrollType } from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { isCodeEditor, getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions, ITextEditorOptions, TextEditorSelectionRevealType, TextEditorSelectionSource } from 'vs/platform/editor/common/editor';
import { isEqual } from 'vs/base/common/resources';
import { ICursorPositionChangedEvent } from 'vs/editor/common/cursorEvents';

export interface IEditorConfiguration {
	editor: object;
	diffEditor: object;
}

/**
 * The base class of editors that leverage the text editor for the editing experience. This class is only intended to
 * be subclassed and not instantiated.
 */
export abstract class BaseTextEditor<T extends IEditorViewState> extends AbstractEditorWithViewState<T> implements IEditorPaneWithSelection {

	private static readonly VIEW_STATE_PREFERENCE_KEY = 'textEditorViewState';

	protected readonly _onDidChangeSelection = this._register(new Emitter<IEditorPaneSelectionChangeEvent>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

	private editorControl: IEditor | undefined;
	private editorContainer: HTMLElement | undefined;
	private hasPendingConfigurationChange: boolean | undefined;
	private lastAppliedEditorOptions?: ICodeEditorOptions;

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return isCodeEditor(this.editorControl) ? this.editorControl.invokeWithinContext(accessor => accessor.get(IContextKeyService)) : undefined;
	}

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, BaseTextEditor.VIEW_STATE_PREFERENCE_KEY, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);

		this._register(this.textResourceConfigurationService.onDidChangeConfiguration(() => {
			const resource = this.getActiveResource();
			const value = resource ? this.textResourceConfigurationService.getValue<IEditorConfiguration>(resource) : undefined;

			return this.handleConfigurationChangeEvent(value);
		}));

		// ARIA: if a group is added or removed, update the editor's ARIA
		// label so that it appears in the label for when there are > 1 groups
		this._register(Event.any(this.editorGroupService.onDidAddGroup, this.editorGroupService.onDidRemoveGroup)(() => {
			const ariaLabel = this.computeAriaLabel();

			this.editorContainer?.setAttribute('aria-label', ariaLabel);
			this.editorControl?.updateOptions({ ariaLabel });
		}));
	}

	protected handleConfigurationChangeEvent(configuration?: IEditorConfiguration): void {
		if (this.isVisible()) {
			this.updateEditorConfiguration(configuration);
		} else {
			this.hasPendingConfigurationChange = true;
		}
	}

	private consumePendingConfigurationChangeEvent(): void {
		if (this.hasPendingConfigurationChange) {
			this.updateEditorConfiguration();
			this.hasPendingConfigurationChange = false;
		}
	}

	protected computeConfiguration(configuration: IEditorConfiguration): ICodeEditorOptions {

		// Specific editor options always overwrite user configuration
		const editorConfiguration: ICodeEditorOptions = isObject(configuration.editor) ? deepClone(configuration.editor) : Object.create(null);
		Object.assign(editorConfiguration, this.getConfigurationOverrides());

		// ARIA label
		editorConfiguration.ariaLabel = this.computeAriaLabel();

		return editorConfiguration;
	}

	private computeAriaLabel(): string {
		return this._input ? computeEditorAriaLabel(this._input, undefined, this.group, this.editorGroupService.count) : localize('editor', "Editor");
	}

	protected getConfigurationOverrides(): ICodeEditorOptions {
		return {
			overviewRulerLanes: 3,
			lineNumbersMinChars: 3,
			fixedOverflowWidgets: true,
			readOnly: this.input?.hasCapability(EditorInputCapabilities.Readonly),
			// render problems even in readonly editors
			// https://github.com/microsoft/vscode/issues/89057
			renderValidationDecorations: 'on'
		};
	}

	protected createEditor(parent: HTMLElement): void {

		// Create editor control
		this.editorContainer = parent;
		this.editorControl = this._register(this.createEditorControl(parent, this.computeConfiguration(this.textResourceConfigurationService.getValue<IEditorConfiguration>(this.getActiveResource()))));

		// Listeners
		this.registerCodeEditorListeners();
	}

	private registerCodeEditorListeners(): void {
		const codeEditor = getCodeEditor(this.editorControl);
		if (codeEditor) {
			this._register(codeEditor.onDidChangeModelLanguage(() => this.updateEditorConfiguration()));
			this._register(codeEditor.onDidChangeModel(() => this.updateEditorConfiguration()));
			this._register(codeEditor.onDidChangeCursorPosition(e => this._onDidChangeSelection.fire({ reason: this.toEditorPaneSelectionChangeReason(e) })));
			this._register(codeEditor.onDidChangeModelContent(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.EDIT })));
		}
	}

	private toEditorPaneSelectionChangeReason(e: ICursorPositionChangedEvent): EditorPaneSelectionChangeReason {
		switch (e.source) {
			case TextEditorSelectionSource.PROGRAMMATIC: return EditorPaneSelectionChangeReason.PROGRAMMATIC;
			case TextEditorSelectionSource.NAVIGATION: return EditorPaneSelectionChangeReason.NAVIGATION;
			case TextEditorSelectionSource.JUMP: return EditorPaneSelectionChangeReason.JUMP;
			default: return EditorPaneSelectionChangeReason.USER;
		}
	}

	getSelection(): IEditorPaneSelection | undefined {
		const codeEditor = getCodeEditor(this.editorControl);
		if (codeEditor) {
			const selection = codeEditor.getSelection();
			if (selection) {
				return new TextEditorPaneSelection(selection);
			}
		}

		return undefined;
	}

	/**
	 * This method creates and returns the text editor control to be used. Subclasses can override to
	 * provide their own editor control that should be used (e.g. a DiffEditor).
	 *
	 * The passed in configuration object should be passed to the editor control when creating it.
	 */
	protected createEditorControl(parent: HTMLElement, configuration: ICodeEditorOptions): IEditor {

		// Use a getter for the instantiation service since some subclasses might use scoped instantiation services
		return this.instantiationService.createInstance(CodeEditorWidget, parent, { enableDropIntoEditor: true, ...configuration }, {});
	}

	override async setInput(input: EditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		// Update editor options after having set the input. We do this because there can be
		// editor input specific options (e.g. an ARIA label depending on the input showing)
		this.updateEditorConfiguration();

		// Update aria label on editor
		const editorContainer = assertIsDefined(this.editorContainer);
		editorContainer.setAttribute('aria-label', this.computeAriaLabel());
	}

	override setOptions(options: ITextEditorOptions | undefined): void {
		super.setOptions(options);

		if (options) {
			applyTextEditorOptions(options, assertIsDefined(this.getControl()), ScrollType.Smooth);
		}
	}

	protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {

		// Pass on to Editor
		const editorControl = assertIsDefined(this.editorControl);
		if (visible) {
			this.consumePendingConfigurationChangeEvent();

			editorControl.onVisible();
		} else {
			editorControl.onHide();
		}

		super.setEditorVisible(visible, group);
	}

	override focus(): void {

		// Pass on to Editor
		const editorControl = assertIsDefined(this.editorControl);
		editorControl.focus();
	}

	override hasFocus(): boolean {
		if (this.editorControl?.hasTextFocus()) {
			return true;
		}

		return super.hasFocus();
	}

	layout(dimension: Dimension): void {

		// Pass on to Editor
		const editorControl = assertIsDefined(this.editorControl);
		editorControl.layout(dimension);
	}

	override getControl(): IEditor | undefined {
		return this.editorControl;
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return input.resource;
	}

	protected override computeEditorViewState(resource: URI): T | undefined {
		const control = this.getControl();
		if (!isCodeEditor(control)) {
			return undefined;
		}

		const model = control.getModel();
		if (!model) {
			return undefined; // view state always needs a model
		}

		const modelUri = model.uri;
		if (!modelUri) {
			return undefined; // model URI is needed to make sure we save the view state correctly
		}

		if (!isEqual(modelUri, resource)) {
			return undefined; // prevent saving view state for a model that is not the expected one
		}

		return withNullAsUndefined(control.saveViewState() as unknown as T);
	}

	private updateEditorConfiguration(configuration?: IEditorConfiguration): void {
		if (!configuration) {
			const resource = this.getActiveResource();
			if (resource) {
				configuration = this.textResourceConfigurationService.getValue<IEditorConfiguration>(resource);
			}
		}

		if (!this.editorControl || !configuration) {
			return;
		}

		const editorConfiguration = this.computeConfiguration(configuration);

		// Try to figure out the actual editor options that changed from the last time we updated the editor.
		// We do this so that we are not overwriting some dynamic editor settings (e.g. word wrap) that might
		// have been applied to the editor directly.
		let editorSettingsToApply = editorConfiguration;
		if (this.lastAppliedEditorOptions) {
			editorSettingsToApply = distinct(this.lastAppliedEditorOptions, editorSettingsToApply);
		}

		if (Object.keys(editorSettingsToApply).length > 0) {
			this.lastAppliedEditorOptions = editorConfiguration;

			this.editorControl.updateOptions(editorSettingsToApply);
		}
	}

	private getActiveResource(): URI | undefined {
		const codeEditor = getCodeEditor(this.editorControl);
		if (codeEditor) {
			const model = codeEditor.getModel();
			if (model) {
				return model.uri;
			}
		}

		if (this.input) {
			return this.input.resource;
		}

		return undefined;
	}

	override dispose(): void {
		this.lastAppliedEditorOptions = undefined;

		super.dispose();
	}
}

export class TextEditorPaneSelection implements IEditorPaneSelection {

	private static readonly TEXT_EDITOR_SELECTION_THRESHOLD = 10; // number of lines to move in editor to justify for significant change

	constructor(
		private readonly textSelection: Selection
	) { }

	compare(other: IEditorPaneSelection): EditorPaneSelectionCompareResult {
		if (!(other instanceof TextEditorPaneSelection)) {
			return EditorPaneSelectionCompareResult.DIFFERENT;
		}

		const thisLineNumber = Math.min(this.textSelection.selectionStartLineNumber, this.textSelection.positionLineNumber);
		const otherLineNumber = Math.min(other.textSelection.selectionStartLineNumber, other.textSelection.positionLineNumber);

		if (thisLineNumber === otherLineNumber) {
			return EditorPaneSelectionCompareResult.IDENTICAL;
		}

		if (Math.abs(thisLineNumber - otherLineNumber) < TextEditorPaneSelection.TEXT_EDITOR_SELECTION_THRESHOLD) {
			return EditorPaneSelectionCompareResult.SIMILAR; // when in close proximity, treat selection as being similar
		}

		return EditorPaneSelectionCompareResult.DIFFERENT;
	}

	restore(options: IEditorOptions): ITextEditorOptions {
		const textEditorOptions: ITextEditorOptions = {
			...options,
			selection: this.textSelection,
			selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
		};

		return textEditorOptions;
	}

	log(): string {
		return `line: ${this.textSelection.startLineNumber}-${this.textSelection.endLineNumber}, col:  ${this.textSelection.startColumn}-${this.textSelection.endColumn}`;
	}
}
