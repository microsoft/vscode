/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as testRunner from '../../../../test/integration/electron/testrunner';

const options: any = {
	ui: 'tdd',
	color: true,
	timeout: 60000
};

// Set suite name for test results
const suite = 'Integration Hello World Tests';

testRunner.configure(options);

export = testRunner;