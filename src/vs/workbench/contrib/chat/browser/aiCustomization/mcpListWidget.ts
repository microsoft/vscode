/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, isDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../../base/browser/ui/list/list.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpConnectionState, McpServerInstallState, IMcpService, IMcpServer } from '../../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../../../mcp/common/discovery/pluginMcpDiscovery.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ContributionEnablementState, isContributionDisabled } from '../../common/enablement.js';
import { McpCommandIds } from '../../../../contrib/mcp/common/mcpCommandIds.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { ConfigureModelAccessAction, DisableMcpServerForWorkspaceAction, DisableMcpServerGloballyAction, EnableMcpServerForWorkspaceAction, EnableMcpServerGloballyAction, getContextMenuActions, RestartServerAction, ShowSamplingRequestsAction, StartServerAction, StopServerAction } from '../../../../contrib/mcp/browser/mcpServerActions.js';
import { LocalMcpServerScope } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { workspaceIcon, userIcon, mcpServerIcon, builtinIcon, pluginIcon, extensionIcon } from './aiCustomizationIcons.js';
import { formatDisplayName, truncateToFirstLine } from './aiCustomizationListWidget.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { CustomizationGroupHeaderRenderer, ICustomizationGroupHeaderEntry, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from './customizationGroupHeaderRenderer.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { GalleryItemInstallState, GalleryItemRenderer, IGalleryItemProvider } from './galleryItemRenderer.js';
import { IOutputService } from '../../../../services/output/common/output.js';

const $ = DOM.$;

const MCP_ITEM_HEIGHT = 36;
const MCP_ITEM_WITH_DESCRIPTION_HEIGHT = 44;

const PLUGIN_COLLECTION_PREFIX = MCP_PLUGIN_COLLECTION_ID_PREFIX;

const COPILOT_EXTENSION_IDS = ['github.copilot', 'github.copilot-chat'];

function isCopilotExtension(id: ExtensionIdentifier): boolean {
	return COPILOT_EXTENSION_IDS.some(copilotId => ExtensionIdentifier.equals(id, copilotId));
}

function getPluginUriFromCollectionId(collectionId: string | undefined): string | undefined {
	return collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX) ? collectionId.slice(PLUGIN_COLLECTION_PREFIX.length) : undefined;
}

/**
 * Represents a collapsible group header in the MCP server list.
 */
interface IMcpGroupHeaderEntry extends ICustomizationGroupHeaderEntry {
	readonly scope: LocalMcpServerScope | 'builtin' | 'plugin' | 'extension';
}

/**
 * Represents an individual MCP server item in the list.
 */
interface IMcpServerItemEntry {
	readonly type: 'server-item';
	readonly server: IWorkbenchMcpServer;
	readonly activeSessionServer?: AgentHostMcpServer;
	readonly localServer?: IMcpServer;
	/**
	 * Whether this entry originates from a marketplace browse result. Marketplace rows always use
	 * the gallery row presentation (with an Install/Installed button), even when the server is
	 * already installed, so installed and not-installed results look consistent.
	 */
	readonly marketplace?: boolean;
}

interface IMcpSessionServerItemEntry {
	readonly type: 'session-server-item';
	readonly server: AgentHostMcpServer;
}

/**
 * Represents a built-in MCP server provided by an extension or plugin.
 */
interface IMcpBuiltinItemEntry {
	readonly type: 'builtin-item';
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly collectionId?: string;
	readonly activeSessionServer?: AgentHostMcpServer;
	readonly localServer?: IMcpServer;
}

export type AgentHostMcpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

type IMcpListEntry = IMcpGroupHeaderEntry | IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry;

type McpStatusKind = McpConnectionState.Kind | McpServerStatus | 'disabled';

/**
 * Delegate for the MCP server list.
 */
class McpServerItemDelegate implements IListVirtualDelegate<IMcpListEntry> {
	getHeight(element: IMcpListEntry): number {
		if (element.type === 'group-header') {
			return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		if (element.type === 'server-item' && element.server.gallery && (element.marketplace || !element.server.local)) {
			return 62;
		}
		if (element.type === 'server-item' && element.server.description?.trim()) {
			return MCP_ITEM_WITH_DESCRIPTION_HEIGHT;
		}
		if (element.type === 'builtin-item' && element.description) {
			return MCP_ITEM_WITH_DESCRIPTION_HEIGHT;
		}
		return MCP_ITEM_HEIGHT;
	}

	getTemplateId(element: IMcpListEntry): string {
		if (element.type === 'group-header') {
			return 'mcpGroupHeader';
		}
		if (element.type === 'builtin-item') {
			return 'mcpServerItem';
		}
		if (element.type === 'session-server-item') {
			return 'mcpServerItem';
		}
		const server = element.server;
		return server.gallery && (element.marketplace || !server.local) ? MCP_GALLERY_ITEM_TEMPLATE_ID : 'mcpServerItem';
	}
}

interface IMcpServerItemTemplateData {
	readonly container: HTMLElement;
	readonly typeIcon: HTMLElement;
	readonly name: HTMLElement;
	readonly description: HTMLElement;
	readonly actions: HTMLElement;
	readonly elementDisposables: DisposableStore;
	readonly actionDisposables: DisposableStore;
}

/**
 * Renderer for local MCP server list items.
 */
class McpServerItemRenderer implements IListRenderer<IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, IMcpServerItemTemplateData> {
	readonly templateId = 'mcpServerItem';

	constructor(
		private readonly _afterShowOutput: () => Promise<void>,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IOutputService private readonly outputService: IOutputService,
	) { }

	renderTemplate(container: HTMLElement): IMcpServerItemTemplateData {
		container.classList.add('mcp-server-item');

		const typeIcon = DOM.append(container, $('.mcp-server-icon'));
		typeIcon.classList.add(...ThemeIcon.asClassNameArray(mcpServerIcon));

		const details = DOM.append(container, $('.mcp-server-details'));
		const nameRow = DOM.append(details, $('.mcp-server-name-row'));
		const name = DOM.append(nameRow, $('.mcp-server-name'));

		const description = DOM.append(details, $('.mcp-server-description'));

		const actions = DOM.append(container, $('.mcp-server-actions'));

		return {
			container,
			typeIcon,
			name,
			description,
			actions,
			elementDisposables: new DisposableStore(),
			actionDisposables: new DisposableStore(),
		};
	}

	renderElement(element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, index: number, templateData: IMcpServerItemTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.actionDisposables.clear();

		if (element.type === 'builtin-item') {
			templateData.container.classList.add('builtin');
			templateData.container.classList.toggle('has-detail', false);
			templateData.name.textContent = formatDisplayName(element.label);
			if (element.description) {
				templateData.description.textContent = truncateToFirstLine(element.description);
				templateData.description.style.display = '';
			} else {
				templateData.description.textContent = '';
				templateData.description.style.display = 'none';
			}
			this.updateKnownServerStatus(templateData, element);

			// Add hover with plugin provenance for plugin-sourced builtin items
			const pluginUriStr = getPluginUriFromCollectionId(element.collectionId);
			if (pluginUriStr) {
				templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.container, () => {
					const plugin = this.agentPluginService.plugins.get().find(p => p.uri.toString() === pluginUriStr);
					if (plugin) {
						return {
							content: `${element.label}\n${localize('fromPlugin', "Plugin: {0}", plugin.label)}`,
							appearance: { compact: true, skipFadeInAnimation: true },
						};
					}
					return { content: element.label, appearance: { compact: true, skipFadeInAnimation: true } };
				}));
			}
			return;
		}

