/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import { Emitter } from 'vs/base/common/event';
import { UnownedDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { WebviewContentState } from 'vs/editor/common/modes';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { ILabelService } from 'vs/platform/label/common/label';
import { ConfirmResult, IEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { WebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { IWebviewEditorService } from 'vs/workbench/contrib/webview/browser/webviewEditorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { promptSave } from 'vs/workbench/services/textfile/browser/textFileService';

export class CustomFileEditorInput extends WebviewInput {

	public static typeId = 'workbench.editors.webviewEditor';

	private name?: string;
	private _hasResolved = false;
	private readonly _editorResource: URI;
	private _state = WebviewContentState.Readonly;

	constructor(
		resource: URI,
		viewType: string,
		id: string,
		webview: UnownedDisposable<WebviewEditorOverlay>,
		@ILabelService private readonly labelService: ILabelService,
		@IWebviewEditorService private readonly _webviewEditorService: IWebviewEditorService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		super(id, viewType, '', webview);
		this._editorResource = resource;
	}

	public getTypeId(): string {
		return CustomFileEditorInput.typeId;
	}

	public getResource(): URI {
		return this._editorResource;
	}

	getName(): string {
		if (!this.name) {
			this.name = basename(this.labelService.getUriLabel(this.getResource()));
		}
		return this.name;
	}

	matches(other: IEditorInput): boolean {
		return this === other || (other instanceof CustomFileEditorInput
			&& this.viewType === other.viewType
			&& this.getResource().toString() === other.getResource().toString());
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

	public async resolve(): Promise<IEditorModel> {
		if (!this._hasResolved) {
			this._hasResolved = true;
			this._extensionService.activateByEvent(`onWebviewEditor:${this.viewType}`);
			await this._webviewEditorService.resolveWebview(this);
		}
		return super.resolve();
	}

	public setState(newState: WebviewContentState): void {
		this._state = newState;
		this._onDidChangeDirty.fire();
	}

	public isDirty() {
		return this._state === WebviewContentState.Dirty;
	}

	public async confirmSave(): Promise<ConfirmResult> {
		if (!this.isDirty()) {
			return ConfirmResult.DONT_SAVE;
		}
		return promptSave(this.dialogService, [this.getResource()]);
	}

	public async save(): Promise<boolean> {
		if (!this.isDirty) {
			return true;
		}
		const waitingOn: Promise<boolean>[] = [];
		this._onWillSave.fire({
			waitUntil: (thenable: Promise<boolean>): void => { waitingOn.push(thenable); },
		});
		const result = await Promise.all(waitingOn);
		return result.every(x => x);
	}

	private readonly _onWillSave = this._register(new Emitter<{ waitUntil: (thenable: Thenable<boolean>) => void }>());
	public readonly onWillSave = this._onWillSave.event;
}
