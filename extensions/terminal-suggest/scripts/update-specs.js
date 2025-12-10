/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const fs = require('fs');
const path = require('path');

const upstreamSpecs = require('../out/constants.js').upstreamSpecs;
const extRoot = path.resolve(path.join(__dirname, '..'));
const replaceStrings = [
	[
		'import { filepaths } from "@fig/autocomplete-generators";',
		'import { filepaths } from \'../../helpers/filepaths\';'
	],
	[
		'import { filepaths, keyValue } from "@fig/autocomplete-generators";',
		'import { filepaths } from \'../../helpers/filepaths\'; import { keyValue } from \'../../helpers/keyvalue\';'
	],
];
const indentSearch = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(e => new RegExp('^' + ' '.repeat(e * 2), 'gm'));
const indentReplaceValue = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(e => '\t'.repeat(e));

const specSpecificReplaceStrings = new Map([
	['docker', [
		[
			'console.error(error);',
			'console.error(error); return null!;'
		]
	]],
	['dotnet', [
		[
			'.match(argRegex)',
			'.match(argRegex)!'
		], [
			'"https://upload.wikimedia.org/wikipedia/commons/7/7d/Microsoft_.NET_logo.svg";',
			'undefined;',
		]
	]],
	['gh', [
		[
			'const parts = elm.match(/\\S+/g);',
			'const parts = elm.match(/\\S+/g)!;'
		],
		[
			'description: repo.description,',
			'description: repo.description ?? undefined,'
		],
		[
			'icon: "fig://icon?type=git"',
			'icon: "vscode://icon?type=11"'
		]
	]],
	['git', [
		[
			'import { ai } from "@fig/autocomplete-generators";',
			'function ai(...args: any[]): undefined { return undefined; }'
		], [
			'prompt: async ({ executeCommand }) => {',
			'prompt: async ({ executeCommand }: any) => {'
		], [
			'message: async ({ executeCommand }) =>',
			'message: async ({ executeCommand }: any) =>'
		]
	]],
	['yo', [
		[
			'icon: "https://avatars.githubusercontent.com/u/1714870?v=4",',
			'icon: undefined,',
		]
	]],
]);

for (const spec of upstreamSpecs) {
	const source = path.join(extRoot, `third_party/autocomplete/src/${spec}.ts`);
	const destination = path.join(extRoot, `src/completions/upstream/${spec}.ts`);
	fs.copyFileSync(source, destination);

	let content = fs.readFileSync(destination).toString();
	for (const replaceString of replaceStrings) {
		content = content.replaceAll(replaceString[0], replaceString[1]);
	}
	for (let i = 0; i < indentSearch.length; i++) {
		content = content.replaceAll(indentSearch[i], indentReplaceValue[i]);
	}
	const thisSpecReplaceStrings = specSpecificReplaceStrings.get(spec);
	if (thisSpecReplaceStrings) {
		for (const replaceString of thisSpecReplaceStrings) {
			content = content.replaceAll(replaceString[0], replaceString[1]);
		}
	}

	fs.writeFileSync(destination, content);
}
