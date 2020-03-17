/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import { Lazy } from 'vs/base/common/lazy';
import { IReference } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import { isEqual } from 'vs/base/common/resources';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { GroupIdentifier, IEditorInput, IRevertOptions, ISaveOptions, Verbosity } from 'vs/workbench/common/editor';
import { ICustomEditorModel, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IWebviewService, WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { AutoSaveMode, IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

export class CustomEditorInput extends LazilyResolvedWebviewEditorInput {

	public static typeId = 'workbench.editors.webviewEditor';

	private readonly _editorResource: URI;
	get resource() { return this._editorResource; }

	private _modelRef?: IReference<ICustomEditorModel>;

	constructor(
		resource: URI,
		viewType: string,
		id: string,
		webview: Lazy<WebviewOverlay>,
		@IWebviewService webviewService: IWebviewService,
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
	) {
		super(id, viewType, '', webview, webviewService, webviewWorkbenchService);
		this._editorResource = resource;
	}

	public getTypeId(): string {
		return CustomEditorInput.typeId;
	}

	public supportsSplitEditor() {
		return true;
	}

	@memoize
	getName(): string {
		return basename(this.labelService.getUriLabel(this.resource));
	}

	matches(other: IEditorInput): boolean {
		return this === other || (other instanceof CustomEditorInput
			&& this.viewType === other.viewType
			&& isEqual(this.resource, other.resource));
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

	public getTitle(verbosity?: Verbosity): string {
		switch (verbosity) {
			case Verbosity.SHORT:
				return this.shortTitle;
			default:
			case Verbosity.MEDIUM:
				return this.mediumTitle;
			case Verbosity.LONG:
				return this.longTitle;
		}
	}

	public isReadonly(): boolean {
		return this._modelRef ? this._modelRef.object.isReadonly() : false;
	}

	public isDirty(): boolean {
		if (!this._modelRef) {
			return false;
		}
		return this._modelRef.object.isDirty();
	}

	public isSaving(): boolean {
		if (!this.isDirty()) {
			return false; // the editor needs to be dirty for being saved
		}

		if (this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
			return true; // a short auto save is configured, treat this as being saved
		}

		return false;
	}

	public async save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		const modelRef = assertIsDefined(this._modelRef);
		const result = await modelRef.object.save(options);
		return result ? this : undefined;
	}

	public async saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		const modelRef = assertIsDefined(this._modelRef);

		const dialogPath = this._editorResource;
		const target = await this.fileDialogService.pickFileToSave(dialogPath, options?.availableFileSystems);
		if (!target) {
			return undefined; // save cancelled
		}

		if (!await modelRef.object.saveAs(this._editorResource, target, options)) {
			return undefined;
		}

		return this.move(groupId, target)?.editor;
	}

	public async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		return assertIsDefined(this._modelRef).object.revert(options);
	}

	public async resolve(): Promise<null> {
		await super.resolve();

		if (!this._modelRef) {
			this._modelRef = this._register(assertIsDefined(await this.customEditorService.models.tryRetain(this.resource, this.viewType)));
			this._register(this._modelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));

			if (this.isDirty()) {
				this._onDidChangeDirty.fire();
			}
		}

		return null;
	}

	move(group: GroupIdentifier, newResource: URI): { editor: IEditorInput } | undefined {
		const editorInfo = this.customEditorService.getCustomEditor(this.viewType);
		if (editorInfo?.matches(newResource)) {
			// We can keep using the same custom editor provider

			if (!this._moveHandler) {
				return {
					editor: this.customEditorService.createInput(newResource, this.viewType, group),
				};
			}

			this._moveHandler(newResource);
			const newEditor = this.instantiationService.createInstance(CustomEditorInput,
				newResource,
				this.viewType,
				this.id,
				new Lazy(() => undefined!)); // this webview is replaced in the transfer call
			this.transfer(newEditor);
			newEditor.updateGroup(group);
			return { editor: newEditor };
		} else {
			// const possible = this.customEditorService.getContributedCustomEditors(newResource);
			return { editor: this.editorService.createEditorInput({ resource: newResource, forceFile: true }) };
		}
	}

	public undo(): void {
		assertIsDefined(this._modelRef);
		this.undoRedoService.undo(this.resource);
	}

	public redo(): void {
		assertIsDefined(this._modelRef);
		this.undoRedoService.redo(this.resource);
	}

	private _moveHandler?: (newResource: URI) => void;

	public onMove(handler: (newResource: URI) => void): void {
		// TODO: Move this to the service
		this._moveHandler = handler;
	}

	protected transfer(other: CustomEditorInput): CustomEditorInput | undefined {
		if (!super.transfer(other)) {
			return;
		}

		other._moveHandler = this._moveHandler;
		this._moveHandler = undefined;
		return other;
	}
}
