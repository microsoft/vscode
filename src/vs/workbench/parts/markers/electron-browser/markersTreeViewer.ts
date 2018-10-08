/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import * as network from 'vs/base/common/network';
import * as paths from 'vs/base/common/paths';
import { IDataSource, ITree, IAccessibilityProvider } from 'vs/base/parts/tree/browser/tree';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel, ResourceLabel } from 'vs/workbench/browser/labels';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IMarker, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { MarkersModel, ResourceMarkers, Marker, RelatedInformation } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ActionBar, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { QuickFixAction } from 'vs/workbench/parts/markers/electron-browser/markersPanelActions';
import { ILabelService } from 'vs/platform/label/common/label';
import { dirname } from 'vs/base/common/resources';
import { IVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer } from 'vs/base/browser/ui/tree/abstractTree';

interface IResourceMarkersTemplateData {
	resourceLabel: ResourceLabel;
	count: CountBadge;
	styler: IDisposable;
}

interface IMarkerTemplateData {
	icon: HTMLElement;
	actionBar: ActionBar;
	source: HighlightedLabel;
	description: HighlightedLabel;
	lnCol: HTMLElement;
	code: HighlightedLabel;
}

interface IRelatedInformationTemplateData {
	resourceLabel: HighlightedLabel;
	lnCol: HTMLElement;
	description: HighlightedLabel;
}

export class DataSource implements IDataSource {
	public getId(tree: ITree, element: any): string {
		if (element instanceof MarkersModel) {
			return 'root';
		}
		// if (element instanceof NodeWithId) {
		// 	return element.id;
		// }
		return '';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof MarkersModel || element instanceof ResourceMarkers || (element instanceof Marker && element.relatedInformation.length > 0);
	}

	public getChildren(tree: ITree, element: any): Promise {
		if (element instanceof MarkersModel) {
			return Promise.as(element.resourceMarkers);
		}
		if (element instanceof ResourceMarkers) {
			return Promise.as(element.markers);
		}
		if (element instanceof Marker && element.relatedInformation.length > 0) {
			return Promise.as(element.relatedInformation);
		}
		return null;
	}

	public getParent(tree: ITree, element: any): Promise {
		return TPromise.as(null);
	}

	public shouldAutoexpand(tree: ITree, element: any): boolean {
		if (element instanceof MarkersModel) {
			return true;
		}

		if (element instanceof ResourceMarkers) {
			return true;
		}

		if (element instanceof Marker && element.relatedInformation.length > 0) {
			return true;
		}

		return false;
	}
}

export class MarkersTreeAccessibilityProvider implements IAccessibilityProvider {

	constructor(
		@ILabelService private labelServie: ILabelService
	) {
	}

	// TODO@joao
	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof ResourceMarkers) {
			const path = this.labelServie.getUriLabel(element.resource, { relative: true }) || element.resource.fsPath;
			return Messages.MARKERS_TREE_ARIA_LABEL_RESOURCE(element.markers.length/* element.filteredCount */, element.name, paths.dirname(path));
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
	FileResourceMarkers = 'frm',
	ResourceMarkers = 'rm',
	Marker = 'm',
	RelatedInformation = 'ri'
}

export class VirtualDelegate implements IVirtualDelegate<ResourceMarkers | Marker | RelatedInformation> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(element: ResourceMarkers | Marker | RelatedInformation): string {
		if (element instanceof ResourceMarkers) {
			if ((element).resource.scheme === network.Schemas.file || (<ResourceMarkers>element).resource.scheme === network.Schemas.untitled) {
				return TemplateId.FileResourceMarkers;
			} else {
				return TemplateId.ResourceMarkers;
			}
		} else if (element instanceof Marker) {
			return TemplateId.Marker;
		} else {
			return TemplateId.RelatedInformation;
		}
	}
}

export class ResourceMarkersRenderer implements ITreeRenderer<ResourceMarkers, IResourceMarkersTemplateData> {

	constructor(
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@ILabelService private labelService: ILabelService
	) { }

	templateId = TemplateId.ResourceMarkers;

	renderTemplate(container: HTMLElement): IResourceMarkersTemplateData {
		const data = <IResourceMarkersTemplateData>Object.create(null);

		const resourceLabelContainer = dom.append(container, dom.$('.resource-label-container'));
		data.resourceLabel = this.createResourceLabel(resourceLabelContainer);

		const badgeWrapper = dom.append(container, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);
		data.styler = attachBadgeStyler(data.count, this.themeService);

		return data;
	}

