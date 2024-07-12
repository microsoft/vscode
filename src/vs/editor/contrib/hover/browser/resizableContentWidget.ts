/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { Disposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition, Position } from 'vs/editor/common/core/position';
import * as dom from 'vs/base/browser/dom';

const TOP_HEIGHT = 30;
const BOTTOM_HEIGHT = 24;

export abstract class ResizableContentWidget extends Disposable implements IContentWidget {

	readonly allowEditorOverflow: boolean = true;
	readonly suppressMouseDown: boolean = false;

	protected readonly _resizableNode = this._register(new ResizableHTMLElement());
	protected _contentPosition: IContentWidgetPosition | null = null;

	private _isResizing: boolean = false;

	constructor(
		protected readonly _editor: ICodeEditor,
		minimumSize: dom.IDimension = new dom.Dimension(10, 10)
	) {
		super();
		this._resizableNode.domNode.style.position = 'absolute';
		this._resizableNode.minSize = dom.Dimension.lift(minimumSize);
		this._resizableNode.layout(minimumSize.height, minimumSize.width);
		this._resizableNode.enableSashes(true, true, true, true);
		this._register(this._resizableNode.onDidResize(e => {
			this._resize(new dom.Dimension(e.dimension.width, e.dimension.height));
			if (e.done) {
				this._isResizing = false;
			}
		}));
		this._register(this._resizableNode.onDidWillResize(() => {
			this._isResizing = true;
		}));
	}

	get isResizing() {
		return this._isResizing;
	}

	abstract getId(): string;

	getDomNode(): HTMLElement {
		return this._resizableNode.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._contentPosition;
	}

	get position(): Position | undefined {
		return this._contentPosition?.position ? Position.lift(this._contentPosition.position) : undefined;
	}

	protected _availableVerticalSpaceAbove(position: IPosition): number | undefined {
		const editorDomNode = this._editor.getDomNode();
		const mouseBox = this._editor.getScrolledVisiblePosition(position);
		if (!editorDomNode || !mouseBox) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(editorDomNode);
		return editorBox.top + mouseBox.top - TOP_HEIGHT;
	}

	protected _availableVerticalSpaceBelow(position: IPosition): number | undefined {
		const editorDomNode = this._editor.getDomNode();
		const mouseBox = this._editor.getScrolledVisiblePosition(position);
		if (!editorDomNode || !mouseBox) {
			return;
		}
		const editorBox = dom.getDomNodePagePosition(editorDomNode);
		const bodyBox = dom.getClientArea(editorDomNode.ownerDocument.body);
		const mouseBottom = editorBox.top + mouseBox.top + mouseBox.height;
		return bodyBox.height - mouseBottom - BOTTOM_HEIGHT;
	}

	protected _findPositionPreference(widgetHeight: number, showAtPosition: IPosition): ContentWidgetPositionPreference | undefined {
		const maxHeightBelow = Math.min(this._availableVerticalSpaceBelow(showAtPosition) ?? Infinity, widgetHeight);
		const maxHeightAbove = Math.min(this._availableVerticalSpaceAbove(showAtPosition) ?? Infinity, widgetHeight);
		const maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow), widgetHeight);
		const height = Math.min(widgetHeight, maxHeight);
		let renderingAbove: ContentWidgetPositionPreference;
		if (this._editor.getOption(EditorOption.hover).above) {
			renderingAbove = height <= maxHeightAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
		} else {
			renderingAbove = height <= maxHeightBelow ? ContentWidgetPositionPreference.BELOW : ContentWidgetPositionPreference.ABOVE;
		}
		if (renderingAbove === ContentWidgetPositionPreference.ABOVE) {
			this._resizableNode.enableSashes(true, true, false, false);
		} else {
			this._resizableNode.enableSashes(false, true, true, false);
		}
		return renderingAbove;
	}

	protected _resize(dimension: dom.Dimension): void {
		this._resizableNode.layout(dimension.height, dimension.width);
	}
}
