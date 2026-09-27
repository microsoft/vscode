/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import './aiCustomizationColors.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { IMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Disposable, DisposableStore, isDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultInputBoxStyles, getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IQueryOptions, mcpAccessConfig, McpAccessValue } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IMcpGalleryManifestService } from '../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpCollectionDefinition, McpCollectionProvenance, McpConnectionState, McpServerDefinition, McpServerInstallState, IMcpService, IMcpServer, McpServerTransportType } from '../../../../contrib/mcp/common/mcpTypes.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../../../mcp/common/discovery/pluginMcpDiscovery.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ContributionEnablementState, isContributionDisabled, isContributionEnabled } from '../../common/enablement.js';
import { McpCommandIds } from '../../../../contrib/mcp/common/mcpCommandIds.js';
import { autorun, derived, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../base/common/uri.js';
import { InputBox, MessageType } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { ConfigureModelAccessAction, DisableMcpServerForWorkspaceAction, DisableMcpServerGloballyAction, EnableMcpServerForWorkspaceAction, EnableMcpServerGloballyAction, getContextMenuActions, RestartServerAction, ShowSamplingRequestsAction, ShowServerOutputAction, StartServerAction, StopServerAction } from '../../../../contrib/mcp/browser/mcpServerActions.js';
import { LocalMcpServerScope } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { mcpServerIcon } from './aiCustomizationIcons.js';
import { formatDisplayName, truncateToFirstLine } from './aiCustomizationListWidget.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { CustomizationMcpServerCompatibilityKind, getCustomizationDisabledLabel, ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { CustomizationEnablementKind, McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { ChatConfiguration } from '../../common/constants.js';
import { getCustomizationDisabledReason, getCustomizationEnablementDecision, getCustomizationScopeEnablement, type CustomizationDisabledReason } from '../../../../../platform/agentHost/common/customizationEnablement.js';
import { createAgentHostEnablePluginAction } from '../agentPluginActions.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { createWorkbenchMcpServerDetailInput, IMcpServerDetailInput } from './embeddedMcpServerDetail.js';
import { createCustomizationCardPrimaryAction, CustomizationCardListController, getVirtualizedSectionMinimumHeight, layoutVirtualizedSections, setVirtualizedRowActionsTabbable } from './customizationCardList.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { WorkbenchList, WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ExtensionEditorTab, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ActiveSessionMcpServerMatcher, type AgentHostMcpServer, getRuntimeServerMatchKeys, getUniqueMcpMatchKeys, isMcpServerInUse } from './mcpServerCount.js';
import { getConnectorActionLabel } from './connectorPresentation.js';
import { ICopilotConnector, ICopilotConnectorsService, IConnectedCopilotConnectorMcpServer } from './copilotConnectorsService.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeContentHeight, ICustomizationTreeGroup } from './customizationTree.js';
import { CustomizationToggle } from './customizationToggle.js';

export type { AgentHostMcpServer } from './mcpServerCount.js';

const $ = DOM.$;

const PLUGIN_COLLECTION_PREFIX = MCP_PLUGIN_COLLECTION_ID_PREFIX;
const MCP_INSTALLED_ITEM_HEIGHT = 44;
const MCP_MARKETPLACE_ITEM_HEIGHT = 58;

const COPILOT_EXTENSION_IDS = ['github.copilot', 'github.copilot-chat'];

function isCopilotExtension(id: ExtensionIdentifier): boolean {
	return COPILOT_EXTENSION_IDS.some(copilotId => ExtensionIdentifier.equals(id, copilotId));
}

function getPluginUriFromCollectionId(collectionId: string | undefined): string | undefined {
	return collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX) ? collectionId.slice(PLUGIN_COLLECTION_PREFIX.length) : undefined;
}

function createInstalledPluginItem(plugin: IAgentPlugin): IAgentPluginItem {
	return {
		kind: AgentPluginItemKind.Installed,
		name: plugin.label,
		description: plugin.fromMarketplace?.description ?? '',
		marketplace: plugin.fromMarketplace?.marketplace,
		plugin,
	};
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
	readonly extensionId?: ExtensionIdentifier;
	readonly activeSessionServer?: AgentHostMcpServer;
	readonly localServer?: IMcpServer;
	readonly connector?: IConnectedCopilotConnectorMcpServer;
}

export function createBuiltinActiveSessionMcpEntries(servers: readonly AgentHostMcpServer[]): readonly IMcpSessionServerItemEntry[] {
	return servers.map(server => ({ type: 'session-server-item', server }));
}

export function isMcpServerCollectionVisible(collectionId: string, hiddenCollectionIds: readonly string[] | undefined): boolean {
	return !hiddenCollectionIds?.includes(collectionId);
}

export type IMcpInstalledEntry = IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry;

interface IMcpMarketplaceEntry {
	readonly type: 'marketplace-item';
	readonly server: IWorkbenchMcpServer;
}

interface IMcpGroupHeaderEntry extends ICustomizationGroupHeaderEntry {
	readonly group: string;
}

type IMcpSectionEntry = IMcpGroupHeaderEntry | IMcpInstalledEntry | IMcpMarketplaceEntry;

interface IMcpSectionList {
	readonly list: WorkbenchList<IMcpSectionEntry>;
	readonly delegate: McpSectionDelegate;
	readonly entries: readonly IMcpSectionEntry[];
	readonly container: HTMLElement;
	readonly key: string;
}

class McpSectionDelegate implements IListVirtualDelegate<IMcpSectionEntry> {
	constructor(private readonly getInstalledHeight: (element: IMcpInstalledEntry) => number) { }