		if (element.type === 'session-server-item') {
			templateData.container.classList.remove('builtin');
			templateData.container.classList.toggle('has-detail', false);
			templateData.name.textContent = formatDisplayName(element.server.name);
			templateData.description.textContent = '';
			templateData.description.style.display = 'none';
			this.updateActiveSessionStatus(templateData, element);
			return;
		}

		templateData.container.classList.remove('builtin');
		templateData.name.textContent = formatDisplayName(element.server.label);
		const description = element.server.description?.trim();
		// Marketplace (gallery) entries are always clickable so users can install/inspect them,
		// even when no description is returned by the gallery. Installed rows only opt-in to the
		// detail view when there is something extra to show.
		const isGallery = !element.server.local;
		const hasDetail = !!description || isGallery;
		templateData.container.classList.toggle('has-detail', hasDetail);
		if (description) {
			templateData.description.textContent = truncateToFirstLine(description);
			templateData.description.style.display = '';
		} else {
			templateData.description.textContent = '';
			templateData.description.style.display = 'none';
		}

		if (element.activeSessionServer) {
			this.updateKnownServerStatus(templateData, element);
		} else if (this.workspaceService.isSessionsWindow) {
			this.updateKnownServerStatus(templateData, element);
		} else {
			templateData.elementDisposables.add(autorun(reader => {
				const disabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
				const connectionState = element.localServer?.connectionState.read(reader);
				templateData.container.classList.toggle('disabled', disabled);
				this.updateStatus(templateData, element, disabled ? 'disabled' : connectionState?.state);
			}));
		}
	}

	private updateKnownServerStatus(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpBuiltinItemEntry): void {
		templateData.elementDisposables.add(autorun(reader => {
			const localDisabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
			const activeSessionServer = element.activeSessionServer;
			templateData.container.classList.toggle('disabled', localDisabled || activeSessionServer?.enabled === false);
			this.updateStatus(templateData, element, localDisabled ? 'disabled' : activeSessionServer ? (activeSessionServer.enabled ? activeSessionServer.status : 'disabled') : undefined);
		}));
	}

	private updateActiveSessionStatus(templateData: IMcpServerItemTemplateData, element: IMcpSessionServerItemEntry): void {
		const disabled = element.server.enabled === false;
		templateData.container.classList.toggle('disabled', disabled);
		this.updateStatus(templateData, element, disabled ? 'disabled' : element.server.status);
	}

	private updateStatus(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, state: McpStatusKind | undefined): void {
		templateData.actionDisposables.clear();
		DOM.clearNode(templateData.actions);

		const presentation = getMcpStatusPresentation(state);
		if (!presentation) {
			return;
		}

		const activeSessionServer = getActiveSessionServer(element);
		const label = getMcpEntryLabel(element);
		const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
		const showActiveSessionOutput = activeSessionServer
			? (beforeShow?: () => Promise<void>) => this.agentHostCustomizationService.showMcpServerLog(activeSessionResource, activeSessionServer.id, beforeShow)
			: undefined;
		if (state === McpServerStatus.AuthRequired && activeSessionServer) {
			const signInLabel = localize('signInToMcpServer', "Sign in to {0}", label);
			const signInButton = templateData.actionDisposables.add(new Button(templateData.actions, {
				...defaultButtonStyles,
				secondary: true,
				small: true,
				title: signInLabel,
				ariaLabel: signInLabel,
			}));
			signInButton.label = localize('signIn', "Sign In");
			signInButton.element.classList.add('mcp-server-sign-in');
			registerMcpInlineButtonAction(templateData.actionDisposables, signInButton, async () => {
				signInButton.enabled = false;
				try {
					await authenticateMcpServer(this.agentHostCustomizationService, this.customizationHarnessService.activeSessionResource.get(), activeSessionServer.id);
				} finally {
					signInButton.enabled = true;
				}
			});
		}

		if (!presentation.icon) {
			return;
		}

		const showOutput = state === McpServerStatus.Error || state === McpConnectionState.Kind.Error
			? getMcpServerOutputHandler(this.outputService, element.type === 'session-server-item' ? undefined : element.localServer, activeSessionServer, this._afterShowOutput, showActiveSessionOutput)
			: undefined;
		if (showOutput) {
			const showOutputLabel = localize('showMcpServerOutput', "Show output for {0}", label);
			const statusButton = templateData.actionDisposables.add(new Button(templateData.actions, {
				title: showOutputLabel,
				ariaLabel: showOutputLabel,
			}));
			statusButton.icon = presentation.icon;
			statusButton.element.classList.add('mcp-server-status', 'mcp-server-status-action', presentation.className);
			registerMcpInlineButtonAction(templateData.actionDisposables, statusButton, showOutput);
			return;
		}

		const statusElement = DOM.append(templateData.actions, $('.mcp-server-status'));
		statusElement.classList.add(presentation.className, ...ThemeIcon.asClassNameArray(presentation.icon));
		statusElement.setAttribute('aria-hidden', 'true');
		templateData.actionDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), statusElement, presentation.label));
	}

	disposeTemplate(templateData: IMcpServerItemTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.actionDisposables.dispose();
	}
}

/** Registers an inline MCP button without allowing its pointer or click events to open the containing list row. */
export function registerMcpInlineButtonAction(store: Pick<DisposableStore, 'add'>, button: Button, action: () => void | Promise<void>): void {
	store.add(DOM.addDisposableGenericMouseDownListener(button.element, event => DOM.EventHelper.stop(event, true)));
	store.add(button.onDidClick(event => {
		DOM.EventHelper.stop(event, true);
		void action();
	}));
}

/** Runs authentication for one active-session MCP server. */
export function authenticateMcpServer(agentHostCustomizationService: IAgentHostCustomizationService, sessionResource: URI, serverId: string): Promise<boolean> {
	return agentHostCustomizationService.authenticateMcpServer(sessionResource, serverId);
}

/** Resolves the output action for an MCP server, preferring its active agent-host output. */
export function getMcpServerOutputHandler(outputService: Pick<IOutputService, 'showChannel'>, localServer: Pick<IMcpServer, 'showOutput'> | undefined, activeSessionServer: AgentHostMcpServer | undefined, closeCustomizationEditor?: () => Promise<void>, showActiveSessionOutput?: (beforeShow?: () => Promise<void>) => Promise<void>): (() => Promise<void>) | undefined {
	const outputChannelId = activeSessionServer?.logOutputChannelId;
	if (showActiveSessionOutput) {
		return () => showActiveSessionOutput(closeCustomizationEditor);
	}
	if (outputChannelId) {
		return async () => {
			await closeCustomizationEditor?.();
			await outputService.showChannel(outputChannelId);
		};
	}
	if (localServer) {
		return async () => {
			await closeCustomizationEditor?.();
			await localServer.showOutput();
		};
	}
	return undefined;
}

interface IMcpStatusPresentation {
	readonly label: string;
	readonly className: string;
	readonly icon?: ThemeIcon;
}

