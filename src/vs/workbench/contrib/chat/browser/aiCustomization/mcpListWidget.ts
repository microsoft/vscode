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
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpConnectionState, McpServerInstallState, IMcpService, IMcpServer, McpServerCacheState, McpServerTransportType } from '../../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../../../mcp/common/discovery/pluginMcpDiscovery.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ContributionEnablementState, isContributionDisabled, isContributionEnabled, isWorkspaceScopedEnablement } from '../../common/enablement.js';
import { EnablementSwitch } from './enablementSwitch.js';
import { getRuntimeServerMatchKeys, getUniqueMcpMatchKeys, getWorkbenchServerMatchKeys, LocalMcpServerMatcher } from './mcpServerIdentity.js';
import { McpCommandIds } from '../../../../contrib/mcp/common/mcpCommandIds.js';
import { autorun, derived, IObservable, IReader } from '../../../../../base/common/observable.js';
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
import { userIcon, workspaceIcon, extensionIcon, mcpServerIcon, builtinIcon } from './aiCustomizationIcons.js';
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

// One height for every row. Line two always carries at least the server's origin, so there is
// no longer a "description-less" variant to shrink for, and the list reads as a single column.
const MCP_ITEM_HEIGHT = 44;
const MCP_ITEM_WITH_DESCRIPTION_HEIGHT = 44;

const mcpToolsIcon = Codicon.tools;

const PLUGIN_COLLECTION_PREFIX = MCP_PLUGIN_COLLECTION_ID_PREFIX;

const COPILOT_EXTENSION_IDS = ['github.copilot', 'github.copilot-chat'];

function isCopilotExtension(id: ExtensionIdentifier): boolean {
	return COPILOT_EXTENSION_IDS.some(copilotId => ExtensionIdentifier.equals(id, copilotId));
}

function getPluginUriFromCollectionId(collectionId: string | undefined): string | undefined {
	return collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX) ? collectionId.slice(PLUGIN_COLLECTION_PREFIX.length) : undefined;
}

/**
 * Where a server came from, phrased for line two of a row. Extension provenance cannot be read
 * off the collection id — extension collections are keyed `<extensionId>/<collectionId>` — so the
 * caller resolves it from the registry and passes it in.
 */
function getCollectionOriginLabel(collectionId: string | undefined, source: unknown): string {
	if (collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX)) {
		return localize('originPlugin', "Plugin");
	}
	// Copilot ships MCP servers through an extension, but users experience them as part of the
	// product, so they read as built-in rather than as something they installed.
	if (source instanceof ExtensionIdentifier && !isCopilotExtension(source)) {
		return localize('originExtension', "Extension");
	}
	return localize('originBuiltin', "Built-in");
}

function getScopeOriginLabel(scope: LocalMcpServerScope | undefined): string | undefined {
	switch (scope) {
		case LocalMcpServerScope.Workspace:
			return localize('originWorkspace', "Workspace");
		case LocalMcpServerScope.User:
		case LocalMcpServerScope.RemoteUser:
			// A remote-user server is still the user's own choice; where the profile lives is
			// not a distinction this row is trying to draw, and dropping it left line two blank.
			return localize('originUser', "User");
		default:
			return undefined;
	}
}

/**
 * Reads the facts a row shows about a running server. Tools are read even when the server is
 * stopped: {@link McpServerCacheState.Cached} means we know what it offers from its last run,
 * which is exactly what someone deciding whether to enable it wants to see.
 */
/**
 * Whether a cache state means "we know what tools this server has".
 *
 * `RefreshingFromUnknown` is a first refresh in flight: no tools have ever been read, so an
 * empty list means "not yet", not "none". Treating it as a known result reported a server as
 * offering no tools while its very first request was still outstanding.
 */
export function hasKnownMcpTools(cacheState: McpServerCacheState | undefined): boolean {
	return cacheState !== undefined
		&& cacheState !== McpServerCacheState.Unknown
		&& cacheState !== McpServerCacheState.RefreshingFromUnknown;
}

/**
 * Whether the tools currently shown came from the cache rather than a live connection.
 *
 * `RefreshingFromCached` is a refresh over cached tools: what is on screen is still the cached
 * set until the refresh lands, so it keeps the same "from the last time this ran" caveat.
 */
export function areMcpToolsFromCache(cacheState: McpServerCacheState | undefined): boolean {
	return cacheState === McpServerCacheState.Cached
		|| cacheState === McpServerCacheState.Outdated
		|| cacheState === McpServerCacheState.RefreshingFromCached;
}

function readServerFacts(server: IMcpServer | undefined, reader: IReader): { toolCount?: number; toolsFromCache?: boolean; transport?: string } {
	if (!server) {
		return {};
	}

	const cacheState = server.cacheState.read(reader);
	const tools = server.tools.read(reader);
	const toolsFromCache = areMcpToolsFromCache(cacheState);

	const launch = server.readDefinitions().read(reader).server?.launch;
	const transport = launch?.type === McpServerTransportType.HTTP
		? localize('transportHttp', "HTTP")
		: launch?.type === McpServerTransportType.Stdio
			? localize('transportLocal', "Local")
			: undefined;

	return {
		toolCount: hasKnownMcpTools(cacheState) ? tools.length : undefined,
		toolsFromCache,
		transport,
	};
}

/**
 * Sections answer one question -- *where is this server defined?* -- ordered from the user's own
 * choices outwards to the product's. An earlier version collapsed these to "yours" and "provided"
 * on the theory that the five original groups mixed two axes; they did not. Workspace/User and
 * Extension/Plugin/Built-in are all answers to that same question. What was actually wrong was
 * splitting Extension from Plugin, which are one thing to a user ("software I installed"), and
 * leading with Workspace rather than the user's own settings.
 *
 * Grouping by origin also lets the rows stop repeating it: "Workspace" belongs once in a header,
 * not on every row underneath it.
 */
type McpGroupId = 'user' | 'workspace' | 'installed' | 'builtin';

/**
 * Represents a collapsible group header in the MCP server list.
 */
