// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as path from 'path';

process.env.CODE_TESTS_WORKSPACE = path.join(__dirname, '..', '..', 'src', 'test');
process.env.IS_CI_SERVER_TEST_DEBUGGER = '';
process.env.VSC_PYTHON_LANGUAGE_SERVER = '1';
process.env.TEST_FILES_SUFFIX = 'ls.test';

function start() {
    console.log('*'.repeat(100));
    console.log('Start language server tests');
    require('../../node_modules/vscode/bin/test');
}
start();
