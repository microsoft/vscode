/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { EditorInput, EditorModel } from 'vs/workbench/common/editor';
import { IEditorModel, Position, IEditorInput } from 'vs/platform/editor/common/editor';
import { Webview } from 'vs/workbench/parts/html/electron-browser/webview';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import * as vscode from 'vscode';
import URI from 'vs/base/common/uri';

export interface WebviewEvents {
	onMessage?(message: any): void;
	onDidChangePosition?(newPosition: Position): void;
	onDispose?(): void;
	onDidClickLink?(link: URI, options: vscode.WebviewOptions): void;
}

export interface WebviewInputOptions extends vscode.WebviewOptions {
	tryRestoreScrollPosition?: boolean;
}

export class WebviewInput extends EditorInput {
	private static handlePool = 0;

	private readonly _resource: URI;
	private _name: string;
	private _options: WebviewInputOptions;
	private _html: string;
	private _currentWebviewHtml: string = '';
	private _events: WebviewEvents | undefined;
	private _container: HTMLElement;
	private _webview: Webview | undefined;
	private _webviewOwner: any;
	private _webviewDisposables: IDisposable[] = [];
	private _position?: Position;
	private _scrollYPercentage: number = 0;
	public readonly extensionFolderPath: URI | undefined;

	constructor(
		resource: URI,
		name: string,
		options: WebviewInputOptions,
		html: string,
		events: WebviewEvents,
		partService: IPartService,
		extensionFolderPath?: string
	) {
		super();
		this._resource = resource;
		this._name = name;
		this._options = options;
		this._html = html;
		this._events = events;

		if (extensionFolderPath) {
			this.extensionFolderPath = URI.file(extensionFolderPath);
		}

		const id = WebviewInput.handlePool++;
		this._container = document.createElement('div');
		this._container.id = `webview-${id}`;

		partService.getContainer(Parts.EDITOR_PART).appendChild(this._container);
	}

	public getTypeId(): string {
		return 'webview';
	}

	public dispose() {
		this.disposeWebview();

		if (this._container) {
			this._container.remove();
			this._container = undefined;
		}

		if (this._events) {
			this._events.onDispose();
			this._events = undefined;
		}

		super.dispose();
	}

	public getResource(): URI {
		return this._resource;
	}

	public getName(): string {
		return this._name;
	}

	public setName(value: string): void {
		this._name = value;
		this._onDidChangeLabel.fire();
	}

	matches(other: IEditorInput): boolean {
		return other && other instanceof WebviewInput && other.getResource().fsPath === this.getResource().fsPath;
	}

	public get position(): Position | undefined {
		return this._position;
	}

	public get html(): string {
		return this._html;
	}

	public setHtml(value: string): void {
		if (value === this._currentWebviewHtml) {
			return;
		}

		this._html = value;

		if (this._webview) {
			this._webview.contents = value;
			this._currentWebviewHtml = value;
		}
	}

	public get options(): WebviewInputOptions {
		return this._options;
	}

	public set options(value: WebviewInputOptions) {
		this._options = value;
	}

	public resolve(refresh?: boolean): TPromise<IEditorModel, any> {
		return TPromise.as(new EditorModel());
	}

	public supportsSplitEditor() {
		return false;
	}

	public get container(): HTMLElement {
		return this._container;
	}

	public get webview(): Webview | undefined {
		return this._webview;
	}

	public set webview(value: Webview) {
		this._webviewDisposables = dispose(this._webviewDisposables);

		this._webview = value;

		this._webview.onDidClickLink(link => {
			if (this._events && this._events.onDidClickLink) {
				this._events.onDidClickLink(link, this._options);
			}
		}, null, this._webviewDisposables);

		this._webview.onMessage(message => {
			if (this._events && this._events.onMessage) {
				this._events.onMessage(message);
			}
		}, null, this._webviewDisposables);

		this._webview.onDidScroll(message => {
			this._scrollYPercentage = message.scrollYPercentage;
		}, null, this._webviewDisposables);
	}

	public get scrollYPercentage() {
		return this._scrollYPercentage;
	}

	public claimWebview(owner: any) {
		this._webviewOwner = owner;
	}

	public releaseWebview(owner: any) {
		if (this._webviewOwner === owner) {
			this._webviewOwner = undefined;
			if (this._options.retainContextWhenHidden) {
				this.container.style.visibility = 'hidden';
			} else {
				this.disposeWebview();
			}
		}
	}

	public disposeWebview() {
		// The input owns the webview and its parent
		if (this._webview) {
			this._webview.dispose();
			this._webview = undefined;
		}

		this._webviewDisposables = dispose(this._webviewDisposables);

		this._webviewOwner = undefined;
		this.container.style.visibility = 'hidden';

		this._currentWebviewHtml = '';
	}

	public onDidChangePosition(position: Position) {
		if (this._events && this._events.onDidChangePosition) {
			this._events.onDidChangePosition(position);
		}
		this._position = position;
	}
}
