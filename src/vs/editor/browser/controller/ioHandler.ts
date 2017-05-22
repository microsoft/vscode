/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./textAreaHandler';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { HorizontalRange } from 'vs/editor/common/view/renderingContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { ViewPart } from "vs/editor/browser/view/viewPart";

export interface IOHandlerHelper {
	visibleRangeForPositionRelativeToEditor(lineNumber: number, column: number): HorizontalRange;
}

export abstract class IOHandler extends ViewPart {

	protected readonly _viewController: ViewController;
	protected readonly _viewHelper: IOHandlerHelper;

	constructor(context: ViewContext, viewController: ViewController, viewHelper: IOHandlerHelper) {
		super(context);
		this._viewController = viewController;
		this._viewHelper = viewHelper;
	}

	public dispose(): void {
		super.dispose();
	}

	// --- begin view API

	public abstract attachTo(parent: FastDomNode<any>): void;

	public abstract isFocused(): boolean;

	public abstract focusTextArea(): void;

	public abstract writeToTextArea(): void;

	public abstract setAriaActiveDescendant(id: string): void;

	// --- end view API

}
