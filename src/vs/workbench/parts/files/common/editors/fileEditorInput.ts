/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Registry} from 'vs/platform/platform';
import types = require('vs/base/common/types');
import paths = require('vs/base/common/paths');
import {guessMimeTypes} from 'vs/base/common/mime';
import labels = require('vs/base/common/labels');
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import assert = require('vs/base/common/assert');
import {IEditorRegistry, Extensions, EditorModel, EncodingMode, ConfirmResult, IEditorDescriptor} from 'vs/workbench/common/editor';
import {BinaryEditorModel} from 'vs/workbench/common/editor/binaryEditorModel';
import {IFileOperationResult, FileOperationResult, FileChangesEvent, EventType} from 'vs/platform/files/common/files';
import {ITextFileService, BINARY_FILE_EDITOR_ID, FILE_EDITOR_INPUT_ID, FileEditorInput as CommonFileEditorInput, AutoSaveMode, ModelState, TextFileModelChangeEvent, IFileEditorDescriptor, LocalFileChangeEvent} from 'vs/workbench/parts/files/common/files';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IHistoryService} from 'vs/workbench/services/history/common/history';

/**
 * A file editor input is the input type for the file editor of file system resources.
 */
export class FileEditorInput extends CommonFileEditorInput {
	private resource: URI;
	private mime: string;
	private preferredEncoding: string;

	private name: string;
	private description: string;
	private verboseDescription: string;

	private toUnbind: IDisposable[];

	/**
	 * An editor input who's contents are retrieved from file services.
	 */
	constructor(
		resource: URI,
		mime: string,
		preferredEncoding: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IHistoryService private historyService: IHistoryService,
		@IEventService private eventService: IEventService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super();

		this.toUnbind = [];

		if (resource) {
			this.setResource(resource);
			this.setMime(mime || guessMimeTypes(this.resource.fsPath).join(', '));
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

		// File changes
		this.toUnbind.push(this.eventService.addListener2('files.internal:fileChanged', (e: LocalFileChangeEvent) => this.onLocalFileChange(e)));
		this.toUnbind.push(this.eventService.addListener2(EventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFileChanges(e)));
	}

	private onLocalFileChange(e: LocalFileChangeEvent): void {
		const movedTo = e.gotMoved() && e.getAfter() && e.getAfter().resource;
		if (e.gotDeleted() || movedTo) {
			this.disposeIfRelated(e.getBefore().resource, movedTo);
		}
	}

	private onFileChanges(e: FileChangesEvent): void {
		e.getDeleted().forEach(deleted => {
			this.disposeIfRelated(deleted.resource);
		});
	}

	private onDirtyStateChange(e: TextFileModelChangeEvent): void {
		if (e.resource.toString() === this.resource.toString()) {
			this._onDidChangeDirty.fire();
		}
	}

	public setResource(resource: URI): void {
		if (resource.scheme !== 'file') {
			throw new Error('FileEditorInput can only handle file:// resources.');
		}

		this.resource = resource;

		// Reset resource dependent properties
		this.name = null;
		this.description = null;
		this.verboseDescription = null;
	}

	public getResource(): URI {
		return this.resource;
	}

	public getMime(): string {
		return this.mime;
	}

	public setMime(mime: string): void {
		assert.ok(mime, 'Editor input needs mime type');

		this.mime = mime;
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

	public setEncoding(encoding: string, mode: EncodingMode): void {
		this.preferredEncoding = encoding;

		const textModel = this.textFileService.models.get(this.resource);
		if (textModel) {
			textModel.setEncoding(encoding, mode);
		}
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
		const editorRegistry = (<IEditorRegistry>Registry.as(Extensions.Editors));

		// Lookup Editor by Mime
		let descriptor: IEditorDescriptor;
		const mimes = this.mime.split(',');
		for (let m = 0; m < mimes.length; m++) {
			const mime = strings.trim(mimes[m]);

			for (let i = 0; i < candidates.length; i++) {
				descriptor = editorRegistry.getEditorById(candidates[i]);

				if (types.isFunction((<IFileEditorDescriptor>descriptor).getMimeTypes)) {
					const mimetypes = (<IFileEditorDescriptor>descriptor).getMimeTypes();
					for (let j = 0; j < mimetypes.length; j++) {
						const mimetype = mimetypes[j];

						// Check for direct mime match
						if (mime === mimetype) {
							return descriptor.getId();
						}

						// Otherwise check for wildcard mime matches
						if (strings.endsWith(mimetype, '/*') && strings.startsWith(mime, mimetype.substring(0, mimetype.length - 1))) {
							return descriptor.getId();
						}
					}
				}
			}
		}

		// Otherwise use default editor
		return BINARY_FILE_EDITOR_ID;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {
		return this.textFileService.models.loadOrCreate(this.resource, this.preferredEncoding, refresh).then(null, error => {

			// In case of an error that indicates that the file is binary or too large, just return with the binary editor model
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY || (<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
				return this.instantiationService.createInstance(BinaryEditorModel, this.resource, this.getName()).load();
			}

			// Bubble any other error up
			return TPromise.wrapError(error);
		});
	}

	private disposeIfRelated(resource: URI, movedTo?: URI): void {
		if (this.isDirty()) {
			return; // we never dispose dirty files
		}

		// Special case: a resource was renamed to the same path with different casing. Since our paths
		// API is treating the paths as equal (they are on disk), we end up disposing the input we just
		// renamed. The workaround is to detect that we do not dispose any input we are moving the file to
		if (movedTo && movedTo.fsPath === this.resource.fsPath) {
			return;
		}

		// Check if path is identical or path is a folder that the content is inside
		if (paths.isEqualOrParent(this.resource.toString(), resource.toString())) {
			this.historyService.remove(this);
			this.dispose();
		}
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

			// Note that we can not test for the mime type here because we cache resolved file editor input models by resource. And
			// these models have a fixed mode association that can not be changed afterwards. As such, we always treat this input
			// equal if the resource is equal so that there is always just one text editor model (with undo hisotry etc.) around.
			//
			// !!! DO NOT CHANGE THIS ASSUMPTION !!!
			//
			return otherInput instanceof FileEditorInput && (<FileEditorInput>otherInput).resource.toString() === this.resource.toString();
		}

		return false;
	}
}