/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/text!./webview.html';
import {localize} from 'vs/nls';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, EventType} from 'vs/editor/common/editorCommon';
import {Dimension, Builder} from 'vs/base/browser/builder';
import {empty as EmptyDisposable, IDisposable, dispose} from 'vs/base/common/lifecycle';
import {addDisposableListener, addClass} from 'vs/base/browser/dom';
import {EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {Position} from 'vs/platform/editor/common/editor';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {isLightTheme} from 'vs/platform/theme/common/themes';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {BaseTextEditorModel} from 'vs/workbench/common/editor/textEditorModel';
import {HtmlInput} from 'vs/workbench/parts/html/common/htmlInput';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IOpenerService} from 'vs/platform/opener/common/opener';

KeybindingsRegistry.registerCommandDesc({
	id: '_webview.openDevTools',
	context: null,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	primary: null,
	handler() {
		const elements = document.querySelectorAll('webview.ready');
		for (let i = 0; i < elements.length; i++) {
			try {
				(<Webview>elements.item(i)).openDevTools();
			} catch (e) {
				console.error(e);
			}
		}
	}
});

declare interface Webview extends HTMLElement {
	src: string;
	autoSize: 'on';
	nodeintegration: 'on';
	disablewebsecurity: 'on';

	getURL(): string;
	getTitle(): string;
	executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => any);
	send(channel: string, ...args: any[]);
	openDevTools(): any;
	closeDevTools(): any;
}

class ManagedWebview {

	private _webview: Webview;
	private _ready: TPromise<this>;
	private _disposables: IDisposable[];

	constructor(private _parent: HTMLElement, private _styleElement: Element, onDidClickLink:(uri:URI)=>any) {
		this._webview = <Webview>document.createElement('webview');

		this._webview.style.width = '100%';
		this._webview.style.height = '100%';
		this._webview.autoSize = 'on';
		this._webview.nodeintegration = 'on';
		this._webview.src = require.toUrl('./webview.html');

		this._ready = new TPromise<this>(resolve => {
			const subscription = addDisposableListener(this._webview, 'ipc-message', (event) => {
				if (event.channel === 'webview-ready') {

					// console.info('[PID Webview] ' + event.args[0]);
					addClass(this._webview, 'ready'); // can be found by debug command

					subscription.dispose();
					resolve(this);
				}
			});
		});

		this._disposables = [
			addDisposableListener(this._webview, 'console-message', function (e: { level: number; message: string; line: number; sourceId: string; }) {
				console.log(`[Embedded Page] ${e.message}`);
			}),
			addDisposableListener(this._webview, 'crashed', function () {
				console.error('embedded page crashed');
			}),
			addDisposableListener(this._webview, 'ipc-message', (event) => {
				if (event.channel === 'did-click-link') {
					let [uri] = event.args;
					onDidClickLink(URI.parse(uri));
				}
			})
		];

		this._parent.appendChild(this._webview);
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._webview.parentElement.removeChild(this._webview);
	}

	private _send(channel: string, ...args: any[]): void {
		this._ready
			.then(() => this._webview.send(channel, ...args))
			.done(void 0, console.error);
	}

	set contents(value: string[]) {
		this._send('content', value);
	}

	set baseUrl(value: string) {
		this._send('baseUrl', value);
	}

	focus(): void {
		this._send('focus');
	}

	style(themeId: string): void {
		const {color, backgroundColor, fontFamily, fontSize} = window.getComputedStyle(this._styleElement);

		let value = `
		body {
			margin: 0;
		}
		* {
			color: ${color};
			background-color: ${backgroundColor};
			font-family: ${fontFamily};
			font-size: ${fontSize};
		}
		img {
			max-width: 100%;
			max-height: 100%;
		}
		a:focus,
		input:focus,
		select:focus,
		textarea:focus {
			outline: 1px solid -webkit-focus-ring-color;
			outline-offset: -1px;
		}
		::-webkit-scrollbar {
			width: 14px;
			height: 10px;
		}
		::-webkit-scrollbar-thumb:hover {
			background-color: rgba(100, 100, 100, 0.7);
		}`;

		if (isLightTheme(themeId)) {
			value += `
			::-webkit-scrollbar-thumb {
				background-color: rgba(100, 100, 100, 0.4);
			}
			::-webkit-scrollbar-thumb:active {
				background-color: rgba(0, 0, 0, 0.6);
			}`;
		} else {
			value += `
			::-webkit-scrollbar-thumb {
				background-color: rgba(121, 121, 121, 0.4);
			}
			::-webkit-scrollbar-thumb:active {
				background-color: rgba(85, 85, 85, 0.8);
			}`;
		}

		this._send('styles', value);
	}
}