	// TODO@joao
	renderElement(element: ResourceMarkers, _: number, templateData: IResourceMarkersTemplateData): void {
		if (templateData.resourceLabel instanceof FileLabel) {
			templateData.resourceLabel.setFile(element.resource/* , { matches: element.uriMatches } */);
		} else {
			templateData.resourceLabel.setLabel({ name: element.name, description: this.labelService.getUriLabel(dirname(element.resource), { relative: true }), resource: element.resource }/* , { matches: element.uriMatches } */);
		}

		templateData.count.setCount(element.markers.length/* filteredCount */);
	}

	disposeElement(): void {
		// noop
	}

	disposeTemplate(templateData: IResourceMarkersTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.styler.dispose();
	}

	protected createResourceLabel(container: HTMLElement): ResourceLabel {
		return this.instantiationService.createInstance(ResourceLabel, container, { supportHighlights: true });
	}
}

export class FileResourceMarkersRenderer extends ResourceMarkersRenderer {

	protected createResourceLabel(container: HTMLElement): ResourceLabel {
		return this.instantiationService.createInstance(FileLabel, container, { supportHighlights: true });
	}
}

export class MarkerRenderer implements ITreeRenderer<Marker, IMarkerTemplateData> {

	constructor(
		private actionItemProvider: IActionItemProvider,
		@IInstantiationService protected instantiationService: IInstantiationService
	) { }

	templateId = TemplateId.Marker;

	renderTemplate(container: HTMLElement): IMarkerTemplateData {
		const data: IMarkerTemplateData = Object.create(null);
		const actionsContainer = dom.append(container, dom.$('.actions'));
		data.actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
		data.icon = dom.append(container, dom.$('.icon'));
		data.source = new HighlightedLabel(dom.append(container, dom.$('')));
		data.description = new HighlightedLabel(dom.append(container, dom.$('.marker-description')));
		data.code = new HighlightedLabel(dom.append(container, dom.$('')));
		data.lnCol = dom.append(container, dom.$('span.marker-line'));
		return data;
	}

	// TODO@joao
	renderElement(element: Marker, _: number, templateData: IMarkerTemplateData): void {
		let marker = element.marker;

		templateData.icon.className = 'icon ' + MarkerRenderer.iconClassNameFor(marker);

		templateData.source.set(marker.source/* , element.sourceMatches */);
		dom.toggleClass(templateData.source.element, 'marker-source', !!marker.source);

		templateData.actionBar.clear();
		const quickFixAction = this.instantiationService.createInstance(QuickFixAction, element);
		templateData.actionBar.push([quickFixAction], { icon: true, label: false });

		templateData.description.set(marker.message/* , element.messageMatches */);
		templateData.description.element.title = marker.message;

		dom.toggleClass(templateData.code.element, 'marker-code', !!marker.code);
		templateData.code.set(marker.code || ''/* , element.codeMatches */);

		templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(marker.startLineNumber, marker.startColumn);
	}

	disposeElement(): void {
		// noop
	}

	disposeTemplate(templateData: IMarkerTemplateData): void {
		templateData.description.dispose();
		templateData.source.dispose();
		templateData.actionBar.dispose();
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

export class RelatedInformationRenderer implements ITreeRenderer<RelatedInformation, IRelatedInformationTemplateData> {

	constructor(
		@ILabelService private labelService: ILabelService
	) { }

	templateId = TemplateId.Marker;

	renderTemplate(container: HTMLElement): IRelatedInformationTemplateData {
		const data: IRelatedInformationTemplateData = Object.create(null);

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

	// TODO@joao
	renderElement(element: RelatedInformation, _: number, templateData: IRelatedInformationTemplateData): void {
		templateData.resourceLabel.set(paths.basename(element.raw.resource.fsPath)/* , element.uriMatches */);
		templateData.resourceLabel.element.title = this.labelService.getUriLabel(element.raw.resource, { relative: true });
		templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(element.raw.startLineNumber, element.raw.startColumn);
		templateData.description.set(element.raw.message/* , element.messageMatches */);
		templateData.description.element.title = element.raw.message;
	}

	disposeElement(): void {
		// noop
	}

	disposeTemplate(templateData: IRelatedInformationTemplateData): void {
		templateData.description.dispose();
		templateData.resourceLabel.dispose();
	}
}