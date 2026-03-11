/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { tmpdir } from 'os';
import * as path from '../../../../base/common/path.js';
import * as fs from 'fs';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITerminalProcessOptions, ITerminalLaunchError } from '../../common/terminal.js';
import { TerminalProcess } from '../../node/terminalProcess.js';
import { isWindows } from '../../../../base/common/platform.js';

const processOptions: ITerminalProcessOptions = {
	shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' },
	windowsUseConptyDll: false,
	environmentVariableCollections: undefined,
	workspaceFolder: undefined,
	isScreenReaderOptimized: false
};

/**
 * Build a multiline shell command that writes its content to a file.
 * The command writes numbered lines to a temp file so we can verify
 * the entire payload was received intact by the shell.
 */
function buildMultilineCommand(lineCount: number, outputFile: string): { command: string; expectedLines: string[] } {
	const lines: string[] = [];
	for (let i = 1; i <= lineCount; i++) {
		// Pad line number, add filler to make each line ~55 chars
		const line = `L${String(i).padStart(2, '0')} ${'a'.repeat(51)}`;
		lines.push(line);
	}
	// Use cat heredoc to write content to a file — this exercises multiline PTY input
	const command = `cat > ${outputFile} << 'TESTEOF'\n${lines.join('\n')}\nTESTEOF\n`;
	return { command, expectedLines: lines };
}

// These tests spawn real PTY processes and are macOS/Linux only
(isWindows ? suite.skip : suite)('TerminalProcess - multiline write', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let outputDir: string;

	setup(() => {
		outputDir = fs.mkdtempSync(path.join(tmpdir(), 'vscode-pty-test-'));
	});

	teardown(() => {
		fs.rmSync(outputDir, { recursive: true, force: true });
	});

	async function runMultilineTest(lineCount: number): Promise<void> {
		const outputFile = path.join(outputDir, `output-${lineCount}.txt`);
		const { command, expectedLines } = buildMultilineCommand(lineCount, outputFile);

		const terminalProcess = store.add(new TerminalProcess(
			{ executable: '/bin/bash', args: ['--norc', '--noprofile', '-i'] },
			outputDir,
			80,
			24,
			{ ...process.env } as Record<string, string>,
			{ ...process.env } as Record<string, string>,
			processOptions,
			new NullLogService(),
			{ applicationName: 'vscode' } as IProductService
		));

		const result = await terminalProcess.start();
		const error = result as ITerminalLaunchError | undefined;
		if (error?.message) {
			throw new Error(`Failed to start terminal: ${error.message}`);
		}

		// Wait for shell to produce output (prompt), indicating it's ready for input
		await new Promise<void>(resolve => {
			const timeout = setTimeout(() => {
				listener.dispose();
				resolve();
			}, 10000);
			const listener = terminalProcess.onProcessData(() => {
				clearTimeout(timeout);
				listener.dispose();
				resolve();
			});
		});

		// Send the multiline command — newlines are converted to \r for PTY
		const ptyData = command.replace(/\n/g, '\r');
		terminalProcess.input(ptyData);

		// Wait for the command to execute and write the file
		const maxWait = 10000;
		const start = Date.now();
		while (Date.now() - start < maxWait) {
			await new Promise(resolve => setTimeout(resolve, 200));
			if (fs.existsSync(outputFile)) {
				// Give a moment for the write to flush
				await new Promise(resolve => setTimeout(resolve, 200));
				break;
			}
		}

		// Shut down and wait for the process to exit
		const exitPromise = new Promise<void>(resolve => {
			const listener = terminalProcess.onProcessExit(() => {
				listener.dispose();
				resolve();
			});
		});
		terminalProcess.shutdown(true);
		await exitPromise;

		if (!fs.existsSync(outputFile)) {
			throw new Error(`Output file was not created — terminal likely got stuck (command was ${command.length} bytes)`);
		}

		const actualContent = fs.readFileSync(outputFile, 'utf-8');
		const actualLines = actualContent.trimEnd().split('\n');
		deepStrictEqual(actualLines, expectedLines);
	}

	test('small multiline command (10 lines, ~700 bytes)', async function () {
		this.timeout(15000);
		await runMultilineTest(10);
	});

	test('medium multiline command (20 lines, ~1300 bytes)', async function () {
		this.timeout(15000);
		await runMultilineTest(20);
	});

	test.skip('large multiline command (500 lines, ~32KB)', async function () {
		this.timeout(30000);
		await runMultilineTest(500);
	});
});
