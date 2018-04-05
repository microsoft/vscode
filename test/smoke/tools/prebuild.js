/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const root = path.dirname(path.dirname(path.dirname(__dirname)));
const driverPath = path.join(root, 'src/vs/code/common/driver.ts');

let contents = fs.readFileSync(driverPath, 'utf8');
contents = /\/\/\*START([\s\S]*)\/\/\*END/mi.exec(contents)[1].trim();
contents = contents.replace(/\bTPromise\b/g, 'Promise');

contents = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

${contents}

export interface IDisposable {
	dispose(): void;
}

export function connect(outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }>;
`;

const srcPath = path.join(path.dirname(__dirname), 'src/vscode');
const outDriverPath = path.join(srcPath, 'driver.d.ts');

fs.writeFileSync(outDriverPath, contents);