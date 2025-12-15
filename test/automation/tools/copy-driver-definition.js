/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.dirname(path.dirname(path.dirname(__dirname)));
const driverPath = path.join(root, 'src/vs/workbench/services/driver/common/driver.ts');

let contents = fs.readFileSync(driverPath, 'utf8');
contents = /\/\/\*START([\s\S]*)\/\/\*END/mi.exec(contents)[1].trim();
contents = contents.replace(/\bTPromise\b/g, 'Promise');

contents = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

${contents}
`;

const srcPath = path.join(path.dirname(__dirname), 'src');
const outPath = path.join(path.dirname(__dirname), 'out');

if (!fs.existsSync(outPath)) {
	fs.mkdirSync(outPath);
}
fs.writeFileSync(path.join(srcPath, 'driver.d.ts'), contents);
fs.writeFileSync(path.join(outPath, 'driver.d.ts'), contents);
