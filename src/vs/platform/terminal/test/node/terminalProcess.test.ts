/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IShellLaunchConfig, ITerminalLaunchError, ITerminalProcessOptions } from '../../common/terminal.js';
import { TerminalProcess } from '../../node/terminalProcess.js';

const processOptions: ITerminalProcessOptions = {
	shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' },
	windowsUseConptyDll: false,
	environmentVariableCollections: undefined,
	workspaceFolder: undefined,
	isScreenReaderOptimized: false
};

const shellMatrix: IShellLaunchConfig[] = [
	{ executable: '/bin/bash', args: ['--norc', '--noprofile', '-i'] },
	{ executable: '/bin/zsh', args: ['-f', '-i'] },
	{ executable: '/bin/sh', args: ['-i'] },
	{ executable: '/bin/ksh', args: ['-i'] },
	{ executable: '/bin/dash', args: ['-i'] },
];

const lineCounts = [10, 20, 30, 40, 50];
const iterationsPerTest = 3;
const waitDuration = 4000;

const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

/**
 * Simulate how xterm.js sends input to the PTY — writing the entire
 * string as a single write, but preceded by a small delay per "keystroke".
 * The key difference from a direct ptyProcess.write() is that xterm.js
 * processes input through its input handler which can interact with the
 * PTY echo, creating timing conditions that trigger the kernel bug.
 *
 * To reproduce the bug reliably: write the command in small chunks with
 * minimal delays, similar to how xterm.js processes rapid paste input.
 */
async function writeInChunks(terminalProcess: TerminalProcess, data: string, chunkSize: number = 4): Promise<void> {
	for (let i = 0; i < data.length; i += chunkSize) {
		terminalProcess.input(data.slice(i, i + chunkSize));
		// Yield to event loop between chunks — simulates xterm.js processing
		await new Promise(resolve => setImmediate(resolve));
	}
}

/**
 * Run a single iteration of the multiline write test.
 */
async function runSingleIteration(
	store: { add<T extends { dispose(): void }>(t: T): T },
	shellLaunchConfig: IShellLaunchConfig,
	outputFile: string,
	lineCount: number,
	useBracketedPaste: boolean
): Promise<{ passed: boolean; error: string }> {
	const { command, expectedByteCount } = buildMultilineCommand(outputFile, lineCount);
	const terminalProcess = store.add(new TerminalProcess(
		shellLaunchConfig,
		path.dirname(outputFile),
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
		return { passed: false, error: `Failed to start: ${error.message}` };
	}

	await new Promise<void>(resolve => {
		const timer = setTimeout(() => { listener.dispose(); resolve(); }, 10000);
		const listener = terminalProcess.onProcessData(() => {
			clearTimeout(timer);
			listener.dispose();
			resolve();
		});
	});

	let inputData: string;
	if (useBracketedPaste) {
		const commandContent = command.slice(0, -1).replace(/\n/g, '\r');
		inputData = BRACKETED_PASTE_START + commandContent + BRACKETED_PASTE_END + '\r';
	} else {
		inputData = command.replace(/\n/g, '\r');
	}

	// Write in chunks to simulate xterm.js-like input handling
	await writeInChunks(terminalProcess, inputData);

	const start = Date.now();
	while (Date.now() - start < waitDuration) {
		await new Promise(resolve => setTimeout(resolve, 200));
		if (fs.existsSync(outputFile)) {
			await new Promise(resolve => setTimeout(resolve, 200));
			break;
		}
	}

	const exitPromise = new Promise<void>(resolve => {
		const listener = terminalProcess.onProcessExit(() => { listener.dispose(); resolve(); });
	});
	terminalProcess.shutdown(true);
	await exitPromise;

	if (!fs.existsSync(outputFile)) {
		return { passed: false, error: 'Output file was not created' };
	}

	const actualByteCount = parseInt(fs.readFileSync(outputFile, 'utf-8').trim(), 10);
	if (actualByteCount !== expectedByteCount) {
		return { passed: false, error: `Expected ${expectedByteCount} but got ${actualByteCount}` };
	}
	return { passed: true, error: '' };
}

function shellExists(executable: string): boolean {
	return fs.existsSync(executable);
}

function escapeForDoubleQuotedShellString(value: string): string {
	return `"${value.replace(/[\\"$`]/g, '\\$&')}"`;
}

