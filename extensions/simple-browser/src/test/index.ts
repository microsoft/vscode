/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as testRunner from '../../../../test/integration/electron/testrunner';

testRunner.configure({
	ui: 'tdd',
	color: true,
	timeout: 60000,
});

export = testRunner;
