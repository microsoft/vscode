/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var Mocha = require('mocha');
var path = require('path');

var mocha = new Mocha({
	timeout: 360000,
	retries: 2,
	slow: 50000,
	useColors: true
});

mocha.addFile(path.join(process.cwd(), 'out/test.js'));
mocha.run((failures) => {
	process.on('exit', () => {
		process.exit(failures);
	});
});