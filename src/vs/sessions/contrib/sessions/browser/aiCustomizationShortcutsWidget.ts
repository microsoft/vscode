/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { IAICustomizationItemsModel } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { readTotalCustomizationCount } from './customizationsToolbar.contribution.js';
import { Menus } from '../../../browser/menus.js';
import { IAICustomizationMcpServerCountService } from './customizationMcpServerCount.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IAgentHostToolSetEnablementService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getExtensionSuggestionsBadgeDescription, IAgentsWindowExtensionSuggestionsService } from '../../extensions/browser/agentsWindowExtensionSuggestions.js';
const $ = DOM.$;
const CUSTOMIZATIONS_VERTICAL_PADDING = 6;
const CUSTOMIZATIONS_COLLAPSED_STORAGE_KEY = 'agentSessions.customizationsShortcuts.collapsed';

export interface IAICustomizationShortcutsWidgetOptions {
	readonly onDidChangeLayout?: () => void;
}

export class AICustomizationShortcutsWidget extends Disposable {

	private _renderDisposables = this._register(new DisposableStore());
	private _wrapper: HTMLElement | undefined;
	private _options: IAICustomizationShortcutsWidgetOptions | undefined;
	private _scrollableElement: DomScrollableElement | undefined;
	private _toolbar: MenuWorkbenchToolBar | undefined;
	private _headerElement: HTMLElement | undefined;
	private _headerTotalCountElement: HTMLElement | undefined;
	private _headerSuggestionBadgeElement: HTMLElement | undefined;
	private _headerSuggestionHover: MutableDisposable<IDisposable> | undefined;
	private _chevronElement: HTMLElement | undefined;
	private _toolbarContentElement: HTMLElement | undefined;
	private _scrollableDomNode: HTMLElement | undefined;
	private _rootVerticalPadding = 0;
	private _headerTotalCount = 0;
	private _showExtensionSuggestionsBadge = false;
	private _collapsed = false;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly _onDidToggleCollapsed = this._register(new Emitter<boolean>());
	readonly onDidToggleCollapsed = this._onDidToggleCollapsed.event;

	get collapsed(): boolean {
		return this._collapsed;
	}

	get collapsedHeight(): number {
		const headerHeight = this._headerElement?.offsetHeight ?? 30;
		return this._rootVerticalPadding + headerHeight;
	}

	constructor(
		container: HTMLElement,
		options: IAICustomizationShortcutsWidgetOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAICustomizationMcpServerCountService private readonly mcpServerCountService: IAICustomizationMcpServerCountService,
		@IAICustomizationItemsModel private readonly itemsModel: IAICustomizationItemsModel,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IStorageService private readonly storageService: IStorageService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService private readonly toolEnablementService: IAgentHostToolSetEnablementService,
		@IAgentsWindowExtensionSuggestionsService private readonly extensionSuggestionsService: IAgentsWindowExtensionSuggestionsService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this._collapsed = this.storageService.getBoolean(CUSTOMIZATIONS_COLLAPSED_STORAGE_KEY, StorageScope.PROFILE, false);

		// Stable wrapper appended once to the parent. Re-renders replace the
		// wrapper's children only, so the widget keeps its position relative
		// to sibling parts (e.g. the agent-host-toolbar below it). Without
		// this, removing+re-appending the rendered root would move it to the
		// end of the parent on every re-render, stacking adjacent border-tops.
		this._wrapper = DOM.append(container, $('.ai-customization-shortcuts-widget'));
		this._options = options;
		this._renderForCurrentMode();
	}

	private _renderForCurrentMode(): void {
		if (!this._wrapper) {
			return;
		}
		this._renderDisposables.clear();
		this._scrollableElement = undefined;
		this._toolbar = undefined;
		this._headerElement = undefined;
		this._headerTotalCountElement = undefined;
		this._headerSuggestionBadgeElement = undefined;
		this._headerSuggestionHover = undefined;
		this._chevronElement = undefined;
		this._toolbarContentElement = undefined;
		this._scrollableDomNode = undefined;
		this._rootVerticalPadding = 0;
		this._headerTotalCount = 0;
		DOM.clearNode(this._wrapper);
		this._render(this._wrapper, this._options);
		this._setCollapsed(this._collapsed);
	}

	private _totalCount() {
		return derived(reader => readTotalCustomizationCount(
			reader,
			this.itemsModel,
			this.mcpServerCountService,
			this.toolsService,
			this.toolEnablementService,
			this.harnessService,
		));
	}

