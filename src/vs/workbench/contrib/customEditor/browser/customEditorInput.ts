/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { toAction } from '../../../../base/common/actions.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { dirname, isEqual } from '../../../../base/common/resources.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { EditorInputCapabilities, GroupIdentifier, IMoveResult, IRevertOptions, ISaveOptions, IUntypedEditorInput, Verbosity, createEditorOpenError } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { ICustomEditorModel, ICustomEditorService } from '../common/customEditor.js';
import { IOverlayWebview, IWebviewService } from '../../webview/browser/webview.js';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { WebviewIconPath } from '../../webviewPanel/browser/webviewEditorInput.js';

interface CustomEditorInputInitInfo {
	readonly resource: URI;
	readonly viewType: string;
	readonly webviewTitle: string | undefined;
	readonly iconPath: WebviewIconPath | undefined;
}

export class CustomEditorInput extends LazilyResolvedWebviewEditorInput {

	static create(
		instantiationService: IInstantiationService,
		init: CustomEditorInputInitInfo,
		group: GroupIdentifier | undefined,
		options?: { readonly customClasses?: string; readonly oldResource?: URI },
	): EditorInput {
		return instantiationService.invokeFunction(accessor => {
			// If it's an untitled file we must populate the untitledDocumentData
			const untitledString = accessor.get(IUntitledTextEditorService).getValue(init.resource);
			const untitledDocumentData = untitledString ? VSBuffer.fromString(untitledString) : undefined;
			const webview = accessor.get(IWebviewService).createWebviewOverlay({
				providedViewType: init.viewType,
				title: init.webviewTitle,
				options: { customClasses: options?.customClasses },
				contentOptions: {},
				extension: undefined,
			});
			const input = instantiationService.createInstance(CustomEditorInput, init, webview, { untitledDocumentData: untitledDocumentData, oldResource: options?.oldResource });
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

	private _editorName: string | undefined = undefined;

	private readonly _backupId: string | undefined;

	private readonly _untitledDocumentData: VSBuffer | undefined;

	override get resource() { return this._editorResource; }

	private _modelRef?: IReference<ICustomEditorModel>;

	constructor(
		init: CustomEditorInputInitInfo,
		webview: IOverlayWebview,
		options: { startsDirty?: boolean; backupId?: string; untitledDocumentData?: VSBuffer; readonly oldResource?: URI },
		@IThemeService themeService: IThemeService,
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
		@IFileService private readonly fileService: IFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICustomEditorLabelService private readonly customEditorLabelService: ICustomEditorLabelService,
	) {
		super({ providedId: init.viewType, viewType: init.viewType, name: '', iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
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
		this._register(this.customEditorLabelService.onDidChange(() => this.updateLabel()));
		this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
	}

	private onLabelEvent(scheme: string): void {
		if (scheme === this.resource.scheme) {
			this.updateLabel();
		}
	}

	private updateLabel(): void {

		// Clear any cached labels from before
		this._editorName = undefined;
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
		const customTitle = this.getWebviewTitle();
		if (customTitle) {
			return customTitle;
		}

		this._editorName ??= this.customEditorLabelService.getName(this.resource) ?? basename(this.labelService.getUriLabel(this.resource));
		return this._editorName;
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
		this._shortDescription ??= this.labelService.getUriBasenameLabel(dirname(this.resource));
		return this._shortDescription;
	}

	private _mediumDescription: string | undefined = undefined;
	private get mediumDescription(): string {
		this._mediumDescription ??= this.labelService.getUriLabel(dirname(this.resource), { relative: true });
		return this._mediumDescription;
	}

	private _longDescription: string | undefined = undefined;
	private get longDescription(): string {
		this._longDescription ??= this.labelService.getUriLabel(dirname(this.resource));
		return this._longDescription;
	}

	private _shortTitle: string | undefined = undefined;
	private get shortTitle(): string {
		this._shortTitle ??= this.getName();
		return this._shortTitle;
	}

	private _mediumTitle: string | undefined = undefined;
	private get mediumTitle(): string {
		this._mediumTitle ??= this.labelService.getUriLabel(this.resource, { relative: true });
		return this._mediumTitle;
	}

	private _longTitle: string | undefined = undefined;
	private get longTitle(): string {
		this._longTitle ??= this.labelService.getUriLabel(this.resource);
		return this._longTitle;
	}

	override getTitle(verbosity?: Verbosity): string {
		const customTitle = this.getWebviewTitle();
		if (customTitle) {
			return customTitle;
		}

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
		return CustomEditorInput.create(this.instantiationService,
			{ resource: this.resource, viewType: this.viewType, webviewTitle: this.getWebviewTitle(), iconPath: this.iconPath, },
			this.group,
			this.webview.options);
	}

	public override isReadonly(): boolean | IMarkdownString {
		if (!this._modelRef) {
			return this.filesConfigurationService.isReadonly(this.resource);
		}
		return this._modelRef.object.isReadonly();
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
			this._modelRef = this._register(assertReturnsDefined(await this.customEditorService.models.tryRetain(this.resource, this.viewType)));
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
		assertReturnsDefined(this._modelRef);
		return this.undoRedoService.undo(this.resource);
	}

	public redo(): void | Promise<void> {
		assertReturnsDefined(this._modelRef);
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

	public override claim(claimant: unknown, targetWindow: CodeWindow, scopedContextKeyService: IContextKeyService | undefined): void {
		if (this.doCanMove(targetWindow.vscodeWindowId) !== true) {
			throw createEditorOpenError(localize('editorUnsupportedInWindow', "Unable to open the editor in this window, it contains modifications that can only be saved in the original window."), [
				toAction({
					id: 'openInOriginalWindow',
					label: localize('reopenInOriginalWindow', "Open in Original Window"),
					run: async () => {
						const originalPart = this.editorGroupsService.getPart(this.layoutService.getContainer(getWindow(this.webview.container).window));
						const currentPart = this.editorGroupsService.getPart(this.layoutService.getContainer(targetWindow.window));
						currentPart.activeGroup.moveEditor(this, originalPart.activeGroup);
					}
				})
			], { forceMessage: true });
		}
		return super.claim(claimant, targetWindow, scopedContextKeyService);
	}

	public override canMove(sourceGroup: GroupIdentifier, targetGroup: GroupIdentifier): true | string {
		const resolvedTargetGroup = this.editorGroupsService.getGroup(targetGroup);
		if (resolvedTargetGroup) {
			const canMove = this.doCanMove(resolvedTargetGroup.windowId);
			if (typeof canMove === 'string') {
				return canMove;
			}
		}

		return super.canMove(sourceGroup, targetGroup);
	}

	private doCanMove(targetWindowId: number): true | string {
		if (this.isModified() && this._modelRef?.object.canHotExit === false) {
			const sourceWindowId = getWindow(this.webview.container).vscodeWindowId;
			if (sourceWindowId !== targetWindowId) {

				// The custom editor is modified, not backed by a file and without a backup.
				// We have to assume that the modified state is enclosed into the webview
				// managed by an extension. As such, we cannot just move the webview
				// into another window because that means, we potentally loose the modified
				// state and thus trigger data loss.

				return localize('editorCannotMove', "Unable to move '{0}': The editor contains changes that can only be saved in its current window.", this.getName());
			}
		}

		return true;
	}
}
