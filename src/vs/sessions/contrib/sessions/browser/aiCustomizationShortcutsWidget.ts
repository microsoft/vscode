/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAICustomizationItemsModel } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { CUSTOMIZATION_ITEMS } from './customizationsToolbar.contribution.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';

const $ = DOM.$;

const CUSTOMIZATIONS_COLLAPSED_KEY = 'agentSessions.customizationsCollapsed';

export interface IAICustomizationShortcutsWidgetOptions {
	readonly onDidChangeLayout?: () => void;
}

export class AICustomizationShortcutsWidget extends Disposable {

	private _headerButton: Button | undefined;

	constructor(
		container: HTMLElement,
		options: IAICustomizationShortcutsWidgetOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IMcpService private readonly mcpService: IMcpService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IAICustomizationItemsModel private readonly itemsModel: IAICustomizationItemsModel,
	) {
		super();

		this._render(container, options);
	}

	private _render(parent: HTMLElement, options: IAICustomizationShortcutsWidgetOptions | undefined): void {
		// Get initial collapsed state
		const isCollapsed = this.storageService.getBoolean(CUSTOMIZATIONS_COLLAPSED_KEY, StorageScope.PROFILE, false);

		const container = DOM.append(parent, $('.ai-customization-toolbar'));
		if (isCollapsed) {
			container.classList.add('collapsed');
		}

		// Header (clickable to toggle)
		const header = DOM.append(container, $('.ai-customization-header'));
		header.classList.toggle('collapsed', isCollapsed);

		const headerButtonContainer = DOM.append(header, $('.customization-link-button-container'));
		const headerButton = this._register(new Button(headerButtonContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		headerButton.element.classList.add('customization-link-button', 'sidebar-action-button');
		headerButton.element.setAttribute('aria-expanded', String(!isCollapsed));
		headerButton.label = localize('customizations', "Customizations");
		this._headerButton = headerButton;

		const chevronContainer = DOM.append(headerButton.element, $('span.customization-link-counts'));
		const chevron = DOM.append(chevronContainer, $('.ai-customization-chevron'));
		const headerTotalCount = DOM.append(chevronContainer, $('span.ai-customization-header-total.hidden'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(isCollapsed ? Codicon.chevronRight : Codicon.chevronDown));

		// Toolbar container
		const toolbarContainer = DOM.append(container, $('.ai-customization-toolbar-content.sidebar-action-list'));

		const toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SidebarCustomizations, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'sidebarCustomizations',
		}));

		// Re-layout when toolbar items change (e.g., Plugins item appearing after extension activation)
		this._register(toolbar.onDidChangeMenuItems(() => {
			options?.onDidChangeLayout?.();
		}));

		// Header total = sum of the same counts shown by each visible sidebar
		// link (CUSTOMIZATION_ITEMS). This guarantees the header value equals
		// the sum of the per-link badges by construction — and excludes
		// sections like Prompts that the editor exposes but the sidebar does
		// not surface.
		const totalCount = derived(reader => {
			let total = 0;
			for (const config of CUSTOMIZATION_ITEMS) {
				if (config.modelSection) {
					total += this.itemsModel.getCount(config.modelSection).read(reader);
				} else if (config.isMcp) {
					total += this.mcpService.servers.read(reader).length;
				} else if (config.isPlugins) {
					total += this.agentPluginService.plugins.read(reader).length;
				}
			}
			return total;
		});
		this._register(autorun(reader => {
			const value = totalCount.read(reader);
			headerTotalCount.classList.toggle('hidden', value === 0);
			headerTotalCount.textContent = `${value}`;
		}));

		// Toggle collapse on header click
		const transitionListener = this._register(new MutableDisposable());
		const toggleCollapse = () => {
			const collapsed = container.classList.toggle('collapsed');
			header.classList.toggle('collapsed', collapsed);
			this.storageService.store(CUSTOMIZATIONS_COLLAPSED_KEY, collapsed, StorageScope.PROFILE, StorageTarget.USER);
			headerButton.element.setAttribute('aria-expanded', String(!collapsed));
			chevron.classList.remove(...ThemeIcon.asClassNameArray(Codicon.chevronRight), ...ThemeIcon.asClassNameArray(Codicon.chevronDown));
			chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));

			// Re-layout after the transition
			transitionListener.value = DOM.addDisposableListener(toolbarContainer, 'transitionend', () => {
				transitionListener.clear();
				options?.onDidChangeLayout?.();
			});
		};

		this._register(headerButton.onDidClick(() => toggleCollapse()));
	}

	focus(): void {
		this._headerButton?.element.focus();
	}
}
