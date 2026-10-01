/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { devContainerSamples, devContainerSampleUri, findDevContainerSample, getDevContainerSampleUrl } from '../../common/devContainerSamples.js';
import { getDevContainerSampleLabels, getDevContainerSampleVolumeName, parseDevContainerSampleConfiguration, prepareDevContainerSample } from '../../node/devContainerSamples.js';

suite('Dev Container samples', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const sample = devContainerSamples[2];
	const repositoryPath = getDevContainerSampleUrl(sample);
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
			newVolume: getDevContainerSampleVolumeName(sample, []),
			legacyVolume: getDevContainerSampleVolumeName(sample, [legacy]),
			preferCurrent: getDevContainerSampleVolumeName(sample, [legacy, name]),
			labels: getDevContainerSampleLabels({ repositoryPath, volumeName: name, folder }),
		}, {
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
		const volumeName = getDevContainerSampleVolumeName(sample, []);
		const config = { image: 'sample-image', postCreateCommand: 'npm install' };
		let existing = false;
		const commands: Parameters<typeof prepareDevContainerSample>[2] = {
			fetch: async url => {
				calls.push(url.includes('/commits/') ? 'commit' : 'config');
				return url.includes('/commits/') ? JSON.stringify({ sha: commit }) : JSON.stringify(config);
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
			sameIdentity: first.repository.volumeName === second.repository.volumeName,
			config: JSON.parse(await readFile(join(cacheDirectory, 'devcontainer.json'), 'utf8')),
		}, {
			calls: ['commit', 'config', 'volume ls', 'volume create', 'volume inspect', 'up (skip hooks)', 'clone', 'read config', 'hooks',
				'volume ls', 'volume inspect', 'up (skip hooks)', 'clone', 'read config', 'hooks'],
			sameIdentity: true,
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
			fetch: async url => url.includes('/commits/') ? JSON.stringify({ sha: commit }) : '{"image":"image","features":{"java":{}}}',
			docker: async () => { throw new Error('Docker must not run'); },
			devcontainer: async () => { throw new Error('Dev Container CLI must not run'); },
		}), /requires an image build/);
	});

	for (const rebuilt of [false, true]) {
		test(`image changes require a rebuild and accept an extension-rebuilt container (rebuilt: ${rebuilt})`, async () => {
			let lifecycleCalls = 0;
			const preparation = prepareDevContainerSample(sample, cacheDirectory, {
				fetch: async url => url.includes('/commits/') ? JSON.stringify({ sha: commit }) : '{"image":"old-image"}',
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
			await assert.rejects(prepareDevContainerSample(sample, cacheDirectory, {
				fetch: async url => url.includes('/commits/') ? JSON.stringify({ sha: commit }) : '{"image":"sample-image"}',
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
			assert.strictEqual(lifecycleCalls, failure === 'clone' ? 0 : 1);
		});
	}
});
