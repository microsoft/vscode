/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import { Lazy } from 'vs/base/common/lazy';
import { basename } from 'vs/base/common/path';
import { isEqual } from 'vs/base/common/resources';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IEditorModel, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { GroupIdentifier, IEditorInput, IRevertOptions, ISaveOptions, Verbosity, SaveContext } from 'vs/workbench/common/editor';
import { ICustomEditorModel, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { WebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

export class CustomFileEditorInput extends LazilyResolvedWebviewEditorInput {

	public static typeId = 'workbench.editors.webviewEditor';

	private readonly _editorResource: URI;
	private _model?: ICustomEditorModel;

	constructor(
		resource: URI,
		viewType: string,
		id: string,
		webview: Lazy<WebviewEditorOverlay>,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService
	) {
		super(id, viewType, '', webview, webviewWorkbenchService, lifecycleService);
		this._editorResource = resource;
	}

	public getTypeId(): string {
		return CustomFileEditorInput.typeId;
	}

	public getResource(): URI {
		return this._editorResource;
	}

	public supportsSplitEditor() {
		return true;
	}

	@memoize
	getName(): string {
		return basename(this.labelService.getUriLabel(this.getResource()));
	}

	@memoize
	getDescription(): string | undefined {
		return super.getDescription();
	}

	matches(other: IEditorInput): boolean {
		return this === other || (other instanceof CustomFileEditorInput
			&& this.viewType === other.viewType
			&& isEqual(this.getResource(), other.getResource()));
	}

	@memoize
	private get shortTitle(): string {
		return this.getName();
	}

	@memoize
	private get mediumTitle(): string {
		return this.labelService.getUriLabel(this.getResource(), { relative: true });
	}

	@memoize
	private get longTitle(): string {
		return this.labelService.getUriLabel(this.getResource());
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
		return false;
	}

	public isDirty(): boolean {
		return this._model ? this._model.isDirty() : false;
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

	public save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<boolean> {
		return this._model ? this._model.save(options) : Promise.resolve(false);
	}

	public async saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<boolean> {
		if (!this._model) {
			return false;
		}

		let dialogPath = this._editorResource;
		const target = await this.promptForPath(this._editorResource, dialogPath, options?.availableFileSystems);
		if (!target) {
			return false; // save cancelled
		}

		if (!await this._model.saveAs(this._editorResource, target, options)) {
			return false;
		}

		if (options?.context !== SaveContext.EDITOR_CLOSE) {
			const replacement = this.handleMove(groupId, target) || this.instantiationService.createInstance(FileEditorInput, target, undefined, undefined);
			await this.editorService.replaceEditors([{ editor: this, replacement, options: { pinned: true } }], groupId);
		}

		return true;
	}

	public revert(options?: IRevertOptions): Promise<boolean> {
		return this._model ? this._model.revert(options) : Promise.resolve(false);
	}

	public async resolve(): Promise<IEditorModel> {
		this._model = await this.customEditorService.models.resolve(this.getResource(), this.viewType);
		this._register(this._model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		if (this.isDirty()) {
			this._onDidChangeDirty.fire();
		}
		return await super.resolve();
	}

	private async promptForPath(resource: URI, defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> {

		// Help user to find a name for the file by opening it first
		await this.editorService.openEditor({ resource, options: { revealIfOpened: true, preserveFocus: true } });

		return this.fileDialogService.pickFileToSave(defaultUri, availableFileSystems);
	}

	public handleMove(groupId: GroupIdentifier, uri: URI, options?: ITextEditorOptions): IEditorInput | undefined {
		const editorInfo = this.customEditorService.getCustomEditor(this.viewType);
		if (editorInfo?.matches(uri)) {
			const webview = assertIsDefined(this.takeOwnershipOfWebview());
			const newInput = this.instantiationService.createInstance(CustomFileEditorInput,
				uri,
				this.viewType,
				generateUuid(),
				new Lazy(() => webview));
			newInput.updateGroup(groupId);
			return newInput;
		}
		return undefined;
	}
}
