/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteSessionHost, parseCreateRemoteSessionOptions, remoteSessionHostRejections } from '../../common/remoteSessions.js';

suite('RemoteSessions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const host: IRemoteSessionHost = {
		id: 'linux-host',
		label: 'Linux',
		status: 'connected',
		supportsRemoteSessions: true,
		resources: { platform: 'linux', architecture: 'x64', cpuCount: 8, memoryBytes: 32 * 1024 ** 3 },
		runningSessions: 2,
		pendingCreations: 0,
		agents: [{ provider: 'copilot', models: [{ id: 'test-model', name: 'Test Model' }] }],
		workspaces: [],
	};

	test('a prompt alone neither requires nor inherits a workspace or model', () => {
		assert.deepStrictEqual(parseCreateRemoteSessionOptions({ prompt: 'Investigate' }), {
			prompt: 'Investigate',
			title: undefined,
			hostId: undefined,
			model: undefined,
			workspace: undefined,
			requirements: { platform: undefined, minCpuCount: undefined, minMemoryGiB: undefined },
		});
	});

	test('resource minimums are inclusive and use GiB', () => {
		const options = parseCreateRemoteSessionOptions({
			prompt: 'Test',
			model: { provider: 'copilot', id: 'test-model' },
			requirements: { platform: 'linux', minCpuCount: 8, minMemoryGiB: 32 },
		});
		assert.deepStrictEqual([
			remoteSessionHostRejections(host, options),
			remoteSessionHostRejections({ ...host, resources: { ...host.resources!, cpuCount: 7 } }, options),
			remoteSessionHostRejections({ ...host, resources: { ...host.resources!, memoryBytes: 32 * 1024 ** 3 - 1 } }, options),
		], [
			[],
			['Required 8 logical CPUs; host reports 7.'],
			[`Required 32 GiB of memory; host reports ${(32 * 1024 ** 3 - 1) / 1024 ** 3} GiB.`],
		]);
	});

	test('unknown resources do not satisfy requirements or imply zero load', () => {
		const olderHost = { ...host, resources: undefined, runningSessions: undefined };
		assert.deepStrictEqual(remoteSessionHostRejections(olderHost, parseCreateRemoteSessionOptions({
			prompt: 'Test',
			requirements: { platform: 'linux', minCpuCount: 1, minMemoryGiB: 1 },
		})), [
			'Running-session count is not available yet.',
			'Required platform linux; host reports unknown.',
			'Required 1 logical CPUs; host reports unknown.',
			'Required 1 GiB of memory; host reports unknown.',
		]);
	});

	test('hosts remain usable without resource requirements when workload and delegation support are known', () => {
		assert.deepStrictEqual(remoteSessionHostRejections({ ...host, resources: undefined }, parseCreateRemoteSessionOptions({ prompt: 'Test' })), []);
	});

	test('older hosts cannot silently create a child without a return address', () => {
		assert.deepStrictEqual(remoteSessionHostRejections({ ...host, supportsRemoteSessions: false }, parseCreateRemoteSessionOptions({ prompt: 'Test' })), [
			'Host does not support remote session delegation. Update the agent host.',
		]);
	});
	test('an explicit host ID excludes other hosts before inspecting capabilities', () => {
		assert.deepStrictEqual(remoteSessionHostRejections(host, parseCreateRemoteSessionOptions({
			prompt: 'Test',
			hostId: 'another-host',
		})), ['Host ID does not match.']);
	});

	test('a known unavailable model remains a hard requirement', () => {
		assert.deepStrictEqual(remoteSessionHostRejections(host, parseCreateRemoteSessionOptions({
			prompt: 'Test', model: { provider: 'claude', id: 'test-model' },
		})), ['Model claude/test-model is not available.']);
	});

	for (const status of ['reconnecting', 'connecting', 'disconnected', 'incompatible']) {
		test(`${status} hosts report connectivity, not unsupported capabilities`, () => {
			assert.deepStrictEqual(remoteSessionHostRejections({
				...host, status, supportsRemoteSessions: null, resources: undefined, runningSessions: undefined, agents: [],
			}, parseCreateRemoteSessionOptions({
				prompt: 'Test', model: { provider: 'copilot', id: 'test-model' }, requirements: { platform: 'windows', minCpuCount: 8 },
			})), [`Host is ${status}. Establish a connection before creating a remote session; its capabilities are not available yet.`]);
		});
	}

	test('a connected host awaiting its first snapshot is not treated as an old host', () => {
		assert.deepStrictEqual(remoteSessionHostRejections({
			...host, supportsRemoteSessions: null, resources: undefined, runningSessions: undefined, agents: [],
		}, parseCreateRemoteSessionOptions({ prompt: 'Test' })), [
			'Host capabilities have not been received yet. Wait for host discovery to finish before creating a remote session.',
		]);
	});

	test('accepts target file URIs independently of the client platform', () => {
		const uris = ['file:///C:/repos/project', 'file:///home/user/project'];
		assert.deepStrictEqual(uris.map(uri => parseCreateRemoteSessionOptions({
			prompt: 'Test',
			workspace: { uri },
		}).workspace), uris.map(uri => ({ uri: URI.parse(uri), isolation: 'worktree', branch: undefined })));
	});

	test('preserves host-qualified workspace routing and explicit isolation', () => {
		const uri = toAgentHostUri(URI.file('/repo'), 'remote-host');
		const workspace = parseCreateRemoteSessionOptions({
			prompt: 'Test',
			workspace: { uri: uri.toString(), isolation: 'folder' },
		}).workspace;
		assert.deepStrictEqual({ ...workspace, uri: workspace?.uri.toString() }, { uri: uri.toString(), isolation: 'folder', branch: undefined });
	});

	test('a branch is a worktree base and never changes an existing checkout', () => {
		const uri = URI.parse('file:///repo');
		const workspace = parseCreateRemoteSessionOptions({
			prompt: 'Test',
			workspace: { uri: uri.toString(), branch: 'feature' },
		}).workspace;
		assert.deepStrictEqual({ ...workspace, uri: workspace?.uri.toString() }, { uri: uri.toString(), isolation: 'worktree', branch: 'feature' });
		assert.throws(() => parseCreateRemoteSessionOptions({
			prompt: 'Test',
			workspace: { uri: uri.toString(), isolation: 'folder', branch: 'feature' },
		}), /requires worktree isolation/);
	});

	test('rejects invalid input rather than quietly relaxing selection', () => {
		const invalid: unknown[] = [
			undefined,
			[],
			{},
			{ prompt: ' ' },
			{ prompt: 'Test', title: 'x'.repeat(201) },
			{ prompt: 'Test', metadata: { os: 'linux' } },
			{ prompt: 'Test', hostId: 12 },
			{ prompt: 'Test', model: 'test-model' },
			{ prompt: 'Test', model: { id: 'test-model' } },
			{ prompt: 'Test', model: { provider: 'copilot', id: 'test-model', fallback: true } },
			{ prompt: 'Test', requirements: { platform: 'win32' } },
			{ prompt: 'Test', requirements: { minCpuCount: 1.5 } },
			{ prompt: 'Test', requirements: { minCpuCount: '8' } },
			{ prompt: 'Test', requirements: { minCpuCount: Number.MAX_SAFE_INTEGER + 1 } },
			{ prompt: 'Test', requirements: { minMemoryGiB: 0 } },
			{ prompt: 'Test', requirements: { minMemoryGiB: Infinity } },
			{ prompt: 'Test', requirements: { minMemoryGiB: NaN } },
			{ prompt: 'Test', requirements: { gpu: true } },
			{ prompt: 'Test', workspace: { uri: 'relative/path' } },
			{ prompt: 'Test', workspace: { uri: 'https://example.com/repo' } },
			{ prompt: 'Test', workspace: { uri: 'file:///repo', isolation: 'inherit' } },
			{ prompt: 'Test', workspace: { uri: 'file:///repo', clone: true } },
		];
		for (const input of invalid) {
			assert.throws(() => parseCreateRemoteSessionOptions(input), JSON.stringify(input));
		}
	});
});
