/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { AICustomizationManagementSection, type IStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { type IHarnessDescriptor, type IExternalCustomizationItem, type IExternalCustomizationItemProvider } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { SessionClientState } from '../../../../platform/agentHost/common/state/sessionClientState.js';
import { type IAgentInfo, type ICustomizationRef, type ISessionCustomization, CustomizationStatus } from '../../../../platform/agentHost/common/state/sessionState.js';
import { BUILTIN_STORAGE } from '../../chat/common/builtinPromptsStorage.js';
import { AgentCustomizationSyncProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';

export { AgentCustomizationSyncProvider as RemoteAgentSyncProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';

/**
 * Maps a {@link CustomizationStatus} enum value to the string literal
 * expected by {@link IExternalCustomizationItem.status}.
 */
function toStatusString(status: CustomizationStatus | undefined): 'loading' | 'loaded' | 'degraded' | 'error' | undefined {
	switch (status) {
		case CustomizationStatus.Loading: return 'loading';
		case CustomizationStatus.Loaded: return 'loaded';
		case CustomizationStatus.Degraded: return 'degraded';
		case CustomizationStatus.Error: return 'error';
		default: return undefined;
	}
}

/**
 * Provider that exposes a remote agent's customizations as
 * {@link IExternalCustomizationItem} entries for the list widget.
 *
 * Baseline items come from {@link IAgentInfo.customizations} (available
 * without an active session). When a session is active, the provider
 * overlays {@link ISessionCustomization} data, which includes loading
 * status and enabled state.
 */
export class RemoteAgentCustomizationItemProvider extends Disposable implements IExternalCustomizationItemProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _agentCustomizations: readonly ICustomizationRef[];
	private _sessionCustomizations: readonly ISessionCustomization[] | undefined;

	constructor(
		agentInfo: IAgentInfo,
		private readonly _clientState: SessionClientState,
	) {
		super();
		this._agentCustomizations = agentInfo.customizations ?? [];

		// Listen for session state changes that include customization updates
		this._register(this._clientState.onDidChangeSessionState(({ state }) => {
			if (state.customizations !== this._sessionCustomizations) {
				this._sessionCustomizations = state.customizations;
				this._onDidChange.fire();
			}
		}));
	}

	/**
	 * Updates the baseline agent customizations (e.g. when root state
	 * changes and agent info is refreshed).
	 */
	updateAgentCustomizations(customizations: readonly ICustomizationRef[]): void {
		this._agentCustomizations = customizations;
		this._onDidChange.fire();
	}

	async provideChatSessionCustomizations(_token: CancellationToken): Promise<IExternalCustomizationItem[]> {
		// When a session is active, prefer session-level data (includes status)
		if (this._sessionCustomizations) {
			return this._sessionCustomizations.map(sc => ({
				uri: URI.isUri(sc.customization.uri) ? sc.customization.uri : URI.parse(sc.customization.uri),
				type: 'plugin',
				name: sc.customization.displayName,
				description: sc.customization.description,
				status: toStatusString(sc.status),
				statusMessage: sc.statusMessage,
				enabled: sc.enabled,
			}));
		}

		// Baseline: agent-level customizations (no status info)
		return this._agentCustomizations.map(ref => ({
			uri: URI.isUri(ref.uri) ? ref.uri : URI.parse(ref.uri as unknown as string),
			type: 'plugin',
			name: ref.displayName,
			description: ref.description,
		}));
	}
}

/**
 * Creates a {@link IHarnessDescriptor} for a remote agent discovered via
 * the agent host protocol.
 *
 * The descriptor exposes the agent's server-provided customizations through
 * an {@link IExternalCustomizationItemProvider} and allows the user to
 * select local customizations for syncing via an {@link ICustomizationSyncProvider}.
 */
export function createRemoteAgentHarnessDescriptor(
	harnessId: string,
	displayName: string,
	itemProvider: RemoteAgentCustomizationItemProvider,
	syncProvider: AgentCustomizationSyncProvider,
): IHarnessDescriptor {
	const allSources = [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, BUILTIN_STORAGE];
	const filter: IStorageSourceFilter = { sources: allSources };

	return {
		id: harnessId,
		label: displayName,
		icon: ThemeIcon.fromId(Codicon.remote.id),
		hiddenSections: [
			AICustomizationManagementSection.Models,
			AICustomizationManagementSection.McpServers,
		],
		hideGenerateButton: true,
		getStorageSourceFilter(_type: PromptsType): IStorageSourceFilter {
			return filter;
		},
		itemProvider,
		syncProvider,
	};
}
