/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, isEqual } from '../../../../base/common/resources.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IReference, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { EditorInputCapabilities, GroupIdentifier, IResourceDiffEditorInput, IRevertOptions, ISaveOptions, IUntypedEditorInput, isEditorInput, isResourceEditorInput, isResourceDiffEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput, IUntypedEditorOptions } from '../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ICustomEditorModel, ICustomEditorService } from '../common/customEditor.js';
import { IOverlayWebview, IWebviewService } from '../../webview/browser/webview.js';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { WebviewIconPath } from '../../webviewPanel/browser/webviewEditorInput.js';

interface CustomEditorDiffInputInitInfo {
	readonly originalResource: URI;
	readonly modifiedResource: URI;
	readonly viewType: string;
	readonly label: string | undefined;
	readonly description: string | undefined;
	readonly iconPath: WebviewIconPath | undefined;
}

interface CustomEditorSideBySideDiffInputInitInfo extends CustomEditorDiffInputInitInfo {
	readonly diffId: string;
	readonly side: CustomEditorSideBySideDiffSide;
}

export type CustomEditorSideBySideDiffSide = 'original' | 'modified';

function getCustomEditorSideBySideDiffInputResource(init: CustomEditorSideBySideDiffInputInitInfo): URI {
	return init.side === 'original' ? init.originalResource : init.modifiedResource;
}

export class CustomEditorDiffInput extends LazilyResolvedWebviewEditorInput {

	private readonly _modelRef = this._register(new MutableDisposable<IReference<ICustomEditorModel>>());

	static create(
		instantiationService: IInstantiationService,
		init: CustomEditorDiffInputInitInfo,
		group: IEditorGroup | undefined,
	): CustomEditorDiffInput {
		return instantiationService.invokeFunction(accessor => {
			const webview = accessor.get(IWebviewService).createWebviewOverlay({
				providedViewType: init.viewType,
				title: init.label,
				options: {},
				contentOptions: {},
				extension: undefined,
			});

			const input = instantiationService.createInstance(CustomEditorDiffInput, init, webview);
			if (group) {
				input.updateGroup(group.id);
			}

			return input;
		});
	}

	public static override readonly typeId = 'workbench.editors.customDiffEditor';

	constructor(
		private readonly init: CustomEditorDiffInputInitInfo,
		webview: IOverlayWebview,
		@IThemeService themeService: IThemeService,
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
	) {
		super({ providedId: init.viewType, viewType: init.viewType, name: init.label ?? '', iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
		this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
	}

	override get typeId(): string {
		return CustomEditorDiffInput.typeId;
	}

	override get editorId(): string {
		return this.viewType;
	}

	override get capabilities(): EditorInputCapabilities {
		let capabilities = EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor;
		if (this.isReadonly()) {
			capabilities |= EditorInputCapabilities.Readonly;
		}
		return capabilities;
	}

	override get resource(): URI {
		return this.modifiedResource;
	}

	get originalResource(): URI {
		return this.init.originalResource;
	}

	get modifiedResource(): URI {
		return this.init.modifiedResource;
	}

	override getName(): string {
		return this.init.label ?? localize('customEditorDiffLabel', "{0} - {1}", basename(this.originalResource), basename(this.modifiedResource));
	}

	override getDescription(_verbosity?: Verbosity): string | undefined {
		return this.init.description ?? super.getDescription();
	}

	override getTitle(verbosity?: Verbosity): string {
		const description = this.getDescription(verbosity);
		if (description) {
			return localize('customEditorDiffTitle', "{0} ({1})", this.getName(), description);
		}

		return this.getName();
	}

	override isReadonly(): boolean | IMarkdownString {
		const modelRef = this._modelRef.value;
		if (!modelRef) {
			return this.filesConfigurationService.isReadonly(this.modifiedResource);
		}
		return modelRef.object.isReadonly();
	}

	override isDirty(): boolean {
		return this._modelRef.value?.object.isDirty() ?? false;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		if (otherInput instanceof CustomEditorDiffInput) {
			return this.viewType === otherInput.viewType
				&& isEqual(this.originalResource, otherInput.originalResource)
				&& isEqual(this.modifiedResource, otherInput.modifiedResource);
		}

		if (isEditorInput(otherInput)) {
			return false;
		}

		if (isResourceDiffEditorInput(otherInput)) {
			const override = otherInput.options?.override;
			return override === this.viewType
				&& isEqual(this.originalResource, otherInput.original.resource)
				&& isEqual(this.modifiedResource, otherInput.modified.resource);
		}

		return false;
	}

	override copy(): EditorInput {
		return CustomEditorDiffInput.create(this.instantiationService, this.init, undefined);
	}

	override async save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const modelRef = this._modelRef.value;
		if (!modelRef) {
			return undefined;
		}

		const target = await modelRef.object.saveCustomEditor(options);
		if (!target) {
			return undefined;
		}

		if (!isEqual(target, this.modifiedResource)) {
			return this.toUntypedWithModifiedResource(target);
		}

		return this;
	}

	override async saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const modelRef = this._modelRef.value;
		if (!modelRef) {
			return undefined;
		}

		const target = await this.fileDialogService.pickFileToSave(this.modifiedResource, options?.availableFileSystems);
		if (!target) {
			return undefined;
		}

		if (!await modelRef.object.saveCustomEditorAs(this.modifiedResource, target, options)) {
			return undefined;
		}

		return this.toUntypedWithModifiedResource(target);
	}

