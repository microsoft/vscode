/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import fs from 'fs';

const root = path.dirname(path.dirname(import.meta.dirname));
const electronConfig = JSON.parse(fs.readFileSync(path.join(root, 'electron.config.json'), 'utf8'));
const version = electronConfig.remoteNodeVersion;

if (!version) {
	throw new Error('Failed to extract Node version from electron.config.json');
}

const platform = process.platform;
const arch = process.arch;

const node = platform === 'win32' ? 'node.exe' : 'node';
const nodePath = path.join(root, '.build', 'node', `v${version}`, `${platform}-${arch}`, node);

console.log(nodePath);
