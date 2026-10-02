/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentHostManagedSettingsPermissions } from '../common/agentHostManagedSettings.js';

export const IAgentHostManagedSettingsService = createDecorator<IAgentHostManagedSettingsService>('agentHostManagedSettingsService');

export interface IAgentHostManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly permissions: IAgentHostManagedSettingsPermissions;
	readonly sandboxRequired: boolean;
	readonly onDidChangeSandboxRequired: Event<void>;
	setClientPermissions(clientId: string, permissions: IAgentHostManagedSettingsPermissions): void;
	setClientSandboxRequired(clientId: string, required: boolean): void;
	removeClient(clientId: string): void;
}

export class AgentHostManagedSettingsService extends Disposable implements IAgentHostManagedSettingsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _permissionsByClient = new Map<string, IAgentHostManagedSettingsPermissions>();
	private _permissions: IAgentHostManagedSettingsPermissions = {};
	private readonly _sandboxRequiredByClient = new Set<string>();
	private readonly _onDidChangeSandboxRequired = this._register(new Emitter<void>());
	readonly onDidChangeSandboxRequired = this._onDidChangeSandboxRequired.event;

	get permissions(): IAgentHostManagedSettingsPermissions {
		return this._permissions;
	}

	get sandboxRequired(): boolean {
		return this._sandboxRequiredByClient.size > 0;
	}

	setClientSandboxRequired(clientId: string, required: boolean): void {
		const previous = this.sandboxRequired;
		if (required) {
			this._sandboxRequiredByClient.add(clientId);
		} else {
			this._sandboxRequiredByClient.delete(clientId);
		}
		if (this.sandboxRequired !== previous) {
			this._onDidChangeSandboxRequired.fire();
		}
	}

	setClientPermissions(clientId: string, permissions: IAgentHostManagedSettingsPermissions): void {
		if (Object.keys(permissions).length === 0) {
			this._permissionsByClient.delete(clientId);
		} else {
			this._permissionsByClient.set(clientId, permissions);
		}
		this._updatePermissions();
	}

	removeClient(clientId: string): void {
		this.setClientSandboxRequired(clientId, false);
		if (this._permissionsByClient.delete(clientId)) {
			this._updatePermissions();
		}
	}

	private _updatePermissions(): void {
		const permissions: IAgentHostManagedSettingsPermissions = {};
		const deny = new Set<string>();
		const ask = new Set<string>();
		for (const contribution of this._permissionsByClient.values()) {
			if (contribution.disableBypassPermissionsMode === 'disable') {
				permissions.disableBypassPermissionsMode = 'disable';
			}
			if (contribution.deny) {
				contribution.deny.forEach(rule => deny.add(rule));
			}
			if (contribution.ask) {
				contribution.ask.forEach(rule => ask.add(rule));
			}
		}
		if (deny.size > 0) {
			permissions.deny = [...deny];
		}
		if (ask.size > 0) {
			permissions.ask = [...ask];
		}
		if (!equals(this._permissions, permissions)) {
			this._permissions = permissions;
			this._onDidChange.fire();
		}
	}
}
