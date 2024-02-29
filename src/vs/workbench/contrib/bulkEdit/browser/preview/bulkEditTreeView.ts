/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./bulkEdit';
import { WorkbenchAsyncDataTree, IOpenEvent } from 'vs/platform/list/browser/listService';
import { BulkEditElement, BulkEditDelegate, TextEditElementRenderer, FileElementRenderer, BulkEditDataSource, BulkEditIdentityProvider, FileElement, TextEditElement, BulkEditAccessibilityProvider, CategoryElementRenderer, BulkEditNaviLabelProvider, CategoryElement, BulkEditSorter } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditTree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { BulkEditPreviewProvider, BulkFileOperations } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview';
import { ILabelService } from 'vs/platform/label/common/label';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ResourceLabels, IResourceLabelsContainer } from 'vs/workbench/browser/labels';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import type { IAsyncDataTreeViewState } from 'vs/base/browser/ui/tree/asyncDataTree';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ResourceEdit } from 'vs/editor/browser/services/bulkEditService';
import { ButtonBar } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IResourceEdit } from 'vs/workbench/common/editor';
import { Emitter, Event } from 'vs/base/common/event';
import { Orientation, OrthogonalEdge, Sash, SashState } from 'vs/base/browser/ui/sash/sash';

// No longer needs to be a view pane. Since it's now just a simple HTML embedded element.
export class BulkEditTreeView extends Disposable {

	static readonly ID = 'refactorPreview';

	static readonly ctxHasCategories = new RawContextKey('refactorPreview.hasCategories', false);
	static readonly ctxGroupByFile = new RawContextKey('refactorPreview.groupByFile', true);
	static readonly ctxHasCheckedChanges = new RawContextKey('refactorPreview.hasCheckedChanges', true);

	private static readonly _memGroupByFile = `${BulkEditTreeView.ID}.groupByFile`;

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
	private _parent: HTMLElement | undefined;
	private _contentContainer: HTMLElement | undefined;
	private _sash: Sash | undefined;
	private _currentHeight: number | undefined;

	private _onDidChangeBodyVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeBodyVisibility: Event<boolean> = this._onDidChangeBodyVisibility.event;

