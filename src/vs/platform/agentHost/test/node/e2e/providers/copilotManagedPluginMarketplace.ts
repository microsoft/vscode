/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile, spawn } from 'child_process';
import { existsSync } from 'fs';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { mkdir, rm, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { promisify } from 'util';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { dirname, join } from '../../../../../../base/common/path.js';
import { initTestGitRepo } from '../harness/agentHostE2ETestHarness.js';

const execFileAsync = promisify(execFile);
const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire('http') as typeof import('http');

export interface IManagedPluginDefinition {
	readonly name: string;
	readonly version: string;
	readonly skillName: string;
}

export interface IManagedPluginMarketplaceRequestGate {
	readonly started: Promise<void>;
	release(): void;
}

export interface IManagedPluginMarketplace {
	readonly name: string;
	readonly sourceUrl: string;
	readonly requestCount: number;
	pluginSpec(pluginName: string): string;
	publish(plugins: readonly IManagedPluginDefinition[]): Promise<void>;
	holdNextRequest(): IManagedPluginMarketplaceRequestGate;
	failNextRequest(): void;
	setUnavailable(unavailable: boolean): void;
	close(): Promise<void>;
}

interface IRequestGate {
	readonly started: DeferredPromise<void>;
	readonly released: DeferredPromise<void>;
}

async function runGit(cwd: string, ...args: string[]): Promise<void> {
	await execFileAsync('git', args, { cwd });
}

async function resolveGitHttpBackend(): Promise<string> {
	const executable = process.platform === 'win32' ? 'git-http-backend.exe' : 'git-http-backend';
	const { stdout: gitExecPath } = await execFileAsync('git', ['--exec-path']);
	const candidates = [join(gitExecPath.trim(), executable)];
	if (process.platform === 'win32') {
		for (const programFiles of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]) {
			if (programFiles) {
				candidates.push(join(programFiles, 'Git', 'mingw64', 'libexec', 'git-core', executable));
				candidates.push(join(programFiles, 'Git', 'mingw32', 'libexec', 'git-core', executable));
			}
		}
		const { stdout: gitPaths } = await execFileAsync('where.exe', ['git']);
		for (const gitPath of gitPaths.split(/\r?\n/).filter(Boolean)) {
			const root = dirname(dirname(gitPath));
			candidates.push(join(root, 'mingw64', 'libexec', 'git-core', executable));
			candidates.push(join(root, 'mingw32', 'libexec', 'git-core', executable));
		}
	}
	const backend = candidates.find(candidate => existsSync(candidate));
	if (!backend) {
		throw new Error(`Unable to find ${executable}. Tried: ${candidates.join(', ')}`);
	}
	return backend;
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on('data', chunk => chunks.push(Buffer.from(chunk)));
		request.on('end', () => resolve(Buffer.concat(chunks)));
		request.on('error', reject);
	});
}

async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close(error => error ? reject(error) : resolve());
	});
}

