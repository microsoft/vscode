/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
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
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { CUSTOMIZATION_ITEMS } from './customizationsToolbar.contribution.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';

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
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IEditorService private readonly editorService: IEditorService,
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

		const headerActions = DOM.append(header, $('.ai-customization-header-actions'));
		const openOverviewLabel = localize('openCustomizationsOverview', "Open Customizations Overview");
		const openOverviewButton = this._register(new Button(headerActions, {
			...defaultButtonStyles,
			secondary: true,
			title: openOverviewLabel,
			ariaLabel: openOverviewLabel,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		openOverviewButton.element.classList.add('ai-customization-overview-button');
		openOverviewButton.label = `$(${Codicon.home.id})`;
		this._register(openOverviewButton.onDidClick(e => {
			e?.preventDefault();
			this._openWelcomePage();
		}));

		// Chevron at far right (outside the link button so it sits to the
		// right of the home overview action). Clicking the chevron toggles
		// collapse — same as clicking the header label.
		const toggleCollapseLabel = localize('toggleCustomizationsCollapse', "Toggle Customizations Section");
		const chevronContainer = DOM.append(header, $<HTMLButtonElement>('button.ai-customization-collapse-toggle'));
		chevronContainer.type = 'button';
		chevronContainer.setAttribute('aria-label', toggleCollapseLabel);
		chevronContainer.title = toggleCollapseLabel;
		const headerTotalCount = DOM.append(chevronContainer, $('span.ai-customization-header-total.hidden'));
		const chevron = DOM.append(chevronContainer, $('.ai-customization-chevron'));
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
		// not surface, plus any sections the active harness hides via
		// `hiddenSections` (e.g. Claude doesn't show Prompts; AHP doesn't
		// show MCP Servers).
		const totalCount = derived(reader => {
			this.harnessService.activeHarness.read(reader);
			this.harnessService.availableHarnesses.read(reader);
			const hidden = new Set(this.harnessService.getActiveDescriptor().hiddenSections ?? []);
			let total = 0;
			for (const config of CUSTOMIZATION_ITEMS) {
				if (hidden.has(config.section)) {
					continue;
				}
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
		this._register(Gesture.addTarget(chevronContainer));
		for (const eventType of [DOM.EventType.CLICK, TouchEventType.Tap]) {
			this._register(DOM.addDisposableListener(chevronContainer, eventType, e => {
				DOM.EventHelper.stop(e, true);
				toggleCollapse();
			}));
		}
	}

	private async _openWelcomePage(): Promise<void> {
		const input = AICustomizationManagementEditorInput.getOrCreate();
		const editor = await this.editorService.openEditor(input, { pinned: true });
		if (editor instanceof AICustomizationManagementEditor) {
			editor.showWelcomePage();
		}
	}

	focus(): void {
		this._headerButton?.element.focus();
	}
}
