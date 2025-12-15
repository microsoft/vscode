/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, clearNode, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ExtensionIdentifier, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { Orientation, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { IExtensionFeatureDescriptor, Extensions, IExtensionFeaturesRegistry, IExtensionFeatureRenderer, IExtensionFeaturesManagementService, IExtensionFeatureTableRenderer, IExtensionFeatureMarkdownRenderer, ITableData, IRenderedData, IExtensionFeatureMarkdownAndTableRenderer } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { getExtensionId } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
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
import { IMarkdownString, MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Color } from '../../../../base/common/color.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { foreground, chartAxis, chartGuide, chartLine } from '../../../../platform/theme/common/colorRegistry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';

interface IExtensionFeatureElementRenderer extends IExtensionFeatureRenderer {
	type: 'element';
	render(manifest: IExtensionManifest): IRenderedData<HTMLElement>;
}

class RuntimeStatusMarkdownRenderer extends Disposable implements IExtensionFeatureElementRenderer {

	static readonly ID = 'runtimeStatus';
	readonly type = 'element';

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService,
		@IHoverService private readonly hoverService: IHoverService,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();
	}

	shouldRender(manifest: IExtensionManifest): boolean {
		const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
		if (!this.extensionService.extensions.some(e => ExtensionIdentifier.equals(e.identifier, extensionId))) {
			return false;
		}
		return !!manifest.main || !!manifest.browser;
	}

	render(manifest: IExtensionManifest): IRenderedData<HTMLElement> {
		const disposables = new DisposableStore();
		const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
		const emitter = disposables.add(new Emitter<HTMLElement>());
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

	private createElement(manifest: IExtensionManifest, disposables: DisposableStore): HTMLElement {
		const container = $('.runtime-status');
		const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
		const status = this.extensionService.getExtensionsStatus()[extensionId.value];
		if (this.extensionService.extensions.some(extension => ExtensionIdentifier.equals(extension.identifier, extensionId))) {
			const data = new MarkdownString();
			data.appendMarkdown(`### ${localize('activation', "Activation")}\n\n`);
			if (status.activationTimes) {
				if (status.activationTimes.activationReason.startup) {
					data.appendMarkdown(`Activated on Startup: \`${status.activationTimes.activateCallTime}ms\``);
				} else {
					data.appendMarkdown(`Activated by \`${status.activationTimes.activationReason.activationEvent}\` event: \`${status.activationTimes.activateCallTime}ms\``);
				}
			} else {
				data.appendMarkdown('Not yet activated');
			}
			this.renderMarkdown(data, container, disposables);
		}
		const features = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
		for (const feature of features) {
			const accessData = this.extensionFeaturesManagementService.getAccessData(extensionId, feature.id);
			if (accessData) {
				this.renderMarkdown(new MarkdownString(`\n ### ${localize('label', "{0} Usage", feature.label)}\n\n`), container, disposables);
				if (accessData.accessTimes.length) {
					const description = append(container,
						$('.feature-chart-description',
							undefined,
							localize('chartDescription', "There were {0} {1} requests from this extension in the last 30 days.", accessData?.accessTimes.length, feature.accessDataLabel ?? feature.label)));
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

	private renderMarkdown(markdown: IMarkdownString, container: HTMLElement, disposables: DisposableStore): void {
		const { element } = disposables.add(this.markdownRendererService.render({
			value: markdown.value,
			isTrusted: markdown.isTrusted,
			supportThemeIcons: true
		}));
		append(container, element);
	}

	private renderRequestsChart(container: HTMLElement, accessTimes: Date[], disposables: DisposableStore): void {
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
		const map = new Map<string, number>();
		for (const accessTime of accessTimes) {
			const day = `${accessTime.getDate()} ${accessTime.toLocaleString('default', { month: 'short' })}`;
			map.set(day, (map.get(day) ?? 0) + 1);
			maxCount = Math.max(maxCount, map.get(day)!);
		}

		const now = new Date();
		type Point = { x: number; y: number; date: string; count: number };
		const points: Point[] = [];
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

		const hoverDisposable = disposables.add(new MutableDisposable<IDisposable>());
		const mouseMoveListener = (event: MouseEvent): void => {
			const rect = svg.getBoundingClientRect();
			const mouseX = event.clientX - rect.left - margin.left;

			let closestPoint: Point | undefined;
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
			} else {
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
}


interface ILayoutParticipant {
	layout(height?: number, width?: number): void;
}

const runtimeStatusFeature = {
	id: RuntimeStatusMarkdownRenderer.ID,
	label: localize('runtime', "Runtime Status"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(RuntimeStatusMarkdownRenderer),
};

export class ExtensionFeaturesTab extends Themable {

	readonly domNode: HTMLElement;

	private readonly featureView = this._register(new MutableDisposable<ExtensionFeatureView>());
	private featureViewDimension?: { height?: number; width?: number };

	private readonly layoutParticipants: ILayoutParticipant[] = [];
	private readonly extensionId: ExtensionIdentifier;

	constructor(
		private readonly manifest: IExtensionManifest,
		private readonly feature: string | undefined,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(themeService);

		this.extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
		this.domNode = $('div.subcontent.feature-contributions');
		this.create();
	}

	layout(height?: number, width?: number): void {
		this.layoutParticipants.forEach(participant => participant.layout(height, width));
	}

	private create(): void {
		const features = this.getFeatures();
		if (features.length === 0) {
			append($('.no-features'), this.domNode).textContent = localize('noFeatures', "No features contributed.");
			return;
		}

		const splitView = this._register(new SplitView<number>(this.domNode, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: true
		}));
		this.layoutParticipants.push({
			layout: (height: number, width: number) => {
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
			separatorBorder: this.theme.getColor(PANEL_SECTION_BORDER)!
		});
	}

	private createFeaturesList(container: HTMLElement): WorkbenchList<IExtensionFeatureDescriptor> {
		const renderer = this.instantiationService.createInstance(ExtensionFeatureItemRenderer, this.extensionId);
		const delegate = new ExtensionFeatureItemDelegate();
		const list = this.instantiationService.createInstance(WorkbenchList, 'ExtensionFeaturesList', append(container, $('.features-list-wrapper')), delegate, [renderer], {
			multipleSelectionSupport: false,
			setRowLineHeight: false,
			horizontalScrolling: false,
			accessibilityProvider: {
				getAriaLabel(extensionFeature: IExtensionFeatureDescriptor | null): string {
					return extensionFeature?.label ?? '';
				},
				getWidgetAriaLabel(): string {
					return localize('extension features list', "Extension Features");
				}
			},
			openOnSingleClick: true
		}) as WorkbenchList<IExtensionFeatureDescriptor>;
		return list;
	}

	private layoutFeatureView(): void {
		this.featureView.value?.layout(this.featureViewDimension?.height, this.featureViewDimension?.width);
	}

	private showFeatureView(feature: IExtensionFeatureDescriptor, container: HTMLElement): void {
		if (this.featureView.value?.feature.id === feature.id) {
			return;
		}
		clearNode(container);
		this.featureView.value = this.instantiationService.createInstance(ExtensionFeatureView, this.extensionId, this.manifest, feature);
		container.appendChild(this.featureView.value.domNode);
		this.layoutFeatureView();
	}

	private getFeatures(): IExtensionFeatureDescriptor[] {
		const features = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry)
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

	private getRenderer(feature: IExtensionFeatureDescriptor): IExtensionFeatureRenderer | undefined {
		return feature.renderer ? this.instantiationService.createInstance(feature.renderer) : undefined;
	}

}

interface IExtensionFeatureItemTemplateData {
	readonly label: HTMLElement;
	readonly disabledElement: HTMLElement;
	readonly statusElement: HTMLElement;
	readonly disposables: DisposableStore;
}

class ExtensionFeatureItemDelegate implements IListVirtualDelegate<IExtensionFeatureDescriptor> {
	getHeight() { return 22; }
	getTemplateId() { return 'extensionFeatureDescriptor'; }
}

class ExtensionFeatureItemRenderer implements IListRenderer<IExtensionFeatureDescriptor, IExtensionFeatureItemTemplateData> {

	readonly templateId = 'extensionFeatureDescriptor';

	constructor(
		private readonly extensionId: ExtensionIdentifier,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService
	) { }

	renderTemplate(container: HTMLElement): IExtensionFeatureItemTemplateData {
		container.classList.add('extension-feature-list-item');
		const label = append(container, $('.extension-feature-label'));
		const disabledElement = append(container, $('.extension-feature-disabled-label'));
		disabledElement.textContent = localize('revoked', "No Access");
		const statusElement = append(container, $('.extension-feature-status'));
		return { label, disabledElement, statusElement, disposables: new DisposableStore() };
	}

	renderElement(element: IExtensionFeatureDescriptor, index: number, templateData: IExtensionFeatureItemTemplateData) {
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
			} else {
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

	disposeElement(element: IExtensionFeatureDescriptor, index: number, templateData: IExtensionFeatureItemTemplateData): void {
		templateData.disposables.dispose();
	}

	disposeTemplate(templateData: IExtensionFeatureItemTemplateData) {
		templateData.disposables.dispose();
	}

}

class ExtensionFeatureView extends Disposable {

	readonly domNode: HTMLElement;
	private readonly layoutParticipants: ILayoutParticipant[] = [];

	constructor(
		private readonly extensionId: ExtensionIdentifier,
		private readonly manifest: IExtensionManifest,
		readonly feature: IExtensionFeatureDescriptor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IDialogService private readonly dialogService: IDialogService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();

		this.domNode = $('.extension-feature-content');
		this.create(this.domNode);
	}

	private create(content: HTMLElement): void {
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
			append(bodyContent, $('.feature-status', undefined,
				$(`span${ThemeIcon.asCSSSelector(accessData.current.status.severity === Severity.Error ? errorIcon : accessData.current.status.severity === Severity.Warning ? warningIcon : infoIcon)}`, undefined),
				$('span', undefined, accessData.current.status.message)));
		}

		const featureContentElement = append(bodyContent, $('.feature-content'));
		if (this.feature.renderer) {
			const renderer = this.instantiationService.createInstance<IExtensionFeatureRenderer>(this.feature.renderer);
			if (renderer.type === 'table') {
				this.renderTableData(featureContentElement, <IExtensionFeatureTableRenderer>renderer);
			} else if (renderer.type === 'markdown') {
				this.renderMarkdownData(featureContentElement, <IExtensionFeatureMarkdownRenderer>renderer);
			} else if (renderer.type === 'markdown+table') {
				this.renderMarkdownAndTableData(featureContentElement, <IExtensionFeatureMarkdownAndTableRenderer>renderer);
			} else if (renderer.type === 'element') {
				this.renderElementData(featureContentElement, <IExtensionFeatureElementRenderer>renderer);
			}
		}
	}

	private updateButtonLabel(button: Button): void {
		button.label = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id) ? localize('revoke', "Revoke Access") : localize('enable', "Allow Access");
	}

	private renderTableData(container: HTMLElement, renderer: IExtensionFeatureTableRenderer): void {
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

	private renderTable(tableData: ITableData, container: HTMLElement): IDisposable {
		const disposables = new DisposableStore();
		append(container,
			$('table', undefined,
				$('tr', undefined,
					...tableData.headers.map(header => $('th', undefined, header))
				),
				...tableData.rows
					.map(row => {
						return $('tr', undefined,
							...row.map(rowData => {
								if (typeof rowData === 'string') {
									return $('td', undefined, $('p', undefined, rowData));
								}
								const data = Array.isArray(rowData) ? rowData : [rowData];
								return $('td', undefined, ...data.map(item => {
									const result: Node[] = [];
									if (isMarkdownString(rowData)) {
										const element = $('', undefined);
										this.renderMarkdown(rowData, element);
										result.push(element);
									} else if (item instanceof ResolvedKeybinding) {
										const element = $('');
										const kbl = disposables.add(new KeybindingLabel(element, OS, defaultKeybindingLabelStyles));
										kbl.set(item);
										result.push(element);
									} else if (item instanceof Color) {
										result.push($('span', { class: 'colorBox', style: 'background-color: ' + Color.Format.CSS.format(item) }, ''));
										result.push($('code', undefined, Color.Format.CSS.formatHex(item)));
									}
									return result;
								}).flat());
							})
						);
					})));
		return disposables;
	}

	private renderMarkdownAndTableData(container: HTMLElement, renderer: IExtensionFeatureMarkdownAndTableRenderer): void {
		const markdownAndTableData = this._register(renderer.render(this.manifest));
		if (markdownAndTableData.onDidChange) {
			this._register(markdownAndTableData.onDidChange(data => {
				clearNode(container);
				this.renderMarkdownAndTable(data, container);
			}));
		}
		this.renderMarkdownAndTable(markdownAndTableData.data, container);
	}

	private renderMarkdownData(container: HTMLElement, renderer: IExtensionFeatureMarkdownRenderer): void {
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

	private renderMarkdown(markdown: IMarkdownString, container: HTMLElement): void {
		const { element } = this._register(this.markdownRendererService.render({
			value: markdown.value,
			isTrusted: markdown.isTrusted,
			supportThemeIcons: true
		}));
		append(container, element);
	}

	private renderMarkdownAndTable(data: Array<IMarkdownString | ITableData>, container: HTMLElement): void {
		for (const markdownOrTable of data) {
			if (isMarkdownString(markdownOrTable)) {
				const element = $('', undefined);
				this.renderMarkdown(markdownOrTable, element);
				append(container, element);
			} else {
				const tableElement = append(container, $('table'));
				this.renderTable(markdownOrTable, tableElement);
			}
		}
	}

	private renderElementData(container: HTMLElement, renderer: IExtensionFeatureElementRenderer): void {
		const elementData = this._register(renderer.render(this.manifest));
		if (elementData.onDidChange) {
			this._register(elementData.onDidChange(data => {
				clearNode(container);
				container.appendChild(data);
			}));
		}
		container.appendChild(elementData.data);
	}

	layout(height?: number, width?: number): void {
		this.layoutParticipants.forEach(p => p.layout(height, width));
	}

}
