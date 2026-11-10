/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { realpath, stat } from 'fs/promises';
import { Sequencer } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { isDefined } from '../../../../base/common/types.js';
import type { IAgentHostGitHubEnvironmentRegistration } from '../../common/agentHostExtensionProtocol.js';
import type { IProtocolServerGitHubEnvironment } from '../protocolServerHandler.js';
import type { MissionControlEnvironment } from './missionControlEnvironment.js';

export interface IMissionControlClientRegistrationOptions {
	readonly homeDirectory: string;
	/** Overrides the host's default environment name. */
	readonly name?: string;
	readonly getFileSystemRoots?: () => Promise<readonly string[]>;
}

/**
 * Registers this host as a live GitHub environment on behalf of a directly
 * connected client that supplies its own GitHub credential. The client keeps
 * the registration current by registering again with refreshed credentials
 * and after the host restarts.
 */
export class MissionControlClientRegistration extends Disposable implements IProtocolServerGitHubEnvironment {
	private readonly _onDidChangeRegistered = this._register(new Emitter<boolean>());
	readonly onDidChangeRegistered = this._onDidChangeRegistered.event;
	private readonly _queue = new Sequencer();
	private _accountId: string | undefined;

	constructor(
		private readonly _environment: Pick<MissionControlEnvironment, 'configure' | 'environmentId' | 'environmentName' | 'isEnabled'>,
		private readonly _options: IMissionControlClientRegistrationOptions,
	) {
		super();
	}

	get isRegistered(): boolean {
		return this._accountId !== undefined;
	}

	register(accountId: string, credential: string): Promise<IAgentHostGitHubEnvironmentRegistration> {
		return this._queue.queue(async () => {
			if (this._accountId === undefined && this._environment.isEnabled) {
				throw new Error('This agent host is already registered as a GitHub environment by its host.');
			}
			if (this._accountId !== undefined && this._accountId !== accountId) {
				throw new Error('This agent host is already registered as a GitHub environment by another account.');
			}
			const home = this._options.homeDirectory;
			try {
				const fileSystemRoots = await (this._options.getFileSystemRoots ?? getFileSystemRoots)();
				await this._environment.configure({
					baseUrl: 'https://api.github.com',
					accountId,
					credential,
					roots: [...new Set([...fileSystemRoots, home])],
					projects: [],
					defaultDirectory: home,
					live: true,
					...(this._options.name ? { name: this._options.name } : {}),
				});
				const environmentId = this._environment.environmentId;
				if (!environmentId) {
					throw new Error('GitHub environment registration did not return an environment ID.');
				}
				this._setAccount(accountId);
				return { environmentId, name: this._environment.environmentName };
			} catch (error) {
				this._setAccount(undefined);
				await this._environment.configure(undefined, accountId).catch(() => undefined);
				throw error;
			}
		});
	}

	unregister(accountId: string): Promise<void> {
		return this._queue.queue(async () => {
			if (this._accountId === undefined) {
				return;
			}
			if (this._accountId !== accountId) {
				throw new Error('Only the account that registered this GitHub environment can unregister it.');
			}
			this._setAccount(undefined);
			await this._environment.configure(undefined, accountId);
		});
	}

	private _setAccount(accountId: string | undefined): void {
		const wasRegistered = this.isRegistered;
		this._accountId = accountId;
		if (wasRegistered !== this.isRegistered) {
			this._onDidChangeRegistered.fire(this.isRegistered);
		}
	}
}

/** Local filesystem roots, excluding network-backed Windows drives. */
async function getFileSystemRoots(): Promise<readonly string[]> {
	if (!isWindows) {
		return ['/'];
	}
	const drives = await Promise.all(Array.from({ length: 26 }, async (_, index) => {
		const drive = `${String.fromCharCode(65 + index)}:\\`;
		try {
			if (!(await stat(drive)).isDirectory() || (await realpath(drive)).startsWith('\\\\')) {
				return undefined;
			}
			return drive;
		} catch {
			return undefined;
		}
	}));
	return drives.filter(isDefined);
}
