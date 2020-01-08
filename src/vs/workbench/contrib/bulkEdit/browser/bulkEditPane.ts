/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./bulkEdit';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { WorkspaceEdit } from 'vs/editor/common/modes';
import { BulkEditElement, BulkEditDelegate, TextEditElementRenderer, FileElementRenderer, BulkEditDataSource, BulkEditIdentityProvider, FileElement, TextEditElement } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditTree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { Action } from 'vs/base/common/actions';
import { diffInserted, diffRemoved } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { BulkEditPreviewProvider, BulkFileOperations } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPreview';
import { ILabelService } from 'vs/platform/label/common/label';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

const enum State {
	Data = 'data',
	Message = 'message'
}

export class BulkEditPanel extends ViewPane {

	static readonly ID = 'BulkEditPanel';

	private _tree!: WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>;
	private _message!: HTMLSpanElement;

	private readonly _acceptAction = new Action('ok', localize('ok', "Apply Refactoring"), 'codicon-check', false, async () => this._done(true));
	private readonly _discardAction = new Action('discard', localize('discard', "Discard"), 'codicon-trash', false, async () => this._done(false));
	private readonly _disposables = new DisposableStore();

	private readonly _sessionDisposables = new DisposableStore();
	private _currentResolve?: (edit?: WorkspaceEdit) => void;
	private _currentInput?: BulkFileOperations;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(
			{ id: BulkEditPanel.ID, title: localize('title', "Refactor Preview") },
			keybindingService, contextMenuService, configurationService, contextKeyService
		);
	}

	dispose(): void {
		this._tree.dispose();
		this._disposables.dispose();
	}

	protected renderBody(parent: HTMLElement): void {
		parent.classList.add('bulk-edit-panel', 'show-file-icons');

		// tree
		const treeContainer = document.createElement('div');
		treeContainer.className = 'tree';
		treeContainer.style.width = '100%';
		treeContainer.style.height = '100%';
		parent.appendChild(treeContainer);

		this._tree = this._instaService.createInstance(
			WorkbenchAsyncDataTree, this.id, treeContainer,
			new BulkEditDelegate(),
			[this._instaService.createInstance(TextEditElementRenderer), this._instaService.createInstance(FileElementRenderer)],
			this._instaService.createInstance(BulkEditDataSource),
			{
				identityProvider: new BulkEditIdentityProvider(),
				expandOnlyOnTwistieClick: true
			}
		);

		this._disposables.add(this._tree.onDidOpen(e => {
			const [first] = e.elements;
			if (first instanceof TextEditElement) {
				this._previewTextEditElement(first);
			} else if (first instanceof FileElement) {
				this._previewFileElement();
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

	protected layoutBody(height: number, width: number): void {
		this._tree.layout(height, width);
	}

	private _setState(state: State): void {
		this.body.dataset['state'] = state;
	}

	async setInput(edit: WorkspaceEdit): Promise<WorkspaceEdit | undefined> {
		this._setState(State.Data);
		this._sessionDisposables.clear();

		if (this._currentResolve) {
			this._currentResolve(undefined);
			this._currentResolve = undefined;
		}

		const input = await this._instaService.invokeFunction(BulkFileOperations.create, edit);
		const provider = this._instaService.createInstance(BulkEditPreviewProvider, input);

		this._sessionDisposables.add(provider);
		this._currentInput = input;

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
			this._currentResolve(accept ? this._currentInput?.asWorkspaceEdit() : undefined);
			this._acceptAction.enabled = false;
			this._discardAction.enabled = false;
		}
	}

	private async _previewTextEditElement(element: TextEditElement): Promise<void> {

		let leftResource: URI;

		try {
			(await this._textModelService.createModelReference(element.parent.uri)).dispose();
			leftResource = element.parent.uri;
		} catch {
			leftResource = BulkEditPreviewProvider.emptyPreview;
		}

		const previewUri = BulkEditPreviewProvider.asPreviewUri(element.parent.uri);

		this._editorService.openEditor({
			leftResource,
			rightResource: previewUri,
			label: localize('edt.title', "{0} (Refactor Preview)", this._labelService.getUriLabel(element.parent.uri)),
			options: {
				selection: element.edit.edit.range
				// preserveFocus,
				// pinned,
				// revealIfVisible: true
			}
		});
	}

	private _previewFileElement(): void {

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
