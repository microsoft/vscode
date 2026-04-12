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
import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { ChatViewModel } from '../../common/model/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { ChatListWidget } from '../widget/chatListWidget.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from './agentSessions.js';
import { getAgentChangesSummary, hasValidDiff } from './agentSessionsModel.js';
import './media/agentSessionHoverWidget.css';
const HEADER_HEIGHT = 60;
const CHAT_LIST_HEIGHT = 240;
const CHAT_HOVER_WIDTH = 500;
let AgentSessionHoverWidget = class AgentSessionHoverWidget extends Disposable {
    constructor(session, chatService, instantiationService, chatWidgetService) {
        super();
        this.session = session;
        this.chatService = chatService;
        this.instantiationService = instantiationService;
        this.chatWidgetService = chatWidgetService;
        this.hasRendered = false;
        this.domNode = dom.$('.agent-session-hover.interactive-session');
        this.domNode.style.width = `${CHAT_HOVER_WIDTH}px`;
        this.domNode.style.height = `${HEADER_HEIGHT + CHAT_LIST_HEIGHT}px`;
        this.domNode.style.overflow = 'hidden';
        this.cts = new CancellationTokenSource();
        this._register(toDisposable(() => this.cts.cancel()));
        // Build header immediately
        this.buildHeader();
        // Create content container with loading state
        this.contentElement = dom.append(this.domNode, dom.$('.agent-session-hover-content'));
        this.loadingElement = dom.append(this.contentElement, dom.$('.agent-session-hover-loading'));
        dom.append(this.loadingElement, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
        // Delay rendering by 200ms to avoid expensive rendering for brief hovers
        this.renderScheduler = this._register(new RunOnceScheduler(() => this.render(), 200));
    }
    onRendered() {
        this.modelRef ??= this.loadModel();
        if (!this.hasRendered) {
            this.hasRendered = true;
            this.renderScheduler.schedule();
        }
        else {
            this.listWidget?.layout(CHAT_LIST_HEIGHT, CHAT_HOVER_WIDTH);
        }
    }
    async loadModel() {
        const modelRef = await this.chatService.acquireOrLoadSession(this.session.resource, ChatAgentLocation.Chat, this.cts.token, 'AgentSessionHoverWidget#loadModel');
        if (this._store.isDisposed) {
            modelRef?.dispose();
            return;
        }
        if (!modelRef) {
            // Show fallback tooltip text
            this.loadingElement.remove();
            const tooltip = this.buildFallbackTooltip(this.session);
            this.domNode.textContent = typeof tooltip === 'string' ? tooltip : tooltip.value;
            return;
        }
        this._register(modelRef);
        return modelRef.object;
    }
    async render() {
        this.modelRef ??= this.loadModel();
        const model = await this.modelRef;
        if (!model || this._store.isDisposed) {
            return;
        }
        // Remove loading state
        this.loadingElement.remove();
        // Create view model - only show last request+response pair
        const viewModel = this._register(this.instantiationService.createInstance(ChatViewModel, model, { maxVisibleItems: 2 }));
        // Create the chat list widget
        const container = dom.append(this.contentElement, dom.$('.interactive-list'));
        const listWidget = this._register(this.instantiationService.createInstance(ChatListWidget, container, {
            rendererOptions: {
                renderStyle: 'compact',
                noHeader: true,
                editable: false,
            },
            currentChatMode: () => ChatModeKind.Ask,
        }));
        listWidget.layout(CHAT_LIST_HEIGHT, CHAT_HOVER_WIDTH);
        listWidget.setScrollLock(true);
        listWidget.setViewModel(viewModel);
        listWidget.refresh();
        const viewModelScheudler = this._register(new RunOnceScheduler(() => listWidget.refresh(), 500));
        this._register(viewModel.onDidChange(() => {
            if (!viewModelScheudler.isScheduled()) {
                viewModelScheudler.schedule();
            }
        }));
        // Handle followup clicks - open the session and accept input
        this._register(listWidget.onDidClickFollowup(async (followup) => {
            const widget = await this.chatWidgetService.openSession(model.sessionResource);
            if (widget) {
                widget.acceptInput(followup.message);
            }
        }));
    }
    buildHeader() {
        const session = this.session;
        const header = dom.append(this.domNode, dom.$('.agent-session-hover-header'));
        // Title row
        const titleRow = dom.append(header, dom.$('.agent-session-hover-title'));
        dom.append(titleRow, dom.$('span', undefined, session.label));
        // Details row: Provider icon + Duration/Time • Diff • Status (if not completed)
        const detailsRow = dom.append(header, dom.$('.agent-session-hover-details'));
        // Provider icon + name + Duration or start time
        const providerType = getAgentSessionProvider(session.providerType);
        const provider = providerType ?? AgentSessionProviders.Local;
        const providerIcon = getAgentSessionProviderIcon(provider);
        dom.append(detailsRow, renderIcon(providerIcon));
        dom.append(detailsRow, dom.$('span', undefined, getAgentSessionProviderName(provider)));
        dom.append(detailsRow, dom.$('span.separator', undefined, '•'));
        if (session.timing.lastRequestEnded && session.timing.lastRequestStarted) {
            const duration = this.toDuration(session.timing.lastRequestStarted, session.timing.lastRequestEnded, true);
            if (duration) {
                dom.append(detailsRow, dom.$('span', undefined, duration));
            }
        }
        else {
            const startTime = session.timing.lastRequestStarted ?? session.timing.created;
            dom.append(detailsRow, dom.$('span', undefined, fromNow(startTime, true, true)));
        }
        // Diff information
        const diff = getAgentChangesSummary(session.changes);
        if (diff && hasValidDiff(session.changes)) {
            dom.append(detailsRow, dom.$('span.separator', undefined, '•'));
            const diffContainer = dom.append(detailsRow, dom.$('.agent-session-hover-diff'));
            if (diff.files > 0) {
                dom.append(diffContainer, dom.$('span', undefined, diff.files === 1 ? localize('tooltip.file', "1 file") : localize('tooltip.files', "{0} files", diff.files)));
            }
            if (diff.insertions > 0) {
                dom.append(diffContainer, dom.$('span.insertions', undefined, `+${diff.insertions}`));
            }
            if (diff.deletions > 0) {
                dom.append(diffContainer, dom.$('span.deletions', undefined, `-${diff.deletions}`));
            }
        }
        // Status (only show if not completed)
        if (session.status !== 1 /* AgentSessionStatus.Completed */) {
            dom.append(detailsRow, dom.$('span.separator', undefined, '•'));
            dom.append(detailsRow, dom.$('span', undefined, this.toStatusLabel(session.status)));
        }
        // Archived indicator
        if (session.isArchived()) {
            dom.append(detailsRow, dom.$('span.separator', undefined, '•'));
            dom.append(detailsRow, renderIcon(Codicon.archive));
            dom.append(detailsRow, dom.$('span', undefined, localize('tooltip.archived', "Archived")));
        }
    }
    buildFallbackTooltip(session) {
        const lines = [];
        // Title
        lines.push(`**${session.label}**`);
        // Tooltip (from provider)
        if (session.tooltip) {
            const tooltip = typeof session.tooltip === 'string' ? session.tooltip : session.tooltip.value;
            lines.push(tooltip);
        }
        else {
            // Description
            if (session.description) {
                const description = typeof session.description === 'string' ? session.description : session.description.value;
                lines.push(description);
            }
            // Badge
            if (session.badge) {
                const badge = typeof session.badge === 'string' ? session.badge : session.badge.value;
                lines.push(badge);
            }
        }
        // Details line: Provider icon + Duration/Time • Diff • Status (if not completed)
        const details = [];
        // Provider icon + name + Duration or start time
        const providerType = getAgentSessionProvider(session.providerType);
        const provider = providerType ?? AgentSessionProviders.Local;
        const providerIcon = getAgentSessionProviderIcon(provider);
        const providerName = getAgentSessionProviderName(provider);
        let timeLabel;
        if (session.timing.lastRequestEnded && session.timing.lastRequestStarted) {
            const duration = this.toDuration(session.timing.lastRequestStarted, session.timing.lastRequestEnded, true);
            timeLabel = duration ?? fromNow(session.timing.lastRequestStarted, true, true);
        }
        else {
            const startTime = session.timing.lastRequestStarted ?? session.timing.created;
            timeLabel = fromNow(startTime, true, true);
        }
        details.push(`$(${providerIcon.id}) ${providerName} • ${timeLabel}`);
        // Diff information
        const diff = getAgentChangesSummary(session.changes);
        if (diff && hasValidDiff(session.changes)) {
            const diffParts = [];
            if (diff.files > 0) {
                diffParts.push(diff.files === 1 ? localize('tooltip.file', "1 file") : localize('tooltip.files', "{0} files", diff.files));
            }
            if (diff.insertions > 0) {
                diffParts.push(`+${diff.insertions}`);
            }
            if (diff.deletions > 0) {
                diffParts.push(`-${diff.deletions}`);
            }
            if (diffParts.length > 0) {
                details.push(diffParts.join(' '));
            }
        }
        // Status (only show if not completed)
        if (session.status !== 1 /* AgentSessionStatus.Completed */) {
            details.push(this.toStatusLabel(session.status));
        }
        lines.push(details.join(' • '));
        // Archived status
        if (session.isArchived()) {
            lines.push(`$(archive) ${localize('tooltip.archived', "Archived")}`);
        }
        return new MarkdownString(lines.join('\n\n'), { supportThemeIcons: true });
    }
    toDuration(startTime, endTime, useFullTimeWords) {
        const elapsed = Math.round((endTime - startTime) / 1000) * 1000;
        if (elapsed < 1000) {
            return undefined;
        }
        return getDurationString(elapsed, useFullTimeWords);
    }
    toStatusLabel(status) {
        let statusLabel;
        switch (status) {
            case 3 /* AgentSessionStatus.NeedsInput */:
                statusLabel = localize('agentSessionNeedsInput', "Needs Input");
                break;
            case 2 /* AgentSessionStatus.InProgress */:
                statusLabel = localize('agentSessionInProgress', "In Progress");
                break;
            case 0 /* AgentSessionStatus.Failed */:
                statusLabel = localize('agentSessionFailed', "Failed");
                break;
            default:
                statusLabel = localize('agentSessionCompleted', "Completed");
        }
        return statusLabel;
    }
};
AgentSessionHoverWidget = __decorate([
    __param(1, IChatService),
    __param(2, IInstantiationService),
    __param(3, IChatWidgetService)
], AgentSessionHoverWidget);
export { AgentSessionHoverWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uSG92ZXJXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25Ib3ZlcldpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hGLE9BQU8sRUFBbUIsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDNUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFNUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxrQkFBa0Is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