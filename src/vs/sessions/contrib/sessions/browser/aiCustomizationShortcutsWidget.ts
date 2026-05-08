/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
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
import { CUSTOMIZATION_ITEMS, findHarnessIdForSession, SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING, SessionsCustomizationsSidebarMode } from './customizationsToolbar.contribution.js';
import { Menus } from '../../../browser/menus.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

const $ = DOM.$;

const CUSTOMIZATIONS_COLLAPSED_KEY = 'agentSessions.customizationsCollapsed';

export interface IAICustomizationShortcutsWidgetOptions {
	readonly onDidChangeLayout?: () => void;
}

export class AICustomizationShortcutsWidget extends Disposable {

	private _headerButton: Button | undefined;
	private _singleButton: Button | undefined;
	private _renderDisposables = this._register(new DisposableStore());
	private _wrapper: HTMLElement | undefined;
	private _options: IAICustomizationShortcutsWidgetOptions | undefined;
	private _renderedSingle: boolean | undefined;

	constructor(
		container: HTMLElement,
		options: IAICustomizationShortcutsWidgetOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IMcpService private readonly mcpService: IMcpService,
		@IAICustomizationItemsModel private readonly itemsModel: IAICustomizationItemsModel,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		// Stable wrapper appended once to the parent. Re-renders replace the
		// wrapper's children only, so the widget keeps its position relative
		// to sibling parts (e.g. the agent-host-toolbar below it). Without
		// this, removing+re-appending the rendered root would move it to the
		// end of the parent on every re-render, stacking adjacent border-tops.
		this._wrapper = DOM.append(container, $('.ai-customization-shortcuts-widget'));
		this._options = options;
		this._renderForCurrentMode();

		// Re-render only when crossing the single<->non-single boundary. The
		// `welcome` and `section` modes produce identical DOM (only click
		// behavior differs, resolved at click-time in the contribution), so
		// toggling between them needs no re-render.
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING)) {
				const isSingle = this._readMode() === SessionsCustomizationsSidebarMode.Single;
				if (isSingle !== this._renderedSingle) {
					this._renderForCurrentMode();
					this._options?.onDidChangeLayout?.();
				}
			}
		}));
	}

	private _readMode(): SessionsCustomizationsSidebarMode {
		const value = this.configurationService.getValue<string>(SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING);
		if (value === SessionsCustomizationsSidebarMode.Section || value === SessionsCustomizationsSidebarMode.Single) {
			return value;
		}
		return SessionsCustomizationsSidebarMode.Welcome;
	}

	private _renderForCurrentMode(): void {
		if (!this._wrapper) {
			return;
		}
		this._renderDisposables.clear();
		this._headerButton = undefined;
		this._singleButton = undefined;
		DOM.clearNode(this._wrapper);

		const mode = this._readMode();
		const isSingle = mode === SessionsCustomizationsSidebarMode.Single;
		this._renderedSingle = isSingle;
		if (isSingle) {
			this._renderSingleEntry(this._wrapper);
		} else {
			this._render(this._wrapper, this._options);
		}
	}

	private _renderSingleEntry(parent: HTMLElement): void {
		const container = DOM.append(parent, $('.ai-customization-toolbar.single-entry'));

		const buttonContainer = DOM.append(container, $('.customization-link-button-container'));
		const button = this._renderDisposables.add(new Button(buttonContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		button.element.classList.add('customization-link-button', 'sidebar-action-button', 'customization-single-entry-button');
		button.label = `$(${Codicon.symbolColor.id}) ${localize('customizations', "Customizations")}`;
		this._singleButton = button;

		// Total count badge driven by the same observables as per-section badges.
		const countContainer = DOM.append(button.element, $('span.customization-link-counts'));
		const totalCount = this._totalCount();
		this._renderDisposables.add(autorun(reader => {
			const value = totalCount.read(reader);
			countContainer.textContent = '';
			countContainer.classList.toggle('hidden', value === 0);
			if (value > 0) {
				const badge = DOM.append(countContainer, $('span.source-count-badge'));
				const num = DOM.append(badge, $('span.source-count-num'));
				num.textContent = `${value}`;
			}
		}));

		this._renderDisposables.add(button.onDidClick(() => this._openWelcomePage()));
	}

	private _totalCount() {
		return derived(reader => {
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
					total += this.itemsModel.getPluginCount().read(reader);
				}
			}
			return total;
		});
	}

	private async _openWelcomePage(): Promise<void> {
		const harnessId = findHarnessIdForSession(this.sessionsManagementService.activeSession.get(), this.harnessService);
		if (harnessId) {
			this.harnessService.setActiveHarness(harnessId);
		}

		const input = AICustomizationManagementEditorInput.getOrCreate();
		const editor = await this.editorService.openEditor(input, { pinned: true });
		if (editor instanceof AICustomizationManagementEditor) {
			editor.showWelcomePage();
		}
	}

	private _render(parent: HTMLElement, options: IAICustomizationShortcutsWidgetOptions | undefined): void {
		// Get initial collapsed state
		const isCollapsed = this.storageService.getBoolean(CUSTOMIZATIONS_COLLAPSED_KEY, StorageScope.PROFILE, false);

		const container = DOM.append(parent, $('.ai-customization-toolbar'));
		if (isCollapsed) {
			container.classList.add('collapsed');
		}

		// Header
		const header = DOM.append(container, $('.ai-customization-header'));
		header.classList.toggle('collapsed', isCollapsed);

		const headerButtonContainer = DOM.append(header, $('.customization-link-button-container'));
		const headerButton = this._renderDisposables.add(new Button(headerButtonContainer, {
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

		// Total count + chevron live inside the single header button.
		const headerTotalCount = DOM.append(headerButton.element, $('span.ai-customization-header-total.hidden'));
		const chevron = DOM.append(headerButton.element, $('.ai-customization-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(isCollapsed ? Codicon.chevronRight : Codicon.chevronDown));

		// Toolbar container
		const toolbarContainer = DOM.append(container, $('.ai-customization-toolbar-content.sidebar-action-list'));

		const toolbar = this._renderDisposables.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SidebarCustomizations, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'sidebarCustomizations',
		}));

		// Re-layout when toolbar items change (e.g., Plugins item appearing after extension activation)
		this._renderDisposables.add(toolbar.onDidChangeMenuItems(() => {
			options?.onDidChangeLayout?.();
		}));

		// Header total = sum of the same counts shown by each visible sidebar
		// link (CUSTOMIZATION_ITEMS). This guarantees the header value equals
		// the sum of the per-link badges by construction — and excludes
		// sections like Prompts that the editor exposes but the sidebar does
		// not surface, plus any sections the active harness hides via
		// `hiddenSections` (e.g. Claude doesn't show Prompts; AHP doesn't
		// show MCP Servers).
		const totalCount = this._totalCount();
		this._renderDisposables.add(autorun(reader => {
			const value = totalCount.read(reader);
			headerTotalCount.classList.toggle('hidden', value === 0);
			headerTotalCount.textContent = `${value}`;
		}));

		// Toggle collapse on header click
		const transitionListener = this._renderDisposables.add(new MutableDisposable());
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

		this._renderDisposables.add(headerButton.onDidClick(() => toggleCollapse()));
	}

	focus(): void {
		(this._singleButton ?? this._headerButton)?.element.focus();
	}
}
