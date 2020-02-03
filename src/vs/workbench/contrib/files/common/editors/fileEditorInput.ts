/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { createMemoizer } from 'vs/base/common/decorators';
import { dirname } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { EncodingMode, IFileEditorInput, ITextEditorModel, Verbosity, TextEditorInput } from 'vs/workbench/common/editor';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileOperationError, FileOperationResult, IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { ITextFileService, ModelState, LoadReason, TextFileOperationError, TextFileOperationResult, ITextFileEditorModel } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IReference } from 'vs/base/common/lifecycle';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FILE_EDITOR_INPUT_ID, TEXT_FILE_EDITOR_ID, BINARY_FILE_EDITOR_ID } from 'vs/workbench/contrib/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

const enum ForceOpenAs {
	None,
	Text,
	Binary
}

/**
 * A file editor input is the input type for the file editor of file system resources.
 */
export class FileEditorInput extends TextEditorInput implements IFileEditorInput {

	private static readonly MEMOIZER = createMemoizer();

	private preferredEncoding: string | undefined;
	private preferredMode: string | undefined;

	private forceOpenAs: ForceOpenAs = ForceOpenAs.None;

	private textModelReference: Promise<IReference<ITextEditorModel>> | null = null;

	constructor(
		resource: URI,
		preferredEncoding: string | undefined,
		preferredMode: string | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService textFileService: ITextFileService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ILabelService private readonly labelService: ILabelService,
		@IFileService private readonly fileService: IFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(resource, editorService, editorGroupService, textFileService);

		if (preferredEncoding) {
			this.setPreferredEncoding(preferredEncoding);
		}

		if (preferredMode) {
			this.setPreferredMode(preferredMode);
		}

		this.registerListeners();
	}

