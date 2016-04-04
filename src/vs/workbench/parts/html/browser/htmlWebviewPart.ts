/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/text!./webview.html';
// import {localize} from 'vs/nls';
// import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel/*, EventType*/} from 'vs/editor/common/editorCommon';
import {Dimension, Builder} from 'vs/base/browser/builder';
// import {empty as EmptyDisposable} from 'vs/base/common/lifecycle';
import {addDisposableListener} from 'vs/base/browser/dom';
import {EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
// import {Position} from 'vs/platform/editor/common/editor';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService/*, StorageEventType, StorageScope*/} from 'vs/platform/storage/common/storage';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
// import {BaseTextEditorModel} from 'vs/workbench/common/editor/textEditorModel';
// import {Preferences} from 'vs/workbench/common/constants';
import {HtmlInput} from 'vs/workbench/parts/html/common/htmlInput';
// import {isLightTheme} from 'vs/platform/theme/common/themes';
// import {DEFAULT_THEME_ID} from 'vs/workbench/services/themes/common/themeService';

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

	private _webview: TPromise<Webview>;
	private _editorService: IWorkbenchEditorService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(WebviewPart.ID, telemetryService);

		this._editorService = editorService;
		// this._storageService = storageService;
		// this._iFrameBase = contextService.toResource('/');
	}

	public createEditor(parent: Builder): void {
		const webview = <Webview>document.createElement('webview');
		webview.autoSize = 'on';
		webview.nodeintegration = 'on';
		// webview.disablewebsecurity = 'on';
		webview.setAttribute('allowDisplayingInsecureContent', 'false');
		webview.setAttribute('allowRunningInsecureContent', 'false');
		webview.src = require.toUrl('./webview.html');

		parent.getHTMLElement().appendChild(webview);

		this._webview = new TPromise<Webview>((resolve, reject) => {
			const onDomReady = () => {
				webview.openDevTools();
				webview.removeEventListener('dom-ready', onDomReady);
				addDisposableListener(webview, 'ipc-message', (event) => {
					console.log('IN', event);
				});
				resolve(webview);
			};
			webview.addEventListener('dom-ready', onDomReady);
		});
	}

	public layout(dimension: Dimension): void {
		const {width, height} = dimension;
		this._webview.then(value => {
			value.style.width = `${width}px`;
			value.style.height = `${height}px`;
			value.send('layout', width, height);
		});
	}

	// public focus(): void {
	// 	this._webview.focus();
	// }

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {

		if (!(input instanceof HtmlInput)) {
			return TPromise.wrapError<void>('Invalid input');
		}

		return this._editorService.resolveEditorModel({ resource: (<HtmlInput>input).getResource() }).then(model => {
			return this._webview.then(value => {

				value.send('content', (<IModel>model.textEditorModel).getValue(), function () {
					console.log(arguments);
				});

				return super.setInput(input, options);
			});
		});
	}

}
