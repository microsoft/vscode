/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import * as network from 'vs/base/common/network';
import { IDataSource, ITree, IRenderer, IAccessibilityProvider, IFilter } from 'vs/base/parts/tree/browser/tree';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel, ResourceLabel } from 'vs/workbench/browser/labels';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IMarker, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { MarkersModel, Resource, Marker } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IDisposable } from 'vs/base/common/lifecycle';

interface IAnyResourceTemplateData {
	count: CountBadge;
	styler: IDisposable;
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
	public getId(tree: ITree, element: MarkersModel | Resource | Marker): string {
		if (element instanceof MarkersModel) {
			return 'root';
		}
		if (element instanceof Resource) {
			return element.uri.toString();
		}
		if (element instanceof Marker) {
			return element.id;
		}
		return '';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof MarkersModel || element instanceof Resource;
	}

	public getChildren(tree: ITree, element: MarkersModel | Resource): Promise {
		if (element instanceof MarkersModel) {
			return Promise.as(element.resources);
		}
		if (element instanceof Resource) {
			return Promise.as(element.markers);
		}
		return null;
	}

	public getParent(tree: ITree, element: any): Promise {
		return TPromise.as(null);
	}
}

export class DataFilter implements IFilter {
	public isVisible(tree: ITree, element: Resource | Marker | any): boolean {
		if (element instanceof Resource) {
			return element.filteredMarkersCount > 0;
		}
		if (element instanceof Marker) {
			return element.isSelected;
		}
		return true;
	}
}

export class Renderer implements IRenderer {

	private static readonly RESOURCE_TEMPLATE_ID = 'resource-template';
	private static readonly FILE_RESOURCE_TEMPLATE_ID = 'file-resource-template';
	private static readonly MARKER_TEMPLATE_ID = 'marker-template';

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService
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
		const data: IFileResourceTemplateData = Object.create(null);
		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.fileLabel = this.instantiationService.createInstance(FileLabel, resourceLabelContainer, { supportHighlights: true });

		const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);
		data.styler = attachBadgeStyler(data.count, this.themeService);

		return data;
	}

	private renderResourceTemplate(container: HTMLElement): IResourceTemplateData {
		const data: IResourceTemplateData = Object.create(null);
		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.resourceLabel = this.instantiationService.createInstance(ResourceLabel, resourceLabelContainer, { supportHighlights: true });

		const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);
		data.styler = attachBadgeStyler(data.count, this.themeService);

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
			case Renderer.FILE_RESOURCE_TEMPLATE_ID:
			case Renderer.RESOURCE_TEMPLATE_ID:
				return this.renderResourceElement(tree, <Resource>element, templateData);
			case Renderer.MARKER_TEMPLATE_ID:
				return this.renderMarkerElement(tree, (<Marker>element), templateData);
		}
	}

	private renderResourceElement(tree: ITree, element: Resource, templateData: IAnyResourceTemplateData) {
		if ((<IFileResourceTemplateData>templateData).fileLabel) {
			(<IFileResourceTemplateData>templateData).fileLabel.setFile(element.uri, { matches: element.uriMatches });
		} else if ((<IResourceTemplateData>templateData).resourceLabel) {
			(<IResourceTemplateData>templateData).resourceLabel.setLabel({ name: element.name, description: element.uri.toString(), resource: element.uri }, { matches: element.uriMatches });
		}
		templateData.count.setCount(element.filteredMarkersCount);
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
		if (templateId === Renderer.FILE_RESOURCE_TEMPLATE_ID) {
			(<IFileResourceTemplateData>templateData).fileLabel.dispose();
			(<IFileResourceTemplateData>templateData).styler.dispose();
		} else if (templateId === Renderer.RESOURCE_TEMPLATE_ID) {
			(<IResourceTemplateData>templateData).resourceLabel.dispose();
			(<IResourceTemplateData>templateData).styler.dispose();
		} else if (templateId === Renderer.MARKER_TEMPLATE_ID) {
			(<IMarkerTemplateData>templateData).description.dispose();
			(<IMarkerTemplateData>templateData).source.dispose();
		}
	}
}

export class MarkersTreeAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Resource) {
			return Messages.MARKERS_TREE_ARIA_LABEL_RESOURCE(element.name, element.filteredMarkersCount);
		}
		if (element instanceof Marker) {
			return Messages.MARKERS_TREE_ARIA_LABEL_MARKER(element.raw);
		}
		return null;
	}
}