export async function createManagedPluginMarketplace(
	root: string,
	name: string,
	plugins: readonly IManagedPluginDefinition[],
): Promise<IManagedPluginMarketplace> {
	const sourceDirectory = join(root, `${name}-source`);
	const remoteRoot = join(root, `${name}-remote`);
	const remoteName = `${name}.git`;
	const remoteDirectory = join(remoteRoot, remoteName);
	await mkdir(sourceDirectory, { recursive: true });
	await mkdir(remoteRoot, { recursive: true });
	initTestGitRepo(sourceDirectory);
	await runGit(sourceDirectory, 'branch', '-M', 'main');
	const gitHttpBackend = await resolveGitHttpBackend();

	let published = false;
	let nextRequestGate: IRequestGate | undefined;
	let failedRequests = 0;
	let unavailable = false;
	let requestCount = 0;
	const errors: Error[] = [];

	const publish = async (definitions: readonly IManagedPluginDefinition[]): Promise<void> => {
		await rm(join(sourceDirectory, 'plugins'), { recursive: true, force: true });
		await mkdir(join(sourceDirectory, '.github', 'plugin'), { recursive: true });
		await writeFile(join(sourceDirectory, '.github', 'plugin', 'marketplace.json'), JSON.stringify({
			name,
			owner: { name: 'Agent Host E2E' },
			plugins: definitions.map(plugin => ({ name: plugin.name, source: `./plugins/${plugin.name}` })),
		}));
		for (const plugin of definitions) {
			const pluginDirectory = join(sourceDirectory, 'plugins', plugin.name);
			await mkdir(join(pluginDirectory, '.github', 'plugin'), { recursive: true });
			await mkdir(join(pluginDirectory, 'skills', plugin.skillName), { recursive: true });
			await writeFile(join(pluginDirectory, '.github', 'plugin', 'plugin.json'), JSON.stringify({
				name: plugin.name,
				version: plugin.version,
			}));
			await writeFile(join(pluginDirectory, 'VERSION'), plugin.version);
			await writeFile(join(pluginDirectory, 'skills', plugin.skillName, 'SKILL.md'), [
				'---',
				`name: ${plugin.skillName}`,
				`description: Managed plugin skill ${plugin.skillName}.`,
				'---',
				'',
				`Managed plugin skill ${plugin.skillName}.`,
			].join('\n'));
		}
		await runGit(sourceDirectory, 'add', '-A');
		await runGit(sourceDirectory, 'commit', '-q', '-m', `Publish ${definitions.map(plugin => `${plugin.name}@${plugin.version}`).join(', ')}`);
		if (!published) {
			await mkdir(remoteDirectory, { recursive: true });
			initTestGitRepo(remoteDirectory, { bare: true });
			await runGit(remoteDirectory, '--git-dir=.', 'symbolic-ref', 'HEAD', 'refs/heads/main');
			await runGit(sourceDirectory, 'remote', 'add', 'origin', remoteDirectory);
			await runGit(sourceDirectory, 'push', '-q', '-u', 'origin', 'main');
			published = true;
		} else {
			await runGit(sourceDirectory, 'push', '-q', 'origin', 'main');
		}
	};
	await publish(plugins);

	const runHttpBackend = async (request: IncomingMessage): Promise<Buffer> => {
		const body = await readRequestBody(request);
		const url = new URL(request.url ?? '/', 'http://localhost');
		const environment: NodeJS.ProcessEnv = {
			...process.env,
			GIT_PROJECT_ROOT: remoteRoot,
			GIT_HTTP_EXPORT_ALL: '1',
			PATH_INFO: decodeURIComponent(url.pathname),
			QUERY_STRING: url.search.slice(1),
			REQUEST_METHOD: request.method ?? 'GET',
			REMOTE_ADDR: '127.0.0.1',
			SERVER_NAME: '127.0.0.1',
			SERVER_PROTOCOL: 'HTTP/1.1',
			...(request.headers['content-type'] ? { CONTENT_TYPE: request.headers['content-type'] } : {}),
			CONTENT_LENGTH: String(body.length),
		};
		return new Promise<Buffer>((resolve, reject) => {
			const child = spawn(gitHttpBackend, [], { env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
			child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
			child.on('error', reject);
			child.on('close', code => code === 0
				? resolve(Buffer.concat(stdout))
				: reject(new Error(`git http-backend exited with code ${code}: ${Buffer.concat(stderr).toString('utf8')}`)));
			child.stdin.end(body);
		});
	};

	const sendBackendResponse = (response: ServerResponse, backendResponse: Buffer): void => {
		const carriageReturnSeparator = backendResponse.indexOf(Buffer.from('\r\n\r\n'));
		const lineFeedSeparator = backendResponse.indexOf(Buffer.from('\n\n'));
		const separatorIndex = carriageReturnSeparator >= 0 ? carriageReturnSeparator : lineFeedSeparator;
		if (separatorIndex < 0) {
			throw new Error('git http-backend returned no CGI headers');
		}
		const separatorLength = carriageReturnSeparator >= 0 ? 4 : 2;
		const headerText = backendResponse.subarray(0, separatorIndex).toString('latin1');
		for (const line of headerText.split(/\r?\n/)) {
			const delimiter = line.indexOf(':');
			if (delimiter < 0) {
				continue;
			}
			const key = line.slice(0, delimiter);
			const value = line.slice(delimiter + 1).trim();
			if (key.toLowerCase() === 'status') {
				response.statusCode = Number.parseInt(value, 10);
			} else {
				response.setHeader(key, value);
			}
		}
		response.end(backendResponse.subarray(separatorIndex + separatorLength));
	};

	const activeHandlers = new Set<Promise<void>>();
	const server = httpModule.createServer((request, response) => {
		const handler = (async () => {
			requestCount++;
			if (unavailable || failedRequests > 0) {
				failedRequests = Math.max(0, failedRequests - 1);
				response.writeHead(503, { 'content-type': 'text/plain' });
				response.end('Marketplace temporarily unavailable');
				return;
			}
			const gate = nextRequestGate;
			if (gate) {
				nextRequestGate = undefined;
				gate.started.complete();
				await gate.released.p;
			}
			sendBackendResponse(response, await runHttpBackend(request));
		})().catch(error => {
			const failure = error instanceof Error ? error : new Error(String(error));
			errors.push(failure);
			if (!response.headersSent) {
				response.writeHead(500, { 'content-type': 'text/plain' });
			}
			response.end(failure.message);
		});
		activeHandlers.add(handler);
		void handler.then(
			() => { activeHandlers.delete(handler); },
			() => { activeHandlers.delete(handler); },
		);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		await closeServer(server);
		throw new Error('Managed plugin marketplace server has no TCP address');
	}

	return {
		name,
		sourceUrl: `http://127.0.0.1:${address.port}/${remoteName}`,
		get requestCount() {
			return requestCount;
		},
		pluginSpec: pluginName => `${pluginName}@${name}`,
		publish,
		holdNextRequest: () => {
			if (nextRequestGate) {
				throw new Error('A managed plugin marketplace request is already held');
			}
			const gate: IRequestGate = {
				started: new DeferredPromise<void>(),
				released: new DeferredPromise<void>(),
			};
			nextRequestGate = gate;
			return {
				started: gate.started.p,
				release: () => gate.released.complete(),
			};
		},
		failNextRequest: () => failedRequests++,
		setUnavailable: value => unavailable = value,
		close: async () => {
			nextRequestGate?.released.complete();
			await closeServer(server);
			await Promise.allSettled(activeHandlers);
			if (errors.length > 0) {
				throw new AggregateError(errors, `Managed plugin marketplace server failed: ${errors.map(error => error.message).join('; ')}`);
			}
		},
	};
}
