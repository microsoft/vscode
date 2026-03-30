/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IMultiAgentProviderService, IProviderAccount, IProviderDefinition, IProviderQuotaSummary } from '../common/multiAgentProviderService.js';
import * as dom from '../../../../base/browser/dom.js';

export class ProvidersViewPane extends ViewPane {

	static readonly ID = 'workbench.views.multiAgent.providers';

	private _bodyContainer: HTMLElement | undefined;
	private readonly _bodyDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IMultiAgentProviderService private readonly _providerService: IMultiAgentProviderService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._bodyContainer = container;
		container.classList.add('multi-agent-providers-view');
		this._renderContent();

		// Subscribe to changes
		this._bodyDisposables.add(this._providerService.onDidChangeProviders(() => this._renderContent()));
		this._bodyDisposables.add(this._providerService.onDidChangeAccounts(() => this._renderContent()));
		this._bodyDisposables.add(this._providerService.onDidChangeHealth(() => this._renderQuotaDashboard()));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	private _renderContent(): void {
		if (!this._bodyContainer) {
			return;
		}
		dom.clearNode(this._bodyContainer);

		const wrapper = dom.append(this._bodyContainer, dom.$('.providers-content'));

		// Quota dashboard section
		this._renderQuotaDashboard(wrapper);

		// Provider tree section
		this._renderProviderTree(wrapper);
	}

	private _renderQuotaDashboard(container?: HTMLElement): void {
		const target = container ?? this._bodyContainer?.querySelector('.quota-dashboard');
		if (!target) {
			return;
		}

		// Remove existing dashboard if re-rendering
		const existing = target.querySelector('.quota-dashboard');
		if (existing) {
			existing.remove();
		}

		const dashboard = dom.append(target, dom.$('.quota-dashboard'));
		const header = dom.append(dashboard, dom.$('.quota-dashboard-header'));
		header.textContent = 'Provider Health';

		const summaries = this._providerService.getAllQuotaSummaries();

		for (const summary of summaries) {
			this._renderQuotaBar(dashboard, summary);
		}

		if (summaries.length === 0) {
			const empty = dom.append(dashboard, dom.$('.quota-empty'));
			empty.textContent = 'No providers configured';
		}
	}

	private _renderQuotaBar(container: HTMLElement, summary: IProviderQuotaSummary): void {
		const row = dom.append(container, dom.$('.quota-row'));

		// Provider name
		const name = dom.append(row, dom.$('.quota-provider-name'));
		name.textContent = summary.providerName;

		// Progress bar
		const barContainer = dom.append(row, dom.$('.quota-bar-container'));
		const bar = dom.append(barContainer, dom.$('.quota-bar'));
		const percent = Math.max(0, Math.min(100, summary.aggregateQuotaPercent));
		bar.style.width = `${percent}%`;

		// Color based on quota level
		if (percent > 50) {
			bar.classList.add('quota-bar-healthy');
		} else if (percent > 20) {
			bar.classList.add('quota-bar-warning');
		} else {
			bar.classList.add('quota-bar-critical');
		}

		// Stats
		const stats = dom.append(row, dom.$('.quota-stats'));
		stats.textContent = `${percent}%`;

		if (summary.activeAccounts > 0) {
			const accounts = dom.append(row, dom.$('.quota-accounts'));
			accounts.textContent = `${summary.activeAccounts}/${summary.totalAccounts} active`;
		}

		// Reset timer
		if (summary.nextResetAt > 0) {
			const resetIn = Math.max(0, summary.nextResetAt - Date.now());
			const hours = Math.floor(resetIn / 3_600_000);
			const minutes = Math.floor((resetIn % 3_600_000) / 60_000);
			const timer = dom.append(row, dom.$('.quota-reset-timer'));
			timer.textContent = hours > 0 ? `resets in ${hours}h${minutes}m` : `resets in ${minutes}m`;
		}
	}

	private _renderProviderTree(container: HTMLElement): void {
		const tree = dom.append(container, dom.$('.providers-tree'));
		const providers = this._providerService.getProviders();

		for (const provider of providers) {
			this._renderProviderNode(tree, provider);
		}
	}

	private _renderProviderNode(container: HTMLElement, provider: IProviderDefinition): void {
		const accounts = this._providerService.getAccounts(provider.id);
		const summary = this._providerService.getQuotaSummary(provider.id);

		const node = dom.append(container, dom.$('.provider-node'));

		// Header
		const header = dom.append(node, dom.$('.provider-header'));

		// Health badge
		const badge = dom.append(header, dom.$('.provider-health-badge'));
		if (summary.exhaustedAccounts === summary.totalAccounts && summary.totalAccounts > 0) {
			badge.classList.add('badge-critical');
		} else if (summary.exhaustedAccounts > 0) {
			badge.classList.add('badge-warning');
		} else {
			badge.classList.add('badge-healthy');
		}

		// Name and account count
		const nameEl = dom.append(header, dom.$('.provider-name'));
		nameEl.textContent = `${provider.name} (${accounts.length} account${accounts.length !== 1 ? 's' : ''})`;

		// Account list (expandable)
		const accountList = dom.append(node, dom.$('.provider-accounts'));
		for (const account of accounts) {
			this._renderAccountNode(accountList, account);
		}
	}

	private _renderAccountNode(container: HTMLElement, account: IProviderAccount): void {
		const node = dom.append(container, dom.$('.account-node'));

		// Status indicator
		const status = dom.append(node, dom.$('.account-status'));
		if (account.lastError) {
			status.classList.add('status-error');
			status.title = account.lastError.message;
		} else if (!account.isActive) {
			status.classList.add('status-inactive');
		} else {
			status.classList.add('status-active');
		}

		// Label with masked key
		const label = dom.append(node, dom.$('.account-label'));
		label.textContent = account.label;

		// Quota indicator
		if (account.quotaRemaining !== undefined && account.quotaLimit) {
			const quotaPercent = Math.round((account.quotaRemaining / account.quotaLimit) * 100);
			const quota = dom.append(node, dom.$('.account-quota'));
			quota.textContent = `${quotaPercent}% remaining`;

			if (quotaPercent <= 5) {
				quota.classList.add('quota-critical');
			} else if (quotaPercent <= 20) {
				quota.classList.add('quota-warning');
			}
		}

		// Priority badge
		const priority = dom.append(node, dom.$('.account-priority'));
		priority.textContent = account.priority === 0 ? 'Primary' : `Priority ${account.priority + 1}`;
	}
}
