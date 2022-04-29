"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const byline = require("byline");
const ripgrep_1 = require("@vscode/ripgrep");
const Parser = require("tree-sitter");
const { typescript } = require('tree-sitter-typescript');
function getName(node) {
    const query = new Parser.Query(typescript, `((pair key: [(property_identifier)(string)] @key value: (string (string_fragment) @name)) (#eq? @key name))`);
    const matches = query.matches(node);
    return matches[0]?.captures.filter(c => c.name === 'name')[0]?.node.text;
}
function getCategory(node) {
    const query = new Parser.Query(typescript, `
		(pair
			key: [(property_identifier)(string)] @categoryKey (#eq? @categoryKey category)
			value: [
				(string (string_fragment) @name)
				(call_expression function: (identifier) @localizeFn arguments: (arguments (string (string_fragment) @nlsKey) (string (string_fragment) @name)))
			]
		)
	`);
    const matches = query.matches(node);
    const match = matches[0];
    if (!match) {
        return undefined;
    }
    const name = match.captures.filter(c => c.name === 'name')[0]?.node.text;
    if (!name) {
        throw new Error(`Category missing required 'name' property.`);
    }
    const nlsKey = match.captures.filter(c => c.name === 'nlsKey')[0]?.node.text;
    if (nlsKey) {
        return { name, nlsKey };
    }
    else {
        return { name };
    }
}
function getPolicy(node) {
    const name = getName(node);
    if (!name) {
        throw new Error(`Missing required 'name' property.`);
    }
    const category = getCategory(node);
    if (category) {
        return { name, category };
    }
    else {
        return { name };
    }
}
function getPolicies(node) {
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
							value: (object) @result
						))
					))
				)))
			)
		)
	`);
    return query.matches(node)
        .map(m => m.captures.filter(c => c.name === 'result')[0].node)
        .map(getPolicy);
}
function nodeAsString(node) {
    return `${node.startPosition.row + 1}:${node.startPosition.column + 1}`;
}
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
async function main() {
    const parser = new Parser();
    parser.setLanguage(typescript);
    const files = await getFiles(process.cwd());
    let fail = false;
    for (const file of files) {
        const contents = await fs_1.promises.readFile(file, { encoding: 'utf8' });
        const tree = parser.parse(contents);
        try {
            for (const policy of getPolicies(tree.rootNode)) {
                console.log(policy);
            }
        }
        catch (err) {
            fail = true;
            console.error(`[${(0, path_1.relative)(process.cwd(), file)}:${nodeAsString(node)}] ${err.message}`);
        }
    }
    if (fail) {
        throw new Error('Failed parsing policies');
    }
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