interface IMcpGroupHeaderEntry extends ICustomizationGroupHeaderEntry {
	readonly scope: McpGroupId;
}

/**
 * Represents an individual MCP server item in the list.
 */
interface IMcpServerItemEntry {
	readonly type: 'server-item';
	readonly server: IWorkbenchMcpServer;
	/** Shown on the row only when the section header does not already say it. */
	readonly origin?: string;
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
	/**
	 * The durable choice for this agent-host server. It has one: the context menu's Disable
	 * writes it. Treating `server.enabled` as the only layer made every disabled agent-host row
	 * claim it had been turned off for the session, whatever the user had actually chosen.
	 */
	readonly enablement?: ContributionEnablementState;
	/** Writes the durable layer. Paired with `server.setEnabled` for the session layer. */
	readonly setDurableEnabled?: (enabled: boolean) => void;
}

/** Reads and writes the durable enablement of servers belonging to an agent-host session. */
export interface IAgentHostDurableEnablement {
	read(serverName: string): ContributionEnablementState;
	write(serverName: string, state: ContributionEnablementState): void;
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
	/** Shown on the row only when the section header does not already say it. */
	readonly origin?: string;
	/** The origin the header implies; rendered only if the meta line would otherwise be empty. */
	readonly impliedOrigin?: string;
	readonly activeSessionServer?: AgentHostMcpServer;
	readonly localServer?: IMcpServer;
}

export type AgentHostMcpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

export function createActiveSessionMcpEntries(servers: readonly AgentHostMcpServer[], durable?: IAgentHostDurableEnablement): readonly IMcpSessionServerItemEntry[] {
	return servers.map(server => ({
		type: 'session-server-item',
		server,
		enablement: durable?.read(server.name),
		setDurableEnabled: durable && (enabled => durable.write(server.name, enabled
			? ContributionEnablementState.EnabledProfile
			: ContributionEnablementState.DisabledProfile)),
	}));
}

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
	/** Status word + dot, rendered next to the name so state reads as part of the server's identity. */
	readonly status: HTMLElement;
	readonly description: HTMLElement;
	/**
	 * Holds everything in the trailing slot that is rebuilt on every status change: the tool
	 * count and the inline buttons. The switch deliberately lives outside it -- see below.
	 */
	readonly actions: HTMLElement;
	/**
	 * Built once and reused for the life of the template. Rebuilding it per status change would
	 * remove the element a keyboard user is standing on: toggling notifies synchronously, which
	 * re-runs the status autorun, which would tear the focused button out of the document.
	 */
	readonly enablementSwitch: EnablementSwitch;
	/**
	 * What the trailing slot and meta line were last built from. The status autorun fires far
	 * more often than its inputs change -- several times a second for a server stuck in an
	 * error retry loop -- and rebuilding on every tick destroys the buttons mid-interaction.
	 */
	renderedSignature?: string;
	/** Which row the signature belongs to, so a recycled template cannot reuse another row's. */
	renderedRowKey?: string;
	readonly elementDisposables: DisposableStore;
	readonly actionDisposables: DisposableStore;
	/** Static, per-element facts that the dynamic status update needs to re-render line two. */
	context: IMcpRowContext;
}

/** The parts of a row that don't change while the row is bound to an element. */
interface IMcpRowContext {
	/** Where the server came from, e.g. "Workspace", "Built-in". Always shown, so line two is never empty. */
	readonly origin?: string;
	/** The origin the header implies; rendered only if the meta line would otherwise be empty. */
	readonly impliedOrigin?: string;
	readonly description?: string;
}

