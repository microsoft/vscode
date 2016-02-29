/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/errorList';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import lifecycle = require('vs/base/common/lifecycle');
import Severity from 'vs/base/common/severity';
import builder = require('vs/base/browser/builder');
import { append, addClass, emmet as $ } from 'vs/base/browser/dom';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IRenderer, IDelegate } from 'vs/base/browser/ui/list/list';
import { IMarkerService, IMarker } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Panel } from 'vs/workbench/browser/panel';
import { ERROR_LIST_PANEL_ID } from 'vs/workbench/parts/errorList/browser/errorListConstants';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

interface IMarkerTemplateData {
	icon: HTMLElement;
	label: HTMLElement;
	location: HTMLElement;
}

class Renderer implements IRenderer<IMarker, IMarkerTemplateData> {

	get templateId(): string {
		return 'errorListItem';
	}

	renderTemplate(container: HTMLElement): IMarkerTemplateData {
		const data = <IMarkerTemplateData>Object.create(null);

		data.icon = append(container, $('.icon'));
		data.label = append(container, $('span.label'));
		data.location = append(container, $('.location'));

		return data;
	}

	disposeTemplate(templateData: IMarkerTemplateData): void {
		// Nothing to do here
	}

	renderElement(element: IMarker, index: number, templateData: IMarkerTemplateData): void {
		templateData.icon.className = 'icon ' + Renderer.iconClassNameFor(element);
		templateData.label.textContent = element.message;
		templateData.location.textContent = `${ paths.basename(element.resource.fsPath) }:${ element.startLineNumber }:${ element.startColumn }`;
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

class Delegate implements IDelegate<IMarker> {

	constructor(private listProvider: () => List<IMarker>) { }

	getHeight(element: IMarker): number {
		return 22;
	}

	getTemplateId(element: IMarker): string {
		return 'errorListItem';
	}
}

export class ErrorList extends Panel {

	private toDispose: lifecycle.IDisposable[];
	private list: List<IMarker>;
	private delegate: IDelegate<IMarker>;

	constructor(
		@IMarkerService private markerService: IMarkerService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(ERROR_LIST_PANEL_ID, telemetryService);

		this.toDispose = [];
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);

		addClass(parent.getHTMLElement(), 'new-error-list');

		let renderer: IRenderer<IMarker, IMarkerTemplateData> = new Renderer();

		this.delegate = new Delegate(() => this.list);
		this.list = new List(parent.getHTMLElement(), this.delegate, [renderer]);

		this.toDispose.push(this.markerService.onMarkerChanged((changedResources) => {
			this.onMarkersChanged();
		}));
		this.toDispose.push(this.list.onSelectionChange((e) => {
			if (!e.elements.length) {
				return;
			}
			let el = e.elements[0];
			this.editorService.openEditor({
				resource: el.resource,
				options: {
					selection: {
						startLineNumber: el.startLineNumber,
						startColumn: el.startColumn,
						endLineNumber: el.endLineNumber,
						endColumn: el.endColumn
					}
				}
			}).done(null, errors.onUnexpectedError);
		}));
		this.onMarkersChanged();

		return TPromise.as(null);
	}

	private onMarkersChanged(): void {
		let allMarkers = this.markerService.read().slice(0);

		allMarkers.sort((a, b) => {
			if (a.severity === b.severity) {
				let aRes = a.resource.toString();
				let bRes = b.resource.toString();
				if (aRes === bRes) {
					if (a.startLineNumber === b.startLineNumber) {
						return a.startColumn - b.startColumn;
					}
					return a.startLineNumber - b.startLineNumber;
				}
				if (aRes < bRes) {
					return -1;
				}
				if (aRes > bRes) {
					return 1;
				}
			}
			return b.severity - a.severity;
		});

		this.list.splice(0, this.list.length, ...allMarkers);
	}

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
		this.list.dispose();
		super.dispose();
	}

	public layout(dimension: builder.Dimension): void {
		this.list.layout(dimension.height);
	}
}
