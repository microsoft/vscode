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

interface NlsString {
	readonly value: string;
	readonly nlsKey: string;
}

interface BasePolicy {
	readonly name: string;
	readonly description: string | NlsString;
	readonly category?: string | NlsString;
}

interface StringEnumPolicy extends BasePolicy {
	readonly type: 'string';
	readonly enum: (string | NlsString)[];
	readonly enumDescriptions: (string | NlsString)[];
}

type Policy = StringEnumPolicy;

// ---

interface QType<T> {
	Q: string;
	value(matches: Parser.QueryMatch[]): T | undefined;
}

const StringQ: QType<string | NlsString> = {
	Q: `[
		(string (string_fragment) @value)
		(call_expression function: (identifier) @localizeFn arguments: (arguments (string (string_fragment) @nlsKey) (string (string_fragment) @value)) (#eq? @localizeFn localize))
	]`,

	value(matches: Parser.QueryMatch[]): string | NlsString | undefined {
		const match = matches[0];

		if (!match) {
			return undefined;
		}

		const value = match.captures.filter(c => c.name === 'value')[0]?.node.text;

		if (!value) {
			throw new Error(`Missing required 'value' property.`);
		}

		const nlsKey = match.captures.filter(c => c.name === 'nlsKey')[0]?.node.text;

		if (nlsKey) {
			return { value, nlsKey };
		} else {
			return value;
		}
	}
};

const StringArrayQ: QType<(string | NlsString)[]> = {
	Q: `(array ${StringQ.Q})`,

	value(matches: Parser.QueryMatch[]): (string | NlsString)[] | undefined {
		return matches.map(match => {
			return StringQ.value([match]) as string | NlsString;
		});
	}
};

function getProperty<T>(qtype: QType<T>, node: Parser.SyntaxNode, key: string): T | undefined {
	const query = new Parser.Query(
		typescript,
		`(
			(pair
				key: [(property_identifier)(string)] @key
				value: ${qtype.Q}
			)
			(#eq? @key ${key})
		)`
	);

	return qtype.value(query.matches(node));
}

function getStringProperty(node: Parser.SyntaxNode, key: string): string | NlsString | undefined {
	return getProperty(StringQ, node, key);
}

function getStringArrayProperty(node: Parser.SyntaxNode, key: string): (string | NlsString)[] | undefined {
	return getProperty(StringArrayQ, node, key);
}

// ---

function getPolicy(settingNode: Parser.SyntaxNode, policyNode: Parser.SyntaxNode): Policy {
	const name = getStringProperty(policyNode, 'name');

	if (!name) {
		throw new Error(`Missing required 'name' property.`);
	}

	if (typeof name !== 'string') {
		throw new Error(`Property 'name' should be a literal string.`);
	}

	const description = getStringProperty(settingNode, 'description');

	if (!description) {
		throw new Error(`Missing required 'description' property.`);
	}

	const type = getStringProperty(settingNode, 'type');

	if (!type) {
		throw new Error(`Missing required 'type' property.`);
	}

	if (type !== 'string') {
		throw new Error(`TODO`);
	}

	const _enum = getStringArrayProperty(settingNode, 'enum');

	if (!_enum) {
		throw new Error(`TODO`);
	}

	const enumDescriptions = getStringArrayProperty(settingNode, 'enumDescriptions');

	if (!enumDescriptions) {
		throw new Error(`TODO`);
	}

	const category = getStringProperty(policyNode, 'category');

	if (category) {
		return { name, description, type, enum: _enum, enumDescriptions, category };
	} else {
		return { name, description, type, enum: _enum, enumDescriptions };
	}
}

function getPolicies(node: Parser.SyntaxNode): Policy[] {
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
							value: (object) @policy
						))
					)) @setting
				)))
			)
		)
	`);

	return query.matches(node).map(m => {
		const settingNode = m.captures.filter(c => c.name === 'setting')[0].node;
		const policyNode = m.captures.filter(c => c.name === 'policy')[0].node;
		return getPolicy(settingNode, policyNode);
	});
}

// ---

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

// ---

async function main() {
	const parser = new Parser();
	parser.setLanguage(typescript);

	const files = await getFiles(process.cwd());

	for (const file of files) {
		const contents = await fs.readFile(file, { encoding: 'utf8' });
		const tree = parser.parse(contents);

		for (const policy of getPolicies(tree.rootNode)) {
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
