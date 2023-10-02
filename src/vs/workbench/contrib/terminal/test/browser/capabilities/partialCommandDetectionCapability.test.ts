/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { PartialCommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/partialCommandDetectionCapability';
import type { IMarker, Terminal } from 'xterm';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { importAMDNodeModule } from 'vs/amdX';
import { writeP } from 'vs/workbench/contrib/terminal/browser/terminalTestHelpers';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

interface TestTerminal extends Terminal {
	_core: IXtermCore;
}

suite('PartialCommandDetectionCapability', () => {
	let xterm: TestTerminal;
	let capability: PartialCommandDetectionCapability;
	let addEvents: IMarker[];

	function assertCommands(expectedLines: number[]) {
		deepStrictEqual(capability.commands.map(e => e.line), expectedLines);
		deepStrictEqual(addEvents.map(e => e.line), expectedLines);
	}

	setup(async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('xterm')>('xterm', 'lib/xterm.js')).Terminal;

		xterm = new TerminalCtor({ allowProposedApi: true, cols: 80 }) as TestTerminal;
		capability = new PartialCommandDetectionCapability(xterm);
		addEvents = [];
		capability.onCommandFinished(e => addEvents.push(e));
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should not add commands when the cursor position is too close to the left side', async () => {
		assertCommands([]);
		xterm._core._onData.fire('\x0d');
		await writeP(xterm, '\r\n');
		assertCommands([]);
		await writeP(xterm, 'a');
		xterm._core._onData.fire('\x0d');
		await writeP(xterm, '\r\n');
		assertCommands([]);
	});

	test('should add commands when the cursor position is not too close to the left side', async () => {
		assertCommands([]);
		await writeP(xterm, 'ab');
		xterm._core._onData.fire('\x0d');
		await writeP(xterm, '\r\n\r\n');
		assertCommands([0]);
		await writeP(xterm, 'cd');
		xterm._core._onData.fire('\x0d');
		await writeP(xterm, '\r\n');
		assertCommands([0, 2]);
	});
});
