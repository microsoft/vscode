/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import { Lazy } from 'vs/base/common/lazy';
import { UnownedDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/path';
import { DataUri, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { GroupIdentifier, IEditorInput, IRevertOptions, ISaveOptions, Verbosity } from 'vs/workbench/common/editor';
import { ICustomEditorModel, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { WebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { IEditorModel } from 'vs/platform/editor/common/editor';

export class CustomFileEditorInput extends LazilyResolvedWebviewEditorInput {

	public static typeId = 'workbench.editors.webviewEditor';

	private readonly _editorResource: URI;
	private _model?: ICustomEditorModel;

	constructor(
		resource: URI,
		viewType: string,
		id: string,
		webview: Lazy<UnownedDisposable<WebviewEditorOverlay>>,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@ILabelService private readonly labelService: ILabelService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
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

	@memoize
	getName(): string {
		if (this.getResource().scheme === Schemas.data) {
			const metadata = DataUri.parseMetaData(this.getResource());
			const label = metadata.get(DataUri.META_DATA_LABEL);
			if (typeof label === 'string') {
				return label;
			}
		}
		return basename(this.labelService.getUriLabel(this.getResource()));
	}

	@memoize
	getDescription(): string | undefined {
		if (this.getResource().scheme === Schemas.data) {
			const metadata = DataUri.parseMetaData(this.getResource());
			const description = metadata.get(DataUri.META_DATA_DESCRIPTION);
			if (typeof description === 'string') {
				return description;
			}
		}
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
		if (this.getResource().scheme === Schemas.data) {
			return this.getName();
		}
		return this.labelService.getUriLabel(this.getResource(), { relative: true });
	}

	@memoize
	private get longTitle(): string {
		if (this.getResource().scheme === Schemas.data) {
			return this.getName();
		}
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

	public save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<boolean> {
		return this._model ? this._model.save(options) : Promise.resolve(false);
	}

	public saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<boolean> {
		// TODO@matt implement properly (see TextEditorInput#saveAs())
		return this._model ? this._model.save(options) : Promise.resolve(false);
	}

	public revert(options?: IRevertOptions): Promise<boolean> {
		return this._model ? this._model.revert(options) : Promise.resolve(false);
	}

	public async resolve(): Promise<IEditorModel> {
		this._model = await this.customEditorService.models.loadOrCreate(this.getResource(), this.viewType);
		this._register(this._model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		return await super.resolve();
	}
}
