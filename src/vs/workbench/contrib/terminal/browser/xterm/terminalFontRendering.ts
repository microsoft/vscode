/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { isMacintosh } from '../../../../../base/common/platform.js';
import type { ITerminalConfiguration } from '../../common/terminal.js';
import './terminalFontRendering.css';

const enum CssClasses {
	Grayscale = 'terminal-font-rendering-grayscale'
}

export function updateTerminalFontRendering(terminal: Terminal, fontRendering: ITerminalConfiguration['fontRendering']): void {
	const element = terminal.element;
	if (!element) {
		return;
	}

	const grayscale = isMacintosh && fontRendering === 'grayscale';
	if (element.classList.contains(CssClasses.Grayscale) === grayscale) {
		return;
	}
	element.classList.toggle(CssClasses.Grayscale, grayscale);

	// This clears glyph bitmaps, but xterm's cached Canvas2D font state can still retain the previous policy.
	terminal.clearTextureAtlas();
}
