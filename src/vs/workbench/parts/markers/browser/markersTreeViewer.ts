/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import * as network from 'vs/base/common/network';
import { IDataSource, ITree, IRenderer, IAccessibilityProvider, ISorter, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { IActionRunner } from 'vs/base/common/actions';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel, ResourceLabel } from 'vs/workbench/browser/labels';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IMarker } from 'vs/platform/markers/common/markers';
import { MarkersModel, Resource, Marker } from 'vs/workbench/parts/markers/common/markersModel';
import Messages from 'vs/workbench/parts/markers/common/messages';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

interface IAnyResourceTemplateData {
	count: CountBadge;
}

interface IResourceTemplateData extends IAnyResourceTemplateData {
	resourceLabel: ResourceLabel;
}

interface IFileResourceTemplateData extends IAnyResourceTemplateData {
	fileLabel: FileLabel;
}

interface IMarkerTemplateData {
	icon: HTMLElement;
	source: HighlightedLabel;
	description: HighlightedLabel;
	lnCol: HTMLElement;
}

export class DataSource implements IDataSource {
	public getId(tree: ITree, element: any): string {
		if (element instanceof MarkersModel) {
			return 'root';
		}
		if (element instanceof Resource) {
			return element.uri.toString();
		}
		if (element instanceof Marker) {
			return (<Marker>element).id;
		}
		return '';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof MarkersModel || element instanceof Resource;
	}

	public getChildren(tree: ITree, element: any): Promise {
		if (element instanceof MarkersModel) {
			return TPromise.as((<MarkersModel>element).filteredResources);
		}
		if (element instanceof Resource) {
			return TPromise.as(element.markers);
		}
		return null;
	}

	public getParent(tree: ITree, element: any): Promise {
		return TPromise.as(null);
	}
}

export class Renderer implements IRenderer {

	private static RESOURCE_TEMPLATE_ID = 'resource-template';
	private static FILE_RESOURCE_TEMPLATE_ID = 'file-resource-template';
	private static MARKER_TEMPLATE_ID = 'marker-template';

	constructor(private actionRunner: IActionRunner,
		private actionProvider: IActionProvider,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof Resource) {
			if ((<Resource>element).uri.scheme === network.Schemas.file || (<Resource>element).uri.scheme === network.Schemas.untitled) {
				return Renderer.FILE_RESOURCE_TEMPLATE_ID;
			} else {
				return Renderer.RESOURCE_TEMPLATE_ID;
			}
		}
		if (element instanceof Marker) {
			return Renderer.MARKER_TEMPLATE_ID;
		}
		return '';
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		dom.addClass(container, 'markers-panel-tree-entry');
		switch (templateId) {
			case Renderer.FILE_RESOURCE_TEMPLATE_ID:
				return this.renderFileResourceTemplate(container);
			case Renderer.RESOURCE_TEMPLATE_ID:
				return this.renderResourceTemplate(container);
			case Renderer.MARKER_TEMPLATE_ID:
				return this.renderMarkerTemplate(container);
		}
	}

	private renderFileResourceTemplate(container: HTMLElement): IFileResourceTemplateData {
		var data: IFileResourceTemplateData = Object.create(null);
		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.fileLabel = this.instantiationService.createInstance(FileLabel, resourceLabelContainer, { supportHighlights: true });

		const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);

		return data;
	}

	private renderResourceTemplate(container: HTMLElement): IResourceTemplateData {
		var data: IResourceTemplateData = Object.create(null);
		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.resourceLabel = this.instantiationService.createInstance(ResourceLabel, resourceLabelContainer, { supportHighlights: true });

		const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);

		return data;
	}

	private renderMarkerTemplate(container: HTMLElement): IMarkerTemplateData {
		var data: IMarkerTemplateData = Object.create(null);
		data.icon = dom.append(container, dom.$('.marker-icon'));
		data.source = new HighlightedLabel(dom.append(container, dom.$('')));
		data.description = new HighlightedLabel(dom.append(container, dom.$('.marker-description')));
		data.lnCol = dom.append(container, dom.$('span.marker-line'));
		return data;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		switch (templateId) {
			case Renderer.FILE_RESOURCE_TEMPLATE_ID:
			case Renderer.RESOURCE_TEMPLATE_ID:
				return this.renderResourceElement(tree, <Resource>element, templateData);
			case Renderer.MARKER_TEMPLATE_ID:
				return this.renderMarkerElement(tree, (<Marker>element), templateData);
		}
	}

	private renderResourceElement(tree: ITree, element: Resource, templateData: IAnyResourceTemplateData) {
		if ((<IFileResourceTemplateData>templateData).fileLabel) {
			(<IFileResourceTemplateData>templateData).fileLabel.setFile(element.uri, { matches: element.matches });
		} else if ((<IResourceTemplateData>templateData).resourceLabel) {
			(<IResourceTemplateData>templateData).resourceLabel.setLabel({ name: element.name, description: element.uri.toString(), resource: element.uri }, { matches: element.matches });
		}
		templateData.count.setCount(element.markers.length);
	}

	private renderMarkerElement(tree: ITree, element: Marker, templateData: IMarkerTemplateData) {
		let marker = element.marker;
		templateData.icon.className = 'icon ' + Renderer.iconClassNameFor(marker);
		templateData.description.set(marker.message, element.labelMatches);
		templateData.description.element.title = marker.message;

		dom.toggleClass(templateData.source.element, 'marker-source', !!marker.source);
		templateData.source.set(marker.source, element.sourceMatches);

		templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(marker.startLineNumber, marker.startColumn);
	}

	private static iconClassNameFor(element: IMarker): string {
		switch (element.severity) {
			case Severity.Ignore:
				return 'info';
			case Severity.Info:
				return 'info';
			case Severity.Warning:
				return 'warning';
			case Severity.Error:
				return 'error';
		}
		return '';
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		if (templateId === Renderer.FILE_RESOURCE_TEMPLATE_ID) {
			(<IFileResourceTemplateData>templateData).fileLabel.dispose();
		}
		if (templateId === Renderer.RESOURCE_TEMPLATE_ID) {
			(<IResourceTemplateData>templateData).resourceLabel.dispose();
		}
	}
}

export class MarkersTreeAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Resource) {
			return Messages.MARKERS_TREE_ARIA_LABEL_RESOURCE(element.name, element.markers.length);
		}
		if (element instanceof Marker) {
			return Messages.MARKERS_TREE_ARIA_LABEL_MARKER(element.marker);
		}
		return null;
	}

}

export class Sorter implements ISorter {

	public compare(tree: ITree, element: any, otherElement: any): number {
		return MarkersModel.compare(element, otherElement);
	}

}