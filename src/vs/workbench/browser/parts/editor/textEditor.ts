/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import * as objects from 'vs/base/common/objects';
import * as types from 'vs/base/common/types';
import * as DOM from 'vs/base/browser/dom';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorInput, EditorOptions, IEditorMemento, ITextEditor } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorViewState, IEditor } from 'vs/editor/common/editorCommon';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITextFileService, SaveReason, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { isDiffEditor, isCodeEditor, getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWindowService } from 'vs/platform/windows/common/windows';

const TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'textEditorViewState';

export interface IEditorConfiguration {
	editor: object;
	diffEditor: object;
}

/**
 * The base class of editors that leverage the text editor for the editing experience. This class is only intended to
 * be subclassed and not instantiated.
 */
export abstract class BaseTextEditor extends BaseEditor implements ITextEditor {
	private editorControl: IEditor;
	private _editorContainer: HTMLElement;
	private hasPendingConfigurationChange: boolean;
	private lastAppliedEditorOptions?: IEditorOptions;
	private editorMemento: IEditorMemento<IEditorViewState>;

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService private readonly _configurationService: ITextResourceConfigurationService,
		@IThemeService protected themeService: IThemeService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEditorService protected editorService: IEditorService,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService,
		@IWindowService private readonly windowService: IWindowService
	) {
		super(id, telemetryService, themeService, storageService);

		this.editorMemento = this.getEditorMemento<IEditorViewState>(editorGroupService, TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY, 100);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			const resource = this.getResource();
			const value = resource ? this.configurationService.getValue<IEditorConfiguration>(resource) : undefined;
			return this.handleConfigurationChangeEvent(value);
		}));
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
		if (ariaLabel) {
			if (this.group) {
				ariaLabel = nls.localize('editorLabelWithGroup', "{0}, {1}.", ariaLabel, this.group.label);
			}
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
		this.editorControl = this._register(this.createEditorControl(parent, this.computeConfiguration(this.configurationService.getValue<IEditorConfiguration>(this.getResource()!))));

		// Model & Language changes
		const codeEditor = getCodeEditor(this.editorControl);
		if (codeEditor) {
			this._register(codeEditor.onDidChangeModelLanguage(e => this.updateEditorConfiguration()));
			this._register(codeEditor.onDidChangeModel(e => this.updateEditorConfiguration()));
		}

		// Application & Editor focus change to respect auto save settings
		if (isCodeEditor(this.editorControl)) {
			this._register(this.editorControl.onDidBlurEditorWidget(() => this.onEditorFocusLost()));
		} else if (isDiffEditor(this.editorControl)) {
			this._register(this.editorControl.getOriginalEditor().onDidBlurEditorWidget(() => this.onEditorFocusLost()));
			this._register(this.editorControl.getModifiedEditor().onDidBlurEditorWidget(() => this.onEditorFocusLost()));
		}

		this._register(this.editorService.onDidActiveEditorChange(() => this.onEditorFocusLost()));
		this._register(this.windowService.onDidChangeFocus(focused => this.onWindowFocusChange(focused)));
	}

	private onEditorFocusLost(): void {
		this.maybeTriggerSaveAll(SaveReason.FOCUS_CHANGE);
	}

	private onWindowFocusChange(focused: boolean): void {
		if (!focused) {
			this.maybeTriggerSaveAll(SaveReason.WINDOW_CHANGE);
		}
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
				this.textFileService.saveAll(undefined, { reason });
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
		return this.instantiationService.createInstance(CodeEditorWidget, parent, configuration, {});
	}

	async setInput(input: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, token);

		// Update editor options after having set the input. We do this because there can be
		// editor input specific options (e.g. an ARIA label depending on the input showing)
		this.updateEditorConfiguration();
		this._editorContainer.setAttribute('aria-label', this.computeAriaLabel());
	}

	protected setEditorVisible(visible: boolean, group: IEditorGroup): void {

		// Pass on to Editor
		if (visible) {
			this.consumePendingConfigurationChangeEvent();
			this.editorControl.onVisible();
		} else {
			this.editorControl.onHide();
		}

		super.setEditorVisible(visible, group);
	}

	focus(): void {
		this.editorControl.focus();
	}

	layout(dimension: DOM.Dimension): void {

		// Pass on to Editor
		this.editorControl.layout(dimension);
	}

	getControl(): IEditor {
		return this.editorControl;
	}

	/**
	 * Saves the text editor view state for the given resource.
	 */
	protected saveTextEditorViewState(resource: URI): void {
		const editorViewState = this.retrieveTextEditorViewState(resource);
		if (!editorViewState || !this.group) {
			return;
		}

		this.editorMemento.saveEditorState(this.group, resource, editorViewState);
	}

	protected retrieveTextEditorViewState(resource: URI): IEditorViewState | null {
		const control = this.getControl();
		if (!isCodeEditor(control)) {
			return null;
		}

		const model = control.getModel();
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

		return control.saveViewState();
	}

	/**
	 * Clears the text editor view state for the given resources.
	 */
	protected clearTextEditorViewState(resources: URI[], group?: IEditorGroup): void {
		resources.forEach(resource => {
			this.editorMemento.clearEditorState(resource, group);
		});
	}

	/**
	 * Loads the text editor view state for the given resource and returns it.
	 */
	protected loadTextEditorViewState(resource: URI): IEditorViewState | undefined {
		return this.group ? this.editorMemento.loadEditorState(this.group, resource) : undefined;
	}

	private updateEditorConfiguration(configuration?: IEditorConfiguration): void {
		if (!configuration) {
			const resource = this.getResource();
			if (resource) {
				configuration = this.configurationService.getValue<IEditorConfiguration>(resource);
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
			editorSettingsToApply = objects.distinct(this.lastAppliedEditorOptions, editorSettingsToApply);
		}

		if (Object.keys(editorSettingsToApply).length > 0) {
			this.lastAppliedEditorOptions = editorConfiguration;
			this.editorControl.updateOptions(editorSettingsToApply);
		}
	}

	protected getResource(): URI | undefined {
		const codeEditor = getCodeEditor(this.editorControl);
		if (codeEditor) {
			const model = codeEditor.getModel();
			if (model) {
				return model.uri;
			}
		}

		if (this.input) {
			return this.input.getResource();
		}

		return undefined;
	}

	protected abstract getAriaLabel(): string;

	dispose(): void {
		this.lastAppliedEditorOptions = undefined;

		super.dispose();
	}
}
