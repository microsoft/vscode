/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as byline from 'byline';
import { rgPath } from '@vscode/ripgrep';
import * as Parser from 'tree-sitter';

const { Query } = Parser;
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

async function main() {
	const parser = new Parser();
	parser.setLanguage(typescript);

	const query = new Query(typescript, `
		(
			(call_expression
				function: (member_expression object: (identifier) property: (property_identifier) @registerConfiguration)
				arguments: (arguments	(object	(pair
					key: [(property_identifier)(string)] @properties
					value: (object (pair
						key: [(property_identifier)(string)]
						value: (object (pair
							key: [(property_identifier)(string)] @policy
							value: (object
								(pair key: [(property_identifier)(string)] @name value: (string) @policyName)
								(pair key: [(property_identifier)(string)] @category value: (call_expression function: (identifier) @localize arguments: (arguments (string) @policyCategoryNlsKey (string) @policyCategoryEnglish)))
							)
						))
					))
				)))
			)

			(#eq? @registerConfiguration registerConfiguration)
			(#eq? @properties properties)
			(#eq? @policy policy)
			(#eq? @name name)
			(#eq? @category category)
			(#eq? @localize localize)
		)
	`);

	const files = await getFiles(process.cwd());

	for (const file of files) {
		const contents = await fs.readFile(file, { encoding: 'utf8' });
		const tree = parser.parse(contents);
		const matches = query.matches(tree.rootNode);

		for (const match of matches) {
			for (const capture of match.captures) {
				console.log(capture.name, capture.node.text);
			}
			console.log('---');
		}
	}
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
