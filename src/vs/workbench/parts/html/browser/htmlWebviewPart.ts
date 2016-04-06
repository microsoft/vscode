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
import {empty as EmptyDisposable} from 'vs/base/common/lifecycle';
import {addDisposableListener} from 'vs/base/browser/dom';
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

/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the IFrameEditorInput.
 */
export class WebviewPart extends BaseEditor {

	static ID: string = 'workbench.editor.webviewPart';

	private _editorService: IWorkbenchEditorService;
	private _themeService: IThemeService;
	private _container: HTMLDivElement;
	private _webview: TPromise<Webview>;
	private _baseUrl: URI;

	private _model: IModel;
	private _modelChangeSubscription = EmptyDisposable;
	private _themeChangeSubscription = EmptyDisposable;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(WebviewPart.ID, telemetryService);

		this._editorService = editorService;
		this._themeService = themeService;
		this._baseUrl = contextService.toResource('/');
	}

	dispose(): void {
		// remove from dom
		this._webview.then(webview => webview.parentElement.removeChild(webview));

		// unhook listeners
		this._themeChangeSubscription.dispose();
		this._modelChangeSubscription.dispose();
		this._model = undefined;
		super.dispose();
	}

	public createEditor(parent: Builder): void {

		this._container = document.createElement('div');
		parent.getHTMLElement().appendChild(this._container);

		this._webview = new TPromise<Webview>((resolve, reject) => {

			const webview = <Webview>document.createElement('webview');
			webview.style.position = 'absolute';
			webview.style.zIndex = '1';
			webview.style.visibility = 'hidden';
			webview.autoSize = 'on';
			webview.nodeintegration = 'on';
			webview.src = require.toUrl('./webview.html');

			const sub1 = addDisposableListener(webview, 'dom-ready', () => {
				webview.openDevTools();
			});

			const sub2 = addDisposableListener(webview, 'ipc-message', (event) => {
				if (event.channel === 'webview-ready') {
					sub1.dispose();
					sub2.dispose();

					webview.send('init', {
						baseUrl: this._baseUrl && this._baseUrl.toString(),
						styles: this._getDefaultStyles()
					});
					resolve(webview);
				}
			});

			document.getElementById('workbench.main.container').appendChild(webview);
		});

		this._themeChangeSubscription =	this._themeService.onDidThemeChange(() => {
			this._sendToWebview('updateStyles', this._getDefaultStyles());
		});
	}

	public setVisible(visible: boolean, position?: Position): TPromise<void> {
		return this._webview.then(value => {
			value.style.visibility = visible ? 'inherit' : 'hidden';
			return super.setVisible(visible, position);
		});
	}

	public layout(dimension: Dimension): void {
		const {width, height} = dimension;
		this._container.style.width = `${width}px`;
		this._container.style.height = `${height}px`;

		this._webview.then(value => {
			const rect = this._container.getBoundingClientRect();
			value.style.top = `${rect.top}px`;
			value.style.left = `${rect.left}px`;
			value.style.width = `${rect.width}px`;
			value.style.height = `${rect.height}px`;
			value.send('layout', width, height);
		});
	}

	public focus(): void {
		this._sendToWebview('focus');
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
			this._modelChangeSubscription = this._model.addListener2(EventType.ModelContentChanged2, () => this._updateFromModel());
			this._updateFromModel();
			return super.setInput(input, options);
		});
	}

	private _updateFromModel(): void {
		this._sendToWebview('content', this._model.getLinesContent());
	}

	private _sendToWebview(channel:string, ...args: any[]): void {
		this._webview.then(webview => webview.send(channel, ...args)).done(undefined, console.error);
	}

	private _getDefaultStyles():string {
		// const {color, background, fontFamily, fontSize} = window.getComputedStyle(this._container);
		const {color, backgroundColor, fontFamily, fontSize} = window.getComputedStyle(document.querySelector('.monaco-editor-background'));

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

		if (isLightTheme(this._themeService.getTheme())) {
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

		return value;
	}
}
