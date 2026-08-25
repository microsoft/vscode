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
import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultInputBoxStyles, getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpConnectionState, McpServerInstallState, IMcpService, IMcpServer } from '../../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../../../mcp/common/discovery/pluginMcpDiscovery.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ContributionEnablementState, isContributionDisabled, isContributionEnabled } from '../../common/enablement.js';
import { McpCommandIds } from '../../../../contrib/mcp/common/mcpCommandIds.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox, MessageType } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { ConfigureModelAccessAction, DisableMcpServerForWorkspaceAction, DisableMcpServerGloballyAction, EnableMcpServerForWorkspaceAction, EnableMcpServerGloballyAction, getContextMenuActions, RestartServerAction, ShowSamplingRequestsAction, StartServerAction, StopServerAction } from '../../../../contrib/mcp/browser/mcpServerActions.js';
import { LocalMcpServerScope } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { mcpServerIcon } from './aiCustomizationIcons.js';
import { formatDisplayName, truncateToFirstLine } from './aiCustomizationListWidget.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { getCustomizationDisabledLabel, ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { CustomizationEnablementKind, McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { getCustomizationScopeEnablement, type CustomizationDisabledReason } from '../../../../../platform/agentHost/common/customizationEnablement.js';
import { createAgentHostEnablePluginAction } from '../agentPluginActions.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';

const $ = DOM.$;

const PLUGIN_COLLECTION_PREFIX = MCP_PLUGIN_COLLECTION_ID_PREFIX;

const COPILOT_EXTENSION_IDS = ['github.copilot', 'github.copilot-chat'];

function isCopilotExtension(id: ExtensionIdentifier): boolean {
	return COPILOT_EXTENSION_IDS.some(copilotId => ExtensionIdentifier.equals(id, copilotId));
}

function getPluginUriFromCollectionId(collectionId: string | undefined): string | undefined {
	return collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX) ? collectionId.slice(PLUGIN_COLLECTION_PREFIX.length) : undefined;
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

export function createBuiltinActiveSessionMcpEntries(servers: readonly AgentHostMcpServer[]): readonly IMcpSessionServerItemEntry[] {
	return servers.map(server => ({ type: 'session-server-item', server }));
}

export function isMcpServerCollectionVisible(collectionId: string, hiddenCollectionIds: readonly string[] | undefined): boolean {
	return !hiddenCollectionIds?.includes(collectionId);
}

type IMcpInstalledEntry = IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry;

interface IMcpInstalledPresentation {
	readonly entry: IMcpInstalledEntry;
}

export type McpStatusKind = McpConnectionState.Kind | McpServerStatus | 'disabled';

