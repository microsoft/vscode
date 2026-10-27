/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import path from 'node:path';
import { controls, curateFixtures } from './controls.mjs';

function readResult(result) {
	const text = result.content?.filter(item => item.type === 'text').map(item => item.text) ?? [];
	if (result.isError) {
		throw new Error(text.join('\n') || 'Component Explorer could not load its catalog');
	}
	if (text.length !== 1) {
		throw new Error(`Component Explorer reported an incomplete catalog: ${text.join('\n')}`);
	}
	return JSON.parse(text[0]);
}

export function selectFixtureSession(sessions, explorerUrl) {
	if (!Array.isArray(sessions)) {
		throw new Error('Component Explorer returned invalid session metadata');
	}
	const available = sessions.filter(item => typeof item.name === 'string' && typeof item.serverUrl === 'string');
	const session = explorerUrl
		? available.find(item => new URL(item.serverUrl).origin === new URL(explorerUrl).origin)
		: available.find(item => item.name === 'current') ?? (available.length === 1 ? available[0] : undefined);
	if (!session) {
		throw new Error(explorerUrl
			? 'This URL does not match a running Component Explorer session for this checkout'
			: 'No unambiguous current Component Explorer session is available. Start the repository Component Explorer Server task or enter its URL.');
	}
	const url = new URL('/___explorer', session.serverUrl);
	if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password) {
		throw new Error('The fixture renderer must use a loopback HTTP address without credentials.');
	}
	return { session, explorerUrl: url.href };
}

export async function loadFixtureCatalog(root, explorerUrl) {
	const require = createRequire(path.join(root, 'package.json'));
	let Client;
	let StdioClientTransport;
	try {
		({ Client } = require('@modelcontextprotocol/sdk/client/index.js'));
		({ StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js'));
	} catch (error) {
		throw new Error(`Fixture discovery needs the repository's MCP SDK dependency: ${error.message}`);
	}
	const transport = new StdioClientTransport({
		command: process.versions.electron ? 'node' : process.execPath,
		args: [path.join(root, 'node_modules/@vscode/component-explorer-cli/dist/index.js'), 'mcp',
			'--project', path.join(root, 'test/componentFixtures/component-explorer.json'),
			'--use-daemon', '--no-daemon-autostart'],
		cwd: root,
		env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
		stderr: 'pipe',
	});
	const client = new Client({ name: 'vscode-design-system', version: '1.0.0' });
	transport.stderr?.resume();
	try {
		await client.connect(transport, { timeout: 15000 });
		const sessions = readResult(await client.callTool({ name: 'sessions', arguments: {} }, undefined, { timeout: 20000 }));
		const selected = selectFixtureSession(sessions, explorerUrl);
		const { session } = selected;
		const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const groups = controls.flatMap(control => control.groups);
		const fixtures = readResult(await client.callTool({
			name: 'list_fixtures',
			arguments: { sessionName: session.name, fixtureIdRegex: `^(?:${groups.map(escape).join('|')})/` },
		}, undefined, { timeout: 20000 }));
		return { controls: curateFixtures(fixtures), session: session.name, explorerUrl: selected.explorerUrl, sourceTreeId: session.sourceTreeId };
	} finally {
		try {
			await client.close();
		} finally {
			await transport.close();
		}
	}
}
