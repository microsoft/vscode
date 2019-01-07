/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { memoize } from 'vs/base/common/decorators';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { EncodingMode, ConfirmResult, EditorInput, IFileEditorInput, ITextEditorModel, Verbosity, IRevertOptions } from 'vs/workbench/common/editor';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { ITextFileService, AutoSaveMode, ModelState, TextFileModelChangeEvent, LoadReason } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IReference } from 'vs/base/common/lifecycle';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { FILE_EDITOR_INPUT_ID, TEXT_FILE_EDITOR_ID, BINARY_FILE_EDITOR_ID } from 'vs/workbench/parts/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';

/**
 * A file editor input is the input type for the file editor of file system resources.
 */
export class FileEditorInput extends EditorInput implements IFileEditorInput {
	private preferredEncoding: string;
	private forceOpenAsBinary: boolean;
	private forceOpenAsText: boolean;
	private textModelReference: Promise<IReference<ITextEditorModel>>;
	private name: string;

	/**
	 * An editor input who's contents are retrieved from file services.
	 */
	constructor(
		private resource: URI,
		preferredEncoding: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IHashService private readonly hashService: IHashService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();

		this.setPreferredEncoding(preferredEncoding);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Model changes
		this._register(this.textFileService.models.onModelDirty(e => this.onDirtyStateChange(e)));
		this._register(this.textFileService.models.onModelSaveError(e => this.onDirtyStateChange(e)));
		this._register(this.textFileService.models.onModelSaved(e => this.onDirtyStateChange(e)));
		this._register(this.textFileService.models.onModelReverted(e => this.onDirtyStateChange(e)));
		this._register(this.textFileService.models.onModelOrphanedChanged(e => this.onModelOrphanedChanged(e)));
	}

	private onDirtyStateChange(e: TextFileModelChangeEvent): void {
		if (e.resource.toString() === this.resource.toString()) {
			this._onDidChangeDirty.fire();
		}
	}

	private onModelOrphanedChanged(e: TextFileModelChangeEvent): void {
		if (e.resource.toString() === this.resource.toString()) {
			this._onDidChangeLabel.fire();
		}
	}

	getResource(): URI {
		return this.resource;
	}

	getEncoding(): string {
		const textModel = this.textFileService.models.get(this.resource);
		if (textModel) {
			return textModel.getEncoding();
		}

		return this.preferredEncoding;
	}

	getPreferredEncoding(): string {
		return this.preferredEncoding;
	}

	setEncoding(encoding: string, mode: EncodingMode): void {
		this.preferredEncoding = encoding;

		const textModel = this.textFileService.models.get(this.resource);
		if (textModel) {
			textModel.setEncoding(encoding, mode);
		}
	}

	setPreferredEncoding(encoding: string): void {
		this.preferredEncoding = encoding;

		if (encoding) {
			this.forceOpenAsText = true; // encoding is a good hint to open the file as text
		}
	}

	setForceOpenAsText(): void {
		this.forceOpenAsText = true;
		this.forceOpenAsBinary = false;
	}

	setForceOpenAsBinary(): void {
		this.forceOpenAsBinary = true;
		this.forceOpenAsText = false;
	}

	getTypeId(): string {
		return FILE_EDITOR_INPUT_ID;
	}

	getName(): string {
		if (!this.name) {
			this.name = resources.basenameOrAuthority(this.resource);
		}

		return this.decorateLabel(this.name);
	}

	@memoize
	private get shortDescription(): string {
		return paths.basename(this.labelService.getUriLabel(resources.dirname(this.resource)));
	}

	@memoize
	private get mediumDescription(): string {
		return this.labelService.getUriLabel(resources.dirname(this.resource), { relative: true });
	}

	@memoize
	private get longDescription(): string {
		return this.labelService.getUriLabel(resources.dirname(this.resource), { relative: true });
	}

	getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string {
		let description: string;
		switch (verbosity) {
			case Verbosity.SHORT:
				description = this.shortDescription;
				break;
			case Verbosity.LONG:
				description = this.longDescription;
				break;
			case Verbosity.MEDIUM:
			default:
				description = this.mediumDescription;
				break;
		}

		return description;
	}

	@memoize
	private get shortTitle(): string {
		return this.getName();
	}

