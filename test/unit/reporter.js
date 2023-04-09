/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Import necessary modules
const mocha = require('mocha'); // Mocha testing framework
const FullJsonStreamReporter = require('./fullJsonStreamReporter'); // Custom reporter
const path = require('path'); // Node.js path module for handling file paths

// Function to parse reporter option value
function parseReporterOption(value) {
	const r = /^([^=]+)=(.*)$/.exec(value);
	return r ? { [r[1]]: r[2] } : {};
}

// Function to import Mocha reporter based on name
exports.importMochaReporter = name => {
	// If the name is 'full-json-stream', return the custom reporter
	if (name === 'full-json-stream') {
		return FullJsonStreamReporter;
	}
	// Otherwise, get the path to the built-in Mocha reporter based on name and return it
	const reporterPath = path.join(path.dirname(require.resolve('mocha')), 'lib', 'reporters', name);
	return require(reporterPath);
};

// Function to apply reporter to Mocha runner
exports.applyReporter = (runner, argv) => {
	let Reporter;
	try {
		// Attempt to import Mocha reporter based on command-line argument
		Reporter = exports.importMochaReporter(argv.reporter);
	} catch (err) {
		try {
			// If import fails, attempt to require the reporter module directly
			Reporter = require(argv.reporter);
		} catch (err) {
			// If both import and require fail, use the List or Spec reporter depending on OS
			Reporter = process.platform === 'win32' ? mocha.reporters.List : mocha.reporters.Spec;
			console.warn(`could not load reporter: ${argv.reporter}, using ${Reporter.name}`);
		}
	}

	// Parse reporter options from command-line argument and convert to object
	let reporterOptions = argv['reporter-options'];
	reporterOptions = typeof reporterOptions === 'string' ? [reporterOptions] : reporterOptions;
	reporterOptions = reporterOptions.reduce((r, o) => Object.assign(r, parseReporterOption(o)), {});

	// Create and return new reporter with Mocha runner and parsed reporter options
	return new Reporter(runner, { reporterOptions });
};
