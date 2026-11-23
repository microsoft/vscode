/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import mocha from 'mocha';

const {
	EVENT_TEST_BEGIN,
	EVENT_TEST_PASS,
	EVENT_TEST_FAIL,
	EVENT_RUN_BEGIN,
	EVENT_RUN_END,
} = mocha.Runner.constants;

/**
 * Similar to the mocha JSON stream, but includes additional information
 * on failure. Specifically, the mocha json-stream does not include unmangled
 * expected versus actual results.
 *
 * It also writes when each test starts, and the coverage events of the runner.
 * For a test, it writes the title, full title and duration, but not the file,
 * speed or current retry that json-stream writes. Mocha keeps the current retry
 * private.
 */
export default class FullJsonStreamReporter extends mocha.reporters.Base {
	private lastEvent: Promise<void> | undefined;

	constructor(runner: mocha.Runner, options?: mocha.MochaOptions) {
		super(runner, options);

		const total = runner.total;
		runner.once(EVENT_RUN_BEGIN, () => this.writeEvent(['start', { total }]));
		runner.once(EVENT_RUN_END, () => this.writeEvent(['end', this.stats]));

		// custom coverage events:
		runner.on('coverage init', (c: unknown) => this.writeEvent(['coverageInit', c]));
		runner.on('coverage increment', (context: object, coverage: unknown) => this.writeEvent(['coverageIncrement', { ...context, coverage }]));

		runner.on(EVENT_TEST_BEGIN, test => this.writeEvent(['testStart', clean(test)]));
		runner.on(EVENT_TEST_PASS, test => this.writeEvent(['pass', clean(test)]));
		runner.on(EVENT_TEST_FAIL, (test, err) => {
			this.writeEvent(['fail', {
				...clean(test),
				actual: err.actual,
				expected: err.expected,
				actualJSON: err.actualJSON,
				expectedJSON: err.expectedJSON,
				snapshotPath: err.snapshotPath,
				err: err.message,
				stack: err.stack || null,
			}]);
		});
	}

	drain() {
		return Promise.resolve(this.lastEvent);
	}

	writeEvent(event: [string, unknown]) {
		this.lastEvent = new Promise(r => process.stdout.write(JSON.stringify(event) + '\n', () => r()));
	}
}

const clean = (test: mocha.Test) => ({
	title: test.title,
	fullTitle: test.fullTitle(),
	duration: test.duration
});
