/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { raceTimeout, SequencerByKey } from '../../../../base/common/async.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import type { IAgentSandboxCertificateStatus } from '../../common/meta/agentSandboxCertificate.js';

type SandboxCertificateRpc = CopilotClient['rpc']['sandbox']['proxyCa'];
type SandboxCertificateConfig = NonNullable<Parameters<SandboxCertificateRpc['getStatus']>[0]['sandboxConfig']>;

interface IRuntimeCertificateChecks {
	readonly scopeId: string;
	readonly configurations: Map<string, Promise<IAgentSandboxCertificateStatus>>;
	installationSupport?: Promise<boolean>;
}

/** Shares in-flight and completed checks across chats without starting or retaining an SDK client. */
export class CopilotSandboxCertificate {
	private readonly _runtimes = new WeakMap<SandboxCertificateRpc, IRuntimeCertificateChecks>();
	private readonly _operations = new SequencerByKey<SandboxCertificateRpc>();

	constructor(
		@ILogService private readonly _logService: ILogService,
	) { }

	/** Skips disabled sandboxing; otherwise starts or reuses a cached check for this runtime and credential configuration. */
	getStatus(rpc: SandboxCertificateRpc, config: SandboxCertificateConfig): Promise<IAgentSandboxCertificateStatus | undefined> {
		if (!config.enabled) {
			return Promise.resolve(undefined);
		}
		return this._getStatusAfterOperations(rpc, config);
	}

	/** Explicitly creates the persistent CA without trusting it; the caller must obtain user consent first. */
	create(rpc: SandboxCertificateRpc, config: SandboxCertificateConfig): ReturnType<SandboxCertificateRpc['create']> {
		return this._mutate(rpc, () => config, 'create', config => rpc.create({ sandboxConfig: config }));
	}

	/** Explicitly trusts an already-created CA, potentially prompting for OS authorization; never creates or rotates it. */
	trust(rpc: SandboxCertificateRpc, config: SandboxCertificateConfig): ReturnType<SandboxCertificateRpc['trust']> {
		return this._mutate(rpc, () => config, 'trust', async config => {
			const status = await rpc.trust({ sandboxConfig: config });
			if (status.state === 'error') {
				this._logService.warn('[Copilot] Sandbox certificate trust failed', status.detail);
			}

			return status;
		});
	}

	/** Rechecks the consented runtime, replacing an incompatible CA when needed before establishing OS trust. */
	install(rpc: SandboxCertificateRpc, getConfig: () => SandboxCertificateConfig, scopeId: string): Promise<void> {
		return this._mutate(rpc, getConfig, 'install', async config => {
			const runtime = this._requireRuntime(rpc, scopeId);
			const status = await this._check(rpc, config, runtime);
			if (status.state === 'installed' && !status.requiresRotation) {
				return;
			}
			if ((status.state !== 'notInstalled' && status.state !== 'installed') || !status.canInstall) {
				throw new Error(status.detail ?? localize('copilot.sandboxCertificate.installUnavailable', "The sandbox certificate cannot be installed for this configuration."));
			}
			if (status.requiresRotation) {
				const rotated = await rpc.rotate({ sandboxConfig: config });
				if (rotated.detail !== undefined || (rotated.state !== 'installed' && (rotated.state !== 'notInstalled' || !rotated.canInstall))) {
					throw new Error(rotated.detail ?? localize('copilot.sandboxCertificate.replaceFailed', "The agent host could not replace the sandbox certificate."));
				}
				if (rotated.state === 'installed') {
					return;
				}
			} else {
				await rpc.create({ sandboxConfig: config });
			}
			const result = await rpc.trust({ sandboxConfig: config });
			if (result.state !== 'installed' || result.detail !== undefined) {
				throw new Error(result.detail ?? localize('copilot.sandboxCertificate.trustUnconfirmed', "The agent host did not confirm that the sandbox certificate is trusted."));
			}
		});
	}

	/** Explicitly replaces the persistent CA and establishes OS trust. */
	rotate(rpc: SandboxCertificateRpc, getConfig: () => SandboxCertificateConfig, scopeId: string): Promise<void> {
		return this._mutate(rpc, getConfig, 'rotate', async config => {
			const runtime = this._requireRuntime(rpc, scopeId);
			const status = await this._check(rpc, config, runtime);
			if ((status.state !== 'notInstalled' && status.state !== 'installed') || !status.canInstall) {
				throw new Error(status.detail ?? localize('copilot.sandboxCertificate.rotateUnavailable', "The sandbox certificate cannot be rotated for this configuration."));
			}
			const rotated = await rpc.rotate({ sandboxConfig: config });
			if (rotated.detail !== undefined || (rotated.state !== 'installed' && (rotated.state !== 'notInstalled' || !rotated.canInstall))) {
				throw new Error(rotated.detail ?? localize('copilot.sandboxCertificate.rotateFailed', "The agent host could not rotate the sandbox certificate."));
			}
			if (rotated.state === 'installed') {
				return;
			}
			const result = await rpc.trust({ sandboxConfig: config });
			if (result.state !== 'installed' || result.detail !== undefined) {
				throw new Error(result.detail ?? localize('copilot.sandboxCertificate.trustUnconfirmed', "The agent host did not confirm that the sandbox certificate is trusted."));
			}
		});
	}

