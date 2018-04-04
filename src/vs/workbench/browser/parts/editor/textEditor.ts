/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as objects from 'vs/base/common/objects';
import * as types from 'vs/base/common/types';
import * as errors from 'vs/base/common/errors';
import * as DOM from 'vs/base/browser/dom';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorViewState, IEditor } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/platform/editor/common/editor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Scope } from 'vs/workbench/common/memento';
import { getCodeEditor, getCodeOrDiffEditor } from 'vs/editor/browser/services/codeEditorService';
import { ITextFileService, SaveReason, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { isDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';

const TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'textEditorViewState';

export interface IEditorConfiguration {
	editor: object;
	diffEditor: object;
}

/**
 * The base class of editors that leverage the text editor for the editing experience. This class is only intended to
 * be subclassed and not instantiated.
 */
export abstract class BaseTextEditor extends BaseEditor {
	private editorControl: IEditor;
	private _editorContainer: HTMLElement;
	private hasPendingConfigurationChange: boolean;
	private lastAppliedEditorOptions: IEditorOptions;

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@ITextResourceConfigurationService private readonly _configurationService: ITextResourceConfigurationService,
		@IThemeService protected themeService: IThemeService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService
	) {
		super(id, telemetryService, themeService);

		this.toUnbind.push(this.configurationService.onDidChangeConfiguration(e => this.handleConfigurationChangeEvent(this.configurationService.getValue<IEditorConfiguration>(this.getResource()))));
	}

	protected get instantiationService(): IInstantiationService {
		return this._instantiationService;
	}

	protected get configurationService(): ITextResourceConfigurationService {
		return this._configurationService;
	}

	protected get textFileService(): ITextFileService {
		return this._textFileService;
	}

	private handleConfigurationChangeEvent(configuration?: IEditorConfiguration): void {
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

	protected computeConfiguration(configuration: IEditorConfiguration): IEditorOptions {

		// Specific editor options always overwrite user configuration
		const editorConfiguration: IEditorOptions = types.isObject(configuration.editor) ? objects.deepClone(configuration.editor) : Object.create(null);
		objects.assign(editorConfiguration, this.getConfigurationOverrides());

		// ARIA label
		editorConfiguration.ariaLabel = this.computeAriaLabel();

		return editorConfiguration;
	}

	private computeAriaLabel(): string {
		let ariaLabel = this.getAriaLabel();

		// Apply group information to help identify in which group we are
		if (ariaLabel && typeof this.position === 'number') {
			ariaLabel = nls.localize('editorLabelWithGroup', "{0}, Group {1}.", ariaLabel, this.position + 1);
		}

		return ariaLabel;
	}

	protected getConfigurationOverrides(): IEditorOptions {
		const overrides = {};
		objects.assign(overrides, {
			overviewRulerLanes: 3,
			lineNumbersMinChars: 3,
			fixedOverflowWidgets: true
		});

		return overrides;
	}

	protected createEditor(parent: HTMLElement): void {

		// Editor for Text
		this._editorContainer = parent;
		this.editorControl = this.createEditorControl(parent, this.computeConfiguration(this.configurationService.getValue<IEditorConfiguration>(this.getResource())));

		// Model & Language changes
		const codeEditor = getCodeEditor(this);
		if (codeEditor) {
			this.toUnbind.push(codeEditor.onDidChangeModelLanguage(e => this.updateEditorConfiguration()));
			this.toUnbind.push(codeEditor.onDidChangeModel(e => this.updateEditorConfiguration()));
		}

		// Application & Editor focus change to respect auto save settings
		if (isCodeEditor(this.editorControl)) {
			this.toUnbind.push(this.editorControl.onDidBlurEditor(() => this.onEditorFocusLost()));
		} else if (isDiffEditor(this.editorControl)) {
			this.toUnbind.push(this.editorControl.getOriginalEditor().onDidBlurEditor(() => this.onEditorFocusLost()));
			this.toUnbind.push(this.editorControl.getModifiedEditor().onDidBlurEditor(() => this.onEditorFocusLost()));
		}

		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorFocusLost()));
		this.toUnbind.push(DOM.addDisposableListener(window, DOM.EventType.BLUR, () => this.onWindowFocusLost()));
	}

	private onEditorFocusLost(): void {
		this.maybeTriggerSaveAll(SaveReason.FOCUS_CHANGE);
	}

	private onWindowFocusLost(): void {
		this.maybeTriggerSaveAll(SaveReason.WINDOW_CHANGE);
	}

	private maybeTriggerSaveAll(reason: SaveReason): void {
		const mode = this.textFileService.getAutoSaveMode();

		// Determine if we need to save all. In case of a window focus change we also save if auto save mode
		// is configured to be ON_FOCUS_CHANGE (editor focus change)
		if (
			(reason === SaveReason.WINDOW_CHANGE && (mode === AutoSaveMode.ON_FOCUS_CHANGE || mode === AutoSaveMode.ON_WINDOW_CHANGE)) ||
			(reason === SaveReason.FOCUS_CHANGE && mode === AutoSaveMode.ON_FOCUS_CHANGE)
		) {
			if (this.textFileService.isDirty()) {
				this.textFileService.saveAll(void 0, { reason }).done(null, errors.onUnexpectedError);
			}
		}
	}

	/**
	 * This method creates and returns the text editor control to be used. Subclasses can override to
	 * provide their own editor control that should be used (e.g. a DiffEditor).
	 *
	 * The passed in configuration object should be passed to the editor control when creating it.
	 */
	protected createEditorControl(parent: HTMLElement, configuration: IEditorOptions): IEditor {

		// Use a getter for the instantiation service since some subclasses might use scoped instantiation services
		return this.instantiationService.createInstance(CodeEditor, parent, configuration);
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => {

			// Update editor options after having set the input. We do this because there can be
			// editor input specific options (e.g. an ARIA label depending on the input showing)
			this.updateEditorConfiguration();
			this._editorContainer.setAttribute('aria-label', this.computeAriaLabel());
		});
	}

	public changePosition(position: Position): void {
		super.changePosition(position);

		// Make sure to update ARIA label if the position of this editor changed
		if (this.editorControl) {
			this.editorControl.updateOptions({ ariaLabel: this.computeAriaLabel() });
		}
	}

	protected setEditorVisible(visible: boolean, position: Position = null): void {

		// Pass on to Editor
		if (visible) {
			this.consumePendingConfigurationChangeEvent();
			this.editorControl.onVisible();
		} else {
			this.editorControl.onHide();
		}

		super.setEditorVisible(visible, position);
	}

	public focus(): void {
		this.editorControl.focus();
	}

	public layout(dimension: DOM.Dimension): void {

		// Pass on to Editor
		this.editorControl.layout(dimension);
	}

	public getControl(): IEditor {
		return this.editorControl;
	}

	/**
	 * Saves the text editor view state for the given resource.
	 */
	protected saveTextEditorViewState(resource: URI): void {
		const editorViewState = this.retrieveTextEditorViewState(resource);
		if (!editorViewState) {
			return;
		}

		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);

		let textEditorViewStateMemento: { [key: string]: { [position: number]: IEditorViewState } } = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (!textEditorViewStateMemento) {
			textEditorViewStateMemento = Object.create(null);
			memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY] = textEditorViewStateMemento;
		}

		let lastKnownViewState = textEditorViewStateMemento[resource.toString()];
		if (!lastKnownViewState) {
			lastKnownViewState = Object.create(null);
			textEditorViewStateMemento[resource.toString()] = lastKnownViewState;
		}

		if (typeof this.position === 'number') {
			lastKnownViewState[this.position] = editorViewState;
		}
	}

	protected retrieveTextEditorViewState(resource: URI): IEditorViewState {
		const editor = getCodeOrDiffEditor(this).codeEditor;
		if (!editor) {
			return null; // not supported for diff editors
		}

		const model = editor.getModel();
		if (!model) {
			return null; // view state always needs a model
		}

		const modelUri = model.uri;
		if (!modelUri) {
			return null; // model URI is needed to make sure we save the view state correctly
		}

		if (modelUri.toString() !== resource.toString()) {
			return null; // prevent saving view state for a model that is not the expected one
		}

		return editor.saveViewState();
	}

	/**
	 * Clears the text editor view state for the given resources.
	 */
	protected clearTextEditorViewState(resources: URI[]): void {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		const textEditorViewStateMemento: { [key: string]: { [position: number]: IEditorViewState } } = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (textEditorViewStateMemento) {
			resources.forEach(resource => delete textEditorViewStateMemento[resource.toString()]);
		}
	}

	/**
	 * Loads the text editor view state for the given resource and returns it.
	 */
	protected loadTextEditorViewState(resource: URI): IEditorViewState {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		const textEditorViewStateMemento: { [key: string]: { [position: number]: IEditorViewState } } = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (textEditorViewStateMemento) {
			const viewState = textEditorViewStateMemento[resource.toString()];
			if (viewState) {
				return viewState[this.position];
			}
		}

		return null;
	}

	private updateEditorConfiguration(configuration = this.configurationService.getValue<IEditorConfiguration>(this.getResource())): void {
		if (!this.editorControl) {
			return;
		}

		const editorConfiguration = this.computeConfiguration(configuration);

		// Try to figure out the actual editor options that changed from the last time we updated the editor.
		// We do this so that we are not overwriting some dynamic editor settings (e.g. word wrap) that might
		// have been applied to the editor directly.
		let editorSettingsToApply = editorConfiguration;
		if (this.lastAppliedEditorOptions) {
			editorSettingsToApply = objects.distinct(this.lastAppliedEditorOptions, editorSettingsToApply);
		}

		if (Object.keys(editorSettingsToApply).length > 0) {
			this.lastAppliedEditorOptions = editorConfiguration;
			this.editorControl.updateOptions(editorSettingsToApply);
		}
	}

	protected getResource(): URI {
		const codeEditor = getCodeEditor(this);
		if (codeEditor) {
			const model = codeEditor.getModel();
			if (model) {
				return model.uri;
			}
		}

		if (this.input) {
			return this.input.getResource();
		}

		return null;
	}

	protected abstract getAriaLabel(): string;

	public dispose(): void {
		this.lastAppliedEditorOptions = void 0;
		this.editorControl.dispose();

		super.dispose();
	}
}
