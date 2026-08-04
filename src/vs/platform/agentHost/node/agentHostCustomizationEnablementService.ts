/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { IReadableSet } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { CustomizationType, type ChildCustomization, type Customization, type CustomizationEnablement, type McpServerCustomization } from '../common/state/protocol/channels-session/state.js';
import { ActionType } from '../common/state/sessionActions.js';
import type { URI as ProtocolURI } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { applyPersistedCustomizationEnablementPolicy, customizationEnablementEquals, customizationPolicyKey, getPrimaryWorkingDirectory, resolveEnablement as resolvePersistedEnablement, resolveRootConfigMcpServerEnablement, updateCustomizationEnablementPolicy, type CustomizationEnablementPolicy } from './shared/mcpServerEnablement.js';

export const IAgentHostCustomizationEnablementService = createDecorator<IAgentHostCustomizationEnablementService>('agentHostCustomizationEnablementService');
export const CustomizationEnablementStorageKey = 'customizationEnablement';

export interface ICustomizationEnablementChangeEvent {
	/** Whether the effective enablement of anything in `session` may have changed. */
	affectsSession(session: ProtocolURI): boolean;
	/** Whether any of the given host-internal customization policy keys changed. */
	affectsSome(policyKeys: IReadableSet<string>): boolean;
}

/** Resolves, persists, and propagates host-owned customization enablement policy. */
export interface IAgentHostCustomizationEnablementService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeEnablement: Event<ICustomizationEnablementChangeEvent>;
	resolveEnablement(customization: Customization | ChildCustomization, workingDirectory: string | undefined, source?: string): Pick<McpServerCustomization, 'enabled' | 'enablement'>;
	applyEnablement(customizations: readonly Customization[], workingDirectory: string | undefined): readonly Customization[];
	resolveRootMcpServerEnablement(name: string, workingDirectory: string | undefined): Pick<McpServerCustomization, 'enabled' | 'enablement'>;
	handleToggle(session: string, id: string, enablement: readonly CustomizationEnablement[]): void;
}

export class AgentHostCustomizationEnablementService extends Disposable implements IAgentHostCustomizationEnablementService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeEnablement = this._register(new Emitter<ICustomizationEnablementChangeEvent>());
	readonly onDidChangeEnablement = this._onDidChangeEnablement.event;

	constructor(
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	resolveEnablement(customization: Customization | ChildCustomization, workingDirectory: string | undefined, source?: string): Pick<McpServerCustomization, 'enabled' | 'enablement'> {
		return resolvePersistedEnablement(customization, this._policy(), workingDirectory, source);
	}

	resolveRootMcpServerEnablement(name: string, workingDirectory: string | undefined): Pick<McpServerCustomization, 'enabled' | 'enablement'> {
		return resolveRootConfigMcpServerEnablement(name, this._policy(), workingDirectory);
	}

	applyEnablement(customizations: readonly Customization[], workingDirectory: string | undefined): readonly Customization[] {
		return applyPersistedCustomizationEnablementPolicy(customizations, this._policy(), workingDirectory);
	}

	handleToggle(session: string, id: string, enablement: readonly CustomizationEnablement[]): void {
		const found = findMcpServerCustomization(this._stateManager.getSessionState(session)?.customizations, customization => customization.id === id);
		if (!found) {
			return;
		}
		const policyKey = customizationPolicyKey(found.customization, found.source);
		const policy = updateCustomizationEnablementPolicy(this._policy(), policyKey, enablement, getPrimaryWorkingDirectory(this._configurationService.getEffectiveWorkingDirectories(session)));
		if (policy) {
			this._storageService.set(CustomizationEnablementStorageKey, policy);
		} else {
			this._storageService.delete(CustomizationEnablementStorageKey);
		}
		const affectedSessions = new Set<ProtocolURI>([session]);
		for (const targetSession of this._stateManager.getSessionUris()) {
			if (targetSession === session) {
				continue;
			}
			const target = findMcpServerCustomization(
				this._stateManager.getSessionState(targetSession)?.customizations,
				(customization, source) => customizationPolicyKey(customization, source) === policyKey,
			);
			if (!target) {
				continue;
			}
			const targetEnablement = resolvePersistedEnablement(target.customization, policy, getPrimaryWorkingDirectory(this._configurationService.getEffectiveWorkingDirectories(targetSession)), target.source);
			if (target.customization.enabled === targetEnablement.enabled
				&& customizationEnablementEquals(target.customization.enablement, targetEnablement.enablement)) {
				continue;
			}
			this._stateManager.dispatchServerAction(targetSession, { type: ActionType.SessionCustomizationToggled, id: target.customization.id, enablement: targetEnablement.enablement ?? [] });
			affectedSessions.add(targetSession);
		}
		this._onDidChangeEnablement.fire(new CustomizationEnablementChangeEvent(affectedSessions, new Set([policyKey])));
	}

	private _policy(): CustomizationEnablementPolicy | undefined {
		return this._storageService.get<CustomizationEnablementPolicy>(CustomizationEnablementStorageKey);
	}

}

class CustomizationEnablementChangeEvent implements ICustomizationEnablementChangeEvent {

	constructor(
		private readonly _sessions: ReadonlySet<ProtocolURI>,
		private readonly _policyKeys: ReadonlySet<string>,
	) { }

	affectsSession(session: ProtocolURI): boolean {
		return this._sessions.has(session);
	}

	affectsSome(policyKeys: IReadableSet<string>): boolean {
		for (const policyKey of this._policyKeys) {
			if (policyKeys.has(policyKey)) {
				return true;
			}
		}
		return false;
	}
}

/**
 * An MCP customization paired with the stable source identity of the plugin
 * that contributed it, which its policy key is derived from.
 */
interface IFoundMcpServerCustomization {
	readonly customization: McpServerCustomization;
	readonly source: string | undefined;
}

function findMcpServerCustomization(
	customizations: readonly Customization[] | undefined,
	matches: (customization: McpServerCustomization, source: string | undefined) => boolean,
): IFoundMcpServerCustomization | undefined {
	for (const customization of customizations ?? []) {
		if (customization.type === CustomizationType.McpServer) {
			if (matches(customization, undefined)) { return { customization, source: undefined }; }
			continue;
		}
		const source = customization.type === CustomizationType.Plugin ? customization.uri : undefined;
		for (const child of customization.children ?? []) {
			if (child.type === CustomizationType.McpServer && matches(child, source)) { return { customization: child, source }; }
		}
	}
	return undefined;
}
