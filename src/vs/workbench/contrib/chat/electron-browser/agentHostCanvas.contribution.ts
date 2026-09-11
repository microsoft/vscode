/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { readAgentCanvases } from '../../../../platform/agentHost/common/meta/agentCanvasMeta.js';
import { buildChatUri, buildDefaultChatUri, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IChatWidget, IChatWidgetService } from '../browser/chat.js';
import { AgentHostCanvas } from '../browser/agentSessions/agentHost/agentHostCanvas.js';
import { pickAgentHostCanvas } from '../browser/agentSessions/agentHost/agentHostCanvasPicker.js';
import { getAgentHostSessionChatResource } from '../browser/agentSessions/agentHost/agentHostSessionInputPills.js';
import { AgentHostCanvasCommandId } from '../common/actions/chatActions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';

class AgentHostCanvasContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostCanvas';

	private readonly _widgets = this._register(new DisposableMap<IChatWidget>());
	private readonly _sessions = new ResourceMap<{ count: number; canvas: AgentHostCanvas; store: DisposableStore; connection: IAgentHostSessionResolution['connection'] }>();

	constructor(
		@IChatWidgetService private readonly _widgetService: IChatWidgetService,
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._register(this._widgetService.onDidAddWidget(widget => this._attach(widget)));
		this._register(this._widgetService.onDidRemoveWidget(widget => this._widgets.deleteAndDispose(widget)));
		this._register(this._connections.onDidChangeSessionResolution(() => this._refresh()));
		this._register(this._entitlementService.onDidChangeSentiment(() => this._refresh()));
		this._refresh();

		const open = (resource?: URI) => this._openCanvas(resource);
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: AgentHostCanvasCommandId.Open,
					title: localize2('canvas.open', "Open Canvas"),
					category: localize2('chat.category', "Chat"),
					f1: true,
					precondition: ChatContextKeys.enabled,
				});
			}
			override run(_accessor: ServicesAccessor, resource?: URI): Promise<void> {
				return open(resource);
			}
		}));
		const reopen = (resource?: URI) => this._pickCanvas(false, resource);
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: AgentHostCanvasCommandId.Reopen,
					title: localize2('canvas.reopen', "Reopen Canvas"),
					category: localize2('chat.category', "Chat"),
					f1: true,
					precondition: ChatContextKeys.enabled,
				});
			}
			override run(_accessor: ServicesAccessor, resource?: URI): Promise<void> {
				return reopen(resource);
			}
		}));
		const close = (resource?: URI) => this._pickCanvas(true, resource);
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: AgentHostCanvasCommandId.Close,
					title: localize2('canvas.close', "Close Canvas"),
					category: localize2('chat.category', "Chat"),
					f1: true,
					precondition: ChatContextKeys.enabled,
				});
			}
			override run(_accessor: ServicesAccessor, resource?: URI): Promise<void> {
				return close(resource);
			}
		}));
	}

	private _refresh(): void {
		this._widgets.clearAndDisposeAll();
		if (this._entitlementService.sentiment.hidden) {
			for (const entry of this._sessions.values()) {
				entry.store.dispose();
			}
			this._sessions.clear();
		}
		for (const [resource, entry] of this._sessions) {
			if (this._connections.resolveSessionResource(resource)?.connection !== entry.connection) {
				entry.store.dispose();
				this._sessions.delete(resource);
			}
		}
		for (const widget of this._widgetService.getAllWidgets()) {
			this._attach(widget);
		}
	}

	private _attach(widget: IChatWidget): void {
		if (this._entitlementService.sentiment.hidden || this._widgets.has(widget)) {
			return;
		}
		const store = new DisposableStore();
		this._widgets.set(widget, store);
		const tracking = store.add(new MutableDisposable());
		const update = () => {
			tracking.clear();
			const resource = widget.viewModel?.sessionResource;
			if (resource) {
				tracking.value = this._acquire(resource);
			}
		};
		store.add(widget.onDidChangeViewModel(update));
		update();
	}

	private _acquire(resource: URI): IDisposable | undefined {
		const resolution = this._connections.resolveSessionResource(resource);
		if (!resolution) {
			return undefined;
		}
		let entry = this._sessions.get(resource);
		if (!entry) {
			const store = new DisposableStore();
			const local = resolution.connectionAuthority === AMBIENT_AGENT_HOST_AUTHORITY && !this._environmentService.remoteAuthority;
			const canvas = store.add(this._instantiationService.createInstance(AgentHostCanvas, resource, resolution.connectionAuthority, local));
			entry = { count: 1, canvas, store, connection: resolution.connection };
			this._sessions.set(resource, entry);
			const subscription = store.add(resolution.connection.getSubscription(StateComponents.Session, resolution.backendSession, 'AgentHostCanvas'));
			const update = () => {
				const state = subscription.object.value;
				if (!state || state instanceof Error) {
					return;
				}
				const chat = getAgentHostSessionChatResource(resource, state)?.toString();
				void canvas.update(readAgentCanvases(state).filter(instance => instance.chat === chat)).then(() => {
					const current = this._sessions.get(resource);
					if (current?.store === store && current.count === 0 && canvas.canvases.length === 0) {
						this._sessions.delete(resource);
						store.dispose();
					}
				});
			};
			store.add(subscription.object.onDidChange(update));
			update();
		} else {
			entry.count++;
		}
		const acquired = entry;
		return toDisposable(() => {
			if (--acquired.count === 0 && acquired.canvas.canvases.length === 0) {
				this._sessions.delete(resource);
				acquired.store.dispose();
			}
		});
	}

	private async _openCanvas(resource = this._widgetService.lastFocusedWidget?.viewModel?.sessionResource): Promise<void> {
		if (this._entitlementService.sentiment.hidden) {
			return;
		}
		const resolution = resource && this._connections.resolveSessionResource(resource);
		if (!resource || !resolution) {
			this._notificationService.info(localize('canvas.selectSession', "Select a local Copilot agent host chat to open a canvas."));
			return;
		}
		if (resolution.connectionAuthority !== AMBIENT_AGENT_HOST_AUTHORITY || this._environmentService.remoteAuthority) {
			this._notificationService.info(localize('canvas.localOnly', "Opening canvases currently requires a local agent host."));
			return;
		}
		const store = new DisposableStore();
		try {
			const tracking = this._acquire(resource);
			if (tracking) {
				store.add(tracking);
			}
			const subscription = store.add(resolution.connection.getSubscription(StateComponents.Session, resolution.backendSession, 'OpenCanvas'));
			const state = subscription.object.value;
			if (state instanceof Error) {
				throw state;
			}
			const chat = getAgentHostSessionChatResource(resource, state) ?? URI.parse(resource.fragment
				? buildChatUri(resolution.backendSession.toString(), resource.fragment)
				: buildDefaultChatUri(resolution.backendSession.toString()));
			const selection = await pickAgentHostCanvas(this._quickInputService, () => resolution.connection.listCanvases(resolution.backendSession, chat));
			if (!selection || this._entitlementService.sentiment.hidden) {
				return;
			}
			if (this._connections.resolveSessionResource(resource)?.connection !== resolution.connection) {
				throw new Error(localize('canvas.connectionChanged', "The agent host connection changed. Open the Canvas picker again."));
			}
			const opened = await resolution.connection.openCanvas(resolution.backendSession, chat, selection.canvas.extensionId, selection.canvas.canvasTypeId, selection.input);
			const controller = this._sessions.get(resource)?.canvas;
			if (controller) {
				await controller.update([...controller.canvases.filter(canvas => canvas.instanceId !== opened.instanceId), opened]);
				await controller.open(opened.instanceId);
			}
		} finally {
			store.dispose();
		}
	}

	private async _pickCanvas(close: boolean, resource = this._widgetService.lastFocusedWidget?.viewModel?.sessionResource): Promise<void> {
		if (this._entitlementService.sentiment.hidden) {
			return;
		}
		const controller = resource ? this._sessions.get(resource)?.canvas : undefined;
		const canvases = controller?.canvases ?? [];
		if (!controller || canvases.length === 0) {
			this._notificationService.info(localize('canvas.none', "No canvases are open in the current chat. Use Chat: Open Canvas to open a Canvas extension first."));
			return;
		}
		const selection = await this._quickInputService.pick(canvases.map(canvas => ({
			label: canvas.title || canvas.canvasTypeId,
			description: canvas.unavailable ? localize('canvas.reconnecting', "Reconnecting") : canvas.canvasTypeId,
			instanceId: canvas.instanceId,
			chat: canvas.chat,
		})), { placeHolder: close ? localize('canvas.pickClose', "Select a canvas to close") : localize('canvas.pick', "Select a canvas to reopen") });
		if (selection) {
			if (close && resource) {
				const resolution = this._connections.resolveSessionResource(resource);
				if (!resolution) {
					this._notificationService.error(localize('canvas.disconnected', "The agent host is disconnected. Reconnect before closing the canvas."));
					return;
				}
				await resolution.connection.closeCanvas(resolution.backendSession, URI.parse(selection.chat), selection.instanceId);
			} else {
				await controller.open(selection.instanceId);
			}
		}
	}

	override dispose(): void {
		super.dispose();
		for (const entry of this._sessions.values()) {
			entry.store.dispose();
		}
		this._sessions.clear();
	}
}

registerWorkbenchContribution2(AgentHostCanvasContribution.ID, AgentHostCanvasContribution, WorkbenchPhase.AfterRestored);
