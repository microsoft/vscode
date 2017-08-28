/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const MochaTest = require('mocha');

const mochaTest = new MochaTest({
	timeout: 60000,
	slow: 10000,
	useColors: true
});
mochaTest.addFile(require('path').join(process.cwd(), 'out/test.js'));
mochaTest.run((failures) => {
	process.exit(failures);
});