/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { autorun } from '../../../../base/common/observable.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { redactToken, RemoteAgentHostBootstrapProgressReporter, type IRemoteAgentHostBootstrapProgress } from '../../common/remoteAgentHostBootstrapProgress.js';

suite('RemoteAgentHostBootstrapProgressReporter', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses a server download progress line', () => {
		const reporter = disposables.add(new RemoteAgentHostBootstrapProgressReporter());
		reporter.acceptLine('Downloading server: 182761536/228859480 (80%)');

		assert.deepStrictEqual(reporter.progress.get(), { phase: 'serverDownload', percentage: 80 });
	});

	test('ignores unrecognized output', () => {
		const reporter = disposables.add(new RemoteAgentHostBootstrapProgressReporter());
		reporter.acceptLine('bootstrap shell noise');

		assert.strictEqual(reporter.progress.get(), undefined);
	});

	test('redacts token-bearing output before producing progress', () => {
		const reporter = disposables.add(new RemoteAgentHostBootstrapProgressReporter());
		reporter.acceptLine('Downloading server: 80/100 (80%)?tkn=bootstrap-token');

		assert.deepStrictEqual({
			redacted: redactToken('Downloading server: 80/100 (80%)?tkn=bootstrap-token'),
			progress: reporter.progress.get(),
		}, {
			redacted: 'Downloading server: 80/100 (80%)?tkn=***',
			progress: { phase: 'serverDownload', percentage: 80 },
		});
	});

	test('collapses a burst while preserving its final progress', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const progress: IRemoteAgentHostBootstrapProgress[] = [];
			const reporter = disposables.add(new RemoteAgentHostBootstrapProgressReporter());
			disposables.add(autorun(reader => {
				const update = reporter.progress.read(reader);
				if (update) {
					progress.push(update);
				}
			}));

			for (const percentage of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
				reporter.acceptLine(`Downloading server: ${percentage}/100 (${percentage}%)`);
			}
			await timeout(250);

			assert.deepStrictEqual(progress, [
				{ phase: 'serverDownload', percentage: 10 },
				{ phase: 'serverDownload', percentage: 100 },
			]);
		});
	});

	test('retains progress across interleaved output noise', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const progress: IRemoteAgentHostBootstrapProgress[] = [];
			const reporter = disposables.add(new RemoteAgentHostBootstrapProgressReporter());
			disposables.add(autorun(reader => {
				const update = reporter.progress.read(reader);
				if (update) {
					progress.push(update);
				}
			}));

			reporter.acceptLine('Downloading server: 10/100 (10%)');
			reporter.acceptLine('bootstrap shell noise');
			reporter.acceptLine('Downloading server: 20/100 (20%)');
			await timeout(250);

			assert.deepStrictEqual(progress, [
				{ phase: 'serverDownload', percentage: 10 },
				{ phase: 'serverDownload', percentage: 20 },
			]);
		});
	});
});
