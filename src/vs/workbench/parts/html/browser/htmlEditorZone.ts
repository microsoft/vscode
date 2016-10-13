/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEditorContribution, ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IViewZone } from 'vs/editor/browser/editorBrowser';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Webview from './webview';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';

class WebviewPool {

	private _returned: Webview[] = [];
	private _active: Webview[] = [];

	dispose(): void {
		this._returned = dispose(this._returned);
		this._active = dispose(this._active);
	}

	take(): Webview {

		if (this._returned.length > 0) {
			const ret = this._returned.pop();
			this._active.push(ret);
			return ret;
		}

		if (this._active.length < 10) {
			const ret = new Webview(undefined, document.querySelector('.monaco-editor-background'));
			this._active.push(ret);
			return ret;
		}
	}

	return(webview: Webview): void {

		if (!webview) {
			return;
		}

		const idx = this._active.indexOf(webview);
		if (idx < 0) {
			throw new Error('illegal state - unknown webview');
		}

		this._returned.push(webview);
		this._active.splice(idx, 1);

		// reset state
		webview.contents = [];
		webview.baseUrl = '';
		if (webview.domNode.parentElement) {
			webview.domNode.removeChild(webview.domNode);
		}
	}
}

class HtmlZone implements IViewZone {

	zoneId: number;

	private _domNode: HTMLElement;
	private _webviewPool: WebviewPool;
	private _webview: Webview;
	private _disposables: IDisposable[] = [];

	constructor(public lineNumber: number, webviewPool: WebviewPool) {
		this._webviewPool = webviewPool;
	}

	dispose(): void {
		dispose(this._disposables);

		this._webviewPool.return(this._webview);
	}

	get domNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');
			this._domNode.innerText = 'ZONE-ZONE-ZONE';

			const observer = new MutationObserver(_ => this._onVisibilityChanged());
			observer.observe(this._domNode, { attributes: true, attributeFilter: ['monaco-visible-view-zone'] });
			this._disposables.push({ dispose: () => observer.disconnect() });
		}

		return this._domNode;
	}

	private _onVisibilityChanged(): void {
		if (this._domNode.hasAttribute('monaco-visible-view-zone')) {

			if (!this._webview) {
				this._webview = this._webviewPool.take();
			}

			if (!this._webview) {
				// TODO@joh better handling
				this._domNode.innerText = 'No more views available...';
				return;
			}

			this._domNode.appendChild(this._webview.domNode);
			this._webview.contents = ['<h4>Webish View</h4> <hr> Vrees Rastdorf Bockholte Peheim Lindern'];
		}
	}

	get afterLineNumber(): number {
		return this.lineNumber;
	}

	get heightInLines(): number {
		return 6;
	}
}


@editorContribution
export class HtmlZoneController implements IEditorContribution {

	static getInstance(editor: ICommonCodeEditor): HtmlZoneController {
		return <HtmlZoneController>editor.getContribution('htmlZoneContribution');
	}

	private _editor: ICodeEditor;
	private _webviewPool = new WebviewPool();
	private _zones: HtmlZone[] = [];

	constructor(editor: ICodeEditor) {
		this._editor = editor;
	}

	getId(): string {
		return 'htmlZoneContribution';
	}

	dispose(): void {
		this._webviewPool.dispose();
		dispose(this._zones);
	}

	addZone(lineNumber: number): void {
		const zone = new HtmlZone(lineNumber, this._webviewPool);
		this._zones.push(zone);

		this._editor.changeViewZones(accessor => {
			zone.zoneId = accessor.addZone(zone);
			console.log('ADDED: ', zone.zoneId);
		});
	}
}