function getMcpStatusPresentation(state: McpStatusKind | undefined): IMcpStatusPresentation | undefined {
	if (state === undefined) {
		return undefined;
	}
	if (state === 'disabled') {
		return { label: localize('disabled', "Disabled"), className: 'disabled', icon: Codicon.circleSlash };
	}
	switch (state) {
		case McpConnectionState.Kind.Running:
		case McpServerStatus.Ready:
			return { label: localize('running', "Running"), className: 'running', icon: Codicon.check };
		case McpConnectionState.Kind.Starting:
		case McpServerStatus.Starting:
			return { label: localize('starting', "Starting"), className: 'starting', icon: ThemeIcon.modify(Codicon.loading, 'spin') };
		case McpServerStatus.AuthRequired:
			return { label: localize('authRequired', "Authentication required"), className: 'auth-required', icon: Codicon.account };
		case McpConnectionState.Kind.Error:
		case McpServerStatus.Error:
			return { label: localize('error', "Error"), className: 'error', icon: Codicon.error };
		case McpConnectionState.Kind.Stopped:
		case McpServerStatus.Stopped:
		default:
			return { label: localize('stopped', "Stopped"), className: 'stopped' };
	}
}

function getActiveSessionServer(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): AgentHostMcpServer | undefined {
	return entry.type === 'session-server-item' ? entry.server : entry.activeSessionServer;
}

function getMcpEntryLabel(element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): string {
	return element.type === 'session-server-item'
		? element.server.name
		: element.type === 'builtin-item'
			? element.label
			: element.server.label;
}

function getMcpStatusKind(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, isSessionsWindow: boolean): McpStatusKind | undefined {
	if (entry.type === 'session-server-item') {
		return entry.server.enabled ? entry.server.status : 'disabled';
	}
	if (entry.localServer && isContributionDisabled(entry.localServer.enablement.get())) {
		return 'disabled';
	}
	if (entry.activeSessionServer) {
		return entry.activeSessionServer.enabled ? entry.activeSessionServer.status : 'disabled';
	}
	if (entry.type === 'server-item' && !isSessionsWindow) {
		return entry.localServer?.connectionState.get().state;
	}
	return undefined;
}

function getMcpEntryAriaLabel(element: IMcpListEntry, isSessionsWindow: boolean): string {
	if (element.type === 'group-header') {
		return localize('mcpGroupAriaLabel', "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
	}
	const label = getMcpEntryLabel(element);
	const status = getMcpStatusPresentation(getMcpStatusKind(element, isSessionsWindow));
	return status
		? localize('mcpServerAriaLabelWithStatus', "{0}, {1}", label, status.label)
		: label;
}

function normalizeMcpMatchKey(value: string | undefined): string | undefined {
	return value || undefined;
}

function getUniqueMcpMatchKeys(values: readonly (string | undefined)[]): string[] {
	const keys = new Set<string>();
	for (const value of values) {
		const key = normalizeMcpMatchKey(value);
		if (key) {
			keys.add(key);
		}
	}
	return [...keys];
}

class ActiveSessionMcpServerMatcher {
	private readonly byKey = new Map<string, AgentHostMcpServer[]>();
	private readonly matchedIds = new Set<string>();

	constructor(private readonly servers: readonly AgentHostMcpServer[]) {
		for (const server of servers) {
			const separator = server.id.indexOf('/');
			const rawId = separator >= 0 ? server.id.slice(separator + 1) : server.id;
			for (const key of getUniqueMcpMatchKeys([rawId, server.name])) {
				let bucket = this.byKey.get(key);
				if (!bucket) {
					bucket = [];
					this.byKey.set(key, bucket);
				}
				bucket.push(server);
			}
		}
	}

	take(keys: readonly (string | undefined)[]): AgentHostMcpServer | undefined {
		for (const key of getUniqueMcpMatchKeys(keys)) {
			const matches = this.byKey.get(key)?.filter(server => !this.matchedIds.has(server.id));
			if (matches?.length === 1) {
				this.matchedIds.add(matches[0].id);
				return matches[0];
			}
		}
		return undefined;
	}

	unmatched(query: string): AgentHostMcpServer[] {
		return this.servers.filter(server => !this.matchedIds.has(server.id) && matchesActiveSessionServerQuery(server, query));
	}
}

class LocalMcpServerMatcher {
	private readonly byKey = new Map<string, IMcpServer[]>();

	constructor(servers: readonly IMcpServer[]) {
		for (const server of servers) {
			for (const key of getRuntimeServerMatchKeys(server)) {
				let matches = this.byKey.get(key);
				if (!matches) {
					matches = [];
					this.byKey.set(key, matches);
				}
				matches.push(server);
			}
		}
	}

	find(keys: readonly (string | undefined)[]): IMcpServer | undefined {
		for (const key of getUniqueMcpMatchKeys(keys)) {
			const matches = this.byKey.get(key);
			if (matches?.length === 1) {
				return matches[0];
			}
		}
		return undefined;
	}
}

function matchesActiveSessionServerQuery(server: AgentHostMcpServer, query: string): boolean {
	if (!query) {
		return true;
	}
	return server.name.toLowerCase().includes(query);
}

function getWorkbenchServerMatchKeys(server: IWorkbenchMcpServer): string[] {
	return getUniqueMcpMatchKeys([server.id, server.name, server.label]);
}

function getRuntimeServerMatchKeys(server: IMcpServer): string[] {
	return getUniqueMcpMatchKeys([server.definition.id, server.definition.label]);
}

function getActiveSessionServerLifecycleAction(server: AgentHostMcpServer): Action | undefined {
	if (!server.enabled) {
		return undefined;
	}
	return server.status === McpServerStatus.Stopped || server.status === McpServerStatus.Error
		? new Action(
			'mcpServer.activeSession.start',
			localize('activeSessionMcpServerStart', "Start Server"),
			undefined,
			true,
			() => server.start()
		)
		: new Action(
			'mcpServer.activeSession.stop',
			localize('activeSessionMcpServerStop', "Stop Server"),
			undefined,
			true,
			() => server.stop()
		);
}

/** Creates the non-persistent enablement action for one agent-host session. */
export function getSessionEnablementAction(server: AgentHostMcpServer): IAction {
	return new Action(
		server.enabled ? 'mcpServer.session.disable' : 'mcpServer.session.enable',
		server.enabled ? localize('sessionMcpServerDisable', "Disable (Session)") : localize('sessionMcpServerEnable', "Enable (Session)"),
		undefined,
		true,
		() => {
			server.setEnabled(!server.enabled);
			return Promise.resolve();
		}
	);
}

/** Creates durable profile/workspace actions for an agent-host-only server. */
export function getAgentHostMcpServerEnablementActions(agentHostCustomizations: IAgentHostCustomizationService, sessionResource: URI, server: AgentHostMcpServer, isEmptyWorkbench: boolean): IAction[] {
	const disabled = isContributionDisabled(agentHostCustomizations.getMcpServerEnablement(sessionResource, server.name));
	const actions: IAction[] = [];
	if (disabled) {
		actions.push(new Action('mcpServer.agentHost.enable', localize('agentHostMcpServerEnable', "Enable"), undefined, true, () => {
			agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, ContributionEnablementState.EnabledProfile);
		}));
		if (!isEmptyWorkbench) {
			actions.push(new Action('mcpServer.agentHost.enableWorkspace', localize('agentHostMcpServerEnableForWorkspace', "Enable (Workspace)"), undefined, true, () => {
				agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, ContributionEnablementState.EnabledWorkspace);
			}));
		}
	} else {
		actions.push(new Action('mcpServer.agentHost.disable', localize('agentHostMcpServerDisable', "Disable"), undefined, true, () => {
			agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, ContributionEnablementState.DisabledProfile);
		}));
		if (!isEmptyWorkbench) {
			actions.push(new Action('mcpServer.agentHost.disableWorkspace', localize('agentHostMcpServerDisableForWorkspace', "Disable (Workspace)"), undefined, true, () => {
				agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, ContributionEnablementState.DisabledWorkspace);
			}));
		}
	}
	return actions;
}

