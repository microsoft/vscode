/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, Promise} from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import {IDataSource, ITree, IRenderer} from 'vs/base/parts/tree/browser/tree';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IActionRunner } from 'vs/base/common/actions';
import Severity from 'vs/base/common/severity';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import { ActionProvider } from 'vs/workbench/parts/markers/browser/MarkersActionProvider';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel } from 'vs/base/browser/ui/fileLabel/fileLabel';
import { IMarker } from 'vs/platform/markers/common/markers';
import { Marker, Resource } from 'vs/workbench/parts/markers/common/MarkersModel';

interface IResourceTemplateData {
	file: FileLabel;
	count: CountBadge;
	actionBar: ActionBar;
}

interface IMarkerTemplateData {
	icon: HTMLElement;
	label: HTMLElement;
}

export class DataSource implements IDataSource {
	public getId(tree: ITree, element: any): string {
		if (element instanceof Resource) {
			return 'resource' + (<Resource>element).uri.toString();
		}
		if (element instanceof Marker) {
			return (<Marker>element).id;
		}
		return 'root';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return !(element instanceof Marker);
	}

	public getChildren(tree: ITree, element: any): Promise {
		if (element instanceof Resource) {
			return TPromise.as((<Resource>element).markers);
		}
		return TPromise.as(element['resources']);
	}

	public getParent(tree: ITree, element: any): Promise {
		return TPromise.as(null);
	}
}

export class Renderer implements IRenderer {

	constructor(private actionRunner: IActionRunner,
				private actionProvider:ActionProvider,
				@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
	}

	public getHeight(tree:ITree, element:any): number {
		return 22;
	}

	public getTemplateId(tree:ITree, element:any): string {
		if (element instanceof Resource) {
			return 'resource';
		}
		return 'marker';
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if ('resource' === templateId) {
			return this.renderResourceTemplate(container);
		} else {
			return this.renderMarkerTemplate(container);
		}
	}

	private renderResourceTemplate(container: HTMLElement): IResourceTemplateData {
		var data: IResourceTemplateData = Object.create(null);
		data.file = new FileLabel(container, null, this.contextService);

		const badgeWrapper = dom.append(container, dom.emmet('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);

		data.actionBar = new ActionBar(container, { actionRunner: this.actionRunner });
		data.actionBar.push(this.actionProvider.getActionsForResource(), { icon: true, label: false });
		return data;
	}

	private renderMarkerTemplate(container: HTMLElement): IMarkerTemplateData {
		var data: IMarkerTemplateData = Object.create(null);
		data.icon = dom.append(container, dom.emmet('.marker-icon'));
		data.label = dom.append(container, dom.emmet('span.label'));
		return data;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if ('resource' === templateId) {
			return this.renderResourceElement(tree, <Resource> element, templateData);
		} else {
			return this.renderMarkerElement(tree, (<Marker>element).marker, templateData);
		}
	}

	private renderResourceElement(tree: ITree, element: Resource, templateData: IResourceTemplateData) {
		templateData.file.setValue(element.uri);
		templateData.count.setCount(10);
		templateData.actionBar.context= {
			tree: tree,
			element: element
		};
	}

	private renderMarkerElement(tree: ITree, element: IMarker, templateData: IMarkerTemplateData) {
		templateData.icon.className = 'icon ' + Renderer.iconClassNameFor(element);
		templateData.label.textContent = element.message;
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
	}
}