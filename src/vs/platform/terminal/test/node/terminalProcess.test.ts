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

const lineCounts = [10, 20];
const waitDuration = 4000;

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
		const outputFile = path.join(outputDir, `output-${shellName}-${lineCount}.txt`);
		const { command, expectedByteCount } = buildMultilineCommand(outputFile, lineCount);
		const terminalProcess = store.add(new TerminalProcess(
			shellLaunchConfig,
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

		await new Promise<void>(resolve => {
			const timer = setTimeout(() => {
				listener.dispose();
				resolve();
			}, 10000);
			const listener = terminalProcess.onProcessData(() => {
				clearTimeout(timer);
				listener.dispose();
				resolve();
			});
		});

		terminalProcess.input(command.replace(/\n/g, '\r'));

		const start = Date.now();
		while (Date.now() - start < waitDuration) {
			await new Promise(resolve => setTimeout(resolve, 200));
			if (fs.existsSync(outputFile)) {
				await new Promise(resolve => setTimeout(resolve, 200));
				break;
			}
		}

		const exitPromise = new Promise<void>(resolve => {
			const listener = terminalProcess.onProcessExit(() => {
				listener.dispose();
				resolve();
			});
		});
		terminalProcess.shutdown(true);
		await exitPromise;

		if (!fs.existsSync(outputFile)) {
			throw new Error('Output file was not created');
		}

		const actualByteCount = parseInt(fs.readFileSync(outputFile, 'utf-8').trim(), 10);
		deepStrictEqual(actualByteCount, expectedByteCount);
	}

	for (const lineCount of lineCounts) {
		const sizeName = lineCount === 10 ? 'small' : lineCount === 20 ? 'medium' : 'large';
		for (const shell of shellMatrix) {
			const shellName = path.posix.basename(shell.executable!);
			test(`${shellName} ${sizeName} multiline write`, async function () {
				if (!shellExists(shell.executable!)) {
					this.skip();
				}

				this.timeout(10000);
				await runShellMultilineTest(shell, lineCount);
			});
		}
	}
});
