/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { ResolveSessionConfigResult, SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import type { IChatWidget } from '../../chat.js';
import { AgentHostChatInputPicker, isGenericConfigPickerProperty } from './agentHostChatInputPicker.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { resolveAgentHostChatSession, toAgentHostBackendSessionUri } from './agentHostSessionUri.js';
import { retrySessionConfigSubscriptionOnCreation } from './agentHostSessionConfigSubscription.js';

/**
 * Direct-render chip lane for agent-host session-config properties that are
 * advertised by the agent's schema but are NOT handled by a dedicated
 * well-known picker (e.g. Claude's custom approval-mode property).
 *
 * Unlike the dedicated chips, this lane is not registered with
 * `MenuId.ChatInputSecondary`. It owns its own DOM container and creates
 * one {@link AgentHostChatInputPicker} per generic property, syncing the
 * set of chips whenever the active session's schema changes.
 */
export class AgentHostGenericConfigChips extends Disposable {

	private _container: HTMLElement | undefined;

	private readonly _chips = this._register(new DisposableMap<string>());
	private readonly _chipElements = new Map<string, HTMLElement>();

	/** Subscription to the active session, replaced when its resource or owning connection changes. */
	private readonly _subRef = this._register(new MutableDisposable<IDisposable & IAgentHostSessionResolution & {
		readonly sub: IAgentSubscription<SessionState>;
		readonly sessionResource: URI;
	}>());

	private _initialResolved: { readonly sessionResource: URI; readonly result: ResolveSessionConfigResult } | undefined;
	private readonly _initialResolveCts = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		private readonly _widget: IChatWidget,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
	) {
		super();
		this._register(this._widget.onDidChangeViewModel(() => this._reattach()));
		this._register(this._connectionsService.onDidChangeSessionResolution(() => this._reattach()));
		this._register(this._provisional.onDidChange((sessionResource: URI) => {
			const current = this._widget.viewModel?.sessionResource;
			if (current && current.toString() === sessionResource.toString()) {
				this._reattach();
			}
		}));
		this._reattach();
	}

	render(container: HTMLElement): void {
		this._container = container;
		this._sync();
	}

	getCompactableElements(): readonly HTMLElement[] {
		return Array.from(this._chipElements.values()).filter(element => element.classList.contains('agent-host-chat-input-picker-has-icon'));
	}

	private _reattach(): void {
		const sessionResource = this._widget.viewModel?.sessionResource;
		const provisionalBackend = sessionResource ? this._provisional.get(sessionResource) : undefined;
		const resolution = sessionResource ? resolveAgentHostChatSession(sessionResource, provisionalBackend, this._connectionsService) : undefined;

		if (!sessionResource || !resolution) {
			this._subRef.clear();
			this._initialResolved = undefined;
			this._cancelInitialResolve();
			this._sync();
			return;
		}

		const localBackend = toAgentHostBackendSessionUri(sessionResource);
		if (localBackend && isUntitledChatSession(sessionResource) && !provisionalBackend) {
			this._subRef.clear();
			if (!this._initialResolved || this._initialResolved.sessionResource.toString() !== sessionResource.toString()) {
				this._initialResolved = undefined;
				void this._refreshInitialResolved(sessionResource, localBackend);
			}
			this._sync();
			return;
		}

		this._initialResolved = undefined;
		this._cancelInitialResolve();
		const current = this._subRef.value;
		if (current && !(current.sub.value instanceof Error) && isEqual(current.sessionResource, sessionResource) && current.connection === resolution.connection && isEqual(current.backendSession, resolution.backendSession)) {
			this._sync();
			return;
		}
		const ref = resolution.connection.getSubscription(StateComponents.Session, resolution.backendSession, 'AgentHostGenericConfigChips');
		const sub = ref.object;
		const listener = sub.onDidChange(() => this._sync());
		const creationListener = retrySessionConfigSubscriptionOnCreation(resolution.connection, resolution.backendSession, sub, () => this._reattach());
		this._subRef.value = {
			...resolution,
			sub,
			sessionResource,
			dispose: () => { creationListener.dispose(); listener.dispose(); ref.dispose(); },
		};
		this._sync();
	}

	private _cancelInitialResolve(): void {
		this._initialResolveCts.value?.cancel();
		this._initialResolveCts.clear();
	}

	private async _refreshInitialResolved(sessionResource: URI, backendSession: URI): Promise<void> {
		this._initialResolveCts.value?.cancel();
		const cts = new CancellationTokenSource();
		this._initialResolveCts.value = cts;
		try {
			const result = await this._connectionsService.ambientConnection.resolveSessionConfig({
				provider: backendSession.scheme,
				workingDirectory: this._readWorkingDirectory(),
			});
			if (cts.token.isCancellationRequested || this._widget.viewModel?.sessionResource?.toString() !== sessionResource.toString()) {
				return;
			}
			this._initialResolved = { sessionResource, result };
			this._sync();
		} catch {
			// Best-effort.
		}
	}

	private _readWorkingDirectory(): URI | undefined {
		const state = this._subRef.value?.sub.value;
		if (state && !(state instanceof Error)) {
			const cwd = state.workingDirectories?.[0];
			return typeof cwd === 'string' ? URI.parse(cwd) : cwd;
		}
		const sessionResource = this._widget.viewModel?.sessionResource;
		return (sessionResource && this._newSessionFolderService.getFolder(sessionResource))
			?? (sessionResource && this._workingDirectoryResolver.resolve(sessionResource))
			?? this._newSessionFolderService.getDefaultFolder()
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	private _readSchemaProperties(): readonly [string, SessionConfigPropertySchema][] | undefined {
		const sessionResource = this._widget.viewModel?.sessionResource;
		if (this._subRef.value) {
			const state = this._subRef.value.sub.value;
			if (!state || state instanceof Error || !state.config) {
				return undefined;
			}
			const overlay = sessionResource ? this._provisional.getResolvedConfig(sessionResource) : undefined;
			return Object.entries((overlay?.schema ?? state.config.schema).properties);
		}
		if (this._initialResolved && sessionResource && this._initialResolved.sessionResource.toString() === sessionResource.toString()) {
			return Object.entries(this._initialResolved.result.schema.properties);
		}
		return undefined;
	}

	private _sync(): void {
		if (!this._container) {
			return;
		}
		const entries = this._readSchemaProperties();
		const sessionResource = this._widget.viewModel?.sessionResource;
		const isStartedSession = !!sessionResource && !(isUntitledChatSession(sessionResource) && toAgentHostBackendSessionUri(sessionResource));
		const desired = new Set<string>();
		if (entries) {
			for (const [property, schema] of entries) {
				if (!isGenericConfigPickerProperty(property, schema, isStartedSession)) {
					continue;
				}
				desired.add(property);
			}
		}

		// Remove chips for properties no longer in the schema (or now claimed
		// by a dedicated picker).
		for (const property of [...this._chips.keys()]) {
			if (!desired.has(property)) {
				this._chips.deleteAndDispose(property);
				this._chipElements.delete(property);
			}
		}

		// Add chips for newly-appearing generic properties.
		for (const property of desired) {
			if (this._chips.has(property)) {
				continue;
			}
			const chip = this._instantiationService.createInstance(AgentHostChatInputPicker, this._widget, property);
			// `chat-input-picker-item` matches the class that
			// `ChatInputPickerActionViewItem` applies to the dedicated
			// chips' container — required so the secondary-toolbar styling
			// in `chat.css` (height, padding, chevron) applies here too.
			const slot = dom.append(this._container, dom.$('.agent-host-generic-chip-slot.chat-input-picker-item'));
			this._chips.set(property, {
				dispose: () => {
					chip.dispose();
					slot.remove();
					this._chipElements.delete(property);
				},
			});
			this._chipElements.set(property, slot);
			chip.render(slot);
		}
	}
}
