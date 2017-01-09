/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Dimension, Builder } from 'vs/base/browser/builder';
import objects = require('vs/base/common/objects');
import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');
import DOM = require('vs/base/browser/dom');
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorViewState, IEditor, IEditorOptions, EventType as EditorEventType, EditorType } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/platform/editor/common/editor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { ITextFileService, SaveReason, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { Scope } from 'vs/workbench/common/memento';

const TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'textEditorViewState';

interface ITextEditorViewState {
	0?: IEditorViewState;
	1?: IEditorViewState;
	2?: IEditorViewState;
}

interface IEditorConfiguration {
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
	private pendingAutoSave: TPromise<void>;

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IThemeService private themeService: IThemeService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super(id, telemetryService);

		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.handleConfigurationChangeEvent(e.config)));
		this.toUnbind.push(themeService.onDidColorThemeChange(e => this.handleConfigurationChangeEvent(this.configurationService.getConfiguration<IEditorConfiguration>())));
	}

	protected get instantiationService(): IInstantiationService {
		return this._instantiationService;
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

		// Specific editor options always overwrite user configuration
		const editorConfiguration = types.isObject(configuration.editor) ? objects.clone(configuration.editor) : Object.create(null);
		objects.assign(editorConfiguration, this.getCodeEditorOptions());

		// Handle diff editor specially by merging in diffEditor configuration
		if (this.editorControl.getEditorType() === EditorType.IDiffEditor && types.isObject(configuration.diffEditor)) {
			objects.mixin(editorConfiguration, configuration.diffEditor);
		}

		// Apply to control
		this.editorControl.updateOptions(editorConfiguration);
	}

	protected getCodeEditorOptions(): IEditorOptions {
		return {
			overviewRulerLanes: 3,
			lineNumbersMinChars: 3,
			theme: this.themeService.getColorTheme(),
			fixedOverflowWidgets: true
		};
	}

	public createEditor(parent: Builder): void {

		// Editor for Text
		this._editorContainer = parent;
		this.editorControl = this.createEditorControl(parent);

		// Application & Editor focus change
		if (this.editorControl instanceof EventEmitter) {
			this.toUnbind.push(this.editorControl.addListener2(EditorEventType.EditorBlur, () => this.onEditorFocusLost()));
		}
		this.toUnbind.push(DOM.addDisposableListener(window, DOM.EventType.BLUR, () => this.onWindowFocusLost()));

		// Configuration
		this.applyConfiguration(this.configurationService.getConfiguration<IEditorConfiguration>());
	}

	private onEditorFocusLost(): void {
		if (this.pendingAutoSave) {
			return; // save is already triggered
		}

		if (this.textFileService.getAutoSaveMode() === AutoSaveMode.ON_FOCUS_CHANGE && this.textFileService.isDirty()) {
			this.saveAll(SaveReason.FOCUS_CHANGE);
		}
	}

	private onWindowFocusLost(): void {
		if (this.pendingAutoSave) {
			return; // save is already triggered
		}

		if (this.textFileService.getAutoSaveMode() === AutoSaveMode.ON_WINDOW_CHANGE && this.textFileService.isDirty()) {
			this.saveAll(SaveReason.WINDOW_CHANGE);
		}
	}

	private saveAll(reason: SaveReason): void {
		this.pendingAutoSave = this.textFileService.saveAll(void 0, reason).then(() => {
			this.pendingAutoSave = void 0;

			return void 0;
		}, error => {
			this.pendingAutoSave = void 0;
			errors.onUnexpectedError(error);

			return void 0;
		});
	}

	/**
	 * This method creates and returns the text editor control to be used. Subclasses can override to
	 * provide their own editor control that should be used (e.g. a DiffEditor).
	 */
	public createEditorControl(parent: Builder): IEditor {

		// Use a getter for the instantiation service since some subclasses might use scoped instantiation services
		return this.instantiationService.createInstance(CodeEditor, parent.getHTMLElement(), this.getCodeEditorOptions());
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => {
			this.editorControl.updateOptions(this.getCodeEditorOptions()); // support input specific editor options
		});
	}

	public setEditorVisible(visible: boolean, position: Position = null): void {

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

	public dispose(): void {

		// Destroy Editor Control
		this.editorControl.destroy();

		super.dispose();
	}
}