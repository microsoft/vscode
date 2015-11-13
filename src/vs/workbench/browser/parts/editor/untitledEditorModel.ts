/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EditorModel, IEncodingSupport} from 'vs/workbench/common/editor';
import {StringEditorModel} from 'vs/workbench/browser/parts/editor/stringEditorModel';
import URI from 'vs/base/common/uri';
import {IModelContentChangedEvent, EventType, EndOfLinePreference} from 'vs/editor/common/editorCommon';
import {EventType as WorkbenchEventType, UntitledEditorEvent, ResourceEvent} from 'vs/workbench/browser/events';
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';

export class UntitledEditorModel extends StringEditorModel implements IEncodingSupport {
	private textModelChangeListener: () => void;
	private configurationChangeListenerUnbind: () => void;

	private dirty: boolean;
	private configuredEncoding: string;
	private preferredEncoding: string;

	constructor(
		value: string,
		modeId: string,
		resource: URI,
		hasAssociatedFilePath: boolean,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IEventService private eventService: IEventService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(value, modeId, resource, modeService, modelService);

		this.dirty = hasAssociatedFilePath; // untitled associated to file path are dirty right away

		this.registerListeners();
	}

	private registerListeners(): void {

		// Config Changes
		this.configurationChangeListenerUnbind = this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => this.onConfigurationChange(e.config));
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		this.configuredEncoding = configuration && configuration.files && configuration.files.encoding;
	}

	public getValue(): string {
		if (this.textEditorModel) {
			return this.textEditorModel.getValue(EndOfLinePreference.TextDefined, true /* Preserve BOM */);
		}

		return null;
	}

	public getModeId(): string {
		if (this.textEditorModel) {
			return this.textEditorModel.getModeId();
		}

		return null;
	}

	public getEncoding(): string {
		return this.preferredEncoding || this.configuredEncoding;
	}

	public setEncoding(encoding: string): void {
		let oldEncoding = this.getEncoding();
		this.preferredEncoding = encoding;

		// Emit if it changed
		if (oldEncoding !== this.preferredEncoding) {
			this.eventService.emit(WorkbenchEventType.RESOURCE_ENCODING_CHANGED, new ResourceEvent(this.resource));
		}
	}

	public isDirty(): boolean {
		return this.dirty;
	}

	public load(): TPromise<EditorModel> {
		return super.load().then((model) => {
			return this.configurationService.loadConfiguration().then((configuration: IFilesConfiguration) => {

				// Encoding
				this.configuredEncoding = configuration && configuration.files && configuration.files.encoding;

				// Listen to content changes
				this.textModelChangeListener = this.textEditorModel.addListener(EventType.ModelContentChanged, (e: IModelContentChangedEvent) => this.onModelContentChanged(e));

				// Emit initial dirty event if we are
				if (this.dirty) {
					setTimeout(() => {
						this.eventService.emit(WorkbenchEventType.UNTITLED_FILE_DIRTY, new UntitledEditorEvent(this.resource));
					}, 0 /* prevent race condition between creating model and emitting dirty event */);
				}

				return model;
			});
		});
	}

	private onModelContentChanged(e: IModelContentChangedEvent): void {
		if (!this.dirty) {
			this.dirty = true;
			this.eventService.emit(WorkbenchEventType.UNTITLED_FILE_DIRTY, new UntitledEditorEvent(this.resource));
		}
	}

	public dispose(): void {
		super.dispose();

		if (this.textModelChangeListener) {
			this.textModelChangeListener();
			this.textModelChangeListener = null;
		}

		if (this.configurationChangeListenerUnbind) {
			this.configurationChangeListenerUnbind();
			this.configurationChangeListenerUnbind = null;
		}

		this.eventService.emit(WorkbenchEventType.UNTITLED_FILE_DELETED, new UntitledEditorEvent(this.resource));
	}
}