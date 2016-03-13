/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/texteditor';
import {TPromise} from 'vs/base/common/winjs.base';
import {Dimension, Builder} from 'vs/base/browser/builder';
import objects = require('vs/base/common/objects');
import errors = require('vs/base/common/errors');
import {CodeEditorWidget} from 'vs/editor/browser/widget/codeEditorWidget';
import {Preferences} from 'vs/workbench/common/constants';
import {IEditorViewState} from 'vs/editor/common/editorCommon';
import {OptionsChangeEvent, EventType as WorkbenchEventType, EditorEvent, TextEditorSelectionEvent} from 'vs/workbench/common/events';
import {Scope} from 'vs/workbench/common/memento';
import {EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorConfiguration} from 'vs/editor/common/config/commonEditorConfig';
import {IEditorSelection, IEditor, EventType, IConfigurationChangedEvent, IModelContentChangedEvent, IModelOptionsChangedEvent, IModelModeChangedEvent, ICursorPositionChangedEvent, IEditorOptions} from 'vs/editor/common/editorCommon';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {Position} from 'vs/platform/editor/common/editor';
import {DEFAULT_THEME_ID} from 'vs/workbench/services/themes/common/themeService';
import {IStorageService, StorageScope, StorageEvent, StorageEventType} from 'vs/platform/storage/common/storage';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IModeService} from 'vs/editor/common/services/modeService';

const EDITOR_VIEW_STATE_PREFERENCE_KEY = 'editorViewState';

/**
 * The base class of editors that leverage the monaco text editor for the editing experience. This class is only intended to
 * be subclassed and not instantiated.
 */
