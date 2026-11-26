/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';

type YamlObject = { [key: string]: YamlNode };
type YamlNode = string | number | boolean | null | YamlNode[] | YamlObject;

const parameter = 'VSCODE_PRIVILEGED_CONNECTIONS';

test('only builds of main and release/* branches get the privileged service connections', async () => {
	const root = new URL('../../azure-pipelines/', import.meta.url);
	const files = new Map<string, YamlNode>();
	for (const file of (await readdir(root, { recursive: true })).map(file => file.replaceAll('\\', '/')).filter(file => file.endsWith('.yml')).sort()) {
		files.set(file, load(await readFile(new URL(file, root), 'utf8')) as YamlNode);
	}
	const visit = (node: YamlNode, callback: (node: YamlObject) => void): void => {
		if (Array.isArray(node)) {
			node.forEach(child => visit(child, callback));
		} else if (node && typeof node === 'object') {
			callback(node);
			Object.values(node).forEach(child => visit(child, callback));
		}
	};

	// A template that declares the parameter without a default fails every caller that doesn't pass it at queue time.
	const violations: string[] = [];
	const declaring = new Set<string>();
	const variables = new Map<string, YamlNode>();
	for (const [file, document] of files) {
		const declaration = (document as { parameters?: YamlObject[] } | null)?.parameters?.find(declaration => declaration.name === parameter);
		if (declaration) {
			declaring.add(file);
			if (declaration.default !== undefined) {
				violations.push(`${file}: default ${declaration.default}`);
			}
		}
		visit(document, node => {
			if (node.name === parameter && node.value !== undefined) {
				if (variables.has(file)) {
					violations.push(`${file}: defines ${parameter} more than once`);
				}
				variables.set(file, node.value);
			}
		});
	}

	for (const [file, document] of files) {
		visit(document, node => {
			const reference = typeof node.template === 'string' ? /^(?<path>.+)@self$/.exec(node.template)?.groups?.path : undefined;
			const template = reference?.startsWith('build/azure-pipelines/') ? reference.slice('build/azure-pipelines/'.length) : reference && posix.join(posix.dirname(file), reference);
			if (!template || !declaring.has(template)) {
				return;
			}
			const value = (node.parameters as YamlObject | null | undefined)?.[parameter];
			if (value !== false
				&& !(value === `\${{ parameters.${parameter} }}` && declaring.has(file))
				&& !(value === `\${{ variables.${parameter} }}` && variables.has(file))) {
				violations.push(`${file} -> ${template}: ${value === undefined ? 'missing' : value}`);
			}
		});
	}

	// The universal job only merges and signs, and its stage would be empty without it, so the stage itself must require
	// the switch, directly or through a variable defined in the same file.
	for (const [file, document] of files) {
		const definitions = new Map<string, string>();
		visit(document, node => {
			if (typeof node.name === 'string' && typeof node.value === 'string') {
				definitions.set(node.name, node.value);
			}
		});
		const requiresSwitch = (condition: string) => condition.includes(parameter)
			|| [...condition.matchAll(/variables(?:\['(?<bracket>\w+)'\]|\.(?<dot>\w+))/g)].some(match => definitions.get(match.groups?.bracket ?? match.groups?.dot ?? '')?.includes(parameter));
		visit(document, node => {
			for (const [key, value] of Object.entries(node)) {
				const condition = /^\$\{\{ if (?<condition>.+) \}\}$/.exec(key)?.groups?.condition;
				const signs = Array.isArray(value) && value.some(stage => JSON.stringify((stage as YamlObject | null)?.jobs ?? []).includes('darwin/product-build-darwin-universal.yml@self'));
				if (condition && signs && !requiresSwitch(condition)) {
					violations.push(`${file}: macOS universal stage runs without ${parameter}`);
				}
			}
		});
	}

	const branches = '${{ or(eq(variables[\'Build.SourceBranch\'], \'refs/heads/main\'), startsWith(variables[\'Build.SourceBranch\'], \'refs/heads/release/\')) }}';
	assert.deepStrictEqual({ violations, variables: Object.fromEntries(variables) }, {
		violations: [],
		variables: {
			'product-build-TSA.yml': branches,
			'product-build.yml': branches,
		},
	});
});
