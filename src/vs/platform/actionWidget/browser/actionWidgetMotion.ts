/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../base/browser/dom.js';

export const ACTION_WIDGET_ANIMATED_CLASS = 'action-widget-animated';
export const ACTION_WIDGET_DROPDOWN_MOTION_CLASS = 'action-widget-dropdown';
export const ACTION_WIDGET_DROPDOWN_MOTION_CLOSING_CLASS = 'action-widget-dropdown-closing';

/** Completes the scale entrance before measuring or positioning dependent UI. */
export function finishActionWidgetOpeningAnimation(widget: HTMLElement): void {
	for (const animation of widget.getAnimations()) {
		if (animation instanceof getWindow(widget).CSSAnimation && animation.animationName === 'action-widget-scale-open') {
			animation.finish();
		}
	}
}
