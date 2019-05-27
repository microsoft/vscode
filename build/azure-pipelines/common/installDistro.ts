/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';

function yarnInstall(packageName: string, cwd: string): void {
	cp.execSync(`yarn add --no-lockfile ${packageName}`, { cwd });
}

const product = require('../../../product.json');
const dependencies = product.dependencies || {} as { [name: string]: string; };

Object.keys(dependencies).forEach(name => {
	const url = dependencies[name];
	const cwd = process.argv.length < 3 ? process.cwd() : path.join(process.cwd(), process.argv[2]);
	yarnInstall(url, cwd);
});