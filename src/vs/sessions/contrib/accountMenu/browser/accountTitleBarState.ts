/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { State, StateType } from '../../../../platform/update/common/update.js';
import { ChatEntitlement, IChatSentiment, IQuotaSnapshot } from '../../../../workbench/services/chat/common/chatEntitlementService.js';

export type AccountTitleBarStateSource = 'account' | 'copilot' | 'update';
export type AccountTitleBarStateKind = 'default' | 'accent' | 'warning' | 'prominent';

export interface IAccountTitleBarStateContext {
	readonly isAccountLoading: boolean;
	readonly accountName?: string;
	readonly accountProviderLabel?: string;
	readonly updateState: State;
	readonly entitlement: ChatEntitlement;
	readonly sentiment: Pick<IChatSentiment, 'hidden' | 'disabled' | 'untrusted'>;
	readonly quotas: {
		readonly chat?: IQuotaSnapshot;
		readonly completions?: IQuotaSnapshot;
	};
}

export interface IAccountTitleBarState {
	readonly source: AccountTitleBarStateSource;
	readonly kind: AccountTitleBarStateKind;
	readonly icon: ThemeIcon;
	readonly label: string;
	readonly ariaLabel: string;
	readonly badge?: string;
	readonly revealLabelOnHover?: boolean;
}

export function getAccountTitleBarState(context: IAccountTitleBarStateContext): IAccountTitleBarState {
	const updateState = getUpdatePresentation(context.updateState);
	if (updateState) {
		return updateState;
	}

	const copilotState = getCopilotPresentation(context.entitlement, context.sentiment, context.quotas);
	if (copilotState) {
		return copilotState;
	}

	if (context.isAccountLoading) {
		return {
			source: 'account',
			kind: 'default',
			icon: ThemeIcon.modify(Codicon.loading, 'spin'),
			label: localize('loadingAccount', "Loading Account..."),
			ariaLabel: localize('loadingAccountAria', "Loading account"),
			revealLabelOnHover: true,
		};
	}

	if (context.accountName) {
		return {
			source: 'account',
			kind: 'default',
			icon: Codicon.account,
			label: context.accountName,
			revealLabelOnHover: true,
			ariaLabel: context.accountProviderLabel
				? localize('accountSignedInAria', "Signed in as {0} with {1}", context.accountName, context.accountProviderLabel)
				: localize('accountSignedInAriaNameOnly', "Signed in as {0}", context.accountName),
		};
	}

	return {
		source: 'account',
		kind: 'prominent',
		icon: Codicon.account,
		label: localize('signInLabel', "Sign In"),
		ariaLabel: localize('signInAria', "Sign in to your account"),
	};
}

function getUpdatePresentation(state: State): IAccountTitleBarState | undefined {
	switch (state.type) {
		case StateType.AvailableForDownload:
			return {
				source: 'update',
				kind: 'prominent',
				icon: Codicon.cloudDownload,
				label: localize('updateAvailable', "New Update Available"),
				badge: localize('updateBadgeNew', "New"),
				ariaLabel: localize('updateAvailableAria', "New update available"),
			};

		case StateType.Ready:
			return {
				source: 'update',
				kind: 'prominent',
				icon: Codicon.cloudDownload,
				label: localize('restartToUpdate', "Restart to Update"),
				badge: localize('updateBadgeReady', "Ready"),
				ariaLabel: localize('restartToUpdateAria', "Update ready to install"),
			};

		case StateType.Downloading:
		case StateType.Overwriting:
			return {
				source: 'update',
				kind: 'accent',
				icon: ThemeIcon.modify(Codicon.loading, 'spin'),
				label: localize('downloadingUpdate', "Downloading Update"),
				badge: getUpdateProgressBadge(state),
				ariaLabel: localize('downloadingUpdateAria', "Update download in progress"),
			};

		case StateType.Downloaded:
		case StateType.Updating:
		case StateType.Restarting:
			return {
				source: 'update',
				kind: 'accent',
				icon: ThemeIcon.modify(Codicon.loading, 'spin'),
				label: localize('installingUpdate', "Installing Update"),
				ariaLabel: localize('installingUpdateAria', "Update install in progress"),
			};

		default:
			return undefined;
	}
}

