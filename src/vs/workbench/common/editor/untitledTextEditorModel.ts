/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEncodingSupport, ISaveOptions, IModeSupport } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Emitter } from 'vs/base/common/event';
import { IBackupFileService, IResolvedBackup } from 'vs/workbench/services/backup/common/backup';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { ITextBufferFactory } from 'vs/editor/common/model';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { IResolvedTextEditorModel, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IWorkingCopyService, IWorkingCopy, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IModelContentChangedEvent } from 'vs/editor/common/model/textModelEvents';

export interface IUntitledTextEditorModel extends ITextEditorModel, IModeSupport, IEncodingSupport, IWorkingCopy { }

export class UntitledTextEditorModel extends BaseTextEditorModel implements IUntitledTextEditorModel {

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidChangeFirstLine = this._register(new Emitter<void>());
	readonly onDidChangeFirstLine = this._onDidChangeFirstLine.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeEncoding = this._register(new Emitter<void>());
	readonly onDidChangeEncoding = this._onDidChangeEncoding.event;

	readonly capabilities = WorkingCopyCapabilities.Untitled;

	private dirty = false;
	private versionId = 0;
	private configuredEncoding: string | undefined;

	constructor(
		private readonly preferredMode: string | undefined,
		public readonly resource: URI,
		public readonly hasAssociatedFilePath: boolean,
		private readonly initialValue: string | undefined,
		private preferredEncoding: string | undefined,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@ITextResourceConfigurationService private readonly configurationService: ITextResourceConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@ITextFileService private readonly textFileService: ITextFileService
	) {
		super(modelService, modeService);

		// Make known to working copy service
		this._register(this.workingCopyService.registerWorkingCopy(this));

		this.registerListeners();
	}

	private registerListeners(): void {

		// Config Changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange()));
	}

	private onConfigurationChange(): void {
		const configuredEncoding = this.configurationService.getValue<string>(this.resource, 'files.encoding');

		if (this.configuredEncoding !== configuredEncoding) {
			this.configuredEncoding = configuredEncoding;

			if (!this.preferredEncoding) {
				this._onDidChangeEncoding.fire(); // do not fire event if we have a preferred encoding set
			}
		}
	}

	getVersionId(): number {
		return this.versionId;
	}

	getMode(): string | undefined {
		if (this.textEditorModel) {
			return this.textEditorModel.getModeId();
		}

		return this.preferredMode;
	}

	getEncoding(): string | undefined {
		return this.preferredEncoding || this.configuredEncoding;
	}

	setEncoding(encoding: string): void {
		const oldEncoding = this.getEncoding();
		this.preferredEncoding = encoding;

		// Emit if it changed
		if (oldEncoding !== this.preferredEncoding) {
			this._onDidChangeEncoding.fire();
		}
	}

	isDirty(): boolean {
		return this.dirty;
	}

	private setDirty(dirty: boolean): void {
		if (this.dirty === dirty) {
			return;
		}

		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	save(options?: ISaveOptions): Promise<boolean> {
		return this.textFileService.save(this.resource, options);
	}

	async revert(): Promise<boolean> {
		this.setDirty(false);

		return true;
	}

	async backup(): Promise<void> {
		if (this.isResolved()) {
			return this.backupFileService.backupResource(this.resource, this.createSnapshot(), this.versionId);
		}
	}

	hasBackup(): boolean {
		return this.backupFileService.hasBackupSync(this.resource, this.versionId);
	}

	async load(): Promise<UntitledTextEditorModel & IResolvedTextEditorModel> {

		// Check for backups first
		let backup: IResolvedBackup<object> | undefined = undefined;
		const backupResource = await this.backupFileService.loadBackupResource(this.resource);
		if (backupResource) {
			backup = await this.backupFileService.resolveBackupContent(backupResource);
		}

		// untitled associated to file path are dirty right away as well as untitled with content
		this.setDirty(this.hasAssociatedFilePath || !!backup || !!this.initialValue);

		let untitledContents: ITextBufferFactory;
		if (backup) {
			untitledContents = backup.value;
		} else {
			untitledContents = createTextBufferFactory(this.initialValue || '');
		}

		// Create text editor model if not yet done
		if (!this.textEditorModel) {
			this.createTextEditorModel(untitledContents, this.resource, this.preferredMode);
		}

		// Otherwise update
		else {
			this.updateTextEditorModel(untitledContents, this.preferredMode);
		}

		// Encoding
		this.configuredEncoding = this.configurationService.getValue<string>(this.resource, 'files.encoding');

		// We know for a fact there is a text editor model here
		const textEditorModel = this.textEditorModel!;

		// Listen to content changes
		this._register(textEditorModel.onDidChangeContent(e => this.onModelContentChanged(e)));

		// Listen to mode changes
		this._register(textEditorModel.onDidChangeLanguage(() => this.onConfigurationChange())); // mode change can have impact on config

		// If we have initial contents, make sure to emit this
		// as the appropiate events to the outside.
		if (backup || this.initialValue) {
			this._onDidChangeContent.fire();
			this._onDidChangeFirstLine.fire();
		}

		return this as UntitledTextEditorModel & IResolvedTextEditorModel;
	}

	private onModelContentChanged(e: IModelContentChangedEvent): void {
		if (!this.isResolved()) {
			return;
		}

		this.versionId++;

		// mark the untitled text editor as non-dirty once its content becomes empty and we do
		// not have an associated path set. we never want dirty indicator in that case.
		if (!this.hasAssociatedFilePath && this.textEditorModel.getLineCount() === 1 && this.textEditorModel.getLineContent(1) === '') {
			this.setDirty(false);
		}

		// turn dirty otherwise
		else {
			this.setDirty(true);
		}

		// Emit as general content change event
		this._onDidChangeContent.fire();

		// Emit as first line change event depending on actual change
		if (e.changes.some(change => change.range.startLineNumber === 1 || change.range.endLineNumber === 1)) {
			this._onDidChangeFirstLine.fire();
		}
	}

	isReadonly(): boolean {
		return false;
	}
}
