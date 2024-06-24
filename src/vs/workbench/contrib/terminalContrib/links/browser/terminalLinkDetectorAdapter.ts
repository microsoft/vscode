/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalLinkDetector, ITerminalSimpleLink, TerminalBuiltinLinkType, TerminalLinkType } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { TerminalLink } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLink';
import { XtermLinkMatcherHandler } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager';
import type { IBufferLine, ILink, ILinkProvider, IViewportRange } from '@xterm/xterm';

export interface IActivateLinkEvent {
	link: ITerminalSimpleLink;
	event?: MouseEvent;
}

export interface IShowHoverEvent {
	link: TerminalLink;
	viewportRange: IViewportRange;
	modifierDownCallback?: () => void;
	modifierUpCallback?: () => void;
}

/**
 * Wrap a link detector object so it can be used in xterm.js
 */
export class TerminalLinkDetectorAdapter extends Disposable implements ILinkProvider {
	private _activeLinks: TerminalLink[] | undefined;

	private readonly _onDidActivateLink = this._register(new Emitter<IActivateLinkEvent>());
	readonly onDidActivateLink = this._onDidActivateLink.event;
	private readonly _onDidShowHover = this._register(new Emitter<IShowHoverEvent>());
	readonly onDidShowHover = this._onDidShowHover.event;

	constructor(
		private readonly _detector: ITerminalLinkDetector,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	private _activeProvideLinkRequests: Map<number, Promise<TerminalLink[]>> = new Map();
	async provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void) {
		let activeRequest = this._activeProvideLinkRequests.get(bufferLineNumber);
		if (activeRequest) {
			await activeRequest;
			callback(this._activeLinks);
			return;
		}
		if (this._activeLinks) {
			for (const link of this._activeLinks) {
				link.dispose();
			}
		}
		activeRequest = this._provideLinks(bufferLineNumber);
		this._activeProvideLinkRequests.set(bufferLineNumber, activeRequest);
		this._activeLinks = await activeRequest;
		this._activeProvideLinkRequests.delete(bufferLineNumber);
		callback(this._activeLinks);
	}

	private async _provideLinks(bufferLineNumber: number): Promise<TerminalLink[]> {
		// Dispose of all old links if new links are provided, links are only cached for the current line
		const links: TerminalLink[] = [];

		let startLine = bufferLineNumber - 1;
		let endLine = startLine;

		const lines: IBufferLine[] = [
			this._detector.xterm.buffer.active.getLine(startLine)!
		];

		// Cap the maximum context on either side of the line being provided, by taking the context
		// around the line being provided for this ensures the line the pointer is on will have
		// links provided.
		const maxLineContext = Math.max(this._detector.maxLinkLength, this._detector.xterm.cols);
		const minStartLine = Math.max(startLine - maxLineContext, 0);
		const maxEndLine = Math.min(endLine + maxLineContext, this._detector.xterm.buffer.active.length);

		while (startLine >= minStartLine && this._detector.xterm.buffer.active.getLine(startLine)?.isWrapped) {
			lines.unshift(this._detector.xterm.buffer.active.getLine(startLine - 1)!);
			startLine--;
		}

		while (endLine < maxEndLine && this._detector.xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
			lines.push(this._detector.xterm.buffer.active.getLine(endLine + 1)!);
			endLine++;
		}

		const detectedLinks = await this._detector.detect(lines, startLine, endLine);
		for (const link of detectedLinks) {
			links.push(this._createTerminalLink(link, async (event) => this._onDidActivateLink.fire({ link, event })));
		}

		return links;
	}

	private _createTerminalLink(l: ITerminalSimpleLink, activateCallback: XtermLinkMatcherHandler): TerminalLink {
		// Remove trailing colon if there is one so the link is more useful
		if (!l.disableTrimColon && l.text.length > 0 && l.text.charAt(l.text.length - 1) === ':') {
			l.text = l.text.slice(0, -1);
			l.bufferRange.end.x--;
		}
		return this._instantiationService.createInstance(TerminalLink,
			this._detector.xterm,
			l.bufferRange,
			l.text,
			l.uri,
			l.parsedLink,
			l.actions,
			this._detector.xterm.buffer.active.viewportY,
			activateCallback,
			(link, viewportRange, modifierDownCallback, modifierUpCallback) => this._onDidShowHover.fire({
				link,
				viewportRange,
				modifierDownCallback,
				modifierUpCallback
			}),
			l.type !== TerminalBuiltinLinkType.Search, // Only search is low confidence
			l.label || this._getLabel(l.type),
			l.type
		);
	}

	private _getLabel(type: TerminalLinkType): string {
		switch (type) {
			case TerminalBuiltinLinkType.Search: return localize('searchWorkspace', 'Search workspace');
			case TerminalBuiltinLinkType.LocalFile: return localize('openFile', 'Open file in editor');
			case TerminalBuiltinLinkType.LocalFolderInWorkspace: return localize('focusFolder', 'Focus folder in explorer');
			case TerminalBuiltinLinkType.LocalFolderOutsideWorkspace: return localize('openFolder', 'Open folder in new window');
			case TerminalBuiltinLinkType.Url:
			default:
				return localize('followLink', 'Follow link');
		}
	}
}
