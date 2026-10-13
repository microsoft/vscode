/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, spy, stub } from 'sinon';
import type { CopilotClient } from '@github/copilot-sdk';
import { DeferredPromise, raceTimeout, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { dirname, isEqual, isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastDeepPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileChangeType, IFileService, IFileStatResult, IFileStatResultWithMetadata, IFileSystemWatcher, IResolveFileOptions, IResolveMetadataFileOptions, IWatchOptionsWithoutCorrelation } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { CustomizationType, type SkillCustomization } from '../../common/state/sessionState.js';
import { SessionCustomizationDiscovery } from '../../node/copilot/sessionCustomizationDiscovery.js';

type AgentsDiscoverRequest = Parameters<CopilotClient['rpc']['agents']['discover']>[0];

suite('SessionCustomizationDiscovery', () => {

	class TestFileService extends FileService {
		resolveGate: Promise<void> | undefined;

		override async resolveAll(toResolve: { resource: URI; options?: IResolveFileOptions }[]): Promise<IFileStatResult[]>;
		override async resolveAll(toResolve: { resource: URI; options: IResolveMetadataFileOptions }[]): Promise<IFileStatResultWithMetadata[]>;
		override async resolveAll(toResolve: { resource: URI; options?: IResolveFileOptions }[]): Promise<IFileStatResult[]> {
			const result = await super.resolveAll(toResolve);
			await this.resolveGate;
			return result;
		}

		override createWatcher(resource: URI, options: IWatchOptionsWithoutCorrelation & { recursive: false }): IFileSystemWatcher {
			const watcher = this.watch(resource, options);
			return {
				onDidChange: Event.filter(this.onDidFilesChange, event =>
					event.contains(resource, FileChangeType.DELETED) ||
					[...event.rawAdded, ...event.rawUpdated, ...event.rawDeleted].some(uri => isEqual(uri, resource) || isEqual(dirname(uri), resource))),
				dispose: () => watcher.dispose(),
			};
		}
	}

	const disposables = new DisposableStore();
	let fileService: TestFileService;
	let instantiationService: TestInstantiationService;
	let workspace: URI;
	let userHome: URI;

	setup(async () => {
		fileService = disposables.add(new TestFileService(new NullLogService()));
		const memFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());

		workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		userHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });
		await fileService.createFolder(workspace);
		await fileService.createFolder(userHome);
	});

	teardown(() => {
		disposables.clear();
		restore();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	async function seed(path: string, content = ''): Promise<URI> {
		const uri = URI.from({ scheme: Schemas.inMemory, path });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
		return uri;
	}

	// Mirror `URI.file`'s separator normalization (it rewrites `\` → `/` on Windows) so a
	// round-trip through `.fsPath` — used by `projectPath` attribution in discovery — matches
	// on Windows too, where `URI.fsPath` yields backslashes.
	const inMemoryPathToUri = (path: string) => URI.from({ scheme: Schemas.inMemory, path: path.replace(/\\/g, '/') });

	function createRecordingClient(requests: string[][]): CopilotClient {
		const record = (request: AgentsDiscoverRequest) => requests.push(request.projectPaths ?? []);
		return upcastDeepPartial<CopilotClient>({
			rpc: {
				agents: {
					getDiscoveryPaths: async (request: AgentsDiscoverRequest) => { record(request); return { paths: [] }; },
					discover: async (request: AgentsDiscoverRequest) => { record(request); return { agents: [] }; },
				},
				instructions: {
					getDiscoveryPaths: async (request: AgentsDiscoverRequest) => { record(request); return { paths: [] }; },
					discover: async (request: AgentsDiscoverRequest) => { record(request); return { sources: [] }; },
				},
				skills: {
					getDiscoveryPaths: async (request: AgentsDiscoverRequest) => { record(request); return { paths: [] }; },
					discover: async (request: AgentsDiscoverRequest) => { record(request); return { skills: [] }; },
				},
			},
		});
	}

	test('keeps user customizations without rechecking missing roots until recreation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await fileService.del(workspace);
		const userHook = await seed('/home/.copilot/hooks/hook.json', '{}');
		await timeout(10);
		const messages: string[] = [];
		instantiationService.stub(ILogService, new class extends NullLogService {
			override debug(message: string): void {
				messages.push(message);
			}
		}());
		const requests: string[][] = [];
		const client = createRecordingClient(requests);
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const stat = spy(fileService, 'stat');
		const results = [];
		for (let i = 0; i < 3; i++) {
			const customizations = await discovery.discover(client, CancellationToken.None);
			results.push(customizations.flatMap(customization => (customization.children ?? []).map(child => child.uri)));
		}
		const beforeRecreation = { results, requests: [...requests], messages: [...messages], rootStats: stat.withArgs(workspace).callCount };
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => fired.complete()));
		await fileService.createFolder(workspace);
		await raceTimeout(fired.p, 500);
		await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({ beforeRecreation, resumed: fired.isSettled, requests }, {
			beforeRecreation: {
				results: [[userHook.toString()], [userHook.toString()], [userHook.toString()]],
				requests: Array.from({ length: 12 }, () => []),
				messages: [`[SessionCustomizationDiscovery] Skipping missing working directory: ${workspace.toString()}`],
				rootStats: 1,
			},
			resumed: true,
			requests: [
				...Array.from({ length: 12 }, () => []),
				...Array.from({ length: 6 }, () => [workspace.fsPath]),
			],
		});
	}));

	test('releases deleted-root watches and restores discovery without losing user watches', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await seed('/workspace/.github/hooks/hook.json', '{}');
		const userHook = await seed('/home/.copilot/hooks/hook.json', '{}');
		const requests: string[][] = [];
		const client = createRecordingClient(requests);
		const watch = spy(fileService, 'watch');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		await discovery.discover(client, CancellationToken.None);
		await timeout(10);
		const workspaceWatches = watch.getCalls()
			.filter(call => isEqualOrParent(call.args[0], workspace))
			.map(call => spy(call.returnValue, 'dispose'));
		assert.ok(workspaceWatches.length > 0);
		let changes = 0;
		disposables.add(discovery.onDidChange(() => changes++));

		await fileService.del(workspace, { recursive: true });
		await timeout(10);
		const deleted = await discovery.discover(client, CancellationToken.None);
		const afterDeletion = changes;
		await seed('/unrelated/file.txt');
		await timeout(10);
		const afterUnrelatedChange = changes;
		await seed('/home/.copilot/hooks/hook.json', '{"PreToolUse": []}');
		await timeout(10);
		await discovery.discover(client, CancellationToken.None);
		const whileMissing = {
			children: deleted.flatMap(customization => (customization.children ?? []).map(child => child.uri)),
			directories: deleted.map(customization => URI.parse(customization.uri).path),
			requests: [...requests],
			watchesDisposed: workspaceWatches.every(dispose => dispose.calledOnce),
			ignoredUnrelatedChange: afterDeletion === afterUnrelatedChange,
			userChangeDetected: changes > afterUnrelatedChange,
		};
		await fileService.createFolder(workspace);
		await timeout(10);
		await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({ whileMissing, restoredRequests: requests.slice(-6) }, {
			whileMissing: {
				children: [userHook.toString()],
				directories: ['/home/.copilot/hooks'],
				requests: [
					...Array.from({ length: 6 }, () => [workspace.fsPath]),
					...Array.from({ length: 9 }, () => []),
				],
				watchesDisposed: true,
				ignoredUnrelatedChange: true,
				userChangeDetected: true,
			},
			restoredRequests: Array.from({ length: 6 }, () => [workspace.fsPath]),
		});
	}));

	test('uses surviving roots without promoting secondary hooks or retaining missing-root directories', async () => {
		const secondWorkspace = inMemoryPathToUri('/workspace2');
		await seed('/workspace2/.github/hooks/hook.json', '{}');
		const instruction = await seed('/workspace2/.github/copilot-instructions.md', 'instructions');
		await fileService.del(workspace);
		const requests: string[][] = [];
		const client = createRecordingClient(requests);
		client.rpc.instructions.discover = async request => {
			requests.push(request.projectPaths ?? []);
			return { sources: [{ id: 'rule', label: 'Rule', sourcePath: '.github/copilot-instructions.md', content: 'instructions', type: 'repo', location: 'repository' }] };
		};
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
		const customizations = await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({
			requests,
			hookDirectories: customizations.filter(customization => customization.contents === 'hook').map(customization => URI.parse(customization.uri).path),
			children: customizations.flatMap(customization => (customization.children ?? []).map(child => child.uri)),
		}, {
			requests: Array.from({ length: 6 }, () => [secondWorkspace.fsPath]),
			hookDirectories: ['/home/.copilot/hooks'],
			children: [instruction.toString()],
		});
	});

	test('recovers when a missing working directory and its parent are recreated separately', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const directory = inMemoryPathToUri('/worktrees/deleted');
		const requests: string[][] = [];
		const client = createRecordingClient(requests);
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [directory], userHome, inMemoryPathToUri));
		await discovery.discover(client, CancellationToken.None);
		let changes = 0;
		disposables.add(discovery.onDidChange(() => changes++));
		await fileService.createFolder(inMemoryPathToUri('/worktrees'));
		await timeout(250);
		await discovery.discover(client, CancellationToken.None);
		await fileService.createFolder(directory);
		await timeout(250);
		await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({ changes, requests }, {
			changes: 2,
			requests: [
				...Array.from({ length: 12 }, () => []),
				...Array.from({ length: 6 }, () => [directory.fsPath]),
			],
		});
	}));

	test('retains recovery watches after transient filesystem failures without marking directories missing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const messages: string[] = [];
		const errors: string[] = [];
		instantiationService.stub(ILogService, new class extends NullLogService {
			override debug(message: string): void { messages.push(message); }
			override error(message: string | Error): void { errors.push(String(message)); }
		}());
		const requests: string[][] = [];
		const client = createRecordingClient(requests);
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => fired.complete()));
		const stat = stub(fileService, 'stat').callThrough();
		stat.withArgs(workspace).rejects(new Error('Transient filesystem failure'));
		try {
			await discovery.discover(client, CancellationToken.None);
		} finally {
			stat.restore();
		}
		await fileService.del(workspace);
		await fileService.createFolder(workspace);
		await timeout(250);
		await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({ messages, errors, requests, recoveryTriggered: fired.isSettled }, {
			messages: [],
			errors: [`[SessionCustomizationDiscovery] Error during discovery: Transient filesystem failure, projectPaths: ${workspace.fsPath}`],
			requests: Array.from({ length: 6 }, () => [workspace.fsPath]),
			recoveryTriggered: true,
		});
	}));

	for (const cancel of [true, false]) {
		test(`cannot install recovery watches after disposal (cancel=${cancel})`, async () => {
			await fileService.del(workspace);
			const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
			const tokenSource = disposables.add(new CancellationTokenSource());
			const resolving = new DeferredPromise<void>();
			const resolved = new DeferredPromise<void>();
			const resolveAll = stub(fileService, 'resolveAll').callsFake(async () => {
				resolving.complete();
				await resolved.p;
				return [];
			});
			const watch = spy(fileService, 'watch');
			try {
				const discovering = discovery.discover(createRecordingClient([]), tokenSource.token);
				await resolving.p;
				if (cancel) {
					tokenSource.cancel();
				}
				discovery.dispose();
				resolved.complete();
				await assert.rejects(discovering, CancellationError);
				assert.strictEqual(watch.callCount, 0);
			} finally {
				resolveAll.restore();
				watch.restore();
			}
		});
	}

	test('preserves user-home discovery for sessions without working directories', async () => {
		const requests: string[][] = [];
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [], userHome, inMemoryPathToUri));
		await discovery.discover(createRecordingClient(requests), CancellationToken.None);

		assert.deepStrictEqual(requests, Array.from({ length: 6 }, () => []));
	});

	test('discovers SDK user agents, skills and instructions when every project root is missing', async () => {
		await fileService.del(workspace);
		const agentFile = await seed('/home/.copilot/agents/user.agent.md', 'agent');
		const skillFile = await seed('/home/.copilot/skills/user/SKILL.md', '---\nname: user\n---\nskill');
		const instructionFile = await seed('/home/.copilot/copilot-instructions.md', 'instructions');
		const requests: string[][] = [];
		const record = (request: AgentsDiscoverRequest) => requests.push(request.projectPaths ?? []);
		const client = upcastDeepPartial<CopilotClient>({
			rpc: {
				agents: {
					getDiscoveryPaths: async (request: AgentsDiscoverRequest) => { record(request); return { paths: [{ path: dirname(agentFile).fsPath }] }; },
					discover: async (request: AgentsDiscoverRequest) => {
						record(request);
						return { agents: [{ id: 'user', name: 'User', path: agentFile.fsPath }] };
					},
				},
				instructions: {
					getDiscoveryPaths: async (request: AgentsDiscoverRequest) => { record(request); return { paths: [{ path: instructionFile.fsPath, kind: 'file' }] }; },
					discover: async (request: AgentsDiscoverRequest) => {
						record(request);
						return { sources: [{ id: 'user', label: 'User', sourcePath: instructionFile.fsPath, type: 'home' }] };
					},
				},
				skills: {
					getDiscoveryPaths: async (request: AgentsDiscoverRequest) => { record(request); return { paths: [{ path: dirname(dirname(skillFile)).fsPath }] }; },
					discover: async (request: AgentsDiscoverRequest) => {
						record(request);
						return { skills: [{ name: 'User', path: skillFile.fsPath }] };
					},
				},
			},
		});
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const customizations = await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({
			requests,
			children: customizations.flatMap(customization => (customization.children ?? []).map(child => child.uri)).sort(),
		}, {
			requests: Array.from({ length: 6 }, () => []),
			children: [agentFile, skillFile, instructionFile].map(uri => uri.toString()).sort(),
		});
	});

	test('ignores unrelated root changes and stops notifications on disposal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await seed('/workspace/.github/hooks/hook.json', '{}');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		await discovery.discover(createRecordingClient([]), CancellationToken.None);
		await timeout(250);
		let changes = 0;
		disposables.add(discovery.onDidChange(() => changes++));
		await seed('/workspace/unrelated.txt');
		await timeout(250);
		const afterUnrelatedChange = changes;
		for (let i = 0; i < 5; i++) {
			await seed('/workspace/.github/hooks/hook.json', JSON.stringify({ i }));
			await timeout(10);
		}
		const afterBurst = changes;
		discovery.dispose();
		await seed('/workspace/.github/hooks/hook.json', '{}');
		await timeout(250);

		assert.deepStrictEqual({ afterUnrelatedChange, afterBurst, afterDisposal: changes }, {
			afterUnrelatedChange: 0, afterBurst: 5, afterDisposal: 5,
		});
	}));

	test('rechecks roots after an SDK failure between validation and discovery', async () => {
		const errors: string[] = [];
		instantiationService.stub(ILogService, new class extends NullLogService {
			override error(message: string | Error): void { errors.push(String(message)); }
		}());
		const requests: string[][] = [];
		const client = createRecordingClient(requests);
		stub(client.rpc.agents, 'discover').onFirstCall().callsFake(async () => {
			await fileService.del(workspace);
			throw new Error('Invalid working directory');
		}).callThrough();
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		await discovery.discover(client, CancellationToken.None);
		requests.length = 0;
		await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({ errors, requests }, {
			errors: [`[SessionCustomizationDiscovery] Error during discovery: Invalid working directory, projectPaths: ${workspace.fsPath}`],
			requests: Array.from({ length: 6 }, () => []),
		});
	});

	test('failed SDK discovery cancels pending watcher installation', async () => {
		await seed('/home/.copilot/hooks/hook.json', '{}');
		const errors: string[] = [];
		instantiationService.stub(ILogService, new class extends NullLogService {
			override error(message: string | Error): void { errors.push(String(message)); }
		}());
		const resolved = new DeferredPromise<void>();
		const client = createRecordingClient([]);
		client.rpc.agents.discover = async () => {
			fileService.resolveGate = resolved.p;
			throw new Error('SDK failure');
		};
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const watch = spy(fileService, 'watch');
		await discovery.discover(client, CancellationToken.None);
		watch.resetHistory();
		resolved.complete();
		await timeout(10);

		assert.deepStrictEqual({ errors, lateWatches: watch.callCount }, {
			errors: [`[SessionCustomizationDiscovery] Error during discovery: SDK failure, projectPaths: ${workspace.fsPath}`],
			lateWatches: 0,
		});
	});

	test('rearms watches when a root is deleted and recreated before refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const hookFile = await seed('/workspace/.github/hooks/hook.json', '{}');
		const requests: string[][] = [];
		const client = createRecordingClient(requests);
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const watch = spy(fileService, 'watch');
		await discovery.discover(client, CancellationToken.None);
		await timeout(10);
		const previousWatch = watch.getCalls().find(call => isEqual(call.args[0], dirname(hookFile)));
		assert.ok(previousWatch);
		const dispose = spy(previousWatch.returnValue, 'dispose');
		await fileService.del(workspace, { recursive: true });
		await seed('/workspace/.github/hooks/hook.json', '{}');
		await timeout(10);
		const restored = await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({
			disposedOldWatch: dispose.calledOnce,
			hookWatches: watch.getCalls().filter(call => isEqual(call.args[0], dirname(hookFile))).length,
			requests,
			children: restored.flatMap(customization => (customization.children ?? []).map(child => child.uri)),
		}, {
			disposedOldWatch: true,
			hookWatches: 2,
			requests: Array.from({ length: 12 }, () => [workspace.fsPath]),
			children: [hookFile.toString()],
		});
	}));

	test('excludes a non-directory root and recovers when it becomes a directory', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await fileService.del(workspace);
		await seed('/workspace', 'not a directory');
		await timeout(10);
		const requests: string[][] = [];
		const client = createRecordingClient(requests);
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		await discovery.discover(client, CancellationToken.None);
		await fileService.del(workspace);
		await fileService.createFolder(workspace);
		await timeout(10);
		await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual(requests, [
			...Array.from({ length: 6 }, () => []),
			...Array.from({ length: 6 }, () => [workspace.fsPath]),
		]);
	}));

	test('groups discovered customizations by parent folder', async () => {
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					discover: async () => ({
						agents: [
							{ id: 'one', name: 'One', description: '', path: '/workspace/.github/agents/one.agent.md', userInvocable: false },
							{ id: 'two', name: 'Two', description: '', path: '/workspace/.github/agents/two.agent.md', userInvocable: true },
							{ id: 'three', name: 'Three', description: '', path: '/workspace/.github/other/three.agent.md', userInvocable: false },
						],
					}),
				},
				instructions: { discover: async () => ({ sources: [] }) },
				skills: { discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const agentDirectories = customizations.filter(customization => customization.contents === 'agent');

		const getPath = (uri: string) => URI.parse(uri).path;

		assert.strictEqual(agentDirectories.length, 2);
		assert.deepStrictEqual(agentDirectories.map(customization => getPath(customization.uri)).sort(), [
			'/workspace/.github/agents',
			'/workspace/.github/other',
		]);
		const agentsInAgentsDir = agentDirectories.find(customization => getPath(customization.uri) === '/workspace/.github/agents');
		assert.ok(agentsInAgentsDir);
		assert.deepStrictEqual(agentsInAgentsDir.children?.map(child => getPath(child.uri)).sort(), [
			'/workspace/.github/agents/one.agent.md',
			'/workspace/.github/agents/two.agent.md',
		]);
	});

	test('projects SDK-native plugin customizations as a plugin container', async () => {
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(String(message));
			}
		}();
		instantiationService.stub(ILogService, logService);

		const pluginRoot = '/home/.copilot/installed-plugins/example';
		await seed(`${pluginRoot}/.plugin/plugin.json`, JSON.stringify({ name: 'example-plugin', version: '1.2.3' }));
		const pluginAgent = await seed(`${pluginRoot}/agents/reviewer.agent.md`, '---\nname: reviewer\ndescription: Reviews changes\n---\n');
		const pluginSkill = await seed(`${pluginRoot}/skills/example/SKILL.md`, '---\nname: example\ndescription: Example skill\n---\n');
		const pluginRule = await seed(`${pluginRoot}/rules/example.instructions.md`, '---\nname: Example instruction\n---\n');
		const builtinSkill = await seed('/runtime/skills/builtin/SKILL.md', '---\nname: builtin\n---\n');
		const projectSkill = await seed('/workspace/.github/skills/project/SKILL.md', '---\nname: project\n---\n');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						agents: [{ id: 'reviewer', name: 'reviewer', description: 'Reviews changes', path: pluginAgent.path, source: 'plugin', userInvocable: true }],
					}),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						sources: [{ id: 'example-instruction', label: 'Example instruction', description: '', sourcePath: pluginRule.path, type: 'plugin', location: 'plugin' }],
					}),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/skills' }] }),
					discover: async () => ({
						skills: [
							{ name: 'example', description: '', path: pluginSkill.path, source: 'plugin', enabled: true, userInvocable: true },
							{ name: 'builtin', description: '', path: builtinSkill.path, source: 'builtin', enabled: true, userInvocable: true },
							{ name: 'project', description: '', path: projectSkill.path, source: 'project', enabled: true, userInvocable: true },
						],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({
			errors,
			skillDirectories: customizations
				.filter(customization => customization.type === CustomizationType.Directory && customization.contents === 'skill')
				.map(customization => ({
					uri: customization.uri,
					children: customization.children?.map(child => child.uri),
				})),
			plugins: customizations
				.filter(customization => customization.type === CustomizationType.Plugin)
				.map(customization => ({
					uri: customization.uri,
					name: customization.name,
					version: customization.version,
					children: customization.children?.map(child => ({ type: child.type, uri: child.uri })),
				})),
		}, {
			errors: [],
			skillDirectories: [{
				uri: URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/skills' }).toString(),
				children: [projectSkill.toString()],
			}],
			plugins: [{
				uri: URI.from({ scheme: Schemas.inMemory, path: pluginRoot }).toString(),
				name: 'example-plugin',
				version: '1.2.3',
				children: [
					{ type: CustomizationType.Agent, uri: pluginAgent.toString() },
					{ type: CustomizationType.Skill, uri: pluginSkill.toString() },
					{ type: CustomizationType.Rule, uri: pluginRule.toString() },
				],
			}],
		});
	});

	test('discover includes hooks from recursive and fixed hook locations', async () => {
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		await seed('/workspace/.github/copilot/settings.json', '{"hooks": {"PreToolUse": []}}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const hookDirectories = customizations
			.filter(customization => customization.contents === 'hook')
			.map(customization => ({
				uri: URI.parse(customization.uri).path,
				children: (customization.children ?? []).map(child => URI.parse(child.uri).path).sort(),
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(hookDirectories, [
			{ uri: '/home/.copilot/hooks', children: [] },
			{ uri: '/workspace/.github/copilot', children: ['/workspace/.github/copilot/settings.json'] },
			{ uri: '/workspace/.github/hooks', children: ['/workspace/.github/hooks/pre-tool.json'] },
		]);
	});

	test('marks agent instruction rule sources as always apply', async () => {
		await seed('/workspace/AGENTS.md', 'workspace agents instructions');
		await seed('/workspace/.github/instructions/rule.instructions.md', 'scoped instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/instructions', kind: 'directory' },
							{ path: '/workspace/AGENTS.md', kind: 'file' },
						],
					}),
					discover: async () => ({
						sources: [
							{ id: 'agentInstruction', label: 'AGENTS.md', sourcePath: '/workspace/AGENTS.md', applyTo: [], type: 'repo' },
							{ id: 'scopedInstruction', label: 'Rule', sourcePath: '/workspace/.github/instructions/rule.instructions.md', applyTo: ['src/**'], type: 'child-instructions' },
						],
					}),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const rules = customizations
			.filter(customization => customization.contents === 'rule')
			.flatMap(customization => customization.children ?? [])
			.map(child => ({
				uri: URI.parse(child.uri).path,
				alwaysApply: child.type === 'rule' ? child.alwaysApply : undefined,
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(rules, [
			{ uri: '/workspace/.github/instructions/rule.instructions.md', alwaysApply: false },
			{ uri: '/workspace/AGENTS.md', alwaysApply: true },
		]);
	});

	test('drops missing agent instruction files and empty agent instruction directories', async () => {
		await seed('/workspace/.github/instructions/rule.instructions.md', 'scoped instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/instructions', kind: 'directory' },
							{ path: '/workspace/AGENTS.md', kind: 'file' },
						],
					}),
					discover: async () => ({
						sources: [
							{ id: 'agentInstruction', label: 'AGENTS.md', sourcePath: '/workspace/AGENTS.md', applyTo: [], type: 'repo' },
							{ id: 'scopedInstruction', label: 'Rule', sourcePath: '/workspace/.github/instructions/rule.instructions.md', applyTo: ['src/**'], type: 'child-instructions' },
						],
					}),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const ruleDirectories = customizations
			.filter(customization => customization.contents === 'rule')
			.map(customization => ({
				uri: URI.parse(customization.uri).path,
				children: (customization.children ?? []).map(child => URI.parse(child.uri).path).sort(),
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(ruleDirectories, [
			{ uri: '/workspace/.github/instructions', children: ['/workspace/.github/instructions/rule.instructions.md'] },
		]);
	});

	test('discover returns working-directory agents, skills, instructions, hooks, and agent instructions', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');
		await seed('/workspace/.github/instructions/baz.instructions.md', 'instruction body');
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		await seed('/workspace/.github/copilot/settings.json', '{"hooks": {"PreToolUse": []}}');
		await seed('/workspace/.github/copilot-instructions.md', 'workspace copilot instructions');
		await seed('/workspace/AGENTS.md', 'workspace agents instructions');
		await seed('/home/.copilot/copilot-instructions.md', 'user copilot instructions');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/agents' }] }),
					discover: async () => ({
						agents: [
							{ id: 'agent', name: 'Agent', description: 'agent description', path: '/workspace/.github/agents/foo.agent.md', userInvocable: true },
						],
					}),
				},
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/instructions', kind: 'directory' },
							{ path: '/workspace/.github/copilot-instructions.md', kind: 'file' },
							{ path: '/workspace/AGENTS.md', kind: 'file' },
							{ path: '/home/.copilot/copilot-instructions.md', kind: 'file' },
						],
					}),
					discover: async () => ({
						sources: [
							{ id: 'rule', label: 'Rule', description: 'rule description', sourcePath: '/workspace/.github/instructions/baz.instructions.md', applyTo: [] },
						],
					}),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/skills' }] }),
					discover: async () => ({
						skills: [
							{ name: 'Skill', description: 'skill description', path: '/workspace/.github/skills/bar/SKILL.md' },
						],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const directories = customizations
			.map(customization => ({
				contents: customization.contents,
				uri: URI.parse(customization.uri).path,
				writable: customization.writable,
				children: (customization.children ?? []).map(child => URI.parse(child.uri).path).sort(),
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(directories, [
			{ contents: 'rule', uri: '/home', writable: false, children: ['/home/.copilot/copilot-instructions.md'] },
			{ contents: 'hook', uri: '/home/.copilot/hooks', writable: true, children: [] },
			{ contents: 'rule', uri: '/workspace', writable: false, children: ['/workspace/.github/copilot-instructions.md', '/workspace/AGENTS.md'] },
			{ contents: 'agent', uri: '/workspace/.github/agents', writable: true, children: ['/workspace/.github/agents/foo.agent.md'] },
			{ contents: 'hook', uri: '/workspace/.github/copilot', writable: true, children: ['/workspace/.github/copilot/settings.json'] },
			{ contents: 'hook', uri: '/workspace/.github/hooks', writable: true, children: ['/workspace/.github/hooks/pre-tool.json'] },
			{ contents: 'rule', uri: '/workspace/.github/instructions', writable: true, children: ['/workspace/.github/instructions/baz.instructions.md'] },
			{ contents: 'skill', uri: '/workspace/.github/skills', writable: true, children: ['/workspace/.github/skills/bar/SKILL.md'] },
		]);
	});

	test('discover preserves SDK skill visibility and file-backed model invocation metadata', async () => {
		await seed('/workspace/.github/skills/bar/SKILL.md', '---\nname: bar\ndisable-model-invocation: true\n---\nskill body');
		await seed('/workspace/.github/skills/default/SKILL.md', '---\nname: default\n---\nskill body');
		await seed('/workspace/.github/skills/visible/SKILL.md', '---\nname: visible\nuser-invocable: true\ndisable-model-invocation: false\n---\nskill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/skills' }] }),
					discover: async () => ({
						skills: [{
							name: 'bar',
							description: 'skill description',
							path: '/workspace/.github/skills/bar/SKILL.md',
							enabled: false,
							userInvocable: false,
						}, {
							name: 'default',
							description: 'default skill',
							path: '/workspace/.github/skills/default/SKILL.md',
							enabled: true,
						}, {
							name: 'visible',
							description: 'visible skill',
							path: '/workspace/.github/skills/visible/SKILL.md',
							enabled: true,
							userInvocable: true,
						}],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const skills = customizations
			.flatMap(customization => customization.children ?? [])
			.filter((child): child is SkillCustomization => child.type === CustomizationType.Skill)
			.map(skill => ({
				name: skill.name,
				description: skill.description,
				enabled: skill.enabled,
				disableModelInvocation: skill.disableModelInvocation,
				disableUserInvocation: skill.disableUserInvocation,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		assert.deepStrictEqual(skills, [{
			name: 'bar',
			description: 'skill description',
			enabled: false,
			disableModelInvocation: true,
			disableUserInvocation: true,
		}, {
			name: 'default',
			description: 'default skill',
			enabled: true,
			disableModelInvocation: undefined,
			disableUserInvocation: undefined,
		}, {
			name: 'visible',
			description: 'visible skill',
			enabled: true,
			disableModelInvocation: undefined,
			disableUserInvocation: undefined,
		}]);
	});

	test('discover groups case-variant instructions and nested skills under their roots', async () => {
		const caseVariantUserHome = URI.from({ scheme: Schemas.inMemory, path: '/HOME' });
		await seed('/home/.copilot/copilot-instructions.md', 'user copilot instructions');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], caseVariantUserHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/home/.copilot/copilot-instructions.md', kind: 'file' }] }),
					discover: async () => ({ sources: [{ id: 'userInstruction', label: 'User instruction', sourcePath: '/home/.copilot/copilot-instructions.md', type: 'home' }] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/skills' },
							{ path: '/workspace/.github/skills/bar' },
						]
					}),
					discover: async () => ({ skills: [{ name: 'Skill', description: 'skill description', path: '/workspace/.github/skills/bar/SKILL.md' }] }),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const directories = customizations
			.filter(customization => customization.contents === 'rule' || customization.contents === 'skill')
			.map(customization => ({
				contents: customization.contents,
				uri: URI.parse(customization.uri).path,
				children: (customization.children ?? []).map(child => URI.parse(child.uri).path),
			}));

		assert.deepStrictEqual(directories, [
			{ contents: 'rule', uri: '/HOME', children: ['/home/.copilot/copilot-instructions.md'] },
			{ contents: 'skill', uri: '/workspace/.github/skills', children: ['/workspace/.github/skills/bar/SKILL.md'] },
		]);
	});

	test('watches the discovered skill root so new skills fire onDidChange', async () => {
		// The skill root exists but is empty; getDiscoveryPaths still reports it.
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/skills' }));

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/skills' }] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		await discovery.discover(client, CancellationToken.None);
		await timeout(50);

		let changeCount = 0;
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		await seed('/workspace/.github/skills/new-skill/SKILL.md', 'new workspace skill');
		await raceTimeout(fired.p, 500);

		assert.strictEqual(changeCount, 1, 'expected onDidChange to fire when a skill is added under the discovered skill root');
	});

	test('discover propagates cancellation without logging an error', async () => {
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(String(message));
			}
		}();
		instantiationService.stub(ILogService, logService);

		const agentDiscoveryStarted = new DeferredPromise<void>();
		const agentDiscovery = new DeferredPromise<{ agents: [] }>();
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: () => {
						agentDiscoveryStarted.complete();
						return agentDiscovery.p;
					},
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const cancelSource = disposables.add(new CancellationTokenSource());
		const discovering = discovery.discover(client, cancelSource.token).then(
			() => false,
			error => error instanceof CancellationError,
		);

		await agentDiscoveryStarted.p;
		cancelSource.cancel();
		const wasCancellationError = await discovering;
		agentDiscovery.complete({ agents: [] });

		assert.deepStrictEqual({ wasCancellationError, errors }, { wasCancellationError: true, errors: [] });
	});

	test('discover includes hooks from the primary working directory only', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		await seed('/workspace2/.github/hooks/pre-tool.json', '{"PreToolUse": []}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
				instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
				skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const hookChildren = (await discovery.discover(client, CancellationToken.None))
			.filter(customization => customization.contents === 'hook')
			.flatMap(customization => (customization.children ?? []).map(child => URI.parse(child.uri).path))
			.sort();

		// Hooks come only from the primary root (`/workspace`), never `/workspace2`.
		assert.deepStrictEqual(hookChildren, ['/workspace/.github/hooks/pre-tool.json']);
	});

	test('discover resolves relative instructions against their attributed project root and groups per root', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		const firstFile = await seed('/workspace/.github/copilot-instructions.md', 'first');
		const secondFile = await seed('/workspace2/.github/copilot-instructions.md', 'second');

		let requestedProjectPaths: string[] | undefined;
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/copilot-instructions.md', kind: 'file' },
							{ path: '/workspace2/.github/copilot-instructions.md', kind: 'file' },
						],
					}),
					discover: async (request: AgentsDiscoverRequest) => {
						requestedProjectPaths = request.projectPaths;
						// Same RELATIVE sourcePath from two roots, disambiguated only by projectPath.
						return {
							sources: [
								{ id: 'a', label: 'A', sourcePath: '.github/copilot-instructions.md', applyTo: undefined, type: 'repo', projectPath: workspace.fsPath },
								{ id: 'b', label: 'B', sourcePath: '.github/copilot-instructions.md', applyTo: undefined, type: 'repo', projectPath: secondWorkspace.fsPath },
							],
						};
					},
				},
				skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const ruleDirectories = customizations
			.filter(customization => customization.contents === 'rule')
			.map(customization => ({
				uri: customization.uri,
				children: (customization.children ?? []).map(child => child.uri).sort(),
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual({ requestedProjectPaths, ruleDirectories }, {
			requestedProjectPaths: [workspace.fsPath, secondWorkspace.fsPath],
			ruleDirectories: [
				{ uri: workspace.toString(), children: [firstFile.toString()] },
				{ uri: secondWorkspace.toString(), children: [secondFile.toString()] },
			].sort((a, b) => a.uri.localeCompare(b.uri)),
		});
	});

	test('discover surfaces agents and skills from every working directory in one call', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		await fileService.createFolder(secondWorkspace);
		let agentProjectPaths: string[] | undefined;
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async (request: AgentsDiscoverRequest) => {
						agentProjectPaths = request.projectPaths;
						return {
							agents: [
								{ id: 'one', name: 'One', description: '', path: '/workspace/.github/agents/one.agent.md', userInvocable: false },
								{ id: 'two', name: 'Two', description: '', path: '/workspace2/.github/agents/two.agent.md', userInvocable: false },
							],
						};
					},
				},
				instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						skills: [
							{ path: '/workspace/.github/skills/a', name: 'A', description: '' },
							{ path: '/workspace2/.github/skills/b', name: 'B', description: '' },
						],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const childUris = customizations
			.flatMap(customization => (customization.children ?? []).map(child => URI.parse(child.uri).path))
			.sort();

		assert.deepStrictEqual({ agentProjectPaths, childUris }, {
			agentProjectPaths: [workspace.fsPath, secondWorkspace.fsPath],
			childUris: [
				'/workspace/.github/agents/one.agent.md',
				'/workspace/.github/skills/a',
				'/workspace2/.github/agents/two.agent.md',
				'/workspace2/.github/skills/b',
			],
		});
	});
});
