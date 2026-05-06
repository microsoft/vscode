/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/copilotPrototypeShell.css';
import { $, append } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IStatusbarEntry, IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export class CopilotPrototypeShellCoinStatusBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotPrototypeShellCoinStatusBar';
	private static readonly DASHBOARD_ENTRY_ID = 'chat.prototypeDashboardEntry';

	static getDashboardEntryId(): string { return CopilotPrototypeShellCoinStatusBarContribution.DASHBOARD_ENTRY_ID; }

	// Singleton so the ViewPane can call into us
	static instance: CopilotPrototypeShellCoinStatusBarContribution | undefined;

	private _activeSku = 'Edu/Free';
	private _activeState = 'Default';
	private readonly _dashboardEntryAccessor;
	private _bannerElement: HTMLElement | undefined;
	private _warningCardElement: HTMLElement | undefined;
	private _microTransaction = false;
	private _limitedOverageView = false;
	private _autoAdvanceStates: string[] | undefined;
	private _autoAdvanceIndex = 0;
	private _resumed = false;
	private _chatCountForAdvance = 0;
	private _firstTimeStep = 1;
	private _billingMode: 'token-based' | 'current-model' | 'tbb-3.0' = 'token-based';

	get billingMode(): 'token-based' | 'current-model' | 'tbb-3.0' { return this._billingMode; }

	constructor(
		@IStatusbarService statusbarService: IStatusbarService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHostService private readonly hostService: IHostService,
	) {
		super();

		// Restore layout parts that may have been hidden by the old shell mode
		this.layoutService.setPartHidden(false, Parts.TITLEBAR_PART);
		this.layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);

		CopilotPrototypeShellCoinStatusBarContribution.instance = this;

		// Right-side Copilot icon (shows dashboard tooltip)
		this._dashboardEntryAccessor = this._register(statusbarService.addEntry(this.getDashboardEntryProps(), CopilotPrototypeShellCoinStatusBarContribution.DASHBOARD_ENTRY_ID, StatusbarAlignment.RIGHT, {
			location: { id: 'status.prototype.dashboard', priority: 1000 },
			alignment: StatusbarAlignment.RIGHT,
		}));

		// Intercept chat submission in reached states
		this.setupInputInterceptor();
	}

	private startAutoAdvance(sku: string): void {
		const states = CopilotPrototypeShellCoinStatusBarContribution.STATES;
		const excluded = CopilotPrototypeShellCoinStatusBarContribution.EXCLUDED_CELLS;
		// Build the valid state sequence for this SKU
		this._autoAdvanceStates = states.filter(s => !excluded.has(`${sku}|${s}`));
		this._autoAdvanceIndex = 0;
		if (this._autoAdvanceStates.length > 0) {
			this.setActiveCell(sku, this._autoAdvanceStates[0]);
		}
	}

	private advanceState(): void {
		if (!this._autoAdvanceStates || this._autoAdvanceStates.length === 0) {
			return;
		}
		this._autoAdvanceIndex++;
		if (this._autoAdvanceIndex >= this._autoAdvanceStates.length) {
			// Wrap around to the beginning
			this._autoAdvanceIndex = 0;
		}
		this.setActiveCell(this._activeSku, this._autoAdvanceStates[this._autoAdvanceIndex]);
	}

	private advanceFromApproached(): void {
		// Map Approached states to their corresponding Exhausted/Reached states
		const advanceMap: Record<string, string> = {
			'Session Approached': 'Session Reached',
			'Weekly Approached': 'Weekly Reached',
			'Overage Approached': 'Overage Reached',
		};
		const nextState = advanceMap[this._activeState];
		if (nextState) {
			this.setActiveCell(this._activeSku, nextState);
		}
	}

	private setupInputInterceptor(): void {
		const tryAttach = () => {
			const container = this.layoutService.getContainer(mainWindow);
			const auxBar = container.querySelector('.part.auxiliarybar') || container.querySelector('.part.chatbar'); // eslint-disable-line no-restricted-syntax
			if (!auxBar) {
				setTimeout(tryAttach, 1000);
				return;
			}

			// Capture-phase listener — advance state on submit, or block if input blocked
			auxBar.addEventListener('keydown', (e) => {
				const ke = e as KeyboardEvent;
				if (ke.key !== 'Enter' || ke.shiftKey) {
					return;
				}
				const target = e.target as HTMLElement;
				if (!target.closest('.chat-editor-container') && !target.closest('.chat-input-container')) {
					return;
				}
				if (this.isInputBlocked()) {
					e.preventDefault();
					e.stopPropagation();
				} else {
					this.clearResumedState();
					if (this._autoAdvanceStates) {
						// Schedule advance after the message is sent
						this._chatCountForAdvance++;
						if (this._chatCountForAdvance >= 2) {
							this._chatCountForAdvance = 0;
							setTimeout(() => this.advanceState(), 1500);
						}
					} else if (this._activeState.includes('Approached')) {
						// Approached → Exhausted/Reached on chat submit
						this._chatCountForAdvance++;
						if (this._chatCountForAdvance >= 2) {
							this._chatCountForAdvance = 0;
							setTimeout(() => this.advanceFromApproached(), 1500);
						}
					}
				}
			}, true);

			// Also intercept clicks on the send/execute button
			auxBar.addEventListener('click', (e) => {
				const target = e.target as HTMLElement;
				if (!target.closest('.chat-execute-toolbar')) {
					return;
				}
				if (this.isInputBlocked()) {
					e.preventDefault();
					e.stopPropagation();
				} else {
					this.clearResumedState();
					if (this._autoAdvanceStates) {
						this._chatCountForAdvance++;
						if (this._chatCountForAdvance >= 2) {
							this._chatCountForAdvance = 0;
							setTimeout(() => this.advanceState(), 1500);
						}
					} else if (this._activeState.includes('Approached')) {
						this._chatCountForAdvance++;
						if (this._chatCountForAdvance >= 2) {
							this._chatCountForAdvance = 0;
							setTimeout(() => this.advanceFromApproached(), 1500);
						}
					}
				}
			}, true);
		};
		tryAttach();
	}

	setBillingMode(mode: 'token-based' | 'current-model' | 'tbb-3.0'): void {
		this._billingMode = mode;
		const cmInstance = CopilotCurrentModelStatusBarContribution.instance;
		const tbb3Instance = CopilotTBB3StatusBarContribution.instance;
		if (mode === 'token-based') {
			cmInstance?.clearAllUI();
			tbb3Instance?.clearAllUI();
		} else if (mode === 'current-model') {
			this.clearBanner();
			this.clearWarningCard();
			tbb3Instance?.clearAllUI();
		} else {
			this.clearBanner();
			this.clearWarningCard();
			cmInstance?.clearAllUI();
		}
		this.refreshDashboardEntry();
	}

	refreshDashboardEntry(): void {
		this._dashboardEntryAccessor.update(this.getDashboardEntryProps());
	}

	private getDashboardEntryProps(): IStatusbarEntry {
		// Delegate to current model if in that mode
		if (this._billingMode === 'current-model') {
			const cmInstance = CopilotCurrentModelStatusBarContribution.instance;
			if (cmInstance) {
				return cmInstance.getDashboardEntryPropsForShared();
			}
		}
		if (this._billingMode === 'tbb-3.0') {
			const tbb3Instance = CopilotTBB3StatusBarContribution.instance;
			if (tbb3Instance) {
				return tbb3Instance.getDashboardEntryPropsForShared();
			}
		}
		// Resumed state: green icon with "Copilot Resumed"
		if (this._resumed) {
			return {
				name: localize('copilotPrototypeDashboardEntry', "Copilot Dashboard"),
				text: '$(copilot) Copilot Resumed',
				ariaLabel: localize('copilotPrototypeDashboardEntryResumedAria', "Copilot Resumed"),
				backgroundColor: 'rgba(0, 120, 212, 0.25)',
				tooltip: {
					element: token => this.renderDashboard(token),
				},
				command: ShowTooltipCommand,
			};
		}
		const hasOverage = this._activeSku === 'Pro/Pro+' || this._activeSku === 'Max';
		// For Pro with overage, only show warning/error icons for overage states
		const isWarning = (
			hasOverage
				? this._activeState === 'Overage Approached'
				: this._activeState.includes('Approached')
		);
		const isError = (
			hasOverage
				? this._activeState === 'Overage Reached'
				: this._activeState.includes('Reached')
		);
		let text = '$(copilot)';
		if (isWarning) {
			text = '$(copilot-warning)';
		} else if (isError) {
			text = '$(copilot-error)';
		}
		return {
			name: localize('copilotPrototypeDashboardEntry', "Copilot Dashboard"),
			text,
			ariaLabel: localize('copilotPrototypeDashboardEntryAria', "Copilot Dashboard"),
			tooltip: {
				element: token => this.renderDashboard(token),
			},
			command: ShowTooltipCommand,
		};
	}

	private setActiveCell(sku: string, state: string): void {
		this._activeSku = sku;
		this._activeState = state;
		this._resumed = false;
		this._chatCountForAdvance = 0;
		if (state === 'First Time') {
			this._firstTimeStep = 1;
		}
		// Update the dashboard entry so next tooltip render uses new state
		this._dashboardEntryAccessor.update(this.getDashboardEntryProps());
		// Clear any existing warning card
		this.clearWarningCard();

		// Handle Reset states — OS notification + green status bar + reset banner
		if (state.includes('Reset')) {
			this.clearBanner();
			this._resumed = true;
			this._dashboardEntryAccessor.update(this.getDashboardEntryProps());
			this.fireResetNotification(state);
			this.showResetBanner(state);
			return;
		}

		// Show the right UI for the state
		const isEnterprise = sku === 'Ent/Bus' || sku === 'Ent/Bus ULB';
		const hasOverage = sku === 'Pro/Pro+' || sku === 'Max';
		if (isEnterprise) {
			// Enterprise: approached shows banner, reached shows warning card, no overage
			if (state === 'Overage Reached') {
				this.clearBanner();
				this.showWarningCard();
			} else if (state === 'Overage Approached') {
				this.updateBanner(state);
			} else {
				this.clearBanner();
			}
		} else if (hasOverage) {
			// Pro with overage: only block for overage exhaustion
			if (state === 'Overage Reached') {
				this.clearBanner();
				this.showWarningCard();
			} else if (state.includes('Approached') || state === 'Session Reached' || state === 'Weekly Reached') {
				this.updateBanner(state);
			} else {
				this.clearBanner();
			}
		} else if (state.includes('Reached')) {
			this.clearBanner();
			this.showWarningCard();
		} else if (state.includes('Approached')) {
			this.updateBanner(state);
		} else {
			this.clearBanner();
		}
	}

	private isInputBlocked(): boolean {
		const isEnterprise = this._activeSku === 'Ent/Bus' || this._activeSku === 'Ent/Bus ULB';
		if (isEnterprise) {
			return this._activeState === 'Overage Reached';
		}
		const hasOverage = this._activeSku === 'Pro/Pro+' || this._activeSku === 'Max';
		if (hasOverage) {
			// Pro with overage: only block when overage is exhausted
			return this._activeState === 'Overage Reached';
		}
		return this._activeState.includes('Reached');
	}

	private clearResumedState(): void {
		if (this._resumed) {
			this._resumed = false;
			this._dashboardEntryAccessor.update(this.getDashboardEntryProps());
		}
	}

	private fireResetNotification(state: string): void {
		const isEnterprise = this._activeSku === 'Ent/Bus' || this._activeSku === 'Ent/Bus ULB';
		let limitType: string;
		if (isEnterprise && state === 'Overage Reset') {
			limitType = localize('monthlyLimitType', "included credits");
		} else if (state === 'Session Reset') {
			limitType = localize('fiveHourLimit', "five-hour limit");
		} else if (state === 'Weekly Reset') {
			limitType = localize('weeklyLimit', "weekly limit");
		} else {
			limitType = localize('runoverBudget', "additional budget");
		}

		const title = localize('resetNotificationTitle', "Copilot is available. Start building.");
		const body = localize('resetNotificationBody', "Your {0} has reset. Happy coding.", limitType);

		// Fire OS notification via host service
		const cts = new CancellationTokenSource();
		this.hostService.showToast({ title, body }, cts.token);
		// Auto-dispose after 30s so we don't leak
		setTimeout(() => cts.dispose(true), 30000);
	}

	private getBannerMessage(state: string): string | undefined {
		const isEnterprise = this._activeSku === 'Ent/Bus' || this._activeSku === 'Ent/Bus ULB';
		const hasOverage = this._activeSku === 'Pro/Pro+' || this._activeSku === 'Max';

		if (isEnterprise) {
			switch (state) {
				case 'Overage Approached':
					return localize('bannerEntMonthlyApproach', "You've used most of your included credits. It resets May 1 at 10:00 AM. Contact your administrator for more information.");
				default:
					return undefined;
			}
		}

		switch (state) {
			case 'Session Approached':
				if (hasOverage) {
					if (this._limitedOverageView) {
						return localize('bannerSessionApproachLimited', "You're approaching your Five-Hour Limit. Additional budget will apply once it's reached.");
					}
					return localize('bannerSessionApproachOverageInfo', "You're approaching your Five-Hour Limit. Additional budget will be used once it's reached.");
				}
				return localize('bannerSessionApproach', "You've used most of your Five-Hour Limit. It resets at 10:00 AM.");
			case 'Session Reached':
				if (hasOverage) {
					if (this._limitedOverageView) {
						return localize('bannerSessionReachedLimited', "Five-Hour Limit reached. Using additional budget.");
					}
					return localize('bannerSessionReachedOverageInfo', "Five-Hour Limit reached. Using additional budget. Usage resumes when limits reset.");
				}
				return undefined;
			case 'Weekly Approached':
				if (hasOverage) {
					if (this._limitedOverageView) {
						return localize('bannerWeeklyApproachLimited', "You're approaching your Weekly Limit. Additional budget will apply once it's reached.");
					}
					return localize('bannerWeeklyApproachOverageInfo', "You're approaching your Weekly Limit. Additional budget will be used once it's reached.");
				}
				return localize('bannerWeeklyApproach', "You've used most of your Weekly Limit. It resets April 6 at 10:00 AM.");
			case 'Weekly Reached':
				if (hasOverage) {
					if (this._limitedOverageView) {
						return localize('bannerWeeklyReachedLimited', "Weekly Limit reached. Using additional budget.");
					}
					return localize('bannerWeeklyReachedOverageInfo', "Weekly Limit reached. Using additional budget. Usage resumes when limits reset.");
				}
				return undefined;
			case 'Overage Approached':
				if (this._limitedOverageView) {
					return localize('bannerOverageApproachLimited', "Using additional budget. Usage resumes when limits reset.");
				}
				return localize('bannerOverageApproach', "You've used most of your additional budget. Usage resumes when limits reset.");
			default:
				return undefined;
		}
	}

	private getOrCreatePrototypeContainer(): HTMLElement | null {
		const container = this.layoutService.getContainer(mainWindow);
		// Find all input parts in the auxiliary bar, chat bar (Agents window), or new-chat-input-container (Agents welcome)
		const inputParts = container.querySelectorAll('.part.auxiliarybar .interactive-input-part, .part.chatbar .interactive-input-part, .part.chatbar .new-chat-input-container'); // eslint-disable-line no-restricted-syntax
		let inputPart: HTMLElement | null = null;
		for (const part of inputParts) {
			if ((part as HTMLElement).offsetParent !== null) {
				inputPart = part as HTMLElement;
				break;
			}
		}
		// Fallback to the first one if none are visibly rendered yet
		if (!inputPart && inputParts.length > 0) {
			inputPart = inputParts[0] as HTMLElement;
		}
		if (!inputPart) {
			return null;
		}
		let protoContainer = inputPart.querySelector('.copilot-prototype-banner-container') as HTMLElement | null; // eslint-disable-line no-restricted-syntax
		if (!protoContainer) {
			protoContainer = mainWindow.document.createElement('div');
			protoContainer.className = 'copilot-prototype-banner-container';
			protoContainer.style.display = 'none';
			// Insert before the first child so it renders above the input box
			inputPart.insertBefore(protoContainer, inputPart.firstChild);
		}
		return protoContainer;
	}

	private updateBanner(state: string): void {
		const message = this.getBannerMessage(state);

		if (!message) {
			this.clearBanner();
			return;
		}

		const protoContainer = this.getOrCreatePrototypeContainer();
		if (!protoContainer) {
			return;
		}

		// Create or update the banner
		if (!this._bannerElement) {
			this._bannerElement = mainWindow.document.createElement('div');
			this._bannerElement.className = 'copilot-prototype-chat-banner';
		}

		// Determine if this is an info-level banner (overage SKUs with session/weekly states)
		const hasOverage = this._activeSku === 'Pro/Pro+' || this._activeSku === 'Max';
		const isInfoBanner = hasOverage && (state === 'Session Approached' || state === 'Session Reached' || state === 'Weekly Approached' || state === 'Weekly Reached'
			|| (this._limitedOverageView && state === 'Overage Approached'));
		const gaugeInfo = this.getBannerGaugeInfo(state);

		// Clear and re-render content
		this._bannerElement.textContent = '';
		this._bannerElement.className = 'copilot-prototype-chat-banner';
		if (isInfoBanner) {
			this._bannerElement.classList.add('info');
		} else if (gaugeInfo?.severity === 'warning') {
			this._bannerElement.classList.add('warning');
		} else if (gaugeInfo?.severity === 'error') {
			this._bannerElement.classList.add('error');
		}

		// Top row: icon + title/limit name + dismiss
		const topRow = mainWindow.document.createElement('div');
		topRow.className = 'copilot-prototype-chat-banner-top';

		const icon = mainWindow.document.createElement('span');
		icon.className = 'copilot-prototype-chat-banner-icon';
		if (isInfoBanner) {
			icon.append(...renderLabelWithIcons('$(info)'));
		} else if (gaugeInfo?.severity === 'error') {
			icon.append(...renderLabelWithIcons('$(error)'));
		} else {
			icon.append(...renderLabelWithIcons('$(warning)'));
		}
		topRow.appendChild(icon);

		if (gaugeInfo) {
			const titleText = mainWindow.document.createElement('span');
			titleText.className = 'copilot-prototype-chat-banner-title';
			titleText.textContent = gaugeInfo.label;
			topRow.appendChild(titleText);
		} else {
			const titleText = mainWindow.document.createElement('span');
			titleText.className = 'copilot-prototype-chat-banner-title';

			// For limited overage view, split into title + description row
			if (this._limitedOverageView && hasOverage) {
				titleText.textContent = localize('bannerOverageTitleShort', "Using Additional Budget");
				topRow.appendChild(titleText);
			} else {
				titleText.textContent = message;
				topRow.appendChild(titleText);
			}
		}

		const dismiss = mainWindow.document.createElement('span');
		dismiss.className = 'copilot-prototype-chat-banner-dismiss';
		dismiss.append(...renderLabelWithIcons('$(close)'));
		dismiss.tabIndex = 0;
		dismiss.role = 'button';
		dismiss.title = localize('dismiss', "Dismiss");
		dismiss.addEventListener('click', () => {
			this.clearBanner();
			this._dashboardEntryAccessor.update(this.getDashboardEntryProps());
		});
		topRow.appendChild(dismiss);

		this._bannerElement.appendChild(topRow);

		// Description row for limited overage view: "Usage resumes when limits reset. View Budget"
		if (this._limitedOverageView && hasOverage && !gaugeInfo) {
			const descRow = mainWindow.document.createElement('div');
			descRow.className = 'copilot-prototype-chat-banner-bottom';
			const descText = mainWindow.document.createElement('span');
			descText.className = 'copilot-prototype-chat-banner-desc';
			descText.textContent = localize('bannerOverageDesc', "Included Copilot usage resumes when limits reset.");
			descRow.appendChild(descText);
			const actionsRow = mainWindow.document.createElement('div');
			actionsRow.className = 'copilot-prototype-chat-banner-actions';
			const viewBudgetLink = mainWindow.document.createElement('button');
			viewBudgetLink.className = 'copilot-prototype-chat-banner-btn';
			viewBudgetLink.textContent = localize('viewBudgetBanner', "View Budget");
			viewBudgetLink.addEventListener('click', () => this.openDashboard());
			actionsRow.appendChild(viewBudgetLink);
			descRow.appendChild(actionsRow);
			this._bannerElement.appendChild(descRow);
		}

		// Bottom row: percent + reset on left (gauge banners), or just View Usage
		if (!(this._limitedOverageView && hasOverage && !gaugeInfo)) {
			const bottomRow = mainWindow.document.createElement('div');
			bottomRow.className = 'copilot-prototype-chat-banner-bottom';

			if (gaugeInfo) {
				const percentSpan = mainWindow.document.createElement('span');
				percentSpan.className = 'copilot-prototype-chat-banner-percent';
				percentSpan.textContent = gaugeInfo.percentLabel;
				bottomRow.appendChild(percentSpan);

				const resetBadge = mainWindow.document.createElement('span');
				resetBadge.className = 'copilot-prototype-chat-banner-reset';
				resetBadge.textContent = gaugeInfo.resetLabel;
				bottomRow.appendChild(resetBadge);
			}

			const actionsRow = mainWindow.document.createElement('div');
			actionsRow.className = 'copilot-prototype-chat-banner-actions';

			const viewUsageLink = mainWindow.document.createElement('button');
			viewUsageLink.className = 'copilot-prototype-chat-banner-btn';
			viewUsageLink.textContent = localize('viewUsage', "View Usage");
			viewUsageLink.addEventListener('click', () => this.openDashboard());
			actionsRow.appendChild(viewUsageLink);

			const ctaButton = mainWindow.document.createElement('button');
			ctaButton.className = 'copilot-prototype-chat-banner-btn primary';
			if (this._activeSku === 'Free') {
				ctaButton.textContent = localize('upgrade', "Upgrade");
			} else {
				ctaButton.textContent = localize('manageBudget', "Manage Budget");
			}
			ctaButton.addEventListener('click', () => this.openDashboard());
			actionsRow.appendChild(ctaButton);

			bottomRow.appendChild(actionsRow);

			this._bannerElement.appendChild(bottomRow);
		}

		// Insert into the prototype container and make it visible
		if (!this._bannerElement.parentElement) {
			protoContainer.appendChild(this._bannerElement);
			protoContainer.style.display = '';
			this.setChatInputOverlap(true);
		}
	}

	private setChatInputOverlap(enabled: boolean): void {
		const container = this.layoutService.getContainer(mainWindow);
		const chatInputs = container.querySelectorAll('.part.auxiliarybar .interactive-input-part .chat-input-container, .part.chatbar .interactive-input-part .chat-input-container, .part.chatbar .new-chat-input-container .chat-input-container, .part.chatbar .new-chat-input-container .new-chat-input-area'); // eslint-disable-line no-restricted-syntax
		for (const chatInput of chatInputs) {
			if (enabled) {
				(chatInput as HTMLElement).style.position = 'relative';
				(chatInput as HTMLElement).style.zIndex = '1';
			} else {
				(chatInput as HTMLElement).style.position = '';
				(chatInput as HTMLElement).style.zIndex = '';
			}
		}
	}

	private openDashboard(): void {
		const container = this.layoutService.getContainer(mainWindow);
		const dashboardEntry = container.querySelector(`#${CSS.escape(CopilotPrototypeShellCoinStatusBarContribution.DASHBOARD_ENTRY_ID)} .statusbar-item-label`) as HTMLElement | null; // eslint-disable-line no-restricted-syntax
		if (dashboardEntry) {
			dashboardEntry.click();
		}
	}

	/**
	 * Mock AIC allocation per SKU and current state. Only the TBB 3.0 controller
	 * uses this -- values are intentionally fake but plausible so we can sanity-check
	 * the "X / Y AICs" treatment in banners and cards.
	 */
	getTbb3AicAllocation(sku: string, state: string): {
		monthlyTotal: number;
		monthlyUsed: number;
		overageTotal: number;
		overageUsed: number;
	} {
		const plan: Record<string, { monthly: number; overage: number }> = {
			'Edu/Free': { monthly: 300, overage: 0 },
			'Pro/Pro+ No O': { monthly: 1000, overage: 0 },
			'Pro/Pro+': { monthly: 1500, overage: 500 },
			'Max': { monthly: 5000, overage: 1000 },
			'Ent/Bus ULB': { monthly: 2000, overage: 0 },
			'Ent/Bus': { monthly: 0, overage: 0 },
		};
		const entry = plan[sku] ?? { monthly: 1000, overage: 0 };
		let monthlyPct = 42;
		let overageUsed = 0;
		switch (state) {
			case 'Monthly Approached': monthlyPct = 75; break;
			case 'Monthly Exhausted':
				monthlyPct = 100;
				overageUsed = Math.round(entry.overage * 0.1); // ~10% of overage in use
				break;
			case 'Overage Exhausted':
				monthlyPct = 100;
				overageUsed = entry.overage;
				break;
			case 'Monthly Reset':
			case 'Overage Reset':
				monthlyPct = 0;
				overageUsed = 0;
				break;
		}
		return {
			monthlyTotal: entry.monthly,
			monthlyUsed: Math.round(entry.monthly * monthlyPct / 100),
			overageTotal: entry.overage,
			overageUsed,
		};
	}

	private getBannerGaugeInfo(state: string): { label: string; percentLabel: string; percent: number; severity: string; resetLabel: string } | undefined {
		const isEnterprise = this._activeSku === 'Ent/Bus' || this._activeSku === 'Ent/Bus ULB';
		const hasOverage = this._activeSku === 'Pro/Pro+' || this._activeSku === 'Max';

		if (isEnterprise && state === 'Overage Approached') {
			return { label: localize('gaugeMonthlyLimit', "Credits"), percentLabel: localize('gaugeUsed75Lc', "75% used"), percent: 75, severity: 'warning', resetLabel: localize('resetsOnMay1', "Resets May 1 at 10:00 AM") };
		}

		// For SKUs with overage, approached = info with hint, reached = info with "using additional budget"
		if (hasOverage) {
			switch (state) {
				case 'Session Approached':
					return { label: localize('gaugeFiveHourLimit', "Five-Hour Limit"), percentLabel: localize('gaugeUsed75Lc', "75% used"), percent: 75, severity: 'info', resetLabel: localize('resetsAt10am', "Resets at 10:00 AM") };
				case 'Session Reached':
					return { label: localize('gaugeFiveHourLimit', "Five-Hour Limit"), percentLabel: localize('gaugeUsed100Lc', "100% used"), percent: 100, severity: 'info', resetLabel: localize('nowUsingOverageBudget', "Now using additional budget") };
				case 'Weekly Approached':
					return { label: localize('gaugeWeeklyLimit', "Weekly Limit"), percentLabel: localize('gaugeUsed75Lc', "75% used"), percent: 75, severity: 'info', resetLabel: localize('resetsOnApr6', "Resets April 6 at 10:00 AM") };
				case 'Weekly Reached':
					return { label: localize('gaugeWeeklyLimit', "Weekly Limit"), percentLabel: localize('gaugeUsed100Lc', "100% used"), percent: 100, severity: 'info', resetLabel: localize('nowUsingOverageBudget', "Now using additional budget") };
			}
		}

		switch (state) {
			case 'Session Approached':
				return { label: localize('gaugeFiveHourLimit', "Five-Hour Limit"), percentLabel: localize('gaugeUsed75Lc', "75% used"), percent: 75, severity: 'warning', resetLabel: localize('resetsAt10am', "Resets at 10:00 AM") };
			case 'Session Reached':
				return { label: localize('gaugeFiveHourLimit', "Five-Hour Limit"), percentLabel: localize('gaugeUsed100Lc', "100% used"), percent: 100, severity: 'error', resetLabel: localize('resetsAt10am', "Resets at 10:00 AM") };
			case 'Weekly Approached':
				return { label: localize('gaugeWeeklyLimit', "Weekly Limit"), percentLabel: localize('gaugeUsed75Lc', "75% used"), percent: 75, severity: 'warning', resetLabel: localize('resetsOnApr6', "Resets April 6 at 10:00 AM") };
			case 'Weekly Reached':
				return { label: localize('gaugeWeeklyLimit', "Weekly Limit"), percentLabel: localize('gaugeUsed100Lc', "100% used"), percent: 100, severity: 'error', resetLabel: localize('resetsOnApr6', "Resets April 6 at 10:00 AM") };
			case 'Overage Approached':
				if (this._limitedOverageView) {
					return undefined; // No overage % available in limited view
				}
				return { label: localize('gaugeRunoverBudget', "Additional Budget"), percentLabel: localize('gaugeUsed75Lc', "75% used"), percent: 75, severity: 'warning', resetLabel: localize('resetsWithLimits', "Resets with limits") };
			default:
				return undefined;
		}
	}

	private clearBanner(): void {
		if (this._bannerElement) {
			const protoContainer = this._bannerElement.parentElement;
			this._bannerElement.remove();
			this._bannerElement = undefined;
			if (protoContainer && protoContainer.children.length === 0) {
				(protoContainer as HTMLElement).style.display = 'none';
				this.setChatInputOverlap(false);
			}
		}
	}

	// Public hooks so other prototype simulators (TBB 3.0) can reuse the
	// chat-input banner DOM container owned by this contribution.
	clearExternalBanner(): void {
		this.clearBanner();
	}

	showCustomGaugeBanner(opts: {
		title: string;
		description?: string;
		percent: number;
		severity: 'warning' | 'error' | 'info' | 'celebrate';
		actions?: { label: string; primary?: boolean; onClick: () => void }[];
	}): void {
		this.clearBanner();
		const protoContainer = this.getOrCreatePrototypeContainer();
		if (!protoContainer) { return; }

		const banner = mainWindow.document.createElement('div');
		banner.className = 'copilot-prototype-chat-banner compact';
		banner.classList.add(opts.severity);

		// Top row: icon + title + dismiss
		const topRow = mainWindow.document.createElement('div');
		topRow.className = 'copilot-prototype-chat-banner-top';
		const icon = mainWindow.document.createElement('span');
		icon.className = 'copilot-prototype-chat-banner-icon';
		icon.append(...renderLabelWithIcons(opts.severity === 'error' ? '$(error)' : opts.severity === 'warning' ? '$(warning)' : '$(info)'));
		topRow.appendChild(icon);
		const titleText = mainWindow.document.createElement('span');
		titleText.className = 'copilot-prototype-chat-banner-title';
		titleText.textContent = opts.title;
		topRow.appendChild(titleText);
		const dismiss = mainWindow.document.createElement('span');
		dismiss.className = 'copilot-prototype-chat-banner-dismiss';
		dismiss.append(...renderLabelWithIcons('$(close)'));
		dismiss.tabIndex = 0;
		dismiss.role = 'button';
		dismiss.title = localize('dismiss', "Dismiss");
		dismiss.addEventListener('click', () => this.clearBanner());
		topRow.appendChild(dismiss);
		banner.appendChild(topRow);

		// Bottom row: description (left) + actions (right) — single line.
		const bottomRow = mainWindow.document.createElement('div');
		bottomRow.className = 'copilot-prototype-chat-banner-row';
		if (opts.description) {
			const desc = mainWindow.document.createElement('div');
			desc.className = 'copilot-prototype-chat-banner-desc';
			desc.textContent = opts.description;
			bottomRow.appendChild(desc);
		}
		if (opts.actions && opts.actions.length > 0) {
			const actionsRow = mainWindow.document.createElement('div');
			actionsRow.className = 'copilot-prototype-chat-banner-actions';
			for (const action of opts.actions) {
				const btn = mainWindow.document.createElement('button');
				btn.className = action.primary
					? 'copilot-prototype-chat-banner-btn primary'
					: 'copilot-prototype-chat-banner-btn';
				btn.textContent = action.label;
				btn.addEventListener('click', action.onClick);
				actionsRow.appendChild(btn);
			}
			bottomRow.appendChild(actionsRow);
		}
		if (bottomRow.childNodes.length > 0) {
			banner.appendChild(bottomRow);
		}

		this._bannerElement = banner;
		protoContainer.appendChild(banner);
		protoContainer.style.display = '';
		this.setChatInputOverlap(true);
	}

	showCustomSimpleBanner(opts: { title: string; description?: string }): void {
		this.clearBanner();
		const protoContainer = this.getOrCreatePrototypeContainer();
		if (!protoContainer) { return; }

		const banner = mainWindow.document.createElement('div');
		banner.className = 'copilot-prototype-chat-banner info simple';

		const topRow = mainWindow.document.createElement('div');
		topRow.className = 'copilot-prototype-chat-banner-top';
		const icon = mainWindow.document.createElement('span');
		icon.className = 'copilot-prototype-chat-banner-icon';
		icon.append(...renderLabelWithIcons('$(info)'));
		topRow.appendChild(icon);
		const titleText = mainWindow.document.createElement('span');
		titleText.className = 'copilot-prototype-chat-banner-title';
		titleText.textContent = opts.title;
		topRow.appendChild(titleText);
		const dismiss = mainWindow.document.createElement('span');
		dismiss.className = 'copilot-prototype-chat-banner-dismiss';
		dismiss.append(...renderLabelWithIcons('$(close)'));
		dismiss.tabIndex = 0;
		dismiss.role = 'button';
		dismiss.title = localize('dismiss', "Dismiss");
		dismiss.addEventListener('click', () => this.clearBanner());
		topRow.appendChild(dismiss);
		banner.appendChild(topRow);

		if (opts.description) {
			const bottomRow = mainWindow.document.createElement('div');
			bottomRow.className = 'copilot-prototype-chat-banner-row';
			const descText = mainWindow.document.createElement('span');
			descText.className = 'copilot-prototype-chat-banner-desc';
			descText.textContent = opts.description;
			bottomRow.appendChild(descText);
			const actionsRow = mainWindow.document.createElement('div');
			actionsRow.className = 'copilot-prototype-chat-banner-actions';
			const viewUsageBtn = mainWindow.document.createElement('button');
			viewUsageBtn.className = 'copilot-prototype-chat-banner-btn';
			viewUsageBtn.textContent = localize('viewUsage', "View Usage");
			viewUsageBtn.addEventListener('click', () => this.openDashboard());
			actionsRow.appendChild(viewUsageBtn);
			bottomRow.appendChild(actionsRow);
			banner.appendChild(bottomRow);
		}

		this._bannerElement = banner;
		protoContainer.appendChild(banner);
		protoContainer.style.display = '';
		this.setChatInputOverlap(true);
	}

	private showResetBanner(state: string): void {
		const protoContainer = this.getOrCreatePrototypeContainer();
		if (!protoContainer) {
			return;
		}

		this.clearBanner();

		const resetTitle = localize('resetBannerStartBuilding', "Copilot is available. Start building.");

		const banner = mainWindow.document.createElement('div');
		banner.className = 'copilot-prototype-chat-banner info simple';

		const topRow = mainWindow.document.createElement('div');
		topRow.className = 'copilot-prototype-chat-banner-top';

		const icon = mainWindow.document.createElement('span');
		icon.className = 'copilot-prototype-chat-banner-icon';
		icon.append(...renderLabelWithIcons('$(sparkle)'));
		topRow.appendChild(icon);

		const titleText = mainWindow.document.createElement('span');
		titleText.className = 'copilot-prototype-chat-banner-title';
		titleText.textContent = resetTitle;
		topRow.appendChild(titleText);

		const dismiss = mainWindow.document.createElement('span');
		dismiss.className = 'copilot-prototype-chat-banner-dismiss';
		dismiss.append(...renderLabelWithIcons('$(close)'));
		dismiss.tabIndex = 0;
		dismiss.role = 'button';
		dismiss.title = localize('dismiss', "Dismiss");
		dismiss.addEventListener('click', () => {
			this.clearBanner();
			this._dashboardEntryAccessor.update(this.getDashboardEntryProps());
		});
		topRow.appendChild(dismiss);

		banner.appendChild(topRow);

		this._bannerElement = banner;
		protoContainer.appendChild(banner);
		protoContainer.style.display = '';
		this.setChatInputOverlap(true);
	}

	private clearWarningCard(): void {
		if (this._warningCardElement) {
			const protoContainer = this._warningCardElement.parentElement;
			this._warningCardElement.remove();
			this._warningCardElement = undefined;
			if (protoContainer && protoContainer.children.length === 0) {
				(protoContainer as HTMLElement).style.display = 'none';
				this.setChatInputOverlap(false);
			}
		}
	}

	private showWarningCard(): void {
		const content = this.getInlineWarningContent();
		if (!content) {
			return;
		}

		const protoContainer = this.getOrCreatePrototypeContainer();
		if (!protoContainer) {
			return;
		}

		this.clearWarningCard();

		const card = mainWindow.document.createElement('div');
		card.className = 'copilot-prototype-inline-warning';

		const header = mainWindow.document.createElement('div');
		header.className = 'copilot-prototype-inline-warning-header';
		const headerIcon = mainWindow.document.createElement('span');
		headerIcon.className = 'copilot-prototype-inline-warning-icon';
		headerIcon.append(...renderLabelWithIcons('$(warning)'));
		const headerTitle = mainWindow.document.createElement('span');
		headerTitle.className = 'copilot-prototype-inline-warning-title';
		headerTitle.textContent = content.title;
		header.append(headerIcon, headerTitle);

		const desc = mainWindow.document.createElement('div');
		desc.className = 'copilot-prototype-inline-warning-desc';
		desc.textContent = content.description;

		const btnContainer = mainWindow.document.createElement('div');
		btnContainer.className = 'copilot-prototype-inline-warning-actions';

		// View Usage on the left, primary action button on the right
		const viewUsageBtn = mainWindow.document.createElement('button');
		viewUsageBtn.className = 'copilot-prototype-inline-warning-link';
		viewUsageBtn.textContent = localize('viewUsage', "View Usage");
		viewUsageBtn.addEventListener('click', () => this.openDashboard());
		btnContainer.appendChild(viewUsageBtn);

		if (content.budgetInput) {
			// Budget input row: $ input + Add button
			const inputRow = mainWindow.document.createElement('div');
			inputRow.className = 'copilot-prototype-inline-warning-budget-row';

			const dollarSign = mainWindow.document.createElement('span');
			dollarSign.className = 'copilot-prototype-inline-warning-budget-dollar';
			dollarSign.textContent = '$';

			const budgetInput = mainWindow.document.createElement('input');
			budgetInput.className = 'copilot-prototype-inline-warning-budget-input';
			budgetInput.type = 'text';
			budgetInput.placeholder = localize('budgetPlaceholder', "Amount");
			budgetInput.setAttribute('inputmode', 'decimal');

			const addBtn = mainWindow.document.createElement('button');
			addBtn.className = 'copilot-prototype-inline-warning-btn';
			addBtn.textContent = localize('addBudget', "Add");
			addBtn.addEventListener('click', () => this.advanceState());

			inputRow.append(dollarSign, budgetInput, addBtn);
			btnContainer.appendChild(inputRow);
		} else if (content.buttonLabel) {
			const btn = mainWindow.document.createElement('button');
			btn.className = 'copilot-prototype-inline-warning-btn';
			btn.textContent = content.buttonLabel;
			btn.addEventListener('click', () => this.advanceState());
			btnContainer.appendChild(btn);

			if (content.secondaryButtonLabel) {
				const secondaryBtn = mainWindow.document.createElement('button');
				secondaryBtn.className = 'copilot-prototype-inline-warning-btn secondary';
				secondaryBtn.textContent = content.secondaryButtonLabel;
				secondaryBtn.addEventListener('click', () => this.advanceState());
				btnContainer.appendChild(secondaryBtn);
			}
		}

		card.append(header, desc, btnContainer);
		this._warningCardElement = card;
		protoContainer.appendChild(card);
		protoContainer.style.display = '';
		this.setChatInputOverlap(true);
	}

	private getInlineWarningContent(): { title: string; description: string; buttonLabel?: string; secondaryButtonLabel?: string; budgetInput?: boolean } | undefined {
		const sku = this._activeSku;
		const state = this._activeState;
		const isEnterprise = sku === 'Ent/Bus' || sku === 'Ent/Bus ULB';

		if (isEnterprise && state === 'Overage Reached') {
			return {
				title: localize('inlineEntMonthlyReachedTitle', "You've reached your included credits."),
				description: localize('inlineEntMonthlyReachedDesc', "Copilot is paused until your limit resets May 1 at 10:00 AM."),
				buttonLabel: localize('requestMoreUsage', "Request More Usage"),
			};
		}

		if (state === 'Session Reached') {
			if (sku === 'Edu/Free') {
				return {
					title: localize('inlineSessionReachedTitle', "You've reached your Five-Hour Limit."),
					description: localize('inlineSessionReachedDescFree', "Resets at 10:00 AM, or upgrade to increase your limits."),
					buttonLabel: localize('upgrade', "Upgrade"),
				};
			}
			if (sku === 'Pro/Pro+ No O') {
				if (this._microTransaction) {
					return {
						title: localize('inlineSessionReachedTitle', "You've reached your Five-Hour Limit."),
						description: localize('inlineSessionReachedDescProNoOMicro', "Set an additional budget to keep using Copilot until your limit resets."),
						budgetInput: true,
					};
				}
				return {
					title: localize('inlineSessionReachedTitle', "You've reached your Five-Hour Limit."),
					description: localize('inlineSessionReachedDescProNoO', "Resets at 10:00 AM. Set up an additional budget to continue."),
					buttonLabel: localize('configureBudget', "Manage Budget"),
				};
			}
			return {
				title: localize('inlineSessionReachedTitle', "You've reached your Five-Hour Limit."),
				description: localize('inlineSessionReachedDescPro', "Resets at 10:00 AM."),
				buttonLabel: localize('learnMore', "Learn more"),
			};
		}

		if (state === 'Weekly Reached') {
			if (sku === 'Edu/Free') {
				return {
					title: localize('inlineWeeklyReachedTitle', "You've reached your Weekly Limit."),
					description: localize('inlineWeeklyReachedDescFree', "Resets April 6 at 10:00 AM, or upgrade to increase your limits."),
					buttonLabel: localize('upgrade', "Upgrade"),
				};
			}
			if (sku === 'Pro/Pro+ No O') {
				if (this._microTransaction) {
					return {
						title: localize('inlineWeeklyReachedTitle', "You've reached your Weekly Limit."),
						description: localize('inlineWeeklyReachedDescProNoOMicro', "Set an additional budget to keep using Copilot until your limit resets."),
						budgetInput: true,
					};
				}
				return {
					title: localize('inlineWeeklyReachedTitle', "You've reached your Weekly Limit."),
					description: localize('inlineWeeklyReachedDescProNoO', "Resets April 6 at 10:00 AM. Set up an additional budget to continue."),
					buttonLabel: localize('configureBudget', "Manage Budget"),
				};
			}
			return {
				title: localize('inlineWeeklyReachedTitle', "You've reached your Weekly Limit."),
				description: localize('inlineWeeklyReachedDescPro', "Resets April 6 at 10:00 AM. Increase your budget to continue using premium models."),
				buttonLabel: localize('increaseBudget', "Increase Budget"),
			};
		}

		if (state === 'Overage Reached') {
			if (this._microTransaction) {
				return {
					title: localize('inlineOverageReachedTitle', "You've used all of your additional budget."),
					description: localize('inlineOverageReachedDescMicro', "Increase your budget to keep using Copilot."),
					budgetInput: true,
				};
			}
			return {
				title: localize('inlineOverageReachedTitle', "You've used all of your additional budget."),
				description: localize('inlineOverageReachedDesc', "Copilot is paused. Usage resumes when limits reset or budget is increased."),
				buttonLabel: localize('editBudget', "Edit Budget"),
			};
		}

		return undefined;
	}

	private static readonly INDIVIDUAL_SKUS = ['Edu/Free', 'Pro/Pro+ No O', 'Pro/Pro+', 'Max'];
	private static readonly ENTERPRISE_SKUS = ['Ent/Bus ULB', 'Ent/Bus'];
	private static readonly STATES = ['First Time', 'Default', 'Session Approached', 'Session Reached', 'Session Reset', 'Weekly Approached', 'Weekly Reached', 'Weekly Reset', 'Overage Approached', 'Overage Reached', 'Overage Reset'];
	private static readonly EXCLUDED_CELLS: ReadonlySet<string> = new Set([
		'Edu/Free|Overage Approached',
		'Edu/Free|Overage Reached',
		'Edu/Free|Overage Reset',
		'Pro/Pro+ No O|Overage Approached',
		'Pro/Pro+ No O|Overage Reached',
		'Pro/Pro+ No O|Overage Reset',
		'Max|Session Approached',
		'Max|Session Reached',
		'Max|Session Reset',
		// Enterprise: no session/weekly/overage — uses Monthly Approached/Reached/Reset via the shared state names
		'Ent/Bus ULB|Session Approached',
		'Ent/Bus ULB|Session Reached',
		'Ent/Bus ULB|Session Reset',
		'Ent/Bus ULB|Weekly Approached',
		'Ent/Bus ULB|Weekly Reached',
		'Ent/Bus ULB|Weekly Reset',
		'Ent/Bus|Session Approached',
		'Ent/Bus|Session Reached',
		'Ent/Bus|Session Reset',
		'Ent/Bus|Weekly Approached',
		'Ent/Bus|Weekly Reached',
		'Ent/Bus|Weekly Reset',
		// Regular Ent/Bus has no limit — no overage states
		'Ent/Bus|Overage Approached',
		'Ent/Bus|Overage Reached',
		'Ent/Bus|Overage Reset',
	]);

	renderController(container: HTMLElement, disposables: DisposableStore): void {
		container.className = 'copilot-prototype-coin-widget';

		// Tab bar
		const tabBar = mainWindow.document.createElement('div');
		tabBar.className = 'copilot-prototype-coin-tabs';

		const individualTab = mainWindow.document.createElement('div');
		individualTab.className = 'copilot-prototype-coin-tab active';
		individualTab.textContent = localize('tabIndividual', "Individual");
		individualTab.tabIndex = 0;
		individualTab.role = 'tab';

		const enterpriseTab = mainWindow.document.createElement('div');
		enterpriseTab.className = 'copilot-prototype-coin-tab';
		enterpriseTab.textContent = localize('tabEnterprise', "Enterprise");
		enterpriseTab.tabIndex = 0;
		enterpriseTab.role = 'tab';

		tabBar.append(individualTab, enterpriseTab);

		// Build both grids
		const states = CopilotPrototypeShellCoinStatusBarContribution.STATES;
		const individualGrid = this.buildCoinGrid(CopilotPrototypeShellCoinStatusBarContribution.INDIVIDUAL_SKUS, states, disposables);
		const enterpriseGrid = this.buildCoinGrid(CopilotPrototypeShellCoinStatusBarContribution.ENTERPRISE_SKUS, states, disposables);
		enterpriseGrid.style.display = 'none';

		// Tab switching
		individualTab.addEventListener('click', () => {
			individualTab.classList.add('active');
			enterpriseTab.classList.remove('active');
			individualGrid.style.display = '';
			enterpriseGrid.style.display = 'none';
		});
		enterpriseTab.addEventListener('click', () => {
			enterpriseTab.classList.add('active');
			individualTab.classList.remove('active');
			enterpriseGrid.style.display = '';
			individualGrid.style.display = 'none';
		});

		container.append(tabBar, individualGrid, enterpriseGrid);
	}

	private buildCoinGrid(skus: readonly string[], states: readonly string[], disposables: DisposableStore): HTMLElement {
		const excluded = CopilotPrototypeShellCoinStatusBarContribution.EXCLUDED_CELLS;
		const visibleStates = states.filter(state => !skus.every(sku => excluded.has(`${sku}|${state}`)));

		const grid = mainWindow.document.createElement('div');
		grid.className = 'copilot-prototype-coin-grid';
		grid.style.gridTemplateColumns = `auto repeat(${skus.length}, minmax(40px, 1fr))`;
		grid.style.gridTemplateRows = `auto repeat(${visibleStates.length}, 1fr)`;

		// Top-left corner: empty cell
		const corner = mainWindow.document.createElement('div');
		corner.className = 'copilot-prototype-coin-grid-corner';
		corner.textContent = localize('copilotPrototypeShellCoinGridStates', "States \\ SKU");
		grid.appendChild(corner);

		// Column headers (SKU) — as links
		for (const sku of skus) {
			const header = mainWindow.document.createElement('div');
			header.className = 'copilot-prototype-coin-grid-col-header';
			const link = mainWindow.document.createElement('a');
			link.className = 'copilot-prototype-coin-grid-link';
			link.textContent = sku;
			link.tabIndex = 0;
			link.role = 'button';
			link.addEventListener('click', () => {
				this.startAutoAdvance(sku);
			});
			header.appendChild(link);
			grid.appendChild(header);
		}

		// Rows — skip states where all SKUs in this grid are excluded
		for (const state of states) {
			const allExcluded = skus.every(sku => CopilotPrototypeShellCoinStatusBarContribution.EXCLUDED_CELLS.has(`${sku}|${state}`));
			if (allExcluded) {
				continue;
			}

			// Row header (State) — display-friendly names in the grid
			const rowHeader = mainWindow.document.createElement('div');
			rowHeader.className = 'copilot-prototype-coin-grid-row-header';
			const isEnterprise = skus.some(s => s.startsWith('Ent'));
			let displayName = state;
			if (isEnterprise) {
				displayName = displayName.replace('Overage Approached', 'Monthly Approached').replace('Overage Reached', 'Monthly Exhausted').replace('Overage Reset', 'Monthly Reset');
			} else {
				displayName = displayName.replace('Reached', 'Exhausted').replace('Session', 'Five-Hour');
			}
			rowHeader.textContent = displayName;
			grid.appendChild(rowHeader);

			// Grid cells: unlabeled buttons (skip excluded intersections)
			for (const sku of skus) {
				const cell = mainWindow.document.createElement('div');
				cell.className = 'copilot-prototype-coin-grid-cell';
				const cellKey = `${sku}|${state}`;
				if (!CopilotPrototypeShellCoinStatusBarContribution.EXCLUDED_CELLS.has(cellKey)) {
					// Pro/Pro+ and Max: all states show additional budget in dashboard, so split gray (limited) / green (full)
					const hasOverageSku = sku === 'Pro/Pro+' || sku === 'Max';

					if (hasOverageSku) {
						// Gray button: limited experience (no overage % chart)
						const grayBtn = disposables.add(new Button(cell, {
							...defaultButtonStyles,
							secondary: true,
						}));
						grayBtn.label = '';
						disposables.add(grayBtn.onDidClick(() => {
							this._autoAdvanceStates = undefined;
							this._microTransaction = false;
							this._limitedOverageView = true;
							this.setActiveCell(sku, state);
						}));

						// Green button: current full experience (with overage % chart)
						const greenBtn = disposables.add(new Button(cell, {
							...defaultButtonStyles,
							secondary: true,
						}));
						greenBtn.label = '';
						greenBtn.element.classList.add('green');
						disposables.add(greenBtn.onDidClick(() => {
							this._autoAdvanceStates = undefined;
							this._microTransaction = false;
							this._limitedOverageView = false;
							this.setActiveCell(sku, state);
						}));
					} else {
						const btn = disposables.add(new Button(cell, {
							...defaultButtonStyles,
							secondary: true,
						}));
						btn.label = '';
						disposables.add(btn.onDidClick(() => {
							this._autoAdvanceStates = undefined;
							this._microTransaction = false;
							this._limitedOverageView = false;
							this.setActiveCell(sku, state);
						}));
					}
					// Add red button for Pro/Pro+ No O exhausted states
					if (sku === 'Pro/Pro+ No O' && (state === 'Session Reached' || state === 'Weekly Reached')) {
						const redBtn = disposables.add(new Button(cell, {
							...defaultButtonStyles,
							secondary: true,
						}));
						redBtn.label = '';
						redBtn.element.classList.add('red');
						disposables.add(redBtn.onDidClick(() => {
							this._autoAdvanceStates = undefined;
							this._microTransaction = true;
							this._limitedOverageView = false;
							this.setActiveCell(sku, state);
						}));
					}
					// Add red button for Pro/Pro+ and Max overage exhausted
					if ((sku === 'Pro/Pro+' || sku === 'Max') && state === 'Overage Reached') {
						const redBtn = disposables.add(new Button(cell, {
							...defaultButtonStyles,
							secondary: true,
						}));
						redBtn.label = '';
						redBtn.element.classList.add('red');
						disposables.add(redBtn.onDidClick(() => {
							this._autoAdvanceStates = undefined;
							this._microTransaction = true;
							this._limitedOverageView = false;
							this.setActiveCell(sku, state);
						}));
					}
				}
				grid.appendChild(cell);
			}
		}

		return grid;
	}

	renderDashboard(token: CancellationToken): HTMLElement {
		const disposables = new DisposableStore();
		disposables.add(token.onCancellationRequested(() => disposables.dispose()));

		const sku = this._activeSku;
		const state = this._activeState;

		const dashboard = $('div.copilot-prototype-dashboard');

		const isEnterprise = sku === 'Ent/Bus' || sku === 'Ent/Bus ULB';

		// First Time onboarding — 3-step walkthrough
		if (state === 'First Time') {
			this.renderFirstTimeOnboarding(dashboard, disposables, sku);
			return dashboard;
		}

		if (isEnterprise) {
			const entTitle = sku === 'Ent/Bus ULB'
				? localize('dashboardTitleEntULB', "Copilot Enterprise ULB")
				: localize('dashboardTitleEnterprise', "Copilot Enterprise");

			const header = append(dashboard, $('div.copilot-prototype-dashboard-header'));
			const headerLeft = append(header, $('div.copilot-prototype-dashboard-header-left'));
			append(headerLeft, $('div.copilot-prototype-dashboard-title')).textContent = entTitle;

			const headerActions = append(header, $('div.copilot-prototype-dashboard-header-actions'));
			const settingsIcon = append(headerActions, $('div.copilot-prototype-dashboard-icon'));
			settingsIcon.append(...renderLabelWithIcons('$(settings)'));
			settingsIcon.title = localize('settings', "Settings");
			settingsIcon.tabIndex = 0;

			const contentWrapper = append(dashboard, $('div.copilot-prototype-dashboard-content-wrapper'));
			const combinedContent = append(contentWrapper, $('div.copilot-prototype-dashboard-content.active'));
			this.renderEnterpriseCombinedTab(combinedContent, disposables, sku, state);
			this.renderCollapsibleQuickSettings(contentWrapper, disposables);
			return dashboard;
		}

		// Non-enterprise: header with copilot icon + plan title, usage always visible, quick settings collapsible
		let planTitle: string;
		switch (sku) {
			case 'Edu/Free': planTitle = localize('dashboardTitleFree', "Copilot Free"); break;
			case 'Pro/Pro+ No O': planTitle = localize('dashboardTitleProNoO', "Copilot Pro"); break;
			case 'Pro/Pro+': planTitle = localize('dashboardTitlePro', "Copilot Pro+"); break;
			case 'Max': planTitle = localize('dashboardTitleMax', "Copilot Max"); break;
			default: planTitle = localize('dashboardTitleDefault', "Copilot"); break;
		}

		const header = append(dashboard, $('div.copilot-prototype-dashboard-header'));
		const headerLeft = append(header, $('div.copilot-prototype-dashboard-header-left'));
		append(headerLeft, $('div.copilot-prototype-dashboard-title')).textContent = planTitle;

		const titleActions = append(header, $('div.copilot-prototype-dashboard-header-actions'));
		const settingsIcon = append(titleActions, $('div.copilot-prototype-dashboard-icon'));
		settingsIcon.append(...renderLabelWithIcons('$(settings)'));
		settingsIcon.title = localize('settings', "Settings");
		settingsIcon.tabIndex = 0;

		// Usage content (always visible)
		const contentWrapper = append(dashboard, $('div.copilot-prototype-dashboard-content-wrapper'));
		const copilotContent = append(contentWrapper, $('div.copilot-prototype-dashboard-content.active'));
		this.renderCopilotTab(copilotContent, disposables, sku, state);

		// Collapsible Quick Settings section
		this.renderCollapsibleQuickSettings(contentWrapper, disposables);

		return dashboard;
	}

	private getFirstTimeSteps(sku: string): { title: string; description: string; cta?: string }[] {
		const isEnterprise = sku === 'Ent/Bus' || sku === 'Ent/Bus ULB';
		const isFree = sku === 'Edu/Free';
		const isMax = sku === 'Max';
		const hasOverage = sku === 'Pro/Pro+' || sku === 'Max';
		const isNoO = sku === 'Pro/Pro+ No O';

		if (isEnterprise) {
			return [
				{
					title: localize('ftEntMonthlyTitle', "Included credits"),
					description: localize('ftEntMonthlyDesc', "Your organization sets a monthly usage limit for AI credits. Usage resets at the start of each billing cycle. Copilot pauses when you reach a limit."),
				},
				{
					title: localize('ftEntInlineTitle', "Inline suggestions"),
					description: localize('ftEntInlineDesc', "Code completions and next edit suggestions are included with your plan and don't count toward your included credits."),
				},
				{
					title: localize('ftEntDashboardTitle', "Usage dashboard"),
					description: localize('ftEntDashboardDesc', "Track your usage anytime from the Copilot menu. Contact your administrator if you need a higher limit."),
				},
			];
		}

		const steps: { title: string; description: string; cta?: string }[] = [];

		// Step 1: Session limit
		if (isMax) {
			// Max has no session limit — show weekly as step 1
			steps.push({
				title: localize('ftWeeklyTitle', "Weekly limit"),
				description: localize('ftWeeklyDescOverage', "Usage limit per 7-day period, resets automatically. Continue uninterrupted with pay-as-you-go additional budget when weekly limit is hit."),
			});
		} else {
			steps.push({
				title: localize('ftSessionTitle', "Session limit"),
				description: isFree
					? localize('ftSessionDescFree', "Usage limit per 5-hour session, resets automatically. Session usage counts toward your weekly limit. Copilot pauses when you reach a limit.")
					: hasOverage
						? localize('ftSessionDescOverage', "Usage limit per 5-hour session, resets automatically. Session usage counts toward your weekly limit. Continue uninterrupted with pay-as-you-go additional budget when session limit is hit.")
						: localize('ftSessionDescPro', "Usage limit per 5-hour session, resets automatically. Session usage counts toward your weekly limit. Copilot pauses when you reach a limit."),
			});
		}

		// Step 2: Weekly limit (or overage for Max since weekly was step 1)
		if (isMax) {
			steps.push({
				title: localize('ftOverageTitle', "Additional budget"),
				description: localize('ftOverageDesc', "Pay-as-you-go spend on additional usage when you hit session and weekly limits. Set a limit to cap your maximum monthly spend."),
			});
		} else {
			steps.push({
				title: localize('ftWeeklyTitle', "Weekly limit"),
				description: isFree
					? localize('ftWeeklyDescFree', "Usage limit per 7-day period, resets automatically. Copilot pauses when you reach a limit. Upgrade to increase your limits.")
					: hasOverage
						? localize('ftWeeklyDescOverage', "Usage limit per 7-day period, resets automatically. Continue uninterrupted with pay-as-you-go additional budget when weekly limit is hit.")
						: localize('ftWeeklyDescPro', "Usage limit per 7-day period, resets automatically. Copilot pauses when you reach a limit."),
			});
		}

		// Step 3: Overage spend / Budget
		if (isFree) {
			steps.push({
				title: localize('ftOverageTitle', "Additional budget"),
				description: localize('ftOverageDescFree', "Pay-as-you-go spend on additional usage when you hit session and weekly limits. Set a limit to cap your maximum monthly spend. Available on Pro and higher plans."),
			});
		} else if (isNoO) {
			steps.push({
				title: localize('ftBudgetTitle', "Additional budget"),
				description: localize('ftBudgetDescNoO', "Configure a monthly budget to keep using Copilot when your included limits are reached. You only pay for what you use."),
				cta: localize('ftConfigureBudget', "Manage Budget"),
			});
		} else if (!isMax) {
			// Pro/Pro+ with overage — overage already shown inline, just explain the dashboard
			steps.push({
				title: localize('ftOverageTitle', "Additional budget"),
				description: this._limitedOverageView
					? localize('ftOverageDescLimited', "Pay-as-you-go spend on additional usage when you hit session and weekly limits. Manage your additional budget from your account settings.")
					: localize('ftOverageDesc', "Pay-as-you-go spend on additional usage when you hit session and weekly limits. Set a limit to cap your maximum monthly spend."),
			});
		} else {
			// Max — step 3: dashboard guidance
			steps.push({
				title: localize('ftDashboardTitle', "Usage dashboard"),
				description: this._limitedOverageView
					? localize('ftDashboardDescLimited', "Track your usage anytime from the Copilot menu. Manage your additional budget from your account settings.")
					: localize('ftDashboardDesc', "Track your usage, manage your additional budget, and adjust settings anytime from the Copilot menu."),
			});
		}

		return steps;
	}

	private renderFirstTimeOnboarding(dashboard: HTMLElement, disposables: DisposableStore, sku: string): void {
		const contentContainer = append(dashboard, $('div.copilot-prototype-ft-container'));
		const stepDisposables = disposables.add(new DisposableStore());

		const renderStep = () => {
			stepDisposables.clear();
			contentContainer.textContent = '';

			const steps = this.getFirstTimeSteps(sku);
			const totalSteps = steps.length;
			const currentStep = Math.min(this._firstTimeStep, totalSteps);
			const stepData = steps[currentStep - 1];

			// Header
			const header = append(contentContainer, $('div.copilot-prototype-dashboard-header'));
			const titleText = append(header, $('div.copilot-prototype-dashboard-title'));
			titleText.textContent = localize('ftTitle', "AI Credits");

			const stepIndicator = append(header, $('div.copilot-prototype-dashboard-step-indicator'));
			stepIndicator.textContent = localize('ftStep', "Step {0} of {1}", currentStep, totalSteps);

			// Onboarding card
			const card = append(contentContainer, $('div.copilot-prototype-ft-card'));

			const cardTitle = append(card, $('div.copilot-prototype-ft-card-title'));
			cardTitle.textContent = stepData.title;

			const cardDesc = append(card, $('div.copilot-prototype-ft-card-desc'));
			cardDesc.textContent = stepData.description;

			// CTA button inside card (for Free upgrade / No O configure)
			if (stepData.cta) {
				const ctaBtn = stepDisposables.add(new Button(card, { ...defaultButtonStyles, secondary: true }));
				ctaBtn.label = stepData.cta;
				ctaBtn.element.style.marginTop = '8px';
				stepDisposables.add(ctaBtn.onDidClick(() => this.advanceState()));
			}

			// Step dots
			const dotsRow = append(contentContainer, $('div.copilot-prototype-ft-dots'));
			for (let i = 1; i <= totalSteps; i++) {
				const dot = append(dotsRow, $('div.copilot-prototype-ft-dot'));
				if (i === currentStep) {
					dot.classList.add('active');
				} else if (i < currentStep) {
					dot.classList.add('completed');
				}
			}

			// Action buttons
			const actions = append(contentContainer, $('div.copilot-prototype-ft-actions'));

			if (currentStep < totalSteps) {
				const nextBtn = stepDisposables.add(new Button(actions, { ...defaultButtonStyles }));
				nextBtn.label = localize('ftNext', "Next");
				stepDisposables.add(nextBtn.onDidClick(() => {
					this._firstTimeStep = currentStep + 1;
					renderStep();
				}));
			} else {
				const gotItBtn = stepDisposables.add(new Button(actions, { ...defaultButtonStyles }));
				gotItBtn.label = localize('ftGotIt', "Got it");
				stepDisposables.add(gotItBtn.onDidClick(() => {
					this._firstTimeStep = 1;
					this.setActiveCell(this._activeSku, 'Default');
				}));
			}

			if (currentStep > 1) {
				const backBtn = stepDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
				backBtn.label = localize('ftBack', "Back");
				stepDisposables.add(backBtn.onDidClick(() => {
					this._firstTimeStep = currentStep - 1;
					renderStep();
				}));
			}
		};

		renderStep();
	}

	private renderCopilotTab(content: HTMLElement, disposables: DisposableStore, sku: string, state: string): void {
		const isPro = sku !== 'Edu/Free';
		const hasOverage = sku === 'Pro/Pro+' || sku === 'Max';
		const isMax = sku === 'Max';

		// Pro/Pro+ with overage has fundamentally different behavior
		if (hasOverage) {
			this.renderProOverageCopilotTab(content, disposables, sku, state);
			return;
		}

		// --- Gauge cards row ---
		const cards = append(content, $('div.copilot-prototype-dashboard-cards'));

		// Inline Suggestions card (Free only) — first card
		if (!isPro) {
			this.createCard(cards, {
				name: localize('cardInlineSuggestions', "Inline Suggestions"),
				resetLabel: localize('cardResetApr24Inline', "Resets April 24 at 10:00 AM"),
				percent: 12,
			});
		}

		// Five-Hour Limit card (Max has no session limit)
		const isResetState = state === 'Session Reset' || state === 'Weekly Reset';
		if (!isMax) {
			const sessionReached = state === 'Session Reached' || state === 'Weekly Reached';
			const sessionApproached = state === 'Session Approached';
			const sessionPct = sessionApproached ? 75 : sessionReached ? 100 : isResetState ? 0 : 18;
			this.createCard(cards, {
				name: localize('cardFiveHour', "Five-Hour Limit"),
				resetLabel: localize('cardResetAt10', "Resets at 10:00 AM"),
				percent: sessionPct,
				severity: sessionApproached ? 'warning' : undefined,
				highlight: sessionApproached,
				disabled: sessionReached,
			});
		}

		// Weekly Limit card
		const weeklyReached = state === 'Weekly Reached';
		const weeklyApproached = state === 'Weekly Approached';
		const weeklyPct = weeklyApproached ? 75 : (weeklyReached || state === 'Session Reached') ? 100 : (state === 'Weekly Reset') ? 0 : 56;
		this.createCard(cards, {
			name: localize('cardWeekly', "Weekly Limit"),
			resetLabel: localize('cardResetApr6', "Resets April 6 at 10:00 AM"),
			percent: weeklyPct,
			severity: weeklyApproached ? 'warning' : undefined,
			highlight: weeklyApproached,
			disabled: weeklyReached || state === 'Session Reached',
		});

		// --- Warning callout ---
		if (state === 'Session Approached' || state === 'Weekly Approached') {
			const warning = append(content, $('div.copilot-prototype-dashboard-warning'));
			const warningIcon = append(warning, $('span.copilot-prototype-dashboard-warning-icon'));
			warningIcon.append(...renderLabelWithIcons('$(warning)'));
			const warningBody = append(warning, $('span.copilot-prototype-dashboard-warning-text'));
			if (isPro) {
				warningBody.appendChild(mainWindow.document.createTextNode(localize('cardApproachWarningPro', "Copilot will pause at the limit. Upgrade or manage additional budget to continue. ")));
			} else {
				warningBody.appendChild(mainWindow.document.createTextNode(localize('cardApproachWarning', "Copilot will pause when the limit is reached. ")));
			}
			const learnMore = append(warningBody, $('a.copilot-prototype-coin-grid-link'));
			learnMore.textContent = localize('learnMore', "Learn more");
			learnMore.tabIndex = 0;
		} else if (state === 'Session Reached' || state === 'Weekly Reached') {
			const warning = append(content, $('div.copilot-prototype-dashboard-warning.error'));
			const warningIcon = append(warning, $('span.copilot-prototype-dashboard-warning-icon.error'));
			warningIcon.append(...renderLabelWithIcons('$(error)'));
			const warningBody = append(warning, $('span.copilot-prototype-dashboard-warning-text'));
			if (isPro) {
				warningBody.appendChild(mainWindow.document.createTextNode(localize('cardReachedWarningPro', "Copilot is paused until the limit resets. Upgrade or manage additional budget to continue. ")));
			} else {
				warningBody.appendChild(mainWindow.document.createTextNode(localize('cardReachedWarning', "Copilot is paused until the limit resets. ")));
			}
			const learnMore = append(warningBody, $('a.copilot-prototype-coin-grid-link'));
			learnMore.textContent = localize('learnMore', "Learn more");
			learnMore.tabIndex = 0;
		} else if (isResetState) {
			this.createInfoMessage(content, localize('resetAvailableAgain', "Copilot is available. Start building."), true);
		}

		// --- Footer row ---
		// Default state has no CTAs across all SKUs (per UX direction).
		if (state === 'Default' || state === 'First Time') {
			return;
		}
		const footer = append(content, $('div.copilot-prototype-dashboard-footer'));
		const footerLabel = append(footer, $('div.copilot-prototype-dashboard-footer-label'));

		if (isPro && this._microTransaction && (state === 'Session Reached' || state === 'Weekly Reached')) {
			const footerActions = append(footer, $('div.copilot-prototype-dashboard-footer-actions'));
			for (const amount of ['+$5', '+$10', '+$20']) {
				const btn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
				btn.label = amount;
				disposables.add(btn.onDidClick(() => this.advanceState()));
			}
		} else if (isPro) {
			footerLabel.appendChild(mainWindow.document.createTextNode(localize('footerProManageDesc', "No additional budget currently in use.")));
			const footerActions = append(footer, $('div.copilot-prototype-dashboard-footer-actions'));
			const configBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
			configBtn.label = localize('manageBudget', "Manage Budget");
			disposables.add(configBtn.onDidClick(() => this.advanceState()));
		} else {
			footerLabel.appendChild(mainWindow.document.createTextNode(localize('footerFreeUpgrade', "Upgrade for higher limits and additional budgets")));
			const footerActions = append(footer, $('div.copilot-prototype-dashboard-footer-actions'));
			const upgradeBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
			upgradeBtn.label = localize('upgrade', "Upgrade");
			disposables.add(upgradeBtn.onDidClick(() => this.advanceState()));
		}
	}

	private renderProOverageCopilotTab(content: HTMLElement, disposables: DisposableStore, sku: string, state: string): void {
		if (this._limitedOverageView) {
			this.renderProOverageLimitedCopilotTab(content, disposables, sku, state);
			return;
		}

		const isOverageInUse = state === 'Session Reached' || state === 'Weekly Reached' || state === 'Overage Approached' || state === 'Overage Reached';
		const isMax = sku === 'Max';
		const isResetState = state === 'Session Reset' || state === 'Weekly Reset' || state === 'Overage Reset';

		// --- Gauge cards row ---
		const cards = append(content, $('div.copilot-prototype-dashboard-cards'));

		// Five-Hour Limit card (Max has no session limit)
		if (!isMax) {
			const sessionPct = (state === 'Session Approached') ? 75 : (state === 'Session Reached' || state === 'Weekly Reached' || state === 'Overage Approached' || state === 'Overage Reached') ? 100 : isResetState ? 0 : 18;
			const sessionDisabled = state === 'Session Reached' || state === 'Weekly Reached' || state === 'Overage Approached' || state === 'Overage Reached';
			const sessionHighlight = state === 'Session Approached';
			this.createCard(cards, {
				name: localize('cardFiveHour', "Five-Hour Limit"),
				resetLabel: localize('cardResetAt10', "Resets at 10:00 AM"),
				percent: sessionPct,
				severity: sessionHighlight ? 'info' : undefined,
				highlight: sessionHighlight,
				disabled: sessionDisabled,
			});
		}

		// Weekly Limit card
		const weeklyPct = (state === 'Weekly Approached') ? 75 : (state === 'Weekly Reached' || state === 'Session Reached' || state === 'Overage Approached' || state === 'Overage Reached') ? 100 : (state === 'Weekly Reset' || state === 'Overage Reset') ? 0 : 56;
		const weeklyDisabled = state === 'Weekly Reached' || state === 'Session Reached' || state === 'Overage Approached' || state === 'Overage Reached';
		const weeklyHighlight = state === 'Weekly Approached';
		this.createCard(cards, {
			name: localize('cardWeekly', "Weekly Limit"),
			resetLabel: localize('cardResetApr6', "Resets April 6 at 10:00 AM"),
			percent: weeklyPct,
			severity: weeklyHighlight ? 'info' : undefined,
			highlight: weeklyHighlight,
			disabled: weeklyDisabled,
		});

		// Additional Budget card
		const overagePct = (state === 'Overage Approached') ? 75 : (state === 'Overage Reached') ? 100 : isResetState ? 0 : isOverageInUse ? 22 : 22;
		const overageApproached = state === 'Overage Approached';
		const overageReached = state === 'Overage Reached';
		const overageSev = overageApproached ? 'warning' as const : overageReached ? 'error' as const : undefined;
		const overageStatusBadge = isOverageInUse ? localize('badgeInUse', "In use") : localize('badgeNotInUse', "Not in use");
		this.createCard(cards, {
			name: localize('cardRunover', "Additional Budget"),
			resetLabel: localize('cardResetMay1', "Resets May 1 at 10:00 AM"),
			percent: overagePct,
			severity: overageSev,
			disabled: !isOverageInUse && !isResetState,
			statusBadge: overageStatusBadge,
			highlight: overageApproached || overageReached,
		});

		// --- Warning callout ---
		if (state === 'Session Approached' || state === 'Weekly Approached') {
			this.createInfoMessage(content, localize('proApproachInfo', "Once the limit is reached, your additional budget will be used until it resets."));
		} else if (state === 'Session Reached' || state === 'Weekly Reached') {
			this.createInfoMessage(content, localize('proReachedInfo', "Using additional budget until limits reset."), true);
		} else if (state === 'Overage Approached') {
			const warning = append(content, $('div.copilot-prototype-dashboard-warning'));
			const warningIcon = append(warning, $('span.copilot-prototype-dashboard-warning-icon'));
			warningIcon.append(...renderLabelWithIcons('$(warning)'));
			const warningBody = append(warning, $('span.copilot-prototype-dashboard-warning-text'));
			warningBody.appendChild(mainWindow.document.createTextNode(localize('proOverageApproachWarning2', "Once your additional budget runs out, Copilot will pause. Usage resumes when limits reset. ")));
			const learnMore = append(warningBody, $('a.copilot-prototype-coin-grid-link'));
			learnMore.textContent = localize('learnMore', "Learn more");
			learnMore.tabIndex = 0;
		} else if (state === 'Overage Reached') {
			const warning = append(content, $('div.copilot-prototype-dashboard-warning.error'));
			const warningIcon = append(warning, $('span.copilot-prototype-dashboard-warning-icon.error'));
			warningIcon.append(...renderLabelWithIcons('$(error)'));
			const warningBody = append(warning, $('span.copilot-prototype-dashboard-warning-text'));
			warningBody.appendChild(mainWindow.document.createTextNode(localize('proOverageReachedWarning2', "Copilot is paused. Usage resumes when limits reset or additional budget is increased. ")));
			const learnMore = append(warningBody, $('a.copilot-prototype-coin-grid-link'));
			learnMore.textContent = localize('learnMore', "Learn more");
			learnMore.tabIndex = 0;
		} else if (isResetState) {
			this.createInfoMessage(content, localize('resetAvailableAgain', "Copilot is available. Start building."), true);
		}

		// --- Footer row ---
		// Default state has no CTAs (per UX direction).
		if (state === 'Default' || state === 'First Time') {
			return;
		}
		const footer = append(content, $('div.copilot-prototype-dashboard-footer'));
		if (isMax) {
			const overageActiveDesc = isOverageInUse
				? localize('maxOverageDescActive', "Additional budget is active.")
				: localize('maxOverageDescInactive', "No additional budget currently in use.");
			append(footer, $('div.copilot-prototype-dashboard-footer-label')).textContent = overageActiveDesc;
		}
		const footerActions = append(footer, $('div.copilot-prototype-dashboard-footer-actions'));
		if (this._microTransaction && state === 'Overage Reached') {
			for (const amount of ['+$5', '+$10', '+$20']) {
				const btn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
				btn.label = amount;
				disposables.add(btn.onDidClick(() => this.advanceState()));
			}
		} else {
			if (!isMax) {
				const upgradeBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
				upgradeBtn.label = localize('upgrade', "Upgrade");
				disposables.add(upgradeBtn.onDidClick(() => this.advanceState()));
			}
			const manageBudgetBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
			manageBudgetBtn.label = localize('manageBudget', "Manage Budget");
			disposables.add(manageBudgetBtn.onDidClick(() => this.advanceState()));
		}
	}

	/**
	 * Limited overage view — we can't show overage spend % at all.
	 * Shows session/weekly limit cards with correct state, but no additional budget card.
	 * Overage states show just warnings without gauge.
	 */
	private renderProOverageLimitedCopilotTab(content: HTMLElement, disposables: DisposableStore, sku: string, state: string): void {
		const isMax = sku === 'Max';
		const isOverageState = state === 'Overage Approached' || state === 'Overage Reached';
		const isResetState = state === 'Session Reset' || state === 'Weekly Reset' || state === 'Overage Reset';

		// --- Gauge cards row (session + weekly only, no overage card) ---
		const cards = append(content, $('div.copilot-prototype-dashboard-cards'));

		// Five-Hour Limit card (Max has no session limit)
		if (!isMax) {
			const sessionPct = (state === 'Session Approached') ? 75
				: (state === 'Session Reached' || state === 'Weekly Reached' || isOverageState) ? 100
					: isResetState ? 0 : 18;
			const sessionHighlight = state === 'Session Approached';
			const sessionDisabled = state === 'Session Reached' || state === 'Weekly Reached' || isOverageState;
			this.createCard(cards, {
				name: localize('cardFiveHour', "Five-Hour Limit"),
				resetLabel: localize('cardResetAt10', "Resets at 10:00 AM"),
				percent: sessionPct,
				severity: sessionHighlight ? 'info' : undefined,
				highlight: sessionHighlight,
				disabled: sessionDisabled,
			});
		}

		// Weekly Limit card
		const weeklyPct = (state === 'Weekly Approached') ? 75
			: (state === 'Weekly Reached' || state === 'Session Reached' || isOverageState) ? 100
				: (state === 'Weekly Reset' || state === 'Overage Reset') ? 0 : 56;
		const weeklyHighlight = state === 'Weekly Approached';
		const weeklyDisabled = state === 'Weekly Reached' || state === 'Session Reached' || isOverageState;
		this.createCard(cards, {
			name: localize('cardWeekly', "Weekly Limit"),
			resetLabel: localize('cardResetApr6', "Resets April 6 at 10:00 AM"),
			percent: weeklyPct,
			severity: weeklyHighlight ? 'info' : undefined,
			highlight: weeklyHighlight,
			disabled: weeklyDisabled,
		});

		// --- Warning/info messages ---
		if (state === 'Session Approached' || state === 'Weekly Approached') {
			this.createInfoMessage(content, localize('limitedApproachInfo', "Once the limit is reached, your additional budget will be used."));
		} else if (state === 'Session Reached' || state === 'Weekly Reached') {
			this.createInfoMessage(content, localize('limitedReachedInfo', "Using additional budget until limits reset."), true);
		} else if (state === 'Overage Approached') {
			this.createInfoMessage(content, localize('limitedOverageActiveInfo', "Using additional budget until limits reset."), true);
		} else if (state === 'Overage Reached') {
			const warning = append(content, $('div.copilot-prototype-dashboard-warning.error'));
			const warningIcon = append(warning, $('span.copilot-prototype-dashboard-warning-icon.error'));
			warningIcon.append(...renderLabelWithIcons('$(error)'));
			const warningBody = append(warning, $('span.copilot-prototype-dashboard-warning-text'));
			warningBody.appendChild(mainWindow.document.createTextNode(localize('limitedOverageExhaustedWarning', "Copilot is paused. Usage resumes when limits reset or additional budget is increased.")));
		} else if (isResetState) {
			this.createInfoMessage(content, localize('resetAvailableAgain', "Copilot is available. Start building."), true);
		}

		// --- Footer row ---
		// Default state has no CTAs (per UX direction).
		if (state === 'Default' || state === 'First Time') {
			return;
		}
		const footer = append(content, $('div.copilot-prototype-dashboard-footer'));
		if (isMax) {
			const overageActiveDesc = isOverageState
				? localize('maxOverageDescActive', "Additional budget is active.")
				: localize('maxOverageDescInactive', "No additional budget currently in use.");
			append(footer, $('div.copilot-prototype-dashboard-footer-label')).textContent = overageActiveDesc;
		}
		const footerActions = append(footer, $('div.copilot-prototype-dashboard-footer-actions'));
		if (!isMax) {
			const upgradeBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
			upgradeBtn.label = localize('upgrade', "Upgrade");
			disposables.add(upgradeBtn.onDidClick(() => this.advanceState()));
		}
		const manageBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
		manageBtn.label = localize('manageBudget', "Manage Budget");
		disposables.add(manageBtn.onDidClick(() => this.advanceState()));
	}

	private createInfoMessage(container: HTMLElement, message: string, highlight?: boolean): void {
		const info = append(container, $('div.copilot-prototype-dashboard-info'));
		if (highlight) {
			info.classList.add('highlight');
		}
		const infoIcon = append(info, $('span.copilot-prototype-dashboard-info-icon'));
		infoIcon.append(...renderLabelWithIcons('$(info)'));
		const infoBody = append(info, $('span.copilot-prototype-dashboard-info-text'));
		infoBody.appendChild(mainWindow.document.createTextNode(message + ' '));
		const learnMore = append(infoBody, $('a.copilot-prototype-coin-grid-link'));
		learnMore.textContent = localize('learnMore', "Learn more");
		learnMore.tabIndex = 0;
		learnMore.role = 'link';
	}

	private renderInlineTab(content: HTMLElement, disposables: DisposableStore, _sku: string, _state: string): void {
		// Workspace Index (mock)
		const wsIndex = append(content, $('div.copilot-prototype-dashboard-ws-index'));
		const wsHeader = append(wsIndex, $('div.copilot-prototype-dashboard-ws-index-header'));
		append(wsHeader, $('span.copilot-prototype-dashboard-ws-index-label')).textContent = localize('wsIndexLabel', "Workspace Index");
		const wsStatus = append(wsHeader, $('span.copilot-prototype-dashboard-ws-index-status'));
		wsStatus.append(...renderLabelWithIcons('$(check) ' + localize('wsIndexReady', "Ready")));

		// Settings — two-column layout
		const settingsGrid = append(content, $('div.copilot-prototype-dashboard-settings-grid'));

		// Left column: checkboxes
		const leftCol = append(settingsGrid, $('div.copilot-prototype-dashboard-settings-col'));

		const allFilesCheckbox = disposables.add(new Checkbox(localize('allFiles', "All files"), true, { ...defaultCheckboxStyles }));
		const allFilesRow = append(leftCol, $('div.copilot-prototype-dashboard-setting-row'));
		allFilesRow.appendChild(allFilesCheckbox.domNode);
		append(allFilesRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('allFiles', "All files");

		const tsCheckbox = disposables.add(new Checkbox(localize('typescript', "TypeScript"), true, { ...defaultCheckboxStyles }));
		const tsRow = append(leftCol, $('div.copilot-prototype-dashboard-setting-row'));
		tsRow.appendChild(tsCheckbox.domNode);
		append(tsRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('typescript', "TypeScript");

		const nesCheckbox = disposables.add(new Checkbox(localize('nextEditSuggestions', "Next edit suggestions"), true, { ...defaultCheckboxStyles }));
		const nesRow = append(leftCol, $('div.copilot-prototype-dashboard-setting-row'));
		nesRow.appendChild(nesCheckbox.domNode);
		append(nesRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('nesShortLabel', "NES");

		// Eagerness — full-width row above snooze
		const eagernessRow = append(content, $('div.copilot-prototype-dashboard-dropdown-row'));
		append(eagernessRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('eagerness', "Eagerness");
		const eagernessSelect = append(eagernessRow, $('select.copilot-prototype-dashboard-select'));
		for (const opt of ['Auto', 'Low', 'Medium', 'High']) {
			const option = append(eagernessSelect, $('option'));
			option.textContent = opt;
			option.setAttribute('value', opt);
		}

		// Snooze — label on left, button on right
		const snoozeRow = append(content, $('div.copilot-prototype-dashboard-snooze'));
		append(snoozeRow, $('span.copilot-prototype-dashboard-snooze-label')).textContent = localize('hideSuggestions', "Hide suggestions for 5 min");
		const snoozeBtn = disposables.add(new Button(snoozeRow, { ...defaultButtonStyles, secondary: true }));
		snoozeBtn.label = localize('snooze', "Snooze");
	}

	private renderCollapsibleQuickSettings(container: HTMLElement, disposables: DisposableStore): void {
		const collapsibleHeader = append(container, $('button.copilot-prototype-dashboard-collapsible-header'));
		collapsibleHeader.setAttribute('aria-expanded', 'false');
		append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-label')).textContent = localize('tab.quickSettings', "Quick Settings");
		const chevronEl = append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-chevron'));
		chevronEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));

		const collapsibleContent = append(container, $('div.copilot-prototype-dashboard-collapsible-content'));
		this.renderInlineTab(collapsibleContent, disposables, '', '');

		collapsibleHeader.addEventListener('click', () => {
			const isExpanded = collapsibleContent.classList.toggle('expanded');
			chevronEl.className = 'copilot-prototype-dashboard-collapsible-chevron';
			chevronEl.classList.add(...ThemeIcon.asClassNameArray(isExpanded ? Codicon.chevronDown : Codicon.chevronRight));
			collapsibleHeader.setAttribute('aria-expanded', String(isExpanded));
		});
	}

	private renderEnterpriseCombinedTab(content: HTMLElement, disposables: DisposableStore, _sku: string, _state: string): void {
		const isULB = _sku === 'Ent/Bus ULB';
		const cards = append(content, $('div.copilot-prototype-dashboard-cards'));

		if (isULB) {
			// ULB: Monthly Limit card — state-aware
			const monthlyApproached = _state === 'Overage Approached';
			const monthlyReached = _state === 'Overage Reached';
			const monthlyPct = monthlyApproached ? 75 : monthlyReached ? 100 : (_state === 'Overage Reset') ? 0 : 56;
			this.createCard(cards, {
				name: localize('cardMonthlyLimit', "Credits"),
				resetLabel: localize('cardResetMay1Monthly', "Resets May 1 at 10:00 AM"),
				percent: monthlyPct,
				severity: monthlyApproached ? 'warning' as const : undefined,
				highlight: monthlyApproached,
				disabled: monthlyReached,
			});
		} else {
			// Regular Ent/Bus: everything included, single card
			this.createCard(cards, {
				name: localize('cardUsageEnt', "AI Credits & Inline Suggestions"),
				resetLabel: '',
				percent: 0,
				includedMessage: localize('cardEntAllIncludedMsg', "Included with your organization's plan."),
			});
		}

		// Warning callout (ULB only)
		if (isULB && _state === 'Overage Approached') {
			const warning = append(content, $('div.copilot-prototype-dashboard-warning'));
			const warningIcon = append(warning, $('span.copilot-prototype-dashboard-warning-icon'));
			warningIcon.append(...renderLabelWithIcons('$(warning)'));
			const warningBody = append(warning, $('div.copilot-prototype-dashboard-warning-text'));
			warningBody.appendChild(mainWindow.document.createTextNode(localize('entMonthlyApproachWarning', "Copilot will pause when the limit is reached.")));
			const adminRow = append(warningBody, $('div.copilot-prototype-dashboard-warning-admin-row'));
			const requestBtn = append(adminRow, $('button.copilot-prototype-dashboard-warning-admin-btn'));
			requestBtn.textContent = localize('requestMoreUsage', "Request More Usage");
			requestBtn.addEventListener('click', () => this.advanceState());
		} else if (isULB && _state === 'Overage Reached') {
			const warning = append(content, $('div.copilot-prototype-dashboard-warning.error'));
			const warningIcon = append(warning, $('span.copilot-prototype-dashboard-warning-icon.error'));
			warningIcon.append(...renderLabelWithIcons('$(error)'));
			const warningBody = append(warning, $('div.copilot-prototype-dashboard-warning-text'));
			warningBody.appendChild(mainWindow.document.createTextNode(localize('entMonthlyReachedWarning', "Copilot is paused until the limit resets.")));
			const adminRow = append(warningBody, $('div.copilot-prototype-dashboard-warning-admin-row'));
			const requestBtn = append(adminRow, $('button.copilot-prototype-dashboard-warning-admin-btn'));
			requestBtn.textContent = localize('requestMoreUsage', "Request More Usage");
			requestBtn.addEventListener('click', () => this.advanceState());
		} else if (isULB && _state === 'Overage Reset') {
			this.createInfoMessage(content, localize('resetAvailableAgain', "Copilot is available. Start building."), true);
		}

	}

	private createCard(container: HTMLElement, opts: {
		name: string;
		resetLabel: string;
		percent: number;
		severity?: 'warning' | 'error' | 'info';
		disabled?: boolean;
		statusBadge?: string;
		highlight?: boolean;
		detail?: string;
		includedMessage?: string;
		/** Optional absolute usage line shown next to the % (e.g. "750 / 1000 AICs"). */
		usedLabel?: string;
		/** When set, render a large number + label instead of a % + bar (used when we don't know the upper bound). */
		valueOnly?: { value: string; label: string };
	}): void {
		const card = append(container, $('div.copilot-prototype-dashboard-card'));
		if (opts.disabled) {
			card.classList.add('disabled');
		}
		if (opts.highlight) {
			card.classList.add('highlight');
			if (opts.severity) {
				card.classList.add(opts.severity);
			}
		}

		// Title row: name + status text (right-aligned)
		const titleRow = append(card, $('div.copilot-prototype-dashboard-card-title'));
		append(titleRow, $('span.copilot-prototype-dashboard-card-name')).textContent = opts.name;
		if (opts.statusBadge) {
			const statusText = append(titleRow, $('span.copilot-prototype-dashboard-card-status'));
			statusText.textContent = opts.statusBadge;
		}

		// Included cards: show message instead of percent + bar
		if (opts.includedMessage) {
			const msg = append(card, $('div.copilot-prototype-dashboard-card-included'));
			msg.textContent = opts.includedMessage;
			return;
		}

		// Value-only cards: render a large number + label, no progress bar.
		// Used when we don't know the upper bound (e.g. additional budget AICs spent).
		if (opts.valueOnly) {
			const valueRow = append(card, $('div.copilot-prototype-dashboard-card-percent'));
			const valueLeft = append(valueRow, $('div.copilot-prototype-dashboard-card-percent-left'));
			const valueEl = append(valueLeft, $('span.copilot-prototype-dashboard-card-percent-value'));
			valueEl.textContent = opts.valueOnly.value;
			if (opts.severity) {
				valueEl.classList.add(opts.severity);
			}
			append(valueLeft, $('span.copilot-prototype-dashboard-card-percent-label')).textContent = opts.valueOnly.label;
			const resetBadge = append(valueRow, $('span.copilot-prototype-dashboard-card-badge'));
			resetBadge.textContent = opts.resetLabel;
			if (opts.detail) {
				append(card, $('div.copilot-prototype-dashboard-card-detail')).textContent = opts.detail;
			}
			return;
		}

		// Large percentage + reset badge
		const percentRow = append(card, $('div.copilot-prototype-dashboard-card-percent'));
		const percentLeft = append(percentRow, $('div.copilot-prototype-dashboard-card-percent-left'));
		const percentValue = append(percentLeft, $('span.copilot-prototype-dashboard-card-percent-value'));
		percentValue.textContent = `${opts.percent}%`;
		if (opts.severity) {
			percentValue.classList.add(opts.severity);
		}
		append(percentLeft, $('span.copilot-prototype-dashboard-card-percent-label')).textContent = localize('cardUsed', "used");
		if (opts.usedLabel) {
			const usedLine = append(percentLeft, $('span.copilot-prototype-dashboard-card-percent-aics'));
			usedLine.textContent = opts.usedLabel;
		}
		const resetBadge = append(percentRow, $('span.copilot-prototype-dashboard-card-badge'));
		resetBadge.textContent = opts.resetLabel;

		// Progress bar
		const barContainer = append(card, $('div.copilot-prototype-dashboard-card-bar'));
		if (opts.severity) {
			barContainer.classList.add(opts.severity);
		}
		if (opts.percent >= 100) {
			barContainer.classList.add('full');
		}
		const barFill = append(barContainer, $('div.copilot-prototype-dashboard-card-bar-fill'));
		barFill.style.width = `${opts.percent}%`;

		// Optional detail text
		if (opts.detail) {
			append(card, $('div.copilot-prototype-dashboard-card-detail')).textContent = opts.detail;
		}
	}
}

registerWorkbenchContribution2(CopilotPrototypeShellCoinStatusBarContribution.ID, CopilotPrototypeShellCoinStatusBarContribution, WorkbenchPhase.AfterRestored);

// =====================================================================================
// Current Model Prototype — Premium Requests / Chat Messages quota model
// Separate from the TBB prototype above. Has its own status bar icon + dashboard.
// =====================================================================================

export class CopilotCurrentModelStatusBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotCurrentModelStatusBar';

	static instance: CopilotCurrentModelStatusBarContribution | undefined;

	private _activeSku = 'Free';
	private _activeState = 'Default';
	private _bannerElement: HTMLElement | undefined;
	private _warningCardElement: HTMLElement | undefined;
	private _autoAdvanceStates: string[] | undefined;
	private _autoAdvanceIndex = 0;
	private _resumed = false;
	private _firstTimeStep = 1;

	static readonly INDIVIDUAL_SKUS = ['Free', 'Pro/Pro+'];
	static readonly ENTERPRISE_SKUS = ['Ent Unlimited'];
	static readonly STATES = ['First Time', 'Default', 'Premium Approached', 'Premium Exhausted', 'Premium Reset', 'Chat Approached', 'Chat Exhausted', 'Chat Reset'];
	static readonly EXCLUDED_CELLS: ReadonlySet<string> = new Set([
		// Pro/Pro+: no chat quota limits (chat is part of premium)
		'Pro/Pro+|Chat Approached',
		'Pro/Pro+|Chat Exhausted',
		'Pro/Pro+|Chat Reset',
		// Enterprise Unlimited: only First Time and Default
		'Ent Unlimited|Premium Approached',
		'Ent Unlimited|Premium Exhausted',
		'Ent Unlimited|Premium Reset',
		'Ent Unlimited|Chat Approached',
		'Ent Unlimited|Chat Exhausted',
		'Ent Unlimited|Chat Reset',
	]);

	constructor(
		@IStatusbarService _statusbarService: IStatusbarService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHostService _hostService: IHostService,
	) {
		super();

		CopilotCurrentModelStatusBarContribution.instance = this;
	}



	getDashboardEntryPropsForShared(): IStatusbarEntry {
		if (this._resumed) {
			return {
				name: localize('currentModelDashboard', "Copilot Current Model"),
				text: '$(copilot) Copilot Resumed',
				ariaLabel: localize('currentModelResumedAria', "Copilot Current Model Resumed"),
				backgroundColor: 'rgba(0, 120, 212, 0.25)',
				tooltip: { element: token => this.renderDashboard(token) },
				command: ShowTooltipCommand,
			};
		}
		const isWarning = this._activeState.includes('Approached');
		const isError = this._activeState.includes('Exhausted');
		let text = '$(copilot)';
		if (isWarning) { text = '$(copilot-warning)'; }
		else if (isError) { text = '$(copilot-error)'; }
		return {
			name: localize('currentModelDashboard', "Copilot Current Model"),
			text,
			ariaLabel: localize('currentModelAria', "Copilot Current Model Dashboard"),
			tooltip: { element: token => this.renderDashboard(token) },
			command: ShowTooltipCommand,
		};
	}

	private updateSharedDashboard(): void {
		const tbbInstance = CopilotPrototypeShellCoinStatusBarContribution.instance;
		if (tbbInstance) {
			tbbInstance.refreshDashboardEntry();
		}
	}

	clearAllUI(): void {
		this.clearBanner();
		this.clearWarningCard();
	}

	setActiveCell(sku: string, state: string): void {
		this._activeSku = sku;
		this._activeState = state;
		this._resumed = false;
		if (state === 'First Time') { this._firstTimeStep = 1; }
		this.updateSharedDashboard();
		this.clearWarningCard();

		if (state.includes('Reset')) {
			this.clearBanner();
			this._resumed = true;
			this.updateSharedDashboard();
			return;
		}

		if (state.includes('Exhausted')) {
			this.clearBanner();
			this.showWarningCard();
		} else if (state.includes('Approached')) {
			this.updateBanner(state);
		} else {
			this.clearBanner();
		}
	}

	private startAutoAdvance(sku: string): void {
		const states = CopilotCurrentModelStatusBarContribution.STATES;
		const excluded = CopilotCurrentModelStatusBarContribution.EXCLUDED_CELLS;
		this._autoAdvanceStates = states.filter(s => !excluded.has(`${sku}|${s}`));
		this._autoAdvanceIndex = 0;
		if (this._autoAdvanceStates.length > 0) {
			this.setActiveCell(sku, this._autoAdvanceStates[0]);
		}
	}

	private advanceState(): void {
		if (!this._autoAdvanceStates || this._autoAdvanceStates.length === 0) { return; }
		this._autoAdvanceIndex++;
		if (this._autoAdvanceIndex >= this._autoAdvanceStates.length) { this._autoAdvanceIndex = 0; }
		this.setActiveCell(this._activeSku, this._autoAdvanceStates[this._autoAdvanceIndex]);
	}

	// ---- Banner ----

	private getBannerMessage(state: string): string | undefined {
		switch (state) {
			case 'Premium Approached':
				return localize('cmBannerPremiumApproach', "You've used most of your premium request allowance. It resets May 1 at 10:00 AM.");
			case 'Chat Approached':
				return localize('cmBannerChatApproach', "You've used most of your chat message allowance. It resets May 1 at 10:00 AM.");
			default:
				return undefined;
		}
	}

	private getBannerGaugeInfo(state: string): { label: string; percentLabel: string; percent: number; severity: string; resetLabel: string } | undefined {
		switch (state) {
			case 'Premium Approached':
				return { label: localize('cmGaugePremium', "Premium Requests"), percentLabel: localize('gaugeUsed75Lc', "75% used"), percent: 75, severity: 'warning', resetLabel: localize('resetsOnMay1', "Resets May 1 at 10:00 AM") };
			case 'Premium Exhausted':
				return { label: localize('cmGaugePremium', "Premium Requests"), percentLabel: localize('gaugeUsed100Lc', "100% used"), percent: 100, severity: 'error', resetLabel: localize('resetsOnMay1', "Resets May 1 at 10:00 AM") };
			case 'Chat Approached':
				return { label: localize('cmGaugeChat', "Chat Messages"), percentLabel: localize('gaugeUsed75Lc', "75% used"), percent: 75, severity: 'warning', resetLabel: localize('resetsOnMay1', "Resets May 1 at 10:00 AM") };
			case 'Chat Exhausted':
				return { label: localize('cmGaugeChat', "Chat Messages"), percentLabel: localize('gaugeUsed100Lc', "100% used"), percent: 100, severity: 'error', resetLabel: localize('resetsOnMay1', "Resets May 1 at 10:00 AM") };
			default:
				return undefined;
		}
	}

	private getOrCreatePrototypeContainer(): HTMLElement | null {
		const container = this.layoutService.getContainer(mainWindow);
		const inputParts = container.querySelectorAll('.part.auxiliarybar .interactive-input-part, .part.chatbar .interactive-input-part, .part.chatbar .new-chat-input-container'); // eslint-disable-line no-restricted-syntax
		let inputPart: HTMLElement | null = null;
		for (const part of inputParts) {
			if ((part as HTMLElement).offsetParent !== null) {
				inputPart = part as HTMLElement;
				break;
			}
		}
		if (!inputPart && inputParts.length > 0) {
			inputPart = inputParts[0] as HTMLElement;
		}
		if (!inputPart) { return null; }
		let protoContainer = inputPart.querySelector('.copilot-current-model-banner-container') as HTMLElement | null; // eslint-disable-line no-restricted-syntax
		if (!protoContainer) {
			protoContainer = mainWindow.document.createElement('div');
			protoContainer.className = 'copilot-current-model-banner-container';
			protoContainer.style.display = 'none';
			inputPart.insertBefore(protoContainer, inputPart.firstChild);
		}
		return protoContainer;
	}

	private updateBanner(state: string): void {
		const message = this.getBannerMessage(state);
		if (!message) { this.clearBanner(); return; }
		const protoContainer = this.getOrCreatePrototypeContainer();
		if (!protoContainer) { return; }

		if (!this._bannerElement) {
			this._bannerElement = mainWindow.document.createElement('div');
			this._bannerElement.className = 'copilot-prototype-chat-banner';
		}

		const gaugeInfo = this.getBannerGaugeInfo(state);

		this._bannerElement.textContent = '';
		this._bannerElement.className = 'copilot-prototype-chat-banner';
		if (gaugeInfo?.severity === 'warning') { this._bannerElement.classList.add('warning'); }
		else if (gaugeInfo?.severity === 'error') { this._bannerElement.classList.add('error'); }

		const topRow = mainWindow.document.createElement('div');
		topRow.className = 'copilot-prototype-chat-banner-top';

		const icon = mainWindow.document.createElement('span');
		icon.className = 'copilot-prototype-chat-banner-icon';
		if (gaugeInfo?.severity === 'error') { icon.append(...renderLabelWithIcons('$(error)')); }
		else { icon.append(...renderLabelWithIcons('$(warning)')); }
		topRow.appendChild(icon);

		if (gaugeInfo) {
			const titleText = mainWindow.document.createElement('span');
			titleText.className = 'copilot-prototype-chat-banner-title';
			titleText.textContent = gaugeInfo.label;
			topRow.appendChild(titleText);
		} else {
			const titleText = mainWindow.document.createElement('span');
			titleText.className = 'copilot-prototype-chat-banner-title';
			titleText.textContent = message;
			topRow.appendChild(titleText);
		}

		const dismiss = mainWindow.document.createElement('span');
		dismiss.className = 'copilot-prototype-chat-banner-dismiss';
		dismiss.append(...renderLabelWithIcons('$(close)'));
		dismiss.tabIndex = 0;
		dismiss.role = 'button';
		dismiss.title = localize('dismiss', "Dismiss");
		dismiss.addEventListener('click', () => this.clearBanner());
		topRow.appendChild(dismiss);
		this._bannerElement.appendChild(topRow);

		const bottomRow = mainWindow.document.createElement('div');
		bottomRow.className = 'copilot-prototype-chat-banner-bottom';
		if (gaugeInfo) {
			const percentSpan = mainWindow.document.createElement('span');
			percentSpan.className = 'copilot-prototype-chat-banner-percent';
			percentSpan.textContent = gaugeInfo.percentLabel;
			bottomRow.appendChild(percentSpan);
			const resetBadge = mainWindow.document.createElement('span');
			resetBadge.className = 'copilot-prototype-chat-banner-reset';
			resetBadge.textContent = gaugeInfo.resetLabel;
			bottomRow.appendChild(resetBadge);
		}
		const viewUsageLink = mainWindow.document.createElement('button');
		viewUsageLink.className = 'copilot-prototype-chat-banner-btn';
		viewUsageLink.textContent = localize('viewUsage', "View Usage");
		viewUsageLink.addEventListener('click', () => this.openDashboard());
		bottomRow.appendChild(viewUsageLink);
		this._bannerElement.appendChild(bottomRow);

		if (!this._bannerElement.parentElement) {
			protoContainer.appendChild(this._bannerElement);
			protoContainer.style.display = '';
			this.setChatInputOverlap(true);
		}
	}

	private setChatInputOverlap(enabled: boolean): void {
		const container = this.layoutService.getContainer(mainWindow);
		const chatInputs = container.querySelectorAll('.part.auxiliarybar .interactive-input-part .chat-input-container, .part.chatbar .interactive-input-part .chat-input-container, .part.chatbar .new-chat-input-container .chat-input-container, .part.chatbar .new-chat-input-container .new-chat-input-area'); // eslint-disable-line no-restricted-syntax
		for (const chatInput of chatInputs) {
			if (enabled) {
				(chatInput as HTMLElement).style.position = 'relative';
				(chatInput as HTMLElement).style.zIndex = '1';
			} else {
				(chatInput as HTMLElement).style.position = '';
				(chatInput as HTMLElement).style.zIndex = '';
			}
		}
	}

	private openDashboard(): void {
		const container = this.layoutService.getContainer(mainWindow);
		const el = container.querySelector(`#${CSS.escape(CopilotPrototypeShellCoinStatusBarContribution.getDashboardEntryId())} .statusbar-item-label`) as HTMLElement | null; // eslint-disable-line no-restricted-syntax
		if (el) { el.click(); }
	}

	private clearBanner(): void {
		if (this._bannerElement) {
			const p = this._bannerElement.parentElement;
			this._bannerElement.remove();
			this._bannerElement = undefined;
			if (p && p.children.length === 0) { (p as HTMLElement).style.display = 'none'; this.setChatInputOverlap(false); }
		}
	}

	private clearWarningCard(): void {
		if (this._warningCardElement) {
			const p = this._warningCardElement.parentElement;
			this._warningCardElement.remove();
			this._warningCardElement = undefined;
			if (p && p.children.length === 0) { (p as HTMLElement).style.display = 'none'; this.setChatInputOverlap(false); }
		}
	}

	private showWarningCard(): void {
		const content = this.getWarningContent();
		if (!content) { return; }
		const protoContainer = this.getOrCreatePrototypeContainer();
		if (!protoContainer) { return; }
		this.clearWarningCard();

		const card = mainWindow.document.createElement('div');
		card.className = 'copilot-prototype-inline-warning';

		const header = mainWindow.document.createElement('div');
		header.className = 'copilot-prototype-inline-warning-header';
		const headerIcon = mainWindow.document.createElement('span');
		headerIcon.className = 'copilot-prototype-inline-warning-icon';
		headerIcon.append(...renderLabelWithIcons('$(warning)'));
		const headerTitle = mainWindow.document.createElement('span');
		headerTitle.className = 'copilot-prototype-inline-warning-title';
		headerTitle.textContent = content.title;
		header.append(headerIcon, headerTitle);

		const desc = mainWindow.document.createElement('div');
		desc.className = 'copilot-prototype-inline-warning-desc';
		desc.textContent = content.description;

		const btnContainer = mainWindow.document.createElement('div');
		btnContainer.className = 'copilot-prototype-inline-warning-actions';
		if (content.buttonLabel) {
			const btn = mainWindow.document.createElement('button');
			btn.className = 'copilot-prototype-inline-warning-btn';
			btn.textContent = content.buttonLabel;
			btn.addEventListener('click', () => this.advanceState());
			btnContainer.appendChild(btn);
		}
		const viewUsageBtn = mainWindow.document.createElement('button');
		viewUsageBtn.className = 'copilot-prototype-inline-warning-link';
		viewUsageBtn.textContent = localize('viewUsage', "View Usage");
		viewUsageBtn.addEventListener('click', () => this.openDashboard());
		btnContainer.appendChild(viewUsageBtn);

		card.append(header, desc, btnContainer);
		this._warningCardElement = card;
		protoContainer.appendChild(card);
		protoContainer.style.display = '';
		this.setChatInputOverlap(true);
	}

	private getWarningContent(): { title: string; description: string; buttonLabel?: string } | undefined {
		const sku = this._activeSku;
		const state = this._activeState;

		if (state === 'Premium Exhausted') {
			if (sku === 'Free') {
				return {
					title: localize('cmWarnPremiumTitle', "You've reached your premium request limit."),
					description: localize('cmWarnPremiumDescFree', "Resets May 1 at 10:00 AM, or upgrade to increase your limits."),
					buttonLabel: localize('upgrade', "Upgrade"),
				};
			}
			return {
				title: localize('cmWarnPremiumTitle', "You've reached your premium request limit."),
				description: localize('cmWarnPremiumDescPro', "Resets May 1 at 10:00 AM, or purchase additional premium requests."),
				buttonLabel: localize('managePremium', "Manage paid premium requests"),
			};
		}
		if (state === 'Chat Exhausted') {
			return {
				title: localize('cmWarnChatTitle', "You've reached your chat message limit."),
				description: localize('cmWarnChatDescFree', "Resets May 1 at 10:00 AM, or upgrade to increase your limits."),
				buttonLabel: localize('upgrade', "Upgrade"),
			};
		}
		return undefined;
	}

	// ---- Dashboard ----

	renderDashboard(token: CancellationToken): HTMLElement {
		const disposables = new DisposableStore();
		disposables.add(token.onCancellationRequested(() => disposables.dispose()));

		const sku = this._activeSku;
		const state = this._activeState;
		const dashboard = $('div.copilot-prototype-dashboard');

		const isEnterprise = sku === 'Ent Unlimited';

		if (state === 'First Time') {
			this.renderFirstTime(dashboard, disposables, sku);
			return dashboard;
		}

		if (isEnterprise) {
			this.renderEnterpriseDashboard(dashboard, disposables, sku, state);
			return dashboard;
		}

		// Header: copilot icon + plan title + settings icon (no tabs)
		let planTitle: string;
		switch (sku) {
			case 'Free': planTitle = localize('cmTitleFree', "Copilot Free"); break;
			case 'Pro/Pro+': planTitle = localize('cmTitleProPlus', "Copilot Pro+"); break;
			default: planTitle = localize('cmTitleDefault', "Copilot"); break;
		}

		const header = append(dashboard, $('div.copilot-prototype-dashboard-header'));
		const headerLeft = append(header, $('div.copilot-prototype-dashboard-header-left'));
		append(headerLeft, $('div.copilot-prototype-dashboard-title')).textContent = planTitle;

		const titleActions = append(header, $('div.copilot-prototype-dashboard-header-actions'));
		const settingsIcon = append(titleActions, $('div.copilot-prototype-dashboard-icon'));
		settingsIcon.append(...renderLabelWithIcons('$(settings)'));
		settingsIcon.title = localize('settings', "Settings");
		settingsIcon.tabIndex = 0;

		// Usage content (always visible)
		const contentWrapper = append(dashboard, $('div.copilot-prototype-dashboard-content-wrapper'));
		const usageContent = append(contentWrapper, $('div.copilot-prototype-dashboard-content.active'));
		this.renderUsageTab(usageContent, disposables, sku, state);

		// Collapsible Quick Settings section
		this.renderCollapsibleQuickSettings(contentWrapper, disposables);

		return dashboard;
	}

	private renderUsageTab(content: HTMLElement, disposables: DisposableStore, sku: string, state: string): void {
		const isFree = sku === 'Free';

		// --- Warning/info callouts (rendered ABOVE the bars) ---
		if (state === 'Premium Approached' || state === 'Chat Approached') {
			this.createWarningMsg(content, localize('cmWarnApproach', "Copilot will pause when the limit is reached."));
		} else if (state === 'Premium Exhausted' || state === 'Chat Exhausted') {
			this.createErrorMsg(content, localize('cmErrExhausted', "Copilot is paused until the limit resets."));
		} else if (state.includes('Reset')) {
			this.createInfoMsg(content, localize('cmResetAvailable', "Copilot is available. Start building."), true);
		}

		const cards = append(content, $('div.copilot-prototype-dashboard-cards'));

		// Inline Suggestions card (Free only) — first card
		if (isFree) {
			this.createCard(cards, {
				name: localize('cmCardInline', "Inline Suggestions"),
				resetLabel: localize('cmResetApr24Inline', "Resets April 24 at 10:00 AM"),
				percent: 12,
			});
		}

		// Premium Requests card
		const premiumPct = state === 'Premium Approached' ? 75
			: state === 'Premium Exhausted' ? 100
				: state.includes('Reset') ? 0 : 42;
		const premiumApproached = state === 'Premium Approached';
		const premiumExhausted = state === 'Premium Exhausted';
		const premiumSev = premiumApproached ? 'warning' as const : premiumExhausted ? 'error' as const : undefined;
		this.createCard(cards, {
			name: localize('cmCardPremium', "Premium Requests"),
			resetLabel: localize('cmResetMay1', "Resets May 1 at 10:00 AM"),
			percent: premiumPct,
			severity: premiumSev,
			highlight: premiumApproached || premiumExhausted,
		});

		// Chat Messages card (Free only)
		if (isFree) {
			const chatPct = state === 'Chat Approached' ? 75
				: state === 'Chat Exhausted' ? 100
					: state === 'Chat Reset' ? 0 : 28;
			const chatApproached = state === 'Chat Approached';
			const chatExhausted = state === 'Chat Exhausted';
			const chatSev = chatApproached ? 'warning' as const : chatExhausted ? 'error' as const : undefined;
			this.createCard(cards, {
				name: localize('cmCardChat', "Chat Messages"),
				resetLabel: localize('cmResetMay1', "Resets May 1 at 10:00 AM"),
				percent: chatPct,
				severity: chatSev,
				highlight: chatApproached || chatExhausted,
			});

		}

		// Pro/Pro+: chat is included
		if (!isFree) {
			const inlineMsg = append(content, $('div.copilot-prototype-dashboard-inline-included'));
			append(inlineMsg, $('span.copilot-prototype-dashboard-inline-included-label')).textContent = localize('cmChatMessagesLabel', "Chat Messages");
			append(inlineMsg, $('span.copilot-prototype-dashboard-inline-included-sep')).textContent = '\u00B7';
			append(inlineMsg, $('span.copilot-prototype-dashboard-inline-included-text')).textContent = localize('cmChatIncluded', "Included with your plan.");
		}

		// Footer
		// Default state has no CTAs (per UX direction).
		if (state !== 'Default' && state !== 'First Time') {
			const footer = append(content, $('div.copilot-prototype-dashboard-footer'));
			const footerActions = append(footer, $('div.copilot-prototype-dashboard-footer-actions'));
			if (isFree) {
				const upgradeBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
				upgradeBtn.label = localize('upgrade', "Upgrade");
				disposables.add(upgradeBtn.onDidClick(() => this.advanceState()));
			} else {
				const upgradeBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles, secondary: true }));
				upgradeBtn.label = localize('upgrade', "Upgrade");
				disposables.add(upgradeBtn.onDidClick(() => this.advanceState()));
				const manageBtn = disposables.add(new Button(footerActions, { ...defaultButtonStyles }));
				manageBtn.label = localize('managePremium', "Manage paid premium requests");
				disposables.add(manageBtn.onDidClick(() => this.advanceState()));
			}
		}
	}

	private renderInlineTab(content: HTMLElement, disposables: DisposableStore, sku: string): void {
		// Workspace Index (mock)
		const wsIndex = append(content, $('div.copilot-prototype-dashboard-ws-index'));
		const wsHeader = append(wsIndex, $('div.copilot-prototype-dashboard-ws-index-header'));
		append(wsHeader, $('span.copilot-prototype-dashboard-ws-index-label')).textContent = localize('wsIndexLabel', "Workspace Index");
		const wsStatus = append(wsHeader, $('span.copilot-prototype-dashboard-ws-index-status'));
		wsStatus.append(...renderLabelWithIcons('$(check) ' + localize('wsIndexReady', "Ready")));

		const settingsGrid = append(content, $('div.copilot-prototype-dashboard-settings-grid'));
		const leftCol = append(settingsGrid, $('div.copilot-prototype-dashboard-settings-col'));

		const allFilesCheckbox = disposables.add(new Checkbox(localize('allFiles', "All files"), true, { ...defaultCheckboxStyles }));
		const allFilesRow = append(leftCol, $('div.copilot-prototype-dashboard-setting-row'));
		allFilesRow.appendChild(allFilesCheckbox.domNode);
		append(allFilesRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('allFiles', "All files");

		const tsCheckbox = disposables.add(new Checkbox(localize('typescript', "TypeScript"), true, { ...defaultCheckboxStyles }));
		const tsRow = append(leftCol, $('div.copilot-prototype-dashboard-setting-row'));
		tsRow.appendChild(tsCheckbox.domNode);
		append(tsRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('typescript', "TypeScript");

		const nesCheckbox = disposables.add(new Checkbox(localize('nextEditSuggestions', "Next edit suggestions"), true, { ...defaultCheckboxStyles }));
		const nesRow = append(leftCol, $('div.copilot-prototype-dashboard-setting-row'));
		nesRow.appendChild(nesCheckbox.domNode);
		append(nesRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('nesShortLabel', "NES");

		// Eagerness — full-width row above snooze
		const eagernessRow = append(content, $('div.copilot-prototype-dashboard-dropdown-row'));
		append(eagernessRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('eagerness', "Eagerness");
		const eagernessSelect = append(eagernessRow, $('select.copilot-prototype-dashboard-select'));
		for (const opt of ['Auto', 'Low', 'Medium', 'High']) {
			const option = append(eagernessSelect, $('option'));
			option.textContent = opt;
			option.setAttribute('value', opt);
		}

		const snoozeRow = append(content, $('div.copilot-prototype-dashboard-snooze'));
		append(snoozeRow, $('span.copilot-prototype-dashboard-snooze-label')).textContent = localize('hideSuggestions', "Hide suggestions for 5 min");
		const snoozeBtn = disposables.add(new Button(snoozeRow, { ...defaultButtonStyles, secondary: true }));
		snoozeBtn.label = localize('snooze', "Snooze");
	}

	private renderCollapsibleQuickSettings(container: HTMLElement, disposables: DisposableStore): void {
		const collapsibleHeader = append(container, $('button.copilot-prototype-dashboard-collapsible-header'));
		collapsibleHeader.setAttribute('aria-expanded', 'false');
		append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-label')).textContent = localize('tab.quickSettings', "Quick Settings");
		const chevronEl = append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-chevron'));
		chevronEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));

		const collapsibleContent = append(container, $('div.copilot-prototype-dashboard-collapsible-content'));
		this.renderInlineTab(collapsibleContent, disposables, '');

		collapsibleHeader.addEventListener('click', () => {
			const isExpanded = collapsibleContent.classList.toggle('expanded');
			chevronEl.className = 'copilot-prototype-dashboard-collapsible-chevron';
			chevronEl.classList.add(...ThemeIcon.asClassNameArray(isExpanded ? Codicon.chevronDown : Codicon.chevronRight));
			collapsibleHeader.setAttribute('aria-expanded', String(isExpanded));
		});
	}

	private renderEnterpriseDashboard(dashboard: HTMLElement, disposables: DisposableStore, _sku: string, _state: string): void {
		const header = append(dashboard, $('div.copilot-prototype-dashboard-header'));
		const headerLeft = append(header, $('div.copilot-prototype-dashboard-header-left'));
		append(headerLeft, $('div.copilot-prototype-dashboard-title')).textContent = localize('cmTitleEnt', "Copilot Enterprise");

		const headerActions = append(header, $('div.copilot-prototype-dashboard-header-actions'));
		const settingsIcon = append(headerActions, $('div.copilot-prototype-dashboard-icon'));
		settingsIcon.append(...renderLabelWithIcons('$(settings)'));
		settingsIcon.title = localize('settings', "Settings");
		settingsIcon.tabIndex = 0;

		const contentWrapper = append(dashboard, $('div.copilot-prototype-dashboard-content-wrapper'));
		const content = append(contentWrapper, $('div.copilot-prototype-dashboard-content.active'));
		const cards = append(content, $('div.copilot-prototype-dashboard-cards'));

		this.createCard(cards, {
			name: localize('cmCardEntAll', "Premium Requests & Inline Suggestions"),
			resetLabel: '',
			percent: 0,
			includedMessage: localize('cmEntIncluded', "Included with your organization's plan."),
		});

		this.renderCollapsibleQuickSettings(contentWrapper, disposables);
	}

	private renderFirstTime(dashboard: HTMLElement, disposables: DisposableStore, sku: string): void {
		const contentContainer = append(dashboard, $('div.copilot-prototype-ft-container'));
		const stepDisposables = disposables.add(new DisposableStore());

		const renderStep = () => {
			stepDisposables.clear();
			contentContainer.textContent = '';

			const steps = this.getFirstTimeSteps(sku);
			const totalSteps = steps.length;
			const currentStep = Math.min(this._firstTimeStep, totalSteps);
			const stepData = steps[currentStep - 1];

			const header = append(contentContainer, $('div.copilot-prototype-dashboard-header'));
			append(header, $('div.copilot-prototype-dashboard-title')).textContent = localize('cmFtTitle', "Usage");
			append(header, $('div.copilot-prototype-dashboard-step-indicator')).textContent = localize('ftStep', "Step {0} of {1}", currentStep, totalSteps);

			const card = append(contentContainer, $('div.copilot-prototype-ft-card'));
			append(card, $('div.copilot-prototype-ft-card-title')).textContent = stepData.title;
			append(card, $('div.copilot-prototype-ft-card-desc')).textContent = stepData.description;

			const dotsRow = append(contentContainer, $('div.copilot-prototype-ft-dots'));
			for (let i = 1; i <= totalSteps; i++) {
				const dot = append(dotsRow, $('div.copilot-prototype-ft-dot'));
				if (i === currentStep) { dot.classList.add('active'); }
				else if (i < currentStep) { dot.classList.add('completed'); }
			}

			const actions = append(contentContainer, $('div.copilot-prototype-ft-actions'));
			if (currentStep < totalSteps) {
				const nextBtn = stepDisposables.add(new Button(actions, { ...defaultButtonStyles }));
				nextBtn.label = localize('ftNext', "Next");
				stepDisposables.add(nextBtn.onDidClick(() => { this._firstTimeStep = currentStep + 1; renderStep(); }));
			} else {
				const gotItBtn = stepDisposables.add(new Button(actions, { ...defaultButtonStyles }));
				gotItBtn.label = localize('ftGotIt', "Got it");
				stepDisposables.add(gotItBtn.onDidClick(() => { this._firstTimeStep = 1; this.setActiveCell(this._activeSku, 'Default'); }));
			}
			if (currentStep > 1) {
				const backBtn = stepDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
				backBtn.label = localize('ftBack', "Back");
				stepDisposables.add(backBtn.onDidClick(() => { this._firstTimeStep = currentStep - 1; renderStep(); }));
			}
		};
		renderStep();
	}

	private getFirstTimeSteps(sku: string): { title: string; description: string }[] {
		if (sku === 'Ent Unlimited') {
			return [
				{ title: localize('cmFtEntPremTitle', "Premium requests"), description: localize('cmFtEntPremDesc', "Premium models like GPT-4o and Claude Sonnet use premium requests. Your organization sets a monthly allowance. Copilot pauses when you reach a limit.") },
				{ title: localize('cmFtEntInlineTitle', "Inline suggestions"), description: localize('cmFtEntInlineDesc', "Code completions and next edit suggestions are included and don't count toward your premium request limit.") },
				{ title: localize('cmFtEntDashTitle', "Usage dashboard"), description: localize('cmFtEntDashDesc', "Track your usage anytime from the Copilot menu. Contact your administrator if you need a higher limit.") },
			];
		}
		const isFree = sku === 'Free';
		return [
			{ title: localize('cmFtPremTitle', "Premium requests"), description: isFree ? localize('cmFtPremDescFree', "Premium models use premium requests from your monthly allowance. Copilot pauses when you reach a limit. Upgrade to increase your limit.") : localize('cmFtPremDescPro', "Premium models like GPT-4o and Claude Sonnet use premium requests from your monthly allowance. Copilot pauses when you reach a limit.") },
			{ title: localize('cmFtChatTitle', "Chat & completions"), description: isFree ? localize('cmFtChatDescFree', "Chat messages and inline suggestions have their own monthly allowances that reset automatically. Copilot pauses when you reach a limit.") : localize('cmFtChatDescPro', "Chat messages and inline suggestions are included with your plan.") },
			{ title: localize('cmFtDashTitle', "Usage dashboard"), description: localize('cmFtDashDesc', "Track your usage, manage your plan, and adjust settings anytime from the Copilot menu.") },
		];
	}

	// ---- Helpers ----

	private createWarningMsg(container: HTMLElement, message: string): void {
		const w = append(container, $('div.copilot-prototype-dashboard-warning'));
		append(w, $('span.copilot-prototype-dashboard-warning-icon')).append(...renderLabelWithIcons('$(warning)'));
		const body = append(w, $('span.copilot-prototype-dashboard-warning-text'));
		body.appendChild(mainWindow.document.createTextNode(message + ' '));
		const link = append(body, $('a.copilot-prototype-coin-grid-link'));
		link.textContent = localize('learnMore', "Learn more");
		link.tabIndex = 0;
	}

	private createErrorMsg(container: HTMLElement, message: string): void {
		const w = append(container, $('div.copilot-prototype-dashboard-warning.error'));
		append(w, $('span.copilot-prototype-dashboard-warning-icon.error')).append(...renderLabelWithIcons('$(error)'));
		const body = append(w, $('span.copilot-prototype-dashboard-warning-text'));
		body.appendChild(mainWindow.document.createTextNode(message + ' '));
		const link = append(body, $('a.copilot-prototype-coin-grid-link'));
		link.textContent = localize('learnMore', "Learn more");
		link.tabIndex = 0;
	}

	private createInfoMsg(container: HTMLElement, message: string, highlight?: boolean): void {
		const info = append(container, $('div.copilot-prototype-dashboard-info'));
		if (highlight) {
			info.classList.add('highlight');
		}
		append(info, $('span.copilot-prototype-dashboard-info-icon')).append(...renderLabelWithIcons('$(info)'));
		const body = append(info, $('span.copilot-prototype-dashboard-info-text'));
		body.appendChild(mainWindow.document.createTextNode(message + ' '));
		const link = append(body, $('a.copilot-prototype-coin-grid-link'));
		link.textContent = localize('learnMore', "Learn more");
		link.tabIndex = 0;
		link.role = 'link';
	}

	private createCard(container: HTMLElement, opts: {
		name: string; resetLabel: string; percent: number;
		severity?: 'warning' | 'error' | 'info' | 'celebrate'; disabled?: boolean;
		statusBadge?: string; highlight?: boolean; includedMessage?: string;
	}): void {
		const card = append(container, $('div.copilot-prototype-dashboard-card'));
		if (opts.disabled) { card.classList.add('disabled'); }
		if (opts.severity === 'celebrate') { card.classList.add('celebrate'); }
		if (opts.highlight) { card.classList.add('highlight'); if (opts.severity && opts.severity !== 'celebrate') { card.classList.add(opts.severity); } }

		const titleRow = append(card, $('div.copilot-prototype-dashboard-card-title'));
		append(titleRow, $('span.copilot-prototype-dashboard-card-name')).textContent = opts.name;
		if (opts.statusBadge) { append(titleRow, $('span.copilot-prototype-dashboard-card-status')).textContent = opts.statusBadge; }

		if (opts.includedMessage) {
			append(card, $('div.copilot-prototype-dashboard-card-included')).textContent = opts.includedMessage;
			return;
		}

		const percentRow = append(card, $('div.copilot-prototype-dashboard-card-percent'));
		const percentLeft = append(percentRow, $('div.copilot-prototype-dashboard-card-percent-left'));
		const percentValue = append(percentLeft, $('span.copilot-prototype-dashboard-card-percent-value'));
		percentValue.textContent = `${opts.percent}%`;
		if (opts.severity) { percentValue.classList.add(opts.severity); }
		append(percentLeft, $('span.copilot-prototype-dashboard-card-percent-label')).textContent = localize('cardUsed', "used");
		append(percentRow, $('span.copilot-prototype-dashboard-card-badge')).textContent = opts.resetLabel;

		const barContainer = append(card, $('div.copilot-prototype-dashboard-card-bar'));
		if (opts.severity) { barContainer.classList.add(opts.severity); }
		if (opts.percent >= 100) { barContainer.classList.add('full'); }
		append(barContainer, $('div.copilot-prototype-dashboard-card-bar-fill')).style.width = `${opts.percent}%`;
	}

	// ---- Controller Grid ----

	renderController(container: HTMLElement, disposables: DisposableStore): void {
		container.className = 'copilot-prototype-coin-widget';

		const tabBar = mainWindow.document.createElement('div');
		tabBar.className = 'copilot-prototype-coin-tabs';

		const individualTab = mainWindow.document.createElement('div');
		individualTab.className = 'copilot-prototype-coin-tab active';
		individualTab.textContent = localize('tabIndividual', "Individual");
		individualTab.tabIndex = 0;
		individualTab.role = 'tab';

		const enterpriseTab = mainWindow.document.createElement('div');
		enterpriseTab.className = 'copilot-prototype-coin-tab';
		enterpriseTab.textContent = localize('tabEnterprise', "Enterprise");
		enterpriseTab.tabIndex = 0;
		enterpriseTab.role = 'tab';

		tabBar.append(individualTab, enterpriseTab);

		const states = CopilotCurrentModelStatusBarContribution.STATES;
		const individualGrid = this.buildGrid(CopilotCurrentModelStatusBarContribution.INDIVIDUAL_SKUS, states, disposables);
		const enterpriseGrid = this.buildGrid(CopilotCurrentModelStatusBarContribution.ENTERPRISE_SKUS, states, disposables);
		enterpriseGrid.style.display = 'none';

		individualTab.addEventListener('click', () => {
			individualTab.classList.add('active');
			enterpriseTab.classList.remove('active');
			individualGrid.style.display = '';
			enterpriseGrid.style.display = 'none';
		});
		enterpriseTab.addEventListener('click', () => {
			enterpriseTab.classList.add('active');
			individualTab.classList.remove('active');
			enterpriseGrid.style.display = '';
			individualGrid.style.display = 'none';
		});

		container.append(tabBar, individualGrid, enterpriseGrid);
	}

	private buildGrid(skus: readonly string[], states: readonly string[], disposables: DisposableStore): HTMLElement {
		const excluded = CopilotCurrentModelStatusBarContribution.EXCLUDED_CELLS;
		const visibleStates = states.filter(state => !skus.every(sku => excluded.has(`${sku}|${state}`)));

		const grid = mainWindow.document.createElement('div');
		grid.className = 'copilot-prototype-coin-grid';
		grid.style.gridTemplateColumns = `auto repeat(${skus.length}, minmax(40px, 1fr))`;
		grid.style.gridTemplateRows = `auto repeat(${visibleStates.length}, 1fr)`;

		const corner = mainWindow.document.createElement('div');
		corner.className = 'copilot-prototype-coin-grid-corner';
		corner.textContent = localize('copilotPrototypeShellCoinGridStates', "States \\ SKU");
		grid.appendChild(corner);

		for (const sku of skus) {
			const header = mainWindow.document.createElement('div');
			header.className = 'copilot-prototype-coin-grid-col-header';
			const link = mainWindow.document.createElement('a');
			link.className = 'copilot-prototype-coin-grid-link';
			link.textContent = sku;
			link.tabIndex = 0;
			link.role = 'button';
			link.addEventListener('click', () => this.startAutoAdvance(sku));
			header.appendChild(link);
			grid.appendChild(header);
		}

		for (const state of states) {
			if (skus.every(sku => excluded.has(`${sku}|${state}`))) { continue; }

			const rowHeader = mainWindow.document.createElement('div');
			rowHeader.className = 'copilot-prototype-coin-grid-row-header';
			rowHeader.textContent = state;
			grid.appendChild(rowHeader);

			for (const sku of skus) {
				const cell = mainWindow.document.createElement('div');
				cell.className = 'copilot-prototype-coin-grid-cell';
				if (!excluded.has(`${sku}|${state}`)) {
					const btn = disposables.add(new Button(cell, { ...defaultButtonStyles, secondary: true }));
					btn.label = '';
					disposables.add(btn.onDidClick(() => {
						this._autoAdvanceStates = undefined;
						this.setActiveCell(sku, state);
					}));
				}
				grid.appendChild(cell);
			}
		}

		return grid;
	}
}

registerWorkbenchContribution2(CopilotCurrentModelStatusBarContribution.ID, CopilotCurrentModelStatusBarContribution, WorkbenchPhase.AfterRestored);

// =====================================================================================
// Token Based Billing 3.0 — single monthly budget for every SKU.
// No five-hour, no weekly. One bar to rule them all.
// =====================================================================================

export class CopilotTBB3StatusBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotTBB3StatusBar';

	static instance: CopilotTBB3StatusBarContribution | undefined;

	private _activeSku = 'Edu/Free';
	private _activeState = 'Default';
	private _resumed = false;
	private _autoAdvanceStates: string[] | undefined;
	private _autoAdvanceIndex = 0;

	static readonly INDIVIDUAL_SKUS = ['Edu/Free', 'Pro/Pro+ No O', 'Pro/Pro+', 'Max'];
	static readonly ENTERPRISE_SKUS = ['Ent/Bus ULB', 'Ent/Bus'];
	static readonly STATES = ['Default', 'Monthly Approached', 'Monthly Exhausted', 'Monthly Reset', 'Overage Exhausted', 'Overage Reset'];
	static readonly EXCLUDED_CELLS: ReadonlySet<string> = new Set([
		// Edu/Free has no additional budget at all
		'Edu/Free|Overage Exhausted', 'Edu/Free|Overage Reset',
		// Pro/Pro+ No O has no additional budget configured
		'Pro/Pro+ No O|Overage Exhausted', 'Pro/Pro+ No O|Overage Reset',
		// Regular Ent/Bus is unlimited — no monthly limit or overage states
		'Ent/Bus|Monthly Approached', 'Ent/Bus|Monthly Exhausted', 'Ent/Bus|Monthly Reset',
		'Ent/Bus|Overage Exhausted', 'Ent/Bus|Overage Reset',
		// Ent/Bus ULB has admin-managed overage — no per-user overage states
		'Ent/Bus ULB|Overage Exhausted', 'Ent/Bus ULB|Overage Reset',
	]);

	constructor(
		@IStatusbarService _statusbarService: IStatusbarService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHostService _hostService: IHostService,
	) {
		super();
		CopilotTBB3StatusBarContribution.instance = this;
	}

	private openDashboard(): void {
		const container = this.layoutService.getContainer(mainWindow);
		const el = container.querySelector(`#${CSS.escape(CopilotPrototypeShellCoinStatusBarContribution.getDashboardEntryId())} .statusbar-item-label`) as HTMLElement | null; // eslint-disable-line no-restricted-syntax
		if (el) { el.click(); }
	}

	getDashboardEntryPropsForShared(): IStatusbarEntry {
		if (this._resumed) {
			return {
				name: localize('tbb3Dashboard', "Copilot TBB 3.0"),
				text: '$(copilot) Copilot Resumed',
				ariaLabel: localize('tbb3ResumedAria', "Copilot TBB 3.0 Resumed"),
				backgroundColor: 'rgba(0, 120, 212, 0.25)',
				tooltip: { element: token => this.renderDashboard(token) },
				command: ShowTooltipCommand,
			};
		}
		const isWarning = false; // TBB3 surfaces approached states as celebrate, not warning
		const isPaidPro = this._activeSku === 'Pro/Pro+' || this._activeSku === 'Max';
		const isFree = this._activeSku === 'Edu/Free';
		const isProNoO = this._activeSku === 'Pro/Pro+ No O';
		// Only exhausted states surface in the status bar; approached states stay quiet.
		// Pro/Pro+ at monthly exhausted is NOT paused — additional budget keeps Copilot going.
		const isExhaustedCelebrate = this._activeState === 'Monthly Exhausted' && (isFree || isProNoO);
		const isOverageMaxed = this._activeState === 'Overage Exhausted' && isPaidPro;
		let text = '$(copilot)';
		if (isExhaustedCelebrate || isOverageMaxed) {
			text = '$(copilot) ' + localize('tbb3StatusPaused', "Copilot Paused");
		} else if (isWarning) { text = '$(copilot-warning)'; }
		return {
			name: localize('tbb3Dashboard', "Copilot TBB 3.0"),
			text,
			ariaLabel: localize('tbb3Aria', "Copilot TBB 3.0 Dashboard"),
			tooltip: { element: token => this.renderDashboard(token) },
			command: ShowTooltipCommand,
		};
	}

	private updateSharedDashboard(): void {
		CopilotPrototypeShellCoinStatusBarContribution.instance?.refreshDashboardEntry();
	}

	clearAllUI(): void {
		CopilotPrototypeShellCoinStatusBarContribution.instance?.clearExternalBanner();
	}

	setActiveCell(sku: string, state: string): void {
		this._activeSku = sku;
		this._activeState = state;
		this._resumed = state === 'Monthly Reset';
		// Ensure the shared status-bar dashboard reflects TBB 3.0 whenever the user
		// interacts with this controller, otherwise a stale TBB 1 / Current Model
		// dashboard (e.g. with Free's inline-suggestions card) could still show.
		CopilotPrototypeShellCoinStatusBarContribution.instance?.setBillingMode('tbb-3.0');
		this.updateSharedDashboard();
		this.applyChatBanner();
	}

	private applyChatBanner(): void {
		const tbb1 = CopilotPrototypeShellCoinStatusBarContribution.instance;
		if (!tbb1) { return; }

		const sku = this._activeSku;
		const state = this._activeState;
		const isUnlimitedEnt = sku === 'Ent/Bus';
		const isEntULB = sku === 'Ent/Bus ULB';
		const isFree = sku === 'Edu/Free';
		const isProNoO = sku === 'Pro/Pro+ No O';
		const hasOverage = sku === 'Pro/Pro+' || sku === 'Max';

		if (isUnlimitedEnt) {
			tbb1.clearExternalBanner();
			return;
		}

		const monthlyReachedTitle = localize('tbb3MonthlyReached', "Credits Reached");
		const overageReachedTitle = localize('tbb3OverageReached', "Overage Limit Reached");
		const viewUsageAction = { label: localize('viewUsage', "View Usage"), onClick: () => this.openDashboard() };
		const manageBudgetAction = { label: localize('manageBudget', "Manage Budget"), primary: true, onClick: () => this.openDashboard() };
		const upgradeAction = { label: localize('upgrade', "Upgrade"), primary: true, onClick: () => this.openDashboard() };

		switch (state) {
			case 'Monthly Approached':
				tbb1.showCustomGaugeBanner({
					title: localize('tbb3MonthlyApproachingPct', "Credits at {0}%", 75),
					percent: 75,
					severity: isEntULB ? 'warning' : 'celebrate',
					description: isEntULB
						? localize('tbb3BannerEntApproachShort', "Request more usage from your admin to keep flowing.")
						: hasOverage
							? localize('tbb3BannerHasOverageApproachShort', "Your additional budget is ready to keep things flowing.")
							: isFree
								? localize('tbb3BannerFreeApproachShort', "You're getting the most out of Copilot. Upgrade to keep going.")
								: localize('tbb3BannerPaidApproachShort', "Manage your budget to keep building without interruption."),
					actions: isEntULB
						? []
						: isFree
							? [viewUsageAction, upgradeAction]
							: [viewUsageAction, manageBudgetAction],
				});
				break;
			case 'Monthly Reached':
				// Pro/Pro+ + Max only — monthly hit 100%, overage now in use
				tbb1.showCustomSimpleBanner({
					title: monthlyReachedTitle,
					description: localize('tbb3BannerMonthlyReachedDesc', "Your additional budget is keeping Copilot going strong."),
				});
				break;
			case 'Monthly Exhausted':
				if (hasOverage) {
					tbb1.showCustomSimpleBanner({
						title: monthlyReachedTitle,
						description: localize('tbb3BannerMonthlyExhaustedOverageDesc', "Your additional budget is keeping Copilot going strong."),
					});
				} else {
					tbb1.showCustomGaugeBanner({
						title: monthlyReachedTitle,
						percent: 100,
						severity: isEntULB ? 'error' : 'celebrate',
						description: isEntULB
							? localize('tbb3BannerEntExhaustedShort', "Request more usage from your admin to pick up where you left off.")
							: isFree
								? localize('tbb3BannerFreeExhaustedShort', "You've made the most of Copilot Free. Upgrade to keep going.")
								: isProNoO
									? localize('tbb3BannerProNoOExhaustedShort', "Manage your budget to pick up right where you left off.")
									: localize('tbb3BannerPaidExhaustedShort', "Copilot will be back when limits reset."),
						actions: isEntULB
							? []
							: isFree
								? [viewUsageAction, upgradeAction]
								: [viewUsageAction, manageBudgetAction],
					});
				}
				break;
			case 'Overage Exhausted':
				tbb1.showCustomGaugeBanner({
					title: overageReachedTitle,
					percent: 100,
					severity: 'celebrate',
					description: localize('tbb3BannerOverageExhaustedShort', "Increase your budget to keep building without missing a beat."),
					actions: [viewUsageAction, manageBudgetAction],
				});
				break;
			case 'Monthly Reset':
			case 'Overage Reset':
				tbb1.showCustomSimpleBanner({
					title: localize('tbb3BannerResetTitle', "Credits Have Reset"),
					description: localize('resetBannerDesc', "Copilot is available. Resume building."),
				});
				break;
			default:
				tbb1.clearExternalBanner();
		}
	}

	private startAutoAdvance(sku: string): void {
		const states = CopilotTBB3StatusBarContribution.STATES;
		const excluded = CopilotTBB3StatusBarContribution.EXCLUDED_CELLS;
		this._autoAdvanceStates = states.filter(s => !excluded.has(`${sku}|${s}`));
		this._autoAdvanceIndex = 0;
		if (this._autoAdvanceStates.length > 0) {
			this.setActiveCell(sku, this._autoAdvanceStates[0]);
		}
	}

	private advanceState(): void {
		if (!this._autoAdvanceStates || this._autoAdvanceStates.length === 0) { return; }
		this._autoAdvanceIndex++;
		if (this._autoAdvanceIndex >= this._autoAdvanceStates.length) { this._autoAdvanceIndex = 0; }
		this.setActiveCell(this._activeSku, this._autoAdvanceStates[this._autoAdvanceIndex]);
	}

	// ---- Dashboard ----

	renderDashboard(token: CancellationToken): HTMLElement {
		const disposables = new DisposableStore();
		disposables.add(token.onCancellationRequested(() => disposables.dispose()));

		const sku = this._activeSku;
		const state = this._activeState;
		const dashboard = $('div.copilot-prototype-dashboard');

		const isEnterprise = sku === 'Ent/Bus' || sku === 'Ent/Bus ULB';
		const isUnlimitedEnt = sku === 'Ent/Bus';

		// Header
		let planTitle: string;
		switch (sku) {
			case 'Edu/Free': planTitle = localize('tbb3TitleFree', "Copilot Free"); break;
			case 'Pro/Pro+ No O': planTitle = localize('tbb3TitleProNoO', "Copilot Pro"); break;
			case 'Pro/Pro+': planTitle = localize('tbb3TitlePro', "Copilot Pro+"); break;
			case 'Max': planTitle = localize('tbb3TitleMax', "Copilot Max"); break;
			case 'Ent/Bus ULB': planTitle = localize('tbb3TitleEntULB', "Copilot Enterprise ULB"); break;
			case 'Ent/Bus': planTitle = localize('tbb3TitleEnt', "Copilot Enterprise"); break;
			default: planTitle = localize('tbb3TitleDefault', "Copilot"); break;
		}

		const header = append(dashboard, $('div.copilot-prototype-dashboard-header'));
		const headerLeft = append(header, $('div.copilot-prototype-dashboard-header-left'));
		append(headerLeft, $('div.copilot-prototype-dashboard-title')).textContent = planTitle;

		const titleActions = append(header, $('div.copilot-prototype-dashboard-header-actions'));
		const headerCtas = append(titleActions, $('div.copilot-prototype-dashboard-header-ctas'));
		const settingsIcon = append(titleActions, $('div.copilot-prototype-dashboard-icon'));
		settingsIcon.append(...renderLabelWithIcons('$(settings)'));
		settingsIcon.title = localize('settings', "Settings");
		settingsIcon.tabIndex = 0;

		const contentWrapper = append(dashboard, $('div.copilot-prototype-dashboard-content-wrapper'));
		const usageContent = append(contentWrapper, $('div.copilot-prototype-dashboard-content.active'));

		const hasOverage = sku === 'Pro/Pro+' || sku === 'Max';
		const isFree = sku === 'Edu/Free';
		const isProNoO = sku === 'Pro/Pro+ No O';
		const monthlyApproached = state === 'Monthly Approached';
		const monthlyExhausted = state === 'Monthly Exhausted';
		const monthlyReset = state === 'Monthly Reset';
		const overageExhausted = state === 'Overage Exhausted';
		const overageReset = state === 'Overage Reset';

		// --- Callouts (rendered ABOVE the bars) ---
		if (isEnterprise && !isUnlimitedEnt) {
			if (monthlyApproached) {
				this.createWarningWithAction(usageContent, disposables, localize('tbb3EntApproachWarn', "Copilot will pause when your included credits is reached."), localize('requestMoreUsage', "Request More Usage"));
			} else if (monthlyExhausted) {
				this.createErrorWithAction(usageContent, disposables, localize('tbb3EntExhaustedWarn', "Copilot is paused until your included credits resets."), localize('requestMoreUsage', "Request More Usage"));
			} else if (monthlyReset) {
				this.createInfoMsg(usageContent, localize('tbb3ResetAvailable', "Copilot is available. Start building."), true);
			}
		} else if (!isEnterprise) {
			if (monthlyApproached) {
				this.createCelebrateMsg(usageContent, hasOverage
					? localize('tbb3HasOverageApproachCelebrate', "You're approaching your included credits for Copilot. Your additional budget will keep things flowing once you hit it.")
					: isFree
						? localize('tbb3FreeApproachCelebrate', "You're approaching your included credits for Copilot Free. Upgrade to keep the momentum going.")
						: localize('tbb3PaidApproachCelebrate', "You're getting close to your included credits for Copilot. Manage your budget to keep going."));
			} else if (monthlyExhausted && hasOverage) {
				// Pro/Pro+ + Max: monthly limit reached, overage now in use
				this.createCelebrateMsg(usageContent, localize('tbb3MonthlyReachedCelebrate', "You've reached your included credits. Your additional budget is keeping Copilot going until limits reset."));
			} else if (monthlyExhausted) {
				if (isFree) {
					this.createCelebrateMsg(usageContent, localize('tbb3FreeExhaustedCelebrate', "You've reached your included credits for Copilot Free. Upgrade to keep going."));
				} else {
					this.createCelebrateMsg(usageContent, isProNoO
						? localize('tbb3ProNoOExhaustedWarn', "You've reached your included credits. Manage your budget to keep going.")
						: localize('tbb3PaidExhaustedWarn2', "Copilot is paused until your included credits resets."));
				}
			} else if (overageExhausted) {
				this.createCelebrateMsg(usageContent, localize('tbb3OverageReachedWarn', "You've used all of your additional budget for this month. Increase your budget to keep going."));
			} else if (monthlyReset || overageReset) {
				this.createInfoMsg(usageContent, localize('tbb3ResetAvailable', "Copilot is available. Start building."), true);
			}
		}

		// --- Cards ---
		const cards = append(usageContent, $('div.copilot-prototype-dashboard-cards'));

		if (isUnlimitedEnt) {
			append(cards, $('div.copilot-prototype-dashboard-ent-included')).textContent =
				localize('tbb3EntIncludedLine', "Copilot usage and Inline Suggestions are included in your organization's plan.");
		} else {
			const aic = CopilotPrototypeShellCoinStatusBarContribution.instance?.getTbb3AicAllocation(sku, state)
				?? { monthlyTotal: 0, monthlyUsed: 0, overageTotal: 0, overageUsed: 0 };
			const aicLabel = (used: number, total: number) => total > 0
				? localize('tbb3AicFraction', "{0} / {1}", used.toLocaleString(), total.toLocaleString())
				: undefined;

			// Monthly Limit / Monthly Budget card.
			// Pro/Pro+ (with or without overage) and Max all show "Included Credits" since
			// the included monthly amount is a hard cap on the entitlement itself.
			const monthlyName = localize('tbb3CardIncludedCredits', "Credits");
			const monthlyPct = monthlyApproached ? 75
				: (monthlyExhausted || overageExhausted) ? 100
					: (monthlyReset || overageReset) ? 0
						: 42;
			const monthlySev = (monthlyApproached || monthlyExhausted || overageExhausted) ? 'celebrate' as const : undefined;
			const monthlyDisabled = false;
			this.createCard(cards, {
				name: monthlyName,
				resetLabel: localize('tbb3ResetMay1', "Resets May 1 at 10:00 AM"),
				percent: monthlyPct,
				severity: monthlySev,
				highlight: false,
				disabled: monthlyDisabled,
				usedLabel: aicLabel(aic.monthlyUsed, aic.monthlyTotal),
			});

			// Free SKU also tracks an Inline Suggestions monthly cap.
			if (isFree) {
				const inlineUsed = 360;
				const inlineTotal = 2000;
				this.createCard(cards, {
					name: localize('tbb3CardInline', "Inline Suggestions"),
					resetLabel: localize('tbb3ResetMay1', "Resets May 1 at 10:00 AM"),
					percent: 18,
					usedLabel: localize('tbb3InlineFraction', "{0} / {1}", inlineUsed.toLocaleString(), inlineTotal.toLocaleString()),
				});
			}
		}

		// --- Header CTAs ---
		// Default state across all SKUs has no CTAs (per UX direction).
		const isDefault = state === 'Default';
		if (!isDefault && !isEnterprise) {
			if (isFree) {
				// Free users must upgrade once monthly limit is exhausted — primary CTA.
				const isPrimary = monthlyExhausted;
				const upgradeBtn = disposables.add(new Button(headerCtas, { ...defaultButtonStyles, secondary: !isPrimary }));
				upgradeBtn.label = localize('upgrade', "Upgrade");
				disposables.add(upgradeBtn.onDidClick(() => this.advanceState()));
			} else if (isProNoO) {
				// Pro/Pro+ No O — Manage Budget is the primary CTA so the user can set up an additional budget.
				if (monthlyExhausted) {
					const upgradeBtn = disposables.add(new Button(headerCtas, { ...defaultButtonStyles, secondary: true }));
					upgradeBtn.label = localize('upgrade', "Upgrade");
					disposables.add(upgradeBtn.onDidClick(() => this.advanceState()));
					const configBtn = disposables.add(new Button(headerCtas, { ...defaultButtonStyles }));
					configBtn.label = localize('tbb3ConfigureOverage', "Manage Budget");
					disposables.add(configBtn.onDidClick(() => this.advanceState()));
				} else {
					// Approaching/other non-exhausted states — secondary CTA.
					const manageBtn = disposables.add(new Button(headerCtas, { ...defaultButtonStyles, secondary: true }));
					manageBtn.label = localize('tbb3ConfigureOverage', "Manage Budget");
					disposables.add(manageBtn.onDidClick(() => this.advanceState()));
				}
			} else {
				// Pro/Pro+ and Max — "Manage Budget" becomes primary when overage is exhausted.
				const isPrimary = overageExhausted;
				const manageBtn = disposables.add(new Button(headerCtas, { ...defaultButtonStyles, secondary: !isPrimary }));
				manageBtn.label = localize('tbb3ManageOverage', "Manage Budget");
				disposables.add(manageBtn.onDidClick(() => this.advanceState()));
			}
		}

		// Workspace Index — own expandable section (VS Code only, not Agents app)
		if (!this.isAgentsApp()) {
			this.renderCollapsibleWorkspaceIndex(contentWrapper);
		}

		// Quick Settings
		this.renderCollapsibleQuickSettings(contentWrapper, disposables);

		return dashboard;
	}

	// ---- Helpers ----

	private isAgentsApp(): boolean {
		const container = this.layoutService.getContainer(mainWindow);
		return !!container.querySelector('.part.chatbar'); // eslint-disable-line no-restricted-syntax
	}

	private renderCollapsibleWorkspaceIndex(container: HTMLElement): void {
		const collapsibleHeader = append(container, $('button.copilot-prototype-dashboard-collapsible-header'));
		collapsibleHeader.setAttribute('aria-expanded', 'false');
		append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-label')).textContent = localize('wsIndexSection', "Codebase Semantic Index");
		const chevronEl = append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-chevron'));
		chevronEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
		const statusBadge = append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-badge'));
		statusBadge.append(...renderLabelWithIcons('$(check) ' + localize('wsIndexReady', "Index ready")));

		const collapsibleContent = append(container, $('div.copilot-prototype-dashboard-collapsible-content'));

		const wsIndex = append(collapsibleContent, $('div.copilot-prototype-dashboard-ws-index'));
		const wsHeader = append(wsIndex, $('div.copilot-prototype-dashboard-ws-index-header'));
		append(wsHeader, $('span.copilot-prototype-dashboard-ws-index-label')).textContent = localize('wsIndexStatusLabel', "Status");
		const wsStatus = append(wsHeader, $('span.copilot-prototype-dashboard-ws-index-status'));
		wsStatus.append(...renderLabelWithIcons('$(check) ' + localize('wsIndexReady', "Ready")));

		collapsibleHeader.addEventListener('click', () => {
			const isExpanded = collapsibleContent.classList.toggle('expanded');
			chevronEl.className = 'copilot-prototype-dashboard-collapsible-chevron';
			chevronEl.classList.add(...ThemeIcon.asClassNameArray(isExpanded ? Codicon.chevronDown : Codicon.chevronRight));
			collapsibleHeader.setAttribute('aria-expanded', String(isExpanded));
		});
	}

	private renderCollapsibleQuickSettings(container: HTMLElement, disposables: DisposableStore): void {
		const collapsibleHeader = append(container, $('button.copilot-prototype-dashboard-collapsible-header'));
		collapsibleHeader.setAttribute('aria-expanded', 'false');
		append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-label')).textContent = localize('tab.inlineSuggestionsSettings', "Inline Suggestions");
		const chevronEl = append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-chevron'));
		chevronEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
		const enabledBadge = append(collapsibleHeader, $('span.copilot-prototype-dashboard-collapsible-badge'));
		enabledBadge.textContent = localize('enabled', "Enabled");

		const collapsibleContent = append(container, $('div.copilot-prototype-dashboard-collapsible-content'));

		// Checkboxes
		const checkboxes: { label: string; checked: boolean; indeterminate?: boolean }[] = [
			{ label: localize('ghostTextSuggestions', "Ghost text suggestions"), checked: true },
			{ label: localize('ghostTextSkill', "Ghost text suggestions for Skill"), checked: false, indeterminate: true },
			{ label: localize('nextEditSuggestions', "Next edit suggestions"), checked: true },
		];

		for (const item of checkboxes) {
			const cb = disposables.add(new Checkbox(item.label, item.checked, { ...defaultCheckboxStyles }));
			const row = append(collapsibleContent, $('div.copilot-prototype-dashboard-setting-row'));
			row.appendChild(cb.domNode);
			append(row, $('span.copilot-prototype-dashboard-setting-label')).textContent = item.label;
		}

		// Model dropdown
		const modelRow = append(collapsibleContent, $('div.copilot-prototype-dashboard-dropdown-row'));
		append(modelRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('model', "Model");
		const modelSelect = append(modelRow, $('select.copilot-prototype-dashboard-select'));
		for (const opt of ['copilot-nes-oct']) {
			const option = append(modelSelect, $('option'));
			option.textContent = opt;
			option.setAttribute('value', opt);
		}

		// Eagerness dropdown
		const eagernessRow = append(collapsibleContent, $('div.copilot-prototype-dashboard-dropdown-row'));
		append(eagernessRow, $('span.copilot-prototype-dashboard-setting-label')).textContent = localize('eagerness', "Eagerness");
		const eagernessSelect = append(eagernessRow, $('select.copilot-prototype-dashboard-select'));
		for (const opt of ['Low', 'Medium', 'High']) {
			const option = append(eagernessSelect, $('option'));
			option.textContent = opt;
			option.setAttribute('value', opt);
		}

		// Snooze row
		const snoozeRow = append(collapsibleContent, $('div.copilot-prototype-dashboard-snooze'));
		const snoozeBtn = disposables.add(new Button(snoozeRow, { ...defaultButtonStyles, secondary: true }));
		snoozeBtn.label = localize('snooze', "Snooze");
		append(snoozeRow, $('span.copilot-prototype-dashboard-snooze-label')).textContent = localize('hideSuggestions', "Hide suggestions for 5 min");

		collapsibleHeader.addEventListener('click', () => {
			const isExpanded = collapsibleContent.classList.toggle('expanded');
			chevronEl.className = 'copilot-prototype-dashboard-collapsible-chevron';
			chevronEl.classList.add(...ThemeIcon.asClassNameArray(isExpanded ? Codicon.chevronDown : Codicon.chevronRight));
			collapsibleHeader.setAttribute('aria-expanded', String(isExpanded));
		});
	}

	private createInfoMsg(container: HTMLElement, message: string, highlight?: boolean): void {
		const info = append(container, $('div.copilot-prototype-dashboard-info'));
		if (highlight) { info.classList.add('highlight'); }
		append(info, $('span.copilot-prototype-dashboard-info-icon')).append(...renderLabelWithIcons('$(info)'));
		const body = append(info, $('span.copilot-prototype-dashboard-info-text'));
		body.appendChild(mainWindow.document.createTextNode(message + ' '));
		const link = append(body, $('a.copilot-prototype-coin-grid-link'));
		link.textContent = localize('learnMore', "Learn more");
		link.tabIndex = 0;
		link.role = 'link';
	}

	private createCelebrateMsg(container: HTMLElement, message: string): void {
		const info = append(container, $('div.copilot-prototype-dashboard-info.celebrate'));
		append(info, $('span.copilot-prototype-dashboard-info-icon.celebrate')).append(...renderLabelWithIcons('$(info)'));
		const body = append(info, $('span.copilot-prototype-dashboard-info-text'));
		body.appendChild(mainWindow.document.createTextNode(message + ' '));
		const link = append(body, $('a.copilot-prototype-coin-grid-link'));
		link.textContent = localize('learnMore', "Learn more");
		link.tabIndex = 0;
		link.role = 'link';
	}

	private createWarningWithAction(container: HTMLElement, _disposables: DisposableStore, message: string, btnLabel: string): void {
		const w = append(container, $('div.copilot-prototype-dashboard-warning'));
		append(w, $('span.copilot-prototype-dashboard-warning-icon')).append(...renderLabelWithIcons('$(warning)'));
		const body = append(w, $('div.copilot-prototype-dashboard-warning-text'));
		body.appendChild(mainWindow.document.createTextNode(message));
		const adminRow = append(body, $('div.copilot-prototype-dashboard-warning-admin-row'));
		const requestBtn = append(adminRow, $('button.copilot-prototype-dashboard-warning-admin-btn'));
		requestBtn.textContent = btnLabel;
		requestBtn.addEventListener('click', () => this.advanceState());
	}

	private createErrorWithAction(container: HTMLElement, _disposables: DisposableStore, message: string, btnLabel: string): void {
		const w = append(container, $('div.copilot-prototype-dashboard-warning.error'));
		append(w, $('span.copilot-prototype-dashboard-warning-icon.error')).append(...renderLabelWithIcons('$(error)'));
		const body = append(w, $('div.copilot-prototype-dashboard-warning-text'));
		body.appendChild(mainWindow.document.createTextNode(message));
		const adminRow = append(body, $('div.copilot-prototype-dashboard-warning-admin-row'));
		const requestBtn = append(adminRow, $('button.copilot-prototype-dashboard-warning-admin-btn'));
		requestBtn.textContent = btnLabel;
		requestBtn.addEventListener('click', () => this.advanceState());
	}

	private createCard(container: HTMLElement, opts: {
		name: string; resetLabel: string; percent: number;
		severity?: 'warning' | 'error' | 'info' | 'celebrate'; disabled?: boolean;
		statusBadge?: string; highlight?: boolean; includedMessage?: string;
		/** Optional absolute usage line shown next to the % (e.g. "750 / 1000 AICs"). */
		usedLabel?: string;
		/** When set, render a large number + label instead of % + bar (used when no upper bound is known). */
		valueOnly?: { value: string; label: string };
	}): void {
		const card = append(container, $('div.copilot-prototype-dashboard-card'));
		if (opts.disabled) { card.classList.add('disabled'); }
		if (opts.severity === 'celebrate') { card.classList.add('celebrate'); }
		if (opts.highlight) { card.classList.add('highlight'); if (opts.severity && opts.severity !== 'celebrate') { card.classList.add(opts.severity); } }

		const titleRow = append(card, $('div.copilot-prototype-dashboard-card-title'));
		append(titleRow, $('span.copilot-prototype-dashboard-card-name')).textContent = opts.name;
		if (opts.statusBadge) { append(titleRow, $('span.copilot-prototype-dashboard-card-status')).textContent = opts.statusBadge; }

		if (opts.includedMessage) {
			append(card, $('div.copilot-prototype-dashboard-card-included')).textContent = opts.includedMessage;
			return;
		}

		// Value-only cards: render a large number + label instead of % + bar.
		if (opts.valueOnly) {
			const valueRow = append(card, $('div.copilot-prototype-dashboard-card-percent'));
			const valueLeft = append(valueRow, $('div.copilot-prototype-dashboard-card-percent-left'));
			const valueEl = append(valueLeft, $('span.copilot-prototype-dashboard-card-percent-value'));
			valueEl.textContent = opts.valueOnly.value;
			if (opts.severity) { valueEl.classList.add(opts.severity); }
			append(valueLeft, $('span.copilot-prototype-dashboard-card-percent-label')).textContent = opts.valueOnly.label;
			append(valueRow, $('span.copilot-prototype-dashboard-card-badge')).textContent = opts.resetLabel;
			return;
		}

		const percentRow = append(card, $('div.copilot-prototype-dashboard-card-percent'));
		const percentLeft = append(percentRow, $('div.copilot-prototype-dashboard-card-percent-left'));
		const percentValue = append(percentLeft, $('span.copilot-prototype-dashboard-card-percent-value'));
		percentValue.textContent = `${opts.percent}%`;
		if (opts.severity) { percentValue.classList.add(opts.severity); }
		const percentLabel = append(percentLeft, $('span.copilot-prototype-dashboard-card-percent-label'));
		percentLabel.textContent = localize('cardUsed', "used");
		if (opts.usedLabel) {
			const aicsLabel = append(percentLeft, $('span.copilot-prototype-dashboard-card-percent-aics.hover-detail'));
			aicsLabel.textContent = opts.usedLabel;
			percentLeft.classList.add('has-hover-detail');
		}
		const resetBadge = append(percentRow, $('span.copilot-prototype-dashboard-card-badge'));
		resetBadge.textContent = opts.resetLabel;

		// Show countdown on hover over the reset badge
		if (opts.resetLabel.includes('Resets')) {
			const originalText = opts.resetLabel;
			resetBadge.addEventListener('mouseenter', () => {
				const now = new Date();
				const year = now.getFullYear();
				const match = originalText.match(/Resets\s+(.+)\s+at\s+(\d+:\d+\s*[AP]M)/i);
				if (match) {
					const target = new Date(`${match[1]}, ${year} ${match[2]}`);
					if (target.getTime() <= now.getTime()) {
						target.setFullYear(year + 1);
					}
					const diff = target.getTime() - now.getTime();
					if (diff > 0) {
						const days = Math.floor(diff / (1000 * 60 * 60 * 24));
						const hrs = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
						const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
						const parts: string[] = [];
						if (days > 0) { parts.push(`${days}d`); }
						parts.push(`${hrs}h`);
						parts.push(`${mins}m`);
						resetBadge.textContent = localize('tbb3ResetsIn', "Resets in {0}", parts.join(' '));
					}
				}
			});
			resetBadge.addEventListener('mouseleave', () => {
				resetBadge.textContent = originalText;
			});
		}

		const barContainer = append(card, $('div.copilot-prototype-dashboard-card-bar'));
		if (opts.severity) { barContainer.classList.add(opts.severity); }
		if (opts.percent >= 100) { barContainer.classList.add('full'); }
		append(barContainer, $('div.copilot-prototype-dashboard-card-bar-fill')).style.width = `${opts.percent}%`;
	}

	// ---- Controller Grid ----

	renderController(container: HTMLElement, disposables: DisposableStore): void {
		container.className = 'copilot-prototype-coin-widget';

		const tabBar = mainWindow.document.createElement('div');
		tabBar.className = 'copilot-prototype-coin-tabs';

		const individualTab = mainWindow.document.createElement('div');
		individualTab.className = 'copilot-prototype-coin-tab active';
		individualTab.textContent = localize('tabIndividual', "Individual");
		individualTab.tabIndex = 0;
		individualTab.role = 'tab';

		const enterpriseTab = mainWindow.document.createElement('div');
		enterpriseTab.className = 'copilot-prototype-coin-tab';
		enterpriseTab.textContent = localize('tabEnterprise', "Enterprise");
		enterpriseTab.tabIndex = 0;
		enterpriseTab.role = 'tab';

		tabBar.append(individualTab, enterpriseTab);

		const states = CopilotTBB3StatusBarContribution.STATES;
		const individualGrid = this.buildGrid(CopilotTBB3StatusBarContribution.INDIVIDUAL_SKUS, states, disposables);
		const enterpriseGrid = this.buildGrid(CopilotTBB3StatusBarContribution.ENTERPRISE_SKUS, states, disposables);
		enterpriseGrid.style.display = 'none';

		individualTab.addEventListener('click', () => {
			individualTab.classList.add('active');
			enterpriseTab.classList.remove('active');
			individualGrid.style.display = '';
			enterpriseGrid.style.display = 'none';
		});
		enterpriseTab.addEventListener('click', () => {
			enterpriseTab.classList.add('active');
			individualTab.classList.remove('active');
			enterpriseGrid.style.display = '';
			individualGrid.style.display = 'none';
		});

		container.append(tabBar, individualGrid, enterpriseGrid);
	}

	private buildGrid(skus: readonly string[], states: readonly string[], disposables: DisposableStore): HTMLElement {
		const excluded = CopilotTBB3StatusBarContribution.EXCLUDED_CELLS;
		const visibleStates = states.filter(state => !skus.every(sku => excluded.has(`${sku}|${state}`)));

		const grid = mainWindow.document.createElement('div');
		grid.className = 'copilot-prototype-coin-grid';
		grid.style.gridTemplateColumns = `auto repeat(${skus.length}, minmax(40px, 1fr))`;
		grid.style.gridTemplateRows = `auto repeat(${visibleStates.length}, 1fr)`;

		const corner = mainWindow.document.createElement('div');
		corner.className = 'copilot-prototype-coin-grid-corner';
		corner.textContent = localize('copilotPrototypeShellCoinGridStates', "States \\ SKU");
		grid.appendChild(corner);

		for (const sku of skus) {
			const header = mainWindow.document.createElement('div');
			header.className = 'copilot-prototype-coin-grid-col-header';
			const link = mainWindow.document.createElement('a');
			link.className = 'copilot-prototype-coin-grid-link';
			link.textContent = sku;
			link.tabIndex = 0;
			link.role = 'button';
			link.addEventListener('click', () => this.startAutoAdvance(sku));
			header.appendChild(link);
			grid.appendChild(header);
		}

		for (const state of states) {
			if (skus.every(sku => excluded.has(`${sku}|${state}`))) { continue; }

			const rowHeader = mainWindow.document.createElement('div');
			rowHeader.className = 'copilot-prototype-coin-grid-row-header';
			rowHeader.textContent = state;
			grid.appendChild(rowHeader);

			for (const sku of skus) {
				const cell = mainWindow.document.createElement('div');
				cell.className = 'copilot-prototype-coin-grid-cell';
				if (!excluded.has(`${sku}|${state}`)) {
					const btn = disposables.add(new Button(cell, { ...defaultButtonStyles, secondary: true }));
					btn.label = '';
					disposables.add(btn.onDidClick(() => {
						this._autoAdvanceStates = undefined;
						this.setActiveCell(sku, state);
					}));
				}
				grid.appendChild(cell);
			}
		}

		return grid;
	}
}

registerWorkbenchContribution2(CopilotTBB3StatusBarContribution.ID, CopilotTBB3StatusBarContribution, WorkbenchPhase.AfterRestored);

// --- Prototype Coin View Pane (sidebar) ---

const COIN_VIEW_CONTAINER_ID = 'workbench.view.copilotPrototypeCoin';
const COIN_VIEW_ID = 'copilotPrototypeCoin.controllerView';

class CopilotPrototypeCoinViewPane extends ViewPane {

	static readonly ID = COIN_VIEW_ID;

	private readonly contentDisposables = this._register(new DisposableStore());

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
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService,
			contextKeyService, viewDescriptorService, instantiationService,
			openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('copilot-prototype-coin-view');
		this.renderContent(container);
	}

	private renderContent(container: HTMLElement): void {
		this.contentDisposables.clear();
		container.textContent = '';

		const tbb3Instance = CopilotTBB3StatusBarContribution.instance;

		if (!tbb3Instance) {
			const msg = mainWindow.document.createElement('div');
			msg.style.padding = '12px';
			msg.style.color = 'var(--vscode-descriptionForeground)';
			msg.textContent = localize('coinViewLoading', "Waiting for prototype controller...");
			container.appendChild(msg);
			setTimeout(() => this.renderContent(container), 1000);
			return;
		}

		tbb3Instance.renderController(container, this.contentDisposables);
		tbb3Instance.setBillingMode('tbb-3.0');
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}

// Register view container in sidebar
const coinViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: COIN_VIEW_CONTAINER_ID,
	title: localize2('prototypeCoin', "Usage Based Billing"),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [COIN_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	icon: Codicon.dashboard,
	order: 100,
}, ViewContainerLocation.Sidebar);

// Register the view inside the container
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: COIN_VIEW_ID,
	name: localize2('prototypeCoinView', "Usage Based Billing"),
	ctorDescriptor: new SyncDescriptor(CopilotPrototypeCoinViewPane),
	canToggleVisibility: true,
	canMoveView: true,
}], coinViewContainer);
