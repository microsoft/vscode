/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { EditorInput, EditorModel, GroupIdentifier, IEditorInput } from 'vs/workbench/common/editor';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import * as vscode from 'vscode';
import { WebviewEvents, WebviewInputOptions, WebviewReviver } from './webviewEditorService';
import { WebviewElement } from './webviewElement';

export class WebviewEditorInput extends EditorInput {
	private static handlePool = 0;

	private static _styleElement?: HTMLStyleElement;

	private static _icons = new Map<number, { light: URI, dark: URI }>();

	private static updateStyleElement(
		id: number,
		iconPath: { light: URI, dark: URI } | undefined
	) {
		if (!this._styleElement) {
			this._styleElement = dom.createStyleSheet();
			this._styleElement.className = 'webview-icons';
		}

		if (!iconPath) {
			this._icons.delete(id);
		} else {
			this._icons.set(id, iconPath);
		}

		const cssRules: string[] = [];
		this._icons.forEach((value, key) => {
			const webviewSelector = `.show-file-icons .webview-${key}-name-file-icon::before`;
			if (URI.isUri(value)) {
				cssRules.push(`${webviewSelector} { content: ""; background-image: url(${value.toString()}); }`);
			} else {
				cssRules.push(`.vs ${webviewSelector} { content: ""; background-image: url(${value.light.toString()}); }`);
				cssRules.push(`.vs-dark ${webviewSelector} { content: ""; background-image: url(${value.dark.toString()}); }`);
			}
		});
		this._styleElement.innerHTML = cssRules.join('\n');
	}

	public static readonly typeId = 'workbench.editors.webviewInput';

	private _name: string;
	private _iconPath?: { light: URI, dark: URI };
	private _options: WebviewInputOptions;
	private _html: string = '';
	private _currentWebviewHtml: string = '';
	public _events: WebviewEvents | undefined;
	private _container: HTMLElement;
	private _webview: WebviewElement | undefined;
	private _webviewOwner: any;
	private _webviewDisposables: IDisposable[] = [];
	private _group?: GroupIdentifier;
	private _scrollYPercentage: number = 0;
	private _state: any;

	private _revived: boolean = false;

	public readonly extensionLocation: URI | undefined;
	private readonly _id: number;

	constructor(
		public readonly viewType: string,
		id: number | undefined,
		name: string,
		options: WebviewInputOptions,
		state: any,
		events: WebviewEvents,
		extensionLocation: URI | undefined,
		public readonly reviver: WebviewReviver | undefined,
		@IPartService private readonly _partService: IPartService,
	) {
		super();

		if (typeof id === 'number') {
			this._id = id;
			WebviewEditorInput.handlePool = Math.max(id, WebviewEditorInput.handlePool) + 1;
		} else {
			this._id = WebviewEditorInput.handlePool++;
		}

		this._name = name;
		this._options = options;
		this._events = events;
		this._state = state;
		this.extensionLocation = extensionLocation;
	}

	public getTypeId(): string {
		return WebviewEditorInput.typeId;
	}

	public getId(): number {
		return this._id;
	}

	private readonly _onDidChangeIcon = this._register(new Emitter<void>());
	public readonly onDidChangeIcon = this._onDidChangeIcon.event;

	public dispose() {
		this.disposeWebview();

		if (this._container) {
			this._container.remove();
			this._container = undefined;
		}

		if (this._events && this._events.onDispose) {
			this._events.onDispose();
		}
		this._events = undefined;

		this._webview = undefined;
		super.dispose();
	}

	public getResource(): URI {
		return URI.from({
			scheme: 'webview-panel',
			path: `webview-panel/webview-${this._id}`
		});
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

	public get iconPath() {
		return this._iconPath;
	}

	public set iconPath(value: { light: URI, dark: URI } | undefined) {
		this._iconPath = value;
		WebviewEditorInput.updateStyleElement(this._id, value);
	}

	public matches(other: IEditorInput): boolean {
		return other === this || (other instanceof WebviewEditorInput && other._id === this._id);
	}

	public get group(): GroupIdentifier | undefined {
		return this._group;
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

	public get webviewState() {
		return this._state.state;
	}

	public get options(): WebviewInputOptions {
		return this._options;
	}

	public setOptions(value: vscode.WebviewOptions) {
		this._options = {
			...this._options,
			...value
		};

		if (this._webview) {
			this._webview.options = {
				allowScripts: this._options.enableScripts,
				allowSvgs: true,
				enableWrappedPostMessage: true,
				useSameOriginForRoot: false,
				localResourceRoots: this._options.localResourceRoots
			};
		}
	}

	public resolve(): Promise<IEditorModel> {
		if (this.reviver && !this._revived) {
			this._revived = true;
			return this.reviver.reviveWebview(this).then(() => new EditorModel());
		}
		return Promise.resolve(new EditorModel());
	}

	public supportsSplitEditor() {
		return false;
	}

	public get container(): HTMLElement {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.id = `webview-${this._id}`;
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

		this._webview.onDidUpdateState(newState => {
			this._state.state = newState;
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

	public updateGroup(group: GroupIdentifier): void {
		this._group = group;
	}
}
