/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../base/common/async.js';
import { OperatingSystem } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IAgentHostSessionStateStore, SessionStateMirrorFlush } from '../common/agentHostSessionStateStore.js';
import { applySessionSandboxPathGrant, ISandboxPathGrant, ISessionSandboxPaths, parseSessionSandboxPaths, removeSandboxReadonlyPaths, SESSION_SANDBOX_PATHS_KEY } from '../common/sandboxPathGrant.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';

export const ISessionSandboxPathService = createDecorator<ISessionSandboxPathService>('sessionSandboxPathService');

export interface ISessionSandboxPathService {
	readonly _serviceBrand: undefined;
	load(session: URI): Promise<void>;
	/** Publishes a runtime-approved grant immediately; the returned promise tracks its persistence. */
	grant(session: URI, grant: ISandboxPathGrant): Promise<void>;
	/** Removes only the session read-only entries superseded by a runtime-approved User grant. */
	removeReadonlyPaths(session: URI, paths: readonly string[], os: OperatingSystem): Promise<void>;
}

/** Serializes durable filesystem preference changes across all chats of an owning session. */
export class SessionSandboxPathService implements ISessionSandboxPathService {
	declare readonly _serviceBrand: undefined;
	private readonly _sequencer = new SequencerByKey<string>();

	constructor(
		@IAgentHostSessionStateStore private readonly _stateStore: IAgentHostSessionStateStore,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) { }

	load(session: URI): Promise<void> {
		if (this._configurationService.getSessionSandboxPaths(session.toString())) {
			return Promise.resolve();
		}
		return this._sequencer.queue(session.toString(), async () => {
			const values = await this._stateStore.readWithoutImport(session, [SESSION_SANDBOX_PATHS_KEY]);
			// A live grant can arrive while the database read is pending.
			if (!this._configurationService.getSessionSandboxPaths(session.toString())) {
				this._configurationService.setSessionSandboxPaths(session.toString(), parseSessionSandboxPaths(values.get(SESSION_SANDBOX_PATHS_KEY)));
			}
		});
	}

	async grant(session: URI, grant: ISandboxPathGrant): Promise<void> {
		const paths = applySessionSandboxPathGrant(this._configurationService.getSessionSandboxPaths(session.toString()) ?? parseSessionSandboxPaths(undefined), grant);
		return this._save(session, paths);
	}

	async removeReadonlyPaths(session: URI, paths: readonly string[], os: OperatingSystem): Promise<void> {
		const current = this._configurationService.getSessionSandboxPaths(session.toString());
		if (!current || !paths.length) {
			return;
		}
		const updated = removeSandboxReadonlyPaths(current, paths, os);
		if (updated === current) {
			return;
		}
		return this._save(session, updated);
	}

	private _save(session: URI, paths: ISessionSandboxPaths): Promise<void> {
		this._configurationService.setSessionSandboxPaths(session.toString(), paths);
		return this._sequencer.queue(session.toString(), async () => {
			await this._stateStore.update(session, SESSION_SANDBOX_PATHS_KEY, previous => {
				// Do not overwrite corrupt metadata; save the full live delta so a later grant can recover an earlier failed save.
				parseSessionSandboxPaths(previous);
				return JSON.stringify(paths);
			}, SessionStateMirrorFlush.Immediate);
		});
	}
}
