/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodexThreadCreationSequencer } from '../../../node/codex/codexThreadCreationSequencer.js';

suite('CodexThreadCreationSequencer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** A thread creation the test settles; `started` resolves once the sequencer runs it. */
	function creation(name: string, log: string[]) {
		const started = new DeferredPromise<void>();
		const settled = new DeferredPromise<string>();
		return {
			started: started.p,
			settled,
			task: () => {
				log.push(name);
				started.complete();
				return settled.p;
			},
		};
	}

	test('on Linux, a creation waits for those sharing one of its roots, even a failed one, and no others', async () => {
		const sequencer = new CodexThreadCreationSequencer('linux');
		const log: string[] = [];
		const first = creation('first /repo', log);
		const second = creation('second /repo', log);
		const elsewhere = creation('/other', log);
		const both = creation('/repo and /other', log);

		const results = [
			sequencer.run(['/repo', undefined], first.task),
			sequencer.run(['/repo'], second.task),
			sequencer.run(['/other'], elsewhere.task),
			sequencer.run(['/other', '/repo', '/repo'], both.task),
		].map(result => result.then(value => value, (error: Error) => error.message));
		await Promise.all([first.started, elsewhere.started]);
		const whileFirstRuns = [...log];

		first.settled.error(new Error('bwrap failed'));
		await second.started;
		const afterFirst = [...log];

		second.settled.complete('second');
		elsewhere.settled.complete('elsewhere');
		await both.started;
		both.settled.complete('both');

		assert.deepStrictEqual({ whileFirstRuns, afterFirst, order: log, results: await Promise.all(results) }, {
			whileFirstRuns: ['first /repo', '/other'],
			afterFirst: ['first /repo', '/other', 'second /repo'],
			order: ['first /repo', '/other', 'second /repo', '/repo and /other'],
			results: ['bwrap failed', 'second', 'elsewhere', 'both'],
		});
	});

	test('elsewhere, creations sharing a root run concurrently', async () => {
		const sequencer = new CodexThreadCreationSequencer('darwin');
		const log: string[] = [];
		const first = creation('first', log);
		const second = creation('second', log);

		const results = [sequencer.run(['/repo'], first.task), sequencer.run(['/repo'], second.task)];
		await Promise.all([first.started, second.started]);
		const running = [...log];
		first.settled.complete('first');
		second.settled.complete('second');

		assert.deepStrictEqual({ running, results: await Promise.all(results) }, { running: ['first', 'second'], results: ['first', 'second'] });
	});
});
