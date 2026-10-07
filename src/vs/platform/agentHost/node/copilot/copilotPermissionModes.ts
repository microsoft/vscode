/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionMode, SessionEventPayload } from '@github/copilot-sdk';
import { localize } from '../../../../nls.js';
import { AutoApproveLevel, platformSessionSchema } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { SessionConfigSchema } from '../../common/state/protocol/commands.js';
import type { IAgentHostManagedSettingsPermissions } from '../../common/agentHostManagedSettings.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';

/** Host override provenance must survive independently of the runtime's effective-mode journal. */
export class CopilotGlobalPermissionOverride {
	private static readonly key = 'copilot.permissionModeBeforeGlobalOverride';
	private static readonly startupKey = 'copilot.permissionModeBeforeHostOverrides';
	private _mode: PermissionMode | undefined;

	constructor(private readonly database: Pick<ISessionDatabase, 'getMetadata' | 'setMetadata' | 'deleteMetadata'>) { }

	get mode(): PermissionMode | undefined { return this._mode; }

	async load(): Promise<void> {
		const saved = await this.database.getMetadata(CopilotGlobalPermissionOverride.key);
		this._mode = saved === undefined ? undefined : saved === 'assisted' || saved === 'allow-all' ? saved : 'manual';
	}

	async capture(mode: PermissionMode): Promise<void> {
		if (this._mode === undefined) {
			await this.database.setMetadata(CopilotGlobalPermissionOverride.key, mode);
			this._mode = mode;
		}
	}

	async initializeStartupMode(mode: PermissionMode, hasStartupProvenance = true): Promise<PermissionMode> {
		const saved = await this.database.getMetadata(CopilotGlobalPermissionOverride.startupKey);
		if (saved === undefined) {
			const startup = hasStartupProvenance ? mode : 'manual';
			await this.database.setMetadata(CopilotGlobalPermissionOverride.startupKey, startup);
			return startup;
		}
		return saved === 'assisted' || saved === 'allow-all' ? saved : 'manual';
	}

	async clear(): Promise<void> {
		if (this._mode !== undefined) {
			await this.database.deleteMetadata([CopilotGlobalPermissionOverride.key]);
			this._mode = undefined;
		}
	}
}

export function fromCopilotPermissionMode(mode: PermissionMode): AutoApproveLevel {
	return mode === 'allow-all' ? 'autoApprove' : mode === 'assisted' ? 'assisted' : 'default';
}

/** Presentation of the runtime's composed policy, not a second policy resolver. */
export function getCopilotAvailableApprovalModes(policy: SessionEventPayload<'session.managed_settings_resolved'>['data']): AutoApproveLevel[] {
	const permissions = getPermissions(policy);
	return [
		'default',
		...(!policy.failClosed && permissions?.disableAssistedPermissionsMode !== true ? ['assisted' as const] : []),
		...(!policy.failClosed && !policy.bypassPermissionsDisabled ? ['autoApprove' as const] : []),
	];
}

function getPermissions(policy: SessionEventPayload<'session.managed_settings_resolved'>['data']) {
	const settings = policy.settings;
	const permissions = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings.permissions : undefined;
	return permissions && typeof permissions === 'object' && !Array.isArray(permissions) ? permissions : undefined;
}

export function getCopilotApprovalPreview(config: Readonly<Record<string, unknown>>, policy: SessionEventPayload<'session.managed_settings_resolved'>['data'], clientPermissions?: IAgentHostManagedSettingsPermissions, isNewSession = true): Record<string, unknown> {
	const availableApprovalModes = getCopilotAvailableApprovalModes(policy).filter(mode =>
		(mode !== 'assisted' || clientPermissions?.disableAssistedPermissionsMode !== true)
		&& (mode !== 'autoApprove' || clientPermissions?.disableBypassPermissionsMode !== 'disable'));
	const managedDefault = getPermissions(policy)?.defaultMode;
	const selected = isNewSession
		? config[SessionConfigKey.AutoApprove] ?? (managedDefault === 'assisted' || managedDefault === 'allow-all' ? fromCopilotPermissionMode(managedDefault) : 'default')
		: config.effectiveApprovalMode ?? config[SessionConfigKey.AutoApprove] ?? 'default';
	return {
		availableApprovalModes,
		effectiveApprovalMode: availableApprovalModes.some(mode => mode === selected) ? selected : 'default',
	};
}

export function getCopilotSessionConfigSchema(): SessionConfigSchema {
	const schema = platformSessionSchema.toProtocol();
	return {
		...schema,
		properties: {
			...schema.properties,
			effectiveApprovalMode: { type: 'string', title: localize('effectiveApprovalMode', "Effective Permissions"), readOnly: true, enum: ['default', 'assisted', 'autoApprove'] },
			availableApprovalModes: { type: 'array', title: localize('availableApprovalModes', "Available Permissions"), readOnly: true, items: { type: 'string', title: localize('approvalMode', "Permissions") } },
		},
	};
}

/** A displayed Manual default is not an explicit host startup choice. */
export function resolveCopilotApprovalConfig(config: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
	const values: Record<string, unknown> = platformSessionSchema.validateOrDefault(config, { [SessionConfigKey.Mode]: 'interactive' });
	if (config?.[SessionConfigKey.AutoApprove] === undefined) {
		delete values[SessionConfigKey.AutoApprove];
	}
	return values;
}
