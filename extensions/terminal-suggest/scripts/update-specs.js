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
];
const indentSearch = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(e => new RegExp('^' + ' '.repeat(e * 2), 'gm'));
const indentReplaceValue = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(e => '\t'.repeat(e));

const specSpecificReplaceStrings = new Map([
	['git', [
		[
			'import { ai } from "@fig/autocomplete-generators";',
			'function ai(...args: any[]): undefined { return undefined; }'
		], [
			'const remoteURLs = out.split("\\n").reduce((dict, line) => {',
			'const remoteURLs = out.split("\\n").reduce<Record<string, string>>((dict, line) => {',
		], [
			'prompt: async ({ executeCommand }) => {',
			'prompt: async ({ executeCommand }: any) => {'
		], [
			'message: async ({ executeCommand }) =>',
			'message: async ({ executeCommand }: any) =>'
		], [
			'if (parts.length > 1) {',
			'if (parts && parts.length > 1) {'
		], [
			'if (seen.has(suggestion.name)) return false;',
			'if (!suggestion) return false;\n\t\t\t\tif (seen.has(suggestion.name)) return false;'
		], [
			'return pp(',
			'return pp?.('
		]
	]],
	['kill', [[
		'out.match(/\\w+/g)',
		'out.match(/\\w+/g)?'
	]]],
	['node', [[
		'const isAdonisJsonPresentCommand = "test -f .adonisrc.json";',
		''
	]]],
	['npm', [
		[
			'keywords?.length > 0 ? `+keywords:${keywords.join(",")}` : "";',
			'keywords && keywords.length > 0 ? `+keywords:${keywords.join(",")}` : "";'
		], [
			'return results.map((item) => ({',
			'return results.map((item: any) => ({'
		], [
			'const suggestions = [];',
			'const suggestions: Fig.Suggestion[] = [];'
		]
	]],
	['nvm', [[
		'const pattern: Fig.Arg = {\n\tname: "pattern",\n};',
		''
	]]],
	['pnpm', [
		[
			'if (parts.length > 1) {',
			'if (parts && parts.length > 1) {'
		], [
			'const packages = postProcess(',
			'if (postProcess === undefined) return undefined;\n\t\tconst packages = postProcess('
		], [
			').map(({ name }) => name as string);',
			')?.filter((e) => e !== null).map(({ name }) => name as string);'
		], [
			'.filter((name) => nodeClis.has(name))',
			'?.filter((name) => nodeClis.has(name))'
		]
	]],
	['ssh', [[
		'const includeLines = await Promise.all(',
		'const includeLines: any = await Promise.all('
	]]],
	['yarn', [[
		'(item) =>',
		'(item: any) =>'
	]]],
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
