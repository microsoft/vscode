/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationDiscovery.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { alert, status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action, IAction, Separator, SubmenuAction } from '../../../../../base/common/actions.js';
import { equals } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage, isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceCursor, ICustomizationMarketplaceResource, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceError, ICustomizationMarketplaceSourceInfo } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { getEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { SuggestEnabledInput } from '../../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { IMcpWorkbenchService, McpServerInstallState } from '../../../mcp/common/mcpTypes.js';
import { CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService, IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { isPluginCustomizationItem } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IAICustomizationListItem } from './aiCustomizationItemSource.js';
import { IAICustomizationItemsModel, ITEMS_MODEL_SECTIONS, ItemsModelSection } from './aiCustomizationItemsModel.js';
import { DELETE_AI_CUSTOMIZATION_ID } from './aiCustomizationManagement.js';
import { getCustomizationDiscoveryQuerySuggestions, CustomizationDiscoveryQuery, CustomizationDiscoveryType } from './aiCustomizationQuery.js';
import { IAICustomizationWelcomePageImplementation, IWelcomePageCallbacks } from './aiCustomizationWelcomePage.js';
import { CustomizationMarketplaceSourceWarnings } from './customizationMarketplaceSourceWarnings.js';

const $ = DOM.$;
const searchDelay = 300;
const catalogPageSize = 24;
const maxFilteredCatalogPagesPerLoad = 8;
const leadingBrowseItemCount = 4;
const resultRowHeight = 56;
const searchInputHeight = 20;

type DiscoveryItemType = 'agent' | 'skill' | 'instructions' | 'prompt' | 'hook' | 'mcp' | 'plugin';

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
	readonly disabled?: boolean;
	readonly catalogKeys: readonly string[];
	readonly catalogResource?: ICustomizationMarketplaceResource;
}

interface ICatalogDiscoveryItem {
	readonly kind: 'available';
	readonly id: string;
	readonly resource: ICustomizationMarketplaceResource;
}

type DiscoveryListEntry = IInstalledDiscoveryItem | ICatalogDiscoveryItem;

interface ICatalogPageState {
	readonly items: readonly ICustomizationMarketplaceResource[];
	readonly nextCursor?: ICustomizationMarketplaceCursor;
	readonly sourceErrors?: readonly ICustomizationMarketplaceSourceError[];
}

interface IBrowseCatalogCache {
	readonly items: readonly ICustomizationMarketplaceResource[];
	readonly page: ICatalogPageState;
}

interface IDiscoveryRowTemplate {
	readonly root: HTMLElement;
	readonly icon: HTMLElement;
	readonly identity: HTMLElement;
	readonly name: HTMLElement;
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

function getCatalogKeys(resource: ICustomizationMarketplaceResource): readonly string[] {
	const type = getCatalogType(resource);
	if (!type) {
		return [];
	}
	const keys = new Set<string>([`${type}:name:${normalizedName(resource.displayName)}`]);
	const installation = resource.installation;
	if (installation?.kind === 'mcp') {
		keys.add(`mcp:name:${normalizedName(installation.name)}`);
	} else if (installation?.kind === 'skill') {
		const pathParts = installation.path.split('/').filter(Boolean);
		keys.add(`skill:name:${normalizedName(pathParts[pathParts.length - 1] ?? resource.displayName)}`);
		keys.add(`skill:source:${normalizedName(installation.repository)}:${normalizedName(installation.path)}`);
	} else if (installation?.kind === 'plugin') {
		keys.add(`plugin:source:${normalizedName(installation.repository)}:${normalizedName(installation.path)}`);
	}
	return [...keys];
}

function getCatalogMediaType(types: ReadonlySet<CustomizationDiscoveryType>): CustomizationMarketplaceMediaType | undefined {
	return types.size === 1 && types.has('skill') ? CustomizationMarketplaceMediaType.Skill
		: types.size === 1 && types.has('mcp') ? CustomizationMarketplaceMediaType.McpServer : undefined;
}

class DiscoveryListDelegate implements IListVirtualDelegate<DiscoveryListEntry> {
	getHeight(_element: DiscoveryListEntry): number {
		return resultRowHeight;
	}

	getTemplateId(_element: DiscoveryListEntry): string {
		return 'discoveryResult';
	}
}

class DiscoveryResultRenderer implements IListRenderer<IInstalledDiscoveryItem | ICatalogDiscoveryItem, IDiscoveryRowTemplate> {
	readonly templateId = 'discoveryResult';

	constructor(
		private readonly hoverService: IHoverService,
		private readonly getInstallState: (resource: ICustomizationMarketplaceResource) => CustomizationMarketplaceInstallState,
		private readonly getInstallError: (resource: ICustomizationMarketplaceResource) => string | undefined,
		private readonly getSourceLabel: (resource: ICustomizationMarketplaceResource) => string,
		private readonly onInstall: (resource: ICustomizationMarketplaceResource) => void,
		private readonly onUninstall: (item: IInstalledDiscoveryItem) => void,
		private readonly onOpen: (resource: URI | string) => void,
		private readonly isDirectUninstalling: (item: IInstalledDiscoveryItem) => boolean,
	) { }

	renderTemplate(container: HTMLElement): IDiscoveryRowTemplate {
		container.classList.add('customization-discovery-result-row');
		const root = DOM.append(container, $('.customization-discovery-result-content'));
		const icon = DOM.append(root, $('.customization-discovery-result-icon'));
		const identity = DOM.append(root, $('.customization-discovery-result-identity'));
		const heading = DOM.append(identity, $('.customization-discovery-result-heading'));
		const name = DOM.append(heading, $('a.customization-discovery-result-name'));
		const detail = DOM.append(heading, $('.customization-discovery-result-detail'));
		const description = DOM.append(identity, $('.customization-discovery-result-description'));
		const aside = DOM.append(root, $('.customization-discovery-result-aside'));
		const stats = DOM.append(aside, $('.customization-discovery-result-stats'));
		const actions = DOM.append(aside, $('.customization-discovery-result-actions'));
		return {
			root,
			icon,
			identity,
			name,
			detail,
			description,
			stats,
			actions,
			elementDisposables: new DisposableStore(),
			templateDisposables: new DisposableStore(),
		};
	}