/** The parts of a row that come from observables and change while the row is bound. */
interface IMcpRowState {
	readonly status: McpStatusKind | undefined;
	/** Populated for {@link McpConnectionState.Kind.Error} so the failure can be read in place. */
	readonly errorMessage?: string;
	readonly toolCount?: number;
	/** Tools came from {@link McpServerCacheState.Cached}, i.e. they're last-known rather than live. */
	readonly toolsFromCache?: boolean;
	readonly transport?: string;
	/**
	 * Which layer turned this server off, when that is not simply "everywhere". Rendered next to
	 * the status word so a workspace- or session-specific choice is visible while scanning,
	 * rather than something you can only discover by opening a menu.
	 */
	readonly statusScope?: string;
	/**
	 * The durable enablement this row was rendered from. Read once, in the same autorun as the
	 * status, so the switch and the status word can never disagree about the same server.
	 */
	readonly enablement?: ContributionEnablementState;
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
		@IMcpService private readonly mcpService: IMcpService,
	) { }

	renderTemplate(container: HTMLElement): IMcpServerItemTemplateData {
		container.classList.add('mcp-server-item');

		const typeIcon = DOM.append(container, $('.mcp-server-icon'));
		typeIcon.classList.add(...ThemeIcon.asClassNameArray(mcpServerIcon));

		const details = DOM.append(container, $('.mcp-server-details'));
		const nameRow = DOM.append(details, $('.mcp-server-name-row'));
		const name = DOM.append(nameRow, $('.mcp-server-name'));
		// Status sits next to the name, not in the far-right actions slot: it describes the
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
		// The list re-splices on every MCP service change -- several times a second while a
		// server sits in an error retry loop -- and each splice re-renders every row. The row's
		// DOM is reused across those renders, so tearing down the trailing slot each time
		// destroys buttons the user may be pressing. Keep it when the same row is re-rendered
		// with the same content; `updateStatus` decides that from the signature below.
		const rowKey = getMcpRowKey(element);
		if (templateData.renderedRowKey !== rowKey) {
			templateData.renderedRowKey = rowKey;
			templateData.renderedSignature = undefined;
			templateData.actionDisposables.clear();
			DOM.clearNode(templateData.actions);
		}
		// Always re-created: these autoruns capture `element`, which is a fresh object per splice.
		templateData.elementDisposables.clear();

		if (element.type === 'builtin-item') {
			templateData.container.classList.add('builtin');
			templateData.container.classList.remove('has-detail');
			templateData.name.textContent = formatDisplayName(element.label);
			templateData.context = {
				origin: element.origin,
				impliedOrigin: element.impliedOrigin,
				description: element.description ? truncateToFirstLine(element.description) : undefined,
			};
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
			templateData.container.classList.remove('has-detail');
			templateData.name.textContent = formatDisplayName(element.server.name);
			// Named on the row, not left to the header: these sit in Built-in beside VS Code's
			// own servers, so the row is the only place that can say which product this one
			// came with. It has to be the leading `origin` rather than the `impliedOrigin`
			// fallback, because a failing server fills line two with its error and would
			// otherwise never say where it came from -- exactly the row you most need to
			// place. Rows that came with VS Code stay unmarked: the header already said that,
			// and in a window with no agent there is nothing to tell them apart from.
			templateData.context = { origin: getAgentOriginLabel(this.customizationHarnessService.getActiveDescriptor().agentName) };
			this.updateActiveSessionStatus(templateData, element);
			return;
		}

		templateData.container.classList.remove('builtin');
		templateData.name.textContent = formatDisplayName(element.server.label);
		const description = element.server.description?.trim();
		// Every server row opens a detail page, so every server row gets the affordance that
		// says so. Leaving this on gallery rows only made installed rows -- the common case --
		// render a plain arrow over something that was in fact clickable.
		const isGallery = !element.server.local;
		templateData.container.classList.add('has-detail');
		templateData.context = {
			// Set only when the section header does not already answer it.
			origin: element.origin,
			impliedOrigin: isGallery ? undefined : getScopeOriginLabel(element.server.local?.scope),
			description: description ? truncateToFirstLine(description) : undefined,
		};

		if (element.activeSessionServer) {
			this.updateKnownServerStatus(templateData, element);
		} else if (this.workspaceService.isSessionsWindow) {
			this.updateKnownServerStatus(templateData, element);
		} else {
			templateData.elementDisposables.add(autorun(reader => {
				const enablement = element.localServer?.enablement.read(reader);
				const disabled = enablement !== undefined ? isContributionDisabled(enablement) : false;
				const connectionState = element.localServer?.connectionState.read(reader);
				templateData.container.classList.toggle('disabled', disabled);
				this.updateStatus(templateData, element, {
					// An installed server that isn't running is idle, not stateless. Only gallery
					// entries — which the user hasn't installed — legitimately have no status.
					status: disabled ? 'disabled' : connectionState?.state ?? (isGallery ? undefined : McpConnectionState.Kind.Stopped),
					statusScope: disabled && enablement !== undefined && isWorkspaceScopedEnablement(enablement) ? getStatusScopeNote(McpEnablementScope.Workspace) : undefined,
					enablement,
					errorMessage: connectionState?.state === McpConnectionState.Kind.Error ? connectionState.message : undefined,
					...readServerFacts(element.localServer, reader),
				});
			}));
		}
	}

	private updateKnownServerStatus(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpBuiltinItemEntry): void {
		const isGallery = element.type === 'server-item' && !element.server.local;
		templateData.elementDisposables.add(autorun(reader => {
			const enablement = element.localServer?.enablement.read(reader);
			const activeSessionServer = element.activeSessionServer;
			const connectionState = element.localServer?.connectionState.read(reader);

			// Status and error are resolved together, from whichever source won. Reading the
			// error from the local runtime regardless meant a row could show the session's
			// status beside an unrelated local failure -- or say "Failed" with nothing to read.
			let status: McpStatusKind | undefined;
			let errorMessage: string | undefined;
			const { disabled, scope: statusScope } = resolveMcpDisabledState(enablement, activeSessionServer?.enabled);
			if (disabled) {
				status = 'disabled';
			} else if (activeSessionServer) {
				status = activeSessionServer.status;
				errorMessage = getAgentHostServerError(activeSessionServer);
			} else {
				status = connectionState?.state ?? (isGallery ? undefined : McpConnectionState.Kind.Stopped);
				errorMessage = connectionState?.state === McpConnectionState.Kind.Error ? connectionState.message : undefined;
			}

			templateData.container.classList.toggle('disabled', disabled);
			this.updateStatus(templateData, element, {
				status,
				statusScope,
				enablement,
				errorMessage,
				...readServerFacts(element.localServer, reader),
			});
		}));
	}

	private updateActiveSessionStatus(templateData: IMcpServerItemTemplateData, element: IMcpSessionServerItemEntry): void {
		const { disabled, scope } = resolveMcpDisabledState(element.enablement, element.server.enabled);
		templateData.container.classList.toggle('disabled', disabled);
		this.updateStatus(templateData, element, {
			status: disabled ? 'disabled' : element.server.status,
			statusScope: scope,
			enablement: element.enablement,
			errorMessage: disabled ? undefined : getAgentHostServerError(element.server),
		});
	}

	private updateStatus(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, rowState: IMcpRowState): void {
		// Rebuilding tears down and recreates the inline buttons. A DOM node that is replaced
		// between mousedown and mouseup never receives a click at all, so an unconditional
		// rebuild here made "Show Output" unclickable on precisely the rows that need it: an
		// erroring server re-runs this autorun about twice a second while rendering the exact
		// same thing every time. Only touch the DOM when something visible actually moved.
		// The signature has to cover everything this method renders, including the static
		// context, because renderMetaLine draws from it. Leaving it out meant an edit to a
		// server's description or origin was dropped whenever its runtime state happened to be
		// unchanged: the row was reused, the new context was stored, and the early return
		// below kept the old text on screen.
		const activeSessionServer = getActiveSessionServer(element);
		const signature = JSON.stringify([
			rowState.status, rowState.statusScope, rowState.errorMessage, rowState.enablement,
			rowState.toolCount, rowState.toolsFromCache, rowState.transport,
			activeSessionServer?.id, activeSessionServer?.enabled, activeSessionServer?.status,
			templateData.context.origin, templateData.context.impliedOrigin, templateData.context.description,
		]);
		if (templateData.renderedSignature === signature) {
			return;
		}
		templateData.renderedSignature = signature;

		templateData.actionDisposables.clear();
		DOM.clearNode(templateData.actions);
		DOM.clearNode(templateData.status);
		templateData.status.className = 'mcp-server-status';

		const { status: state, errorMessage } = rowState;

		// Status reads as a word next to the name. Every state gets one, including the states that
		// previously resolved to an icon-less presentation and therefore rendered nothing at all.
		const presentation = shouldShowStatusOnRow(state, rowState.statusScope) ? getMcpStatusPresentation(state) : undefined;
		if (presentation) {
			templateData.status.classList.add(presentation.className);
			DOM.append(templateData.status, $('.mcp-server-status-dot'));
			DOM.append(templateData.status, $('.mcp-server-status-label')).textContent =
				formatMcpStatusWithScope(presentation.label, rowState.statusScope);
		}

		this.renderMetaLine(templateData, rowState);

		const label = getMcpEntryLabel(element);
		const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
		const showActiveSessionOutput = activeSessionServer
			? (beforeShow?: () => Promise<void>) => this.agentHostCustomizationService.showMcpServerLog(activeSessionResource, activeSessionServer.id, beforeShow)
			: undefined;

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

		// The error text itself is already on line two. This is the escape hatch to the full log,
		// and it is an explicit, labelled action rather than the only way to learn a row failed.
		const showOutput = state === McpServerStatus.Error || state === McpConnectionState.Kind.Error
			? getMcpServerOutputHandler(this.outputService, element.type === 'session-server-item' ? undefined : element.localServer, activeSessionServer, this._afterShowOutput, showActiveSessionOutput)
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

		if (errorMessage) {
			// Anchored to the line the error is printed on, not the row. Built-in rows already
			// register a provenance hover on the container, and the hover service keys delayed
			// hovers by target element -- two registrations on one element overwrite each other's
			// entry, so whichever was torn down last took the survivor's keyboard hover with it.
			templateData.actionDisposables.add(this.hoverService.setupDelayedHover(templateData.description, () => ({
				content: errorMessage,
				appearance: { compact: false, skipFadeInAnimation: true },
			})));
		}

		this.renderEnablementSwitch(templateData, element, rowState, label);
	}

	/**
	 * Renders the on/off switch at the trailing edge of an installed row.
	 *
	 * It is the last thing in the row on purpose: every installed row has one, in the same place,
	 * so disabling a server is a single predictable target rather than a right-click someone has
	 * to guess at. Gallery rows get none — there is nothing to enable until the server exists.
	 */
	private renderEnablementSwitch(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, rowState: IMcpRowState, label: string): void {
		const toggle = templateData.enablementSwitch;
		const target = getEnablementTarget(element, this.mcpService, rowState.enablement);
		toggle.setVisible(!!target);
		if (!target) {
			return;
		}

		const checked = target.isEnabled();
		// The accessible name is the server, not the act. A `role="switch"` announces its own
		// state from aria-checked, so an action phrase here would read "Disable Redis, switch,
		// on" -- a label arguing with the state beside it. The hover still names the act,
		// because a pointer user has no announced state to go on.
		toggle.update(checked, label);
		templateData.actionDisposables.add(toggle.onDidToggle(() => target.setEnabled(!target.isEnabled())));
		templateData.actionDisposables.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('element'),
			toggle.element,
			getEnablementSwitchLabel(label, checked)));
	}

	/**
	 * Renders line two: where the server came from, how it connects, and either the failure
	 * reason or the description. Origin is always known, so the line is never blank and rows
	 * can share a single height.
	 */
	private renderMetaLine(templateData: IMcpServerItemTemplateData, rowState: IMcpRowState): void {
		DOM.clearNode(templateData.description);
		templateData.description.classList.toggle('is-error', !!rowState.errorMessage);

		const parts: { text: string; isError?: boolean; isContext?: boolean }[] = [];
		if (templateData.context.origin) {
			parts.push({ text: templateData.context.origin, isContext: true });
		}
		// Transport is context you only care about when things work. A failure needs every
		// pixel of this line, so it drops out rather than truncating the error to nothing.
		if (rowState.transport && !rowState.errorMessage) {
			parts.push({ text: rowState.transport, isContext: true });
		}

		// A failure replaces the description: when something is broken, that is the only thing
		// on this line worth the user's attention.
		if (rowState.errorMessage) {
			parts.push({ text: truncateToFirstLine(rowState.errorMessage), isError: true });
		} else if (templateData.context.description) {
			parts.push({ text: templateData.context.description });
		}

		if (!parts.length) {
			// Origin normally lives in the section header rather than on the row. A row with no
			// transport and no description would otherwise leave line two blank, so it comes back
			// here -- repetition is better than a gap under the name.
			if (!templateData.context.impliedOrigin) {
				templateData.description.style.display = 'none';
				return;
			}
			parts.push({ text: templateData.context.impliedOrigin, isContext: true });
		}

		templateData.description.style.display = '';
		parts.forEach((part, index) => {
			if (index > 0) {
				DOM.append(templateData.description, $('span.mcp-server-meta-separator')).textContent = '·';
			}
			const span = DOM.append(templateData.description, $('span'));
			span.textContent = part.text;
			if (part.isError) {
				span.classList.add('mcp-server-meta-error');
			}
			if (part.isContext) {
				span.classList.add('mcp-server-meta-context');
			}
		});
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

export function getMcpStatusPresentation(state: McpStatusKind | undefined): IMcpStatusPresentation | undefined {
	if (state === undefined) {
		return undefined;
	}
	if (state === 'disabled') {
		return { label: localize('disabled', "Disabled"), className: 'disabled' };
	}
	switch (state) {
		case McpConnectionState.Kind.Running:
		case McpServerStatus.Ready:
			return { label: localize('running', "Running"), className: 'running' };
		case McpConnectionState.Kind.Starting:
		case McpServerStatus.Starting:
			return { label: localize('starting', "Starting"), className: 'starting' };
		case McpServerStatus.AuthRequired:
			return { label: localize('authRequired', "Sign-in needed"), className: 'auth-required' };
		case McpConnectionState.Kind.Error:
		case McpServerStatus.Error:
			return { label: localize('error', "Failed"), className: 'error' };
		case McpConnectionState.Kind.Stopped:
		case McpServerStatus.Stopped:
		default:
			return { label: localize('stopped', "Idle"), className: 'stopped' };
	}
}

/**
 * Whether a status is worth saying at all.
 *
 * Running and Idle are lifecycle, not news. VS Code starts MCP servers lazily -- a server
 * launches when a tool call needs it and shuts down afterwards -- so whether a process happens
 * to be alive right now is an implementation detail that flickers and that nobody acts on.
 * Printing it made the most common word in the list also the least informative one.
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

/**
 * Whether a *row* should print the status word.
 *
 * Stricter than {@link isNoteworthyMcpStatus} by one case: every installed row carries a switch,
 * and a switch already shows off-ness better than a word can. "Off" beside an off switch is the
 * same fact twice. A scope note is different -- "Off (Workspace)" says *where* the choice lives,
 * which the switch has no way to express.
 */
function shouldShowStatusOnRow(state: McpStatusKind | undefined, statusScope: string | undefined): boolean {
	if (state === 'disabled') {
		return !!statusScope;
	}
	return isNoteworthyMcpStatus(state);
}

/**
 * What to call the agent a server came with, for rows that sit in Built-in beside VS Code's
 * own servers. Harnesses that do not name their agent fall back to describing the machinery,
 * which is the only honest thing left to say.
 */
export function getAgentOriginLabel(agentName: string | undefined): string {
	return agentName ?? localize('originAgentHost', "Agent host");
}

/**
 * Resolves whether a server is off and which layer holds it there.
 *
 * Durable outranks session: if the user disabled a server outright, saying "(Session)" would
 * describe their choice as narrower than it was. The scope note only appears when the layer is
 * genuinely narrower than everywhere -- a workspace choice, or a session-only one.
 *
 * Shared by the row, the accessible name, and the switch so they cannot disagree about which
 * layer a "Disabled" refers to. Three copies of this rule previously did, and two were wrong.
 */
export function resolveMcpDisabledState(enablement: ContributionEnablementState | undefined, sessionEnabled: boolean | undefined): { readonly disabled: boolean; readonly scope: string | undefined } {
	if (enablement !== undefined && isContributionDisabled(enablement)) {
		return {
			disabled: true,
			scope: isWorkspaceScopedEnablement(enablement) ? getStatusScopeNote(McpEnablementScope.Workspace) : undefined,
		};
	}
	if (sessionEnabled === false) {
		return { disabled: true, scope: getStatusScopeNote(McpEnablementScope.Session) };
	}
	return { disabled: false, scope: undefined };
}

function getActiveSessionServer(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): AgentHostMcpServer | undefined {
	return entry.type === 'session-server-item' ? entry.server : entry.activeSessionServer;
}

/**
 * Content identity of a row. List entries are rebuilt on every refresh, so object identity says
 * nothing about whether this is still the same server in the same place.
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

function getMcpEntryLabel(element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): string {
	return element.type === 'session-server-item'
		? element.server.name
		: element.type === 'builtin-item'
			? element.label
			: element.server.label;
}

/**
 * Resolves the status a row is *showing*, for the accessible name.
 *
 * This must mirror `updateKnownServerStatus` exactly. It previously returned nothing for
 * built-in rows and for every row in the Agents window, which was harmless only while those
 * rows also rendered no status; now that every installed row always shows a word, a screen
 * reader would have been the one place the word went missing.
 */
function getMcpStatusKind(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, reader?: IReader): McpStatusKind | undefined {
	if (entry.type === 'session-server-item') {
		return resolveMcpDisabledState(entry.enablement, entry.server.enabled).disabled ? 'disabled' : entry.server.status;
	}
	const enablement = entry.localServer?.enablement.read(reader);
	if (resolveMcpDisabledState(enablement, entry.activeSessionServer?.enabled).disabled) {
		return 'disabled';
	}
	if (entry.activeSessionServer) {
		return entry.activeSessionServer.status;
	}
	// Gallery rows are the one kind with no status: nothing is installed to have one yet.
	const isGallery = entry.type === 'server-item' && !entry.server.local;
	return entry.localServer?.connectionState.read(reader).state ?? (isGallery ? undefined : McpConnectionState.Kind.Stopped);
}

/** The layer holding a row off, so "Off" is not ambiguous when it is only spoken. */
function getMcpStatusScopeNote(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, reader?: IReader): string | undefined {
	if (entry.type === 'session-server-item') {
		return resolveMcpDisabledState(entry.enablement, entry.server.enabled).scope;
	}
	return resolveMcpDisabledState(entry.localServer?.enablement.read(reader), entry.activeSessionServer?.enabled).scope;
}

/**
 * The accessible name for a row, as an observable.
 *
 * It has to be observable because a row's status changes without the list being spliced: the
 * visual word is driven by an autorun over `connectionState`, and nothing re-renders the row
 * around it. A plain string would be computed once and then quietly describe the past.
 */
export function observeMcpEntryAriaLabel(element: IMcpListEntry): IObservable<string> {
	return derived(reader => getMcpEntryAriaLabel(element, reader));
}

export function getMcpEntryAriaLabel(element: IMcpListEntry, reader?: IReader): string {
	if (element.type === 'group-header') {
		return localize('mcpGroupAriaLabel', "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
	}
	const label = getMcpEntryLabel(element);
	// Deliberately looser than the row: a screen reader reads the row label without the switch
	// beside it, so "Off" is new information here even though it is duplication on screen.
	const kind = getMcpStatusKind(element, reader);
	const status = isNoteworthyMcpStatus(kind) ? getMcpStatusPresentation(kind) : undefined;
	if (!status) {
		return label;
	}
	// "Off" alone leaves the user with no way to find where it was turned off, which is the
	// one thing they need in order to turn it back on. Composed by the same helper the row
	// uses, so what is spoken and what is shown cannot drift apart.
	const statusText = formatMcpStatusWithScope(status.label, getMcpStatusScopeNote(element, reader));
	return localize('mcpServerAriaLabelWithStatus', "{0}, {1}", label, statusText);
}

/** Joins the status word to the layer holding it, e.g. "Off (Workspace)". */
export function formatMcpStatusWithScope(label: string, scope: string | undefined): string {
	return scope ? localize('mcpStatusWithScope', "{0} ({1})", label, scope) : label;
}

/**
 * Counts session servers that no installed or runtime server already accounts for.
 *
 * This exists so the sidebar badge cannot be moved by the search box. The matcher used to build
 * the list is consumed against the *filtered* server lists, so the narrower the query the fewer
 * session servers it claims -- reading its leftovers made the badge grow while typing. This
 * claims against the unfiltered lists instead, so the answer is a property of what the user has.
 */
export function countSessionOnlyMcpServers(
	sessionServers: readonly AgentHostMcpServer[],
	localServers: readonly IWorkbenchMcpServer[],
	runtimeServers: readonly IMcpServer[],
): number {
	const matcher = new ActiveSessionMcpServerMatcher(sessionServers);
	for (const server of localServers) {
		matcher.take(getWorkbenchServerMatchKeys(server));
	}
	for (const server of runtimeServers) {
		matcher.take(getRuntimeServerMatchKeys(server));
	}
	return matcher.unmatched('').length;
}

export class ActiveSessionMcpServerMatcher {
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

function matchesActiveSessionServerQuery(server: AgentHostMcpServer, query: string): boolean {
	if (!query) {
		return true;
	}
	return server.name.toLowerCase().includes(query);
}

/**
 * Why an agent-host server failed. Session rows previously said "Failed" and stopped there,
 * while local rows explained themselves inline -- the same word meaning less on half the list.
 */
function getAgentHostServerError(server: AgentHostMcpServer): string | undefined {
	const state = server.state;
	return state?.kind === McpServerStatus.Error ? state.error?.message : undefined;
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

/**
 * Creates durable profile/workspace actions for an agent-host-only server.
 *
 * As with the local variant, each one settles the running session as well, so "Disable" means
 * the server stops being used now rather than only from the next session onwards.
 */
export function getAgentHostMcpServerEnablementActions(agentHostCustomizations: IAgentHostCustomizationService, sessionResource: URI, server: AgentHostMcpServer, isEmptyWorkbench: boolean): IAction[] {
	const disabled = isContributionDisabled(agentHostCustomizations.getMcpServerEnablement(sessionResource, server.name));
	const settle = (state: ContributionEnablementState, enabled: boolean) => {
		agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, state);
		server.setEnabled(enabled);
	};
	const actions: IAction[] = [];
	if (disabled) {
		actions.push(new Action('mcpServer.agentHost.enable', localize('agentHostMcpServerEnable', "Enable"), undefined, true, () => {
			settle(ContributionEnablementState.EnabledProfile, true);
		}));
		if (!isEmptyWorkbench) {
			actions.push(new Action('mcpServer.agentHost.enableWorkspace', localize('agentHostMcpServerEnableForWorkspace', "Enable (Workspace)"), undefined, true, () => {
				settle(ContributionEnablementState.EnabledWorkspace, true);
			}));
		}
	} else {
		actions.push(new Action('mcpServer.agentHost.disable', localize('agentHostMcpServerDisable', "Disable"), undefined, true, () => {
			settle(ContributionEnablementState.DisabledProfile, false);
		}));
		if (!isEmptyWorkbench) {
			actions.push(new Action('mcpServer.agentHost.disableWorkspace', localize('agentHostMcpServerDisableForWorkspace', "Disable (Workspace)"), undefined, true, () => {
				settle(ContributionEnablementState.DisabledWorkspace, false);
			}));
		}
	}
	return actions;
}

/**
 * Creates durable profile/workspace actions for a locally backed built-in server row.
 *
 * Every one of these settles the running session too. Disabling a server that carried on
 * answering tool calls for the rest of the session is not disabling it; the menu was writing
 * the durable layer and leaving the live one alone, so the switch beside it and the menu item
 * above it disagreed about what the same word meant.
 */
export function getLocalMcpServerEnablementActions(mcpService: IMcpService, serverId: string, isEmptyWorkbench: boolean, activeSessionServer?: AgentHostMcpServer): IAction[] {
	const disabled = isContributionDisabled(mcpService.enablementModel.readEnabled(serverId));
	const settle = (state: ContributionEnablementState, enabled: boolean) => {
		mcpService.enablementModel.setEnabled(serverId, state);
		activeSessionServer?.setEnabled(enabled);
	};
	const actions: IAction[] = [];
	if (disabled) {
		actions.push(new Action('mcpServer.builtin.enable', localize('builtinMcpServerEnable', "Enable"), undefined, true, () => {
			settle(ContributionEnablementState.EnabledProfile, true);
		}));
		if (!isEmptyWorkbench) {
			actions.push(new Action('mcpServer.builtin.enableWorkspace', localize('builtinMcpServerEnableForWorkspace', "Enable (Workspace)"), undefined, true, () => {
				settle(ContributionEnablementState.EnabledWorkspace, true);
			}));
		}
	} else {
		actions.push(new Action('mcpServer.builtin.disable', localize('builtinMcpServerDisable', "Disable"), undefined, true, () => {
			settle(ContributionEnablementState.DisabledProfile, false);
		}));
		if (!isEmptyWorkbench) {
			actions.push(new Action('mcpServer.builtin.disableWorkspace', localize('builtinMcpServerDisableForWorkspace', "Disable (Workspace)"), undefined, true, () => {
				settle(ContributionEnablementState.DisabledWorkspace, false);
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

/**
 * Which layer a piece of state lives in.
 *
 * This describes *state*, not the switch: the switch is uniform. It survives so the row can
 * explain a server that something else turned off -- "Off (Workspace)" tells you the choice is
 * not the one you would make here, which is the difference between a puzzling row and a clear one.
 */
export const enum McpEnablementScope {
	/** Everywhere, for this user. */
	Global,
	/** Only in this workspace. */
	Workspace,
	/** Only for the running session. */
	Session,
}

export interface IMcpEnablementTarget {
	/**
	 * The layer this switch writes. Uniform for every durable row by design; session-only
	 * servers report Session because that is the only layer they have, not because the control
	 * means something different there.
	 */
	readonly scope: McpEnablementScope;
	isEnabled(): boolean;
	setEnabled(enabled: boolean): void;
}

/**
 * Resolves how a row's switch reads and writes enablement, or `undefined` when the row has none
 * to offer (a gallery result the user hasn't installed yet).
 *
 * A row can be held off by two independent layers: a durable profile/workspace policy, and — for
 * a live agent-host session — a session flag. Both are aligned together, because a switch that
 * leaves a server still visibly off after being turned on is a broken switch.
 */
export function getEnablementTarget(element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, mcpService: IMcpService, enablement: ContributionEnablementState | undefined): IMcpEnablementTarget | undefined {
	if (element.type === 'session-server-item') {
		const server = element.server;
		const setDurableEnabled = element.setDurableEnabled;
		return {
			// Global like every other row. These servers were previously treated as an exception
			// on the grounds that the session was the only layer they had, which was simply untrue
			// -- the context menu has always written a durable choice for them. Left as-is, the
			// switch could not undo what that menu item did.
			scope: McpEnablementScope.Global,
			isEnabled: () => !resolveMcpDisabledState(element.enablement, server.enabled).disabled,
			setEnabled: enabled => {
				setDurableEnabled?.(enabled);
				server.setEnabled(enabled);
			},
		};
	}

	const localServer = element.localServer;
	const activeSessionServer = element.activeSessionServer;
	if (!localServer || enablement === undefined) {
		return activeSessionServer
			? {
				scope: McpEnablementScope.Session,
				isEnabled: () => activeSessionServer.enabled !== false,
				setEnabled: enabled => activeSessionServer.setEnabled(enabled),
			}
			: undefined;
	}

	const id = localServer.definition.id;
	return {
		// One control, one meaning. The switch used to rewrite whichever layer happened to hold
		// the current choice, which made two identical-looking switches do materially different
		// things: "off until you turn it back on" and "off until this session ends" are not the
		// same act. Scoped choices are still available, but from the context menu, where they
		// are spelled out. Here the switch always means the whole, durable answer.
		scope: McpEnablementScope.Global,
		// A row can be held off by the durable choice, the session choice, or both. The switch
		// reflects the union, and flipping it aligns every layer that disagrees -- a switch that
		// leaves the server still visibly off after being turned on is a broken switch.
		isEnabled: () => isContributionEnabled(enablement) && activeSessionServer?.enabled !== false,
		setEnabled: enabled => {
			// Writing a profile-level state also clears any workspace entry (see
			// EnablementModel.setEnabled), which is what makes the promise on the label true:
			// a narrower choice cannot survive and silently mask what the user just asked for.
			mcpService.enablementModel.setEnabled(id, enabled
				? ContributionEnablementState.EnabledProfile
				: ContributionEnablementState.DisabledProfile);
			// Dispatched unconditionally: `enabled` here is a snapshot taken when the list was
			// built, and the durable write above notifies synchronously, which can rebuild the
			// list underneath this closure. Guarding on the stale value could drop the session
			// write entirely; re-asserting a value the session already holds is harmless.
			activeSessionServer?.setEnabled(enabled);
		},
	};
}

/**
 * Names the act, and only the act.
 *
 * The label used to name the layer being written too, which was honest but meant the same
 * control read differently from row to row. A switch is a binary control; it can carry one
 * meaning. Where a server lives is a property of the server, and the row already says it.
 */
function getEnablementSwitchLabel(name: string, checked: boolean): string {
	return checked
		? localize('mcpSwitchOff', "Disable {0}", name)
		: localize('mcpSwitchOn', "Enable {0}", name);
}

/** The scope note appended to `Off`, shown only when the reach is narrower than everywhere. */
function getStatusScopeNote(scope: McpEnablementScope): string | undefined {
	switch (scope) {
		case McpEnablementScope.Workspace:
			return localize('mcpScopeWorkspace', "Workspace");
		case McpEnablementScope.Session:
			return localize('mcpScopeSession', "Session");
		default:
			return undefined;
	}
}

function createBuiltinEntry(server: IMcpServer, origin: string | undefined, activeSessionServer: AgentHostMcpServer | undefined, impliedOrigin: string): IMcpBuiltinItemEntry {
	return {
		type: 'builtin-item',
		id: `builtin-${server.definition.id}`,
		label: server.definition.label,
		description: '',
		collectionId: server.collection.id,
		origin,
		impliedOrigin,
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
	private totalServerCount = 0;
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
		this.addButton.label = `$(${Codicon.add.id}) ${localize('addServer', "Add Server")}`;
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
						return observeMcpEntryAriaLabel(element);
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
			if (!e.element) {
				return;
			}
			// One rule per row shape, so a click never has to be guessed at. Group headers
			// collapse; every server row opens its detail page. The row was previously a
			// coin-flip between "opens a panel", "opens a quick pick", and "does nothing at
			// all", depending on whether a description happened to exist — and the panel it
			// sometimes opened only repeated what the row already said. Now the detail page
			// shows what the row cannot fit (the tool list, and what the server runs), so one
			// destination is worth having and every row can share it.
			if (e.element.type === 'group-header') {
				this.toggleGroup(e.element);
			} else if (e.element.type === 'server-item') {
				this._onDidSelectServer.fire(e.element.server);
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

		const matchesQuery = (label: string, description?: string): boolean =>
			!query || label.toLowerCase().includes(query) || !!description?.toLowerCase().includes(query);

		this.filteredServers = query
			? this.mcpWorkbenchService.local.filter(server => matchesQuery(server.label, server.description))
			: [...this.mcpWorkbenchService.local];

		// Find extension-provided servers not in the local list (e.g. GitHub MCP). Dedupe against
		// the *unfiltered* local list: a local server hidden by the query must still suppress its
		// runtime twin, otherwise searching makes duplicates appear.
		const localIds = new Set(this.mcpWorkbenchService.local.map(s => s.id));
		const allBuiltinServers = this.mcpService.servers.get().filter(s => !localIds.has(s.definition.id));
		const builtinServers = allBuiltinServers.filter(s => matchesQuery(s.definition.label));

		const userEntries: IMcpListEntry[] = [];
		const workspaceEntries: IMcpListEntry[] = [];
		const installedEntries: IMcpListEntry[] = [];
		const builtinEntries: IMcpListEntry[] = [];

		for (const server of this.filteredServers) {
			const entry: IMcpServerItemEntry = {
				type: 'server-item',
				server,
				activeSessionServer: activeSessionMatcher.take(getWorkbenchServerMatchKeys(server)),
				localServer: localServerMatcher.find(getWorkbenchServerMatchKeys(server)),
			};
			if (server.local?.scope === LocalMcpServerScope.Workspace) {
				workspaceEntries.push(entry);
			} else {
				userEntries.push(entry);
			}
		}

		// Extensions and plugins share a section because they are one thing to the user: software
		// they installed. The distinction still matters when acting on a row (a plugin is
		// uninstalled as a whole), so it survives on the row, where the header cannot say it.
		const collectionSources = new Map(this.mcpRegistry.collections.get().map(c => [c.id, c.source]));
		const builtinOriginLabel = localize('originBuiltin', "Built-in");
		for (const server of builtinServers) {
			const origin = getCollectionOriginLabel(server.collection.id, collectionSources.get(server.collection.id));
			const sessionServer = activeSessionMatcher.take(getRuntimeServerMatchKeys(server));
			if (origin === builtinOriginLabel) {
				builtinEntries.push(createBuiltinEntry(server, undefined, sessionServer, origin));
			} else {
				installedEntries.push(createBuiltinEntry(server, origin, sessionServer, origin));
			}
		}
		// Servers only the agent knows about join Built-in rather than getting a section of
		// their own. They arrive because you are using this agent, which is the same reason
		// VS Code's own servers are there; the row names which product it was.
		const activeSessionOnlyServers = activeSessionMatcher.unmatched(query);
		builtinEntries.push(...createActiveSessionMcpEntries(activeSessionOnlyServers, {
			read: name => this.agentHostCustomizationService.getMcpServerEnablement(activeSessionResource, name),
			write: (name, state) => this.agentHostCustomizationService.setMcpServerEnablement(activeSessionResource, name, state),
		}));

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

		// The agent's own name when this editor is backed by one, so Built-in can admit it
		// holds that agent's servers too.
		const agentName = this.customizationHarnessService.getActiveDescriptor().agentName;

		// Ordered from the user's own choices outwards to the product's. Empty sections are
		// skipped below, so at most four are shown.
		const groups: { id: McpGroupId; label: string; icon: ThemeIcon; description: string; entries: IMcpListEntry[] }[] = [
			{
				id: 'user',
				label: localize('userServersGroup', "User"),
				icon: userIcon,
				description: localize('userServersGroupDescription', "Servers in your user settings. They follow you into every workspace."),
				entries: userEntries,
			},
			{
				id: 'workspace',
				label: localize('workspaceServersGroup', "Workspace"),
				icon: workspaceIcon,
				description: localize('workspaceServersGroupDescription', "Servers configured in this workspace. They are shared with anyone who opens it."),
				entries: workspaceEntries,
			},
			{
				id: 'installed',
				label: localize('installedServersGroup', "Extensions & Plugins"),
				icon: extensionIcon,
				description: localize('installedServersGroupDescription', "Servers that came with software you installed. You can turn these off, but not edit them."),
				entries: installedEntries,
			},
			{
				id: 'builtin',
				label: localize('builtinServersGroup', "Built-in"),
				icon: builtinIcon,
				// Covers the agent's own servers too. A server that arrives because you are
				// using Copilot came with the product just as much as one that ships in
				// VS Code; which product it was is a distinction the row can make, and did
				// not need a section of its own.
				description: agentName
					? localize('builtinServersGroupDescriptionNamed', "Servers that come with VS Code or with {0}. You can turn these off, but not edit them here.", agentName)
					: localize('builtinServersGroupDescription', "Servers that come with VS Code. You can turn these off, but not edit them."),
				entries: builtinEntries,
			},
		];

		const entries: IMcpListEntry[] = [];
		let isFirst = true;
		for (const group of groups) {
			if (group.entries.length === 0) {
				continue;
			}
			const collapsed = this.collapsedGroups.has(group.id);
			entries.push({
				type: 'group-header',
				id: `mcp-group-${group.id}`,
				scope: group.id,
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

		this.displayEntries = entries;
		this.list.splice(0, this.list.length, this.displayEntries);

		// The sidebar badge counts what the user *has*, not what the current search matched.
		// Deriving it from the filtered arrays made typing in the search box silently rewrite
		// the tab's badge, which reads as servers disappearing.
		//
		// activeSessionMatcher cannot answer this: take() consumed it against the *filtered*
		// lists, so the narrower the query, the fewer session servers were claimed and the more
		// unmatched() returns -- the badge would grow while searching. Claim against the
		// unfiltered lists in a throwaway matcher to find the servers only the session knows.
		this.totalServerCount = this.mcpWorkbenchService.local.length
			+ allBuiltinServers.length
			+ countSessionOnlyMcpServers(
				this.agentHostCustomizationService.getMcpServers(activeSessionResource),
				this.mcpWorkbenchService.local,
				allBuiltinServers);
		this._onDidChangeItemCount.fire(this.itemCount);
	}

	/**
	 * Total number of MCP servers available, independent of the current search query.
	 */
	get itemCount(): number {
		return this.totalServerCount;
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
				const enablementActions = getLocalMcpServerEnablementActions(this.mcpService, e.element.localServer.definition.id, isEmptyWorkbench, e.element.activeSessionServer);
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
