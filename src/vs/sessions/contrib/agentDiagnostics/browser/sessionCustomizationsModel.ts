/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { isCustomizationEnabled } from '../../../../platform/agentHost/common/customizationEnablement.js';
import { CustomizationLoadStatus, CustomizationType, ResponsePartKind, StateComponents, ToolCallContributorKind, type ChatState, type ChildCustomization, type Customization, type DirectoryCustomization, type McpServerCustomization, type PluginCustomization, type ResponsePart, type StringOrMarkdown } from '../../../../platform/agentHost/common/state/sessionState.js';
import { type IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { isAgentHostProvider, type IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { type ISession } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';

export const enum SessionCustomizationSection {
	Plugins = 'plugins',
	Agents = 'agents',
	Skills = 'skills',
	Instructions = 'instructions',
	Hooks = 'hooks',
	McpServers = 'mcpServers',
}

export type SessionCustomizationStatus = 'used' | 'loaded' | 'disabled' | 'loading' | 'degraded' | 'failed';

export interface ISessionCustomizationEvidence {
	readonly chatResource: URI;
	readonly chatTitle: string;
	readonly turnId: string;
	readonly kind: 'agent' | 'skill' | 'mcp';
}

export interface ISessionCustomizationItem {
	readonly id: string;
	readonly section: SessionCustomizationSection;
	readonly type: CustomizationType;
	readonly name: string;
	readonly uri: string;
	readonly parentName: string | undefined;
	readonly parentUri: string | undefined;
	readonly description: string | undefined;
	readonly status: SessionCustomizationStatus;
	readonly detail: string | undefined;
	readonly evidence: readonly ISessionCustomizationEvidence[];
}

export interface ISessionCustomizationGroup {
	readonly section: SessionCustomizationSection;
	readonly items: readonly ISessionCustomizationItem[];
}

export interface ISessionCustomizationsState {
	readonly sessionResource: URI;
	readonly supported: boolean;
	readonly groups: readonly ISessionCustomizationGroup[];
}

const sectionOrder = [
	SessionCustomizationSection.Plugins,
	SessionCustomizationSection.Agents,
	SessionCustomizationSection.Skills,
	SessionCustomizationSection.Instructions,
	SessionCustomizationSection.Hooks,
	SessionCustomizationSection.McpServers,
] as const;

export class SessionCustomizationsModel extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly providerListener = this._register(new MutableDisposable());
	private readonly sessionChatsListener = this._register(new MutableDisposable());
	private readonly chatSubscriptions = this._register(new DisposableMap<string, DisposableStore>());
	private readonly chatSubscriptionValues = new Map<string, IAgentSubscription<ChatState>>();
	private session: ISession | undefined;
	private provider: IAgentHostSessionsProvider | undefined;
	private _state: ISessionCustomizationsState | undefined;

	get state(): ISessionCustomizationsState | undefined {
		return this._state;
	}

	constructor(
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
	}

	setSession(session: ISession | undefined): void {
		if (this.session?.sessionId === session?.sessionId && this.session?.providerId === session?.providerId) {
			return;
		}
		this.session = session;
		this.provider = undefined;
		this.providerListener.clear();
		this.sessionChatsListener.clear();
		this.chatSubscriptions.clearAndDisposeAll();
		this.chatSubscriptionValues.clear();

		if (!session) {
			this._state = undefined;
			this._onDidChange.fire();
			return;
		}

		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			this._state = {
				sessionResource: session.resource,
				supported: false,
				groups: createEmptyGroups(),
			};
			this._onDidChange.fire();
			return;
		}

		this.provider = provider;
		this.providerListener.value = provider.onDidChangeCustomizations(() => {
			this.refreshChatSubscriptions();
			this.refresh();
		});
		this.sessionChatsListener.value = autorun(reader => {
			session.chats.read(reader);
			this.refreshChatSubscriptions();
			this.refresh();
		});
	}

	private refreshChatSubscriptions(): void {
		const session = this.session;
		const provider = this.provider;
		if (!session || !provider) {
			return;
		}
		const source = provider.getCustomizationDiagnosticsSource(session.sessionId);
		const resources = new Set(source?.chatResources.map(resource => resource.toString()) ?? []);
		for (const key of this.chatSubscriptions.keys()) {
			if (!resources.has(key)) {
				this.chatSubscriptions.deleteAndDispose(key);
				this.chatSubscriptionValues.delete(key);
			}
		}
		if (!source) {
			return;
		}
		for (const resource of source.chatResources) {
			const key = resource.toString();
			if (this.chatSubscriptions.has(key)) {
				continue;
			}
			const store = new DisposableStore();
			const reference = store.add(source.connection.getSubscription(StateComponents.Chat, resource, 'SessionCustomizationsModel'));
			store.add(reference.object.onDidChange(() => this.refresh()));
			if (reference.object.onDidError) {
				store.add(reference.object.onDidError(() => this.refresh()));
			}
			this.chatSubscriptions.set(key, store);
			this.chatSubscriptionValues.set(key, reference.object);
		}
	}

	private refresh(): void {
		const session = this.session;
		const provider = this.provider;
		if (!session || !provider) {
			return;
		}
		this._state = {
			sessionResource: session.resource,
			supported: true,
			groups: groupCustomizations(provider.getCustomizations(session.sessionId), collectUsage(provider.getCustomizations(session.sessionId), this.getChatStates())),
		};
		this._onDidChange.fire();
	}

	private getChatStates(): readonly ChatState[] {
		const states: ChatState[] = [];
		for (const subscription of this.chatSubscriptionValues.values()) {
			const state = subscription?.value;
			if (state && !(state instanceof Error)) {
				states.push(state);
			}
		}
		return states;
	}
}

