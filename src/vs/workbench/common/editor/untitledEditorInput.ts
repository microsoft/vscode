/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { suggestFilename } from 'vs/base/common/mime';
import { memoize } from 'vs/base/common/decorators';
import labels = require('vs/base/common/labels');
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import paths = require('vs/base/common/paths');
import resources = require('vs/base/common/resources');
import { EditorInput, IEncodingSupport, EncodingMode, ConfirmResult } from 'vs/workbench/common/editor';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Verbosity } from 'vs/platform/editor/common/editor';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';

/**
 * An editor input to be used for untitled text buffers.
 */
export class UntitledEditorInput extends EditorInput implements IEncodingSupport {

	public static readonly ID: string = 'workbench.editors.untitledEditorInput';

	private _hasAssociatedFilePath: boolean;
	private cachedModel: UntitledEditorModel;
	private modelResolve: TPromise<UntitledEditorModel>;

	private readonly _onDidModelChangeContent: Emitter<void>;
	private readonly _onDidModelChangeEncoding: Emitter<void>;

	private toUnbind: IDisposable[];

	constructor(
		private resource: URI,
		hasAssociatedFilePath: boolean,
		private modeId: string,
		private initialValue: string,
		private preferredEncoding: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITextFileService private textFileService: ITextFileService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IHashService private hashService: IHashService
	) {
		super();

		this._hasAssociatedFilePath = hasAssociatedFilePath;
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
		return this.hasAssociatedFilePath ? resources.basenameOrAuthority(this.resource) : this.resource.path;
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
		if (!this.hasAssociatedFilePath) {
			return null;
		}

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
		if (!this.hasAssociatedFilePath) {
			return this.getName();
		}

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

		return title;
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

	public confirmSave(): TPromise<ConfirmResult> {
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

		return this.preferredEncoding;
	}

	public setEncoding(encoding: string, mode: EncodingMode /* ignored, we only have Encode */): void {
		this.preferredEncoding = encoding;

		if (this.cachedModel) {
			this.cachedModel.setEncoding(encoding);
		}
	}

	public resolve(): TPromise<UntitledEditorModel> {

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
		const model = this.instantiationService.createInstance(UntitledEditorModel, this.modeId, this.resource, this.hasAssociatedFilePath, this.initialValue, this.preferredEncoding);

		// re-emit some events from the model
		this.toUnbind.push(model.onDidChangeContent(() => this._onDidModelChangeContent.fire()));
		this.toUnbind.push(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this.toUnbind.push(model.onDidChangeEncoding(() => this._onDidModelChangeEncoding.fire()));

		return model;
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