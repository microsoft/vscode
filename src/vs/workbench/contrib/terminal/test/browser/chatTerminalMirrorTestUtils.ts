/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { Event } from '../../../../../base/common/event.js';
import type { ITerminalFont } from '../../common/terminal.js';
import type { IDetachedTerminalInstance, IDetachedXTermOptions } from '../../browser/terminal.js';

/**
 * Creates a fake detached terminal instance backed by a real raw xterm.js terminal so mirror
 * tests can inspect the resulting buffer and count resize/write calls. The fixed font metrics
 * (charWidth 10, letterSpacing 0) make width-to-cols math deterministic on any machine; pass
 * a custom font to model renderer metrics that differ from the configuration estimate.
 */
export function createFakeDetachedTerminal(RawCtor: typeof Terminal, options: IDetachedXTermOptions, font: ITerminalFont = { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 10, charHeight: 14 }) {
	const raw = new RawCtor({ cols: options.cols, rows: options.rows });
	const counters = { resizeCalls: 0, writeCalls: 0 };
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	const instance = {
		xterm: {
			raw,
			get cols() { return raw.cols; },
			get rows() { return raw.rows; },
			get buffer() { return raw.buffer; },
			getFont: () => font,
			write: (data: string, callback?: () => void) => {
				counters.writeCalls++;
				raw.write(data, callback);
			},
			resize: (columns: number, rows: number) => {
				counters.resizeCalls++;
				raw.resize(columns, rows);
			}
		},
		onData: Event.None,
		attachToElement: () => { },
		dispose: () => raw.dispose()
	} as unknown as IDetachedTerminalInstance;
	return { raw, counters, instance };
}
