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
import { generateUuid } from '../../../../base/common/uuid.js';
import type { IAgentHostGitHubEnvironmentRegistration } from '../../common/agentHostExtensionProtocol.js';
import type { IAgentHostGitHubEnvironmentStatus } from '../../common/meta/agentHostGitHubEnvironmentMeta.js';
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
	private readonly _onDidChangeStatus = this._register(new Emitter<IAgentHostGitHubEnvironmentStatus>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;
	/** A registration does not survive the host process, so clients compare this to detect a restart. */
	private readonly _instanceId = generateUuid();
	private readonly _queue = new Sequencer();
	private _registration: IAgentHostGitHubEnvironmentStatus['registration'];
	/** The environment reports itself enabled while a client registration is still being configured. */
	private _registering = false;

	constructor(
		private readonly _environment: Pick<MissionControlEnvironment, 'configure' | 'environmentId' | 'environmentName' | 'isEnabled'>,
		private readonly _options: IMissionControlClientRegistrationOptions,
	) {
		super();
	}

	get isRegistered(): boolean {
		return this._registration !== undefined;
	}

	get status(): IAgentHostGitHubEnvironmentStatus {
		return {
			instanceId: this._instanceId,
			...(this._registration ? { registration: this._registration } : this._environment.isEnabled && !this._registering ? { registeredByHost: true } : {}),
		};
	}

	register(accountId: string, credential: string): Promise<IAgentHostGitHubEnvironmentRegistration> {
		return this._queue.queue(async () => {
			if (this._registration === undefined && this._environment.isEnabled) {
				throw new Error('This agent host is already registered as a GitHub environment by its host.');
			}
			if (this._registration !== undefined && this._registration.accountId !== accountId) {
				throw new Error('This agent host is already registered as a GitHub environment by another account.');
			}
			const home = this._options.homeDirectory;
			this._registering = true;
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
				const name = this._environment.environmentName;
				this._setRegistration({ accountId, environmentId, name });
				return { environmentId, name };
			} catch (error) {
				// Withdraw before reporting, so the status does not mistake the leftover registration for the host's own.
				await this._environment.configure(undefined, accountId).catch(() => undefined);
				this._setRegistration(undefined);
				throw error;
			} finally {
				this._registering = false;
			}
		});
	}

	unregister(accountId: string): Promise<void> {
		return this._queue.queue(async () => {
			if (this._registration === undefined) {
				return;
			}
			if (this._registration.accountId !== accountId) {
				throw new Error('Only the account that registered this GitHub environment can unregister it.');
			}
			try {
				await this._environment.configure(undefined, accountId);
			} finally {
				this._setRegistration(undefined);
			}
		});
	}

	private _setRegistration(registration: IAgentHostGitHubEnvironmentStatus['registration']): void {
		const previous = this._registration;
		if (previous?.accountId === registration?.accountId && previous?.environmentId === registration?.environmentId && previous?.name === registration?.name) {
			return;
		}
		this._registration = registration;
		if (!previous !== !registration) {
			this._onDidChangeRegistered.fire(this.isRegistered);
		}
		this._onDidChangeStatus.fire(this.status);
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