/** Creates durable profile/workspace actions for a locally backed built-in server row. */
export function getLocalMcpServerEnablementActions(mcpService: IMcpService, serverId: string, isEmptyWorkbench: boolean): IAction[] {
	const disabled = isContributionDisabled(mcpService.enablementModel.readEnabled(serverId));
	const actions: IAction[] = [];
	if (disabled) {
		actions.push(new Action('mcpServer.builtin.enable', localize('builtinMcpServerEnable', "Enable"), undefined, true, () => {
			mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.EnabledProfile);
		}));
		if (!isEmptyWorkbench) {
			actions.push(new Action('mcpServer.builtin.enableWorkspace', localize('builtinMcpServerEnableForWorkspace', "Enable (Workspace)"), undefined, true, () => {
				mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.EnabledWorkspace);
			}));
		}
	} else {
		actions.push(new Action('mcpServer.builtin.disable', localize('builtinMcpServerDisable', "Disable"), undefined, true, () => {
			mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.DisabledProfile);
		}));
		if (!isEmptyWorkbench) {
			actions.push(new Action('mcpServer.builtin.disableWorkspace', localize('builtinMcpServerDisableForWorkspace', "Disable (Workspace)"), undefined, true, () => {
				mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.DisabledWorkspace);
			}));
		}
	}
	return actions;
}

/** Composes lifecycle, durable, session, and options actions for an agent-host-only row. */
export function getActiveSessionServerOptionsActions(commandService: ICommandService, agentHostCustomizations: IAgentHostCustomizationService, isEmptyWorkbench: boolean, sessionResource: URI, server: AgentHostMcpServer): IAction[] {
	const actions: IAction[] = [];

	const lifecycleAction = getActiveSessionServerLifecycleAction(server);
	if (lifecycleAction) {
		actions.push(lifecycleAction);
	}

	const durableActions = getAgentHostMcpServerEnablementActions(agentHostCustomizations, sessionResource, server, isEmptyWorkbench);
	if (durableActions.length > 0) {
		if (actions.length > 0) {
			actions.push(new Separator());
		}
		actions.push(...durableActions);
	}

	actions.push(getSessionEnablementAction(server));

	actions.push(new Separator());
	actions.push(new Action(
		'mcpServer.activeSession.options',
		localize('activeSessionMcpServerOptions', "Server Options"),
		undefined,
		true,
		async () => {
			await commandService.executeCommand(McpCommandIds.AgentHostServerOptions, sessionResource, server.id);
		}
	));

	return actions;
}

function shouldHideLocalActionForActiveSessionServer(action: IAction): boolean {
	return action instanceof StartServerAction
		|| action instanceof StopServerAction
		|| action instanceof RestartServerAction
		|| action instanceof ConfigureModelAccessAction
		|| action instanceof ShowSamplingRequestsAction;
}

function isLocalMcpServerEnablementAction(action: IAction): boolean {
	return action instanceof EnableMcpServerGloballyAction
		|| action instanceof EnableMcpServerForWorkspaceAction
		|| action instanceof DisableMcpServerGloballyAction
		|| action instanceof DisableMcpServerForWorkspaceAction;
}

function createBuiltinEntry(server: IMcpServer, activeSessionServer?: AgentHostMcpServer): IMcpBuiltinItemEntry {
	return {
		type: 'builtin-item',
		id: `builtin-${server.definition.id}`,
		label: server.definition.label,
		description: '',
		collectionId: server.collection.id,
		activeSessionServer,
		localServer: server,
	};
}

const MCP_GALLERY_ITEM_TEMPLATE_ID = 'mcpGalleryItem';

/** Adapts a gallery MCP server entry to the shared gallery row renderer. */
class McpGalleryItemProvider implements IGalleryItemProvider<IMcpServerItemEntry> {

	constructor(private readonly mcpWorkbenchService: IMcpWorkbenchService) { }

	getLabel(element: IMcpServerItemEntry): string {
		return element.server.label;
	}

	getPublisherDisplayName(element: IMcpServerItemEntry): string | undefined {
		return element.server.publisherDisplayName;
	}

	getDescription(element: IMcpServerItemEntry): string | undefined {
		return element.server.description;
	}

	getInstallState(element: IMcpServerItemEntry): GalleryItemInstallState {
		switch (element.server.installState) {
			case McpServerInstallState.Installed: return GalleryItemInstallState.Installed;
			case McpServerInstallState.Installing: return GalleryItemInstallState.Installing;
			default: return GalleryItemInstallState.Uninstalled;
		}
	}

	canInstall(element: IMcpServerItemEntry): boolean {
		return this.mcpWorkbenchService.canInstall(element.server) === true;
	}

	async install(element: IMcpServerItemEntry): Promise<void> {
		await this.mcpWorkbenchService.install(element.server);
	}

	onDidChangeInstallState(element: IMcpServerItemEntry, listener: () => void) {
		return this.mcpWorkbenchService.onChange(changed => {
			if (!changed || changed.id === element.server.id) {
				listener();
			}
		});
	}
}

/**
 * Widget that displays a list of MCP servers with marketplace browsing.
 */
