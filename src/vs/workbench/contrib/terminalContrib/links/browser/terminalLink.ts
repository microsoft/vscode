/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IViewportRange, IBufferRange, ILink, ILinkDecorations, Terminal } from '@xterm/xterm';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import * as dom from '../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { convertBufferRangeToViewport } from './terminalLinkHelpers.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalLinkType } from './links.js';
import type { URI } from '../../../../../base/common/uri.js';
import type { IParsedLink } from './terminalLinkParsing.js';
import type { IHoverAction } from '../../../../../base/browser/ui/hover/hover.js';

export class TerminalLink extends Disposable implements ILink {
	decorations: ILinkDecorations;

	private readonly _tooltipScheduler: MutableDisposable<RunOnceScheduler> = this._register(new MutableDisposable());
	private readonly _hoverListeners = this._register(new MutableDisposable());

	private readonly _onInvalidated = new Emitter<void>();
	get onInvalidated(): Event<void> { return this._onInvalidated.event; }

	get type(): TerminalLinkType { return this._type; }

	constructor(
		private readonly _xterm: Terminal,
		readonly range: IBufferRange,
		readonly text: string,
		readonly uri: URI | undefined,
		readonly parsedLink: IParsedLink | undefined,
		readonly actions: IHoverAction[] | undefined,
		private readonly _viewportY: number,
		private readonly _activateCallback: (event: MouseEvent | undefined, uri: string) => Promise<void>,
		private readonly _tooltipCallback: (link: TerminalLink, viewportRange: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => void,
		private readonly _isHighConfidenceLink: boolean,
		readonly label: string | undefined,
		private readonly _type: TerminalLinkType,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this.decorations = {
			pointerCursor: false,
			underline: this._isHighConfidenceLink
		};
	}

	activate(event: MouseEvent | undefined, text: string): void {
		this._activateCallback(event, text);
	}

	hover(event: MouseEvent, text: string): void {
		const w = dom.getWindow(event);
		const d = w.document;
		// Listen for modifier before handing it off to the hover to handle so it gets disposed correctly
		const hoverListeners = this._hoverListeners.value = new DisposableStore();
		hoverListeners.add(dom.addDisposableListener(d, 'keydown', e => {
			if (!e.repeat && this._isModifierDown(e)) {
				this._enableDecorations();
			}
		}));
		hoverListeners.add(dom.addDisposableListener(d, 'keyup', e => {
			if (!e.repeat && !this._isModifierDown(e)) {
				this._disableDecorations();
			}
		}));

		// Listen for when the terminal renders on the same line as the link
		hoverListeners.add(this._xterm.onRender(e => {
			const viewportRangeY = this.range.start.y - this._viewportY;
			if (viewportRangeY >= e.start && viewportRangeY <= e.end) {
				this._onInvalidated.fire();
			}
		}));

		// Only show the tooltip and highlight for high confidence links (not word/search workspace
		// links). Feedback was that this makes using the terminal overly noisy.
		if (this._isHighConfidenceLink) {
			this._tooltipScheduler.value = new RunOnceScheduler(() => {
				this._tooltipCallback(
					this,
					convertBufferRangeToViewport(this.range, this._viewportY),
					this._isHighConfidenceLink ? () => this._enableDecorations() : undefined,
					this._isHighConfidenceLink ? () => this._disableDecorations() : undefined
				);
				// Clear out scheduler until next hover event
				this._tooltipScheduler.clear();
			}, this._configurationService.getValue('workbench.hover.delay'));
			this._tooltipScheduler.value.schedule();
		}

		const origin = { x: event.pageX, y: event.pageY };
		hoverListeners.add(dom.addDisposableListener(d, dom.EventType.MOUSE_MOVE, e => {
			// Update decorations
			if (this._isModifierDown(e)) {
				this._enableDecorations();
			} else {
				this._disableDecorations();
			}

			// Reset the scheduler if the mouse moves too much
			if (Math.abs(e.pageX - origin.x) > w.devicePixelRatio * 2 || Math.abs(e.pageY - origin.y) > w.devicePixelRatio * 2) {
				origin.x = e.pageX;
				origin.y = e.pageY;
				this._tooltipScheduler.value?.schedule();
			}
		}));
	}

	leave(): void {
		this._hoverListeners.clear();
		this._tooltipScheduler.clear();
	}

	private _enableDecorations(): void {
		if (!this.decorations.pointerCursor) {
			this.decorations.pointerCursor = true;
		}
		if (!this.decorations.underline) {
			this.decorations.underline = true;
		}
	}

	private _disableDecorations(): void {
		if (this.decorations.pointerCursor) {
			this.decorations.pointerCursor = false;
		}
		if (this.decorations.underline !== this._isHighConfidenceLink) {
			this.decorations.underline = this._isHighConfidenceLink;
		}
	}

	private _isModifierDown(event: MouseEvent | KeyboardEvent): boolean {
		const multiCursorModifier = this._configurationService.getValue<'ctrlCmd' | 'alt'>('editor.multiCursorModifier');
		if (multiCursorModifier === 'ctrlCmd') {
			return !!event.altKey;
		}
		return isMacintosh ? event.metaKey : event.ctrlKey;
	}
}
