/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker, Terminal } from '@xterm/xterm';
import { deepStrictEqual } from 'assert';
import { importAMDNodeModule } from 'vs/amdX';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { PartialCommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/partialCommandDetectionCapability';
import { writeP } from 'vs/workbench/contrib/terminal/browser/terminalTestHelpers';

suite('PartialCommandDetectionCapability', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let xterm: Terminal;
	let capability: PartialCommandDetectionCapability;
	let addEvents: IMarker[];

	function assertCommands(expectedLines: number[]) {
		deepStrictEqual(capability.commands.map(e => e.line), expectedLines);
		deepStrictEqual(addEvents.map(e => e.line), expectedLines);
	}

	setup(async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;

		xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80 }) as Terminal);
		capability = store.add(new PartialCommandDetectionCapability(xterm));
		addEvents = [];
		store.add(capability.onCommandFinished(e => addEvents.push(e)));
	});

	test('should not add commands when the cursor position is too close to the left side', async () => {
		assertCommands([]);
		xterm.input('\x0d');
		await writeP(xterm, '\r\n');
		assertCommands([]);
		await writeP(xterm, 'a');
		xterm.input('\x0d');
		await writeP(xterm, '\r\n');
		assertCommands([]);
	});

	test('should add commands when the cursor position is not too close to the left side', async () => {
		assertCommands([]);
		await writeP(xterm, 'ab');
		xterm.input('\x0d');
		await writeP(xterm, '\r\n\r\n');
		assertCommands([0]);
		await writeP(xterm, 'cd');
		xterm.input('\x0d');
		await writeP(xterm, '\r\n');
		assertCommands([0, 2]);
	});
});