export class McpListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidSelectServer = this._register(new Emitter<IWorkbenchMcpServer>());
	readonly onDidSelectServer = this._onDidSelectServer.event;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly _onDidRequestShowPlugin = this._register(new Emitter<IAgentPluginItem>());
	readonly onDidRequestShowPlugin = this._onDidRequestShowPlugin.event;

	private sectionTitleHeader!: HTMLElement;
	private sectionLink!: HTMLAnchorElement;
	private searchAndButtonContainer!: HTMLElement;
	private searchInput!: InputBox;
	private listContainer!: HTMLElement;
	private list!: WorkbenchList<IMcpListEntry>;
	private emptyContainer!: HTMLElement;
	private emptyText!: HTMLElement;
	private emptySubtext!: HTMLElement;
	private disabledContainer!: HTMLElement;
	private disabledIcon!: HTMLElement;
	private disabledMessage!: HTMLElement;
	private readonly disabledLinkListener = this._register(new MutableDisposable());
	private browseButton!: Button;
	private backButton!: Button;
	private addButton!: Button;

	private filteredServers: IWorkbenchMcpServer[] = [];
	private filteredBuiltinCount = 0;
	private filteredActiveSessionCount = 0;
	private displayEntries: IMcpListEntry[] = [];
	private galleryServers: IWorkbenchMcpServer[] = [];
	private searchQuery: string = '';
	private browseMode: boolean = false;
	private lastHeight: number = 0;
	private lastWidth: number = 0;
	private lastHeaderHeight = 0;
	private _layoutDeferred = false;
	private readonly collapsedGroups = new Set<string>();
	private galleryCts: CancellationTokenSource | undefined;
	private readonly delayedFilter = new Delayer<void>(200);
	private readonly delayedGallerySearch = new Delayer<void>(400);
	private _closeCustomizationEditor: () => Promise<void> = () => Promise.resolve();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpService private readonly mcpService: IMcpService,
		@IMcpRegistry private readonly mcpRegistry: IMcpRegistry,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
	) {
		super();
		this.element = $('.mcp-list-widget');
		this.create();
		this.updateAccessState();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpAccessConfig)) {
				this.updateAccessState();
			}
		}));
		this._register({
			dispose: () => {
				this.galleryCts?.dispose();
			}
		});
	}

	setCloseCustomizationEditor(closeCustomizationEditor: () => Promise<void>): void {
		this._closeCustomizationEditor = closeCustomizationEditor;
	}

	private create(): void {
		// Section title header (title + description with inline learn more) at the top.
		this.sectionTitleHeader = DOM.append(this.element, $('.section-title-header'));
		const titleRow = DOM.append(this.sectionTitleHeader, $('.section-title-row'));
		const sectionTitle = DOM.append(titleRow, $('h2.section-title'));
		sectionTitle.textContent = localize('mcpServers', "MCP Servers");
		const sectionTitleDescription = DOM.append(this.sectionTitleHeader, $('p.section-title-description'));
		const sectionTitleDescriptionText = DOM.append(sectionTitleDescription, $('span.section-title-description-text'));
		sectionTitleDescriptionText.textContent = localize('mcpServersDescription', "An open standard that lets AI use external tools and services. MCP servers provide tools for file operations, databases, APIs, and more.");
		// Real whitespace text node between description and link so the gap collapses
		// when the link wraps to a new line (a CSS margin-left would push it inward).
		sectionTitleDescription.appendChild(document.createTextNode(' '));
		this.sectionLink = DOM.append(sectionTitleDescription, $('a.section-title-link')) as HTMLAnchorElement;
		this.sectionLink.textContent = localize('learnMoreMcp', "Learn more about MCP servers");
		this.sectionLink.href = 'https://code.visualstudio.com/docs/agent-customization/mcp-servers?referrer=in-product';
		this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
			e.preventDefault();
			const href = this.sectionLink.href;
			if (href) {
				this.openerService.open(URI.parse(href));
			}
		}));

		// Re-layout when the header height changes so the list's allotted
		// height stays in sync with the actual on-screen header size. Only
		// relayout when the header height actually changed to avoid redundant
		// work on DPR changes or width-only resizes.
		const targetWindow = DOM.getWindow(this.element);
		const headerObserver = this._register(new DOM.DisposableResizeObserver(
			'McpListWidget.sectionTitleHeader',
			() => {
				if (this.lastWidth <= 0 || this.lastHeight <= 0) {
					return;
				}
				const headerHeight = this.sectionTitleHeader.offsetHeight;
				if (headerHeight === this.lastHeaderHeight) {
					return;
				}
				this.layout(this.lastHeight, this.lastWidth);
			},
			targetWindow,
		));
		this._register(headerObserver.observe(this.sectionTitleHeader));

		// Search and button container
		this.searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));

		// Search container
		const searchContainer = DOM.append(this.searchAndButtonContainer, $('.list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, this.contextViewService, {
			placeholder: localize('searchMcpPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		this._register(this.searchInput.onDidChange(() => {
			this.searchQuery = this.searchInput.value;
			if (this.browseMode) {
				this.delayedGallerySearch.trigger(() => this.queryGallery());
			} else {
				this.delayedFilter.trigger(() => this.filterServers());
			}
		}));

		// Button container (Browse Marketplace + Add Server)
		const buttonContainer = DOM.append(this.searchAndButtonContainer, $('.list-button-group'));

		// Back button (visible only in marketplace browse mode)
		const backButtonContainer = DOM.append(buttonContainer, $('.list-add-button-container'));
		this.backButton = this._register(new Button(backButtonContainer, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			title: localize('backToInstalled', "Back to installed servers"),
			ariaLabel: localize('backToInstalled', "Back to installed servers")
		}));
		this.backButton.label = `$(${Codicon.arrowLeft.id}) ${localize('mcpBrowseBack', "Back")}`;
		this.backButton.element.classList.add('list-add-button');
		backButtonContainer.style.display = 'none';
		this._register(this.backButton.onDidClick(() => {
			this.toggleBrowseMode(false);
		}));

		// Browse Marketplace button
		const browseButtonContainer = DOM.append(buttonContainer, $('.list-add-button-container'));
		this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		this.browseButton.label = `$(${Codicon.library.id}) ${localize('browseMarketplace', "Browse Marketplace")}`;
		this.browseButton.element.classList.add('list-add-button');
		this._register(this.browseButton.onDidClick(() => {
			this.toggleBrowseMode(!this.browseMode);
		}));

		this.addButton = this._register(new Button(buttonContainer, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			title: localize('addServer', "Add Server"),
			ariaLabel: localize('addServer', "Add Server")
		}));
		this.addButton.label = `$(${Codicon.add.id})`;
		this.addButton.element.classList.add('list-icon-button');
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.addButton.element, localize('addServerTooltip', "Add Server")));
		this._register(this.addButton.onDidClick(() => {
			this.commandService.executeCommand(McpCommandIds.AddConfiguration);
		}));

		// Empty state
		this.emptyContainer = DOM.append(this.element, $('.mcp-empty-state'));
		const emptyHeader = DOM.append(this.emptyContainer, $('.empty-state-header'));
		this.emptyText = DOM.append(emptyHeader, $('.empty-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-subtext'));

		// Disabled (access blocked) state — shown when chat.mcp.access is set to none,
		// either by user setting or by enterprise policy.
		this.disabledContainer = DOM.append(this.element, $('.mcp-disabled-state'));
		const disabledHeader = DOM.append(this.disabledContainer, $('.empty-state-header'));
		this.disabledIcon = DOM.append(disabledHeader, $('.empty-icon'));
		const disabledText = DOM.append(disabledHeader, $('.empty-text'));
		disabledText.textContent = localize('mcpAccessDisabledTitle', "MCP servers are disabled");
		this.disabledMessage = DOM.append(this.disabledContainer, $('.empty-subtext'));

		// List container
		this.listContainer = DOM.append(this.element, $('.mcp-list-container'));

		// Create list
		const delegate = new McpServerItemDelegate();
		const groupHeaderRenderer = new CustomizationGroupHeaderRenderer<IMcpGroupHeaderEntry>('mcpGroupHeader', this.hoverService);
		const localRenderer = this.instantiationService.createInstance(McpServerItemRenderer, () => this._closeCustomizationEditor());
		const galleryRenderer = new GalleryItemRenderer<IMcpServerItemEntry>(MCP_GALLERY_ITEM_TEMPLATE_ID, new McpGalleryItemProvider(this.mcpWorkbenchService));

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IMcpListEntry>,
			'McpManagementList',
			this.listContainer,
			delegate,
			[groupHeaderRenderer, localRenderer, galleryRenderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (element: IMcpListEntry) => {
						return getMcpEntryAriaLabel(element, this.workspaceService.isSessionsWindow);
					},
					getWidgetAriaLabel() {
						return localize('mcpServersListAriaLabel', "MCP Servers");
					}
				},
				openOnSingleClick: true,
				identityProvider: {
					getId(element: IMcpListEntry) {
						if (element.type === 'group-header') {
							return element.id;
						}
						if (element.type === 'builtin-item') {
							return element.id;
						}
						return element.server.id;
					}
				}
			}
		));

		this._register(this.list.onDidOpen(e => {
			if (e.element) {
				if (e.element.type === 'group-header') {
					this.toggleGroup(e.element);
				} else if (e.element.type === 'server-item') {
					// Marketplace entries are always selectable; installed rows only open
					// detail when there is something extra to show beyond the row.
					const server = e.element.server;
					const isGallery = e.element.marketplace || !server.local;
					if (isGallery || server.description) {
						this._onDidSelectServer.fire(server);
					}
				} else if (e.element.type === 'session-server-item') {
					this.openActiveSessionServerOptions(e.element.server);
				}
				// builtin-item: no action on click (read-only)
			}
		}));

		// Handle context menu
		this._register(this.list.onContextMenu(e => this.onContextMenu(e as IListContextMenuEvent<IMcpListEntry>)));

		// Listen to MCP service changes
		this._register(this.mcpWorkbenchService.onChange(() => {
			if (!this.browseMode) {
				this.refresh();
			}
		}));
		this._register(autorun(reader => {
			this.mcpService.servers.read(reader);
			if (!this.browseMode) {
				this.refresh();
			}
		}));
		this._register(autorun(reader => {
			this.customizationHarnessService.activeSessionResource.read(reader);
			if (!this.browseMode) {
				this.refresh();
			}
		}));
		this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => {
			if (!this.browseMode) {
				this.refresh();
			}
		}));

		// Initial refresh
		void this.refresh();
	}

	private async refresh(): Promise<void> {
		if (this.browseMode) {
			await this.queryGallery();
		} else {
			this.filterServers();
		}
	}

	private updateAccessState(): void {
		const inspect = this.configurationService.inspect<string>(mcpAccessConfig);
		const value = inspect.value ?? inspect.defaultValue;
		const disabled = value === McpAccessValue.None;
		const policyLocked = inspect.policyValue === McpAccessValue.None;

		this.element.classList.toggle('access-disabled', disabled);

		if (disabled) {
			this.disabledIcon.className = 'empty-icon';
			this.disabledIcon.classList.add(...ThemeIcon.asClassNameArray(policyLocked ? Codicon.shield : mcpServerIcon));

			DOM.clearNode(this.disabledMessage);
			this.disabledLinkListener.clear();
			if (policyLocked) {
				this.disabledMessage.textContent = localize('mcpAccessDisabledByPolicy', "Access to MCP servers is disabled by your organization. Contact your organization administrator for more information.");
			} else {
				this.disabledMessage.appendChild(document.createTextNode(localize('mcpAccessDisabledBySettingPrefix', "MCP servers are disabled in settings. ")));
				const link = DOM.append(this.disabledMessage, $('a.mcp-disabled-settings-link')) as HTMLAnchorElement;
				link.textContent = localize('mcpAccessDisabledSettingLink', "Configure in settings.");
				link.href = '#';
				link.setAttribute('role', 'button');
				this.disabledLinkListener.value = DOM.addDisposableListener(link, 'click', (e) => {
					e.preventDefault();
					this.commandService.executeCommand('workbench.action.openSettings', `@id:${mcpAccessConfig}`);
				});
			}
		}
	}

	public showBrowseMarketplace(): void {
		if (!this.browseMode) {
			this.toggleBrowseMode(true);
		}
	}

	private toggleBrowseMode(browse: boolean): void {
		this.browseMode = browse;
		this.searchInput.value = '';
		this.searchQuery = '';

		// Update UI for browse vs installed mode
		this.addButton.element.style.display = browse ? 'none' : '';
		this.browseButton.element.parentElement!.style.display = browse ? 'none' : '';
		this.backButton.element.parentElement!.style.display = browse ? '' : 'none';

		this.searchInput.setPlaceHolder(browse
			? localize('searchGalleryPlaceholder', "Search MCP marketplace...")
			: localize('searchMcpPlaceholder', "Type to search...")
		);

		if (browse) {
			void this.queryGallery();
		} else {
			this.galleryCts?.dispose(true);
			this.galleryServers = [];
			this.filterServers();
		}

		// Re-layout to account for the back link height change
		if (this.lastHeight > 0) {
			this.layout(this.lastHeight, this.lastWidth);
		}
	}

	private async queryGallery(): Promise<void> {
		this.galleryCts?.dispose(true);
		const cts = this.galleryCts = new CancellationTokenSource();

		// Show loading state
		this.emptyContainer.style.display = 'flex';
		this.listContainer.style.display = 'none';
		this.emptyText.textContent = localize('loadingGallery', "Loading marketplace...");
		this.emptySubtext.textContent = '';

		try {
			const pager = await this.mcpWorkbenchService.queryGallery(
				{ text: this.searchQuery.trim() || undefined },
				cts.token,
			);

			if (cts.token.isCancellationRequested) {
				return;
			}

			this.galleryServers = pager.firstPage.items;
			this.updateGalleryList();
		} catch {
			if (!cts.token.isCancellationRequested) {
				this.galleryServers = [];
				this.emptyContainer.style.display = 'flex';
				this.listContainer.style.display = 'none';
				this.emptyText.textContent = localize('galleryError', "Unable to load marketplace");
				this.emptySubtext.textContent = localize('tryAgainLater', "Check your connection and try again");
			}
		}
	}

	private updateGalleryList(): void {
		if (this.galleryServers.length === 0) {
			this.emptyContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';
			if (this.searchQuery.trim()) {
				this.emptyText.textContent = localize('noGalleryResults', "No servers match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				this.emptyText.textContent = localize('emptyGallery', "No MCP servers available");
				this.emptySubtext.textContent = '';
			}
		} else {
			this.emptyContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}

		const entries: IMcpListEntry[] = this.galleryServers.map(server => ({ type: 'server-item' as const, server, marketplace: true }));
		this.list.splice(0, this.list.length, entries);
	}

	private filterServers(): void {
		const query = this.searchQuery.toLowerCase().trim();
		const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
		const activeSessionMatcher = new ActiveSessionMcpServerMatcher(this.agentHostCustomizationService.getMcpServers(activeSessionResource));
		const localServerMatcher = new LocalMcpServerMatcher(this.mcpService.servers.get());

		if (query) {
			this.filteredServers = this.mcpWorkbenchService.local.filter(server =>
				server.label.toLowerCase().includes(query) ||
				(server.description?.toLowerCase().includes(query))
			);
		} else {
			this.filteredServers = [...this.mcpWorkbenchService.local];
		}

		// Find extension-provided servers not in the local list (e.g. GitHub MCP)
		const localIds = new Set(this.filteredServers.map(s => s.id));
		const builtinServers = this.mcpService.servers.get()
			.filter(s => !localIds.has(s.definition.id))
			.filter(s => !query || s.definition.label.toLowerCase().includes(query));

		const groups: { scope: LocalMcpServerScope; label: string; icon: ThemeIcon; description: string; entries: Array<IMcpServerItemEntry | IMcpSessionServerItemEntry> }[] = [
			{ scope: LocalMcpServerScope.Workspace, label: localize('workspaceGroup', "Workspace"), icon: workspaceIcon, description: localize('workspaceGroupDescription', "MCP servers configured in your workspace or reported by the active session."), entries: [] },
			{ scope: LocalMcpServerScope.User, label: localize('userGroup', "User"), icon: userIcon, description: localize('userGroupDescription', "MCP servers configured in your user settings. Private to you and available across all projects."), entries: [] },
		];

		for (const server of this.filteredServers) {
			const entry: IMcpServerItemEntry = {
				type: 'server-item',
				server,
				activeSessionServer: activeSessionMatcher.take(getWorkbenchServerMatchKeys(server)),
				localServer: localServerMatcher.find(getWorkbenchServerMatchKeys(server)),
			};
			const scope = server.local?.scope;
			if (scope === LocalMcpServerScope.Workspace) {
				groups[0].entries.push(entry);
			} else {
				// User, RemoteUser, or unknown → group under User
				groups[1].entries.push(entry);
			}
		}

		// Add plugin-provided, extension-provided, and built-in servers.
		// Servers from the Copilot extension (github.copilot / github.copilot-chat)
		// are treated as built-in; servers from other extensions go under "Extensions".
		const collectionSources = new Map(this.mcpRegistry.collections.get().map(c => [c.id, c.source]));
		const pluginServers: Array<{ server: IMcpServer; activeSessionServer?: AgentHostMcpServer }> = [];
		const extensionServers: Array<{ server: IMcpServer; activeSessionServer?: AgentHostMcpServer }> = [];
		const otherBuiltinServers: Array<{ server: IMcpServer; activeSessionServer?: AgentHostMcpServer }> = [];
		for (const server of builtinServers) {
			const entry = { server, activeSessionServer: activeSessionMatcher.take(getRuntimeServerMatchKeys(server)) };
			const source = collectionSources.get(server.collection.id);
			if (server.collection.id.startsWith(PLUGIN_COLLECTION_PREFIX)) {
				pluginServers.push(entry);
			} else if (source instanceof ExtensionIdentifier && !isCopilotExtension(source)) {
				extensionServers.push(entry);
			} else {
				otherBuiltinServers.push(entry);
			}
		}
		const activeSessionOnlyServers = activeSessionMatcher.unmatched(query);
		for (const server of activeSessionOnlyServers) {
			groups[0].entries.push({ type: 'session-server-item', server });
		}

		// Show empty state only when there are no servers at all (not when filtered to empty)
		if (this.filteredServers.length === 0 && builtinServers.length === 0 && activeSessionOnlyServers.length === 0) {
			this.emptyContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';

			if (this.searchQuery.trim()) {
				// Search with no results
				this.emptyText.textContent = localize('noMatchingServers', "No servers match '{0}'", this.searchQuery);
				this.emptySubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				// No servers configured
				this.emptyText.textContent = localize('noMcpServers', "No MCP servers configured");
				this.emptySubtext.textContent = localize('addMcpServer', "Add an MCP server configuration to get started");
			}
		} else {
			this.emptyContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}

		const entries: IMcpListEntry[] = [];
		let isFirst = true;
		for (const group of groups) {
			if (group.entries.length === 0) {
				continue;
			}
			const collapsed = this.collapsedGroups.has(group.scope);
			entries.push({
				type: 'group-header',
				id: `mcp-group-${group.scope}`,
				scope: group.scope,
				label: group.label,
				icon: group.icon,
				count: group.entries.length,
				isFirst,
				description: group.description,
				collapsed,
			});
			if (!collapsed) {
				entries.push(...group.entries);
			}
			isFirst = false;
		}

		if (pluginServers.length > 0) {
			const collapsed = this.collapsedGroups.has('plugin');
			entries.push({
				type: 'group-header',
				id: 'mcp-group-plugin',
				scope: 'plugin',
				label: localize('pluginGroup', "Plugins"),
				icon: pluginIcon,
				count: pluginServers.length,
				isFirst,
				description: localize('pluginGroupDescription', "MCP servers provided by installed plugins."),
				collapsed,
			});
			if (!collapsed) {
				for (const { server, activeSessionServer } of pluginServers) {
					entries.push(createBuiltinEntry(server, activeSessionServer));
				}
			}
			isFirst = false;
		}

		if (extensionServers.length > 0) {
			const collapsed = this.collapsedGroups.has('extension');
			entries.push({
				type: 'group-header',
				id: 'mcp-group-extension',
				scope: 'extension',
				label: localize('extensionGroup', "Extensions"),
				icon: extensionIcon,
				count: extensionServers.length,
				isFirst,
				description: localize('extensionGroupDescription', "MCP servers contributed by installed VS Code extensions."),
				collapsed,
			});
			if (!collapsed) {
				for (const { server, activeSessionServer } of extensionServers) {
					entries.push(createBuiltinEntry(server, activeSessionServer));
				}
			}
			isFirst = false;
		}

		if (otherBuiltinServers.length > 0) {
			const collapsed = this.collapsedGroups.has('builtin');
			entries.push({
				type: 'group-header',
				id: 'mcp-group-builtin',
				scope: 'builtin',
				label: localize('builtInGroup', "Built-in"),
				icon: builtinIcon,
				count: otherBuiltinServers.length,
				isFirst,
				description: localize('builtInGroupDescription', "MCP servers built into VS Code. These are available automatically."),
				collapsed,
			});
			if (!collapsed) {
				for (const { server, activeSessionServer } of otherBuiltinServers) {
					entries.push(createBuiltinEntry(server, activeSessionServer));
				}
			}
			isFirst = false;
		}

		this.displayEntries = entries;
		this.list.splice(0, this.list.length, this.displayEntries);

		// Compute sidebar badge directly from the data arrays (same source as group headers)
		this.filteredBuiltinCount = builtinServers.length;
		this.filteredActiveSessionCount = activeSessionOnlyServers.length;
		this._onDidChangeItemCount.fire(this.itemCount);
	}

	/**
	 * Gets the total item count from the underlying data arrays
	 * (the same source used to build group headers).
	 */
	get itemCount(): number {
		return this.filteredServers.length + this.filteredBuiltinCount + this.filteredActiveSessionCount;
	}

	/**
	 * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
	 * to ensure the subscriber receives the latest count.
	 */
	fireItemCount(): void {
		this._onDidChangeItemCount.fire(this.itemCount);
	}

	/**
	 * Toggles the collapsed state of a group.
	 */
	private toggleGroup(entry: IMcpGroupHeaderEntry): void {
		if (this.collapsedGroups.has(entry.scope)) {
			this.collapsedGroups.delete(entry.scope);
		} else {
			this.collapsedGroups.add(entry.scope);
		}
		this.filterServers();
	}

	/**
	 * Whether the widget is currently in marketplace browse mode.
	 */
	isInBrowseMode(): boolean {
		return this.browseMode;
	}

	/**
	 * Exits marketplace browse mode and returns to the installed servers list.
	 */
	exitBrowseMode(): void {
		if (this.browseMode) {
			this.toggleBrowseMode(false);
		}
	}

	/**
	 * Layouts the widget.
	 */
	layout(height: number, width: number): void {
		this.lastHeight = height;
		this.lastWidth = width;

		this.element.style.height = '';
		const availableHeight = this.element.clientHeight || height;
		const availableWidth = this.element.clientWidth || width;

		// Measure sibling elements to calculate the list height.
		// When offsetHeight returns 0 the container may have just become visible
		// after display:none and the browser hasn't reflowed yet — defer layout
		// once so measurements are accurate. Only retry once to avoid an endless
		// loop when the widget is created while permanently hidden.
		const searchBarHeight = this.searchAndButtonContainer.offsetHeight;
		if (searchBarHeight === 0 && !this._layoutDeferred) {
			this._layoutDeferred = true;
			DOM.getWindow(this.element).requestAnimationFrame(() => {
				try {
					this.layout(this.lastHeight, this.lastWidth);
				} finally {
					this._layoutDeferred = false;
				}
			});
			return;
		}
		const headerHeight = this.sectionTitleHeader.offsetHeight;
		this.lastHeaderHeight = headerHeight;
		const listHeight = Math.max(0, availableHeight - searchBarHeight - headerHeight);

		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight, availableWidth);
	}

	/**
	 * Focuses the search input.
	 */
	focusSearch(): void {
		this.searchInput.focus();
	}

	/**
	 * Scrolls the list so the last item is visible.
	 */
	revealLastItem(): void {
		if (this.list.length > 0) {
			this.list.reveal(this.list.length - 1);
		}
	}

	/**
	 * Focuses the list.
	 */
	focus(): void {
		this.list.domFocus();
		const servers = this.list.length;
		if (servers > 0) {
			this.list.setFocus([0]);
		}
	}

	private openActiveSessionServerOptions(server: AgentHostMcpServer): void {
		void this.commandService.executeCommand(McpCommandIds.AgentHostServerOptions, this.customizationHarnessService.activeSessionResource.get(), server.id);
	}

	/**
	 * Handles context menu for MCP server items.
	 */
	private onContextMenu(e: IListContextMenuEvent<IMcpListEntry>): void {
		if (!e.element) {
			return;
		}

		if (e.element.type === 'session-server-item') {
			const disposables = new DisposableStore();
			const isEmptyWorkbench = this.workspaceService.getActiveProjectRoot() === undefined;
			const activeSessionActions = getActiveSessionServerOptionsActions(this.commandService, this.agentHostCustomizationService, isEmptyWorkbench, this.customizationHarnessService.activeSessionResource.get(), e.element.server);
			activeSessionActions.forEach(action => isDisposable(action) && disposables.add(action));
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => activeSessionActions,
				onHide: () => disposables.dispose(),
			});
			return;
		}

		// Built-in rows use IMcpService for durable enablement and the agent host for session enablement.
		if (e.element.type === 'builtin-item') {
			const collectionId = e.element.collectionId;
			const pluginUriStr = getPluginUriFromCollectionId(collectionId);
			const plugin = pluginUriStr ? this.agentPluginService.plugins.get().find(p => p.uri.toString() === pluginUriStr) : undefined;

			const disposables = new DisposableStore();
			const actions: IAction[] = [];
			const lifecycleAction = e.element.activeSessionServer ? getActiveSessionServerLifecycleAction(e.element.activeSessionServer) : undefined;
			if (lifecycleAction) {
				actions.push(disposables.add(lifecycleAction));
			}

			if (e.element.localServer) {
				const isEmptyWorkbench = this.workspaceService.getActiveProjectRoot() === undefined;
				const enablementActions = getLocalMcpServerEnablementActions(this.mcpService, e.element.localServer.definition.id, isEmptyWorkbench);
				if (enablementActions.length > 0) {
					if (actions.length > 0) {
						actions.push(new Separator());
					}
					for (const enablementAction of enablementActions) {
						if (isDisposable(enablementAction)) {
							disposables.add(enablementAction);
						}
						actions.push(enablementAction);
					}
				}
			}

			if (e.element.activeSessionServer) {
				const sessionAction = getSessionEnablementAction(e.element.activeSessionServer);
				if (isDisposable(sessionAction)) {
					disposables.add(sessionAction);
				}
				actions.push(sessionAction);
			}

			if (plugin) {
				if (actions.length > 0) {
					actions.push(new Separator());
				}
				actions.push(disposables.add(new Action(
					'mcpServer.showPlugin',
					localize('showPlugin', "Show Plugin"),
					undefined,
					true,
					async () => {
						const item = {
							kind: AgentPluginItemKind.Installed as const,
							name: plugin.label,
							description: plugin.fromMarketplace?.description ?? '',
							marketplace: plugin.fromMarketplace?.marketplace,
							plugin,
						};
						this._onDidRequestShowPlugin.fire(item);
					}
				)));
				actions.push(disposables.add(new Action(
					'mcpServer.uninstallPlugin',
					localize('uninstallPlugin', "Uninstall Plugin"),
					undefined,
					true,
					async () => {
						const result = await this.dialogService.confirm({
							message: localize('confirmUninstallPluginMcp', "This MCP server is provided by the plugin '{0}'", plugin.label),
							detail: localize('confirmUninstallPluginMcpDetail', "Individual MCP servers from a plugin cannot be removed separately. Would you like to uninstall the entire plugin?"),
							primaryButton: localize('uninstallPluginBtn', "Uninstall Plugin"),
							type: 'question',
						});
						if (result.confirmed) {
							plugin.remove?.();
						}
					}
				)));
			}
			if (actions.length === 0) {
				disposables.dispose();
				return;
			}

			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions,
				onHide: () => disposables.dispose(),
			});
			return;
		}

		if (e.element.type !== 'server-item') {
			return;
		}

		const serverEntry = e.element;
		const disposables = new DisposableStore();
		const mcpServer = this.mcpWorkbenchService.local.find(local => local.id === serverEntry.server.id) || serverEntry.server;

		// Local server actions already include durable profile/workspace enablement.
		const groups: IAction[][] = getContextMenuActions(mcpServer, false, this.instantiationService);
		const actions: IAction[] = [];
		const activeSessionLifecycleAction = serverEntry.activeSessionServer ? getActiveSessionServerLifecycleAction(serverEntry.activeSessionServer) : undefined;
		const activeSessionEnablementAction = serverEntry.activeSessionServer ? getSessionEnablementAction(serverEntry.activeSessionServer) : undefined;
		let sessionEnablementAdded = false;
		if (activeSessionLifecycleAction) {
			actions.push(disposables.add(activeSessionLifecycleAction));
			actions.push(new Separator());
		}
		if (activeSessionEnablementAction && isDisposable(activeSessionEnablementAction)) {
			disposables.add(activeSessionEnablementAction);
		}
		for (const menuActions of groups) {
			for (const menuAction of menuActions) {
				if (isDisposable(menuAction)) {
					disposables.add(menuAction);
				}
			}
			const visibleMenuActions = serverEntry.activeSessionServer
				? menuActions.filter(action => !shouldHideLocalActionForActiveSessionServer(action))
				: menuActions;
			for (const menuAction of visibleMenuActions) {
				actions.push(menuAction);
			}
			if (activeSessionEnablementAction && menuActions.some(isLocalMcpServerEnablementAction)) {
				actions.push(activeSessionEnablementAction);
				sessionEnablementAdded = true;
			}
			if (visibleMenuActions.length > 0) {
				actions.push(new Separator());
			}
		}
		if (activeSessionEnablementAction && !sessionEnablementAdded) {
			actions.push(activeSessionEnablementAction);
		}
		// Remove trailing separator
		if (actions.length > 0 && actions[actions.length - 1] instanceof Separator) {
			actions.pop();
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose()
		});
	}
}
