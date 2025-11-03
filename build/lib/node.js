"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
const packageJson = fs_1.default.readFileSync(path_1.default.join(root, 'remote', 'package.json'), 'utf8');
const { config } = JSON.parse(packageJson);
const version = config.node_gyp_target;
const platform = process.platform;
const arch = process.arch;
const node = platform === 'win32' ? 'node.exe' : 'node';
const nodePath = path_1.default.join(root, '.build', 'node', `v${version}`, `${platform}-${arch}`, node);
console.log(nodePath);
//# sourceMappingURL=node.js.map