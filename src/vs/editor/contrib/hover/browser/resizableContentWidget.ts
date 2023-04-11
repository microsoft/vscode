/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { Disposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IDimension } from 'vs/editor/common/core/dimension';

export abstract class ResizableContentWidget extends Disposable implements IContentWidget {
	allowEditorOverflow?: boolean | undefined;
	suppressMouseDown?: boolean | undefined;

	protected readonly _contentNode: HTMLDivElement;
	protected readonly _resizableNode = this._register(new ResizableHTMLElement());

	private _position: IContentWidgetPosition | null = null;

	constructor(initalSize: IDimension = new Dimension(100, 100)) {
		super();
		this._contentNode = document.createElement('div');
		this._contentNode.style.width = `${initalSize.width}px`;
		this._contentNode.style.height = `${initalSize.height}px`;
		this._resizableNode.domNode.appendChild(this._contentNode);
		this._resizableNode.minSize = new Dimension(10, 10);
		this._resizableNode.enableSashes(true, true, true, true);
		this._resizableNode.layout(initalSize.height, initalSize.width);
		this._register(this._resizableNode.onDidResize(e => {
			this._contentNode.style.width = `${e.dimension.width}px`;
			this._contentNode.style.height = `${e.dimension.height}px`;
		}));
	}

	abstract getId(): string;


	getDomNode(): HTMLElement {
		return this._resizableNode.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._position;
	}

	setPosition(value: IContentWidgetPosition | null): void {
		// TODO
		// - compute boxed above/below if applicable
		this._position = value;
	}

	// abstract beforeRender?(): IDimension | null;

	afterRender(position: ContentWidgetPositionPreference | null): void {
		// TODO
		// - set max sizes that were computed above
	}

}

export class DummyResizeWidget extends ResizableContentWidget {

	constructor() {
		super();
		this._contentNode.style.backgroundColor = 'red';
		this._contentNode.classList.add('dummy');
	}

	override getId(): string {
		return 'dummy';
	}

	override getPosition(): IContentWidgetPosition | null {
		return {
			position: { lineNumber: 1, column: 1 },
			preference: [ContentWidgetPositionPreference.BELOW]
		};
	}

	// override beforeRender?(): IDimension | null {
	// 	throw new Error('Method not implemented.');
	// }
	// override afterRender?(position: ContentWidgetPositionPreference | null): void {
	// 	throw new Error('Method not implemented.');
	// }
}
