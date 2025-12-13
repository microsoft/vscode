/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const { spawnSync } = require('child_process');

process.env.VSCODE_PRODUCT_JSON ??= 'build/ResonanceIDE.product.json';
process.env.VSCODE_BUILD_NAME ??= 'ResonanceIDE';

const gulpTask = process.argv[2] || 'vscode-min';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const result = spawnSync(npmCommand, ['run', 'gulp', '--', gulpTask], { stdio: 'inherit' });
process.exit(result.status ?? 1);

