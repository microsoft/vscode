/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { suite, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatProcessMemory } from '../../azure-pipelines/common/captureDarwinMemory.ts';

const helperPath = fileURLToPath(new URL('../../azure-pipelines/common/captureDarwinMemory.ts', import.meta.url));

suite('macOS sanity memory diagnostics', () => {
	test('sorts processes numerically and groups executables with spaces', () => {
		assert.deepStrictEqual(formatProcessMemory([
			' 10 1 1024 1048576 0.1 /Applications/Code - Insiders',
			' 20 1 2048 2097152 0.2 /usr/bin/node',
			' 30 10 4096 3145728 0.4 /Applications/Code - Insiders',
			'',
		].join('\n')), [
			'Top 40 processes by resident memory: PID PPID RSS_MiB VSZ_GiB %MEM executable',
			'30 10 4.0 3.00 0.4 /Applications/Code - Insiders',
			'20 1 2.0 2.00 0.2 /usr/bin/node',
			'10 1 1.0 1.00 0.1 /Applications/Code - Insiders',
			'RSS sum across 3 processes: 0.01 GiB. This can double-count shared pages and excludes compressed/nonresident memory; it is not total physical usage.',
			'Top 20 executable groups by summed RSS: process_count RSS_MiB executable',
			'2 5.0 /Applications/Code - Insiders',
			'1 2.0 /usr/bin/node',
		]);
	});

	test('bounds rankings without dropping processes from the totals', () => {
		const rows = Array.from({ length: 45 }, (_, index) => `${index + 1} 1 1024 1048576 0.1 /process-${index + 1}`);
		const messages = formatProcessMemory(rows.join('\n'));
		const summary = messages.findIndex(message => message.startsWith('RSS sum'));
		assert.deepStrictEqual({
			processCount: summary - 1,
			groupCount: messages.length - summary - 2,
			summary: messages[summary],
		}, {
			processCount: 40,
			groupCount: 20,
			summary: 'RSS sum across 45 processes: 0.04 GiB. This can double-count shared pages and excludes compressed/nonresident memory; it is not total physical usage.',
		});
	});

	test('reports unparseable rows without echoing their contents', () => {
		assert.deepStrictEqual(formatProcessMemory('\nnot a process row\n'), [
			'##vso[task.logissue type=warning]Unable to parse a process memory row.',
			'Top 40 processes by resident memory: PID PPID RSS_MiB VSZ_GiB %MEM executable',
			'RSS sum across 0 processes: 0.00 GiB. This can double-count shared pages and excludes compressed/nonresident memory; it is not total physical usage.',
			'Top 20 executable groups by summed RSS: process_count RSS_MiB executable',
		]);
	});

	test('preserves command arguments, output and exit status without keeping the timer alive', () => {
		const results = [0, 7].map(code => {
			const result = spawnSync(process.execPath, [
				helperPath, '--', process.execPath, '-e',
				`console.log(JSON.stringify(process.argv.slice(1))); process.exit(${code});`,
				'value with spaces', '--flag',
			], { encoding: 'utf8', timeout: 10_000 });
			return { status: result.status, stdout: result.stdout?.trim(), error: result.error?.message };
		});
		assert.deepStrictEqual(results, [0, 7].map(status => ({
			status,
			stdout: '["value with spaces","--flag"]',
			error: undefined,
		})));
	});

	test('fails explicitly when the command cannot be spawned', () => {
		const result = spawnSync(process.execPath, [helperPath, '--', 'nonexistent-vscode-memory-diagnostic-command'], { encoding: 'utf8', timeout: 10_000 });
		assert.deepStrictEqual({ status: result.status, error: result.error?.message, missingCommand: result.stderr.includes('ENOENT') }, {
			status: 1, error: undefined, missingCommand: true
		});
	});

	test('rejects an incomplete command invocation', () => {
		const result = spawnSync(process.execPath, [helperPath, '--'], { encoding: 'utf8', timeout: 10_000 });
		assert.deepStrictEqual({ status: result.status, error: result.error?.message, usage: result.stderr.includes('Usage:') }, {
			status: 1, error: undefined, usage: true
		});
	});
});