export function getToggledMcpEnablementState(state: ContributionEnablementState): ContributionEnablementState {
	switch (state) {
		case ContributionEnablementState.EnabledWorkspace:
			return ContributionEnablementState.DisabledWorkspace;
		case ContributionEnablementState.DisabledWorkspace:
			return ContributionEnablementState.EnabledWorkspace;
		case ContributionEnablementState.EnabledProfile:
			return ContributionEnablementState.DisabledProfile;
		case ContributionEnablementState.DisabledProfile:
			return ContributionEnablementState.EnabledProfile;
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
	/** Which row the actions currently belong to, so a recycled template cannot reuse another row's. */
	renderedRowKey?: string;
	/** What the actions currently show, so an unchanged status does not rebuild them. */
	renderedStatusSignature?: string;
}

/**
 * Renderer for local MCP server list items.
 */
/**
 * Renderer for local MCP server list items.
 *
 * Exported for testing: the guard that keeps a row's actions alive across no-op updates is only
 * observable by driving the renderer itself.
 */
export class McpServerItemRenderer implements IListRenderer<IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, IMcpServerItemTemplateData> {
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
		// Tearing down the actions is what makes a click land on a node that is about to be
		// replaced, so only do it when this template starts showing a different row. Whether the
		// same row's actions need rebuilding is decided by `updateStatus` from its own signature.
		const rowKey = getMcpRowKey(element);
		if (templateData.renderedRowKey !== rowKey) {
			templateData.renderedRowKey = rowKey;
			templateData.renderedStatusSignature = undefined;
			templateData.actionDisposables.clear();
			DOM.clearNode(templateData.actions);
		}
		// Always re-created: these capture `element`, which is a fresh object on every refresh.
		templateData.elementDisposables.clear();

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

		if (element.activeSessionServer !== undefined) {
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
		let localDisabled = false;
		const update = () => {
			const activeSessionServer = element.activeSessionServer === undefined
				? undefined
				: this.agentHostCustomizationService.getMcpServers(this.customizationHarnessService.activeSessionResource.get()).find(server => server.id === element.activeSessionServer?.id) ?? element.activeSessionServer;
			if (activeSessionServer !== undefined) {
				const presentation = getActiveSessionServerPresentation(activeSessionServer);
				templateData.container.classList.toggle('disabled', !presentation.enabled);
				this.updateStatus(templateData, element, presentation.status, presentation.enabled ? undefined : activeSessionServer.disabledReason);
				return;
			}
			templateData.container.classList.toggle('disabled', localDisabled);
			this.updateStatus(templateData, element, localDisabled ? 'disabled' : undefined);
		};
		templateData.elementDisposables.add(autorun(reader => {
			localDisabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
			update();
		}));
		templateData.elementDisposables.add(this.agentHostCustomizationService.onDidChangeCustomizations(update));
	}

	private updateActiveSessionStatus(templateData: IMcpServerItemTemplateData, element: IMcpSessionServerItemEntry): void {
		const update = () => {
			const server = this.agentHostCustomizationService.getMcpServers(this.customizationHarnessService.activeSessionResource.get()).find(server => server.id === element.server.id);
			const presentation = server && getActiveSessionServerPresentation(server);
			templateData.container.classList.toggle('disabled', presentation?.enabled === false);
			this.updateStatus(templateData, element, presentation?.status, server?.disabledReason);
		};
		update();
		templateData.elementDisposables.add(this.agentHostCustomizationService.onDidChangeCustomizations(update));
	}

	private updateStatus(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, state: McpStatusKind | undefined, disabledReason?: CustomizationDisabledReason): void {
		const presentation = getMcpStatusPresentation(state, disabledReason);
		const activeSessionServer = getActiveSessionServer(element);
		const label = getMcpEntryLabel(element);
		const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
		const localServer = element.type === 'session-server-item' ? undefined : element.localServer;

		// This runs from an autorun over the server's connection state, and an erroring server
		// re-runs it about twice a second with byte-identical content. Rebuilding regardless meant
		// a node replaced between mousedown and mouseup never saw the click, so `Show Output` did
		// nothing on precisely the rows that needed it.
		const signature = getMcpStatusRenderSignature({
			rowKey: getMcpRowKey(element),
			label,
			state,
			statusLabel: presentation?.label,
			statusClassName: presentation?.className,
			statusIconId: presentation?.icon?.id,
			activeSessionServerId: activeSessionServer?.id,
			logOutputChannelId: activeSessionServer?.logOutputChannelId,
			localServerId: localServer?.definition.id,
			activeSessionResource: activeSessionResource.toString(),
		});
		if (templateData.renderedStatusSignature === signature) {
			return;
		}
		templateData.renderedStatusSignature = signature;

		templateData.actionDisposables.clear();
		DOM.clearNode(templateData.actions);

		if (!presentation) {
			return;
		}

		const showActiveSessionOutput = activeSessionServer !== undefined
			? (beforeShow?: () => Promise<void>) => this.agentHostCustomizationService.showMcpServerLog(activeSessionResource, activeSessionServer.id, beforeShow)
			: undefined;
		if (state === McpServerStatus.AuthRequired && activeSessionServer !== undefined) {
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
			? getMcpServerOutputHandler(this.outputService, localServer, activeSessionServer, this._afterShowOutput, showActiveSessionOutput)
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

export interface IMcpStatusPresentation {
	readonly label: string;
	readonly className: string;
	readonly icon?: ThemeIcon;
}

export function getMcpStatusPresentation(state: McpStatusKind | undefined, disabledReason?: CustomizationDisabledReason): IMcpStatusPresentation | undefined {
	if (state === undefined) {
		return undefined;
	}
	if (state === 'disabled') {
		return { label: getCustomizationDisabledLabel(disabledReason), className: 'disabled', icon: Codicon.circleSlash };
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

/**
 * Which row a template is currently showing. List entries are recreated on every refresh, so
 * object identity says nothing about whether this is still the same server in the same place.
 */
function getMcpRowKey(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): string {
	switch (entry.type) {
		case 'server-item':
			return `server:${entry.server.id}:${entry.marketplace ? 1 : 0}`;
		case 'session-server-item':
			return `session:${entry.server.id}`;
		case 'builtin-item':
			return `builtin:${entry.id}`;
	}
}

/** Everything the status actions of a row are built from: what they show, and what they act on. */
export interface IMcpStatusRenderInput {
	/** Identifies the row, so a recycled template never mistakes one server's actions for another's. */
	readonly rowKey: string;
	/** The server's name, which appears in the button titles and aria labels. */
	readonly label: string;
	/** Decides which actions exist at all: sign-in when auth is required, output on error. */
	readonly state: McpStatusKind | undefined;
	readonly statusLabel: string | undefined;
	readonly statusClassName: string | undefined;
	readonly statusIconId: string | undefined;
	/** The active-session twin the sign-in and output actions are bound to. */
	readonly activeSessionServerId: string | undefined;
	readonly logOutputChannelId: string | undefined;
	/** The local server the output action falls back to. */
	readonly localServerId: string | undefined;
	/** Captured when the output action is built, so switching sessions has to rebuild it. */
	readonly activeSessionResource: string | undefined;
}

/**
 * Reduces a row's status actions to a comparable value, so they are rebuilt only when they would
 * actually differ. Rebuilding replaces the button nodes, and a node replaced between mousedown and
 * mouseup never receives the click.
 *
 * Must cover every value the actions are built from -- what they render and what they act on --
 * or a change that matters is dropped. The tests enforce completeness at compile time.
 */
export function getMcpStatusRenderSignature(input: IMcpStatusRenderInput): string {
	return JSON.stringify([
		input.rowKey,
		input.label,
		input.state ?? null,
		input.statusLabel ?? null,
		input.statusClassName ?? null,
		input.statusIconId ?? null,
		input.activeSessionServerId ?? null,
		input.logOutputChannelId ?? null,
		input.localServerId ?? null,
		input.activeSessionResource ?? null,
	]);
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
		return getActiveSessionServerPresentation(entry.server).status;
	}
	if (entry.activeSessionServer !== undefined) {
		return getActiveSessionServerPresentation(entry.activeSessionServer).status;
	}
	if (entry.localServer && isContributionDisabled(entry.localServer.enablement.get())) {
		return 'disabled';
	}
	if (entry.type === 'server-item' && !isSessionsWindow) {
		return entry.localServer?.connectionState.get().state;
	}
	return undefined;
}

function getMcpEntryAriaLabel(element: IMcpInstalledEntry, isSessionsWindow: boolean): string {
	const label = getMcpEntryLabel(element);
	const statusKind = getMcpStatusKind(element, isSessionsWindow);
	const disabledReason = statusKind === 'disabled' ? getMcpDisabledReason(element) : undefined;
	const status = getMcpStatusPresentation(statusKind, disabledReason);
	return status
		? localize('mcpServerAriaLabelWithStatus', "{0}, {1}", label, status.label)
		: label;
}

function getMcpDisabledReason(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): CustomizationDisabledReason | undefined {
	if (entry.type === 'session-server-item') {
		return entry.server.disabledReason;
	}
	if (entry.activeSessionServer !== undefined) {
		return entry.activeSessionServer.disabledReason;
	}
	return undefined;
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

export function getActiveSessionServerPresentation(server: AgentHostMcpServer): { readonly enabled: boolean; readonly status: McpStatusKind } {
	return {
		enabled: server.enabled,
		status: server.enabled ? server.status : 'disabled',
	};
}

export function getActiveSessionServerLifecycleAction(server: AgentHostMcpServer): Action | undefined {
	if (!getActiveSessionServerPresentation(server).enabled) {
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

type AgentHostMcpServerEnablementScope = 'global' | 'workspace' | 'session';

const agentHostMcpServerEnablementActionInfo = {
	global: {
		kind: CustomizationEnablementKind.Global,
		enableLabel: () => localize('agentHostMcpServerEnable', "Enable"),
		disableLabel: () => localize('agentHostMcpServerDisable', "Disable"),
	},
	workspace: {
		kind: CustomizationEnablementKind.Workspace,
		enableLabel: () => localize('agentHostMcpServerEnableWorkspace', "Enable (Workspace)"),
		disableLabel: () => localize('agentHostMcpServerDisableWorkspace', "Disable (Workspace)"),
	},
	session: {
		kind: CustomizationEnablementKind.Session,
		enableLabel: () => localize('agentHostMcpServerEnableSession', "Enable (Session)"),
		disableLabel: () => localize('agentHostMcpServerDisableSession', "Disable (Session)"),
	},
} satisfies Record<AgentHostMcpServerEnablementScope, {
	readonly kind: CustomizationEnablementKind;
	readonly enableLabel: () => string;
	readonly disableLabel: () => string;
}>;

/** Creates enablement actions for an agent-host server. */
export function getAgentHostMcpServerEnablementActions(agentHostCustomizations: IAgentHostCustomizationService, agentPluginService: IAgentPluginService, sessionResource: URI, server: AgentHostMcpServer, scopes: readonly AgentHostMcpServerEnablementScope[] = ['global', 'workspace', 'session']): IAction[] {
	if (server.disabledReason?.source === 'plugin') {
		const decision = server.disabledReason.plugin.enablement?.[0];
		if (!decision) {
			return [];
		}
		const action = createAgentHostEnablePluginAction(agentHostCustomizations, agentPluginService, sessionResource, server.disabledReason.plugin, decision.kind);
		return [new Action(action.id, action.label, undefined, true, action.run)];
	}
	const enablement = getCustomizationScopeEnablement(server);
	const actions: IAction[] = [];
	if (scopes.includes('global')) {
		actions.push(createAgentHostMcpServerEnablementAction(agentHostCustomizations, sessionResource, server, !enablement.global, 'global'));
	}
	if (scopes.includes('workspace') && agentHostCustomizations.getWorkingDirectories(sessionResource).length > 0) {
		actions.push(createAgentHostMcpServerEnablementAction(agentHostCustomizations, sessionResource, server, !enablement.workspace, 'workspace'));
	}
	if (scopes.includes('session')) {
		actions.push(createAgentHostMcpServerEnablementAction(agentHostCustomizations, sessionResource, server, !enablement.session, 'session'));
	}
	return actions;
}

function createAgentHostMcpServerEnablementAction(agentHostCustomizations: IAgentHostCustomizationService, sessionResource: URI, server: AgentHostMcpServer, enabled: boolean, scope: AgentHostMcpServerEnablementScope): IAction {
	const actionInfo = agentHostMcpServerEnablementActionInfo[scope];
	return new Action(
		`mcpServer.agentHost.${enabled ? 'enable' : 'disable'}.${scope}`,
		enabled ? actionInfo.enableLabel() : actionInfo.disableLabel(),
		undefined,
		true,
		() => agentHostCustomizations.setCustomizationEnablement(sessionResource, server.id, server.enablement, actionInfo.kind, enabled),
	);
}

/** Creates durable profile/workspace actions for a locally backed built-in server row. */
export function getLocalMcpServerEnablementActions(mcpService: IMcpService, serverId: string, isEmptyWorkbench: boolean, options: { readonly includeWorkspace?: boolean; readonly activeSessionServer?: AgentHostMcpServer } = {}): IAction[] {
	const includeWorkspace = options.includeWorkspace ?? true;
	const disabled = options.activeSessionServer
		? !getActiveSessionServerPresentation(options.activeSessionServer).enabled
		: isContributionDisabled(mcpService.enablementModel.readEnabled(serverId));
	const actions: IAction[] = [];
	if (disabled) {
		actions.push(new Action('mcpServer.builtin.enable', localize('builtinMcpServerEnable', "Enable"), undefined, true, () => {
			mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.EnabledProfile);
		}));
		if (includeWorkspace && !isEmptyWorkbench) {
			actions.push(new Action('mcpServer.builtin.enableWorkspace', localize('builtinMcpServerEnableForWorkspace', "Enable (Workspace)"), undefined, true, () => {
				mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.EnabledWorkspace);
			}));
		}
	} else {
		actions.push(new Action('mcpServer.builtin.disable', localize('builtinMcpServerDisable', "Disable"), undefined, true, () => {
			mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.DisabledProfile);
		}));
		if (includeWorkspace && !isEmptyWorkbench) {
			actions.push(new Action('mcpServer.builtin.disableWorkspace', localize('builtinMcpServerDisableForWorkspace', "Disable (Workspace)"), undefined, true, () => {
				mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.DisabledWorkspace);
			}));
		}
	}
	return actions;
}

/** Creates enablement actions for a built-in row, using the active agent-host session for scoped actions. */
export function getBuiltinMcpServerEnablementActions(mcpService: IMcpService, serverId: string, isEmptyWorkbench: boolean, agentHostCustomizations: IAgentHostCustomizationService, agentPluginService: IAgentPluginService, sessionResource: URI, activeSessionServer: AgentHostMcpServer | undefined): IAction[] {
	if (activeSessionServer === undefined) {
		return getLocalMcpServerEnablementActions(mcpService, serverId, isEmptyWorkbench);
	}
	if (activeSessionServer.isPluginProvided && !activeSessionServer.isClientBundled) {
		return getAgentHostMcpServerEnablementActions(agentHostCustomizations, agentPluginService, sessionResource, activeSessionServer);
	}
	return [
		...getLocalMcpServerEnablementActions(mcpService, serverId, isEmptyWorkbench, { includeWorkspace: false, activeSessionServer }),
		...getAgentHostMcpServerEnablementActions(agentHostCustomizations, agentPluginService, sessionResource, activeSessionServer, ['workspace', 'session']),
	];
}

/** Composes lifecycle, scoped enablement, and options actions for an agent-host-only row. */
export function getActiveSessionServerOptionsActions(commandService: ICommandService, agentHostCustomizations: IAgentHostCustomizationService, agentPluginService: IAgentPluginService, sessionResource: URI, server: AgentHostMcpServer): IAction[] {
	const actions: IAction[] = [];

	const lifecycleAction = getActiveSessionServerLifecycleAction(server);
	if (lifecycleAction) {
		actions.push(lifecycleAction);
	}

	const durableActions = getAgentHostMcpServerEnablementActions(agentHostCustomizations, agentPluginService, sessionResource, server);
	if (durableActions.length > 0) {
		if (actions.length > 0) {
			actions.push(new Separator());
		}
		actions.push(...durableActions);
	}

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
		|| action instanceof ShowSamplingRequestsAction
		|| isLocalMcpServerWorkspaceEnablementAction(action);
}

function isLocalMcpServerEnablementAction(action: IAction): boolean {
	return action.id === EnableMcpServerGloballyAction.ID
		|| action.id === EnableMcpServerForWorkspaceAction.ID
		|| action.id === DisableMcpServerGloballyAction.ID
		|| action.id === DisableMcpServerForWorkspaceAction.ID;
}

function isLocalMcpServerWorkspaceEnablementAction(action: IAction): boolean {
	return action.id === EnableMcpServerForWorkspaceAction.ID
		|| action.id === DisableMcpServerForWorkspaceAction.ID;
}

export function getServerItemContextMenuActions(menuActionGroups: readonly (readonly IAction[])[], activeSessionServer: AgentHostMcpServer | undefined, activeSessionLifecycleAction: IAction | undefined, agentHostEnablementActions: readonly IAction[]): IAction[] {
	const actions: IAction[] = [];
	const hasActiveSession = activeSessionServer !== undefined;
	let agentHostEnablementAdded = false;
	if (activeSessionLifecycleAction) {
		actions.push(activeSessionLifecycleAction, new Separator());
	}
	for (const menuActions of menuActionGroups) {
		const visibleMenuActions = hasActiveSession
			? menuActions.filter(action => !shouldHideLocalActionForActiveSessionServer(action))
			: menuActions;
		actions.push(...visibleMenuActions);
		if (hasActiveSession && menuActions.some(isLocalMcpServerEnablementAction)) {
			actions.push(...agentHostEnablementActions);
			agentHostEnablementAdded = true;
		}
		if (visibleMenuActions.length > 0) {
			actions.push(new Separator());
		}
	}
	if (hasActiveSession && !agentHostEnablementAdded) {
		actions.push(...agentHostEnablementActions);
	}
	if (actions[actions.length - 1] instanceof Separator) {
		actions.pop();
	}
	return actions;
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
	private cardContainer!: HTMLElement;
	private emptyContainer!: HTMLElement;
	private emptyText!: HTMLElement;
	private emptySubtext!: HTMLElement;
	private disabledContainer!: HTMLElement;
	private disabledIcon!: HTMLElement;
	private disabledMessage!: HTMLElement;
	private readonly disabledLinkListener = this._register(new MutableDisposable());
	private installedAddButton!: Button | undefined;

	private filteredServers: IWorkbenchMcpServer[] = [];
	private filteredBuiltinCount = 0;
	private filteredActiveSessionCount = 0;
	private installedEntries: IMcpInstalledPresentation[] = [];
	private gallerySnapshotServers: IWorkbenchMcpServer[] = [];
	private galleryServers: IWorkbenchMcpServer[] = [];
	private searchQuery: string = '';
	private gallerySnapshotFailed = false;
	private gallerySnapshotLoading = false;
	private gallerySearchLoading = false;
	private firstCardFocusElement: HTMLElement | undefined;
	private cardScrollElement: HTMLElement | undefined;
	private availableSection: HTMLElement | undefined;
	private narrowLayout = false;
	private wideLayout = false;
	private lastHeight: number = 0;
	private lastWidth: number = 0;
	private lastHeaderHeight = 0;
	private _layoutDeferred = false;
	private galleryCts: CancellationTokenSource | undefined;
	private readonly cardDisposables = this._register(new DisposableStore());
	private readonly delayedFilter = new Delayer<void>(200);
	private readonly delayedGallerySearch = new Delayer<void>(400);

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpService private readonly mcpService: IMcpService,
		@IMcpRegistry private readonly mcpRegistry: IMcpRegistry,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element = $('.mcp-list-widget.plugin-list-widget');
		this.create();
		const resizeObserver = this._register(new DOM.DisposableResizeObserver(
			'McpListWidget',
			() => this.updateResponsiveLayout(this.element.offsetWidth),
			DOM.getWindow(this.element),
		));
		this._register(resizeObserver.observe(this.element));
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
			this.galleryCts?.dispose(true);
			this.searchInput.hideMessage();
			const query = this.searchQuery.toLowerCase().trim();
			this.galleryServers = query
				? this.gallerySnapshotServers.filter(server => this.matchesGalleryServerQuery(server, query))
				: [...this.gallerySnapshotServers];
			this.delayedFilter.trigger(() => this.filterServers());
			if (query) {
				this.gallerySearchLoading = true;
				this.delayedGallerySearch.trigger(() => this.queryMcpSearch());
			} else {
				this.gallerySearchLoading = false;
				this.delayedGallerySearch.cancel();
				if (this.gallerySnapshotServers.length === 0) {
					this.delayedGallerySearch.trigger(() => this.queryGallerySnapshot());
				}
			}
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

		this.cardContainer = DOM.append(this.element, $('.plugin-card-container'));
		this.cardContainer.style.display = 'none';

		// Listen to MCP service changes
		this._register(this.mcpWorkbenchService.onChange(() => {
			this.refresh();
		}));
		this._register(autorun(reader => {
			const servers = this.mcpService.servers.read(reader);
			for (const server of servers) {
				server.enablement.read(reader);
				server.connectionState.read(reader);
			}
			this.refresh();
		}));
		this._register(autorun(reader => {
			this.customizationHarnessService.activeSessionResource.read(reader);
			this.refresh();
		}));
		this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => {
			this.refresh();
		}));

		// Initial refresh
		void this.refresh();
	}

	private async refresh(): Promise<void> {
		this.filterServers();
		if (!this.searchQuery.trim() && this.gallerySnapshotServers.length === 0 && !this.gallerySnapshotFailed && !this.gallerySnapshotLoading) {
			await this.queryGallerySnapshot();
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
		this.searchInput.value = '';
		this.searchQuery = '';
		void this.queryGallerySnapshot(true);
	}

	private async queryGallerySnapshot(revealMarketplace = false): Promise<void> {
		this.galleryCts?.dispose(true);
		const cts = this.galleryCts = new CancellationTokenSource();
		this.gallerySnapshotLoading = true;

		try {
			const pager = await this.mcpWorkbenchService.queryGallery(undefined, cts.token);
			if (cts.token.isCancellationRequested || this.searchQuery.trim()) {
				return;
			}

			this.gallerySnapshotServers = pager.firstPage.items;
			this.galleryServers = [...this.gallerySnapshotServers];
			this.gallerySnapshotFailed = false;
			this.gallerySnapshotLoading = false;
			this.renderMcpHome();
			if (revealMarketplace) {
				this.availableSection?.scrollIntoView({ block: 'start' });
			}
		} catch {
			if (!cts.token.isCancellationRequested) {
				this.gallerySnapshotServers = [];
				this.galleryServers = [];
				this.gallerySnapshotFailed = true;
				this.gallerySnapshotLoading = false;
				this.renderMcpHome();
			}
		} finally {
			if (this.galleryCts === cts) {
				this.gallerySnapshotLoading = false;
			}
		}
	}

	private async queryMcpSearch(): Promise<void> {
		const query = this.searchQuery.trim();
		if (!query) {
			return;
		}

		this.galleryCts?.dispose(true);
		const cts = this.galleryCts = new CancellationTokenSource();
		this.gallerySearchLoading = true;
		try {
			const pager = await this.mcpWorkbenchService.queryGallery({ text: query }, cts.token);
			if (cts.token.isCancellationRequested || this.searchQuery.trim() !== query) {
				return;
			}
			this.galleryServers = pager.firstPage.items;
			this.searchInput.hideMessage();
		} catch {
			if (!cts.token.isCancellationRequested) {
				this.galleryServers = this.gallerySnapshotServers.filter(server => this.matchesGalleryServerQuery(server, query.toLowerCase()));
				this.searchInput.showMessage({
					content: localize('mcpSearchMarketplaceUnavailable', "Marketplace results are unavailable. Showing installed MCP servers only."),
					type: MessageType.WARNING,
				});
			}
		} finally {
			if (this.galleryCts === cts) {
				this.gallerySearchLoading = false;
				this.filterServers();
			}
		}
	}

	private showCardSurface(): void {
		this.emptyContainer.style.display = 'none';
		this.cardContainer.style.display = '';
	}

	private showEmptySurface(message: string, detail: string): void {
		this.cardContainer.style.display = 'none';
		this.emptyContainer.style.display = 'flex';
		this.emptyText.textContent = message;
		this.emptySubtext.textContent = detail;
	}

	private addSurfaceActivation(surface: HTMLElement, label: string, callback: () => void): void {
		surface.tabIndex = 0;
		surface.setAttribute('role', 'button');
		surface.setAttribute('aria-label', label);
		this.firstCardFocusElement ??= surface;
		this.cardDisposables.add(DOM.addDisposableListener(surface, 'click', () => callback()));
		this.cardDisposables.add(DOM.addDisposableListener(surface, 'keydown', e => {
			if (e.target === surface && (e.key === 'Enter' || e.key === ' ')) {
				e.preventDefault();
				callback();
			}
		}));
	}

	private isolateSurfaceActions(actions: HTMLElement): void {
		this.cardDisposables.add(DOM.addDisposableListener(actions, 'click', e => e.stopPropagation()));
	}

	private renderCardSection(parent: HTMLElement, title: string, description: string | undefined, className: string, count?: number, renderActions?: (header: HTMLElement) => void): HTMLElement {
		const section = DOM.append(parent, $('.plugin-card-section'));
		section.classList.add(className);
		const header = DOM.append(section, $('.plugin-card-section-header'));
		const text = DOM.append(header, $('.plugin-card-section-text'));
		const headingRow = DOM.append(text, $('.plugin-card-section-heading-row'));
		const heading = DOM.append(headingRow, $('h3.plugin-card-section-title'));
		heading.textContent = title;
		if (count !== undefined) {
			const countElement = DOM.append(headingRow, $('.plugin-card-section-count'));
			countElement.textContent = String(count);
		}
		if (description) {
			const descriptionElement = DOM.append(text, $('.plugin-card-section-description'));
			descriptionElement.textContent = description;
		}
		renderActions?.(header);
		return DOM.append(section, $('.plugin-card-grid'));
	}

	private renderMcpHome(): void {
		if (this.searchQuery.trim()) {
			return;
		}

		this.cardDisposables.clear();
		this.installedAddButton = undefined;
		this.firstCardFocusElement = undefined;
		this.availableSection = undefined;
		DOM.clearNode(this.cardContainer);
		this.showCardSurface();

		const content = this.cardScrollElement = DOM.append(this.cardContainer, $('.plugin-card-scroll'));
		this.renderFeaturedServers(content);

		const installedList = this.renderCardSection(
			content,
			localize('installedMcpServersSection', "Installed"),
			undefined,
			'installed-mcp-servers-section',
			this.installedEntries.length,
			header => this.renderInstalledSectionActions(header),
		);
		installedList.classList.add('plugin-inventory-list');
		if (this.installedEntries.length === 0) {
			const empty = DOM.append(installedList, $('.plugin-inventory-empty'));
			empty.textContent = localize('noInstalledMcpServers', "No MCP servers are installed.");
		} else {
			for (const presentation of this.installedEntries) {
				this.appendInstalledServerRow(installedList, presentation);
			}
		}

		this.renderAvailableServers(content, this.getAvailableGalleryServers(), true);
	}

	private renderInstalledSectionActions(header: HTMLElement): void {
		const actions = DOM.append(header, $('.plugin-card-section-actions'));
		const addLabel = localize('addServer', "Add Server");
		const add = this.installedAddButton = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, ariaLabel: addLabel }));
		add.element.classList.add('plugin-installed-action');
		add.label = this.narrowLayout ? localize('addServerNarrow', "Add") : addLabel;
		this.firstCardFocusElement ??= add.element;
		this.cardDisposables.add(add.onDidClick(() => this.commandService.executeCommand(McpCommandIds.AddConfiguration)));
	}

	private renderFeaturedServers(parent: HTMLElement): void {
		const featured = this.getAvailableGalleryServers().slice(0, 3);
		if (featured.length === 0) {
			if (this.gallerySnapshotFailed) {
				const grid = this.renderCardSection(
					parent,
					localize('mcpMarketplaceUnavailable', "Featured MCP servers could not be loaded"),
					localize('mcpMarketplaceUnavailableDescription', "Check your connection, then try loading marketplace results again."),
					'plugin-discovery-section',
				);
				const retry = this.cardDisposables.add(new Button(grid, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('retryMcpMarketplace', "Retry Loading MCP Servers") }));
				retry.label = localize('retry', "Retry");
				this.cardDisposables.add(retry.onDidClick(() => {
					this.gallerySnapshotFailed = false;
					void this.queryGallerySnapshot();
				}));
			}
			return;
		}

		const grid = this.renderCardSection(
			parent,
			localize('featuredMcpServers', "Featured"),
			localize('featuredMcpServersDescription', "Discover MCP servers that connect agents to popular tools and services."),
			'plugin-discovery-section',
		);
		for (const server of featured) {
			this.appendMarketplaceServerCard(grid, server);
		}
	}

	private renderAvailableServers(parent: HTMLElement, servers: readonly IWorkbenchMcpServer[], showDescription: boolean): void {
		const availableList = this.renderCardSection(
			parent,
			localize('availableMcpServersSection', "Available"),
			showDescription ? localize('availableMcpServersSectionDescription', "Browse and install MCP servers from the marketplace.") : undefined,
			'available-mcp-servers-section',
			servers.length,
		);
		this.availableSection = availableList.parentElement ?? undefined;
		availableList.classList.add('plugin-inventory-list');
		if (servers.length === 0) {
			const empty = DOM.append(availableList, $('.plugin-inventory-empty'));
			empty.textContent = this.gallerySnapshotLoading
				? localize('loadingMcpMarketplace', "Loading marketplace MCP servers...")
				: localize('noAvailableMcpServers', "No marketplace MCP servers are available.");
			return;
		}
		for (const server of servers) {
			this.appendMarketplaceServerRow(availableList, server);
		}
	}

	private appendInstalledServerRow(parent: HTMLElement, presentation: IMcpInstalledPresentation): void {
		const entry = presentation.entry;
		const label = getMcpEntryLabel(entry);
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row.mcp-installed-home-row'));
		const enabled = this.isInstalledEntryEnabled(entry);
		row.classList.toggle('disabled', !enabled);

		if (entry.type === 'server-item') {
			this.addSurfaceActivation(row, getMcpEntryAriaLabel(entry, this.workspaceService.isSessionsWindow), () => this._onDidSelectServer.fire(entry.server));
		} else if (entry.type === 'session-server-item' || entry.activeSessionServer) {
			const activeSessionServer = entry.type === 'session-server-item' ? entry.server : entry.activeSessionServer;
			this.addSurfaceActivation(row, getMcpEntryAriaLabel(entry, this.workspaceService.isSessionsWindow), () => this.openActiveSessionServerOptions(activeSessionServer!));
		} else {
			row.classList.add('mcp-static-row');
			row.setAttribute('role', 'group');
			row.setAttribute('aria-label', getMcpEntryAriaLabel(entry, this.workspaceService.isSessionsWindow));
		}

		const details = DOM.append(row, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		name.textContent = formatDisplayName(label);
		name.title = label;
		const statusPresentation = getMcpStatusPresentation(getMcpStatusKind(entry, this.workspaceService.isSessionsWindow), getMcpDisabledReason(entry));
		if (statusPresentation) {
			const statusBadge = DOM.append(nameRow, $('.plugin-list-item-status.mcp-runtime-status-badge'));
			statusBadge.classList.add(statusPresentation.className);
			statusBadge.textContent = statusPresentation.label;
		}
		const description = DOM.append(details, $('.plugin-list-item-description'));
		description.textContent = this.getInstalledEntryDescription(entry);

		const actions = DOM.append(row, $('.plugin-list-item-action'));
		this.isolateSurfaceActions(actions);
		this.appendInstalledServerToggle(actions, entry);
		const more = this.cardDisposables.add(new Button(actions, { ...getButtonStyles({ buttonSecondaryBackground: undefined, buttonSecondaryBorder: undefined }), secondary: true, supportIcons: true, ariaLabel: localize('mcpMoreActionsAria', "More actions for {0}", label) }));
		more.element.classList.add('plugin-card-icon-button');
		more.label = `$(${Codicon.ellipsis.id})`;
		this.cardDisposables.add(more.onDidClick(() => this.showMcpServerActions(entry, more.element)));
	}

	private appendInstalledServerToggle(parent: HTMLElement, entry: IMcpInstalledEntry): void {
		const label = getMcpEntryLabel(entry);
		let enabled = this.isInstalledEntryEnabled(entry);
		const blockedByPlugin = getMcpDisabledReason(entry)?.source === 'plugin';
		const switchElement = DOM.append(parent, $('button.plugin-enable-switch')) as HTMLButtonElement;
		switchElement.type = 'button';
		switchElement.disabled = blockedByPlugin;
		switchElement.setAttribute('role', 'switch');
		switchElement.setAttribute('aria-checked', String(enabled));
		const updateLabel = () => {
			const toggleLabel = enabled
				? localize('disableMcpServerAria', "Disable {0}", label)
				: localize('enableMcpServerAria', "Enable {0}", label);
			const accessibleLabel = blockedByPlugin
				? localize('mcpServerManagedByPluginAria', "{0} is disabled by its plugin", label)
				: toggleLabel;
			switchElement.setAttribute('aria-label', accessibleLabel);
			switchElement.title = accessibleLabel;
		};
		switchElement.classList.toggle('checked', enabled);
		updateLabel();
		DOM.append(switchElement, $('.plugin-enable-switch-thumb'));
		this.cardDisposables.add(DOM.addDisposableListener(switchElement, 'click', () => {
			enabled = !enabled;
			switchElement.classList.toggle('checked', enabled);
			switchElement.setAttribute('aria-checked', String(enabled));
			updateLabel();
			this.setInstalledEntryEnabled(entry, enabled);
			status(enabled
				? localize('mcpServerEnabledStatus', "{0} enabled.", label)
				: localize('mcpServerDisabledStatus', "{0} disabled.", label));
		}));
	}

	private appendMarketplaceServerRow(parent: HTMLElement, server: IWorkbenchMcpServer): void {
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row.plugin-marketplace-home-row'));
		this.addSurfaceActivation(row, localize('marketplaceMcpServerRowAriaLabel', "{0}. Available to install from the MCP marketplace.", server.label), () => this._onDidSelectServer.fire(server));
		const details = DOM.append(row, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		name.textContent = server.label;
		name.title = server.label;
		const description = DOM.append(details, $('.plugin-list-item-description'));
		description.textContent = truncateToFirstLine(server.description || localize('mcpNoDescription', "No description provided."));
		const actions = DOM.append(row, $('.plugin-list-item-action'));
		this.isolateSurfaceActions(actions);
		const install = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, ariaLabel: localize('installMcpServerAria', "Install {0}", server.label) }));
		install.element.classList.add('plugin-list-item-install-button');
		install.label = localize('install', "Install");
		this.cardDisposables.add(install.onDidClick(() => this.installMarketplaceServer(server, install)));
	}

	private appendMarketplaceServerCard(parent: HTMLElement, server: IWorkbenchMcpServer): void {
		const card = DOM.append(parent, $('.plugin-card.plugin-marketplace-card'));
		this.addSurfaceActivation(card, localize('marketplaceMcpServerCardAriaLabel', "{0}. Featured MCP server available to install.", server.label), () => this._onDidSelectServer.fire(server));
		const header = DOM.append(card, $('.plugin-card-header'));
		const titleBlock = DOM.append(header, $('.plugin-card-title-block'));
		const name = DOM.append(titleBlock, $('.plugin-card-title'));
		name.textContent = server.label;
		name.title = server.label;
		const description = DOM.append(titleBlock, $('.plugin-card-subtitle'));
		description.textContent = truncateToFirstLine(server.description || localize('mcpNoDescription', "No description provided."));
		const actions = DOM.append(header, $('.plugin-card-actions'));
		this.isolateSurfaceActions(actions);
		const install = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, ariaLabel: localize('installMcpServerAria', "Install {0}", server.label) }));
		install.label = localize('install', "Install");
		this.cardDisposables.add(install.onDidClick(() => this.installMarketplaceServer(server, install)));
	}

	private async installMarketplaceServer(server: IWorkbenchMcpServer, button: Button): Promise<void> {
		button.label = localize('installing', "Installing...");
		button.enabled = false;
		try {
			await this.mcpWorkbenchService.install(server);
			button.label = localize('installed', "Installed");
			status(localize('mcpServerInstalledStatus', "{0} installed.", server.label));
			await this.refresh();
		} catch (error) {
			button.label = localize('install', "Install");
			button.enabled = true;
			this.notificationService.error(localize('mcpInstallFailed', "Unable to install MCP server: {0}", getErrorMessage(error)));
		}
	}

	private getAvailableGalleryServers(): IWorkbenchMcpServer[] {
		const installedKeys = new Set<string>();
		for (const presentation of this.installedEntries) {
			const entry = presentation.entry;
			if (entry.type === 'server-item') {
				for (const key of getWorkbenchServerMatchKeys(entry.server)) {
					installedKeys.add(key.toLowerCase());
				}
			} else if (entry.type === 'builtin-item') {
				installedKeys.add(entry.label.toLowerCase());
				if (entry.localServer) {
					for (const key of getRuntimeServerMatchKeys(entry.localServer)) {
						installedKeys.add(key.toLowerCase());
					}
				}
			} else {
				installedKeys.add(entry.server.name.toLowerCase());
			}
		}
		return this.galleryServers.filter(server =>
			server.installState === McpServerInstallState.Uninstalled
			&& !getWorkbenchServerMatchKeys(server).some(key => installedKeys.has(key.toLowerCase()))
		);
	}

	private matchesGalleryServerQuery(server: IWorkbenchMcpServer, query: string): boolean {
		return server.label.toLowerCase().includes(query)
			|| server.description.toLowerCase().includes(query)
			|| server.publisherDisplayName?.toLowerCase().includes(query) === true;
	}

	private getInstalledEntryDescription(entry: IMcpInstalledEntry): string {
		const description = entry.type === 'server-item'
			? entry.server.description
			: entry.type === 'builtin-item'
				? entry.description
				: '';
		return truncateToFirstLine(description || localize('mcpNoDescription', "No description provided."));
	}

	private isInstalledEntryEnabled(entry: IMcpInstalledEntry): boolean {
		const activeSessionServer = getActiveSessionServer(entry);
		if (activeSessionServer) {
			return activeSessionServer.enabled;
		}
		const localServer = entry.type === 'session-server-item' ? undefined : entry.localServer;
		if (localServer) {
			return isContributionEnabled(localServer.enablement.get());
		}
		if (entry.type === 'server-item') {
			return isContributionEnabled(this.mcpService.enablementModel.readEnabled(entry.server.id));
		}
		return true;
	}

	private setInstalledEntryEnabled(entry: IMcpInstalledEntry, enabled: boolean): void {
		const activeSessionServer = getActiveSessionServer(entry);
		if (activeSessionServer) {
			activeSessionServer.setEnabled(enabled);
			return;
		}
		const localServer = entry.type === 'session-server-item' ? undefined : entry.localServer;
		const serverId = localServer?.definition.id ?? (entry.type === 'server-item' ? entry.server.id : undefined);
		if (!serverId) {
			return;
		}
		const current = this.mcpService.enablementModel.readEnabled(serverId);
		const next = getToggledMcpEnablementState(current);
		if (isContributionEnabled(next) !== enabled) {
			throw new Error(`Unexpected MCP enablement transition for ${serverId}.`);
		}
		this.mcpService.enablementModel.setEnabled(serverId, next);
	}

	private updateSearchResults(): void {
		const available = this.getAvailableGalleryServers();
		if (this.installedEntries.length === 0 && available.length === 0) {
			this.showEmptySurface(
				this.gallerySearchLoading
					? localize('searchingMcpMarketplace', "Searching the MCP marketplace...")
					: localize('noMatchingServers', "No servers match '{0}'", this.searchQuery),
				this.gallerySearchLoading ? '' : localize('tryDifferentSearch', "Try a different search term"),
			);
			return;
		}

		this.cardDisposables.clear();
		this.installedAddButton = undefined;
		this.firstCardFocusElement = undefined;
		this.availableSection = undefined;
		DOM.clearNode(this.cardContainer);
		this.showCardSurface();
		const content = this.cardScrollElement = DOM.append(this.cardContainer, $('.plugin-card-scroll.plugin-search-results'));
		if (this.installedEntries.length > 0) {
			const installedList = this.renderCardSection(content, localize('installedSearchHeader', "Installed"), undefined, 'installed-mcp-servers-section', this.installedEntries.length);
			installedList.classList.add('plugin-inventory-list');
			for (const presentation of this.installedEntries) {
				this.appendInstalledServerRow(installedList, presentation);
			}
		}
		if (available.length > 0) {
			this.renderAvailableServers(content, available, false);
		}
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
		const hiddenCollectionIds = this.customizationHarnessService.getActiveDescriptor().hiddenMcpServerCollectionIds;
		const builtinServers = this.mcpService.servers.get()
			.filter(s => !localIds.has(s.definition.id))
			.filter(s => isMcpServerCollectionVisible(s.collection.id, hiddenCollectionIds))
			.filter(s => !query || s.definition.label.toLowerCase().includes(query));

		const groups: { entries: Array<IMcpServerItemEntry | IMcpSessionServerItemEntry> }[] = [
			{ entries: [] },
			{ entries: [] },
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
		const activeSessionBuiltinEntries = createBuiltinActiveSessionMcpEntries(activeSessionOnlyServers);
		this.installedEntries = [
			...groups.flatMap(group => group.entries.map(entry => ({ entry }))),
			...pluginServers.map(({ server, activeSessionServer }) => ({ entry: createBuiltinEntry(server, activeSessionServer) })),
			...extensionServers.map(({ server, activeSessionServer }) => ({ entry: createBuiltinEntry(server, activeSessionServer) })),
			...otherBuiltinServers.map(({ server, activeSessionServer }) => ({ entry: createBuiltinEntry(server, activeSessionServer) })),
			...activeSessionBuiltinEntries.map(entry => ({ entry })),
		];

		// Compute sidebar badge directly from the data arrays (same source as group headers)
		this.filteredBuiltinCount = builtinServers.length;
		this.filteredActiveSessionCount = activeSessionOnlyServers.length;
		this._onDidChangeItemCount.fire(this.itemCount);
		if (query) {
			this.updateSearchResults();
		} else {
			this.renderMcpHome();
		}
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

	isInBrowseMode(): boolean {
		return false;
	}

	exitBrowseMode(): void { }

	/**
	 * Layouts the widget.
	 */
	layout(height: number, width: number): void {
		this.lastHeight = height;
		this.lastWidth = width;

		this.element.style.height = `${height}px`;
		this.updateResponsiveLayout(width);
		const availableHeight = this.element.clientHeight || height;

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

		this.cardContainer.style.height = `${listHeight}px`;
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
		if (this.cardScrollElement) {
			this.cardScrollElement.scrollTop = this.cardScrollElement.scrollHeight;
		}
	}

	/**
	 * Focuses the list.
	 */
	focus(): void {
		if (this.cardContainer.style.display !== 'none') {
			this.firstCardFocusElement?.focus();
		}
	}

	private updateResponsiveLayout(width: number): void {
		const narrow = width < 500;
		const wide = width >= 600;
		if (this.narrowLayout === narrow && this.wideLayout === wide) {
			return;
		}
		this.narrowLayout = narrow;
		this.wideLayout = wide;
		this.element.classList.toggle('narrow-layout', narrow);
		this.element.classList.toggle('wide-layout', wide);
		if (this.installedAddButton) {
			this.installedAddButton.label = narrow ? localize('addServerNarrow', "Add") : localize('addServer', "Add Server");
		}
	}

	private openActiveSessionServerOptions(server: AgentHostMcpServer): void {
		void this.commandService.executeCommand(McpCommandIds.AgentHostServerOptions, this.customizationHarnessService.activeSessionResource.get(), server.id);
	}

	private showMcpServerActions(entry: IMcpInstalledEntry, anchor: HTMLElement): void {
		const disposables = new DisposableStore();
		const actions = this.getMcpServerActions(entry, disposables);
		if (actions.length === 0) {
			disposables.dispose();
			return;
		}
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose(),
		});
	}

	private getMcpServerActions(entry: IMcpInstalledEntry, disposables: DisposableStore): IAction[] {
		if (entry.type === 'session-server-item') {
			const actions = getActiveSessionServerOptionsActions(this.commandService, this.agentHostCustomizationService, this.agentPluginService, this.customizationHarnessService.activeSessionResource.get(), entry.server);
			actions.forEach(action => isDisposable(action) && disposables.add(action));
			return actions;
		}

		if (entry.type === 'builtin-item') {
			const collectionId = entry.collectionId;
			const pluginUriStr = getPluginUriFromCollectionId(collectionId);
			const plugin = pluginUriStr ? this.agentPluginService.plugins.get().find(p => p.uri.toString() === pluginUriStr) : undefined;

			const actions: IAction[] = [];
			const lifecycleAction = entry.activeSessionServer !== undefined ? getActiveSessionServerLifecycleAction(entry.activeSessionServer) : undefined;
			if (lifecycleAction) {
				actions.push(disposables.add(lifecycleAction));
			}

			if (entry.localServer) {
				const isEmptyWorkbench = this.workspaceService.getActiveProjectRoot() === undefined;
				const enablementActions = getBuiltinMcpServerEnablementActions(
					this.mcpService,
					entry.localServer.definition.id,
					isEmptyWorkbench,
					this.agentHostCustomizationService,
					this.agentPluginService,
					this.customizationHarnessService.activeSessionResource.get(),
					entry.activeSessionServer,
				);
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
			return actions;
		}

		const mcpServer = this.mcpWorkbenchService.local.find(local => local.id === entry.server.id) || entry.server;

		const groups: IAction[][] = getContextMenuActions(mcpServer, false, this.instantiationService);
		const activeSessionServer = entry.activeSessionServer;
		const activeSessionLifecycleAction = activeSessionServer !== undefined ? getActiveSessionServerLifecycleAction(activeSessionServer) : undefined;
		const agentHostEnablementActions = activeSessionServer !== undefined
			? getAgentHostMcpServerEnablementActions(this.agentHostCustomizationService, this.agentPluginService, this.customizationHarnessService.activeSessionResource.get(), activeSessionServer, ['workspace', 'session'])
			: [];
		for (const menuActions of groups) {
			for (const menuAction of menuActions) {
				if (isDisposable(menuAction)) {
					disposables.add(menuAction);
				}
			}
		}
		for (const action of [activeSessionLifecycleAction, ...agentHostEnablementActions]) {
			if (action && isDisposable(action)) {
				disposables.add(action);
			}
		}
		return getServerItemContextMenuActions(groups, activeSessionServer, activeSessionLifecycleAction, agentHostEnablementActions);
	}
}
