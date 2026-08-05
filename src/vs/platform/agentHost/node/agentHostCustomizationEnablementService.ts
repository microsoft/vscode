/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import type { IReadableSet } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { CustomizationType, type Customization, type CustomizationEnablement, type McpServerCustomization, type PluginCustomization } from '../common/state/protocol/channels-session/state.js';
import { ActionType } from '../common/state/sessionActions.js';
import type { URI as ProtocolURI } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { applyPersistedCustomizationEnablementPolicy, customizationEnablementEquals, customizationPolicyKey, getPrimaryWorkingDirectory, MCP_TOP_LEVEL_CUSTOMIZATION_ID_PREFIX, resolveEnablement as resolvePersistedEnablement, resolveRootConfigMcpServerEnablement, updateCustomizationEnablementPolicy, type CustomizationEnablementPolicy, type CustomizationEnablementTarget } from './shared/mcpServerEnablement.js';

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
	resolveEnablement(customization: CustomizationEnablementTarget, workingDirectory: string | undefined, source?: string): Pick<McpServerCustomization, 'enabled' | 'enablement'>;
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

	resolveEnablement(customization: CustomizationEnablementTarget, workingDirectory: string | undefined, source?: string): Pick<McpServerCustomization, 'enabled' | 'enablement'> {
		return resolvePersistedEnablement(customization, this._policy(), workingDirectory, source);
	}

	resolveRootMcpServerEnablement(name: string, workingDirectory: string | undefined): Pick<McpServerCustomization, 'enabled' | 'enablement'> {
		return resolveRootConfigMcpServerEnablement(name, this._policy(), workingDirectory);
	}

	applyEnablement(customizations: readonly Customization[], workingDirectory: string | undefined): readonly Customization[] {
		return applyPersistedCustomizationEnablementPolicy(customizations, this._policy(), workingDirectory);
	}

	handleToggle(session: string, id: string, enablement: readonly CustomizationEnablement[]): void {
		const found = findCustomization(this._stateManager.getSessionState(session)?.customizations, customization => customization.id === id);
		const policyKey = found
			? customizationPolicyKey(found.customization, found.source)
			: isContainerCustomizationId(id) ? id : undefined;
		if (!policyKey) {
			return;
		}
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
			const target = findCustomization(
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

/**
 * Whether `id` can be keyed as a container customization without having the
 * customization itself in hand.
 *
 * A plugin's policy key is simply its id, so a toggle for one can be persisted
 * even when it is not currently published -- which happens routinely, since a
 * locally-disabled plugin is never synced to the host. An MCP server's key is
 * derived from its name and contributing plugin, so it cannot be reconstructed
 * from an id alone and must not take this path.
 *
 * Recognised structurally, because {@link ActionType.SessionCustomizationToggled}
 * does not carry a type: `customizationId()` mints a bare URI with no fragment
 * for a whole resource, while MCP servers use an `#mcp=` fragment or the
 * `mcp-top-level:` prefix, and ranged children use `#range=`. Anything carrying
 * a fragment is therefore not a container id.
 */
function isContainerCustomizationId(id: string): boolean {
	if (id.startsWith(MCP_TOP_LEVEL_CUSTOMIZATION_ID_PREFIX)) {
		return false;
	}
	try {
		const uri = URI.parse(id);
		return uri.scheme.length > 0 && uri.fragment.length === 0;
	} catch {
		return false;
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

interface IFoundPluginCustomization {
	readonly customization: PluginCustomization;
	readonly source: undefined;
}

type IFoundCustomization = IFoundMcpServerCustomization | IFoundPluginCustomization;

function findCustomization(
	customizations: readonly Customization[] | undefined,
	matches: (customization: McpServerCustomization | PluginCustomization, source: string | undefined) => boolean,
): IFoundCustomization | undefined {
	for (const customization of customizations ?? []) {
		if (customization.type === CustomizationType.McpServer) {
			if (matches(customization, undefined)) { return { customization, source: undefined }; }
			continue;
		}
		if (customization.type === CustomizationType.Plugin && matches(customization, undefined)) {
			return { customization, source: undefined };
		}
		const source = customization.type === CustomizationType.Plugin ? customization.uri : undefined;
		for (const child of customization.children ?? []) {
			if (child.type === CustomizationType.McpServer && matches(child, source)) { return { customization: child, source }; }
		}
	}
	return undefined;
}
