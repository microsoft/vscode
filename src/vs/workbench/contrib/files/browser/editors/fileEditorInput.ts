/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IFileEditorInput, Verbosity, GroupIdentifier, IMoveResult, EditorInputCapabilities, IEditorDescriptor, IEditorPane, IUntypedEditorInput, DEFAULT_EDITOR_ASSOCIATION, IUntypedFileEditorInput, findViewStateForEditor, isResourceEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { AbstractTextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileOperationError, FileOperationResult, FileSystemProviderCapabilities, IFileService } from 'vs/platform/files/common/files';
import { ITextFileService, TextFileEditorModelState, TextFileResolveReason, TextFileOperationError, TextFileOperationResult, ITextFileEditorModel, EncodingMode } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IReference, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FILE_EDITOR_INPUT_ID, TEXT_FILE_EDITOR_ID, BINARY_FILE_EDITOR_ID } from 'vs/workbench/contrib/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { AutoSaveMode, IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { isEqual } from 'vs/base/common/resources';
import { Event } from 'vs/base/common/event';
import { Schemas } from 'vs/base/common/network';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { IPathService } from 'vs/workbench/services/path/common/pathService';

const enum ForceOpenAs {
	None,
	Text,
	Binary
}

/**
 * A file editor input is the input type for the file editor of file system resources.
 */
export class FileEditorInput extends AbstractTextResourceEditorInput implements IFileEditorInput {

	override get typeId(): string {
		return FILE_EDITOR_INPUT_ID;
	}

	override get editorId(): string | undefined {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	override get capabilities(): EditorInputCapabilities {
		let capabilities = EditorInputCapabilities.CanSplitInGroup;

		if (this.model) {
			if (this.model.isReadonly()) {
				capabilities |= EditorInputCapabilities.Readonly;
			}
		} else {
			if (this.fileService.hasProvider(this.resource)) {
				if (this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly)) {
					capabilities |= EditorInputCapabilities.Readonly;
				}
			} else {
				capabilities |= EditorInputCapabilities.Untitled;
			}
		}

		if (!(capabilities & EditorInputCapabilities.Readonly)) {
			capabilities |= EditorInputCapabilities.CanDropIntoEditor;
		}

		return capabilities;
	}

	private preferredName: string | undefined;
	private preferredDescription: string | undefined;
	private preferredEncoding: string | undefined;
	private preferredLanguageId: string | undefined;
	private preferredContents: string | undefined;

	private forceOpenAs: ForceOpenAs = ForceOpenAs.None;

	private model: ITextFileEditorModel | undefined = undefined;
	private cachedTextFileModelReference: IReference<ITextFileEditorModel> | undefined = undefined;

	private readonly modelListeners = this._register(new DisposableStore());

	constructor(
		resource: URI,
		preferredResource: URI | undefined,
		preferredName: string | undefined,
		preferredDescription: string | undefined,
		preferredEncoding: string | undefined,
		preferredLanguageId: string | undefined,
		preferredContents: string | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService textFileService: ITextFileService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IEditorService editorService: IEditorService,
		@IPathService private readonly pathService: IPathService
	) {
		super(resource, preferredResource, editorService, textFileService, labelService, fileService);

		this.model = this.textFileService.files.get(resource);

		if (preferredName) {
			this.setPreferredName(preferredName);
		}

		if (preferredDescription) {
			this.setPreferredDescription(preferredDescription);
		}

		if (preferredEncoding) {
			this.setPreferredEncoding(preferredEncoding);
		}

		if (preferredLanguageId) {
			this.setPreferredLanguageId(preferredLanguageId);
		}

		if (typeof preferredContents === 'string') {
			this.setPreferredContents(preferredContents);
		}

		// Attach to model that matches our resource once created
		this._register(this.textFileService.files.onDidCreate(model => this.onDidCreateTextFileModel(model)));

		// If a file model already exists, make sure to wire it in
		if (this.model) {
			this.registerModelListeners(this.model);
		}
	}

	private onDidCreateTextFileModel(model: ITextFileEditorModel): void {

		// Once the text file model is created, we keep it inside
		// the input to be able to implement some methods properly
		if (isEqual(model.resource, this.resource)) {
			this.model = model;

			this.registerModelListeners(model);
		}
	}

