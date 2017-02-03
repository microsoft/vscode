/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import URI from 'vs/base/common/uri';
import { EncodingMode, ConfirmResult, EditorInput, IFileEditorInput } from 'vs/workbench/common/editor';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { IFileOperationResult, FileOperationResult } from 'vs/platform/files/common/files';
import { BINARY_FILE_EDITOR_ID, TEXT_FILE_EDITOR_ID, FILE_EDITOR_INPUT_ID } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, AutoSaveMode, ModelState, TextFileModelChangeEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';

/**
 * A file editor input is the input type for the file editor of file system resources.
 */
export class FileEditorInput extends EditorInput implements IFileEditorInput {
	private resource: URI;
	private preferredEncoding: string;
	private forceOpenAsBinary: boolean;

	private name: string;
	private description: string;
	private verboseDescription: string;

	private toUnbind: IDisposable[];

	/**
	 * An editor input who's contents are retrieved from file services.
	 */
	constructor(
		resource: URI,
		preferredEncoding: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super();

		this.toUnbind = [];

		if (resource) {
			this.setResource(resource);
			this.preferredEncoding = preferredEncoding;
		}

		this.registerListeners();
	}

	private registerListeners(): void {

		// Model changes
		this.toUnbind.push(this.textFileService.models.onModelDirty(e => this.onDirtyStateChange(e)));
		this.toUnbind.push(this.textFileService.models.onModelSaveError(e => this.onDirtyStateChange(e)));
		this.toUnbind.push(this.textFileService.models.onModelSaved(e => this.onDirtyStateChange(e)));
		this.toUnbind.push(this.textFileService.models.onModelReverted(e => this.onDirtyStateChange(e)));
	}

	private onDirtyStateChange(e: TextFileModelChangeEvent): void {
		if (e.resource.toString() === this.resource.toString()) {
			this._onDidChangeDirty.fire();
		}
	}

	public setResource(resource: URI): void {
		this.resource = resource;

		// Reset resource dependent properties
		this.name = null;
		this.description = null;
		this.verboseDescription = null;
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
			this.name = paths.basename(this.resource.fsPath);
		}

		return this.name;
	}

	public getDescription(verbose?: boolean): string {
		if (!verbose) {
			if (!this.description) {
				this.description = labels.getPathLabel(paths.dirname(this.resource.fsPath), this.contextService);
			}

			return this.description;
		}

		if (!this.verboseDescription) {
			this.verboseDescription = labels.getPathLabel(this.resource.fsPath);
		}

		return this.verboseDescription;
	}

	public isDirty(): boolean {
		const model = this.textFileService.models.get(this.resource);
		if (!model) {
			return false;
		}

		const state = model.getState();
		if (state === ModelState.CONFLICT || state === ModelState.ERROR) {
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

	public resolve(refresh?: boolean): TPromise<TextFileEditorModel> {
		return this.textFileService.models.loadOrCreate(this.resource, this.preferredEncoding, refresh).then(null, error => {

			// In case of an error that indicates that the file is binary or too large, just return with the binary editor model
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY || (<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
				return this.instantiationService.createInstance(BinaryEditorModel, this.resource, this.getName()).load();
			}

			// Bubble any other error up
			return TPromise.wrapError(error);
		});
	}

	public getTelemetryDescriptor(): { [key: string]: any; } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.getResource());

		return descriptor;
	}

	public dispose(): void {

		// Listeners
		dispose(this.toUnbind);

		super.dispose();
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			return otherInput instanceof FileEditorInput && (<FileEditorInput>otherInput).resource.toString() === this.resource.toString();
		}

		return false;
	}
}