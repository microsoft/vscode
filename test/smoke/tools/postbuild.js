/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const root = path.dirname(__dirname);
const driverPath = path.join(root, 'src/vscode/driver.js');
const driver = fs.readFileSync(driverPath);

const outDriverPath = path.join(root, 'out/vscode/driver.js');
fs.writeFileSync(outDriverPath, driver);
