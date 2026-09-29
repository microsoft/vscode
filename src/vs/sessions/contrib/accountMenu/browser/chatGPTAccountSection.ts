/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/accountTitleBarWidget.css';
import { $, append } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow, safeIntl } from '../../../../base/common/date.js';
import { language } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import type { ICodexAccountRateLimitInfo } from '../../../../platform/agentHost/common/codexAccount.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { DomWidget } from '../../../../platform/domWidget/browser/domWidget.js';
import { AICustomizationManagementCommands } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { getCodexRateLimitLabel, getCodexRateLimits } from '../../../../workbench/contrib/chat/browser/chatStatus/codexStatusDashboard.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../../workbench/contrib/chat/common/constants.js';
import { getCodexAccountPlanName, ICodexAccountService, type ICodexAccountViewInfo } from '../../../../workbench/services/agentHost/browser/codexAccountService.js';

const accountFullDateFormatter = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' });
const accountTimeFormatter = safeIntl.DateTimeFormat(language, { hour: 'numeric', minute: 'numeric' });

export interface IChatGPTAccountSectionOptions {
	readonly account: ICodexAccountViewInfo;
	readonly avatarUrl?: string;
	readonly onWillRunAction?: () => void;
}

export function getChatGPTRateLimitResetHover(rateLimit: ICodexAccountRateLimitInfo): string | undefined {
	if (!rateLimit.resetsAt) {
		return undefined;
	}
	const resetDate = new Date(rateLimit.resetsAt * 1000);
	const duration = rateLimit.windowDurationMins;
	if (duration !== undefined && duration < 24 * 60) {
		return localize('chatGPTShortLimitResetExact', "Resets at {0}", accountTimeFormatter.value.format(resetDate));
	}
	return localize(
		'chatGPTLongLimitResetExact',
		"Resets on {0} at {1}",
		accountFullDateFormatter.value.format(resetDate),
		accountTimeFormatter.value.format(resetDate),
	);
}

export class ChatGPTAccountSection extends DomWidget {

	readonly element: HTMLElement;

	private readonly avatar: HTMLImageElement;
	private readonly accountIcon: HTMLElement;

	constructor(
		private readonly options: IChatGPTAccountSectionOptions,
		@ICodexAccountService private readonly codexAccountService: ICodexAccountService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		const account = options.account;
		this.element = $('section.sessions-account-titlebar-panel-provider-account', {
			'aria-label': localize('chatGPTAccountSectionLabel', "ChatGPT account")
		});
		const identity = append(this.element, $('.sessions-account-titlebar-panel-provider-identity'));
		this.avatar = append(identity, $('img.sessions-account-titlebar-panel-provider-avatar', {
			alt: account.email
				? localize('chatGPTAvatarAlt', "ChatGPT profile image for {0}", account.email)
				: localize('chatGPTAvatarAltFallback', "ChatGPT profile image"),
			draggable: 'false',
		})) as HTMLImageElement;
		this.avatar.decoding = 'async';
		this.avatar.referrerPolicy = 'no-referrer';
		this.accountIcon = append(identity, $('span.sessions-account-titlebar-panel-provider-icon', { 'aria-hidden': 'true' }));
		this.accountIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.openai));
		this.setAvatarUrl(options.avatarUrl);

		append(identity, $('.sessions-account-titlebar-panel-provider-name', undefined, account.email ?? localize('chatGPTAccountName', "ChatGPT")));
		const actions = append(identity, $('.sessions-account-titlebar-panel-provider-actions'));
		const actionBar = this._register(new ActionBar(actions));
		this._register(actionBar.onWillRun(() => {
			this.hoverService.hideHover(true);
			this.options.onWillRunAction?.();
		}));
		actionBar.push(this._register(new Action(
			'codex.manageChatGPTModels',
			localize('manageChatGPTModels', "Manage ChatGPT Models"),
			ThemeIcon.asClassName(Codicon.openai),
			true,
			() => this.commandService.executeCommand(MANAGE_CHAT_COMMAND_ID, '@provider:"ChatGPT"'),
		)), { icon: true, label: false });
		actionBar.push(this._register(new Action(
			'codex.openAgentCustomizations',
			localize('openCodexAgentCustomizations', "Agent Customizations for Codex"),
			ThemeIcon.asClassName(Codicon.settingsGear),
			true,
			() => this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
				sessionType: SessionType.AgentHostCodex,
				section: AICustomizationManagementSection.HarnessSettings,
			}),
		)), { icon: true, label: false });
		actionBar.push(this._register(new Action(
			'codex.signOutOfChatGPT',
			localize('signOutOfChatGPT', "Sign Out"),
			ThemeIcon.asClassName(Codicon.signOut),
			true,
			() => this.codexAccountService.signOut(),
		)), { icon: true, label: false });

		this.renderUsage(account);
	}

	setAvatarUrl(avatarUrl: string | undefined): void {
		this.avatar.classList.toggle('hidden', !avatarUrl);
		this.accountIcon.classList.toggle('hidden', !!avatarUrl);
		if (avatarUrl) {
			if (this.avatar.src !== avatarUrl) {
				this.avatar.src = avatarUrl;
			}
		} else {
			this.avatar.removeAttribute('src');
		}
	}

	private renderUsage(account: ICodexAccountViewInfo): void {
		const usage = append(this.element, $('.sessions-account-titlebar-panel-provider-usage'));
		const planRow = append(usage, $('.sessions-account-titlebar-panel-provider-metric-row.primary'));
		append(planRow, $('span.sessions-account-titlebar-panel-provider-plan', undefined, getCodexAccountPlanName(account)));
		const percentageFormatter = safeIntl.NumberFormat(language, { maximumFractionDigits: 0 });
		for (const rateLimit of getCodexRateLimits(account)) {
			const label = getCodexRateLimitLabel(rateLimit.windowDurationMins);
			const description = rateLimit.resetsAt
				? localize('chatGPTLimitReset', "{0} resets {1}", label, fromNow(rateLimit.resetsAt * 1000, false, true))
				: label;
			const usedPercentage = percentageFormatter.value.format(rateLimit.usedPercent);
			const row = append(usage, $('.sessions-account-titlebar-panel-provider-metric-row.secondary'));
			append(row, $('span.sessions-account-titlebar-panel-provider-reset', undefined, description));
			append(row, $('span.sessions-account-titlebar-panel-provider-usage-label', undefined, localize('chatGPTLimitUsedPercentage', "{0}% used", usedPercentage)));

			const resetHover = getChatGPTRateLimitResetHover(rateLimit);
			if (resetHover) {
				row.tabIndex = 0;
				row.setAttribute('aria-label', localize('chatGPTLimitResetAria', "{0}, {1}% used. {2}", description, usedPercentage, resetHover));
				this._register(this.hoverService.setupDelayedHover(row, { content: resetHover }, { setupKeyboardEvents: true }));
			}
		}
	}
}
