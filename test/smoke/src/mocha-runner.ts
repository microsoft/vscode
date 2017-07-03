/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const MochaTest = require('mocha');

const mochaTest = new MochaTest({
	timeout: 360000,
	retries: 2,
	slow: 50000,
	useColors: true
});
mochaTest.addFile(require('path').join(process.cwd(), 'out/test.js'));
mochaTest.run((failures) => {
	process.exit(failures);
});