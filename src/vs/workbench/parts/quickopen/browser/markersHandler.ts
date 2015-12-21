/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/markerHandler';
import {TPromise} from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import * as network from 'vs/base/common/network';
import * as errors from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import * as dom from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import {PathLabelProvider} from 'vs/base/common/labels';
import {ITree, IElementCallback} from 'vs/base/parts/tree/common/tree';
import Severity from 'vs/base/common/severity';
import {QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {QuickOpenAction} from 'vs/workbench/browser/actions/quickOpenAction';
import {Mode, IContext, IAutoFocus} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntryItem, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IMarkerService, IMarker} from 'vs/platform/markers/common/markers';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';

class MarkerEntry extends QuickOpenEntryItem {

	private _marker: IMarker;
	private _editorService: IEditorService;
	private _lp: PathLabelProvider;

	constructor(editorService: IEditorService, contextService: IWorkspaceContextService, marker: IMarker) {
		super();
		this._editorService = editorService;
		this._lp = new PathLabelProvider(contextService);
		this._marker = marker;
	}

	public getHeight(): number {
		return 48;
	}

	public render(tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		dom.clearNode(container);
		let elements: string[] = [];
		let {severity, message, source, resource, startLineNumber, startColumn} = this._marker;
		elements.push('<div class="inline">');
		elements.push(strings.format('<div class="severity {0}"></div>', Severity.toString(severity).toLowerCase()));
		elements.push('</div>');
		elements.push('<div class="inline entry">');
		elements.push('<div>');
		if (source) {
			elements.push(strings.format('<span class="source">[{0}]&nbsp;</span>', source));
		}
		elements.push(strings.format('<span class="message">{0}</span>', message));
		elements.push('</div>');
		elements.push('<div>');
		elements.push(strings.format(
			'<span class="path"><span class="basename">{0} ({1},{2})</span><span class="dirname">{3}</span></span>',
			paths.basename(resource.fsPath),
			startLineNumber,
			startColumn,
			this._lp.getLabel(paths.dirname(resource.fsPath))
		));
		elements.push('</div>');
		elements.push('<div>');
		container.innerHTML = elements.join('');
		return null;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode !== Mode.OPEN) {
			return false;
		}

		this._editorService.openEditor({
			resource: this._marker.resource,
			options: {
				selection: {
					startLineNumber: this._marker.startLineNumber,
					startColumn: this._marker.startColumn,
					endLineNumber: this._marker.endLineNumber,
					endColumn: this._marker.endColumn
				}
			}
		}).done(null, errors.onUnexpectedError);

		return true;
	}
}

export class MarkersHandler extends QuickOpenHandler {

	private _markerService: IMarkerService;
	private _editorService: IEditorService;
	private _contextService: IWorkspaceContextService;

	constructor(
		@IMarkerService markerService: IMarkerService,
		@IEditorService editorService: IEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService) {
		super();

		this._markerService = markerService;
		this._editorService = editorService;
		this._contextService = contextService;
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		let markers = this._markerService.read({ take: 500 });

		return TPromise.as(new QuickOpenModel(
			markers
				.sort(MarkersHandler._sort)
				.filter(marker => this._filter(marker, searchValue))
				.map(marker => new MarkerEntry(this._editorService, this._contextService, marker))
		));
	}

	private static _sort(a: IMarker, b: IMarker): number {
		let ret: number;

		// severity matters first
		ret = Severity.compare(a.severity, b.severity);
		if (ret !== 0) {
			return ret;
		}

		// source matters
		if (a.source && b.source) {
			ret = a.source.localeCompare(b.source);
			if (ret !== 0) {
				return ret;
			}
		}

		// file name matters for equal severity
		ret = strings.localeCompare(a.resource.fsPath, b.resource.fsPath);
		if (ret !== 0) {
			return ret;
		}

		// start line matters
		ret = a.startLineNumber - b.startLineNumber;
		if (ret !== 0) {
			return ret;
		}

		// start column matters
		ret = a.startColumn - b.startColumn;
		if (ret !== 0) {
			return ret;
		}

		return 0;
	}

	private _filter(marker: IMarker, query: string): boolean {

		if (marker.resource.scheme === network.schemas.inMemory) {
			// ignore inmemory-models
			return false;
		}

		let regexp = new RegExp(strings.convertSimple2RegExpPattern(query), 'i'),
			inputs = [
				marker.message,
				marker.resource.fsPath,
				Severity.toString(marker.severity),
				String(marker.startLineNumber), String(marker.startColumn), String(marker.endLineNumber), String(marker.endColumn)];

		return inputs.some(input => regexp.test(input));
	}

	public getClass(): string {
		return 'marker-handler';
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue
		};
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noErrorsAndWarningsMatching', "No errors or warnings matching");
		}
		return nls.localize('noErrorsAndWarnings', "No errors or warnings");
	}

}

export class GotoMarkerAction extends QuickOpenAction {

	static Prefix = '!';
	static Id = 'workbench.action.showErrorsWarnings';
	static Label = nls.localize('label', "Show Errors and Warnings");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, GotoMarkerAction.Prefix, quickOpenService);
	}
}