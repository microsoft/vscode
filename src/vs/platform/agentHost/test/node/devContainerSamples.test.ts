/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubService } from '../../../github/common/githubService.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { devContainerSamples, devContainerSampleUri, findDevContainerSample, getDevContainerSampleUrl } from '../../common/devContainerSamples.js';
import { getDevContainerSampleLabels, getDevContainerSampleVolumeName, parseDevContainerSampleConfiguration, prepareDevContainerSample } from '../../node/devContainerSamples.js';

suite('Dev Container samples', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sample = devContainerSamples[2];
	const repositoryPath = 'https://github.com/Microsoft/vscode-remote-try-node';
	const folder = 'vscode-remote-try-node';
	const commit = 'a'.repeat(40);
	let cacheDirectory: string;

	setup(async () => {
		cacheDirectory = await mkdtemp(join(tmpdir(), 'vscode-dev-container-sample-test-'));
	});
	teardown(async () => {
		await rm(cacheDirectory, { recursive: true, force: true });
	});

	test('only recognizes the six canonical sample identities', () => {
		const uri = devContainerSampleUri(sample);
		assert.deepStrictEqual({
			samples: devContainerSamples.map(sample => findDevContainerSample(devContainerSampleUri(sample))?.id),
			invalid: [
				uri.with({ authority: 'remote' }),
				uri.with({ query: 'image=untrusted' }),
				uri.with({ fragment: 'other' }),
				uri.with({ path: '/vscode-remote-try-cpp' }),
			].map(findDevContainerSample),
		}, {
			samples: ['go', 'dotnet', 'node', 'php', 'python', 'rust'],
			invalid: [undefined, undefined, undefined, undefined],
		});
	});

	test('matches extension volume names, legacy reuse, and container labels', () => {
		const name = `${folder}-${createHash('sha256').update(repositoryPath).digest('hex')}`;
		const legacy = `${folder}-${createHash('md5').update(repositoryPath).digest('hex')}`;
		assert.deepStrictEqual({
			visibleUrl: getDevContainerSampleUrl(sample),
			newVolume: getDevContainerSampleVolumeName(sample, []),
			legacyVolume: getDevContainerSampleVolumeName(sample, [legacy]),
			preferCurrent: getDevContainerSampleVolumeName(sample, [legacy, name]),
			labels: getDevContainerSampleLabels({ repositoryPath, volumeName: name, folder }),
		}, {
			visibleUrl: 'https://github.com/microsoft/vscode-remote-try-node',
			newVolume: name,
			legacyVolume: legacy,
			preferCurrent: name,
			labels: [
				`vsch.local.repository=${repositoryPath}`,
				`vsch.local.repository.volume=${name}`,
				`vsch.local.repository.folder=${folder}`,
				`devcontainer.config_file=/workspaces/${folder}/.devcontainer/devcontainer.json`,
			],
		});
	});

	test('rejects builds, Features, Compose, and host-dependent configurations', () => {
		for (const config of [
			{ build: { dockerfile: 'Dockerfile' } },
			{ image: 'image', features: { java: {} } },
			{ image: 'image', dockerComposeFile: 'compose.yml' },
			{ image: 'image', initializeCommand: 'echo host' },
			{ image: 'image', mounts: [] },
		]) {
			assert.throws(() => parseDevContainerSampleConfiguration(JSON.stringify(config)));
		}
		assert.deepStrictEqual(parseDevContainerSampleConfiguration('{ // sample\n"image":"image", "postCreateCommand":"npm install",}'), {
			image: 'image', postCreateCommand: 'npm install',
		});
	});

	test('clones before lifecycle hooks and reuses cached configuration and volumes', async () => {
		const calls: string[] = [];
		const fetchedUrls: string[] = [];
		const cloneUsesLowercaseUrl: boolean[] = [];
		const cloneUsesPinnedCommit: boolean[] = [];
		const volumeName = getDevContainerSampleVolumeName(sample, []);
		const config = { image: 'sample-image', postCreateCommand: 'npm install' };
		const service = store.add(new GitHubService({
			credentialProvider: { onDidChange: Event.None, getToken: () => { throw new Error('Samples must remain anonymous'); } },
			fetch: async input => {
				const url = String(input);
				fetchedUrls.push(url);
				calls.push(url.includes('/commits/') ? 'commit' : 'config');
				return new Response(JSON.stringify(url.includes('/commits/') ? { sha: commit } : config));
			},
		}, new NullLogService(), NullTelemetryService));
		let existing = false;
		const commands: Parameters<typeof prepareDevContainerSample>[2] = {
			onContainerStarted: id => calls.push(`started ${id}`),
			readSource: async () => {
				const client = store.add(service.acquireAnonymousClient());
				try {
					return await client.object.getFile('microsoft', folder, '.devcontainer/devcontainer.json', CancellationToken.None);
				} finally {
					client.dispose();
				}
			},
			docker: async args => {
				let stdout: string;
				if (args[0] === 'volume') {
					calls.push(`volume ${args[1]}`);
					stdout = args[1] === 'ls' ? (existing ? volumeName : '')
						: args[1] === 'inspect' ? JSON.stringify({ 'vsch.local.repository': repositoryPath })
							: volumeName;
				} else {
					const clone = args.includes('/bin/sh');
					calls.push(clone ? 'clone' : 'read config');
					if (clone) {
						cloneUsesLowercaseUrl.push(args.at(-1)!.includes('https://github.com/microsoft/vscode-remote-try-node'));
						cloneUsesPinnedCommit.push(args.at(-1)!.includes(`checkout -B "$branch" '${commit}'`));
					}
					stdout = clone ? '' : JSON.stringify(config);
				}
				return { stdout, stderr: '', code: 0 };
			},
			devcontainer: async args => {
				calls.push(args[0] === 'up' ? 'up (skip hooks)' : 'hooks');
				if (args[0] === 'up') {
					assert.ok(args.includes('--skip-post-create'));
				}
				return {
					stdout: JSON.stringify({ outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: `/workspaces/${folder}` }),
					stderr: '', code: 0,
				};
			},
		};
		const first = await prepareDevContainerSample(sample, cacheDirectory, commands);
		existing = true;
		const second = await prepareDevContainerSample(sample, cacheDirectory, commands);
		assert.deepStrictEqual({
			calls,
			fetchedUrls,
			cloneUsesLowercaseUrl,
			cloneUsesPinnedCommit,
			sameIdentity: first.repository.volumeName === second.repository.volumeName,
			source: JSON.parse(await readFile(join(cacheDirectory, 'source.json'), 'utf8')),
			config: JSON.parse(await readFile(join(cacheDirectory, 'devcontainer.json'), 'utf8')),
		}, {
			calls: ['commit', 'config', 'volume ls', 'volume create', 'volume inspect', 'up (skip hooks)', 'started container', 'clone', 'read config', 'hooks',
				'volume ls', 'volume inspect', 'up (skip hooks)', 'started container', 'clone', 'read config', 'hooks'],
			fetchedUrls: [`https://api.github.com/repos/microsoft/${folder}/commits/HEAD`, `https://raw.githubusercontent.com/microsoft/${folder}/${commit}/.devcontainer/devcontainer.json`],
			cloneUsesLowercaseUrl: [true, true],
			cloneUsesPinnedCommit: [true, true],
			sameIdentity: true,
			source: { commit, content: JSON.stringify(config) },
			config: {
				...config,
				workspaceFolder: `/workspaces/${folder}`,
				workspaceMount: `type=volume,source=${volumeName},target=/workspaces`,
				updateRemoteUserUID: false,
			},
		});
	});

	test('unsupported configuration fails before creating a volume or container', async () => {
		await assert.rejects(prepareDevContainerSample(sample, cacheDirectory, {
			onContainerStarted: () => { throw new Error('No container should be registered'); },
			readSource: async () => ({ commitSha: commit, content: '{"image":"image","features":{"java":{}}}' }),
			docker: async () => { throw new Error('Docker must not run'); },
			devcontainer: async () => { throw new Error('Dev Container CLI must not run'); },
		}), /requires an image build/);
	});

	for (const rebuilt of [false, true]) {
		test(`image changes require a rebuild and accept an extension-rebuilt container (rebuilt: ${rebuilt})`, async () => {
			let lifecycleCalls = 0;
			const preparation = prepareDevContainerSample(sample, cacheDirectory, {
				onContainerStarted: () => { },
				readSource: async () => ({ commitSha: commit, content: '{"image":"old-image"}' }),
				docker: async args => ({
					stdout: args[0] === 'inspect' ? JSON.stringify(rebuilt ? 'new-image' : 'old-image')
						: args[1] === 'inspect' ? JSON.stringify({ 'vsch.local.repository': repositoryPath })
							: args.includes('cat') ? '{"image":"new-image"}' : '',
					stderr: '', code: 0,
				}),
				devcontainer: async args => {
					if (args[0] === 'run-user-commands') {
						lifecycleCalls++;
					}
					return { stdout: JSON.stringify({ outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: `/workspaces/${folder}` }), stderr: '', code: 0 };
				},
			});
			if (rebuilt) {
				await preparation;
			} else {
				await assert.rejects(preparation, /Rebuild the container/);
			}
			assert.deepStrictEqual({
				lifecycleCalls,
				cachedConfig: JSON.parse(await readFile(join(cacheDirectory, 'source.json'), 'utf8')).content,
			}, { lifecycleCalls: rebuilt ? 1 : 0, cachedConfig: rebuilt ? '{"image":"new-image"}' : '{"image":"old-image"}' });
		});
	}

	for (const failure of ['clone', 'lifecycle'] as const) {
		test(`reports ${failure} failure instead of connecting an incompletely prepared sample`, async () => {
			let lifecycleCalls = 0;
			const started: string[] = [];
			await assert.rejects(prepareDevContainerSample(sample, cacheDirectory, {
				onContainerStarted: id => started.push(id),
				readSource: async () => ({ commitSha: commit, content: '{"image":"sample-image"}' }),
				docker: async args => {
					const isClone = args.includes('/bin/sh');
					return {
						stdout: args[1] === 'inspect' ? JSON.stringify({ 'vsch.local.repository': repositoryPath }) : args.includes('cat') ? '{"image":"sample-image"}' : '',
						stderr: isClone && failure === 'clone' ? 'Clone failed' : '',
						code: isClone && failure === 'clone' ? 1 : 0,
					};
				},
				devcontainer: async args => {
					if (args[0] === 'run-user-commands') {
						lifecycleCalls++;
						return { stdout: '{"outcome":"error","message":"Install failed"}', stderr: '', code: 0 };
					}
					return { stdout: JSON.stringify({ outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: `/workspaces/${folder}` }), stderr: '', code: 0 };
				},
			}), failure === 'clone' ? /Clone failed/ : /lifecycle commands failed/);
			assert.deepStrictEqual({ lifecycleCalls, started }, { lifecycleCalls: failure === 'clone' ? 0 : 1, started: ['container'] });
		});
	}

	test('registers a container reported by a failed up command before propagating the failure', async () => {
		const started: string[] = [];
		await assert.rejects(prepareDevContainerSample(sample, cacheDirectory, {
			onContainerStarted: id => started.push(id),
			readSource: async () => ({ commitSha: commit, content: '{"image":"sample-image"}' }),
			docker: async args => ({
				stdout: args[1] === 'inspect' ? JSON.stringify({ 'vsch.local.repository': repositoryPath }) : '',
				stderr: '', code: 0,
			}),
			devcontainer: async () => ({
				stdout: '{"outcome":"error","containerId":"container"}',
				stderr: 'Container setup failed', code: 1,
			}),
		}), /Container setup failed/);
		assert.deepStrictEqual(started, ['container']);
	});
});
