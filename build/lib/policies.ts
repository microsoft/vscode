/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as byline from 'byline';
import { rgPath } from '@vscode/ripgrep';
import * as Parser from 'tree-sitter';
const { typescript } = require('tree-sitter-typescript');

async function getFiles(root: string): Promise<string[]> {
	return new Promise((c, e) => {
		const result: string[] = [];
		const rg = spawn(rgPath, ['-l', 'registerConfiguration\\(', '-g', 'src/**/*.ts', '-g', '!src/**/test/**', root]);
		const stream = byline(rg.stdout.setEncoding('utf8'));
		stream.on('data', path => result.push(path));
		stream.on('error', err => e(err));
		stream.on('end', () => c(result));
	});
}

interface Policy {
	readonly name: string;
	readonly category?: {
		readonly name: string;
		readonly nlsKey?: string;
	};
}

async function* getPolicies(parser: Parser, query: Parser.Query, path: string): AsyncGenerator<Policy> {
	const contents = await fs.readFile(path, { encoding: 'utf8' });
	const tree = parser.parse(contents);
	const matches = query.matches(tree.rootNode);

	for (const match of matches) {
		const name = match.captures.filter(c => c.name === 'name')[0]?.node.text;
		const category = match.captures.filter(c => c.name === 'category')[0]?.node.text;
		const categoryNlsKey = match.captures.filter(c => c.name === 'categoryNlsKey')[0]?.node.text;

		if (category) {
			if (categoryNlsKey) {
				yield { name, category: { name: category, nlsKey: categoryNlsKey } };
			} else {
				yield { name, category: { name: category } };
			}
		} else {
			yield { name };
		}
	}
}

async function main() {
	const parser = new Parser();
	parser.setLanguage(typescript);
	const query = new Parser.Query(typescript, `
		(
			(call_expression
				function: (member_expression object: (identifier) property: (property_identifier) @registerConfigurationFn) (#eq? @registerConfigurationFn registerConfiguration)
				arguments: (arguments	(object	(pair
					key: [(property_identifier)(string)] @propertiesKey (#eq? @propertiesKey properties)
					value: (object (pair
						key: [(property_identifier)(string)]
						value: (object (pair
							key: [(property_identifier)(string)] @policyKey (#eq? @policyKey policy)
							value: (object
								(pair key: [(property_identifier)(string)] @nameKey value: (string (string_fragment) @name)) (#eq? @nameKey name)
								(pair
										key: [(property_identifier)(string)] @categoryKey
										value: [
											(string (string_fragment) @category)
											(call_expression function: (identifier) @localizeFn arguments: (arguments (string (string_fragment) @categoryNlsKey) (string (string_fragment) @category)))
										]
								)?
								(#eq? @categoryKey category)
								(#eq? @localizeFn localize)
							)
						))
					))
				)))
			)
		)
	`);

	const files = await getFiles(process.cwd());

	for (const file of files) {
		for await (const policy of getPolicies(parser, query, file)) {
			console.log(policy);
		}
	}
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