	private _onToggleChecked = this._register(new Emitter<ResourceEdit>());
	readonly onToggleChecked: Event<ResourceEdit> = this._onToggleChecked.event;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._ctxHasCategories = BulkEditTreeView.ctxHasCategories.bindTo(_contextKeyService);
		this._ctxGroupByFile = BulkEditTreeView.ctxGroupByFile.bindTo(_contextKeyService);
		this._ctxHasCheckedChanges = BulkEditTreeView.ctxHasCheckedChanges.bindTo(_contextKeyService);
	}

	private readonly _onDidTreeOpen = this._register(new Emitter<IOpenEvent<BulkEditElement | undefined>>());
	public readonly onDidTreeOpen = this._onDidTreeOpen.event;

	override dispose(): void {
		this._tree.dispose();
		this._disposables.dispose();
		super.dispose();
	}

	public focus(): void {
		this._parent?.focus();
	}

	public renderBody(parent: HTMLElement): void {

		this._parent = parent;
		const resourceLabels = this._instaService.createInstance(
			ResourceLabels,
			<IResourceLabelsContainer>{ onDidChangeVisibility: this.onDidChangeBodyVisibility }
		);
		this._disposables.add(resourceLabels);

		const contentContainer = document.createElement('div');
		this._contentContainer = contentContainer;
		this._contentContainer.className = 'content';
		parent.appendChild(this._contentContainer);

		// tree
		const treeContainer = document.createElement('div');
		treeContainer.className = 'tree-refactor-preview-class';
		this._contentContainer.appendChild(treeContainer);

		this._treeDataSource = this._instaService.createInstance(BulkEditDataSource);
		this._treeDataSource.groupByFile = this._storageService.getBoolean(BulkEditTreeView._memGroupByFile, StorageScope.PROFILE, true);
		this._ctxGroupByFile.set(this._treeDataSource.groupByFile);

		this._tree = <WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>>this._instaService.createInstance(
			WorkbenchAsyncDataTree, BulkEditTreeView.ID, treeContainer,
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

		this._disposables.add(this._tree.onContextMenu(this._onContextMenu, this));
		this._disposables.add(this._tree.onDidOpen(e => {
			console.log('inside of tree on did open, with e : ', e);
			this._onDidTreeOpen.fire(e);
		}));

		// buttons
		const buttonsContainer = document.createElement('div');
		buttonsContainer.className = 'buttons';
		buttonsContainer.style.paddingBottom = '6px';
		buttonsContainer.style.height = '30px';
		buttonsContainer.style.minHeight = '30px';
		buttonsContainer.style.bottom = '0px';
		this._contentContainer.appendChild(buttonsContainer);
		const buttonBar = new ButtonBar(buttonsContainer);
		this._disposables.add(buttonBar);

		const btnConfirm = buttonBar.addButton({ supportIcons: true, ...defaultButtonStyles });
		btnConfirm.label = localize('ok', 'Apply');
		btnConfirm.onDidClick(() => this.accept(), this, this._disposables);

		const btnCancel = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
		btnCancel.label = localize('cancel', 'Discard');
		btnCancel.onDidClick(() => this.discard(), this, this._disposables);

		// Adding the sash
		this._sash = new Sash(parent, {
			getHorizontalSashTop: () => (parent.clientHeight + buttonsContainer.clientHeight) ?? 0
		}, { orientation: Orientation.HORIZONTAL, orthogonalEdge: OrthogonalEdge.South });
		this._sash.state = SashState.Enabled;
		this._sash.onDidStart(() => {
			if (this._currentHeight === undefined) {
				this._currentHeight = parent.clientHeight;
			}
		});
		this._sash.onDidEnd(() => {
			if (this._currentHeight !== undefined) {
				this._currentHeight = undefined;
			}
		});
		this._sash.onDidChange(e => {
			if (this._currentHeight) {
				const deltaY = e.currentY - e.startY;
				const heightOfParent = this._currentHeight + deltaY;
				// We don't want to resize down more than the height of the button bar
				if (heightOfParent > 30) {
					parent.style.height = `${heightOfParent}px`;
					contentContainer.style.height = `${heightOfParent}px`;
					treeContainer.style.height = `${heightOfParent - 36}px`;
					this._sash?.layout();
				}
			}
		});
		this._sash.layout();
	}

	layoutBody(height: number, width: number): void {
		const treeHeight = height - 50;
		this._tree.getHTMLElement().parentElement!.style.height = `${treeHeight}px`;
		this._tree.layout(treeHeight, width);

		// Setting also the appropriate height on the tree and the content container
		if (this._contentContainer && this._parent) {
			this._contentContainer.style.height = `${height}px`;
			this._parent.style.height = `${height}px`;
		}
		this._sash?.layout();
	}

	get currentInput(): BulkFileOperations | undefined {
		return this._currentInput;
	}

	async setInput(edit: IResourceEdit[], token: CancellationToken): Promise<ResourceEdit[] | undefined> {
		console.log('inside of setInput of bulk edit tree view');
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
		this._sash?.layout();

		return new Promise<ResourceEdit[] | undefined>(resolve => {

			token.onCancellationRequested(() => resolve(undefined));

			this._currentResolve = resolve;
			this._setTreeInput(input);

			this._sessionDisposables.add(input.checked.onDidChange(async (e) => {
				console.log('when input checked state changed');
				this._tree.updateChildren();
				this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);
				this._onToggleChecked.fire(e);
			}));
		});
	}

	isResourceChecked(e: ResourceEdit): boolean {
		return this._currentInput?.checked.isChecked(e) ?? false;
	}

	hasInput(): boolean {
		return Boolean(this._currentInput);
	}

	private async _setTreeInput(input: BulkFileOperations) {

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
		console.log('inside of _done, accept : ', accept);
		this._currentResolve?.(accept ? this._currentInput?.getWorkspaceEdit() : undefined);
		this._currentInput = undefined;
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
			this._storageService.store(BulkEditTreeView._memGroupByFile, this._treeDataSource.groupByFile, StorageScope.PROFILE, StorageTarget.USER);
			this._ctxGroupByFile.set(this._treeDataSource.groupByFile);
		}
	}

	private _onContextMenu(e: ITreeContextMenuEvent<any>): void {

		this._contextMenuService.showContextMenu({
			menuId: MenuId.BulkEditContext,
			contextKeyService: this._contextKeyService,
			getAnchor: () => e.anchor
		});
	}
}