	override async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		await this._modelRef.value?.object.revert(options);
	}

	override async resolve(): Promise<null> {
		await super.resolve();

		if (this.isDisposed()) {
			return null;
		}

		if (!this._modelRef.value) {
			const modelRef = this.customEditorService.models.tryRetain(this.modifiedResource, this.viewType);
			if (modelRef) {
				const oldCapabilities = this.capabilities;
				const retainedModelRef = await modelRef;
				if (this.isDisposed()) {
					retainedModelRef.dispose();
					return null;
				}
				this._modelRef.value = retainedModelRef;
				this._register(retainedModelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
				this._register(retainedModelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
				if (this.isDirty()) {
					this._onDidChangeDirty.fire();
				}
				if (this.capabilities !== oldCapabilities) {
					this._onDidChangeCapabilities.fire();
				}
			}
		}

		return null;
	}

	public undo(): void | Promise<void> {
		return this.undoRedoService.undo(this.modifiedResource);
	}

	public redo(): void | Promise<void> {
		return this.undoRedoService.redo(this.modifiedResource);
	}

	override toUntyped(_options?: IUntypedEditorOptions): IResourceDiffEditorInput {
		return this.toUntypedWithModifiedResource(this.modifiedResource);
	}

	private toUntypedWithModifiedResource(modifiedResource: URI): IResourceDiffEditorInput {
		return {
			original: { resource: this.originalResource },
			modified: { resource: modifiedResource },
			label: this.init.label,
			description: this.init.description,
			options: {
				override: this.viewType,
			}
		};
	}
}

export class CustomEditorSideBySideDiffInput extends LazilyResolvedWebviewEditorInput {

	private readonly _modelRef = this._register(new MutableDisposable<IReference<ICustomEditorModel>>());

	static create(
		instantiationService: IInstantiationService,
		init: CustomEditorSideBySideDiffInputInitInfo,
		group: IEditorGroup | undefined,
	): CustomEditorSideBySideDiffInput {
		return instantiationService.invokeFunction(accessor => {
			const webview = accessor.get(IWebviewService).createWebviewOverlay({
				providedViewType: init.viewType,
				title: basename(getCustomEditorSideBySideDiffInputResource(init)),
				options: {},
				contentOptions: {},
				extension: undefined,
			});

			const input = instantiationService.createInstance(CustomEditorSideBySideDiffInput, init, webview);
			if (group) {
				input.updateGroup(group.id);
			}

			return input;
		});
	}

	public static override readonly typeId = 'workbench.editors.customSideBySideDiffEditor';

	constructor(
		private readonly init: CustomEditorSideBySideDiffInputInitInfo,
		webview: IOverlayWebview,
		@IThemeService themeService: IThemeService,
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
	) {
		super({ providedId: init.viewType, viewType: init.viewType, name: basename(getCustomEditorSideBySideDiffInputResource(init)), iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
		this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
	}

	override get typeId(): string {
		return CustomEditorSideBySideDiffInput.typeId;
	}

	override get editorId(): string {
		return this.viewType;
	}

	override get capabilities(): EditorInputCapabilities {
		let capabilities = EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor;
		if (this.isReadonly()) {
			capabilities |= EditorInputCapabilities.Readonly;
		}
		return capabilities;
	}

	override get resource(): URI {
		return this.side === 'original' ? this.originalResource : this.modifiedResource;
	}

	get originalResource(): URI {
		return this.init.originalResource;
	}

	get modifiedResource(): URI {
		return this.init.modifiedResource;
	}

	get side(): CustomEditorSideBySideDiffSide {
		return this.init.side;
	}

	get diffId(): string {
		return this.init.diffId;
	}

	override getName(): string {
		return basename(this.resource);
	}

	override getDescription(_verbosity?: Verbosity): string | undefined {
		return this.init.description ?? super.getDescription();
	}

	override getTitle(verbosity?: Verbosity): string {
		const description = this.getDescription(verbosity);
		if (description) {
			return localize('customEditorSideBySideDiffTitle', "{0} ({1})", this.getName(), description);
		}

		return this.getName();
	}

	override isReadonly(): boolean | IMarkdownString {
		if (this.side === 'original') {
			return true;
		}
		const modelRef = this._modelRef.value;
		if (!modelRef) {
			return this.filesConfigurationService.isReadonly(this.modifiedResource);
		}
		return modelRef.object.isReadonly();
	}

	override isDirty(): boolean {
		return this.side === 'modified' ? this._modelRef.value?.object.isDirty() ?? false : false;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		if (otherInput instanceof CustomEditorSideBySideDiffInput) {
			return this.editorId === otherInput.editorId
				&& this.side === otherInput.side
				&& isEqual(this.originalResource, otherInput.originalResource)
				&& isEqual(this.modifiedResource, otherInput.modifiedResource);
		}

		if (isEditorInput(otherInput)) {
			return false;
		}

		if (isResourceEditorInput(otherInput)) {
			return isEqual(this.resource, otherInput.resource);
		}

		return false;
	}

	override copy(): EditorInput {
		return CustomEditorSideBySideDiffInput.create(this.instantiationService, this.init, undefined);
	}

	override async save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const modelRef = this._modelRef.value;
		if (!modelRef) {
			return undefined;
		}

		const target = await modelRef.object.saveCustomEditor(options);
		if (!target) {
			return undefined;
		}

		if (!isEqual(target, this.modifiedResource)) {
			return { resource: target };
		}

		return this;
	}

	override async saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const modelRef = this._modelRef.value;
		if (!modelRef) {
			return undefined;
		}

		const target = await this.fileDialogService.pickFileToSave(this.modifiedResource, options?.availableFileSystems);
		if (!target) {
			return undefined;
		}

		if (!await modelRef.object.saveCustomEditorAs(this.modifiedResource, target, options)) {
			return undefined;
		}

		return { resource: target };
	}

	override async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		await this._modelRef.value?.object.revert(options);
	}

	override async resolve(): Promise<null> {
		await super.resolve();

		if (this.isDisposed()) {
			return null;
		}

		if (this.side === 'modified' && !this._modelRef.value) {
			const modelRef = this.customEditorService.models.tryRetain(this.modifiedResource, this.viewType);
			if (modelRef) {
				const oldCapabilities = this.capabilities;
				const retainedModelRef = await modelRef;
				if (this.isDisposed()) {
					retainedModelRef.dispose();
					return null;
				}
				this._modelRef.value = retainedModelRef;
				this._register(retainedModelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
				this._register(retainedModelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
				if (this.isDirty()) {
					this._onDidChangeDirty.fire();
				}
				if (this.capabilities !== oldCapabilities) {
					this._onDidChangeCapabilities.fire();
				}
			}
		}

		return null;
	}

	public undo(): void | Promise<void> {
		return this.undoRedoService.undo(this.modifiedResource);
	}

	public redo(): void | Promise<void> {
		return this.undoRedoService.redo(this.modifiedResource);
	}

	override toUntyped(_options?: IUntypedEditorOptions): IUntypedEditorInput {
		return { resource: this.resource };
	}
}
