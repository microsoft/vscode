/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import * as network from 'vs/base/common/network';
import * as paths from 'vs/base/common/paths';
import { IDataSource, ITree, IRenderer, IAccessibilityProvider, IFilter } from 'vs/base/parts/tree/browser/tree';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel, ResourceLabel } from 'vs/workbench/browser/labels';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IMarker, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { MarkersModel, ResourceMarkers, Marker, RelatedInformation, NodeWithId } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { getPathLabel } from 'vs/base/common/labels';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { dirname } from 'vs/base/common/resources';

interface IResourceMarkersTemplateData {
	resourceLabel: ResourceLabel;
	count: CountBadge;
	styler: IDisposable;
}

interface IMarkerTemplateData {
	icon: HTMLElement;
	source: HighlightedLabel;
	description: HighlightedLabel;
	lnCol: HTMLElement;
}

interface IRelatedInformationTemplateData {
	description: HighlightedLabel;
	resourceLabel: IconLabel;
	lnCol: HTMLElement;
}

export class DataSource implements IDataSource {
	public getId(tree: ITree, element: any): string {
		if (element instanceof MarkersModel) {
			return 'root';
		}
		if (element instanceof NodeWithId) {
			return element.id;
		}
		return '';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof MarkersModel || element instanceof ResourceMarkers || (element instanceof Marker && element.resourceRelatedInformation.length > 0);
	}

	public getChildren(tree: ITree, element: any): Promise {
		if (element instanceof MarkersModel) {
			return Promise.as(element.resources);
		}
		if (element instanceof ResourceMarkers) {
			return Promise.as(element.markers);
		}
		if (element instanceof Marker && element.resourceRelatedInformation.length > 0) {
			return Promise.as(element.resourceRelatedInformation);
		}
		return null;
	}

	public getParent(tree: ITree, element: any): Promise {
		return TPromise.as(null);
	}
}

export class DataFilter implements IFilter {
	public isVisible(tree: ITree, element: any): boolean {
		if (element instanceof ResourceMarkers) {
			return element.filteredCount > 0;
		}
		if (element instanceof Marker) {
			return element.isSelected;
		}
		return true;
	}
}

export class Renderer implements IRenderer {

