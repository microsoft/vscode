/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewportRange, IBufferRange, ILink } from 'xterm';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { RunOnceScheduler } from 'vs/base/common/async';
import { convertBufferRangeToViewport } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';

export const TOOLTIP_HOVER_THRESHOLD = 300;

export function createLink(
	range: IBufferRange,
	text: string,
	viewportY: number,
	activateCallback: (event: MouseEvent, uri: string) => void,
	tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => boolean | void,
	hideDecorations: boolean
): ILink {
	// Listen for modifier before handing it off to the hover to handle so it gets disposed correctly
	const disposables: IDisposable[] = [];
	if (hideDecorations) {
		disposables.push(dom.addDisposableListener(document, 'keydown', e => {
			// TODO: Use ctrl/option or cmd
			if (e.ctrlKey && link.hideDecorations) {
				link.hideDecorations = false;
			}
		}));
		disposables.push(dom.addDisposableListener(document, 'keyup', e => {
			if (!e.ctrlKey) {
				link.hideDecorations = true;
			}
		}));
	}

	let scheduler: RunOnceScheduler;

	const link = {
		text,
		range,
		hideDecorations,
		activate: (event: MouseEvent, text: string) => activateCallback(event, text),
		hover: (event: MouseEvent, text: string) => {
			scheduler = new RunOnceScheduler(() => {
				tooltipCallback(
					event,
					text,
					convertBufferRangeToViewport(range, viewportY),
					hideDecorations ? () => link.hideDecorations = false : undefined,
					hideDecorations ? () => link.hideDecorations = true : undefined
				);
				dispose(disposables);
				// TODO: Use editor.hover.delay instead
			}, TOOLTIP_HOVER_THRESHOLD);
			disposables.push(scheduler);
			scheduler.schedule();

			const origin = { x: event.pageX, y: event.pageY };
			disposables.push(dom.addDisposableListener(document, dom.EventType.MOUSE_MOVE, e => {
				// Update decorations
				if (hideDecorations) {
					link.hideDecorations = !e.ctrlKey;
				}

				// Reset the scheduler if the mouse moves too much
				if (Math.abs(e.pageX - origin.x) > window.devicePixelRatio * 2 || Math.abs(e.pageY - origin.y) > window.devicePixelRatio * 2) {
					origin.x = e.pageX;
					origin.y = e.pageY;
					scheduler.schedule();
				}
			}));
		},
		leave: () => dispose(disposables)
	};

	return link;
}
