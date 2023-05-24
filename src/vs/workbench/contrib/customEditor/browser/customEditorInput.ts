/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { IReference } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/path';
import { dirname, isEqual } from 'vs/base/common/resources';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { EditorInputCapabilities, GroupIdentifier, IMoveResult, IRevertOptions, ISaveOptions, IUntypedEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ICustomEditorModel, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IOverlayWebview, IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from 'vs/workbench/contrib/webviewPanel/browser/webviewWorkbenchService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';

interface CustomEditorInputInitInfo {
	readonly resource: URI;
	readonly viewType: string;
}

export class CustomEditorInput extends LazilyResolvedWebviewEditorInput {

	static create(
		instantiationService: IInstantiationService,
		resource: URI,
		viewType: string,
		group: GroupIdentifier | undefined,
		options?: { readonly customClasses?: string; readonly oldResource?: URI },
	): EditorInput {
		return instantiationService.invokeFunction(accessor => {
			// If it's an untitled file we must populate the untitledDocumentData
			const untitledString = accessor.get(IUntitledTextEditorService).getValue(resource);
			const untitledDocumentData = untitledString ? VSBuffer.fromString(untitledString) : undefined;
			const webview = accessor.get(IWebviewService).createWebviewOverlay({
				providedViewType: viewType,
				title: undefined,
				options: { customClasses: options?.customClasses },
				contentOptions: {},
				extension: undefined,
			});
			const input = instantiationService.createInstance(CustomEditorInput, { resource, viewType }, webview, { untitledDocumentData: untitledDocumentData, oldResource: options?.oldResource });
			if (typeof group !== 'undefined') {
				input.updateGroup(group);
			}
			return input;
		});
	}

	public static override readonly typeId = 'workbench.editors.webviewEditor';

	private readonly _editorResource: URI;
	public readonly oldResource?: URI;
	private _defaultDirtyState: boolean | undefined;

	private readonly _backupId: string | undefined;

	private readonly _untitledDocumentData: VSBuffer | undefined;

	override get resource() { return this._editorResource; }

	private _modelRef?: IReference<ICustomEditorModel>;

	constructor(
		init: CustomEditorInputInitInfo,
		webview: IOverlayWebview,
		options: { startsDirty?: boolean; backupId?: string; untitledDocumentData?: VSBuffer; readonly oldResource?: URI },
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
		@IFileService private readonly fileService: IFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService
	) {
		super({ providedId: init.viewType, viewType: init.viewType, name: '' }, webview, webviewWorkbenchService);
		this._editorResource = init.resource;
		this.oldResource = options.oldResource;
		this._defaultDirtyState = options.startsDirty;
		this._backupId = options.backupId;
		this._untitledDocumentData = options.untitledDocumentData;

		this.registerListeners();
	}

	private registerListeners(): void {

		// Clear our labels on certain label related events
		this._register(this.labelService.onDidChangeFormatters(e => this.onLabelEvent(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onLabelEvent(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onLabelEvent(e.scheme)));
	}

	private onLabelEvent(scheme: string): void {
		if (scheme === this.resource.scheme) {
			this.updateLabel();
		}
	}

	private updateLabel(): void {

		// Clear any cached labels from before
		this._shortDescription = undefined;
		this._mediumDescription = undefined;
		this._longDescription = undefined;
		this._shortTitle = undefined;
		this._mediumTitle = undefined;
		this._longTitle = undefined;

		// Trigger recompute of label
		this._onDidChangeLabel.fire();
	}

	public override get typeId(): string {
		return CustomEditorInput.typeId;
	}

	public override get editorId() {
		return this.viewType;
	}

	public override get capabilities(): EditorInputCapabilities {
		let capabilities = EditorInputCapabilities.None;

		capabilities |= EditorInputCapabilities.CanDropIntoEditor;

		if (!this.customEditorService.getCustomEditorCapabilities(this.viewType)?.supportsMultipleEditorsPerDocument) {
			capabilities |= EditorInputCapabilities.Singleton;
		}

		if (this._modelRef) {
			if (this._modelRef.object.isReadonly()) {
				capabilities |= EditorInputCapabilities.Readonly;
			}
		} else {
			if (this.filesConfigurationService.isReadonly(this.resource)) {
				capabilities |= EditorInputCapabilities.Readonly;
			}
		}

		if (this.resource.scheme === Schemas.untitled) {
			capabilities |= EditorInputCapabilities.Untitled;
		}

		return capabilities;
	}

	override getName(): string {
		return basename(this.labelService.getUriLabel(this.resource));
	}

	override getDescription(verbosity = Verbosity.MEDIUM): string | undefined {
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

	private _shortDescription: string | undefined = undefined;
	private get shortDescription(): string {
		if (typeof this._shortDescription !== 'string') {
			this._shortDescription = this.labelService.getUriBasenameLabel(dirname(this.resource));
		}

		return this._shortDescription;
	}

	private _mediumDescription: string | undefined = undefined;
	private get mediumDescription(): string {
		if (typeof this._mediumDescription !== 'string') {
			this._mediumDescription = this.labelService.getUriLabel(dirname(this.resource), { relative: true });
		}

		return this._mediumDescription;
	}

	private _longDescription: string | undefined = undefined;
	private get longDescription(): string {
		if (typeof this._longDescription !== 'string') {
			this._longDescription = this.labelService.getUriLabel(dirname(this.resource));
		}

		return this._longDescription;
	}

	private _shortTitle: string | undefined = undefined;
	private get shortTitle(): string {
		if (typeof this._shortTitle !== 'string') {
			this._shortTitle = this.getName();
		}

		return this._shortTitle;
	}

	private _mediumTitle: string | undefined = undefined;
	private get mediumTitle(): string {
		if (typeof this._mediumTitle !== 'string') {
			this._mediumTitle = this.labelService.getUriLabel(this.resource, { relative: true });
		}

		return this._mediumTitle;
	}

	private _longTitle: string | undefined = undefined;
	private get longTitle(): string {
		if (typeof this._longTitle !== 'string') {
			this._longTitle = this.labelService.getUriLabel(this.resource);
		}

		return this._longTitle;
	}

	override getTitle(verbosity?: Verbosity): string {
		switch (verbosity) {
			case Verbosity.SHORT:
				return this.shortTitle;
			case Verbosity.LONG:
				return this.longTitle;
			default:
			case Verbosity.MEDIUM:
				return this.mediumTitle;
		}
	}

	public override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return this === other || (other instanceof CustomEditorInput
			&& this.viewType === other.viewType
			&& isEqual(this.resource, other.resource));
	}

	public override copy(): EditorInput {
		return CustomEditorInput.create(this.instantiationService, this.resource, this.viewType, this.group, this.webview.options);
	}

	public override isDirty(): boolean {
		if (!this._modelRef) {
			return !!this._defaultDirtyState;
		}
		return this._modelRef.object.isDirty();
	}

	public override async save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		if (!this._modelRef) {
			return undefined;
		}

		const target = await this._modelRef.object.saveCustomEditor(options);
		if (!target) {
			return undefined; // save cancelled
		}

		// Different URIs == untyped input returned to allow resolver to possibly resolve to a different editor type
		if (!isEqual(target, this.resource)) {
			return { resource: target };
		}

		return this;
	}

	public override async saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		if (!this._modelRef) {
			return undefined;
		}

		const dialogPath = this._editorResource;
		const target = await this.fileDialogService.pickFileToSave(dialogPath, options?.availableFileSystems);
		if (!target) {
			return undefined; // save cancelled
		}

		if (!await this._modelRef.object.saveCustomEditorAs(this._editorResource, target, options)) {
			return undefined;
		}

		return (await this.rename(groupId, target))?.editor;
	}

	public override async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		if (this._modelRef) {
			return this._modelRef.object.revert(options);
		}
		this._defaultDirtyState = false;
		this._onDidChangeDirty.fire();
	}

	public override async resolve(): Promise<null> {
		await super.resolve();

		if (this.isDisposed()) {
			return null;
		}

		if (!this._modelRef) {
			const oldCapabilities = this.capabilities;
			this._modelRef = this._register(assertIsDefined(await this.customEditorService.models.tryRetain(this.resource, this.viewType)));
			this._register(this._modelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
			this._register(this._modelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
			// If we're loading untitled file data we should ensure it's dirty
			if (this._untitledDocumentData) {
				this._defaultDirtyState = true;
			}
			if (this.isDirty()) {
				this._onDidChangeDirty.fire();
			}
			if (this.capabilities !== oldCapabilities) {
				this._onDidChangeCapabilities.fire();
			}
		}

		return null;
	}

	public override async rename(group: GroupIdentifier, newResource: URI): Promise<IMoveResult | undefined> {
		// We return an untyped editor input which can then be resolved in the editor service
		return { editor: { resource: newResource } };
	}

	public undo(): void | Promise<void> {
		assertIsDefined(this._modelRef);
		return this.undoRedoService.undo(this.resource);
	}

	public redo(): void | Promise<void> {
		assertIsDefined(this._modelRef);
		return this.undoRedoService.redo(this.resource);
	}

	private _moveHandler?: (newResource: URI) => void;

	public onMove(handler: (newResource: URI) => void): void {
		// TODO: Move this to the service
		this._moveHandler = handler;
	}

	protected override transfer(other: CustomEditorInput): CustomEditorInput | undefined {
		if (!super.transfer(other)) {
			return;
		}

		other._moveHandler = this._moveHandler;
		this._moveHandler = undefined;
		return other;
	}

	public get backupId(): string | undefined {
		if (this._modelRef) {
			return this._modelRef.object.backupId;
		}
		return this._backupId;
	}

	public get untitledDocumentData(): VSBuffer | undefined {
		return this._untitledDocumentData;
	}

	public override toUntyped(): IResourceEditorInput {
		return {
			resource: this.resource,
			options: {
				override: this.viewType
			}
		};
	}
}
