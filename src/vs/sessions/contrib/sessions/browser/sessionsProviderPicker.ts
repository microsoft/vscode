/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { autorun } from '../../../../base/common/observable.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { ISessionsManagementService } from './sessionsManagementService.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISessionsProvider } from './sessionsProvider.js';

/**
 * A self-contained widget for selecting the active sessions provider.
 * Only visible when there are multiple providers registered.
 */
export class SessionsProviderPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _triggerElement: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		// Update label when active provider or providers list changes
		this._register(autorun(reader => {
			this.sessionsManagementService.activeProviderId.read(reader);
			this._updateTriggerLabel();
		}));
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
			this._updateVisibility();
			this._updateTriggerLabel();
		}));
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-provider-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;
		this._updateTriggerLabel();
		this._updateVisibility();

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this._showPicker();
		}));

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));
	}

	/**
	 * Whether there are multiple providers registered.
	 */
	hasMultipleProviders(): boolean {
		return this.sessionsProvidersService.getProviders().length > 1;
	}

	/**
	 * Get the label of the currently active provider.
	 */
	getActiveProviderLabel(): string {
		const activeId = this.sessionsManagementService.activeProviderId.get();
		const providers = this.sessionsProvidersService.getProviders();
		const activeProvider = providers.find(p => p.id === activeId);
		return activeProvider?.label ?? localize('sessionsProviderPicker.select', "Provider");
	}

	/**
	 * Get the icon of the currently active provider.
	 */
	getActiveProviderIcon(): ThemeIcon {
		const activeId = this.sessionsManagementService.activeProviderId.get();
		const providers = this.sessionsProvidersService.getProviders();
		const activeProvider = providers.find(p => p.id === activeId);
		return activeProvider?.icon ?? Codicon.server;
	}

	/**
	 * Show the provider picker dropdown anchored to the given element.
	 */
	showPicker(anchor: HTMLElement): void {
		this._showPickerWithAnchor(anchor);
	}

	private _showPickerWithAnchor(anchor: HTMLElement): void {
		if (this.actionWidgetService.isVisible) {
			return;
		}

		const providers = this.sessionsProvidersService.getProviders();
		if (providers.length <= 1) {
			return;
		}

		const activeId = this.sessionsManagementService.activeProviderId.get();

		const items: IActionListItem<ISessionsProvider>[] = providers.map(provider => ({
			kind: ActionListItemKind.Action,
			label: provider.label,
			group: { title: '', icon: provider.icon },
			item: provider.id === activeId ? { ...provider, checked: true } as ISessionsProvider & { checked: boolean } : provider,
		}));

		const delegate: IActionListDelegate<ISessionsProvider> = {
			onSelect: (provider) => {
				this.actionWidgetService.hide();
				this.sessionsManagementService.setActiveProvider(provider.id);
			},
			onHide: () => { anchor.focus(); },
		};

		this.actionWidgetService.show<ISessionsProvider>(
			'sessionsProviderPicker',
			false,
			items,
			delegate,
			anchor,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('sessionsProviderPicker.ariaLabel', "Sessions Provider"),
			},
		);
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const providers = this.sessionsProvidersService.getProviders();
		if (providers.length <= 1) {
			return;
		}

		const activeId = this.sessionsManagementService.activeProviderId.get();

		const items: IActionListItem<ISessionsProvider>[] = providers.map(provider => ({
			kind: ActionListItemKind.Action,
			label: provider.label,
			group: { title: '', icon: provider.icon },
			item: provider.id === activeId ? { ...provider, checked: true } as ISessionsProvider & { checked: boolean } : provider,
		}));

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<ISessionsProvider> = {
			onSelect: (provider) => {
				this.actionWidgetService.hide();
				this.sessionsManagementService.setActiveProvider(provider.id);
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<ISessionsProvider>(
			'sessionsProviderPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('sessionsProviderPicker.ariaLabel', "Sessions Provider"),
			},
		);
	}

	private _updateVisibility(): void {
		// Visibility is controlled by the menu's `when` clause, not by this widget
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		const activeId = this.sessionsManagementService.activeProviderId.get();
		const providers = this.sessionsProvidersService.getProviders();
		const activeProvider = providers.find(p => p.id === activeId);

		const icon = activeProvider?.icon ?? Codicon.server;
		const label = activeProvider?.label ?? localize('sessionsProviderPicker.select', "Provider");

		dom.append(this._triggerElement, renderIcon(icon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		if (providers.length > 1) {
			dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
		}
	}
}
