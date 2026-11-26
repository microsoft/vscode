/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPartialEditorMouseEvent, MouseTargetType } from '../../../../browser/editorBrowser.js';
import { IRange } from '../../../../common/core/range.js';
import { ColorDecorationInjectedTextMarker } from '../colorDetector.js';


export function isOnColorDecorator(mouseEvent: IPartialEditorMouseEvent): boolean {
	const target = mouseEvent.target;
	return !!target
		&& target.type === MouseTargetType.CONTENT_TEXT
		&& target.detail.injectedText?.options.attachedData === ColorDecorationInjectedTextMarker;
}

/**
 * Returns whether the mouse is on the color decorator of the color at `colorRange`.
 */
export function isOnColorDecoratorOf(mouseEvent: IPartialEditorMouseEvent, colorRange: IRange): boolean {
	// The decorator is injected text before the color, so its mouse target is the empty range at the color's start
	const targetRange = mouseEvent.target?.range;
	return isOnColorDecorator(mouseEvent)
		&& !!targetRange
		&& targetRange.startLineNumber === colorRange.startLineNumber
		&& targetRange.startColumn === colorRange.startColumn;
}
