/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { lstat, mkdir, readFile, realpath, rename, rmdir, stat, unlink, writeFile } from 'fs/promises';
import { Sequencer, ThrottledDelayer } from '../../../../base/common/async.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, isAbsolute, join, relative, sep } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentHostAuthenticationService } from '../agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { readCloudSandboxCloneResult } from '../../common/meta/cloudSandboxProjectMeta.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../../common/state/sessionState.js';
import type { RootConfigState } from '../../common/state/protocol/state.js';
import { ActionType, type ActionEnvelope } from '../../common/state/sessionActions.js';
import { IAgentHostStateManager, AgentHostStateManager } from '../agentHostStateManager.js';

export interface IMissionControlProject {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly origin: 'pinned' | 'cloned';
	readonly git: boolean;
	readonly status: 'ready' | 'cloning' | 'failed';
	readonly progress?: number;
	readonly error?: string;
	readonly remoteUrl?: string;
	readonly defaultBranch?: string;
	readonly bootPinned?: boolean;
}

interface IMissionControlProjectsOptions {
	readonly getRoots: () => readonly string[];
	readonly runGit?: typeof runGit;
}

function runGit(args: readonly string[], env: NodeJS.ProcessEnv, signal: AbortSignal, onProgress: (progress: number) => void): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = execFile('git', [...args], { env, signal, timeout: 5 * 60_000, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
			if (error) {
				reject(new Error(stderr.trim() || error.message));
			} else {
				resolve();
			}
		});
		let pending = '';
		child.stderr?.on('data', (chunk: Buffer) => {
			const lines = (pending + chunk.toString()).split(/[\r\n]/);
			pending = lines.pop() ?? '';
			for (const line of lines) {
				const match = /(?:Receiving objects|Resolving deltas|Updating files):\s+(?<percent>\d+)%/.exec(line);
				if (match?.groups) {
					onProgress(Number(match.groups.percent));
				}
			}
		});
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

/** Host-owned Copilot project catalogue, shared across Mission Control connection generations. */
export class MissionControlProjects extends Disposable {
	private readonly _projects = new Map<string, IMissionControlProject>();
	private readonly _mutations = new Sequencer();
	private readonly _progress = this._register(new ThrottledDelayer<void>(1000));
	private readonly _clones = new Map<string, AbortController>();
	private readonly _onDidChange = this._register(new Emitter<ActionEnvelope>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _bootRoots = new Set<string>();
	private readonly _runGit: typeof runGit;
	private readonly _cataloguePath: string;
	private _loaded: Promise<void> | undefined;

	constructor(
		private readonly _options: IMissionControlProjectsOptions,
		@INativeEnvironmentService private readonly _environment: INativeEnvironmentService,
		@IAgentHostGitService private readonly _git: IAgentHostGitService,
		@IAgentHostAuthenticationService private readonly _authentication: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _endpoints: IAgentHostGitHubEndpointService,
		@IAgentHostStateManager private readonly _state: AgentHostStateManager,
		@ILogService private readonly _log: ILogService,
	) {
		super();
		this._runGit = _options.runGit ?? runGit;
		this._cataloguePath = join(_environment.userDataPath, 'mission-control-projects.json');
		this._register(toDisposable(() => {
			for (const controller of this._clones.values()) {
				controller.abort();
			}
		}));
	}

	get roots(): readonly string[] {
		return [...this._projects.values()].filter(project => project.status === 'ready' && this._isCurrentProject(project)).map(project => project.path);
	}

	get config(): RootConfigState {
		return { schema: { type: 'object', properties: {} }, values: { copilot: { projects: [...this._projects.values()].filter(project => this._isCurrentProject(project)) } } };
	}

	private _isCurrentProject(project: IMissionControlProject): boolean {
		return !project.bootPinned || this._options.getRoots().some(root => extUriBiasedIgnorePathCase.isEqual(URI.file(root), URI.file(project.path)));
	}

	/** Reconciles shared folders, omitting directories that no longer exist. */
	async initialize(): Promise<void> {
		await (this._loaded ??= this._load());
		await this._mutations.queue(async () => {
			const paths = (await Promise.all(this._options.getRoots().map(async root => {
				try {
					return await realpath(root);
				} catch (error) {
					if (!isRecord(error) || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
						throw error;
					}
					this._log.warn('[MissionControl] Ignoring a missing shared project directory', root);
					return undefined;
				}
			}))).filter(path => path !== undefined);
			const currentIds = new Set(paths.map(path => this._id(path)));
			for (const [id, project] of this._projects) {
				if (project.bootPinned && !currentIds.has(id)) {
					this._projects.delete(id);
				}
			}
			for (const path of this._bootRoots) {
				if (!currentIds.has(this._id(path))) {
					this._bootRoots.delete(path);
				}
			}
			for (const path of paths) {
				const id = this._id(path);
				if (!this._projects.has(id) && !this._bootRoots.has(path)) {
					this._projects.set(id, await this._entry(path, 'pinned', true));
				}
				this._bootRoots.add(path);
			}
			this._publish();
		});
	}

	handleRequest(method: string, params: unknown, checkAuthorization?: () => void): Promise<unknown> | undefined {
		switch (method) {
			case 'extensions/listProjects':
			case 'extensions/addProject':
			case 'extensions/removeProject':
			case 'extensions/cloneProject':
				return this._mutations.queue(async () => {
					await (this._loaded ??= this._load());
					checkAuthorization?.();
					if (!isRecord(params)) {
						throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'params must be an object');
					}
					switch (method) {
						case 'extensions/listProjects': return { projects: [...this._projects.values()] };
						case 'extensions/addProject': return this._add(params, checkAuthorization);
						case 'extensions/removeProject': return this._remove(params);
						default: return this._clone(params, checkAuthorization);
					}
				});
			default: return undefined;
		}
	}

