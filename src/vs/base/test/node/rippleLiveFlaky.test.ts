/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from '../../common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

/**
 * [DO NOT MERGE] A live test of the reruns of failed unit tests in pull request CI
 * (`--rerun-failed-files`, see test/unit/README.md): the test fails on its first attempt and
 * passes when the runner reruns it, so the run passes and reports the test as flaky.
 *
 * A marker file in the temporary folder records the first attempt. Only the Electron and
 * node.js runners, which both rerun failed tests, load `test/node` files, and they run one
 * after the other in the same CI job: each runner has its own marker, so that one runner's
 * attempts cannot decide another's. The CI run in the name keeps a marker that a cancelled
 * run left on a reused machine from passing the first attempt of a later run.
 */
suite('Ripple live test', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const runner = process.versions.electron ? 'electron' : 'node';
	const run = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}` : 'local';
	const marker = join(tmpdir(), `vscode-ripple-live-flaky-test-${runner}-${run}`);

	test('fails on its first attempt and passes on a rerun', () => {
		if (fs.existsSync(marker)) {
			fs.unlinkSync(marker);
			return;
		}
		fs.writeFileSync(marker, '');
		throw new Error(`Fails on purpose on the first attempt, which created ${marker}: a rerun deletes it and passes`);
	});
});
