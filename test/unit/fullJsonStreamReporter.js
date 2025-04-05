/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { constants } = require('mocha/lib/runner');
const BaseRunner = require('mocha/lib/reporters/base');

const {
	EVENT_TEST_BEGIN,
	EVENT_TEST_PASS,
	EVENT_TEST_FAIL,
	EVENT_RUN_BEGIN,
	EVENT_RUN_END,
} = constants;

/**
 * Similar to the mocha JSON stream, but includes additional information
 * on failure. Specifically, the mocha json-stream does not include unmangled
 * expected versus actual results.
 *
 * Writes a superset of the data that json-stream normally would.
 */
module.exports = class FullJsonStreamReporter extends BaseRunner {
	constructor(runner, options) {
		super(runner, options);

		const total = runner.total;
		runner.once(EVENT_RUN_BEGIN, () => this.writeEvent(['start', { total }]));
		runner.once(EVENT_RUN_END, () => this.writeEvent(['end', this.stats]));

		// custom coverage events:
		runner.on('coverage init', (c) => this.writeEvent(['coverageInit', c]));
		runner.on('coverage increment', (context, coverage) => this.writeEvent(['coverageIncrement', { ...context, coverage }]));

		runner.on(EVENT_TEST_BEGIN, test => this.writeEvent(['testStart', clean(test)]));
		runner.on(EVENT_TEST_PASS, test => this.writeEvent(['pass', clean(test)]));
		runner.on(EVENT_TEST_FAIL, (test, err) => {
			test = clean(test);
			test.actual = err.actual;
			test.expected = err.expected;
			test.actualJSON = err.actualJSON;
			test.expectedJSON = err.expectedJSON;
			test.snapshotPath = err.snapshotPath;
			test.err = err.message;
			test.stack = err.stack || null;
			this.writeEvent(['fail', test]);
		});
	}

	drain() {
		return Promise.resolve(this.lastEvent);
	}

	writeEvent(event) {
		this.lastEvent = new Promise(r => process.stdout.write(JSON.stringify(event) + '\n', r));
	}
};

const clean = test => ({
	title: test.title,
	fullTitle: test.fullTitle(),
	duration: test.duration,
	currentRetry: test.currentRetry()
});
