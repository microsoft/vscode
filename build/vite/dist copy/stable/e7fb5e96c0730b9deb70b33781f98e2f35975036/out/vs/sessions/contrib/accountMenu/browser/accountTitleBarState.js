/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ChatEntitlement } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
export function getAccountTitleBarBadgeKey(state) {
    if (!state.dotBadge) {
        return undefined;
    }
    return `${state.source}:${state.dotBadge}:${state.badge ?? ''}`;
}
export function getAccountTitleBarState(context) {
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
    const copilotState = getCopilotPresentation(context.entitlement, context.sentiment, context.quotas);
    if (copilotState) {
        return copilotState;
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
function getCopilotPresentation(entitlement, sentiment, quotas) {
    if (sentiment.hidden) {
        return undefined;
    }
    if (entitlement === ChatEntitlement.Unknown) {
        return {
            source: 'copilot',
            kind: 'prominent',
            icon: Codicon.account,
            label: localize('agentsSignedOut', "Agents Signed Out"),
            ariaLabel: localize('agentsSignedOutAria', "Agents is signed out"),
        };
    }
    if (sentiment.disabled || sentiment.untrusted) {
        return {
            source: 'copilot',
            kind: 'warning',
            icon: Codicon.account,
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
            icon: Codicon.account,
            label: localize('copilotQuotaReached', "Quota Reached"),
            dotBadge: 'error',
            ariaLabel: getQuotaReachedAriaLabel(chatQuotaExceeded, completionsQuotaExceeded),
        };
    }
    const remainingPercent = getLowestPositivePercent(quotas.chat, quotas.completions);
    if (entitlement === ChatEntitlement.Free && typeof remainingPercent === 'number' && remainingPercent <= 25) {
        return {
            source: 'copilot',
            kind: remainingPercent <= 10 ? 'warning' : 'accent',
            icon: Codicon.account,
            label: localize('copilotTokensRemaining', "Tokens Remaining"),
            badge: `${remainingPercent}%`,
            dotBadge: remainingPercent <= 10 ? 'error' : 'warning',
            ariaLabel: localize('copilotTokensRemainingAria', "{0}% GitHub Copilot tokens remaining", remainingPercent),
        };
    }
    return undefined;
}
function getLowestPositivePercent(...quotas) {
    let lowest;
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
function getQuotaReachedAriaLabel(chatQuotaExceeded, completionsQuotaExceeded) {
    if (chatQuotaExceeded && completionsQuotaExceeded) {
        return localize('copilotAllQuotaReachedAria', "GitHub Copilot chat and inline suggestion quota reached");
    }
    if (chatQuotaExceeded) {
        return localize('copilotChatQuotaReachedAria', "GitHub Copilot chat quota reached");
    }
    return localize('copilotCompletionsQuotaReachedAria', "GitHub Copilot inline suggestion quota reached");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjb3VudFRpdGxlQmFyU3RhdGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FjY291bnRNZW51L2Jyb3dzZXIvYWNjb3VudFRpdGxlQmFyU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBa0MsTUFBTSxzRUFBc0UsQ0FBQztBQTRCdkksTUFBTSxVQUFVLDBCQUEwQixDQUFDLEtBQTRCO0lBQ3RFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDckIsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELE9BQU8sR0FBRyxLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFLEVBQUUsQ0FBQztBQUNqRSxDQUFDO0FBRUQsTUFBTSxVQUFVLHVCQUF1QixDQUFDLE9BQXFDO0lBQzVFLElBQUksT0FBTyxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDOUIsT0FBTztZQUNOLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLElBQUksRUFBRSxTQUFTO1lBQ2YsSUFBSSxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUM7WUFDL0MsS0FBSyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxvQkFBb0IsQ0FBQztZQUN2RCxTQUFTLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLGlCQUFpQixDQUFDO1lBQzVELGtCQUFrQixF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