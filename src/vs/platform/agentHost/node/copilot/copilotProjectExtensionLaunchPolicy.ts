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
import { basename, extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentHostWorkspaceTrustConfigKey, IAgentHostWorkspaceTrust, platformRootSchema } from '../../common/agentHostSchema.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';

type CopilotExtensionSource = 'project' | 'user' | 'plugin' | 'session';

/**
 * Decides which project extensions (`.github/extensions/<name>/extension.mjs`) the Copilot runtime may launch. The SDK's
 * launch request names no session, so the decision is host-wide: an extension launches only from a folder that a live
 * session admits and that VS Code workspace trust, mirrored into the root configuration, covers, both compared by
 * canonical path. Without trust information every launch is refused; with workspace trust disabled, all are allowed.
 */
export class CopilotProjectExtensionLaunchPolicy {
	private readonly _admittedRoots = new ResourceMap<number>();
	private readonly _workspacelessRoots = new ResourceMap<number>();
	private _trust = this._readTrust();
	private _trustGeneration = 0;
	/** Canonical trusted roots of the current trust, by trusted URI. Only resolved roots are kept, so a missing one is retried. */
	private readonly _canonicalTrustedRoots = new Map<string, Promise<URI | undefined>>();

	constructor(
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _logService: ILogService,
		private readonly _realpath: (path: string) => Promise<string> = fs.realpath,
	) { }

	/** Re-reads workspace trust, so later launch decisions use the current trust. */
	updateTrust(): void {
		const trust = this._readTrust();
		if (structuralEquals(this._trust, trust)) {
			return;
		}
		this._trust = trust;
		this._trustGeneration++;
		this._canonicalTrustedRoots.clear();
	}

	/**
	 * Admits project extensions under `directories` while the returned admission lives. `workspacelessRoot`, when it is
	 * one of `directories`, is the host-allocated scratch folder of a workspace-less chat: its extensions launch without
	 * workspace trust, as the agent itself created them.
	 */
	async acquireAdmission(directories: readonly URI[], workspacelessRoot: URI | undefined): Promise<IDisposable> {
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

		return toDisposable(() => {
			for (const root of roots) {
				this._releaseReference(this._admittedRoots, root);
			}
			if (admittedWorkspacelessRoot) {
				this._releaseReference(this._workspacelessRoots, admittedWorkspacelessRoot);
			}
		});
	}

	async resolveLaunch(modulePath: string, source: CopilotExtensionSource, extensionBootstrapPath: string) {
		if (!isAbsolute(modulePath) || basename(URI.file(modulePath)) !== 'extension.mjs' || source === 'session') {
			return {};
		}

		let launchModulePath = modulePath;
		if (source === 'project') {
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
				return roots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(resource, root));
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
