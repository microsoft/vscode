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
	/** Overrides the host's default environment name when the client does not name this host. */
	readonly name?: string;
	/** Decorates a client's name for this host, for example with the application name. */
	readonly formatClientName?: (name: string) => string;
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
	/** The name the registration was configured with; the environment cannot change it while it is configured. */
	private _registrationName: string | undefined;
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

	register(accountId: string, credential: string, clientName?: string): Promise<IAgentHostGitHubEnvironmentRegistration> {
		return this._queue.queue(async () => {
			if (this._registration === undefined && this._environment.isEnabled) {
				throw new Error('This agent host is already registered as a GitHub environment by its host.');
			}
			if (this._registration !== undefined && this._registration.accountId !== accountId) {
				throw new Error('This agent host is already registered as a GitHub environment by another account.');
			}
			const home = this._options.homeDirectory;
			// Registering again refreshes the credential of the existing registration.
			const configuredName = this._registration !== undefined ? this._registrationName : this._getName(clientName);
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
					...(configuredName ? { name: configuredName } : {}),
				});
				const environmentId = this._environment.environmentId;
				if (!environmentId) {
					throw new Error('GitHub environment registration did not return an environment ID.');
				}
				const name = this._environment.environmentName;
				this._registrationName = configuredName;
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

	private _getName(clientName: string | undefined): string | undefined {
		const name = clientName?.trim();
		return name ? this._options.formatClientName?.(name) ?? name : this._options.name;
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