	private static readonly RESOURCE_MARKERS_TEMPLATE_ID = 'resource-markers-template';
	private static readonly FILE_RESOURCE_MARKERS_TEMPLATE_ID = 'file-resource-markers-template';
	private static readonly MARKER_TEMPLATE_ID = 'marker-template';
	private static readonly RELATED_INFO_TEMPLATE_ID = 'related-info-template';

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof ResourceMarkers) {
			if ((element).uri.scheme === network.Schemas.file || (<ResourceMarkers>element).uri.scheme === network.Schemas.untitled) {
				return Renderer.FILE_RESOURCE_MARKERS_TEMPLATE_ID;
			} else {
				return Renderer.RESOURCE_MARKERS_TEMPLATE_ID;
			}
		}
		if (element instanceof Marker) {
			return Renderer.MARKER_TEMPLATE_ID;
		}
		if (element instanceof RelatedInformation) {
			return Renderer.RELATED_INFO_TEMPLATE_ID;
		}
		return '';
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		dom.addClass(container, 'markers-panel-tree-entry');
		switch (templateId) {
			case Renderer.FILE_RESOURCE_MARKERS_TEMPLATE_ID:
				return this.renderFileResourceMarkersTemplate(container);
			case Renderer.RESOURCE_MARKERS_TEMPLATE_ID:
				return this.renderResourceMarkersTemplate(container);
			case Renderer.MARKER_TEMPLATE_ID:
				return this.renderMarkerTemplate(container);
			case Renderer.RELATED_INFO_TEMPLATE_ID:
				return this.renderRelatedInfoTemplate(container);
		}
	}

	private renderFileResourceMarkersTemplate(container: HTMLElement): IResourceMarkersTemplateData {
		const data = <IResourceMarkersTemplateData>Object.create(null);

		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.resourceLabel = this.instantiationService.createInstance(FileLabel, resourceLabelContainer, { supportHighlights: true });

		const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);
		data.styler = attachBadgeStyler(data.count, this.themeService);

		return data;
	}

	private renderResourceMarkersTemplate(container: HTMLElement): IResourceMarkersTemplateData {
		const data = <IResourceMarkersTemplateData>Object.create(null);

		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.resourceLabel = this.instantiationService.createInstance(ResourceLabel, resourceLabelContainer, { supportHighlights: true });

		const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);
		data.styler = attachBadgeStyler(data.count, this.themeService);

		return data;
	}

	private renderRelatedInfoTemplate(container: HTMLElement): IRelatedInformationTemplateData {
		const data: IRelatedInformationTemplateData = Object.create(null);
		data.description = new HighlightedLabel(dom.append(container, dom.$('.marker-description')));

		const separator = dom.append(container, dom.$(''));
		separator.textContent = '-';
		separator.style.padding = '0 4px';

		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.resourceLabel = this.instantiationService.createInstance(IconLabel, resourceLabelContainer, { supportHighlights: true });

		data.lnCol = dom.append(container, dom.$('span.marker-line'));
		return data;
	}

	private renderMarkerTemplate(container: HTMLElement): IMarkerTemplateData {
		const data: IMarkerTemplateData = Object.create(null);
		data.icon = dom.append(container, dom.$('.marker-icon'));
		data.source = new HighlightedLabel(dom.append(container, dom.$('')));
		data.description = new HighlightedLabel(dom.append(container, dom.$('.marker-description')));
		data.lnCol = dom.append(container, dom.$('span.marker-line'));
		return data;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		switch (templateId) {
			case Renderer.FILE_RESOURCE_MARKERS_TEMPLATE_ID:
			case Renderer.RESOURCE_MARKERS_TEMPLATE_ID:
				return this.renderResourceMarkersElement(tree, <ResourceMarkers>element, templateData);
			case Renderer.MARKER_TEMPLATE_ID:
				return this.renderMarkerElement(tree, (<Marker>element), templateData);
			case Renderer.RELATED_INFO_TEMPLATE_ID:
				return this.renderRelatedInfoElement(tree, <RelatedInformation>element, templateData);
		}
	}

	private renderResourceMarkersElement(tree: ITree, element: ResourceMarkers, templateData: IResourceMarkersTemplateData) {
		if (templateData.resourceLabel instanceof FileLabel) {
			templateData.resourceLabel.setFile(element.uri, { matches: element.uriMatches });
		} else {
			templateData.resourceLabel.setLabel({ name: element.name, description: element.uri.toString(), resource: element.uri }, { matches: element.uriMatches });
		}
		(<IResourceMarkersTemplateData>templateData).count.setCount(element.filteredCount);
	}

	private renderMarkerElement(tree: ITree, element: Marker, templateData: IMarkerTemplateData) {
		let marker = element.raw;
		templateData.icon.className = 'icon ' + Renderer.iconClassNameFor(marker);
		templateData.description.set(marker.message, element.messageMatches);
		templateData.description.element.title = marker.message;

		dom.toggleClass(templateData.source.element, 'marker-source', !!marker.source);
		templateData.source.set(marker.source, element.sourceMatches);

		templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(marker.startLineNumber, marker.startColumn);
	}

	private renderRelatedInfoElement(tree: ITree, element: RelatedInformation, templateData: IRelatedInformationTemplateData) {
		templateData.description.set(element.raw.message, element.messageMatches);
		templateData.description.element.title = element.raw.message;
		templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(element.raw.startLineNumber, element.raw.startColumn);
		templateData.resourceLabel.setValue(paths.basename(element.raw.resource.fsPath), getPathLabel(dirname(element.raw.resource), this.contextService, this.environmentService), { matches: element.uriMatches });
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

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		if (templateId === Renderer.RESOURCE_MARKERS_TEMPLATE_ID || templateId === Renderer.FILE_RESOURCE_MARKERS_TEMPLATE_ID) {
			(<IResourceMarkersTemplateData>templateData).resourceLabel.dispose();
			(<IResourceMarkersTemplateData>templateData).styler.dispose();
		} else if (templateId === Renderer.MARKER_TEMPLATE_ID) {
			(<IMarkerTemplateData>templateData).description.dispose();
			(<IMarkerTemplateData>templateData).source.dispose();
		} else if (templateId === Renderer.RELATED_INFO_TEMPLATE_ID) {
			(<IRelatedInformationTemplateData>templateData).description.dispose();
			(<IRelatedInformationTemplateData>templateData).resourceLabel.dispose();
		}
	}
}

export class MarkersTreeAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof ResourceMarkers) {
			return Messages.MARKERS_TREE_ARIA_LABEL_RESOURCE(element.name, element.filteredCount);
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

