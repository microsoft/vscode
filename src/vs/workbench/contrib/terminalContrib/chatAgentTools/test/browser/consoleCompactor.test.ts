/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { classifyCommand, compact } from '../../browser/tools/consoleCompactor/consoleCompactor.js';

suite('Console Compactor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('classifyCommand', () => {
		test('tags npm commands', () => {
			deepStrictEqual(classifyCommand('npm install').commandKinds, ['npm']);
		});

		test('tags cargo commands', () => {
			deepStrictEqual(classifyCommand('cargo build').commandKinds, ['cargo']);
		});

		test('detects go test', () => {
			const classification = classifyCommand('go test ./...');
			deepStrictEqual(classification.commandKinds, ['go']);
			strictEqual(classification.runsGoTest, true);
		});

		test('detects source read commands', () => {
			strictEqual(classifyCommand('cat src/main.ts').isSourceReadCommand, true);
		});

		test('leaves unknown commands untagged', () => {
			deepStrictEqual(classifyCommand('echo hello'), {
				commandKinds: [],
				isSourceReadCommand: false,
				runsGoTest: false,
				mentionsSavedToolOutput: false,
			});
		});
	});

	suite('compact', () => {
		test('does not change small, unremarkable output', () => {
			const output = 'hello world\n';
			const report = compact('echo hello', output);
			strictEqual(report.applied, false);
			strictEqual(report.compactedOutput, output);
			deepStrictEqual(report.saved, { chars: 0, bytes: 0, lines: 0 });
		});

		test('compacts noisy npm output', () => {
			const output = Array.from(
				{ length: 400 },
				(_, i) => `npm http fetch GET 200 https://registry.npmjs.org/pkg${i} ${i}ms (cache miss)`
			).join('\n') + '\nadded 400 packages in 3s\n';

			const report = compact('npm install', output);
			strictEqual(report.applied, true);
			deepStrictEqual(report.commandKinds, ['npm']);
			ok(report.compacted.chars < report.original.chars);
			ok(report.reduction.charsPct > 0);
		});

		test('compacts noisy cargo output', () => {
			const output = Array.from(
				{ length: 300 },
				(_, i) => `   Compiling crate${i} v0.1.${i}`
			).join('\n') + '\n    Finished dev [unoptimized + debuginfo] target(s) in 12.34s\n';

			const report = compact('cargo build', output);
			strictEqual(report.applied, true);
			deepStrictEqual(report.commandKinds, ['cargo']);
			ok(report.compacted.chars < report.original.chars);
			ok(report.reduction.charsPct > 0);
		});

		test('compacts noisy pip output', () => {
			const output = Array.from(
				{ length: 200 },
				(_, i) => `Collecting package${i}\n  Downloading package${i}-1.0.0-py3-none-any.whl (${i} kB)`
			).join('\n') + '\nSuccessfully installed pkgs\n';

			const report = compact('pip install -r requirements.txt', output);
			strictEqual(report.applied, true);
			deepStrictEqual(report.commandKinds, ['pip']);
			ok(report.compacted.chars < report.original.chars);
			ok(report.reduction.charsPct > 0);
		});

		test('saved counts equal the difference between original and compacted', () => {
			const output = Array.from(
				{ length: 400 },
				(_, i) => `npm http fetch GET 200 https://registry.npmjs.org/pkg${i} ${i}ms (cache miss)`
			).join('\n') + '\nadded 400 packages in 3s\n';

			const report = compact('npm install', output);
			strictEqual(report.saved.chars, report.original.chars - report.compacted.chars);
			strictEqual(report.saved.bytes, report.original.bytes - report.compacted.bytes);
			strictEqual(report.saved.lines, report.original.lines - report.compacted.lines);
		});
	});
});
