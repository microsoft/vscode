/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Dimension, Builder } from 'vs/base/browser/builder';
import objects = require('vs/base/common/objects');
import errors = require('vs/base/common/errors');
import DOM = require('vs/base/browser/dom');
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { IEditor, IEditorOptions, EventType as EditorEventType } from 'vs/editor/common/editorCommon';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { Position } from 'vs/platform/editor/common/editor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEventService } from 'vs/platform/event/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { ITextFileService, SaveReason, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { EventEmitter } from 'vs/base/common/eventEmitter';

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
		@IWorkspaceContextService private _contextService: IWorkspaceContextService,
		@IStorageService private _storageService: IStorageService,
		@IMessageService private _messageService: IMessageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEventService private _eventService: IEventService,
		@IWorkbenchEditorService private _editorService: IWorkbenchEditorService,
		@IThemeService private themeService: IThemeService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super(id, telemetryService);

		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.handleConfigurationChangeEvent(e.config)));
		this.toUnbind.push(themeService.onDidColorThemeChange(_ => this.handleConfigurationChangeEvent()));
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

	public get eventService(): IEventService {
		return this._eventService;
	}

	public get editorService() {
		return this._editorService;
	}

	public get editorContainer(): Builder {
		return this._editorContainer;
	}

	private handleConfigurationChangeEvent(configuration?: any): void {
		if (this.isVisible()) {
			this.applyConfiguration(configuration);
		} else {
			this.hasPendingConfigurationChange = true;
		}
	}

	private consumePendingConfigurationChangeEvent(): void {
		if (this.hasPendingConfigurationChange) {
			this.applyConfiguration(this.configurationService.getConfiguration());
			this.hasPendingConfigurationChange = false;
		}
	}

	protected applyConfiguration(configuration?: any): void {
		if (!this.editorControl) {
			return;
		}

		// Configuration & Options
		if (configuration) {
			const specificEditorSettings = this.getCodeEditorOptions();
			configuration = objects.clone(configuration); // dont modify original config
			objects.assign(configuration[EditorConfiguration.EDITOR_SECTION], specificEditorSettings);
			EditorConfiguration.apply(configuration, this.editorControl);
		}

		// Just options
		else {
			this.editorControl.updateOptions(this.getCodeEditorOptions());
		}
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
		this.applyConfiguration(this.configurationService.getConfiguration<IFilesConfiguration>());
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

	public dispose(): void {

		// Destroy Editor Control
		this.editorControl.destroy();

		super.dispose();
	}
}