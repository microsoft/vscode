/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const testRunner = require('vscode/lib/testrunner');

testRunner.configure({
	ui: 'tdd',
	useColors: true
});

module.exports = testRunner;