/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from 'vs/base/browser/dom';
import type { IActiveCodeEditor, IViewZone } from 'vs/editor/browser/editorBrowser';
import type { IWebviewElement } from 'vs/workbench/contrib/webview/browser/webview';

// todo@jrieken move these things back into something like contrib/insets
export class EditorWebviewZone implements IViewZone {

	readonly domNode: HTMLElement;
	readonly afterLineNumber: number;
	readonly afterColumn: number;
	readonly heightInLines: number;
	private _id?: string;
	// suppressMouseDown?: boolean | undefined;
	// heightInPx?: number | undefined;
	// minWidthInPx?: number | undefined;
	// marginDomNode?: HTMLElement | null | undefined;
	// onDomNodeTop?: ((top: number) => void) | undefined;
	// onComputedHeight?: ((height: number) => void) | undefined;

	constructor(
		readonly editor: IActiveCodeEditor,
		readonly line: number,
		readonly height: number,
		readonly webview: IWebviewElement,
	) {
		this.domNode = document.createElement('div');
		this.domNode.style.zIndex = '10'; // without this, the webview is not interactive
		this.afterLineNumber = line;
		this.afterColumn = 1;
		this.heightInLines = height;

		editor.changeViewZones(accessor => this._id = accessor.addZone(this));
		webview.mountTo(this.domNode, getWindow(editor.getDomNode()));
	}

	dispose(): void {
		this.editor.changeViewZones(accessor => this._id && accessor.removeZone(this._id));
	}
}

export class EditorViewZone implements IViewZone {

	readonly domNode: HTMLElement;
	readonly afterLineNumber: number;
	readonly afterColumn: number;
	readonly heightInLines: number;
	public heightInPx?: number;

	private _id?: string;
	// suppressMouseDown?: boolean | undefined;
	// heightInPx?: number | undefined;
	// minWidthInPx?: number | undefined;
	// marginDomNode?: HTMLElement | null | undefined;
	// onDomNodeTop?: ((top: number) => void) | undefined;
	// onComputedHeight?: ((height: number) => void) | undefined;

	constructor(
		readonly editor: IActiveCodeEditor,
		readonly line: number,
		readonly height: number,
	) {
		this.domNode = document.createElement('div');
		this.domNode.style.zIndex = '10'; // without this, the webview is not interactive
		this.domNode.style.marginLeft = '45px'; // without this, the webview is not interactive
		this.afterLineNumber = line;
		this.afterColumn = 1;
		this.heightInLines = height;

		editor.getContainerDomNode().appendChild(this.domNode);
		// editor.changeViewZones(accessor => {
		// 	this._id = accessor.addZone(this);
		// });
	}

	public changeHeight(height: number) {
		this.heightInPx = height;
		this.domNode.style.height = `${height}px`;
		// this.editor.changeViewZones(accessor => accessor.layoutZone(this._id!));
	}

	dispose(): void {
		// this.editor.changeViewZones(accessor => this._id && accessor.removeZone(this._id));
	}
}
