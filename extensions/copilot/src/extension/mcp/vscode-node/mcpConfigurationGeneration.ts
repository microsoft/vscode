/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Ajv from 'ajv';
import { JsonSchema } from '../../../platform/configuration/common/jsonSchema';
import { extractCodeBlocks } from '../../../util/common/markdown';

export type McpTargetFormat = 'vscode' | 'workspaceRoot' | 'copilotGlobal';

/** Validates the core-owned schema without converting the destination's dialect. */
export function extractMcpConfiguration(response: string, schema: JsonSchema): { name: string; server: Record<string, unknown> } {
	const ajv = new Ajv({ strict: false });
	ajv.addFormat('uri', value => {
		// A numeric placeholder works in hostnames, ports, paths and query parameters.
		const uri = value.replace(/\$\{(?:(?:input|env):[A-Za-z0-9_.-]+|[A-Z_][A-Z0-9_]*)\}/g, '1');
		return !/[\s\u0000-\u001f\u007f\\{}<>"`^|]/.test(uri)
			&& !/%(?![0-9a-f]{2})/i.test(uri)
			&& !/^https?:\/\/[/?#]/i.test(uri)
			&& URL.canParse(uri);
	});
	const validate = ajv.compile(schema);
	const blocks = extractCodeBlocks(response);
	const candidates = blocks.length ? blocks.map(block => block.code) : [response];
	const results: { name: string; server: Record<string, unknown> }[] = [];
	for (const text of candidates) {
		let value: unknown;
		try {
			value = JSON.parse(text);
		} catch {
			continue;
		}
		if (!isObject(value)) {
			continue;
		}
		const wrapper = value.mcpServers ?? value.servers;
		if (wrapper !== undefined) {
			if (Object.keys(value).length !== 1 || !isObject(wrapper) || Object.keys(wrapper).length !== 1) {
				continue;
			}
			const [name, server] = Object.entries(wrapper)[0];
			if (!isObject(server) || Object.hasOwn(server, 'name')) {
				continue;
			}
			value = { ...server, name };
		}
		if (isObject(value) && typeof value.name === 'string' && value.name.trim() && validate(value)) {
			const { name, ...server } = value;
			results.push({ name, server });
		}
	}
	if (results.length !== 1) {
		// Do not include model output or validator paths: both may contain credentials.
		throw new Error('Expected exactly one named MCP server matching the destination schema.');
	}
	return results[0];
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Ensures answers are used verbatim and the model has not invented unresolved input references. */
export function validateMcpInputReferences(server: Record<string, unknown>, references: readonly string[], format: McpTargetFormat): void {
	const strings: string[] = [];
	const visit = (value: unknown): void => {
		if (typeof value === 'string') {
			strings.push(value);
		} else if (Array.isArray(value)) {
			value.forEach(visit);
		} else if (isObject(value)) {
			Object.values(value).forEach(visit);
		}
	};
	visit(server);
	if (references.some(reference => !strings.some(value => value.includes(reference)))
		|| strings.some(value => [...value.matchAll(/\$\{input:[^}]*\}/g)].some(match => format === 'copilotGlobal' || !references.includes(match[0])))) {
		throw new Error('Generated MCP configuration did not preserve the supplied input references.');
	}
}