	private _render(parent: HTMLElement, options: IAICustomizationShortcutsWidgetOptions | undefined): void {
		const container = DOM.append(parent, $('.ai-customization-toolbar'));
		this._setRootPadding(container, CUSTOMIZATIONS_VERTICAL_PADDING, CUSTOMIZATIONS_VERTICAL_PADDING);

		// Header
		const header = DOM.append(container, $('.ai-customization-header'));
		this._headerElement = header;
		header.setAttribute('role', 'button');
		header.setAttribute('aria-expanded', 'true');
		header.tabIndex = 0;

		const headerLabel = DOM.append(header, $('span.ai-customization-header-label'));
		headerLabel.textContent = localize('customizations', "Customizations");
		this._headerTotalCountElement = DOM.append(header, $('span.ai-customization-header-total-count.hidden'));
		this._headerSuggestionBadgeElement = DOM.append(header, $('span.ai-customization-suggestion-badge.hidden', { role: 'img', 'aria-label': getExtensionSuggestionsBadgeDescription() }));
		this._headerSuggestionHover = this._renderDisposables.add(new MutableDisposable());

		this._chevronElement = DOM.append(header, $('span.ai-customization-chevron'));
		this._chevronElement.setAttribute('aria-hidden', 'true');
		this._updateChevron();

		const totalCount = this._totalCount();
		this._renderDisposables.add(autorun(reader => {
			this._headerTotalCount = totalCount.read(reader);
			this._renderHeaderTotalCount();
		}));
		// The header shows the badge while collapsed, otherwise the Extensions item shows it.
		this._renderDisposables.add(autorun(reader => {
			this._showExtensionSuggestionsBadge = this.extensionSuggestionsService.showBadge.read(reader);
			this._renderHeaderSuggestionBadge();
		}));

		this._renderDisposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, () => this._toggleCollapsed()));
		this._renderDisposables.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._toggleCollapsed();
			}
		}));

		// Toolbar container
		const scrollContent = $('.ai-customization-toolbar-content-scrollable');
		const toolbarContainer = DOM.append(scrollContent, $('.ai-customization-toolbar-content.sidebar-action-list'));
		this._toolbarContentElement = toolbarContainer;
		const scrollableElement = this._renderDisposables.add(new DomScrollableElement(scrollContent, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		this._scrollableElement = scrollableElement;
		this._scrollableDomNode = DOM.append(container, scrollableElement.getDomNode());

		const toolbar = this._renderDisposables.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SidebarCustomizations, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'sidebarCustomizations',
		}));
		this._toolbar = toolbar;

		// Re-layout when toolbar items change (e.g., Plugins item appearing after extension activation)
		this._renderDisposables.add(toolbar.onDidChangeMenuItems(() => {
			this._scrollableElement?.scanDomNode();
			this._onDidChangeHeight.fire();
			options?.onDidChangeLayout?.();
		}));
	}

	get desiredHeight(): number {
		const content = this._toolbarContentElement;
		if (!content) {
			return 0;
		}
		if (this._collapsed) {
			return this.collapsedHeight;
		}

		const headerHeight = this._headerElement?.offsetHeight ?? 0;
		const height = Math.ceil(this._rootVerticalPadding + headerHeight + content.scrollHeight);
		return Number.isFinite(height) ? height : 0;
	}

	private _setRootPadding(element: HTMLElement, top: number, bottom: number): void {
		element.style.padding = `${top}px 0 ${bottom}px 0`;
		this._rootVerticalPadding = top + bottom;
	}

	private _toggleCollapsed(): void {
		this._setCollapsed(!this._collapsed);
		this.storageService.store(CUSTOMIZATIONS_COLLAPSED_STORAGE_KEY, this._collapsed, StorageScope.PROFILE, StorageTarget.USER);
		this._onDidToggleCollapsed.fire(this._collapsed);
		this._onDidChangeHeight.fire();
	}

	private _setCollapsed(collapsed: boolean): void {
		if (collapsed && this._scrollableDomNode?.contains(DOM.getActiveElement())) {
			this._headerElement?.focus();
		}
		this._collapsed = collapsed;
		this._headerElement?.classList.toggle('collapsed', collapsed);
		this._headerElement?.setAttribute('aria-expanded', String(!collapsed));
		if (this._scrollableDomNode) {
			this._scrollableDomNode.style.display = collapsed ? 'none' : '';
		}
		this._updateChevron();
		this._renderHeaderTotalCount();
		this._renderHeaderSuggestionBadge();
	}

	private _updateChevron(): void {
		if (!this._chevronElement) {
			return;
		}
		this._chevronElement.className = 'ai-customization-chevron';
		this._chevronElement.classList.add(...ThemeIcon.asClassNameArray(this._collapsed ? Codicon.chevronRight : Codicon.chevronDown));
	}

	private _renderHeaderTotalCount(): void {
		if (!this._headerTotalCountElement) {
			return;
		}
		this._headerTotalCountElement.textContent = this._headerTotalCount > 0 ? `${this._headerTotalCount}` : '';
		this._headerTotalCountElement.classList.toggle('hidden', !this._collapsed || this._headerTotalCount === 0);
	}

	private _renderHeaderSuggestionBadge(): void {
		if (!this._headerElement || !this._headerSuggestionBadgeElement || !this._headerSuggestionHover) {
			return;
		}
		const visible = this._collapsed && this._showExtensionSuggestionsBadge;
		const currentlyVisible = !this._headerSuggestionBadgeElement.classList.contains('hidden');
		if (visible === currentlyVisible) {
			return;
		}
		this._headerSuggestionBadgeElement.classList.toggle('hidden', !visible);
		this._headerSuggestionHover.value = visible
			? this.hoverService.setupDelayedHover(this._headerElement, { content: getExtensionSuggestionsBadgeDescription() })
			: undefined;
	}

	layout(_height: number, _width: number): void {
		if (this._collapsed) {
			return;
		}
		this._scrollableElement?.scanDomNode();
	}

	focus(): void {
		if (this._collapsed) {
			this._headerElement?.focus();
			return;
		}
		this._toolbar?.focus();
	}

	hasFocus(): boolean {
		return !!this._wrapper && DOM.isAncestorOfActiveElement(this._wrapper);
	}
}
