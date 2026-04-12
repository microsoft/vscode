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
var CIStatusWidget_1;
import './media/checksWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { parseWorkflowRunId } from '../../github/browser/models/githubPullRequestCIModel.js';
import { buildFixChecksPrompt, getCheckGroup, getCheckStateLabel, getFailedChecks } from './checksActions.js';
const $ = dom.$;
class CICheckListDelegate {
    static { this.ITEM_HEIGHT = 28; }
    getHeight(_element) {
        return CICheckListDelegate.ITEM_HEIGHT;
    }
    getTemplateId(_element) {
        return CICheckListRenderer.TEMPLATE_ID;
    }
}
class CICheckListRenderer {
    static { this.TEMPLATE_ID = 'ciCheck'; }
    constructor(_labels, _openerService, _getModel) {
        this._labels = _labels;
        this._openerService = _openerService;
        this._getModel = _getModel;
        this.templateId = CICheckListRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        const row = dom.append(container, $('.ci-status-widget-check'));
        const labelContainer = dom.append(row, $('.ci-status-widget-check-label'));
        const label = templateDisposables.add(this._labels.create(labelContainer, { supportIcons: true }));
        const actionBarContainer = dom.append(row, $('.ci-status-widget-check-actions'));
        const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
        return {
            row,
            label,
            actionBar,
            templateDisposables,
            elementDisposables: templateDisposables.add(new DisposableStore()),
        };
    }
    renderElement(element, _index, templateData) {
        templateData.elementDisposables.clear();
        templateData.actionBar.clear();
        templateData.row.className = `ci-status-widget-check ${getCheckStatusClass(element.check)}`;
        const title = localize('ci.checkTitle', "{0}: {1}", element.check.name, getCheckStateLabel(element.check));
        templateData.label.setResource({
            name: element.check.name,
            resource: URI.from({ scheme: 'github-check', path: `/${element.check.id}/${element.check.name}` }),
        }, {
            icon: getCheckIcon(element.check),
            title,
        });
        const actions = [];
        if (element.group === 2 /* CICheckGroup.Failed */ && parseWorkflowRunId(element.check.detailsUrl) !== undefined) {
            actions.push(templateData.elementDisposables.add(new Action('ci.rerunCheck', localize('ci.rerunCheck', "Rerun Check"), ThemeIcon.asClassName(Codicon.debugRerun), true, async () => {
                await this._getModel()?.rerunFailedCheck(element.check);
            })));
        }
        if (element.check.detailsUrl) {
            actions.push(templateData.elementDisposables.add(new Action('ci.openOnGitHub', localize('ci.openOnGitHub', "Open on GitHub"), ThemeIcon.asClassName(Codicon.linkExternal), true, async () => {
                await this._openerService.open(URI.parse(element.check.detailsUrl));
            })));
        }
        templateData.actionBar.push(actions, { icon: true, label: false });
    }
    disposeElement(_element, _index, templateData) {
        templateData.elementDisposables.clear();
        templateData.actionBar.clear();
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
}
/**
 * A widget that shows the CI status of a PR.
 * Rendered beneath the changes tree in the changes view as a SplitView pane.
 */
let CIStatusWidget = class CIStatusWidget extends Disposable {
    static { CIStatusWidget_1 = this; }
    static { this.HEADER_HEIGHT = 34; } // total header height in px
    static { this.MIN_BODY_HEIGHT = 84; } // at least 3 checks (3 * 28)
    static { this.PREFERRED_BODY_HEIGHT = 112; } // preferred 4 checks (4 * 28)
    static { this.MAX_BODY_HEIGHT = 240; } // at most ~8 checks
    get element() {
        return this._domNode;
    }
    /** The full content height the widget would like (header + all checks). */
    get desiredHeight() {
        if (this._checkCount === 0) {
            return 0;
        }
        if (this._collapsed) {
            return CIStatusWidget_1.HEADER_HEIGHT;
        }
        return CIStatusWidget_1.HEADER_HEIGHT + this._checkCount * CICheckListDelegate.ITEM_HEIGHT;
    }
    /** Whether the widget is currently visible (has checks to show). */
    get visible() {
        return this._checkCount > 0;
    }
    /** Whether the body is collapsed (header-only). */
    get collapsed() {
        return this._collapsed;
    }
    constructor(container, _openerService, _chatWidgetService, _instantiationService) {
        super();
        this._openerService = _openerService;
        this._chatWidgetService = _chatWidgetService;
        this._instantiationService = _instantiationService;
        this._headerActionDisposables = this._register(new DisposableStore());
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        this._onDidToggleCollapsed = this._register(new Emitter());
        this.onDidToggleCollapsed = this._onDidToggleCollapsed.event;
        this._checkCount = 0;
        this._collapsed = false;
        this._labels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
        this._domNode = dom.append(container, $('.ci-status-widget'));
        this._domNode.style.display = 'none';
        // Header (always visible, click to collapse/expand)
        this._headerNode = dom.append(this._domNode, $('.ci-status-widget-header'));
        this._titleNode = dom.append(this._headerNode, $('.ci-status-widget-title'));
        this._titleLabelNode = dom.append(this._titleNode, $('.ci-status-widget-title-label'));
        this._titleLabelNode.textContent = localize('ci.checksLabel', "Checks");
        this._countsNode = dom.append(this._titleNode, $('.ci-status-widget-counts'));
        this._headerActionBarContainer = dom.append(this._headerNode, $('.ci-status-widget-header-actions'));
        this._headerActionBar = this._register(new ActionBar(this._headerActionBarContainer));
        this._register(dom.addDisposableListener(this._headerActionBarContainer, dom.EventType.CLICK, e => {
            e.preventDefault();
            e.stopPropagation();
        }));
        this._chevronNode = dom.append(this._headerNode, $('.group-chevron'));
        this._chevronNode.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
        this._headerNode.setAttribute('role', 'button');
        this._headerNode.setAttribute('aria-label', localize('ci.toggleChecks', "Toggle Checks"));
        this._headerNode.setAttribute('aria-expanded', 'true');
        this._headerNode.tabIndex = 0;
        this._register(dom.addDisposableListener(this._headerNode, dom.EventType.CLICK, e => {
            // Don't toggle when clicking the action bar
            if (dom.isAncestor(e.target, this._headerActionBarContainer)) {
                return;
            }
            this._toggleCollapsed();
        }));
        this._register(dom.addDisposableListener(this._headerNode, dom.EventType.KEY_DOWN, e => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target === this._headerNode) {
                e.preventDefault();
                this._toggleCollapsed();
            }
        }));
        // Body (list of checks)
        const bodyId = 'ci-status-widget-body';
        this._bodyNode = dom.append(this._domNode, $(`.${bodyId}`));
        this._bodyNode.id = bodyId;
        this._headerNode.setAttribute('aria-controls', bodyId);
        const listContainer = $('.ci-status-widget-list');
        this._list = this._register(this._instantiationService.createInstance((WorkbenchList), 'CIStatusWidget', listContainer, new CICheckListDelegate(), [new CICheckListRenderer(this._labels, this._openerService, () => this._model)], {
            multipleSelectionSupport: false,
            openOnSingleClick: false,
            accessibilityProvider: {
                getWidgetAriaLabel: () => localize('ci.checksListAriaLabel', "Checks"),
                getAriaLabel: item => localize('ci.checkAriaLabel', "{0}, {1}", item.check.name, getCheckStateLabel(item.check)),
            },
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: item => item.check.name,
            },
        }));
        this._bodyNode.appendChild(this._list.getHTMLElement());
    }
    setInput(input) {
        return autorun(reader => {
            this._model = input.checksObs.read(reader);
            this._sessionResource = input.activeSessionResourceObs.read(reader);
            if (!this._model) {
                this._checkCount = 0;
                this._setCollapsed(false);
                this._renderBody([]);
                this._renderHeaderActions([]);
                this._domNode.style.display = 'none';
                this._onDidChangeHeight.fire();
                return;
            }
            const checks = this._model.checks.read(reader);
            if (checks.length === 0) {
                this._checkCount = 0;
                this._setCollapsed(false);
                this._renderBody([]);
                this._renderHeaderActions([]);
                this._domNode.style.display = 'none';
                this._onDidChangeHeight.fire();
                return;
            }
            const sorted = sortChecks(checks);
            const oldCount = this._checkCount;
            this._checkCount = sorted.length;
            this._domNode.style.display = '';
            this._renderHeader(checks);
            this._renderHeaderActions(getFailedChecks(checks));
            this._renderBody(sorted);
            if (this._checkCount !== oldCount) {
                this._onDidChangeHeight.fire();
            }
        });
    }
    _renderHeader(checks) {
        const counts = getCheckCounts(checks);
        // Update count badges
        dom.clearNode(this._countsNode);
        if (counts.running > 0) {
            const badge = dom.append(this._countsNode, $('.ci-status-widget-count-badge.ci-status-running'));
            badge.appendChild(renderIcon(Codicon.circleFilled));
            dom.append(badge, $('span')).textContent = `${counts.running}`;
        }
        if (counts.failed > 0) {
            const badge = dom.append(this._countsNode, $('.ci-status-widget-count-badge.ci-status-failure'));
            badge.appendChild(renderIcon(Codicon.error));
            dom.append(badge, $('span')).textContent = `${counts.failed}`;
        }
        if (counts.pending > 0) {
            const badge = dom.append(this._countsNode, $('.ci-status-widget-count-badge.ci-status-pending'));
            badge.appendChild(renderIcon(Codicon.circleFilled));
            dom.append(badge, $('span')).textContent = `${counts.pending}`;
        }
        if (counts.successful > 0) {
            const badge = dom.append(this._countsNode, $('.ci-status-widget-count-badge.ci-status-success'));
            badge.appendChild(renderIcon(Codicon.passFilled));
            dom.append(badge, $('span')).textContent = `${counts.successful}`;
        }
    }
    _renderHeaderActions(failedChecks) {
        this._headerActionDisposables.clear();
        this._headerActionBar.clear();
        if (failedChecks.length === 0) {
            this._headerActionBarContainer.classList.remove('has-actions');
            this._domNode.classList.remove('has-fix-actions');
            return;
        }
        const fixChecksAction = this._headerActionDisposables.add(new Action('ci.fixChecks', localize('ci.fixChecks', "Fix Checks"), ThemeIcon.asClassName(Codicon.lightbulbAutofix), true, async () => {
            await this._sendFixChecksPrompt(failedChecks);
        }));
        this._headerActionBar.push([fixChecksAction], { icon: true, label: false });
        this._headerActionBarContainer.classList.add('has-actions');
        this._domNode.classList.add('has-fix-actions');
    }
    /**
     * Layout the widget body list to the given height.
     * Called by the parent view after computing available space.
     */
    layout(height) {
        if (this._collapsed) {
            this._bodyNode.style.display = 'none';
            return;
        }
        this._bodyNode.style.display = '';
        this._list.layout(height);
    }
    _toggleCollapsed() {
        this._setCollapsed(!this._collapsed);
        this._onDidToggleCollapsed.fire(this._collapsed);
        // Also fires onDidChangeHeight so the SplitView pane updates its min/max constraints
        this._onDidChangeHeight.fire();
    }
    _setCollapsed(collapsed) {
        this._collapsed = collapsed;
        this._updateChevron();
        this._headerNode.setAttribute('aria-expanded', String(!collapsed));
    }
    _updateChevron() {
        this._chevronNode.className = 'group-chevron';
        this._chevronNode.classList.add(...ThemeIcon.asClassNameArray(this._collapsed ? Codicon.chevronRight : Codicon.chevronDown));
    }
    _renderBody(checks) {
        this._list.splice(0, this._list.length, checks);
    }
    async _sendFixChecksPrompt(failedChecks) {
        const model = this._model;
        const sessionResource = this._sessionResource;
        if (!model || !sessionResource || failedChecks.length === 0) {
            return;
        }
        const failedCheckDetails = await Promise.all(failedChecks.map(async (check) => {
            const annotations = await model.getCheckRunAnnotations(check.id);
            return {
                check,
                annotations,
            };
        }));
        const prompt = buildFixChecksPrompt(failedCheckDetails);
        const chatWidget = this._chatWidgetService.getWidgetBySessionResource(sessionResource)
            ?? await this._chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
        if (!chatWidget) {
            return;
        }
        await chatWidget.acceptInput(prompt, { noCommandDetection: true });
    }
};
CIStatusWidget = CIStatusWidget_1 = __decorate([
    __param(1, IOpenerService),
    __param(2, IChatWidgetService),
    __param(3, IInstantiationService)
], CIStatusWidget);
export { CIStatusWidget };
function sortChecks(checks) {
    return [...checks]
        .sort(compareChecks)
        .map(check => ({ check, group: getCheckGroup(check) }));
}
function compareChecks(a, b) {
    const groupDiff = getCheckGroup(a) - getCheckGroup(b);
    if (groupDiff !== 0) {
        return groupDiff;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
function getCheckCounts(checks) {
    let running = 0;
    let pending = 0;
    let failed = 0;
    let successful = 0;
    for (const check of checks) {
        switch (getCheckGroup(check)) {
            case 0 /* CICheckGroup.Running */:
                running++;
                break;
            case 1 /* CICheckGroup.Pending */:
                pending++;
                break;
            case 2 /* CICheckGroup.Failed */:
                failed++;
                break;
            case 3 /* CICheckGroup.Successful */:
                successful++;
                break;
        }
    }
    return { running, pending, failed, successful };
}
function getCheckIcon(check) {
    switch (check.status) {
        case "in_progress" /* GitHubCheckStatus.InProgress */:
            return Codicon.sync;
        case "queued" /* GitHubCheckStatus.Queued */:
            return Codicon.circleFilled;
        case "completed" /* GitHubCheckStatus.Completed */:
            switch (check.conclusion) {
                case "success" /* GitHubCheckConclusion.Success */:
                    return Codicon.passFilled;
                case "failure" /* GitHubCheckConclusion.Failure */:
                case "timed_out" /* GitHubCheckConclusion.TimedOut */:
                case "action_required" /* GitHubCheckConclusion.ActionRequired */:
                    return Codicon.error;
                case "cancelled" /* GitHubCheckConclusion.Cancelled */:
                    return Codicon.circleSlash;
                case "skipped" /* GitHubCheckConclusion.Skipped */:
                    return Codicon.debugStepOver;
                default:
                    return Codicon.circleFilled;
            }
        default:
            return Codicon.circleFilled;
    }
}
function getCheckStatusClass(check) {
    switch (getCheckGroup(check)) {
        case 0 /* CICheckGroup.Running */:
            return 'ci-status-running';
        case 1 /* CICheckGroup.Pending */:
            return 'ci-status-pending';
        case 2 /* CICheckGroup.Failed */:
            return 'ci-status-failure';
        case 3 /* CICheckGroup.Successful */:
            return 'ci-status-success';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hlY2tzV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2Jyb3dzZXIvY2hlY2tzV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDBCQUEwQixDQUFDO0FBQ2xDLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRWpGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDNUcsT0FBTyxFQUFFLHdCQUF3QixFQUFrQixjQUFjLEVBQUUsTUFBTSx5Q0FB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