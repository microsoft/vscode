/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewportRange, IBufferRange, ILink } from 'xterm';
import { DisposableStore } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { RunOnceScheduler } from 'vs/base/common/async';
import { convertBufferRangeToViewport } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';

export const TOOLTIP_HOVER_THRESHOLD = 300;

export class TerminalLink extends DisposableStore implements ILink {
	private _viewportRange: IViewportRange;

	hideDecorations: boolean;

	constructor(
		public readonly range: IBufferRange,
		public readonly text: string,
		viewportY: number,
		private readonly _activateCallback: (event: MouseEvent, uri: string) => void,
		private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => boolean | void,
		private readonly _shouldHideDecorations: boolean = false,
	) {
		super();
		this.hideDecorations = this._shouldHideDecorations;
		this._viewportRange = convertBufferRangeToViewport(range, viewportY);
	}

	activate(event: MouseEvent, text: string): void {
		this._activateCallback(event, text);
	}

	hover(event: MouseEvent, text: string): void {
		// Listen for modifier before handing it off to the hover to handle so it gets disposed correctly
		if (this._shouldHideDecorations) {
			this.add(dom.addDisposableListener(document, 'keydown', e => {
				// TODO: Use ctrl/option or cmd
				if (e.ctrlKey && this._shouldHideDecorations) {
					this.hideDecorations = false;
				}
			}));
			this.add(dom.addDisposableListener(document, 'keyup', e => {
				if (!e.ctrlKey) {
					this.hideDecorations = true;
				}
			}));
		}

		const scheduler = new RunOnceScheduler(() => {
			this._tooltipCallback(
				event,
				text,
				this._viewportRange,
				this._shouldHideDecorations ? () => this.hideDecorations = false : undefined,
				this._shouldHideDecorations ? () => this.hideDecorations = true : undefined
			);
			this.dispose();
			// TODO: Use editor.hover.delay instead
		}, TOOLTIP_HOVER_THRESHOLD);
		this.add(scheduler);
		scheduler.schedule();

		const origin = { x: event.pageX, y: event.pageY };
		this.add(dom.addDisposableListener(document, dom.EventType.MOUSE_MOVE, e => {
			// Update decorations
			if (this._shouldHideDecorations) {
				this.hideDecorations = !e.ctrlKey;
			}

			// Reset the scheduler if the mouse moves too much
			if (Math.abs(e.pageX - origin.x) > window.devicePixelRatio * 2 || Math.abs(e.pageY - origin.y) > window.devicePixelRatio * 2) {
				origin.x = e.pageX;
				origin.y = e.pageY;
				scheduler.schedule();
			}
		}));
	}

	leave(): void {
		this.dispose();
	}
}