export abstract class BaseTextEditor extends BaseEditor {
	private editorControl: IEditor;
	private _editorContainer: Builder;

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IWorkspaceContextService private _contextService: IWorkspaceContextService,
		@IStorageService private _storageService: IStorageService,
		@IMessageService private _messageService: IMessageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEventService private _eventService: IEventService,
		@IWorkbenchEditorService private _editorService: IWorkbenchEditorService,
		@IModeService private _modeService: IModeService
	) {
		super(id, telemetryService);

		this.toUnbind.push(this._eventService.addListener(StorageEventType.STORAGE, (e: StorageEvent) => this.onPreferencesChanged(e)));
		this.toUnbind.push(this._eventService.addListener(WorkbenchEventType.WORKBENCH_OPTIONS_CHANGED, (e) => this.onOptionsChanged(e)));
		this.toUnbind.push(this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => this.applyConfiguration(e.config)));
	}

	public get instantiationService(): IInstantiationService {
		return this._instantiationService;
	}

	public get contextService(): IWorkspaceContextService {
		return this._contextService;
	}

	public get storageService(): IStorageService {
		return this._storageService;
	}

	public get messageService() {
		return this._messageService;
	}

	protected applyConfiguration(configuration: IFilesConfiguration): void {

		// Update Editor with configuration and editor settings
		if (this.editorControl) {
			let specificEditorSettings = this.getCodeEditorOptions();
			configuration = objects.clone(configuration); // dont modify original config
			objects.assign(configuration[EditorConfiguration.EDITOR_SECTION], specificEditorSettings);

			EditorConfiguration.apply(configuration, this.editorControl);
		}

		// Update Languages
		this._modeService.configureAllModes(configuration);
	}

	private onOptionsChanged(event: OptionsChangeEvent): void {
		if (this.editorControl) {
			this.editorControl.updateOptions(this.getCodeEditorOptions());
		}
	}

	private onPreferencesChanged(e: StorageEvent): void {

		// Update Theme in Editor Control
		if (e.key === Preferences.THEME) {
			this.editorControl.updateOptions(this.getCodeEditorOptions());
		}
	}

	protected getCodeEditorOptions(): IEditorOptions {
		let baseOptions: IEditorOptions = {
			overviewRulerLanes: 3,
			readOnly: this.contextService.getOptions().readOnly,
			glyphMargin: true,
			lineNumbersMinChars: 3,
			theme: this._storageService.get(Preferences.THEME, StorageScope.GLOBAL, DEFAULT_THEME_ID)
		};

		// Always mixin editor options from the context into our set to allow for override
		return objects.mixin(baseOptions, this.contextService.getOptions().editor);
	}

	public get eventService(): IEventService {
		return this._eventService;
	}

	public get editorService() {
		return this._editorService;
	}

	public get editorContainer(): Builder {
		return this._editorContainer;
	}

	public createEditor(parent: Builder): void {

		// Editor for Text
		this._editorContainer = parent;
		this.editorControl = this.createEditorControl(parent);

		// Hook Listener for Selection changes
		this.toUnbind.push(this.editorControl.addListener(EventType.CursorPositionChanged, (event: ICursorPositionChangedEvent) => {
			let selection = this.editorControl.getSelection();
			this.eventService.emit(WorkbenchEventType.TEXT_EDITOR_SELECTION_CHANGED, new TextEditorSelectionEvent(selection, this, this.getId(), this.input, null, this.position, event));
		}));

		// Hook Listener for mode changes
		this.toUnbind.push(this.editorControl.addListener(EventType.ModelModeChanged, (event: IModelModeChangedEvent) => {
			this.eventService.emit(WorkbenchEventType.TEXT_EDITOR_MODE_CHANGED, new EditorEvent(this, this.getId(), this.input, null, this.position, event));
		}));

		// Hook Listener for content changes
		this.toUnbind.push(this.editorControl.addListener(EventType.ModelContentChanged, (event: IModelContentChangedEvent) => {
			this.eventService.emit(WorkbenchEventType.TEXT_EDITOR_CONTENT_CHANGED, new EditorEvent(this, this.getId(), this.input, null, this.position, event));
		}));

		// Hook Listener for content options changes
		this.toUnbind.push(this.editorControl.addListener(EventType.ModelOptionsChanged, (event: IModelOptionsChangedEvent) => {
			this.eventService.emit(WorkbenchEventType.TEXT_EDITOR_CONTENT_OPTIONS_CHANGED, new EditorEvent(this, this.getId(), this.input, null, this.position, event));
		}));

		// Hook Listener for options changes
		this.toUnbind.push(this.editorControl.addListener(EventType.ConfigurationChanged, (event: IConfigurationChangedEvent) => {
			this.eventService.emit(WorkbenchEventType.TEXT_EDITOR_CONFIGURATION_CHANGED, new EditorEvent(this, this.getId(), this.input, null, this.position, event));
		}));

		// Configuration
		this.configurationService.loadConfiguration().then((config) => {
			this.applyConfiguration(config);
		}, errors.onUnexpectedError);
	}

	/**
	 * This method creates and returns the text editor control to be used. Subclasses can override to
	 * provide their own editor control that should be used (e.g. a DiffEditor).
	 */
	public createEditorControl(parent: Builder): IEditor {
		return this._instantiationService.createInstance(CodeEditorWidget, parent.getHTMLElement(), this.getCodeEditorOptions());
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => {
			this.editorControl.updateOptions(this.getCodeEditorOptions()); // support input specific editor options
		});
	}

	public setVisible(visible: boolean, position: Position = null): TPromise<void> {
		let promise = super.setVisible(visible, position);

		// Pass on to Editor
		if (visible) {
			this.editorControl.onVisible();
		} else {
			this.editorControl.onHide();
		}

		return promise;
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

	public getSelection(): IEditorSelection {
		return this.editorControl.getSelection();
	}

	/**
	 * Saves the text editor view state under the given key.
	 */
	public saveTextEditorViewState(storageService: IStorageService, key: string): void {
		let editorViewState = this.editorControl.saveViewState();

		const memento = this.getMemento(storageService, Scope.WORKSPACE);
		let editorViewStateMemento = memento[EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (!editorViewStateMemento) {
			editorViewStateMemento = {};
			memento[EDITOR_VIEW_STATE_PREFERENCE_KEY] = editorViewStateMemento;
		}

		editorViewStateMemento[key] = editorViewState;
	}

	/**
	 * Clears the text editor view state under the given key.
	 */
	public clearTextEditorViewState(storageService: IStorageService, keys: string[]): void {
		const memento = this.getMemento(storageService, Scope.WORKSPACE);
		let editorViewStateMemento = memento[EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (editorViewStateMemento) {
			keys.forEach((key) => delete editorViewStateMemento[key]);
		}
	}

	/**
	 * Loads the text editor view state for the given key and returns it.
	 */
	public loadTextEditorViewState(storageService: IStorageService, key: string): IEditorViewState {
		const memento = this.getMemento(storageService, Scope.WORKSPACE);
		let editorViewStateMemento = memento[EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (editorViewStateMemento) {
			return editorViewStateMemento[key];
		}

		return null;
	}

	public dispose(): void {

		// Destroy Editor Control
		this.editorControl.destroy();

		super.dispose();
	}
}