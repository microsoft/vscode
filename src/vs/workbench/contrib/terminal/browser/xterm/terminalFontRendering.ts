/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { isMacintosh } from '../../../../../base/common/platform.js';
import type { ITerminalConfiguration } from '../../common/terminal.js';
import './terminalFontRendering.css';

const enum CssClasses {
	Crisp = 'terminal-font-rendering-crisp'
}

export function updateTerminalFontRendering(terminal: Terminal, fontRendering: ITerminalConfiguration['fontRendering']): void {
	const element = terminal.element;
	if (!element) {
		return;
	}

	const crisp = isMacintosh && fontRendering === 'crisp';
	if (element.classList.contains(CssClasses.Crisp) === crisp) {
		return;
	}
	element.classList.toggle(CssClasses.Crisp, crisp);

	// The atlas canvas inherits this policy, but cached glyphs retain their previous pixels.
	terminal.clearTextureAtlas();
}
