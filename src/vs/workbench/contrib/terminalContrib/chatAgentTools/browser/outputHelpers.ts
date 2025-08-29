/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

export function getOutput(instance: ITerminalInstance, startMarker?: IXtermMarker): string {
	if (!instance.xterm || !instance.xterm.raw) {
		return '';
	}
	const lines: string[] = [];
	for (let y = Math.max(startMarker?.line ?? 0, 0); y < instance.xterm!.raw.buffer.active.length; y++) {
		const line = instance.xterm!.raw.buffer.active.getLine(y);
		if (!line) {
			continue;
		}
		lines.push(line.translateToString(true));
	}
	return lines.join('\n');
}
