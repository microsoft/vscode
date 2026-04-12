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
import * as dom from '../../../../base/browser/dom.js';
import * as paths from '../../../../base/common/path.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { ResourceMarkers, Marker, RelatedInformation, MarkerTableItem } from './markersModel.js';
import Messages from './messages.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { dispose, Disposable, toDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { QuickFixAction, QuickFixActionViewItem } from './markersViewActions.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { FilterOptions } from './markersFilterOptions.js';
import { Emitter } from '../../../../base/common/event.js';
import { isUndefinedOrNull } from '../../../../base/common/types.js';
import { Action, toAction } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { createCancelablePromise, Delayer } from '../../../../base/common/async.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { Range } from '../../../../editor/common/core/range.js';
import { applyCodeAction, ApplyCodeActionReason, getCodeActions } from '../../../../editor/contrib/codeAction/browser/codeAction.js';
import { CodeActionKind, CodeActionTriggerSource } from '../../../../editor/contrib/codeAction/common/types.js';
import { IEditorService, ACTIVE_GROUP } from '../../../services/editor/common/editorService.js';
import { SeverityIcon } from '../../../../base/browser/ui/severityIcon/severityIcon.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MarkersContextKeys } from '../common/markers.js';
import { unsupportedSchemas } from '../../../../platform/markers/common/markerService.js';
import { defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import Severity from '../../../../base/common/severity.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
let MarkersWidgetAccessibilityProvider = class MarkersWidgetAccessibilityProvider {
    constructor(labelService) {
        this.labelService = labelService;
    }
    getWidgetAriaLabel() {
        return localize('problemsView', "Problems View");
    }
    getAriaLabel(element) {
        if (element instanceof ResourceMarkers) {
            const path = this.labelService.getUriLabel(element.resource, { relative: true }) || element.resource.fsPath;
            return Messages.MARKERS_TREE_ARIA_LABEL_RESOURCE(element.markers.length, element.name, paths.dirname(path));
        }
        if (element instanceof Marker || element instanceof MarkerTableItem) {
            return Messages.MARKERS_TREE_ARIA_LABEL_MARKER(element);
        }
        if (element instanceof RelatedInformation) {
            return Messages.MARKERS_TREE_ARIA_LABEL_RELATED_INFORMATION(element.raw);
        }
        return null;
    }
};
MarkersWidgetAccessibilityProvider = __decorate([
    __param(0, ILabelService)
], MarkersWidgetAccessibilityProvider);
export { MarkersWidgetAccessibilityProvider };
var TemplateId;
(function (TemplateId) {
    TemplateId["ResourceMarkers"] = "rm";
    TemplateId["Marker"] = "m";
    TemplateId["RelatedInformation"] = "ri";
})(TemplateId || (TemplateId = {}));
export class VirtualDelegate {
    static { this.LINE_HEIGHT = 22; }
    constructor(markersViewState) {
        this.markersViewState = markersViewState;
    }
    getHeight(element) {
        if (element instanceof Marker) {
            const viewModel = this.markersViewState.getViewModel(element);
            const noOfLines = !viewModel || viewModel.multiline ? element.lines.length : 1;
            return noOfLines * VirtualDelegate.LINE_HEIGHT;
        }
        return VirtualDelegate.LINE_HEIGHT;
    }
    getTemplateId(element) {
        if (element instanceof ResourceMarkers) {
            return "rm" /* TemplateId.ResourceMarkers */;
        }
        else if (element instanceof Marker) {
            return "m" /* TemplateId.Marker */;
        }
        else {
            return "ri" /* TemplateId.RelatedInformation */;
        }
    }
}
var FilterDataType;
(function (FilterDataType) {
    FilterDataType[FilterDataType["ResourceMarkers"] = 0] = "ResourceMarkers";
    FilterDataType[FilterDataType["Marker"] = 1] = "Marker";
    FilterDataType[FilterDataType["RelatedInformation"] = 2] = "RelatedInformation";
})(FilterDataType || (FilterDataType = {}));
export class ResourceMarkersRenderer {
    constructor(labels, onDidChangeRenderNodeCount) {
        this.labels = labels;
        this.renderedNodes = new Map();
        this.disposables = new DisposableStore();
        this.templateId = "rm" /* TemplateId.ResourceMarkers */;
        onDidChangeRenderNodeCount(this.onDidChangeRenderNodeCount, this, this.disposables);
    }
    renderTemplate(container) {
        const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
        const resourceLabel = this.labels.create(resourceLabelContainer, { supportHighlights: true });
        const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
        const count = new CountBadge(badgeWrapper, {}, defaultCountBadgeStyles);
        return { count, resourceLabel };
    }
    renderElement(node, _, templateData) {
        const resourceMarkers = node.element;
        const uriMatches = node.filterData && node.filterData.uriMatches || [];
        templateData.resourceLabel.setFile(resourceMarkers.resource, { matches: uriMatches });
        this.updateCount(node, templateData);
        const nodeRenders = this.renderedNodes.get(resourceMarkers) ?? [];
        this.renderedNodes.set(resourceMarkers, [...nodeRenders, templateData]);
    }
    disposeElement(node, index, templateData) {
        const nodeRenders = this.renderedNodes.get(node.element) ?? [];
        const nodeRenderIndex = nodeRenders.findIndex(nodeRender => templateData === nodeRender);
        if (nodeRenderIndex < 0) {
            throw new Error('Disposing unknown resource marker');
        }
        if (nodeRenders.length === 1) {
            this.renderedNodes.delete(node.element);
        }
        else {
            nodeRenders.splice(nodeRenderIndex, 1);
        }
    }
    disposeTemplate(templateData) {
        templateData.resourceLabel.dispose();
        templateData.count.dispose();
    }
    onDidChangeRenderNodeCount(node) {
        const nodeRenders = this.renderedNodes.get(node.element);
        if (!nodeRenders) {
            return;
        }
        nodeRenders.forEach(nodeRender => this.updateCount(node, nodeRender));
    }
    updateCount(node, templateData) {
        templateData.count.setCount(node.children.reduce((r, n) => r + (n.visible ? 1 : 0), 0));
    }
    dispose() {
        this.disposables.dispose();
    }
}
export class FileResourceMarkersRenderer extends ResourceMarkersRenderer {
}
let MarkerRenderer = class MarkerRenderer {
    constructor(markersViewState, hoverService, instantiationService, openerService) {
        this.markersViewState = markersViewState;
        this.hoverService = hoverService;
        this.instantiationService = instantiationService;
        this.openerService = openerService;
        this.templateId = "m" /* TemplateId.Marker */;
    }
    renderTemplate(container) {
        const data = Object.create(null);
        data.markerWidget = new MarkerWidget(container, this.markersViewState, this.hoverService, this.openerService, this.instantiationService);
        return data;
    }
    renderElement(node, _, templateData) {
        templateData.markerWidget.render(node.element, node.filterData);
    }
    disposeTemplate(templateData) {
        templateData.markerWidget.dispose();
    }
};
MarkerRenderer = __decorate([
    __param(1, IHoverService),
    __param(2, IInstantiationService),
    __param(3, IOpenerService)
], MarkerRenderer);
export { MarkerRenderer };
const expandedIcon = registerIcon('markers-view-multi-line-expanded', Codicon.chevronUp, localize('expandedIcon', 'Icon indicating that multiple lines are shown in the markers view.'));
const collapsedIcon = registerIcon('markers-view-multi-line-collapsed', Codicon.chevronDown, localize('collapsedIcon', 'Icon indicating that multiple lines are collapsed in the markers view.'));
const toggleMultilineAction = 'problems.action.toggleMultiline';
class ToggleMultilineActionViewItem extends ActionViewItem {
    render(container) {
        super.render(container);
        this.updateExpandedAttribute();
    }
    updateClass() {
        super.updateClass();
        this.updateExpandedAttribute();
    }
    updateExpandedAttribute() {
        this.element?.setAttribute('aria-expanded', `${this._action.class === ThemeIcon.asClassName(expandedIcon)}`);
    }
}
class MarkerWidget extends Disposable {
    constructor(parent, markersViewModel, _hoverService, _openerService, _instantiationService) {
        super();
        this.parent = parent;
        this.markersViewModel = markersViewModel;
        this._hoverService = _hoverService;
        this._openerService = _openerService;
        this.disposables = this._register(new DisposableStore());
        this.actionBar = this._register(new ActionBar(dom.append(parent, dom.$('.actions')), {
            actionViewItemProvider: (action, options) => action.id === QuickFixAction.ID ? _instantiationService.createInstance(QuickFixActionViewItem, action, options) : undefined
        }));
        // wrap the icon in a container that get the icon color as foreground color. That way, if the
        // list view does not have a specific color for the icon (=the color variable is invalid) it
        // falls back to the foreground color of container (inherit)
        this.iconContainer = dom.append(parent, dom.$(''));
        this.icon = dom.append(this.iconContainer, dom.$(''));
        this.messageAndDetailsContainer = dom.append(parent, dom.$('.marker-message-details-container'));
        this.messageAndDetailsContainerHover = this._register(this._hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.messageAndDetailsContainer, ''));
    }
    render(element, filterData) {
        this.actionBar.clear();
        this.disposables.clear();
        dom.clearNode(this.messageAndDetailsContainer);
        this.iconContainer.className = `marker-icon ${Severity.toString(MarkerSeverity.toSeverity(element.marker.severity))}`;
        this.icon.className = `codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(element.marker.severity))}`;
        this.renderQuickfixActionbar(element);
        this.renderMessageAndDetails(element, filterData);
        this.disposables.add(dom.addDisposableListener(this.parent, dom.EventType.MOUSE_OVER, () => this.markersViewModel.onMarkerMouseHover(element)));
        this.disposables.add(dom.addDisposableListener(this.parent, dom.EventType.MOUSE_LEAVE, () => this.markersViewModel.onMarkerMouseLeave(element)));
    }
    renderQuickfixActionbar(marker) {
        const viewModel = this.markersViewModel.getViewModel(marker);
        if (viewModel) {
            const quickFixAction = viewModel.quickFixAction;
            this.actionBar.push([quickFixAction], { icon: true, label: false });
            this.iconContainer.classList.toggle('quickFix', quickFixAction.enabled);
            quickFixAction.onDidChange(({ enabled }) => {
                if (!isUndefinedOrNull(enabled)) {
                    this.iconContainer.classList.toggle('quickFix', enabled);
                }
            }, this, this.disposables);
            quickFixAction.onShowQuickFixes(() => {
                const quickFixActionViewItem = this.actionBar.viewItems[0];
                if (quickFixActionViewItem) {
                    quickFixActionViewItem.showQuickFixes();
                }
            }, this, this.disposables);
        }
    }
    renderMultilineActionbar(marker, parent) {
        const multilineActionbar = this.disposables.add(new ActionBar(dom.append(parent, dom.$('.multiline-actions')), {
            actionViewItemProvider: (action, options) => {
                if (action.id === toggleMultilineAction) {
                    return new ToggleMultilineActionViewItem(undefined, action, { ...options, icon: true });
                }
                return undefined;
            }
        }));
        this.disposables.add(multilineActionbar);
        const viewModel = this.markersViewModel.getViewModel(marker);
        const multiline = viewModel && viewModel.multiline;
        const action = this.disposables.add(new Action(toggleMultilineAction));
        action.enabled = !!viewModel && marker.lines.length > 1;
        action.tooltip = multiline ? localize('single line', "Show message in single line") : localize('multi line', "Show message in multiple lines");
        action.class = ThemeIcon.asClassName(multiline ? expandedIcon : collapsedIcon);
        action.run = () => { if (viewModel) {
            viewModel.multiline = !viewModel.multiline;
        } return Promise.resolve(); };
        multilineActionbar.push([action], { icon: true, label: false });
    }
    renderMessageAndDetails(element, filterData) {
        const { marker, lines } = element;
        const viewState = this.markersViewModel.getViewModel(element);
        const multiline = !viewState || viewState.multiline;
        const lineMatches = filterData && filterData.lineMatches || [];
        this.messageAndDetailsContainerHover.update(element.marker.message);
        const lineElements = [];
        for (let index = 0; index < (multiline ? lines.length : 1); index++) {
            const lineElement = dom.append(this.messageAndDetailsContainer, dom.$('.marker-message-line'));
            const messageElement = dom.append(lineElement, dom.$('.marker-message'));
            const highlightedLabel = this.disposables.add(new HighlightedLabel(messageElement));
            highlightedLabel.set(lines[index].length > 1000 ? `${lines[index].substring(0, 1000)}...` : lines[index], lineMatches[index]);
            if (lines[index] === '') {
                lineElement.style.height = `${VirtualDelegate.LINE_HEIGHT}px`;
            }
            lineElements.push(lineElement);
        }
        this.renderDetails(marker, filterData, lineElements[0]);
        this.renderMultilineActionbar(element, lineElements[0]);
    }
    renderDetails(marker, filterData, parent) {
        parent.classList.add('details-container');
        if (marker.source || marker.code) {
            const source = this.disposables.add(new HighlightedLabel(dom.append(parent, dom.$('.marker-source'))));
            const sourceMatches = filterData && filterData.sourceMatches || [];
            source.set(marker.source, sourceMatches);
            if (marker.code) {
                if (typeof marker.code === 'string') {
                    const code = this.disposables.add(new HighlightedLabel(dom.append(parent, dom.$('.marker-code'))));
                    const codeMatches = filterData && filterData.codeMatches || [];
                    code.set(marker.code, codeMatches);
                }
                else {
                    const container = dom.$('.marker-code');
                    const code = this.disposables.add(new HighlightedLabel(container));
                    const link = marker.code.target.toString(true);
                    this.disposables.add(new Link(parent, { href: link, label: container, title: link }, undefined, this._hoverService, this._openerService));
                    const codeMatches = filterData && filterData.codeMatches || [];
                    code.set(marker.code.value, codeMatches);
                }
            }
        }
        const lnCol = dom.append(parent, dom.$('span.marker-line'));
        lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(marker.startLineNumber, marker.startColumn);
    }
}
let RelatedInformationRenderer = class RelatedInformationRenderer {
    constructor(labelService) {
        this.labelService = labelService;
        this.templateId = "ri" /* TemplateId.RelatedInformation */;
    }
    renderTemplate(container) {
        const data = Object.create(null);
        dom.append(container, dom.$('.actions'));
        dom.append(container, dom.$('.icon'));
        data.resourceLabel = new HighlightedLabel(dom.append(container, dom.$('.related-info-resource')));
        data.lnCol = dom.append(container, dom.$('span.marker-line'));
        const separator = dom.append(container, dom.$('span.related-info-resource-separator'));
        separator.textContent = ':';
        separator.style.paddingRight = '4px';
        data.description = new HighlightedLabel(dom.append(container, dom.$('.marker-description')));
        return data;
    }
    renderElement(node, _, templateData) {
        const relatedInformation = node.element.raw;
        const uriMatches = node.filterData && node.filterData.uriMatches || [];
        const messageMatches = node.filterData && node.filterData.messageMatches || [];
        const resourceLabelTitle = this.labelService.getUriLabel(relatedInformation.resource, { relative: true });
        templateData.resourceLabel.set(basename(relatedInformation.resource), uriMatches, resourceLabelTitle);
        templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(relatedInformation.startLineNumber, relatedInformation.startColumn);
        templateData.description.set(relatedInformation.message, messageMatches, relatedInformation.message);
    }
    disposeTemplate(templateData) {
        templateData.resourceLabel.dispose();
        templateData.description.dispose();
    }
};
RelatedInformationRenderer = __decorate([
    __param(0, ILabelService)
], RelatedInformationRenderer);
export { RelatedInformationRenderer };
export class Filter {
    constructor(options) {
        this.options = options;
    }
    filter(element, parentVisibility) {
        if (element instanceof ResourceMarkers) {
            return this.filterResourceMarkers(element);
        }
        else if (element instanceof Marker) {
            return this.filterMarker(element, parentVisibility);
        }
        else {
            return this.filterRelatedInformation(element, parentVisibility);
        }
    }
    filterResourceMarkers(resourceMarkers) {
        if (unsupportedSchemas.has(resourceMarkers.resource.scheme)) {
            return false;
        }
        // Filter resource by pattern first (globs)
        // Excludes pattern
        if (this.options.excludesMatcher.matches(resourceMarkers.resource)) {
            return false;
        }
        // Includes pattern
        if (this.options.includesMatcher.matches(resourceMarkers.resource)) {
            return true;
        }
        // Fiter by text. Do not apply negated filters on resources instead use exclude patterns
        if (this.options.textFilter.text && !this.options.textFilter.negate) {
            const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(resourceMarkers.resource));
            if (uriMatches) {
                return { visibility: true, data: { type: 0 /* FilterDataType.ResourceMarkers */, uriMatches: uriMatches || [] } };
            }
        }
        return 2 /* TreeVisibility.Recurse */;
    }
    filterMarker(marker, parentVisibility) {
        const matchesSeverity = this.options.showErrors && MarkerSeverity.Error === marker.marker.severity ||
            this.options.showWarnings && MarkerSeverity.Warning === marker.marker.severity ||
            this.options.showInfos && MarkerSeverity.Info === marker.marker.severity;
        if (!matchesSeverity) {
            return false;
        }
        // Check source filters if present
        if (!this.options.matchesSourceFilters(marker.marker.source)) {
            return false;
        }
        if (!this.options.textFilter.text) {
            return true;
        }
        const lineMatches = [];
        for (const line of marker.lines) {
            const lineMatch = FilterOptions._messageFilter(this.options.textFilter.text, line);
            lineMatches.push(lineMatch || []);
        }
        const sourceMatches = marker.marker.source ? FilterOptions._filter(this.options.textFilter.text, marker.marker.source) : undefined;
        const codeMatches = marker.marker.code ? FilterOptions._filter(this.options.textFilter.text, typeof marker.marker.code === 'string' ? marker.marker.code : marker.marker.code.value) : undefined;
        const matched = sourceMatches || codeMatches || lineMatches.some(lineMatch => lineMatch.length > 0);
        // Matched and not negated
        if (matched && !this.options.textFilter.negate) {
            return { visibility: true, data: { type: 1 /* FilterDataType.Marker */, lineMatches, sourceMatches: sourceMatches || [], codeMatches: codeMatches || [] } };
        }
        // Matched and negated - exclude it only if parent visibility is not set
        if (matched && this.options.textFilter.negate && parentVisibility === 2 /* TreeVisibility.Recurse */) {
            return false;
        }
        // Not matched and negated - include it only if parent visibility is not set
        if (!matched && this.options.textFilter.negate && parentVisibility === 2 /* TreeVisibility.Recurse */) {
            return true;
        }
        return parentVisibility;
    }
    filterRelatedInformation(relatedInformation, parentVisibility) {
        if (!this.options.textFilter.text) {
            return true;
        }
        const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(relatedInformation.raw.resource));
        const messageMatches = FilterOptions._messageFilter(this.options.textFilter.text, paths.basename(relatedInformation.raw.message));
        const matched = uriMatches || messageMatches;
        // Matched and not negated
        if (matched && !this.options.textFilter.negate) {
            return { visibility: true, data: { type: 2 /* FilterDataType.RelatedInformation */, uriMatches: uriMatches || [], messageMatches: messageMatches || [] } };
        }
        // Matched and negated - exclude it only if parent visibility is not set
        if (matched && this.options.textFilter.negate && parentVisibility === 2 /* TreeVisibility.Recurse */) {
            return false;
        }
        // Not matched and negated - include it only if parent visibility is not set
        if (!matched && this.options.textFilter.negate && parentVisibility === 2 /* TreeVisibility.Recurse */) {
            return true;
        }
        return parentVisibility;
    }
}
let MarkerViewModel = class MarkerViewModel extends Disposable {
    constructor(marker, modelService, instantiationService, editorService, languageFeaturesService) {
        super();
        this.marker = marker;
        this.modelService = modelService;
        this.instantiationService = instantiationService;
        this.editorService = editorService;
        this.languageFeaturesService = languageFeaturesService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.modelPromise = null;
        this.codeActionsPromise = null;
        this._multiline = true;
        this._quickFixAction = null;
        this._register(toDisposable(() => {
            if (this.modelPromise) {
                this.modelPromise.cancel();
            }
            if (this.codeActionsPromise) {
                this.codeActionsPromise.cancel();
            }
        }));
    }
    get multiline() {
        return this._multiline;
    }
    set multiline(value) {
        if (this._multiline !== value) {
            this._multiline = value;
            this._onDidChange.fire();
        }
    }
    get quickFixAction() {
        if (!this._quickFixAction) {
            this._quickFixAction = this._register(this.instantiationService.createInstance(QuickFixAction, this.marker));
        }
        return this._quickFixAction;
    }
    showLightBulb() {
        this.setQuickFixes(true);
    }
    async setQuickFixes(waitForModel) {
        const codeActions = await this.getCodeActions(waitForModel);
        this.quickFixAction.quickFixes = codeActions ? this.toActions(codeActions) : [];
        this.quickFixAction.autoFixable(!!codeActions && codeActions.hasAutoFix);
    }
    getCodeActions(waitForModel) {
        if (this.codeActionsPromise !== null) {
            return this.codeActionsPromise;
        }
        return this.getModel(waitForModel)
            .then(model => {
            if (model) {
                if (!this.codeActionsPromise) {
                    this.codeActionsPromise = createCancelablePromise(cancellationToken => {
                        return getCodeActions(this.languageFeaturesService.codeActionProvider, model, new Range(this.marker.range.startLineNumber, this.marker.range.startColumn, this.marker.range.endLineNumber, this.marker.range.endColumn), {
                            type: 1 /* CodeActionTriggerType.Invoke */, triggerAction: CodeActionTriggerSource.ProblemsView, filter: { include: CodeActionKind.QuickFix }
                        }, Progress.None, cancellationToken).then(actions => {
                            return this._register(actions);
                        });
                    });
                }
                return this.codeActionsPromise;
            }
            return null;
        });
    }
    toActions(codeActions) {
        return codeActions.validActions.map(item => toAction({
            id: item.action.command ? item.action.command.id : item.action.title,
            label: item.action.title,
            run: async () => {
                await this.openFileAtMarker(this.marker);
                return await this.instantiationService.invokeFunction(applyCodeAction, item, ApplyCodeActionReason.FromProblemsView);
            }
        }));
    }
    openFileAtMarker(element) {
        const { resource, selection } = { resource: element.resource, selection: element.range };
        return this.editorService.openEditor({
            resource,
            options: {
                selection,
                preserveFocus: true,
                pinned: false,
                revealIfVisible: true
            },
        }, ACTIVE_GROUP).then(() => undefined);
    }
    getModel(waitForModel) {
        const model = this.modelService.getModel(this.marker.resource);
        if (model) {
            return Promise.resolve(model);
        }
        if (waitForModel) {
            if (!this.modelPromise) {
                this.modelPromise = createCancelablePromise(cancellationToken => {
                    return new Promise((c) => {
                        this._register(this.modelService.onModelAdded(model => {
                            if (isEqual(model.uri, this.marker.resource)) {
                                c(model);
                            }
                        }));
                    });
                });
            }
            return this.modelPromise;
        }
        return Promise.resolve(null);
    }
};
MarkerViewModel = __decorate([
    __param(1, IModelService),
    __param(2, IInstantiationService),
    __param(3, IEditorService),
    __param(4, ILanguageFeaturesService)
], MarkerViewModel);
export { MarkerViewModel };
let MarkersViewModel = class MarkersViewModel extends Disposable {
    constructor(multiline = true, viewMode = "tree" /* MarkersViewMode.Tree */, contextKeyService, instantiationService) {
        super();
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._onDidChangeViewMode = this._register(new Emitter());
        this.onDidChangeViewMode = this._onDidChangeViewMode.event;
        this.markersViewStates = new Map();
        this.markersPerResource = new Map();
        this.bulkUpdate = false;
        this.hoveredMarker = null;
        this.hoverDelayer = this._register(new Delayer(300));
        this._multiline = true;
        this._viewMode = "tree" /* MarkersViewMode.Tree */;
        this._multiline = multiline;
        this._viewMode = viewMode;
        this.viewModeContextKey = MarkersContextKeys.MarkersViewModeContextKey.bindTo(this.contextKeyService);
        this.viewModeContextKey.set(viewMode);
    }
    add(marker) {
        if (!this.markersViewStates.has(marker.id)) {
            const viewModel = this.instantiationService.createInstance(MarkerViewModel, marker);
            const disposables = [viewModel];
            viewModel.multiline = this.multiline;
            viewModel.onDidChange(() => {
                if (!this.bulkUpdate) {
                    this._onDidChange.fire(marker);
                }
            }, this, disposables);
            this.markersViewStates.set(marker.id, { viewModel, disposables });
            const markers = this.markersPerResource.get(marker.resource.toString()) || [];
            markers.push(marker);
            this.markersPerResource.set(marker.resource.toString(), markers);
        }
    }
    remove(resource) {
        const markers = this.markersPerResource.get(resource.toString()) || [];
        for (const marker of markers) {
            const value = this.markersViewStates.get(marker.id);
            if (value) {
                dispose(value.disposables);
            }
            this.markersViewStates.delete(marker.id);
            if (this.hoveredMarker === marker) {
                this.hoveredMarker = null;
            }
        }
        this.markersPerResource.delete(resource.toString());
    }
    getViewModel(marker) {
        const value = this.markersViewStates.get(marker.id);
        return value ? value.viewModel : null;
    }
    onMarkerMouseHover(marker) {
        this.hoveredMarker = marker;
        this.hoverDelayer.trigger(() => {
            if (this.hoveredMarker) {
                const model = this.getViewModel(this.hoveredMarker);
                if (model) {
                    model.showLightBulb();
                }
            }
        });
    }
    onMarkerMouseLeave(marker) {
        if (this.hoveredMarker === marker) {
            this.hoveredMarker = null;
        }
    }
    get multiline() {
        return this._multiline;
    }
    set multiline(value) {
        let changed = false;
        if (this._multiline !== value) {
            this._multiline = value;
            changed = true;
        }
        this.bulkUpdate = true;
        this.markersViewStates.forEach(({ viewModel }) => {
            if (viewModel.multiline !== value) {
                viewModel.multiline = value;
                changed = true;
            }
        });
        this.bulkUpdate = false;
        if (changed) {
            this._onDidChange.fire(undefined);
        }
    }
    get viewMode() {
        return this._viewMode;
    }
    set viewMode(value) {
        if (this._viewMode === value) {
            return;
        }
        this._viewMode = value;
        this._onDidChangeViewMode.fire(value);
        this.viewModeContextKey.set(value);
    }
    dispose() {
        this.markersViewStates.forEach(({ disposables }) => dispose(disposables));
        this.markersViewStates.clear();
        this.markersPerResource.clear();
        super.dispose();
    }
};
MarkersViewModel = __decorate([
    __param(2, IContextKeyService),
    __param(3, IInstantiationService)
], MarkersViewModel);
export { MarkersViewModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vyc1RyZWVWaWV3ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tYXJrZXJzL2Jyb3dzZXIvbWFya2Vyc1RyZWVWaWV3ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEtBQUssS0FBSyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVsRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNwRyxPQUFPLEVBQVcsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsa0JBQWtCLEVBQWlCLGVBQWUsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2hILE9BQU8sUUFBUSxNQUFNLGVBQWUsQ0FBQztBQUNyQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFlLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLHNCQUFzQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDakYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHekUsT0FBTyxFQUFF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