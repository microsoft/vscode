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
import { IEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { WebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { CustomEditorModel } from './customEditorModel';

export class CustomFileEditorInput extends LazilyResolvedWebviewEditorInput {

	public static typeId = 'workbench.editors.webviewEditor';

	private readonly _editorResource: URI;
	private _model?: CustomEditorModel;

	constructor(
		resource: URI,
		viewType: string,
		id: string,
		webview: Lazy<UnownedDisposable<WebviewEditorOverlay>>,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@ILabelService private readonly labelService: ILabelService,
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

	public setModel(model: CustomEditorModel) {
		if (this._model) {
			throw new Error('Model is already set');
		}
		this._model = model;
		this._register(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
	}

	public isDirty(): boolean {
		return this._model ? this._model.isDirty() : false;
	}
}
