/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as network from 'vs/base/common/network';
import * as paths from 'vs/base/common/paths';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ResourceLabels, IResourceLabel } from 'vs/workbench/browser/labels';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IMarker, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { ResourceMarkers, Marker, RelatedInformation } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ActionBar, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { QuickFixAction } from 'vs/workbench/parts/markers/electron-browser/markersPanelActions';
import { ILabelService } from 'vs/platform/label/common/label';
import { dirname } from 'vs/base/common/resources';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeFilter, TreeVisibility, TreeFilterResult, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { FilterOptions } from 'vs/workbench/parts/markers/electron-browser/markersFilterOptions';
import { IMatch } from 'vs/base/common/filters';
import { Event, Emitter } from 'vs/base/common/event';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';

export type TreeElement = ResourceMarkers | Marker | RelatedInformation;

interface IResourceMarkersTemplateData {
	resourceLabel: IResourceLabel;
	count: CountBadge;
	styler: IDisposable;
}

interface IMarkerTemplateData {
	markerWidget: MarkerWidget;
}

interface IRelatedInformationTemplateData {
	resourceLabel: HighlightedLabel;
	lnCol: HTMLElement;
	description: HighlightedLabel;
}

export class MarkersTreeAccessibilityProvider implements IAccessibilityProvider<TreeElement> {

	constructor(@ILabelService private readonly labelService: ILabelService) { }

	public getAriaLabel(element: TreeElement): string {
		if (element instanceof ResourceMarkers) {
			const path = this.labelService.getUriLabel(element.resource, { relative: true }) || element.resource.fsPath;
			return Messages.MARKERS_TREE_ARIA_LABEL_RESOURCE(element.markers.length, element.name, paths.dirname(path));
		}
		if (element instanceof Marker) {
			return Messages.MARKERS_TREE_ARIA_LABEL_MARKER(element);
		}
		if (element instanceof RelatedInformation) {
			return Messages.MARKERS_TREE_ARIA_LABEL_RELATED_INFORMATION(element.raw);
		}
		return null;
	}
}

const enum TemplateId {
	ResourceMarkers = 'rm',
	Marker = 'm',
	RelatedInformation = 'ri'
}

export class VirtualDelegate implements IListVirtualDelegate<TreeElement> {

	constructor(private readonly markersViewState: MarkersViewState) { }

	getHeight(element: TreeElement): number {
		if (element instanceof Marker) {
			const viewState = this.markersViewState.getViewState(element);
			const noOfLines = !viewState || viewState.multiline ? element.lines.length : 1;
			return noOfLines * 22;
		}
		return 22;
	}

	getTemplateId(element: TreeElement): string {
		if (element instanceof ResourceMarkers) {
			return TemplateId.ResourceMarkers;
		} else if (element instanceof Marker) {
			return TemplateId.Marker;
		} else {
			return TemplateId.RelatedInformation;
		}
	}
}

const enum FilterDataType {
	ResourceMarkers,
	Marker,
	RelatedInformation
}

interface ResourceMarkersFilterData {
	type: FilterDataType.ResourceMarkers;
	uriMatches: IMatch[];
}

interface MarkerFilterData {
	type: FilterDataType.Marker;
	lineMatches: IMatch[][];
	sourceMatches: IMatch[];
	codeMatches: IMatch[];
}

interface RelatedInformationFilterData {
	type: FilterDataType.RelatedInformation;
	uriMatches: IMatch[];
	messageMatches: IMatch[];
}

export type FilterData = ResourceMarkersFilterData | MarkerFilterData | RelatedInformationFilterData;

export class ResourceMarkersRenderer implements ITreeRenderer<ResourceMarkers, ResourceMarkersFilterData, IResourceMarkersTemplateData> {

	private renderedNodes = new Map<ITreeNode<ResourceMarkers, ResourceMarkersFilterData>, IResourceMarkersTemplateData>();
	private disposables: IDisposable[] = [];

