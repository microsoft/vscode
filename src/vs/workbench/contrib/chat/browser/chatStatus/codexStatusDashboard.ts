/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatus.css';
import { $, append, clearNode } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { language } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import type { ICodexAccountInfo, ICodexAccountRateLimitInfo } from '../../../../../platform/agentHost/common/codexAccount.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IHoverService, nativeHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { DomWidget } from '../../../../../platform/domWidget/browser/domWidget.js';
import { getCodexAccountPlanName, ICodexAccountService } from '../../../../services/agentHost/browser/codexAccountService.js';
import { AICustomizationManagementCommands } from '../aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { SessionType } from '../../common/chatSessionsService.js';

export function getCodexRateLimits(account: Pick<ICodexAccountInfo, 'rateLimit' | 'rateLimits'>): readonly ICodexAccountRateLimitInfo[] {
	const rateLimits = account.rateLimits ? [...account.rateLimits] : [];
	if (rateLimits.length === 0 && account.rateLimit) {
		rateLimits.push(account.rateLimit);
	}
	return rateLimits.sort((a, b) => (a.windowDurationMins ?? Number.POSITIVE_INFINITY) - (b.windowDurationMins ?? Number.POSITIVE_INFINITY));
}

export function getCodexRateLimitLabel(windowDurationMins: number | undefined): string {
	if (windowDurationMins !== undefined) {
		const weeklyWindowMins = 7 * 24 * 60;
		if (Math.abs(windowDurationMins - weeklyWindowMins) <= 60) {
			return localize('chatGPTWeeklyLimit', "Weekly limit");
		}
		if (Math.abs(windowDurationMins - 24 * 60) <= 60) {
			return localize('chatGPTDailyLimit', "Daily limit");
		}
		if (windowDurationMins % 60 === 0) {
			return localize('chatGPTHourLimit', "{0}-hour limit", windowDurationMins / 60);
		}
	}
	return localize('chatGPTUsageLimit', "Usage limit");
}

export class CodexStatusDashboard extends DomWidget {

	readonly element = $('div.chat-status-bar-entry-tooltip.codex-status-bar-entry-tooltip');

	private readonly contentStore = this._register(new DisposableStore());
	private readonly dateFormatter = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric' });
	private readonly timeFormatter = safeIntl.DateTimeFormat(language, { hour: 'numeric', minute: 'numeric' });
	private readonly percentageFormatter = safeIntl.NumberFormat(language, { maximumFractionDigits: 0, minimumFractionDigits: 0 });

	constructor(
		@ICodexAccountService private readonly codexAccountService: ICodexAccountService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this.render();
		this._register(this.codexAccountService.onDidChangeAccount(() => this.render()));
	}

	private render(): void {
		this.contentStore.clear();
		clearNode(this.element);

		const account = this.codexAccountService.account;
		const header = append(this.element, $('div.header.codex-account-header'));
		if (account.profileImageDataUri) {
			const avatar = append(header, $('img.codex-account-avatar', {
				alt: account.email
					? localize('chatGPTAvatarAlt', "ChatGPT profile image for {0}", account.email)
					: localize('chatGPTAvatarAltFallback', "ChatGPT profile image"),
				draggable: 'false',
				src: account.profileImageDataUri,
			})) as HTMLImageElement;
			avatar.decoding = 'async';
			avatar.referrerPolicy = 'no-referrer';
		} else {
			const accountIcon = append(header, $('span.codex-account-icon', { 'aria-hidden': 'true' }));
			accountIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.openai));
		}

		const details = append(header, $('div.codex-account-details'));
		const accountName = account.email ?? localize('chatGPTAccountName', "ChatGPT");
		const accountNameElement = append(details, $('span.codex-account-email', undefined, accountName));
		const planName = getCodexAccountPlanName(account);
		const planElement = append(details, $('span.codex-account-plan', undefined, planName));
		this.contentStore.add(this.hoverService.setupDelayedHover(accountNameElement, { content: accountName }));
		this.contentStore.add(this.hoverService.setupDelayedHover(planElement, { content: planName }));

		const toolbar = this.contentStore.add(new ActionBar(header, { hoverDelegate: nativeHoverDelegate }));
		toolbar.push(toAction({
			id: 'codex.openAgentCustomizations',
			label: localize('openCodexAgentCustomizations', "Agent Customizations for Codex"),
			class: ThemeIcon.asClassName(Codicon.settingsGear),
			run: () => {
				this.hoverService.hideHover(true);
				return this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
					sessionType: SessionType.AgentHostCodex,
					section: AICustomizationManagementSection.HarnessSettings,
				});
			},
		}), { icon: true, label: false });

		const rateLimits = getCodexRateLimits(account);
		if (rateLimits.length === 0) {
			append(this.element, $('div.description', undefined, localize('chatGPTUsageUnavailable', "Usage information is not available.")));
			return;
		}

		for (const rateLimit of rateLimits) {
			this.appendRateLimit(rateLimit);
		}
	}

	private appendRateLimit(rateLimit: ICodexAccountRateLimitInfo): void {
		const label = getCodexRateLimitLabel(rateLimit.windowDurationMins);
		const usedPercent = Math.min(100, Math.max(0, rateLimit.usedPercent));
		const percentage = this.percentageFormatter.value.format(Math.floor(usedPercent));
		const resetLabel = this.formatResetLabel(rateLimit.resetsAt);
		const quotaBit = $('div.quota-bit');
		quotaBit.style.width = `${usedPercent}%`;

		const quotaBar = $('div.quota-bar', { 'aria-hidden': 'true' }, quotaBit);
		const indicator = $('div.quota-indicator.codex-rate-limit', {
			role: 'group',
			'aria-label': resetLabel
				? localize('chatGPTRateLimitAriaWithReset', "{0}: {1}% used. {2}", label, percentage, resetLabel)
				: localize('chatGPTRateLimitAria', "{0}: {1}% used", label, percentage),
		},
			$('div.quota-title', undefined,
				$('span', undefined, label),
				...(resetLabel ? [$('span.quota-reset', undefined, resetLabel)] : []),
			),
			$('div.quota-details', undefined,
				$('div.quota-percentage', undefined,
					$('span.quota-value', undefined, localize('chatGPTRateLimitValue', "{0}%", percentage)),
					$('span.quota-value-suffix', undefined, localize('chatGPTRateLimitUsed', "used")),
				),
			),
			quotaBar,
		);
		this.element.appendChild(indicator);
	}

	private formatResetLabel(resetsAt: number | undefined): string | undefined {
		if (!resetsAt) {
			return undefined;
		}
		const resetDate = new Date(resetsAt * 1000);
		return localize('chatGPTRateLimitReset', "Resets {0} at {1}", this.dateFormatter.value.format(resetDate), this.timeFormatter.value.format(resetDate));
	}
}
