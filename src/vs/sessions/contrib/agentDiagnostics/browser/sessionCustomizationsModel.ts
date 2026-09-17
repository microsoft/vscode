/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isCustomizationEnabled } from '../../../../platform/agentHost/common/customizationEnablement.js';
import { CustomizationLoadStatus, CustomizationType, type ChildCustomization, type Customization, type DirectoryCustomization, type McpServerCustomization, type PluginCustomization } from '../../../../platform/agentHost/common/state/sessionState.js';
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

export type SessionCustomizationStatus = 'loaded' | 'disabled' | 'loading' | 'degraded' | 'failed';

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
		this.providerListener.value = provider.onDidChangeCustomizations(() => this.refresh());
		this.refresh();
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
			groups: groupCustomizations(provider.getCustomizations(session.sessionId)),
		};
		this._onDidChange.fire();
	}
}

function createEmptyGroups(): ISessionCustomizationGroup[] {
	return sectionOrder.map(section => ({ section, items: [] }));
}

function groupCustomizations(customizations: readonly Customization[]): ISessionCustomizationGroup[] {
	const groups = new Map<SessionCustomizationSection, ISessionCustomizationItem[]>(
		sectionOrder.map(section => [section, []])
	);
	for (const customization of customizations) {
		if (customization.type === CustomizationType.Plugin) {
			groups.get(SessionCustomizationSection.Plugins)?.push(toPluginItem(customization));
			for (const child of customization.children ?? []) {
				groups.get(sectionForChild(child))?.push(toChildItem(child, customization));
			}
		} else if (customization.type === CustomizationType.Directory) {
			for (const child of customization.children ?? []) {
				groups.get(sectionForChild(child))?.push(toChildItem(child, customization));
			}
		} else {
			groups.get(SessionCustomizationSection.McpServers)?.push(toMcpServerItem(customization));
		}
	}
	return sectionOrder.map(section => ({
		section,
		items: groups.get(section)?.sort((a, b) => a.name.localeCompare(b.name) || a.uri.localeCompare(b.uri)) ?? [],
	}));
}

function toPluginItem(plugin: PluginCustomization): ISessionCustomizationItem {
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
		status: isCustomizationEnabled(plugin) ? loadStatus.status : 'disabled',
		detail: loadStatus.detail,
	};
}

function toChildItem(child: ChildCustomization, parent: PluginCustomization | DirectoryCustomization): ISessionCustomizationItem {
	const parentEnabled = parent.type === CustomizationType.Plugin ? isCustomizationEnabled(parent) : parent.enabled;
	const childEnabled = child.type === CustomizationType.McpServer ? isCustomizationEnabled(child) : child.enabled !== false;
	const loadStatus = containerLoadStatus(parent);
	const status = !parentEnabled || !childEnabled ? 'disabled' : loadStatus.status;
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
	};
}

function toMcpServerItem(server: McpServerCustomization): ISessionCustomizationItem {
	return {
		id: server.id,
		section: SessionCustomizationSection.McpServers,
		type: server.type,
		name: server.name,
		uri: server.uri,
		parentName: undefined,
		parentUri: undefined,
		description: undefined,
		status: isCustomizationEnabled(server) ? mcpServerStatus(server) : 'disabled',
		detail: mcpServerDetail(server),
	};
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
