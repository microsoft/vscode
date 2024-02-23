/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./bulkEdit';
import { WorkbenchAsyncDataTree, IOpenEvent } from 'vs/platform/list/browser/listService';
import { BulkEditElement, BulkEditDelegate, TextEditElementRenderer, FileElementRenderer, BulkEditDataSource, BulkEditIdentityProvider, FileElement, TextEditElement, BulkEditAccessibilityProvider, CategoryElementRenderer, BulkEditNaviLabelProvider, CategoryElement, BulkEditSorter } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditTree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { localize } from 'vs/nls';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { BulkEditPreviewProvider, BulkFileOperation, BulkFileOperations, BulkFileOperationType } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview';
import { ILabelService } from 'vs/platform/label/common/label';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { ResourceLabels, IResourceLabelsContainer } from 'vs/workbench/browser/labels';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import type { IAsyncDataTreeViewState } from 'vs/base/browser/ui/tree/asyncDataTree';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { ButtonBar } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { Mutable } from 'vs/base/common/types';
import { IResourceDiffEditorInput, IResourceEdit } from 'vs/workbench/common/editor';
import { Range } from 'vs/editor/common/core/range';
import { IMultiDiffEditorOptions } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { BulkEditEditor } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditEditor';
import { Emitter, Event } from 'vs/base/common/event';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

export async function getBulkEditPane(viewsService: IViewsService): Promise<BulkEditPane | undefined> {
	console.log('inside of getBulkEditPane');
	const view = await viewsService.openView(BulkEditPane.ID, true);
	console.log('view inside of getBulkEditPane', view);
	if (view instanceof BulkEditPane) {
		return view;
	}
	return undefined;
}

export async function getBulkEditPane2(instantiationService: IInstantiationService, edits: ResourceEdit[]): Promise<BulkEditPane | undefined> {
	return instantiationService.createInstance(BulkEditPane, { id: 'refactorPreview', title: 'Refactor Preview' }, edits);
}

const enum State {
	Data = 'data',
	Message = 'message'
}

export class BulkEditPane extends ViewPane {

	static readonly ID = 'refactorPreview';

	static readonly ctxHasCategories = new RawContextKey('refactorPreview.hasCategories', false);
	static readonly ctxGroupByFile = new RawContextKey('refactorPreview.groupByFile', true);
	static readonly ctxHasCheckedChanges = new RawContextKey('refactorPreview.hasCheckedChanges', true);

	private static readonly _memGroupByFile = `${BulkEditPane.ID}.groupByFile`;

	private _tree!: WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>;
	private _treeDataSource!: BulkEditDataSource;
	private _treeViewStates = new Map<boolean, IAsyncDataTreeViewState>();

	private readonly _ctxHasCategories: IContextKey<boolean>;
	private readonly _ctxGroupByFile: IContextKey<boolean>;
	private readonly _ctxHasCheckedChanges: IContextKey<boolean>;

	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();
	private _currentResolve?: (edit?: ResourceEdit[]) => void;
	private _currentInput?: BulkFileOperations;
	private _currentProvider?: BulkEditPreviewProvider;
	private _fileOperations?: BulkFileOperation[];
	private _resources?: IResourceDiffEditorInput[];

	constructor(
		options: IViewletViewOptions,
		private edits: ResourceEdit[],
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(
			{ ...options, titleMenuId: MenuId.BulkEditTitle },
			keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, _instaService, openerService, themeService, telemetryService
		);

		this.element.classList.add('bulk-edit-panel', 'show-file-icons');
		this._ctxHasCategories = BulkEditPane.ctxHasCategories.bindTo(contextKeyService);
		this._ctxGroupByFile = BulkEditPane.ctxGroupByFile.bindTo(contextKeyService);
		this._ctxHasCheckedChanges = BulkEditPane.ctxHasCheckedChanges.bindTo(contextKeyService);
		console.log('inside of constructor of bulk edit pane');
		console.log('edits : ', edits);
	}

	override dispose(): void {
		this._tree.dispose();
		this._disposables.dispose();
		super.dispose();
	}