/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the IFrameEditorInput.
 */
export class HtmlPreviewPart extends BaseEditor {

	static ID: string = 'workbench.editor.htmlPreviewPart';

	private _editorService: IWorkbenchEditorService;
	private _themeService: IThemeService;
	private _openerService: IOpenerService;
	private _webview: ManagedWebview;
	private _container: HTMLDivElement;

	private _baseUrl: URI;

	private _model: IModel;
	private _modelChangeSubscription = EmptyDisposable;
	private _themeChangeSubscription = EmptyDisposable;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@IOpenerService openerService: IOpenerService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(HtmlPreviewPart.ID, telemetryService);

		this._editorService = editorService;
		this._themeService = themeService;
		this._openerService = openerService;
		this._baseUrl = contextService.toResource('/');
	}

	dispose(): void {
		// remove from dom
		this._webview.dispose();

		// unhook listeners
		this._themeChangeSubscription.dispose();
		this._modelChangeSubscription.dispose();
		this._model = undefined;
		super.dispose();
	}

	public createEditor(parent: Builder): void {
		this._container = document.createElement('div');
		parent.getHTMLElement().appendChild(this._container);
	}

	private get webview(): ManagedWebview {
		if (!this._webview) {
			this._webview = new ManagedWebview(this._container,
				document.querySelector('.monaco-editor-background'),
				uri => this._openerService.open(uri));

			this._webview.baseUrl = this._baseUrl && this._baseUrl.toString();
		}
		return this._webview;
	}

	public changePosition(position: Position): void {
		// what this actually means is that we got reparented. that
		// has caused the webview to stop working and we need to reset it
		this._doSetVisible(false);
		this._doSetVisible(true);

		super.changePosition(position);
	}

	public setVisible(visible: boolean, position?: Position): TPromise<void> {
		this._doSetVisible(visible);
		return super.setVisible(visible, position);
	}

	private _doSetVisible(visible: boolean):void {
		if (!visible) {
			this._themeChangeSubscription.dispose();
			this._modelChangeSubscription.dispose();
			this._webview.dispose();
			this._webview = undefined;
		} else {
			this._themeChangeSubscription = this._themeService.onDidThemeChange(themeId => this.webview.style(themeId));
			this.webview.style(this._themeService.getTheme());

			if (this._model) {
				this._modelChangeSubscription = this._model.addListener2(EventType.ModelContentChanged2, () => this.webview.contents = this._model.getLinesContent());
				this.webview.contents = this._model.getLinesContent();
			}
		}
	}

	public layout(dimension: Dimension): void {
		const {width, height} = dimension;
		this._container.style.width = `${width}px`;
		this._container.style.height = `${height}px`;
	}

	public focus(): void {
		this.webview.focus();
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {

		if (this.input === input) {
			return TPromise.as(undefined);
		}

		this._model = undefined;
		this._modelChangeSubscription.dispose();

		if (!(input instanceof HtmlInput)) {
			return TPromise.wrapError<void>('Invalid input');
		}

		return this._editorService.resolveEditorModel({ resource: (<HtmlInput>input).getResource() }).then(model => {
			if (model instanceof BaseTextEditorModel) {
				this._model = model.textEditorModel;
			}
			if (!this._model) {
				return TPromise.wrapError<void>(localize('html.voidInput', "Invalid editor input."));
			}
			this._modelChangeSubscription = this._model.addListener2(EventType.ModelContentChanged2, () => this.webview.contents = this._model.getLinesContent());
			this.webview.contents = this._model.getLinesContent();
			return super.setInput(input, options);
		});
	}
}