	constructor(
		private labels: ResourceLabels,
		onDidChangeRenderNodeCount: Event<ITreeNode<ResourceMarkers, ResourceMarkersFilterData>>,
		@IThemeService private readonly themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService
	) {
		onDidChangeRenderNodeCount(this.onDidChangeRenderNodeCount, this, this.disposables);
	}

	templateId = TemplateId.ResourceMarkers;

	renderTemplate(container: HTMLElement): IResourceMarkersTemplateData {
		const data = <IResourceMarkersTemplateData>Object.create(null);

		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.resourceLabel = this.labels.create(resourceLabelContainer, { supportHighlights: true });

		const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);
		data.styler = attachBadgeStyler(data.count, this.themeService);

		return data;
	}

	renderElement(node: ITreeNode<ResourceMarkers, ResourceMarkersFilterData>, _: number, templateData: IResourceMarkersTemplateData): void {
		const resourceMarkers = node.element;
		const uriMatches = node.filterData && node.filterData.uriMatches || [];

		if (resourceMarkers.resource.scheme === network.Schemas.file || resourceMarkers.resource.scheme === network.Schemas.untitled) {
			templateData.resourceLabel.setFile(resourceMarkers.resource, { matches: uriMatches });
		} else {
			templateData.resourceLabel.setResource({ name: resourceMarkers.name, description: this.labelService.getUriLabel(dirname(resourceMarkers.resource), { relative: true }), resource: resourceMarkers.resource }, { matches: uriMatches });
		}

		this.updateCount(node, templateData);
		this.renderedNodes.set(node, templateData);
	}

	disposeElement(node: ITreeNode<ResourceMarkers, ResourceMarkersFilterData>): void {
		this.renderedNodes.delete(node);
	}

	disposeTemplate(templateData: IResourceMarkersTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.styler.dispose();
	}

	private onDidChangeRenderNodeCount(node: ITreeNode<ResourceMarkers, ResourceMarkersFilterData>): void {
		const templateData = this.renderedNodes.get(node);

		if (!templateData) {
			return;
		}

		this.updateCount(node, templateData);
	}

	private updateCount(node: ITreeNode<ResourceMarkers, ResourceMarkersFilterData>, templateData: IResourceMarkersTemplateData): void {
		templateData.count.setCount(node.children.reduce((r, n) => r + (n.visible ? 1 : 0), 0));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class FileResourceMarkersRenderer extends ResourceMarkersRenderer {
}

export class MarkerRenderer implements ITreeRenderer<Marker, MarkerFilterData, IMarkerTemplateData> {

	constructor(
		private readonly markersViewState: MarkersViewState,
		private actionItemProvider: IActionItemProvider,
		@IInstantiationService protected instantiationService: IInstantiationService
	) { }

	templateId = TemplateId.Marker;

	renderTemplate(container: HTMLElement): IMarkerTemplateData {
		const data: IMarkerTemplateData = Object.create(null);
		data.markerWidget = new MarkerWidget(container, this.markersViewState, this.actionItemProvider, this.instantiationService);
		return data;
	}

	renderElement(node: ITreeNode<Marker, MarkerFilterData>, _: number, templateData: IMarkerTemplateData): void {
		templateData.markerWidget.render(node.element, node.filterData);
	}

	disposeTemplate(templateData: IMarkerTemplateData): void {
		templateData.markerWidget.dispose();
	}

}

class MarkerWidget extends Disposable {

	private readonly actionBar: ActionBar;
	private readonly icon: HTMLElement;
	private readonly multilineActionbar: ActionBar;
	private readonly messageAndDetailsContainer: HTMLElement;
	private disposables: IDisposable[] = [];

	constructor(
		parent: HTMLElement,
		private readonly markersViewState: MarkersViewState,
		actionItemProvider: IActionItemProvider,
		private instantiationService: IInstantiationService
	) {
		super();
		this.actionBar = this._register(new ActionBar(dom.append(parent, dom.$('.actions')), { actionItemProvider }));
		this.icon = dom.append(parent, dom.$('.icon'));
		this.multilineActionbar = this._register(new ActionBar(dom.append(parent, dom.$('.multiline-actions')), { actionItemProvider }));
		this.messageAndDetailsContainer = dom.append(parent, dom.$('.marker-message-details'));
		this._register(toDisposable(() => this.disposables = dispose(this.disposables)));
	}

	render(element: Marker, filterData: MarkerFilterData): void {
		this.actionBar.clear();
		this.multilineActionbar.clear();
		if (this.disposables.length) {
			this.disposables = dispose(this.disposables);
		}
		dom.clearNode(this.messageAndDetailsContainer);

		this.renderQuickfixActionbar(element);
		this.icon.className = 'marker-icon ' + MarkerWidget.iconClassNameFor(element.marker);
		this.renderMultilineActionbar(element);

		this.renderMessageAndDetails(element, filterData);
	}

	private renderQuickfixActionbar(marker: Marker): void {
		const quickFixAction = this.instantiationService.createInstance(QuickFixAction, marker);
		this.actionBar.push([quickFixAction], { icon: true, label: false });
		dom.toggleClass(this.icon, 'quickFix', quickFixAction.enabled);
		quickFixAction.onDidChange(({ enabled }) => {
			if (!isUndefinedOrNull(enabled)) {
				dom.toggleClass(this.icon, 'quickFix', enabled);
			}
		}, this, this.disposables);
	}

	private renderMultilineActionbar(marker: Marker): void {
		const viewState = this.markersViewState.getViewState(marker);
		const multiline = viewState && viewState.multiline;
		const action = new Action('problems.action.toggleMultiline');
		action.enabled = viewState && marker.lines.length > 1;
		action.tooltip = multiline ? localize('single line', "Show message in single line") : localize('multi line', "Show message in multiple lines");
		action.class = multiline ? 'octicon octicon-chevron-up' : 'octicon octicon-chevron-down';
		action.run = () => { if (viewState) { viewState.multiline = !viewState.multiline; } return Promise.resolve(); };
		this.multilineActionbar.push([action], { icon: true, label: false });
	}

	private renderMessageAndDetails(element: Marker, filterData: MarkerFilterData) {
		const { marker, lines } = element;
		const viewState = this.markersViewState.getViewState(element);
		const multiline = !viewState || viewState.multiline;
		const lineMatches = filterData && filterData.lineMatches || [];
		const messageContainer = dom.append(this.messageAndDetailsContainer, dom.$('.marker-message'));
		dom.toggleClass(messageContainer, 'multiline', multiline);

		let lastLineElement = messageContainer;
		for (let index = 0; index < lines.length; index++) {
			lastLineElement = dom.append(messageContainer, dom.$('.marker-message-line'));
			const highlightedLabel = new HighlightedLabel(lastLineElement, false);
			highlightedLabel.set(lines[index], lineMatches[index]);
			this.disposables.push(highlightedLabel);
		}
		this.renderDetails(marker, filterData, multiline ? lastLineElement : this.messageAndDetailsContainer);
	}

	private renderDetails(marker: IMarker, filterData: MarkerFilterData, parent: HTMLElement): void {
		dom.addClass(parent, 'details-container');
		const sourceMatches = filterData && filterData.sourceMatches || [];
		const codeMatches = filterData && filterData.codeMatches || [];

		const source = new HighlightedLabel(dom.append(parent, dom.$('')), false);
		source.set(marker.source, sourceMatches);
		dom.toggleClass(source.element, 'marker-source', !!marker.source);

		const code = new HighlightedLabel(dom.append(parent, dom.$('')), false);
		code.set(marker.code, codeMatches);
		dom.toggleClass(code.element, 'marker-code', !!marker.code);

		const lnCol = dom.append(parent, dom.$('span.marker-line'));
		lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(marker.startLineNumber, marker.startColumn);

		this.disposables.push(...[source, code]);
	}

	private static iconClassNameFor(element: IMarker): string {
		switch (element.severity) {
			case MarkerSeverity.Hint:
				return 'info';
			case MarkerSeverity.Info:
				return 'info';
			case MarkerSeverity.Warning:
				return 'warning';
			case MarkerSeverity.Error:
				return 'error';
		}
		return '';
	}
}

export class RelatedInformationRenderer implements ITreeRenderer<RelatedInformation, RelatedInformationFilterData, IRelatedInformationTemplateData> {

	constructor(
		@ILabelService private readonly labelService: ILabelService
	) { }

	templateId = TemplateId.RelatedInformation;

	renderTemplate(container: HTMLElement): IRelatedInformationTemplateData {
		const data: IRelatedInformationTemplateData = Object.create(null);

		dom.append(container, dom.$('.actions'));
		dom.append(container, dom.$('.icon'));

		data.resourceLabel = new HighlightedLabel(dom.append(container, dom.$('.related-info-resource')), false);
		data.lnCol = dom.append(container, dom.$('span.marker-line'));

		const separator = dom.append(container, dom.$('span.related-info-resource-separator'));
		separator.textContent = ':';
		separator.style.paddingRight = '4px';

		data.description = new HighlightedLabel(dom.append(container, dom.$('.marker-description')), false);
		return data;
	}

	renderElement(node: ITreeNode<RelatedInformation, RelatedInformationFilterData>, _: number, templateData: IRelatedInformationTemplateData): void {
		const relatedInformation = node.element.raw;
		const uriMatches = node.filterData && node.filterData.uriMatches || [];
		const messageMatches = node.filterData && node.filterData.messageMatches || [];

		templateData.resourceLabel.set(paths.basename(relatedInformation.resource.fsPath), uriMatches);
		templateData.resourceLabel.element.title = this.labelService.getUriLabel(relatedInformation.resource, { relative: true });
		templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(relatedInformation.startLineNumber, relatedInformation.startColumn);
		templateData.description.set(relatedInformation.message, messageMatches);
		templateData.description.element.title = relatedInformation.message;
	}

	disposeTemplate(templateData: IRelatedInformationTemplateData): void {
		templateData.description.dispose();
		templateData.resourceLabel.dispose();
	}
}

export class Filter implements ITreeFilter<TreeElement, FilterData> {

	options = new FilterOptions();

	filter(element: TreeElement, parentVisibility: TreeVisibility): TreeFilterResult<FilterData> {
		if (element instanceof ResourceMarkers) {
			return this.filterResourceMarkers(element);
		} else if (element instanceof Marker) {
			return this.filterMarker(element, parentVisibility);
		} else {
			return this.filterRelatedInformation(element, parentVisibility);
		}
	}

	private filterResourceMarkers(resourceMarkers: ResourceMarkers): TreeFilterResult<FilterData> {
		if (resourceMarkers.resource.scheme === network.Schemas.walkThrough || resourceMarkers.resource.scheme === network.Schemas.walkThroughSnippet) {
			return false;
		}

		if (this.options.excludePattern && !!this.options.excludePattern(resourceMarkers.resource.fsPath)) {
			return false;
		}

		const uriMatches = FilterOptions._filter(this.options.textFilter, paths.basename(resourceMarkers.resource.fsPath));

		if (this.options.textFilter && uriMatches) {
			return { visibility: true, data: { type: FilterDataType.ResourceMarkers, uriMatches } };
		}

		if (this.options.includePattern && this.options.includePattern(resourceMarkers.resource.fsPath)) {
			return true;
		}

		return TreeVisibility.Recurse;
	}

	private filterMarker(marker: Marker, parentVisibility: TreeVisibility): TreeFilterResult<FilterData> {
		if (this.options.filterErrors && MarkerSeverity.Error === marker.marker.severity) {
			return true;
		}

		if (this.options.filterWarnings && MarkerSeverity.Warning === marker.marker.severity) {
			return true;
		}

		if (this.options.filterInfos && MarkerSeverity.Info === marker.marker.severity) {
			return true;
		}

		if (!this.options.textFilter) {
			return true;
		}

		const lineMatches: IMatch[][] = [];
		for (const line of marker.lines) {
			lineMatches.push(FilterOptions._messageFilter(this.options.textFilter, line) || []);
		}
		const sourceMatches = marker.marker.source && FilterOptions._filter(this.options.textFilter, marker.marker.source);
		const codeMatches = marker.marker.code && FilterOptions._filter(this.options.textFilter, marker.marker.code);

		if (sourceMatches || codeMatches || lineMatches.some(lineMatch => lineMatch.length > 0)) {
			return { visibility: true, data: { type: FilterDataType.Marker, lineMatches, sourceMatches: sourceMatches || [], codeMatches: codeMatches || [] } };
		}

		return parentVisibility;
	}

	private filterRelatedInformation(relatedInformation: RelatedInformation, parentVisibility: TreeVisibility): TreeFilterResult<FilterData> {
		if (!this.options.textFilter) {
			return true;
		}

		const uriMatches = FilterOptions._filter(this.options.textFilter, paths.basename(relatedInformation.raw.resource.fsPath));
		const messageMatches = FilterOptions._messageFilter(this.options.textFilter, paths.basename(relatedInformation.raw.message));

		if (uriMatches || messageMatches) {
			return { visibility: true, data: { type: FilterDataType.RelatedInformation, uriMatches: uriMatches || [], messageMatches: messageMatches || [] } };
		}

		return parentVisibility;
	}
}

export class MarkerViewState extends Disposable {

	private readonly _onDidChangeViewState: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeViewState: Event<void> = this._onDidChangeViewState.event;

	private _multiline: boolean = true;
	get multiline(): boolean {
		return this._multiline;
	}

	set multiline(value: boolean) {
		if (this._multiline !== value) {
			this._multiline = value;
			this._onDidChangeViewState.fire();
		}
	}
}

export class MarkersViewState extends Disposable {

	private readonly _onDidChangeViewState: Emitter<Marker | undefined> = this._register(new Emitter<Marker | undefined>());
	readonly onDidChangeViewState: Event<Marker | undefined> = this._onDidChangeViewState.event;

	private readonly markersViewStates: Map<string, { viewState: MarkerViewState, disposables: IDisposable[] }> = new Map<string, { viewState: MarkerViewState, disposables: IDisposable[] }>();
	private readonly markersPerResource: Map<string, Marker[]> = new Map<string, Marker[]>();

	private bulkUpdate: boolean = false;

	constructor(multiline: boolean = true) {
		super();
		this._multiline = multiline;
	}

	add(marker: Marker): void {
		if (!this.markersViewStates.has(marker.hash)) {
			const disposables: IDisposable[] = [];
			const viewState = new MarkerViewState();
			viewState.multiline = this.multiline;
			viewState.onDidChangeViewState(() => {
				if (!this.bulkUpdate) {
					this._onDidChangeViewState.fire(marker);
				}
			}, this, disposables);
			this.markersViewStates.set(marker.hash, { viewState, disposables });

			const markers = this.markersPerResource.get(marker.resource.toString()) || [];
			markers.push(marker);
			this.markersPerResource.set(marker.resource.toString(), markers);
		}
	}

	remove(resource: URI): void {
		const markers = this.markersPerResource.get(resource.toString()) || [];
		for (const marker of markers) {
			const value = this.markersViewStates.get(marker.hash);
			if (value) {
				dispose(value.disposables);
			}
			this.markersViewStates.delete(marker.hash);
		}
		this.markersPerResource.delete(resource.toString());
	}

	getViewState(marker: Marker): MarkerViewState | null {
		const value = this.markersViewStates.get(marker.hash);
		return value ? value.viewState : null;
	}

	private _multiline: boolean = true;
	get multiline(): boolean {
		return this._multiline;
	}

	set multiline(value: boolean) {
		let changed = false;
		if (this._multiline !== value) {
			this._multiline = value;
			changed = true;
		}
		this.bulkUpdate = true;
		this.markersViewStates.forEach(({ viewState }) => {
			if (viewState.multiline !== value) {
				viewState.multiline = value;
				changed = true;
			}
		});
		this.bulkUpdate = false;
		if (changed) {
			this._onDidChangeViewState.fire(undefined);
		}
	}

	dispose(): void {
		this.markersViewStates.forEach(({ disposables }) => dispose(disposables));
		this.markersViewStates.clear();
		this.markersPerResource.clear();
		super.dispose();
	}

}