	public override renderBody(parent: HTMLElement): void {
		console.log('inside of renderBody of bulk edit pane');
		super.renderBody(parent);

		const resourceLabels = this._instaService.createInstance(
			ResourceLabels,
			<IResourceLabelsContainer>{ onDidChangeVisibility: this.onDidChangeBodyVisibility }
		);
		this._disposables.add(resourceLabels);

		const contentContainer = document.createElement('div');
		contentContainer.className = 'content';
		parent.appendChild(contentContainer);

		// tree
		const treeContainer = document.createElement('div');
		treeContainer.className = 'tree-refactor-preview-class';
		contentContainer.appendChild(treeContainer);

		this._treeDataSource = this._instaService.createInstance(BulkEditDataSource);
		this._treeDataSource.groupByFile = this._storageService.getBoolean(BulkEditPane._memGroupByFile, StorageScope.PROFILE, true);
		this._ctxGroupByFile.set(this._treeDataSource.groupByFile);

		this._tree = <WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>>this._instaService.createInstance(
			WorkbenchAsyncDataTree, this.id, treeContainer,
			new BulkEditDelegate(),
			[this._instaService.createInstance(TextEditElementRenderer), this._instaService.createInstance(FileElementRenderer, resourceLabels), this._instaService.createInstance(CategoryElementRenderer)],
			this._treeDataSource,
			{
				accessibilityProvider: this._instaService.createInstance(BulkEditAccessibilityProvider),
				identityProvider: new BulkEditIdentityProvider(),
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				keyboardNavigationLabelProvider: new BulkEditNaviLabelProvider(),
				sorter: new BulkEditSorter(),
				selectionNavigation: true
			}
		);
		this._tree.layout(500, 500);
		console.log('this._treeDataSource : ', this._treeDataSource);
		console.log('this._tree inside of renderBody : ', this._tree);
		console.log('treeContainer : ', treeContainer);
		console.log('contentContainer : ', contentContainer);

		this._disposables.add(this._tree.onContextMenu(this._onContextMenu, this));
		this._disposables.add(this._tree.onDidOpen(e => this._openElementInMultiDiffEditor(e)));

		// buttons
		const buttonsContainer = document.createElement('div');
		buttonsContainer.className = 'buttons';
		contentContainer.appendChild(buttonsContainer);
		const buttonBar = new ButtonBar(buttonsContainer);
		this._disposables.add(buttonBar);

		const btnConfirm = buttonBar.addButton({ supportIcons: true, ...defaultButtonStyles });
		btnConfirm.label = localize('ok', 'Apply');
		btnConfirm.onDidClick(() => this.accept(), this, this._disposables);

		const btnCancel = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
		btnCancel.label = localize('cancel', 'Discard');
		btnCancel.onDidClick(() => this.discard(), this, this._disposables);

		// message
		// this._message = document.createElement('span');
		// this._message.className = 'message';
		// this._message.innerText = localize('empty.msg', "Invoke a code action, like rename, to see a preview of its changes here.");
		// parent.appendChild(this._message);

		//
		this._setState(State.Message);
	}

	protected override layoutBody(height: number, width: number): void {
		console.log('inside of layoutBody');
		super.layoutBody(height, width);
		const treeHeight = height - 50;
		this._tree.getHTMLElement().parentElement!.style.height = `${treeHeight}px`;
		this._tree.layout(treeHeight, width);
	}

	private _setState(state: State): void {
		this.element.dataset['state'] = state;
	}

	async setInput(edit: IResourceEdit[], token: CancellationToken): Promise<ResourceEdit[] | undefined> {
		console.log('inside of setInput of BulkEditPane');
		console.log('edits : ', edit);
		this.edits = edit;
		this._setState(State.Data);
		this._sessionDisposables.clear();
		this._treeViewStates.clear();

		if (this._currentResolve) {
			this._currentResolve(undefined);
			this._currentResolve = undefined;
		}

		const input = await this._instaService.invokeFunction(BulkFileOperations.create, edit);
		this._currentProvider = this._instaService.createInstance(BulkEditPreviewProvider, input);
		this._sessionDisposables.add(this._currentProvider);
		this._sessionDisposables.add(input);

		//
		const hasCategories = input.categories.length > 1;
		this._ctxHasCategories.set(hasCategories);
		this._treeDataSource.groupByFile = !hasCategories || this._treeDataSource.groupByFile;
		this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);

