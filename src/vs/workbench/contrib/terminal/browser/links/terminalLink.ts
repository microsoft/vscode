/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBufferRange, ILink, ILinkDecorations, Terminal } from 'xterm';
import { DisposableStore } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { RunOnceScheduler } from 'vs/base/common/async';
import { convertBufferRangeToViewport } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { isMacintosh } from 'vs/base/common/platform';
import { Emitter, Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { ILinkHoverTargetOptions, TerminalHover } from 'vs/workbench/contrib/terminal/browser/widgets/terminalHoverWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';

export abstract class TerminalLink extends DisposableStore implements ILink {
	decorations: ILinkDecorations;

	private _tooltipScheduler: RunOnceScheduler | undefined;
	private _hoverListeners: DisposableStore | undefined;

	private readonly _onInvalidated = new Emitter<void>();
	get onInvalidated(): Event<void> { return this._onInvalidated.event; }

	protected get _xterm(): Terminal {
		return (this._terminal as any).xterm.raw as Terminal;
	}
	protected get _widgetManager(): TerminalWidgetManager | undefined {
		return (this._terminal as any)._widgetManager;
	}

	constructor(
		protected readonly _terminal: ITerminalInstance,
		readonly range: IBufferRange,
		readonly text: string,
		protected readonly _viewportY: number,
		protected readonly _isHighConfidenceLink: boolean,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService
	) {
		super();
		this.decorations = {
			pointerCursor: false,
			underline: this._isHighConfidenceLink
		};
	}

	override dispose(): void {
		super.dispose();
		this._hoverListeners?.dispose();
		this._hoverListeners = undefined;
		this._tooltipScheduler?.dispose();
		this._tooltipScheduler = undefined;
	}

	/**
	 * Action executed on activation.
	 * @param source Allow distinguishing activation source.
	 * @param payload Optional payload passed from activation source,
	 * usually clicked text or link URL that caused activation.
	 */
	abstract action(source: 'terminal' | 'hover', payload?: any): void;

	/**
	 * Calls when the link is activated from terminal.
	 * @param event The mouse event triggering the callback.
	 * @param text The text of the link.
	 */
	activate(event: MouseEvent, text: string): void {
		if (event) {
			event.preventDefault();
			if (!this._isModifierDown(event)) {
				return;
			}
		}
		this.action('terminal', text);
	}

	showTooltip() {
		if (!this._widgetManager) {
			return;
		}
		const hoverText = this._getHoverText();
		if (!hoverText) {
			return;
		}

		const core = (this._xterm as any)._core as IXtermCore;
		const cellDimensions = {
			width: core._renderService.dimensions.actualCellWidth,
			height: core._renderService.dimensions.actualCellHeight
		};
		const terminalDimensions = {
			width: this._terminal.cols,
			height: this._terminal.rows,
		};
		const targetOptions: ILinkHoverTargetOptions = {
			viewportRange: convertBufferRangeToViewport(this.range, this._viewportY),
			cellDimensions,
			terminalDimensions,
			modifierDownCallback: this._isHighConfidenceLink ? () => this._enableDecorations() : undefined,
			modifierUpCallback: this._isHighConfidenceLink ? () => this._disableDecorations() : undefined,
		};

		const widget = this._instantiationService.createInstance(TerminalHover,
			targetOptions,
			hoverText,
			(url: string) => {
				this.action('hover', url);
			}
		);
		const attached = this._widgetManager.attachWidget(widget);
		if (attached) {
			this.onInvalidated(() => attached.dispose());
		}
	}

	/**
	 * Returns hover text to be displayed upon hovering over the link.
	 * For default `showTooltip` impl., any link in this Markdown string
	 * will cause default link terminal activation, passing clicked link
	 * URL as payload to `action`. If null, no hover for default is provided.
	 */
	protected _getHoverText(): IMarkdownString | null {
		return null;
	}

	hover(event: MouseEvent, text: string): void {
		// Listen for modifier before handing it off to the hover to handle so it gets disposed correctly
		this._hoverListeners = new DisposableStore();
		this._hoverListeners.add(dom.addDisposableListener(document, 'keydown', e => {
			if (!e.repeat && this._isModifierDown(e)) {
				this._enableDecorations();
			}
		}));
		this._hoverListeners.add(dom.addDisposableListener(document, 'keyup', e => {
			if (!e.repeat && !this._isModifierDown(e)) {
				this._disableDecorations();
			}
		}));

		// Listen for when the terminal renders on the same line as the link
		this._hoverListeners.add(this._xterm.onRender(e => {
			const viewportRangeY = this.range.start.y - this._viewportY;
			if (viewportRangeY >= e.start && viewportRangeY <= e.end) {
				this._onInvalidated.fire();
			}
		}));

		// Only show the tooltip and highlight for high confidence links (not word/search workspace
		// links). Feedback was that this makes using the terminal overly noisy.
		if (this._isHighConfidenceLink) {
			this._tooltipScheduler = new RunOnceScheduler(() => {
				this.showTooltip();
				// Clear out scheduler until next hover event
				this._tooltipScheduler?.dispose();
				this._tooltipScheduler = undefined;
			}, this._configurationService.getValue('workbench.hover.delay'));
			this.add(this._tooltipScheduler);
			this._tooltipScheduler.schedule();
		}

		const origin = { x: event.pageX, y: event.pageY };
		this._hoverListeners.add(dom.addDisposableListener(document, dom.EventType.MOUSE_MOVE, e => {
			// Update decorations
			if (this._isModifierDown(e)) {
				this._enableDecorations();
			} else {
				this._disableDecorations();
			}

			// Reset the scheduler if the mouse moves too much
			if (Math.abs(e.pageX - origin.x) > window.devicePixelRatio * 2 || Math.abs(e.pageY - origin.y) > window.devicePixelRatio * 2) {
				origin.x = e.pageX;
				origin.y = e.pageY;
				this._tooltipScheduler?.schedule();
			}
		}));
	}

	leave(): void {
		this._hoverListeners?.dispose();
		this._hoverListeners = undefined;
		this._tooltipScheduler?.dispose();
		this._tooltipScheduler = undefined;
	}

	protected _enableDecorations(): void {
		if (!this.decorations.pointerCursor) {
			this.decorations.pointerCursor = true;
		}
		if (!this.decorations.underline) {
			this.decorations.underline = true;
		}
	}

	protected _disableDecorations(): void {
		if (this.decorations.pointerCursor) {
			this.decorations.pointerCursor = false;
		}
		if (this.decorations.underline !== this._isHighConfidenceLink) {
			this.decorations.underline = this._isHighConfidenceLink;
		}
	}

	protected _isModifierDown(event: MouseEvent | KeyboardEvent): boolean {
		const multiCursorModifier = this._configurationService.getValue<'ctrlCmd' | 'alt'>('editor.multiCursorModifier');
		if (multiCursorModifier === 'ctrlCmd') {
			return !!event.altKey;
		}
		return isMacintosh ? event.metaKey : event.ctrlKey;
	}

	protected _getClickLabel(): string {
		const editorConf = this._configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		// TODO: Should localization keys be changed?
		let clickLabel = '';
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			if (isMacintosh) {
				clickLabel = localize('terminalLinkHandler.followLinkAlt.mac', "option + click");
			} else {
				clickLabel = localize('terminalLinkHandler.followLinkAlt', "alt + click");
			}
		} else {
			if (isMacintosh) {
				clickLabel = localize('terminalLinkHandler.followLinkCmd', "cmd + click");
			} else {
				clickLabel = localize('terminalLinkHandler.followLinkCtrl', "ctrl + click");
			}
		}
		return clickLabel;
	}
}
