/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, suite, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../../azure-pipelines/common/checkForArtifact.ts', import.meta.url));

interface RunResult {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly stdout: string;
	readonly stderr: string;
}

function run(args: string[], buildsApiUrl: string): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [scriptPath, ...args], {
			env: { ...process.env, BUILDS_API_URL: buildsApiUrl, SYSTEM_ACCESSTOKEN: 'token' },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8').on('data', (chunk: string) => stdout += chunk);
		child.stderr.setEncoding('utf8').on('data', (chunk: string) => stderr += chunk);
		const timeout = setTimeout(() => child.kill(), 30_000);
		child.on('error', reject);
		child.on('close', (code, signal) => {
			clearTimeout(timeout);
			resolve({ code, signal, stdout, stderr });
		});
	});
}

function setVariables(stdout: string): Record<string, string> {
	return Object.fromEntries([...stdout.matchAll(/^##vso\[task\.setvariable variable=(\w+)\](\w+)\r?$/gm)].map(m => [m[1], m[2]]));
}

suite('checkForArtifact', () => {
	let server: Server;
	let baseUrl: string;

	before(async () => {
		server = createServer((req, res) => {
			if (req.url?.startsWith('/builds/1/artifacts?')) {
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify({ value: [{ name: 'published_archive' }, { name: 'published_archive_sbom' }] }));
			} else {
				res.statusCode = 404;
				res.end();
			}
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	after(async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
	});

	test('reports each artifact and exits on its own', async () => {
		const result = await run(['PUBLISHED', 'published_archive', 'MISSING', 'missing_setup'], `${baseUrl}/builds/1/`);

		assert.deepStrictEqual({ code: result.code, signal: result.signal, variables: setVariables(result.stdout) }, {
			code: 0,
			signal: null,
			variables: { PUBLISHED: 'true', MISSING: 'false' },
		});
	});

	test('treats every artifact as not published when the lookup fails', async () => {
		const result = await run(['FIRST', 'published_archive', 'SECOND', 'missing_setup'], `${baseUrl}/unknown/`);

		assert.deepStrictEqual({ code: result.code, variables: setVariables(result.stdout) }, {
			code: 0,
			variables: { FIRST: 'false', SECOND: 'false' },
		});
		assert.match(result.stderr, /Failed to get pipeline artifacts/);
	});

	test('fails on an incomplete variable and artifact pair', async () => {
		const result = await run(['ONLY_VARIABLE'], `${baseUrl}/builds/1/`);

		assert.strictEqual(result.code, 1);
		assert.match(result.stderr, /Usage: node checkForArtifact\.ts/);
	});

	test('does not call process.exit, which crashes Node on Windows while fetch is still closing its connection', () => {
		assert.doesNotMatch(readFileSync(scriptPath, 'utf8'), /process\.exit\(/);
	});
});
