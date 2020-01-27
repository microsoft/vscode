/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { URI } from 'vs/base/common/uri';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { EditorInput, EditorModel, GroupIdentifier, IEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { IWebviewService, WebviewEditorOverlay, WebviewIcons } from 'vs/workbench/contrib/webview/browser/webview';

const WebviewPanelResourceScheme = 'webview-panel';

export class WebviewInput extends EditorInput {

	public static typeId = 'workbench.editors.webviewInput';

	private _name: string;
	private _iconPath?: WebviewIcons;
	private _group?: GroupIdentifier;

	private readonly _webview: Lazy<WebviewEditorOverlay>;
	private _didSomeoneTakeMyWebview = false;

	private readonly _onDisposeWebview = this._register(new Emitter<void>());
	readonly onDisposeWebview = this._onDisposeWebview.event;

	constructor(
		public readonly id: string,
		public readonly viewType: string,
		name: string,
		webview: Lazy<WebviewEditorOverlay>,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		super();
		this._name = name;
		this._webview = webview;
	}

	dispose() {
		if (!this.isDisposed()) {
			if (!this._didSomeoneTakeMyWebview) {
				this._webview?.rawValue?.dispose();
				this._onDisposeWebview.fire();
			}
		}
		super.dispose();
	}

	public getTypeId(): string {
		return WebviewInput.typeId;
	}

	public getResource(): URI {
		return URI.from({
			scheme: WebviewPanelResourceScheme,
			path: `webview-panel/webview-${this.id}`
		});
	}

	public getName(): string {
		return this._name;
	}

	public getTitle(_verbosity?: Verbosity): string {
		return this.getName();
	}

	public getDescription(): string | undefined {
		return undefined;
	}

	public setName(value: string): void {
		this._name = value;
		this._onDidChangeLabel.fire();
	}

	public get webview(): WebviewEditorOverlay {
		return this._webview.getValue();
	}

	public get extension() {
		return this.webview.extension;
	}

	public get iconPath() {
		return this._iconPath;
	}

	public set iconPath(value: WebviewIcons | undefined) {
		this._iconPath = value;
		this._webviewService.setIcons(this.id, value);
	}

	public matches(other: IEditorInput): boolean {
		return other === this;
	}

	public get group(): GroupIdentifier | undefined {
		return this._group;
	}

	public updateGroup(group: GroupIdentifier): void {
		this._group = group;
	}

	public async resolve(): Promise<IEditorModel> {
		return new EditorModel();
	}

	public supportsSplitEditor() {
		return false;
	}

	protected takeOwnershipOfWebview(): WebviewEditorOverlay | undefined {
		if (this._didSomeoneTakeMyWebview) {
			return undefined;
		}
		this._didSomeoneTakeMyWebview = true;
		return this.webview;
	}
}