	getHeight(element: IMcpSectionEntry): number {
		if (element.type === 'group-header') {
			return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		return element.type === 'marketplace-item' ? MCP_MARKETPLACE_ITEM_HEIGHT : this.getInstalledHeight(element);
	}

	getTemplateId(element: IMcpSectionEntry): string {
		if (element.type === 'group-header') {
			return 'mcpGroupHeader';
		}
		return element.type === 'marketplace-item' ? 'mcpMarketplaceItem' : 'mcpServerItem';
	}
}

export interface IMcpInstalledPresentation {
	readonly entry: IMcpInstalledEntry;
}

export function preserveMcpEntryOrder(entries: readonly IMcpInstalledPresentation[], order: Map<string, number>): IMcpInstalledPresentation[] {
	let nextOrder = order.size;
	for (const { entry } of entries) {
		const key = getMcpRowKey(entry);
		if (!order.has(key)) {
			order.set(key, nextOrder++);
		}
	}
	return [...entries].sort((left, right) => order.get(getMcpRowKey(left.entry))! - order.get(getMcpRowKey(right.entry))!);
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
	readonly name: HTMLElement;
	readonly secondaryLine: HTMLElement;
	readonly compatibilityMessage: HTMLElement;
	readonly compatibilityMessageDisposables: DisposableStore;
	compatibilityLink?: HTMLAnchorElement;
	readonly sourcePath: HTMLElement;
	readonly sourcePathHover: IManagedHover;
	readonly description: HTMLElement;
	readonly descriptionHover: IManagedHover;
	readonly issue: HTMLElement;
	readonly issueHover: IManagedHover;
	readonly actions: HTMLElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	readonly actionDisposables: DisposableStore;
	/** Which row the actions currently belong to, so a recycled template cannot reuse another row's. */
	renderedRowKey?: string;
	/** What the actions currently show, so an unchanged status does not rebuild them. */
	renderedStatusSignature?: string;
	currentElement?: IMcpInstalledEntry;
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
export class McpServerItemRenderer extends Disposable implements IListRenderer<IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, IMcpServerItemTemplateData> {
	readonly templateId = 'mcpServerItem';
	private readonly _templates = new Set<IMcpServerItemTemplateData>();
	private _focusedRowKey: string | undefined;

	constructor(
		private readonly _renderManagementActions: (getEntry: () => IMcpInstalledEntry | undefined, actions: HTMLElement, disposables: DisposableStore, updateTabbability: () => void) => void,
		private readonly _getCompatibilityKind: (entry: IMcpInstalledEntry, reader?: IReader) => CustomizationMcpServerCompatibilityKind | undefined,
		private readonly _openPlugin: (plugin: IAgentPlugin) => void,
		private readonly _openMigrations: () => void,
		private readonly _showOutput: (entry: IMcpInstalledEntry) => Promise<void>,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@ILabelService private readonly labelService: ILabelService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) { super(); }

	renderTemplate(container: HTMLElement): IMcpServerItemTemplateData {
		const templateDisposables = new DisposableStore();
		container.classList.add('mcp-server-item');
		container.style.minHeight = `${MCP_INSTALLED_ITEM_HEIGHT}px`;

		const details = DOM.append(container, $('.mcp-server-details'));
		const nameRow = DOM.append(details, $('.mcp-server-name-row'));
		const name = DOM.append(nameRow, $('.mcp-server-name'));

		const secondaryLine = DOM.append(details, $('.mcp-server-secondary-line'));
		const sourcePath = DOM.append(secondaryLine, $('a.mcp-server-source-path'));
		const sourcePathHover = templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), sourcePath, ''));
		const compatibilityMessage = DOM.append(secondaryLine, $('.mcp-server-compatibility-message'));
		const compatibilityMessageDisposables = templateDisposables.add(new DisposableStore());
		const description = DOM.append(details, $('.mcp-server-description'));
		const descriptionHover = templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), description, ''));
		const issue = DOM.append(details, $('.mcp-server-issue'));
		const issueHover = templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), issue, ''));

		const actions = DOM.append(container, $('.mcp-server-actions'));

		const template: IMcpServerItemTemplateData = {
			container,
			name,
			secondaryLine,
			compatibilityMessage,
			compatibilityMessageDisposables,
			sourcePath,
			sourcePathHover,
			description,
			descriptionHover,
			issue,
			issueHover,
			actions,
			templateDisposables,
			elementDisposables: new DisposableStore(),
			actionDisposables: new DisposableStore(),
		};
		this._templates.add(template);
		return template;
	}

	renderElement(element: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry, _index: number, templateData: IMcpServerItemTemplateData): void {
		this.renderEntry(element, templateData);
	}

	private renderEntry(element: IMcpInstalledEntry, templateData: IMcpServerItemTemplateData): void {
		templateData.currentElement = element;
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
		const source = getMcpEntrySource(element, this.labelService, this.agentPluginService, this.extensionsWorkbenchService, this._openPlugin);
		if (source?.open) {
			templateData.sourcePath.textContent = source.label;
			templateData.sourcePath.style.display = '';
			templateData.sourcePathHover.update(source.hover);
			templateData.sourcePath.classList.toggle('source-link', source.open !== undefined);
			if (source.open && source.ariaLabel) {
				templateData.sourcePath.setAttribute('href', '#');
				templateData.sourcePath.setAttribute('aria-label', source.ariaLabel);
				templateData.elementDisposables.add(DOM.addDisposableListener(templateData.sourcePath, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
				templateData.elementDisposables.add(DOM.addStandardDisposableListener(templateData.sourcePath, DOM.EventType.KEY_DOWN, event => {
					if (event.keyCode === KeyCode.Enter) {
						event.stopPropagation();
					}
				}));
				templateData.elementDisposables.add(DOM.addDisposableListener(templateData.sourcePath, DOM.EventType.CLICK, event => {
					event.preventDefault();
					event.stopPropagation();
					source.open?.();
				}));
			} else {
				templateData.sourcePath.removeAttribute('href');
				templateData.sourcePath.removeAttribute('aria-label');
			}
		} else {
			templateData.sourcePath.textContent = '';
			templateData.sourcePath.style.display = 'none';
			templateData.sourcePathHover.update('');
			templateData.sourcePath.classList.remove('source-link');
			templateData.sourcePath.removeAttribute('href');
			templateData.sourcePath.removeAttribute('aria-label');
		}
		templateData.sourcePath.tabIndex = source?.open && rowKey === this._focusedRowKey ? 0 : -1;
		this.renderDescription(templateData, element);

		if (element.type === 'builtin-item') {
			templateData.container.classList.add('builtin');
			templateData.container.classList.toggle('has-detail', element.connector !== undefined);
			templateData.name.textContent = formatDisplayName(element.label);
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

		if (element.activeSessionServer !== undefined) {
			this.updateKnownServerStatus(templateData, element);
		} else if (this.workspaceService.isSessionsWindow) {
			this.updateKnownServerStatus(templateData, element);
		} else {
			templateData.elementDisposables.add(autorun(reader => {
				const disabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
				const connectionState = element.localServer?.connectionState.read(reader);
				templateData.container.classList.toggle('disabled', disabled);
				this.updateStatus(templateData, element, element, disabled ? 'disabled' : connectionState?.state, this._getCompatibilityKind(element, reader));
			}));
		}
	}

	private updateKnownServerStatus(templateData: IMcpServerItemTemplateData, element: IMcpServerItemEntry | IMcpBuiltinItemEntry): void {
		let localDisabled = false;
		let connectionState: McpConnectionState | undefined;
		const update = (reader?: IReader) => {
			const currentEntry = resolveMcpEntry(element, this.agentHostCustomizationService, this.customizationHarnessService.activeSessionResource.get());
			const activeSessionServer = currentEntry && getActiveSessionServer(currentEntry);
			const compatibilityKind = this._getCompatibilityKind(element, reader);
			if (element.activeSessionServer !== undefined) {
				const presentation = activeSessionServer && getActiveSessionServerPresentation(activeSessionServer);
				templateData.container.classList.toggle('disabled', presentation?.enabled === false);
				this.updateStatus(templateData, element, currentEntry, presentation?.status, compatibilityKind, presentation?.enabled ? undefined : activeSessionServer?.disabledReason);
				return;
			}
			templateData.container.classList.toggle('disabled', localDisabled);
			const localState = !this.workspaceService.isSessionsWindow ? connectionState?.state : undefined;
			this.updateStatus(templateData, element, currentEntry, localDisabled ? 'disabled' : localState, compatibilityKind);
		};
		templateData.elementDisposables.add(autorun(reader => {
			this.customizationHarnessService.activeSessionResource.read(reader);
			localDisabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
			connectionState = element.localServer?.connectionState.read(reader);
			update(reader);
		}));
		templateData.elementDisposables.add(this.agentHostCustomizationService.onDidChangeCustomizations(() => update()));
	}

	private updateActiveSessionStatus(templateData: IMcpServerItemTemplateData, element: IMcpSessionServerItemEntry): void {
		const update = (reader?: IReader) => {
			const currentEntry = resolveMcpEntry(element, this.agentHostCustomizationService, this.customizationHarnessService.activeSessionResource.get());
			const server = currentEntry && getActiveSessionServer(currentEntry);
			const presentation = server && getActiveSessionServerPresentation(server);
			templateData.container.classList.toggle('disabled', presentation?.enabled === false);
			this.updateStatus(templateData, element, currentEntry, presentation?.status, this._getCompatibilityKind(element, reader), server?.disabledReason);
		};
		templateData.elementDisposables.add(autorun(reader => {
			this.customizationHarnessService.activeSessionResource.read(reader);
			update(reader);
		}));
		templateData.elementDisposables.add(this.agentHostCustomizationService.onDidChangeCustomizations(() => update()));
	}

	private updateStatus(templateData: IMcpServerItemTemplateData, element: IMcpInstalledEntry, currentEntry: IMcpInstalledEntry | undefined, state: McpStatusKind | undefined, compatibilityKind: CustomizationMcpServerCompatibilityKind | undefined, disabledReason?: CustomizationDisabledReason): void {
		const isError = state === McpServerStatus.Error || state === McpConnectionState.Kind.Error;
		templateData.compatibilityLink = updateMcpCompatibilityMessage(templateData.compatibilityMessage, compatibilityKind, templateData.compatibilityMessageDisposables, this._openMigrations);
		this.updateActionsTabbability(templateData);
		if (isError) {
			templateData.compatibilityMessage.style.display = 'none';
		}

		const presentation = getMcpStatusPresentation(state, disabledReason);
		const activeSessionServer = currentEntry && getActiveSessionServer(currentEntry);
		templateData.issue.textContent = '';
		templateData.issue.style.display = 'none';
		templateData.issueHover.update('');
		templateData.description.style.display = compatibilityKind && compatibilityKind !== 'supported' ? 'none' : templateData.description.textContent ? '' : 'none';
		const label = getMcpEntryLabel(currentEntry ?? element);
		const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
		const localServer = element.type === 'session-server-item' ? undefined : element.localServer;

		// Keep management buttons alive across message-only updates so pointer clicks and focus survive.
		const signature = getMcpStatusRenderSignature({
			rowKey: getMcpRowKey(element),
			label,
			state,
			statusLabel: presentation?.label,
			statusClassName: presentation?.className,
			statusIconId: presentation?.icon?.id,
			compatibilityKind,
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

		if (!currentEntry) {
			return;
		}

		const getEntry = () => resolveMcpEntry(currentEntry, this.agentHostCustomizationService, activeSessionResource);
		if (state === McpServerStatus.AuthRequired && activeSessionServer !== undefined) {
			const signInButton = createMcpSignInButton(templateData.actions, templateData.actionDisposables, label);
			registerMcpSignInButtonAction(templateData.actionDisposables, signInButton, label, () => authenticateMcpServer(this.agentHostCustomizationService, activeSessionResource, activeSessionServer.id), {
				updateTabbability: () => this.updateActionsTabbability(templateData),
			});
		}
		if (state === McpServerStatus.Stopped || state === McpConnectionState.Kind.Stopped) {
			const startButton = createMcpStartButton(templateData.actions, templateData.actionDisposables, label);
			registerMcpInlineButtonAction(templateData.actionDisposables, startButton, async () => {
				const entry = getEntry();
				if (!entry) {
					return;
				}
				startButton.enabled = false;
				try {
					await startMcpEntry(entry);
				} finally {
					startButton.enabled = true;
				}
			});
		}

		if (!presentation?.icon) {
			const compatibility = getMcpCompatibilityPresentation(compatibilityKind);
			if (compatibility) {
				const icon = DOM.append(templateData.actions, $('.mcp-server-status.mcp-server-state-icon'));
				updateMcpCompatibilityIcon(icon, compatibilityKind, undefined);
				icon.setAttribute('aria-hidden', 'true');
				templateData.actionDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), icon, compatibility.label));
			}
			this._renderManagementActions(getEntry, templateData.actions, templateData.actionDisposables, () => this.updateActionsTabbability(templateData));
			this.updateActionsTabbability(templateData);
			return;
		}

		const statusContainer = isError ? DOM.append(templateData.actions, $('.mcp-server-error-actions')) : templateData.actions;
		const statusElement = DOM.append(statusContainer, $('.mcp-server-status.mcp-server-state-icon'));
		statusElement.classList.add(presentation.className, ...ThemeIcon.asClassNameArray(presentation.icon));
		statusElement.setAttribute('aria-hidden', 'true');
		templateData.actionDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), statusElement, presentation.label));
		if (isError) {
			const showOutputButton = createMcpShowOutputButton(statusContainer, templateData.actionDisposables, label);
			registerMcpInlineButtonAction(templateData.actionDisposables, showOutputButton, async () => {
				const entry = getEntry();
				if (entry) {
					await this._showOutput(entry);
				}
			});
		}
		this._renderManagementActions(getEntry, templateData.actions, templateData.actionDisposables, () => this.updateActionsTabbability(templateData));
		this.updateActionsTabbability(templateData);
	}

	setFocusedRowKey(rowKey: string | undefined): void {
		this._focusedRowKey = rowKey;
		for (const template of this._templates) {
			this.updateActionsTabbability(template);
		}
	}

	private updateActionsTabbability(templateData: IMcpServerItemTemplateData): void {
		const focused = templateData.currentElement !== undefined && getMcpRowKey(templateData.currentElement) === this._focusedRowKey;
		setVirtualizedRowActionsTabbable(templateData.actions, focused);
		templateData.sourcePath.tabIndex = templateData.sourcePath.classList.contains('source-link') && focused ? 0 : -1;
		if (templateData.compatibilityLink) {
			templateData.compatibilityLink.tabIndex = focused ? 0 : -1;
		}
	}

	private renderDescription(template: IMcpServerItemTemplateData, element: IMcpInstalledEntry): void {
		const description = element.type === 'session-server-item'
			? ''
			: element.type === 'builtin-item'
				? element.description
				: element.server.description?.trim() ?? '';
		template.description.textContent = truncateToFirstLine(description);
		template.description.style.display = description ? '' : 'none';
		template.descriptionHover.update(description);
	}

	disposeElement(_element: IMcpInstalledEntry, _index: number, templateData: IMcpServerItemTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.sourcePathHover.hide();
		templateData.sourcePathHover.update('');
		templateData.sourcePath.textContent = '';
		templateData.descriptionHover.hide();
		templateData.descriptionHover.update('');
		templateData.issueHover.hide();
		templateData.issueHover.update('');
		templateData.description.textContent = '';
		templateData.currentElement = undefined;
	}

	disposeTemplate(templateData: IMcpServerItemTemplateData): void {
		this._templates.delete(templateData);
		templateData.templateDisposables.dispose();
		templateData.elementDisposables.dispose();
		templateData.actionDisposables.dispose();
	}

}

interface IMcpMarketplaceItemTemplateData {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly description: HTMLElement;
	readonly installButton: Button;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
	currentServerId: string | undefined;
}

class McpMarketplaceItemRenderer implements IListRenderer<IMcpMarketplaceEntry, IMcpMarketplaceItemTemplateData> {
	readonly templateId = 'mcpMarketplaceItem';
	private readonly _templates = new Set<IMcpMarketplaceItemTemplateData>();
	private _focusedServerId: string | undefined;

	constructor(
		private readonly _install: (server: IWorkbenchMcpServer, button: Button) => Promise<void>,
	) { }