	private registerListeners(): void {

		// Dirty changes
		this._register(this.textFileService.files.onDidChangeDirty(m => this.onDirtyStateChange(m)));
		this._register(this.textFileService.files.onDidSave(e => this.onDirtyStateChange(e.model)));
		this._register(this.textFileService.files.onDidSaveError(m => this.onDirtyStateChange(m)));
		this._register(this.textFileService.files.onDidRevert(m => this.onDirtyStateChange(m)));

		// Label changes
		this._register(this.labelService.onDidChangeFormatters(() => FileEditorInput.MEMOIZER.clear()));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(() => FileEditorInput.MEMOIZER.clear()));
		this._register(this.textFileService.files.onDidChangeOrphaned(model => this.onModelOrphanedChanged(model)));
	}

	private onDirtyStateChange(model: ITextFileEditorModel): void {
		if (model.resource.toString() === this.resource.toString()) {
			this._onDidChangeDirty.fire();
		}
	}

	private onModelOrphanedChanged(model: ITextFileEditorModel): void {
		if (model.resource.toString() === this.resource.toString()) {
			FileEditorInput.MEMOIZER.clear();
			this._onDidChangeLabel.fire();
		}
	}

	getEncoding(): string | undefined {
		const textModel = this.textFileService.files.get(this.resource);
		if (textModel) {
			return textModel.getEncoding();
		}

		return this.preferredEncoding;
	}

	getPreferredEncoding(): string | undefined {
		return this.preferredEncoding;
	}

	setEncoding(encoding: string, mode: EncodingMode): void {
		this.setPreferredEncoding(encoding);

		const textModel = this.textFileService.files.get(this.resource);
		if (textModel) {
			textModel.setEncoding(encoding, mode);
		}
	}

	setPreferredEncoding(encoding: string): void {
		this.preferredEncoding = encoding;
		this.setForceOpenAsText(); // encoding is a good hint to open the file as text
	}

	getPreferredMode(): string | undefined {
		return this.preferredMode;
	}

	setMode(mode: string): void {
		this.setPreferredMode(mode);

		const textModel = this.textFileService.files.get(this.resource);
		if (textModel) {
			textModel.setMode(mode);
		}
	}

	setPreferredMode(mode: string): void {
		this.preferredMode = mode;
		this.setForceOpenAsText(); // mode is a good hint to open the file as text
	}

	setForceOpenAsText(): void {
		this.forceOpenAs = ForceOpenAs.Text;
	}

	setForceOpenAsBinary(): void {
		this.forceOpenAs = ForceOpenAs.Binary;
	}

	getTypeId(): string {
		return FILE_EDITOR_INPUT_ID;
	}

	@FileEditorInput.MEMOIZER
	getName(): string {
		return this.decorateLabel(this.labelService.getUriBasenameLabel(this.resource));
	}

	getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string {
		switch (verbosity) {
			case Verbosity.SHORT:
				return this.shortDescription;
			case Verbosity.LONG:
				return this.longDescription;
			case Verbosity.MEDIUM:
			default:
				return this.mediumDescription;
		}
	}

	@FileEditorInput.MEMOIZER
	private get shortDescription(): string {
		return this.labelService.getUriBasenameLabel(dirname(this.resource));
	}

	@FileEditorInput.MEMOIZER
	private get mediumDescription(): string {
		return this.labelService.getUriLabel(dirname(this.resource), { relative: true });
	}

	@FileEditorInput.MEMOIZER
	private get longDescription(): string {
		return this.labelService.getUriLabel(dirname(this.resource));
	}

	@FileEditorInput.MEMOIZER
	private get shortTitle(): string {
		return this.getName();
	}

	@FileEditorInput.MEMOIZER
	private get mediumTitle(): string {
		return this.labelService.getUriLabel(this.resource, { relative: true });
	}

	@FileEditorInput.MEMOIZER
	private get longTitle(): string {
		return this.labelService.getUriLabel(this.resource);
	}

	getTitle(verbosity: Verbosity): string {
		switch (verbosity) {
			case Verbosity.SHORT:
				// already decorated by getName()
				return this.shortTitle;
			default:
			case Verbosity.MEDIUM:
				return this.decorateLabel(this.mediumTitle);
			case Verbosity.LONG:
				return this.decorateLabel(this.longTitle);
		}
	}

	private decorateLabel(label: string): string {
		const model = this.textFileService.files.get(this.resource);

		if (model?.hasState(ModelState.ORPHAN)) {
			return localize('orphanedFile', "{0} (deleted)", label);
		}

		if (this.isReadonly()) {
			return localize('readonlyFile', "{0} (read-only)", label);
		}

		return label;
	}

	isReadonly(): boolean {
		const model = this.textFileService.files.get(this.resource);

		return model?.isReadonly() || this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly);
	}

	isDirty(): boolean {
		const model = this.textFileService.files.get(this.resource);
		if (!model) {
			return false;
		}

		return model.isDirty();
	}

	isSaving(): boolean {
		const model = this.textFileService.files.get(this.resource);
		if (!model) {
			return false;
		}

		if (model.hasState(ModelState.SAVED) || model.hasState(ModelState.CONFLICT) || model.hasState(ModelState.ERROR)) {
			return false; // require the model to be dirty and not in conflict or error state
		}

		// Note: currently not checking for ModelState.PENDING_SAVE for a reason
		// because we currently miss an event for this state change on editors
		// and it could result in bad UX where an editor can be closed even though
		// it shows up as dirty and has not finished saving yet.

		if (this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
			return true; // a short auto save is configured, treat this as being saved
		}

		return false;
	}

	getPreferredEditorId(candidates: string[]): string {
		return this.forceOpenAs === ForceOpenAs.Binary ? BINARY_FILE_EDITOR_ID : TEXT_FILE_EDITOR_ID;
	}

	resolve(): Promise<TextFileEditorModel | BinaryEditorModel> {

		// Resolve as binary
		if (this.forceOpenAs === ForceOpenAs.Binary) {
			return this.doResolveAsBinary();
		}

		// Resolve as text
		return this.doResolveAsText();
	}

	private async doResolveAsText(): Promise<TextFileEditorModel | BinaryEditorModel> {

		// Resolve as text
		try {
			await this.textFileService.files.resolve(this.resource, {
				mode: this.preferredMode,
				encoding: this.preferredEncoding,
				reload: { async: true }, // trigger a reload of the model if it exists already but do not wait to show the model
				allowBinary: this.forceOpenAs === ForceOpenAs.Text,
				reason: LoadReason.EDITOR
			});

			// This is a bit ugly, because we first resolve the model and then resolve a model reference. the reason being that binary
			// or very large files do not resolve to a text file model but should be opened as binary files without text. First calling into
			// resolve() ensures we are not creating model references for these kind of resources.
			// In addition we have a bit of payload to take into account (encoding, reload) that the text resolver does not handle yet.
			if (!this.textModelReference) {
				this.textModelReference = this.textModelResolverService.createModelReference(this.resource);
			}

			const ref = await this.textModelReference;

			return ref.object as TextFileEditorModel;
		} catch (error) {

			// In case of an error that indicates that the file is binary or too large, just return with the binary editor model
			if (
				(<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY ||
				(<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE
			) {
				return this.doResolveAsBinary();
			}

			// Bubble any other error up
			throw error;
		}
	}

	private async doResolveAsBinary(): Promise<BinaryEditorModel> {
		return this.instantiationService.createInstance(BinaryEditorModel, this.resource, this.getName()).load();
	}

	isResolved(): boolean {
		return !!this.textFileService.files.get(this.resource);
	}

	dispose(): void {

		// Model reference
		if (this.textModelReference) {
			this.textModelReference.then(ref => ref.dispose());
			this.textModelReference = null;
		}

		super.dispose();
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			return otherInput instanceof FileEditorInput && otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}
}
