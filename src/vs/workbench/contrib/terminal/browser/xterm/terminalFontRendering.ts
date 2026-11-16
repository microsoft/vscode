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

const leadingCssWhitespace = /^[ \t\r\n\f]+/;
const patchedCanvasRealms = new WeakSet<Window>();
let needsCanvasFontTrim: boolean | undefined;

/**
 * TODO(deepak1556): Remove once runtime fix is in place.
 */
export function ensureCanvasFontLeadingWhitespaceFix(targetWindow: Window): void {
	if (needsCanvasFontTrim === undefined) {
		const ctx = targetWindow.document.createElement('canvas').getContext('2d');
		if (ctx) {
			ctx.font = ' 24px monospace';
			needsCanvasFontTrim = ctx.font === '10px sans-serif';
		} else {
			needsCanvasFontTrim = false;
		}
	}
	if (!needsCanvasFontTrim || patchedCanvasRealms.has(targetWindow)) {
		return;
	}
	patchedCanvasRealms.add(targetWindow);

	const windowWithCtors = targetWindow as Window & typeof globalThis;
	for (const ctor of [windowWithCtors.CanvasRenderingContext2D, windowWithCtors.OffscreenCanvasRenderingContext2D]) {
		const proto = ctor?.prototype;
		const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'font');
		if (!descriptor?.set) {
			continue;
		}
		const originalSet = descriptor.set;
		Object.defineProperty(proto, 'font', {
			...descriptor,
			set(value: string) {
				if (typeof value === 'string' && value.length > 0) {
					const firstChar = value.charCodeAt(0);
					if (firstChar === 32 /* ' ' */ || firstChar === 9 /* '\t' */ || firstChar === 10 /* '\n' */ || firstChar === 12 /* '\f' */ || firstChar === 13 /* '\r' */) {
						value = value.replace(leadingCssWhitespace, '');
					}
				}
				originalSet.call(this, value);
			}
		});
	}
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
