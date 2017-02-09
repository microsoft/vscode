/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Dimension, Builder } from 'vs/base/browser/builder';
import objects = require('vs/base/common/objects');
import types = require('vs/base/common/types');
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { EditorInput, EditorOptions, toResource } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorViewState, IEditor, IEditorOptions } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/platform/editor/common/editor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { Scope } from 'vs/workbench/common/memento';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { IModeService } from 'vs/editor/common/services/modeService';

const TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'textEditorViewState';

interface ITextEditorViewState {
	0?: IEditorViewState;
	1?: IEditorViewState;
	2?: IEditorViewState;
}

export interface IEditorConfiguration {
	editor: any;
	diffEditor: any;
}

/**
 * The base class of editors that leverage the text editor for the editing experience. This class is only intended to
 * be subclassed and not instantiated.
 */
export abstract class BaseTextEditor extends BaseEditor {
	private editorControl: IEditor;
	private _editorContainer: Builder;
	private hasPendingConfigurationChange: boolean;

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IThemeService private themeService: IThemeService,
		@IModeService private modeService: IModeService
	) {
		super(id, telemetryService);

		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.handleConfigurationChangeEvent(e.config)));
		this.toUnbind.push(themeService.onDidColorThemeChange(e => this.handleConfigurationChangeEvent(this.configurationService.getConfiguration<IEditorConfiguration>())));
	}

	protected get instantiationService(): IInstantiationService {
		return this._instantiationService;
	}

	protected get configurationService(): IConfigurationService {
		return this._configurationService;
	}

	private handleConfigurationChangeEvent(configuration: IEditorConfiguration): void {
		if (this.isVisible()) {
			this.applyConfiguration(configuration);
		} else {
			this.hasPendingConfigurationChange = true;
		}
	}

	private consumePendingConfigurationChangeEvent(): void {
		if (this.hasPendingConfigurationChange) {
			this.applyConfiguration(this.configurationService.getConfiguration<IEditorConfiguration>());
			this.hasPendingConfigurationChange = false;
		}
	}

	private applyConfiguration(configuration: IEditorConfiguration): void {
		if (!this.editorControl) {
			return;
		}

		const editorConfiguration = this.computeConfiguration(configuration);

		// Apply to control
		this.editorControl.updateOptions(editorConfiguration);
	}

	protected computeConfiguration(configuration: IEditorConfiguration): IEditorOptions {

		// Specific editor options always overwrite user configuration
		const editorConfiguration: IEditorOptions = types.isObject(configuration.editor) ? objects.clone(configuration.editor) : Object.create(null);
		objects.assign(editorConfiguration, this.getConfigurationOverrides());

		// ARIA label
		editorConfiguration.ariaLabel = this.computeAriaLabel();

		return editorConfiguration;
	}

	private computeAriaLabel(): string {
		let ariaLabel = this.getAriaLabel();

		// Apply group information to help identify in which group we are
		if (ariaLabel && typeof this.position === 'number') {
			ariaLabel = nls.localize('editorLabelWithGroup', "{0} Group {1}.", ariaLabel, this.position + 1);
		}

		return ariaLabel;
	}

	protected getConfigurationOverrides(): IEditorOptions {
		const overrides = {};
		const language = this.getLanguage();
		if (language) {
			objects.assign(overrides, this.configurationService.getConfiguration<IEditorConfiguration>({ overrideIdentifier: language, section: 'editor' }));
		}

		objects.assign(overrides, {
			overviewRulerLanes: 3,
			lineNumbersMinChars: 3,
			theme: this.themeService.getColorTheme().id,
			fixedOverflowWidgets: true
		});

		return overrides;
	}

	protected createEditor(parent: Builder): void {

		// Editor for Text
		this._editorContainer = parent;
		this.editorControl = this.createEditorControl(parent, this.computeConfiguration(this.configurationService.getConfiguration<IEditorConfiguration>()));
		const codeEditor = getCodeEditor(this);
		if (codeEditor) {
			this.toUnbind.push(codeEditor.onDidChangeModelLanguage(e => this.updateEditorConfiguration()));
			this.toUnbind.push(codeEditor.onDidChangeModel(e => this.updateEditorConfiguration()));
		}
	}

	/**
	 * This method creates and returns the text editor control to be used. Subclasses can override to
	 * provide their own editor control that should be used (e.g. a DiffEditor).
	 *
	 * The passed in configuration object should be passed to the editor control when creating it.
	 */
	protected createEditorControl(parent: Builder, configuration: IEditorOptions): IEditor {

		// Use a getter for the instantiation service since some subclasses might use scoped instantiation services
		return this.instantiationService.createInstance(CodeEditor, parent.getHTMLElement(), configuration);
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => {

			// Update editor options after having set the input. We do this because there can be
			// editor input specific options (e.g. an ARIA label depending on the input showing)
			this.updateEditorConfiguration();
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

	public layout(dimension: Dimension): void {

		// Pass on to Editor
		this.editorControl.layout(dimension);
	}

	public getControl(): IEditor {
		return this.editorControl;
	}

	/**
	 * Saves the text editor view state under the given key.
	 */
	protected saveTextEditorViewState(key: string): void {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		let textEditorViewStateMemento = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (!textEditorViewStateMemento) {
			textEditorViewStateMemento = Object.create(null);
			memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY] = textEditorViewStateMemento;
		}

		const editorViewState = this.getControl().saveViewState();

		let fileViewState: ITextEditorViewState = textEditorViewStateMemento[key];
		if (!fileViewState) {
			fileViewState = Object.create(null);
			textEditorViewStateMemento[key] = fileViewState;
		}

		if (typeof this.position === 'number') {
			fileViewState[this.position] = editorViewState;
		}
	}

	/**
	 * Clears the text editor view state under the given key.
	 */
	protected clearTextEditorViewState(keys: string[]): void {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		const textEditorViewStateMemento = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (textEditorViewStateMemento) {
			keys.forEach(key => delete textEditorViewStateMemento[key]);
		}
	}

	/**
	 * Loads the text editor view state for the given key and returns it.
	 */
	protected loadTextEditorViewState(key: string): IEditorViewState {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		const textEditorViewStateMemento = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (textEditorViewStateMemento) {
			const fileViewState: ITextEditorViewState = textEditorViewStateMemento[key];
			if (fileViewState) {
				return fileViewState[this.position];
			}
		}

		return null;
	}

	private updateEditorConfiguration(): void {
		this.editorControl.updateOptions(this.computeConfiguration(this.configurationService.getConfiguration<IEditorConfiguration>()));
	}

	protected getLanguage(): string {
		const codeEditor = getCodeEditor(this);
		if (codeEditor) {
			const model = codeEditor.getModel();
			if (model) {
				return model.getLanguageIdentifier().language;
			}
		}

		if (this.input) {
			const resource = toResource(this.input);
			if (resource) {
				return this.modeService.getModeIdByFilenameOrFirstLine(resource.fsPath);
			}
		}

		return null;
	}

	protected abstract getAriaLabel(): string;

	public dispose(): void {

		// Destroy Editor Control
		this.editorControl.destroy();

		super.dispose();
	}
}