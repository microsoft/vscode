/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as winjs from 'vs/base/common/winjs.base';
import * as paths from 'vs/base/common/paths';
import dom = require('vs/base/browser/dom');
import { IMarker } from 'vs/platform/markers/common/markers';
import tree = require('vs/base/parts/tree/browser/tree');
import { Marker, Resource } from 'vs/workbench/parts/markers/common/MarkersModel';
import Severity from 'vs/base/common/severity';

var $ = dom.emmet;

interface IResourceTemplateData {
	name: HTMLElement;
	location: HTMLElement;
}

interface IMarkerTemplateData {
	icon: HTMLElement;
	label: HTMLElement;
}

export class DataSource implements tree.IDataSource {
	public getId(tree: tree.ITree, element: any): string {
		if (element instanceof Resource) {
			return 'resource' + (<Resource>element).uri.toString();
		}
		if (element instanceof Marker) {
			return (<Marker>element).id;
		}
		return 'root';
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		return !(element instanceof Marker);
	}

	public getChildren(tree: tree.ITree, element: any): winjs.Promise {
		if (element instanceof Resource) {
			return winjs.TPromise.as((<Resource>element).markers);
		}
		return winjs.TPromise.as(element['resources']);
	}

	public getParent(tree: tree.ITree, element: any): winjs.Promise {
		return winjs.TPromise.as(null);
	}
}

export class Renderer implements tree.IRenderer {
	constructor(
	) {
	}

	public getHeight(tree:tree.ITree, element:any): number {
		return 22;
	}

	public getTemplateId(tree:tree.ITree, element:any): string {
		if (element instanceof Resource) {
			return 'resource';
		}
		return 'marker';
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		if ('resource' === templateId) {
			return this.renderResourceTemplate(container);
		} else {
			return this.renderMarkerTemplate(container);
		}
	}

	private renderResourceTemplate(container: HTMLElement): IResourceTemplateData {
		var data: IResourceTemplateData = Object.create(null);
		data.name = dom.append(container, $('span.label'));
		data.location = dom.append(container, $('.location'));
		return data;
	}

	private renderMarkerTemplate(container: HTMLElement): IMarkerTemplateData {
		var data: IMarkerTemplateData = Object.create(null);
		data.icon = dom.append(container, $('.marker-icon'));
		data.label = dom.append(container, $('span.label'));
		return data;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		if ('resource' === templateId) {
			return this.renderResourceElement(tree, <Resource> element, templateData);
		} else {
			return this.renderMarkerElement(tree, (<Marker>element).marker, templateData);
		}
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
	}

	private renderResourceElement(tree: tree.ITree, element: Resource, templateData: IResourceTemplateData) {
		templateData.name.textContent = paths.basename(element.uri.fsPath);
		templateData.location.textContent = element.uri.path;
	}

	private renderMarkerElement(tree: tree.ITree, element: IMarker, templateData: IMarkerTemplateData) {
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
}