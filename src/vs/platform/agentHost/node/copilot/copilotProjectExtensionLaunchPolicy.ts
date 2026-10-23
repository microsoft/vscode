/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { structuralEquals } from '../../../../base/common/equals.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { basename, dirname, extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentHostWorkspaceTrustConfigKey, IAgentHostWorkspaceTrust, platformRootSchema } from '../../common/agentHostSchema.js';
import { getWorktreesRoot, isWorktreeUnderRepository } from '../../common/worktreePaths.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';

/** How the effective workspace trust changed: it may now allow launches it refused, refuse launches it allowed, or both. */
export interface ICopilotProjectExtensionTrustChange {
	readonly expanded: boolean;
	readonly contracted: boolean;
}

/** What a trust change means for running sessions' project extensions. */
export interface ICopilotProjectExtensionTrustReconciliation {
	/** Trust may now allow launches it refused. */
	readonly expanded: boolean;
	/** Directory names of project extensions launched under trust that no longer covers them. */
	readonly revokedExtensionNames: ReadonlySet<string>;
}

/** Counts of trust expansions and contractions, compared to find what changed since a session last reconciled. */
export interface ICopilotProjectExtensionTrustState {
	readonly expansions: number;
	readonly contractions: number;
}

/** The worktree the host created as a session's working directory, and the repository whose trust it inherits. */
export interface ICopilotCreatedWorktree {
	readonly worktree: URI;
	readonly repository: URI;
}

export interface ICopilotProjectExtensionLaunchAdmission extends IDisposable {
	readonly trustState: ICopilotProjectExtensionTrustState;
}

type CopilotExtensionSource = 'project' | 'user' | 'plugin' | 'session';

/**
 * Decides which project extensions (`.github/extensions/<name>/extension.mjs`) the Copilot runtime may launch. The SDK's
 * launch request names no session, so the decision is host-wide: an extension launches only from a folder that a live
 * session admits and that VS Code workspace trust, mirrored into the root configuration, covers, both compared by
 * canonical path. Without trust information every launch is refused; with workspace trust disabled, all are allowed.
 * A worktree the host created for a session inherits its repository's trust, as the runtime's own trust grant does.
 */
export class CopilotProjectExtensionLaunchPolicy {
	private readonly _admittedRoots = new ResourceMap<number>();
	private readonly _workspacelessRoots = new ResourceMap<number>();
	/** Admitted worktrees the host created as a session's working directory, with the repository whose trust they inherit. */
	private readonly _inheritingWorktrees = new Map<string, { readonly worktree: URI; readonly repository: URI; count: number }>();
	private _trust = this._readTrust();
	private _trustGeneration = 0;
	private _trustState: ICopilotProjectExtensionTrustState = { expansions: 0, contractions: 0 };
	/** Canonical trusted roots of the current trust, by trusted URI. Only resolved roots are kept, so a missing one is retried. */
	private readonly _canonicalTrustedRoots = new Map<string, Promise<URI | undefined>>();
	/** Project extensions whose latest launch was allowed, by requested entrypoint path. */
	private readonly _allowedLaunches = new Map<string, { readonly module: URI; readonly extensionName: string }>();

	constructor(
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _logService: ILogService,
		private readonly _realpath: (path: string) => Promise<string> = fs.realpath,
	) { }

	get trustState(): ICopilotProjectExtensionTrustState {
		return this._trustState;
	}

	/** Re-reads workspace trust; returns how it changed, or `undefined` when no launch decision can change. */
	updateTrust(): ICopilotProjectExtensionTrustChange | undefined {
		const trust = this._readTrust();
		if (structuralEquals(this._trust, trust)) {
			return undefined;
		}
		const change: ICopilotProjectExtensionTrustChange = {
			expanded: this._expandsTrust(this._trust, trust),
			contracted: this._contractsTrust(this._trust, trust),
		};
		this._trust = trust;
		if (!change.expanded && !change.contracted) {
			// The same roots in another order: every launch decision, and every resolved root, still holds.
			return undefined;
		}
		this._trustGeneration++;
		this._canonicalTrustedRoots.clear();
		this._trustState = {
			expansions: this._trustState.expansions + (change.expanded ? 1 : 0),
			contractions: this._trustState.contractions + (change.contracted ? 1 : 0),
		};
		return change;
	}

	/** How trust changed since `state` was observed, or `undefined` when it did not. */
	trustChangeSince(state: ICopilotProjectExtensionTrustState): ICopilotProjectExtensionTrustChange | undefined {
		const expanded = state.expansions !== this._trustState.expansions;
		const contracted = state.contractions !== this._trustState.contractions;
		return expanded || contracted ? { expanded, contracted } : undefined;
	}

