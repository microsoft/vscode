/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./bulkEdit';
import { Panel } from 'vs/workbench/browser/panel';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { WorkspaceEdit } from 'vs/editor/common/modes';
import { Edit, BulkEditDelegate, TextEditElementRenderer, FileElementRenderer, BulkEditDataSource, BulkEditIdentityProvider, FileElement } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditTree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Action, IAction } from 'vs/base/common/actions';
import { diffInserted, diffRemoved } from 'vs/platform/theme/common/colorRegistry';

export class BulkEditPanel extends Panel {

	static readonly ID = 'BulkEditPanel';
	private static EmptyWorkspaceEdit = { edits: [] };

	private _tree!: WorkbenchAsyncDataTree<WorkspaceEdit, Edit, FuzzyScore>;
	private _acceptAction: IAction;
	private _discardAction: IAction;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(BulkEditPanel.ID, telemetryService, themeService, storageService);

		this._acceptAction = new Action('ok', 'Apply', 'codicon-check', false, async () => this._done(true));
		this._discardAction = new Action('ok', 'Discard', 'codicon-trash', false, async () => this._done(false));
	}

	create(parent: HTMLElement): void {
		super.create(parent);

		addClass(parent, 'bulk-edit-panel');

		const treeContainer = document.createElement('div');
		treeContainer.style.width = '100%';
		treeContainer.style.height = '100%';
		parent.appendChild(treeContainer);

		this._tree = this._instaService.createInstance(
			WorkbenchAsyncDataTree, this.getId(), treeContainer,
			new BulkEditDelegate(),
			[new TextEditElementRenderer(), this._instaService.createInstance(FileElementRenderer)],
			this._instaService.createInstance(BulkEditDataSource),
			{
				identityProvider: new BulkEditIdentityProvider()
			}
		);
	}

	layout(dimension: Dimension): void {
		this._tree.layout(dimension.height, dimension.width);
	}

	private _currentResolve?: (apply: boolean) => void;

	setInput(edit: WorkspaceEdit): Promise<boolean> {

		if (this._currentResolve) {
			this._currentResolve(false);
			this._currentResolve = undefined;
		}

		this._acceptAction.enabled = true;
		this._discardAction.enabled = true;

		return new Promise(async resolve => {

			this._currentResolve = resolve;
			await this._tree.setInput(edit);
			this._tree.domFocus();
			this._tree.focusFirst();

			const first = this._tree.getFirstElementChild();
			if (first instanceof FileElement) {
				this._tree.expand(first);
			}
		});
	}

	private _done(accept: boolean): void {
		if (this._currentResolve) {
			this._currentResolve(accept);
			this._acceptAction.enabled = false;
			this._discardAction.enabled = false;
			this._tree.setInput(BulkEditPanel.EmptyWorkspaceEdit);
		}
	}

	getActions() {
		return [this._acceptAction, this._discardAction];
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	const diffInsertedColor = theme.getColor(diffInserted);
	if (diffInsertedColor) {
		collector.addRule(`.monaco-workbench .bulk-edit-panel .highlight.insert { background-color: ${diffInsertedColor}; }`);
	}
	const diffRemovedColor = theme.getColor(diffRemoved);
	if (diffRemovedColor) {
		collector.addRule(`.monaco-workbench .bulk-edit-panel .highlight.remove { background-color: ${diffRemovedColor}; }`);
	}
});
