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
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, clearNode, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Extensions, IExtensionFeaturesManagementService } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { getExtensionId } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles, defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { PANEL_SECTION_BORDER } from '../../../common/theme.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import Severity from '../../../../base/common/severity.js';
import { errorIcon, infoIcon, warningIcon } from './extensionsIcons.js';
import { SeverityIcon } from '../../../../base/browser/ui/severityIcon/severityIcon.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { OS } from '../../../../base/common/platform.js';
import { MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Color } from '../../../../base/common/color.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { foreground, chartAxis, chartGuide, chartLine } from '../../../../platform/theme/common/colorRegistry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
let RuntimeStatusMarkdownRenderer = class RuntimeStatusMarkdownRenderer extends Disposable {
    static { this.ID = 'runtimeStatus'; }
    constructor(extensionService, hoverService, extensionFeaturesManagementService, markdownRendererService) {
        super();
        this.extensionService = extensionService;
        this.hoverService = hoverService;
        this.extensionFeaturesManagementService = extensionFeaturesManagementService;
        this.markdownRendererService = markdownRendererService;
        this.type = 'element';
    }
    shouldRender(manifest) {
        const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
        if (!this.extensionService.extensions.some(e => ExtensionIdentifier.equals(e.identifier, extensionId))) {
            return false;
        }
        return !!manifest.main || !!manifest.browser;
    }
    render(manifest) {
        const disposables = new DisposableStore();
        const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
        const emitter = disposables.add(new Emitter());
        disposables.add(this.extensionService.onDidChangeExtensionsStatus(e => {
            if (e.some(extension => ExtensionIdentifier.equals(extension, extensionId))) {
                emitter.fire(this.createElement(manifest, disposables));
            }
        }));
        disposables.add(this.extensionFeaturesManagementService.onDidChangeAccessData(e => emitter.fire(this.createElement(manifest, disposables))));
        return {
            onDidChange: emitter.event,
            data: this.createElement(manifest, disposables),
            dispose: () => disposables.dispose()
        };
    }
    createElement(manifest, disposables) {
        const container = $('.runtime-status');
        const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
        const status = this.extensionService.getExtensionsStatus()[extensionId.value];
        if (this.extensionService.extensions.some(extension => ExtensionIdentifier.equals(extension.identifier, extensionId))) {
            const data = new MarkdownString();
            data.appendMarkdown(`### ${localize('activation', "Activation")}\n\n`);
            if (status.activationTimes) {
                if (status.activationTimes.activationReason.startup) {
                    data.appendMarkdown(`Activated on Startup: \`${status.activationTimes.activateCallTime}ms\``);
                }
                else {
                    data.appendMarkdown(`Activated by \`${status.activationTimes.activationReason.activationEvent}\` event: \`${status.activationTimes.activateCallTime}ms\``);
                }
            }
            else {
                data.appendMarkdown('Not yet activated');
            }
            this.renderMarkdown(data, container, disposables);
        }
        const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
        for (const feature of features) {
            const accessData = this.extensionFeaturesManagementService.getAccessData(extensionId, feature.id);
            if (accessData) {
                this.renderMarkdown(new MarkdownString(`\n ### ${localize('label', "{0} Usage", feature.label)}\n\n`), container, disposables);
                if (accessData.accessTimes.length) {
                    const description = append(container, $('.feature-chart-description', undefined, localize('chartDescription', "There were {0} {1} requests from this extension in the last 30 days.", accessData?.accessTimes.length, feature.accessDataLabel ?? feature.label)));
                    description.style.marginBottom = '8px';
                    this.renderRequestsChart(container, accessData.accessTimes, disposables);
                }
                const status = accessData?.current?.status;
                if (status) {
                    const data = new MarkdownString();
                    if (status?.severity === Severity.Error) {
                        data.appendMarkdown(`$(${errorIcon.id}) ${status.message}\n\n`);
                    }
                    if (status?.severity === Severity.Warning) {
                        data.appendMarkdown(`$(${warningIcon.id}) ${status.message}\n\n`);
                    }
                    if (data.value) {
                        this.renderMarkdown(data, container, disposables);
                    }
                }
            }
        }
        if (status.runtimeErrors.length || status.messages.length) {
            const data = new MarkdownString();
            if (status.runtimeErrors.length) {
                data.appendMarkdown(`\n ### ${localize('uncaught errors', "Uncaught Errors ({0})", status.runtimeErrors.length)}\n`);
                for (const error of status.runtimeErrors) {
                    data.appendMarkdown(`$(${Codicon.error.id})&nbsp;${getErrorMessage(error)}\n\n`);
                }
            }
            if (status.messages.length) {
                data.appendMarkdown(`\n ### ${localize('messaages', "Messages ({0})", status.messages.length)}\n`);
                for (const message of status.messages) {
                    data.appendMarkdown(`$(${(message.type === Severity.Error ? Codicon.error : message.type === Severity.Warning ? Codicon.warning : Codicon.info).id})&nbsp;${message.message}\n\n`);
                }
            }
            if (data.value) {
                this.renderMarkdown(data, container, disposables);
            }
        }
        return container;
    }
    renderMarkdown(markdown, container, disposables) {
        const { element } = disposables.add(this.markdownRendererService.render({
            value: markdown.value,
            isTrusted: markdown.isTrusted,
            supportThemeIcons: true
        }));
        append(container, element);
    }
    renderRequestsChart(container, accessTimes, disposables) {
        const width = 450;
        const height = 250;
        const margin = { top: 0, right: 4, bottom: 20, left: 4 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const chartContainer = append(container, $('.feature-chart-container'));
        chartContainer.style.position = 'relative';
        const tooltip = append(chartContainer, $('.feature-chart-tooltip'));
        tooltip.style.position = 'absolute';
        tooltip.style.width = '0px';
        tooltip.style.height = '0px';
        let maxCount = 100;
        const map = new Map();
        for (const accessTime of accessTimes) {
            const day = `${accessTime.getDate()} ${accessTime.toLocaleString('default', { month: 'short' })}`;
            map.set(day, (map.get(day) ?? 0) + 1);
            maxCount = Math.max(maxCount, map.get(day));
        }
        const now = new Date();
        const points = [];
        for (let i = 0; i <= 30; i++) {
            const date = new Date(now);
            date.setDate(now.getDate() - (30 - i));
            const dateString = `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })}`;
            const count = map.get(dateString) ?? 0;
            const x = (i / 30) * innerWidth;
            const y = innerHeight - (count / maxCount) * innerHeight;
            points.push({ x, y, date: dateString, count });
        }
        const chart = append(chartContainer, $('.feature-chart'));
        const svg = append(chart, $.SVG('svg'));
        svg.setAttribute('width', `${width}px`);
        svg.setAttribute('height', `${height}px`);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const g = $.SVG('g');
        g.setAttribute('transform', `translate(${margin.left},${margin.top})`);
        svg.appendChild(g);
        const xAxisLine = $.SVG('line');
        xAxisLine.setAttribute('x1', '0');
        xAxisLine.setAttribute('y1', `${innerHeight}`);
        xAxisLine.setAttribute('x2', `${innerWidth}`);
        xAxisLine.setAttribute('y2', `${innerHeight}`);
        xAxisLine.setAttribute('stroke', asCssVariable(chartAxis));
        xAxisLine.setAttribute('stroke-width', '1px');
        g.appendChild(xAxisLine);
        for (let i = 1; i <= 30; i += 7) {
            const date = new Date(now);
            date.setDate(now.getDate() - (30 - i));
            const dateString = `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })}`;
            const x = (i / 30) * innerWidth;
            // Add vertical line
            const tick = $.SVG('line');
            tick.setAttribute('x1', `${x}`);
            tick.setAttribute('y1', `${innerHeight}`);
            tick.setAttribute('x2', `${x}`);
            tick.setAttribute('y2', `${innerHeight + 10}`);
            tick.setAttribute('stroke', asCssVariable(chartAxis));
            tick.setAttribute('stroke-width', '1px');
            g.appendChild(tick);
            const ruler = $.SVG('line');
            ruler.setAttribute('x1', `${x}`);
            ruler.setAttribute('y1', `0`);
            ruler.setAttribute('x2', `${x}`);
            ruler.setAttribute('y2', `${innerHeight}`);
            ruler.setAttribute('stroke', asCssVariable(chartGuide));
            ruler.setAttribute('stroke-width', '1px');
            g.appendChild(ruler);
            const xAxisDate = $.SVG('text');
            xAxisDate.setAttribute('x', `${x}`);
            xAxisDate.setAttribute('y', `${height}`); // Adjusted y position to be within the SVG view port
            xAxisDate.setAttribute('text-anchor', 'middle');
            xAxisDate.setAttribute('fill', asCssVariable(foreground));
            xAxisDate.setAttribute('font-size', '10px');
            xAxisDate.textContent = dateString;
            g.appendChild(xAxisDate);
        }
        const line = $.SVG('polyline');
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', asCssVariable(chartLine));
        line.setAttribute('stroke-width', `2px`);
        line.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
        g.appendChild(line);
        const highlightCircle = $.SVG('circle');
        highlightCircle.setAttribute('r', `4px`);
        highlightCircle.style.display = 'none';
        g.appendChild(highlightCircle);
        const hoverDisposable = disposables.add(new MutableDisposable());
        const mouseMoveListener = (event) => {
            const rect = svg.getBoundingClientRect();
            const mouseX = event.clientX - rect.left - margin.left;
            let closestPoint;
            let minDistance = Infinity;
            points.forEach(point => {
                const distance = Math.abs(point.x - mouseX);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPoint = point;
                }
            });
            if (closestPoint) {
                highlightCircle.setAttribute('cx', `${closestPoint.x}`);
                highlightCircle.setAttribute('cy', `${closestPoint.y}`);
                highlightCircle.style.display = 'block';
                tooltip.style.left = `${closestPoint.x + 24}px`;
                tooltip.style.top = `${closestPoint.y + 14}px`;
                hoverDisposable.value = this.hoverService.showInstantHover({
                    content: new MarkdownString(`${closestPoint.date}: ${closestPoint.count} requests`),
                    target: tooltip,
                    appearance: {
                        showPointer: true,
                        skipFadeInAnimation: true,
                    }
                });
            }
            else {
                hoverDisposable.value = undefined;
            }
        };
        disposables.add(addDisposableListener(svg, EventType.MOUSE_MOVE, mouseMoveListener));
        const mouseLeaveListener = () => {
            highlightCircle.style.display = 'none';
            hoverDisposable.value = undefined;
        };
        disposables.add(addDisposableListener(svg, EventType.MOUSE_LEAVE, mouseLeaveListener));
    }
};
RuntimeStatusMarkdownRenderer = __decorate([
    __param(0, IExtensionService),
    __param(1, IHoverService),
    __param(2, IExtensionFeaturesManagementService),
    __param(3, IMarkdownRendererService)
], RuntimeStatusMarkdownRenderer);
const runtimeStatusFeature = {
    id: RuntimeStatusMarkdownRenderer.ID,
    label: localize('runtime', "Runtime Status"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(RuntimeStatusMarkdownRenderer),
};
let ExtensionFeaturesTab = class ExtensionFeaturesTab extends Themable {
    constructor(manifest, feature, themeService, instantiationService) {
        super(themeService);
        this.manifest = manifest;
        this.feature = feature;
        this.instantiationService = instantiationService;
        this.featureView = this._register(new MutableDisposable());
        this.layoutParticipants = [];
        this.extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
        this.domNode = $('div.subcontent.feature-contributions');
        this.create();
    }
    layout(height, width) {
        this.layoutParticipants.forEach(participant => participant.layout(height, width));
    }
    create() {
        const features = this.getFeatures();
        if (features.length === 0) {
            append($('.no-features'), this.domNode).textContent = localize('noFeatures', "No features contributed.");
            return;
        }
        const splitView = this._register(new SplitView(this.domNode, {
            orientation: 1 /* Orientation.HORIZONTAL */,
            proportionalLayout: true
        }));
        this.layoutParticipants.push({
            layout: (height, width) => {
                splitView.el.style.height = `${height - 14}px`;
                splitView.layout(width);
            }
        });
        const featuresListContainer = $('.features-list-container');
        const list = this._register(this.createFeaturesList(featuresListContainer));
        list.splice(0, list.length, features);
        const featureViewContainer = $('.feature-view-container');
        this._register(list.onDidChangeSelection(e => {
            const feature = e.elements[0];
            if (feature) {
                this.showFeatureView(feature, featureViewContainer);
            }
        }));
        const index = this.feature ? features.findIndex(f => f.id === this.feature) : 0;
        list.setSelection([index === -1 ? 0 : index]);
        splitView.addView({
            onDidChange: Event.None,
            element: featuresListContainer,
            minimumSize: 100,
            maximumSize: Number.POSITIVE_INFINITY,
            layout: (width, _, height) => {
                featuresListContainer.style.width = `${width}px`;
                list.layout(height, width);
            }
        }, 200, undefined, true);
        splitView.addView({
            onDidChange: Event.None,
            element: featureViewContainer,
            minimumSize: 500,
            maximumSize: Number.POSITIVE_INFINITY,
            layout: (width, _, height) => {
                featureViewContainer.style.width = `${width}px`;
                this.featureViewDimension = { height, width };
                this.layoutFeatureView();
            }
        }, Sizing.Distribute, undefined, true);
        splitView.style({
            separatorBorder: this.theme.getColor(PANEL_SECTION_BORDER)
        });
    }
    createFeaturesList(container) {
        const renderer = this.instantiationService.createInstance(ExtensionFeatureItemRenderer, this.extensionId);
        const delegate = new ExtensionFeatureItemDelegate();
        const list = this.instantiationService.createInstance(WorkbenchList, 'ExtensionFeaturesList', append(container, $('.features-list-wrapper')), delegate, [renderer], {
            multipleSelectionSupport: false,
            setRowLineHeight: false,
            horizontalScrolling: false,
            accessibilityProvider: {
                getAriaLabel(extensionFeature) {
                    return extensionFeature?.label ?? '';
                },
                getWidgetAriaLabel() {
                    return localize('extension features list', "Extension Features");
                }
            },
            openOnSingleClick: true
        });
        return list;
    }
    layoutFeatureView() {
        this.featureView.value?.layout(this.featureViewDimension?.height, this.featureViewDimension?.width);
    }
    showFeatureView(feature, container) {
        if (this.featureView.value?.feature.id === feature.id) {
            return;
        }
        clearNode(container);
        this.featureView.value = this.instantiationService.createInstance(ExtensionFeatureView, this.extensionId, this.manifest, feature);
        container.appendChild(this.featureView.value.domNode);
        this.layoutFeatureView();
    }
    getFeatures() {
        const features = Registry.as(Extensions.ExtensionFeaturesRegistry)
            .getExtensionFeatures().filter(feature => {
            const renderer = this.getRenderer(feature);
            const shouldRender = renderer?.shouldRender(this.manifest);
            renderer?.dispose();
            return shouldRender;
        }).sort((a, b) => a.label.localeCompare(b.label));
        const renderer = this.getRenderer(runtimeStatusFeature);
        if (renderer?.shouldRender(this.manifest)) {
            features.splice(0, 0, runtimeStatusFeature);
        }
        renderer?.dispose();
        return features;
    }
    getRenderer(feature) {
        return feature.renderer ? this.instantiationService.createInstance(feature.renderer) : undefined;
    }
};
ExtensionFeaturesTab = __decorate([
    __param(2, IThemeService),
    __param(3, IInstantiationService)
], ExtensionFeaturesTab);
export { ExtensionFeaturesTab };
class ExtensionFeatureItemDelegate {
    getHeight() { return 22; }
    getTemplateId() { return 'extensionFeatureDescriptor'; }
}
let ExtensionFeatureItemRenderer = class ExtensionFeatureItemRenderer {
    constructor(extensionId, extensionFeaturesManagementService) {
        this.extensionId = extensionId;
        this.extensionFeaturesManagementService = extensionFeaturesManagementService;
        this.templateId = 'extensionFeatureDescriptor';
    }
    renderTemplate(container) {
        container.classList.add('extension-feature-list-item');
        const label = append(container, $('.extension-feature-label'));
        const disabledElement = append(container, $('.extension-feature-disabled-label'));
        disabledElement.textContent = localize('revoked', "No Access");
        const statusElement = append(container, $('.extension-feature-status'));
        return { label, disabledElement, statusElement, disposables: new DisposableStore() };
    }
    renderElement(element, index, templateData) {
        templateData.disposables.clear();
        templateData.label.textContent = element.label;
        templateData.disabledElement.style.display = element.id === runtimeStatusFeature.id || this.extensionFeaturesManagementService.isEnabled(this.extensionId, element.id) ? 'none' : 'inherit';
        templateData.disposables.add(this.extensionFeaturesManagementService.onDidChangeEnablement(({ extension, featureId, enabled }) => {
            if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === element.id) {
                templateData.disabledElement.style.display = enabled ? 'none' : 'inherit';
            }
        }));
        const statusElementClassName = templateData.statusElement.className;
        const updateStatus = () => {
            const accessData = this.extensionFeaturesManagementService.getAccessData(this.extensionId, element.id);
            if (accessData?.current?.status) {
                templateData.statusElement.style.display = 'inherit';
                templateData.statusElement.className = `${statusElementClassName} ${SeverityIcon.className(accessData.current.status.severity)}`;
            }
            else {
                templateData.statusElement.style.display = 'none';
            }
        };
        updateStatus();
        templateData.disposables.add(this.extensionFeaturesManagementService.onDidChangeAccessData(({ extension, featureId }) => {
            if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === element.id) {
                updateStatus();
            }
        }));
    }
    disposeElement(element, index, templateData) {
        templateData.disposables.dispose();
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
};
ExtensionFeatureItemRenderer = __decorate([
    __param(1, IExtensionFeaturesManagementService)
], ExtensionFeatureItemRenderer);
let ExtensionFeatureView = class ExtensionFeatureView extends Disposable {
    constructor(extensionId, manifest, feature, instantiationService, extensionFeaturesManagementService, dialogService, markdownRendererService) {
        super();
        this.extensionId = extensionId;
        this.manifest = manifest;
        this.feature = feature;
        this.instantiationService = instantiationService;
        this.extensionFeaturesManagementService = extensionFeaturesManagementService;
        this.dialogService = dialogService;
        this.markdownRendererService = markdownRendererService;
        this.layoutParticipants = [];
        this.domNode = $('.extension-feature-content');
        this.create(this.domNode);
    }
    create(content) {
        const header = append(content, $('.feature-header'));
        const title = append(header, $('.feature-title'));
        title.textContent = this.feature.label;
        if (this.feature.access.canToggle) {
            const actionsContainer = append(header, $('.feature-actions'));
            const button = new Button(actionsContainer, defaultButtonStyles);
            this.updateButtonLabel(button);
            this._register(this.extensionFeaturesManagementService.onDidChangeEnablement(({ extension, featureId }) => {
                if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === this.feature.id) {
                    this.updateButtonLabel(button);
                }
            }));
            this._register(button.onDidClick(async () => {
                const enabled = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id);
                const confirmationResult = await this.dialogService.confirm({
                    title: localize('accessExtensionFeature', "Enable '{0}' Feature", this.feature.label),
                    message: enabled
                        ? localize('disableAccessExtensionFeatureMessage', "Would you like to revoke '{0}' extension to access '{1}' feature?", this.manifest.displayName ?? this.extensionId.value, this.feature.label)
                        : localize('enableAccessExtensionFeatureMessage', "Would you like to allow '{0}' extension to access '{1}' feature?", this.manifest.displayName ?? this.extensionId.value, this.feature.label),
                    custom: true,
                    primaryButton: enabled ? localize('revoke', "Revoke Access") : localize('grant', "Allow Access"),
                    cancelButton: localize('cancel', "Cancel"),
                });
                if (confirmationResult.confirmed) {
                    this.extensionFeaturesManagementService.setEnablement(this.extensionId, this.feature.id, !enabled);
                }
            }));
        }
        const body = append(content, $('.feature-body'));
        const bodyContent = $('.feature-body-content');
        const scrollableContent = this._register(new DomScrollableElement(bodyContent, {}));
        append(body, scrollableContent.getDomNode());
        this.layoutParticipants.push({ layout: () => scrollableContent.scanDomNode() });
        scrollableContent.scanDomNode();
        if (this.feature.description) {
            const description = append(bodyContent, $('.feature-description'));
            description.textContent = this.feature.description;
        }
        const accessData = this.extensionFeaturesManagementService.getAccessData(this.extensionId, this.feature.id);
        if (accessData?.current?.status) {
            append(bodyContent, $('.feature-status', undefined, $(`span${ThemeIcon.asCSSSelector(accessData.current.status.severity === Severity.Error ? errorIcon : accessData.current.status.severity === Severity.Warning ? warningIcon : infoIcon)}`, undefined), $('span', undefined, accessData.current.status.message)));
        }
        const featureContentElement = append(bodyContent, $('.feature-content'));
        if (this.feature.renderer) {
            const renderer = this.instantiationService.createInstance(this.feature.renderer);
            if (renderer.type === 'table') {
                this.renderTableData(featureContentElement, renderer);
            }
            else if (renderer.type === 'markdown') {
                this.renderMarkdownData(featureContentElement, renderer);
            }
            else if (renderer.type === 'markdown+table') {
                this.renderMarkdownAndTableData(featureContentElement, renderer);
            }
            else if (renderer.type === 'element') {
                this.renderElementData(featureContentElement, renderer);
            }
        }
    }
    updateButtonLabel(button) {
        button.label = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id) ? localize('revoke', "Revoke Access") : localize('enable', "Allow Access");
    }
    renderTableData(container, renderer) {
        const tableData = this._register(renderer.render(this.manifest));
        const tableDisposable = this._register(new MutableDisposable());
        if (tableData.onDidChange) {
            this._register(tableData.onDidChange(data => {
                clearNode(container);
                tableDisposable.value = this.renderTable(data, container);
            }));
        }
        tableDisposable.value = this.renderTable(tableData.data, container);
    }
    renderTable(tableData, container) {
        const disposables = new DisposableStore();
        append(container, $('table', undefined, $('tr', undefined, ...tableData.headers.map(header => $('th', undefined, header))), ...tableData.rows
            .map(row => {
            return $('tr', undefined, ...row.map(rowData => {
                if (typeof rowData === 'string') {
                    return $('td', undefined, $('p', undefined, rowData));
                }
                const data = Array.isArray(rowData) ? rowData : [rowData];
                return $('td', undefined, ...data.map(item => {
                    const result = [];
                    if (isMarkdownString(rowData)) {
                        const element = $('', undefined);
                        this.renderMarkdown(rowData, element);
                        result.push(element);
                    }
                    else if (item instanceof ResolvedKeybinding) {
                        const element = $('');
                        const kbl = disposables.add(new KeybindingLabel(element, OS, defaultKeybindingLabelStyles));
                        kbl.set(item);
                        result.push(element);
                    }
                    else if (item instanceof Color) {
                        result.push($('span', { class: 'colorBox', style: 'background-color: ' + Color.Format.CSS.format(item) }, ''));
                        result.push($('code', undefined, Color.Format.CSS.formatHex(item)));
                    }
                    return result;
                }).flat());
            }));
        })));
        return disposables;
    }
    renderMarkdownAndTableData(container, renderer) {
        const markdownAndTableData = this._register(renderer.render(this.manifest));
        if (markdownAndTableData.onDidChange) {
            this._register(markdownAndTableData.onDidChange(data => {
                clearNode(container);
                this.renderMarkdownAndTable(data, container);
            }));
        }
        this.renderMarkdownAndTable(markdownAndTableData.data, container);
    }
    renderMarkdownData(container, renderer) {
        container.classList.add('markdown');
        const markdownData = this._register(renderer.render(this.manifest));
        if (markdownData.onDidChange) {
            this._register(markdownData.onDidChange(data => {
                clearNode(container);
                this.renderMarkdown(data, container);
            }));
        }
        this.renderMarkdown(markdownData.data, container);
    }
    renderMarkdown(markdown, container) {
        const { element } = this._register(this.markdownRendererService.render({
            value: markdown.value,
            isTrusted: markdown.isTrusted,
            supportThemeIcons: true
        }));
        append(container, element);
    }
    renderMarkdownAndTable(data, container) {
        for (const markdownOrTable of data) {
            if (isMarkdownString(markdownOrTable)) {
                const element = $('', undefined);
                this.renderMarkdown(markdownOrTable, element);
                append(container, element);
            }
            else {
                const tableElement = append(container, $('table'));
                this.renderTable(markdownOrTable, tableElement);
            }
        }
    }
    renderElementData(container, renderer) {
        const elementData = this._register(renderer.render(this.manifest));
        if (elementData.onDidChange) {
            this._register(elementData.onDidChange(data => {
                clearNode(container);
                container.appendChild(data);
            }));
        }
        container.appendChild(elementData.data);
    }
    layout(height, width) {
        this.layoutParticipants.forEach(p => p.layout(height, width));
    }
};
ExtensionFeatureView = __decorate([
    __param(3, IInstantiationService),
    __param(4, IExtensionFeaturesManagementService),
    __param(5, IDialogService),
    __param(6, IMarkdownRendererService)
], ExtensionFeatureView);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRmVhdHVyZXNUYWIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uRmVhdHVyZXNUYWIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuSCxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsbUJBQW1CLEVBQXNCLE1BQU0sc0RBQXNELENBQUM7QUFDL0csT0FBTyxFQUFlLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNwRyxPQUFPLEVBQStCLFVBQVUsRUFBeUQsbUNBQW1DLEVBQTJJLE1BQU0sbUVBQW1FLENBQUM7QUFDalcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDakYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBRTVHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxxREFBcUQsQ0FB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