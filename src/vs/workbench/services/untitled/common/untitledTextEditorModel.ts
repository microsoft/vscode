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
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { ITextBufferFactory, ITextModel } from 'vs/editor/common/model';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { IResolvedTextEditorModel, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IWorkingCopyService, IWorkingCopy, WorkingCopyCapabilities, IWorkingCopyBackup } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IModelContentChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { withNullAsUndefined, assertIsDefined } from 'vs/base/common/types';
import { ILabelService } from 'vs/platform/label/common/label';
import { ensureValidWordDefinition } from 'vs/editor/common/model/wordHelper';

export interface IUntitledTextEditorModel extends ITextEditorModel, IModeSupport, IEncodingSupport, IWorkingCopy {

	/**
	 * Wether this untitled text model has an associated file path.
	 */
	readonly hasAssociatedFilePath: boolean;
}

export class UntitledTextEditorModel extends BaseTextEditorModel implements IUntitledTextEditorModel {

	private static readonly FIRST_LINE_NAME_MAX_LENGTH = 40;

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidChangeName = this._register(new Emitter<void>());
	readonly onDidChangeName = this._onDidChangeName.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeEncoding = this._register(new Emitter<void>());
	readonly onDidChangeEncoding = this._onDidChangeEncoding.event;

	readonly capabilities = WorkingCopyCapabilities.Untitled;

	private cachedModelFirstLineWords: string | undefined = undefined;
	get name(): string {
		// Take name from first line if present and only if
		// we have no associated file path. In that case we
		// prefer the file name as title.
		if (!this.hasAssociatedFilePath && this.cachedModelFirstLineWords) {
			return this.cachedModelFirstLineWords;
		}

		// Otherwise fallback to resource
		return this.labelService.getUriBasenameLabel(this.resource);
	}

	private dirty = false;
	private ignoreDirtyOnModelContentChange = false;

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
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super(modelService, modeService);

		// Make known to working copy service
		this._register(this.workingCopyService.registerWorkingCopy(this));

		this.registerListeners();
	}

	private registerListeners(): void {

		// Config Changes
		this._register(this.textResourceConfigurationService.onDidChangeConfiguration(e => this.onConfigurationChange()));
	}

	private onConfigurationChange(): void {
		const configuredEncoding = this.textResourceConfigurationService.getValue<string>(this.resource, 'files.encoding');

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

	setValue(value: string, ignoreDirty?: boolean): void {
		if (ignoreDirty) {
			this.ignoreDirtyOnModelContentChange = true;
		}

		try {
			this.updateTextEditorModel(createTextBufferFactory(value));
		} finally {
			this.ignoreDirtyOnModelContentChange = false;
		}
	}

	isReadonly(): boolean {
		return false;
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

	async save(options?: ISaveOptions): Promise<boolean> {
		const target = await this.textFileService.save(this.resource, options);

		return !!target;
	}

	async revert(): Promise<boolean> {
		this.setDirty(false);

		// A reverted untitled model is invalid because it has
		// no actual source on disk to revert to. As such we
		// dispose the model.
		this.dispose();

		return true;
	}

	async backup(): Promise<IWorkingCopyBackup> {
		return { content: withNullAsUndefined(this.createSnapshot()) };
	}

	async load(): Promise<UntitledTextEditorModel & IResolvedTextEditorModel> {

		// Check for backups
		const backup = await this.backupFileService.resolve(this.resource);

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

		// Figure out encoding now that model is present
		this.configuredEncoding = this.textResourceConfigurationService.getValue<string>(this.resource, 'files.encoding');

		// Listen to text model events
		const textEditorModel = assertIsDefined(this.textEditorModel);
		this._register(textEditorModel.onDidChangeContent(e => this.onModelContentChanged(textEditorModel, e)));
		this._register(textEditorModel.onDidChangeLanguage(() => this.onConfigurationChange())); // mode change can have impact on config

		// Name
		if (backup || this.initialValue) {
			this.updateNameFromFirstLine();
		}

		// Untitled associated to file path are dirty right away as well as untitled with content
		this.setDirty(this.hasAssociatedFilePath || !!backup || !!this.initialValue);

		// If we have initial contents, make sure to emit this
		// as the appropiate events to the outside.
		if (backup || this.initialValue) {
			this._onDidChangeContent.fire();
		}

		return this as UntitledTextEditorModel & IResolvedTextEditorModel;
	}

	private onModelContentChanged(model: ITextModel, e: IModelContentChangedEvent): void {
		this.versionId++;

		if (!this.ignoreDirtyOnModelContentChange) {
			// mark the untitled text editor as non-dirty once its content becomes empty and we do
			// not have an associated path set. we never want dirty indicator in that case.
			if (!this.hasAssociatedFilePath && model.getLineCount() === 1 && model.getLineContent(1) === '') {
				this.setDirty(false);
			}

			// turn dirty otherwise
			else {
				this.setDirty(true);
			}
		}

		// Check for name change if first line changed in the range of 0-FIRST_LINE_NAME_MAX_LENGTH columns
		if (e.changes.some(change => (change.range.startLineNumber === 1 || change.range.endLineNumber === 1) && change.range.startColumn <= UntitledTextEditorModel.FIRST_LINE_NAME_MAX_LENGTH)) {
			this.updateNameFromFirstLine();
		}

		// Emit as general content change event
		this._onDidChangeContent.fire();
	}

	private updateNameFromFirstLine(): void {
		if (this.hasAssociatedFilePath) {
			return; // not in case of an associated file path
		}

		// Determine the first words of the model following these rules:
		// - cannot be only whitespace (so we trim())
		// - cannot be only non-alphanumeric characters (so we run word definition regex over it)
		// - cannot be longer than FIRST_LINE_MAX_TITLE_LENGTH

		let modelFirstWordsCandidate: string | undefined = undefined;

		const firstLineText = this.textEditorModel?.getValueInRange({ startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: UntitledTextEditorModel.FIRST_LINE_NAME_MAX_LENGTH + 1 }).trim();
		if (firstLineText && ensureValidWordDefinition().exec(firstLineText)) {
			modelFirstWordsCandidate = firstLineText;
		}

		if (modelFirstWordsCandidate !== this.cachedModelFirstLineWords) {
			this.cachedModelFirstLineWords = modelFirstWordsCandidate;
			this._onDidChangeName.fire();
		}
	}
}
