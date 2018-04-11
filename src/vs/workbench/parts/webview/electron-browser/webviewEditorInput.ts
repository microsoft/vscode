/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorInput, IEditorModel, Position } from 'vs/platform/editor/common/editor';
import { EditorInput, EditorModel } from 'vs/workbench/common/editor';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { WebviewEvents, WebviewInputOptions, WebviewReviver } from './webviewEditorService';
import { WebviewElement } from './webviewElement';


export class WebviewEditorInput extends EditorInput {
	private static handlePool = 0;

	public static readonly typeId = 'workbench.editors.webviewInput';

	private _name: string;
	private _options: WebviewInputOptions;
	private _html: string = '';
	private _currentWebviewHtml: string = '';
	public _events: WebviewEvents | undefined;
	private _container: HTMLElement;
	private _webview: WebviewElement | undefined;
	private _webviewOwner: any;
	private _webviewDisposables: IDisposable[] = [];
	private _position?: Position;
	private _scrollYPercentage: number = 0;
	private _state: any;

	private _revived: boolean = false;

	public readonly extensionFolderPath: URI | undefined;

	constructor(
		public readonly viewType: string,
		name: string,
		options: WebviewInputOptions,
		state: any,
		events: WebviewEvents,
		extensionFolderPath: string | undefined,
		public readonly reviver: WebviewReviver | undefined,
		@IPartService private readonly _partService: IPartService,
	) {
		super();
		this._name = name;
		this._options = options;
		this._events = events;
		this._state = state;

		if (extensionFolderPath) {
			this.extensionFolderPath = URI.file(extensionFolderPath);
		}
	}

	public getTypeId(): string {
		return WebviewEditorInput.typeId;
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
		return null;
	}

	public getName(): string {
		return this._name;
	}

	public getTitle() {
		return this.getName();
	}

	public getDescription(): string {
		return null;
	}

	public setName(value: string): void {
		this._name = value;
		this._onDidChangeLabel.fire();
	}

	matches(other: IEditorInput): boolean {
		return other && other === this;
	}

	public get position(): Position | undefined {
		return this._position;
	}

	public get html(): string {
		return this._html;
	}

	public set html(value: string) {
		if (value === this._currentWebviewHtml) {
			return;
		}

		this._html = value;

		if (this._webview) {
			this._webview.contents = value;
			this._currentWebviewHtml = value;
		}
	}

	public get state(): any {
		return this._state;
	}

	public set state(value: any) {
		this._state = value;
	}

	public get options(): WebviewInputOptions {
		return this._options;
	}

	public set options(value: WebviewInputOptions) {
		this._options = value;
	}

	public resolve(refresh?: boolean): TPromise<IEditorModel, any> {
		if (this.reviver && !this._revived) {
			this._revived = true;
			return this.reviver.reviveWebview(this).then(() => new EditorModel());
		}

		return TPromise.as(new EditorModel());
	}

	public supportsSplitEditor() {
		return false;
	}

	public get container(): HTMLElement {
		if (!this._container) {
			const id = WebviewEditorInput.handlePool++;
			this._container = document.createElement('div');
			this._container.id = `webview-${id}`;
			this._partService.getContainer(Parts.EDITOR_PART).appendChild(this._container);
		}
		return this._container;
	}

	public get webview(): WebviewElement | undefined {
		return this._webview;
	}

	public set webview(value: WebviewElement) {
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
			if (this._options.retainContextWhenHidden && this._container) {
				this._container.style.visibility = 'hidden';
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

		if (this._container) {
			this._container.style.visibility = 'hidden';
		}

		this._currentWebviewHtml = '';
	}

	public onBecameActive(position: Position): void {
		this._position = position;
	}
}
