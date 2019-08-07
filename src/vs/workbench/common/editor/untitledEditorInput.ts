/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { suggestFilename } from 'vs/base/common/mime';
import { memoize } from 'vs/base/common/decorators';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { basename } from 'vs/base/common/path';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { EditorInput, IEncodingSupport, EncodingMode, ConfirmResult, Verbosity, IModeSupport } from 'vs/workbench/common/editor';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ILabelService } from 'vs/platform/label/common/label';
import { IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';

/**
 * An editor input to be used for untitled text buffers.
 */
export class UntitledEditorInput extends EditorInput implements IEncodingSupport, IModeSupport {

	static readonly ID: string = 'workbench.editors.untitledEditorInput';

	private cachedModel: UntitledEditorModel | null;
	private modelResolve: Promise<UntitledEditorModel & IResolvedTextEditorModel> | null;

	private readonly _onDidModelChangeContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidModelChangeContent: Event<void> = this._onDidModelChangeContent.event;

	private readonly _onDidModelChangeEncoding: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidModelChangeEncoding: Event<void> = this._onDidModelChangeEncoding.event;

	constructor(
		private readonly resource: URI,
		private readonly _hasAssociatedFilePath: boolean,
		private preferredMode: string,
		private readonly initialValue: string,
		private preferredEncoding: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();
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

	getName(): string {
		return this.hasAssociatedFilePath ? basenameOrAuthority(this.resource) : this.resource.path;
	}

	@memoize
	private get shortDescription(): string {
		return basename(this.labelService.getUriLabel(dirname(this.resource)));
	}

	@memoize
	private get mediumDescription(): string {
		return this.labelService.getUriLabel(dirname(this.resource), { relative: true });
	}

	@memoize
	private get longDescription(): string {
		return this.labelService.getUriLabel(dirname(this.resource));
	}

	getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string | undefined {
		if (!this.hasAssociatedFilePath) {
			return undefined;
		}

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

	getTitle(verbosity: Verbosity): string | null {
		if (!this.hasAssociatedFilePath) {
			return this.getName();
		}

		switch (verbosity) {
			case Verbosity.SHORT:
				return this.shortTitle;
			case Verbosity.MEDIUM:
				return this.mediumTitle;
			case Verbosity.LONG:
				return this.longTitle;
		}

		return null;
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

	hasBackup(): boolean {
		if (this.cachedModel) {
			return this.cachedModel.hasBackup();
		}

		return false;
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
				const mode = this.cachedModel.getMode();
				if (mode !== PLAINTEXT_MODE_ID) { // do not suggest when the mode ID is simple plain text
					return suggestFilename(mode, this.getName());
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

	setMode(mode: string): void {
		this.preferredMode = mode;

		if (this.cachedModel) {
			this.cachedModel.setMode(mode);
		}
	}

	getMode(): string | undefined {
		if (this.cachedModel) {
			return this.cachedModel.getMode();
		}

		return this.preferredMode;
	}

	resolve(): Promise<UntitledEditorModel & IResolvedTextEditorModel> {

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
		const model = this._register(this.instantiationService.createInstance(UntitledEditorModel, this.preferredMode, this.resource, this.hasAssociatedFilePath, this.initialValue, this.preferredEncoding));

		// re-emit some events from the model
		this._register(model.onDidChangeContent(() => this._onDidModelChangeContent.fire()));
		this._register(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._register(model.onDidChangeEncoding(() => this._onDidModelChangeEncoding.fire()));

		return model;
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		// Otherwise compare by properties
		if (otherInput instanceof UntitledEditorInput) {
			return otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	dispose(): void {
		this.cachedModel = null;
		this.modelResolve = null;

		super.dispose();
	}
}
