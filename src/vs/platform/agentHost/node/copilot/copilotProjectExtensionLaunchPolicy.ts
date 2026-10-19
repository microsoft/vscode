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
import { basename, extUriBiasedIgnorePathCase, isEqual, isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentHostWorkspaceTrustConfigKey, areAllAgentHostWorkspaceResourcesTrusted, platformRootSchema } from '../../common/agentHostSchema.js';
import { getRepositoryRootFromWorktree, isWorktreeUnderRepository } from '../../common/worktreePaths.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';

export interface ICopilotProjectExtensionTrustGrant {
	readonly worktreeDirectory: URI;
	readonly repositoryRoot: URI;
}

export type CopilotProjectExtensionTrustProvenance =
	| { readonly kind: 'knownRepository'; readonly repositoryRoot: URI }
	| { readonly kind: 'hostCreatedWorktree'; readonly repositoryRoot?: URI };

type CopilotExtensionSource = 'project' | 'user' | 'plugin' | 'session';

export function serializeCopilotProjectExtensionTrustGrant(grant: ICopilotProjectExtensionTrustGrant | undefined): string {
	return grant ? JSON.stringify({
		worktreeDirectory: grant.worktreeDirectory.toString(),
		repositoryRoot: grant.repositoryRoot.toString(),
	}) : '';
}

export function parseCopilotProjectExtensionTrustGrant(value: string | undefined): ICopilotProjectExtensionTrustGrant | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(value) as { worktreeDirectory?: unknown; repositoryRoot?: unknown };
		return typeof parsed.worktreeDirectory === 'string' && typeof parsed.repositoryRoot === 'string'
			? { worktreeDirectory: URI.parse(parsed.worktreeDirectory), repositoryRoot: URI.parse(parsed.repositoryRoot) }
			: undefined;
	} catch {
		return undefined;
	}
}

export class CopilotProjectExtensionLaunchPolicy {
	private readonly _admittedRoots = new ResourceMap<number>();
	private readonly _inheritedTrustByWorktree = new ResourceMap<ResourceMap<number>>();

	constructor(
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _logService: ILogService,
		private readonly _realpath: (path: string) => Promise<string> = fs.realpath,
	) { }

	async acquireAdmission(directories: readonly URI[], trustGrant: ICopilotProjectExtensionTrustGrant | undefined): Promise<IDisposable> {
		const roots: URI[] = [];
		for (const directory of directories) {
			const canonical = await this._canonicalFileUri(directory, `extension launch root '${directory.fsPath}'`);
			if (canonical) {
				roots.push(canonical);
				this._admittedRoots.set(canonical, (this._admittedRoots.get(canonical) ?? 0) + 1);
			}
		}

		let acquiredGrant: ICopilotProjectExtensionTrustGrant | undefined;
		if (trustGrant) {
			const worktreeDirectory = await this._canonicalFileUri(trustGrant.worktreeDirectory, 'inherited extension trust worktree');
			const repositoryRoot = await this._canonicalFileUri(trustGrant.repositoryRoot, 'inherited extension trust repository');
			if (worktreeDirectory && repositoryRoot
				&& isEqual(worktreeDirectory, trustGrant.worktreeDirectory)
				&& isEqual(repositoryRoot, trustGrant.repositoryRoot)
				&& roots.some(root => isEqual(root, worktreeDirectory))
				&& isWorktreeUnderRepository(worktreeDirectory, repositoryRoot)) {
				acquiredGrant = { worktreeDirectory, repositoryRoot };
				const repositories = this._inheritedTrustByWorktree.get(worktreeDirectory) ?? new ResourceMap<number>();
				repositories.set(repositoryRoot, (repositories.get(repositoryRoot) ?? 0) + 1);
				this._inheritedTrustByWorktree.set(worktreeDirectory, repositories);
			}
		}

		return toDisposable(() => {
			for (const root of roots) {
				this._releaseReference(this._admittedRoots, root);
			}
			if (acquiredGrant) {
				const repositories = this._inheritedTrustByWorktree.get(acquiredGrant.worktreeDirectory);
				if (repositories) {
					this._releaseReference(repositories, acquiredGrant.repositoryRoot);
					if (repositories.size === 0) {
						this._inheritedTrustByWorktree.delete(acquiredGrant.worktreeDirectory);
					}
				}
			}
		});
	}

