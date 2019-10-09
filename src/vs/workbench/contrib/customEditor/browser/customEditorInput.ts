/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import { Emitter } from 'vs/base/common/event';
import { UnownedDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/path';
import { DataUri, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { WebviewContentState } from 'vs/editor/common/modes';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ILabelService } from 'vs/platform/label/common/label';
import { ConfirmResult, IEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { WebviewEditorOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { LazilyResolvedWebviewEditorInput } from 'vs/workbench/contrib/webview/browser/webviewEditorInput';
import { IWebviewEditorService } from 'vs/workbench/contrib/webview/browser/webviewEditorService';
import { promptSave } from 'vs/workbench/services/textfile/browser/textFileService';

export class CustomFileEditorInput extends LazilyResolvedWebviewEditorInput {

	public static typeId = 'workbench.editors.webviewEditor';

	private readonly _editorResource: URI;
	private _state = WebviewContentState.Readonly;

	constructor(
		resource: URI,
		viewType: string,
		id: string,
		webview: UnownedDisposable<WebviewEditorOverlay>,
		@IWebviewEditorService webviewEditorService: IWebviewEditorService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super(id, viewType, '', webview, webviewEditorService);
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
