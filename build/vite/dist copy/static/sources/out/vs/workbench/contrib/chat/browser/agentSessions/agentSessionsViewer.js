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
var AgentSessionRenderer_1, AgentSessionSectionRenderer_1;
import './media/agentsessionsviewer.css';
import { h } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { NotSelectableGroupId } from '../../../../../base/browser/ui/list/list.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { getAgentChangesSummary, hasValidDiff, isAgentSession, isAgentSessionSection, isAgentSessionShowLess, isAgentSessionShowMore, isAgentSessionsModel, isSessionInProgressStatus } from './agentSessionsModel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import { createMatches } from '../../../../../base/common/filters.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { allowedChatMarkdownHtmlTags } from '../widget/chatContentMarkdownRenderer.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IntervalTimer } from '../../../../../base/common/async.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { Emitter } from '../../../../../base/common/event.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { AgentSessionHoverWidget } from './agentSessionHoverWidget.js';
import { AgentSessionProviders } from './agentSessions.js';
import { AgentSessionsGrouping, AgentSessionsSorting } from './agentSessionsFilter.js';
import { autorun } from '../../../../../base/common/observable.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { compareIgnoreCase } from '../../../../../base/common/strings.js';
let AgentSessionRenderer = class AgentSessionRenderer extends Disposable {
    static { AgentSessionRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'agent-session'; }
    static { this.APPROVAL_ROW_MAX_LINES = 3; }
    static { this._APPROVAL_ROW_LINE_HEIGHT = 18; }
    static { this._APPROVAL_ROW_OVERHEAD = 14; } // 4px margin-top + 4px padding-top + 4px padding-bottom + 2px border
    static getApprovalRowHeight(label) {
        const lineCount = Math.min(label.split(/\r?\n/).length, AgentSessionRenderer_1.APPROVAL_ROW_MAX_LINES);
        return lineCount * AgentSessionRenderer_1._APPROVAL_ROW_LINE_HEIGHT + AgentSessionRenderer_1._APPROVAL_ROW_OVERHEAD;
    }
    constructor(options, _approvalModel, _activeSessionResource, markdownRendererService, productService, hoverService, instantiationService, contextKeyService) {
        super();
        this.options = options;
        this._approvalModel = _approvalModel;
        this._activeSessionResource = _activeSessionResource;
        this.markdownRendererService = markdownRendererService;
        this.productService = productService;
        this.hoverService = hoverService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.templateId = AgentSessionRenderer_1.TEMPLATE_ID;
        this.sessionHover = this._register(new MutableDisposable());
        this._onDidChangeItemHeight = this._register(new Emitter());
        this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposable = disposables.add(new DisposableStore());
        const elements = h('div.agent-session-item@item', [
            h('div.agent-session-icon-col', [
                h('div.agent-session-icon@icon')
            ]),
            h('div.agent-session-main-col', [
                h('div.agent-session-title-row', [
                    h('div.agent-session-title@title'),
                    h('div.agent-session-pinned-indicator@pinnedIndicator'),
                    h('div.agent-session-title-toolbar@titleToolbar'),
                ]),
                h('div.agent-session-details-row', [
                    h('div.agent-session-details-icon@detailsIcon'),
                    h('div.agent-session-badge@badge'),
                    h('span.agent-session-separator@separator'),
                    h('div.agent-session-diff-container@diffContainer', [
                        h('span.agent-session-diff-added@addedSpan'),
                        h('span.agent-session-diff-removed@removedSpan')
                    ]),
                    h('div.agent-session-description@description'),
                    h('div.agent-session-status@statusContainer', [
                        h('span.agent-session-status-time@statusTime'),
                    ]),
                ]),
                h('div.agent-session-approval-row@approvalRow', [
                    h('span.agent-session-approval-label@approvalLabel'),
                    h('div.agent-session-approval-button@approvalButtonContainer'),
                ])
            ])
        ]);
        const contextKeyService = disposables.add(this.contextKeyService.createScoped(elements.item));
        const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, elements.titleToolbar, MenuId.AgentSessionItemToolbar, {
            menuOptions: { shouldForwardArgs: true },
        }));
        container.appendChild(elements.item);
        return {
            element: elements.item,
            icon: elements.icon,
            title: disposables.add(new IconLabel(elements.title, { supportHighlights: true, supportIcons: true })),
            pinnedIndicator: elements.pinnedIndicator,
            titleToolbar,
            detailsIcon: elements.detailsIcon,
            badge: elements.badge,
            separator: elements.separator,
            diffContainer: elements.diffContainer,
            diffAddedSpan: elements.addedSpan,
            diffRemovedSpan: elements.removedSpan,
            description: elements.description,
            statusContainer: elements.statusContainer,
            statusTime: elements.statusTime,
            approvalRow: elements.approvalRow,
            approvalLabel: elements.approvalLabel,
            approvalButtonContainer: elements.approvalButtonContainer,
            contextKeyService,
            elementDisposable,
            disposables
        };
    }
    renderElement(session, index, template, details) {
        // Clear old state
        template.elementDisposable.clear();
        template.diffAddedSpan.textContent = '';
        template.diffRemovedSpan.textContent = '';
        template.badge.textContent = '';
        template.description.textContent = '';
        // Archived
        template.element.classList.toggle('archived', session.element.isArchived());
        // Section label for group hover detection
        if (this.options.isGroupedByRepository?.()) {
            const repoName = getRepositoryName(session.element);
            if (repoName) {
                template.element.setAttribute('data-section-label', repoName);
            }
            else {
                template.element.removeAttribute('data-section-label');
            }
        }
        else {
            template.element.removeAttribute('data-section-label');
        }
        // Icon — in status-only mode, show status indicator in icon column and session type icon in details row
        if (this.options.useStatusOnlyIcons) {
            const statusIcon = this.getIcon(session.element, true);
            template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(statusIcon)}${session.element.status === 3 /* AgentSessionStatus.NeedsInput */ ? ' needs-input' : ''}`;
            template.icon.style.color = statusIcon.color ? asCssVariable(statusIcon.color.id) : '';
            if (session.element.providerType === AgentSessionProviders.Background) {
                template.detailsIcon.className = 'agent-session-details-icon'; // hide default provider icon (same as Local in non-status-only mode)
            }
            else {
                template.detailsIcon.className = `agent-session-details-icon ${ThemeIcon.asClassName(session.element.icon)}`;
                template.detailsIcon.classList.add('visible');
            }
        }
        else {
            const icon = this.getIcon(session.element);
            template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(icon)}${session.element.status === 3 /* AgentSessionStatus.NeedsInput */ ? ' needs-input' : ''}`;
            template.icon.style.color = icon.color ? asCssVariable(icon.color.id) : '';
            template.detailsIcon.className = 'agent-session-details-icon';
        }
        // Title
        const markdownTitle = new MarkdownString(session.element.label);
        template.title.setLabel(renderAsPlaintext(markdownTitle), undefined, { matches: createMatches(session.filterData) });
        // Title Actions - Update context keys
        ChatContextKeys.isArchivedAgentSession.bindTo(template.contextKeyService).set(session.element.isArchived());
        ChatContextKeys.isPinnedAgentSession.bindTo(template.contextKeyService).set(session.element.isPinned());
        ChatContextKeys.isReadAgentSession.bindTo(template.contextKeyService).set(session.element.isRead());
        ChatContextKeys.agentSessionType.bindTo(template.contextKeyService).set(session.element.providerType);
        template.titleToolbar.context = session.element;
        // Pinned indicator
        const isPinned = session.element.isPinned();
        template.pinnedIndicator.className = 'agent-session-pinned-indicator ' + (ThemeIcon.asClassName(Codicon.pinned));
        template.pinnedIndicator.classList.toggle('visible', isPinned);
        // Badge
        const hasBadge = this.renderBadge(session, template);
        // Diff information
        let hasDiff = false;
        const { changes: diff } = session.element;
        if (!isSessionInProgressStatus(session.element.status) && diff && hasValidDiff(diff)) {
            if (this.renderDiff(session, template)) {
                hasDiff = true;
            }
        }
        let hasAgentSessionChanges = false;
        if (session.element.providerType === AgentSessionProviders.Background ||
            session.element.providerType === AgentSessionProviders.Cloud) {
            // Background and Cloud agents provide the list of changes directly,
            // so we have to use the list of changes to determine whether to show
            // the "View All Changes" action
            hasAgentSessionChanges = Array.isArray(diff) && diff.length > 0;
        }
        else {
            hasAgentSessionChanges = hasDiff;
        }
        ChatContextKeys.hasAgentSessionChanges.bindTo(template.contextKeyService).set(hasAgentSessionChanges);
        // Description
        const hasDescription = this.renderDescription(session, template);
        // Status
        const hasStatus = this.renderStatus(session, template);
        // When in progress with a description, only show description in the details row
        const hideDetails = hasDescription && isSessionInProgressStatus(session.element.status);
        template.badge.classList.toggle('has-badge', hasBadge && !hideDetails);
        template.diffContainer.classList.toggle('has-diff', hasDiff && !hideDetails);
        template.statusContainer.classList.toggle('hidden', hideDetails);
        template.separator.classList.toggle('has-separator', !hideDetails && hasBadge && hasDiff);
        template.description.classList.toggle('has-separator', hasDescription && !hideDetails && (hasBadge || hasDiff));
        template.statusContainer.classList.toggle('has-separator', !hideDetails && hasStatus && (hasBadge || hasDiff || hasDescription));
        // Hover
        this.renderHover(session, template);
        // Approval row
        if (this._approvalModel) {
            this.renderApprovalRow(session, template);
        }
    }
    renderBadge(session, template) {
        if (this.options.hideSessionBadge) {
            return false;
        }
        const badge = session.element.badge;
        if (!badge) {
            return false;
        }
        // When grouped by repository, hide the badge only if the name it shows
        // matches the section header (i.e. the repository name for this session).
        // Badges with a different name (e.g. worktree name) are still shown.
        // Pinned and archived sessions always keep their badge since they are
        // grouped under their own section, not a repository section.
        if (this.options.isGroupedByRepository?.() &&
            !session.element.isArchived() &&
            !session.element.isPinned()) {
            const raw = typeof badge === 'string' ? badge : badge.value;
            const match = raw.match(/^\$\((?:repo|folder|worktree)\)\s*(.+)/);
            if (match) {
                const badgeName = match[1].trim();
                const repoName = getRepositoryName(session.element);
                if (badgeName === repoName) {
                    return false;
                }
            }
        }
        const normalisedBadge = this.stripCodicons(badge);
        const badgeValue = typeof normalisedBadge === 'string' ? normalisedBadge : normalisedBadge.value;
        if (!badgeValue) {
            return false;
        }
        this.renderMarkdownOrText(normalisedBadge, template.badge, template.elementDisposable);
        return true;
    }
    stripCodicons(content) {
        const raw = typeof content === 'string' ? content : content.value;
        const stripped = raw.replace(/\$\([a-z0-9\-]+\)\s*/gi, '').trim();
        if (typeof content === 'string') {
            return stripped;
        }
        return MarkdownString.lift({ ...content, value: stripped });
    }
    renderMarkdownOrText(content, container, disposables) {
        if (typeof content === 'string') {
            container.textContent = content;
        }
        else {
            disposables.add(this.markdownRendererService.render(content, {
                sanitizerConfig: {
                    replaceWithPlaintext: true,
                    allowedTags: {
                        override: allowedChatMarkdownHtmlTags,
                    },
                    allowedLinkSchemes: { augment: [this.productService.urlProtocol] }
                },
            }, container));
        }
    }
    renderDiff(session, template) {
        const diff = getAgentChangesSummary(session.element.changes);
        if (!diff) {
            return false;
        }
        if (diff.insertions === 0 && diff.deletions === 0) {
            return false;
        }
        if (diff.insertions >= 0 /* render even `0` for more homogeneity */) {
            template.diffAddedSpan.textContent = `+${diff.insertions}`;
        }
        if (diff.deletions >= 0 /* render even `0` for more homogeneity */) {
            template.diffRemovedSpan.textContent = `-${diff.deletions}`;
        }
        return true;
    }
    getIcon(session, statusOnly) {
        if (session.status === 2 /* AgentSessionStatus.InProgress */) {
            return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
        }
        if (session.status === 3 /* AgentSessionStatus.NeedsInput */) {
            return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
        }
        if (session.status === 0 /* AgentSessionStatus.Failed */) {
            return { ...Codicon.error, color: themeColorFromId('errorForeground') };
        }
        if (statusOnly) {
            // PR status icons
            const metadata = session.metadata;
            const hasPR = metadata?.pullRequestUrl || metadata?.pullRequestNumber;
            if (hasPR) {
                switch (metadata?.pullRequestState) {
                    case 'merged':
                        return { ...Codicon.gitPullRequestDone, color: themeColorFromId('charts.purple') };
                    case 'closed':
                        return { ...Codicon.gitPullRequestClosed, color: themeColorFromId('charts.red') };
                    case 'draft':
                        return { ...Codicon.gitPullRequestDraft, color: themeColorFromId('descriptionForeground') };
                    default:
                        return { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') };
                }
            }
        }
        if (!session.isRead() && !session.isArchived()) {
            return { ...Codicon.circleFilled, color: themeColorFromId('textLink.foreground') };
        }
        if (!statusOnly && session.providerType === AgentSessionProviders.Local) {
            return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
        }
        if (!statusOnly) {
            return session.icon;
        }
        return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
    }
    renderDescription(session, template) {
        const description = session.element.description;
        if (description) {
            this.renderMarkdownOrText(description, template.description, template.elementDisposable);
            return true;
        }
        // Fallback to state label
        if (session.element.status === 2 /* AgentSessionStatus.InProgress */) {
            template.description.textContent = localize('chat.session.status.inProgress', "Working...");
            return true;
        }
        else if (session.element.status === 3 /* AgentSessionStatus.NeedsInput */) {
            template.description.textContent = localize('chat.session.status.needsInput', "Input needed.");
            return true;
        }
        else if (session.element.status === 0 /* AgentSessionStatus.Failed */) {
            template.description.textContent = localize('chat.session.status.failed', "Failed");
            return true;
        }
        template.description.textContent = '';
        return false;
    }
    toDuration(startTime, endTime, useFullTimeWords, disallowNow) {
        const elapsed = Math.max(Math.round((endTime - startTime) / 1000) * 1000, 1000 /* clamp to 1s */);
        if (!disallowNow && elapsed < 60000) {
            return localize('secondsDuration', "now");
        }
        return getDurationString(elapsed, useFullTimeWords);
    }
    renderStatus(session, template) {
        // Show repository name for pinned sessions when grouped by repository,
        // since they are not placed under a repository section header.
        const repoPrefix = (session.element.isPinned() && this.options.isGroupedByRepository?.())
            ? getRepositoryName(session.element)
            : undefined;
        const getStatusText = (session) => {
            let timeLabel;
            if (session.status === 2 /* AgentSessionStatus.InProgress */ && session.timing.lastRequestStarted) {
                timeLabel = this.toDuration(session.timing.lastRequestStarted, Date.now(), false, false);
            }
            if (!timeLabel) {
                const date = this.options.isSortedByUpdated?.()
                    ? session.timing.lastRequestEnded ?? session.timing.created
                    : session.timing.created;
                const seconds = Math.round((new Date().getTime() - date) / 1000);
                if (seconds < 60) {
                    timeLabel = localize('secondsDuration', "now");
                }
                else {
                    timeLabel = sessionDateFromNow(date, true);
                }
            }
            return repoPrefix ? `${repoPrefix} \u00B7 ${timeLabel}` : timeLabel;
        };
        // Time label
        template.statusTime.textContent = getStatusText(session.element);
        const timer = template.elementDisposable.add(new IntervalTimer());
        timer.cancelAndSet(() => template.statusTime.textContent = getStatusText(session.element), session.element.status === 2 /* AgentSessionStatus.InProgress */ ? 1000 /* every second */ : 60 * 1000 /* every minute */);
        return true;
    }
    renderHover(session, template) {
        if (this.options.disableHover) {
            return;
        }
        if (!isSessionInProgressStatus(session.element.status) && session.element.isRead()) {
            return; // the hover is complex and large, for now limit it to in-progress sessions only
        }
        const reducedDelay = session.element.status === 3 /* AgentSessionStatus.NeedsInput */;
        template.elementDisposable.add(this.hoverService.setupDelayedHover(template.element, () => this.buildHoverContent(session.element), { groupId: 'agent.sessions', reducedDelay }));
    }
    buildHoverContent(session) {
        if (this.sessionHover.value?.session.resource.toString() !== session.resource.toString()) {
            // note: hover service use mouseover which triggers again if the mouse moves
            // within the element. Only recreate the hover widget if the session changed.
            this.sessionHover.value = this.instantiationService.createInstance(AgentSessionHoverWidget, session);
        }
        const widget = this.sessionHover.value;
        return {
            id: `agent.session.hover.${session.resource.toString()}`,
            content: widget.domNode,
            style: 1 /* HoverStyle.Pointer */,
            onDidShow: () => widget.onRendered(),
            position: {
                hoverPosition: this.options.getHoverPosition()
            }
        };
    }
    renderApprovalRow(session, template) {
        if (this._approvalModel === undefined) {
            throw new BugIndicatingError('Approval model is required to render approval row');
        }
        const approvalModel = this._approvalModel;
        // Initialize from current model state to avoid unnecessary height changes on first render
        const initialInfo = approvalModel.getApproval(session.element.resource).get();
        let wasVisible = !!initialInfo;
        template.approvalRow.classList.toggle('visible', wasVisible);
        const buttonStore = template.elementDisposable.add(new DisposableStore());
        template.elementDisposable.add(autorun(reader => {
            buttonStore.clear();
            const info = approvalModel.getApproval(session.element.resource).read(reader);
            const visible = !!info;
            template.approvalRow.classList.toggle('visible', visible);
            if (info) {
                // Render up to 3 lines, each as a separate code block so CSS can truncate per-line
                const lines = info.label.split('\n');
                const maxLines = AgentSessionRenderer_1.APPROVAL_ROW_MAX_LINES;
                const visibleLines = lines.slice(0, maxLines);
                if (lines.length > maxLines) {
                    visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]} \u2026`;
                }
                const langId = info.languageId ?? 'json';
                const labelContent = new MarkdownString();
                for (const line of visibleLines) {
                    labelContent.appendCodeblock(langId, line);
                }
                this.renderMarkdownOrText(labelContent, template.approvalLabel, buttonStore);
                // Hover with full content as a code block
                const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? 'json', info.label);
                buttonStore.add(this.hoverService.setupDelayedHover(template.approvalLabel, {
                    content: fullContent,
                    style: 1 /* HoverStyle.Pointer */,
                    position: { hoverPosition: 2 /* HoverPosition.BELOW */ },
                }));
                template.approvalButtonContainer.textContent = '';
                const isActive = this._activeSessionResource.read(reader)?.toString() === session.element.resource.toString();
                const button = buttonStore.add(new Button(template.approvalButtonContainer, {
                    title: localize('allowActionOnce', "Allow once"),
                    secondary: isActive,
                    ...defaultButtonStyles
                }));
                button.label = localize('allowAction', "Allow");
                buttonStore.add(button.onDidClick(() => info.confirm()));
            }
            if (wasVisible !== visible) {
                wasVisible = visible;
                this._onDidChangeItemHeight.fire(session.element);
            }
        }));
    }
    renderCompressedElements(node, index, templateData, details) {
        throw new Error('Should never happen since session is incompressible');
    }
    disposeElement(element, index, template, details) {
        template.elementDisposable.clear();
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
};
AgentSessionRenderer = AgentSessionRenderer_1 = __decorate([
    __param(3, IMarkdownRendererService),
    __param(4, IProductService),
    __param(5, IHoverService),
    __param(6, IInstantiationService),
    __param(7, IContextKeyService)
], AgentSessionRenderer);
export { AgentSessionRenderer };
export function toStatusLabel(status) {
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
let AgentSessionSectionRenderer = class AgentSessionSectionRenderer {
    static { AgentSessionSectionRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'agent-session-section'; }
    constructor(sectionOptions, instantiationService, contextKeyService) {
        this.sectionOptions = sectionOptions;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.templateId = AgentSessionSectionRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elements = h('div.agent-session-section@container', [
            h('span.agent-session-section-label@label'),
            h('span.agent-session-section-count@count'),
            h('div.agent-session-section-toolbar@toolbar')
        ]);
        const contextKeyService = disposables.add(this.contextKeyService.createScoped(elements.container));
        const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, elements.toolbar, MenuId.AgentSessionSectionToolbar, {
            menuOptions: { shouldForwardArgs: true },
        }));
        container.appendChild(elements.container);
        return {
            container: elements.container,
            label: elements.label,
            count: elements.count,
            toolbar,
            contextKeyService,
            disposables
        };
    }
    renderElement(element, index, template, details) {
        // Label
        template.label.textContent = element.element.label;
        // Count
        if (this.sectionOptions.hideSectionCount) {
            template.count.textContent = '';
        }
        else {
            template.count.textContent = String(element.element.sessions.length);
        }
        // Toolbar
        ChatContextKeys.agentSessionSection.bindTo(template.contextKeyService).set(element.element.section);
        template.toolbar.context = element.element;
    }
    renderCompressedElements(node, index, templateData, details) {
        throw new Error('Should never happen since section header is incompressible');
    }
    disposeElement(element, index, template, details) {
        // noop
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
};
AgentSessionSectionRenderer = AgentSessionSectionRenderer_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IContextKeyService)
], AgentSessionSectionRenderer);
export { AgentSessionSectionRenderer };
export class AgentSessionShowMoreRenderer {
    static { this.TEMPLATE_ID = 'agent-session-show-more'; }
    static { this.HEIGHT = 26; }
    static { this.COLLAPSED_HEIGHT = 1; }
    constructor(options) {
        this.options = options;
        this.templateId = AgentSessionShowMoreRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elements = h('div.agent-session-show-more@container', [h('span.agent-session-show-more-label@label')]);
        container.appendChild(elements.container);
        return {
            container: elements.container,
            label: elements.label,
            disposables,
        };
    }
    renderElement(element, _index, template) {
        template.label.textContent = this.options?.compactLabel
            ? localize('agentSessions.showMoreCompact', "+{0} more", element.element.remainingCount)
            : localize('agentSessions.showMore', "Show {0} More...", element.element.remainingCount);
        template.container.setAttribute('data-section-label', element.element.sectionLabel);
    }
    renderCompressedElements() {
        throw new Error('Should never happen since show-more is incompressible');
    }
    disposeElement() { }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
}
export class AgentSessionShowLessRenderer {
    constructor() {
        this.templateId = AgentSessionShowLessRenderer.TEMPLATE_ID;
    }
    static { this.TEMPLATE_ID = 'agent-session-show-less'; }
    static { this.HEIGHT = AgentSessionShowMoreRenderer.HEIGHT; }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elements = h('div.agent-session-show-more@container', [h('span.agent-session-show-more-label@label')]);
        container.appendChild(elements.container);
        return {
            container: elements.container,
            label: elements.label,
            disposables,
        };
    }
    renderElement(element, _index, template) {
        template.label.textContent = localize('agentSessions.showLess', "Show less");
        template.container.setAttribute('data-section-label', element.element.sectionLabel);
    }
    renderCompressedElements() {
        throw new Error('Should never happen since show-less is incompressible');
    }
    disposeElement() { }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
}
//#endregion
export class AgentSessionsListDelegate {
    static { this.ITEM_HEIGHT = 54; }
    static { this.SECTION_HEIGHT = 26; }
    constructor(_approvalModel, _compactShowMore) {
        this._approvalModel = _approvalModel;
        this._compactShowMore = _compactShowMore;
    }
    getHeight(element) {
        if (isAgentSessionSection(element)) {
            return AgentSessionsListDelegate.SECTION_HEIGHT;
        }
        if (isAgentSessionShowMore(element) || isAgentSessionShowLess(element)) {
            return this._compactShowMore ? AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT : AgentSessionShowMoreRenderer.HEIGHT;
        }
        let height = AgentSessionsListDelegate.ITEM_HEIGHT;
        const approval = this._approvalModel?.getApproval(element.resource).get();
        if (approval) {
            height += AgentSessionRenderer.getApprovalRowHeight(approval.label);
        }
        return height;
    }
    hasDynamicHeight(element) {
        if (isAgentSessionShowMore(element) || isAgentSessionShowLess(element)) {
            return true;
        }
        return !!this._approvalModel && isAgentSession(element);
    }
    getTemplateId(element) {
        if (isAgentSessionSection(element)) {
            return AgentSessionSectionRenderer.TEMPLATE_ID;
        }
        if (isAgentSessionShowMore(element)) {
            return AgentSessionShowMoreRenderer.TEMPLATE_ID;
        }
        if (isAgentSessionShowLess(element)) {
            return AgentSessionShowLessRenderer.TEMPLATE_ID;
        }
        return AgentSessionRenderer.TEMPLATE_ID;
    }
}
export class AgentSessionsAccessibilityProvider {
    getWidgetRole() {
        return 'list';
    }
    getRole(element) {
        return 'listitem';
    }
    getWidgetAriaLabel() {
        return localize('agentSessions', "Agent Sessions");
    }
    getAriaLabel(element) {
        if (isAgentSessionSection(element)) {
            const count = element.sessions.length;
            if (count === 1) {
                return localize('agentSessionSectionAriaLabel.singular', "{0} sessions section, {1} session", element.label, count);
            }
            return localize('agentSessionSectionAriaLabel.plural', "{0} sessions section, {1} sessions", element.label, count);
        }
        if (isAgentSessionShowMore(element)) {
            return localize('agentSessionShowMoreAriaLabel', "Show {0} more sessions", element.remainingCount);
        }
        if (isAgentSessionShowLess(element)) {
            return localize('agentSessionShowLessAriaLabel', "Show less sessions");
        }
        return localize('agentSessionItemAriaLabel', "{0} session {1} ({2}), created {3}", element.providerLabel, element.label, toStatusLabel(element.status), new Date(element.timing.created).toLocaleString());
    }
}
export class AgentSessionsDataSource extends Disposable {
    static { this.CAPPED_SESSIONS_LIMIT = 3; }
    static { this.REPOSITORY_GROUP_LIMIT = 5; }
    constructor(filter, sorter, repositoryGroupLimit) {
        super();
        this.filter = filter;
        this.sorter = sorter;
        this.repositoryGroupLimit = repositoryGroupLimit;
        this._onDidGetChildren = this._register(new Emitter());
        this.onDidGetChildren = this._onDidGetChildren.event;
        this._onDidExpandRepositoryGroup = this._register(new Emitter());
        this.onDidExpandRepositoryGroup = this._onDidExpandRepositoryGroup.event;
        this.expandedRepositoryGroups = new Set();
        if (this.filter) {
            let previousCapped = this.filter.getExcludes().repositoryGroupCapped;
            this._register(this.filter.onDidChange(() => {
                const currentCapped = this.filter.getExcludes().repositoryGroupCapped;
                // Only clear expanded state when capping transitions from off to on
                if (currentCapped && !previousCapped) {
                    this.expandedRepositoryGroups.clear();
                }
                previousCapped = currentCapped;
            }));
        }
    }
    expandRepositoryGroup(sectionLabel) {
        this.expandedRepositoryGroups.add(sectionLabel);
        this._onDidExpandRepositoryGroup.fire();
    }
    collapseRepositoryGroup(sectionLabel) {
        this.expandedRepositoryGroups.delete(sectionLabel);
        this._onDidExpandRepositoryGroup.fire();
    }
    hasChildren(element) {
        // Sessions model
        if (isAgentSessionsModel(element)) {
            return true;
        }
        // Sessions	section
        else if (isAgentSessionSection(element)) {
            return element.sessions.length > 0;
        }
        // Session element or show more
        else {
            return false;
        }
    }
    getChildren(element) {
        // Sessions model
        if (isAgentSessionsModel(element)) {
            // Apply filter if configured
            let filteredSessions = element.sessions.filter(session => !this.filter?.exclude(session));
            // Apply sorter unless we group into sections or we are to limit results
            const limitResultsCount = this.filter?.limitResults?.();
            if (!this.filter?.groupResults?.() || typeof limitResultsCount === 'number') {
                filteredSessions.sort(this.sorter.compare.bind(this.sorter));
            }
            // Apply limiter if configured (requires sorting)
            if (typeof limitResultsCount === 'number') {
                filteredSessions = filteredSessions.slice(0, limitResultsCount);
            }
            // Callback results count
            this.filter?.notifyResults?.(filteredSessions.length);
            this._onDidGetChildren.fire(filteredSessions.length);
            // Group sessions into sections if enabled
            if (this.filter?.groupResults?.()) {
                return this.groupSessionsIntoSections(filteredSessions);
            }
            // Otherwise return flat sorted list
            return filteredSessions;
        }
        // Sessions	section
        else if (isAgentSessionSection(element)) {
            const isCappingEnabled = this.repositoryGroupLimit && this.filter?.getExcludes().repositoryGroupCapped;
            if (isCappingEnabled && element.section === "repository" /* AgentSessionSection.Repository */ && element.sessions.length > this.repositoryGroupLimit) {
                if (!this.expandedRepositoryGroups.has(element.label)) {
                    // Collapsed: show limited sessions + "show more"
                    const visible = element.sessions.slice(0, this.repositoryGroupLimit);
                    const remainingCount = element.sessions.length - this.repositoryGroupLimit;
                    return [...visible, { showMore: true, sectionLabel: element.label, remainingCount }];
                }
                else {
                    // Expanded: show all sessions + "show less"
                    return [...element.sessions, { showLess: true, sectionLabel: element.label }];
                }
            }
            return element.sessions;
        }
        // Session element or show more
        else {
            return [];
        }
    }
    groupSessionsIntoSections(sessions) {
        const isCapped = this.filter?.groupResults?.() === AgentSessionsGrouping.Capped;
        const sorter = this.sorter;
        const sortedSessions = sorter instanceof AgentSessionsSorter
            ? sessions.sort((a, b) => sorter.compare(a, b, true /* prioritize active sessions to keep in-progress/needs-input ones top within each group */))
            : sessions.sort(sorter.compare.bind(sorter));
        if (isCapped) {
            if (this.filter?.getExcludes().read) {
                return sortedSessions; // When filtering to show only unread sessions, show a flat list
            }
            return this.groupSessionsCapped(sortedSessions);
        }
        else if (this.filter?.groupResults?.() === AgentSessionsGrouping.Repository) {
            return this.groupSessionsByRepository(sortedSessions);
        }
        else {
            return this.groupSessionsByDate(sortedSessions);
        }
    }
    groupSessionsCapped(sortedSessions) {
        const result = [];
        const firstArchivedIndex = sortedSessions.findIndex(session => session.isArchived());
        const nonArchivedCount = firstArchivedIndex === -1 ? sortedSessions.length : firstArchivedIndex;
        const nonArchivedSessions = sortedSessions.slice(0, nonArchivedCount);
        const archivedSessions = sortedSessions.slice(nonArchivedCount);
        // All pinned sessions are always visible
        const pinnedSessions = nonArchivedSessions.filter(session => session.isPinned());
        const unpinnedSessions = nonArchivedSessions.filter(session => !session.isPinned());
        // Take up to N non-pinned sessions from the sorted order (preserves NeedsInput prioritization)
        const topUnpinned = unpinnedSessions.slice(0, AgentSessionsDataSource.CAPPED_SESSIONS_LIMIT);
        const remainingUnpinned = unpinnedSessions.slice(AgentSessionsDataSource.CAPPED_SESSIONS_LIMIT);
        // Add pinned first, then top N non-pinned
        result.push(...pinnedSessions, ...topUnpinned);
        // Add "More" section for the rest (remaining unpinned + archived)
        const othersSessions = [...remainingUnpinned, ...archivedSessions];
        if (othersSessions.length > 0) {
            result.push({
                section: "more" /* AgentSessionSection.More */,
                label: AgentSessionSectionLabels["more" /* AgentSessionSection.More */],
                sessions: othersSessions
            });
        }
        return result;
    }
    groupSessionsByDate(sortedSessions) {
        const result = [];
        const sortBy = this.filter?.sortResults?.();
        const groupedSessions = groupAgentSessionsByDate(sortedSessions, sortBy);
        for (const { sessions, section, label } of groupedSessions.values()) {
            if (sessions.length === 0) {
                continue;
            }
            result.push({ section, label, sessions });
        }
        return result;
    }
    groupSessionsByRepository(sortedSessions) {
        const repoMap = new Map();
        const pinnedSessions = [];
        const archivedSessions = [];
        const otherSessions = [];
        for (const session of sortedSessions) {
            if (session.isArchived()) {
                archivedSessions.push(session);
                continue;
            }
            if (session.isPinned()) {
                pinnedSessions.push(session);
                continue;
            }
            const repoName = getRepositoryName(session);
            if (repoName) {
                let group = repoMap.get(repoName);
                if (!group) {
                    group = { label: repoName, sessions: [] };
                    repoMap.set(repoName, group);
                }
                group.sessions.push(session);
            }
            else {
                otherSessions.push(session);
            }
        }
        const result = [];
        // Pinned sessions are added directly (no section header) so they
        // appear at the top without a "PINNED" group label.
        result.push(...pinnedSessions);
        const sortedRepoGroups = [...repoMap.values()].sort((a, b) => compareIgnoreCase(a.label, b.label));
        for (const { label, sessions } of sortedRepoGroups) {
            result.push({
                section: "repository" /* AgentSessionSection.Repository */,
                label,
                sessions,
            });
        }
        if (otherSessions.length > 0) {
            result.push({
                section: "repository" /* AgentSessionSection.Repository */,
                label: AgentSessionSectionLabels["repository" /* AgentSessionSection.Repository */],
                sessions: otherSessions,
            });
        }
        if (archivedSessions.length > 0) {
            result.push({
                section: "archived" /* AgentSessionSection.Archived */,
                label: AgentSessionSectionLabels["archived" /* AgentSessionSection.Archived */],
                sessions: archivedSessions,
            });
        }
        return result;
    }
}
/**
 * Extracts the repository name for an agent session from its metadata or badge.
 * Used for grouping sessions by repository and for determining whether a badge
 * is redundant with the section header.
 */
export function getRepositoryName(session) {
    const metadata = session.metadata;
    if (metadata) {
        // Remote agent host sessions: group by folder + remote name (e.g. "myproject [dev-box]")
        const remoteAgentHost = metadata.remoteAgentHost;
        if (remoteAgentHost) {
            const workingDir = metadata.workingDirectoryPath;
            if (workingDir) {
                const folderName = extractRepoNameFromPath(workingDir);
                if (folderName) {
                    return `${folderName} [${remoteAgentHost}]`;
                }
            }
            return remoteAgentHost;
        }
        // Cloud sessions: metadata.owner + metadata.name
        const owner = metadata.owner;
        const name = metadata.name;
        if (owner && name) {
            return name;
        }
        // repositoryNwo: "owner/repo"
        const nwo = metadata.repositoryNwo;
        if (nwo && nwo.includes('/')) {
            return nwo.split('/').pop();
        }
        // repository: could be "owner/repo", a URL, or git@host:owner/repo.git
        const repository = metadata.repository;
        if (repository) {
            const repoName = parseRepositoryName(repository);
            if (repoName) {
                return repoName;
            }
        }
        // repositoryUrl: "https://github.com/owner/repo"
        const repositoryUrl = metadata.repositoryUrl;
        if (repositoryUrl) {
            const repoName = parseRepositoryName(repositoryUrl);
            if (repoName) {
                return repoName;
            }
        }
        // repositoryPath: extract repo name from the directory path basename
        const repositoryPath = metadata.repositoryPath;
        if (repositoryPath) {
            const repoName = extractRepoNameFromPath(repositoryPath);
            if (repoName) {
                return repoName;
            }
        }
        // worktreePath: extract repo name from the worktree path
        const worktreePath = metadata.worktreePath;
        if (worktreePath) {
            const repoName = extractRepoNameFromPath(worktreePath);
            if (repoName) {
                return repoName;
            }
        }
        // workingDirectoryPath: fallback to extract name from the working directory
        const workingDirectoryPath = metadata.workingDirectoryPath;
        if (workingDirectoryPath) {
            const repoName = extractRepoNameFromPath(workingDirectoryPath);
            if (repoName) {
                return repoName;
            }
        }
    }
    // Fallback: extract repo/folder name from badge
    const badge = session.badge;
    if (badge) {
        const raw = typeof badge === 'string' ? badge : badge.value;
        const badgeMatch = raw.match(/\$\((?:repo|folder|worktree)\)\s*(.+)/);
        if (badgeMatch) {
            return badgeMatch[1].trim();
        }
    }
    return undefined;
}
/**
 * Parses a repository name from various formats: "owner/repo", URLs,
 * and git@host:owner/repo.git style references.
 */
function parseRepositoryName(value) {
    // Direct "owner/repo" style (no scheme, no git@ prefix)
    if (value.includes('/') && !value.includes('://') && !value.startsWith('git@')) {
        let repoSegment = value.split('/').filter(Boolean).pop();
        if (repoSegment?.endsWith('.git')) {
            repoSegment = repoSegment.slice(0, -4);
        }
        return repoSegment || undefined;
    }
    // Standard URL formats (https://..., ssh://..., etc.)
    try {
        const url = new URL(value);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
            let repoSegment = parts[1];
            if (repoSegment.endsWith('.git')) {
                repoSegment = repoSegment.slice(0, -4);
            }
            return repoSegment || undefined;
        }
    }
    catch {
        // not a standard URL
    }
    // git@host:owner/repo(.git) style URLs
    if (value.startsWith('git@')) {
        const colonIndex = value.indexOf(':');
        if (colonIndex !== -1 && colonIndex < value.length - 1) {
            const pathPart = value.substring(colonIndex + 1);
            let repoSegment = pathPart.split('/').filter(Boolean).pop();
            if (repoSegment?.endsWith('.git')) {
                repoSegment = repoSegment.slice(0, -4);
            }
            return repoSegment || undefined;
        }
    }
    return undefined;
}
/**
 * Extracts the repository name from a filesystem path, handling git worktree
 * conventions where paths follow `<repo>.worktrees/<worktree-name>`.
 */
function extractRepoNameFromPath(dirPath) {
    const segments = dirPath.split(/[/\\]/).filter(Boolean);
    if (segments.length < 2) {
        return segments[0];
    }
    const parent = segments[segments.length - 2];
    if (parent.endsWith('.worktrees')) {
        return parent.slice(0, -'.worktrees'.length) || undefined;
    }
    return segments[segments.length - 1];
}
export const AgentSessionSectionLabels = {
    ["pinned" /* AgentSessionSection.Pinned */]: localize('agentSessions.pinnedSection', "Pinned"),
    ["today" /* AgentSessionSection.Today */]: localize('agentSessions.todaySection', "Today"),
    ["yesterday" /* AgentSessionSection.Yesterday */]: localize('agentSessions.yesterdaySection', "Yesterday"),
    ["week" /* AgentSessionSection.Week */]: localize('agentSessions.weekSection', "Last 7 days"),
    ["older" /* AgentSessionSection.Older */]: localize('agentSessions.olderSection', "Older"),
    ["archived" /* AgentSessionSection.Archived */]: localize('agentSessions.archivedSection', "Archived"),
    ["more" /* AgentSessionSection.More */]: localize('agentSessions.moreSection', "More"),
    ["repository" /* AgentSessionSection.Repository */]: localize('agentSessions.noRepository', "Other"),
};
const DAY_THRESHOLD = 24 * 60 * 60 * 1000;
const WEEK_THRESHOLD = 7 * DAY_THRESHOLD;
export function groupAgentSessionsByDate(sessions, sortBy) {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const startOfYesterday = startOfToday - DAY_THRESHOLD;
    const weekThreshold = now - WEEK_THRESHOLD;
    const pinnedSessions = [];
    const todaySessions = [];
    const yesterdaySessions = [];
    const weekSessions = [];
    const olderSessions = [];
    const archivedSessions = [];
    for (const session of sessions) {
        if (session.isArchived()) {
            archivedSessions.push(session);
        }
        else if (session.isPinned()) {
            pinnedSessions.push(session);
        }
        else {
            const sessionTime = sortBy === AgentSessionsSorting.Updated
                ? session.timing.lastRequestEnded ?? session.timing.created
                : session.timing.created;
            if (sessionTime >= startOfToday) {
                todaySessions.push(session);
            }
            else if (sessionTime >= startOfYesterday) {
                yesterdaySessions.push(session);
            }
            else if (sessionTime >= weekThreshold) {
                weekSessions.push(session);
            }
            else {
                olderSessions.push(session);
            }
        }
    }
    return new Map([
        ["pinned" /* AgentSessionSection.Pinned */, { section: "pinned" /* AgentSessionSection.Pinned */, label: AgentSessionSectionLabels["pinned" /* AgentSessionSection.Pinned */], sessions: pinnedSessions }],
        ["today" /* AgentSessionSection.Today */, { section: "today" /* AgentSessionSection.Today */, label: AgentSessionSectionLabels["today" /* AgentSessionSection.Today */], sessions: todaySessions }],
        ["yesterday" /* AgentSessionSection.Yesterday */, { section: "yesterday" /* AgentSessionSection.Yesterday */, label: AgentSessionSectionLabels["yesterday" /* AgentSessionSection.Yesterday */], sessions: yesterdaySessions }],
        ["week" /* AgentSessionSection.Week */, { section: "week" /* AgentSessionSection.Week */, label: AgentSessionSectionLabels["week" /* AgentSessionSection.Week */], sessions: weekSessions }],
        ["older" /* AgentSessionSection.Older */, { section: "older" /* AgentSessionSection.Older */, label: AgentSessionSectionLabels["older" /* AgentSessionSection.Older */], sessions: olderSessions }],
        ["archived" /* AgentSessionSection.Archived */, { section: "archived" /* AgentSessionSection.Archived */, label: AgentSessionSectionLabels["archived" /* AgentSessionSection.Archived */], sessions: archivedSessions }],
    ]);
}
export function sessionDateFromNow(sessionTime, appendAgoLabel) {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const startOfYesterday = startOfToday - DAY_THRESHOLD;
    const startOfTwoDaysAgo = startOfYesterday - DAY_THRESHOLD;
    // our grouping by date uses absolute start times for "Today"
    // and "Yesterday" while `fromNow` only works with full 24h
    // and 48h ranges for these. To prevent a label like "1 day ago"
    // to show under the "Last 7 Days" section, we do a bit of
    // normalization logic.
    if (sessionTime < startOfToday && sessionTime >= startOfYesterday) {
        return appendAgoLabel
            ? localize('date.fromNow.days.singular.ago', '1 day ago')
            : localize('date.fromNow.days.singular', '1 day');
    }
    if (sessionTime < startOfYesterday && sessionTime >= startOfTwoDaysAgo) {
        return appendAgoLabel
            ? localize('date.fromNow.days.multiple.ago', '2 days ago')
            : localize('date.fromNow.days.multiple', '2 days');
    }
    return fromNow(sessionTime, appendAgoLabel);
}
export class AgentSessionsIdentityProvider {
    getId(element) {
        if (isAgentSessionSection(element)) {
            return `section-${element.section}-${element.label}`;
        }
        if (isAgentSessionShowMore(element)) {
            return `show-more-${element.sectionLabel}`;
        }
        if (isAgentSessionShowLess(element)) {
            return `show-less-${element.sectionLabel}`;
        }
        if (isAgentSession(element)) {
            return element.resource.toString();
        }
        return 'agent-sessions-id';
    }
    getGroupId(element) {
        if (isAgentSessionSection(element) || isAgentSessionsModel(element)) {
            return NotSelectableGroupId;
        }
        return 1;
    }
}
export class AgentSessionsCompressionDelegate {
    isIncompressible(element) {
        return true;
    }
}
export class AgentSessionsSorter {
    constructor(getSortBy) {
        this.getSortBy = getSortBy ?? (() => AgentSessionsSorting.Created);
    }
    compare(sessionA, sessionB, prioritizeActiveSessions = false) {
        // Special sorting if enabled
        if (prioritizeActiveSessions) {
            const aNeedsInput = sessionA.status === 3 /* AgentSessionStatus.NeedsInput */;
            const bNeedsInput = sessionB.status === 3 /* AgentSessionStatus.NeedsInput */;
            if (aNeedsInput && !bNeedsInput) {
                return -1; // a (needs input) comes before b (other)
            }
            if (!aNeedsInput && bNeedsInput) {
                return 1; // a (other) comes after b (needs input)
            }
        }
        // Archived
        const aArchived = sessionA.isArchived();
        const bArchived = sessionB.isArchived();
        if (!aArchived && bArchived) {
            return -1; // a (non-archived) comes before b (archived)
        }
        if (aArchived && !bArchived) {
            return 1; // a (archived) comes after b (non-archived)
        }
        // Pinned (non-archived pinned sessions come before non-pinned)
        const aPinned = !aArchived && sessionA.isPinned();
        const bPinned = !bArchived && sessionB.isPinned();
        if (aPinned && !bPinned) {
            return -1;
        }
        if (!aPinned && bPinned) {
            return 1;
        }
        // Sort by time
        const sortBy = this.getSortBy();
        const timeA = prioritizeActiveSessions
            ? sessionA.timing.lastRequestStarted ?? sessionA.timing.created
            : sortBy === AgentSessionsSorting.Updated
                ? sessionA.timing.lastRequestEnded ?? sessionA.timing.created
                : sessionA.timing.created;
        const timeB = prioritizeActiveSessions
            ? sessionB.timing.lastRequestStarted ?? sessionB.timing.created
            : sortBy === AgentSessionsSorting.Updated
                ? sessionB.timing.lastRequestEnded ?? sessionB.timing.created
                : sessionB.timing.created;
        return timeB - timeA;
    }
}
export class AgentSessionsKeyboardNavigationLabelProvider {
    getKeyboardNavigationLabel(element) {
        if (isAgentSessionSection(element)) {
            return element.label;
        }
        if (isAgentSessionShowMore(element)) {
            return element.sectionLabel;
        }
        if (isAgentSessionShowLess(element)) {
            return element.sectionLabel;
        }
        return element.label;
    }
    getCompressedNodeKeyboardNavigationLabel(elements) {
        return undefined; // not enabled
    }
}
let AgentSessionsDragAndDrop = class AgentSessionsDragAndDrop extends Disposable {
    constructor(instantiationService) {
        super();
        this.instantiationService = instantiationService;
    }
    onDragStart(data, originalEvent) {
        const elements = data.getData().filter(e => isAgentSession(e));
        const uris = coalesce(elements.map(e => e.resource));
        this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
    }
    getDragURI(element) {
        if (isAgentSessionSection(element) || isAgentSessionShowMore(element) || isAgentSessionShowLess(element)) {
            return null; // section headers, show-more and show-less items are not draggable
        }
        return element.resource.toString();
    }
    getDragLabel(elements, originalEvent) {
        const sessions = elements.filter(e => isAgentSession(e));
        if (sessions.length === 1) {
            return sessions[0].label;
        }
        return localize('agentSessions.dragLabel', "{0} agent sessions", sessions.length);
    }
    onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
        return false;
    }
    drop(data, targetElement, targetIndex, targetSector, originalEvent) { }
};
AgentSessionsDragAndDrop = __decorate([
    __param(0, IInstantiationService)
], AgentSessionsDragAndDrop);
export { AgentSessionsDragAndDrop };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc1ZpZXdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNWaWV3ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8saUNBQWlDLENBQUM7QUFDekMsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQTJDLG9CQUFvQixFQUE0QixNQUFNLDZDQUE2QyxDQUFDO0FBT3RKLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEgsT0FBTyxFQUEyQyxzQkFBc0IsRUFBRSxZQUFZLEVBQTBHLGNBQWMsRUFBRSxxQkFBcUIsRUFBRSxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBRSxvQkFBb0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3hXLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEYsT0FBTyxFQUFjLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhEQUE4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