	private async _load(): Promise<void> {
		let content: string;
		try {
			content = await readFile(this._cataloguePath, 'utf8');
		} catch (error) {
			if (isRecord(error) && error.code === 'ENOENT') {
				return;
			}
			throw error;
		}
		const value: unknown = JSON.parse(content);
		const entries: unknown[] | undefined = Array.isArray(value) ? value : undefined;
		if (!entries) {
			throw new Error('Invalid Mission Control project catalogue');
		}
		for (const entry of entries) {
			const parsed = readCloudSandboxCloneResult({ project: entry });
			if (!parsed || parsed.status !== 'ready' || !isRecord(entry) || (entry.origin !== 'pinned' && entry.origin !== 'cloned') || !isAbsolute(parsed.path)) {
				throw new Error('Invalid Mission Control project catalogue entry');
			}
			try {
				const path = await realpath(parsed.path);
				if (!extUriBiasedIgnorePathCase.isEqual(URI.file(path), URI.file(parsed.path))) {
					this._log.warn('[MissionControl] Project directory changed its canonical location', parsed.path);
					continue;
				}
				this._projects.set(this._id(path), await this._entry(path, entry.origin));
			} catch (error) {
				if (!isRecord(error) || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
					throw error;
				}
				this._log.warn('[MissionControl] Removing a missing directory from the project catalogue', parsed.path);
			}
		}
		this._publish();
	}

	private async _entry(path: string, origin: IMissionControlProject['origin'], bootPinned = false): Promise<IMissionControlProject> {
		const directory = URI.file(path);
		const repository = await this._git.getRepositoryRoot(directory);
		const git = !!repository && extUriBiasedIgnorePathCase.isEqual(repository, directory);
		const remote = git ? (await this._git.getFetchRemotes(directory))?.find(remote => remote.name === 'origin')?.url : undefined;
		return {
			id: this._id(path), name: basename(path), path, origin, git, status: 'ready',
			remoteUrl: remote ? this._sanitizeUrl(remote) : undefined,
			defaultBranch: git ? (await this._git.getDefaultBranch(directory))?.name : undefined,
			...(bootPinned ? { bootPinned: true } : {}),
		};
	}

