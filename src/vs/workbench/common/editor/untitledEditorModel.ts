/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorModel, IEncodingSupport } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import URI from 'vs/base/common/uri';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { EndOfLinePreference } from 'vs/editor/common/editorCommon';
import { IFilesConfiguration, CONTENT_CHANGE_EVENT_BUFFER_DELAY } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IMode } from 'vs/editor/common/modes';
import Event, { Emitter } from 'vs/base/common/event';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IBackupFileService, BACKUP_FILE_RESOLVE_OPTIONS } from 'vs/workbench/services/backup/common/backup';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export class UntitledEditorModel extends BaseTextEditorModel implements IEncodingSupport {

	public static DEFAULT_CONTENT_CHANGE_BUFFER_DELAY = CONTENT_CHANGE_EVENT_BUFFER_DELAY;

	private textModelChangeListener: IDisposable;
	private configurationChangeListener: IDisposable;

	private dirty: boolean;
	private _onDidChangeContent: Emitter<void>;
	private _onDidChangeDirty: Emitter<void>;
	private _onDidChangeEncoding: Emitter<void>;

	private versionId: number;

	private contentChangeEventScheduler: RunOnceScheduler;

	private configuredEncoding: string;
	private preferredEncoding: string;

	private hasAssociatedFilePath: boolean;

	constructor(
		private modeId: string,
		private resource: URI,
		hasAssociatedFilePath: boolean,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(modelService, modeService);

		this.hasAssociatedFilePath = hasAssociatedFilePath;
		this.dirty = false;
		this.versionId = 0;

		this._onDidChangeContent = new Emitter<void>();
		this._onDidChangeDirty = new Emitter<void>();
		this._onDidChangeEncoding = new Emitter<void>();

		this.contentChangeEventScheduler = new RunOnceScheduler(() => this._onDidChangeContent.fire(), UntitledEditorModel.DEFAULT_CONTENT_CHANGE_BUFFER_DELAY);

		this.registerListeners();
	}

	public get onDidChangeContent(): Event<void> {
		return this._onDidChangeContent.event;
	}

	public get onDidChangeDirty(): Event<void> {
		return this._onDidChangeDirty.event;
	}

	public get onDidChangeEncoding(): Event<void> {
		return this._onDidChangeEncoding.event;
	}

	protected getOrCreateMode(modeService: IModeService, modeId: string, firstLineText?: string): TPromise<IMode> {
		if (!modeId || modeId === PLAINTEXT_MODE_ID) {
			return modeService.getOrCreateModeByFilenameOrFirstLine(this.resource.fsPath, firstLineText); // lookup mode via resource path if the provided modeId is unspecific
		}

		return super.getOrCreateMode(modeService, modeId, firstLineText);
	}

	private registerListeners(): void {

		// Config Changes
		this.configurationChangeListener = this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config));
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		this.configuredEncoding = configuration && configuration.files && configuration.files.encoding;
	}

	public getVersionId(): number {
		return this.versionId;
	}

	public getValue(): string {
		if (this.textEditorModel) {
			return this.textEditorModel.getValue(EndOfLinePreference.TextDefined, true /* Preserve BOM */);
		}

		return null;
	}

	public getModeId(): string {
		if (this.textEditorModel) {
			return this.textEditorModel.getLanguageIdentifier().language;
		}

		return null;
	}

	public getEncoding(): string {
		return this.preferredEncoding || this.configuredEncoding;
	}

	public setEncoding(encoding: string): void {
		const oldEncoding = this.getEncoding();
		this.preferredEncoding = encoding;

		// Emit if it changed
		if (oldEncoding !== this.preferredEncoding) {
			this._onDidChangeEncoding.fire();
		}
	}

	public isDirty(): boolean {
		return this.dirty;
	}

	private setDirty(dirty: boolean): void {
		if (this.dirty === dirty) {
			return;
		}

		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	public getResource(): URI {
		return this.resource;
	}

	public revert(): void {
		this.setDirty(false);

		// Handle content change event buffered
		this.contentChangeEventScheduler.schedule();
	}

	public load(): TPromise<EditorModel> {

		// Check for backups first
		return this.backupFileService.loadBackupResource(this.resource).then(backupResource => {
			if (backupResource) {
				return this.textFileService.resolveTextContent(backupResource, BACKUP_FILE_RESOLVE_OPTIONS).then(rawTextContent => {
					return this.backupFileService.parseBackupContent(rawTextContent.value);
				});
			}

			return null;
		}).then(backupContent => {

			// untitled associated to file path are dirty right away as well as untitled with content
			this.setDirty(this.hasAssociatedFilePath || !!backupContent);

			return this.doLoad(backupContent || '').then(model => {
				const configuration = this.configurationService.getConfiguration<IFilesConfiguration>();

				// Encoding
				this.configuredEncoding = configuration && configuration.files && configuration.files.encoding;

				// Listen to content changes
				this.textModelChangeListener = this.textEditorModel.onDidChangeContent(e => this.onModelContentChanged());

				return model;
			});
		});
	}

	private doLoad(content: string): TPromise<EditorModel> {

		// Create text editor model if not yet done
		if (!this.textEditorModel) {
			return this.createTextEditorModel(content, this.resource, this.modeId);
		}

		// Otherwise update
		else {
			this.updateTextEditorModel(content);
		}

		return TPromise.as<EditorModel>(this);
	}

	private onModelContentChanged(): void {
		this.versionId++;

		// mark the untitled editor as non-dirty once its content becomes empty and we do
		// not have an associated path set. we never want dirty indicator in that case.
		if (!this.hasAssociatedFilePath && this.textEditorModel.getLineCount() === 1 && this.textEditorModel.getLineContent(1) === '') {
			this.setDirty(false);
		}

		// turn dirty otherwise
		else {
			this.setDirty(true);
		}

		// Handle content change event buffered
		this.contentChangeEventScheduler.schedule();
	}

	public dispose(): void {
		super.dispose();

		if (this.textModelChangeListener) {
			this.textModelChangeListener.dispose();
			this.textModelChangeListener = null;
		}

		if (this.configurationChangeListener) {
			this.configurationChangeListener.dispose();
			this.configurationChangeListener = null;
		}

		this.contentChangeEventScheduler.dispose();

		this._onDidChangeContent.dispose();
		this._onDidChangeDirty.dispose();
		this._onDidChangeEncoding.dispose();
	}
}