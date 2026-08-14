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
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent, NotSelectableGroupId } from '../../../../../base/browser/ui/list/list.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpConnectionState, McpServerCacheState, McpServerInstallState, McpServerTransportType, IMcpService, IMcpServer } from '../../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../../../mcp/common/discovery/pluginMcpDiscovery.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ContributionEnablementState, IEnablementModel, isContributionDisabled, isContributionEnabled, isWorkspaceScopedEnablement, withContributionEnabled } from '../../common/enablement.js';
import { McpCommandIds } from '../../../../contrib/mcp/common/mcpCommandIds.js';
import { autorun, derived, observableSignalFromEvent, type IObservable, type IReader } from '../../../../../base/common/observable.js';
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
import { getCustomizationDisabledLabel, ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { CustomizationEnablementKind, McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { GalleryItemInstallState, GalleryItemRenderer, IGalleryItemProvider } from './galleryItemRenderer.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { getCustomizationEnablementDecision, getCustomizationScopeEnablement, type CustomizationDisabledReason } from '../../../../../platform/agentHost/common/customizationEnablement.js';
import { createAgentHostEnablePluginAction } from '../agentPluginActions.js';
import { EnablementSwitch } from './enablementSwitch.js';

const $ = DOM.$;

const mcpToolsIcon = Codicon.tools;

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

export function createBuiltinActiveSessionMcpEntries(servers: readonly AgentHostMcpServer[]): readonly IMcpSessionServerItemEntry[] {
	return servers.map(server => ({ type: 'session-server-item', server }));
}

type IMcpListEntry = IMcpGroupHeaderEntry | IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry;

export type McpStatusKind = McpConnectionState.Kind | McpServerStatus | 'disabled';

/**
 * Reads the live view of an agent-host MCP server, reactively.
 *
 * A list entry holds the snapshot taken when the list was last built, and `getMcpServers` is a
 * plain read rather than an observable, so nothing derived from it would re-run on its own.
 * Reading through here inside an `autorun` or `derived` puts agent-host state into the same
 * reactive graph as the local runtime's observables, so a row's status -- and the accessible
 * name spoken beside it -- keep up with a server that starts, fails, or asks to sign in.
 */
class ActiveSessionMcpServerReader {

	private readonly _changes: IObservable<void>;

	constructor(
		private readonly _agentHostCustomizationService: IAgentHostCustomizationService,
		private readonly _customizationHarnessService: ICustomizationHarnessService,
	) {
		this._changes = observableSignalFromEvent('agentHostCustomizations', this._agentHostCustomizationService.onDidChangeCustomizations);
	}

	/**
	 * Re-reads `snapshot` from the service. Falls back to the snapshot itself when the server has
	 * gone, so a row keeps describing what it last knew rather than blanking.
	 */
	read(snapshot: AgentHostMcpServer | undefined, reader: IReader | undefined): AgentHostMcpServer | undefined {
		if (!snapshot) {
			return undefined;
		}
		this._changes.read(reader);
		const sessionResource = this._customizationHarnessService.activeSessionResource.read(reader);
		return this._agentHostCustomizationService.getMcpServers(sessionResource).find(server => server.id === snapshot.id) ?? snapshot;
	}
}

/**
 * Whether a cache state means "we know what tools this server has".
 *
 * `RefreshingFromUnknown` is a first refresh in flight: no tools have ever been read, so an empty
 * list means "not yet", not "none". Treating it as a known result reported a server as offering no
 * tools while its very first request was still outstanding.
 */
export function hasKnownMcpTools(cacheState: McpServerCacheState | undefined): boolean {
	return cacheState !== undefined
		&& cacheState !== McpServerCacheState.Unknown
		&& cacheState !== McpServerCacheState.RefreshingFromUnknown;
}

/**
 * Whether the tools currently shown came from the cache rather than a live connection.
 *
 * `RefreshingFromCached` is a refresh over cached tools: what is on screen is still the cached set
 * until the refresh lands, so it keeps the same "from the last time this ran" caveat.
 */
export function areMcpToolsFromCache(cacheState: McpServerCacheState | undefined): boolean {
	return cacheState === McpServerCacheState.Cached
		|| cacheState === McpServerCacheState.Outdated
		|| cacheState === McpServerCacheState.RefreshingFromCached;
}

/**
 * Reads the facts a row shows about a running server.
 *
 * Tools are read even when the server is stopped: a cached result means we know what it offers
 * from its last run, which is exactly what someone deciding whether to enable it wants to see.
 */
function readServerFacts(server: IMcpServer | undefined, reader: IReader | undefined): { toolCount?: number; toolsFromCache?: boolean; transport?: string } {
	if (!server) {
		return {};
	}
	const cacheState = server.cacheState.read(reader);
	const launch = server.readDefinitions().read(reader).server?.launch;
	return {
		toolCount: hasKnownMcpTools(cacheState) ? server.tools.read(reader).length : undefined,
		toolsFromCache: areMcpToolsFromCache(cacheState),
		transport: launch?.type === McpServerTransportType.HTTP
			? localize('transportHttp', "HTTP")
			: launch?.type === McpServerTransportType.Stdio
				? localize('transportLocal', "Local")
				: undefined,
	};
}

/** The failure an agent-host server is reporting, when it is reporting one. */
function getAgentHostServerError(server: AgentHostMcpServer): string | undefined {
	return server.state.kind === McpServerStatus.Error ? server.state.error.message : undefined;
}

/** The parts of a row that come from observables and change while the row is bound to an element. */
interface IMcpRowState {
	readonly status: McpStatusKind | undefined;
	/** Why the row is off, when it is. Names the layer, or the plugin that owns it. */
	readonly disabledReason?: CustomizationDisabledReason;
	/** The live agent-host view of this row's server, re-read rather than the stale snapshot. */
	readonly activeSessionServer?: AgentHostMcpServer;
	/** Populated for a failing server, so the reason can be read in place. */
	readonly errorMessage?: string;
	readonly toolCount?: number;
	/** Tools are last-known rather than live, so the count carries a caveat. */
	readonly toolsFromCache?: boolean;
	readonly transport?: string;
}

/** The parts of a row that do not change while the row is bound, but that line two draws from. */
interface IMcpRowContext {
	readonly description?: string;
}

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
	/** Status word and dot, next to the name so state reads as part of the server's identity. */
	readonly status: HTMLElement;
	readonly description: HTMLElement;
	/** Holds everything in the trailing slot that is rebuilt on every status change. */
	readonly actions: HTMLElement;
	/**
	 * Built once and reused for the life of the template. Rebuilding it per status change would
	 * remove the element a keyboard user is standing on: toggling notifies synchronously, which
	 * re-runs the status autorun, which would tear the focused button out of the document.
	 */
	readonly enablementSwitch: EnablementSwitch;
	readonly elementDisposables: DisposableStore;
	readonly actionDisposables: DisposableStore;
	/** Which row the actions currently belong to, so a recycled template cannot reuse another row's. */
	renderedRowKey?: string;
	/** What the actions currently show, so an unchanged status does not rebuild them. */
	renderedStatusSignature?: string;
	/** Static, per-element facts that the status update needs in order to draw line two. */
	context: IMcpRowContext;
}

/**
 * Renderer for local MCP server list items.
 */
class McpServerItemRenderer implements IListRenderer<IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, IMcpServerItemTemplateData> {
	readonly templateId = 'mcpServerItem';

	constructor(
		private readonly _afterShowOutput: () => Promise<void>,
		private readonly _activeSessionReader: ActiveSessionMcpServerReader,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IOutputService private readonly outputService: IOutputService,
		@IMcpService private readonly mcpService: IMcpService,
	) { }

	renderTemplate(container: HTMLElement): IMcpServerItemTemplateData {
		container.classList.add('mcp-server-item');

		const typeIcon = DOM.append(container, $('.mcp-server-icon'));
		typeIcon.classList.add(...ThemeIcon.asClassNameArray(mcpServerIcon));

		const details = DOM.append(container, $('.mcp-server-details'));
		const nameRow = DOM.append(details, $('.mcp-server-name-row'));
		const name = DOM.append(nameRow, $('.mcp-server-name'));
		// Status sits next to the name rather than in the far-right actions slot: it describes the
		// server, so it belongs where the eye already is when reading which server this is.
		const status = DOM.append(nameRow, $('.mcp-server-status'));

		const description = DOM.append(details, $('.mcp-server-description'));

		const actionsSlot = DOM.append(container, $('.mcp-server-actions'));
		const actions = DOM.append(actionsSlot, $('.mcp-server-actions-transient'));
		const enablementSwitch = new EnablementSwitch(actionsSlot);

		return {
			container,
			typeIcon,
			name,
			status,
			description,
			actions,
			enablementSwitch,
			elementDisposables: new DisposableStore(),
			actionDisposables: new DisposableStore(),
			context: {},
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
			templateData.context = { description: element.description ? truncateToFirstLine(element.description) : undefined };
			this.bindRowState(templateData, element);

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
			templateData.context = {};
			this.bindRowState(templateData, element);
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
		templateData.context = { description: description ? truncateToFirstLine(description) : undefined };

		this.bindRowState(templateData, element);
	}

	/**
	 * Drives a row from one resolver, for every kind of row.
	 *
	 * There were three paths here: two that shared `updateKnownServerStatus` and a third that
	 * computed the same answer inline. They agreed only by coincidence, and this is the same
	 * file whose history says copies of a status rule had already drifted apart.
	 */
	private bindRowState(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): void {
		templateData.elementDisposables.add(autorun(reader => {
			const rowState = resolveMcpRowState(element, this._activeSessionReader, this.mcpService.enablementModel, this.workspaceService.isSessionsWindow, reader);
			templateData.container.classList.toggle('disabled', rowState.status === 'disabled');
			this.updateStatus(templateData, element, rowState);
		}));
	}

	private updateStatus(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, rowState: IMcpRowState): void {
		const state = rowState.status;
		const presentation = getMcpStatusPresentation(state, rowState.disabledReason);
		// The live agent-host view rather than the entry's snapshot, so the sign-in and output
		// actions are bound to the server as it is now.
		const activeSessionServer = rowState.activeSessionServer;
		const label = getMcpEntryLabel(element);
		const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
		const localServer = element.type === 'session-server-item' ? undefined : element.localServer;

		const enablementTarget = getEnablementTarget(
			element,
			rowState,
			this.mcpService,
			this.agentHostCustomizationService,
			activeSessionResource,
			snapshot => this._activeSessionReader.read(snapshot, undefined));
		const switchChecked = enablementTarget?.isEnabled();

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
			activeSessionServerId: activeSessionServer?.id,
			logOutputChannelId: activeSessionServer?.logOutputChannelId,
			localServerId: localServer?.definition.id,
			activeSessionResource: activeSessionResource.toString(),
			switchChecked,
			errorMessage: rowState.errorMessage,
			toolCount: rowState.toolCount,
			toolsFromCache: rowState.toolsFromCache,
			transport: rowState.transport,
			description: templateData.context.description,
		});
		if (templateData.renderedStatusSignature === signature) {
			return;
		}
		templateData.renderedStatusSignature = signature;

		templateData.actionDisposables.clear();
		DOM.clearNode(templateData.actions);
		DOM.clearNode(templateData.status);
		templateData.status.className = 'mcp-server-status';

		this.renderEnablementSwitch(templateData, enablementTarget, switchChecked, label);
		this.renderMetaLine(templateData, rowState);

		if (rowState.toolCount !== undefined && rowState.toolCount > 0) {
			const toolsElement = DOM.append(templateData.actions, $('.mcp-server-tools'));
			toolsElement.classList.toggle('is-cached', !!rowState.toolsFromCache);
			DOM.append(toolsElement, $('span')).classList.add(...ThemeIcon.asClassNameArray(mcpToolsIcon));
			DOM.append(toolsElement, $('span')).textContent = String(rowState.toolCount);
			templateData.actionDisposables.add(this.hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'),
				toolsElement,
				rowState.toolsFromCache
					? localize('mcpToolsCached', "{0} tools, from the last time this server ran", rowState.toolCount)
					: localize('mcpTools', "{0} tools", rowState.toolCount)));
		}

		// Status reads as a word beside the name, including the states that used to resolve to an
		// icon-less presentation and therefore drew nothing at all -- which was every idle server,
		// the most common row in the list.
		if (presentation && shouldShowStatusOnRow(state, rowState.disabledReason, switchChecked !== undefined)) {
			templateData.status.classList.add(presentation.className);
			// A dot as well as the word: colour alone is not a distinction everyone can make.
			DOM.append(templateData.status, $('.mcp-server-status-dot'));
			DOM.append(templateData.status, $('.mcp-server-status-label')).textContent = presentation.label;
		}

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
			signInButton.element.classList.add('mcp-server-inline-button', 'mcp-server-sign-in');
			registerMcpInlineButtonAction(templateData.actionDisposables, signInButton, async () => {
				signInButton.enabled = false;
				try {
					await authenticateMcpServer(this.agentHostCustomizationService, this.customizationHarnessService.activeSessionResource.get(), activeSessionServer.id);
				} finally {
					signInButton.enabled = true;
				}
			});
		}

		// An explicit, labelled action now that the status is a word: the coloured icon-button it
		// replaces was the only thing saying a row had failed *and* the only way to read why, so
		// its meaning had to be guessed from its colour.
		const showOutput = state === McpServerStatus.Error || state === McpConnectionState.Kind.Error
			? getMcpServerOutputHandler(this.outputService, localServer, activeSessionServer, this._afterShowOutput, showActiveSessionOutput)
			: undefined;
		if (showOutput) {
			const showOutputLabel = localize('showMcpServerOutput', "Show output for {0}", label);
			const outputButton = templateData.actionDisposables.add(new Button(templateData.actions, {
				...defaultButtonStyles,
				secondary: true,
				small: true,
				title: showOutputLabel,
				ariaLabel: showOutputLabel,
			}));
			outputButton.label = localize('showOutput', "Show Output");
			outputButton.element.classList.add('mcp-server-inline-button');
			registerMcpInlineButtonAction(templateData.actionDisposables, outputButton, showOutput);
		}

		if (rowState.errorMessage) {
			// Anchored to the line the error is printed on, not the row. Built-in rows already
			// register a provenance hover on the container, and the hover service keys delayed
			// hovers by target element -- two registrations on one element overwrite each other's
			// entry, so whichever was torn down last would take the survivor's with it.
			templateData.actionDisposables.add(this.hoverService.setupDelayedHover(templateData.description, () => ({
				content: rowState.errorMessage!,
				appearance: { compact: false, skipFadeInAnimation: true },
			})));
		}
	}

	/**
	 * Renders line two: how the server connects, and either the failure reason or its description.
	 *
	 * A failure replaces the description because when something is broken that is the only thing on
	 * this line worth the user's attention, and transport drops out with it rather than truncating
	 * the error to nothing.
	 */
	private renderMetaLine(templateData: IMcpServerItemTemplateData, rowState: IMcpRowState): void {
		DOM.clearNode(templateData.description);
		templateData.description.classList.toggle('is-error', !!rowState.errorMessage);

		const parts: { text: string; isError?: boolean; isContext?: boolean }[] = [];
		if (rowState.transport && !rowState.errorMessage) {
			parts.push({ text: rowState.transport, isContext: true });
		}
		if (rowState.errorMessage) {
			parts.push({ text: truncateToFirstLine(rowState.errorMessage), isError: true });
		} else if (templateData.context.description) {
			parts.push({ text: templateData.context.description });
		}

		if (!parts.length) {
			templateData.description.style.display = 'none';
			return;
		}

		templateData.description.style.display = '';
		parts.forEach((part, index) => {
			if (index > 0) {
				DOM.append(templateData.description, $('span.mcp-server-meta-separator')).textContent = '·';
			}
			const span = DOM.append(templateData.description, $('span'));
			span.textContent = part.text;
			span.classList.toggle('mcp-server-meta-error', !!part.isError);
			span.classList.toggle('mcp-server-meta-context', !!part.isContext);
		});
	}

	/**
	 * Renders the on/off switch at the trailing edge of an installed row.
	 *
	 * It is the last thing in the row on purpose: every row that has one has it in the same place,
	 * so turning a server off is a single predictable target rather than a right-click someone has
	 * to guess at.
	 */
	private renderEnablementSwitch(templateData: IMcpServerItemTemplateData, target: IMcpEnablementTarget | undefined, checked: boolean | undefined, label: string): void {
		const toggle = templateData.enablementSwitch;
		toggle.setVisible(target !== undefined);
		if (!target || checked === undefined) {
			return;
		}
		// The accessible name is the server, not the act: `role="switch"` announces its own state
		// from aria-checked, so an action phrase would read "Disable Redis, switch, on" -- a label
		// arguing with the state beside it. The hover still names the act, because a pointer user
		// has no announced state to go on.
		toggle.update(checked, label);
		templateData.actionDisposables.add(toggle.onDidToggle(() => target.setEnabled(!target.isEnabled())));
		templateData.actionDisposables.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('element'),
			toggle.element,
			getEnablementSwitchTooltip(label, checked)));
	}

	disposeTemplate(templateData: IMcpServerItemTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.actionDisposables.dispose();
		templateData.enablementSwitch.dispose();
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
}

