/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewportRange, IBufferRange, ILink } from 'xterm';
import { DisposableStore } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { RunOnceScheduler } from 'vs/base/common/async';
import { convertBufferRangeToViewport } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isMacintosh } from 'vs/base/common/platform';

export class TerminalLink extends DisposableStore implements ILink {
	hideDecorations: boolean;

	constructor(
		public readonly range: IBufferRange,
		public readonly text: string,
		private readonly _viewportY: number,
		private readonly _activateCallback: (event: MouseEvent, uri: string) => void,
		private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => boolean | void,
		private readonly _shouldHideDecorations: boolean = false,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this.hideDecorations = this._shouldHideDecorations;
	}

	activate(event: MouseEvent, text: string): void {
		this._activateCallback(event, text);
	}

	hover(event: MouseEvent, text: string): void {
		// Listen for modifier before handing it off to the hover to handle so it gets disposed correctly
		if (this._shouldHideDecorations) {
			this.add(dom.addDisposableListener(document, 'keydown', e => {
				if (this._isModifierDown(e) && this.hideDecorations) {
					this.hideDecorations = false;
				}
			}));
			this.add(dom.addDisposableListener(document, 'keyup', e => {
				if (!this._isModifierDown(e)) {
					this.hideDecorations = true;
				}
			}));
		}

		const timeout = this._configurationService.getValue<number>('editor.hover.delay');
		const scheduler = new RunOnceScheduler(() => {
			this._tooltipCallback(
				event,
				text,
				convertBufferRangeToViewport(this.range, this._viewportY),
				this._shouldHideDecorations ? () => this.hideDecorations = false : undefined,
				this._shouldHideDecorations ? () => this.hideDecorations = true : undefined
			);
			this.dispose();
		}, timeout);
		this.add(scheduler);
		scheduler.schedule();

		const origin = { x: event.pageX, y: event.pageY };
		this.add(dom.addDisposableListener(document, dom.EventType.MOUSE_MOVE, e => {
			// Update decorations
			if (this._shouldHideDecorations) {
				this.hideDecorations = !this._isModifierDown(e);
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

	private _isModifierDown(event: MouseEvent | KeyboardEvent): boolean {
		const multiCursorModifier = this._configurationService.getValue<'ctrlCmd' | 'alt'>('editor.multiCursorModifier');
		if (multiCursorModifier === 'ctrlCmd') {
			return !!event.altKey;
		}
		return isMacintosh ? event.metaKey : event.ctrlKey;
	}
}
