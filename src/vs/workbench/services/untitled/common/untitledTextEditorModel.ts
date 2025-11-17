/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISaveOptions } from '../../../common/editor.js';
import { BaseTextEditorModel } from '../../../common/editor/textEditorModel.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IWorkingCopyBackupService } from '../../workingCopy/common/workingCopyBackup.js';
import { ITextResourceConfigurationChangeEvent, ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { createTextBufferFactory, createTextBufferFactoryFromStream } from '../../../../editor/common/model/textModel.js';
import { ITextEditorModel } from '../../../../editor/common/services/resolverService.js';
import { IWorkingCopyService } from '../../workingCopy/common/workingCopyService.js';
import { IWorkingCopy, WorkingCopyCapabilities, IWorkingCopyBackup, NO_TYPE_ID, IWorkingCopySaveEvent } from '../../workingCopy/common/workingCopy.js';
import { IEncodingSupport, ILanguageSupport, ITextFileService } from '../../textfile/common/textfiles.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ensureValidWordDefinition } from '../../../../editor/common/core/wordHelper.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getCharContainingOffset } from '../../../../base/common/strings.js';
import { UTF8 } from '../../textfile/common/encoding.js';
import { bufferToReadable, bufferToStream, VSBuffer, VSBufferReadable, VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { ILanguageDetectionService } from '../../languageDetection/common/languageDetectionWorkerService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';

export interface IUntitledTextEditorModel extends ITextEditorModel, ILanguageSupport, IEncodingSupport, IWorkingCopy {

	/**
	 * Emits an event when the encoding of this untitled model changes.
	 */
	readonly onDidChangeEncoding: Event<void>;

	/**
	 * Emits an event when the name of this untitled model changes.
	 */
	readonly onDidChangeName: Event<void>;

	/**
	 * Emits an event when this untitled model is reverted.
	 */
	readonly onDidRevert: Event<void>;

	/**
	 * Whether this untitled text model has an associated file path.
	 */
	readonly hasAssociatedFilePath: boolean;

	/**
	 * Whether this model has an explicit language or not.
	 */
	readonly hasLanguageSetExplicitly: boolean;

	/**
	 * Sets the encoding to use for this untitled model.
	 */
	setEncoding(encoding: string): Promise<void>;

	/**
	 * Resolves the untitled model.
	 */
	resolve(): Promise<void>;

	/**
	 * Whether this model is resolved or not.
	 */
	isResolved(): this is IResolvedUntitledTextEditorModel;
}

export interface IResolvedUntitledTextEditorModel extends IUntitledTextEditorModel {

	readonly textEditorModel: ITextModel;
}

export class UntitledTextEditorModel extends BaseTextEditorModel implements IUntitledTextEditorModel {

	private static readonly FIRST_LINE_NAME_MAX_LENGTH = 40;
	private static readonly FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH = this.FIRST_LINE_NAME_MAX_LENGTH * 10;

	// Support the special '${activeEditorLanguage}' language by
	// looking up the language id from the editor that is active
	// before the untitled editor opens. This special id is only
	// used for the initial language and can be changed after the
	// fact (either manually or through auto-detection).
	private static readonly ACTIVE_EDITOR_LANGUAGE_ID = '${activeEditorLanguage}';

	//#region Events

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidChangeName = this._register(new Emitter<void>());
	readonly onDidChangeName = this._onDidChangeName.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeEncoding = this._register(new Emitter<void>());
	readonly onDidChangeEncoding = this._onDidChangeEncoding.event;

	private readonly _onDidSave = this._register(new Emitter<IWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<void>());
	readonly onDidRevert = this._onDidRevert.event;

	//#endregion

	readonly typeId = NO_TYPE_ID; // IMPORTANT: never change this to not break existing assumptions (e.g. backups)

	readonly capabilities = WorkingCopyCapabilities.Untitled;

	//#region Name

	private configuredLabelFormat: 'content' | 'name' = 'content';

	private cachedModelFirstLineWords: string | undefined = undefined;
	get name(): string {

		// Take name from first line if present and only if
		// we have no associated file path. In that case we
		// prefer the file name as title.
		if (this.configuredLabelFormat === 'content' && !this.hasAssociatedFilePath && this.cachedModelFirstLineWords) {
			return this.cachedModelFirstLineWords;
		}

		// Otherwise fallback to resource
		return this.labelService.getUriBasenameLabel(this.resource);
	}

	//#endregion

	constructor(
		readonly resource: URI,
		readonly hasAssociatedFilePath: boolean,
		private readonly initialValue: string | undefined,
		private preferredLanguageId: string | undefined,
		private preferredEncoding: string | undefined,
		@ILanguageService languageService: ILanguageService,
		@IModelService modelService: IModelService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ILabelService private readonly labelService: ILabelService,
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageDetectionService languageDetectionService: ILanguageDetectionService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(modelService, languageService, languageDetectionService, accessibilityService);

		this.dirty = this.hasAssociatedFilePath || !!this.initialValue;

		// Make known to working copy service
		this._register(this.workingCopyService.registerWorkingCopy(this));

		// This is typically controlled by the setting `files.defaultLanguage`.
		// If that setting is set, we should not detect the language.
		if (preferredLanguageId) {
			this.setLanguageId(preferredLanguageId);
		}

		// Fetch config
		this.onConfigurationChange(undefined, false);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Config Changes
		this._register(this.textResourceConfigurationService.onDidChangeConfiguration(e => this.onConfigurationChange(e, true)));
	}

	private onConfigurationChange(e: ITextResourceConfigurationChangeEvent | undefined, fromEvent: boolean): void {

		// Encoding
		if (!e || e.affectsConfiguration(this.resource, 'files.encoding')) {
			const configuredEncoding = this.textResourceConfigurationService.getValue(this.resource, 'files.encoding');
			if (this.configuredEncoding !== configuredEncoding && typeof configuredEncoding === 'string') {
				this.configuredEncoding = configuredEncoding;

				if (fromEvent && !this.preferredEncoding) {
					this._onDidChangeEncoding.fire(); // do not fire event if we have a preferred encoding set
				}
			}
		}

		// Label Format
		if (!e || e.affectsConfiguration(this.resource, 'workbench.editor.untitled.labelFormat')) {
			const configuredLabelFormat = this.textResourceConfigurationService.getValue(this.resource, 'workbench.editor.untitled.labelFormat');
			if (this.configuredLabelFormat !== configuredLabelFormat && (configuredLabelFormat === 'content' || configuredLabelFormat === 'name')) {
				this.configuredLabelFormat = configuredLabelFormat;

				if (fromEvent) {
					this._onDidChangeName.fire();
				}
			}
		}
	}

	//#region Language

	override setLanguageId(languageId: string, source?: string): void {
		const actualLanguage: string | undefined = languageId === UntitledTextEditorModel.ACTIVE_EDITOR_LANGUAGE_ID
			? this.editorService.activeTextEditorLanguageId
			: languageId;
		this.preferredLanguageId = actualLanguage;

		if (actualLanguage) {
			super.setLanguageId(actualLanguage, source);
		}
	}

	override getLanguageId(): string | undefined {
		if (this.textEditorModel) {
			return this.textEditorModel.getLanguageId();
		}

		return this.preferredLanguageId;
	}

	//#endregion

	//#region Encoding

	private configuredEncoding: string | undefined;

	getEncoding(): string | undefined {
		return this.preferredEncoding || this.configuredEncoding;
	}

	async setEncoding(encoding: string): Promise<void> {
		const oldEncoding = this.getEncoding();
		this.preferredEncoding = encoding;

		// Emit if it changed
		if (oldEncoding !== this.preferredEncoding) {
			this._onDidChangeEncoding.fire();
		}
	}

	//#endregion

	//#region Dirty

	private dirty: boolean;

	isDirty(): boolean {
		return this.dirty;
	}

	isModified(): boolean {
		return this.isDirty();
	}

	private setDirty(dirty: boolean): void {
		if (this.dirty === dirty) {
			return;
		}

		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	//#endregion

	//#region Save / Revert / Backup

	async save(options?: ISaveOptions): Promise<boolean> {
		const target = await this.textFileService.save(this.resource, options);

		// Emit as event
		if (target) {
			this._onDidSave.fire({ reason: options?.reason, source: options?.source });
		}

		return !!target;
	}

	async revert(): Promise<void> {

		// Reset contents to be empty
		this.ignoreDirtyOnModelContentChange = true;
		try {
			this.updateTextEditorModel(createTextBufferFactory(''));
		} finally {
			this.ignoreDirtyOnModelContentChange = false;
		}

		// No longer dirty
		this.setDirty(false);

		// Emit as event
		this._onDidRevert.fire();
	}

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {
		let content: VSBufferReadable | undefined = undefined;

		// Make sure to check whether this model has been resolved
		// or not and fallback to the initial value - if any - to
		// prevent backing up an unresolved model and loosing the
		// initial value.
		if (this.isResolved()) {
			// Fill in content the same way we would do when saving the file
			// via the text file service encoding support (hardcode UTF-8)
			content = await this.textFileService.getEncodedReadable(this.resource, this.createSnapshot() ?? undefined, { encoding: UTF8 });
		} else if (typeof this.initialValue === 'string') {
			content = bufferToReadable(VSBuffer.fromString(this.initialValue));
		}

		return { content };
	}

	//#endregion

	//#region Resolve

	private ignoreDirtyOnModelContentChange = false;

	override async resolve(): Promise<void> {

		// Create text editor model if not yet done
		let createdUntitledModel = false;
		let hasBackup = false;
		if (!this.textEditorModel) {
			let untitledContents: VSBufferReadableStream;

			// Check for backups or use initial value or empty
			const backup = await this.workingCopyBackupService.resolve(this);
			if (backup) {
				untitledContents = backup.value;
				hasBackup = true;
			} else {
				untitledContents = bufferToStream(VSBuffer.fromString(this.initialValue || ''));
			}

			// Determine untitled contents based on backup
			// or initial value. We must use text file service
			// to create the text factory to respect encodings
			// accordingly.
			const untitledContentsFactory = await createTextBufferFactoryFromStream(await this.textFileService.getDecodedStream(this.resource, untitledContents, { encoding: UTF8 }));

			this.createTextEditorModel(untitledContentsFactory, this.resource, this.preferredLanguageId);
			createdUntitledModel = true;
		}

		// Otherwise: the untitled model already exists and we must assume
		// that the value of the model was changed by the user. As such we
		// do not update the contents, only the language if configured.
		else {
			this.updateTextEditorModel(undefined, this.preferredLanguageId);
		}

		// Listen to text model events
		const textEditorModel = assertReturnsDefined(this.textEditorModel);
		this.installModelListeners(textEditorModel);

		// Only adjust name and dirty state etc. if we
		// actually created the untitled model
		if (createdUntitledModel) {

			// Name
			if (hasBackup || this.initialValue) {
				this.updateNameFromFirstLine(textEditorModel);
			}

			// Untitled associated to file path are dirty right away as well as untitled with content
			this.setDirty(this.hasAssociatedFilePath || !!hasBackup || !!this.initialValue);

			// If we have initial contents, make sure to emit this
			// as the appropiate events to the outside.
			if (hasBackup || this.initialValue) {
				this._onDidChangeContent.fire();
			}
		}

		return super.resolve();
	}

	override isResolved(): this is IResolvedUntitledTextEditorModel {
		return !!this.textEditorModelHandle;
	}

	protected override installModelListeners(model: ITextModel): void {
		this._register(model.onDidChangeContent(e => this.onModelContentChanged(model, e)));
		this._register(model.onDidChangeLanguage(() => this.onConfigurationChange(undefined, true))); // language change can have impact on config

		super.installModelListeners(model);
	}

	private onModelContentChanged(textEditorModel: ITextModel, e: IModelContentChangedEvent): void {
		if (!this.ignoreDirtyOnModelContentChange) {

			// mark the untitled text editor as non-dirty once its content becomes empty and we do
			// not have an associated path set. we never want dirty indicator in that case.
			if (!this.hasAssociatedFilePath && textEditorModel.getLineCount() === 1 && textEditorModel.getLineLength(1) === 0) {
				this.setDirty(false);
			}

			// turn dirty otherwise
			else {
				this.setDirty(true);
			}
		}

		// Check for name change if first line changed in the range of 0-FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH columns
		if (e.changes.some(change => (change.range.startLineNumber === 1 || change.range.endLineNumber === 1) && change.range.startColumn <= UntitledTextEditorModel.FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH)) {
			this.updateNameFromFirstLine(textEditorModel);
		}

		// Emit as general content change event
		this._onDidChangeContent.fire();

		// Detect language from content
		this.autoDetectLanguage();
	}

	private updateNameFromFirstLine(textEditorModel: ITextModel): void {
		if (this.hasAssociatedFilePath) {
			return; // not in case of an associated file path
		}

		// Determine the first words of the model following these rules:
		// - cannot be only whitespace (so we trim())
		// - cannot be only non-alphanumeric characters (so we run word definition regex over it)
		// - cannot be longer than FIRST_LINE_MAX_TITLE_LENGTH
		// - normalize multiple whitespaces to a single whitespace

		let modelFirstWordsCandidate: string | undefined = undefined;

		let firstLineText = textEditorModel
			.getValueInRange({
				startLineNumber: 1,
				endLineNumber: 1,
				startColumn: 1,
				endColumn: UntitledTextEditorModel.FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH + 1		// first cap at FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH
			})
			.trim().replace(/\s+/g, ' ') 														// normalize whitespaces
			.replace(/\u202E/g, '');															// drop Right-to-Left Override character (#190133)
		firstLineText = firstLineText.substr(0, getCharContainingOffset(						// finally cap at FIRST_LINE_NAME_MAX_LENGTH (grapheme aware #111235)
			firstLineText,
			UntitledTextEditorModel.FIRST_LINE_NAME_MAX_LENGTH)[0]
		);

		if (firstLineText && ensureValidWordDefinition().exec(firstLineText)) {
			modelFirstWordsCandidate = firstLineText;
		}

		if (modelFirstWordsCandidate !== this.cachedModelFirstLineWords) {
			this.cachedModelFirstLineWords = modelFirstWordsCandidate;
			this._onDidChangeName.fire();
		}
	}

	//#endregion

	override isReadonly(): boolean {
		return false;
	}
}
