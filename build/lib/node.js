"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const { getRemoteVersionInfo } = require('../npm/setupNpmrc');
const root = path.dirname(path.dirname(__dirname));
const version = getRemoteVersionInfo().target;
const platform = process.platform;
const arch = process.arch;
const node = platform === 'win32' ? 'node.exe' : 'node';
const nodePath = path.join(root, '.build', 'node', `v${version}`, `${platform}-${arch}`, node);
console.log(nodePath);
//# sourceMappingURL=node.js.map