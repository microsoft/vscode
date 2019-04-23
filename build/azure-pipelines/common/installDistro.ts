/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as  cp from 'child_process';

function yarnInstall(packageName: string): void {
	cp.execSync(`yarn add --no-lockfile ${packageName}`);
}

const product = require('../../../product.json');
const dependencies = product.dependencies || {} as { [name: string]: string; };

Object.keys(dependencies).forEach(name => {
	const url = dependencies[name];
	yarnInstall(url);
});