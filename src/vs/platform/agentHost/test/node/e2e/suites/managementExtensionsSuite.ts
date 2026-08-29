/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { writeFileSync, mkdtempSync } from 'fs';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, type IAgentHostManagedSettingsDiagnostics, type IAgentHostNetworkDiagnosticsInfo, type IAgentHostNetworkFetchResult } from '../../../../common/agentService.js';
import { AgentHostProxyConfigKey } from '../../../../common/agentHostSchema.js';
import { CollectAgentHostDebugLogsExtensionMethod, GetAgentHostSessionStateFileExtensionMethod, ReadAgentHostDebugLogsChunkExtensionMethod, type IAgentHostExtensionCommandMap } from '../../../../common/agentHostExtensionProtocol.js';
import { type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { createRealSession, driveTurnToCompletion } from '../harness/agentHostE2ETestHarness.js';
import { vscodeAgentHostTarget } from '../harness/agentHostTarget.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, providerHostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

type DebugLogsArtifactResult = IAgentHostExtensionCommandMap[typeof CollectAgentHostDebugLogsExtensionMethod]['result'];
type DebugLogsChunkResult = IAgentHostExtensionCommandMap[typeof ReadAgentHostDebugLogsChunkExtensionMethod]['result'];
type SessionStateFileResult = IAgentHostExtensionCommandMap[typeof GetAgentHostSessionStateFileExtensionMethod]['result'];

interface ILocalHttpServer {
	readonly url: string;
	close(): Promise<void>;
}

async function startLocalHttpServer(statusCode: number, body: string): Promise<ILocalHttpServer> {
	const { createServer } = await import('http');
	const server = createServer((_request, response) => {
		response.statusCode = statusCode;
		response.end(body);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const port = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${port}/probe`,
		close: async () => {
			server.closeAllConnections();
			await new Promise<void>(resolve => server.close(() => resolve()));
		},
	};
}

export function defineManagementExtensionTests(context: IAgentHostE2ETestContext): void {
	if (context.targetId !== vscodeAgentHostTarget.id) {
		return;
	}
	const { config, createdSessions, tempDirs } = context;
	let clientOrdinal = 0;

	async function initializeClient(prefix: string): Promise<void> {
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `${prefix}-${config.provider}-${clientOrdinal++}`,
		});
	}

	async function collectDebugLogs(kind: 'archive' | 'directory', session?: string): Promise<DebugLogsArtifactResult> {
		return context.client.call<DebugLogsArtifactResult>(CollectAgentHostDebugLogsExtensionMethod, {
			kind,
			session,
		});
	}

	async function readDebugLogsChunk(resource: string, position: number): Promise<DebugLogsChunkResult> {
		return context.client.call<DebugLogsChunkResult>(ReadAgentHostDebugLogsChunkExtensionMethod, {
			resource,
			position,
		});
	}

	async function readDebugLogsArtifact(resource: string, expectedSize: number): Promise<Buffer> {
		const chunks: Buffer[] = [];
		let position = 0;
		while (true) {
			const result = await readDebugLogsChunk(resource, position);
			const chunk = Buffer.from(result.data, 'base64');
			assert.ok(chunk.byteLength <= AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES);
			if (chunk.byteLength === 0 && !result.eof) {
				throw new Error('Debug-log artifact read made no progress before EOF');
			}
			chunks.push(chunk);
			position += chunk.byteLength;
			if (result.eof) {
				break;
			}
		}
		assert.strictEqual(position, expectedSize);
		return Buffer.concat(chunks);
	}

	function assertSafeManifest(artifact: DebugLogsArtifactResult): void {
		assert.ok(artifact.entries.length > 0 && artifact.entries.length <= AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES);
		assert.ok(Number.isSafeInteger(artifact.size) && artifact.size >= 0);
		assert.ok(Number.isSafeInteger(artifact.uncompressedSize) && artifact.uncompressedSize >= 0);
		assert.strictEqual(artifact.entries.reduce((total, entry) => total + entry.size, 0), artifact.uncompressedSize);
		const paths = new Set<string>();
		for (const entry of artifact.entries) {
			const segments = entry.path.split('/');
			assert.ok(entry.path.length > 0 && !entry.path.includes('\\') && segments.every(segment => segment && segment !== '.' && segment !== '..'));
			assert.ok(Number.isSafeInteger(entry.size) && entry.size >= 0);
			assert.ok(!paths.has(entry.path));
			paths.add(entry.path);
		}
	}

	function isAgentHostProcessLog(path: string): boolean {
		return /^agenthost(?:-server)?(?:\.\d+)?\.log$/.test(path);
	}

	async function setRootConfig(values: Readonly<Record<string, unknown>>, clientSeq: number): Promise<void> {
		await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		context.client.clearReceived();
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq,
			action: { type: ActionType.RootConfigChanged, config: values },
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.RootConfigChanged)
			&& getActionEnvelope(notification).origin?.clientSeq === clientSeq,
		);
	}

	conformanceTest(context, 'host-wide debug archive has a readable manifest and zip payload', async function () {
		await initializeClient('debug-archive');
		const artifact = await collectDebugLogs('archive');
		const payload = await readDebugLogsArtifact(artifact.resource, artifact.size);

		assertSafeManifest(artifact);
		assert.deepStrictEqual({
			kind: artifact.kind,
			scheme: URI.parse(artifact.resource).scheme,
			signature: [...payload.subarray(0, 4)],
		}, {
			kind: 'archive',
			scheme: 'file',
			signature: [0x50, 0x4b, 0x03, 0x04],
		});
	});

	conformanceTest(context, 'host-wide debug directory streams every manifest entry', async function () {
		await initializeClient('debug-directory');
		const artifact = await collectDebugLogs('directory');
		assertSafeManifest(artifact);

		const sizes = await Promise.all(artifact.entries.map(async entry => {
			const resource = joinPath(URI.parse(artifact.resource), entry.path).toString();
			return (await readDebugLogsArtifact(resource, entry.size)).byteLength;
		}));

		assert.deepStrictEqual({
			kind: artifact.kind,
			sizes,
		}, {
			kind: 'directory',
			sizes: artifact.entries.map(entry => entry.size),
		});
	});

	conformanceTest(context, 'debug archive chunk reads honor offsets and EOF', async function () {
		await initializeClient('debug-offsets');
		const artifact = await collectDebugLogs('archive');
		const first = await readDebugLogsChunk(artifact.resource, 0);
		const tailPosition = Math.max(0, artifact.size - 4);
		const tail = await readDebugLogsChunk(artifact.resource, tailPosition);
		const pastEnd = await readDebugLogsChunk(artifact.resource, artifact.size);

		assert.deepStrictEqual({
			firstBytes: Buffer.from(first.data, 'base64').byteLength,
			firstEof: first.eof,
			tailBytes: Buffer.from(tail.data, 'base64').byteLength,
			tailEof: tail.eof,
			pastEndBytes: Buffer.from(pastEnd.data, 'base64').byteLength,
			pastEndEof: pastEnd.eof,
		}, {
			firstBytes: Math.min(artifact.size, AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES),
			firstEof: artifact.size <= AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES,
			tailBytes: Math.min(4, artifact.size),
			tailEof: true,
			pastEndBytes: 0,
			pastEndEof: true,
		});
	});

	conformanceTest(context, 'collected debug artifacts use unique resources and remain readable', async function () {
		await initializeClient('debug-retention');
		const first = await collectDebugLogs('archive');
		const second = await collectDebugLogs('archive');
		const [firstChunk, secondChunk] = await Promise.all([
			readDebugLogsChunk(first.resource, 0),
			readDebugLogsChunk(second.resource, 0),
		]);

		assert.deepStrictEqual({
			unique: first.resource !== second.resource,
			firstReadable: Buffer.from(firstChunk.data, 'base64').byteLength > 0,
			secondReadable: Buffer.from(secondChunk.data, 'base64').byteLength > 0,
		}, {
			unique: true,
			firstReadable: true,
			secondReadable: true,
		});
	});

	conformanceTest(context, 'debug artifact reads reject a foreign file', async function () {
		const directory = mkdtempSync(join(tmpdir(), 'ahp-debug-foreign-'));
		tempDirs.push(directory);
		const file = join(directory, 'foreign.log');
		writeFileSync(file, 'must not be readable');
		await initializeClient('debug-foreign');

		await assert.rejects(readDebugLogsChunk(URI.file(file).toString(), 0), /Unknown or expired Agent Host debug-log artifact/);
	});

	conformanceTest(context, 'debug directory reads reject an unlisted sibling', async function () {
		await initializeClient('debug-unlisted');
		const artifact = await collectDebugLogs('directory');
		const resource = joinPath(URI.parse(artifact.resource), 'unlisted.log').toString();

		await assert.rejects(readDebugLogsChunk(resource, 0), /Unknown or expired Agent Host debug-log artifact/);
	});

	conformanceTest(context, 'debug artifact reads reject non-file resources', async function () {
		await initializeClient('debug-scheme');

		await assert.rejects(readDebugLogsChunk('untitled:/debug.zip', 0), /Unsupported debug-log artifact scheme/);
	});

	conformanceTest(context, 'debug collection rejects a session for an unknown provider', async function () {
		await initializeClient('debug-unknown-provider');

		await assert.rejects(collectDebugLogs('archive', 'missing-provider:/session'), /No Agent Host provider is available/);
	});

	conformanceTest(context, 'host-wide debug collection without a live provider contains only host logs', async function () {
		await initializeClient('debug-host-only');
		const artifact = await collectDebugLogs('archive');

		assert.deepStrictEqual({
			providerLogsIncluded: artifact.providerLogsIncluded,
			hasHostLog: artifact.entries.some(entry => isAgentHostProcessLog(entry.path)),
			onlyHostLogs: artifact.entries.every(entry => isAgentHostProcessLog(entry.path)),
		}, {
			providerLogsIncluded: false,
			hasHostLog: true,
			onlyHostLogs: true,
		});
	});

	conformanceTest(context, 'unmaterialized session debug collection contains only host logs', async function () {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-debug-unmaterialized-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `debug-unmaterialized-${config.provider}`, createdSessions, URI.file(workspace));
		const artifact = await collectDebugLogs('directory', sessionUri);

		assert.deepStrictEqual({
			providerLogsIncluded: artifact.providerLogsIncluded,
			hasHostLog: artifact.entries.some(entry => isAgentHostProcessLog(entry.path)),
			onlyHostLogs: artifact.entries.every(entry => isAgentHostProcessLog(entry.path)),
		}, {
			providerLogsIncluded: false,
			hasHostLog: true,
			onlyHostLogs: true,
		});
	});

	conformanceTest(context, 'unmaterialized session has no provider state file', async function () {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-state-file-unmaterialized-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `state-file-unmaterialized-${config.provider}`, createdSessions, URI.file(workspace));

		const result = await context.client.call<SessionStateFileResult>(GetAgentHostSessionStateFileExtensionMethod, { session: sessionUri });

		assert.deepStrictEqual(result, {});
	});

	conformanceTest(context, 'diagnostics fetch reports a successful local response', async function () {
		const server = await startLocalHttpServer(200, 'DIAGNOSTICS_OK');
		try {
			await initializeClient('diagnostics-success');
			const result = await context.client.call<IAgentHostNetworkFetchResult>('diagnosticsFetch', { url: server.url });

			assert.deepStrictEqual({
				url: result.url,
				statusCode: result.statusCode,
				body: result.body,
				hasError: result.error !== undefined,
				ipv4Address: result.dnsIpv4?.address,
				hasIpv4Duration: typeof result.dnsIpv4?.durationMs === 'number',
			}, {
				url: server.url,
				statusCode: 200,
				body: 'DIAGNOSTICS_OK',
				hasError: false,
				ipv4Address: '127.0.0.1',
				hasIpv4Duration: true,
			});
		} finally {
			await server.close();
		}
	});

	conformanceTest(context, 'diagnostics fetch preserves a non-success HTTP response', async function () {
		const server = await startLocalHttpServer(503, 'temporarily unavailable');
		try {
			await initializeClient('diagnostics-non-success');
			const result = await context.client.call<IAgentHostNetworkFetchResult>('diagnosticsFetch', { url: server.url });

			assert.deepStrictEqual({
				statusCode: result.statusCode,
				body: result.body,
				error: result.error,
			}, {
				statusCode: 503,
				body: 'temporarily unavailable',
				error: undefined,
			});
		} finally {
			await server.close();
		}
	});

	conformanceTest(context, 'diagnostics fetch bounds a large response body', async function () {
		const body = `${'x'.repeat(64 * 1024)}TRUNCATED`;
		const server = await startLocalHttpServer(200, body);
		try {
			await initializeClient('diagnostics-truncation');
			const result = await context.client.call<IAgentHostNetworkFetchResult>('diagnosticsFetch', { url: server.url });

			assert.deepStrictEqual({
				length: result.body?.length,
				value: result.body,
			}, {
				length: 64 * 1024,
				value: 'x'.repeat(64 * 1024),
			});
		} finally {
			await server.close();
		}
	});

	conformanceTest(context, 'concurrent diagnostics fetches keep responses isolated', async function () {
		const firstServer = await startLocalHttpServer(200, 'FIRST_RESPONSE');
		const secondServer = await startLocalHttpServer(202, 'SECOND_RESPONSE');
		try {
			await initializeClient('diagnostics-concurrent');
			const [first, second] = await Promise.all([
				context.client.call<IAgentHostNetworkFetchResult>('diagnosticsFetch', { url: firstServer.url }),
				context.client.call<IAgentHostNetworkFetchResult>('diagnosticsFetch', { url: secondServer.url }),
			]);

			assert.deepStrictEqual([
				{ url: first.url, statusCode: first.statusCode, body: first.body },
				{ url: second.url, statusCode: second.statusCode, body: second.body },
			], [
				{ url: firstServer.url, statusCode: 200, body: 'FIRST_RESPONSE' },
				{ url: secondServer.url, statusCode: 202, body: 'SECOND_RESPONSE' },
			]);
		} finally {
			await Promise.all([firstServer.close(), secondServer.close()]);
		}
	});

	conformanceTest(context, 'diagnostics fetch rejects a malformed URL', async function () {
		await initializeClient('diagnostics-invalid-url');

		await assert.rejects(context.client.call('diagnosticsFetch', { url: 'not a URL' }));
	});

	conformanceTest(context, 'network diagnostics reflect root proxy configuration', async function () {
		await initializeClient('diagnostics-proxy-config');
		try {
			await setRootConfig({
				[AgentHostProxyConfigKey.Proxy]: 'http://127.0.0.1:4567',
				[AgentHostProxyConfigKey.NoProxy]: ['localhost', '127.0.0.1'],
				[AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: 'HTTP/proxy.example.com',
			}, 1);

			const result = await context.client.call<IAgentHostNetworkDiagnosticsInfo>('getNetworkDiagnosticsInfo');

			assert.deepStrictEqual(result.proxySettings, {
				[AgentHostProxyConfigKey.Proxy]: 'http://127.0.0.1:4567',
				[AgentHostProxyConfigKey.NoProxy]: 'localhost, 127.0.0.1',
				[AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: 'HTTP/proxy.example.com',
			});
		} finally {
			await setRootConfig({
				[AgentHostProxyConfigKey.Proxy]: '',
				[AgentHostProxyConfigKey.NoProxy]: [],
				[AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: '',
			}, 2);
		}
	});

	conformanceTest(context, 'network diagnostics endpoints are unique and well formed', async function () {
		await initializeClient('diagnostics-endpoints');
		const result = await context.client.call<IAgentHostNetworkDiagnosticsInfo>('getNetworkDiagnosticsInfo');
		const normalizedUrls = result.endpoints.map(endpoint => new URL(endpoint.url).toString());

		assert.deepStrictEqual({
			hasEndpoints: result.endpoints.length > 0,
			allNamed: result.endpoints.every(endpoint => endpoint.name.length > 0),
			allStatusesValid: result.endpoints.every(endpoint => endpoint.expectedStatus === undefined || Number.isInteger(endpoint.expectedStatus)),
			uniqueUrls: new Set(normalizedUrls).size === normalizedUrls.length,
		}, {
			hasEndpoints: true,
			allNamed: true,
			allStatusesValid: true,
			uniqueUrls: true,
		});
	});

	if (config.provider === 'copilotcli') {
		providerHostOnlyTest(context, 'managed settings diagnostics expose the provider snapshot', async function () {
			await initializeClient('managed-settings-snapshot');
			const result = await context.client.call<readonly IAgentHostManagedSettingsDiagnostics[]>('getManagedSettingsDiagnostics');
			const provider = result.find(entry => entry.provider === config.provider);

			assert.deepStrictEqual({
				hasProvider: provider !== undefined,
				hasSnapshot: provider?.snapshot !== undefined,
				hasError: provider?.error !== undefined,
				sourceIsValid: provider?.snapshot !== undefined && ['server', 'device', 'client', 'mixed', 'none'].includes(provider.snapshot.source),
				managedKeysAreArray: Array.isArray(provider?.snapshot?.managedKeys),
			}, {
				hasProvider: true,
				hasSnapshot: true,
				hasError: false,
				sourceIsValid: true,
				managedKeysAreArray: true,
			});
		});
	}

	if (context.tier === 'parity') {
		test('materialized provider exposes its supported management artifacts', async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-provider-management-'));
			tempDirs.push(workspace);
			const sessionUri = await createRealSession(context.client, config, `provider-management-${config.provider}`, createdSessions, URI.file(workspace));
			await driveTurnToCompletion(context.client, sessionUri, 'turn-provider-management', 'Reply exactly "ready".', 1);

			const expectsCopilotArtifacts = config.provider === 'copilotcli';
			const debugLogs = await collectDebugLogs('archive', sessionUri);
			const stateFile = expectsCopilotArtifacts
				? await retry(async () => {
					const result = await context.client.call<SessionStateFileResult>(GetAgentHostSessionStateFileExtensionMethod, { session: sessionUri });
					assert.ok(result.resource);
					return result;
				}, 50, 20)
				: await context.client.call<SessionStateFileResult>(GetAgentHostSessionStateFileExtensionMethod, { session: sessionUri });
			const chunk = await readDebugLogsChunk(debugLogs.resource, 0);

			assert.deepStrictEqual({
				hasStateFile: stateFile.resource !== undefined,
				archiveReadable: Buffer.from(chunk.data, 'base64').byteLength > 0,
			}, {
				hasStateFile: expectsCopilotArtifacts,
				archiveReadable: true,
			});
		});

		if (config.provider === 'copilotcli') {
			(context.runKnownIssueTests ? test : test.skip)('materialized Copilot debug collection includes provider log entries', async function () {
				this.timeout(180_000);
				const workspace = mkdtempSync(join(tmpdir(), 'ahp-copilot-debug-logs-'));
				tempDirs.push(workspace);
				const sessionUri = await createRealSession(context.client, config, 'copilot-debug-logs', createdSessions, URI.file(workspace));
				await driveTurnToCompletion(context.client, sessionUri, 'turn-copilot-debug-logs', 'Reply exactly "ready".', 1);

				const debugLogs = await collectDebugLogs('archive', sessionUri);

				assert.deepStrictEqual({
					providerLogsIncluded: debugLogs.providerLogsIncluded,
					hasProviderLogEntries: debugLogs.entries.some(entry => !isAgentHostProcessLog(entry.path)),
				}, {
					providerLogsIncluded: true,
					hasProviderLogEntries: true,
				});
			});
		}
	}
}
