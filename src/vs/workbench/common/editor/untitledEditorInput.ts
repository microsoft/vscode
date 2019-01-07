/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { suggestFilename } from 'vs/base/common/mime';
import { memoize } from 'vs/base/common/decorators';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { EditorInput, IEncodingSupport, EncodingMode, ConfirmResult, Verbosity } from 'vs/workbench/common/editor';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { ILabelService } from 'vs/platform/label/common/label';

/**
 * An editor input to be used for untitled text buffers.
 */
export class UntitledEditorInput extends EditorInput implements IEncodingSupport {

	static readonly ID: string = 'workbench.editors.untitledEditorInput';

	private _hasAssociatedFilePath: boolean;
	private cachedModel: UntitledEditorModel;
	private modelResolve: Promise<UntitledEditorModel>;

	private readonly _onDidModelChangeContent: Emitter<void> = this._register(new Emitter<void>());
	get onDidModelChangeContent(): Event<void> { return this._onDidModelChangeContent.event; }

	private readonly _onDidModelChangeEncoding: Emitter<void> = this._register(new Emitter<void>());
	get onDidModelChangeEncoding(): Event<void> { return this._onDidModelChangeEncoding.event; }

	constructor(
		private resource: URI,
		hasAssociatedFilePath: boolean,
		private modeId: string,
		private initialValue: string,
		private preferredEncoding: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IHashService private readonly hashService: IHashService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();

		this._hasAssociatedFilePath = hasAssociatedFilePath;
	}

	get hasAssociatedFilePath(): boolean {
		return this._hasAssociatedFilePath;
	}

	getTypeId(): string {
		return UntitledEditorInput.ID;
	}

	getResource(): URI {
		return this.resource;
	}

	getModeId(): string {
		if (this.cachedModel) {
			return this.cachedModel.getModeId();
		}

		return this.modeId;
	}

	getName(): string {
		return this.hasAssociatedFilePath ? resources.basenameOrAuthority(this.resource) : this.resource.path;
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
		return this.labelService.getUriLabel(resources.dirname(this.resource));
	}

	getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string {
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
		return this.labelService.getUriLabel(this.resource, { relative: true });
	}

	@memoize
	private get longTitle(): string {
		return this.labelService.getUriLabel(this.resource);
	}

	getTitle(verbosity: Verbosity): string {
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

	isDirty(): boolean {
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

	confirmSave(): Promise<ConfirmResult> {
		return this.textFileService.confirmSave([this.resource]);
	}

	save(): Promise<boolean> {
		return this.textFileService.save(this.resource);
	}

	revert(): Promise<boolean> {
		if (this.cachedModel) {
			this.cachedModel.revert();
		}

		this.dispose(); // a reverted untitled editor is no longer valid, so we dispose it

		return Promise.resolve(true);
	}

	suggestFileName(): string {
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

	getEncoding(): string {
		if (this.cachedModel) {
			return this.cachedModel.getEncoding();
		}

		return this.preferredEncoding;
	}

	setEncoding(encoding: string, mode: EncodingMode /* ignored, we only have Encode */): void {
		this.preferredEncoding = encoding;

		if (this.cachedModel) {
			this.cachedModel.setEncoding(encoding);
		}
	}

	resolve(): Promise<UntitledEditorModel> {

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
		const model = this._register(this.instantiationService.createInstance(UntitledEditorModel, this.modeId, this.resource, this.hasAssociatedFilePath, this.initialValue, this.preferredEncoding));

		// re-emit some events from the model
		this._register(model.onDidChangeContent(() => this._onDidModelChangeContent.fire()));
		this._register(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._register(model.onDidChangeEncoding(() => this._onDidModelChangeEncoding.fire()));

		return model;
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

	matches(otherInput: any): boolean {
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

	dispose(): void {
		this.modelResolve = undefined;

		super.dispose();
	}
}
