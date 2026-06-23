/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAICustomizationItemsModel } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { CUSTOMIZATION_ITEMS, openCustomizationOverviewPage, SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING, SessionsCustomizationsSidebarMode } from './customizationsToolbar.contribution.js';
import { Menus } from '../../../browser/menus.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
const $ = DOM.$;

export interface IAICustomizationShortcutsWidgetOptions {
	readonly onDidChangeLayout?: () => void;
}

export class AICustomizationShortcutsWidget extends Disposable {

	private _singleButton: Button | undefined;
	private _renderDisposables = this._register(new DisposableStore());
	private _wrapper: HTMLElement | undefined;
	private _options: IAICustomizationShortcutsWidgetOptions | undefined;
	private _renderedSingle: boolean | undefined;
	private _scrollableElement: DomScrollableElement | undefined;
	private _toolbar: MenuWorkbenchToolBar | undefined;
	private _rootElement: HTMLElement | undefined;
	private _headerElement: HTMLElement | undefined;
	private _toolbarContentElement: HTMLElement | undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		container: HTMLElement,
		options: IAICustomizationShortcutsWidgetOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMcpService private readonly mcpService: IMcpService,
		@IAICustomizationItemsModel private readonly itemsModel: IAICustomizationItemsModel,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ISessionsService private readonly sessionsService: ISessionsService,
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
		// `welcome` and `section` modes produce identical DOM; both render
		// overview-plus-section entries. Only `single` changes presentation.
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
		this._singleButton = undefined;
		this._scrollableElement = undefined;
		this._toolbar = undefined;
		this._rootElement = undefined;
		this._headerElement = undefined;
		this._toolbarContentElement = undefined;
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
		this._rootElement = container;

		const buttonContainer = DOM.append(container, $('.customization-link-button-container'));
		this._toolbarContentElement = buttonContainer;
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
				if (config.section && hidden.has(config.section)) {
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
		await openCustomizationOverviewPage(this.editorService, this.harnessService, this.sessionsService);
	}

	private _render(parent: HTMLElement, options: IAICustomizationShortcutsWidgetOptions | undefined): void {
		const container = DOM.append(parent, $('.ai-customization-toolbar'));
		this._rootElement = container;

		// Header
		const header = DOM.append(container, $('.ai-customization-header'));
		this._headerElement = header;
		const headerLabel = DOM.append(header, $('span.ai-customization-header-label'));
		headerLabel.textContent = localize('customizations', "Customizations");

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
		DOM.append(container, scrollableElement.getDomNode());

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
		const root = this._rootElement;
		const content = this._toolbarContentElement;
		if (!root || !content) {
			return 0;
		}

		const rootStyles = DOM.getWindow(root).getComputedStyle(root);
		const paddingTop = parseFloat(rootStyles.paddingTop);
		const paddingBottom = parseFloat(rootStyles.paddingBottom);
		const rootVerticalPadding = (Number.isFinite(paddingTop) ? paddingTop : 0) + (Number.isFinite(paddingBottom) ? paddingBottom : 0);
		const headerHeight = this._headerElement?.offsetHeight ?? 0;
		const height = Math.ceil(rootVerticalPadding + headerHeight + content.scrollHeight);
		return Number.isFinite(height) ? height : 0;
	}

	layout(_height: number, _width: number): void {
		this._scrollableElement?.scanDomNode();
	}

	focus(): void {
		if (this._singleButton) {
			this._singleButton.element.focus();
			return;
		}
		this._toolbar?.focus();
	}
}
