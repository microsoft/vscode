/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { distinct, deepClone } from 'vs/base/common/objects';
import { Emitter, Event } from 'vs/base/common/event';
import { isObject, assertIsDefined } from 'vs/base/common/types';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOpenContext, IEditorPaneSelection, EditorPaneSelectionCompareResult, EditorPaneSelectionChangeReason, IEditorPaneWithSelection, IEditorPaneSelectionChangeEvent } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { computeEditorAriaLabel } from 'vs/workbench/browser/editor';
import { AbstractEditorWithViewState } from 'vs/workbench/browser/parts/editor/editorWithViewState';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITextResourceConfigurationChangeEvent, ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorOptions, ITextEditorOptions, TextEditorSelectionRevealType, TextEditorSelectionSource } from 'vs/platform/editor/common/editor';
import { ICursorPositionChangedEvent } from 'vs/editor/common/cursorEvents';
import { IFileService } from 'vs/platform/files/common/files';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export interface IEditorConfiguration {
	editor: object;
	diffEditor: object;
}

/**
 * The base class of editors that leverage any kind of text editor for the editing experience.
 */
export abstract class AbstractTextEditor<T extends IEditorViewState> extends AbstractEditorWithViewState<T> implements IEditorPaneWithSelection {

	private static readonly VIEW_STATE_PREFERENCE_KEY = 'textEditorViewState';

	protected readonly _onDidChangeSelection = this._register(new Emitter<IEditorPaneSelectionChangeEvent>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

	private editorContainer: HTMLElement | undefined;

	private hasPendingConfigurationChange: boolean | undefined;
	private lastAppliedEditorOptions?: ICodeEditorOptions;

	private readonly inputListener = this._register(new MutableDisposable());

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService protected readonly fileService: IFileService
	) {
		super(id, AbstractTextEditor.VIEW_STATE_PREFERENCE_KEY, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);

		// Listen to configuration changes
		this._register(this.textResourceConfigurationService.onDidChangeConfiguration(e => this.handleConfigurationChangeEvent(e)));

		// ARIA: if a group is added or removed, update the editor's ARIA
		// label so that it appears in the label for when there are > 1 groups

		this._register(Event.any(this.editorGroupService.onDidAddGroup, this.editorGroupService.onDidRemoveGroup)(() => {
			const ariaLabel = this.computeAriaLabel();

			this.editorContainer?.setAttribute('aria-label', ariaLabel);
			this.updateEditorControlOptions({ ariaLabel });
		}));

		// Listen to file system provider changes
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onDidChangeFileSystemProvider(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onDidChangeFileSystemProvider(e.scheme)));
	}

	private handleConfigurationChangeEvent(e: ITextResourceConfigurationChangeEvent): void {
		const resource = this.getActiveResource();
		if (!this.shouldHandleConfigurationChangeEvent(e, resource)) {
			return;
		}

		if (this.isVisible()) {
			this.updateEditorConfiguration(resource);
		} else {
			this.hasPendingConfigurationChange = true;
		}
	}

	protected shouldHandleConfigurationChangeEvent(e: ITextResourceConfigurationChangeEvent, resource: URI | undefined): boolean {
		return e.affectsConfiguration(resource, 'editor');
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

	private onDidChangeFileSystemProvider(scheme: string): void {
		if (!this.input) {
			return;
		}

		if (this.getActiveResource()?.scheme === scheme) {
			this.updateReadonly(this.input);
		}
	}

	private onDidChangeInputCapabilities(input: EditorInput): void {
		if (this.input === input) {
			this.updateReadonly(input);
		}
	}

	protected updateReadonly(input: EditorInput): void {
		this.updateEditorControlOptions({ ...this.getReadonlyConfiguration(input.isReadonly()) });
	}

	protected getReadonlyConfiguration(isReadonly: boolean | IMarkdownString | undefined): { readOnly: boolean; readOnlyMessage: IMarkdownString | undefined } {
		return {
			readOnly: !!isReadonly,
			readOnlyMessage: typeof isReadonly !== 'boolean' ? isReadonly : undefined
		};
	}

	protected getConfigurationOverrides(): ICodeEditorOptions {
		return {
			overviewRulerLanes: 3,
			lineNumbersMinChars: 3,
			fixedOverflowWidgets: true,
			...this.getReadonlyConfiguration(this.input?.isReadonly()),
			renderValidationDecorations: 'on' // render problems even in readonly editors (https://github.com/microsoft/vscode/issues/89057)
		};
	}

	protected createEditor(parent: HTMLElement): void {

		// Create editor control
		this.editorContainer = parent;
		this.createEditorControl(parent, this.computeConfiguration(this.textResourceConfigurationService.getValue<IEditorConfiguration>(this.getActiveResource())));

		// Listeners
		this.registerCodeEditorListeners();
	}

	private registerCodeEditorListeners(): void {
		const mainControl = this.getMainControl();
		if (mainControl) {
			this._register(mainControl.onDidChangeModelLanguage(() => this.updateEditorConfiguration()));
			this._register(mainControl.onDidChangeModel(() => this.updateEditorConfiguration()));
			this._register(mainControl.onDidChangeCursorPosition(e => this._onDidChangeSelection.fire({ reason: this.toEditorPaneSelectionChangeReason(e) })));
			this._register(mainControl.onDidChangeModelContent(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.EDIT })));
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
		const mainControl = this.getMainControl();
		if (mainControl) {
			const selection = mainControl.getSelection();
			if (selection) {
				return new TextEditorPaneSelection(selection);
			}
		}

		return undefined;
	}

	/**
	 * This method creates and returns the text editor control to be used.
	 * Subclasses must override to provide their own editor control that
	 * should be used (e.g. a text diff editor).
	 *
	 * The passed in configuration object should be passed to the editor
	 * control when creating it.
	 */
	protected abstract createEditorControl(parent: HTMLElement, initialOptions: ICodeEditorOptions): void;

	/**
	 * The method asks to update the editor control options and is called
	 * whenever there is change to the options.
	 */
	protected abstract updateEditorControlOptions(options: ICodeEditorOptions): void;

	/**
	 * This method returns the main, dominant instance of `ICodeEditor`
	 * for the editor pane. E.g. for a diff editor, this is the right
	 * hand (modified) side.
	 */
	protected abstract getMainControl(): ICodeEditor | undefined;

	override async setInput(input: EditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		// Update our listener for input capabilities
		this.inputListener.value = input.onDidChangeCapabilities(() => this.onDidChangeInputCapabilities(input));

		// Update editor options after having set the input. We do this because there can be
		// editor input specific options (e.g. an ARIA label depending on the input showing)
		this.updateEditorConfiguration();

		// Update aria label on editor
		const editorContainer = assertIsDefined(this.editorContainer);
		editorContainer.setAttribute('aria-label', this.computeAriaLabel());
	}

	override clearInput(): void {

		// Clear input listener
		this.inputListener.clear();

		super.clearInput();
	}

	protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		if (visible) {
			this.consumePendingConfigurationChangeEvent();
		}

		super.setEditorVisible(visible, group);
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return input.resource;
	}

	private updateEditorConfiguration(resource = this.getActiveResource()): void {
		let configuration: IEditorConfiguration | undefined = undefined;
		if (resource) {
			configuration = this.textResourceConfigurationService.getValue<IEditorConfiguration>(resource);
		}

		if (!configuration) {
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

			this.updateEditorControlOptions(editorSettingsToApply);
		}
	}

	private getActiveResource(): URI | undefined {
		const mainControl = this.getMainControl();
		if (mainControl) {
			const model = mainControl.getModel();
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
