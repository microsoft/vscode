/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { deepStrictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { writeP } from '../../../../terminal/browser/terminalTestHelpers.js';
import { getStickyScrollLayout } from '../../browser/terminalStickyScrollOverlay.js';

suite('TerminalStickyScrollOverlay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('getStickyScrollLayout', () => {
		test('should show the prompt and the command line when they fit', () => {
			deepStrictEqual(getStickyScrollLayout(10, 2, 1, 5, 0), { lineStart: 9, lineCount: 2, isTruncated: false });
		});

		test('should truncate the command line when it does not fit', () => {
			deepStrictEqual(getStickyScrollLayout(10, 1, 8, 5, 0), { lineStart: 10, lineCount: 5, isTruncated: true });
		});

		test('should drop the prompt when the prompt and the command line do not fit', () => {
			deepStrictEqual(getStickyScrollLayout(10, 6, 1, 5, 0), { lineStart: 10, lineCount: 1, isTruncated: false });
		});

		test('should prefer the command line rows over the prompt rows', () => {
			deepStrictEqual(getStickyScrollLayout(10, 2, 5, 5, 0), { lineStart: 10, lineCount: 5, isTruncated: false });
		});

		test('should clip rows from the top of the overlay for the row offset', () => {
			deepStrictEqual(getStickyScrollLayout(10, 3, 1, 5, 1), { lineStart: 8, lineCount: 2, isTruncated: true });
		});

		test('should show nothing when the row offset clips all rows', () => {
			deepStrictEqual(getStickyScrollLayout(10, 6, 1, 5, 1), { lineStart: 10, lineCount: 0, isTruncated: true });
		});
	});

	suite('command detection', () => {
		let xterm: Terminal;
		let capability: CommandDetectionCapability;

		setup(async () => {
			const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
			xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
			const instantiationService = workbenchInstantiationService(undefined, store);
			capability = store.add(instantiationService.createInstance(CommandDetectionCapability, xterm));
		});

		test('should show the command line when output is printed after the previous command finished', async () => {
			// A command finishes and more output is printed before the prompt is drawn. The prompt
			// start is reported at the previous command's end, so that output is treated as part
			// of the prompt of the following command.
			capability.handlePromptStart();
			await writeP(xterm, '\r$ ');
			capability.handleCommandStart();
			await writeP(xterm, 'npm install');
			capability.handleCommandExecuted();
			await writeP(xterm, '\r\nadded 100 packages\r\n');
			capability.handleCommandFinished(0);
			await writeP(xterm, 'output printed after the command finished\r\n'.repeat(5));

			capability.handlePromptStart();
			await writeP(xterm, '$ ');
			capability.handleCommandStart();
			await writeP(xterm, './scripts/code.sh');
			capability.handleCommandExecuted();

			const command = capability.currentCommand!;
			const commandStartLine = command.commandStartMarker!.line;
			const promptRowCount = command.getPromptRowCount();
			deepStrictEqual(
				{ promptRowCount, ...getStickyScrollLayout(commandStartLine, promptRowCount, command.getCommandRowCount(), 5, 0) },
				{ promptRowCount: 6, lineStart: commandStartLine, lineCount: 1, isTruncated: false }
			);
		});
	});
});
