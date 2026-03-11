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
	{ executable: '/bin/csh', args: ['-i'] },
	{ executable: '/bin/tcsh', args: ['-i'] },
];

const lineCount = 20;
const waitDuration = 4000;

function shellExists(executable: string): boolean {
	return fs.existsSync(executable);
}

function buildMultilineCommand(outputFile: string): { command: string; expectedLines: string[] } {
	const expectedLines: string[] = [];
	for (let i = 1; i <= lineCount; i++) {
		expectedLines.push(`L${String(i).padStart(2, '0')} ${'a'.repeat(51)}`);
	}
	const escapedOutputFile = `'${outputFile.replace(/'/g, `'\\''`)}'`;
	const command = [`: > ${escapedOutputFile}`, ...expectedLines.map(line => `echo '${line}' >> ${escapedOutputFile}`)].join('\n') + '\n';
	return { command, expectedLines };
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

	async function runShellMultilineTest(shellLaunchConfig: IShellLaunchConfig): Promise<void> {
		const shellName = path.posix.basename(shellLaunchConfig.executable!);
		const outputFile = path.join(outputDir, `output-${shellName}.txt`);
		const { command, expectedLines } = buildMultilineCommand(outputFile);
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

		const actualLines = fs.readFileSync(outputFile, 'utf-8').trimEnd().split('\n');
		deepStrictEqual(actualLines, expectedLines);
	}

	for (const shell of shellMatrix) {
		const shellName = path.posix.basename(shell.executable!);
		test(`${shellName} medium multiline write`, async function () {
			if (!shellExists(shell.executable!)) {
				this.skip();
			}

			this.timeout(10000);
			await runShellMultilineTest(shell);
		});
	}
});
