/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { extractMcpConfiguration, validateMcpInputReferences } from '../../vscode-node/mcpConfigurationGeneration';
import { McpPickRef } from '../../vscode-node/mcpToolCallingTools';

describe('MCP configuration generation', () => {
	const schema = {
		type: 'object',
		required: ['name', 'command'],
		additionalProperties: false,
		properties: { name: { type: 'string' }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } },
	};
	for (const value of [
		{ name: 'server', command: 'node' },
		{ mcpServers: { server: { command: 'node' } } },
		{ servers: { server: { command: 'node' } } },
	]) {
		it(`extracts one server from ${JSON.stringify(value)}`, () => {
			expect(extractMcpConfiguration('```json\n' + JSON.stringify(value) + '\n```', schema)).toEqual({ name: 'server', server: { command: 'node' } });
		});
	}
	for (const response of ['not json', 'null', '[]', '{}', '{"name":"server","command":5}', '{"name":"server","command":"node","args":[1]}',
		'{"mcpServers":{"a":{"command":"node"},"b":{"command":"node"}}}', '{"mcpServers":{}}',
		'{"mcpServers":{"a":{"command":"node"}},"inputs":[]}',
		'```json\n{"name":"a","command":"node"}\n```\n```json\n{"name":"b","command":"node"}\n```']) {
		it(`rejects malformed or ambiguous output: ${response}`, () => {
			expect(() => extractMcpConfiguration(response, schema)).toThrow('Expected exactly one named MCP server');
		});
	}
	it('uses the supplied schema without converting the dialect', () => {
		const server = { type: 'sse', url: 'https://example.com', oauthClientId: 'client' };
		expect(extractMcpConfiguration(JSON.stringify({ name: 'remote', ...server }), { type: 'object' })).toEqual({ name: 'remote', server });
	});
	it('returns opaque references so embedded and repeated answers never reach the model', () => {
		const ref = new McpPickRef(new Promise(() => { }), 'workspaceRoot');
		try {
			const first = ref.recordInput('Token', 'secret');
			const second = ref.recordInput('Token', 'different-secret');
			expect({
				unique: first !== second,
				reference: first === '${input:' + ref.picks[0].id + '}',
				embedded: `Bearer ${first}`.includes('secret'),
				values: ref.picks.map(p => p.choice),
			}).toEqual({ unique: true, reference: true, embedded: false, values: ['secret', 'different-secret'] });
		} finally {
			ref.dispose();
		}
	});
	it('uses user-selected environment names rather than model IDs or collected secrets', () => {
		const ref = new McpPickRef(new Promise(() => { }), 'copilotGlobal');
		try {
			expect([ref.recordInput('API key', 'MY_API_KEY'), ref.picks]).toEqual(['${MY_API_KEY}', []]);
			expect(() => ref.recordInput('API key', 'secret-value')).toThrow('environment variable name');
		} finally {
			ref.dispose();
		}
	});
	it('rejects dropped, encoded and invented input references', () => {
		const reference = '${input:token}';
		expect(() => validateMcpInputReferences({ args: [`--token=${reference}`, reference] }, [reference], 'vscode')).not.toThrow();
		expect(() => validateMcpInputReferences({ args: [encodeURIComponent(reference)] }, [reference], 'vscode')).toThrow('input references');
		expect(() => validateMcpInputReferences({ args: [reference] }, [], 'vscode')).toThrow('input references');
		expect(() => validateMcpInputReferences({ args: [reference] }, [reference], 'copilotGlobal')).toThrow('input references');
		expect(() => validateMcpInputReferences({ command: 'node' }, ['${TOKEN}'], 'copilotGlobal')).toThrow('input references');
	});
});
