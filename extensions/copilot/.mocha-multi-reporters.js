/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path = require('path');

// In CI, the name of the NPM command that was run is used to generate a unique
// filename for the JUnit report. The name we give it is then used as the test
// bundle name in DataDog.
const commandToBundleName = {
	isolatedProxyTests: 'IsolatedProxy',
	reverseProxyTests: 'ReverseProxy',
	test: 'LSPClient',
	'test:agent': 'Agent',
	'test:lib': 'Lib',
	'test:lib-e2e': 'LibEndToEnd',
};

const config = {
	reporterEnabled: 'spec',
};

if (process.env.CI) {
	const bundleName = commandToBundleName[process.env.npm_lifecycle_event] || 'Unit';
	config.reporterEnabled += ', mocha-junit-reporter';
	config.mochaJunitReporterReporterOptions = {
		testCaseSwitchClassnameAndName: true,
		testsuitesTitle: `Copilot ${bundleName} Tests`,
		mochaFile: path.resolve(__dirname, `test-results-${bundleName}.xml`),
	};
}

module.exports = config;
