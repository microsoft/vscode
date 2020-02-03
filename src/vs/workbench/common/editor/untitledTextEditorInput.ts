/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createMemoizer } from 'vs/base/common/decorators';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { IEncodingSupport, EncodingMode, Verbosity, IModeSupport, TextEditorInput } from 'vs/workbench/common/editor';
import { UntitledTextEditorModel } from 'vs/workbench/common/editor/untitledTextEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Emitter } from 'vs/base/common/event';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ILabelService } from 'vs/platform/label/common/label';
import { IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

/**
 * An editor input to be used for untitled text buffers.
 */
export class UntitledTextEditorInput extends TextEditorInput implements IEncodingSupport, IModeSupport {

	static readonly ID: string = 'workbench.editors.untitledEditorInput';

	private static readonly MEMOIZER = createMemoizer();

	private readonly _onDidModelChangeEncoding = this._register(new Emitter<void>());
	readonly onDidModelChangeEncoding = this._onDidModelChangeEncoding.event;

	private cachedModel: UntitledTextEditorModel | undefined = undefined;

	private modelResolve: Promise<UntitledTextEditorModel & IResolvedTextEditorModel> | undefined = undefined;

	private preferredMode: string | undefined;

	constructor(
		resource: URI,
		private readonly _hasAssociatedFilePath: boolean,
		preferredMode: string | undefined,
		private readonly initialValue: string | undefined,
		private preferredEncoding: string | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService private readonly labelService: ILabelService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(resource, editorService, editorGroupService, textFileService);

		if (preferredMode) {
			this.setMode(preferredMode);
		}

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.labelService.onDidChangeFormatters(() => UntitledTextEditorInput.MEMOIZER.clear()));
	}

	get hasAssociatedFilePath(): boolean {
		return this._hasAssociatedFilePath;
	}

	getTypeId(): string {
		return UntitledTextEditorInput.ID;
	}

	getName(): string {
		if (this.cachedModel) {
			return this.cachedModel.name;
		}

		return this.hasAssociatedFilePath ? basenameOrAuthority(this.resource) : this.resource.path;
	}

	getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string | undefined {

		// Without associated path: only use if name and description differ
		if (!this.hasAssociatedFilePath) {
			const descriptionCandidate = this.resource.path;
			if (descriptionCandidate !== this.getName()) {
				return descriptionCandidate;
			}
		}

		// With associated path: use label provider
		else {
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

		return undefined;
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

	isReadonly(): boolean {
		return false;
	}

	isUntitled(): boolean {
		return true;
	}

	isDirty(): boolean {

		// Always trust the model first if existing
		if (this.cachedModel) {
			return this.cachedModel.isDirty();
		}

		// A disposed input is never dirty, even if it was restored from backup
		if (this.isDisposed()) {
			return false;
		}

		// A input with initial value is always dirty
		if (this.initialValue && this.initialValue.length > 0) {
			return true;
		}

		// A input with associated path is always dirty because it is the intent
		// of the user to create a new file at that location through saving
		return this.hasAssociatedFilePath;
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
		let actualMode: string | undefined = undefined;
		if (mode === '${activeEditorLanguage}') {
			// support the special '${activeEditorLanguage}' mode by
			// looking up the language mode from the currently
			// active text editor if any
			actualMode = this.editorService.activeTextEditorMode;
		} else {
			actualMode = mode;
		}

		this.preferredMode = actualMode;

		if (this.preferredMode && this.cachedModel) {
			this.cachedModel.setMode(this.preferredMode);
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

		this.registerModelListeners(model);

		return model;
	}

	private registerModelListeners(model: UntitledTextEditorModel): void {

		// re-emit some events from the model
		this._register(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._register(model.onDidChangeEncoding(() => this._onDidModelChangeEncoding.fire()));
		this._register(model.onDidChangeName(() => this._onDidChangeLabel.fire()));

		// a disposed untitled text editor model renders this input disposed
		this._register(model.onDispose(() => this.dispose()));
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
		this.cachedModel = undefined;
		this.modelResolve = undefined;

		super.dispose();
	}
}