export function getMcpStatusPresentation(state: McpStatusKind | undefined, disabledReason?: CustomizationDisabledReason): IMcpStatusPresentation | undefined {
	if (state === undefined) {
		return undefined;
	}
	if (state === 'disabled') {
		return { label: getCustomizationDisabledLabel(disabledReason), className: 'disabled' };
	}
	switch (state) {
		case McpConnectionState.Kind.Running:
		case McpServerStatus.Ready:
			return { label: localize('running', "Running"), className: 'running' };
		case McpConnectionState.Kind.Starting:
		case McpServerStatus.Starting:
			return { label: localize('starting', "Starting"), className: 'starting' };
		case McpServerStatus.AuthRequired:
			// "Sign-in needed" rather than "Authentication required": it is the same fact in the
			// words the button beside it uses, and it fits a row.
			return { label: localize('authRequired', "Sign-in needed"), className: 'auth-required' };
		case McpConnectionState.Kind.Error:
		case McpServerStatus.Error:
			// "Failed" rather than "Error": a row says what happened to the server, and the row
			// is not itself an error message.
			return { label: localize('error', "Failed"), className: 'error' };
		case McpConnectionState.Kind.Stopped:
		case McpServerStatus.Stopped:
		default:
			// "Idle" rather than "Stopped": MCP servers start lazily, so not holding a process is
			// the resting state, not something that went wrong.
			return { label: localize('stopped', "Idle"), className: 'stopped' };
	}
}

