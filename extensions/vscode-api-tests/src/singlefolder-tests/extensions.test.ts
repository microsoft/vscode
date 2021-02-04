/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('vscode server cli', () => {

	const extension = process.env.TESTRESOLVER_INSTALL_BUILTIN_EXTENSION;
	const skip = !process.env.BUILD_SOURCEVERSION // Skip it when running out of sources
		|| !process.env.REMOTE_VSCODE // Skip it when not a remote integration test
		|| !extension // Skip it when extension is not provided to server
		;

	(skip ? test.skip : test)('extension is installed and enabled when installed by server cli', function () {
		assert.ok(vscode.extensions.getExtension(extension!));
	});

});
