/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, rm, writeFile } from 'fs/promises';
import { pathToFileURL } from 'url';
import { DeferredPromise } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostLaunchKind, AgentHostLaunchKindEnvVar } from '../../common/agentHostTelemetry.js';
import type { ICanvasPackageLaunch } from '../../common/agentHostCanvasPackages.js';
import { createCopilotCanvasLaunchProvider, loadCopilotCanvasSdk, LocalCanvasRuntimeCliEnvVar, LocalCanvasSdkBridgeEnvVar, LocalCanvasSdkEntryEnvVar, readCopilotCanvasSdkConfiguration, type ICopilotCanvasLaunchRequest } from '../../node/copilot/copilotCanvasSdk.js';

suite('CopilotCanvasSdk', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const configuration = { sdkEntry: 'file:///development/sdk/index.js', bridgeEntry: 'file:///development/bridge.mjs', runtimeCli: '/development/runtime/index.js' };
	const environment = {
		[AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeMainProcess,
		[LocalCanvasSdkEntryEnvVar]: configuration.sdkEntry,
		[LocalCanvasSdkBridgeEnvVar]: configuration.bridgeEntry,
		[LocalCanvasRuntimeCliEnvVar]: configuration.runtimeCli,
	};
	const request: ICopilotCanvasLaunchRequest = {
		id: 'plugin:approved:main', name: 'main', source: 'plugin', modulePath: '/snapshot/extension.mjs', sessionId: 'sdk-session',
		defaultLaunch: { executable: '/node', args: ['/runtime/bootstrap.js'], env: { SESSION_ID: 'sdk-session', COPILOT_SDK_PATH: '/sdk' } },
	};
	const launch: ICanvasPackageLaunch = {
		packageId: 'approved', revision: 'revision', workspace: URI.file('/workspace'),
		pluginDirectory: URI.file('/snapshot'), dataDirectory: URI.file('/data/approved/workspace'),
	};

	test('selects both explicit artifacts only in a local development host', () => {
		assert.deepStrictEqual({
			development: readCopilotCanvasSdkConfiguration(false, environment, 'darwin', 'arm64'),
			built: readCopilotCanvasSdkConfiguration(true, environment),
			remote: readCopilotCanvasSdkConfiguration(false, { ...environment, [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeCLI }),
			absent: readCopilotCanvasSdkConfiguration(false, { [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeMainProcess }),
		}, { development: configuration, built: undefined, remote: undefined, absent: undefined });
	});

	test('unqualified hosts ignore even configured artifacts without disrupting the ordinary SDK path', () => {
		const hosts: readonly [NodeJS.Platform, NodeJS.Architecture][] = [
			['win32', 'x64'], ['win32', 'arm64'], ['linux', 'x64'], ['linux', 'arm64'], ['darwin', 'x64'],
		];
		assert.deepStrictEqual(hosts.map(([platform, architecture]) => ({
			configured: readCopilotCanvasSdkConfiguration(false, environment, platform, architecture),
			partial: readCopilotCanvasSdkConfiguration(false, { ...environment, [LocalCanvasSdkBridgeEnvVar]: undefined }, platform, architecture),
		})), hosts.map(() => ({ configured: undefined, partial: undefined })));
	});

	test('partial, remote and ambiguous artifact paths fail rather than selecting the bundled SDK', () => {
		for (const override of [
			{ [LocalCanvasSdkBridgeEnvVar]: undefined },
			{ [LocalCanvasSdkEntryEnvVar]: 'https://example.invalid/sdk.js' },
			{ [LocalCanvasSdkEntryEnvVar]: `${configuration.sdkEntry}?different` },
			{ [LocalCanvasRuntimeCliEnvVar]: 'runtime.js' },
		]) {
			assert.throws(() => readCopilotCanvasSdkConfiguration(false, { ...environment, ...override }, 'darwin', 'arm64'));
		}
	});

	test('requires the exact runtime identity and preserves only the approved default profile with its data directory', async () => {
		const calls: string[][] = [];
		const provider = createCopilotCanvasLaunchProvider({
			resolve: async (...args) => { calls.push(args); return args[0] === request.sessionId ? launch : undefined; },
		}, () => true);
		assert.deepStrictEqual({
			approved: await provider(request),
			unknown: await provider({ ...request, sessionId: 'other-session' }),
			missingId: await provider({ ...request, sessionId: undefined }),
			missingProfile: await provider({ ...request, defaultLaunch: undefined }),
			calls,
		}, {
			approved: { launch: { ...request.defaultLaunch, env: { ...request.defaultLaunch?.env, VSCODE_CANVAS_DATA_DIR: launch.dataDirectory.fsPath } } },
			unknown: { launch: null }, missingId: { launch: null }, missingProfile: { launch: null },
			calls: [['sdk-session', request.id, request.modulePath], ['other-session', request.id, request.modulePath]],
		});
	});

	test('replaced clients deny a late successful package resolution', async () => {
		const pending = new DeferredPromise<ICanvasPackageLaunch | undefined>();
		let current = true;
		const provider = createCopilotCanvasLaunchProvider({ resolve: () => pending.p }, () => current);
		const resolving = provider(request);
		current = false;
		await pending.complete(launch);
		assert.deepStrictEqual(await resolving, { launch: null });
	});

	test('old SDK modules and a bridge for a different SDK cannot become the preview factory', async () => {
		const root = join(process.cwd(), '.build', `canvas-sdk-module-${generateUuid()}`);
		await mkdir(root, { recursive: true });
		try {
			const sdkEntry = pathToFileURL(join(root, 'index.mjs')).href;
			const runtimeCli = join(root, 'runtime.mjs');
			await writeFile(join(root, 'index.mjs'), 'export class CopilotClient {}');
			await writeFile(runtimeCli, '');
			await assert.rejects(loadCopilotCanvasSdk({ sdkEntry, bridgeEntry: sdkEntry, runtimeCli }), /not built for this public/);
			const bridgeEntry = pathToFileURL(join(root, 'bridge.mjs')).href;
			await writeFile(join(root, 'bridge.mjs'), 'export const sdkEntry = "file:///different/sdk.js"; export function createClient() {}');
			await assert.rejects(loadCopilotCanvasSdk({ sdkEntry, bridgeEntry, runtimeCli }), /not built for this public/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
