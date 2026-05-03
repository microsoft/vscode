/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { outputLooksSandboxBlocked } from '../../browser/tools/sandboxOutputAnalyzer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('outputLooksSandboxBlocked', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const positives: [string, string][] = [
		['macOS sandbox file write', '/bin/bash: /tmp/test.txt: Operation not permitted'],
		['Linux sandbox file write', '/usr/bin/bash: /tmp/test.txt: Read-only file system'],
		['Permission denied', 'bash: ./script.sh: Permission denied'],
		['sandbox-exec reference', 'sandbox-exec: some error occurred'],
		['bwrap reference', 'bwrap: error setting up namespace'],
		['sandbox_violation', 'sandbox_violation: deny(1) file-write-create /tmp/foo'],
		['case insensitive', '/bin/bash: OPERATION NOT PERMITTED'],
		['wrapped across lines', '/bin/bash: Operation not\npermitted'],
	];

	for (const [label, output] of positives) {
		test(`detects: ${label}`, () => {
			strictEqual(outputLooksSandboxBlocked(output), true);
		});
	}

	const negatives: [string, string][] = [
		['normal output', 'hello world'],
		['empty output', ''],
		['unrelated error', 'Error: ENOENT: no such file or directory'],
	];

	for (const [label, output] of negatives) {
		test(`ignores: ${label}`, () => {
			strictEqual(outputLooksSandboxBlocked(output), false);
		});
	}
});