/**
 * Whether a status is worth saying at all.
 *
 * Running and Idle are lifecycle, not news. VS Code starts MCP servers lazily -- a server launches
 * when a tool call needs it and shuts down afterwards -- so whether a process happens to be alive
 * right now is an implementation detail that flickers and that nobody acts on. Printing it made the
 * most common word in the list also the least informative one.
 */
export function isNoteworthyMcpStatus(state: McpStatusKind | undefined): boolean {
	switch (state) {
		case undefined:
		case McpConnectionState.Kind.Running:
		case McpServerStatus.Ready:
		case McpConnectionState.Kind.Stopped:
		case McpServerStatus.Stopped:
			return false;
		default:
			return true;
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
	/** The active-session twin the sign-in and output actions are bound to. */
	readonly activeSessionServerId: string | undefined;
	readonly logOutputChannelId: string | undefined;
	/** The local server the output action falls back to. */
	readonly localServerId: string | undefined;
	/** Captured when the output action is built, so switching sessions has to rebuild it. */
	readonly activeSessionResource: string | undefined;
	/** The switch's rendered state: `undefined` when the row has no switch at all. */
	readonly switchChecked: boolean | undefined;
	/**
	 * Line two is drawn from here down. It is built inside the guard because `transport` and
	 * `errorMessage` are only known once the row's observables have been read, so unlike the name
	 * it cannot be written in `renderElement`. Leaving one of these out does not throw -- it
	 * freezes that text on screen until something else happens to move.
	 */
	readonly errorMessage: string | undefined;
	readonly toolCount: number | undefined;
	readonly toolsFromCache: boolean | undefined;
	readonly transport: string | undefined;
	readonly description: string | undefined;
}

/**
 * Reduces a row's status actions to a comparable value, so they are only rebuilt when something
 * about them actually changed.
 *
 * The status update runs from an autorun over the server's connection state, which for an erroring
 * server fires about twice a second while producing byte-identical content. Tearing the actions
 * down and rebuilding them anyway meant a node could be replaced between mousedown and mouseup,
 * and a node replaced mid-click never receives the click -- so the inline `Show Output` button did
 * nothing on precisely the rows that needed it.
 *
 * The signature therefore has to cover every value the actions are built from, both what they
 * render and what they act on, or an update that matters would be dropped.
 */
export function getMcpStatusRenderSignature(input: IMcpStatusRenderInput): string {
	return JSON.stringify([
		input.rowKey,
		input.label,
		input.state ?? null,
		input.statusLabel ?? null,
		input.statusClassName ?? null,
		input.activeSessionServerId ?? null,
		input.logOutputChannelId ?? null,
		input.localServerId ?? null,
		input.activeSessionResource ?? null,
		input.switchChecked ?? null,
		input.errorMessage ?? null,
		input.toolCount ?? null,
		input.toolsFromCache ?? null,
		input.transport ?? null,
		input.description ?? null,
	]);
}

function getMcpEntryLabel(element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): string {
	return element.type === 'session-server-item'
		? element.server.name
		: element.type === 'builtin-item'
			? element.label
			: element.server.label;
}

/** How a row's switch reads and writes its server's enablement. */
export interface IMcpEnablementTarget {
	isEnabled(): boolean;
	setEnabled(enabled: boolean): void;
}

/**
 * The scope an agent-host switch writes.
 *
 * The decisive decision is `enablement[0]`, so replacing that same kind is what actually moves the
 * effective state -- and it answers a deliberate workspace or session choice where it was made
 * rather than silently promoting it to something broader.
 *
 * With nothing deciding yet, an unqualified switch means the whole durable answer: off everywhere.
 * Narrower scopes stay an explicit act, available from the context menu. Note this is deliberately
 * *not* `IAgentHostMcpServer.setEnabled`, which only ever writes the session layer.
 */
function getAgentHostSwitchScope(server: AgentHostMcpServer, agentHostCustomizations: IAgentHostCustomizationService, sessionResource: URI): CustomizationEnablementKind {
	const decision = getCustomizationEnablementDecision(server);
	if (decision === undefined) {
		return CustomizationEnablementKind.Global;
	}
	// A workspace write is dropped when the session has no working directory, so fall back to the
	// layer that can still be written rather than issuing one that silently vanishes.
	if (decision.kind === CustomizationEnablementKind.Workspace && agentHostCustomizations.getWorkingDirectories(sessionResource).length === 0) {
		return CustomizationEnablementKind.Global;
	}
	return decision.kind;
}

/**
 * Resolves how a row's switch reads and writes enablement, or `undefined` when the row has none to
 * offer.
 *
 * Two kinds of row have none. A gallery result has nothing installed to turn on yet. And a server
 * held off by the plugin that owns it cannot be turned on by writing its own enablement at all --
 * the honest thing is to show no switch, let the status say `Disabled (Plugin)`, and leave the
 * context menu's "Enable {plugin}" as the way back.
 *
 * Both sides read and write *live* rather than through values captured when the row was rendered.
 * The render guard cannot cover every decision in an enablement array, and writing back a stale
 * one would resurrect a scope the user had since changed.
 */
export function getEnablementTarget(
	element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry,
	rowState: IMcpRowState,
	mcpService: IMcpService,
	agentHostCustomizations: IAgentHostCustomizationService,
	sessionResource: URI,
	readActiveSessionServer: (snapshot: AgentHostMcpServer | undefined) => AgentHostMcpServer | undefined,
): IMcpEnablementTarget | undefined {
	if (rowState.disabledReason?.source === 'plugin') {
		return undefined;
	}

	const sessionSnapshot = getActiveSessionServer(element);
	const setAgentHostEnabled = (enabled: boolean): void => {
		const live = readActiveSessionServer(sessionSnapshot);
		if (!live) {
			return;
		}
		agentHostCustomizations.setCustomizationEnablement(sessionResource, live.id, live.enablement, getAgentHostSwitchScope(live, agentHostCustomizations, sessionResource), enabled);
	};

	if (element.type === 'session-server-item') {
		return {
			isEnabled: () => readActiveSessionServer(sessionSnapshot)?.enabled !== false,
			setEnabled: setAgentHostEnabled,
		};
	}

	const enablementKey = getMcpEnablementKey(element);
	if (enablementKey === undefined) {
		return sessionSnapshot
			? { isEnabled: () => readActiveSessionServer(sessionSnapshot)?.enabled !== false, setEnabled: setAgentHostEnabled }
			: undefined;
	}

	return {
		// A row can be held off by the durable choice, the session choice, or both, so the switch
		// reflects the union.
		isEnabled: () => isContributionEnabled(mcpService.enablementModel.readEnabled(enablementKey)) && readActiveSessionServer(sessionSnapshot)?.enabled !== false,
		setEnabled: enabled => {
			// Writes the layer that already decided this row rather than always writing the
			// profile: EnablementModel.setEnabledWithWorkspaceKey deletes the workspace entry when
			// the profile is written, so a deliberate workspace choice would be destroyed by a
			// control that only ever displays the scope while the row is off.
			mcpService.enablementModel.setEnabled(enablementKey, withContributionEnabled(mcpService.enablementModel.readEnabled(enablementKey), enabled));
			// Dispatched unconditionally rather than only when the layers disagree: the durable
			// write above notifies synchronously and can rebuild the list underneath this closure,
			// so re-reading to decide would be racing it. Re-asserting a value the session already
			// holds is harmless; a switch that leaves a server visibly off is not.
			if (sessionSnapshot) {
				setAgentHostEnabled(enabled);
			}
		},
	};
}

/** Names the act, for a pointer user who has no announced state to go on. */
function getEnablementSwitchTooltip(name: string, checked: boolean): string {
	return checked
		? localize('mcpSwitchOff', "Disable {0}", name)
		: localize('mcpSwitchOn', "Enable {0}", name);
}

/**
 * Whether a disabled reason says something a switch cannot: which layer holds the server off, or
 * which plugin does.
 */
function isQualifiedDisabledReason(reason: CustomizationDisabledReason | undefined): boolean {
	return reason !== undefined && (reason.source === 'plugin' || reason.scope !== CustomizationEnablementKind.Global);
}

/**
 * Whether a *row* should print the status word.
 *
 * Stricter than {@link isNoteworthyMcpStatus} by one case: a row carrying a switch already shows
 * off-ness better than a word can, so "Disabled" beside an off switch is the same fact twice. A
 * qualified reason is different -- it says *where* the choice lives, which the switch cannot
 * express.
 */
function shouldShowStatusOnRow(state: McpStatusKind | undefined, disabledReason: CustomizationDisabledReason | undefined, hasSwitch: boolean): boolean {
	if (state === 'disabled') {
		return !hasSwitch || isQualifiedDisabledReason(disabledReason);
	}
	return isNoteworthyMcpStatus(state);
}

/**
 * The key a row's durable enablement is stored under.
 *
 * For an installed server this is the workbench server's own id -- the same key
 * `EnableMcpServerGloballyAction` reads and writes, so the switch and the context menu act on one
 * entry rather than two. Deliberately *not* the matched runtime server's definition id: that match
 * is conservative and declines whenever two servers answer to one name, and a row must not lose
 * its enablement because of an ambiguity in a lookup it never needed. Built-in rows have no
 * workbench server, so they use the runtime definition id their own context menu uses.
 */
function getMcpEnablementKey(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): string | undefined {
	switch (entry.type) {
		case 'session-server-item':
			return undefined;
		case 'server-item':
			// A gallery result is not installed, so it has no enablement to store.
			return entry.server.local ? entry.server.id : undefined;
		case 'builtin-item':
			return entry.localServer?.definition.id;
	}
}

/**
 * The single answer to "what is this row's state right now".
 *
 * Every surface that describes a row -- the rendered status, its accessible name, and the switch
 * -- reads through here, so they cannot disagree about the same server. When an agent host has a
 * view of a server it wins: the agent is the one actually running it, and it is also the only
 * layer that knows a server is held off by the plugin that owns it.
 */
function resolveMcpRowState(
	entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry,
	activeSessionReader: ActiveSessionMcpServerReader,
	enablementModel: IEnablementModel,
	isSessionsWindow: boolean,
	reader: IReader | undefined,
): IMcpRowState {
	// Facts about the running server are read for every row: a stopped server still knows what
	// tools it offered last time it ran, which is exactly what someone deciding whether to turn it
	// on wants to see.
	const facts = readServerFacts(entry.type === 'session-server-item' ? undefined : entry.localServer, reader);

	const activeSessionServer = activeSessionReader.read(getActiveSessionServer(entry), reader);
	if (activeSessionServer !== undefined) {
		const presentation = getActiveSessionServerPresentation(activeSessionServer);
		return {
			...facts,
			status: presentation.status,
			disabledReason: presentation.enabled ? undefined : activeSessionServer.disabledReason,
			activeSessionServer,
			// Read from whichever source decided the status. Reading the error off the local
			// runtime regardless would let a row show the session's status beside an unrelated
			// local failure -- or say "Failed" with nothing to read.
			errorMessage: presentation.enabled ? getAgentHostServerError(activeSessionServer) : undefined,
		};
	}

	if (entry.type === 'session-server-item') {
		return { status: undefined };
	}

	const enablementKey = getMcpEnablementKey(entry);
	if (enablementKey !== undefined) {
		// Read through the model rather than the matched runtime server's observable: they are the
		// same value (IMcpServer.enablement is a derived over exactly this read), but the model
		// answers for rows the conservative runtime match declined, which would otherwise report
		// a disabled server as fine.
		const enablement = enablementModel.readEnabled(enablementKey, reader);
		if (isContributionDisabled(enablement)) {
			// Described as a scope reason so the wording comes from the same helper the agent-host
			// rows use. A workspace choice is worth naming; "off everywhere" is just off.
			return {
				...facts,
				status: 'disabled',
				disabledReason: {
					source: 'scope',
					scope: isWorkspaceScopedEnablement(enablement) ? CustomizationEnablementKind.Workspace : CustomizationEnablementKind.Global,
				},
			};
		}
	}

	// Only a plain local row reports its connection state. A built-in row has never shown it, and
	// in the Agents window the local runtime is not what governs whether a server is working.
	if (entry.type === 'server-item' && !isSessionsWindow) {
		const connectionState = entry.localServer?.connectionState.read(reader);
		return {
			...facts,
			status: connectionState?.state,
			errorMessage: connectionState?.state === McpConnectionState.Kind.Error ? connectionState.message : undefined,
		};
	}
	return { ...facts, status: undefined };
}

/**
 * The accessible name for a row, as an observable.
 *
 * It has to be observable because a row's status changes without the list being spliced: the
 * visible status is driven by an autorun over the runtime's observables and the agent host's
 * change signal, and nothing re-renders the row around it. A plain string would be computed once
 * and then quietly describe the past.
 */
function observeMcpEntryAriaLabel(element: IMcpListEntry, activeSessionReader: ActiveSessionMcpServerReader, enablementModel: IEnablementModel, isSessionsWindow: boolean): IObservable<string> {
	return derived(reader => getMcpEntryAriaLabel(element, activeSessionReader, enablementModel, isSessionsWindow, reader));
}

function getMcpEntryAriaLabel(element: IMcpListEntry, activeSessionReader: ActiveSessionMcpServerReader, enablementModel: IEnablementModel, isSessionsWindow: boolean, reader: IReader | undefined): string {
	if (element.type === 'group-header') {
		return localize('mcpGroupAriaLabel', "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
	}
	const label = getMcpEntryLabel(element);
	const rowState = resolveMcpRowState(element, activeSessionReader, enablementModel, isSessionsWindow, reader);
	// Deliberately looser than the row: a screen reader reads the row label on its own, so a
	// status the row can leave to a neighbouring control is still new information here.
	const status = isNoteworthyMcpStatus(rowState.status) ? getMcpStatusPresentation(rowState.status, rowState.disabledReason) : undefined;
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
		// Shared by the rows and their accessible names, so both observe the same agent-host
		// state through the same signal rather than each installing their own listener.
		const activeSessionReader = new ActiveSessionMcpServerReader(this.agentHostCustomizationService, this.customizationHarnessService);
		const localRenderer = this.instantiationService.createInstance(McpServerItemRenderer, () => this._closeCustomizationEditor(), activeSessionReader);
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
						return observeMcpEntryAriaLabel(element, activeSessionReader, this.mcpService.enablementModel, this.workspaceService.isSessionsWindow);
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
					},
					getGroupId(element: IMcpListEntry) {
						return element.type === 'group-header' ? NotSelectableGroupId : 0;
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
		const activeSessionBuiltinEntries = createBuiltinActiveSessionMcpEntries(activeSessionOnlyServers);

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

		if (otherBuiltinServers.length > 0 || activeSessionBuiltinEntries.length > 0) {
			const collapsed = this.collapsedGroups.has('builtin');
			entries.push({
				type: 'group-header',
				id: 'mcp-group-builtin',
				scope: 'builtin',
				label: localize('builtInGroup', "Built-in"),
				icon: builtinIcon,
				count: otherBuiltinServers.length + activeSessionBuiltinEntries.length,
				isFirst,
				description: localize('builtInGroupDescription', "MCP servers built into VS Code. These are available automatically."),
				collapsed,
			});
			if (!collapsed) {
				for (const { server, activeSessionServer } of otherBuiltinServers) {
					entries.push(createBuiltinEntry(server, activeSessionServer));
				}
				entries.push(...activeSessionBuiltinEntries);
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
			const activeSessionActions = getActiveSessionServerOptionsActions(this.commandService, this.agentHostCustomizationService, this.agentPluginService, this.customizationHarnessService.activeSessionResource.get(), e.element.server);
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
			const lifecycleAction = e.element.activeSessionServer !== undefined ? getActiveSessionServerLifecycleAction(e.element.activeSessionServer) : undefined;
			if (lifecycleAction) {
				actions.push(disposables.add(lifecycleAction));
			}

			if (e.element.localServer) {
				const isEmptyWorkbench = this.workspaceService.getActiveProjectRoot() === undefined;
				const enablementActions = getBuiltinMcpServerEnablementActions(
					this.mcpService,
					e.element.localServer.definition.id,
					isEmptyWorkbench,
					this.agentHostCustomizationService,
					this.agentPluginService,
					this.customizationHarnessService.activeSessionResource.get(),
					e.element.activeSessionServer,
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

		// Local server actions include VS Code-owned profile/workspace enablement.
		const groups: IAction[][] = getContextMenuActions(mcpServer, false, this.instantiationService);
		const activeSessionServer = serverEntry.activeSessionServer;
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
		const actions = getServerItemContextMenuActions(groups, activeSessionServer, activeSessionLifecycleAction, agentHostEnablementActions);

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose()
		});
	}
}
