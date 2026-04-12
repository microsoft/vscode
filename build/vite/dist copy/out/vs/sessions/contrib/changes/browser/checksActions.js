/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
export const hasActiveSessionFailedCIChecks = new RawContextKey('sessions.hasActiveSessionFailedCIChecks', false);
// --- Shared CI check utilities ------------------------------------------------
export var CICheckGroup;
(function (CICheckGroup) {
    CICheckGroup[CICheckGroup["Running"] = 0] = "Running";
    CICheckGroup[CICheckGroup["Pending"] = 1] = "Pending";
    CICheckGroup[CICheckGroup["Failed"] = 2] = "Failed";
    CICheckGroup[CICheckGroup["Successful"] = 3] = "Successful";
})(CICheckGroup || (CICheckGroup = {}));
export function isFailedConclusion(conclusion) {
    return conclusion === "failure" /* GitHubCheckConclusion.Failure */
        || conclusion === "timed_out" /* GitHubCheckConclusion.TimedOut */
        || conclusion === "action_required" /* GitHubCheckConclusion.ActionRequired */;
}
export function getCheckGroup(check) {
    switch (check.status) {
        case "in_progress" /* GitHubCheckStatus.InProgress */:
            return 0 /* CICheckGroup.Running */;
        case "queued" /* GitHubCheckStatus.Queued */:
            return 1 /* CICheckGroup.Pending */;
        case "completed" /* GitHubCheckStatus.Completed */:
            return isFailedConclusion(check.conclusion) ? 2 /* CICheckGroup.Failed */ : 3 /* CICheckGroup.Successful */;
    }
}
export function getCheckStateLabel(check) {
    switch (getCheckGroup(check)) {
        case 0 /* CICheckGroup.Running */:
            return localize('ci.runningState', "running");
        case 1 /* CICheckGroup.Pending */:
            return localize('ci.pendingState', "pending");
        case 2 /* CICheckGroup.Failed */:
            return localize('ci.failedState', "failed");
        case 3 /* CICheckGroup.Successful */:
            return localize('ci.successfulState', "successful");
    }
}
export function getFailedChecks(checks) {
    return checks.filter(check => getCheckGroup(check) === 2 /* CICheckGroup.Failed */);
}
export function buildFixChecksPrompt(failedChecks) {
    const sections = failedChecks.map(({ check, annotations }) => {
        const parts = [
            `Check: ${check.name}`,
            `Status: ${getCheckStateLabel(check)}`,
            `Conclusion: ${check.conclusion ?? 'unknown'}`,
        ];
        if (check.detailsUrl) {
            parts.push(`Details: ${check.detailsUrl}`);
        }
        parts.push('', 'Annotations and output:', annotations || 'No output available for this check run.');
        return parts.join('\n');
    });
    return [
        'Please fix the failed CI checks for this session immediately.',
        'Use the failed check information below, including annotations and check output, to identify the root causes and make the necessary code changes.',
        'Focus on resolving these CI failures. Avoid unrelated changes unless they are required to fix the checks.',
        '',
        'Failed CI checks:',
        '',
        sections.join('\n\n---\n\n'),
    ].join('\n');
}
/**
 * Sets the `hasActiveSessionFailedCIChecks` context key to true when the
 * active session has a PR with CI checks and at least one has failed.
 */
let ActiveSessionFailedCIChecksContextContribution = class ActiveSessionFailedCIChecksContextContribution extends Disposable {
    static { this.ID = 'workbench.contrib.activeSessionFailedCIChecksContext'; }
    constructor(contextKeyService, sessionManagementService, gitHubService) {
        super();
        const ciModelObs = derived(this, reader => {
            const session = sessionManagementService.activeSession.read(reader);
            if (!session) {
                return undefined;
            }
            const gitHubInfo = session.gitHubInfo.read(reader);
            if (!gitHubInfo?.pullRequest) {
                return undefined;
            }
            const prModel = gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
            const pr = prModel.pullRequest.read(reader);
            if (!pr) {
                return undefined;
            }
            return gitHubService.getPullRequestCI(gitHubInfo.owner, gitHubInfo.repo, pr.headRef);
        });
        this._register(bindContextKey(hasActiveSessionFailedCIChecks, contextKeyService, reader => {
            const ciModel = ciModelObs.read(reader);
            if (!ciModel) {
                return false;
            }
            const checks = ciModel.checks.read(reader);
            return getFailedChecks(checks).length > 0;
        }));
    }
};
ActiveSessionFailedCIChecksContextContribution = __decorate([
    __param(0, IContextKeyService),
    __param(1, ISessionsManagementService),
    __param(2, IGitHubService)
], ActiveSessionFailedCIChecksContextContribution);
class FixCIChecksAction extends Action2 {
    static { this.ID = 'sessions.action.fixCIChecks'; }
    constructor() {
        super({
            id: FixCIChecksAction.ID,
            title: localize2('fixCIChecks', 'Fix CI Checks'),
            icon: Codicon.lightbulbAutofix,
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasActiveSessionFailedCIChecks),
            menu: [{
                    id: MenuId.ChatEditingSessionApplySubmenu,
                    group: 'navigation',
                    order: 4,
                    when: ContextKeyExpr.and(IsSessionsWindowContext, hasActiveSessionFailedCIChecks),
                }],
        });
    }
    async run(accessor) {
        const sessionManagementService = accessor.get(ISessionsManagementService);
        const gitHubService = accessor.get(IGitHubService);
        const chatWidgetService = accessor.get(IChatWidgetService);
        const logService = accessor.get(ILogService);
        const activeSession = sessionManagementService.activeSession.get();
        if (!activeSession) {
            return;
        }
        const gitHubInfo = activeSession.gitHubInfo.get();
        if (!gitHubInfo?.pullRequest) {
            return;
        }
        const prModel = gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
        const pr = prModel.pullRequest.get();
        if (!pr) {
            return;
        }
        const ciModel = gitHubService.getPullRequestCI(gitHubInfo.owner, gitHubInfo.repo, pr.headRef);
        const checks = ciModel.checks.get();
        const failedChecks = getFailedChecks(checks);
        if (failedChecks.length === 0) {
            return;
        }
        const failedCheckDetails = await Promise.all(failedChecks.map(async (check) => {
            const annotations = await ciModel.getCheckRunAnnotations(check.id);
            return { check, annotations };
        }));
        const prompt = buildFixChecksPrompt(failedCheckDetails);
        const sessionResource = activeSession.resource;
        const chatWidget = chatWidgetService.getWidgetBySessionResource(sessionResource)
            ?? await chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
        if (!chatWidget) {
            logService.error('[FixCIChecks] Cannot fix CI checks: no chat widget found for session', sessionResource.toString());
            return;
        }
        await chatWidget.acceptInput(prompt, { noCommandDetection: true });
    }
}
registerWorkbenchContribution2(ActiveSessionFailedCIChecksContextContribution.ID, ActiveSessionFailedCIChecksContextContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerAction2(FixCIChecksAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hlY2tzQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL2NoZWNrc0FjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXpILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDbkcsT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2SSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM1RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDdkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUV2RSxPQUFPLEVBQUUsMEJB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