/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { suggestFilename } from 'vs/base/common/mime';
import labels = require('vs/base/common/labels');
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import paths = require('vs/base/common/paths');
import { EditorInput, IEncodingSupport, EncodingMode, ConfirmResult } from 'vs/workbench/common/editor';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';

/**
 * An editor input to be used for untitled text buffers.
 */
export class UntitledEditorInput extends EditorInput implements IEncodingSupport {

	public static ID: string = 'workbench.editors.untitledEditorInput';
	public static SCHEMA: string = 'untitled';

	private resource: URI;
	private _hasAssociatedFilePath: boolean;
	private modeId: string;
	private cachedModel: UntitledEditorModel;
	private modelResolve: TPromise<UntitledEditorModel>;

	private _onDidModelChangeContent: Emitter<void>;
	private _onDidModelChangeEncoding: Emitter<void>;

	private toUnbind: IDisposable[];

	constructor(
		resource: URI,
		hasAssociatedFilePath: boolean,
		modeId: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super();

		this.resource = resource;
		this._hasAssociatedFilePath = hasAssociatedFilePath;
		this.modeId = modeId;
		this.toUnbind = [];
		this._onDidModelChangeContent = new Emitter<void>();
		this._onDidModelChangeEncoding = new Emitter<void>();
	}

	public get hasAssociatedFilePath(): boolean {
		return this._hasAssociatedFilePath;
	}

	public get onDidModelChangeContent(): Event<void> {
		return this._onDidModelChangeContent.event;
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

	public getModeId(): string {
		if (this.cachedModel) {
			return this.cachedModel.getModeId();
		}

		return this.modeId;
	}

	public getName(): string {
		return this.hasAssociatedFilePath ? paths.basename(this.resource.fsPath) : this.resource.fsPath;
	}

	public getDescription(): string {
		return this.hasAssociatedFilePath ? labels.getPathLabel(paths.dirname(this.resource.fsPath), this.contextService) : null;
	}

	public isDirty(): boolean {
		if (this.cachedModel) {
			return this.cachedModel.isDirty();
		}

		// A disposed input is never dirty, even if it was restored from backup
		if (this.isDisposed()) {
			return false;
		}

		// untitled files with an associated path or associated resource
		return this.hasAssociatedFilePath;
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
				if (modeId !== PLAINTEXT_MODE_ID) { // do not suggest when the mode ID is simple plain text
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

		// Join a model resolve if we have had one before
		if (this.modelResolve) {
			return this.modelResolve;
		}

		// Otherwise Create Model and load
		this.cachedModel = this.createModel();
		this.modelResolve = this.cachedModel.load();

		return this.modelResolve;
	}

	private createModel(): UntitledEditorModel {
		const model = this.instantiationService.createInstance(UntitledEditorModel, this.modeId, this.resource, this.hasAssociatedFilePath);

		// re-emit some events from the model
		this.toUnbind.push(model.onDidChangeContent(() => this._onDidModelChangeContent.fire()));
		this.toUnbind.push(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this.toUnbind.push(model.onDidChangeEncoding(() => this._onDidModelChangeEncoding.fire()));

		return model;
	}

	public getTelemetryDescriptor(): { [key: string]: any; } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.getResource());

		return descriptor;
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
		this._onDidModelChangeContent.dispose();
		this._onDidModelChangeEncoding.dispose();

		// Listeners
		dispose(this.toUnbind);

		// Model
		if (this.cachedModel) {
			this.cachedModel.dispose();
			this.cachedModel = null;
		}

		this.modelResolve = void 0;

		super.dispose();
	}
}