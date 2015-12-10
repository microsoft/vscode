/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/markerHandler';
import {TPromise} from 'vs/base/common/winjs.base';
import env = require('vs/base/common/platform');
import strings = require('vs/base/common/strings');
import network = require('vs/base/common/network');
import errors = require('vs/base/common/errors');
import paths = require('vs/base/common/paths');
import dom = require('vs/base/browser/dom');
import {PathLabelProvider} from 'vs/base/common/labels';
import nls = require('vs/nls');
import {ITree, IElementCallback} from 'vs/base/parts/tree/common/tree';
import severity from 'vs/base/common/severity';
import {QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {QuickOpenAction} from 'vs/workbench/browser/actions/quickOpenAction';
import {Mode, IContext, IAutoFocus} from 'vs/base/parts/quickopen/browser/quickOpen';
import {QuickOpenEntry, QuickOpenEntryItem, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {Registry} from 'vs/platform/platform';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/browser/actionRegistry';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMarkerService, IMarker} from 'vs/platform/markers/common/markers';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/browser/quickOpenService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

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
		elements.push('<div class="inline">');
		elements.push(strings.format('<div class="severity {0}"></div>', severity.toString(this._marker.severity).toLowerCase()));
		elements.push('</div>');
		elements.push('<div class="inline entry">');
		elements.push('<div>');
		elements.push(strings.format('<span class="message">{0}</span>', this._marker.message));
		elements.push('</div>');
		elements.push('<div>');
		elements.push(strings.format('<span class="path"><span class="basename">{0} ({1},{2})</span><span class="dirname">{3}</span></span>',
			paths.basename(this._marker.resource.fsPath), this._marker.startLineNumber, this._marker.startColumn, this._lp.getLabel(paths.dirname(this._marker.resource.fsPath))
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
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
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

		// 1st: severity matters first
		ret = severity.compare(a.severity, b.severity);
		if (ret !== 0) {
			return ret;
		}

		// 2nd: file name matters for equal severity
		ret = strings.localeCompare(a.resource.fsPath, b.resource.fsPath);
		if (ret !== 0) {
			return ret;
		}

		// 3rd: start line matters
		ret = a.startLineNumber - b.startLineNumber;
		if (ret !== 0) {
			return ret;
		}

		// 4th: start column matters
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
				severity.toString(marker.severity),
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