	renderElement(element: IInstalledDiscoveryItem | ICatalogDiscoveryItem, _index: number, templateData: IDiscoveryRowTemplate): void {
		templateData.elementDisposables.clear();
		DOM.clearNode(templateData.icon);
		DOM.clearNode(templateData.stats);
		DOM.clearNode(templateData.actions);
		const installed = element.kind === 'installed';
		const name = installed ? element.name : element.resource.displayName;
		const description = installed ? element.description : element.resource.description;
		const type = installed ? element.type : getCatalogType(element.resource);
		const resource = installed ? element.catalogResource : element.resource;
		const detail = [
			type ? getTypeLabel(type) : !installed ? element.resource.mediaType : undefined,
			installed ? element.sourceLabel : this.getSourceLabel(element.resource),
			installed && element.disabled ? localize('customizationDiscovery.disabled', "Disabled") : undefined,
		].filter(Boolean).join(' · ');

		const fallback = DOM.append(templateData.icon, $('.codicon'));
		fallback.classList.add(...ThemeIcon.asClassNameArray(type === 'mcp' ? Codicon.server : type === 'plugin' ? Codicon.extensions : type === 'skill' ? Codicon.lightbulb : Codicon.file));
		fallback.setAttribute('aria-hidden', 'true');
		templateData.icon.classList.add('is-fallback');
		if (resource?.icon) {
			const image = DOM.append(templateData.icon, $('img')) as HTMLImageElement;
			image.alt = '';
			image.loading = 'lazy';
			image.referrerPolicy = 'no-referrer';
			templateData.elementDisposables.add(DOM.addDisposableListener(image, DOM.EventType.LOAD, () => {
				fallback.hidden = true;
				templateData.icon.classList.remove('is-fallback');
			}));
			templateData.elementDisposables.add(DOM.addDisposableListener(image, DOM.EventType.ERROR, () => image.remove()));
			image.src = resource.icon.toString(true);
		}

		templateData.name.textContent = name;
		templateData.name.removeAttribute('href');
		templateData.name.removeAttribute('rel');
		templateData.detail.textContent = detail;
		templateData.description.textContent = description;
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.name, { content: name }));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.description, { content: description }));

		if (!installed) {
			const externalResource = element.resource.externalUrl ?? element.resource.url;
			if (externalResource) {
				templateData.name.setAttribute('href', typeof externalResource === 'string' ? externalResource : externalResource.toString(true));
				templateData.name.setAttribute('rel', 'noopener noreferrer');
				templateData.elementDisposables.add(DOM.addDisposableListener(templateData.name, DOM.EventType.CLICK, event => {
					event.preventDefault();
					event.stopPropagation();
					this.onOpen(externalResource);
				}));
			}
			if (element.resource.stars !== undefined) {
				const starsLabel = localize('customizationDiscovery.stars', "{0} stars", element.resource.stars.toLocaleString());
				templateData.stats.setAttribute('aria-label', starsLabel);
				const star = DOM.append(templateData.stats, $('.codicon'));
				star.classList.add(...ThemeIcon.asClassNameArray(Codicon.starFull));
				star.setAttribute('aria-hidden', 'true');
				DOM.append(templateData.stats, $('span')).textContent = element.resource.stars.toLocaleString();
			} else {
				templateData.stats.removeAttribute('aria-label');
			}
			const state = this.getInstallState(element.resource);
			const installError = this.getInstallError(element.resource);
			const button = templateData.elementDisposables.add(new Button(templateData.actions, { ...defaultButtonStyles, secondary: true, small: true }));
			button.label = state.kind === 'installed'
				? localize('customizationDiscovery.installed', "Installed")
				: state.kind === 'installing'
					? localize('customizationDiscovery.installing', "Installing...")
					: installError
						? localize('customizationDiscovery.retryInstall', "Retry Install")
						: localize('customizationDiscovery.install', "Install");
			button.enabled = state.kind === 'available';
			button.setAriaLabel(state.kind === 'unavailable'
				? localize('customizationDiscovery.installUnavailable', "Install {0}. {1}", element.resource.displayName, state.message)
				: localize('customizationDiscovery.installLabel', "{0} {1}", button.label, element.resource.displayName));
			button.element.setAttribute('aria-busy', String(state.kind === 'installing'));
			templateData.elementDisposables.add(DOM.addDisposableListener(button.element, DOM.EventType.CLICK, event => event.stopPropagation()));
			templateData.elementDisposables.add(button.onDidClick(() => this.onInstall(element.resource)));
			if (state.kind === 'unavailable' || installError) {
				templateData.elementDisposables.add(this.hoverService.setupDelayedHover(button.element, { content: state.kind === 'unavailable' ? state.message : installError! }));
			}
		} else if (element.catalogResource || element.removable) {
			const state = element.catalogResource ? this.getInstallState(element.catalogResource) : this.isDirectUninstalling(element) ? { kind: 'uninstalling' } as const : { kind: 'installed' } as const;
			const uninstallError = element.catalogResource ? this.getInstallError(element.catalogResource) : undefined;
			const button = templateData.elementDisposables.add(new Button(templateData.actions, { ...defaultButtonStyles, secondary: true, small: true }));
			button.label = state.kind === 'uninstalling'
				? localize('customizationDiscovery.uninstalling', "Uninstalling...")
				: uninstallError
					? localize('customizationDiscovery.retryUninstall', "Retry Uninstall")
					: localize('customizationDiscovery.uninstall', "Uninstall");
			button.enabled = state.kind === 'installed';
			button.setAriaLabel(localize('customizationDiscovery.uninstallLabel', "{0} {1}", button.label, element.name));
			button.element.setAttribute('aria-busy', String(state.kind === 'uninstalling'));
			templateData.elementDisposables.add(DOM.addDisposableListener(button.element, DOM.EventType.CLICK, event => event.stopPropagation()));
			templateData.elementDisposables.add(button.onDidClick(() => this.onUninstall(element)));
			if (uninstallError) {
				templateData.elementDisposables.add(this.hoverService.setupDelayedHover(button.element, { content: uninstallError }));
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
	private readonly titleDescription: HTMLElement;
	private readonly searchWidget: SuggestEnabledInput;
	private readonly searchActionsContainer: HTMLElement;
	private readonly searchToolbar: WorkbenchToolBar;
	private readonly sourceButton: Button;
	private readonly sourceWarnings: CustomizationMarketplaceSourceWarnings;
	private readonly browseScrollable: DomScrollableElement;
	private readonly browseContent: HTMLElement;
	private readonly browseSections: HTMLElement;
	private readonly browseStatus: HTMLElement;
	private readonly resultListContainer: HTMLElement;
	private readonly resultList: WorkbenchList<DiscoveryListEntry>;
	private readonly resultStatus: HTMLElement;
	private readonly browseDisposables = this._register(new DisposableStore());
	private readonly resultStatusDisposables = this._register(new DisposableStore());
	private readonly descriptionDisposables = this._register(new DisposableStore());
	private readonly searchActionDisposables = this._register(new DisposableStore());
	private readonly sourceHover = this._register(new MutableDisposable());
	private readonly request = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly searchScheduler = this._register(new RunOnceScheduler(() => void this.loadCatalog(false), searchDelay));
	private catalogPage: ICatalogPageState | undefined;
	private enabledSourceIds: readonly string[];
	private readonly browseCatalogCache = new Map<string, IBrowseCatalogCache>();
	private readonly installErrors = new Map<string, string>();
	private readonly pendingInstalls = new Set<string>();
	private readonly pendingUninstalls = new Set<string>();
	private readonly pendingDirectUninstalls = new Set<string>();
	private query = CustomizationDiscoveryQuery.parse('');
	private installedItems: readonly IInstalledDiscoveryItem[] = [];
	private providerPlugins: readonly IInstalledDiscoveryItem[] = [];
	private catalogItems: readonly ICustomizationMarketplaceResource[] = [];
	private marketplaceSources: readonly ICustomizationMarketplaceSourceInfo[] = [];
	private selectedSourceId: string | undefined;
	private visibleSectionIds = new Set<AICustomizationManagementSection>();
	private visible = false;
	private pendingRecoveryReload = false;
	private loaded = false;
	private loading = false;
	private loadingMore = false;
	private errorMessage: string | undefined;
	private requestSequence = 0;
	private providerPluginSequence = 0;
	private lastDimension: DOM.Dimension | undefined;
	private lastAnnouncement: string | undefined;

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
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();
		this.enabledSourceIds = this.getEnabledCatalogSourceIds();

		this.container = DOM.append(parent, $('.customization-discovery'));
		const content = DOM.append(this.container, $('.customization-discovery-content'));
		const header = this.header = DOM.append(content, $('.customization-discovery-header'));
		const titleRow = DOM.append(header, $('.customization-discovery-title-row'));
		const title = DOM.append(titleRow, $('h2.customization-discovery-title'));
		title.textContent = localize('customizationDiscovery.title', "Discover customizations");
		this.createAddButton(titleRow);
		this.titleDescription = DOM.append(header, $('p.customization-discovery-description'));
		this.updateDescription();

		const searchRow = DOM.append(header, $('.customization-discovery-search-row'));
		const searchContainer = DOM.append(searchRow, $('.customization-discovery-search'));
		const placeholder = localize('customizationDiscovery.searchPlaceholder', "Search customizations");
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
		this.sourceButton = this._register(new Button(sourceContainer, { ...defaultButtonStyles, secondary: true, small: true }));
		this.updateSourceButton();
		this._register(this.sourceButton.onDidClick(() => this.showSourceMenu()));
		this.sourceWarnings = this._register(new CustomizationMarketplaceSourceWarnings(header, this.marketplaceService.sources, () => {
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
			resource => this.getMarketplaceSourceLabel(resource.sourceId),
			resource => void this.install(resource),
			item => void this.uninstall(item),
			resource => void this.openExternal(resource),
			item => this.pendingDirectUninstalls.has(item.id),
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
					getKeyboardNavigationLabel: entry => entry.kind === 'installed' ? entry.name : entry.resource.displayName,
				},
				multipleSelectionSupport: false,
				openOnSingleClick: true,
				horizontalScrolling: false,
			},
		));
		this._register(this.resultList.onDidOpen(event => {
			if (event.element?.kind === 'installed') {
				this.callbacks.openInstalled?.(event.element.section, event.element.uri);
			}
		}));
		this._register(this.searchWidget.onShouldFocusResults(() => this.resultList.domFocus()));
		this._register(this.resultList.onDidScroll(event => {
			if (!this.query.isEmpty() && !this.errorMessage && event.scrollHeight > event.height && event.scrollTop + event.height >= event.scrollHeight - resultRowHeight * 3) {
				void this.loadCatalog(true);
			}
		}));

		this._register(autorun(reader => {
			for (const section of ITEMS_MODEL_SECTIONS) {
				this.itemsModel.getItems(section).read(reader);
			}
			this.pluginService.plugins.read(reader);
			this.refreshInstalledItems();
		}));
		this._register(this.mcpWorkbenchService.onChange(() => this.refreshInstalledItems()));
		this._register(this.mcpWorkbenchService.onReset(() => this.refreshInstalledItems()));
		void this.mcpWorkbenchService.whenInitialLocalMcpServersLoaded.then(() => {
			if (!this._store.isDisposed) {
				this.refreshInstalledItems();
			}
		});
		this._register(this.installService.onDidChange(() => this.render()));
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
			if (this.marketplaceService.sources.some(source => event.affectsConfiguration(source.enablementSetting))) {
				this.updateSources();
				this.handleAvailabilityChanged();
			}
		}));
	}

	private updateSources(): void {
		this.marketplaceSources = getEnabledCustomizationMarketplaceSources(this.configurationService, this.marketplaceService.sources);
		if (this.selectedSourceId && !this.marketplaceSources.some(source => source.id === this.selectedSourceId)) {
			this.selectedSourceId = undefined;
		}
		this.updateSourceButton();
	}

	private updateSourceButton(): void {
		const selectedSource = this.marketplaceSources.find(source => source.id === this.selectedSourceId);
		const label = selectedSource ? selectedSource.displayName ?? selectedSource.id : localize('customizationDiscovery.allSources', "All sources");
		this.sourceButton.label = label;
		this.sourceButton.setAriaLabel(localize('customizationDiscovery.sourceButtonAriaLabel', "Customization source: {0}", label));
		this.sourceButton.element.removeAttribute('title');
		this.sourceHover.value = this.hoverService.setupDelayedHover(this.sourceButton.element, { content: label });
	}

	private showSourceMenu(): void {
		const disposables = new DisposableStore();
		const allSources = disposables.add(new Action(
			'customizationDiscovery.source.all',
			localize('customizationDiscovery.allSources', "All sources"),
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
			() => this.commandService.executeCommand('workbench.action.openSettings', 'marketplace'),
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
		this.updateSourceButton();
		this.cancelCatalogRequest();
		this.searchScheduler.cancel();
		this.resetCatalogState();
		this.errorMessage = undefined;
		this.resultList.scrollTop = 0;
		this.lastAnnouncement = undefined;
		this.render();
		if (this.shouldQueryCatalog() && !this.loaded) {
			void this.loadCatalog(false);
		}
	}

	private createAddButton(parent: HTMLElement): void {
		const addButton = this._register(new Button(parent, { ...defaultButtonStyles, secondary: true }));
		addButton.label = localize('customizationDiscovery.import', "Import");
		addButton.setAriaLabel(localize('customizationDiscovery.importLabel', "Import a customization"));
		this._register(addButton.onDidClick(() => {
			const disposables = new DisposableStore();
			const actions: IAction[] = [];
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Agents)) {
				actions.push(disposables.add(new Action('customizationDiscovery.newAgent', localize('customizationDiscovery.newAgent', "New Agent"), undefined, true, () => this.createCustomization(PromptsType.agent))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Skills)) {
				actions.push(disposables.add(new Action('customizationDiscovery.newSkill', localize('customizationDiscovery.newSkill', "New Skill"), undefined, true, () => this.createCustomization(PromptsType.skill))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Instructions)) {
				actions.push(disposables.add(new Action('customizationDiscovery.newInstructions', localize('customizationDiscovery.newInstructions', "New Instructions"), undefined, true, () => this.createCustomization(PromptsType.instructions))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Prompts)) {
				actions.push(disposables.add(new Action('customizationDiscovery.newPrompt', localize('customizationDiscovery.newPrompt', "New Prompt"), undefined, true, () => this.createCustomization(PromptsType.prompt))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.McpServers)) {
				actions.push(disposables.add(new Action('customizationDiscovery.addMcp', localize('customizationDiscovery.addMcp', "Add MCP Server"), undefined, true, () => this.callbacks.selectSection(AICustomizationManagementSection.McpServers))));
			}
			if (this.visibleSectionIds.has(AICustomizationManagementSection.Plugins)) {
				actions.push(disposables.add(new Action('customizationDiscovery.addPlugin', localize('customizationDiscovery.addPlugin', "Add Plugin"), undefined, true, () => this.callbacks.selectSectionWithMarketplace(AICustomizationManagementSection.Plugins))));
			}
			this.contextMenuService.showContextMenu({
				getAnchor: () => addButton.element,
				getActions: () => actions,
				onHide: () => disposables.dispose(),
			});
		}));
	}

	private createCustomization(type: PromptsType): Promise<void> {
		this.callbacks.closeEditor();
		return this.workspaceService.generateCustomization(type);
	}

	private updateDescription(): void {
		this.descriptionDisposables.clear();
		const sections = [
			AICustomizationManagementSection.Plugins,
			AICustomizationManagementSection.McpServers,
			AICustomizationManagementSection.Skills,
			AICustomizationManagementSection.Instructions,
			AICustomizationManagementSection.Agents,
			AICustomizationManagementSection.Hooks,
		] as const;
		const description = localize({
			key: 'customizationDiscovery.description',
			comment: [
				'Preserve the double square brackets: they mark the customization types that become links. Keep all six links in this order: Plugins, MCP Servers, Skills, Instructions, Agents, and Hooks.',
			],
		}, "Find new ways to extend your agent with [[Plugins]], [[MCP Servers]], [[Skills]], [[Instructions]], [[Agents]], and [[Hooks]].");
		renderFormattedText(description, {
			actionHandler: {
				callback: (index, event) => {
					event.preventDefault();
					const section = sections[Number(index)];
					if (section) {
						this.callbacks.selectSection(section);
					}
				},
				disposables: this.descriptionDisposables,
			},
		}, this.titleDescription);
		for (const link of this.titleDescription.children) {
			link.setAttribute('href', '#');
		}
	}

	private onQueryChanged(): void {
		const next = CustomizationDiscoveryQuery.parse(this.searchWidget.getValue());
		if (this.query.equals(next)) {
			return;
		}
		this.query = next;
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

	private setQuery(query: CustomizationDiscoveryQuery): void {
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
		this.searchWidget.focus();
	}

	private resetCatalogState(): void {
		const cached = this.query.isEmpty() ? this.browseCatalogCache.get(this.selectedSourceId ?? '') : undefined;
		this.catalogPage = cached?.page;
		if (cached) {
			this.catalogItems = cached.items;
			this.loaded = true;
		} else {
			this.catalogItems = [];
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
			[installed, new Separator(), mcp, plugins, skills],
			ThemeIcon.asClassName(Codicon.filter),
		));
		this.searchToolbar.setActions(actions);
	}

	private handleAvailabilityChanged(): void {
		const enabledSourceIds = this.getEnabledCatalogSourceIds();
		if (equals(this.enabledSourceIds, enabledSourceIds)) {
			return;
		}
		this.enabledSourceIds = enabledSourceIds;
		this.searchScheduler.cancel();
		this.cancelCatalogRequest();
		this.catalogPage = undefined;
		this.browseCatalogCache.clear();
		this.catalogItems = [];
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
					sourceLabel: getSourceLabel(item),
					type,
					section,
					uri: item.uri,
					source: item.source,
					promptType: item.promptType,
					itemId: item.id,
					removable: !item.isBuiltin && item.source !== 'extension' && item.source !== 'builtin',
					disabled: item.disabled,
					catalogKeys: type === 'skill' ? [`skill:name:${normalizedName(item.displayName ?? item.name)}`] : [],
				});
			}
		}

		if (this.visibleSectionIds.has(AICustomizationManagementSection.Plugins)) {
			for (const plugin of this.pluginService.plugins.get()) {
				const name = plugin.label || basename(plugin.uri);
				const source = plugin.fromMarketplace;
				const keys = [`plugin:name:${normalizedName(name)}`];
				const descriptor = source?.sourceDescriptor;
				if (descriptor?.kind === 'github') {
					keys.push(`plugin:source:${normalizedName(descriptor.repo)}:${normalizedName(descriptor.path ?? '')}`);
				}
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
					catalogKeys: keys,
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
					catalogKeys: [`mcp:name:${normalizedName(server.name)}`, `mcp:name:${normalizedName(server.label)}`],
				});
			}
		}

		this.installedItems = items;
		void this.refreshProviderPlugins();
		this.render();
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
				catalogKeys: [`plugin:name:${normalizedName(item.name)}`],
			}));
			this.render();
		} catch (error) {
			if (sequence === this.providerPluginSequence && !isCancellationError(error)) {
				this.notificationService.error(localize('customizationDiscovery.providerPluginsError', "Could not load installed plugins. {0}", getErrorMessage(error)));
			}
		}
	}

	private getFilteredInstalledItems(): readonly IInstalledDiscoveryItem[] {
		const text = normalizedName(this.query.text);
		const items = [...this.installedItems, ...this.providerPlugins];
		return items
			.filter(item => this.matchesType(item.type))
			.filter(item => !text || [item.name, item.description, item.sourceLabel, getTypeLabel(item.type)].some(value => value && normalizedName(value).includes(text)))
			.filter((item, index, allItems) => {
				if (item.catalogKeys.length === 0) {
					return true;
				}
				return allItems.findIndex(candidate => candidate.catalogKeys.some(key => item.catalogKeys.includes(key))) === index;
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	private matchesType(type: DiscoveryItemType): boolean {
		if (this.query.types.size === 0) {
			return true;
		}
		return type === 'skill' && this.query.types.has('skill')
			|| type === 'mcp' && this.query.types.has('mcp')
			|| type === 'plugin' && this.query.types.has('plugin');
	}

	private shouldQueryCatalog(): boolean {
		return this.visible && this.isCatalogEnabled() && !this.query.installed;
	}

	private isCatalogEnabled(): boolean {
		return this.getEnabledCatalogSourceIds().length > 0;
	}

	private getEnabledCatalogSourceIds(): readonly string[] {
		return this.entitlementService.sentiment.hidden ? []
			: getEnabledCustomizationMarketplaceSources(this.configurationService, this.marketplaceService.sources).map(source => source.id);
	}

	private hasNextCatalogPage(): boolean {
		return !this.query.installed && this.catalogPage?.nextCursor !== undefined;
	}

	private getMarketplaceSourceLabel(sourceId: string): string {
		const source = this.marketplaceSources.find(source => source.id === sourceId) ?? this.marketplaceService.sources.find(source => source.id === sourceId);
		return source?.displayName ?? sourceId;
	}

	private cancelCatalogRequest(): void {
		this.request.value?.cancel();
		this.request.clear();
		this.loading = false;
		this.loadingMore = false;
	}

	private async loadCatalog(append: boolean): Promise<void> {
		if (!this.shouldQueryCatalog() || (append && (this.loading || !this.hasNextCatalogPage()))) {
			return;
		}
		const sequence = ++this.requestSequence;
		this.cancelCatalogRequest();
		const request = new CancellationTokenSource();
		this.request.value = request;
		this.loading = true;
		this.loadingMore = append;
		this.errorMessage = undefined;
		this.lastAnnouncement = undefined;
		this.render();

		try {
			const backfill = !this.query.isEmpty() && this.query.types.size > 0 && getCatalogMediaType(this.query.types) === undefined;
			for (let pageCount = 0; pageCount < (backfill ? maxFilteredCatalogPagesPerLoad : 1); pageCount++) {
				const page = await this.marketplaceService.query({
					query: this.query.text || undefined,
					mediaType: getCatalogMediaType(this.query.types),
					sourceIds: this.selectedSourceId ? [this.selectedSourceId] : undefined,
					pageSize: catalogPageSize,
					cursor: append ? this.catalogPage?.nextCursor : undefined,
				}, request.token);
				if (sequence !== this.requestSequence || request.token.isCancellationRequested) {
					return;
				}
				this.catalogPage = {
					items: append ? [...(this.catalogPage?.items ?? []), ...page.items] : page.items,
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
				append = true;
				if (!backfill || !page.nextCursor || this.catalogItems.some(item => {
					const type = getCatalogType(item);
					return type !== undefined && this.matchesType(type);
				})) {
					break;
				}
			}
			this.loaded = true;
			if (this.query.isEmpty() && this.catalogPage) {
				this.browseCatalogCache.set(this.selectedSourceId ?? '', {
					items: this.catalogItems,
					page: this.catalogPage,
				});
			}
		} catch (error) {
			if (sequence !== this.requestSequence || isCancellationError(error)) {
				return;
			}
			this.loaded = true;
			this.errorMessage = getErrorMessage(error);
		} finally {
			if (this.request.value === request) {
				this.loading = false;
				this.request.clear();
				this.render();
			}
		}
	}

	private render(): void {
		this.sourceWarnings.update(this.catalogPage?.sourceErrors ?? [], this.loading);
		const searchMode = !this.query.isEmpty();
		this.browseScrollable.getDomNode().hidden = searchMode;
		this.resultListContainer.hidden = !searchMode;
		if (searchMode) {
			this.renderSearchResults();
		} else {
			this.renderBrowse();
		}
		this.layout(this.lastDimension);
	}

	private getLoadingLabel(): string {
		return this.loadingMore
			? localize('customizationDiscovery.loadingMore', "Loading more customizations...")
			: this.catalogItems.length ? localize('customizationDiscovery.reloading', "Reloading customizations...")
				: localize('customizationDiscovery.loading', "Loading customizations...");
	}

	private renderSearchResults(): void {
		this.resultStatusDisposables.clear();
		const installed = [...this.getFilteredInstalledItems()];
		const installedCatalog: IInstalledDiscoveryItem[] = [];
		const available: ICatalogDiscoveryItem[] = [];
		for (const resource of this.catalogItems) {
			const type = getCatalogType(resource);
			if (!type || !this.matchesType(type)) {
				continue;
			}
			const keys = getCatalogKeys(resource);
			const state = this.getInstallState(resource);
			const matchingInstalledIndex = installed.findIndex(item => item.catalogKeys.some(key => keys.includes(key)));
			if (matchingInstalledIndex >= 0) {
				const marketplaceInstalled = state.kind === 'installed' || state.kind === 'uninstalling';
				installed[matchingInstalledIndex] = {
					...installed[matchingInstalledIndex],
					sourceLabel: marketplaceInstalled ? this.getMarketplaceSourceLabel(resource.sourceId) : installed[matchingInstalledIndex].sourceLabel,
					catalogResource: marketplaceInstalled ? resource : undefined,
				};
				continue;
			}
			if (state.kind === 'installed' || state.kind === 'uninstalling') {
				installedCatalog.push({
					kind: 'installed',
					id: `installed:catalog:${getCustomizationMarketplaceResourceKey(resource)}`,
					name: resource.displayName,
					description: resource.description,
					sourceLabel: this.getMarketplaceSourceLabel(resource.sourceId),
					type,
					section: getSectionForCatalogType(type),
					catalogKeys: keys,
					catalogResource: resource,
				});
			} else {
				available.push({ kind: 'available', id: `available:${getCustomizationMarketplaceResourceKey(resource)}`, resource });
			}
		}

		const allInstalled = [...installed, ...installedCatalog];
		const entries: DiscoveryListEntry[] = this.query.installed ? allInstalled : [...allInstalled, ...available];
		this.resultList.splice(0, this.resultList.length, entries);

		const installError = this.installErrors.values().next().value;
		const catalogPending = this.loading || (!this.loaded && this.shouldQueryCatalog());
		if (installError) {
			this.resultStatus.textContent = installError;
		} else if (catalogPending && entries.length === 0) {
			this.resultStatus.textContent = this.getLoadingLabel();
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
		} else if (entries.length === 0 && this.sourceWarnings.hasWarnings) {
			this.resultStatus.textContent = localize('customizationDiscovery.sourcesUnavailable', "Available customizations could not be fully loaded. Retry an unavailable source.");
		} else if (entries.length === 0 && !this.sourceWarnings.hasErrors) {
			this.resultStatus.textContent = this.hasNextCatalogPage()
				? localize('customizationDiscovery.moreResultsPossible', "More catalog results may match this search.")
				: localize('customizationDiscovery.noResults', "No customizations match this search.");
		} else {
			this.resultStatus.textContent = catalogPending ? this.getLoadingLabel() : '';
		}
		if (!catalogPending && this.hasNextCatalogPage() && !this.errorMessage && this.resultList.scrollHeight <= this.resultList.renderHeight) {
			const loadMore = this.resultStatusDisposables.add(new Button(this.resultStatus, { ...defaultButtonStyles, secondary: true, small: true }));
			loadMore.label = localize('customizationDiscovery.loadMore', "Load More");
			this.resultStatusDisposables.add(loadMore.onDidClick(() => void this.loadCatalog(true)));
		}
		if (!catalogPending && !this.errorMessage) {
			this.announce([
				localize('customizationDiscovery.resultCount', "{0} customizations found.", entries.length),
				this.sourceWarnings.getAccessibilityContent(),
			].filter(Boolean).join('\n'));
		}
	}

	private renderBrowse(): void {
		this.browseDisposables.clear();
		DOM.clearNode(this.browseSections);
		if (!this.isCatalogEnabled()) {
			this.browseStatus.textContent = localize('customizationDiscovery.catalogDisabled', "Search your installed customizations, or enable a marketplace source to explore available items.");
			return;
		}
		if (this.loading && this.catalogItems.length === 0) {
			this.browseStatus.textContent = this.getLoadingLabel();
			return;
		}
		if (this.errorMessage && this.catalogItems.length === 0) {
			const message = localize('customizationDiscovery.error', "Could not load available customizations. {0}", this.errorMessage);
			this.browseStatus.textContent = message;
			this.announce(message);
			const retry = this.browseDisposables.add(new Button(this.browseStatus, { ...defaultButtonStyles, secondary: true, small: true }));
			retry.label = localize('customizationDiscovery.retry', "Retry");
			this.browseDisposables.add(retry.onDidClick(() => void this.loadCatalog(false)));
			return;
		}
		this.browseStatus.textContent = '';
		const leading = this.catalogItems.slice(0, leadingBrowseItemCount);
		const leadingIds = new Set(leading.map(getCustomizationMarketplaceResourceKey));
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
		for (const group of groups) {
			const items = this.catalogItems.filter(item => getCatalogType(item) === group.type && !leadingIds.has(getCustomizationMarketplaceResourceKey(item))).slice(0, leadingBrowseItemCount);
			if (items.length) {
				this.renderBrowseSection(group.label, items, group.type, false);
			}
		}
		if (this.loading) {
			this.browseStatus.textContent = this.getLoadingLabel();
		} else if (this.errorMessage) {
			const message = localize('customizationDiscovery.error', "Could not load available customizations. {0}", this.errorMessage);
			this.browseStatus.textContent = message;
			this.announce(message);
			const retry = this.browseDisposables.add(new Button(this.browseStatus, { ...defaultButtonStyles, secondary: true, small: true }));
			retry.label = localize('customizationDiscovery.retry', "Retry");
			this.browseDisposables.add(retry.onDidClick(() => void this.loadCatalog(false)));
		} else if (!this.catalogItems.length && this.loaded && this.sourceWarnings.hasWarnings) {
			this.browseStatus.textContent = localize('customizationDiscovery.sourcesUnavailable', "Available customizations could not be fully loaded. Retry an unavailable source.");
		} else if (!this.catalogItems.length && this.loaded && !this.sourceWarnings.hasErrors) {
			this.browseStatus.textContent = localize('customizationDiscovery.emptyCatalog', "No catalog customizations are available.");
		} else {
			this.browseStatus.textContent = this.installErrors.values().next().value ?? '';
		}
		if (!this.loading && this.sourceWarnings.hasErrors) {
			this.announce(this.sourceWarnings.getAccessibilityContent());
		}
	}

	private renderBrowseSection(label: string, items: readonly ICustomizationMarketplaceResource[], type: CustomizationDiscoveryType | undefined, elevated: boolean): void {
		const section = DOM.append(this.browseSections, $('.customization-discovery-section'));
		section.classList.toggle('featured', elevated);
		const header = DOM.append(section, $('.customization-discovery-section-header'));
		DOM.append(header, $('h3.customization-discovery-section-title')).textContent = label;
		if (type) {
			const showAll = DOM.append(header, $('button.customization-discovery-show-all')) as HTMLButtonElement;
			showAll.type = 'button';
			showAll.textContent = localize('customizationDiscovery.showAll', "Show All");
			this.browseDisposables.add(DOM.addDisposableListener(showAll, DOM.EventType.CLICK, () => this.setQuery(this.query.withType(type, true))));
		}
		const grid = DOM.append(section, $('.customization-discovery-grid'));
		for (const item of items) {
			this.renderBrowseCard(grid, item);
		}
	}

	private renderBrowseCard(parent: HTMLElement, item: ICustomizationMarketplaceResource): void {
		const card = DOM.append(parent, $('.customization-discovery-card'));
		const icon = DOM.append(card, $('.customization-discovery-card-icon'));
		const type = getCatalogType(item);
		const fallback = DOM.append(icon, $('.codicon'));
		fallback.classList.add(...ThemeIcon.asClassNameArray(type === 'mcp' ? Codicon.server : type === 'plugin' ? Codicon.extensions : Codicon.lightbulb));
		fallback.setAttribute('aria-hidden', 'true');
		icon.classList.add('is-fallback');
		if (item.icon) {
			const image = DOM.append(icon, $('img')) as HTMLImageElement;
			image.alt = '';
			image.loading = 'lazy';
			image.referrerPolicy = 'no-referrer';
			this.browseDisposables.add(DOM.addDisposableListener(image, DOM.EventType.LOAD, () => {
				fallback.hidden = true;
				icon.classList.remove('is-fallback');
			}));
			this.browseDisposables.add(DOM.addDisposableListener(image, DOM.EventType.ERROR, () => image.remove()));
			image.src = item.icon.toString(true);
		}
		const body = DOM.append(card, $('.customization-discovery-card-body'));
		const heading = DOM.append(body, $('.customization-discovery-card-heading'));
		const resource = item.externalUrl ?? item.url;
		const name = DOM.append(heading, resource ? $('a.customization-discovery-card-name') : $('.customization-discovery-card-name'));
		name.textContent = item.displayName;
		if (resource) {
			const link = name as HTMLAnchorElement;
			link.href = typeof resource === 'string' ? resource : resource.toString(true);
			link.rel = 'noopener noreferrer';
			this.browseDisposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, event => {
				event.preventDefault();
				void this.openExternal(resource);
			}));
		}
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
		const state = this.getInstallState(item);
		const installError = this.installErrors.get(getCustomizationMarketplaceResourceKey(item));
		const install = this.browseDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true, small: true }));
		install.label = state.kind === 'installed'
			? localize('customizationDiscovery.installed', "Installed")
			: state.kind === 'uninstalling'
				? localize('customizationDiscovery.uninstalling', "Uninstalling...")
				: state.kind === 'installing'
					? localize('customizationDiscovery.installing', "Installing...")
					: installError
						? localize('customizationDiscovery.retryInstall', "Retry Install")
						: localize('customizationDiscovery.install', "Install");
		install.enabled = state.kind === 'available';
		install.setAriaLabel(state.kind === 'unavailable'
			? localize('customizationDiscovery.installUnavailable', "Install {0}. {1}", item.displayName, state.message)
			: localize('customizationDiscovery.installLabel', "{0} {1}", install.label, item.displayName));
		install.element.setAttribute('aria-busy', String(state.kind === 'installing'));
		this.browseDisposables.add(install.onDidClick(() => void this.install(item)));
		if (state.kind === 'unavailable' || installError) {
			this.browseDisposables.add(this.hoverService.setupDelayedHover(install.element, { content: state.kind === 'unavailable' ? state.message : installError! }));
		}
	}

	private async install(resource: ICustomizationMarketplaceResource): Promise<void> {
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		if (this.pendingInstalls.has(resourceKey) || this.installService.getInstallState(resource).kind !== 'available') {
			return;
		}
		this.pendingInstalls.add(resourceKey);
		this.installErrors.delete(resourceKey);
		status(localize('customizationDiscovery.installStarted', "Installing {0}.", resource.displayName));
		this.render();
		try {
			await this.installService.install(resource);
			if (this.installService.getInstallState(resource).kind === 'installed') {
				status(localize('customizationDiscovery.installComplete', "Installed {0}.", resource.displayName));
			}
		} catch (error) {
			if (isCancellationError(error)) {
				status(localize('customizationDiscovery.installCancelled', "Installation cancelled for {0}.", resource.displayName));
			} else {
				const message = localize('customizationDiscovery.installFailed', "Could not install {0}. {1}", resource.displayName, getErrorMessage(error));
				this.installErrors.set(resourceKey, message);
				if (this.visible) {
					alert(message);
					void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
				} else {
					this.notificationService.error(message);
				}
			}
		} finally {
			this.pendingInstalls.delete(resourceKey);
			this.refreshInstalledItems();
			this.render();
		}
	}

	private async uninstall(item: IInstalledDiscoveryItem): Promise<void> {
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
				const message = localize('customizationDiscovery.uninstallFailed', "Could not uninstall {0}. {1}", item.name, getErrorMessage(error));
				if (this.visible) {
					alert(message);
					void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
				} else {
					this.notificationService.error(message);
				}
			} finally {
				this.pendingDirectUninstalls.delete(item.id);
				this.refreshInstalledItems();
			}
			return;
		}
		const resource = item.catalogResource;
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		if (this.pendingUninstalls.has(resourceKey) || this.installService.getInstallState(resource).kind !== 'installed') {
			return;
		}
		this.pendingUninstalls.add(resourceKey);
		this.installErrors.delete(resourceKey);
		status(localize('customizationDiscovery.uninstallStarted', "Uninstalling {0}.", resource.displayName));
		this.render();
		try {
			await this.installService.uninstall(resource);
			if (this.installService.getInstallState(resource).kind === 'available') {
				status(localize('customizationDiscovery.uninstallComplete', "Uninstalled {0}.", resource.displayName));
			}
		} catch (error) {
			if (isCancellationError(error)) {
				status(localize('customizationDiscovery.uninstallCancelled', "Uninstallation cancelled for {0}.", resource.displayName));
			} else {
				const message = localize('customizationDiscovery.uninstallFailed', "Could not uninstall {0}. {1}", resource.displayName, getErrorMessage(error));
				this.installErrors.set(resourceKey, message);
				if (this.visible) {
					alert(message);
					void this.accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed, { modality: 'sound' }).catch(onUnexpectedError);
				} else {
					this.notificationService.error(message);
				}
			}
		} finally {
			this.pendingUninstalls.delete(resourceKey);
			this.refreshInstalledItems();
			this.render();
		}
	}

	private getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState {
		const state = this.installService.getInstallState(resource);
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		if (this.pendingInstalls.has(resourceKey) && state.kind === 'available') {
			return { kind: 'installing' };
		}
		return this.pendingUninstalls.has(resourceKey) && state.kind === 'installed' ? { kind: 'uninstalling' } : state;
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

	private getEntryAriaLabel(entry: DiscoveryListEntry): string {
		if (entry.kind === 'installed') {
			return localize('customizationDiscovery.installedAriaLabel', "{0}, {1}, installed{2}{3}. {4}", entry.name, getTypeLabel(entry.type), entry.sourceLabel ? localize('customizationDiscovery.sourceAriaLabel', ", source {0}", entry.sourceLabel) : '', entry.disabled ? localize('customizationDiscovery.disabledAriaLabel', ", disabled") : '', entry.description);
		}
		const type = getCatalogType(entry.resource);
		const state = this.getInstallState(entry.resource);
		return localize('customizationDiscovery.availableAriaLabel', "{0}, {1}, source {2}. {3}. {4}", entry.resource.displayName, type ? getTypeLabel(type) : entry.resource.mediaType, this.getMarketplaceSourceLabel(entry.resource.sourceId), entry.resource.description, state.kind);
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
			return;
		}
		if (this.shouldQueryCatalog() && (this.pendingRecoveryReload || !this.loaded)) {
			this.pendingRecoveryReload = false;
			void this.loadCatalog(false);
		}
		if (this.lastDimension) {
			DOM.getWindow(this.container).requestAnimationFrame(() => this.layout(this.lastDimension));
		}
	}

	focus(): void {
		this.searchWidget.focus();
	}

	reset(): void {
		this.focus();
	}

	setSearchQuery(value: string): void {
		this.setQuery(CustomizationDiscoveryQuery.parse(value));
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
	}

	getAccessibilityContent(): string {
		const installed = this.getFilteredInstalledItems();
		const available = this.catalogItems.filter(item => {
			const type = getCatalogType(item);
			const state = this.getInstallState(item);
			return type && this.matchesType(type) && state.kind !== 'installed' && state.kind !== 'uninstalling';
		});
		return [
			localize('customizationDiscovery.title', "Discover customizations"),
			this.query.isEmpty()
				? localize('customizationDiscovery.accessibleBrowse', "Browse mode.")
				: localize('customizationDiscovery.accessibleSearch', "Search: {0}", this.query.toString()),
			this.selectedSourceId
				? localize('customizationDiscovery.accessibleSource', "Source: {0}", this.getMarketplaceSourceLabel(this.selectedSourceId))
				: localize('customizationDiscovery.accessibleAllSources', "Source: All sources"),
			this.loading ? this.getLoadingLabel() : undefined,
			this.errorMessage,
			this.sourceWarnings.getAccessibilityContent(),
			...installed.map(item => `${item.name}\n${[getTypeLabel(item.type), item.sourceLabel, localize('customizationDiscovery.installed', "Installed")].filter(Boolean).join(' · ')}\n${item.description}`),
			...available.map(item => `${item.displayName}\n${getTypeLabel(getCatalogType(item) ?? 'plugin')} · ${this.getMarketplaceSourceLabel(item.sourceId)}\n${item.description}`),
		].filter(Boolean).join('\n\n');
	}

	override dispose(): void {
		this.cancelCatalogRequest();
		super.dispose();
	}
}
