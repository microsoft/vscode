"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const byline = require("byline");
const ripgrep_1 = require("@vscode/ripgrep");
const Parser = require("tree-sitter");
const { typescript } = require('tree-sitter-typescript');
async function getFiles(root) {
    return new Promise((c, e) => {
        const result = [];
        const rg = (0, child_process_1.spawn)(ripgrep_1.rgPath, ['-l', 'registerConfiguration\\(', '-g', 'src/**/*.ts', '-g', '!src/**/test/**', root]);
        const stream = byline(rg.stdout.setEncoding('utf8'));
        stream.on('data', path => result.push(path));
        stream.on('error', err => e(err));
        stream.on('end', () => c(result));
    });
}
async function* getPolicies(parser, query, path) {
    const contents = await fs_1.promises.readFile(path, { encoding: 'utf8' });
    const tree = parser.parse(contents);
    const matches = query.matches(tree.rootNode);
    for (const match of matches) {
        const name = match.captures.filter(c => c.name === 'name')[0]?.node.text;
        const category = match.captures.filter(c => c.name === 'category')[0]?.node.text;
        const categoryNlsKey = match.captures.filter(c => c.name === 'categoryNlsKey')[0]?.node.text;
        if (category) {
            if (categoryNlsKey) {
                yield { name, category: { name: category, nlsKey: categoryNlsKey } };
            }
            else {
                yield { name, category: { name: category } };
            }
        }
        else {
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