	private async _add(params: Record<string, unknown>, checkAuthorization?: () => void): Promise<unknown> {
		if (typeof params.path !== 'string' || !isAbsolute(params.path)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'path must be an absolute directory');
		}
		const path = await realpath(params.path);
		if (!await this._isGranted(path) || !(await stat(path)).isDirectory()) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Project must be an existing directory inside the host workspace grants');
		}
		const existing = this._projects.get(this._id(path));
		const project = existing ?? await this._entry(path, 'pinned');
		checkAuthorization?.();
		this._projects.set(project.id, project);
		try {
			await this._persist();
		} catch (error) {
			if (!existing) {
				this._projects.delete(project.id);
			}
			throw error;
		}
		this._publish();
		return { project };
	}

	private async _remove(params: Record<string, unknown>): Promise<unknown> {
		if (typeof params.id !== 'string' || !params.id
			|| ['deleteClone', 'deleteWorktrees', 'force'].some(key => params[key] !== undefined && typeof params[key] !== 'boolean')) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'id must be a nonempty string; removal options must be booleans when provided');
		}
		if (params.deleteClone || params.deleteWorktrees || params.force) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Destructive project removal is not supported by this host');
		}
		const project = this._projects.get(params.id);
		if (!project) {
			return { removed: false };
		}
		this._projects.delete(project.id);
		try {
			await this._persist();
		} catch (error) {
			this._projects.set(project.id, project);
			throw error;
		}
		this._clones.get(project.id)?.abort();
		this._publish();
		return { removed: true };
	}

	private async _clone(params: Record<string, unknown>, checkAuthorization?: () => void): Promise<unknown> {
		if (typeof params.url !== 'string' || !params.url || /[\0\r\n]/.test(params.url)
			|| (params.branch !== undefined && (typeof params.branch !== 'string' || !params.branch || /[\0\r\n]/.test(params.branch)))
			|| (params.depth !== undefined && (typeof params.depth !== 'number' || !Number.isInteger(params.depth) || params.depth < 0 || params.depth > 0xffffffff))
			|| (params.targetRoot !== undefined && (typeof params.targetRoot !== 'string' || !isAbsolute(params.targetRoot)))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid repository cloning parameters');
		}
		const url = this._cloneUrl(params.url);
		let segments: string[];
		if (url.protocol === 'file:') {
			const source = await realpath(URI.parse(url.toString()).fsPath);
			if (!await this._isGranted(source)) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Clone source is outside the host workspace grants');
			}
			segments = [basename(dirname(source)), basename(source).replace(/\.git$/, '')];
		} else {
			segments = url.pathname.replace(/\.git\/?$/, '').split('/').filter(Boolean);
		}
		if (segments.length !== 2 || segments.some(segment => !/^[\w.-]+$/.test(segment) || segment === '.' || segment === '..')) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Repository URL must identify an owner and repository');
		}
		const root = await realpath(typeof params.targetRoot === 'string' ? params.targetRoot : this._environment.userHome.fsPath);
		if (params.targetRoot !== undefined && !await this._isGranted(root)) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'targetRoot is outside the host workspace grants');
		}
		const parent = join(root, segments[0]);
		checkAuthorization?.();
		await mkdir(parent, { recursive: true });
		if (!extUriBiasedIgnorePathCase.isEqual(URI.file(await realpath(parent)), URI.file(parent))) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Clone destination must not traverse a symbolic link');
		}
		const path = join(parent, segments[1]);
		const id = this._id(path);
		const existing = this._projects.get(id);
		if (existing && existing.remoteUrl === url.toString() && existing.status !== 'failed') {
			return { project: existing };
		}
		try {
			checkAuthorization?.();
			await mkdir(path);
		} catch (error) {
			if (isRecord(error) && error.code === 'EEXIST') {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'Clone destination already exists');
			}
			throw error;
		}
		if (!extUriBiasedIgnorePathCase.isEqual(URI.file(await realpath(path)), URI.file(path)) || (await lstat(path)).isSymbolicLink()) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Clone destination must not traverse a symbolic link');
		}
		try {
			checkAuthorization?.();
		} catch (error) {
			await this._removeEmptyCloneDirectory(path);
			throw error;
		}
		const project: IMissionControlProject = {
			id, name: segments[1], path, origin: 'cloned', git: true, status: 'cloning', progress: 0, remoteUrl: url.toString(),
		};
		const controller = new AbortController();
		this._clones.set(id, controller);
		this._projects.set(id, project);
		this._publish();
		void this._driveClone(project, url, params, controller);
		return { project };
	}

	private async _driveClone(project: IMissionControlProject, url: URL, params: Record<string, unknown>, controller: AbortController): Promise<void> {
		try {
			const args = ['clone', '--progress'];
			if (typeof params.branch === 'string') {
				args.push('--branch', params.branch, '--single-branch');
			}
			if (typeof params.depth === 'number' && params.depth > 0) {
				args.push('--depth', String(params.depth));
			}
			args.push('--', url.toString(), project.path);
			const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
			const githubOrigin = new URL(this._endpoints.getEnterpriseUri() ?? 'https://github.com').origin;
			if (url.origin === githubOrigin) {
				const resource = this._endpoints.getRepoResource();
				const token = this._authentication.getAuthToken({ resource: resource.resource })
					?? this._authentication.getAuthToken({ resource: this._endpoints.getCopilotResource().resource });
				if (token) {
					env.VSCODE_MC_GIT_TOKEN = token;
					env.GIT_CONFIG_COUNT = '2';
					env.GIT_CONFIG_KEY_0 = `credential.${githubOrigin}.helper`;
					env.GIT_CONFIG_VALUE_0 = '';
					env.GIT_CONFIG_KEY_1 = `credential.${githubOrigin}.helper`;
					env.GIT_CONFIG_VALUE_1 = '!f() { test "$1" = get && printf "username=x-access-token\\npassword=%s\\n" "$VSCODE_MC_GIT_TOKEN"; }; f';
				}
			}
			await this._runGit(args, env, controller.signal, progress => {
				const current = this._projects.get(project.id);
				if (this._store.isDisposed || controller.signal.aborted || !current) {
					return;
				}
				this._projects.set(project.id, { ...current, progress: Math.max(current.progress ?? 0, Math.min(100, progress)) });
				void this._progress.trigger(async () => this._publish()).catch(error => {
					if (!controller.signal.aborted && !this._store.isDisposed) {
						this._log.error('[MissionControl] Clone progress publication failed', error);
					}
				});
			});
			if (controller.signal.aborted) {
				await this._removeEmptyCloneDirectory(project.path);
				return;
			}
			if (!params.branch && params.depth) {
				await this._runGit(['-C', project.path, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'], { ...process.env }, controller.signal, () => { });
			}
			await this._mutations.queue(async () => {
				if (controller.signal.aborted || !this._projects.has(project.id)) {
					return;
				}
				const path = await realpath(project.path);
				const ready = await this._entry(path, 'cloned');
				if (!extUriBiasedIgnorePathCase.isEqual(URI.file(path), URI.file(project.path)) || !ready.git) {
					throw new Error('Cloned repository is not at the reserved project directory');
				}
				this._projects.set(project.id, ready);
				await this._persist();
				this._publish();
			});
		} catch (error) {
			await this._removeEmptyCloneDirectory(project.path);
			if (controller.signal.aborted) {
				return;
			}
			this._log.error('[MissionControl] Repository cloning failed', error);
			await this._mutations.queue(async () => {
				if (controller.signal.aborted || !this._projects.has(project.id)) {
					return;
				}
				this._projects.set(project.id, { ...project, status: 'failed', progress: undefined, error: getErrorMessage(error) });
				this._publish();
			});
		} finally {
			if (this._clones.get(project.id) === controller) {
				this._clones.delete(project.id);
			}
		}
	}

	private async _removeEmptyCloneDirectory(path: string): Promise<void> {
		try {
			if (!extUriBiasedIgnorePathCase.isEqual(URI.file(await realpath(dirname(path))), URI.file(dirname(path))) || (await lstat(path)).isSymbolicLink()) {
				this._log.warn('[MissionControl] Clone cleanup refused a changed destination', path);
				return;
			}
			await rmdir(path);
		} catch (error) {
			if (isRecord(error) && error.code === 'ENOENT') {
				return;
			}
			this._log.warn('[MissionControl] Clone cleanup retained a nonempty or inaccessible directory', path, error);
		}
	}

	private _cloneUrl(value: string): URL {
		const scp = /^(?:git@)?(?<host>[\w.-]+):(?<path>[^/].*)$/.exec(value);
		let url: URL;
		try {
			url = new URL(scp?.groups ? `ssh://git@${scp.groups.host}/${scp.groups.path}` : value);
		} catch {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid repository URL');
		}
		if (!['https:', 'ssh:', 'file:'].includes(url.protocol) || url.password || url.search || url.hash
			|| (url.protocol === 'file:' && url.host)
			|| (url.username && (url.protocol !== 'ssh:' || url.username !== 'git'))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Repository URL must use HTTPS, SSH, or a local file URL without credentials, a query, or a fragment');
		}
		const github = new URL(this._endpoints.getEnterpriseUri() ?? 'https://github.com');
		if (url.hostname === github.hostname && url.protocol === 'ssh:') {
			return new URL(url.pathname, github);
		}
		return url;
	}

	private _sanitizeUrl(value: string): string | undefined {
		try {
			const url = new URL(value);
			url.username = '';
			url.password = '';
			url.search = '';
			url.hash = '';
			return url.toString();
		} catch {
			const scp = /^(?:[^@]+@)?(?<host>[\w.-]+):(?<path>[\w./-]+)$/.exec(value);
			if (scp?.groups) {
				return `git@${scp.groups.host}:${scp.groups.path}`;
			}
			this._log.warn('[MissionControl] Ignoring an invalid Git remote URL');
			return undefined;
		}
	}

	private _id(path: string): string {
		return `project-${createHash('sha256').update(extUriBiasedIgnorePathCase.getComparisonKey(URI.file(path))).digest('hex').slice(0, 16)}`;
	}

	private async _isGranted(path: string): Promise<boolean> {
		for (const root of [...this._options.getRoots(), ...this.roots]) {
			let canonical: string;
			try {
				canonical = await realpath(root);
			} catch (error) {
				if (!isRecord(error) || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
					throw error;
				}
				this._log.warn('[MissionControl] Ignoring a missing project grant', root);
				continue;
			}
			const suffix = relative(canonical, path);
			if (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`)) {
				return true;
			}
		}
		return false;
	}

	private async _persist(): Promise<void> {
		await mkdir(dirname(this._cataloguePath), { recursive: true });
		const temporary = `${this._cataloguePath}.${generateUuid()}.tmp`;
		try {
			await writeFile(temporary, JSON.stringify([...this._projects.values()].filter(project => project.status === 'ready' && !project.bootPinned)), { mode: 0o600 });
			await rename(temporary, this._cataloguePath);
		} finally {
			await unlink(temporary).catch(error => {
				if (!isRecord(error) || error.code !== 'ENOENT') {
					throw error;
				}
			});
		}
	}

	private _publish(): void {
		if (!this._store.isDisposed) {
			this._onDidChange.fire(this._state.createServerActionEnvelope(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged, config: this.config.values,
			}));
		}
	}
}
