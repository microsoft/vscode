/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { load } from 'js-yaml';

type YamlNode = string | number | boolean | null | YamlNode[] | { [key: string]: YamlNode };

const parameter = 'VSCODE_PRIVILEGED_CONNECTIONS';

test('dev builds turn off the privileged steps of every template that has them', async () => {
	const pipeline = load(await readFile(new URL('../../azure-pipelines/product-build.yml', import.meta.url), 'utf8')) as {
		variables: { name: string; value?: string }[];
		extends: { parameters: { stages: YamlNode } };
	};
	const calls: { path: string; parameters: { [key: string]: YamlNode } }[] = [];
	const visit = (node: YamlNode): void => {
		if (Array.isArray(node)) {
			node.forEach(visit);
		} else if (node && typeof node === 'object') {
			const path = typeof node.template === 'string' ? /^build\/azure-pipelines\/(?<path>.+)@self$/.exec(node.template)?.groups?.path : undefined;
			if (path) {
				calls.push({ path, parameters: (node.parameters ?? {}) as { [key: string]: YamlNode } });
			}
			Object.values(node).forEach(visit);
		}
	};
	visit(pipeline.extends.parameters.stages);

	const declares = new Map<string, boolean>();
	for (const { path } of calls) {
		if (!declares.has(path)) {
			const source = await readFile(new URL(`../../azure-pipelines/${path}`, import.meta.url), 'utf8');
			declares.set(path, source.includes(`- name: ${parameter}`));
		}
	}
	const missing = calls
		.filter(call => declares.get(call.path) && call.parameters[parameter] !== `\${{ variables.${parameter} }}`)
		.map(call => [call.path, ...['VSCODE_ARCH', 'VSCODE_JOB_NAME', 'mobile'].filter(key => call.parameters[key] !== undefined).map(key => `${key}=${call.parameters[key]}`)].join(' '));

	assert.deepStrictEqual({
		missing,
		privilegedConnections: pipeline.variables.find(variable => variable.name === parameter)?.value,
	}, {
		missing: [],
		privilegedConnections: '${{ or(eq(variables[\'Build.SourceBranch\'], \'refs/heads/main\'), startsWith(variables[\'Build.SourceBranch\'], \'refs/heads/release/\')) }}',
	});
});
