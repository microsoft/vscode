/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentSession, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { fromAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { agentHostAgentPickerStorageKey } from '../../../../../../platform/agentHost/common/customAgents.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import type { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { ChatMode, IChatMode, IChatModes } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

const AGENT_HOST_SESSION_SCHEME_PREFIX = 'agent-host-';

class AgentHostModeSynchronizer extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostModeSynchronizer';

	private readonly _widgetListeners = this._register(new DisposableMap<IChatWidget>());
	private readonly _updatingWidgets = new Set<IChatWidget>();

	constructor(
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalSessionService: IAgentHostUntitledProvisionalSessionService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			return;
		}

		for (const widget of this._chatWidgetService.getAllWidgets()) {
			this._attachWidget(widget);
		}
		this._register(this._chatWidgetService.onDidAddWidget(widget => this._attachWidget(widget)));
		this._register(this._chatWidgetService.onDidChangeFocusedSession(() => {
			const widget = this._chatWidgetService.lastFocusedWidget;
			if (widget) {
				this._syncWidgetFromBackend(widget);
			}
		}));
		this._register(this._provisionalSessionService.onDidChange(sessionResource => {
			const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
			if (widget) {
				this._syncWidgetFromBackend(widget);
			}
		}));
		this._register(this._agentHostService.onDidAction(envelope => {
			if (envelope.action.type === ActionType.SessionAgentChanged) {
				this._syncWidgetsFromBackend();
			}
		}));
	}

	private _attachWidget(widget: IChatWidget): void {
		if (this._widgetListeners.has(widget)) {
			return;
		}

		const store = new DisposableStore();
		store.add(widget.input.onDidChangeCurrentChatMode(() => this._onWidgetModeChanged(widget)));
		store.add(widget.onDidChangeViewModel(() => this._syncWidgetFromBackend(widget)));
		this._widgetListeners.set(widget, store);
		this._syncWidgetFromBackend(widget);
	}

	private _syncWidgetsFromBackend(): void {
		for (const widget of this._chatWidgetService.getAllWidgets()) {
			this._syncWidgetFromBackend(widget);
		}
	}

	private _onWidgetModeChanged(widget: IChatWidget): void {
		if (this._updatingWidgets.has(widget)) {
			return;
		}

		const sessionResource = widget.viewModel?.sessionResource;
		const backendSession = sessionResource ? this._resolveBackendSession(sessionResource) : undefined;
		if (!sessionResource || !backendSession) {
			return;
		}

		const mode = widget.input.currentModeObs.get();
		const agentUri = this._agentUriFromMode(mode);
		this._storeSelectedAgent(sessionResource, agentUri);

		const currentAgentUri = this._readSessionState(backendSession)?.summary.agent?.uri;
		if (currentAgentUri === agentUri) {
			return;
		}

		this._agentHostService.dispatch(backendSession.toString(), {
			type: ActionType.SessionAgentChanged,
			...(agentUri ? { agent: { uri: agentUri } } : {}),
		});
	}

	private _syncWidgetFromBackend(widget: IChatWidget): void {
		const sessionResource = widget.viewModel?.sessionResource;
		const backendSession = sessionResource ? this._resolveBackendSession(sessionResource) : undefined;
		if (!sessionResource || !backendSession) {
			return;
		}

		const agentUri = this._readSessionState(backendSession)?.summary.agent?.uri;
		void this._applyMode(widget, sessionResource, agentUri);
	}

	private async _applyMode(widget: IChatWidget, sessionResource: URI, agentUri: string | undefined): Promise<void> {
		const modes = widget.input.currentChatModesObs.get();
		await modes.waitForPendingUpdates();

		if (widget.viewModel?.sessionResource.toString() !== sessionResource.toString()) {
			return;
		}

		const modeId = agentUri ?? ChatMode.Agent.id;
		const mode = this._findMode(modes, modeId);
		if (!mode || widget.input.currentModeObs.get().id === mode.id) {
			return;
		}

		this._updatingWidgets.add(widget);
		try {
			widget.input.setChatMode(mode.id, false);
		} finally {
			this._updatingWidgets.delete(widget);
		}
	}

	private _findMode(modes: IChatModes, modeId: string): IChatMode | undefined {
		return modes.findModeById(modeId) ?? modes.custom.find(mode => {
			const uri = mode.uri?.get();
			return uri && fromAgentHostUri(uri).toString() === modeId;
		});
	}

	private _agentUriFromMode(mode: IChatMode): string | undefined {
		if (mode.kind !== ChatModeKind.Agent || mode.id === ChatMode.Agent.id || mode.isBuiltin) {
			return undefined;
		}

		const uri = mode.uri?.get();
		return uri ? fromAgentHostUri(uri).toString() : URI.parse(mode.id).toString();
	}

	private _storeSelectedAgent(sessionResource: URI, agentUri: string | undefined): void {
		const key = agentHostAgentPickerStorageKey(sessionResource.scheme);
		if (agentUri) {
			this._storageService.store(key, agentUri, StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(key, StorageScope.PROFILE);
		}
	}

	private _readSessionState(backendSession: URI): SessionState | undefined {
		const value = this._agentHostService.getSubscriptionUnmanaged(StateComponents.Session, backendSession)?.value;
		return value && !(value instanceof Error) ? value : undefined;
	}

	private _resolveBackendSession(sessionResource: URI): URI | undefined {
		const provisionalSession = this._provisionalSessionService.get(sessionResource);
		if (provisionalSession) {
			return provisionalSession;
		}

		if (!sessionResource.scheme.startsWith(AGENT_HOST_SESSION_SCHEME_PREFIX)) {
			return undefined;
		}

		const provider = sessionResource.scheme.substring(AGENT_HOST_SESSION_SCHEME_PREFIX.length);
		return provider ? AgentSession.uri(provider, sessionResource.path.substring(1)) : undefined;
	}
}

registerWorkbenchContribution2(AgentHostModeSynchronizer.ID, AgentHostModeSynchronizer, WorkbenchPhase.Eventually);
