/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import cp from 'child_process';
import path from 'path';

let tag = '';
try {
	tag = cp
		.execSync('git describe --tags `git rev-list --tags --max-count=1`')
		.toString()
		.trim();

	const [major, minor] = tag.split('.');
	const shorttag = `${major}.${minor}`;

	const dtsUri = `https://raw.githubusercontent.com/microsoft/vscode/${tag}/src/vscode-dts/vscode.d.ts`;
	const outDtsPath = path.resolve(process.cwd(), 'DefinitelyTyped/types/vscode/index.d.ts');
	cp.execSync(`curl ${dtsUri} --output ${outDtsPath}`);

	updateDTSFile(outDtsPath, shorttag);

	const outPackageJsonPath = path.resolve(process.cwd(), 'DefinitelyTyped/types/vscode/package.json');
	const packageJson = JSON.parse(fs.readFileSync(outPackageJsonPath, 'utf-8'));
	packageJson.version = shorttag + '.9999';
	fs.writeFileSync(outPackageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

	console.log(`Done updating vscode.d.ts at ${outDtsPath} and package.json to version ${packageJson.version}`);
} catch (err) {
	console.error(err);
	console.error('Failed to update types');
	process.exit(1);
}

function updateDTSFile(outPath: string, shorttag: string) {
	const oldContent = fs.readFileSync(outPath, 'utf-8');
	const newContent = getNewFileContent(oldContent, shorttag);

	fs.writeFileSync(outPath, newContent);
}

function repeat(str: string, times: number): string {
	const result = new Array(times);
	for (let i = 0; i < times; i++) {
		result[i] = str;
	}
	return result.join('');
}

function convertTabsToSpaces(str: string): string {
	return str.replace(/\t/gm, value => repeat('    ', value.length));
}

function getNewFileContent(content: string, shorttag: string) {
	const oldheader = [
		`/*---------------------------------------------------------------------------------------------`,
		` *  Copyright (c) Microsoft Corporation. All rights reserved.`,
		` *  Licensed under the MIT License. See License.txt in the project root for license information.`,
		` *--------------------------------------------------------------------------------------------*/`
	].join('\n');

	return convertTabsToSpaces(getNewFileHeader(shorttag) + content.slice(oldheader.length));
}

function getNewFileHeader(shorttag: string) {
	const header = [
		`// Type definitions for Visual Studio Code ${shorttag}`,
		`// Project: https://github.com/microsoft/vscode`,
		`// Definitions by: Visual Studio Code Team, Microsoft <https://github.com/microsoft>`,
		`// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped`,
		``,
		`/*---------------------------------------------------------------------------------------------`,
		` *  Copyright (c) Microsoft Corporation. All rights reserved.`,
		` *  Licensed under the MIT License.`,
		` *  See https://github.com/microsoft/vscode/blob/main/LICENSE.txt for license information.`,
		` *--------------------------------------------------------------------------------------------*/`,
		``,
		`/**`,
		` * Type Definition for Visual Studio Code ${shorttag} Extension API`,
		` * See https://code.visualstudio.com/api for more information`,
		` */`
	].join('\n');

	return header;
}
