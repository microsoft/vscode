/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./bulkEdit';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { WorkspaceEdit } from 'vs/editor/common/modes';
import { BulkEditElement, BulkEditDelegate, TextEditElementRenderer, FileElementRenderer, BulkEditDataSource, BulkEditIdentityProvider, FileElement, TextEditElement, BulkEditAccessibilityProvider, BulkEditAriaProvider } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditTree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { Action } from 'vs/base/common/actions';
import { diffInserted, diffRemoved } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { BulkEditPreviewProvider, BulkFileOperations, BulkTextEdit, BulkFileOperationType } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPreview';
import { ILabelService } from 'vs/platform/label/common/label';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { ResourceLabels, IResourceLabelsContainer } from 'vs/workbench/browser/labels';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { basename } from 'vs/base/common/resources';

const enum State {
	Data = 'data',
	Message = 'message'
}

export class BulkEditPane extends ViewPane {

	static readonly ID = 'refactorPreview';

	private _tree!: WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>;
	private _message!: HTMLSpanElement;

	private readonly _acceptAction = new Action('ok', localize('ok', "Apply Changes"), 'codicon-check', false, async () => this.accept());
	private readonly _discardAction = new Action('discard', localize('discard', "Discard Changes"), 'codicon-clear-all', false, async () => this.discard());

	private readonly _disposables = new DisposableStore();

	private readonly _sessionDisposables = new DisposableStore();
	private _currentResolve?: (edit?: WorkspaceEdit) => void;
	private _currentInput?: BulkFileOperations;

	constructor(
		options: IViewletViewOptions,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(
			options,
			keybindingService, contextMenuService, configurationService, contextKeyService
		);

		this.element.classList.add('bulk-edit-panel', 'show-file-icons');
	}

	dispose(): void {
		this._tree.dispose();
		this._disposables.dispose();
	}

	protected renderBody(parent: HTMLElement): void {

		const resourceLabels = this._instaService.createInstance(
			ResourceLabels,
			<IResourceLabelsContainer>{ onDidChangeVisibility: this.onDidChangeBodyVisibility }
		);
		this._disposables.add(resourceLabels);

		// tree
		const treeContainer = document.createElement('div');
		treeContainer.className = 'tree';
		treeContainer.style.width = '100%';
		treeContainer.style.height = '100%';
		parent.appendChild(treeContainer);

		this._tree = this._instaService.createInstance(
			WorkbenchAsyncDataTree, this.id, treeContainer,
			new BulkEditDelegate(),
			[new TextEditElementRenderer(), this._instaService.createInstance(FileElementRenderer, resourceLabels)],
			this._instaService.createInstance(BulkEditDataSource),
			{
				accessibilityProvider: this._instaService.createInstance(BulkEditAccessibilityProvider),
				ariaProvider: new BulkEditAriaProvider(),
				identityProvider: new BulkEditIdentityProvider(),
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false
			}
		);

		this._disposables.add(this._tree.onDidOpen(e => {
			const [first] = e.elements;
			if (first instanceof TextEditElement) {
				this._openElementAsEditor(first.parent, first.edit);
			} else if (first instanceof FileElement) {
				this._openElementAsEditor(first);
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
		this.element.dataset['state'] = state;
	}

	async setInput(edit: WorkspaceEdit, label?: string): Promise<WorkspaceEdit | undefined> {
		this._setState(State.Data);
		this._sessionDisposables.clear();

		if (this._currentResolve) {
			this._currentResolve(undefined);
			this._currentResolve = undefined;
		}

		const input = await this._instaService.invokeFunction(BulkFileOperations.create, edit);
		const provider = this._instaService.createInstance(BulkEditPreviewProvider, input);
		this._sessionDisposables.add(provider);
		this._sessionDisposables.add(input);

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

			// refresh when check state changes
			this._sessionDisposables.add(input.onDidChangeCheckedState(() => {
				this._tree.updateChildren();
			}));
		});
	}

	accept(): void {

		const conflicts = this._currentInput?.conflicts.list();

		if (!conflicts || conflicts.length === 0) {
			this._done(true);
			return;
		}

		let message: string;
		if (conflicts.length === 1) {
			message = localize('conflict.1', "Cannot apply refactoring because '{0}' has changed in the meantime.", this._labelService.getUriLabel(conflicts[0], { relative: true }));
		} else {
			message = localize('conflict.N', "Cannot apply refactoring because {0} other files have changed in the meantime.", conflicts.length);
		}

		this._dialogService.show(Severity.Warning, message, []).finally(() => this._done(false));
	}

	discard() {
		this._done(false);
	}

	toggleChecked() {
		const [first] = this._tree.getFocus();
		if (first) {
			first.edit.updateChecked(!first.edit.isChecked());
		}
	}

	private _done(accept: boolean): void {
		if (this._currentResolve) {
			this._currentResolve(accept ? this._currentInput?.asWorkspaceEdit() : undefined);
			this._acceptAction.enabled = false;
			this._discardAction.enabled = false;
			this._currentInput = undefined;
		}
		this._setState(State.Message);
		this._sessionDisposables.clear();
	}

	private async _openElementAsEditor(fileElement: FileElement, textElement?: BulkTextEdit): Promise<void> {

		if (!textElement) {
			textElement = fileElement.edit.textEdits[0];
		}

		let leftResource: URI | undefined;
		if (fileElement.edit.type & BulkFileOperationType.TextEdit) {
			try {
				(await this._textModelService.createModelReference(fileElement.uri)).dispose();
				leftResource = fileElement.uri;
			} catch {
				leftResource = BulkEditPreviewProvider.emptyPreview;
			}
		}

		const previewUri = BulkEditPreviewProvider.asPreviewUri(fileElement.uri);

		if (leftResource) {
			// show diff editor
			this._editorService.openEditor({
				leftResource,
				rightResource: previewUri,
				label: localize('edt.title', "{0} (refactor preview)", basename(fileElement.uri)),
				options: {
					selection: textElement?.edit.range,
					revealInCenterIfOutsideViewport: true,
					preserveFocus: true
				}
			});
		} else {
			// show 'normal' editor

			let typeLabel: string | undefined;
			if (fileElement.edit.type & BulkFileOperationType.Rename) {
				typeLabel = localize('rename', "rename");
			} else if (fileElement.edit.type & BulkFileOperationType.Create) {
				typeLabel = localize('create', "create");
			} else if (fileElement.edit.type & BulkFileOperationType.Delete) {
				typeLabel = localize('delete', "delete");
			}

			this._editorService.openEditor({
				label: typeLabel && localize('edt.title2', "{0} ({1}, refactor preview)", basename(fileElement.uri), typeLabel),
				resource: previewUri,
				options: { preserveFocus: true }
			});
		}
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
