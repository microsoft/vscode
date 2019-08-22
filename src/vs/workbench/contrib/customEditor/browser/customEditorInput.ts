/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import { UnownedDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { ILabelService } from 'vs/platform/label/common/label';
import { IEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { WebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewEditorInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { IWebviewEditorService } from 'vs/workbench/contrib/webview/browser/webviewEditorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class CustomFileEditorInput extends WebviewEditorInput {
	private name?: string;
	private _hasResolved = false;

	constructor(
		resource: URI,
		viewType: string,
		id: string,
		webview: UnownedDisposable<WebviewEditorOverlay>,
		@ILabelService
		private readonly labelService: ILabelService,
		@IWebviewEditorService
		private readonly _webviewEditorService: IWebviewEditorService,
		@IExtensionService
		private readonly _extensionService: IExtensionService
	) {
		super(id, viewType, '', undefined, webview, resource);
	}

	getName(): string {
		if (!this.name) {
			this.name = basename(this.labelService.getUriLabel(this.editorResource));
		}
		return this.name;
	}

	matches(other: IEditorInput): boolean {
		return this === other || (other instanceof CustomFileEditorInput
			&& this.viewType === other.viewType
			&& this.editorResource.toString() === other.editorResource.toString());
	}

	@memoize
	private get shortTitle(): string {
		return this.getName();
	}

	@memoize
	private get mediumTitle(): string {
		return this.labelService.getUriLabel(this.editorResource, { relative: true });
	}

	@memoize
	private get longTitle(): string {
		return this.labelService.getUriLabel(this.editorResource);
	}

	getTitle(verbosity: Verbosity): string {
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

	public async resolve(): Promise<IEditorModel> {
		if (!this._hasResolved) {
			this._hasResolved = true;
			this._extensionService.activateByEvent(`onWebviewEditor:${this.viewType}`);
			await this._webviewEditorService.resolveWebview(this);
		}
		return super.resolve();
	}
}