	/** Resolves `change` into the project extensions it affects: a contraction revokes the allowed launches trust no longer covers. */
	async reconciliationFor(change: ICopilotProjectExtensionTrustChange): Promise<ICopilotProjectExtensionTrustReconciliation> {
		const revokedExtensionNames = new Set<string>();
		if (change.contracted) {
			for (const [modulePath, launch] of [...this._allowedLaunches]) {
				if (!this._isAdmitted(launch.module)) {
					// No live session admits it, so no session runs it.
					if (this._allowedLaunches.get(modulePath) === launch) {
						this._allowedLaunches.delete(modulePath);
					}
					continue;
				}
				if (!await this._isLaunchTrusted(launch.module)) {
					revokedExtensionNames.add(launch.extensionName);
				}
			}
		}
		return { expanded: change.expanded, revokedExtensionNames };
	}

	/**
	 * Admits project extensions under `directories` while the returned admission lives. `workspacelessRoot`, when it is
	 * one of `directories`, is the host-allocated scratch folder of a workspace-less chat: its extensions launch without
	 * workspace trust, as the agent itself created them. `createdWorktree`, when its worktree is one of `directories`, is
	 * the worktree the host created as the session's working directory: it inherits its repository's trust while it stays
	 * a worktree of that repository by canonical path. Any other directory needs workspace trust of its own.
	 */
	async acquireAdmission(directories: readonly URI[], workspacelessRoot: URI | undefined, createdWorktree?: ICopilotCreatedWorktree): Promise<ICopilotProjectExtensionLaunchAdmission> {
		const roots: URI[] = [];
		for (const directory of directories) {
			const root = await this._canonicalFileUri(directory, `extension launch root '${directory.fsPath}'`);
			if (root) {
				roots.push(root);
				this._admittedRoots.set(root, (this._admittedRoots.get(root) ?? 0) + 1);
			}
		}

		const canonicalWorkspacelessRoot = workspacelessRoot
			? await this._canonicalFileUri(workspacelessRoot, `workspace-less extension root '${workspacelessRoot.fsPath}'`)
			: undefined;
		const admittedWorkspacelessRoot = canonicalWorkspacelessRoot && roots.some(root => isEqual(root, canonicalWorkspacelessRoot))
			? canonicalWorkspacelessRoot
			: undefined;
		if (admittedWorkspacelessRoot) {
			this._workspacelessRoots.set(admittedWorkspacelessRoot, (this._workspacelessRoots.get(admittedWorkspacelessRoot) ?? 0) + 1);
		}

		const inheritance = createdWorktree ? await this._canonicalInheritance(createdWorktree, roots) : undefined;
		const inheritingKey = inheritance ? `${inheritance.worktree.toString()}\n${inheritance.repository.toString()}` : undefined;
		if (inheritance && inheritingKey) {
			const existing = this._inheritingWorktrees.get(inheritingKey);
			if (existing) {
				existing.count++;
			} else {
				this._inheritingWorktrees.set(inheritingKey, { ...inheritance, count: 1 });
			}
		}

		const trustState = this._trustState;
		const lifetime = toDisposable(() => {
			for (const root of roots) {
				this._releaseReference(this._admittedRoots, root);
			}
			if (admittedWorkspacelessRoot) {
				this._releaseReference(this._workspacelessRoots, admittedWorkspacelessRoot);
			}
			const entry = inheritingKey ? this._inheritingWorktrees.get(inheritingKey) : undefined;
			if (inheritingKey && entry && --entry.count <= 0) {
				this._inheritingWorktrees.delete(inheritingKey);
			}
		});
		return {
			trustState,
			dispose: () => lifetime.dispose(),
		};
	}

	/**
	 * The canonical worktree and repository of `createdWorktree`, when its worktree is one of the admitted `roots` and,
	 * both as given and by canonical path, a worktree under its repository's `<repo>.worktrees` folder.
	 */
	private async _canonicalInheritance({ worktree, repository }: ICopilotCreatedWorktree, roots: readonly URI[]): Promise<ICopilotCreatedWorktree | undefined> {
		if (!isWorktreeUnderRepository(worktree, repository)) {
			return undefined;
		}
		const [canonicalWorktree, canonicalRepository, canonicalWorktreesRoot] = await Promise.all([
			this._canonicalFileUri(worktree, `created worktree '${worktree.fsPath}'`),
			this._canonicalFileUri(repository, `worktree repository '${repository.fsPath}'`),
			this._canonicalFileUri(getWorktreesRoot(repository), `worktrees folder of '${repository.fsPath}'`),
		]);
		if (!canonicalWorktree || !canonicalRepository || !canonicalWorktreesRoot || !roots.some(root => isEqual(root, canonicalWorktree))
			|| !extUriBiasedIgnorePathCase.isEqualOrParent(canonicalWorktree, canonicalWorktreesRoot) || extUriBiasedIgnorePathCase.isEqual(canonicalWorktree, canonicalWorktreesRoot)) {
			return undefined;
		}
		return { worktree: canonicalWorktree, repository: canonicalRepository };
	}

