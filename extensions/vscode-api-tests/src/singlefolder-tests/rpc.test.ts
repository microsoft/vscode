/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNoRpc } from '../utils';

suite('vscode', function () {

	test('no rpc', function () {
		assertNoRpc();
	});
});