	renderTemplate(container: HTMLElement): IMcpMarketplaceItemTemplateData {
		container.classList.add('plugin-list-item', 'plugin-marketplace-home-row');
		const details = DOM.append(container, $('.plugin-list-item-details'));
		const name = DOM.append(DOM.append(details, $('.plugin-list-item-name-row')), $('.plugin-list-item-name'));
		const description = DOM.append(details, $('.plugin-list-item-description'));
		const actionContainer = DOM.append(container, $('.plugin-list-item-action'));
		const installButton = new Button(actionContainer, { ...defaultButtonStyles, secondary: true });
		installButton.element.classList.add('plugin-list-item-install-button');
		const templateDisposables = new DisposableStore();
		templateDisposables.add(installButton);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(installButton.element, event => DOM.EventHelper.stop(event, true)));
		const template = { container, name, description, installButton, elementDisposables: new DisposableStore(), templateDisposables, currentServerId: undefined };
		this._templates.add(template);
		return template;
	}

	renderElement(element: IMcpMarketplaceEntry, _index: number, templateData: IMcpMarketplaceItemTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.currentServerId = element.server.id;
		templateData.name.textContent = element.server.label;
		templateData.description.textContent = truncateToFirstLine(element.server.description || localize('mcpNoDescription', "No description provided."));
		templateData.installButton.label = localize('install', "Install");
		templateData.installButton.enabled = true;
		templateData.installButton.element.tabIndex = element.server.id === this._focusedServerId ? 0 : -1;
		templateData.elementDisposables.add(templateData.installButton.onDidClick(event => {
			DOM.EventHelper.stop(event, true);
			void this._install(element.server, templateData.installButton);
		}));
	}

	setFocusedServerId(serverId: string | undefined): void {
		this._focusedServerId = serverId;
		for (const template of this._templates) {
			template.installButton.element.tabIndex = template.currentServerId === serverId ? 0 : -1;
		}
	}

	disposeElement(_element: IMcpMarketplaceEntry, _index: number, templateData: IMcpMarketplaceItemTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.currentServerId = undefined;
	}

	disposeTemplate(templateData: IMcpMarketplaceItemTemplateData): void {
		this._templates.delete(templateData);
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

function createMcpSignInButton(parent: HTMLElement, store: Pick<DisposableStore, 'add'>, serverLabel: string): Button {
	const signInLabel = localize('signInToMcpServer', "Sign in to {0}", serverLabel);
	const signInButton = store.add(new Button(parent, {
		...defaultButtonStyles,
		secondary: true,
		small: true,
		title: signInLabel,
		ariaLabel: signInLabel,
		supportIcons: true,
	}));
	signInButton.label = localize('signIn', "Sign In");
	signInButton.element.classList.add('mcp-server-sign-in');
	return signInButton;
}

function createMcpStartButton(parent: HTMLElement, store: Pick<DisposableStore, 'add'>, serverLabel: string): Button {
	const startLabel = localize('startMcpServer', "Start {0}", serverLabel);
	const startButton = store.add(new Button(parent, {
		...defaultButtonStyles,
		secondary: true,
		small: true,
		title: startLabel,
		ariaLabel: startLabel,
	}));
	startButton.label = localize('start', "Start");
	startButton.element.classList.add('mcp-server-start');
	return startButton;
}

function createMcpShowOutputButton(parent: HTMLElement, store: Pick<DisposableStore, 'add'>, serverLabel: string): Button {
	const showOutputLabel = localize('showMcpServerOutput', "Show output for {0}", serverLabel);
	const showOutputButton = store.add(new Button(parent, {
		...defaultButtonStyles,
		secondary: true,
		small: true,
		title: showOutputLabel,
		ariaLabel: showOutputLabel,
	}));
	showOutputButton.label = localize('output', "Show Output");
	showOutputButton.element.classList.add('mcp-server-show-output');
	return showOutputButton;
}

async function startMcpEntry(entry: IMcpInstalledEntry): Promise<void> {
	const activeSessionServer = getActiveSessionServer(entry);
	if (activeSessionServer) {
		await activeSessionServer.start();
		return;
	}
	if (entry.type !== 'session-server-item' && entry.localServer) {
		await entry.localServer.start({ promptType: 'all-untrusted' });
	}
}

interface IMcpSignInButtonActionOptions {
	readonly updateTabbability?: () => void;
}

export function registerMcpSignInButtonAction(store: Pick<DisposableStore, 'add'>, button: Button, serverLabel: string, action: () => Promise<void | boolean>, options?: IMcpSignInButtonActionOptions): void {
	const signingInLabel = localize('signingIn', "Signing In...");
	const signingInAriaLabel = localize('signingInToMcpServer', "Signing in to {0}", serverLabel);
	let pending = false;
	let disposed = false;
	store.add(toDisposable(() => disposed = true));
	registerMcpInlineButtonAction(store, button, async () => {
		if (pending) {
			return;
		}

		pending = true;
		const wasEnabled = button.enabled;
		button.label = `$(${Codicon.loading.id}) ${signingInLabel}`;
		button.setTitle(signingInAriaLabel);
		button.setAriaLabel(signingInAriaLabel);
		button.element.setAttribute('aria-busy', 'true');
		button.enabled = false;
		status(localize('mcpServerSigningInStatus', "Signing in to {0}.", serverLabel));
		try {
			await action();
		} finally {
			if (!disposed) {
				pending = false;
				const tabIndex = button.element.tabIndex;
				resetMcpSignInButton(button, serverLabel, wasEnabled);
				button.element.tabIndex = tabIndex;
				options?.updateTabbability?.();
			}
		}
	});
}

function resetMcpSignInButton(button: Button, serverLabel: string, enabled: boolean): void {
	const signInAriaLabel = localize('signInToMcpServer', "Sign in to {0}", serverLabel);
	button.label = localize('signIn', "Sign In");
	button.setTitle(signInAriaLabel);
	button.setAriaLabel(signInAriaLabel);
	button.element.removeAttribute('aria-busy');
	button.enabled = enabled;
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

export interface IMcpCompatibilityPresentation {
	readonly label: string;
	readonly className: string;
}

export function getMcpCompatibilityPresentation(kind: CustomizationMcpServerCompatibilityKind | undefined): IMcpCompatibilityPresentation | undefined {
	switch (kind) {
		case 'partiallySupported':
			return { label: localize('mcpPartiallySupported', "Partially supported"), className: 'partially-supported' };
		case 'unsupported':
			return { label: localize('mcpUnsupported', "Unsupported"), className: 'unsupported' };
		case 'unknown':
			return { label: localize('mcpSupportUnknown', "Support unknown"), className: 'support-unknown' };
		case 'supported':
		case undefined:
			return undefined;
	}
}

export function updateMcpCompatibilityMessage(message: HTMLElement, kind: CustomizationMcpServerCompatibilityKind | undefined, disposables: DisposableStore, openMigrations: () => void): HTMLAnchorElement | undefined {
	const presentation = getMcpCompatibilityPresentation(kind);
	disposables.clear();
	message.className = 'mcp-server-compatibility-message';
	message.style.display = presentation ? '' : 'none';
	DOM.clearNode(message);
	if (!presentation) {
		return undefined;
	}
	message.classList.add(presentation.className);
	renderFormattedText(localize({
		key: 'mcpCompatibilityMigrationHint',
		comment: ['Preserve the double square brackets: they mark Migrations as a link.'],
	}, "{0}. See [[Migrations]] for details.", presentation.label), {
		actionHandler: {
			callback: (_content, event) => {
				event.preventDefault();
				event.stopPropagation();
				openMigrations();
			},
			disposables,
		},
	}, message);
	const migrationLink = message.firstElementChild as HTMLAnchorElement | null;
	if (migrationLink) {
		migrationLink.href = '#';
		migrationLink.tabIndex = -1;
		migrationLink.classList.add('mcp-server-compatibility-link');
		disposables.add(DOM.addDisposableListener(migrationLink, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
	}
	return migrationLink ?? undefined;
}

function updateMcpCompatibilityIcon(icon: HTMLElement, kind: CustomizationMcpServerCompatibilityKind | undefined, runtimeIcon: ThemeIcon | undefined): void {
	const compatibility = getMcpCompatibilityPresentation(kind);
	if (runtimeIcon || !compatibility) {
		return;
	}
	const iconTheme = kind === 'unsupported' ? Codicon.error : Codicon.warning;
	icon.className = `mcp-server-state-icon ${ThemeIcon.asClassNameArray(iconTheme).join(' ')} compatibility ${compatibility.className}`;
	icon.style.display = '';
	icon.setAttribute('aria-label', compatibility.label);
}

export function getMcpStatusPresentation(state: McpStatusKind | undefined, disabledReason?: CustomizationDisabledReason): IMcpStatusPresentation | undefined {
	if (state === undefined) {
		return undefined;
	}
	if (state === 'disabled') {
		return { label: getMcpDisabledLabel(disabledReason), className: 'disabled' };
	}
	switch (state) {
		case McpConnectionState.Kind.Running:
		case McpServerStatus.Ready:
			return { label: localize('running', "Running"), className: 'running' };
		case McpConnectionState.Kind.Starting:
		case McpServerStatus.Starting:
			return { label: localize('starting', "Starting"), className: 'starting', icon: ThemeIcon.modify(Codicon.loading, 'spin') };
		case McpServerStatus.AuthRequired:
			return { label: localize('authRequired', "Authentication required"), className: 'auth-required' };
		case McpConnectionState.Kind.Error:
		case McpServerStatus.Error:
			return { label: localize('error', "Error"), className: 'error', icon: Codicon.error };
		case McpConnectionState.Kind.Stopped:
		case McpServerStatus.Stopped:
		default:
			return { label: localize('stopped', "Stopped"), className: 'stopped' };
	}
}

function getMcpDisabledLabel(reason: CustomizationDisabledReason | undefined): string {
	if (reason?.source === 'scope' && reason.scope !== CustomizationEnablementKind.Global) {
		return getCustomizationDisabledLabel(reason);
	}
	if (reason?.source === 'plugin') {
		return getCustomizationDisabledLabel(reason);
	}
	return localize('mcpDisabledGlobally', "Disabled (Globally)");
}

function getMcpEntryErrorMessage(entry: IMcpInstalledEntry): string | undefined {
	const activeSessionServer = getActiveSessionServer(entry);
	if (activeSessionServer) {
		return getMcpErrorMessage(activeSessionServer.status, activeSessionServer.state?.kind === McpServerStatus.Error ? activeSessionServer.state.error?.message : undefined);
	}
	const connectionState = entry.type === 'session-server-item' ? undefined : entry.localServer?.connectionState.get();
	return getMcpErrorMessage(connectionState?.state, connectionState?.state === McpConnectionState.Kind.Error ? connectionState.message : undefined);
}

function getMcpErrorMessage(state: McpStatusKind | undefined, message: string | undefined): string | undefined {
	if (state !== McpServerStatus.Error && state !== McpConnectionState.Kind.Error) {
		return undefined;
	}
	return message && /\S/u.test(message) ? message : localize('mcpServerErrorWithoutDetails', "The server reported an error without additional details.");
}

function getActiveSessionServer(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): AgentHostMcpServer | undefined {
	return entry.type === 'session-server-item' ? entry.server : entry.activeSessionServer;
}

/** A missing host snapshot invalidates the row's actions, rather than falling back to its local twin. */
function resolveMcpEntry(entry: IMcpInstalledEntry, customizations: IAgentHostCustomizationService, sessionResource: URI): IMcpInstalledEntry | undefined {
	const activeSessionServer = getActiveSessionServer(entry);
	if (!activeSessionServer) {
		return entry;
	}
	const server = customizations.getMcpServers(sessionResource).find(server => server.id === activeSessionServer.id);
	return server ? entry.type === 'session-server-item' ? { ...entry, server } : { ...entry, activeSessionServer: server } : undefined;
}

/**
 * Which row a template is currently showing. List entries are recreated on every refresh, so
 * object identity says nothing about whether this is still the same server in the same place.
 */
export function getMcpRowKey(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): string {
	switch (entry.type) {
		case 'server-item':
			return `server:${entry.server.id}:${entry.marketplace ? 1 : 0}`;
		case 'session-server-item':
			return `session:${entry.server.id}`;
		case 'builtin-item':
			return `builtin:${entry.id}`;
	}
}

export function getMcpEntryGroup(entry: IMcpInstalledEntry): 'user' | 'workspace' | 'plugins' | 'extensions' | 'builtin' {
	if (entry.type === 'server-item') {
		return entry.server.local?.scope === LocalMcpServerScope.Workspace ? 'workspace' : 'user';
	}
	if (entry.type === 'builtin-item') {
		if (entry.collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX)) {
			return 'plugins';
		}
		if (entry.extensionId) {
			return 'extensions';
		}
		const collection = entry.localServer?.readDefinitions().get().collection;
		if (collection?.provenance === McpCollectionProvenance.ExternalConfiguration) {
			return McpCollectionDefinition.isWorkspaceDiscovered(collection) ? 'workspace' : 'user';
		}
	}
	switch (getActiveSessionServer(entry)?.source) {
		case 'user':
			return 'user';
		case 'workspace':
			return 'workspace';
		case 'plugin':
			return 'plugins';
	}
	return 'builtin';
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
	readonly compatibilityKind?: CustomizationMcpServerCompatibilityKind;
	/** The active-session twin the sign-in and management actions are bound to. */
	readonly activeSessionServerId: string | undefined;
	readonly logOutputChannelId: string | undefined;
	/** The local server the output action falls back to. */
	readonly localServerId: string | undefined;
	/** The session owning the row actions, so switching sessions invalidates their bindings. */
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
		input.compatibilityKind ?? null,
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

function getMcpEntrySourceUri(element: IMcpInstalledEntry): URI | undefined {
	switch (element.type) {
		case 'server-item':
			return element.server.local?.mcpResource;
		case 'session-server-item':
			return element.server.sourceUri;
		case 'builtin-item':
			return element.activeSessionServer?.sourceUri
				?? element.localServer?.readDefinitions().get().server?.presentation?.origin?.uri
				?? element.localServer?.collection?.presentation?.origin;
	}
}

function getMcpEntrySource(element: IMcpInstalledEntry, labelService: ILabelService, agentPluginService: IAgentPluginService, extensionsWorkbenchService?: IExtensionsWorkbenchService, openPlugin?: (plugin: IAgentPlugin) => void): { label: string; hover: string; ariaLabel?: string; open?(): void } | undefined {
	const sourceUri = getMcpEntrySourceUri(element);
	if (element.type === 'builtin-item') {
		const pluginUri = getPluginUriFromCollectionId(element.collectionId);
		const plugin = pluginUri ? agentPluginService.plugins.get().find(plugin => plugin.uri.toString() === pluginUri) : undefined;
		if (plugin) {
			return {
				label: localize('fromPlugin', "Plugin: {0}", plugin.label),
				hover: localize('openPluginDetails', "Open plugin details for {0}", plugin.label),
				ariaLabel: localize('openPluginDetails', "Open plugin details for {0}", plugin.label),
				open: openPlugin ? () => openPlugin(plugin) : undefined,
			};
		}
		if (element.extensionId && extensionsWorkbenchService) {
			const extensionId = element.extensionId;
			const extension = extensionsWorkbenchService.local.find(extension => ExtensionIdentifier.equals(extension.identifier.id, extensionId));
			const extensionName = extension?.displayName || extensionId.value;
			return {
				label: localize('fromExtension', "Extension: {0}", extensionName),
				hover: localize('openExtensionDetails', "Open extension details for {0}", extensionName),
				ariaLabel: localize('openExtensionDetails', "Open extension details for {0}", extensionName),
				open: () => extensionsWorkbenchService.open(extensionId.value, { tab: ExtensionEditorTab.Features, feature: 'mcp' }),
			};
		}
	}
	if (!sourceUri) {
		return undefined;
	}
	return {
		label: labelService.getUriLabel(sourceUri, { relative: true }),
		hover: labelService.getUriLabel(sourceUri, { noPrefix: true }),
	};
}

function getMcpEntryLabelWithSource(element: IMcpInstalledEntry, labelService: ILabelService, agentPluginService: IAgentPluginService, extensionsWorkbenchService?: IExtensionsWorkbenchService): string {
	const label = getMcpEntryLabel(element);
	const source = getMcpEntrySource(element, labelService, agentPluginService, extensionsWorkbenchService);
	return source?.ariaLabel
		? localize('mcpServerAriaLabelWithSource', "{0}, configured in {1}", label, source.label)
		: label;
}

function getMcpServerCompatibilityId(element: IMcpInstalledEntry): string | undefined {
	if (element.type === 'session-server-item') {
		return undefined;
	}
	return element.localServer?.definition.id ?? (element.type === 'server-item' ? element.server.id : element.connector?.serverName);
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
	if (!isSessionsWindow) {
		const state = entry.localServer?.connectionState.get().state;
		return state;
	}
	return undefined;
}

function getMcpEntryAriaLabel(element: IMcpInstalledEntry, isSessionsWindow: boolean, compatibilityKind: CustomizationMcpServerCompatibilityKind | undefined, labelService: ILabelService, agentPluginService: IAgentPluginService, extensionsWorkbenchService?: IExtensionsWorkbenchService): string {
	const label = getMcpEntryLabelWithSource(element, labelService, agentPluginService, extensionsWorkbenchService);
	const statusKind = getMcpStatusKind(element, isSessionsWindow);
	const disabledReason = statusKind === 'disabled' ? getMcpDisabledReason(element) : undefined;
	const status = getMcpStatusPresentation(statusKind, disabledReason);
	const compatibility = getMcpCompatibilityPresentation(compatibilityKind);
	const errorMessage = statusKind === McpServerStatus.Error || statusKind === McpConnectionState.Kind.Error ? getMcpEntryErrorMessage(element) : undefined;
	return [compatibility?.label, status?.label, errorMessage].reduce<string>(
		(result, detail) => detail ? localize('mcpServerAriaLabelWithStatus', "{0}, {1}", result, detail) : result,
		label,
	);
}

function getMcpDisabledReason(entry: IMcpServerItemEntry | IMcpSessionServerItemEntry | IMcpBuiltinItemEntry): CustomizationDisabledReason | undefined {
	if (entry.type === 'session-server-item') {
		return entry.server.disabledReason;
	}
	if (entry.activeSessionServer !== undefined) {
		return entry.activeSessionServer.disabledReason ?? getCustomizationDisabledReason(entry.activeSessionServer);
	}
	if (entry.localServer) {
		switch (entry.localServer.enablement.get()) {
			case ContributionEnablementState.DisabledWorkspace:
				return { source: 'scope', scope: CustomizationEnablementKind.Workspace };
			case ContributionEnablementState.DisabledProfile:
				return { source: 'scope', scope: CustomizationEnablementKind.Global };
		}
	}
	return undefined;
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

function getWorkbenchServerMatchKeys(server: IWorkbenchMcpServer): string[] {
	return getUniqueMcpMatchKeys([server.id, server.name, server.label]);
}

export function getActiveSessionServerPresentation(server: AgentHostMcpServer): { readonly enabled: boolean; readonly status: McpStatusKind } {
	return {
		enabled: server.enabled,
		status: server.enabled ? server.status : 'disabled',
	};
}

export function updateMcpCardRuntimePresentation(
	statusIcon: HTMLElement,
	primaryAction: HTMLElement,
	description: HTMLElement,
	statusKind: McpStatusKind | undefined,
	disabledReason: CustomizationDisabledReason | undefined,
	ariaLabel: string,
	descriptionText: string,
): void {
	const statusPresentation = getMcpStatusPresentation(statusKind, disabledReason);
	statusIcon.className = 'mcp-server-state-icon';
	statusIcon.style.display = statusPresentation?.icon ? '' : 'none';
	if (statusPresentation?.icon) {
		statusIcon.classList.add(statusPresentation.className, ...ThemeIcon.asClassNameArray(statusPresentation.icon));
		statusIcon.setAttribute('aria-label', statusPresentation.label);
	} else {
		statusIcon.removeAttribute('aria-label');
	}
	primaryAction.setAttribute('aria-label', ariaLabel);
	description.textContent = descriptionText;
}

export function shouldLoadMcpGallerySnapshot(visible: boolean, query: string, itemCount: number, failed: boolean, loading: boolean, accessEnabled: boolean): boolean {
	return accessEnabled && visible && !query.trim() && itemCount === 0 && !failed && !loading;
}

export function hasSameMcpMembership(previous: string, current: string): boolean {
	return previous === current;
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

function isHostOwnedPluginMcpServer(server: AgentHostMcpServer): boolean {
	return server.isPluginProvided === true && !server.isClientBundled;
}

const agentHostMcpServerEnablementActionInfo = {
	global: {
		kind: CustomizationEnablementKind.Global,
		enableLabel: () => localize('agentHostMcpServerEnable', "Enable"),
		disableLabel: () => localize('agentHostMcpServerDisable', "Disable (Globally)"),
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

export function setPrimaryMcpServerEnablement(
	mcpService: IMcpService,
	agentHostCustomizations: IAgentHostCustomizationService,
	sessionResource: URI,
	localServerId: string | undefined,
	activeSessionServer: AgentHostMcpServer | undefined,
	enabled: boolean,
): void {
	if (activeSessionServer && isHostOwnedPluginMcpServer(activeSessionServer)) {
		agentHostCustomizations.setCustomizationEnablement(
			sessionResource,
			activeSessionServer.id,
			activeSessionServer.enablement,
			CustomizationEnablementKind.Global,
			enabled,
		);
		return;
	}
	if (activeSessionServer && !activeSessionServer.enabled && enabled) {
		const scope = activeSessionServer.disabledReason?.source === 'scope'
			? activeSessionServer.disabledReason.scope
			: getCustomizationEnablementDecision(activeSessionServer)?.kind ?? CustomizationEnablementKind.Global;
		agentHostCustomizations.setCustomizationEnablement(
			sessionResource,
			activeSessionServer.id,
			activeSessionServer.enablement,
			scope,
			true,
		);
		return;
	}
	if (localServerId) {
		const current = mcpService.enablementModel.readEnabled(localServerId);
		const next = getToggledMcpEnablementState(current);
		if (isContributionEnabled(next) !== enabled) {
			throw new Error(`Unexpected MCP enablement transition for ${localServerId}.`);
		}
		mcpService.enablementModel.setEnabled(localServerId, next);
		return;
	}
	if (!activeSessionServer) {
		throw new Error('Cannot update MCP enablement without a durable server target.');
	}
	agentHostCustomizations.setCustomizationEnablement(
		sessionResource,
		activeSessionServer.id,
		activeSessionServer.enablement,
		CustomizationEnablementKind.Global,
		enabled,
	);
}

export function isPrimaryMcpServerEnabled(
	mcpService: IMcpService,
	localServerId: string | undefined,
	activeSessionServer: AgentHostMcpServer | undefined,
): boolean {
	if (activeSessionServer && isHostOwnedPluginMcpServer(activeSessionServer)) {
		return getCustomizationScopeEnablement(activeSessionServer).global;
	}
	if (activeSessionServer && !activeSessionServer.enabled) {
		return false;
	}
	if (localServerId) {
		return isContributionEnabled(mcpService.enablementModel.readEnabled(localServerId));
	}
	if (activeSessionServer) {
		return getCustomizationScopeEnablement(activeSessionServer).global;
	}
	return true;
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
		actions.push(new Action('mcpServer.builtin.disable', localize('builtinMcpServerDisable', "Disable (Globally)"), undefined, true, () => {
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
	if (isHostOwnedPluginMcpServer(activeSessionServer)) {
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

function createBuiltinEntry(server: IMcpServer, activeSessionServer?: AgentHostMcpServer, extensionId?: ExtensionIdentifier): IMcpBuiltinItemEntry {
	return {
		type: 'builtin-item',
		id: `builtin-${server.definition.id}`,
		label: server.definition.label,
		description: '',
		collectionId: server.collection.id,
		extensionId,
		activeSessionServer,
		localServer: server,
	};
}

function createConnectorMcpEntry(connector: IConnectedCopilotConnectorMcpServer, activeSessionServer?: AgentHostMcpServer): IMcpBuiltinItemEntry {
	return {
		type: 'builtin-item',
		id: `copilot-connector:${connector.id}`,
		label: connector.serverName,
		description: localize('mcpServerFromConnector', "Connector: {0}", connector.connector.displayName),
		activeSessionServer,
		connector,
	};
}

function isConnectorMcpEntry(entry: IMcpInstalledEntry): entry is IMcpBuiltinItemEntry & { readonly connector: IConnectedCopilotConnectorMcpServer } {
	return entry.type === 'builtin-item' && entry.connector !== undefined;
}

export function createInstalledMcpServerDetailInput(entry: IMcpInstalledEntry, error?: IObservable<string | undefined>): IMcpServerDetailInput {
	if (entry.type === 'server-item') {
		return {
			...createWorkbenchMcpServerDetailInput(entry.server),
			compatibilityId: entry.localServer?.definition.id ?? entry.server.id,
			error,
		};
	}

	const activeSessionServer = getActiveSessionServer(entry);
	const localServer = entry.type === 'session-server-item' ? undefined : entry.localServer;
	const localDefinitions = localServer?.readDefinitions().get();
	const localDefinition = localDefinitions?.server;
	const collectionOrigin = localDefinitions?.collection?.presentation?.origin;
	const localSource = localDefinition?.presentation?.origin ?? (collectionOrigin ? { uri: collectionOrigin } : undefined);
	const activeSessionSource = activeSessionServer?.sourceUri
		? {
			uri: activeSessionServer.sourceUri,
			range: activeSessionServer.sourceRange
				? new Range(
					activeSessionServer.sourceRange.start.line + 1,
					activeSessionServer.sourceRange.start.character + 1,
					activeSessionServer.sourceRange.end.line + 1,
					activeSessionServer.sourceRange.end.character + 1,
				)
				: undefined,
		}
		: undefined;

	return {
		id: getMcpRowKey(entry),
		name: getMcpEntryLabel(entry),
		label: getMcpEntryLabel(entry),
		installState: McpServerInstallState.Installed,
		config: localDefinition ? getMcpServerConfiguration(localDefinition) : undefined,
		compatibilityId: localDefinition?.id,
		error,
		source: localSource ?? activeSessionSource,
	};
}

function getMcpServerConfiguration(definition: McpServerDefinition): IMcpServerConfiguration {
	const launch = definition.launch;
	if (launch.type === McpServerTransportType.HTTP) {
		return {
			type: McpServerType.REMOTE,
			url: launch.uri.toString(true),
			headers: launch.headers.length > 0 ? Object.fromEntries(launch.headers) : undefined,
			oauth: launch.oauth,
			dev: definition.devMode,
		};
	}
	return {
		type: McpServerType.LOCAL,
		command: launch.command,
		args: launch.args,
		env: launch.env,
		envFile: launch.envFile,
		cwd: launch.cwd,
		sandboxEnabled: definition.sandboxEnabled,
		dev: definition.devMode,
	};
}

/**
 * Widget that displays a list of MCP servers with marketplace browsing.
 */
export class McpListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidSelectServer = this._register(new Emitter<IMcpServerDetailInput>());
	readonly onDidSelectServer = this._onDidSelectServer.event;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly _onDidRequestShowPlugin = this._register(new Emitter<IAgentPluginItem>());
	readonly onDidRequestShowPlugin = this._onDidRequestShowPlugin.event;

	private readonly _onDidSelectConnector = this._register(new Emitter<ICopilotConnector>());
	readonly onDidSelectConnector = this._onDidSelectConnector.event;

	private readonly _onDidRequestOpenMigrations = this._register(new Emitter<void>());
	readonly onDidRequestOpenMigrations = this._onDidRequestOpenMigrations.event;

	private sectionTitleHeader!: HTMLElement;
	private sectionLink!: HTMLAnchorElement;
	private searchAndButtonContainer!: HTMLElement;
	private searchInput!: InputBox;
	private cardContainer!: HTMLElement;
	private cardScrollable!: DomScrollableElement;
	private cardScrollableNode!: HTMLElement;
	private sectionLayoutContainer: HTMLElement | undefined;
	private listContainer!: HTMLElement;
	private list!: WorkbenchObjectTree<IMcpSectionEntry>;
	private emptyContainer!: HTMLElement;
	private emptyText!: HTMLElement;
	private emptySubtext!: HTMLElement;
	private disabledContainer!: HTMLElement;
	private disabledIcon!: HTMLElement;
	private disabledMessage!: HTMLElement;
	private readonly disabledLinkListener = this._register(new MutableDisposable());
	private installedAddButton!: Button | undefined;

	private filteredServers: IWorkbenchMcpServer[] = [];
	private installedEntries: IMcpInstalledPresentation[] = [];
	private readonly installedEntryOrder = new Map<string, number>();
	private gallerySnapshotServers: IWorkbenchMcpServer[] = [];
	private galleryServers: IWorkbenchMcpServer[] = [];
	private searchQuery: string = '';
	private currentTreeGroups: readonly ICustomizationTreeGroup<IMcpSectionEntry>[] = [];
	private gallerySnapshotFailed = false;
	private gallerySnapshotLoading = false;
	private gallerySearchLoading = false;
	private visible = false;
	private mcpAccessEnabled = false;
	private firstCardFocusElement: HTMLElement | undefined;
	private narrowLayout = false;
	private wideLayout = false;
	private lastHeight: number = 0;
	private lastWidth: number = 0;
	private lastHeaderHeight = 0;
	private _layoutDeferred = false;
	private galleryCts: CancellationTokenSource | undefined;
	private readonly cardDisposables = this._register(new DisposableStore());
	private readonly pendingSectionLayout = this._register(new MutableDisposable());
	private readonly cardListControllers = new WeakMap<HTMLElement, CustomizationCardListController>();
	private sectionLists: IMcpSectionList[] = [];
	private readonly connectorsCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly connectorActionCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly connectorChangeListener = this._register(new MutableDisposable());
	private readonly delayedFilter = new Delayer<void>(200);
	private readonly delayedGallerySearch = new Delayer<void>(400);
	private readonly agentHostCustomizationsChanged: IObservable<void>;
	private readonly mcpServerCompatibility = observableValue<ReadonlyMap<string, CustomizationMcpServerCompatibilityKind>>(this, new Map());
	private readonly mcpServerCompatibilityScope = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpGalleryManifestService private readonly mcpGalleryManifestService: IMcpGalleryManifestService,
		@IMcpService private readonly mcpService: IMcpService,
		@IMcpRegistry private readonly mcpRegistry: IMcpRegistry,
		@ICopilotConnectorsService private readonly connectorsService: ICopilotConnectorsService,
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
		@INotificationService private readonly notificationService: INotificationService,
		@IOutputService private readonly outputService: IOutputService,
		@ILabelService private readonly labelService: ILabelService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.agentHostCustomizationsChanged = observableSignalFromEvent(this, this.agentHostCustomizationService.onDidChangeCustomizations);
		this.element = $('.mcp-list-widget.plugin-list-widget');
		this.create();
		const resizeObserver = this._register(new DOM.DisposableResizeObserver(
			'McpListWidget',
			() => this.updateResponsiveLayout(this.element.offsetWidth),
			DOM.getWindow(this.element),
		));
		this._register(resizeObserver.observe(this.element));
		this.updateAccessState();
		this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => {
			if (this.isGalleryDiscoveryEnabled()) {
				return;
			}
			this.galleryCts?.dispose(true);
			this.galleryCts = undefined;
			this.gallerySnapshotServers = [];
			this.galleryServers = [];
			this.gallerySnapshotFailed = false;
			this.gallerySnapshotLoading = false;
			if (this.searchQuery.trim()) {
				void this.queryMcpSearch();
			} else {
				void this.refresh();
			}
		}));
		if (!this.isGalleryDiscoveryEnabled()) {
			void mcpGalleryManifestService.getMcpGalleryManifest();
		}
		void this.refresh();
		this.updateConnectorChangeListener();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled)) {
				this.galleryCts?.dispose(true);
				this.galleryCts = undefined;
				this.delayedGallerySearch.cancel();
				this.gallerySnapshotServers = [];
				this.galleryServers = [];
				this.gallerySnapshotFailed = false;
				this.gallerySnapshotLoading = false;
				this.gallerySearchLoading = false;
				void this.refresh();
			}
			if (e.affectsConfiguration(mcpAccessConfig)) {
				this.updateAccessState();
			}
			if (e.affectsConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled)) {
				this.updateConnectorChangeListener();
				this.connectorsCancellation.value?.cancel();
				this.connectorsCancellation.clear();
				this.connectorActionCancellation.value?.cancel();
				this.connectorActionCancellation.clear();
				if (this.visible && this.isConnectorsEnabled()) {
					void this.refreshConnectors();
				} else {
					this.filterServers();
				}
			}
			if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled)) {
				this.updateMcpServerCompatibilityScope();
			}
		}));
		this._register({
			dispose: () => {
				this.delayedFilter.cancel();
				this.delayedGallerySearch.cancel();
				this.galleryCts?.dispose(true);
				this.connectorsCancellation.value?.cancel();
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
			this.galleryCts = undefined;
			this.searchInput.hideMessage();
			const query = this.searchQuery.toLowerCase().trim();
			this.galleryServers = query
				? this.gallerySnapshotServers.filter(server => this.matchesGalleryServerQuery(server, query))
				: [...this.gallerySnapshotServers];
			this.delayedFilter.trigger(() => this.filterServers());
			if (!this.mcpAccessEnabled || this.isGalleryDiscoveryEnabled()) {
				this.gallerySearchLoading = false;
				this.delayedGallerySearch.cancel();
				return;
			}
			if (query) {
				this.gallerySearchLoading = true;
				this.delayedGallerySearch.trigger(() => this.queryMcpSearch());
			} else {
				this.gallerySearchLoading = false;
				this.delayedGallerySearch.cancel();
				if (this.visible && this.gallerySnapshotServers.length === 0) {
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

		this.cardContainer = $('.plugin-card-container');
		this.cardScrollable = this._register(new DomScrollableElement(this.cardContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		this._register(DOM.addDisposableListener(this.cardContainer, DOM.EventType.SCROLL, () => {
			this.cardScrollable.setScrollPosition({ scrollTop: this.cardContainer.scrollTop });
		}));
		this.cardScrollableNode = this.cardScrollable.getDomNode();
		this.cardScrollableNode.classList.add('plugin-card-scrollable');
		this.cardScrollableNode.style.display = 'none';
		this.element.appendChild(this.cardScrollableNode);
		const cardResizeObserver = this._register(new DOM.DisposableResizeObserver(
			'McpListWidget.cardScrollable',
			() => this.cardScrollable.scanDomNode(),
		));
		this._register(cardResizeObserver.observe(this.cardScrollableNode));

		this.listContainer = DOM.append(this.element, $('.mcp-list-container.customization-tree-container'));
		const delegate = new McpSectionDelegate(() => MCP_INSTALLED_ITEM_HEIGHT);
		const groupRenderer = new CustomizationGroupHeaderRenderer<IMcpGroupHeaderEntry>(
			'mcpGroupHeader',
			this.hoverService,
			(entry, container, disposables) => this.renderMcpTreeGroupActions(entry, container, disposables),
		);
		const itemRenderer = this._register(this.instantiationService.createInstance(
			McpServerItemRenderer,
			(getEntry, actions, disposables, updateTabbability) => this.renderMcpListActions(getEntry, actions, disposables, updateTabbability),
			(entry, reader) => this.getMcpServerCompatibilityKind(entry, reader),
			plugin => this._onDidRequestShowPlugin.fire(createInstalledPluginItem(plugin)),
			() => this._onDidRequestOpenMigrations.fire(),
			entry => this.showMcpServerOutput(entry),
		));
		const marketplaceRenderer = new McpMarketplaceItemRenderer((server, button) => this.installMarketplaceServer(server, button));
		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchObjectTree<IMcpSectionEntry>,
			'McpManagementTree',
			this.listContainer,
			delegate,
			[
				asTreeRenderer(groupRenderer),
				asTreeRenderer(itemRenderer),
				asTreeRenderer(marketplaceRenderer),
			],
			{
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				hideTwistiesOfChildlessElements: false,
				overrideStyles: customizationTreeStyles,
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: entry => {
						if (entry.type === 'group-header') {
							return localize('mcpGroupAriaLabel', "{0}, {1} items", entry.label, entry.count);
						}
						return entry.type === 'builtin-item' && entry.connector
							? localize('connectorMcpServerAriaLabel', "{0}. Connector: {1}.", entry.connector.serverName, entry.connector.connector.displayName)
							: entry.type === 'marketplace-item'
								? localize('marketplaceMcpServerRowAriaLabel', "{0}. Available to install from the MCP marketplace.", entry.server.label)
								: this.getMcpEntryAriaLabel(entry);
					},
					getWidgetAriaLabel: () => localize('mcpServersListAriaLabel', "MCP Servers"),
				},
				openOnSingleClick: true,
				identityProvider: { getId: entry => this.getMcpTreeEntryId(entry) },
			},
		));
		this._register(this.list.onDidOpen(event => {
			const entry = event.element;
			if (!entry || entry.type === 'group-header') {
				return;
			}
			if (entry.type !== 'marketplace-item' && isConnectorMcpEntry(entry)) {
				this._onDidSelectConnector.fire(entry.connector.connector);
				return;
			}
			this._onDidSelectServer.fire(entry.type === 'marketplace-item'
				? createWorkbenchMcpServerDetailInput(entry.server)
				: this.createInstalledMcpServerDetailInput(entry));
		}));
		this._register(this.list.onContextMenu(event => {
			if (event.element && event.element.type !== 'group-header' && event.element.type !== 'marketplace-item') {
				this.showMcpServerActions(event.element, event.anchor);
			}
		}));
		this._register(this.list.onDidChangeFocus(event => {
			const entry = event.elements[0];
			itemRenderer.setFocusedRowKey(entry && entry.type !== 'group-header' && entry.type !== 'marketplace-item' ? getMcpRowKey(entry) : undefined);
			marketplaceRenderer.setFocusedServerId(entry?.type === 'marketplace-item' ? entry.server.id : undefined);
		}));

		// Listen to MCP service changes
		this._register(this.mcpWorkbenchService.onChange(() => {
			this.refresh();
		}));
		this._register(autorun(reader => {
			const servers = this.mcpService.servers.read(reader);
			for (const server of servers) {
				server.enablement.read(reader);
			}
			this.refresh();
		}));
		this._register(autorun(reader => {
			this.customizationHarnessService.activeSessionResource.read(reader);
			this.customizationHarnessService.availableHarnesses.read(reader);
			this.updateMcpServerCompatibilityScope();
			this.refresh();
		}));
		this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => {
			const previousMembership = this.getInstalledEntryMembershipSignature();
			this.filterServers(false);
			if (!hasSameMcpMembership(previousMembership, this.getInstalledEntryMembershipSignature())) {
				this.renderFilteredServers();
			}
		}));

	}

	private async refresh(): Promise<void> {
		this.filterServers();
		if (!this.isGalleryDiscoveryEnabled() && shouldLoadMcpGallerySnapshot(this.visible, this.searchQuery, this.gallerySnapshotServers.length, this.gallerySnapshotFailed, this.gallerySnapshotLoading, this.mcpAccessEnabled)) {
			await this.queryGallerySnapshot();
		}
	}

	private async refreshConnectors(): Promise<void> {
		if (!this.visible || !this.mcpAccessEnabled || !this.isConnectorsEnabled()) {
			return;
		}
		this.connectorsCancellation.value?.cancel();
		const cancellation = new CancellationTokenSource();
		this.connectorsCancellation.value = cancellation;
		try {
			await this.connectorsService.getConnectors(cancellation.token);
		} catch (error) {
			if (!cancellation.token.isCancellationRequested && !isCancellationError(error)) {
				this.logService.warn('[McpListWidget] Unable to refresh Copilot connectors', error);
			}
		} finally {
			if (this.connectorsCancellation.value === cancellation) {
				this.connectorsCancellation.clear();
				this.filterServers();
			}
		}
	}

	private isConnectorsEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) === true;
	}

	private updateConnectorChangeListener(): void {
		if (!this.isConnectorsEnabled()) {
			this.connectorChangeListener.clear();
			return;
		}
		this.connectorChangeListener.value ??= this.connectorsService.onDidChange(() => {
			if (this.visible) {
				this.filterServers();
				if (!this.connectorsService.connectionStateKnown) {
					void this.refreshConnectors();
				}
			}
		});
	}

	private isGalleryDiscoveryEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) === true;
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (visible) {
			this.updateMcpServerCompatibilityScope();
			void this.refresh();
			if (this.isConnectorsEnabled()) {
				void this.refreshConnectors();
			}
		} else {
			this.connectorsCancellation.value?.cancel();
			this.connectorsCancellation.clear();
			this.connectorActionCancellation.value?.cancel();
			this.connectorActionCancellation.clear();
			this.clearMcpServerCompatibilityScope();
		}
	}

	override dispose(): void {
		this.connectorActionCancellation.value?.cancel();
		super.dispose();
	}

	private updateMcpServerCompatibilityScope(): void {
		this.clearMcpServerCompatibilityScope();
		if (!this.visible) {
			return;
		}
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled) !== true) {
			return;
		}
		const descriptor = this.customizationHarnessService.getActiveDescriptor();
		const scope = descriptor.mcpServerCompatibilityProvider?.acquire(this.customizationHarnessService.activeSessionResource.get());
		if (!scope) {
			return;
		}
		const store = new DisposableStore();
		store.add(scope);
		store.add(autorun(reader => {
			const compatibility = new Map(scope.servers.read(reader).map(server => [server.id, server.kind] as const));
			this.mcpServerCompatibility.set(compatibility, undefined);
		}));
		this.mcpServerCompatibilityScope.value = store;
	}

	private clearMcpServerCompatibilityScope(): void {
		this.mcpServerCompatibilityScope.clear();
		if (this.mcpServerCompatibility.get().size > 0) {
			this.mcpServerCompatibility.set(new Map(), undefined);
		}
	}

	private updateAccessState(): void {
		const inspect = this.configurationService.inspect<string>(mcpAccessConfig);
		const value = inspect.value ?? inspect.defaultValue;
		const disabled = value === McpAccessValue.None;
		const policyLocked = inspect.policyValue === McpAccessValue.None;
		const accessChanged = this.mcpAccessEnabled === disabled;
		this.mcpAccessEnabled = !disabled;

		this.element.classList.toggle('access-disabled', disabled);

		if (disabled) {
			this.connectorsCancellation.value?.cancel();
			this.connectorsCancellation.clear();
			this.connectorActionCancellation.value?.cancel();
			this.connectorActionCancellation.clear();
			this.delayedGallerySearch.cancel();
			this.galleryCts?.dispose(true);
			this.galleryCts = undefined;
			this.gallerySnapshotLoading = false;
			this.gallerySearchLoading = false;
			this.searchInput.hideMessage();
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
		} else if (accessChanged && this.visible) {
			if (this.searchQuery.trim() && !this.isGalleryDiscoveryEnabled()) {
				void this.queryMcpSearch();
			} else {
				void this.refresh();
			}
			if (this.isConnectorsEnabled()) {
				void this.refreshConnectors();
			}
		}
	}

	public showBrowseMarketplace(): void {
		if (this.isGalleryDiscoveryEnabled()) {
			return;
		}
		if (!this.mcpAccessEnabled) {
			return;
		}
		this.searchInput.value = '';
		this.searchQuery = '';
		void this.queryGallerySnapshot(true);
	}

	private async queryLegacyGallery(options: IQueryOptions | undefined, token: CancellationToken): Promise<IWorkbenchMcpServer[]> {
		const [active, fallback] = await Promise.all([
			this.mcpGalleryManifestService.getMcpGalleryManifest(),
			this.mcpGalleryManifestService.getDefaultMcpGalleryManifest(),
		]);
		const manifests = active && fallback && active.url !== fallback.url ? [active, fallback] : [active ?? fallback ?? undefined];
		const pages = await Promise.allSettled((manifests[0] ? manifests : [undefined]).map(async manifest =>
			(await this.mcpWorkbenchService.queryGallery(options, token, manifest)).firstPage.items));
		if (pages.length && pages.every(page => page.status === 'rejected')) {
			throw pages[0].reason;
		}
		return pages.flatMap(page => page.status === 'fulfilled' ? page.value : []);
	}

	private async queryGallerySnapshot(revealMarketplace = false): Promise<void> {
		if (!this.mcpAccessEnabled || this.isGalleryDiscoveryEnabled()) {
			return;
		}
		this.galleryCts?.dispose(true);
		const cts = this.galleryCts = new CancellationTokenSource();
		this.gallerySnapshotLoading = true;
		if (!revealMarketplace && !this.searchQuery.trim()) {
			this.renderMcpHome();
		}

		try {
			const servers = await this.queryLegacyGallery(undefined, cts.token);
			if (this.galleryCts !== cts || cts.token.isCancellationRequested || !this.mcpAccessEnabled || this.searchQuery.trim()) {
				return;
			}

			this.gallerySnapshotServers = servers;
			this.galleryServers = [...this.gallerySnapshotServers];
			this.gallerySnapshotFailed = false;
			this.gallerySnapshotLoading = false;
			this.renderMcpHome();
			if (revealMarketplace) {
				const group = this.currentTreeGroups.find(group => group.id === 'available');
				if (group) {
					this.list?.reveal(group.element);
				}
			}
		} catch {
			if (this.galleryCts === cts && !cts.token.isCancellationRequested && this.mcpAccessEnabled) {
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
		if (!query || !this.mcpAccessEnabled || this.isGalleryDiscoveryEnabled()) {
			return;
		}

		this.galleryCts?.dispose(true);
		const cts = this.galleryCts = new CancellationTokenSource();
		this.gallerySearchLoading = true;
		try {
			const servers = await this.queryLegacyGallery({ text: query }, cts.token);
			if (this.galleryCts !== cts || cts.token.isCancellationRequested || !this.mcpAccessEnabled || this.searchQuery.trim() !== query) {
				return;
			}
			this.galleryServers = servers;
			this.searchInput.hideMessage();
		} catch {
			if (this.galleryCts === cts && !cts.token.isCancellationRequested && this.mcpAccessEnabled && this.searchQuery.trim() === query) {
				this.galleryServers = this.gallerySnapshotServers.filter(server => this.matchesGalleryServerQuery(server, query.toLowerCase()));
				this.searchInput.showMessage({
					content: localize('mcpSearchMarketplaceUnavailable', "Marketplace results are unavailable. Showing installed MCP servers only."),
					type: MessageType.WARNING,
				});
			}
		} finally {
			if (this.galleryCts === cts && this.mcpAccessEnabled && this.searchQuery.trim() === query) {
				this.gallerySearchLoading = false;
				this.filterServers();
			}
		}
	}

	private addSurfaceActivation(surface: HTMLElement, label: string, callback: () => void, ...classNames: string[]): HTMLButtonElement {
		const primaryAction = createCustomizationCardPrimaryAction(surface, label, ...classNames);
		this.firstCardFocusElement ??= primaryAction;
		this.cardDisposables.add(DOM.addDisposableListener(primaryAction, 'click', callback));
		return primaryAction;
	}

	private getMcpServerCompatibilityKind(entry: IMcpInstalledEntry, reader?: IReader): CustomizationMcpServerCompatibilityKind | undefined {
		const id = getMcpServerCompatibilityId(entry);
		return id ? (reader ? this.mcpServerCompatibility.read(reader) : this.mcpServerCompatibility.get()).get(id) : undefined;
	}

	private createInstalledMcpServerDetailInput(entry: IMcpInstalledEntry): IMcpServerDetailInput {
		return createInstalledMcpServerDetailInput(entry, derived(this, reader => {
			const activeSessionServer = getActiveSessionServer(entry);
			if (activeSessionServer) {
				this.agentHostCustomizationsChanged.read(reader);
				const sessionResource = this.customizationHarnessService.activeSessionResource.read(reader);
				const server = this.agentHostCustomizationService.getMcpServers(sessionResource).find(server => server.id === activeSessionServer.id);
				if (!server?.enabled) {
					return undefined;
				}
				const errorMessage = server?.state?.kind === McpServerStatus.Error ? server.state.error?.message : undefined;
				return getMcpErrorMessage(server?.state?.kind ?? server?.status, errorMessage);
			}
			if (entry.type === 'session-server-item' || !entry.localServer) {
				return undefined;
			}
			const runtimeServers = this.mcpService.servers.read(reader);
			const matchKeys = entry.type === 'server-item'
				? getWorkbenchServerMatchKeys(entry.server)
				: getRuntimeServerMatchKeys(entry.localServer);
			const localServer = new LocalMcpServerMatcher(runtimeServers).find(matchKeys);
			if (!localServer || isContributionDisabled(localServer.enablement.read(reader))) {
				return undefined;
			}
			const connectionState = localServer.connectionState.read(reader);
			return getMcpErrorMessage(connectionState.state, connectionState.state === McpConnectionState.Kind.Error ? connectionState.message : undefined);
		}));
	}

	private getMcpEntryAriaLabel(entry: IMcpInstalledEntry): IObservable<string> {
		return derived(this, reader => {
			this.agentHostCustomizationsChanged.read(reader);
			const label = getMcpEntryLabelWithSource(entry, this.labelService, this.agentPluginService, this.extensionsWorkbenchService);
			const compatibility = getMcpCompatibilityPresentation(this.getMcpServerCompatibilityKind(entry, reader));
			const activeSessionResource = this.customizationHarnessService.activeSessionResource.read(reader);
			let statusKind: McpStatusKind | undefined;
			let disabledReason: CustomizationDisabledReason | undefined;
			let errorMessage: string | undefined;
			const activeSessionServer = getActiveSessionServer(entry);
			if (activeSessionServer !== undefined) {
				const server = this.agentHostCustomizationService.getMcpServers(activeSessionResource).find(server => server.id === activeSessionServer.id);
				const presentation = server && getActiveSessionServerPresentation(server);
				statusKind = presentation?.status;
				disabledReason = presentation?.enabled ? undefined : server?.disabledReason;
				const message = server?.state?.kind === McpServerStatus.Error ? server.state.error?.message : undefined;
				errorMessage = getMcpErrorMessage(statusKind, message);
			} else if (entry.type !== 'session-server-item' && entry.localServer && isContributionDisabled(entry.localServer.enablement.read(reader))) {
				statusKind = 'disabled';
				disabledReason = getMcpDisabledReason(entry);
			} else if (entry.type !== 'session-server-item' && !this.workspaceService.isSessionsWindow) {
				const connectionState = entry.localServer?.connectionState.read(reader);
				statusKind = entry.type === 'server-item' || connectionState?.state === McpConnectionState.Kind.Error ? connectionState?.state : undefined;
				errorMessage = getMcpErrorMessage(statusKind, connectionState?.state === McpConnectionState.Kind.Error ? connectionState.message : undefined);
			}
			const status = getMcpStatusPresentation(statusKind, disabledReason);
			return [compatibility?.label, status?.label, errorMessage].reduce<string>(
				(result, detail) => detail ? localize('mcpServerAriaLabelWithStatus', "{0}, {1}", result, detail) : result,
				label,
			);
		});
	}

	private renderMcpListActions(getEntry: () => IMcpInstalledEntry | undefined, actions: HTMLElement, disposables: DisposableStore, updateTabbability: () => void): void {
		const entry = getEntry();
		if (!entry) {
			return;
		}
		const label = getMcpEntryLabel(entry);
		if (!isConnectorMcpEntry(entry)) {
			let enabled = this.isInstalledEntryEnabled(entry);
			const disabledLabel = DOM.append(actions, $('.mcp-server-disabled-label'));
			const toggle = disposables.add(this.instantiationService.createInstance(CustomizationToggle, { ariaLabel: label, checked: enabled }));
			DOM.append(actions, toggle.domNode);
			const update = () => {
				const currentEntry = getEntry();
				enabled = currentEntry ? this.isInstalledEntryEnabled(currentEntry) : false;
				const disabledReason = currentEntry && getMcpDisabledReason(currentEntry);
				const blockedByPlugin = disabledReason?.source === 'plugin';
				const toggleLabel = enabled ? localize('disableMcpServerAria', "Disable {0}", label) : localize('enableMcpServerAria', "Enable {0}", label);
				const accessibleLabel = blockedByPlugin ? localize('mcpServerManagedByPluginAria', "{0} is disabled by its plugin", label) : toggleLabel;
				disabledLabel.textContent = enabled ? '' : getMcpDisabledLabel(disabledReason);
				disabledLabel.style.display = enabled ? 'none' : '';
				toggle.disabled = !currentEntry || !!blockedByPlugin;
				toggle.checked = enabled;
				toggle.setAriaLabel(accessibleLabel);
				updateTabbability();
			};
			update();
			disposables.add(DOM.addDisposableGenericMouseDownListener(toggle.domNode, event => DOM.EventHelper.stop(event, true)));
			disposables.add(toggle.onChange(checked => {
				const currentEntry = getEntry();
				if (!currentEntry) {
					update();
					return;
				}
				enabled = checked;
				this.setInstalledEntryEnabled(currentEntry, enabled);
				update();
				status(enabled ? localize('mcpServerEnabledStatus', "{0} enabled.", label) : localize('mcpServerDisabledStatus', "{0} disabled.", label));
			}));
			if (entry.type !== 'session-server-item' && entry.localServer) {
				disposables.add(autorun(reader => {
					entry.localServer?.enablement.read(reader);
					update();
				}));
			}
			disposables.add(this.agentHostCustomizationService.onDidChangeCustomizations(update));
		}

		const more = disposables.add(new Button(actions, {
			...getButtonStyles({ buttonSecondaryBackground: undefined, buttonSecondaryBorder: undefined }),
			secondary: true,
			supportIcons: true,
			ariaLabel: localize('mcpMoreActionsAria', "More actions for {0}", label),
		}));
		more.element.classList.add('plugin-card-icon-button');
		more.label = `$(${Codicon.ellipsis.id})`;
		registerMcpInlineButtonAction(disposables, more, () => {
			const currentEntry = getEntry();
			if (currentEntry) {
				this.showMcpServerActions(currentEntry, more.element);
			}
		});
	}

	private layoutMcpSectionLists(): void {
		const content = this.sectionLayoutContainer;
		if (!content || content.clientWidth === 0) {
			return;
		}
		const heights = layoutVirtualizedSections(content, this.sectionLists.map(section => ({
			container: section.container,
			contentHeight: section.list.contentHeight,
			minimumHeight: getVirtualizedSectionMinimumHeight(section.entries.map((_entry, index) => index), index => section.list.getElementHeight(index)),
		})));
		for (let index = 0; index < this.sectionLists.length; index++) {
			const section = this.sectionLists[index];
			const height = heights[index];
			section.container.style.height = `${height}px`;
			if (height > 0) {
				section.list.layout(height, section.container.clientWidth || undefined);
			}
		}
	}

	private scheduleMcpSectionLayout(): void {
		this.pendingSectionLayout.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.element), () => {
			this.layoutMcpSectionLists();
			this.cardScrollable.scanDomNode();
		});
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

	private renderMcpTree(): void {
		if (!this.list) {
			return;
		}

		const showGallery = !this.isGalleryDiscoveryEnabled();
		const allInstalledEntries = this.installedEntries.map(presentation => presentation.entry);
		const definitions = [
			{
				id: 'installed',
				label: localize('installedMcpServersSection', "Installed"),
				description: localize('installedMcpServersSectionDescription', "MCP servers installed or provided by the active workspace, plugins, extensions, and agent host."),
				icon: mcpServerIcon,
				entries: allInstalledEntries,
			},
			...(showGallery ? [{
				id: 'available',
				label: localize('availableMcpServersSection', "Available"),
				description: localize('availableMcpServersSectionDescription', "Browse and install MCP servers from the marketplace."),
				icon: Codicon.globe,
				entries: this.getAvailableGalleryServers().map(server => ({ type: 'marketplace-item' as const, server })),
			}] : []),
		];

		this.currentTreeGroups = definitions.map((group, index): ICustomizationTreeGroup<IMcpSectionEntry> => {
			const element: IMcpGroupHeaderEntry = {
				type: 'group-header',
				id: `mcp-group-${group.id}`,
				group: group.id,
				label: group.label,
				icon: group.icon,
				count: group.entries.length,
				isFirst: index === 0,
				description: group.description,
				collapsed: false,
			};
			return {
				id: group.id,
				label: group.label,
				description: group.description,
				count: group.entries.length,
				element,
				children: group.entries,
			};
		});

		this.cardScrollableNode.style.display = 'none';
		this.cardDisposables.clear();
		const children: IObjectTreeElement<IMcpSectionEntry>[] = this.currentTreeGroups.map(group => ({
			element: group.element,
			collapsible: true,
			collapsed: ObjectTreeElementCollapseState.PreserveOrExpanded,
			children: group.children.map(element => ({ element })),
		}));
		this.list.setChildren(null);
		this.list.setChildren(null, children);
		this.updateMcpTreeEmptyState(this.currentTreeGroups.reduce((count, group) => count + group.children.length, 0));
	}

	private updateMcpTreeEmptyState(itemCount: number): void {
		const empty = itemCount === 0;
		this.listContainer.style.display = empty ? 'none' : '';
		this.emptyContainer.style.display = empty ? 'flex' : 'none';
		if (empty) {
			this.emptyText.textContent = this.gallerySearchLoading
				? localize('searchingMcpMarketplace', "Searching the MCP marketplace...")
				: this.searchQuery.trim()
					? localize('noMatchingServers', "No servers match '{0}'", this.searchQuery)
					: localize('noMcpServersInGroup', "No MCP servers in this group");
			this.emptySubtext.textContent = this.gallerySearchLoading || !this.searchQuery.trim() ? '' : localize('tryDifferentSearch', "Try a different search term");
		}
	}

	private getMcpTreeEntryId(entry: IMcpSectionEntry): string {
		if (entry.type === 'group-header') {
			return entry.id;
		}
		return entry.type === 'marketplace-item' ? `marketplace:${entry.server.id}` : getMcpRowKey(entry);
	}

	private getVisibleMcpEntries(): readonly IMcpSectionEntry[] {
		return this.currentTreeGroups.flatMap(group => [group.element, ...group.children]);
	}

	private renderMcpHome(): void {
		if (this.searchQuery.trim()) {
			return;
		}

		this.renderMcpTree();
	}

	private renderMcpTreeGroupActions(entry: IMcpGroupHeaderEntry, container: HTMLElement, disposables: DisposableStore): void {
		if (entry.group !== 'installed') {
			return;
		}
		this.renderInstalledSectionActionsWithDisposables(container, disposables);
	}

	private renderInstalledSectionActionsWithDisposables(header: HTMLElement, disposables: DisposableStore): void {
		const actions = DOM.append(header, $('.plugin-card-section-actions'));
		const addLabel = localize('addServer', "Add Server");
		const add = this.installedAddButton = disposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, ariaLabel: addLabel }));
		add.element.classList.add('plugin-installed-action');
		add.label = this.narrowLayout ? localize('addServerNarrow', "Add") : addLabel;
		this.firstCardFocusElement ??= add.element;
		disposables.add(add.onDidClick(() => this.commandService.executeCommand(McpCommandIds.AddConfiguration)));
	}

	private startConnectorAction(): CancellationTokenSource {
		this.connectorActionCancellation.value?.cancel();
		const cancellation = new CancellationTokenSource();
		this.connectorActionCancellation.value = cancellation;
		return cancellation;
	}

	private showConnectorActions(connector: ICopilotConnector, anchor: HTMLElement | IMouseEvent): void {
		const disposables = new DisposableStore();
		const disconnect = disposables.add(new Action(
			'connectors.disconnect',
			getConnectorActionLabel('disconnect'),
			undefined,
			true,
			async () => {
				const cancellation = this.startConnectorAction();
				try {
					await this.connectorsService.disconnect(connector.name, cancellation.token);
					if (!cancellation.token.isCancellationRequested) {
						await this.refreshConnectors();
						if (!cancellation.token.isCancellationRequested) {
							status(localize('connectors.actionComplete', "{0}: {1}", connector.displayName, getConnectorActionLabel('disconnect')));
						}
					}
				} catch (error) {
					if (!cancellation.token.isCancellationRequested && !isCancellationError(error)) {
						this.notificationService.error(localize('connectors.actionFailed', "Unable to update {0}: {1}", connector.displayName, getErrorMessage(error)));
					}
				} finally {
					if (this.connectorActionCancellation.value === cancellation) {
						this.connectorActionCancellation.clear();
					}
				}
			},
		));
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [disconnect],
			onHide: () => disposables.dispose(),
		});
	}

	protected appendInstalledServerRow(parent: HTMLElement, presentation: IMcpInstalledPresentation): void {
		let entry = presentation.entry;
		const rowKey = getMcpRowKey(entry);
		const label = getMcpEntryLabel(entry);
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row.mcp-installed-home-row'));
		const enabled = this.isInstalledEntryEnabled(entry);
		row.classList.toggle('disabled', !enabled);

		const content = DOM.append(row, $('.mcp-installed-card-content'));
		const primaryAction = this.addSurfaceActivation(content, getMcpEntryAriaLabel(entry, this.workspaceService.isSessionsWindow, this.getMcpServerCompatibilityKind(entry), this.labelService, this.agentPluginService, this.extensionsWorkbenchService), () => this._onDidSelectServer.fire(this.createInstalledMcpServerDetailInput(entry)));
		const details = DOM.append(primaryAction, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		name.textContent = formatDisplayName(label);
		name.title = label;
		const description = DOM.append(details, $('.plugin-list-item-description'));
		const compatibilityMessage = DOM.append(content, $('.mcp-server-compatibility-message'));
		const compatibilityMessageDisposables = this.cardDisposables.add(new DisposableStore());

		const actions = DOM.append(row, $('.plugin-list-item-action'));
		const getEntry = () => entry;
		const signIn = this.appendInstalledServerSignIn(actions, getEntry);
		const start = this.appendInstalledServerStart(actions, getEntry);
		const errorActions = DOM.append(actions, $('.mcp-server-error-actions'));
		const statusIcon = DOM.append(errorActions, $('span.mcp-server-state-icon'));
		const showOutput = this.appendInstalledServerShowOutput(errorActions, getEntry);
		const toggle = this.appendInstalledServerToggle(actions, getEntry);
		const more = this.cardDisposables.add(new Button(actions, { ...getButtonStyles({ buttonSecondaryBackground: undefined, buttonSecondaryBorder: undefined }), secondary: true, supportIcons: true, ariaLabel: localize('mcpMoreActionsAria', "More actions for {0}", label) }));
		more.element.classList.add('plugin-card-icon-button');
		more.label = `$(${Codicon.ellipsis.id})`;
		this.cardDisposables.add(more.onDidClick(() => this.showMcpServerActions(entry, more.element)));
		this.cardListControllers.get(parent)?.addItem({
			row,
			primaryAction,
			label,
			actions: [compatibilityMessage, signIn?.element, start.element, showOutput.element, toggle.element, more.element].filter((action): action is HTMLElement => action !== undefined),
			contextMenuAction: more.element,
		});

		this.cardDisposables.add(autorun(reader => {
			if (entry.type !== 'session-server-item') {
				entry.localServer?.connectionState.read(reader);
			}
			const compatibilityKind = this.getMcpServerCompatibilityKind(entry, reader);
			updateMcpCompatibilityMessage(compatibilityMessage, compatibilityKind, compatibilityMessageDisposables, () => this._onDidRequestOpenMigrations.fire());
			updateMcpCardRuntimePresentation(
				statusIcon,
				primaryAction,
				description,
				getMcpStatusKind(entry, this.workspaceService.isSessionsWindow),
				getMcpDisabledReason(entry),
				getMcpEntryAriaLabel(entry, this.workspaceService.isSessionsWindow, compatibilityKind, this.labelService, this.agentPluginService, this.extensionsWorkbenchService),
				this.getInstalledEntryDescription(entry),
			);
			updateMcpCompatibilityIcon(statusIcon, compatibilityKind, getMcpStatusPresentation(getMcpStatusKind(entry, this.workspaceService.isSessionsWindow))?.icon);
			start.update();
			showOutput.update();
		}));
		this.cardDisposables.add(this.agentHostCustomizationService.onDidChangeCustomizations(() => {
			const updated = this.installedEntries.find(candidate => getMcpRowKey(candidate.entry) === rowKey)?.entry;
			if (!updated) {
				return;
			}
			entry = updated;
			const compatibilityKind = this.getMcpServerCompatibilityKind(entry);
			updateMcpCompatibilityMessage(compatibilityMessage, compatibilityKind, compatibilityMessageDisposables, () => this._onDidRequestOpenMigrations.fire());
			updateMcpCardRuntimePresentation(
				statusIcon,
				primaryAction,
				description,
				getMcpStatusKind(entry, this.workspaceService.isSessionsWindow),
				getMcpDisabledReason(entry),
				getMcpEntryAriaLabel(entry, this.workspaceService.isSessionsWindow, compatibilityKind, this.labelService, this.agentPluginService, this.extensionsWorkbenchService),
				this.getInstalledEntryDescription(entry),
			);
			updateMcpCompatibilityIcon(statusIcon, compatibilityKind, getMcpStatusPresentation(getMcpStatusKind(entry, this.workspaceService.isSessionsWindow))?.icon);
			signIn?.update();
			start.update();
			showOutput.update();
			toggle.update();
			row.classList.toggle('disabled', !this.isInstalledEntryEnabled(entry));
		}));
	}

	private appendInstalledServerSignIn(parent: HTMLElement, getEntry: () => IMcpInstalledEntry): { readonly element: HTMLElement; update(): void } | undefined {
		if (getActiveSessionServer(getEntry()) === undefined) {
			return undefined;
		}

		const label = getMcpEntryLabel(getEntry());
		const signInButton = createMcpSignInButton(parent, this.cardDisposables, label);
		const actionDisposables = this.cardDisposables.add(new DisposableStore());
		let hasAuthRequiredAction = false;
		const update = () => {
			const isAuthRequired = getMcpStatusKind(getEntry(), this.workspaceService.isSessionsWindow) === McpServerStatus.AuthRequired;
			if (hasAuthRequiredAction !== isAuthRequired) {
				actionDisposables.clear();
				resetMcpSignInButton(signInButton, label, true);
				hasAuthRequiredAction = isAuthRequired;
				if (isAuthRequired) {
					registerMcpSignInButtonAction(actionDisposables, signInButton, label, async () => {
						const activeSessionServer = getActiveSessionServer(getEntry());
						if (!activeSessionServer) {
							return;
						}
						try {
							return await authenticateMcpServer(this.agentHostCustomizationService, this.customizationHarnessService.activeSessionResource.get(), activeSessionServer.id);
						} catch (error) {
							this.notificationService.error(localize('mcpAuthenticationFailed', "Unable to sign in to {0}: {1}", label, getErrorMessage(error)));
							return false;
						}
					});
				}
			}
			signInButton.element.style.display = isAuthRequired ? '' : 'none';
		};
		update();
		return { element: signInButton.element, update };
	}

	private appendInstalledServerStart(parent: HTMLElement, getEntry: () => IMcpInstalledEntry): { readonly element: HTMLElement; update(): void } {
		const startButton = createMcpStartButton(parent, this.cardDisposables, getMcpEntryLabel(getEntry()));
		registerMcpInlineButtonAction(this.cardDisposables, startButton, async () => {
			startButton.enabled = false;
			try {
				await startMcpEntry(getEntry());
			} finally {
				startButton.enabled = true;
			}
		});
		const update = () => {
			const state = getMcpStatusKind(getEntry(), this.workspaceService.isSessionsWindow);
			startButton.element.style.display = state === McpServerStatus.Stopped || state === McpConnectionState.Kind.Stopped ? '' : 'none';
		};
		update();
		return { element: startButton.element, update };
	}

	private appendInstalledServerShowOutput(parent: HTMLElement, getEntry: () => IMcpInstalledEntry): { readonly element: HTMLElement; update(): void } {
		const showOutputButton = createMcpShowOutputButton(parent, this.cardDisposables, getMcpEntryLabel(getEntry()));
		registerMcpInlineButtonAction(this.cardDisposables, showOutputButton, () => this.showMcpServerOutput(getEntry()));
		const update = () => {
			const state = getMcpStatusKind(getEntry(), this.workspaceService.isSessionsWindow);
			showOutputButton.element.style.display = state === McpServerStatus.Error || state === McpConnectionState.Kind.Error ? '' : 'none';
		};
		update();
		return { element: showOutputButton.element, update };
	}

	private appendInstalledServerToggle(parent: HTMLElement, getEntry: () => IMcpInstalledEntry): { readonly element: HTMLElement; update(): void } {
		const label = getMcpEntryLabel(getEntry());
		let enabled = this.isInstalledEntryEnabled(getEntry());
		const disabledLabel = DOM.append(parent, $('.mcp-server-disabled-label'));
		const toggle = this.cardDisposables.add(this.instantiationService.createInstance(CustomizationToggle, { ariaLabel: label, checked: enabled }));
		const switchElement = toggle.domNode;
		DOM.append(parent, switchElement);
		const updateLabel = () => {
			const blockedByPlugin = getMcpDisabledReason(getEntry())?.source === 'plugin';
			const toggleLabel = enabled
				? localize('disableMcpServerAria', "Disable {0}", label)
				: localize('enableMcpServerAria', "Enable {0}", label);
			const accessibleLabel = blockedByPlugin
				? localize('mcpServerManagedByPluginAria', "{0} is disabled by its plugin", label)
				: toggleLabel;
			toggle.setAriaLabel(accessibleLabel);
		};
		updateLabel();
		this.cardDisposables.add(toggle.onChange(checked => {
			enabled = checked;
			updateLabel();
			this.setInstalledEntryEnabled(getEntry(), enabled);
			status(enabled
				? localize('mcpServerEnabledStatus', "{0} enabled.", label)
				: localize('mcpServerDisabledStatus', "{0} disabled.", label));
		}));
		const update = () => {
			enabled = this.isInstalledEntryEnabled(getEntry());
			const disabledReason = getMcpDisabledReason(getEntry());
			disabledLabel.textContent = enabled ? '' : getMcpDisabledLabel(disabledReason);
			disabledLabel.style.display = enabled ? 'none' : '';
			toggle.disabled = disabledReason?.source === 'plugin';
			toggle.checked = enabled;
			updateLabel();
		};
		update();
		return { element: switchElement, update };
	}

	protected appendMarketplaceServerRow(parent: HTMLElement, server: IWorkbenchMcpServer): void {
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row.plugin-marketplace-home-row'));
		const primaryAction = this.addSurfaceActivation(row, localize('marketplaceMcpServerRowAriaLabel', "{0}. Available to install from the MCP marketplace.", server.label), () => this._onDidSelectServer.fire(createWorkbenchMcpServerDetailInput(server)));
		const details = DOM.append(primaryAction, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.plugin-list-item-name'));
		name.textContent = server.label;
		name.title = server.label;
		const description = DOM.append(details, $('.plugin-list-item-description'));
		description.textContent = truncateToFirstLine(server.description || localize('mcpNoDescription', "No description provided."));
		const actions = DOM.append(row, $('.plugin-list-item-action'));
		const install = this.cardDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('installMcpServerAria', "Install {0}", server.label) }));
		install.element.classList.add('plugin-list-item-install-button');
		install.label = localize('install', "Install");
		this.cardDisposables.add(install.onDidClick(() => this.installMarketplaceServer(server, install)));
		this.cardListControllers.get(parent)?.addItem({
			row,
			primaryAction,
			label: server.label,
			actions: [install.element],
		});
	}

	private async installMarketplaceServer(server: IWorkbenchMcpServer, button: Button): Promise<void> {
		button.label = localize('installing', "Installing...");
		button.enabled = false;
		try {
			await this.mcpWorkbenchService.install(server);
			status(localize('mcpServerInstalledStatus', "{0} installed.", server.label));
			await this.refresh();
		} catch (error) {
			button.label = localize('install', "Install");
			button.enabled = true;
			this.notificationService.error(localize('mcpInstallFailed', "Unable to install MCP server: {0}", getErrorMessage(error)));
		}
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
		const localServer = entry.type === 'session-server-item' ? undefined : entry.localServer;
		const serverId = localServer?.definition.id ?? (entry.type === 'server-item' ? entry.server.id : undefined);
		return isPrimaryMcpServerEnabled(this.mcpService, serverId, activeSessionServer);
	}

	private isInstalledEntryInUse(entry: IMcpInstalledEntry): boolean {
		return isMcpServerInUse(this.isInstalledEntryEnabled(entry), getActiveSessionServer(entry));
	}

	private setInstalledEntryEnabled(entry: IMcpInstalledEntry, enabled: boolean): void {
		const activeSessionServer = getActiveSessionServer(entry);
		const localServer = entry.type === 'session-server-item' ? undefined : entry.localServer;
		const serverId = localServer?.definition.id ?? (entry.type === 'server-item' ? entry.server.id : undefined);
		setPrimaryMcpServerEnablement(
			this.mcpService,
			this.agentHostCustomizationService,
			this.customizationHarnessService.activeSessionResource.get(),
			serverId,
			activeSessionServer,
			enabled,
		);
	}

	private updateSearchResults(): void {
		this.renderMcpTree();
	}

	private filterServers(render = true): void {
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
		const extensionServers: Array<{ server: IMcpServer; activeSessionServer?: AgentHostMcpServer; extensionId: ExtensionIdentifier }> = [];
		const otherBuiltinServers: Array<{ server: IMcpServer; activeSessionServer?: AgentHostMcpServer }> = [];
		for (const server of builtinServers) {
			const entry = { server, activeSessionServer: activeSessionMatcher.take(getRuntimeServerMatchKeys(server)) };
			const source = collectionSources.get(server.collection.id);
			if (server.collection.id.startsWith(PLUGIN_COLLECTION_PREFIX)) {
				pluginServers.push(entry);
			} else if (source instanceof ExtensionIdentifier && !isCopilotExtension(source)) {
				extensionServers.push({ ...entry, extensionId: source });
			} else {
				otherBuiltinServers.push(entry);
			}
		}
		const regularMatchKeys = new Set([
			...this.filteredServers.flatMap(getWorkbenchServerMatchKeys),
			...builtinServers.flatMap(getRuntimeServerMatchKeys),
		].map(key => key.toLowerCase()));
		const connectorMcpEntries = this.isConnectorsEnabled()
			? this.connectorsService.connectedMcpServers
				.filter(server => !regularMatchKeys.has(server.serverName.toLowerCase()))
				.filter(server => !query || [
					server.connector.displayName,
					server.connector.description,
					server.serverName,
				].some(value => value.toLowerCase().includes(query)))
				.map(server => createConnectorMcpEntry(server, activeSessionMatcher.take([server.serverName])))
			: [];
		const activeSessionOnlyServers = activeSessionMatcher.unmatched(query);
		const activeSessionBuiltinEntries = createBuiltinActiveSessionMcpEntries(activeSessionOnlyServers);
		this.installedEntries = [
			...groups.flatMap(group => group.entries.map(entry => ({ entry }))),
			...pluginServers.map(({ server, activeSessionServer }) => ({ entry: createBuiltinEntry(server, activeSessionServer) })),
			...extensionServers.map(({ server, activeSessionServer, extensionId }) => ({ entry: createBuiltinEntry(server, activeSessionServer, extensionId) })),
			...otherBuiltinServers.map(({ server, activeSessionServer }) => ({ entry: createBuiltinEntry(server, activeSessionServer) })),
			...connectorMcpEntries.map(entry => ({ entry })),
			...activeSessionBuiltinEntries.map(entry => ({ entry })),
		];
		this.installedEntries = preserveMcpEntryOrder(this.installedEntries, this.installedEntryOrder);

		this._onDidChangeItemCount.fire(this.itemCount);
		if (render) {
			this.renderFilteredServers();
		}
	}

	private renderFilteredServers(): void {
		if (this.searchQuery.trim()) {
			this.updateSearchResults();
		} else {
			this.renderMcpHome();
		}
	}

	private getInstalledEntryMembershipSignature(): string {
		return this.installedEntries.map(({ entry }) => [
			getMcpRowKey(entry),
			getMcpEntryGroup(entry),
			getActiveSessionServer(entry) ? 'session' : '',
			entry.type !== 'session-server-item' && entry.localServer ? 'local' : '',
			getMcpEntrySourceUri(entry)?.toString() ?? '',
		].join(':')).join('|');
	}

	/** Gets the effective enabled item count for the section badge. */
	get itemCount(): number {
		return this.installedEntries.filter(({ entry }) => this.isInstalledEntryInUse(entry)).length;
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
		if (!this.visible || this.element.parentElement?.style.display === 'none') {
			return;
		}

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
		const listHeight = getCustomizationTreeContentHeight(this.element, this.listContainer, availableHeight);
		this.cardScrollableNode.style.height = `${listHeight}px`;
		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight, width);
		this.scheduleMcpSectionLayout();
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
		const entries = this.getVisibleMcpEntries();
		if (entries.length > 0) {
			this.list.reveal(entries[entries.length - 1]);
		}
	}

	/**
	 * Focuses the list.
	 */
	focus(): void {
		const firstItem = this.getVisibleMcpEntries().find(entry => entry.type !== 'group-header');
		if (firstItem) {
			this.list.setFocus([firstItem]);
			this.list.domFocus();
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

	private showMcpServerActions(entry: IMcpInstalledEntry, anchor: HTMLElement | IMouseEvent): void {
		if (isConnectorMcpEntry(entry)) {
			this.showConnectorActions(entry.connector.connector, anchor);
			return;
		}
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

	private getMcpServerOutputHandler(entry: IMcpInstalledEntry): (() => Promise<void>) | undefined {
		const sessionResource = this.customizationHarnessService.activeSessionResource.get();
		const activeSessionServer = getActiveSessionServer(entry);
		return activeSessionServer
			? getMcpServerOutputHandler(this.outputService, undefined, activeSessionServer, undefined, () => this.agentHostCustomizationService.showMcpServerLog(sessionResource, activeSessionServer.id))
			: getMcpServerOutputHandler(this.outputService, entry.type === 'session-server-item' ? undefined : entry.localServer, undefined);
	}

	private async showMcpServerOutput(entry: IMcpInstalledEntry): Promise<void> {
		const currentEntry = resolveMcpEntry(entry, this.agentHostCustomizationService, this.customizationHarnessService.activeSessionResource.get());
		const showOutput = currentEntry && this.getMcpServerOutputHandler(currentEntry);
		await showOutput?.();
	}

	private getMcpServerActions(entry: IMcpInstalledEntry, disposables: DisposableStore): IAction[] {
		const sessionResource = this.customizationHarnessService.activeSessionResource.get();
		const currentEntry = resolveMcpEntry(entry, this.agentHostCustomizationService, sessionResource);
		if (!currentEntry) {
			return [];
		}
		entry = currentEntry;
		const activeSessionServer = getActiveSessionServer(entry);
		const actions = this.getMcpServerManagementActions(entry, disposables);
		if (!activeSessionServer && entry.type === 'server-item') {
			return actions;
		}

		const showOutput = this.getMcpServerOutputHandler(entry);
		const outputIndex = actions.findIndex(action => action instanceof ShowServerOutputAction);
		if (outputIndex !== -1) {
			actions.splice(outputIndex, 1);
		}
		if (showOutput) {
			const outputAction = disposables.add(new Action('mcpServer.showOutput', localize('output', "Show Output"), undefined, true, showOutput));
			if (outputIndex !== -1) {
				actions.splice(outputIndex, 0, outputAction);
			} else {
				if (actions.length > 0) {
					actions.push(new Separator());
				}
				actions.push(outputAction);
			}
		}
		return actions;
	}

	private getMcpServerManagementActions(entry: IMcpInstalledEntry, disposables: DisposableStore): IAction[] {
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
						this._onDidRequestShowPlugin.fire(createInstalledPluginItem(plugin));
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
							await plugin.remove?.();
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
