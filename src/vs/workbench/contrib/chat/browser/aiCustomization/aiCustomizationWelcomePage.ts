/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { affectsCustomizationMarketplaceSources, getVisibleCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';
import { CustomizationMigrationCategoryId } from './customizationMigrationCategories.js';
import { IAICustomizationWorkspaceService, IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { URI } from '../../../../../base/common/uri.js';
import { AICustomizationDiscoveryPage } from './aiCustomizationDiscoveryPage.js';
import { PromptLaunchersAICustomizationWelcomePage } from './aiCustomizationWelcomePagePromptLaunchers.js';
import { IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { IMcpServerDetailInput } from './embeddedMcpServerDetail.js';
import { IAICustomizationListItem } from './aiCustomizationItemSource.js';

const $ = DOM.$;

/**
 * A migration flow offered on the overview, already resolved to display copy.
 */
export interface ICustomizationMigrationCategorySummary {
	readonly id: CustomizationMigrationCategoryId;
	readonly label: string;
	readonly description: string;
	readonly actionLabel: string;
	readonly actionAriaLabel: string;
	readonly count: number;
}

export interface IWelcomePageCallbacks {
	selectSection(section: AICustomizationManagementSection): void;
	selectSectionWithMarketplace(section: AICustomizationManagementSection): void;
	openInstalled?(target: {
		readonly section: AICustomizationManagementSection;
		readonly uri?: URI;
		readonly skillDetail?: IAICustomizationListItem;
		readonly pluginDetail?: IAgentPluginItem;
		readonly mcpDetail?: IMcpServerDetailInput;
	}): void;
	openMarketplaceItem(resource: ICustomizationMarketplaceResource, origin: ICustomizationMarketplaceOrigin): void;
	closeEditor(): void;
	reviewMigrations(): void;
	/**
	 * Prefill the chat input with a query. In the sessions window this
	 * uses the sessions chat widget; in core VS Code it opens the chat view.
	 *
	 * @param options.newChat When true, always opens a new chat instead of
	 * reusing the active one.
	 */
	prefillChat(query: string, options?: { isPartialQuery?: boolean; newChat?: boolean }): void;
}

export interface ICustomizationMarketplaceOrigin {
	readonly resourceKey: string;
	readonly mode: 'browse' | 'search';
}

export interface IAICustomizationWelcomePageImplementation extends IDisposable {
	readonly container: HTMLElement;
	rebuildCards(visibleSectionIds: ReadonlySet<AICustomizationManagementSection>): void;
	setHarnessLabel(label: string): void;
	setMigrationCategories?(categories: readonly ICustomizationMigrationCategorySummary[]): void;
	focus(): void;
	setVisible?(visible: boolean): void;
	layout?(dimension: DOM.Dimension | undefined): void;
	getAccessibilityContent?(): string;
	restoreMarketplaceItemFocus?(origin: ICustomizationMarketplaceOrigin): void;
	setSearchQuery?(value: string): void;
	reset?(): void;
}

/**
 * Renders the welcome page for the AI Customization Management Editor.
 */
export class AICustomizationWelcomePage extends Disposable {

	private readonly implementation = this._register(new MutableDisposable<IAICustomizationWelcomePageImplementation>());
	private readonly visibleSectionIds = new Set<AICustomizationManagementSection>();
	private migrationCategories: readonly ICustomizationMigrationCategorySummary[] = [];
	private dimension: DOM.Dimension | undefined;
	private visible = false;
	private discoverEnabled: boolean;

	readonly container: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly welcomePageFeatures: IWelcomePageFeatures | undefined,
		private readonly callbacks: IWelcomePageCallbacks,
		private harnessLabel: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomizationMarketplaceService private readonly marketplaceService: ICustomizationMarketplaceService,
		@ICommandService private readonly commandService: ICommandService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this.container = DOM.append(parent, $('.welcome-page-host'));
		this.container.style.height = '100%';
		this.container.style.overflow = 'hidden';
		this.discoverEnabled = this.isAnySourceEnabled();
		this.createImplementation();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (this.isMarketplaceConfigurationChange(event)) {
				this.updateImplementation();
			}
		}));
		if (this.marketplaceService.onDidChangeSources) {
			this._register(this.marketplaceService.onDidChangeSources(() => this.updateImplementation()));
		}
	}

	get isDiscover(): boolean {
		return this.isAnySourceEnabled();
	}

	isMarketplaceConfigurationChange(event: IConfigurationChangeEvent): boolean {
		return affectsCustomizationMarketplaceSources(event, this.marketplaceService.allSources ?? this.marketplaceService.sources);
	}

	private isAnySourceEnabled(): boolean {
		return getVisibleCustomizationMarketplaceSources(this.configurationService, this.marketplaceService.sources).length > 0;
	}

	private updateImplementation(): void {
		const discoverEnabled = this.isAnySourceEnabled();
		if (this.discoverEnabled === discoverEnabled) {
			return;
		}
		const hadFocus = this.container.contains(DOM.getActiveElement());
		this.implementation.clear();
		DOM.clearNode(this.container);
		this.discoverEnabled = discoverEnabled;
		this.createImplementation();
		if (hadFocus) {
			this.focus();
		}
	}

	private createImplementation(): void {
		this.implementation.value = this.discoverEnabled
			? this.instantiationService.createInstance(AICustomizationDiscoveryPage, this.container, this.welcomePageFeatures, this.callbacks, this.harnessLabel)
			: new PromptLaunchersAICustomizationWelcomePage(this.container, this.welcomePageFeatures, this.callbacks, this.commandService, this.workspaceService, this.hoverService, this.harnessLabel);
		this.implementation.value.rebuildCards(this.visibleSectionIds);
		this.implementation.value.setMigrationCategories?.(this.migrationCategories);
		this.implementation.value.setVisible?.(this.visible);
		this.implementation.value.layout?.(this.dimension);
	}

	rebuildCards(visibleSectionIds: ReadonlySet<AICustomizationManagementSection>): void {
		this.visibleSectionIds.clear();
		for (const id of visibleSectionIds) {
			this.visibleSectionIds.add(id);
		}
		this.implementation.value?.rebuildCards(this.visibleSectionIds);
	}

	setHarnessLabel(label: string): void {
		this.harnessLabel = label;
		this.implementation.value?.setHarnessLabel(label);
	}

	setMigrationCategories(categories: readonly ICustomizationMigrationCategorySummary[]): void {
		this.migrationCategories = categories;
		this.implementation.value?.setMigrationCategories?.(categories);
	}

	focus(): void {
		this.implementation.value?.focus();
	}

	reset(): void {
		this.implementation.value?.reset?.();
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.implementation.value?.setVisible?.(visible);
	}

	layout(dimension: DOM.Dimension | undefined): void {
		this.dimension = dimension;
		this.implementation.value?.layout?.(dimension);
	}

	getAccessibilityContent(): string {
		return this.implementation.value?.getAccessibilityContent?.() ?? '';
	}

	restoreMarketplaceItemFocus(origin: ICustomizationMarketplaceOrigin): void {
		const implementation = this.implementation.value;
		if (implementation?.restoreMarketplaceItemFocus) {
			implementation.restoreMarketplaceItemFocus(origin);
		} else {
			implementation?.focus();
		}
	}

	setSearchQuery(value: string): void {
		this.implementation.value?.setSearchQuery?.(value);
	}
}