	/** Removes OS trust without deleting the stored CA; serialized with installation and followed by cache invalidation. */
	remove(rpc: SandboxCertificateRpc, scopeId: string, validate: () => void): ReturnType<SandboxCertificateRpc['remove']> {
		return this._mutate(rpc, () => { validate(); return undefined; }, 'remove', async () => {
			this._requireRuntime(rpc, scopeId);
			const status = await rpc.remove();
			if (status.state !== 'notInstalled') {
				throw new Error(status.detail ?? localize('copilot.sandboxCertificate.removeUnconfirmed', "The agent host did not confirm that the sandbox certificate was removed from OS trust."));
			}
			return status;
		});
	}

	private _requireRuntime(rpc: SandboxCertificateRpc, scopeId: string): IRuntimeCertificateChecks {
		const runtime = this._runtimes.get(rpc);
		if (!runtime || runtime.scopeId !== scopeId) {
			throw new Error(localize('copilot.sandboxCertificate.changed', "The sandbox runtime changed. Review the certificate target and try again."));
		}
		return runtime;
	}

	/** Defers background reads until pending certificate mutations settle, including failed operations. */
	private _getStatusAfterOperations(rpc: SandboxCertificateRpc, config: SandboxCertificateConfig): Promise<IAgentSandboxCertificateStatus> {
		return this._operations.peek(rpc)
			? this._operations.queue(rpc, () => this._getStatus(rpc, config))
			: this._getStatus(rpc, config);
	}

	/** Caches a read while redirecting observations invalidated by a mutation to a fresh check. */
	private _getStatus(rpc: SandboxCertificateRpc, config: SandboxCertificateConfig): Promise<IAgentSandboxCertificateStatus> {
		let runtime = this._runtimes.get(rpc);
		if (!runtime) {
			runtime = { scopeId: generateUuid(), configurations: new Map() };
			this._runtimes.set(rpc, runtime);
		}

		// Filesystem roots differ between chats but cannot change credential-proxy CA coverage.
		const key = JSON.stringify([config.auth?.git, config.auth?.gh, config.credentials]);
		let pending = runtime.configurations.get(key);
		if (!pending) {
			const cache = runtime.configurations;
			pending = this._check(rpc, config, runtime).then(status =>
				cache.get(key) === pending ? status : this._getStatusAfterOperations(rpc, config));
			runtime.configurations.set(key, pending);
		}
		return pending;
	}

	/** Runs the live preflight once after dequeueing; invalidates cached checks even after a partial failure. */
	private _mutate<T, C extends SandboxCertificateConfig | undefined>(rpc: SandboxCertificateRpc, preflight: () => C, operation: 'create' | 'trust' | 'install' | 'rotate' | 'remove', mutate: (config: C) => Promise<T>): Promise<T> {
		return this._operations.queue(rpc, async () => {
			try {
				const config = preflight();
				if (config && !config.enabled) {
					throw new Error(localize('copilot.sandboxCertificate.disabled', "Sandboxing must be enabled to set up the sandbox certificate."));
				}
				this._invalidateStatus(rpc);
				// OS authorization may outlive a read timeout; never release the queue while a mutation is still running.
				return await mutate(config);
			} catch (error) {
				this._logService.warn(`[Copilot] Failed to ${operation} sandbox certificate`, error);
				throw error;
			} finally {
				this._invalidateStatus(rpc);
			}
		});
	}

	/** Retains the runtime scope while dropping status and installation-support observations. */
	private _invalidateStatus(rpc: SandboxCertificateRpc): void {
		const runtime = this._runtimes.get(rpc);
		if (runtime) {
			runtime.configurations.clear();
			runtime.installationSupport = undefined;
		}
	}

	/** Queries SDK relevance, installation support, and certificate status, converting failures into logged error results. */
	private async _check(rpc: SandboxCertificateRpc, config: SandboxCertificateConfig, runtime: IRuntimeCertificateChecks): Promise<IAgentSandboxCertificateStatus> {
		try {
			const relevant = await this._query(() => rpc.checkRelevance({ sandboxConfig: config }));
			if (!relevant) {
				return { scopeId: runtime.scopeId, state: 'notRequired', canInstall: false, requiresRotation: false };
			}
			runtime.installationSupport ??= this._query(() => rpc.checkInstallationSupport());
			const canOfferInstallation = await runtime.installationSupport;
			const status = await this._query(() => rpc.getStatus({ sandboxConfig: config }));
			if (status.state === 'error') {
				this._logService.warn('[Copilot] Sandbox certificate status unavailable', status.detail);
			}
			return {
				scopeId: runtime.scopeId,
				state: status.state,
				canInstall: canOfferInstallation && status.canInstall,
				requiresRotation: (status.state === 'installed' || status.state === 'notInstalled') && status.detail !== undefined,
				...(status.detail !== undefined ? { detail: status.detail } : {}),
			};
		} catch (error) {
			this._logService.warn('[Copilot] Failed to check sandbox certificate status', error);
			// Cache failures too: opening chats or sending turns must not create an RPC retry loop.
			return { scopeId: runtime.scopeId, state: 'error', canInstall: false, requiresRotation: false, detail: getErrorMessage(error) };
		}
	}

	/** Bounds one SDK read to five seconds, propagating failures or throwing on timeout without cancelling the underlying RPC. */
	private async _query<T>(query: () => Promise<T>): Promise<T> {
		const result = await raceTimeout(query(), 5_000);
		if (result === undefined) {
			throw new Error(localize('copilot.sandboxCertificate.timeout', "Checking the sandbox certificate timed out."));
		}
		return result;
	}
}
