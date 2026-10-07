/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { AgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { MissionControlProjects } from '../../node/missionControl/missionControlProjects.js';
import { readCloudSandboxCloneResult, readCloudSandboxProjects } from '../../common/meta/cloudSandboxProjectMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE } from '../../common/agent.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';

suite('Mission Control projects', () => {
	const suiteStore = ensureNoDisposablesAreLeakedInTestSuite();
	let store: DisposableStore;
	let directory: string;

	setup(async () => {
		store = suiteStore.add(new DisposableStore());
		directory = await realpath(await mkdtemp(join(process.cwd(), '.build', 'mission-control-projects-')));
	});

	teardown(async () => {
		store.dispose();
		await rm(directory, { recursive: true, force: true });
	});

	async function fixture(runGit?: ConstructorParameters<typeof MissionControlProjects>[0]['runGit']) {
		const home = join(directory, 'home');
		const workspace = join(directory, 'workspace');
		await Promise.all([mkdir(home, { recursive: true }), mkdir(workspace, { recursive: true })]);
		const environment = new class extends mock<INativeEnvironmentService>() {
			override readonly userHome = URI.file(home);
			override readonly userDataPath = join(directory, 'data');
		}();
		const log = new NullLogService();
		const state = store.add(new AgentHostStateManager(log));
		const git = new AgentHostGitService(new class extends mock<IFileService>() { }(), environment, log);
		const options = { getRoots: () => [workspace], runGit };
		const projects = store.add(new MissionControlProjects(options, environment, git,
			new class extends mock<IAgentHostAuthenticationService>() {
				override getAuthToken(): string { return 'test-credential'; }
			}(),
			new class extends mock<IAgentHostGitHubEndpointService>() {
				override getEnterpriseUri(): undefined { return undefined; }
				override getRepoResource() { return GITHUB_REPO_PROTECTED_RESOURCE; }
				override getCopilotResource() { return GITHUB_COPILOT_PROTECTED_RESOURCE; }
			}(), state, log));
		await projects.initialize();
		return { projects, state, options, home, workspace };
	}

	function catalogue(projects: MissionControlProjects) {
		return readCloudSandboxProjects({ agents: [], _meta: { 'copilot.projectManagement': { available: true } }, config: projects.config })!;
	}

	test('pins shared folders, lists and unpins without deleting user files, and restores runtime pins', async () => {
		const { projects, workspace } = await fixture();
		const folder = join(workspace, 'folder');
		await mkdir(folder);
		await writeFile(join(folder, 'keep.txt'), 'keep');
		const added = readCloudSandboxCloneResult(await projects.handleRequest('extensions/addProject', { path: folder }))!;
		const persisted = JSON.parse(await readFile(join(directory, 'data', 'mission-control-projects.json'), 'utf8'));
		const restored = (await fixture()).projects;
		const restoredPaths = catalogue(restored).map(project => project.path);
		const removed = await projects.handleRequest('extensions/removeProject', { id: added.id });
		assert.deepStrictEqual({
			initial: catalogue(projects).map(project => ({ path: project.path, git: project.git })),
			persisted: persisted.map((project: { path: string; origin: string }) => ({ path: project.path, origin: project.origin })),
			restored: restoredPaths,
			removed,
			file: await readFile(join(folder, 'keep.txt'), 'utf8'),
			missing: await projects.handleRequest('extensions/removeProject', { id: added.id }),
		}, {
			initial: [{ path: workspace, git: false }],
			persisted: [{ path: folder, origin: 'pinned' }],
			restored: [folder, workspace], removed: { removed: true }, file: 'keep', missing: { removed: false },
		});
	});

	test('clones under home, returns a provisional entry, publishes progress and ready, and preserves shallow branch fetches', async () => {
		const gate = new DeferredPromise<void>();
		const calls: { args: readonly string[]; token: string | undefined; helper: string | undefined }[] = [];
		const { projects, state, home } = await fixture(async (args, env, _signal, progress) => {
			calls.push({ args, token: env.VSCODE_MC_GIT_TOKEN, helper: env.GIT_CONFIG_VALUE_1 });
			if (args[0] === 'clone') {
				progress(58);
				await gate.p;
				const path = args.at(-1)!;
				await promisify(execFile)('git', ['init', path]);
				await promisify(execFile)('git', ['-C', path, 'remote', 'add', 'origin', 'https://github.com/owner/repo']);
			}
		});
		const finished = Event.toPromise(Event.filter(state.onDidEmitEnvelope, envelope =>
			envelope.action.type === ActionType.RootConfigChanged && catalogue(projects).some(project => project.status === 'ready' && project.git)));
		const initial = readCloudSandboxCloneResult(await projects.handleRequest('extensions/cloneProject', { url: 'https://github.com/owner/repo', depth: 1 }))!;
		const joined = readCloudSandboxCloneResult(await projects.handleRequest('extensions/cloneProject', { url: 'https://github.com/owner/repo', depth: 1 }))!;
		gate.complete();
		await finished;
		assert.deepStrictEqual({
			provisional: { path: initial.path, status: initial.status, progress: initial.progress },
			joined: joined.id === initial.id,
			calls: calls.map(call => ({ args: call.args, credential: !!call.token, helperContainsToken: call.helper?.includes('test-credential') ?? false })),
			ready: catalogue(projects).find(project => project.id === initial.id)?.status,
			granted: projects.roots.includes(initial.path),
			persisted: (await readFile(join(directory, 'data', 'mission-control-projects.json'), 'utf8')).includes(initial.id),
		}, {
			provisional: { path: join(home, 'owner', 'repo'), status: 'cloning', progress: 0 },
			joined: true,
			calls: [
				{ args: ['clone', '--progress', '--depth', '1', '--', 'https://github.com/owner/repo', join(home, 'owner', 'repo')], credential: true, helperContainsToken: false },
				{ args: ['-C', join(home, 'owner', 'repo'), 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'], credential: false, helperContainsToken: false },
			],
			ready: 'ready', granted: true, persisted: true,
		});
	});

	test('GitHub SSH and scp URLs clone over HTTPS with the authenticated bearer', async () => {
		const calls: { url: string; token: string | undefined }[] = [];
		const { projects, state } = await fixture(async (args, env) => {
			const url = args.at(-2)!;
			calls.push({ url, token: env.VSCODE_MC_GIT_TOKEN });
			await promisify(execFile)('git', ['init', args.at(-1)!]);
			await promisify(execFile)('git', ['-C', args.at(-1)!, 'remote', 'add', 'origin', url]);
		});
		for (const [index, url] of ['git@github.com:owner/repo-0', 'ssh://git@github.com:22/owner/repo-1'].entries()) {
			const finished = Event.toPromise(Event.filter(state.onDidEmitEnvelope, envelope =>
				envelope.action.type === ActionType.RootConfigChanged && catalogue(projects).some(project => project.status === 'ready' && project.remoteUrl === `https://github.com/owner/repo-${index}`)));
			await projects.handleRequest('extensions/cloneProject', { url });
			await finished;
		}
		assert.deepStrictEqual(calls, [
			{ url: 'https://github.com/owner/repo-0', token: 'test-credential' },
			{ url: 'https://github.com/owner/repo-1', token: 'test-credential' },
		]);
	});

	test('surfaces background clone failures in the shared catalogue without granting an incomplete checkout', async () => {
		const gate = new DeferredPromise<void>();
		const { projects, state } = await fixture(async () => {
			await gate.p;
			throw new Error('repository not found');
		});
		const failed = Event.toPromise(Event.filter(state.onDidEmitEnvelope, envelope =>
			envelope.action.type === ActionType.RootConfigChanged && catalogue(projects).some(project => project.status === 'failed')));
		const initial = readCloudSandboxCloneResult(await projects.handleRequest('extensions/cloneProject', { url: 'https://github.com/owner/repo' }))!;
		gate.complete();
		await failed;
		assert.deepStrictEqual({
			project: catalogue(projects).find(project => project.id === initial.id),
			granted: projects.roots.includes(initial.path),
			emptyReservationRemoved: await lstat(initial.path).then(() => false, error => error.code === 'ENOENT'),
		}, {
			project: { ...initial, status: 'failed', progress: undefined, error: 'repository not found' },
			granted: false,
			emptyReservationRemoved: true,
		});
	});

	test('failed clones can be retried without overwriting nonempty directories', async () => {
		let attempts = 0;
		const { projects, state } = await fixture(async args => {
			attempts++;
			if (attempts === 2) {
				await writeFile(join(args.at(-1)!, 'keep.txt'), 'keep');
			}
			throw new Error('clone failed');
		});
		const waitForFailure = () => Event.toPromise(Event.filter(state.onDidEmitEnvelope, envelope =>
			envelope.action.type === ActionType.RootConfigChanged && catalogue(projects).some(project => project.status === 'failed')));
		let failed = waitForFailure();
		const initial = readCloudSandboxCloneResult(await projects.handleRequest('extensions/cloneProject', { url: 'https://github.com/owner/repo' }))!;
		await failed;
		failed = waitForFailure();
		await projects.handleRequest('extensions/cloneProject', { url: 'https://github.com/owner/repo' });
		await failed;
		await assert.rejects(projects.handleRequest('extensions/cloneProject', { url: 'https://github.com/owner/repo' })!, ProtocolError);
		assert.deepStrictEqual({ attempts, preserved: await readFile(join(initial.path, 'keep.txt'), 'utf8') }, { attempts: 2, preserved: 'keep' });
	});

	test('unpinning cancels an in-flight clone and late completion cannot restore its catalogue entry', async () => {
		const stopped = new DeferredPromise<void>();
		const { projects, home } = await fixture(async (_args, _env, signal) => {
			await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
			stopped.complete();
		});
		const initial = readCloudSandboxCloneResult(await projects.handleRequest('extensions/cloneProject', { url: 'https://github.com/owner/repo' }))!;
		await projects.handleRequest('extensions/removeProject', { id: initial.id });
		await stopped.p;
		assert.deepStrictEqual({
			removed: catalogue(projects).every(project => project.id !== initial.id),
			defaultDestination: initial.path,
		}, { removed: true, defaultDestination: join(home, 'owner', 'repo') });
	});

	test('runs a real git clone from a granted local repository and preserves its fetch refspec', async () => {
		const { projects, state, workspace, home } = await fixture();
		const source = join(workspace, 'owner', 'repo');
		await mkdir(source, { recursive: true });
		await promisify(execFile)('git', ['init', source]);
		const ready = Event.toPromise(Event.filter(state.onDidEmitEnvelope, envelope =>
			envelope.action.type === ActionType.RootConfigChanged && catalogue(projects).some(project => project.status === 'ready' && project.git)));
		const initial = readCloudSandboxCloneResult(await projects.handleRequest('extensions/cloneProject', {
			url: URI.file(source).toString(), depth: 1,
		}))!;
		await ready;
		const cloned = join(home, 'owner', 'repo');
		const { stdout } = await promisify(execFile)('git', ['-C', cloned, 'config', 'remote.origin.fetch']);
		assert.deepStrictEqual({
			status: catalogue(projects).find(project => project.id === initial.id)?.status,
			path: await realpath(cloned),
			refspec: stdout.trim(),
		}, { status: 'ready', path: cloned, refspec: '+refs/heads/*:refs/remotes/origin/*' });
	});

	test('rejects malformed inputs, outside roots, occupied paths and symlink destinations before starting git', async () => {
		let calls = 0;
		const { projects, home, workspace } = await fixture(async () => { calls++; });
		await mkdir(join(home, 'occupied'), { recursive: true });
		await mkdir(join(home, 'occupied', 'repo'));
		await symlink(workspace, join(home, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
		const invalid = [
			null, { url: '--upload-pack=evil' }, { url: 'https://user:secret@github.com/owner/repo' },
			{ url: 'https://github.com/owner/repo?token=secret' },
			{ url: 'https://github.com/owner/repo', depth: -1 },
			{ url: 'https://github.com/owner/repo', depth: 1.5 },
			{ url: 'https://github.com/owner/repo', targetRoot: directory },
			{ url: 'https://github.com/occupied/repo' },
			{ url: 'https://github.com/escape/repo' },
		];
		for (const params of invalid) {
			await assert.rejects(projects.handleRequest('extensions/cloneProject', params)!, ProtocolError);
		}
		await assert.rejects(projects.handleRequest('extensions/addProject', { path: directory })!, ProtocolError);
		assert.strictEqual(calls, 0);
	});

	test('removal refuses destructive flags but can unpin an in-use folder without deleting it', async () => {
		const { projects, workspace } = await fixture();
		const project = catalogue(projects)[0];
		await assert.rejects(projects.handleRequest('extensions/removeProject', { id: project.id, deleteClone: true })!, ProtocolError);
		const result = await projects.handleRequest('extensions/removeProject', { id: project.id });
		assert.deepStrictEqual({ result, projects: projects.roots, directory: await realpath(workspace) }, {
			result: { removed: true }, projects: [], directory: workspace,
		});
	});

	test('does not forward the GitHub token to other origins, and cancels git on host disposal', async () => {
		const completed = new DeferredPromise<void>();
		let token: string | undefined;
		let aborted = false;
		const { projects } = await fixture(async (_args, env, signal) => {
			token = env.VSCODE_MC_GIT_TOKEN;
			await new Promise<void>(resolve => signal.addEventListener('abort', () => {
				aborted = true;
				resolve();
			}, { once: true }));
			completed.complete();
		});
		await projects.handleRequest('extensions/cloneProject', { url: 'https://example.org/owner/repo', branch: 'topic' });
		projects.dispose();
		await completed.p;
		assert.deepStrictEqual({ token, aborted }, { token: undefined, aborted: true });
	});
});
