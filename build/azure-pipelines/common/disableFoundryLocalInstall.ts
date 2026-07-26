/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

const packageJsonPath = path.resolve(import.meta.dirname, '../../..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
	dependencies?: Record<string, string>;
	allowScripts?: Record<string, boolean>;
};
const allowScripts = packageJson.allowScripts;
const foundryLocalVersion = packageJson.dependencies?.['foundry-local-sdk'];
const foundryLocalKey = foundryLocalVersion ? `foundry-local-sdk@${foundryLocalVersion}` : undefined;

if (!allowScripts || !foundryLocalKey || allowScripts[foundryLocalKey] !== true) {
	throw new Error('Expected an approved, pinned foundry-local-sdk install script in package.json');
}

allowScripts[foundryLocalKey] = false;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, undefined, 2)}\n`);
console.log(`Disabled ${foundryLocalKey} install scripts for this CI job`);
