/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdtemp, rename, rm, symlink } from 'fs/promises';
import { Sequencer } from '../../base/common/async.js';
import { CancellationError, getErrorCode } from '../../base/common/errors.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { isAbsolute, join } from '../../base/common/path.js';
import { isWindows } from '../../base/common/platform.js';
import type { IAgentHostIpcConnectionOptions } from '../../platform/agentHost/common/agentService.js';
import { ILogService } from '../../platform/log/common/log.js';
import type { RemoteAgentConnectionContext } from '../../platform/remote/common/remoteAgentEnvironment.js';

const socketVariables = ['REMOTE_CONTAINERS_IPC', 'SSH_AUTH_SOCK'] as const;
type Environment = Readonly<Record<string, string | null>>;

/** Tracks resolver overrides for crash restarts and keeps inherited socket paths usable by already-running descendants. */
export class ServerAgentHostEnvironment extends Disposable {
	private readonly _windows = new Map<RemoteAgentConnectionContext, IAgentHostIpcConnectionOptions>();
	private readonly _updates = new Sequencer();
	private _directory: string | undefined;
	private readonly _targets = new Map<string, string | undefined>();

	constructor(
		private readonly _setLaunchEnvironment: (env: Environment, debugEnv?: Environment) => void,
		private readonly _logService: ILogService,
	) {
		super();
	}

	update(ctx: RemoteAgentConnectionContext, options: IAgentHostIpcConnectionOptions | undefined): Promise<void> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		this._windows.delete(ctx);
		if (options?.env || options?.debugEnv) {
			this._windows.set(ctx, options);
		}
		return this._updates.queue(() => this._refresh());
	}

	remove(ctx: RemoteAgentConnectionContext): Promise<void> {
		return this._windows.delete(ctx) ? this._updates.queue(() => this._refresh()) : Promise.resolve();
	}

	private async _refresh(): Promise<void> {
		const windows = [...this._windows.values()].reverse();
		const latest = windows[0];
		const env = { ...latest?.env };
		if (!isWindows) {
			for (const key of socketVariables) {
				const owner = windows.find(options => options.env?.[key] !== undefined || options.debugEnv?.[key] !== undefined);
				const value = owner?.env?.[key] !== undefined ? owner.env[key] : owner?.debugEnv?.[key];
				const socket = await this._updateSocket(key, value);
				if (socket !== undefined) {
					env[key] = socket;
				}
			}
		}
		this._setLaunchEnvironment(env, latest?.debugEnv);
	}

	private async _updateSocket(key: string, value: string | null | undefined): Promise<string | null | undefined> {
		const target = value && isAbsolute(value) ? value : undefined;
		if (target !== this._targets.get(key)) {
			try {
				// A long $TMPDIR can exceed sockaddr_un.sun_path even if the original socket fits.
				this._directory ??= await mkdtemp('/tmp/vscode-ah-');
				const link = join(this._directory, key);
				if (target) {
					await symlink(target, `${link}.new`);
					try {
						await rename(`${link}.new`, link);
					} catch (error) {
						await rm(`${link}.new`, { force: true });
						throw error;
					}
				} else {
					await rm(link, { force: true });
				}
				this._targets.set(key, target);
			} catch (error) {
				// Filesystem errors can contain the resolver-provided environment value.
				throw new Error(`Could not update the ${key} forwarding socket (${getErrorCode(error)})`);
			}
		}
		// Keep the address across crash restarts, even between a disconnect and the next window.
		if (this._directory && this._targets.has(key) && (target || value === undefined)) {
			return join(this._directory, key);
		}
		return value;
	}

	override dispose(): void {
		super.dispose();
		this._windows.clear();
		void this._updates.queue(async () => {
			if (this._directory) {
				await rm(this._directory, { recursive: true, force: true });
			}
		}).catch(() => this._logService.warn('[AgentHostChannel] Failed to remove forwarding socket links'));
	}
}
