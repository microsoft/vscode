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
import * as dom from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import {ICommonCodeEditor, IEditorViewState} from 'vs/editor/common/editorCommon';
import {PathLabelProvider} from 'vs/base/common/labels';
import {ITree, IElementCallback} from 'vs/base/parts/tree/browser/tree';
import Severity from 'vs/base/common/severity';
import {QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {QuickOpenAction} from 'vs/workbench/browser/actions/quickOpenAction';
import {Mode, IContext, IAutoFocus} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntryItem, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IMarkerService, IMarker} from 'vs/platform/markers/common/markers';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IFilter, or, matchesContiguousSubString, matchesPrefix} from 'vs/base/common/filters';
import {HighlightedLabel} from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';

class MarkerEntry extends QuickOpenEntryItem {

	private _editorService: IWorkbenchEditorService;
	private _codeEditorService: ICodeEditorService;
	private _labelProvider: PathLabelProvider;

	private _marker: IMarker;
	private _label: string;
	private _description: string;

	constructor(editorService: IWorkbenchEditorService, codeEditorService: ICodeEditorService, contextService: IWorkspaceContextService, marker: IMarker) {
		super();
		this._editorService = editorService;
		this._codeEditorService = codeEditorService;
		this._labelProvider = new PathLabelProvider(contextService);
		this._marker = marker;

		const {message, source, resource, startLineNumber, startColumn} = marker;
		this._label = source ? nls.localize('marker.msg', '[{0}] {1}', source, message) : message;
		this._description = nls.localize('marker.desc', '{0}({1},{2})', this._labelProvider.getLabel(resource.fsPath), startLineNumber, startColumn);
	}

	private static _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);

	public update(query: string): void {

		if (this._marker.resource.scheme === network.Schemas.inMemory) {
			// ignore inmemory-models
			this.setHidden(true);
			return;
		}

		const labelHighlights = MarkerEntry._filter(query, this._label);
		const descHighlights = MarkerEntry._filter(query, this._description);
		this.setHighlights(labelHighlights, descHighlights);
		this.setHidden(!labelHighlights && !descHighlights);
	}

	public getAriaLabel(): string {
		return nls.localize('markerAriaLabel', "{0}, errors and warnings", this._label);
	}

	public getHeight(): number {
		return 48;
	}

	public render(tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		dom.clearNode(container);

		let [labelHighlights, descHighlights] = this.getHighlights();
		const row1 = document.createElement('div');
		dom.addClass(row1, 'row');
		const row2 = document.createElement('div');
		dom.addClass(row2, 'row');

		// fill first row with icon and label
		const icon = document.createElement('div');
		dom.addClass(icon, `severity ${Severity.toString(this._marker.severity).toLowerCase()}`);
		row1.appendChild(icon);
		const labelContainer = document.createElement('div');
		dom.addClass(labelContainer, 'inline');
		new HighlightedLabel(labelContainer).set(this._label, labelHighlights);
		row1.appendChild(labelContainer);

		// fill second row with descriptions
		const descContainer = document.createElement('div');
		dom.addClass(descContainer, 'inline description');
		new HighlightedLabel(descContainer).set(this._description, descHighlights);
		row2.appendChild(descContainer);

		container.appendChild(row1);
		container.appendChild(row2);
		return;
	}

	public run(mode: Mode, context: IContext): boolean {
		switch (mode) {
			case Mode.OPEN:
				this._open();
				return true;
			case Mode.PREVIEW:
				this._preview();
				return true;
			default:
				return false;
		}
	}

	private _open(): void {
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
	}

	private _preview(): void {
		const editors = this._codeEditorService.listCodeEditors();
		let editor: ICommonCodeEditor;
		for (let candidate of editors) {
			if (!candidate.getModel()
				|| candidate.getModel().getAssociatedResource().toString() !== this._marker.resource.toString()) {

				continue;
			}

			if (!editor || this._editorService.getActiveEditor()
				&& candidate === this._editorService.getActiveEditor().getControl()) {

				editor = candidate;
			}
		}

		if (editor) {
			editor.revealRangeInCenter(this._marker);
		}
	}
}

export class MarkersHandler extends QuickOpenHandler {

	private _markerService: IMarkerService;
	private _editorService: IWorkbenchEditorService;
	private _codeEditorService: ICodeEditorService;
	private _contextService: IWorkspaceContextService;
	private _activeSession: [QuickOpenModel, IEditorViewState];

	constructor(
		@IMarkerService markerService: IMarkerService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super();

		this._markerService = markerService;
		this._editorService = editorService;
		this._codeEditorService = codeEditorService;
		this._contextService = contextService;
	}

	public getAriaLabel(): string {
		return nls.localize('markersHandlerAriaLabel', "Type to narrow down errors and warnings");
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {

		if (!this._activeSession) {

			// 1st model
			const model = new QuickOpenModel(this._markerService.read({ take: 500 })
				.sort(MarkersHandler._sort)
				.map(marker => new MarkerEntry(this._editorService, this._codeEditorService, this._contextService, marker)));

			// 2nd viewstate
			const editor = this._editorService.getActiveEditor();
			let viewState: IEditorViewState;
			if (editor instanceof BaseTextEditor) {
				viewState = editor.getControl().saveViewState();
			}

			this._activeSession = [model, viewState];
		}

		// filter
		searchValue = searchValue.trim();
		const [model] = this._activeSession;
		for (let entry of model.entries) {
			(<MarkerEntry>entry).update(searchValue);
		}

		return TPromise.as(model);
	}

	public onClose(canceled: boolean): void {
		if (this._activeSession) {
			if (canceled) {
				const [, viewState] = this._activeSession;
				if (viewState) {
					const editor = this._editorService.getActiveEditor();
					(<ICommonCodeEditor>editor.getControl()).restoreViewState(viewState);
				}
			}
			this._activeSession = undefined;
		}
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
