/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { memoize } from 'vs/base/common/decorators';
import paths = require('vs/base/common/paths');
import resources = require('vs/base/common/resources');
import labels = require('vs/base/common/labels');
import URI from 'vs/base/common/uri';
import { EncodingMode, ConfirmResult, EditorInput, IFileEditorInput, ITextEditorModel } from 'vs/workbench/common/editor';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { BINARY_FILE_EDITOR_ID, TEXT_FILE_EDITOR_ID, FILE_EDITOR_INPUT_ID } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, AutoSaveMode, ModelState, TextFileModelChangeEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { Verbosity } from 'vs/platform/editor/common/editor';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';

/**
 * A file editor input is the input type for the file editor of file system resources.
 */
export class FileEditorInput extends EditorInput implements IFileEditorInput {
	private forceOpenAsBinary: boolean;
	private textModelReference: TPromise<IReference<ITextEditorModel>>;
	private name: string;
	private toUnbind: IDisposable[];

	/**
	 * An editor input who's contents are retrieved from file services.
	 */
	constructor(
		private resource: URI,
		private preferredEncoding: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITextFileService private textFileService: ITextFileService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@IHashService private hashService: IHashService
	) {
		super();

		this.toUnbind = [];

		this.registerListeners();
	}

	private registerListeners(): void {

		// Model changes
		this.toUnbind.push(this.textFileService.models.onModelDirty(e => this.onDirtyStateChange(e)));
		this.toUnbind.push(this.textFileService.models.onModelSaveError(e => this.onDirtyStateChange(e)));
		this.toUnbind.push(this.textFileService.models.onModelSaved(e => this.onDirtyStateChange(e)));
		this.toUnbind.push(this.textFileService.models.onModelReverted(e => this.onDirtyStateChange(e)));
		this.toUnbind.push(this.textFileService.models.onModelOrphanedChanged(e => this.onModelOrphanedChanged(e)));
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

	public getResource(): URI {
		return this.resource;
	}

	public setPreferredEncoding(encoding: string): void {
		this.preferredEncoding = encoding;
	}

	public getEncoding(): string {
		const textModel = this.textFileService.models.get(this.resource);
		if (textModel) {
			return textModel.getEncoding();
		}

		return this.preferredEncoding;
	}

	public getPreferredEncoding(): string {
		return this.preferredEncoding;
	}

	public setEncoding(encoding: string, mode: EncodingMode): void {
		this.preferredEncoding = encoding;

		const textModel = this.textFileService.models.get(this.resource);
		if (textModel) {
			textModel.setEncoding(encoding, mode);
		}
	}

	public setForceOpenAsBinary(): void {
		this.forceOpenAsBinary = true;
	}

	public getTypeId(): string {
		return FILE_EDITOR_INPUT_ID;
	}

	public getName(): string {
		if (!this.name) {
			this.name = resources.basenameOrAuthority(this.resource);
		}

		return this.decorateOrphanedFiles(this.name);
	}

	@memoize
	private get shortDescription(): string {
		return paths.basename(labels.getPathLabel(resources.dirname(this.resource), void 0, this.environmentService));
	}

	@memoize
	private get mediumDescription(): string {
		return labels.getPathLabel(resources.dirname(this.resource), this.contextService, this.environmentService);
	}

	@memoize
	private get longDescription(): string {
		return labels.getPathLabel(resources.dirname(this.resource), void 0, this.environmentService);
	}

	public getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string {
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
		return labels.getPathLabel(this.resource, this.contextService, this.environmentService);
	}

	@memoize
	private get longTitle(): string {
		return labels.getPathLabel(this.resource, void 0, this.environmentService);
	}

	public getTitle(verbosity: Verbosity): string {
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

		return this.decorateOrphanedFiles(title);
	}

	private decorateOrphanedFiles(label: string): string {
		const model = this.textFileService.models.get(this.resource);
		if (model && model.hasState(ModelState.ORPHAN)) {
			return localize('orphanedFile', "{0} (deleted from disk)", label);
		}

		return label;
	}

	public isDirty(): boolean {
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

	public confirmSave(): ConfirmResult {
		return this.textFileService.confirmSave([this.resource]);
	}

	public save(): TPromise<boolean> {
		return this.textFileService.save(this.resource);
	}

	public revert(): TPromise<boolean> {
		return this.textFileService.revert(this.resource);
	}

	public getPreferredEditorId(candidates: string[]): string {
		return this.forceOpenAsBinary ? BINARY_FILE_EDITOR_ID : TEXT_FILE_EDITOR_ID;
	}

	public resolve(refresh?: boolean): TPromise<TextFileEditorModel | BinaryEditorModel> {

		// Resolve as binary
		if (this.forceOpenAsBinary) {
			return this.resolveAsBinary();
		}

		// Resolve as text
		return this.textFileService.models.loadOrCreate(this.resource, { encoding: this.preferredEncoding, reload: refresh }).then(model => {

			// TODO@Ben this is a bit ugly, because we first resolve the model and then resolve a model reference. the reason being that binary
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
				return this.resolveAsBinary();
			}

			// Bubble any other error up
			return TPromise.wrapError(error);
		});
	}

	private resolveAsBinary(): TPromise<BinaryEditorModel> {
		return this.instantiationService.createInstance(BinaryEditorModel, this.resource, this.getName()).load().then(m => m as BinaryEditorModel);
	}

	public isResolved(): boolean {
		return !!this.textFileService.models.get(this.resource);
	}

	public getTelemetryDescriptor(): object {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.getResource(), path => this.hashService.createSHA1(path));

		/* __GDPR__FRAGMENT__
			"EditorTelemetryDescriptor" : {
				"resource": { "${inline}": [ "${URIDescriptor}" ] }
			}
		*/
		return descriptor;
	}

	public dispose(): void {

		// Model reference
		if (this.textModelReference) {
			this.textModelReference.done(ref => ref.dispose());
			this.textModelReference = null;
		}

		// Listeners
		this.toUnbind = dispose(this.toUnbind);

		super.dispose();
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			return otherInput instanceof FileEditorInput && otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}
}