		this._currentInput = input;

		return new Promise<ResourceEdit[] | undefined>(resolve => {

			token.onCancellationRequested(() => resolve(undefined));

			this._currentResolve = resolve;
			this._setTreeInput(input);

			// refresh when check state changes
			this._sessionDisposables.add(input.checked.onDidChange(() => {
				this._tree.updateChildren();
				this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);
			}));
		});
	}

	hasInput(): boolean {
		return Boolean(this._currentInput);
	}

	private async _setTreeInput(input: BulkFileOperations) {
		console.log('inside of _setTreeInput');
		const viewState = this._treeViewStates.get(this._treeDataSource.groupByFile);
		await this._tree.setInput(input, viewState);
		this._tree.domFocus();

		if (viewState) {
			return;
		}

		// async expandAll (max=10) is the default when no view state is given
		const expand = [...this._tree.getNode(input).children].slice(0, 10);
		while (expand.length > 0) {
			const { element } = expand.shift()!;
			if (element instanceof FileElement) {
				await this._tree.expand(element, true);
			}
			if (element instanceof CategoryElement) {
				await this._tree.expand(element, true);
				expand.push(...this._tree.getNode(element).children);
			}
		}
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

		this._dialogService.warn(message).finally(() => this._done(false));
	}

	discard() {
		this._done(false);
	}

	private _done(accept: boolean): void {
		console.log('Inside of _done');
		this._currentResolve?.(accept ? this._currentInput?.getWorkspaceEdit() : undefined);
		this._currentInput = undefined;
		this._setState(State.Message);
		this._sessionDisposables.clear();
	}

	toggleChecked() {
		const [first] = this._tree.getFocus();
		if ((first instanceof FileElement || first instanceof TextEditElement) && !first.isDisabled()) {
			first.setChecked(!first.isChecked());
		} else if (first instanceof CategoryElement) {
			first.setChecked(!first.isChecked());
		}
	}

	groupByFile(): void {
		if (!this._treeDataSource.groupByFile) {
			this.toggleGrouping();
		}
	}

	groupByType(): void {
		if (this._treeDataSource.groupByFile) {
			this.toggleGrouping();
		}
	}

	toggleGrouping() {
		const input = this._tree.getInput();
		if (input) {

			// (1) capture view state
			const oldViewState = this._tree.getViewState();
			this._treeViewStates.set(this._treeDataSource.groupByFile, oldViewState);

			// (2) toggle and update
			this._treeDataSource.groupByFile = !this._treeDataSource.groupByFile;
			this._setTreeInput(input);

			// (3) remember preference
			this._storageService.store(BulkEditPane._memGroupByFile, this._treeDataSource.groupByFile, StorageScope.PROFILE, StorageTarget.USER);
			this._ctxGroupByFile.set(this._treeDataSource.groupByFile);
		}
	}

	private async _openElementInMultiDiffEditor(e: IOpenEvent<BulkEditElement | undefined>): Promise<void> {
		console.log('inside of __openElementInMultiDiffEditor');
		const fileOperations = this._currentInput?.fileOperations;
		if (!fileOperations) {
			return;
		}
		let fileElement: FileElement;
		if (e.element instanceof TextEditElement) {
			fileElement = e.element.parent;
		} else if (e.element instanceof FileElement) {
			fileElement = e.element;
		} else {
			// invalid event
			return;
		}

		const diffResources = await this._resolveResources(fileOperations);
		const options: Mutable<IMultiDiffEditorOptions> = {
			...e.editorOptions,
			viewState: {
				revealData: {
					resource: { original: fileElement.edit.uri },
					range: new Range(1, 1, 1, 1)
				}
			}
		};
		const refactorPreviewSource = URI.from({ scheme: 'refactor-preview' });
		const label = 'Refactor Preview';
		const edits = this.edits;
		console.log('edits : ', edits);
		this._editorService.openEditor({
			edits,
			refactorPreviewSource,
			diffResources,
			label,
			options,
			description: label
		}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
	}

	private async _resolveResources(fileOperations: BulkFileOperation[]): Promise<IResourceDiffEditorInput[]> {
		if (this._fileOperations === fileOperations && this._resources) {
			return this._resources;
		}
		const resources: IResourceDiffEditorInput[] = [];
		for (const operation of fileOperations) {
			const operationUri = operation.uri;
			const previewUri = this._currentProvider!.asPreviewUri(operationUri);
			// delete -> show single editor
			if (operation.type & BulkFileOperationType.Delete) {
				resources.push({
					original: { resource: undefined },
					modified: { resource: URI.revive(previewUri) }
				});

			} else {
				// rename, create, edits -> show diff editr
				let leftResource: URI | undefined;
				try {
					(await this._textModelService.createModelReference(operationUri)).dispose();
					leftResource = operationUri;
				} catch {
					leftResource = BulkEditPreviewProvider.emptyPreview;
				}
				resources.push({
					original: { resource: URI.revive(leftResource) },
					modified: { resource: URI.revive(previewUri) }
				});
			}
		}
		this._fileOperations = fileOperations;
		this._resources = resources;
		return resources;
	}

	private _onContextMenu(e: ITreeContextMenuEvent<any>): void {

		this._contextMenuService.showContextMenu({
			menuId: MenuId.BulkEditContext,
			contextKeyService: this.contextKeyService,
			getAnchor: () => e.anchor
		});
	}
}