	async resolveLaunch(modulePath: string, source: CopilotExtensionSource, extensionBootstrapPath: string) {
		if (!isAbsolute(modulePath) || basename(URI.file(modulePath)) !== 'extension.mjs' || source === 'session') {
			return {};
		}

		let launchModulePath = modulePath;
		if (source === 'project') {
			// Until this decision allows it again, the extension is not running under trust that might be revoked.
			this._allowedLaunches.delete(modulePath);
			const module = await this._canonicalFileUri(URI.file(modulePath));
			if (!module || basename(module) !== 'extension.mjs') {
				this._logService.trace(`[Copilot] Project extension launch denied because its entrypoint could not be resolved: ${modulePath}`);
				return {};
			}
			if (!this._isAdmitted(module)) {
				this._logService.trace(`[Copilot] Project extension launch denied because its entrypoint is not admitted: ${module.fsPath}`);
				return {};
			}
			if (!await this._isLaunchTrusted(module) || !this._isAdmitted(module)) {
				this._logService.trace(`[Copilot] Project extension launch denied because its workspace is not trusted: ${module.fsPath}`);
				return {};
			}
			// The runtime names a project extension after the folder it discovered, which a symlink may resolve elsewhere.
			this._allowedLaunches.set(modulePath, { module, extensionName: basename(dirname(URI.file(modulePath))) });
			launchModulePath = module.fsPath;
		}

		return {
			launch: {
				executable: process.execPath,
				args: [extensionBootstrapPath],
				env: {
					EXTENSION_PATH: launchModulePath,
					...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
				},
			},
		};
	}

	/** Decides against the trust current when the decision completes: a change while resolving roots re-evaluates it. */
	private async _isLaunchTrusted(resource: URI): Promise<boolean> {
		while (true) {
			if ([...this._workspacelessRoots.keys()].some(root => extUriBiasedIgnorePathCase.isEqualOrParent(resource, root))) {
				return true;
			}
			const trust = this._trust;
			if (!trust) {
				return false;
			}
			if (!trust.enabled) {
				return true;
			}
			const generation = this._trustGeneration;
			const roots = await this._trustedRoots(trust);
			if (generation === this._trustGeneration) {
				const isTrusted = (candidate: URI) => roots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(candidate, root));
				return isTrusted(resource) || [...this._inheritingWorktrees.values()].some(({ worktree, repository }) => extUriBiasedIgnorePathCase.isEqualOrParent(resource, worktree) && isTrusted(repository));
			}
		}
	}

	private async _trustedRoots(trust: IAgentHostWorkspaceTrust): Promise<readonly URI[]> {
		const roots = await Promise.all(trust.trustedUris.map(value => this._canonicalTrustedRoot(value)));
		return roots.filter(root => root !== undefined);
	}

	private _canonicalTrustedRoot(value: string): Promise<URI | undefined> {
		const cached = this._canonicalTrustedRoots.get(value);
		if (cached) {
			return cached;
		}
		const root = (async () => {
			try {
				return await this._canonicalFileUri(URI.parse(value));
			} catch {
				return undefined;
			}
		})();
		this._canonicalTrustedRoots.set(value, root);
		// A trusted root that is missing now may be created later without any change of trust, so only resolved roots are kept.
		void root.then(resolved => {
			if (!resolved && this._canonicalTrustedRoots.get(value) === root) {
				this._canonicalTrustedRoots.delete(value);
			}
		});
		return root;
	}

	private _isAdmitted(resource: URI): boolean {
		return [...this._admittedRoots.keys()].some(root => extUriBiasedIgnorePathCase.isEqualOrParent(resource, root));
	}

	private _readTrust(): IAgentHostWorkspaceTrust | undefined {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostWorkspaceTrustConfigKey);
	}

	private _expandsTrust(previous: IAgentHostWorkspaceTrust | undefined, current: IAgentHostWorkspaceTrust | undefined): boolean {
		if (!current) {
			return false;
		}
		if (!current.enabled) {
			return previous?.enabled !== false;
		}
		if (!previous) {
			return current.trustedUris.length > 0;
		}
		if (!previous.enabled) {
			return false;
		}
		const previousUris = new Set(previous.trustedUris);
		return current.trustedUris.some(uri => !previousUris.has(uri));
	}

	private _contractsTrust(previous: IAgentHostWorkspaceTrust | undefined, current: IAgentHostWorkspaceTrust | undefined): boolean {
		if (!previous) {
			return false;
		}
		if (!current) {
			return !previous.enabled || previous.trustedUris.length > 0;
		}
		if (!previous.enabled) {
			return current.enabled;
		}
		if (!current.enabled) {
			return false;
		}
		const currentUris = new Set(current.trustedUris);
		return previous.trustedUris.some(uri => !currentUris.has(uri));
	}

	private async _canonicalFileUri(resource: URI, label?: string): Promise<URI | undefined> {
		if (resource.scheme !== Schemas.file) {
			return undefined;
		}
		try {
			return URI.file(await this._realpath(resource.fsPath));
		} catch (error) {
			if (label) {
				this._logService.warn(`[Copilot] Failed to canonicalize ${label}: ${getErrorMessage(error)}`);
			}
			return undefined;
		}
	}

	private _releaseReference(references: ResourceMap<number>, resource: URI): void {
		const count = references.get(resource);
		if (count === undefined || count <= 1) {
			references.delete(resource);
		} else {
			references.set(resource, count - 1);
		}
	}
}
