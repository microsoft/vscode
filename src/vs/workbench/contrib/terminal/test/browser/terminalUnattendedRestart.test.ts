/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Terminal } from '@xterm/xterm';
import { importAMDNodeModule } from '../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ITerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { GeneralShellType, PosixShellType } from '../../../../../platform/terminal/common/terminal.js';
import { ShellIntegrationAddon } from '../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { TestXtermLogger } from '../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { ITerminalInstance } from '../../browser/terminal.js';
import { writeP } from '../../browser/terminalTestHelpers.js';
import { getTerminalInstanceBlocker } from '../../browser/terminalUnattendedRestart.js';

suite('getTerminalInstanceBlocker', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let xterm: Terminal;
	let capabilities: ITerminalCapabilityStore;

	setup(async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
		const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, undefined, new NullLogService()));
		xterm.loadAddon(shellIntegrationAddon);
		capabilities = shellIntegrationAddon.capabilities;
	});

	function blocker(instance: Partial<Pick<ITerminalInstance, 'hasChildProcesses' | 'shellType' | 'capabilities'>> = {}): string | undefined {
		return getTerminalInstanceBlocker({ hasChildProcesses: false, shellType: PosixShellType.Zsh, capabilities, ...instance });
	}

	/**
	 * A shell integration sequence: `osc` is 633 for VS Code's sequences and 133 for FinalTerm's.
	 */
	function sequence(osc: number, data: string): string {
		return `\x1b]${osc};${data}\x07`;
	}

	test('only an interactive shell idle at an empty prompt can be restarted', async () => {
		await writeP(xterm, `${sequence(633, 'A')}$ ${sequence(633, 'B')}`);
		const atIdlePrompt = {
			idleShell: blocker(),
			childProcess: blocker({ hasChildProcesses: true }),
			replAsShell: blocker({ shellType: GeneralShellType.Python }),
			unknownShell: blocker({ shellType: undefined }),
			noShellIntegration: blocker({ capabilities: store.add(new TerminalCapabilityStore()) }),
		};
		await writeP(xterm, '  ');

		assert.deepStrictEqual({ ...atIdlePrompt, typedWhitespace: blocker() }, {
			idleShell: undefined,
			childProcess: 'terminal.runningProcess',
			replAsShell: 'terminal.runningProcess',
			unknownShell: 'terminal.runningProcess',
			noShellIntegration: 'terminal.idleUnknown',
			typedWhitespace: undefined,
		});
	});

	for (const [protocol, osc] of [['VS Code', 633], ['FinalTerm', 133]] as const) {
		test(`blocks while a command is typed or running but not at an idle prompt (${protocol} sequences)`, async () => {
			const blockers: Record<string, string | undefined> = {};
			// Like zsh, report a finished command before the first prompt
			await writeP(xterm, `${sequence(osc, 'D')}${sequence(osc, 'A')}$ `);
			blockers.promptStart = blocker();
			await writeP(xterm, sequence(osc, 'B'));
			blockers.idlePrompt = blocker();
			await writeP(xterm, 'echo hi');
			blockers.typedCommand = blocker();
			await writeP(xterm, `\r\n${sequence(osc, 'C')}hi\r\n`);
			blockers.runningCommand = blocker();
			await writeP(xterm, sequence(osc, 'D;0'));
			blockers.finishedCommand = blocker();
			await writeP(xterm, `${sequence(osc, 'A')}$ ${sequence(osc, 'B')}`);
			blockers.nextIdlePrompt = blocker();

			assert.deepStrictEqual(blockers, {
				promptStart: 'terminal.idleUnknown',
				idlePrompt: undefined,
				typedCommand: 'terminal.pendingInput',
				runningCommand: 'terminal.runningProcess',
				finishedCommand: 'terminal.idleUnknown',
				nextIdlePrompt: undefined,
			});
		});
	}

	test('blocks a command executed before conpty heuristics detected its prompt', async () => {
		// Typed ahead, the command executes before the heuristics finished looking for the prompt,
		// so they place no executed marker
		await writeP(xterm, `${sequence(633, 'P;IsWindows=True')}${sequence(633, 'A')}PS C:\\> ${sequence(633, 'B')}Start-Sleep 600\r\n${sequence(633, 'C')}`);

		assert.strictEqual(blocker({ shellType: GeneralShellType.PowerShell }), 'terminal.runningProcess');
	});
});
