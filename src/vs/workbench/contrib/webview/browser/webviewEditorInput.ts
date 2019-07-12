/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { EditorInput, EditorModel, GroupIdentifier, IEditorInput } from 'vs/workbench/common/editor';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { WebviewEvents, WebviewInputOptions } from './webviewEditorService';
import { Webview, WebviewOptions } from 'vs/workbench/contrib/webview/common/webview';

export class WebviewEditorInput<State = any> extends EditorInput {

	private static _styleElement?: HTMLStyleElement;

	private static _icons = new Map<string, { light: URI, dark: URI }>();

	private static updateStyleElement(
		id: string,
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
				cssRules.push(`${webviewSelector} { content: ""; background-image: url(${dom.asDomUri(value).toString()}); }`);
			} else {
				cssRules.push(`.vs ${webviewSelector} { content: ""; background-image: url(${dom.asDomUri(value.light).toString()}); }`);
				cssRules.push(`.vs-dark ${webviewSelector} { content: ""; background-image: url(${dom.asDomUri(value.dark).toString()}); }`);
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
	private _container?: HTMLElement;
	private _webview?: Webview;
	private _webviewOwner: any;
	private readonly _webviewDisposables = this._register(new DisposableStore());
	private _group?: GroupIdentifier;
	private _scrollYPercentage: number = 0;
	private _state: State;

	public readonly extension?: {
		readonly location: URI;
		readonly id: ExtensionIdentifier;
	};

	constructor(
		public readonly id: string,
		public readonly viewType: string,
		name: string,
		options: WebviewInputOptions,
		state: State,
		events: WebviewEvents,
		extension: undefined | {
			readonly location: URI;
			readonly id: ExtensionIdentifier;
		},
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();

		this._name = name;
		this._options = options;
		this._events = events;
		this._state = state;
		this.extension = extension;
	}

	public getTypeId(): string {
		return WebviewEditorInput.typeId;
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
			path: `webview-panel/webview-${this.id}`
		});
	}

	public getName(): string {
		return this._name;
	}

	public getTitle() {
		return this.getName();
	}

	public getDescription() {
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
		WebviewEditorInput.updateStyleElement(this.id, value);
	}

	public matches(other: IEditorInput): boolean {
		return other === this;
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
			this._webview.html = value;
			this._currentWebviewHtml = value;
		}
	}

	public get state(): State {
		return this._state;
	}

	public set state(value: State) {
		this._state = value;
	}

	public get options(): WebviewInputOptions {
		return this._options;
	}

	public setOptions(value: WebviewOptions) {
		this._options = {
			...this._options,
			...value
		};

		if (this._webview) {
			this._webview.options = {
				allowScripts: this._options.enableScripts,
				localResourceRoots: this._options.localResourceRoots,
				portMappings: this._options.portMapping,
			};
		}
	}

	public resolve(): Promise<IEditorModel> {
		return Promise.resolve(new EditorModel());
	}

	public supportsSplitEditor() {
		return false;
	}

	public get container(): HTMLElement {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.id = `webview-${this.id}`;
			const part = this._layoutService.getContainer(Parts.EDITOR_PART);
			part.appendChild(this._container);
		}
		return this._container;
	}

	public get webview(): Webview | undefined {
		return this._webview;
	}

	public set webview(value: Webview | undefined) {
		this._webviewDisposables.clear();

		this._webview = value;
		if (!this._webview) {
			return;
		}

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
			if (this._events && this._events.onDidUpdateWebviewState) {
				this._events.onDidUpdateWebviewState(newState);
			}
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

		this._webviewDisposables.clear();
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


export class RevivedWebviewEditorInput extends WebviewEditorInput {
	private _revived: boolean = false;

	constructor(
		id: string,
		viewType: string,
		name: string,
		options: WebviewInputOptions,
		state: any,
		events: WebviewEvents,
		extension: undefined | {
			readonly location: URI;
			readonly id: ExtensionIdentifier
		},
		private readonly reviver: (input: WebviewEditorInput) => Promise<void>,
		@IWorkbenchLayoutService partService: IWorkbenchLayoutService,
	) {
		super(id, viewType, name, options, state, events, extension, partService);
	}

	public async resolve(): Promise<IEditorModel> {
		if (!this._revived) {
			this._revived = true;
			await this.reviver(this);
		}
		return super.resolve();
	}
}
