/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { createInstantHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { customizationSearchMatchesAny } from '../../common/aiCustomizationSearch.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceInfo, ICustomizationMarketplaceManagementProvider } from '../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IMarketplaceReference, IPluginMarketplaceService, parseMarketplaceReference, parseMarketplaceReferences, readConfiguredMarketplaces } from '../../common/plugins/pluginMarketplaceService.js';
import { AddPluginMarketplaceAction } from '../actions/chatPluginActions.js';
import { CUSTOMIZATION_GROUP_HEADER_HEIGHT, CustomizationGroupHeaderRenderer, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeAriaLabel, getCustomizationTreeContentHeight } from './customizationTree.js';
import { isAgentFinderPublicFeedAvailable } from './customizationMarketplaceConfiguration.js';
import { getProviderMarketplaceSourceId } from './customizationMarketplaceWorkbenchService.js';
import { getTeamProvidedMarketplaceDescription, isTeamProvidedVisible } from './customizationTeamProvenance.js';
import { getPluginCustomizationMarketplaceNavigationSourceId, isPluginMarketplaceAvailableInDiscover } from './pluginCustomizationMarketplaceProvider.js';

interface IMarketplaceEntry {
	readonly type: 'marketplace';
	readonly id: string;
	readonly name: string;
	readonly source: string;
	readonly description: string;
	readonly removable: boolean;
	readonly available: boolean;
	readonly targetGeneration: number;
	readonly reference?: IMarketplaceReference;
	readonly provider?: ICustomizationMarketplaceManagementProvider;
	readonly sessionResource: URI;
}

type MarketplaceTreeEntry = IMarketplaceEntry | ICustomizationGroupHeaderEntry;

interface IMarketplaceTemplate {
	readonly name: HTMLElement;
	readonly source: HTMLElement;
	readonly description: HTMLElement;
	readonly toolbar: WorkbenchToolBar;
	readonly store: DisposableStore;
	readonly elementStore: DisposableStore;
}

export class PluginMarketplacesWidget extends Disposable {
	readonly element = DOM.$('.mcp-list-widget.plugin-marketplaces-widget');
	private readonly header: HTMLElement;
	private readonly search: InputBox;
	private readonly treeContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<MarketplaceTreeEntry>;
	private readonly message: HTMLElement;
	private readonly retry: Button;
	private readonly hoverDelegate = this._register(createInstantHoverDelegate());
	private entries: readonly IMarketplaceEntry[] = [];
	private visible = false;
	private generation = 0;
	private targetGeneration = 0;
	private loading = false;
	private loadError: string | undefined;
	private height = 0;
	private width = 0;
	private readonly pending = new Set<string>();

