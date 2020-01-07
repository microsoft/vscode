/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./bulkEdit';
import { Panel } from 'vs/workbench/browser/panel';
import { Dimension } from 'vs/base/browser/dom';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { WorkspaceEdit } from 'vs/editor/common/modes';
import { Edit, BulkEditDelegate, TextEditElementRenderer, FileElementRenderer, BulkEditDataSource, BulkEditIdentityProvider, FileElement, TextEditElement } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditTree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Action } from 'vs/base/common/actions';
import { diffInserted, diffRemoved } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { BulkEditPreviewProvider, BulkFileOperations } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPreview';
import { ILabelService } from 'vs/platform/label/common/label';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';

const enum State {
	Data = 'data',
	Message = 'message'
}

export class BulkEditPanel extends Panel {

	static readonly ID = 'BulkEditPanel';

	private _tree!: WorkbenchAsyncDataTree<BulkFileOperations, Edit, FuzzyScore>;
	private _message!: HTMLSpanElement;

	private readonly _acceptAction = new Action('ok', localize('ok', "Apply Refactoring"), 'codicon-check', false, async () => this._done(true));
	private readonly _discardAction = new Action('discard', localize('discard', "Discard"), 'codicon-trash', false, async () => this._done(false));
	private readonly _disposables = new DisposableStore();

	private readonly _sessionDisposables = new DisposableStore();
	private _currentResolve?: (apply: boolean) => void;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {
		super(BulkEditPanel.ID, telemetryService, themeService, storageService);
	}

	dispose(): void {
		this._tree.dispose();
		this._disposables.dispose();
	}

	create(parent: HTMLElement): void {
		super.create(parent);
		parent.className = 'bulk-edit-panel';

		// tree
		const treeContainer = document.createElement('div');
		treeContainer.className = 'tree';
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

		this._disposables.add(this._tree.onDidOpen(e => {
			const [first] = e.elements;
			if (first instanceof TextEditElement) {
				this._previewTextEditElement(first);
			} else if (first instanceof FileElement) {
				this._previewFileElement(first);
			}
		}));

		// message
		this._message = document.createElement('span');
		this._message.className = 'message';
		this._message.innerText = localize('empty.msg', "Invoke a code action, like rename, to see a preview of its changes here.");
		parent.appendChild(this._message);

		//
		this._setState(State.Message);
	}

	getActions() {
		return [this._acceptAction, this._discardAction];
	}

	layout(dimension: Dimension): void {
		this._tree.layout(dimension.height, dimension.width);
	}

	private _setState(state: State): void {
		this.getContainer()!.dataset['state'] = state;
	}

	async setInput(edit: WorkspaceEdit): Promise<boolean> {
		this._setState(State.Data);
		this._sessionDisposables.clear();


		if (this._currentResolve) {
			this._currentResolve(false);
			this._currentResolve = undefined;
		}

		this._sessionDisposables.add(this._instaService.createInstance(BulkEditPreviewProvider, edit));
		const input = await this._instaService.invokeFunction(BulkFileOperations.create, edit);

		this._acceptAction.enabled = true;
		this._discardAction.enabled = true;

		return new Promise(async resolve => {

			this._currentResolve = resolve;
			await this._tree.setInput(input);
			this._tree.domFocus();
			this._tree.focusFirst();

			const first = this._tree.getFirstElementChild();
			if (first instanceof FileElement) {
				this._tree.expand(first);
			}
		});
	}

	private _done(accept: boolean): void {
		this._setState(State.Message);
		this._sessionDisposables.clear();
		if (this._currentResolve) {
			this._currentResolve(accept);
			this._acceptAction.enabled = false;
			this._discardAction.enabled = false;
			this._tree.setInput(new BulkFileOperations([]));
		}
	}

	private async _previewTextEditElement(edit: TextEditElement): Promise<void> {

		let leftResource: URI;

		try {
			(await this._textModelService.createModelReference(edit.parent.uri)).dispose();
			leftResource = edit.parent.uri;
		} catch {
			leftResource = BulkEditPreviewProvider.emptyPreview;
		}

		const previewUri = BulkEditPreviewProvider.asPreviewUri(edit.parent.uri);

		this._editorService.openEditor({
			leftResource,
			rightResource: previewUri,
			label: localize('edt.title', "{0} (Refactor Preview)", this._labelService.getUriLabel(edit.parent.uri)),
			options: {
				selection: edit.edit.range
				// preserveFocus,
				// pinned,
				// revealIfVisible: true
			}
		});
	}

	private _previewFileElement(edit: FileElement): void {

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