function createEmptyGroups(): ISessionCustomizationGroup[] {
	return sectionOrder.map(section => ({ section, items: [] }));
}

function groupCustomizations(customizations: readonly Customization[], usage: ReadonlyMap<string, readonly ISessionCustomizationEvidence[]>): ISessionCustomizationGroup[] {
	const groups = new Map<SessionCustomizationSection, ISessionCustomizationItem[]>(
		sectionOrder.map(section => [section, []])
	);
	for (const customization of customizations) {
		if (customization.type === CustomizationType.Plugin) {
			const childEvidence = (customization.children ?? []).flatMap(child => usage.get(child.id) ?? []);
			groups.get(SessionCustomizationSection.Plugins)?.push(toPluginItem(customization, childEvidence));
			for (const child of customization.children ?? []) {
				groups.get(sectionForChild(child))?.push(toChildItem(child, customization, usage.get(child.id) ?? []));
			}
		} else if (customization.type === CustomizationType.Directory) {
			for (const child of customization.children ?? []) {
				groups.get(sectionForChild(child))?.push(toChildItem(child, customization, usage.get(child.id) ?? []));
			}
		} else {
			groups.get(SessionCustomizationSection.McpServers)?.push(toMcpServerItem(customization, usage.get(customization.id) ?? []));
		}
	}
	return sectionOrder.map(section => ({
		section,
		items: groups.get(section)?.sort((a, b) => a.name.localeCompare(b.name) || a.uri.localeCompare(b.uri)) ?? [],
	}));
}

function toPluginItem(plugin: PluginCustomization, evidence: readonly ISessionCustomizationEvidence[]): ISessionCustomizationItem {
	const loadStatus = containerLoadStatus(plugin);
	return {
		id: plugin.id,
		section: SessionCustomizationSection.Plugins,
		type: plugin.type,
		name: plugin.name,
		uri: plugin.uri,
		parentName: undefined,
		parentUri: undefined,
		description: plugin.version ? `v${plugin.version}` : undefined,
		status: isCustomizationEnabled(plugin) ? withUsageStatus(loadStatus.status, evidence) : 'disabled',
		detail: loadStatus.detail,
		evidence,
	};
}

function toChildItem(child: ChildCustomization, parent: PluginCustomization | DirectoryCustomization, evidence: readonly ISessionCustomizationEvidence[]): ISessionCustomizationItem {
	const parentEnabled = parent.type === CustomizationType.Plugin ? isCustomizationEnabled(parent) : parent.enabled;
	const childEnabled = child.type === CustomizationType.McpServer ? isCustomizationEnabled(child) : child.enabled !== false;
	const loadStatus = containerLoadStatus(parent);
	const status = !parentEnabled || !childEnabled ? 'disabled' : withUsageStatus(loadStatus.status, evidence);
	const detail = child.type === CustomizationType.McpServer ? mcpServerDetail(child) : loadStatus.detail;
	return {
		id: child.id,
		section: sectionForChild(child),
		type: child.type,
		name: child.name,
		uri: child.uri,
		parentName: parent.name,
		parentUri: parent.uri,
		description: readDescription(child),
		status,
		detail,
		evidence,
	};
}

function toMcpServerItem(server: McpServerCustomization, evidence: readonly ISessionCustomizationEvidence[]): ISessionCustomizationItem {
	return {
		id: server.id,
		section: SessionCustomizationSection.McpServers,
		type: server.type,
		name: server.name,
		uri: server.uri,
		parentName: undefined,
		parentUri: undefined,
		description: undefined,
		status: isCustomizationEnabled(server) ? withUsageStatus(mcpServerStatus(server), evidence) : 'disabled',
		detail: mcpServerDetail(server),
		evidence,
	};
}

function withUsageStatus(status: SessionCustomizationStatus, evidence: readonly ISessionCustomizationEvidence[]): SessionCustomizationStatus {
	return status === 'loaded' && evidence.length > 0 ? 'used' : status;
}