export class OpenMultiDiffEditor extends Disposable {

	static readonly ID = 'refactorPreview';

	static readonly ctxHasCategories = new RawContextKey('refactorPreview.hasCategories', false);
	static readonly ctxGroupByFile = new RawContextKey('refactorPreview.groupByFile', true);
	static readonly ctxHasCheckedChanges = new RawContextKey('refactorPreview.hasCheckedChanges', true);

	private _tree!: WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>;
	private _treeDataSource!: BulkEditDataSource;
	private _treeViewStates = new Map<boolean, IAsyncDataTreeViewState>();

	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();
	// private _currentResolve?: (edit?: ResourceEdit[]) => void;
	private _currentInput?: BulkFileOperations;
	private _currentProvider?: BulkEditPreviewProvider;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorGroupsService private readonly _groupService: IEditorGroupsService,
		@IStorageService _storageService: IStorageService,
	) {

		super();

		const resourceLabels = this._instaService.createInstance(
			ResourceLabels,
			<IResourceLabelsContainer>{ onDidChangeVisibility: this.onDidChangeBodyVisibility }
		);
		this._treeDataSource = this._instaService.createInstance(BulkEditDataSource);
		this._treeDataSource.groupByFile = _storageService.getBoolean(`${BulkEditPane.ID}.groupByFile`, StorageScope.PROFILE, true);
		const treeContainer = document.createElement('div');
		this._tree = <WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>>this._instaService.createInstance(
			WorkbenchAsyncDataTree, 'some-id', treeContainer,
			new BulkEditDelegate(),
			[this._instaService.createInstance(TextEditElementRenderer), this._instaService.createInstance(FileElementRenderer, resourceLabels), this._instaService.createInstance(CategoryElementRenderer)],
			this._treeDataSource,
			{
				accessibilityProvider: this._instaService.createInstance(BulkEditAccessibilityProvider),
				identityProvider: new BulkEditIdentityProvider(),
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				keyboardNavigationLabelProvider: new BulkEditNaviLabelProvider(),
				sorter: new BulkEditSorter(),
				selectionNavigation: true
			}
		);
		this._tree.layout(500, 500);
		console.log('inside of constructor of bulk edit pane');
	}

	private _onDidChangeBodyVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeBodyVisibility: Event<boolean> = this._onDidChangeBodyVisibility.event;

	override dispose(): void {
		super.dispose();
		this._tree.dispose();
		this._disposables.dispose();
	}

	async setInput(edit: ResourceEdit[], token: CancellationToken): Promise<void> {
		console.log('inside of setInput of OpenMultiDiffEditor');
		this._sessionDisposables.clear();
		this._treeViewStates.clear();

		// if (this._currentResolve) {
		// 	this._currentResolve(undefined);
		// 	this._currentResolve = undefined;
		// }

		const input = await this._instaService.invokeFunction(BulkFileOperations.create, edit);
		console.log('input : ', input);

		this._currentProvider = this._instaService.createInstance(BulkEditPreviewProvider, input);
		this._sessionDisposables.add(this._currentProvider);
		this._sessionDisposables.add(input);

		//
		const hasCategories = input.categories.length > 1;
		this._treeDataSource.groupByFile = !hasCategories || this._treeDataSource.groupByFile;

		this._currentInput = input;

		// this._currentResolve = resolve;
		this._setTreeInput(input);

		// refresh when check state changes
		this._sessionDisposables.add(input.checked.onDidChange(() => {
			this._tree.updateChildren();
		}));
	}

	hasInput(): boolean {
		return Boolean(this._currentInput);
	}

	private async _setTreeInput(input: BulkFileOperations) {
		console.log('inside of _setTreeInput');
		const viewState = this._treeViewStates.get(this._treeDataSource.groupByFile);
		await this._tree.setInput(input, viewState);
		this._tree.domFocus();

		if (viewState) {
			return;
		}

		// async expandAll (max=10) is the default when no view state is given
		const expand = [...this._tree.getNode(input).children].slice(0, 10);
		while (expand.length > 0) {
			const { element } = expand.shift()!;
			if (element instanceof FileElement) {
				await this._tree.expand(element, true);
			}
			if (element instanceof CategoryElement) {
				await this._tree.expand(element, true);
				expand.push(...this._tree.getNode(element).children);
			}
		}
	}

	public async openMultiDiffEditorReturnInput(edits: ResourceEdit[]): Promise<ResourceEdit[] | undefined> {
		console.log('inside of openMultiDiffEditor, edits : ', edits);
		return this._openElementInMultiDiffEditorReturnInput(edits);
	}

	private async _openElementInMultiDiffEditorReturnInput(edits: ResourceEdit[]): Promise<ResourceEdit[] | undefined> {

		if (edits.some(edit => !(edit instanceof ResourceTextEdit))) {
			return [];
		}
		const _edits = edits as ResourceTextEdit[];

		console.log('inside of _openElementInMultiDiffEditor');
		console.log('_edits : ', _edits);

		const diffResources = await this._resolveResources(_edits);
		const options: Mutable<IMultiDiffEditorOptions> = {
			viewState: {
				revealData: {
					resource: { original: _edits[0].resource },
					range: new Range(1, 1, 1, 1)
				}
			}
		};
		const refactorPreviewSource = URI.from({ scheme: 'refactor-preview' });
		const label = 'Refactor Preview';
		console.log('before opening the editor');

		const bulkEditEditor = await this._editorService.openEditor({
			refactorPreviewSource,
			diffResources,
			edits,
			label,
			options,
			description: label
		}, ACTIVE_GROUP) as BulkEditEditor;

		console.log('bulkEditEditor : ', bulkEditEditor);
		// This method should instead return the refactor preview from within the bulk edit editor and await the set input method from there
		const inputEditsAfterResolving = await bulkEditEditor.inputEdits;

		// need to close the editor that was opened for the bulk edit pane
		if (bulkEditEditor.input) {
			await this._editorService.closeEditor({ editor: bulkEditEditor.input, groupId: this._groupService.activeGroup.id });
		}

		return inputEditsAfterResolving;

	}

	private async _resolveResources(edits: ResourceTextEdit[]): Promise<IResourceDiffEditorInput[]> {
		const resources: IResourceDiffEditorInput[] = [];
		for (const edit of edits) {
			const operationUri = edit.resource;
			const previewUri = this._currentProvider!.asPreviewUri(operationUri);
			// delete -> show single editor
			// rename, create, edits -> show diff editr
			let leftResource: URI | undefined;
			try {
				(await this._textModelService.createModelReference(operationUri)).dispose();
				leftResource = operationUri;
			} catch {
				leftResource = BulkEditPreviewProvider.emptyPreview;
			}
			resources.push({
				original: { resource: URI.revive(leftResource) },
				modified: { resource: URI.revive(previewUri) }
			});
		}
		return resources;
	}
}
