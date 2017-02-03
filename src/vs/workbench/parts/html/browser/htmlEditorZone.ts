/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEditorContribution, ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IViewZone } from 'vs/editor/browser/editorBrowser';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import Webview from './webview';

class HtmlZone implements IViewZone {

	zoneId: number;

	private _domNode: HTMLElement;
	private _webview: Webview;
	private _disposables: IDisposable[] = [];

	constructor(public lineNumber: number, public htmlContent: string) {

	}

	dispose(): void {
		dispose(this._disposables);
	}

	get domNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');

			const observer = new MutationObserver(_ => this._onVisibilityChanged());
			observer.observe(this._domNode, { attributes: true, attributeFilter: ['monaco-visible-view-zone'] });
			this._disposables.push({ dispose: () => observer.disconnect() });
		}

		return this._domNode;
	}

	private _onVisibilityChanged(): void {
		if (this._domNode.hasAttribute('monaco-visible-view-zone') && !this._webview) {
			this._webview = new Webview(this.domNode, document.querySelector('.monaco-editor-background'), { nodeintegration: true });
			this._disposables.push(this._webview);
			this._webview.contents = [this.htmlContent];
		}
	}

	get afterLineNumber(): number {
		return this.lineNumber;
	}

	get heightInLines(): number {
		return 6;
	}

	get suppressMouseDown(): boolean {
		return false;
	}
}

@editorContribution
export class HtmlZoneController implements IEditorContribution {

	static getInstance(editor: ICommonCodeEditor): HtmlZoneController {
		return <HtmlZoneController>editor.getContribution('htmlZoneContribution');
	}

	private _editor: ICodeEditor;
	private _zones: HtmlZone[] = [];

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._editor.onDidChangeModel(() => this._zones = dispose(this._zones));
	}

	getId(): string {
		return 'htmlZoneContribution';
	}

	dispose(): void {
		dispose(this._zones);
	}

	addZone(lineNumber: number, htmlContents: string): void {
		const zone = new HtmlZone(lineNumber, htmlContents);
		this._zones.push(zone);

		this._editor.changeViewZones(accessor => {
			zone.zoneId = accessor.addZone(zone);
			console.log('ADDED new zone #', zone.zoneId);
		});
	}
}