function sectionForChild(child: ChildCustomization): SessionCustomizationSection {
	switch (child.type) {
		case CustomizationType.Agent:
			return SessionCustomizationSection.Agents;
		case CustomizationType.Skill:
			return SessionCustomizationSection.Skills;
		case CustomizationType.Prompt:
		case CustomizationType.Rule:
			return SessionCustomizationSection.Instructions;
		case CustomizationType.Hook:
			return SessionCustomizationSection.Hooks;
		case CustomizationType.McpServer:
			return SessionCustomizationSection.McpServers;
	}
}

function containerLoadStatus(container: PluginCustomization | DirectoryCustomization): { status: SessionCustomizationStatus; detail: string | undefined } {
	switch (container.load?.kind) {
		case CustomizationLoadStatus.Loading:
			return { status: 'loading', detail: undefined };
		case CustomizationLoadStatus.Degraded:
			return { status: 'degraded', detail: container.load.message };
		case CustomizationLoadStatus.Error:
			return { status: 'failed', detail: container.load.message };
		default:
			return { status: 'loaded', detail: undefined };
	}
}

function mcpServerStatus(server: McpServerCustomization): SessionCustomizationStatus {
	switch (server.state.kind) {
		case 'starting':
			return 'loading';
		case 'error':
			return 'failed';
		case 'stopped':
			return 'disabled';
		default:
			return 'loaded';
	}
}

function mcpServerDetail(server: McpServerCustomization): string | undefined {
	switch (server.state.kind) {
		case 'authRequired':
			return server.state.description;
		case 'error':
			return server.state.error.message;
		default:
			return server.state.kind;
	}
}

function readDescription(customization: ChildCustomization): string | undefined {
	switch (customization.type) {
		case CustomizationType.Agent:
		case CustomizationType.Skill:
		case CustomizationType.Prompt:
		case CustomizationType.Rule:
			return customization.description;
		case CustomizationType.Hook:
		case CustomizationType.McpServer:
			return undefined;
	}
}

function collectUsage(customizations: readonly Customization[], chatStates: readonly ChatState[]): ReadonlyMap<string, readonly ISessionCustomizationEvidence[]> {
	const byId = new Map<string, ISessionCustomizationEvidence[]>();
	const customizationByUri = new Map<string, string>();
	for (const customization of customizations) {
		if (customization.type === CustomizationType.Plugin || customization.type === CustomizationType.Directory) {
			for (const child of customization.children ?? []) {
				customizationByUri.set(URI.parse(child.uri).toString(), child.id);
			}
		} else {
			customizationByUri.set(URI.parse(customization.uri).toString(), customization.id);
		}
	}
	const addEvidence = (id: string | undefined, evidence: ISessionCustomizationEvidence) => {
		if (!id) {
			return;
		}
		const current = byId.get(id) ?? [];
		if (!current.some(candidate => candidate.chatResource.toString() === evidence.chatResource.toString() && candidate.turnId === evidence.turnId && candidate.kind === evidence.kind)) {
			current.push(evidence);
			byId.set(id, current);
		}
	};
	for (const chatState of chatStates) {
		for (const turn of [...chatState.turns, ...(chatState.activeTurn ? [chatState.activeTurn] : [])]) {
			const baseEvidence = {
				chatResource: URI.parse(chatState.resource.toString()),
				chatTitle: chatState.title,
				turnId: turn.id,
			};
			if (turn.message.agent) {
				addEvidence(customizationByUri.get(URI.parse(turn.message.agent.uri.toString()).toString()), { ...baseEvidence, kind: 'agent' });
			}
			for (const part of turn.responseParts) {
				collectResponsePartUsage(part, customizationByUri, baseEvidence, addEvidence);
			}
		}
	}
	return byId;
}

function collectResponsePartUsage(
	part: ResponsePart,
	customizationByUri: ReadonlyMap<string, string>,
	evidence: Omit<ISessionCustomizationEvidence, 'kind'>,
	addEvidence: (id: string | undefined, evidence: ISessionCustomizationEvidence) => void,
): void {
	if (part.kind !== ResponsePartKind.ToolCall) {
		return;
	}
	if (part.toolCall.contributor?.kind === ToolCallContributorKind.MCP) {
		addEvidence(part.toolCall.contributor.customizationId, { ...evidence, kind: 'mcp' });
	}
	if (part.toolCall.toolName !== 'skill') {
		return;
	}
	const skillUri = readSkillUri(part.toolCall.invocationMessage);
	if (skillUri) {
		addEvidence(customizationByUri.get(skillUri.toString()), { ...evidence, kind: 'skill' });
	}
}

function readSkillUri(message: StringOrMarkdown | undefined): URI | undefined {
	const value = typeof message === 'string' ? message : message?.markdown;
	const match = value ? /\]\((?<uri>[^)]+)\)/.exec(value) : undefined;
	if (!match?.groups?.uri) {
		return undefined;
	}
	return URI.parse(match.groups.uri);
}