	async resolveLaunch(modulePath: string, source: CopilotExtensionSource, extensionBootstrapPath: string) {
		if (!isAbsolute(modulePath) || basename(URI.file(modulePath)) !== 'extension.mjs' || source === 'session') {
			return {};
		}

		let launchModulePath = modulePath;
		if (source === 'project') {
			const canonicalModule = await this._canonicalFileUri(URI.file(modulePath));
			if (!canonicalModule || basename(canonicalModule) !== 'extension.mjs' || !this._isAdmitted(canonicalModule)) {
				return {};
			}
			const trusted = await this._isLaunchTrusted(canonicalModule);
			// Trust resolution awaits filesystem/configuration state, so admission must still be live afterward.
			if (!trusted || !this._isAdmitted(canonicalModule)) {
				return {};
			}
			launchModulePath = canonicalModule.fsPath;
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

	async resolveTrustGrant(workingDirectory: URI | undefined, provenance: CopilotProjectExtensionTrustProvenance): Promise<ICopilotProjectExtensionTrustGrant | undefined> {
		if (!workingDirectory) {
			return undefined;
		}
		const worktreeDirectory = await this._canonicalFileUri(workingDirectory);
		if (!worktreeDirectory) {
			return undefined;
		}

		let repositoryRoot: URI | undefined;
		const repository = provenance.repositoryRoot;
		if (repository) {
			const candidate = await this._canonicalFileUri(repository);
			if (candidate && isWorktreeUnderRepository(worktreeDirectory, candidate)) {
				repositoryRoot = candidate;
			}
		}
		if (!repositoryRoot && provenance.kind === 'hostCreatedWorktree') {
			const derived = getRepositoryRootFromWorktree(worktreeDirectory);
			repositoryRoot = derived ? await this._canonicalFileUri(derived) : undefined;
		}
		if (!repositoryRoot || !isWorktreeUnderRepository(worktreeDirectory, repositoryRoot)) {
			return undefined;
		}
		return await this._isConfiguredFileTrusted(repositoryRoot)
			? { worktreeDirectory, repositoryRoot }
			: undefined;
	}

	async resolvePersistedTrustGrant(workingDirectory: URI, persisted: ICopilotProjectExtensionTrustGrant | undefined): Promise<ICopilotProjectExtensionTrustGrant | undefined> {
		if (!persisted) {
			return undefined;
		}
		const resolved = await this.resolveTrustGrant(workingDirectory, {
			kind: 'knownRepository',
			repositoryRoot: persisted.repositoryRoot,
		});
		return resolved && isEqual(resolved.worktreeDirectory, persisted.worktreeDirectory) ? resolved : undefined;
	}

	private async _isLaunchTrusted(resource: URI): Promise<boolean> {
		if (await this._isConfiguredFileTrusted(resource)) {
			return true;
		}
		for (const [worktreeDirectory, repositories] of this._inheritedTrustByWorktree) {
			if (!isEqualOrParent(resource, worktreeDirectory)) {
				continue;
			}
			for (const repositoryRoot of repositories.keys()) {
				if (await this._isConfiguredFileTrusted(repositoryRoot) && repositories.has(repositoryRoot)) {
					return true;
				}
			}
		}
		return false;
	}

	private async _isConfiguredFileTrusted(resource: URI): Promise<boolean> {
		const trust = this._configurationService.getRootValue(platformRootSchema, AgentHostWorkspaceTrustConfigKey);
		if (!trust) {
			return false;
		}
		if (areAllAgentHostWorkspaceResourcesTrusted(trust)) {
			return true;
		}
		const trustedRoots = await Promise.all(trust.trustedUris.map(async uri => {
			try {
				return await this._canonicalFileUri(URI.parse(uri));
			} catch {
				return undefined;
			}
		}));
		const currentTrust = this._configurationService.getRootValue(platformRootSchema, AgentHostWorkspaceTrustConfigKey);
		if (!currentTrust) {
			return false;
		}
		if (areAllAgentHostWorkspaceResourcesTrusted(currentTrust)) {
			return true;
		}
		if (!structuralEquals(trust, currentTrust)) {
			return false;
		}
		return trustedRoots.some(root => root && extUriBiasedIgnorePathCase.isEqualOrParent(resource, root));
	}

	private _isAdmitted(resource: URI): boolean {
		for (const root of this._admittedRoots.keys()) {
			if (isEqualOrParent(resource, root)) {
				return true;
			}
		}
		return false;
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
