/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, ILinkProvider, IViewportRange, IBufferCellPosition, ILink } from 'xterm';
import { convertBufferRangeToViewport, TOOLTIP_HOVER_THRESHOLD } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';

export class TerminalWordLinkProvider implements ILinkProvider {
	constructor(
		private readonly _xterm: Terminal,
		private readonly _activateCallback: (event: MouseEvent, uri: string) => void,
		private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange, modifierDownCallback: () => void, modifierUpCallback: () => void) => boolean | void,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
	}

	public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
		const start: IBufferCellPosition = { x: position.x, y: position.y };
		const end: IBufferCellPosition = { x: position.x, y: position.y };

		// TODO: Support wrapping

		// Expand to the left until a word separator is hit
		const line = this._xterm.buffer.active.getLine(position.y - 1)!;
		let text = '';
		start.x++; // The hovered cell is considered first
		for (let x = position.x; x > 0; x--) {
			const char = line.getCell(x - 1)?.getChars();
			if (!char) {
				break;
			}
			const config = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
			if (config.wordSeparators.indexOf(char) >= 0) {
				break;
			}
			start.x--;
			text = char + text;
		}

		// No links were found (the hovered cell is whitespace)
		if (text.length === 0) {
			callback(undefined);
			return;
		}

		// Expand to the right until a word separator is hit
		// end.x++; // The hovered cell is considered first
		for (let x = position.x + 1; x <= line.length; x++) {
			const char = line.getCell(x - 1)?.getChars();
			if (!char) {
				break;
			}
			const config = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
			if (config.wordSeparators.indexOf(char) >= 0) {
				break;
			}
			end.x++;
			text += char;
		}

		const range = { start, end };
		let timeout: number | undefined;
		let documentMouseOutListener: IDisposable | undefined;
		const clearTimer = () => {
			if (timeout !== undefined) {
				window.clearTimeout(timeout);
			}
			documentMouseOutListener?.dispose();
		};

		// TODO: This could be handled better my sharing tooltip hover state between link providers
		// Listen for modifier before handing it off to the hover to handle so it gets disposed correctly
		const disposables: IDisposable[] = [
			dom.addDisposableListener(document, 'keydown', e => {
				if (e.ctrlKey && link.hideDecorations) {
					link.hideDecorations = false;
				}
			}),
			dom.addDisposableListener(document, 'keyup', e => {
				if (!e.ctrlKey) {
					link.hideDecorations = true;
				}
			})
		];
		const link: ILink = {
			text,
			range,
			hideDecorations: true,
			activate: (event: MouseEvent, text: string) => this._activateCallback(event, text),
			hover: (event: MouseEvent, text: string) => {
				documentMouseOutListener = dom.addDisposableListener(document, dom.EventType.MOUSE_OVER, () => clearTimer());
				timeout = window.setTimeout(() => {
					this._tooltipCallback(
						event,
						text,
						convertBufferRangeToViewport(range, this._xterm.buffer.active.viewportY),
						() => {
							console.log('down');
							link.hideDecorations = false;
						},
						() => {
							console.log('up');
							link.hideDecorations = true;
						}
					);
					dispose(disposables);
					clearTimer();
				}, TOOLTIP_HOVER_THRESHOLD);
			},
			leave: () => {
				dispose(disposables);
				clearTimer();
			}
		};

		callback(link);
	}
}
