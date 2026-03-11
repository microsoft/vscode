/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
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
function buildMultilineCommand(lines: string[], outputFile: string): { command: string; expectedLines: string[] } {
	// Use cat heredoc to write content to a file - this exercises multiline PTY input
	const command = `cat > ${escapeForSingleQuotedShellString(outputFile)} << 'TESTEOF'\n${lines.join('\n')}\nTESTEOF\n`;
	return { command, expectedLines: lines };
}

function buildAsciiMultilineCommand(lineCount: number, outputFile: string): { command: string; expectedLines: string[] } {
	const lines: string[] = [];
	for (let i = 1; i <= lineCount; i++) {
		// Pad line number, add filler to make each line ~55 chars
		const line = `L${String(i).padStart(2, '0')} ${'a'.repeat(51)}`;
		lines.push(line);
	}
	return buildMultilineCommand(lines, outputFile);
}

function buildMultibyteMultilineCommand(lineCount: number, outputFile: string): { command: string; expectedLines: string[] } {
	for (let repeatCount = 1; repeatCount <= 256; repeatCount++) {
		const lines: string[] = [];
		for (let i = 1; i <= lineCount; i++) {
			lines.push(`L${String(i).padStart(2, '0')} ${'中'.repeat(repeatCount)}`);
		}
		const result = buildMultilineCommand(lines, outputFile);
		if (result.command.length <= 512 && Buffer.byteLength(result.command, 'utf8') > 1024) {
			return result;
		}
	}
	throw new Error('Failed to generate a multibyte command within the UTF-16 and UTF-8 thresholds');
}

interface IRunMultilineTestOptions {
	outputFile: string;
	buildCommand: (outputFile: string) => { command: string; expectedLines: string[] };
	maxWait?: number;
}

function escapeForSingleQuotedShellString(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
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

	async function runMultilineTest(options: IRunMultilineTestOptions): Promise<void> {
		const { outputFile, buildCommand, maxWait = 10000 } = options;
		const { command, expectedLines } = buildCommand(outputFile);

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
			throw new Error(`Output file was not created — terminal likely got stuck (command was ${command.length} UTF-16 code units / ${Buffer.byteLength(command, 'utf8')} UTF-8 bytes)`);
		}

		const actualContent = fs.readFileSync(outputFile, 'utf-8');
		const actualLines = actualContent.trimEnd().split('\n');
		deepStrictEqual(actualLines, expectedLines);
	}

	async function runAsciiMultilineTest(lineCount: number): Promise<void> {
		await runMultilineTest({
			outputFile: path.join(outputDir, `output-${lineCount}.txt`),
			buildCommand: outputFile => buildAsciiMultilineCommand(lineCount, outputFile)
		});
	}

	test('small multiline command (10 lines, ~700 bytes)', async function () {
		this.timeout(15000);
		await runAsciiMultilineTest(10);
	});

	test('medium multiline command (20 lines, ~1300 bytes)', async function () {
		this.timeout(15000);
		await runAsciiMultilineTest(20);
	});

	test.skip('large multiline command (500 lines, ~32KB)', async function () {
		this.timeout(30000);
		await runAsciiMultilineTest(500);
	});

	test('multibyte multiline command can exceed the UTF-8 threshold while staying under the current UTF-16 gate', async function () {
		const outputFile = path.join(outputDir, 'output-u8.txt');
		const { command } = buildMultibyteMultilineCommand(10, outputFile);
		const utf16Length = command.length;
		const utf8Length = Buffer.byteLength(command, 'utf8');

		// This payload documents the predicate mismatch directly: the current
		// macOS chunking gate uses JS string length, but the PTY buffer limit is
		// relevant in UTF-8 bytes.
		ok(utf16Length <= 512, `Expected payload to stay under the current UTF-16 chunking gate, got ${utf16Length}`);
		ok(utf8Length > 1024, `Expected payload to exceed the macOS canonical-mode buffer in UTF-8 bytes, got ${utf8Length}`);

		this.timeout(15000);
		await runMultilineTest({
			outputFile,
			buildCommand: currentOutputFile => buildMultibyteMultilineCommand(10, currentOutputFile)
		});
	});

});
