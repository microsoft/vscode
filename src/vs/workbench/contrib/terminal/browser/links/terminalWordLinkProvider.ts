/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, ILinkProvider, IViewportRange, IBufferCellPosition, ILink } from 'xterm';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';

export class TerminalWordLinkProvider implements ILinkProvider {
	constructor(
		private readonly _xterm: Terminal,
		private readonly _activateCallback: (event: MouseEvent | undefined, uri: string) => void,
		private readonly _tooltipCallback: (link: TerminalLink, viewportRange: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => void,
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

		callback(new TerminalLink({ start, end }, text, this._xterm.buffer.active.viewportY, this._activateCallback, this._tooltipCallback, false, undefined, this._configurationService));
	}
}