	constructor(
		private readonly goBack: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IPluginMarketplaceService private readonly marketplaceService: IPluginMarketplaceService,
		@IAgentPluginRepositoryService private readonly repositoryService: IAgentPluginRepositoryService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService openerService: IOpenerService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
		this.header = DOM.append(this.element, DOM.$('.section-title-header'));
		const titleRow = DOM.append(this.header, DOM.$('.section-title-row'));
		const backSlot = DOM.append(titleRow, DOM.$('.section-title-back-slot'));
		const backLabel = localize('marketplaces.back', "Back to Plugins");
		const back = DOM.append(backSlot, DOM.$<HTMLButtonElement>('button.editor-back-button', { type: 'button', 'aria-label': backLabel }));
		DOM.append(back, DOM.$(`.codicon.codicon-${Codicon.arrowLeft.id}`, { 'aria-hidden': 'true' }));
		this._register(this.hoverService.setupManagedHover(this.hoverDelegate, back, backLabel));
		this._register(DOM.addDisposableListener(back, DOM.EventType.CLICK, () => this.goBack()));
		DOM.append(titleRow, DOM.$('h2.section-title', {}, localize('marketplaces.title', "Marketplaces")));
		const actions = DOM.append(titleRow, DOM.$('.section-title-actions'));
		const browse = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true, small: true, hoverDelegate: this.hoverDelegate }));
		browse.label = localize('marketplaces.browseAll', "Browse All");
		this._register(browse.onDidClick(() => {
			void this.run(async () => {
				await this.commandService.executeCommand(AICustomizationManagementCommands.OpenMarketplace, { section: AICustomizationManagementSection.Plugins, searchQuery: '' });
			});
		}));
		const add = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true, small: true, hoverDelegate: this.hoverDelegate }));
		add.label = localize('marketplaces.add', "Add Marketplace");
		this._register(add.onDidClick(() => {
			void this.run(async () => { await this.commandService.executeCommand(AddPluginMarketplaceAction.ID); });
		}));
		const description = DOM.append(this.header, DOM.$('p.section-title-description', {}, localize('marketplaces.description', "Manage plugin marketplaces. Only add marketplaces you trust.")));
		description.appendChild(DOM.$('span', {}, ' '));
		const learnMoreUri = URI.parse('https://code.visualstudio.com/docs/agent-customization/agent-plugins');
		const learnMore = DOM.append(description, DOM.$('a.section-title-link', { href: learnMoreUri.toString() }, localize('marketplaces.learnMore', "Learn more")));
		this._register(DOM.addDisposableListener(learnMore, 'click', event => {
			event.preventDefault();
			void openerService.open(learnMoreUri);
		}));
		const searchRow = DOM.append(this.element, DOM.$('.list-search-and-button-container'));
		const searchContainer = DOM.append(searchRow, DOM.$('.list-search-container'));
		this.search = this._register(new InputBox(searchContainer, contextViewService, { inputBoxStyles: defaultInputBoxStyles, placeholder: localize('marketplaces.search', "Search marketplaces..."), ariaLabel: localize('marketplaces.searchLabel', "Search marketplaces") }));
		this.updateSearchAriaLabel();
		this._register(keybindingService.onDidUpdateKeybindings(() => this.updateSearchAriaLabel()));
		this._register(this.search.onDidChange(() => this.render()));
		this.message = DOM.append(this.element, DOM.$('.marketplaces-message'));
		this.message.setAttribute('role', 'status');
		this.retry = this._register(new Button(this.element, { ...defaultButtonStyles, secondary: true, small: true, hoverDelegate: this.hoverDelegate }));
		this.retry.label = localize('marketplaces.retry', "Retry");
		this.retry.element.style.display = 'none';
		this._register(this.retry.onDidClick(() => { void this.refresh(); }));
		this.treeContainer = DOM.append(this.element, DOM.$('.mcp-list-container.customization-tree-container'));
		const renderer: IListRenderer<IMarketplaceEntry, IMarketplaceTemplate> = {
			templateId: 'marketplace',
			renderTemplate: container => {
				container.classList.add('marketplace-list-item');
				const text = DOM.append(container, DOM.$('.marketplace-list-item-text'));
				const name = DOM.append(text, DOM.$('.marketplace-list-item-name'));
				const source = DOM.append(text, DOM.$('.marketplace-list-item-description'));
				const description = DOM.append(text, DOM.$('.marketplace-list-item-description'));
				const store = new DisposableStore();
				const elementStore = store.add(new DisposableStore());
				const toolbar = store.add(instantiationService.createInstance(WorkbenchToolBar, DOM.append(container, DOM.$('.marketplace-list-item-actions')), { hoverDelegate: this.hoverDelegate }));
				return { name, source, description, toolbar, store, elementStore };
			},
			renderElement: (entry, _index, template) => {
				template.elementStore.clear();
				template.name.textContent = entry.name;
				template.source.textContent = entry.source;
				template.description.textContent = entry.description;
				template.toolbar.setActions([], this.getActions(entry, template.elementStore));
				template.elementStore.add(this.hoverService.setupDelayedHoverAtMouse(template.name, { content: this.getEntryLabel(entry) }));
				template.elementStore.add(this.hoverService.setupDelayedHoverAtMouse(template.source, { content: entry.source }));
				template.elementStore.add(this.hoverService.setupDelayedHoverAtMouse(template.description, { content: entry.description }));
			},
			disposeElement: (_entry, _index, template) => template.elementStore.clear(),
			disposeTemplate: template => {
				template.store.dispose();
			},
		};
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<MarketplaceTreeEntry>, 'PluginMarketplaces', this.treeContainer,
			{ getHeight: entry => entry.type === 'group-header' ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : 64, getTemplateId: entry => entry.type === 'group-header' ? 'marketplaceGroup' : 'marketplace' },
			[asTreeRenderer(new CustomizationGroupHeaderRenderer('marketplaceGroup', hoverService)), asTreeRenderer(renderer)],
			{
				identityProvider: { getId: entry => `${entry.type}:${entry.id}` },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('marketplaces.listLabel', "Plugin marketplaces"),
					getAriaLabel: entry => entry.type === 'group-header' ? getCustomizationTreeAriaLabel(entry.label, entry.count, entry.collapsed) : this.getEntryLabel(entry),
				},
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: entry => entry.type === 'group-header' ? entry.label : entry.name },
				overrideStyles: customizationTreeStyles,
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				hideTwistiesOfChildlessElements: false,
			},
		));
		this._register(this.tree.onDidChangeCollapseState(event => {
			if (event.node.element?.type === 'group-header') {
				event.node.element.collapsed = event.node.collapsed;
				this.tree.rerender(event.node.element);
			}
		}));
		this._register(this.tree.onDidOpen(event => {
			const entry = event.element;
			if (entry?.type === 'marketplace' && entry.available && !this.pending.has(entry.id)) {
				void this.run(() => this.browse(entry));
			}
		}));
		this._register(this.tree.onContextMenu(event => {
			if (event.element?.type === 'marketplace') {
				const store = new DisposableStore();
				const actions = this.getActions(event.element, store);
				this.contextMenuService.showContextMenu({ getAnchor: () => event.anchor, getActions: () => actions, onHide: () => store.dispose() });
			}
		}));
		this._register(DOM.addDisposableListener(this.element, 'keydown', event => {
			if (event.key === 'Escape' && !event.defaultPrevented) {
				event.preventDefault();
				event.stopPropagation();
				this.goBack();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AccessibilityVerbositySettingId.CustomizationDiscovery)) {
				this.updateSearchAriaLabel();
			}
			if (event.affectsConfiguration(ChatConfiguration.PluginMarketplaces) ||
				event.affectsConfiguration(ChatConfiguration.ExtraMarketplaces) ||
				event.affectsConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled) ||
				event.affectsConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled)) {
				void this.refresh();
			}
		}));
		this._register(this.marketplaceService.onDidChangeMarketplaces(() => { void this.refresh(); }));
		this._register(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			const sessionResource = this.harnessService.activeSessionResource.read(reader);
			this.targetGeneration++;
			this.generation++;
			this.entries = [];
			this.loadError = undefined;
			this.loading = this.visible;
			this.render();
			const provider = this.harnessService.getDescriptorForSession(sessionResource)?.marketplaceManagementProvider;
			if (provider) {
				reader.store.add(provider.onDidChange(() => { void this.refresh(); }));
				reader.store.add(provider.onDidChangeMarketplaces(() => { void this.refresh(); }));
			}
			void this.refresh();
		}));
		const observer = this._register(new DOM.DisposableResizeObserver('PluginMarketplacesWidget', () => this.layout(this.height, this.width), DOM.getWindow(this.element)));
		this._register(observer.observe(this.header));
	}

	private getEntryLabel(entry: IMarketplaceEntry): string {
		return [entry.name, entry.source, entry.description].filter(Boolean).join('. ');
	}

	private updateSearchAriaLabel(): void {
		const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		this.search.setAriaLabel(this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.CustomizationDiscovery) && keybinding
			? localize('marketplaces.searchWithHelp', "Search marketplaces. Use {0} for accessibility help.", keybinding)
			: localize('marketplaces.searchLabel', "Search marketplaces"));
	}

	getAccessibilityContent(): string {
		return [localize('marketplaces.title', "Marketplaces"), ...this.filteredEntries().map(entry => this.getEntryLabel(entry)), this.message.textContent].filter(Boolean).join('\n\n');
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		this.element.style.display = visible ? '' : 'none';
		if (visible) {
			void this.refresh();
		} else {
			this.generation++;
		}
	}

	focus(): void {
		this.search.focus();
	}

	layout(height: number, width: number): void {
		this.height = height;
		this.width = width;
		if (this.visible) {
			this.element.style.height = `${height}px`;
			this.tree.layout(getCustomizationTreeContentHeight(this.element, this.treeContainer, height), width);
		}
	}

	async refresh(): Promise<void> {
		if (!this.visible) {
			return;
		}
		const generation = ++this.generation;
		if (!this.entries.length && !this.loadError) {
			this.loading = true;
			this.render();
		}
		const sessionResource = this.harnessService.activeSessionResource.get();
		const descriptor = this.harnessService.getDescriptorForSession(sessionResource);
		const provider = descriptor?.marketplaceManagementProvider;
		const githubFeedAvailable = isAgentFinderPublicFeedAvailable(this.marketplaceService, !!descriptor?.marketplaceSearchProvider);
		try {
			let entries: IMarketplaceEntry[];
			if (provider) {
				const marketplaces = await provider.list(sessionResource);
				entries = marketplaces.map(marketplace => ({
					type: 'marketplace', id: marketplace.name, name: marketplace.name, source: marketplace.source,
					description: this.describeProviderMarketplace(marketplace),
					removable: !marketplace.managed && !marketplace.isDefault, available: marketplace.available, targetGeneration: this.targetGeneration,
					provider, sessionResource,
				}));
			} else {
				const { effectiveValues, extraValues } = readConfiguredMarketplaces(this.configurationService);
				const managed = new Set(parseMarketplaceReferences(extraValues).map(reference => reference.canonicalId));
				const defaults = new Set(parseMarketplaceReferences(this.configurationService.inspect<readonly unknown[]>(ChatConfiguration.PluginMarketplaces)?.defaultValue ?? []).map(reference => reference.canonicalId));
				entries = parseMarketplaceReferences(effectiveValues).map(reference => {
					const available = !this.marketplaceService.isStrictMarketplacePolicyActive() || this.marketplaceService.isMarketplaceTrusted(reference);
					return {
						type: 'marketplace', id: reference.canonicalId, name: reference.displayLabel, source: reference.rawValue,
						description: [defaults.has(reference.canonicalId) ? localize('marketplaces.default', "Default") : '', managed.has(reference.canonicalId) ? localize('marketplaces.managed', "Managed by Organization") : '', !available ? localize('marketplaces.disabled', "Disabled by Organization") : ''].filter(Boolean).join(', '),
						removable: !managed.has(reference.canonicalId), available, targetGeneration: this.targetGeneration, reference, sessionResource,
					};
				});
			}
			if (generation !== this.generation || !this.visible) {
				return;
			}
			this.entries = entries.filter(entry => isPluginMarketplaceAvailableInDiscover(this.configurationService, entry.reference ?? entry.source, githubFeedAvailable));
			this.loading = false;
			this.loadError = undefined;
			this.render();
		} catch (error) {
			if (generation === this.generation && this.visible) {
				this.entries = [];
				this.loading = false;
				this.loadError = localize('marketplaces.loadFailed', "Failed to load marketplaces: {0}", getErrorMessage(error));
				this.render();
			}
		}
	}

	private describeProviderMarketplace(marketplace: ICustomizationMarketplaceInfo): string {
		return [
			marketplace.isDefault ? localize('marketplaces.default', "Default") : '',
			marketplace.managed ? localize('marketplaces.managed', "Managed by Organization") : '',
			isTeamProvidedVisible(marketplace.team, marketplace.managed) ? getTeamProvidedMarketplaceDescription() : '',
			!marketplace.available ? localize('marketplaces.unavailable', "Unavailable") : '',
		].filter(Boolean).join(', ');
	}

	private filteredEntries(): readonly IMarketplaceEntry[] {
		return this.entries.filter(entry => customizationSearchMatchesAny(this.search.value, [entry.name, entry.source, entry.description]));
	}

	private render(): void {
		const entries = this.filteredEntries();
		const previousGroup = this.tree.getNode(null).children[0]?.element;
		const collapsed = previousGroup ? this.tree.isCollapsed(previousGroup) : false;
		const group: ICustomizationGroupHeaderEntry = { type: 'group-header', id: 'user', label: localize('marketplaces.user', "User"), icon: Codicon.account, count: entries.length, isFirst: true, description: localize('marketplaces.userDescription', "Plugin marketplaces available to your user."), collapsed };
		this.tree.setChildren(null, entries.length ? [{ element: group, collapsible: true, collapsed, children: entries.map(element => ({ element })) }] : []);
		this.retry.element.style.display = this.loadError ? '' : 'none';
		this.message.textContent = this.loadError
			?? (entries.length ? '' : this.loading
				? localize('marketplaces.loading', "Loading marketplaces...")
				: this.search.value ? localize('marketplaces.noMatches', "No matching marketplaces.") : localize('marketplaces.empty', "No plugin marketplaces configured."));
		this.message.style.display = this.loadError || this.loading || !entries.length ? '' : 'none';
		this.layout(this.height, this.width);
	}

	private getActions(entry: IMarketplaceEntry, store: DisposableStore): IAction[] {
		const enabled = !this.pending.has(entry.id);
		const actions: IAction[] = [
			store.add(new Action('browse', localize('marketplaces.browse', "Browse"), undefined, enabled && entry.available, () => this.runForEntry(entry, () => this.browse(entry)))),
			store.add(new Action('refresh', localize('marketplaces.refresh', "Refresh Marketplace"), undefined, enabled && entry.available, () => this.runEntry(entry, async () => {
				if (entry.provider) {
					const failures = (await entry.provider.refresh(entry.sessionResource, entry.name)).filter(result => !result.success);
					if (failures.length) {
						throw new Error(failures.map(failure => failure.error ?? localize('marketplaces.unknownError', "Unknown error")).join('; '));
					}
				} else {
					const errors: string[] = [];
					await this.marketplaceService.fetchMarketplacePlugins(CancellationToken.None, new Set([entry.id]), {
						refresh: true,
						onMarketplaceError: (_reference, error) => errors.push(getErrorMessage(error)),
					});
					if (errors.length) {
						throw new Error(errors.join('; '));
					}
				}
				status(localize('marketplaces.refreshed', "Refreshed marketplace {0}.", entry.name));
			}))),
		];
		if (entry.reference) {
			actions.push(store.add(new Action('openFolder', localize('marketplaces.openFolder', "Open Folder"), undefined, enabled, () => this.runForEntry(entry, async () => {
				const uri = this.repositoryService.getRepositoryUri(entry.reference!);
				if (await this.fileService.exists(uri)) {
					await this.commandService.executeCommand('revealFileInOS', uri);
				} else {
					this.notificationService.info(localize('marketplaces.noFolder', "This marketplace has not been downloaded yet."));
				}
			}))));
		}
		if (entry.removable) {
			actions.push(new Separator(), store.add(new Action('remove', localize('marketplaces.remove', "Remove Marketplace"), undefined, enabled, () => this.runEntry(entry, () => this.remove(entry)))));
		}
		return actions;
	}

	private async browse(entry: IMarketplaceEntry): Promise<void> {
		if (!this.isCurrentEntry(entry)) {
			return;
		}
		await this.commandService.executeCommand(AICustomizationManagementCommands.OpenMarketplace, {
			section: AICustomizationManagementSection.Plugins, searchQuery: '',
			sourceId: entry.provider ? getProviderMarketplaceSourceId(entry.name) : getPluginCustomizationMarketplaceNavigationSourceId(this.configurationService, entry.reference!, isAgentFinderPublicFeedAvailable(this.marketplaceService, !!this.harnessService.getActiveDescriptor().marketplaceSearchProvider)),
		});
	}

	private async remove(entry: IMarketplaceEntry): Promise<void> {
		if (entry.provider) {
			const result = await entry.provider.remove(entry.sessionResource, entry.name);
			if (!result.removed) {
				const confirmation = await this.dialogService.confirm({
					type: 'warning',
					message: localize('marketplaces.forceRemove', "Remove marketplace '{0}' and uninstall its plugins?", entry.name),
					detail: result.dependentPlugins?.length ? localize('marketplaces.dependencies', "The following plugins depend on this marketplace and will be uninstalled:\n\n{0}", result.dependentPlugins.join('\n')) : localize('marketplaces.forceDetail', "The marketplace could not be removed normally. Forced removal may uninstall plugins from it."),
					primaryButton: localize('marketplaces.forceButton', "Remove Marketplace and Plugins"),
				});
				if (!confirmation.confirmed) {
					return;
				}
				if (!(await entry.provider.remove(entry.sessionResource, entry.name, true)).removed) {
					throw new Error(localize('marketplaces.removeFailed', "Marketplace '{0}' could not be removed.", entry.name));
				}
			}
		} else {
			const { userValues } = readConfiguredMarketplaces(this.configurationService);
			await this.configurationService.updateValue(ChatConfiguration.PluginMarketplaces, userValues.filter(value => typeof value !== 'string' || parseMarketplaceReference(value)?.canonicalId !== entry.id));
		}
		status(localize('marketplaces.removed', "Removed marketplace {0}.", entry.name));
	}

	private async runEntry(entry: IMarketplaceEntry, action: () => Promise<void>): Promise<void> {
		if (!this.isCurrentEntry(entry) || this.pending.has(entry.id)) {
			return;
		}
		this.pending.add(entry.id);
		this.render();
		try {
			await this.run(action);
		} finally {
			this.pending.delete(entry.id);
			await this.refresh();
		}
	}

	private async runForEntry(entry: IMarketplaceEntry, action: () => Promise<void>): Promise<void> {
		if (this.isCurrentEntry(entry)) {
			await this.run(action);
		}
	}

	private isCurrentEntry(entry: IMarketplaceEntry): boolean {
		return entry.targetGeneration === this.targetGeneration
			&& isEqual(entry.sessionResource, this.harnessService.activeSessionResource.get())
			&& entry.provider === this.harnessService.getDescriptorForSession(entry.sessionResource)?.marketplaceManagementProvider;
	}

	private async run(action: () => Promise<void>): Promise<void> {
		try {
			await action();
		} catch (error) {
			this.notificationService.error(getErrorMessage(error));
		}
	}

	override dispose(): void {
		this.generation++;
		this.visible = false;
		super.dispose();
	}
}