function getUpdateProgressBadge(state: Extract<State, { type: StateType.Downloading | StateType.Overwriting }>): string | undefined {
	if (state.type !== StateType.Downloading) {
		return undefined;
	}

	if (typeof state.downloadedBytes !== 'number' || typeof state.totalBytes !== 'number' || state.totalBytes <= 0) {
		return undefined;
	}

	return `${Math.min(100, Math.max(0, Math.round((state.downloadedBytes / state.totalBytes) * 100)))}%`;
}

function getCopilotPresentation(
	entitlement: ChatEntitlement,
	sentiment: Pick<IChatSentiment, 'hidden' | 'disabled' | 'untrusted'>,
	quotas: { readonly chat?: IQuotaSnapshot; readonly completions?: IQuotaSnapshot }
): IAccountTitleBarState | undefined {
	if (sentiment.hidden) {
		return undefined;
	}

	if (entitlement === ChatEntitlement.Unknown) {
		return {
			source: 'copilot',
			kind: 'prominent',
			icon: Codicon.copilotNotConnected,
			label: localize('copilotSignedOut', "Copilot Signed Out"),
			ariaLabel: localize('copilotSignedOutAria', "GitHub Copilot is signed out"),
		};
	}

	if (sentiment.disabled || sentiment.untrusted) {
		return {
			source: 'copilot',
			kind: 'warning',
			icon: Codicon.copilotUnavailable,
			label: localize('copilotUnavailable', "Copilot Unavailable"),
			ariaLabel: sentiment.untrusted
				? localize('copilotUnavailableUntrustedAria', "GitHub Copilot is unavailable in untrusted workspaces")
				: localize('copilotUnavailableDisabledAria', "GitHub Copilot is disabled"),
		};
	}

	const chatQuotaExceeded = quotas.chat?.percentRemaining === 0;
	const completionsQuotaExceeded = quotas.completions?.percentRemaining === 0;
	if (entitlement === ChatEntitlement.Free && (chatQuotaExceeded || completionsQuotaExceeded)) {
		return {
			source: 'copilot',
			kind: 'warning',
			icon: Codicon.copilotWarning,
			label: localize('copilotQuotaReached', "Quota Reached"),
			ariaLabel: getQuotaReachedAriaLabel(chatQuotaExceeded, completionsQuotaExceeded),
		};
	}

	const remainingPercent = getLowestPositivePercent(quotas.chat, quotas.completions);
	if (entitlement === ChatEntitlement.Free && typeof remainingPercent === 'number' && remainingPercent <= 25) {
		return {
			source: 'copilot',
			kind: remainingPercent <= 10 ? 'warning' : 'accent',
			icon: remainingPercent <= 10 ? Codicon.copilotWarning : Codicon.copilot,
			label: localize('copilotTokensRemaining', "Tokens Remaining"),
			badge: `${remainingPercent}%`,
			ariaLabel: localize('copilotTokensRemainingAria', "{0}% GitHub Copilot tokens remaining", remainingPercent),
		};
	}

	return undefined;
}

function getLowestPositivePercent(...quotas: Array<IQuotaSnapshot | undefined>): number | undefined {
	let lowest: number | undefined;
	for (const quota of quotas) {
		if (typeof quota?.percentRemaining !== 'number' || quota.percentRemaining <= 0) {
			continue;
		}

		lowest = typeof lowest === 'number'
			? Math.min(lowest, quota.percentRemaining)
			: quota.percentRemaining;
	}

	return lowest;
}

function getQuotaReachedAriaLabel(chatQuotaExceeded: boolean, completionsQuotaExceeded: boolean): string {
	if (chatQuotaExceeded && completionsQuotaExceeded) {
		return localize('copilotAllQuotaReachedAria', "GitHub Copilot chat and inline suggestion quota reached");
	}

	if (chatQuotaExceeded) {
		return localize('copilotChatQuotaReachedAria', "GitHub Copilot chat quota reached");
	}

	return localize('copilotCompletionsQuotaReachedAria', "GitHub Copilot inline suggestion quota reached");
}
