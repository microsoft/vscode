"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const root = path.dirname(path.dirname(__dirname));
const yarnrcPath = path.join(root, 'remote', '.yarnrc');
const yarnrc = fs.readFileSync(yarnrcPath, 'utf8');
const version = /^target\s+"([^"]+)"$/m.exec(yarnrc)[1];
const node = process.platform === 'win32' ? 'node.exe' : 'node';
const nodePath = path.join(root, '.build', 'node', `v${version}`, `${process.platform}-${process.arch}`, node);
console.log(nodePath);
