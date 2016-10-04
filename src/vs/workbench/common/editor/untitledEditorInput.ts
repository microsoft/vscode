/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import {isUnspecific, guessMimeTypes, MIME_TEXT, suggestFilename} from 'vs/base/common/mime';
import labels = require('vs/base/common/labels');
import paths = require('vs/base/common/paths');
import {UntitledEditorInput as AbstractUntitledEditorInput, EncodingMode, ConfirmResult} from 'vs/workbench/common/editor';
import {UntitledEditorModel} from 'vs/workbench/common/editor/untitledEditorModel';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import Event, {Emitter} from 'vs/base/common/event';
import {PLAINTEXT_MODE_ID} from 'vs/editor/common/modes/modesRegistry';

import {ITextFileService} from 'vs/workbench/parts/files/common/files'; // TODO@Ben layer breaker

/**
 * An editor input to be used for untitled text buffers.
 */
export class UntitledEditorInput extends AbstractUntitledEditorInput {

	public static ID: string = 'workbench.editors.untitledEditorInput';
	public static SCHEMA: string = 'untitled';

	private resource: URI;
	private hasAssociatedFilePath: boolean;
	private modeId: string;
	private cachedModel: UntitledEditorModel;

	private _onDidModelChangeEncoding: Emitter<void>;

	private toUnbind: IDisposable[];

	constructor(
		resource: URI,
		hasAssociatedFilePath: boolean,
		modeId: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IModeService private modeService: IModeService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super();

		this.resource = resource;
		this.hasAssociatedFilePath = hasAssociatedFilePath;
		this.modeId = modeId;
		this.toUnbind = [];
		this._onDidModelChangeEncoding = new Emitter<void>();
	}

	public get onDidModelChangeEncoding(): Event<void> {
		return this._onDidModelChangeEncoding.event;
	}

	public getTypeId(): string {
		return UntitledEditorInput.ID;
	}

	public getResource(): URI {
		return this.resource;
	}

	public getName(): string {
		return this.hasAssociatedFilePath ? paths.basename(this.resource.fsPath) : this.resource.fsPath;
	}

	public getDescription(): string {
		return this.hasAssociatedFilePath ? labels.getPathLabel(paths.dirname(this.resource.fsPath), this.contextService) : null;
	}

	public isDirty(): boolean {
		return this.cachedModel && this.cachedModel.isDirty();
	}

	public confirmSave(): ConfirmResult {
		return this.textFileService.confirmSave([this.resource]);
	}

	public save(): TPromise<boolean> {
		return this.textFileService.save(this.resource);
	}

	public revert(): TPromise<boolean> {
		if (this.cachedModel) {
			this.cachedModel.revert();
		}

		this.dispose(); // a reverted untitled editor is no longer valid, so we dispose it

		return TPromise.as(true);
	}

	public suggestFileName(): string {
		if (!this.hasAssociatedFilePath) {
			if (this.cachedModel) {
				const modeId = this.cachedModel.getModeId();
				if (modeId !== PLAINTEXT_MODE_ID) { // do not suggest when the mime type is simple plain text
					return suggestFilename(modeId, this.getName());
				}
			}
		}

		return this.getName();
	}

	public getEncoding(): string {
		if (this.cachedModel) {
			return this.cachedModel.getEncoding();
		}

		return null;
	}

	public setEncoding(encoding: string, mode: EncodingMode /* ignored, we only have Encode */): void {
		if (this.cachedModel) {
			this.cachedModel.setEncoding(encoding);
		}
	}

	public resolve(refresh?: boolean): TPromise<UntitledEditorModel> {

		// Use Cached Model
		if (this.cachedModel) {
			return TPromise.as(this.cachedModel);
		}

		// Otherwise Create Model and load
		const model = this.createModel();
		return model.load().then((resolvedModel: UntitledEditorModel) => {
			this.cachedModel = resolvedModel;

			return this.cachedModel;
		});
	}

	private createModel(): UntitledEditorModel {
		const content = '';
		let mime = this.modeId;
		if (!mime && this.hasAssociatedFilePath) {
			const mimeFromPath = guessMimeTypes(this.resource.fsPath)[0];
			if (!isUnspecific(mimeFromPath)) {
				mime = mimeFromPath; // take most specific mime type if file path is associated and mime is specific
			}
		}

		const model = this.instantiationService.createInstance(UntitledEditorModel, content, mime || MIME_TEXT, this.resource, this.hasAssociatedFilePath);

		// re-emit some events from the model
		this.toUnbind.push(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this.toUnbind.push(model.onDidChangeEncoding(() => this._onDidModelChangeEncoding.fire()));

		return model;
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof UntitledEditorInput) {
			const otherUntitledEditorInput = <UntitledEditorInput>otherInput;

			// Otherwise compare by properties
			return otherUntitledEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	public dispose(): void {
		this._onDidModelChangeEncoding.dispose();

		// Listeners
		dispose(this.toUnbind);

		// Model
		if (this.cachedModel) {
			this.cachedModel.dispose();
			this.cachedModel = null;
		}

		super.dispose();
	}
}