function buildMultilineCommand(outputFile: string, lineCount: number): { command: string; expectedByteCount: number } {
	const lines: string[] = [];
	for (let i = 1; i <= lineCount; i++) {
		lines.push(`L${String(i).padStart(2, '0')} ${'a'.repeat(51)}`);
	}
	const escapedOutputFile = escapeForDoubleQuotedShellString(outputFile);
	const content = lines.join('\n');
	const command = `echo '${content}' | wc -c > ${escapedOutputFile}\n`;
	// echo outputs: content bytes + trailing newline
	const expectedByteCount = content.length + 1;
	return { command, expectedByteCount };
}

// These tests spawn real PTY processes and are macOS/Linux only.
(isWindows ? suite.skip : suite)('TerminalProcess - multiline write', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let outputDir: string;

	setup(() => {
		outputDir = fs.mkdtempSync(path.join(tmpdir(), 'vscode-pty-test-'));
	});

	teardown(() => {
		fs.rmSync(outputDir, { recursive: true, force: true });
	});

	async function runShellMultilineTest(shellLaunchConfig: IShellLaunchConfig, lineCount: number): Promise<void> {
		const shellName = path.posix.basename(shellLaunchConfig.executable!);
		let passed = 0;
		let lastError = '';

		// Run iterations in parallel to create I/O contention, which makes
		// the macOS PTY canonical-mode bug more likely to trigger.
		const promises = Array.from({ length: iterationsPerTest }, (_, iter) => {
			const outputFile = path.join(outputDir, `output-${shellName}-${lineCount}-${iter}.txt`);
			return runSingleIteration(store, shellLaunchConfig, outputFile, lineCount, false);
		});

		const results = await Promise.all(promises);
		for (let i = 0; i < results.length; i++) {
			if (results[i].passed) {
				passed++;
			} else {
				lastError = `Iteration ${i}: ${results[i].error}`;
			}
		}

		deepStrictEqual(passed, iterationsPerTest, `Only ${passed}/${iterationsPerTest} passed. ${lastError}`);
	}

	for (const lineCount of lineCounts) {
		const sizeName = `${lineCount}-line`;
		for (const shell of shellMatrix) {
			const shellName = path.posix.basename(shell.executable!);
			test(`${shellName} ${sizeName} multiline write`, async function () {
				if (!shellExists(shell.executable!)) {
					this.skip();
				}

				this.timeout(iterationsPerTest * 10000);
				await runShellMultilineTest(shell, lineCount);
			});
		}
	}
});

// Test that bracketed paste mode wrapping prevents corruption for shells that support it.
// This proves the fix in chatTerminalToolProgressPart.ts works at the PTY level.
(isWindows ? suite.skip : suite)('TerminalProcess - multiline write with bracketed paste', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let outputDir: string;

	setup(() => {
		outputDir = fs.mkdtempSync(path.join(tmpdir(), 'vscode-pty-paste-test-'));
	});

	teardown(() => {
		fs.rmSync(outputDir, { recursive: true, force: true });
	});

	async function runBracketedPasteTest(shellLaunchConfig: IShellLaunchConfig, lineCount: number): Promise<void> {
		const shellName = path.posix.basename(shellLaunchConfig.executable!);
		let passed = 0;
		let lastError = '';

		// Run iterations in parallel — same contention as raw tests, but
		// with bracketed paste wrapping to prove the fix works.
		const promises = Array.from({ length: iterationsPerTest }, (_, iter) => {
			const outputFile = path.join(outputDir, `output-paste-${shellName}-${lineCount}-${iter}.txt`);
			return runSingleIteration(store, shellLaunchConfig, outputFile, lineCount, true);
		});

		const results = await Promise.all(promises);
		for (let i = 0; i < results.length; i++) {
			if (results[i].passed) {
				passed++;
			} else {
				lastError = `Iteration ${i}: ${results[i].error}`;
			}
		}

		deepStrictEqual(passed, iterationsPerTest, `Only ${passed}/${iterationsPerTest} passed. ${lastError}`);
	}

	// Shells that support bracketed paste mode should handle large multiline
	// input correctly when wrapped in paste sequences
	const bracketedPasteShells: IShellLaunchConfig[] = [
		{ executable: '/bin/zsh', args: ['-f', '-i'] },
	];

	for (const lineCount of lineCounts) {
		const sizeName = `${lineCount}-line`;
		for (const shell of bracketedPasteShells) {
			const shellName = path.posix.basename(shell.executable!);
			test(`${shellName} ${sizeName} multiline write with bracketed paste`, async function () {
				if (!shellExists(shell.executable!)) {
					this.skip();
				}

				this.timeout(iterationsPerTest * 10000);
				await runBracketedPasteTest(shell, lineCount);
			});
		}
	}
});
