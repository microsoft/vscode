/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationDiscovery.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { alert, status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { createPixelSpinner } from '../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { ProgressBar } from '../../../../../base/browser/ui/progressbar/progressbar.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action, IAction, Separator, SubmenuAction } from '../../../../../base/common/actions.js';
import { equals } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { getErrorMessage, isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derivedOpts } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceQueryProgressCallback, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceBrowseSection, ICustomizationMarketplaceBrowseSections, ICustomizationMarketplaceCursor, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceResource, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceError, ICustomizationMarketplaceSourceInfo } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { affectsCustomizationMarketplaceSources, CustomizationMarketplaceSources, getVisibleCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { defaultButtonStyles, defaultProgressBarStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { verifiedPublisherIcon } from '../../../../services/extensionManagement/common/extensionsIcons.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { SuggestEnabledInput } from '../../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { IMcpWorkbenchService, McpServerInstallState } from '../../../mcp/common/mcpTypes.js';
import { CustomizationMarketplaceInstallationTarget, CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallationSnapshot, ICustomizationMarketplaceInstallService, IRecordedCustomizationMarketplaceResource, RecordedCustomizationMarketplaceInstallState } from '../../common/customizationMarketplaceInstallService.js';
import { AICustomizationManagementSection, IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { customizationSearchMatchesAny } from '../../common/aiCustomizationSearch.js';
import { isPluginCustomizationItem } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { MANAGE_PLUGIN_MARKETPLACES_COMMAND_ID } from '../actions/chatPluginActions.js';
import { getPluginManagedByOrganizationMessage, isPluginRequiredByPolicy } from '../agentPluginActions.js';
import { IAICustomizationListItem } from './aiCustomizationItemSource.js';
import { IAICustomizationItemsModel, ITEMS_MODEL_SECTIONS, ItemsModelSection } from './aiCustomizationItemsModel.js';
import { DELETE_AI_CUSTOMIZATION_ID } from './aiCustomizationManagement.js';
import { getCustomizationDiscoveryQuerySuggestions, CustomizationDiscoveryQuery, CustomizationDiscoveryType } from './aiCustomizationQuery.js';
import { renderCustomizationMarketplaceIcon } from './aiCustomizationPresentation.js';
import { IAICustomizationWelcomePageImplementation, ICustomizationMarketplaceOrigin, IWelcomePageCallbacks } from './aiCustomizationWelcomePage.js';
import { CustomizationMarketplaceSourceWarnings } from './customizationMarketplaceSourceWarnings.js';
import { createCustomizationCardPrimaryAction } from './customizationCardList.js';
import { createWorkbenchMcpServerDetailInput, IMcpServerDetailInput } from './embeddedMcpServerDetail.js';
import { getPluginCustomizationMarketplaceSourceId } from './pluginCustomizationMarketplaceProvider.js';

const $ = DOM.$;
const searchDelay = 300;
const catalogPageSize = 24;
const canvasCatalogPageSize = 50;
const browseCatalogPageSize = 100;
const maxFilteredCatalogPagesPerLoad = 8;
/** Bounds how many pages an in-place refresh re-fetches to restore the results the user had loaded. */
const maxRefreshCatalogPages = 20;
const leadingBrowseItemCount = 4;
const loadingAnnouncementDelay = 1000;

type CustomizationMarketplaceBrowseRenderedEvent = {
	view: 'curated' | 'fallback';
	curatedSectionCount: number;
};

type CustomizationMarketplaceBrowseRenderedClassification = {
	owner: 'pwang347';
	comment: 'Tracks whether the customization Browse page rendered curated feed sections or the fallback grouped catalog without collecting customization identifiers or content.';
	view: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the rendered Browse content used curated sections or fallback catalog groups.' };
	curatedSectionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of curated sections rendered, or zero for the fallback grouped catalog.' };
};

type CustomizationMarketplaceBrowseLoadedEvent = {
	timeToFirstContentMs: number;
	timeToSettledMs: number;
	sourceCount: number;
	cachedSourceCount: number;
};

type CustomizationMarketplaceBrowseLoadedClassification = {
	owner: 'houghj16';
	comment: 'Tracks Browse loading responsiveness and in-memory cache use without collecting source identifiers, queries, or customization content.';
	timeToFirstContentMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds until the first cached or freshly loaded Browse content was available, or -1 when no content loaded.' };
	timeToSettledMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds until all applicable Browse sources settled.' };
	sourceCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of applicable fallback and curated sources.' };
	cachedSourceCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of applicable sources with reusable in-memory content.' };
};

interface IMarketplaceLoadProgress {
	readonly completed: number;
	readonly total: number;
	readonly cached: number;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	return a.size === b.size && [...a].every(value => b.has(value));
}

function formatCompactCount(count: number): string {
	if (count > 1_000_000) {
		return `${Math.floor(count / 100_000) / 10}M`;
	} else if (count > 1000) {
		return `${Math.floor(count / 1000)}K`;
	}
	return String(count);
}

const resultRowHeight = 56;
const linkedAlternativeRowHeight = 80;
const collapsedLinkedAlternativeRowHeight = 32;
const searchInputHeight = 20;
const firstPartyPublishers = new Set(['azure', 'azure-samples', 'github', 'microsoft', 'microsoftdocs']);
const firstPartyMcpNamespaces = new Set(['azure', 'azure-ai-foundry', 'com.microsoft', 'io.github.azure', 'io.github.azure-samples', 'io.github.github', 'io.github.microsoft', 'io.github.microsoftdocs']);

type DiscoveryItemType = 'agent' | 'skill' | 'instructions' | 'prompt' | 'hook' | 'mcp' | 'plugin';

function isFirstPartyBrowseItem(resource: ICustomizationMarketplaceResource): boolean {
	if (resource.publisher && firstPartyPublishers.has(resource.publisher.toLowerCase())) {
		return true;
	}
	if (resource.installation?.kind !== 'mcp') {
		return false;
	}
	const separator = resource.installation.name.indexOf('/');
	const namespace = (separator === -1 ? resource.installation.name : resource.installation.name.slice(0, separator)).toLowerCase();
	return firstPartyMcpNamespaces.has(namespace);
}

function getLeadingBrowseItems(resources: readonly IPrioritizedMarketplaceResource[]): readonly IPrioritizedMarketplaceResource[] {
	const groups = groupPrioritizedMarketplaceResources(resources);
	const firstParty = groups.filter(group => group.some(({ resource }) => isFirstPartyBrowseItem(resource))).slice(0, leadingBrowseItemCount);
	if (firstParty.length === leadingBrowseItemCount) {
		return firstParty.flat();
	}
	const firstPartyKeys = new Set(firstParty.flatMap(group => group.map(({ resource }) => getCustomizationMarketplaceResourceKey(resource))));
	return [
		...firstParty,
		...groups.filter(group => group.every(({ resource }) => !firstPartyKeys.has(getCustomizationMarketplaceResourceKey(resource)))),
	].slice(0, leadingBrowseItemCount).flat();
}

interface IInstalledDiscoveryItem {
	readonly kind: 'installed';
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly sourceLabel?: string;
	readonly type: DiscoveryItemType;
	readonly section: AICustomizationManagementSection;
	readonly uri?: URI;
	readonly source?: IAICustomizationListItem['source'];
	readonly promptType?: PromptsType;
	readonly itemId?: string;
	readonly removable?: boolean;
	readonly mcpServerId?: string;
	readonly mcpConnectorName?: string;
	readonly disabled?: boolean;
	readonly catalogResource?: ICustomizationMarketplaceResource;
	readonly promptDetail?: IAICustomizationListItem;
	readonly pluginDetail?: IAgentPluginItem;
	readonly mcpDetail?: IMcpServerDetailInput;
	readonly linkedConnectionRole?: LinkedConnectionRole;
	readonly alternativeExpanded?: boolean;
}

interface ICatalogDiscoveryItem {
	readonly kind: 'available';
	readonly id: string;
	readonly resource: ICustomizationMarketplaceResource;
	readonly linkedConnectionRole?: LinkedConnectionRole;
	readonly alternativeExpanded?: boolean;
}

type DiscoveryListEntry = (IInstalledDiscoveryItem | ICatalogDiscoveryItem | { readonly kind: 'loading'; readonly id: 'loading' }) & {
	// Snapshot action state so unchanged rows can be retained without leaving stale buttons.
	readonly installationState?: CustomizationMarketplaceInstallState;
	readonly uninstalling?: boolean;
	readonly installError?: string;
};
type LinkedConnectionRole = 'connector' | 'alternative';

interface IPrioritizedMarketplaceResource {
	readonly resource: ICustomizationMarketplaceResource;
	readonly linkedConnectionRole?: LinkedConnectionRole;
}

type PrioritizedMarketplaceResourceGroup = readonly IPrioritizedMarketplaceResource[];

interface ICatalogPageState {
	readonly items: readonly ICustomizationMarketplaceResource[];
	readonly nextCursor?: ICustomizationMarketplaceCursor;
	readonly sourceErrors?: readonly ICustomizationMarketplaceSourceError[];
}

interface IBrowseCatalogCache {
	readonly items: readonly ICustomizationMarketplaceResource[];
	readonly page: ICatalogPageState | undefined;
	readonly curatedSections: readonly ICustomizationMarketplaceBrowseSection[] | undefined;
	readonly curatedSourceId: string | undefined;
	readonly sourceSections: readonly ISourceBrowseSection[];
	readonly curatedSourceError: ICustomizationMarketplaceSourceError | undefined;
}

interface ISourceBrowseSection extends ICustomizationMarketplaceBrowseSection {
	readonly sourceId: string;
}

type BrowseSectionsLoadOutcome =
	| { readonly kind: 'success'; readonly result: ICustomizationMarketplaceBrowseSections | undefined }
	| { readonly kind: 'error'; readonly error: Error };

interface IDiscoveryRowTemplate {
	readonly root: HTMLElement;
	readonly linkedConnectionLabel: HTMLButtonElement;
	readonly linkedConnectionText: HTMLElement;
	readonly linkedConnectionIcon: HTMLElement;
	readonly primaryAction: HTMLButtonElement;
	readonly icon: HTMLElement;
	readonly identity: HTMLElement;
	readonly name: HTMLElement;
	readonly verified: HTMLElement;
	readonly detail: HTMLElement;
	readonly description: HTMLElement;
	readonly stats: HTMLElement;
	readonly actions: HTMLElement;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

function getSectionType(section: ItemsModelSection): DiscoveryItemType {
	switch (section) {
		case AICustomizationManagementSection.Agents: return 'agent';
		case AICustomizationManagementSection.Skills: return 'skill';
		case AICustomizationManagementSection.Instructions: return 'instructions';
		case AICustomizationManagementSection.Hooks: return 'hook';
		default: return 'prompt';
	}
}

function getTypeLabel(type: DiscoveryItemType): string {
	switch (type) {
		case 'agent': return localize('customizationDiscovery.agent', "Agent");
		case 'skill': return localize('customizationDiscovery.skill', "Skill");
		case 'instructions': return localize('customizationDiscovery.instructions', "Instructions");
		case 'prompt': return localize('customizationDiscovery.prompt', "Prompt");
		case 'hook': return localize('customizationDiscovery.hook', "Hook");
		case 'mcp': return localize('customizationDiscovery.mcp', "MCP server");
		case 'plugin': return localize('customizationDiscovery.plugin', "Plugin");
	}
}

function getCatalogType(resource: ICustomizationMarketplaceResource): 'skill' | 'mcp' | 'plugin' | undefined {
	switch (resource.mediaType) {
		case CustomizationMarketplaceMediaType.Skill: return 'skill';
		case CustomizationMarketplaceMediaType.McpServer: return 'mcp';
		case CustomizationMarketplaceMediaType.CopilotPlugin:
		case CustomizationMarketplaceMediaType.ClaudePlugin:
			return 'plugin';
		default:
			return undefined;
	}
}

function isCanvasMarketplaceResource(resource: ICustomizationMarketplaceResource): boolean {
	return getCatalogType(resource) === 'plugin' && resource.compatibilityTags?.some(tag => tag === 'canvas' || tag === 'canvas-only') === true;
}

function getSectionForCatalogType(type: 'skill' | 'mcp' | 'plugin'): AICustomizationManagementSection {
	switch (type) {
		case 'skill': return AICustomizationManagementSection.Skills;
		case 'mcp': return AICustomizationManagementSection.McpServers;
		case 'plugin': return AICustomizationManagementSection.Plugins;
	}
}

function getSourceLabel(item: IAICustomizationListItem): string | undefined {
	if (item.isBuiltin) {
		return localize('customizationDiscovery.vsCodeSource', "VS Code");
	}
	switch (item.source) {
		case 'extension': return item.extensionId;
		case 'builtin': return localize('customizationDiscovery.vsCodeSource', "VS Code");
		default: return undefined;
	}
}

function normalizedName(value: string): string {
	return value.trim().toLowerCase();
}

function installationStatesEqual(a: CustomizationMarketplaceInstallState | undefined, b: CustomizationMarketplaceInstallState | undefined): boolean {
	if (!a || !b) {
		return a === b;
	}
	if (a.kind === 'unavailable' && b.kind === 'unavailable') {
		return a.message === b.message && isEqual(a.setupUrl, b.setupUrl);
	}
	if (hasInstallationTarget(a) && hasInstallationTarget(b)
		&& (a.target.kind === 'skill' || a.target.kind === 'plugin')
		&& (b.target.kind === 'skill' || b.target.kind === 'plugin')) {
		return isEqual(a.target.uri, b.target.uri) && structuralEquals(
			{ ...a, target: { ...a.target, uri: undefined } },
			{ ...b, target: { ...b.target, uri: undefined } },
		);
	}
	return structuralEquals(a, b);
}

function discoveryListEntriesEqual(a: DiscoveryListEntry, b: DiscoveryListEntry): boolean {
	const { installationState: aState, ...aItem } = a;
	const { installationState: bState, ...bItem } = b;
	if (!installationStatesEqual(aState, bState)) {
		return false;
	}
	if (aItem.kind === 'installed' && bItem.kind === 'installed') {
		return isEqual(aItem.uri, bItem.uri) && structuralEquals({ ...aItem, uri: undefined }, { ...bItem, uri: undefined });
	}
	return structuralEquals(aItem, bItem);
}

function hasInstallationTarget(state: CustomizationMarketplaceInstallState): state is Extract<CustomizationMarketplaceInstallState, { target: CustomizationMarketplaceInstallationTarget }> {
	return 'target' in state;
}

function getInstalledItemMarketplaceRecord(
	item: IInstalledDiscoveryItem,
	installations: ICustomizationMarketplaceInstallationSnapshot,
): IRecordedCustomizationMarketplaceResource | undefined {
	switch (item.type) {
		case 'skill':
			return item.uri ? installations.findByTarget({ kind: item.type, uri: item.uri }) : undefined;
		case 'plugin':
			return item.uri ? installations.findByTarget({ kind: 'plugin', uri: item.uri }) : undefined;
		case 'mcp':
			return item.mcpServerId ? installations.findByTarget({ kind: 'mcp', id: item.mcpServerId }) : undefined;
		default:
			return undefined;
	}
}

function getMarketplaceInstallationIdentity(record: IRecordedCustomizationMarketplaceResource, installations: ICustomizationMarketplaceInstallationSnapshot): string | IRecordedCustomizationMarketplaceResource {
	const canonical = record.installationId ? record : installations.findByTarget(record.state.target) ?? record;
	return canonical.installationId ?? canonical;
}

function isCopilotConnectorResource(resource: ICustomizationMarketplaceResource | undefined): boolean {
	return resource?.installation?.kind === 'copilotConnector';
}

function isVerifiedCopilotConnector(resource: ICustomizationMarketplaceResource | undefined): boolean {
	return resource?.sourceId === CustomizationMarketplaceSources.CopilotConnectors.id;
}

function renderVerifiedCopilotConnector(
	container: HTMLElement,
	resource: ICustomizationMarketplaceResource | undefined,
	hoverService: IHoverService,
	disposables: DisposableStore,
): void {
	const verified = isVerifiedCopilotConnector(resource);
	container.style.display = verified ? '' : 'none';
	if (!verified) {
		container.setAttribute('aria-hidden', 'true');
		container.removeAttribute('aria-label');
		return;
	}
	container.removeAttribute('aria-hidden');
	const label = localize('customizationDiscovery.verifiedByGitHub', "Verified by GitHub");
	container.setAttribute('aria-label', label);
	disposables.add(hoverService.setupDelayedHover(container, { content: label }));
}

function getAlternativeDisclosureLabel(): string {
	return localize('customizationDiscovery.alternative', "1 alternative customization");
}

function prioritizeLinkedCopilotConnectors(resources: readonly ICustomizationMarketplaceResource[]): readonly IPrioritizedMarketplaceResource[] {
	const connectorsById = new Map<string, ICustomizationMarketplaceResource>();
	const ambiguousConnectorIds = new Set<string>();
	for (const resource of resources) {
		if (resource.installation?.kind !== 'copilotConnector') {
			continue;
		}
		for (const connectorId of new Set([resource.installation.name, ...(resource.connectorIds ?? [])])) {
			const id = normalizedName(connectorId);
			const existing = connectorsById.get(id);
			if (existing && existing !== resource) {
				connectorsById.delete(id);
				ambiguousConnectorIds.add(id);
			} else if (!ambiguousConnectorIds.has(id)) {
				connectorsById.set(id, resource);
			}
		}
	}
	if (!connectorsById.size) {
		return resources
			.map((resource, originalIndex) => ({ resource, originalIndex }))
			.sort((left, right) => getMarketplaceResourcePriority(right.resource) - getMarketplaceResourcePriority(left.resource) || left.originalIndex - right.originalIndex)
			.map(({ resource }) => ({ resource }));
	}
	const alternativeByConnectorKey = new Map<string, ICustomizationMarketplaceResource>();
	const connectorKeyByAlternativeKey = new Map<string, string>();
	for (const resource of resources) {
		if (isCopilotConnectorResource(resource) || !resource.connectorIds?.length) {
			continue;
		}
		const linkedConnectors = (resource.connectorIds ?? [])
			.map(connectorId => connectorsById.get(normalizedName(connectorId)))
			.filter((connector): connector is ICustomizationMarketplaceResource => connector !== undefined)
			.filter((connector, index, connectors) => connectors.indexOf(connector) === index);
		if (linkedConnectors.length !== 1) {
			continue;
		}
		const connectorKey = getCustomizationMarketplaceResourceKey(linkedConnectors[0]);
		if (alternativeByConnectorKey.has(connectorKey)) {
			continue;
		}
		alternativeByConnectorKey.set(connectorKey, resource);
		connectorKeyByAlternativeKey.set(getCustomizationMarketplaceResourceKey(resource), connectorKey);
	}

	const groups: { readonly priority: number; readonly originalIndex: number; readonly resources: PrioritizedMarketplaceResourceGroup }[] = [];
	for (let originalIndex = 0; originalIndex < resources.length; originalIndex++) {
		const resource = resources[originalIndex];
		const key = getCustomizationMarketplaceResourceKey(resource);
		if (connectorKeyByAlternativeKey.has(key)) {
			continue;
		}
		const alternative = isCopilotConnectorResource(resource) ? alternativeByConnectorKey.get(key) : undefined;
		groups.push({
			priority: getMarketplaceResourcePriority(resource),
			originalIndex,
			resources: alternative
				? [
					{ resource, linkedConnectionRole: 'connector' },
					{ resource: alternative, linkedConnectionRole: 'alternative' },
				]
				: [{ resource }],
		});
	}
	return groups
		.sort((left, right) => right.priority - left.priority || left.originalIndex - right.originalIndex)
		.flatMap(group => group.resources);
}

function groupPrioritizedMarketplaceResources(resources: readonly IPrioritizedMarketplaceResource[]): readonly PrioritizedMarketplaceResourceGroup[] {
	const groups: IPrioritizedMarketplaceResource[][] = [];
	for (let index = 0; index < resources.length; index++) {
		const resource = resources[index];
		if (resource.linkedConnectionRole === 'connector' && resources[index + 1]?.linkedConnectionRole === 'alternative') {
			groups.push([resource, resources[++index]]);
		} else {
			groups.push([resource]);
		}
	}
	return groups;
}

function getMarketplaceResourcePriority(resource: ICustomizationMarketplaceResource): number {
	if (isCopilotConnectorResource(resource)) {
		return 3;
	}
	if (resource.sourceId === CustomizationMarketplaceSources.AgentFinderPublicFeed.id) {
		return getCatalogType(resource) === 'skill' ? 1 : 2;
	}
	return 0;
}

function getInstallationStateLabel(state: CustomizationMarketplaceInstallState, connector: boolean): string {
	if (connector) {
		switch (state.kind) {
			case 'missing': return localize('customizationDiscovery.connectorDisconnected', "Disconnected");
			case 'checking': return localize('customizationDiscovery.connectorChecking', "Checking connection");
			case 'repairing': return localize('customizationDiscovery.connectorReconnecting', "Reconnecting");
			case 'uninstalling': return localize('customizationDiscovery.connectorDisconnecting', "Disconnecting");
			case 'error': return localize('customizationDiscovery.connectorVerificationFailed', "Could not verify connection");
			default: return localize('customizationDiscovery.connectorConnected', "Connected");
		}
	}
	switch (state.kind) {
		case 'missing': return localize('customizationDiscovery.missingFiles', "Missing files");
		case 'checking': return localize('customizationDiscovery.checking', "Checking installation");
		case 'repairing': return localize('customizationDiscovery.repairing', "Repairing");
		case 'uninstalling': return localize('customizationDiscovery.uninstallingState', "Uninstalling");
		case 'error': return localize('customizationDiscovery.verificationFailed', "Could not verify installation");
		case 'installed': return state.uninstallUnavailableMessage ?? localize('customizationDiscovery.installed', "Installed");
		default: return localize('customizationDiscovery.installed', "Installed");
	}
}

function getInstallActionLabel(state: CustomizationMarketplaceInstallState, hasSetupUrl: boolean, operationError: string | undefined, connector: boolean): string {
	if (connector) {
		switch (state.kind) {
			case 'installed': return localize('customizationDiscovery.connectorConnected', "Connected");
			case 'missing': return operationError ? localize('customizationDiscovery.connectorRetry', "Retry") : localize('customizationDiscovery.connectorReconnect', "Reconnect");
			case 'repairing':
			case 'installing': return localize('customizationDiscovery.connectorCancel', "Cancel");
			case 'checking': return localize('customizationDiscovery.connectorCheckingProgress', "Checking...");
			case 'uninstalling': return localize('customizationDiscovery.connectorDisconnectingProgress', "Disconnecting...");
			case 'error': return localize('customizationDiscovery.unavailable', "Unavailable");
			default: return localize('customizationDiscovery.connectorConnect', "Connect");
		}
	}
	switch (state.kind) {
		case 'installed': return localize('customizationDiscovery.installed', "Installed");
		case 'missing': return operationError ? localize('customizationDiscovery.retryRepair', "Retry Repair") : localize('customizationDiscovery.repair', "Repair");
		case 'repairing': return localize('customizationDiscovery.repairingProgress', "Repairing...");
		case 'checking': return localize('customizationDiscovery.checkingProgress', "Checking...");
		case 'uninstalling': return localize('customizationDiscovery.uninstalling', "Uninstalling...");
		case 'installing': return localize('customizationDiscovery.installing', "Installing...");
		case 'error': return localize('customizationDiscovery.unavailable', "Unavailable");
		default: return hasSetupUrl
			? localize('customizationDiscovery.viewSetup', "View Setup")
			: operationError
				? localize('customizationDiscovery.retryInstall', "Retry Install")
				: localize('customizationDiscovery.install', "Install");
	}
}

function isCancellableConnectorOperation(resource: ICustomizationMarketplaceResource | undefined, state: CustomizationMarketplaceInstallState): boolean {
	return isCopilotConnectorResource(resource) && (state.kind === 'installing' || state.kind === 'repairing');
}

function isInstallActionEnabled(resource: ICustomizationMarketplaceResource, state: CustomizationMarketplaceInstallState, hasSetupUrl: boolean): boolean {
	return isCancellableConnectorOperation(resource, state) || state.kind === 'available' || state.kind === 'missing' && !state.repairUnavailableMessage || hasSetupUrl;
}

function isInstallActionBusy(state: CustomizationMarketplaceInstallState): boolean {
	return state.kind === 'installing' || state.kind === 'checking' || state.kind === 'repairing';
}

function getInstallActionError(state: CustomizationMarketplaceInstallState, operationError: string | undefined): string | undefined {
	return state.kind === 'unavailable' || state.kind === 'error' ? state.message : state.kind === 'missing' ? state.repairUnavailableMessage : operationError;
}

function renderRecordedCustomizationActions(
	container: HTMLElement,
	resource: ICustomizationMarketplaceResource,
	name: string,
	state: RecordedCustomizationMarketplaceInstallState,
	operationError: string | undefined,
	uninstallBlockedMessage: string | undefined,
	disposables: DisposableStore,
	hoverService: IHoverService,
	onRepair: () => void,
	onCancel: () => void,
	onUninstall: () => void,
): void {
	const connector = isCopilotConnectorResource(resource);
	if (state.kind === 'missing') {
		const repair = disposables.add(new Button(container, { ...defaultButtonStyles, small: true }));
		repair.label = getInstallActionLabel(state, false, operationError, connector);
		repair.enabled = !state.repairUnavailableMessage;
		repair.setAriaLabel(state.repairUnavailableMessage
			? localize('customizationDiscovery.repairActionUnavailableLabel', "{0} {1}. {2}", repair.label, name, state.repairUnavailableMessage)
			: localize('customizationDiscovery.repairLabel', "{0} {1}", repair.label, name));
		disposables.add(DOM.addDisposableListener(repair.element, DOM.EventType.CLICK, event => event.stopPropagation()));
		disposables.add(repair.onDidClick(onRepair));
		const repairError = state.repairUnavailableMessage ?? operationError;
		if (repairError) {
			disposables.add(hoverService.setupDelayedHover(repair.element, { content: repairError }));
		}
	}

	const cancellable = isCancellableConnectorOperation(resource, state);
	const uninstallUnavailableMessage = cancellable
		? undefined
		: uninstallBlockedMessage && (state.kind === 'installed' || state.kind === 'missing' || state.kind === 'error')
			? uninstallBlockedMessage
			: state.kind === 'installed' ? state.uninstallUnavailableMessage : undefined;
	const button = disposables.add(new Button(container, { ...defaultButtonStyles, secondary: true, small: true }));
	button.label = cancellable
		? localize('customizationDiscovery.connectorCancel', "Cancel")
		: uninstallUnavailableMessage
			? localize('customizationDiscovery.uninstall', "Uninstall")
			: state.kind === 'repairing'
				? localize('customizationDiscovery.repairingProgress', "Repairing...")
				: state.kind === 'checking'
					? localize('customizationDiscovery.checkingProgress', "Checking...")
					: state.kind === 'uninstalling'
						? localize('customizationDiscovery.uninstalling', "Uninstalling...")
						: operationError && state.kind === 'installed'
							? localize('customizationDiscovery.retryUninstall', "Retry Uninstall")
							: connector
								? localize('customizationDiscovery.connectorDisconnect', "Disconnect")
								: localize('customizationDiscovery.uninstall', "Uninstall");
	button.enabled = !uninstallUnavailableMessage && (cancellable || state.kind === 'installed' || state.kind === 'missing' || state.kind === 'error');
	button.setAriaLabel(uninstallUnavailableMessage
		? localize('customizationDiscovery.uninstallUnavailableLabel', "Uninstall {0}. {1}", name, uninstallUnavailableMessage)
		: cancellable
			? localize('customizationDiscovery.cancelConnectorRepairLabel', "Cancel reconnecting {0}", name)
			: connector
				? localize('customizationDiscovery.disconnectConnectorLabel', "Disconnect {0}", name)
				: localize('customizationDiscovery.uninstallLabel', "{0} {1}", button.label, name));
	button.element.setAttribute('aria-busy', String(!cancellable && (state.kind === 'uninstalling' || state.kind === 'repairing' || state.kind === 'checking')));
	disposables.add(DOM.addDisposableListener(button.element, DOM.EventType.CLICK, event => event.stopPropagation()));
	disposables.add(button.onDidClick(cancellable ? onCancel : onUninstall));
	if (uninstallUnavailableMessage) {
		disposables.add(hoverService.setupDelayedHover(button.element, { content: uninstallUnavailableMessage }, { setupKeyboardEvents: true }));
		return;
	}
	const uninstallError = state.kind === 'error' ? state.message : state.kind === 'installed' ? operationError : undefined;
	if (uninstallError) {
		disposables.add(hoverService.setupDelayedHover(button.element, { content: uninstallError }));
	}
}

/** Multi-type filters consume one ranked feed and filter only its presentation. */
function getCatalogMediaType(types: ReadonlySet<CustomizationDiscoveryType>): CustomizationMarketplaceMediaType | undefined {
	if (types.size !== 1) {
		return undefined;
	}
	if (types.has('skill')) {
		return CustomizationMarketplaceMediaType.Skill;
	}
	if (types.has('mcp')) {
		return CustomizationMarketplaceMediaType.McpServer;
	}
	if (types.has('canvas')) {
		return CustomizationMarketplaceMediaType.CopilotPlugin;
	}
	return undefined;
}

class DiscoveryListDelegate implements IListVirtualDelegate<DiscoveryListEntry> {
	getHeight(element: DiscoveryListEntry): number {
		return element.kind !== 'loading' && element.linkedConnectionRole === 'alternative'
			? element.alternativeExpanded ? linkedAlternativeRowHeight : collapsedLinkedAlternativeRowHeight
			: resultRowHeight;
	}

	getTemplateId(_element: DiscoveryListEntry): string {
		return 'discoveryResult';
	}
}

class DiscoveryResultRenderer implements IListRenderer<DiscoveryListEntry, IDiscoveryRowTemplate> {
	readonly templateId = 'discoveryResult';

	constructor(
		private readonly hoverService: IHoverService,
		private readonly getInstallState: (resource: ICustomizationMarketplaceResource) => CustomizationMarketplaceInstallState,
		private readonly getInstallError: (resource: ICustomizationMarketplaceResource) => string | undefined,
		private readonly getSourceLabel: (resource: ICustomizationMarketplaceResource) => string,
		private readonly onInstall: (resource: ICustomizationMarketplaceResource) => void,
		private readonly onRepair: (resource: ICustomizationMarketplaceResource) => void,
		private readonly onCancel: (resource: ICustomizationMarketplaceResource) => void,
		private readonly onUninstall: (item: IInstalledDiscoveryItem) => void,
		private readonly onOpen: (resource: URI | string) => void,
		private readonly onOpenDetails: (resource: ICustomizationMarketplaceResource) => void,
		private readonly onOpenInstalled: (item: IInstalledDiscoveryItem) => void,
		private readonly isDirectUninstalling: (item: IInstalledDiscoveryItem) => boolean,
		private readonly getUninstallBlockedMessage: (item: IInstalledDiscoveryItem) => string | undefined,
		private readonly onToggleAlternative: (item: IInstalledDiscoveryItem | ICatalogDiscoveryItem) => void,
		private readonly onRenderAlternative: (item: IInstalledDiscoveryItem | ICatalogDiscoveryItem, disclosure: HTMLButtonElement) => void,
		private readonly themeService: IThemeService,
	) { }

	renderTemplate(container: HTMLElement): IDiscoveryRowTemplate {
		container.classList.add('customization-discovery-result-row');
		const root = DOM.append(container, $('.customization-discovery-result-content'));
		const primaryAction = createCustomizationCardPrimaryAction(root, '', 'customization-discovery-result-primary');
		const linkedConnectionLabel = DOM.append(root, $<HTMLButtonElement>('button.customization-discovery-result-linked-label'));
		linkedConnectionLabel.type = 'button';
		const linkedConnectionText = DOM.append(linkedConnectionLabel, $('span.customization-discovery-result-linked-label-text'));
		const linkedConnectionIcon = DOM.append(linkedConnectionLabel, renderIcon(Codicon.chevronRightCompact));
		linkedConnectionIcon.setAttribute('aria-hidden', 'true');
		const templateDisposables = new DisposableStore();
		const loading = templateDisposables.add(createPixelSpinner(root, { variant: 'ring' })).element;
		loading.classList.add('customization-discovery-result-loading');
		const icon = DOM.append(root, $('.customization-discovery-result-icon'));
		const identity = DOM.append(root, $('.customization-discovery-result-identity'));
		const heading = DOM.append(identity, $('.customization-discovery-result-heading'));
		const name = DOM.append(heading, $('.customization-discovery-result-name'));
		const detail = DOM.append(heading, $('.customization-discovery-result-detail'));
		const verified = DOM.append(heading, $('.customization-discovery-verified'));
		verified.appendChild(renderIcon(verifiedPublisherIcon));
		const description = DOM.append(identity, $('.customization-discovery-result-description'));
		const aside = DOM.append(root, $('.customization-discovery-result-aside'));
		const stats = DOM.append(aside, $('.customization-discovery-result-stats'));
		const actions = DOM.append(aside, $('.customization-discovery-result-actions'));
		return {
			root,
			linkedConnectionLabel,
			linkedConnectionText,
			linkedConnectionIcon,
			primaryAction,
			icon,
			identity,
			name,
			verified,
			detail,
			description,
			stats,
			actions,
			elementDisposables: new DisposableStore(),
			templateDisposables,
		};
	}

	renderElement(element: DiscoveryListEntry, _index: number, templateData: IDiscoveryRowTemplate): void {
		templateData.elementDisposables.clear();
		DOM.clearNode(templateData.icon);
		DOM.clearNode(templateData.stats);
		DOM.clearNode(templateData.actions);
		templateData.root.classList.toggle('loading', element.kind === 'loading');
		templateData.root.classList.toggle('linked-connector', element.kind !== 'loading' && element.linkedConnectionRole === 'connector');
		templateData.root.classList.toggle('linked-alternative', element.kind !== 'loading' && element.linkedConnectionRole === 'alternative');
		const collapsedAlternative = element.kind !== 'loading' && element.linkedConnectionRole === 'alternative' && !element.alternativeExpanded;
		templateData.root.classList.toggle('collapsed-alternative', collapsedAlternative);
		templateData.root.inert = element.kind === 'loading';
		templateData.primaryAction.disabled = element.kind === 'loading' || collapsedAlternative;
		templateData.primaryAction.hidden = collapsedAlternative;
		templateData.icon.hidden = collapsedAlternative;
		templateData.identity.hidden = collapsedAlternative;
		templateData.stats.hidden = collapsedAlternative;
		templateData.actions.hidden = collapsedAlternative;
		if (element.kind === 'loading') {
			templateData.linkedConnectionText.textContent = '';
			templateData.linkedConnectionLabel.hidden = true;
			templateData.name.textContent = '';
			templateData.verified.style.display = 'none';
			templateData.verified.setAttribute('aria-hidden', 'true');
			templateData.verified.removeAttribute('aria-label');
			templateData.detail.textContent = '';
			templateData.description.textContent = '';
			templateData.primaryAction.removeAttribute('aria-label');
			return;
		}
		const installed = element.kind === 'installed';
		const name = installed ? element.name : element.resource.displayName;
		const description = installed ? element.description : element.resource.description;
		const type = installed ? element.type : getCatalogType(element.resource);
		const resource = installed ? element.catalogResource : element.resource;
		const marketplaceState = installed && element.catalogResource ? this.getInstallState(element.catalogResource) : undefined;
		const opensInstalled = installed && (!marketplaceState || marketplaceState.kind === 'installed');
		const installationDetail = marketplaceState?.kind === 'installed'
			? marketplaceState.uninstallUnavailableMessage
			: marketplaceState ? getInstallationStateLabel(marketplaceState, isCopilotConnectorResource(resource)) : undefined;
		const detail = [
			type ? getTypeLabel(type) : !installed ? element.resource.mediaType : undefined,
			installed ? element.sourceLabel : this.getSourceLabel(element.resource),
			installationDetail,
			installed && element.disabled ? localize('customizationDiscovery.disabled', "Disabled") : undefined,
		].filter(Boolean).join(' · ');

		renderCustomizationMarketplaceIcon(
			templateData.icon,
			type === 'mcp' ? Codicon.server : type === 'plugin' ? Codicon.extensions : type === 'skill' ? Codicon.lightbulb : Codicon.file,
			resource?.icon,
			this.themeService.getColorTheme().type,
			templateData.elementDisposables,
		);

		templateData.name.textContent = name;
		renderVerifiedCopilotConnector(templateData.verified, resource, this.hoverService, templateData.elementDisposables);
		const alternative = element.linkedConnectionRole === 'alternative';
		templateData.linkedConnectionLabel.hidden = !alternative;
		if (alternative) {
			this.onRenderAlternative(element, templateData.linkedConnectionLabel);
			const expanded = !!element.alternativeExpanded;
			templateData.linkedConnectionText.textContent = getAlternativeDisclosureLabel();
			templateData.linkedConnectionIcon.classList.toggle('codicon-chevron-down-compact', expanded);
			templateData.linkedConnectionIcon.classList.toggle('codicon-chevron-right-compact', !expanded);
			templateData.linkedConnectionLabel.setAttribute('aria-expanded', String(expanded));
			templateData.linkedConnectionLabel.setAttribute('aria-label', expanded
				? localize('customizationDiscovery.hideAlternativeAriaLabel', "Hide 1 alternative customization")
				: localize('customizationDiscovery.showAlternativeAriaLabel', "Show 1 alternative customization"));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.linkedConnectionLabel, DOM.EventType.CLICK, event => {
				event.stopPropagation();
				this.onToggleAlternative(element);
			}));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.linkedConnectionLabel, DOM.EventType.KEY_DOWN, event => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					event.stopPropagation();
					this.onToggleAlternative(element);
				}
			}));
		} else {
			templateData.linkedConnectionText.textContent = '';
			templateData.linkedConnectionLabel.removeAttribute('aria-expanded');
			templateData.linkedConnectionLabel.removeAttribute('aria-label');
		}
		templateData.name.removeAttribute('href');
		templateData.name.removeAttribute('rel');
		templateData.detail.textContent = detail;
		templateData.description.textContent = description;
		templateData.primaryAction.setAttribute('aria-label', opensInstalled
			? localize('customizationDiscovery.openInstalled', "Open installed customization {0}", name)
			: element.linkedConnectionRole === 'alternative'
				? localize('customizationDiscovery.openAlternativeDetails', "View details for {0}, another way to connect", name)
				: localize('customizationDiscovery.openDetails', "View details for {0}", name));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.name, { content: name }));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.description, { content: description }));
		const registerOpenListeners = (open: () => void) => {
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.primaryAction, DOM.EventType.CLICK, event => {
				event.stopPropagation();
				open();
			}));
		};
		if (element.kind === 'installed' && opensInstalled) {
			registerOpenListeners(() => this.onOpenInstalled(element));
		} else {
			registerOpenListeners(() => this.onOpenDetails(element.kind === 'installed' ? element.catalogResource! : element.resource));
		}

		if (!installed) {
			if (element.resource.stars !== undefined) {
				const starsLabel = localize('customizationDiscovery.stars', "{0} stars", element.resource.stars.toLocaleString());
				templateData.stats.setAttribute('aria-label', starsLabel);
				const star = DOM.append(templateData.stats, $('.codicon'));
				star.classList.add(...ThemeIcon.asClassNameArray(Codicon.starFull));
				star.setAttribute('aria-hidden', 'true');
				DOM.append(templateData.stats, $('span')).textContent = formatCompactCount(element.resource.stars);
			} else {
				templateData.stats.removeAttribute('aria-label');
			}
			const state = this.getInstallState(element.resource);
			const setupUrl = state.kind === 'unavailable' ? state.setupUrl : undefined;
			const installError = this.getInstallError(element.resource);
			const cancellable = isCancellableConnectorOperation(element.resource, state);
			const button = templateData.elementDisposables.add(new Button(templateData.actions, { ...defaultButtonStyles, secondary: true, small: true }));
			button.label = getInstallActionLabel(state, !!setupUrl, installError, isCopilotConnectorResource(element.resource));
			button.enabled = isInstallActionEnabled(element.resource, state, !!setupUrl);
			button.setAriaLabel(cancellable
				? localize('customizationDiscovery.cancelConnectorOperationLabel', "Cancel connecting {0}", element.resource.displayName)
				: setupUrl
					? localize('customizationDiscovery.viewSetupLabel', "View setup instructions for {0}", element.resource.displayName)
					: state.kind === 'missing'
						? state.repairUnavailableMessage
							? localize('customizationDiscovery.repairActionUnavailableLabel', "{0} {1}. {2}", button.label, element.resource.displayName, state.repairUnavailableMessage)
							: localize('customizationDiscovery.repairLabel', "{0} {1}", button.label, element.resource.displayName)
						: state.kind === 'error'
							? localize('customizationDiscovery.installVerificationError', "{0}. {1}", element.resource.displayName, state.message)
							: state.kind === 'unavailable'
								? localize('customizationDiscovery.installUnavailable', "Install {0}. {1}", element.resource.displayName, state.message)
								: localize('customizationDiscovery.installLabel', "{0} {1}", button.label, element.resource.displayName));
			button.element.setAttribute('aria-busy', String(isInstallActionBusy(state) && !cancellable));
			templateData.elementDisposables.add(DOM.addDisposableListener(button.element, DOM.EventType.CLICK, event => event.stopPropagation()));
			templateData.elementDisposables.add(button.onDidClick(() => cancellable
				? this.onCancel(element.resource)
				: setupUrl
					? this.onOpen(setupUrl)
					: state.kind === 'missing'
						? this.onRepair(element.resource)
						: this.onInstall(element.resource)));
			const actionError = getInstallActionError(state, installError);
			if (actionError) {
				templateData.elementDisposables.add(this.hoverService.setupDelayedHover(button.element, { content: actionError }));
			}
		} else if (element.catalogResource && marketplaceState && hasInstallationTarget(marketplaceState)) {
			const state = marketplaceState!;
			const error = this.getInstallError(element.catalogResource);
			renderRecordedCustomizationActions(
				templateData.actions,
				element.catalogResource,
				element.name,
				state,
				error,
				this.getUninstallBlockedMessage(element),
				templateData.elementDisposables,
				this.hoverService,
				() => this.onRepair(element.catalogResource!),
				() => this.onCancel(element.catalogResource!),
				() => this.onUninstall(element),
			);
		} else if (element.removable) {
			const uninstallBlockedMessage = this.getUninstallBlockedMessage(element);
			const uninstalling = !uninstallBlockedMessage && this.isDirectUninstalling(element);
			const button = templateData.elementDisposables.add(new Button(templateData.actions, { ...defaultButtonStyles, secondary: true, small: true }));
			button.label = uninstalling
				? localize('customizationDiscovery.uninstalling', "Uninstalling...")
				: localize('customizationDiscovery.uninstall', "Uninstall");
			button.enabled = !uninstalling && !uninstallBlockedMessage;
			button.setAriaLabel(uninstallBlockedMessage
				? localize('customizationDiscovery.uninstallUnavailableLabel', "Uninstall {0}. {1}", element.name, uninstallBlockedMessage)
				: localize('customizationDiscovery.uninstallLabel', "{0} {1}", button.label, element.name));
			button.element.setAttribute('aria-busy', String(uninstalling));
			templateData.elementDisposables.add(DOM.addDisposableListener(button.element, DOM.EventType.CLICK, event => event.stopPropagation()));
			templateData.elementDisposables.add(button.onDidClick(() => this.onUninstall(element)));
			if (uninstallBlockedMessage) {
				templateData.elementDisposables.add(this.hoverService.setupDelayedHover(button.element, { content: uninstallBlockedMessage }, { setupKeyboardEvents: true }));
			}
		}
	}

	disposeTemplate(templateData: IDiscoveryRowTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

export class AICustomizationDiscoveryPage extends Disposable implements IAICustomizationWelcomePageImplementation {
	readonly container: HTMLElement;
	private readonly header: HTMLElement;
	private readonly progressBar: ProgressBar;
	private progressBarActive = false;
	private readonly titleDescription: HTMLElement;
	private readonly searchWidget: SuggestEnabledInput;
	private readonly searchActionsContainer: HTMLElement;
	private readonly searchToolbar: WorkbenchToolBar;
	private readonly sourceWarnings: CustomizationMarketplaceSourceWarnings;
	private readonly sourceButton: Button;
	private readonly browseScrollable: DomScrollableElement;
	private readonly browseContent: HTMLElement;
	private readonly browseSections: HTMLElement;
	private readonly browseStatus: HTMLElement;
	private readonly resultListContainer: HTMLElement;
	private readonly resultList: WorkbenchList<DiscoveryListEntry>;
	private readonly resultStatus: HTMLElement;
	private readonly browseDisposables = this._register(new DisposableStore());
	private readonly browsePrimaryActions = new Map<string, HTMLButtonElement>();
	private readonly browseAlternativeActions = new Map<string, HTMLButtonElement>();
	private readonly browseInstallStates = new Map<ICustomizationMarketplaceResource, CustomizationMarketplaceInstallState>();
	private readonly resultAlternativeActions = new Map<string, HTMLButtonElement>();
	private readonly resultStatusDisposables = this._register(new DisposableStore());
	private readonly descriptionDisposables = this._register(new DisposableStore());
	private readonly searchActionDisposables = this._register(new DisposableStore());
	private readonly sourceHover = this._register(new MutableDisposable());
	private readonly request = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly searchScheduler = this._register(new RunOnceScheduler(() => void this.loadCatalog(false), searchDelay));
	private readonly continuationScheduler = this._register(new RunOnceScheduler(() => void this.loadCatalog(true), 0));
	private catalogPage: ICatalogPageState | undefined;
	private enabledSourceIds: readonly string[];
	private readonly browseCatalogCache = new Map<string, IBrowseCatalogCache>();
	private readonly installErrors = new Map<string, string>();
	private readonly pendingInstalls = new Set<string>();
	private readonly pendingUninstalls = new Set<string>();
	private readonly pendingDirectUninstalls = new Set<string>();
	private readonly requiredPluginUris = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: setsEqual }, reader => {
		const uris = new Set<string>();
		for (const plugin of this.pluginService.plugins.read(reader)) {
			if (isPluginRequiredByPolicy(plugin, reader)) {
				uris.add(plugin.uri.toString());
			}
		}
		return uris;
	});
	private readonly expandedAlternatives = new Set<string>();
	private forceMarketplaceRefresh = false;
	private clearMarketplaceResults = false;
	/** Sources named by pending forced refreshes; `undefined` when any source may have changed. */
	private changedMarketplaceSourceIds: Set<string> | undefined = new Set();
	/** Number of catalog results to restore when an in-place background refresh reloads the current query. */
	private refreshDepth: number | undefined;
	private readonly marketplaceRefreshScheduler = this._register(new RunOnceScheduler(() => {
		const force = this.forceMarketplaceRefresh;
		const clearResults = this.clearMarketplaceResults;
		const changedSourceIds = this.changedMarketplaceSourceIds;
		this.forceMarketplaceRefresh = false;
		this.clearMarketplaceResults = false;
		this.changedMarketplaceSourceIds = new Set();
		const selectedSourceId = this.selectedSourceId;
		this.updateSources();
		const affectsCurrentView = force && (selectedSourceId !== this.selectedSourceId || this.isCurrentViewAffectedBySources(changedSourceIds));
		if (force && !affectsCurrentView && changedSourceIds) {
			this.invalidateBrowseCatalogCache(changedSourceIds);
		}
		this.handleAvailabilityChanged(affectsCurrentView, !clearResults);
	}, 0));
	private query = CustomizationDiscoveryQuery.parse('');
	private installedItems: readonly IInstalledDiscoveryItem[] = [];
	private providerPlugins: readonly IInstalledDiscoveryItem[] = [];
	private catalogItems: readonly ICustomizationMarketplaceResource[] = [];
	private curatedSections: readonly ICustomizationMarketplaceBrowseSection[] | undefined;
	private curatedSourceId: string | undefined;
	private sourceSections: readonly ISourceBrowseSection[] = [];
	private curatedSourceError: ICustomizationMarketplaceSourceError | undefined;
	private marketplaceSources: readonly ICustomizationMarketplaceSourceInfo[] = [];
	private selectedSourceId: string | undefined;
	private visibleSectionIds = new Set<AICustomizationManagementSection>();
	private visible = false;
	private pendingRecoveryReload = false;
	private filteredBackfillLimitReached = false;
	private loaded = false;
	private loading = false;
	private loadingMore = false;
	private errorMessage: string | undefined;
	private requestSequence = 0;
	private providerPluginSequence = 0;
	private lastDimension: DOM.Dimension | undefined;
	private lastAnnouncement: string | undefined;
	private lastLoadingAnnouncement: string | undefined;
	private pendingLoadingAnnouncement: string | undefined;
	private readonly loadingAnnouncementScheduler = this._register(new RunOnceScheduler(() => {
		const message = this.pendingLoadingAnnouncement;
		this.pendingLoadingAnnouncement = undefined;
		if (message && this.loading) {
			this.lastLoadingAnnouncement = message;
			this.announce(message);
		}
	}, loadingAnnouncementDelay));
	private lastBrowseTelemetryView: 'curated' | 'fallback' | undefined;
	private catalogLoadProgress: IMarketplaceLoadProgress | undefined;
	private curatedLoadProgress: IMarketplaceLoadProgress | undefined;
	private browseLoadStartedAt: number | undefined;
	private browseFirstContentAt: number | undefined;

	constructor(
		parent: HTMLElement,
		_welcomePageFeatures: IWelcomePageFeatures | undefined,
		private readonly callbacks: IWelcomePageCallbacks,
		_harnessLabel: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@ICustomizationMarketplaceService private readonly marketplaceService: ICustomizationMarketplaceService,
		@ICustomizationMarketplaceInstallService private readonly installService: ICustomizationMarketplaceInstallService,
		@IAICustomizationItemsModel private readonly itemsModel: IAICustomizationItemsModel,
		@IAgentPluginService private readonly pluginService: IAgentPluginService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
		@IThemeService private readonly themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.enabledSourceIds = this.getEnabledCatalogSourceIds();

		this.container = DOM.append(parent, $('.customization-discovery'));
		const content = DOM.append(this.container, $('.customization-discovery-content'));
		const header = this.header = DOM.append(content, $('.customization-discovery-header'));
		const titleRow = DOM.append(header, $('.customization-discovery-title-row'));
		const title = DOM.append(titleRow, $('h2.customization-discovery-title'));
		title.textContent = localize('customizationDiscovery.title', "Browse customizations");
		this.createAddButton(titleRow);
		this.titleDescription = DOM.append(header, $('p.customization-discovery-description'));
		this.updateDescription();

		const progressContainer = DOM.append(header, $('.customization-discovery-progress'));
		this.progressBar = this._register(new ProgressBar(progressContainer, {
			...defaultProgressBarStyles,
			ariaLabel: localize('customizationDiscovery.progress', "Loading customizations"),
		}));
		this.progressBar.hide();

		const searchRow = DOM.append(header, $('.customization-discovery-search-row'));
		const searchContainer = DOM.append(searchRow, $('.customization-discovery-search'));
		const placeholder = localize('customizationDiscovery.searchPlaceholder', "Search MCP servers, plugins, skills and more...");
		this.searchWidget = this._register(this.instantiationService.createInstance(
			SuggestEnabledInput,
			'aiCustomizationDiscovery.search',
			searchContainer,
			{
				triggerCharacters: ['@', ':'],
				sortKey: item => item.startsWith('@installed') ? 'a' : 'b',
				provideResults: value => [...getCustomizationDiscoveryQuerySuggestions(value)],
			},
			localize('customizationDiscovery.searchLabel', "Search customizations"),
			'aiCustomizationDiscovery:search',
			{ placeholderText: placeholder },
		));
		this.searchActionsContainer = DOM.append(searchContainer, $('.customization-discovery-search-actions'));
		this.searchToolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, this.searchActionsContainer, {
			ariaLabel: localize('customizationDiscovery.searchActions', "Customization Search Actions"),
			highlightToggledItems: true,
			telemetrySource: 'customizationDiscoverySearch',
		}));
		this._register(this.searchWidget.onInputDidChange(() => this.onQueryChanged()));
		this.updateSearchAriaLabel();
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateSearchAriaLabel()));
		const sourceContainer = DOM.append(searchRow, $('.customization-discovery-source'));
		this.sourceButton = this._register(new Button(sourceContainer, { ...defaultButtonStyles, secondary: true, small: true, supportIcons: true }));
		this.sourceButton.element.setAttribute('aria-haspopup', 'menu');
		this.updateSourceButton();
		this._register(this.sourceButton.onDidClick(() => this.showSourceMenu()));
		this.sourceWarnings = this._register(new CustomizationMarketplaceSourceWarnings(header, () => this.marketplaceService.allSources ?? this.marketplaceService.sources, () => {
			this.browseCatalogCache.clear();
			if (!this.visible) {
				this.pendingRecoveryReload = true;
				return;
			}
			this.focus();
			void this.loadCatalog(false);
		}, sourceId => this.marketplaceService.getSourceRecoveryAction?.(sourceId), this.notificationService));

		this.browseContent = DOM.append(content, $('.customization-discovery-browse'));
		this.browseStatus = DOM.append(this.browseContent, $('.customization-discovery-state'));
		this.browseSections = DOM.append(this.browseContent, $('.customization-discovery-sections'));
		this.browseScrollable = this._register(new DomScrollableElement(this.browseContent, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: true,
		}));
		const browseScrollableNode = this.browseScrollable.getDomNode();
		browseScrollableNode.classList.add('customization-discovery-browse-scrollable');
		content.appendChild(browseScrollableNode);

		this.resultListContainer = DOM.append(content, $('.customization-discovery-results'));
		this.resultStatus = DOM.append(this.resultListContainer, $('.customization-discovery-state'));
		const listContainer = DOM.append(this.resultListContainer, $('.customization-discovery-list'));
		const renderer = new DiscoveryResultRenderer(
			this.hoverService,
			resource => this.getInstallState(resource),
			resource => this.installErrors.get(getCustomizationMarketplaceResourceKey(resource)),
			resource => this.getMarketplaceResourceLabel(resource),
			resource => void this.install(resource),
			resource => void this.repair(resource),
			resource => this.installService.cancelConnectorOperation(resource),
			item => void this.uninstall(item),
			resource => void this.openExternal(resource),
			resource => this.openMarketplaceItem(resource, 'search'),
			item => this.openInstalledItem(item),
			item => this.pendingDirectUninstalls.has(item.id),
			item => this.getUninstallBlockedMessage(item),
			item => this.toggleAlternative(item),
			(item, disclosure) => this.resultAlternativeActions.set(item.id, disclosure),
			this.themeService,
		);
		this.resultList = this._register(this.instantiationService.createInstance(
			WorkbenchList<DiscoveryListEntry>,
			'AICustomizationDiscoveryResults',
			listContainer,
			new DiscoveryListDelegate(),
			[renderer],
			{
				identityProvider: {
					getId: entry => entry.id,
				},
				accessibilityProvider: {
					getAriaLabel: entry => this.getEntryAriaLabel(entry),
					getWidgetAriaLabel: () => localize('customizationDiscovery.resultsLabel', "Customization search results"),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => entry.kind === 'loading' ? undefined : entry.kind === 'installed' ? entry.name : entry.resource.displayName,
				},
				multipleSelectionSupport: false,
				openOnSingleClick: true,
				horizontalScrolling: false,
			},
		));
		this._register(this.resultList.onDidOpen(event => {
			if (event.element && event.element.kind !== 'loading' && event.element.linkedConnectionRole === 'alternative' && !event.element.alternativeExpanded) {
				this.toggleAlternative(event.element);
			} else if (event.element?.kind === 'installed') {
				const resource = event.element.catalogResource;
				if (!resource || this.getInstallState(resource).kind === 'installed') {
					this.openInstalledItem(event.element);
				} else {
					this.openMarketplaceItem(resource, 'search');
				}
			} else if (event.element?.kind === 'available') {
				this.openMarketplaceItem(event.element.resource, 'search');
			}
		}));
		this._register(this.searchWidget.onShouldFocusResults(() => this.resultList.domFocus()));
		this._register(this.resultList.onDidScroll(event => {
			if ((!this.query.isEmpty() || this.selectedSourceId) && !this.errorMessage && event.scrollHeight > event.height && event.scrollTop + event.height >= event.scrollHeight - resultRowHeight * 3) {
				this.continuationScheduler.schedule();
			}
		}));

		this._register(autorun(reader => {
			for (const section of ITEMS_MODEL_SECTIONS) {
				this.itemsModel.getItems(section).read(reader);
			}
			this.pluginService.plugins.read(reader);
			this.refreshInstalledItems();
		}));
		// Only organizations that require plugins populate this set; it stays empty, and never re-renders, otherwise.
		let renderedRequiredPluginUris = this.requiredPluginUris.get();
		this._register(autorun(reader => {
			const uris = this.requiredPluginUris.read(reader);
			if (uris !== renderedRequiredPluginUris) {
				renderedRequiredPluginUris = uris;
				this.render(true);
			}
		}));
		this._register(this.mcpWorkbenchService.onChange(() => this.refreshInstalledItems()));
		this._register(this.mcpWorkbenchService.onReset(() => this.refreshInstalledItems()));
		void this.mcpWorkbenchService.whenInitialLocalMcpServersLoaded.then(() => {
			if (!this._store.isDisposed) {
				this.refreshInstalledItems();
			}
		});
		this._register(this.installService.onDidChange(() => {
			if (!this.resultListContainer.hidden || [...this.browseInstallStates].some(([resource, state]) => !installationStatesEqual(state, this.getInstallState(resource)))) {
				this.render();
			}
		}));
		this._register(this.themeService.onDidColorThemeChange(() => this.render(false)));
		if (this.marketplaceService.onDidChangeSources) {
			this._register(this.marketplaceService.onDidChangeSources(event => this.scheduleMarketplaceRefresh(true, false, event.sourceIds)));
		}
		this._register(this.entitlementService.onDidChangeSentiment(() => this.handleAvailabilityChanged()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AccessibilityVerbositySettingId.CustomizationDiscovery)) {
				this.updateSearchAriaLabel();
			}
		}));

		this.updateSearchActions();
		this.render();
		this.updateSources();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (affectsCustomizationMarketplaceSources(event, this.marketplaceService.allSources ?? this.marketplaceService.sources)) {
				this.scheduleMarketplaceRefresh(this.isCurrentQueryAffectedBySourceConfiguration(event));
			}
		}));
	}

	private scheduleMarketplaceRefresh(force: boolean, clearResults = true, sourceIds?: readonly string[]): void {
		this.forceMarketplaceRefresh ||= force;
		this.clearMarketplaceResults ||= clearResults;
		if (force) {
			if (sourceIds) {
				for (const sourceId of sourceIds) {
					this.changedMarketplaceSourceIds?.add(sourceId);
				}
			} else {
				this.changedMarketplaceSourceIds = undefined;
			}
		}
		this.marketplaceRefreshScheduler.schedule();
	}

	private isCurrentViewAffectedBySources(sourceIds: ReadonlySet<string> | undefined): boolean {
		return !sourceIds || this.getCurrentQuerySources().some(source => sourceIds.has(source.id));
	}

	/** Drops cached Browse results that include the changed sources so they reload when shown again. */
	private invalidateBrowseCatalogCache(sourceIds: ReadonlySet<string>): void {
		this.browseCatalogCache.delete('');
		for (const sourceId of sourceIds) {
			this.browseCatalogCache.delete(sourceId);
		}
	}

	private updateSources(): void {
		this.marketplaceSources = getVisibleCustomizationMarketplaceSources(this.configurationService, this.marketplaceService.sources);
		if (this.selectedSourceId && !this.marketplaceSources.some(source => source.id === this.selectedSourceId)) {
			this.selectedSourceId = undefined;
			this.callbacks.marketplaceNavigationChanged?.();
		}
		this.updateSourceButton();
	}

	private updateSourceButton(): void {
		const selectedSource = this.marketplaceSources.find(source => source.id === this.selectedSourceId);
		const label = selectedSource ? selectedSource.displayName ?? selectedSource.id : localize('customizationDiscovery.allSources', "All Sources");
		this.sourceButton.label = `${label} $(chevron-down)`;
		this.sourceButton.setAriaLabel(localize('customizationDiscovery.sourceButtonAriaLabel', "Customization source: {0}", label));
		this.sourceButton.element.removeAttribute('title');
		this.sourceHover.value = this.hoverService.setupDelayedHover(this.sourceButton.element, { content: label });
	}

	private showSourceMenu(): void {
		const disposables = new DisposableStore();
		const allSources = disposables.add(new Action(
			'customizationDiscovery.source.all',
			localize('customizationDiscovery.allSources', "All Sources"),
			undefined,
			true,
			() => this.selectSource(undefined),
		));
		allSources.checked = this.selectedSourceId === undefined;
		const sourceActions = this.marketplaceSources.map(source => {
			const action = disposables.add(new Action(
				`customizationDiscovery.source.${source.id}`,
				source.displayName ?? source.id,
				undefined,
				true,
				() => this.selectSource(source.id),
			));
			action.checked = source.id === this.selectedSourceId;
			return action;
		});
		const configure = disposables.add(new Action(
			'customizationDiscovery.source.configure',
			localize('customizationDiscovery.configureMarketplaces', "Configure Marketplaces"),
			ThemeIcon.asClassName(Codicon.settingsGear),
			true,
			() => this.commandService.executeCommand(MANAGE_PLUGIN_MARKETPLACES_COMMAND_ID),
		));
		this.contextMenuService.showContextMenu({
			getAnchor: () => this.sourceButton.element,
			getActions: () => [allSources, ...sourceActions, new Separator(), configure],
			onHide: () => disposables.dispose(),
		});
	}

	private selectSource(sourceId: string | undefined): void {
		if (this.selectedSourceId === sourceId) {
			return;
		}
		this.selectedSourceId = sourceId;
		this.callbacks.marketplaceNavigationChanged?.();
		this.updateSourceButton();
		this.cancelCatalogRequest();
		this.searchScheduler.cancel();
		this.resetCatalogState();
		this.errorMessage = undefined;
		this.resultList.scrollTop = 0;
		this.lastAnnouncement = undefined;
		this.render();
		if (this.shouldQueryCatalog() && (!this.loaded || sourceId !== undefined)) {
			void this.loadCatalog(false);
		}
	}

	private createAddButton(parent: HTMLElement): void {
		const addButton = this._register(new Button(parent, { ...defaultButtonStyles, secondary: true, small: true, supportIcons: true }));
		addButton.element.setAttribute('aria-haspopup', 'menu');
		addButton.label = localize('customizationDiscovery.addCustomization', "Add Customization {0}", `$(${Codicon.chevronDown.id})`);
		addButton.setAriaLabel(localize('customizationDiscovery.addCustomizationLabel', "Add a customization"));
		addButton.element.setAttribute('aria-expanded', 'false');
		this._register(addButton.onDidClick(() => {
			const disposables = new DisposableStore();
			const actions: IAction[] = [];
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Agents)) {
				actions.push(disposables.add(new Action('customizationDiscovery.newAgent', localize('customizationDiscovery.newAgent', "New Agent"), undefined, true, () => this.callbacks.createCustomization(AICustomizationManagementSection.Agents))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Skills)) {
				actions.push(disposables.add(new Action('customizationDiscovery.newSkill', localize('customizationDiscovery.newSkill', "New Skill"), undefined, true, () => this.callbacks.createCustomization(AICustomizationManagementSection.Skills))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Instructions)) {
				actions.push(disposables.add(new Action('customizationDiscovery.newInstructions', localize('customizationDiscovery.newInstructions', "New Instructions"), undefined, true, () => this.callbacks.createCustomization(AICustomizationManagementSection.Instructions))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Prompts)) {
				actions.push(disposables.add(new Action('customizationDiscovery.newPrompt', localize('customizationDiscovery.newPrompt', "New Prompt"), undefined, true, () => this.callbacks.createCustomization(AICustomizationManagementSection.Prompts))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.McpServers)) {
				actions.push(disposables.add(new Action('customizationDiscovery.addMcp', localize('customizationDiscovery.addMcp', "Add MCP Server"), undefined, true, () => this.callbacks.createCustomization(AICustomizationManagementSection.McpServers))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Plugins)) {
				actions.push(disposables.add(new Action('customizationDiscovery.addPlugin', localize('customizationDiscovery.addPlugin', "Add Plugin"), undefined, true, () => this.callbacks.createCustomization(AICustomizationManagementSection.Plugins))));
			}
			this.contextMenuService.showContextMenu({
				getAnchor: () => addButton.element,
				getActions: () => actions,
				onHide: () => {
					addButton.element.setAttribute('aria-expanded', 'false');
					disposables.dispose();
				},
			});
			addButton.element.setAttribute('aria-expanded', 'true');
		}));
	}

	private updateDescription(): void {
		this.descriptionDisposables.clear();
		const docsUrl = 'https://aka.ms/vscode-customizations';
		const description = localize({
			key: 'customizationDiscovery.description',
			comment: [
				'Preserve the double square brackets: they mark the Learn more link to the agent customization documentation.',
			],
		}, "Tailor your agent to your tools, your team, and your workflow. [[Learn more]]");
		renderFormattedText(description, {
			actionHandler: {
				callback: (_index, event) => {
					event.preventDefault();
					void this.openExternal(docsUrl);
				},
				disposables: this.descriptionDisposables,
			},
		}, this.titleDescription);
		for (const link of this.titleDescription.children) {
			link.setAttribute('href', docsUrl);
			link.setAttribute('aria-label', localize('customizationDiscovery.learnMore', "Learn more about agent customizations"));
		}
	}

	private onQueryChanged(): void {
		const next = CustomizationDiscoveryQuery.parse(this.searchWidget.getValue());
		if (this.query.equals(next)) {
			return;
		}
		this.query = next;
		this.callbacks.marketplaceNavigationChanged?.();
		this.resetCatalogState();
		this.errorMessage = undefined;
		this.cancelCatalogRequest();
		this.resultList.scrollTop = 0;
		this.lastAnnouncement = undefined;
		this.updateSearchActions();
		this.render();
		this.searchScheduler.cancel();
		if (this.shouldQueryCatalog() && !this.loaded) {
			this.searchScheduler.schedule();
		}
	}

	private setQuery(query: CustomizationDiscoveryQuery, preserveFocus = false): void {
		this.callbacks.marketplaceNavigationChanged?.();
		this.query = query;
		this.resetCatalogState();
		this.errorMessage = undefined;
		this.cancelCatalogRequest();
		this.searchScheduler.cancel();
		this.resultList.scrollTop = 0;
		this.lastAnnouncement = undefined;
		this.searchWidget.setValue(query.toString());
		this.updateSearchActions();
		this.render();
		if (this.shouldQueryCatalog() && !this.loaded) {
			this.searchScheduler.schedule(0);
		}
		if (!preserveFocus) {
			this.searchWidget.focus();
		}
	}

	private resetCatalogState(): void {
		this.installErrors.clear();
		this.refreshDepth = undefined;
		const cached = this.query.isEmpty() ? this.browseCatalogCache.get(this.selectedSourceId ?? '') : undefined;
		this.catalogPage = cached?.page;
		if (cached) {
			this.catalogItems = cached.items;
			this.curatedSections = cached.curatedSections;
			this.curatedSourceId = cached.curatedSourceId;
			this.sourceSections = cached.sourceSections;
			this.curatedSourceError = cached.curatedSourceError;
			this.loaded = true;
		} else {
			this.catalogItems = [];
			this.curatedSections = undefined;
			this.curatedSourceId = undefined;
			this.sourceSections = [];
			this.curatedSourceError = undefined;
			this.loaded = false;
		}
	}

	private updateSearchActions(): void {
		this.searchActionDisposables.clear();
		const actions: IAction[] = [];
		if (!this.query.isEmpty()) {
			actions.push(this.searchActionDisposables.add(new Action(
				'customizationDiscovery.clearSearch',
				localize('customizationDiscovery.clearSearch', "Clear Customization Search Results"),
				ThemeIcon.asClassName(Codicon.clearAll),
				true,
				() => this.setQuery(CustomizationDiscoveryQuery.parse('')),
			)));
		}

		const installed = this.searchActionDisposables.add(new Action(
			'customizationDiscovery.filter.installed',
			localize('customizationDiscovery.filterInstalled', "Installed"),
			undefined,
			true,
			() => this.setQuery(this.query.withInstalled(!this.query.installed)),
		));
		installed.checked = this.query.installed;

		const mcp = this.searchActionDisposables.add(new Action(
			'customizationDiscovery.filter.mcp',
			localize('customizationDiscovery.filterMcpServers', "MCP Servers"),
			undefined,
			true,
			() => this.setQuery(this.query.withType('mcp', !this.query.types.has('mcp'))),
		));
		mcp.checked = this.query.types.has('mcp');

		const plugins = this.searchActionDisposables.add(new Action(
			'customizationDiscovery.filter.plugin',
			localize('customizationDiscovery.filterPlugins', "Plugins"),
			undefined,
			true,
			() => this.setQuery(this.query.withType('plugin', !this.query.types.has('plugin'))),
		));
		plugins.checked = this.query.types.has('plugin');

		const canvases = this.searchActionDisposables.add(new Action(
			'customizationDiscovery.filter.canvas',
			localize('customizationDiscovery.filterCanvases', "Canvases"),
			undefined,
			true,
			() => this.setQuery(this.query.withType('canvas', !this.query.types.has('canvas'))),
		));
		canvases.checked = this.query.types.has('canvas');
		canvases.tooltip = localize('customizationDiscovery.filterCanvasesDescription', "Agent-driven workflow interfaces.");

		const skills = this.searchActionDisposables.add(new Action(
			'customizationDiscovery.filter.skill',
			localize('customizationDiscovery.filterSkills', "Skills"),
			undefined,
			true,
			() => this.setQuery(this.query.withType('skill', !this.query.types.has('skill'))),
		));
		skills.checked = this.query.types.has('skill');

		actions.push(new SubmenuAction(
			'customizationDiscovery.filter',
			localize('customizationDiscovery.filter', "Filter Customizations..."),
			[installed, new Separator(), mcp, plugins, canvases, skills],
			ThemeIcon.asClassName(Codicon.filter),
		));
		this.searchToolbar.setActions(actions);
	}

	private handleAvailabilityChanged(force = false, preserveResults = false): void {
		const enabledSourceIds = this.getEnabledCatalogSourceIds();
		const sameSources = equals(this.enabledSourceIds, enabledSourceIds);
		if (!force && sameSources) {
			return;
		}
		this.enabledSourceIds = enabledSourceIds;
		this.searchScheduler.cancel();
		this.cancelCatalogRequest();
		const preserveDisplayedResults = preserveResults && sameSources;
		this.refreshDepth = preserveDisplayedResults
			? Math.max(this.refreshDepth ?? 0, this.catalogPage?.items.length ?? 0) || undefined
			: undefined;
		this.catalogPage = undefined;
		this.browseCatalogCache.clear();
		if (!preserveDisplayedResults) {
			this.catalogItems = [];
			this.curatedSections = undefined;
			this.curatedSourceId = undefined;
			this.sourceSections = [];
		}
		this.curatedSourceError = undefined;
		this.loaded = false;
		this.errorMessage = undefined;
		this.render();
		if (this.shouldQueryCatalog()) {
			void this.loadCatalog(false);
		}
	}

	private refreshInstalledItems(): void {
		const items: IInstalledDiscoveryItem[] = [];
		for (const section of ITEMS_MODEL_SECTIONS) {
			if (!this.visibleSectionIds.has(section)) {
				continue;
			}
			for (const item of this.itemsModel.getItems(section).get()) {
				const type = getSectionType(section);
				items.push({
					kind: 'installed',
					id: `installed:${section}:${item.id}`,
					name: item.displayName ?? item.name,
					description: item.description ?? item.filename,
					sourceLabel: item.marketplace ? this.getMarketplaceResourceLabel(item.marketplace.resource) : getSourceLabel(item),
					type,
					section,
					uri: item.uri,
					source: item.source,
					promptType: item.promptType,
					itemId: item.id,
					promptDetail: item,
					catalogResource: item.marketplace?.resource,
					removable: !item.isBuiltin && item.source !== 'extension' && item.source !== 'builtin',
					disabled: item.disabled,
				});
			}
		}

		if (this.visibleSectionIds.has(AICustomizationManagementSection.Plugins)) {
			for (const plugin of this.pluginService.plugins.get()) {
				const name = plugin.label || basename(plugin.uri);
				const source = plugin.fromMarketplace;
				items.push({
					kind: 'installed',
					id: `installed:plugin:${plugin.uri.toString()}`,
					name,
					description: source?.description ?? localize('customizationDiscovery.installedPluginDescription', "Installed agent plugin"),
					sourceLabel: source?.marketplace,
					type: 'plugin',
					section: AICustomizationManagementSection.Plugins,
					uri: plugin.uri,
					removable: !!plugin.remove,
					pluginDetail: {
						kind: AgentPluginItemKind.Installed,
						name,
						description: source?.description ?? localize('customizationDiscovery.installedPluginDescription', "Installed agent plugin"),
						marketplace: source?.marketplace,
						plugin,
					},
				});
			}
		}

		if (this.visibleSectionIds.has(AICustomizationManagementSection.McpServers)) {
			for (const server of this.mcpWorkbenchService.local) {
				if (server.installState !== McpServerInstallState.Installed || !server.local) {
					continue;
				}
				items.push({
					kind: 'installed',
					id: `installed:mcp:${server.id}`,
					name: server.label,
					description: server.description,
					type: 'mcp',
					section: AICustomizationManagementSection.McpServers,
					removable: true,
					mcpServerId: server.id,
					mcpDetail: createWorkbenchMcpServerDetailInput(server),
				});
			}
		}

		this.installedItems = items;
		void this.refreshProviderPlugins();
		this.renderInstalledItemsChange();
	}

	/**
	 * Installed items only feed search results; browse cards are derived from the
	 * catalog and installation state. Avoid rebuilding the browse cards when only
	 * installed items change, since that churns frequently (e.g. MCP server status).
	 */
	private renderInstalledItemsChange(): void {
		if (this.query.isEmpty()) {
			return;
		}
		this.render(true);
	}

	private async refreshProviderPlugins(): Promise<void> {
		const sequence = ++this.providerPluginSequence;
		if (!this.visibleSectionIds.has(AICustomizationManagementSection.Plugins)) {
			this.providerPlugins = [];
			return;
		}
		try {
			const provided = await this.itemsModel.getActiveItemSource().fetchProviderItems();
			if (sequence !== this.providerPluginSequence || this._store.isDisposed) {
				return;
			}
			this.providerPlugins = provided.filter(isPluginCustomizationItem).map(item => ({
				kind: 'installed',
				id: `installed:provider-plugin:${item.uri.toString()}`,
				name: item.name,
				description: item.description ?? localize('customizationDiscovery.installedPluginDescription', "Installed agent plugin"),
				sourceLabel: item.badge,
				type: 'plugin',
				section: AICustomizationManagementSection.Plugins,
				uri: item.uri,
				disabled: item.enabled === false,
			}));
			this.renderInstalledItemsChange();
		} catch (error) {
			if (sequence === this.providerPluginSequence && !isCancellationError(error)) {
				this.notificationService.error(localize('customizationDiscovery.providerPluginsError', "Could not load installed plugins. {0}", getErrorMessage(error)));
			}
		}
	}

	private getFilteredInstalledItems(): readonly IInstalledDiscoveryItem[] {
		const text = this.query.text;
		const items = [...this.installedItems, ...this.providerPlugins];
		const marketplaceInstallations = this.installService.installations.get();
		return items
			.filter(item => this.matchesInstalledItem(item, marketplaceInstallations))
			.filter(item => {
				if (!this.selectedSourceId) {
					return true;
				}
				const marketplace = item.catalogResource ?? getInstalledItemMarketplaceRecord(item, marketplaceInstallations)?.resource;
				const pluginMarketplaceReference = item.pluginDetail?.kind === AgentPluginItemKind.Installed
					? item.pluginDetail.plugin.fromMarketplace?.marketplaceReference
					: undefined;
				const sourceId = marketplace?.sourceId ?? (pluginMarketplaceReference ? getPluginCustomizationMarketplaceSourceId(pluginMarketplaceReference) : undefined);
				return sourceId === this.selectedSourceId;
			})
			.filter(item => customizationSearchMatchesAny(text, [item.name, item.description, item.sourceLabel, getTypeLabel(item.type)]))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	private matchesDiscoveryType(type: DiscoveryItemType | undefined, resource?: ICustomizationMarketplaceResource): boolean {
		if (!type) {
			return false;
		}
		if (this.query.types.size === 0) {
			return true;
		}
		return type === 'skill' && this.query.types.has('skill')
			|| type === 'mcp' && this.query.types.has('mcp')
			|| type === 'plugin' && this.query.types.has('plugin')
			|| resource !== undefined && this.query.types.has('canvas') && isCanvasMarketplaceResource(resource);
	}

	private matchesInstalledItem(item: IInstalledDiscoveryItem, installations: ICustomizationMarketplaceInstallationSnapshot): boolean {
		return this.matchesDiscoveryType(item.type, item.catalogResource ?? getInstalledItemMarketplaceRecord(item, installations)?.resource);
	}

	private matchesMarketplaceResource(resource: ICustomizationMarketplaceResource): boolean {
		return this.matchesDiscoveryType(getCatalogType(resource), resource);
	}

	private isCanvasOnlyQuery(): boolean {
		return this.query.types.size === 1 && this.query.types.has('canvas');
	}

	private hasBlankCanvasFilter(): boolean {
		return this.query.types.has('canvas') && !this.query.text;
	}

	private isBlankCanvasBrowse(): boolean {
		return this.isCanvasOnlyQuery() && !this.query.text;
	}

	private shouldQueryCatalog(): boolean {
		return this.visible && this.isCatalogEnabled() && !this.query.installed;
	}

	private isCatalogEnabled(): boolean {
		return this.getEnabledCatalogSourceIds().length > 0;
	}

	private isCurrentQueryAffectedBySourceConfiguration(event: IConfigurationChangeEvent): boolean {
		return this.getCurrentQuerySources().some(source =>
			source.configurationDependencies?.some(setting => event.affectsConfiguration(setting)));
	}

	private getCurrentQuerySources(): readonly ICustomizationMarketplaceSourceInfo[] {
		return this.selectedSourceId
			? this.marketplaceSources.filter(source => source.id === this.selectedSourceId)
			: this.marketplaceSources;
	}

	private getEnabledCatalogSourceIds(): readonly string[] {
		return this.entitlementService.sentiment.hidden ? []
			: getVisibleCustomizationMarketplaceSources(this.configurationService, this.marketplaceService.sources).map(source => source.id);
	}

	private hasNextCatalogPage(): boolean {
		return !this.query.installed && this.catalogPage?.nextCursor !== undefined;
	}

	private shouldQueryCanvasFallback(): boolean {
		return this.hasBlankCanvasFilter()
			&& (!this.selectedSourceId || this.selectedSourceId === CustomizationMarketplaceSources.AgentFinderPublicFeed.id);
	}

	private async queryCanvasFallback(token: CancellationToken, sequence: number): Promise<ICustomizationMarketplacePage | undefined> {
		const items: ICustomizationMarketplaceResource[] = [];
		const sourceErrors: ICustomizationMarketplaceSourceError[] = [];
		let cursor: ICustomizationMarketplaceCursor | undefined;
		for (let pageCount = 0; pageCount < maxFilteredCatalogPagesPerLoad; pageCount++) {
			// Best-effort compatibility fallback until github/copilot-agent-runtime#29133 provides filter-only catalog retrieval.
			const page = await this.marketplaceService.query({
				query: 'canvas',
				mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id],
				pageSize: canvasCatalogPageSize,
				cursor,
			}, token);
			if (sequence !== this.requestSequence || token.isCancellationRequested) {
				return undefined;
			}
			items.push(...page.items);
			sourceErrors.push(...page.sourceErrors ?? []);
			cursor = page.nextCursor;
			if (!cursor) {
				return { items, sourceErrors };
			}
		}
		this.filteredBackfillLimitReached = true;
		return { items, sourceErrors };
	}

	private getMarketplaceSourceLabel(sourceId: string): string {
		const source = this.marketplaceSources.find(source => source.id === sourceId)
			?? (this.marketplaceService.allSources ?? this.marketplaceService.sources).find(source => source.id === sourceId);
		return source?.displayName ?? sourceId;
	}

	private getMarketplaceResourceLabel(resource: ICustomizationMarketplaceResource): string {
		const source = this.getMarketplaceSourceLabel(resource.sourceId);
		return resource.originLabel && resource.originLabel !== source
			? localize('customizationDiscovery.marketplaceOrigin', "{0} · {1}", source, resource.originLabel)
			: resource.originLabel ?? source;
	}

	private cancelCatalogRequest(): void {
		this.continuationScheduler.cancel();
		this.request.value?.cancel();
		this.request.clear();
		this.resetLoadingAnnouncement();
		this.loading = false;
		this.loadingMore = false;
		this.catalogLoadProgress = undefined;
		this.curatedLoadProgress = undefined;
	}

	private updateCatalogPage(page: ICustomizationMarketplacePage, append: boolean, preserveExistingOrder = false): boolean {
		let items: readonly ICustomizationMarketplaceResource[];
		if (append) {
			items = [...(this.catalogPage?.items ?? []), ...page.items];
		} else if (preserveExistingOrder && this.catalogPage?.items.length) {
			const incoming = new Map(page.items.map(item => [getCustomizationMarketplaceResourceKey(item), item]));
			const existingKeys = new Set(this.catalogPage.items.map(item => getCustomizationMarketplaceResourceKey(item)));
			items = [
				...this.catalogPage.items.flatMap(item => {
					const updated = incoming.get(getCustomizationMarketplaceResourceKey(item));
					return updated ? [updated] : [];
				}),
				...page.items.filter(item => !existingKeys.has(getCustomizationMarketplaceResourceKey(item))),
			];
		} else {
			items = page.items;
		}
		this.catalogPage = {
			items,
			nextCursor: page.nextCursor,
			sourceErrors: page.sourceErrors,
		};
		const seen = new Set<string>();
		this.catalogItems = this.catalogPage.items.filter(item => {
			if (item.mediaType === CustomizationMarketplaceMediaType.CursorPlugin) {
				return false;
			}
			const key = getCustomizationMarketplaceResourceKey(item);
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
		this.noteBrowseFirstContent();
		return this.catalogItems.some(item => this.matchesMarketplaceResource(item));
	}

	private noteBrowseFirstContent(): void {
		if (this.browseLoadStartedAt !== undefined && this.browseFirstContentAt === undefined &&
			(this.catalogItems.length > 0 || this.curatedSections?.some(section => section.items.length > 0) || this.sourceSections.length > 0)) {
			this.browseFirstContentAt = Date.now();
		}
	}

	private getBrowsePresentation(): 'curated' | 'fallback' | undefined {
		if (!this.query.isEmpty()) {
			return undefined;
		}
		if (this.selectedSourceId) {
			if (this.curatedSourceId === this.selectedSourceId && this.curatedSections?.some(section => section.items.length > 0)) {
				return 'curated';
			}
			return this.catalogItems.length ? 'fallback' : undefined;
		}
		if (this.curatedSections?.some(section => section.items.length > 0) || this.sourceSections.length) {
			return 'curated';
		}
		if (!this.loading && this.catalogItems.length > 0) {
			return 'fallback';
		}
		return undefined;
	}

	private async loadSourceSections(
		token: CancellationToken,
		browseSectionsPromise: Promise<BrowseSectionsLoadOutcome>,
		onProgress: () => void,
	): Promise<void> {
		let curatedSourceId: string | undefined;
		try {
			const outcome = await browseSectionsPromise;
			if (outcome.kind === 'success') {
				curatedSourceId = outcome.result?.sourceId;
			}
		} catch (error) {
			if (isCancellationError(error) || token.isCancellationRequested) {
				return;
			}
			onUnexpectedError(error);
		}

		const connectorSourceId = CustomizationMarketplaceSources.CopilotConnectors.id;
		const sources = this.marketplaceSources
			.filter(source => source.id !== CustomizationMarketplaceSources.AgentFinderPublicFeed.id && source.id !== curatedSourceId)
			.sort((first, second) => first.id === connectorSourceId ? -1 : second.id === connectorSourceId ? 1 : 0);
		const sections: ISourceBrowseSection[] = [];
		for (const source of sources) {
			if (token.isCancellationRequested) {
				return;
			}
			try {
				const page = await this.marketplaceService.query({
					sourceIds: [source.id],
					pageSize: leadingBrowseItemCount,
				}, token);
				if (token.isCancellationRequested) {
					return;
				}
				const items = page.items
					.filter(resource => getCatalogType(resource) !== undefined)
					.slice(0, leadingBrowseItemCount);
				if (items.length) {
					sections.push({
						id: `source:${source.id}`,
						sourceId: source.id,
						title: source.displayName ?? source.id,
						items,
					});
					this.sourceSections = [...sections];
					this.noteBrowseFirstContent();
					onProgress();
				}
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested) {
					return;
				}
				onUnexpectedError(error);
			}
		}
		if (!token.isCancellationRequested) {
			this.sourceSections = sections;
		}
	}

	private cacheBrowseCatalog(): void {
		if (!this.query.isEmpty() || (!this.catalogPage && this.curatedSections === undefined && !this.sourceSections.length)) {
			return;
		}
		this.browseCatalogCache.set(this.selectedSourceId ?? '', {
			items: this.catalogItems,
			page: this.catalogPage,
			curatedSections: this.curatedSections,
			curatedSourceId: this.curatedSourceId,
			sourceSections: [...this.sourceSections],
			curatedSourceError: this.curatedSourceError,
		});
	}

	private async loadCatalog(append: boolean): Promise<void> {
		if (!this.shouldQueryCatalog() || (append && (this.loading || !this.hasNextCatalogPage()))) {
			return;
		}
		const loadingContinuation = append;
		const browseRequest = !append && this.query.isEmpty();
		const refreshDepth = append ? undefined : this.refreshDepth;
		// Keep the displayed results until the refreshed results are complete; partial progress would shrink the list.
		const refreshingInPlace = refreshDepth !== undefined && this.catalogItems.length > 0;
		const sequence = ++this.requestSequence;
		this.cancelCatalogRequest();
		const request = new CancellationTokenSource();
		this.request.value = request;
		this.loading = true;
		this.loadingMore = append;
		if (browseRequest) {
			this.lastBrowseTelemetryView = undefined;
			this.browseLoadStartedAt = Date.now();
			this.browseFirstContentAt = undefined;
			this.catalogLoadProgress = undefined;
			this.curatedLoadProgress = undefined;
		}
		this.filteredBackfillLimitReached = false;
		this.errorMessage = undefined;
		this.render(true);

		try {
			const browseSectionsPromise = browseRequest
				? this.loadBrowseSections(request.token, progress => {
					if (sequence !== this.requestSequence || request.token.isCancellationRequested) {
						return;
					}
					this.curatedLoadProgress = {
						completed: progress.completedSectionCount,
						total: progress.totalSectionCount,
						cached: progress.cachedSectionCount,
					};
					this.curatedSections = progress.result.sections;
					this.curatedSourceId = progress.result.sourceId;
					this.curatedSourceError = progress.result.error
						? { sourceId: progress.result.sourceId, message: progress.result.error }
						: undefined;
					this.noteBrowseFirstContent();
					this.render();
				})
				: undefined;
			const sourceSectionsPromise = browseSectionsPromise && !this.selectedSourceId
				? this.loadSourceSections(request.token, browseSectionsPromise, () => {
					if (sequence === this.requestSequence && !request.token.isCancellationRequested) {
						this.render();
					}
				})
				: undefined;
			let catalogError: Error | undefined;
			try {
				const backfill = !this.query.isEmpty() && this.query.types.size > 0
					&& (getCatalogMediaType(this.query.types) === undefined || this.query.types.has('canvas'));
				const exhaustCanvasPages = this.isBlankCanvasBrowse();
				const getCatalogQuery = (cursor: ICustomizationMarketplaceCursor | undefined): ICustomizationMarketplaceQuery => ({
					query: this.query.text || undefined,
					mediaType: getCatalogMediaType(this.query.types),
					sourceIds: this.selectedSourceId ? [this.selectedSourceId] : undefined,
					pageSize: exhaustCanvasPages ? canvasCatalogPageSize : this.query.isEmpty() && !this.selectedSourceId ? browseCatalogPageSize : catalogPageSize,
					cursor,
				});
				const onProgress: CustomizationMarketplaceQueryProgressCallback | undefined = browseRequest ? progress => {
					if (sequence !== this.requestSequence || request.token.isCancellationRequested) {
						return;
					}
					this.catalogLoadProgress = {
						completed: progress.completedSourceIds.length,
						total: progress.totalSourceCount,
						cached: progress.cachedSourceIds.length,
					};
					if (!refreshingInPlace && (progress.page.items.length > 0 || this.catalogItems.length === 0)) {
						this.updateCatalogPage(progress.page, false, !this.selectedSourceId);
					}
					this.render();
				} : undefined;
				let hasMatchingCatalogItem = false;
				for (let pageCount = 0; pageCount < (backfill ? maxFilteredCatalogPagesPerLoad : 1); pageCount++) {
					const page = pageCount === 0 && refreshDepth !== undefined
						? await this.queryCatalogToDepth(getCatalogQuery, refreshDepth, request.token, onProgress)
						: await this.marketplaceService.query(getCatalogQuery(append ? this.catalogPage?.nextCursor : undefined), request.token, onProgress);
					if (sequence !== this.requestSequence || request.token.isCancellationRequested) {
						return;
					}
					hasMatchingCatalogItem = this.updateCatalogPage(page, append, browseRequest && !append && !this.selectedSourceId);
					append = true;
					if (!backfill || !page.nextCursor || hasMatchingCatalogItem && !exhaustCanvasPages) {
						break;
					}
					if (pageCount === maxFilteredCatalogPagesPerLoad - 1) {
						this.filteredBackfillLimitReached = true;
					}
				}
				const primaryPage = this.catalogPage;
				if (!loadingContinuation && this.shouldQueryCanvasFallback()) {
					const fallback = await this.queryCanvasFallback(request.token, sequence);
					if (!fallback) {
						return;
					}
					this.updateCatalogPage({
						...fallback,
						nextCursor: primaryPage?.nextCursor,
						sourceErrors: [...primaryPage?.sourceErrors ?? [], ...fallback.sourceErrors ?? []],
					}, true);
				}
			} catch (error) {
				if (sequence !== this.requestSequence || isCancellationError(error)) {
					return;
				}
				this.filteredBackfillLimitReached = false;
				catalogError = error instanceof Error ? error : new Error(getErrorMessage(error));
			}
			if (browseSectionsPromise) {
				this.loaded = true;
				this.errorMessage = catalogError ? getErrorMessage(catalogError) : undefined;
				this.render();
				this.logBrowseRendered();
				const outcome = await browseSectionsPromise;
				if (sequence !== this.requestSequence || request.token.isCancellationRequested) {
					return;
				}
				if (outcome.kind === 'error') {
					catalogError ??= outcome.error;
				} else {
					this.curatedSections = outcome.result?.sections;
					this.curatedSourceId = outcome.result?.sourceId;
					this.curatedSourceError = outcome.result?.error
						? { sourceId: outcome.result.sourceId, message: outcome.result.error }
						: undefined;
				}
				await sourceSectionsPromise;
				if (sequence !== this.requestSequence || request.token.isCancellationRequested) {
					return;
				}
			}
			this.loaded = true;
			this.errorMessage = catalogError ? getErrorMessage(catalogError) : undefined;
			if (!catalogError) {
				this.refreshDepth = undefined;
			}
			this.cacheBrowseCatalog();
			this.logBrowseRendered();
		} catch (error) {
			if (sequence !== this.requestSequence || isCancellationError(error)) {
				return;
			}
			this.filteredBackfillLimitReached = false;
			this.loaded = true;
			this.errorMessage = getErrorMessage(error);
		} finally {
			if (this.request.value === request) {
				if (browseRequest) {
					this.logBrowseLoaded();
				}
				this.resetLoadingAnnouncement();
				this.loading = false;
				this.request.clear();
				this.render();
			}
		}
	}

	/**
	 * Queries the first catalog page and requests continuation pages until at least `depth` results are
	 * loaded, so an in-place refresh restores the results the user had already scrolled to in one update.
	 */
	private async queryCatalogToDepth(
		getQuery: (cursor: ICustomizationMarketplaceCursor | undefined) => ICustomizationMarketplaceQuery,
		depth: number,
		token: CancellationToken,
		onProgress: CustomizationMarketplaceQueryProgressCallback | undefined,
	): Promise<ICustomizationMarketplacePage> {
		let page = await this.marketplaceService.query(getQuery(undefined), token, onProgress);
		for (let pageCount = 1; page.nextCursor && page.items.length < depth && pageCount < maxRefreshCatalogPages && !token.isCancellationRequested; pageCount++) {
			const next = await this.marketplaceService.query(getQuery(page.nextCursor), token);
			const sourceErrors = new Map([...page.sourceErrors ?? [], ...next.sourceErrors ?? []].map(error => [error.sourceId, error]));
			page = {
				items: [...page.items, ...next.items],
				total: next.total ?? page.total,
				nextCursor: next.nextCursor,
				sourceErrors: sourceErrors.size ? [...sourceErrors.values()] : undefined,
			};
		}
		return page;
	}

	private logBrowseRendered(): void {
		if (!this.query.isEmpty() || !this.loaded) {
			return;
		}
		const view = this.getBrowsePresentation();
		if (!view) {
			return;
		}
		if (view === this.lastBrowseTelemetryView) {
			return;
		}
		this.lastBrowseTelemetryView = view;
		this.telemetryService.publicLog2<CustomizationMarketplaceBrowseRenderedEvent, CustomizationMarketplaceBrowseRenderedClassification>('chatCustomizationMarketplace.browseRendered', {
			view,
			curatedSectionCount: view === 'curated' ? this.curatedSections?.filter(section => section.items.length > 0).length ?? 0 : 0,
		});
	}

	private logBrowseLoaded(): void {
		const startedAt = this.browseLoadStartedAt;
		if (startedAt === undefined) {
			return;
		}
		const sourceCount = (this.catalogLoadProgress?.total ?? 0) + (this.curatedLoadProgress?.total ?? 0);
		this.telemetryService.publicLog2<CustomizationMarketplaceBrowseLoadedEvent, CustomizationMarketplaceBrowseLoadedClassification>('chatCustomizationMarketplace.browseLoaded', {
			timeToFirstContentMs: this.browseFirstContentAt === undefined ? -1 : this.browseFirstContentAt - startedAt,
			timeToSettledMs: Date.now() - startedAt,
			sourceCount,
			cachedSourceCount: (this.catalogLoadProgress?.cached ?? 0) + (this.curatedLoadProgress?.cached ?? 0),
		});
		this.browseLoadStartedAt = undefined;
		this.browseFirstContentAt = undefined;
	}

	private async loadBrowseSections(token: CancellationToken, onProgress: NonNullable<Parameters<NonNullable<ICustomizationMarketplaceService['getBrowseSections']>>[2]>): Promise<BrowseSectionsLoadOutcome> {
		try {
			return {
				kind: 'success',
				result: await this.marketplaceService.getBrowseSections?.({
					sourceIds: this.selectedSourceId ? [this.selectedSourceId] : undefined,
				}, token, onProgress),
			};
		} catch (error) {
			return { kind: 'error', error: error instanceof Error ? error : new Error(getErrorMessage(error)) };
		}
	}

	private isLoadingMore(): boolean {
		return this.loading && this.loadingMore && this.hasMatchingCatalogItems();
	}

	private hasMatchingCatalogItems(): boolean {
		return this.catalogItems.some(item => this.matchesMarketplaceResource(item));
	}

	private isCatalogPending(): boolean {
		return this.loading || this.shouldQueryCatalog() && (!this.loaded
			|| this.filteredBackfillLimitReached && this.hasNextCatalogPage() && !this.hasMatchingCatalogItems());
	}

	private render(preserveResults = true): void {
		const sourceErrors = [...this.catalogPage?.sourceErrors ?? []];
		if (this.curatedSourceError && !sourceErrors.some(error => error.sourceId === this.curatedSourceError?.sourceId)) {
			sourceErrors.push(this.curatedSourceError);
		}
		this.sourceWarnings.update(
			sourceErrors,
			this.loading,
			this.loaded && !this.loading,
			this.isCatalogEnabled() && !this.query.installed ? this.getCurrentQuerySources().map(source => source.id) : [],
		);
		const catalogPending = this.isCatalogPending();
		const showProgress = this.visible && catalogPending && !this.isLoadingMore();
		if (showProgress !== this.progressBarActive) {
			this.progressBarActive = showProgress;
			if (showProgress) {
				this.progressBar.infinite().show();
			} else {
				this.progressBar.stop().hide();
			}
		}
		this.browseContent.setAttribute('aria-busy', String(catalogPending));
		const searchMode = !this.query.isEmpty() || this.selectedSourceId !== undefined && this.getBrowsePresentation() !== 'curated';
		this.browseScrollable.getDomNode().hidden = searchMode;
		this.resultListContainer.hidden = !searchMode;
		if (searchMode) {
			this.renderSearchResults(preserveResults);
		} else {
			this.renderBrowse();
		}
		this.layout(this.lastDimension);
	}

	private scheduleContinuationIfNeeded(): void {
		if (!this.visible || this.query.isEmpty() && !this.selectedSourceId || this.loading || this.errorMessage || !this.hasNextCatalogPage()) {
			this.continuationScheduler.cancel();
			return;
		}
		const renderHeight = this.resultList.renderHeight;
		if (renderHeight > 0 && (this.resultList.scrollHeight <= renderHeight || this.resultList.scrollTop + renderHeight >= this.resultList.scrollHeight - resultRowHeight * 3)) {
			this.continuationScheduler.schedule();
		}
	}

	private getLoadingLabel(): string {
		const progress = this.query.isEmpty() && !this.loadingMore
			? {
				completed: (this.catalogLoadProgress?.completed ?? 0) + (this.curatedLoadProgress?.completed ?? 0),
				total: (this.catalogLoadProgress?.total ?? 0) + (this.curatedLoadProgress?.total ?? 0),
				cached: (this.catalogLoadProgress?.cached ?? 0) + (this.curatedLoadProgress?.cached ?? 0),
			}
			: undefined;
		return this.loadingMore
			? localize('customizationDiscovery.loadingMore', "Loading more customizations...")
			: progress?.total ? progress.cached
				? localize('customizationDiscovery.refreshingProgress', "Refreshing customizations... {0} of {1} sources refreshed.", progress.completed, progress.total)
				: localize('customizationDiscovery.loadingProgress', "Loading customizations... {0} of {1} sources loaded.", progress.completed, progress.total)
				: this.catalogItems.length ? localize('customizationDiscovery.reloading', "Reloading customizations...")
					: localize('customizationDiscovery.loading', "Loading customizations...");
	}

	private getSearchMarketplaceResources(): readonly IPrioritizedMarketplaceResource[] {
		const resources = new Map(this.catalogItems.map(resource => [getCustomizationMarketplaceResourceKey(resource), resource]));
		if (!this.selectedSourceId || this.query.installed) {
			for (const { resource } of this.installService.installations.get().installations) {
				const key = getCustomizationMarketplaceResourceKey(resource);
				if (!resources.has(key)) {
					resources.set(key, resource);
				}
			}
		}
		const query = this.query.text;
		const matching = this.deduplicateMarketplaceResources([...resources.values()].filter(resource => {
			const type = getCatalogType(resource);
			return !!type
				&& this.matchesMarketplaceResource(resource)
				&& (!this.selectedSourceId || resource.sourceId === this.selectedSourceId)
				&& customizationSearchMatchesAny(query, [resource.displayName, resource.description, getTypeLabel(type), this.getMarketplaceSourceLabel(resource.sourceId)]);
		}));
		return this.isBlankCanvasBrowse()
			? matching
				.map((resource, originalIndex) => ({ resource, originalIndex }))
				.sort((first, second) => (second.resource.installCount ?? 0) - (first.resource.installCount ?? 0) || first.originalIndex - second.originalIndex)
				.map(({ resource }) => ({ resource }))
			: this.selectedSourceId
				? matching.map(resource => ({ resource }))
				: prioritizeLinkedCopilotConnectors(matching);
	}

	private deduplicateMarketplaceResources(resources: readonly ICustomizationMarketplaceResource[]): readonly ICustomizationMarketplaceResource[] {
		const installations = this.installService.installations.get();
		const seen = new Set<string | IRecordedCustomizationMarketplaceResource>();
		return resources.filter(resource => {
			const state = this.getInstallState(resource);
			if (!hasInstallationTarget(state)) {
				return true;
			}
			const record = this.installService.findInstallation(resource) ?? installations.findByTarget(state.target);
			if (!record) {
				return true;
			}
			const identity = getMarketplaceInstallationIdentity(record, installations);
			if (seen.has(identity)) {
				return false;
			}
			seen.add(identity);
			return true;
		});
	}

	private renderSearchResults(preserveResults: boolean): void {
		this.resultStatusDisposables.clear();
		this.resultList.ariaLabel = this.isCanvasOnlyQuery()
			? localize('customizationDiscovery.canvasResultsLabel', "Canvas extension search results")
			: localize('customizationDiscovery.resultsLabel', "Customization search results");
		const resources = this.getSearchMarketplaceResources().map(entry => ({ ...entry, state: this.getInstallState(entry.resource) }));
		const installed = [...this.getFilteredInstalledItems()];
		const marketplaceInstallations = this.installService.installations.get();
		const installedByMarketplaceRecord = new Map<string | IRecordedCustomizationMarketplaceResource, number[]>();
		for (let index = 0; index < installed.length; index++) {
			const marketplace = getInstalledItemMarketplaceRecord(installed[index], marketplaceInstallations);
			if (marketplace) {
				const identity = getMarketplaceInstallationIdentity(marketplace, marketplaceInstallations);
				const indices = installedByMarketplaceRecord.get(identity) ?? [];
				indices.push(index);
				installedByMarketplaceRecord.set(identity, indices);
			}
		}
		const consumedInstalledIndices = new Set<number>();
		const marketplaceEntries: (IInstalledDiscoveryItem | ICatalogDiscoveryItem)[] = [];
		for (const { resource, linkedConnectionRole, state } of resources) {
			const type = getCatalogType(resource)!;
			if (hasInstallationTarget(state)) {
				const marketplace = this.installService.findInstallation(resource) ?? marketplaceInstallations.findByTarget(state.target);
				const identity = marketplace ? getMarketplaceInstallationIdentity(marketplace, marketplaceInstallations) : undefined;
				const matchingInstalledIndices = (identity !== undefined ? installedByMarketplaceRecord.get(identity) : undefined) ?? [];
				const matchingInstalledIndex = matchingInstalledIndices[0];
				if (matchingInstalledIndex !== undefined) {
					for (const index of matchingInstalledIndices) {
						consumedInstalledIndices.add(index);
					}
					marketplaceEntries.push({
						...installed[matchingInstalledIndex],
						sourceLabel: this.getMarketplaceResourceLabel(resource),
						catalogResource: resource,
						linkedConnectionRole,
						alternativeExpanded: linkedConnectionRole === 'alternative' && this.isAlternativeExpanded(resource),
					});
				} else {
					marketplaceEntries.push({
						kind: 'installed',
						id: `installed:catalog:${getCustomizationMarketplaceResourceKey(resource)}`,
						name: resource.displayName,
						description: resource.description,
						sourceLabel: this.getMarketplaceResourceLabel(resource),
						type,
						section: getSectionForCatalogType(type),
						catalogResource: resource,
						uri: state.target.kind === 'skill' || state.target.kind === 'plugin' ? state.target.uri : undefined,
						mcpServerId: state.target.kind === 'mcp' ? state.target.id : undefined,
						mcpConnectorName: state.target.kind === 'copilotConnector' ? state.target.name : undefined,
						linkedConnectionRole,
						alternativeExpanded: linkedConnectionRole === 'alternative' && this.isAlternativeExpanded(resource),
					});
				}
			} else if (!this.query.installed) {
				marketplaceEntries.push({
					kind: 'available',
					id: `available:${getCustomizationMarketplaceResourceKey(resource)}`,
					resource,
					linkedConnectionRole,
					alternativeExpanded: linkedConnectionRole === 'alternative' && this.isAlternativeExpanded(resource),
				});
			}
		}

		const unmatchedInstalled = this.selectedSourceId && !this.query.installed
			? []
			: installed.filter((_, index) => !consumedInstalledIndices.has(index));
		const entries: DiscoveryListEntry[] = [...unmatchedInstalled, ...marketplaceEntries].map(entry => {
			const resource = entry.kind === 'available' ? entry.resource : entry.catalogResource;
			return {
				...entry,
				installationState: resource ? this.getInstallState(resource) : undefined,
				uninstalling: entry.kind === 'installed' && this.pendingDirectUninstalls.has(entry.id),
				installError: resource ? this.installErrors.get(getCustomizationMarketplaceResourceKey(resource)) : undefined,
			};
		});
		const resultCount = entries.length;
		if (this.isLoadingMore() && resultCount > 0) {
			entries.push({ kind: 'loading', id: 'loading' });
		}
		let start = 0;
		let end = this.resultList.length;
		let newEnd = entries.length;
		if (preserveResults) {
			while (start < this.resultList.length && start < entries.length && discoveryListEntriesEqual(this.resultList.element(start), entries[start])) {
				start++;
			}
			while (end > start && newEnd > start && discoveryListEntriesEqual(this.resultList.element(end - 1), entries[newEnd - 1])) {
				end--;
				newEnd--;
			}
		}
		if (start !== end || start !== newEnd) {
			this.resultList.splice(start, end - start, entries.slice(start, newEnd));
		}

		const installError = this.installErrors.values().next().value;
		const catalogPending = this.isCatalogPending();
		this.resultListContainer.setAttribute('aria-busy', String(catalogPending));
		if (installError) {
			this.resultStatus.textContent = installError;
		} else if (catalogPending) {
			this.resultStatus.textContent = '';
		} else if (this.errorMessage) {
			const message = localize('customizationDiscovery.error', "Could not load available customizations. {0}", this.errorMessage);
			this.resultStatus.textContent = message;
			this.announce(message);
			const retry = this.resultStatusDisposables.add(new Button(this.resultStatus, { ...defaultButtonStyles, secondary: true, small: true }));
			retry.label = localize('customizationDiscovery.retry', "Retry");
			this.resultStatusDisposables.add(retry.onDidClick(() => {
				this.focus();
				void this.loadCatalog(this.loadingMore);
			}));
		} else if (entries.length === 0 && this.sourceWarnings.hasFailures) {
			this.resultStatus.textContent = '';
		} else if (entries.length === 0 && !this.sourceWarnings.hasInlinePrompts) {
			this.resultStatus.textContent = this.filteredBackfillLimitReached
				? localize('customizationDiscovery.moreResultsPossible', "More catalog results may match this search.")
				: this.isCanvasOnlyQuery()
					? localize('customizationDiscovery.noCanvasResults', "No canvas extensions match this search.")
					: localize('customizationDiscovery.noResults', "No customizations match this search.");
		} else {
			this.resultStatus.textContent = '';
		}
		if (this.loading) {
			this.announceLoading(this.getLoadingLabel());
		}
		if (!catalogPending && !this.errorMessage) {
			this.announce([
				this.isCanvasOnlyQuery()
					? localize('customizationDiscovery.canvasResultCount', "{0} canvas extensions found.", resultCount)
					: localize('customizationDiscovery.resultCount', "{0} customizations found.", resultCount),
				this.sourceWarnings.getAccessibilityContent(),
			].filter(Boolean).join('\n'));
		}
	}

	private renderBrowse(): void {
		this.browseDisposables.clear();
		this.browsePrimaryActions.clear();
		this.browseAlternativeActions.clear();
		this.browseInstallStates.clear();
		DOM.clearNode(this.browseSections);
		if (!this.isCatalogEnabled()) {
			this.browseStatus.textContent = localize('customizationDiscovery.catalogDisabled', "Search your installed customizations, or enable a marketplace source to explore available items.");
			return;
		}
		if (this.loading && this.catalogItems.length === 0 && !this.curatedSections?.some(section => section.items.length > 0) && !this.sourceSections.length) {
			this.browseStatus.textContent = '';
			return;
		}
		if (this.errorMessage && this.catalogItems.length === 0 && !this.curatedSections?.some(section => section.items.length > 0) && !this.sourceSections.length) {
			const message = localize('customizationDiscovery.error', "Could not load available customizations. {0}", this.errorMessage);
			this.browseStatus.textContent = message;
			this.announce(message);
			const retry = this.browseDisposables.add(new Button(this.browseStatus, { ...defaultButtonStyles, secondary: true, small: true }));
			retry.label = localize('customizationDiscovery.retry', "Retry");
			this.browseDisposables.add(retry.onDidClick(() => void this.loadCatalog(false)));
			return;
		}
		this.browseStatus.textContent = '';
		const browsePresentation = this.getBrowsePresentation();
		const curatedSections = browsePresentation === 'curated'
			? this.curatedSections?.filter(section => section.items.length > 0)
			: undefined;
		if (curatedSections?.length) {
			for (let index = 0; index < curatedSections.length; index++) {
				const section = curatedSections[index];
				this.renderBrowseSection(
					section.title,
					section.items.map<IPrioritizedMarketplaceResource>(resource => ({ resource })),
					undefined,
					index === 0,
				);
			}
		}
		if (!this.selectedSourceId) {
			for (const section of this.sourceSections) {
				this.renderBrowseSection(
					section.title,
					section.items.map<IPrioritizedMarketplaceResource>(resource => ({ resource })),
					undefined,
					false,
					{
						label: localize('customizationDiscovery.viewAll', "View All"),
						ariaLabel: localize('customizationDiscovery.viewAllSource', "View all customizations from {0}", section.title),
						run: () => this.selectSource(section.sourceId),
					},
				);
			}
		}
		if (browsePresentation === 'fallback') {
			const prioritizedResources = prioritizeLinkedCopilotConnectors(this.deduplicateMarketplaceResources(this.catalogItems));
			const leading = this.selectedSourceId ? [] : getLeadingBrowseItems(prioritizedResources);
			const leadingIds = new Set(leading.map(({ resource }) => getCustomizationMarketplaceResourceKey(resource)));
			if (leading.length) {
				this.renderBrowseSection(
					localize('customizationDiscovery.leadingSection', "Expand your agent's horizons"),
					leading,
					undefined,
					true,
				);
			}
			const groups: readonly { readonly type: CustomizationDiscoveryType; readonly label: string }[] = [
				{ type: 'skill', label: localize('customizationDiscovery.skillsSection', "Skills") },
				{ type: 'mcp', label: localize('customizationDiscovery.mcpsSection', "MCP servers") },
				{ type: 'plugin', label: localize('customizationDiscovery.pluginsSection', "Plugins") },
			];
			const remainingGroups = groupPrioritizedMarketplaceResources(prioritizedResources)
				.filter(group => group.every(({ resource }) => !leadingIds.has(getCustomizationMarketplaceResourceKey(resource))));
			for (const group of groups) {
				const items = remainingGroups
					.filter(items => getCatalogType(items[0].resource) === group.type)
					.slice(0, leadingBrowseItemCount)
					.flat();
				if (items.length) {
					this.renderBrowseSection(group.label, items, group.type, false);
				}
			}
		}
		if (this.loading) {
			const loadingLabel = this.getLoadingLabel();
			this.browseStatus.textContent = loadingLabel;
			this.announceLoading(loadingLabel);
		} else if (this.errorMessage) {
			const message = localize('customizationDiscovery.error', "Could not load available customizations. {0}", this.errorMessage);
			this.browseStatus.textContent = message;
			this.announce(message);
			const retry = this.browseDisposables.add(new Button(this.browseStatus, { ...defaultButtonStyles, secondary: true, small: true }));
			retry.label = localize('customizationDiscovery.retry', "Retry");
			this.browseDisposables.add(retry.onDidClick(() => void this.loadCatalog(false)));
		} else if (!this.catalogItems.length && !curatedSections?.length && !this.sourceSections.length && this.loaded && this.sourceWarnings.hasFailures) {
			this.browseStatus.textContent = '';
		} else if (!this.catalogItems.length && !curatedSections?.length && !this.sourceSections.length && this.loaded && !this.sourceWarnings.hasInlinePrompts) {
			this.browseStatus.textContent = localize('customizationDiscovery.emptyCatalog', "No catalog customizations are available.");
		} else if (this.errorMessage) {
			this.browseStatus.textContent = localize('customizationDiscovery.additionalItemsError', "Some additional customizations could not be loaded. {0}", this.errorMessage);
		} else {
			this.browseStatus.textContent = this.installErrors.values().next().value ?? '';
		}
		if (!this.loading && this.sourceWarnings.hasInlinePrompts) {
			this.announce(this.sourceWarnings.getAccessibilityContent());
		}
	}

	private renderBrowseSection(
		label: string,
		items: readonly IPrioritizedMarketplaceResource[],
		type: CustomizationDiscoveryType | undefined,
		elevated: boolean,
		action?: { readonly label: string; readonly ariaLabel: string; readonly run: () => void },
	): void {
		const section = DOM.append(this.browseSections, $('.customization-discovery-section'));
		section.classList.toggle('featured', elevated);
		const header = DOM.append(section, $('.customization-discovery-section-header'));
		DOM.append(header, $('h3.customization-discovery-section-title')).textContent = label;
		if (type || action) {
			const showAll = DOM.append(header, $('button.customization-discovery-show-all')) as HTMLButtonElement;
			showAll.type = 'button';
			showAll.textContent = action?.label ?? localize('customizationDiscovery.viewAll', "View All");
			if (action) {
				showAll.setAttribute('aria-label', action.ariaLabel);
			}
			this.browseDisposables.add(DOM.addDisposableListener(showAll, DOM.EventType.CLICK, () => {
				if (action) {
					action.run();
				} else if (type) {
					this.setQuery(this.query.withType(type, true));
				}
			}));
		}
		const grid = DOM.append(section, $('.customization-discovery-grid'));
		for (const group of groupPrioritizedMarketplaceResources(items)) {
			if (group.length === 2) {
				this.renderBrowseCardGroup(grid, group[0].resource, group[1].resource);
			} else {
				this.renderBrowseCard(grid, group[0].resource);
			}
		}
	}

	private renderBrowseCardGroup(parent: HTMLElement, connector: ICustomizationMarketplaceResource, alternative: ICustomizationMarketplaceResource): void {
		const group = DOM.append(parent, $('.customization-discovery-card-group'));
		this.renderBrowseCard(group, connector);
		const alternativeContainer = DOM.append(group, $('.customization-discovery-card-alternative'));
		const alternativeKey = getCustomizationMarketplaceResourceKey(alternative);
		const expanded = this.isAlternativeExpanded(alternative);
		alternativeContainer.classList.toggle('expanded', expanded);
		const disclosure = DOM.append(alternativeContainer, $<HTMLButtonElement>('button.customization-discovery-card-linked-label'));
		disclosure.type = 'button';
		disclosure.setAttribute('aria-expanded', String(expanded));
		disclosure.setAttribute('aria-label', expanded
			? localize('customizationDiscovery.hideAlternativeAriaLabel', "Hide 1 alternative customization")
			: localize('customizationDiscovery.showAlternativeAriaLabel', "Show 1 alternative customization"));
		const disclosureIcon = DOM.append(disclosure, $('.codicon'));
		disclosureIcon.classList.add(...ThemeIcon.asClassNameArray(expanded ? Codicon.chevronDownCompact : Codicon.chevronRightCompact));
		disclosureIcon.setAttribute('aria-hidden', 'true');
		DOM.append(disclosure, $('span')).textContent = getAlternativeDisclosureLabel();
		this.browseAlternativeActions.set(alternativeKey, disclosure);
		const toggle = () => {
			const shouldExpand = !this.expandedAlternatives.delete(alternativeKey);
			if (shouldExpand) {
				this.expandedAlternatives.add(alternativeKey);
			}
			this.renderBrowse();
			this.browseAlternativeActions.get(alternativeKey)?.focus();
		};
		this.browseDisposables.add(DOM.addDisposableListener(disclosure, DOM.EventType.CLICK, event => {
			event.stopPropagation();
			toggle();
		}));
		this.browseDisposables.add(DOM.addDisposableListener(disclosure, DOM.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				event.stopPropagation();
				toggle();
			}
		}));
		if (expanded) {
			this.renderBrowseCard(alternativeContainer, alternative);
		}
	}

	private renderBrowseCard(parent: HTMLElement, item: ICustomizationMarketplaceResource): void {
		const card = DOM.append(parent, $('.customization-discovery-card'));
		const resourceKey = getCustomizationMarketplaceResourceKey(item);
		card.dataset.resourceKey = resourceKey;
		const state = this.getInstallState(item);
		this.browseInstallStates.set(item, state);
		const primaryAction = createCustomizationCardPrimaryAction(
			card,
			state.kind === 'installed'
				? localize('customizationDiscovery.openInstalled', "Open installed customization {0}", item.displayName)
				: localize('customizationDiscovery.openDetails', "View details for {0}", item.displayName),
			'customization-discovery-card-primary',
		);
		this.browsePrimaryActions.set(resourceKey, primaryAction);
		this.browseDisposables.add(DOM.addDisposableListener(primaryAction, DOM.EventType.CLICK, () => this.openCatalogItem(item, 'browse')));
		const icon = DOM.append(card, $('.customization-discovery-card-icon'));
		const type = getCatalogType(item);
		renderCustomizationMarketplaceIcon(
			icon,
			type === 'mcp' ? Codicon.server : type === 'plugin' ? Codicon.extensions : Codicon.lightbulb,
			item.icon,
			this.themeService.getColorTheme().type,
			this.browseDisposables,
			true,
		);
		const body = DOM.append(card, $('.customization-discovery-card-body'));
		const heading = DOM.append(body, $('.customization-discovery-card-heading'));
		const name = DOM.append(heading, $('.customization-discovery-card-name'));
		name.textContent = item.displayName;
		const metadata = DOM.append(heading, $('.customization-discovery-card-metadata'));
		metadata.textContent = [
			type ? getTypeLabel(type) : undefined,
			this.getMarketplaceSourceLabel(item.sourceId),
		].filter(Boolean).join(' · ');
		const description = DOM.append(body, $('.customization-discovery-card-description'));
		description.textContent = item.description;
		this.browseDisposables.add(this.hoverService.setupDelayedHover(name, { content: item.displayName }));
		this.browseDisposables.add(this.hoverService.setupDelayedHover(description, { content: item.description }));
		const actions = DOM.append(card, $('.customization-discovery-card-actions'));
		const setupUrl = state.kind === 'unavailable' ? state.setupUrl : undefined;
		const installError = this.installErrors.get(getCustomizationMarketplaceResourceKey(item));
		if (hasInstallationTarget(state)) {
			renderRecordedCustomizationActions(
				actions,
				item,
				item.displayName,
				state,
				installError,
				this.getRequiredPluginMessage(state.target.kind === 'plugin' ? state.target.uri : undefined),
				this.browseDisposables,
				this.hoverService,
				() => void this.repair(item),
				() => this.installService.cancelConnectorOperation(item),
				() => void this.uninstallMarketplaceResource(item),
			);
			return;
		}
		const cancellable = isCancellableConnectorOperation(item, state);
		const install = this.browseDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, small: true }));
		install.label = getInstallActionLabel(state, !!setupUrl, installError, isCopilotConnectorResource(item));
		install.enabled = isInstallActionEnabled(item, state, !!setupUrl);
		install.setAriaLabel(cancellable
			? localize('customizationDiscovery.cancelConnectorOperationLabel', "Cancel connecting {0}", item.displayName)
			: setupUrl
				? localize('customizationDiscovery.viewSetupLabel', "View setup instructions for {0}", item.displayName)
				: state.kind === 'unavailable'
					? localize('customizationDiscovery.installUnavailable', "Install {0}. {1}", item.displayName, state.message)
					: localize('customizationDiscovery.installLabel', "{0} {1}", install.label, item.displayName));
		install.element.setAttribute('aria-busy', String(isInstallActionBusy(state) && !cancellable));
		this.browseDisposables.add(install.onDidClick(() => cancellable
			? this.installService.cancelConnectorOperation(item)
			: setupUrl
				? void this.openExternal(setupUrl)
				: void this.install(item)));
		const actionError = getInstallActionError(state, installError);
		if (actionError) {
			this.browseDisposables.add(this.hoverService.setupDelayedHover(install.element, { content: actionError }));
		}
	}

	private async install(resource: ICustomizationMarketplaceResource): Promise<void> {
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		if (this.pendingInstalls.has(resourceKey) || this.installService.getInstallState(resource).kind !== 'available') {
			return;
		}
		const connector = isCopilotConnectorResource(resource);
		const query = this.query;
		const sourceId = this.selectedSourceId;
		this.pendingInstalls.add(resourceKey);
		this.installErrors.delete(resourceKey);
		status(connector
			? localize('customizationDiscovery.connectorConnectStarted', "Connecting {0}.", resource.displayName)
			: localize('customizationDiscovery.installStarted', "Installing {0}.", resource.displayName));
		this.render();
		try {
			const origin = !query.isEmpty()
				? 'search'
				: this.curatedSections?.some(section => section.items.some(item => getCustomizationMarketplaceResourceKey(item) === resourceKey))
					? 'curatedSection'
					: 'browseFallback';
			await this.installService.install(resource, origin);
			if (this._store.isDisposed) {
				return;
			}
			if (this.installService.getInstallState(resource).kind === 'installed') {
				status(connector
					? localize('customizationDiscovery.connectorConnectComplete', "Connected {0}.", resource.displayName)
					: localize('customizationDiscovery.installComplete', "Installed {0}.", resource.displayName));
			}
		} catch (error) {
			if (this._store.isDisposed) {
				return;
			}
			if (isCancellationError(error)) {
				status(connector
					? localize('customizationDiscovery.connectorConnectCancelled', "Connection cancelled for {0}.", resource.displayName)
					: localize('customizationDiscovery.installCancelled', "Installation cancelled for {0}.", resource.displayName));
			} else {
				const message = connector
					? localize('customizationDiscovery.connectorConnectFailed', "Could not connect {0}. {1}", resource.displayName, getErrorMessage(error))
					: localize('customizationDiscovery.installFailed', "Could not install {0}. {1}", resource.displayName, getErrorMessage(error));
				const currentContext = this.query === query && this.selectedSourceId === sourceId;
				if (currentContext) {
					this.installErrors.set(resourceKey, message);
				}
				if (this.visible && currentContext) {
					alert(message);
					void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
				} else {
					this.notificationService.error(message);
				}
			}
		} finally {
			this.pendingInstalls.delete(resourceKey);
			if (!this._store.isDisposed) {
				this.refreshInstalledItems();
				this.render();
			}
		}
	}

	private async repair(resource: ICustomizationMarketplaceResource): Promise<void> {
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		if (this.installService.getInstallState(resource).kind !== 'missing') {
			return;
		}
		const connector = isCopilotConnectorResource(resource);
		this.installErrors.delete(resourceKey);
		status(connector
			? localize('customizationDiscovery.connectorReconnectStarted', "Reconnecting {0}.", resource.displayName)
			: localize('customizationDiscovery.repairStarted', "Repairing {0}.", resource.displayName));
		this.render();
		try {
			await this.installService.repair(resource);
			if (this._store.isDisposed) {
				return;
			}
			if (this.installService.getInstallState(resource).kind === 'installed') {
				status(connector
					? localize('customizationDiscovery.connectorReconnectComplete', "Reconnected {0}.", resource.displayName)
					: localize('customizationDiscovery.repairComplete', "Repaired {0}.", resource.displayName));
			}
		} catch (error) {
			if (this._store.isDisposed) {
				return;
			}
			if (isCancellationError(error)) {
				status(connector
					? localize('customizationDiscovery.connectorReconnectCancelled', "Reconnection cancelled for {0}.", resource.displayName)
					: localize('customizationDiscovery.repairCancelled', "Repair cancelled for {0}.", resource.displayName));
			} else {
				const message = connector
					? localize('customizationDiscovery.connectorReconnectFailed', "Could not reconnect {0}. {1}", resource.displayName, getErrorMessage(error))
					: localize('customizationDiscovery.repairFailed', "Could not repair {0}. {1}", resource.displayName, getErrorMessage(error));
				this.installErrors.set(resourceKey, message);
				if (this.visible) {
					alert(message);
					void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
				} else {
					this.notificationService.error(message);
				}
			}
		} finally {
			if (!this._store.isDisposed) {
				this.refreshInstalledItems();
				this.render();
			}
		}
	}

	/** Explains why a plugin the organization requires cannot be uninstalled, or `undefined` when it can. */
	private getRequiredPluginMessage(uri: URI | undefined): string | undefined {
		return uri && this.requiredPluginUris.get().has(uri.toString()) ? getPluginManagedByOrganizationMessage() : undefined;
	}

	private getUninstallBlockedMessage(item: IInstalledDiscoveryItem): string | undefined {
		if (item.type !== 'plugin') {
			return undefined;
		}
		if (item.pluginDetail?.kind === AgentPluginItemKind.Installed) {
			return this.getRequiredPluginMessage(item.pluginDetail.plugin.uri);
		}
		const state = item.catalogResource ? this.getInstallState(item.catalogResource) : undefined;
		return this.getRequiredPluginMessage(state && hasInstallationTarget(state) && state.target.kind === 'plugin' ? state.target.uri : item.uri);
	}

	private async uninstall(item: IInstalledDiscoveryItem): Promise<void> {
		if (this.getUninstallBlockedMessage(item)) {
			return;
		}
		if (!item.catalogResource) {
			if (this.pendingDirectUninstalls.has(item.id)) {
				return;
			}
			this.pendingDirectUninstalls.add(item.id);
			this.render();
			try {
				if (item.type === 'plugin' && item.uri) {
					const plugin = this.pluginService.plugins.get().find(plugin => isEqual(plugin.uri, item.uri));
					if (plugin?.remove) {
						await plugin.remove();
					}
				} else if (item.type === 'mcp' && item.mcpServerId) {
					const server = this.mcpWorkbenchService.local.find(server => server.id === item.mcpServerId);
					if (server) {
						await this.mcpWorkbenchService.uninstall(server);
					}
				} else if (item.uri && item.promptType && item.source) {
					await this.commandService.executeCommand(DELETE_AI_CUSTOMIZATION_ID, {
						uri: item.uri,
						name: item.name,
						promptType: item.promptType,
						storage: item.source,
						itemId: item.itemId,
					});
				}
			} catch (error) {
				if (this._store.isDisposed) {
					return;
				}
				const message = localize('customizationDiscovery.uninstallFailed', "Could not uninstall {0}. {1}", item.name, getErrorMessage(error));
				if (this.visible) {
					alert(message);
					void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
				} else {
					this.notificationService.error(message);
				}
			} finally {
				this.pendingDirectUninstalls.delete(item.id);
				if (!this._store.isDisposed) {
					this.refreshInstalledItems();
					// The pending state is not part of the list entry, so an uninstall that leaves the item in place must re-render it fully.
					this.render();
				}
			}
			return;
		}
		await this.uninstallMarketplaceResource(item.catalogResource);
	}

	private async uninstallMarketplaceResource(resource: ICustomizationMarketplaceResource): Promise<void> {
		const connector = isCopilotConnectorResource(resource);
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		const state = this.installService.getInstallState(resource);
		if (this.pendingUninstalls.has(resourceKey) || state.kind !== 'installed' && state.kind !== 'missing' || state.target.kind === 'plugin' && this.getRequiredPluginMessage(state.target.uri)) {
			return;
		}
		const query = this.query;
		const sourceId = this.selectedSourceId;
		this.pendingUninstalls.add(resourceKey);
		this.installErrors.delete(resourceKey);
		status(connector
			? localize('customizationDiscovery.connectorDisconnectStarted', "Disconnecting {0}.", resource.displayName)
			: localize('customizationDiscovery.uninstallStarted', "Uninstalling {0}.", resource.displayName));
		this.render();
		try {
			await this.installService.uninstall(resource);
			if (this._store.isDisposed) {
				return;
			}
			if (this.installService.getInstallState(resource).kind === 'available') {
				status(connector
					? localize('customizationDiscovery.connectorDisconnectComplete', "Disconnected {0}.", resource.displayName)
					: localize('customizationDiscovery.uninstallComplete', "Uninstalled {0}.", resource.displayName));
			}
		} catch (error) {
			if (this._store.isDisposed) {
				return;
			}
			if (isCancellationError(error)) {
				status(connector
					? localize('customizationDiscovery.connectorDisconnectCancelled', "Disconnection cancelled for {0}.", resource.displayName)
					: localize('customizationDiscovery.uninstallCancelled', "Uninstallation cancelled for {0}.", resource.displayName));
			} else {
				const message = connector
					? localize('customizationDiscovery.connectorDisconnectFailed', "Could not disconnect {0}. {1}", resource.displayName, getErrorMessage(error))
					: localize('customizationDiscovery.uninstallFailed', "Could not uninstall {0}. {1}", resource.displayName, getErrorMessage(error));
				const currentContext = this.query === query && this.selectedSourceId === sourceId;
				if (currentContext) {
					this.installErrors.set(resourceKey, message);
				}
				if (this.visible && currentContext) {
					alert(message);
					void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
				} else {
					this.notificationService.error(message);
				}
			}
		} finally {
			this.pendingUninstalls.delete(resourceKey);
			if (!this._store.isDisposed) {
				this.refreshInstalledItems();
				this.render();
			}
		}
	}

	private getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState {
		const state = this.installService.getInstallState(resource);
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		if (this.pendingInstalls.has(resourceKey) && state.kind === 'available') {
			return { kind: 'installing' };
		}
		return this.pendingUninstalls.has(resourceKey) && (state.kind === 'installed' || state.kind === 'missing') ? { kind: 'uninstalling', target: state.target } : state;
	}

	private openMarketplaceItem(resource: ICustomizationMarketplaceResource, mode: ICustomizationMarketplaceOrigin['mode']): void {
		this.callbacks.openMarketplaceItem(resource, {
			resourceKey: getCustomizationMarketplaceResourceKey(resource),
			mode,
		});
	}

	private openCatalogItem(resource: ICustomizationMarketplaceResource, mode: ICustomizationMarketplaceOrigin['mode']): void {
		const type = getCatalogType(resource);
		const state = this.getInstallState(resource);
		if (type && state.kind === 'installed' && this.callbacks.openInstalled) {
			this.callbacks.openInstalled({
				section: getSectionForCatalogType(type),
				name: resource.displayName,
				uri: state.target.kind === 'skill' || state.target.kind === 'plugin' ? state.target.uri : undefined,
				mcpServerId: state.target.kind === 'mcp' ? state.target.id : undefined,
				mcpConnectorName: state.target.kind === 'copilotConnector' ? state.target.name : undefined,
			});
			return;
		}
		this.openMarketplaceItem(resource, mode);
	}

	private openInstalledItem(item: IInstalledDiscoveryItem): void {
		this.callbacks.openInstalled?.({
			section: item.section,
			name: item.name,
			uri: item.uri,
			mcpServerId: item.mcpServerId,
			mcpConnectorName: item.mcpConnectorName,
			promptDetail: item.promptDetail,
			pluginDetail: item.pluginDetail,
			mcpDetail: item.mcpDetail,
		});
	}

	private async openExternal(resource: URI | string): Promise<void> {
		try {
			await this.openerService.open(resource, { openExternal: true, allowCommands: false, allowContributedOpeners: false });
		} catch (error) {
			this.notificationService.error(localize('customizationDiscovery.openError', "Could not open the customization resource. {0}", getErrorMessage(error)));
		}
	}

	private updateSearchAriaLabel(): void {
		const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		const label = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.CustomizationDiscovery) && keybinding
			? localize('customizationDiscovery.searchWithHelp', "Search customizations. Use {0} for accessibility help.", keybinding)
			: localize('customizationDiscovery.searchLabel', "Search customizations");
		this.searchWidget.updateAriaLabel(label);
	}

	private announce(message: string): void {
		if (this.visible && message !== this.lastAnnouncement) {
			this.lastAnnouncement = message;
			status(message);
		}
	}

	private announceLoading(message: string): void {
		if (message === this.lastLoadingAnnouncement) {
			this.pendingLoadingAnnouncement = undefined;
			this.loadingAnnouncementScheduler.cancel();
		} else if (this.lastLoadingAnnouncement === undefined) {
			this.lastLoadingAnnouncement = message;
			this.announce(message);
		} else {
			this.pendingLoadingAnnouncement = message;
			if (!this.loadingAnnouncementScheduler.isScheduled()) {
				this.loadingAnnouncementScheduler.schedule();
			}
		}
	}

	private resetLoadingAnnouncement(): void {
		this.loadingAnnouncementScheduler.cancel();
		this.lastLoadingAnnouncement = undefined;
		this.pendingLoadingAnnouncement = undefined;
	}

	private getEntryAriaLabel(entry: DiscoveryListEntry): string {
		if (entry.kind === 'loading') {
			return this.getLoadingLabel();
		}
		if (entry.kind === 'installed') {
			if (entry.linkedConnectionRole === 'alternative' && !entry.alternativeExpanded) {
				return localize('customizationDiscovery.collapsedAlternativeAriaLabel', "1 alternative customization, collapsed");
			}
			const state = entry.catalogResource ? this.getInstallState(entry.catalogResource) : undefined;
			const stateLabel = state ? getInstallationStateLabel(state, isCopilotConnectorResource(entry.catalogResource)) : localize('customizationDiscovery.installed', "Installed");
			const stateDetail = state?.kind === 'error' ? localize('customizationDiscovery.verificationErrorDetail', ", {0}", state.message) : '';
			const verified = isVerifiedCopilotConnector(entry.catalogResource) ? localize('customizationDiscovery.verifiedAriaLabel', ", verified by GitHub") : '';
			const label = localize('customizationDiscovery.installedAriaLabel', "{0}, {1}, {2}{3}{4}{5}. {6}", entry.name, getTypeLabel(entry.type), `${stateLabel}${stateDetail}`, entry.sourceLabel ? localize('customizationDiscovery.sourceAriaLabel', ", source {0}", entry.sourceLabel) : '', verified, entry.disabled ? localize('customizationDiscovery.disabledAriaLabel', ", disabled") : '', entry.description);
			const uninstallBlockedMessage = this.getUninstallBlockedMessage(entry);
			return uninstallBlockedMessage ? localize('customizationDiscovery.installedManagedAriaLabel', "{0}. {1}", label, uninstallBlockedMessage) : label;
		}
		if (entry.linkedConnectionRole === 'alternative' && !entry.alternativeExpanded) {
			return localize('customizationDiscovery.collapsedAlternativeAriaLabel', "1 alternative customization, collapsed");
		}
		const type = getCatalogType(entry.resource);
		const state = this.getInstallState(entry.resource);
		const verified = isVerifiedCopilotConnector(entry.resource) ? localize('customizationDiscovery.verifiedAriaLabel', ", verified by GitHub") : '';
		return localize('customizationDiscovery.availableAriaLabel', "{0}, {1}, source {2}{3}. {4}. {5}", entry.resource.displayName, type ? getTypeLabel(type) : entry.resource.mediaType, this.getMarketplaceResourceLabel(entry.resource), verified, entry.resource.description, state.kind);
	}

	private isAlternativeExpanded(resource: ICustomizationMarketplaceResource): boolean {
		return this.expandedAlternatives.has(getCustomizationMarketplaceResourceKey(resource));
	}

	private toggleAlternative(item: IInstalledDiscoveryItem | ICatalogDiscoveryItem): void {
		const resource = item.kind === 'installed' ? item.catalogResource : item.resource;
		if (!resource) {
			return;
		}
		const key = getCustomizationMarketplaceResourceKey(resource);
		const expanded = !this.expandedAlternatives.delete(key);
		if (expanded) {
			this.expandedAlternatives.add(key);
		}
		this.renderSearchResults(true);
		for (let index = 0; index < this.resultList.length; index++) {
			if (this.resultList.element(index).id === item.id) {
				this.resultList.setFocus([index]);
				this.resultAlternativeActions.get(item.id)?.focus();
				break;
			}
		}
	}

	rebuildCards(visibleSectionIds: ReadonlySet<AICustomizationManagementSection>): void {
		this.visibleSectionIds = new Set(visibleSectionIds);
		this.refreshInstalledItems();
	}

	setHarnessLabel(_label: string): void {
		this.refreshInstalledItems();
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (!visible) {
			this.cancelCatalogRequest();
			this.render(true);
			return;
		}
		if (this.shouldQueryCatalog() && (this.pendingRecoveryReload || !this.loaded)) {
			this.pendingRecoveryReload = false;
			void this.loadCatalog(false);
		} else {
			this.render();
		}
		this.render();
		if (this.lastDimension) {
			DOM.getWindow(this.container).requestAnimationFrame(() => this.layout(this.lastDimension));
		}
	}

	focus(): void {
		this.searchWidget.focus();
	}

	reset(preserveFocus?: boolean): void {
		if (!preserveFocus) {
			this.focus();
		}
	}

	resetFilters(): void {
		if (this.query.isEmpty() && this.selectedSourceId === undefined) {
			this.focus();
			return;
		}
		this.selectedSourceId = undefined;
		this.updateSourceButton();
		this.setQuery(CustomizationDiscoveryQuery.parse(''));
	}

	setSearchQuery(value: string, preserveFocus?: boolean): void {
		this.setQuery(CustomizationDiscoveryQuery.parse(value), preserveFocus);
	}

	showMarketplace(query: string, sourceId: string | undefined, preserveFocus?: boolean): void {
		this.selectedSourceId = sourceId;
		this.updateSourceButton();
		this.setQuery(CustomizationDiscoveryQuery.parse(query), preserveFocus);
	}

	layout(dimension: DOM.Dimension | undefined): void {
		if (dimension) {
			this.lastDimension = dimension;
		}
		if (!this.lastDimension || this.container.offsetParent === null) {
			return;
		}
		const width = this.container.clientWidth || this.lastDimension.width;
		const height = this.container.clientHeight || this.lastDimension.height;
		this.container.classList.toggle('narrow', width < 800);
		const searchContainer = this.searchWidget.element;
		const searchActionsWidth = this.searchActionsContainer.offsetWidth;
		this.searchWidget.layout(new DOM.Dimension(Math.max(0, searchContainer.clientWidth - searchActionsWidth - 4), searchInputHeight));
		const availableHeight = Math.max(0, height - this.header.offsetHeight);
		this.resultListContainer.style.height = `${availableHeight}px`;
		const statusHeight = this.resultStatus.offsetHeight;
		this.resultList.layout(Math.max(0, availableHeight - statusHeight), this.resultListContainer.clientWidth);
		this.browseScrollable.scanDomNode();
		this.scheduleContinuationIfNeeded();
	}

	getAccessibilityContent(): string {
		const browsePresentation = this.getBrowsePresentation();
		const browseSections = this.query.isEmpty() && browsePresentation === 'curated'
			? [
				...(this.curatedSections?.filter(section => section.items.length > 0) ?? []),
				...(this.selectedSourceId ? [] : this.sourceSections),
			]
			: undefined;
		const searchResources = browseSections?.length
			? browseSections.flatMap(section => section.items.map<IPrioritizedMarketplaceResource>(resource => ({ resource })))
			: this.query.isEmpty() && !this.selectedSourceId && browsePresentation === undefined
				? []
				: this.getSearchMarketplaceResources();
		const collapsedAlternatives = searchResources.filter(({ resource, linkedConnectionRole }) =>
			linkedConnectionRole === 'alternative' && !this.isAlternativeExpanded(resource));
		const visibleSearchResources = searchResources.filter(({ resource, linkedConnectionRole }) =>
			linkedConnectionRole !== 'alternative' || this.isAlternativeExpanded(resource));
		const marketplaceInstallations = this.installService.installations.get();
		const recorded = visibleSearchResources
			.map(({ resource, linkedConnectionRole }) => ({ resource, linkedConnectionRole, state: this.getInstallState(resource) }))
			.filter(entry => hasInstallationTarget(entry.state));
		const recordedInstallations = new Set(searchResources.flatMap(({ resource }) => {
			const state = this.getInstallState(resource);
			if (!hasInstallationTarget(state)) {
				return [];
			}
			const installation = this.installService.findInstallation(resource) ?? marketplaceInstallations.findByTarget(state.target);
			return installation ? [getMarketplaceInstallationIdentity(installation, marketplaceInstallations)] : [];
		}));
		const installed = this.getFilteredInstalledItems().filter(item => {
			const marketplace = getInstalledItemMarketplaceRecord(item, marketplaceInstallations);
			return !marketplace || !recordedInstallations.has(getMarketplaceInstallationIdentity(marketplace, marketplaceInstallations));
		});
		const available = visibleSearchResources.filter(({ resource }) => {
			return this.matchesMarketplaceResource(resource) && !hasInstallationTarget(this.getInstallState(resource));
		});
		const sourceSectionIds = new Set(this.sourceSections.map(section => section.id));
		const marketplaceContent = browseSections?.length
			? browseSections.map(section => [
				section.title,
				sourceSectionIds.has(section.id) ? localize('customizationDiscovery.viewAllSourceAccessible', "View all customizations from {0}.", section.title) : undefined,
				...section.items.map(item => {
					const state = this.getInstallState(item);
					const type = getCatalogType(item);
					const stateLabel = hasInstallationTarget(state)
						? getInstallationStateLabel(state, isCopilotConnectorResource(item))
						: state.kind === 'unavailable'
							? state.message
							: localize('customizationDiscovery.available', "Available");
					return `${item.displayName}\n${[type ? getTypeLabel(type) : item.mediaType, this.getMarketplaceResourceLabel(item), stateLabel].filter(Boolean).join(' · ')}\n${item.description}`;
				}),
			].filter(Boolean).join('\n\n'))
			: [
				...recorded.map(({ resource, state }) => `${resource.displayName}\n${[getTypeLabel(getCatalogType(resource) ?? 'plugin'), this.getMarketplaceSourceLabel(resource.sourceId), !this.query.isEmpty() && isVerifiedCopilotConnector(resource) ? localize('customizationDiscovery.verifiedByGitHub', "Verified by GitHub") : undefined, getInstallationStateLabel(state, isCopilotConnectorResource(resource))].filter(Boolean).join(' · ')}\n${resource.description}${state.kind === 'error' ? `\n${state.message}` : state.kind === 'missing' && state.repairUnavailableMessage ? `\n${state.repairUnavailableMessage}` : ''}`),
				...available.map(({ resource }) => {
					const state = this.getInstallState(resource);
					const verifiedLabel = !this.query.isEmpty() && isVerifiedCopilotConnector(resource) ? localize('customizationDiscovery.verifiedByGitHub', "Verified by GitHub") : undefined;
					return `${resource.displayName}\n${[getTypeLabel(getCatalogType(resource) ?? 'plugin'), this.getMarketplaceResourceLabel(resource), verifiedLabel].filter(Boolean).join(' · ')}\n${resource.description}${state.kind === 'unavailable' && state.setupUrl ? `\n${localize('customizationDiscovery.manualSetupAccessible', "Manual setup required. View Setup opens the publisher's instructions.")}` : ''}`;
				}),
			];
		return [
			localize('customizationDiscovery.title', "Browse customizations"),
			this.query.isEmpty()
				? localize('customizationDiscovery.accessibleBrowse', "Browse mode.")
				: localize('customizationDiscovery.accessibleSearch', "Search: {0}", this.query.toString()),
			this.selectedSourceId
				? localize('customizationDiscovery.accessibleSource', "Source: {0}", this.getMarketplaceSourceLabel(this.selectedSourceId))
				: localize('customizationDiscovery.accessibleAllSources', "Source: All Sources"),
			this.loading ? this.getLoadingLabel() : undefined,
			this.errorMessage,
			this.sourceWarnings.getAccessibilityContent(),
			...collapsedAlternatives.map(() => getAlternativeDisclosureLabel()),
			...installed.map(item => `${item.name}\n${[getTypeLabel(item.type), item.sourceLabel, localize('customizationDiscovery.installed', "Installed")].filter(Boolean).join(' · ')}\n${item.description}`),
			...marketplaceContent,
		].filter(Boolean).join('\n\n');
	}

	restoreMarketplaceItemFocus(origin: ICustomizationMarketplaceOrigin): void {
		if (origin.mode === 'browse') {
			const action = this.browsePrimaryActions.get(origin.resourceKey);
			if (action) {
				action.focus();
				return;
			}
		} else {
			let index = -1;
			for (let candidateIndex = 0; candidateIndex < this.resultList.length; candidateIndex++) {
				const candidate = this.resultList.element(candidateIndex);
				if (candidate.kind === 'loading') {
					continue;
				}
				const resource = candidate.kind === 'available' ? candidate.resource : candidate.catalogResource;
				if (resource && getCustomizationMarketplaceResourceKey(resource) === origin.resourceKey) {
					index = candidateIndex;
					break;
				}
			}
			if (index >= 0) {
				this.resultList.reveal(index);
				this.resultList.setFocus([index]);
				this.resultList.setSelection([index]);
				this.resultList.domFocus();
				return;
			}
		}
		this.focus();
	}

	override dispose(): void {
		this.cancelCatalogRequest();
		this.progressBar.stop().hide();
		super.dispose();
	}
}