	@memoize
	private get mediumTitle(): string {
		return this.labelService.getUriLabel(this.resource, { relative: true });
	}

	@memoize
	private get longTitle(): string {
		return this.labelService.getUriLabel(this.resource);
	}

	getTitle(verbosity: Verbosity): string {
		let title: string;
		switch (verbosity) {
			case Verbosity.SHORT:
				title = this.shortTitle;
				break;
			case Verbosity.MEDIUM:
				title = this.mediumTitle;
				break;
			case Verbosity.LONG:
				title = this.longTitle;
				break;
		}

		return this.decorateLabel(title);
	}

	private decorateLabel(label: string): string {
		const model = this.textFileService.models.get(this.resource);
		if (model && model.hasState(ModelState.ORPHAN)) {
			return localize('orphanedFile', "{0} (deleted from disk)", label);
		}
		if (model && model.isReadonly()) {
			return localize('readonlyFile', "{0} (read-only)", label);
		}

		return label;
	}

	isDirty(): boolean {
		const model = this.textFileService.models.get(this.resource);
		if (!model) {
			return false;
		}

		if (model.hasState(ModelState.CONFLICT) || model.hasState(ModelState.ERROR)) {
			return true; // always indicate dirty state if we are in conflict or error state
		}

		if (this.textFileService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
			return false; // fast auto save enabled so we do not declare dirty
		}

		return model.isDirty();
	}

	confirmSave(): Promise<ConfirmResult> {
		return this.textFileService.confirmSave([this.resource]);
	}

	save(): Promise<boolean> {
		return this.textFileService.save(this.resource);
	}

	revert(options?: IRevertOptions): Promise<boolean> {
		return this.textFileService.revert(this.resource, options);
	}

	getPreferredEditorId(candidates: string[]): string {
		return this.forceOpenAsBinary ? BINARY_FILE_EDITOR_ID : TEXT_FILE_EDITOR_ID;
	}

	resolve(): Promise<TextFileEditorModel | BinaryEditorModel> {

		// Resolve as binary
		if (this.forceOpenAsBinary) {
			return this.doResolveAsBinary();
		}

		// Resolve as text
		return this.doResolveAsText();
	}

	private doResolveAsText(): Promise<TextFileEditorModel | BinaryEditorModel> {

		// Resolve as text
		return this.textFileService.models.loadOrCreate(this.resource, {
			encoding: this.preferredEncoding,
			reload: { async: true }, // trigger a reload of the model if it exists already but do not wait to show the model
			allowBinary: this.forceOpenAsText,
			reason: LoadReason.EDITOR
		}).then(model => {

			// This is a bit ugly, because we first resolve the model and then resolve a model reference. the reason being that binary
			// or very large files do not resolve to a text file model but should be opened as binary files without text. First calling into
			// loadOrCreate ensures we are not creating model references for these kind of resources.
			// In addition we have a bit of payload to take into account (encoding, reload) that the text resolver does not handle yet.
			if (!this.textModelReference) {
				this.textModelReference = this.textModelResolverService.createModelReference(this.resource);
			}

			return this.textModelReference.then(ref => ref.object as TextFileEditorModel);
		}, error => {

			// In case of an error that indicates that the file is binary or too large, just return with the binary editor model
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY || (<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
				return this.doResolveAsBinary();
			}

			// Bubble any other error up
			return Promise.reject(error);
		});
	}

	private doResolveAsBinary(): Promise<BinaryEditorModel> {
		return this.instantiationService.createInstance(BinaryEditorModel, this.resource, this.getName()).load().then(m => m as BinaryEditorModel);
	}

	isResolved(): boolean {
		return !!this.textFileService.models.get(this.resource);
	}

	getTelemetryDescriptor(): object {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.getResource(), path => this.hashService.createSHA1(path));

		/* __GDPR__FRAGMENT__
			"EditorTelemetryDescriptor" : {
				"resource": { "${inline}": [ "${URIDescriptor}" ] }
			}
		*/
		return descriptor;
	}

	dispose(): void {

		// Model reference
		if (this.textModelReference) {
			this.textModelReference.then(ref => ref.dispose());
			this.textModelReference = null;
		}

		super.dispose();
	}

	matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			return otherInput instanceof FileEditorInput && otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}
}