	private registerModelListeners(model: ITextFileEditorModel): void {

		// Clear any old
		this.modelListeners.clear();

		// re-emit some events from the model
		this.modelListeners.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this.modelListeners.add(model.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));

		// important: treat save errors as potential dirty change because
		// a file that is in save conflict or error will report dirty even
		// if auto save is turned on.
		this.modelListeners.add(model.onDidSaveError(() => this._onDidChangeDirty.fire()));

		// remove model association once it gets disposed
		this.modelListeners.add(Event.once(model.onWillDispose)(() => {
			this.modelListeners.clear();
			this.model = undefined;
		}));
	}

	override getName(): string {
		return this.preferredName || super.getName();
	}

	setPreferredName(name: string): void {
		if (!this.allowLabelOverride()) {
			return; // block for specific schemes we consider to be owning
		}

		if (this.preferredName !== name) {
			this.preferredName = name;

			this._onDidChangeLabel.fire();
		}
	}

	private allowLabelOverride(): boolean {
		return this.resource.scheme !== this.pathService.defaultUriScheme &&
			this.resource.scheme !== Schemas.vscodeUserData &&
			this.resource.scheme !== Schemas.file &&
			this.resource.scheme !== Schemas.vscodeRemote;
	}

	getPreferredName(): string | undefined {
		return this.preferredName;
	}

	override getDescription(verbosity?: Verbosity): string | undefined {
		return this.preferredDescription || super.getDescription(verbosity);
	}

	setPreferredDescription(description: string): void {
		if (!this.allowLabelOverride()) {
			return; // block for specific schemes we consider to be owning
		}

		if (this.preferredDescription !== description) {
			this.preferredDescription = description;

			this._onDidChangeLabel.fire();
		}
	}

	getPreferredDescription(): string | undefined {
		return this.preferredDescription;
	}

	getEncoding(): string | undefined {
		if (this.model) {
			return this.model.getEncoding();
		}

		return this.preferredEncoding;
	}

	getPreferredEncoding(): string | undefined {
		return this.preferredEncoding;
	}

	async setEncoding(encoding: string, mode: EncodingMode): Promise<void> {
		this.setPreferredEncoding(encoding);

		return this.model?.setEncoding(encoding, mode);
	}

	setPreferredEncoding(encoding: string): void {
		this.preferredEncoding = encoding;

		// encoding is a good hint to open the file as text
		this.setForceOpenAsText();
	}

	getLanguageId(): string | undefined {
		if (this.model) {
			return this.model.getLanguageId();
		}

		return this.preferredLanguageId;
	}

	getPreferredLanguageId(): string | undefined {
		return this.preferredLanguageId;
	}

	setLanguageId(languageId: string, source?: string): void {
		this.setPreferredLanguageId(languageId);

		this.model?.setLanguageId(languageId, source);
	}

	setPreferredLanguageId(languageId: string): void {
		this.preferredLanguageId = languageId;

		// languages are a good hint to open the file as text
		this.setForceOpenAsText();
	}

	setPreferredContents(contents: string): void {
		this.preferredContents = contents;

		// contents is a good hint to open the file as text
		this.setForceOpenAsText();
	}

	setForceOpenAsText(): void {
		this.forceOpenAs = ForceOpenAs.Text;
	}

	setForceOpenAsBinary(): void {
		this.forceOpenAs = ForceOpenAs.Binary;
	}

	override isDirty(): boolean {
		return !!(this.model?.isDirty());
	}

	override isSaving(): boolean {
		if (this.model?.hasState(TextFileEditorModelState.SAVED) || this.model?.hasState(TextFileEditorModelState.CONFLICT) || this.model?.hasState(TextFileEditorModelState.ERROR)) {
			return false; // require the model to be dirty and not in conflict or error state
		}

		// Note: currently not checking for ModelState.PENDING_SAVE for a reason
		// because we currently miss an event for this state change on editors
		// and it could result in bad UX where an editor can be closed even though
		// it shows up as dirty and has not finished saving yet.

		if (this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
			return true; // a short auto save is configured, treat this as being saved
		}

		return super.isSaving();
	}

	override prefersEditorPane<T extends IEditorDescriptor<IEditorPane>>(editorPanes: T[]): T | undefined {
		if (this.forceOpenAs === ForceOpenAs.Binary) {
			return editorPanes.find(editorPane => editorPane.typeId === BINARY_FILE_EDITOR_ID);
		}

		return editorPanes.find(editorPane => editorPane.typeId === TEXT_FILE_EDITOR_ID);
	}

	override resolve(): Promise<ITextFileEditorModel | BinaryEditorModel> {

		// Resolve as binary
		if (this.forceOpenAs === ForceOpenAs.Binary) {
			return this.doResolveAsBinary();
		}

		// Resolve as text
		return this.doResolveAsText();
	}

	private async doResolveAsText(): Promise<ITextFileEditorModel | BinaryEditorModel> {
		try {

			// Unset preferred contents after having applied it once
			// to prevent this property to stick. We still want future
			// `resolve` calls to fetch the contents from disk.
			const preferredContents = this.preferredContents;
			this.preferredContents = undefined;

			// Resolve resource via text file service and only allow
			// to open binary files if we are instructed so
			await this.textFileService.files.resolve(this.resource, {
				languageId: this.preferredLanguageId,
				encoding: this.preferredEncoding,
				contents: typeof preferredContents === 'string' ? createTextBufferFactory(preferredContents) : undefined,
				reload: { async: true }, // trigger a reload of the model if it exists already but do not wait to show the model
				allowBinary: this.forceOpenAs === ForceOpenAs.Text,
				reason: TextFileResolveReason.EDITOR
			});

			// This is a bit ugly, because we first resolve the model and then resolve a model reference. the reason being that binary
			// or very large files do not resolve to a text file model but should be opened as binary files without text. First calling into
			// resolve() ensures we are not creating model references for these kind of resources.
			// In addition we have a bit of payload to take into account (encoding, reload) that the text resolver does not handle yet.
			if (!this.cachedTextFileModelReference) {
				this.cachedTextFileModelReference = await this.textModelResolverService.createModelReference(this.resource) as IReference<ITextFileEditorModel>;
			}

			const model = this.cachedTextFileModelReference.object;

			// It is possible that this input was disposed before the model
			// finished resolving. As such, we need to make sure to dispose
			// the model reference to not leak it.
			if (this.isDisposed()) {
				this.disposeModelReference();
			}

			return model;
		} catch (error) {

			// In case of an error that indicates that the file is binary or too large, just return with the binary editor model
			if (
				(<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY ||
				(<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE
			) {
				return this.doResolveAsBinary();
			}

			// Bubble any other error up
			throw error;
		}
	}

	private async doResolveAsBinary(): Promise<BinaryEditorModel> {
		const model = this.instantiationService.createInstance(BinaryEditorModel, this.preferredResource, this.getName());
		await model.resolve();

		return model;
	}

	isResolved(): boolean {
		return !!this.model;
	}

	override async rename(group: GroupIdentifier, target: URI): Promise<IMoveResult> {
		return {
			editor: {
				resource: target,
				encoding: this.getEncoding(),
				options: {
					viewState: findViewStateForEditor(this, group, this.editorService)
				}
			}
		};
	}

	override toUntyped(options?: { preserveViewState: GroupIdentifier }): ITextResourceEditorInput {
		const untypedInput: IUntypedFileEditorInput = {
			resource: this.preferredResource,
			forceFile: true,
			options: {
				override: this.editorId
			}
		};

		if (typeof options?.preserveViewState === 'number') {
			untypedInput.encoding = this.getEncoding();
			untypedInput.languageId = this.getLanguageId();
			untypedInput.contents = (() => {
				const model = this.textFileService.files.get(this.resource);
				if (model?.isDirty()) {
					return model.textEditorModel.getValue(); // only if dirty
				}

				return undefined;
			})();

			untypedInput.options = {
				...untypedInput.options,
				viewState: findViewStateForEditor(this, options.preserveViewState, this.editorService)
			};
		}

		return untypedInput;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		if (otherInput instanceof FileEditorInput) {
			return isEqual(otherInput.resource, this.resource);
		}

		if (isResourceEditorInput(otherInput)) {
			return super.matches(otherInput);
		}

		return false;
	}

	override dispose(): void {

		// Model
		this.model = undefined;

		// Model reference
		this.disposeModelReference();

		super.dispose();
	}

	private disposeModelReference(): void {
		dispose(this.cachedTextFileModelReference);
		this.cachedTextFileModelReference = undefined;
	}
}
