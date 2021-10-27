/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal } from 'xterm';
import { LineDataEventAddon } from 'vs/workbench/contrib/terminal/browser/addons/lineDataEventAddon';
import { deepStrictEqual } from 'assert';

async function writeP(terminal: Terminal, data: string): Promise<void> {
	return new Promise<void>(r => terminal.write(data, r));
}

suite.only('XtermExtensions', () => {
	let xterm: Terminal;
	let lineDataEventAddon: LineDataEventAddon;

	suite('onLineData', () => {
		let events: string[];

		setup(() => {
			xterm = new Terminal({
				cols: 4
			});
			lineDataEventAddon = new LineDataEventAddon();
			xterm.loadAddon(lineDataEventAddon);

			events = [];
			lineDataEventAddon.onLineData(e => events.push(e));
		});

		test('should fire when a non-wrapped line ends with a \\n', async () => {
			await writeP(xterm, 'foo');
			deepStrictEqual(events, []);
			await writeP(xterm, '\n\r');
			deepStrictEqual(events, ['foo']);
			await writeP(xterm, 'bar');
			deepStrictEqual(events, ['foo']);
			await writeP(xterm, '\n');
			deepStrictEqual(events, ['foo', 'bar']);
		});

		test('should not fire soft wrapped lines', async () => {
			await writeP(xterm, 'foo.');
			deepStrictEqual(events, []);
			await writeP(xterm, 'bar.');
			deepStrictEqual(events, []);
			await writeP(xterm, 'baz.');
			deepStrictEqual(events, []);
		});

		test('should fire when a wrapped line ends with a \\n', async () => {
			await writeP(xterm, 'foo.bar.baz.');
			deepStrictEqual(events, []);
			await writeP(xterm, '\n\r');
			deepStrictEqual(events, ['foo.bar.baz.']);
		});
	});
});
