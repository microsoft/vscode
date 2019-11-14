/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { suggestFilename } from 'vs/base/common/mime';
import { createMemoizer } from 'vs/base/common/decorators';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { EditorInput, IEncodingSupport, EncodingMode, Verbosity, IModeSupport } from 'vs/workbench/common/editor';
import { UntitledTextEditorModel } from 'vs/workbench/common/editor/untitledTextEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ILabelService } from 'vs/platform/label/common/label';
import { IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';

/**
 * An editor input to be used for untitled text buffers.
 */
export class UntitledTextEditorInput extends EditorInput implements IEncodingSupport, IModeSupport {

	static readonly ID: string = 'workbench.editors.untitledEditorInput';
	private static readonly MEMOIZER = createMemoizer();

	private cachedModel: UntitledTextEditorModel | null = null;
	private modelResolve: Promise<UntitledTextEditorModel & IResolvedTextEditorModel> | null = null;

	private readonly _onDidModelChangeContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidModelChangeContent: Event<void> = this._onDidModelChangeContent.event;

	private readonly _onDidModelChangeEncoding: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidModelChangeEncoding: Event<void> = this._onDidModelChangeEncoding.event;

	constructor(
		private readonly resource: URI,
		private readonly _hasAssociatedFilePath: boolean,
		private preferredMode: string | undefined,
		private readonly initialValue: string | undefined,
		private preferredEncoding: string | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();
		this._register(this.labelService.onDidChangeFormatters(() => UntitledTextEditorInput.MEMOIZER.clear()));
	}

	get hasAssociatedFilePath(): boolean {
		return this._hasAssociatedFilePath;
	}

	getTypeId(): string {
		return UntitledTextEditorInput.ID;
	}

	getResource(): URI {
		return this.resource;
	}

	getName(): string {
		return this.hasAssociatedFilePath ? basenameOrAuthority(this.resource) : this.resource.path;
	}

	@UntitledTextEditorInput.MEMOIZER
	private get shortDescription(): string {
		return this.labelService.getUriBasenameLabel(dirname(this.resource));
	}

	@UntitledTextEditorInput.MEMOIZER
	private get mediumDescription(): string {
		return this.labelService.getUriLabel(dirname(this.resource), { relative: true });
	}

	@UntitledTextEditorInput.MEMOIZER
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

	@UntitledTextEditorInput.MEMOIZER
	private get shortTitle(): string {
		return this.getName();
	}

	@UntitledTextEditorInput.MEMOIZER
	private get mediumTitle(): string {
		return this.labelService.getUriLabel(this.resource, { relative: true });
	}

	@UntitledTextEditorInput.MEMOIZER
	private get longTitle(): string {
		return this.labelService.getUriLabel(this.resource);
	}

	getTitle(verbosity: Verbosity): string {
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

	save(): Promise<boolean> {
		return this.textFileService.save(this.resource);
	}

	revert(): Promise<boolean> {
		if (this.cachedModel) {
			this.cachedModel.revert();
		}

		this.dispose(); // a reverted untitled text editor is no longer valid, so we dispose it

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

	getEncoding(): string | undefined {
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

	resolve(): Promise<UntitledTextEditorModel & IResolvedTextEditorModel> {

		// Join a model resolve if we have had one before
		if (this.modelResolve) {
			return this.modelResolve;
		}

		// Otherwise Create Model and load
		this.cachedModel = this.createModel();
		this.modelResolve = this.cachedModel.load();

		return this.modelResolve;
	}

	private createModel(): UntitledTextEditorModel {
		const model = this._register(this.instantiationService.createInstance(UntitledTextEditorModel, this.preferredMode, this.resource, this.hasAssociatedFilePath, this.initialValue, this.preferredEncoding));

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
		if (otherInput instanceof UntitledTextEditorInput) {
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
