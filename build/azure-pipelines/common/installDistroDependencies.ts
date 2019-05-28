/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

function yarnInstall(packageName: string, cwd: string): void {
	console.log(`yarn add --no-lockfile ${packageName}`, cwd);
	cp.execSync(`yarn add --no-lockfile ${packageName}`, { cwd, stdio: 'inherit' });
}

/**
 * Install additional dependencies listed on each quality `package.json` file.
 */
function main() {
	const quality = process.env['VSCODE_QUALITY'];

	if (!quality) {
		throw new Error('Missing VSCODE_QUALITY, can\'t install distro');
	}

	const rootPath = path.dirname(path.dirname(path.dirname(__dirname)));
	const qualityPath = path.join(rootPath, 'quality', quality);
	const packagePath = path.join(qualityPath, 'package.json');
	const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
	const dependencies = pkg.dependencies || {} as { [name: string]: string; };

	Object.keys(dependencies).forEach(name => {
		const url = dependencies[name];
		const cwd = process.argv.length < 3 ? process.cwd() : path.join(process.cwd(), process.argv[2]);
		yarnInstall(url, cwd);
	});
}

main();