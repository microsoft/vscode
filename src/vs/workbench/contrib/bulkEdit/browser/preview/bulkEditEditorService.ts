/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataTreeViewState } from 'vs/base/browser/ui/tree/asyncDataTree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Mutable } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IBulkEditEditorService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IMultiDiffEditorOptions } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IResourceLabelsContainer, ResourceLabels } from 'vs/workbench/browser/labels';
import { IResourceDiffEditorInput } from 'vs/workbench/common/editor';
import { BulkEditEditor } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditEditor';
import { BulkEditPane } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPane';
import { BulkEditPreviewProvider, BulkFileOperations } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview';
import { BulkEditAccessibilityProvider, BulkEditDataSource, BulkEditDelegate, BulkEditElement, BulkEditIdentityProvider, BulkEditNaviLabelProvider, BulkEditSorter, CategoryElement, CategoryElementRenderer, FileElement, FileElementRenderer, TextEditElementRenderer } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditTree';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP, IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Range } from 'vs/editor/common/core/range';

export class BulkEditEditorService implements IBulkEditEditorService {

	declare readonly _serviceBrand: undefined;

	static readonly ID = 'refactorPreview';
	static URI = URI.from({ scheme: 'refactor-preview-editor' });

	static readonly ctxHasCategories = new RawContextKey('refactorPreview.hasCategories', false);
	static readonly ctxGroupByFile = new RawContextKey('refactorPreview.groupByFile', true);
	static readonly ctxHasCheckedChanges = new RawContextKey('refactorPreview.hasCheckedChanges', true);

	private _tree!: WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>;
	private _treeDataSource!: BulkEditDataSource;
	private _treeViewStates = new Map<boolean, IAsyncDataTreeViewState>();

	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();
	private _currentInput?: BulkFileOperations;
	private _currentProvider?: BulkEditPreviewProvider;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorGroupsService private readonly _groupService: IEditorGroupsService,
		@IStorageService _storageService: IStorageService,
	) {
		this._treeDataSource = this._instaService.createInstance(BulkEditDataSource);
		this._treeDataSource.groupByFile = _storageService.getBoolean(`${BulkEditPane.ID}.groupByFile`, StorageScope.PROFILE, true);
		const treeContainer = document.createElement('div');
		const resourceLabels = this._instaService.createInstance(
			ResourceLabels,
			<IResourceLabelsContainer>{ onDidChangeVisibility: this.onDidChangeBodyVisibility }
		);
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
	}

	private _onDidChangeBodyVisibility = new Emitter<boolean>();
	readonly onDidChangeBodyVisibility: Event<boolean> = this._onDidChangeBodyVisibility.event;

	dispose(): void {
		this._tree.dispose();
		this._disposables.dispose();
	}

	async setInput(edit: ResourceEdit[], token: CancellationToken): Promise<void> {
		this._sessionDisposables.clear();
		this._treeViewStates.clear();

		const input = await this._instaService.invokeFunction(BulkFileOperations.create, edit);

		this._currentProvider = this._instaService.createInstance(BulkEditPreviewProvider, input);
		this._sessionDisposables.add(this._currentProvider);
		this._sessionDisposables.add(input);

		const hasCategories = input.categories.length > 1;
		this._treeDataSource.groupByFile = !hasCategories || this._treeDataSource.groupByFile;

		this._currentInput = input;

		this._setTreeInput(input);

		this._sessionDisposables.add(input.checked.onDidChange(() => {
			this._tree.updateChildren();
		}));
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

	public async openBulkEditEditor(edits: ResourceEdit[]): Promise<ResourceEdit[] | undefined> {
		console.log('inside of openMultiDiffEditor, edits : ', edits);
		return this._openElementInMultiDiffEditorReturnInput(edits);
	}

	private async _openElementInMultiDiffEditorReturnInput(edits: ResourceEdit[]): Promise<ResourceEdit[] | undefined> {

		if (edits.some(edit => !(edit instanceof ResourceTextEdit))) {
			return [];
		}
		const _edits = edits as ResourceTextEdit[];

		const diffResources = await this._resolveResources(_edits);
		const options: Mutable<IMultiDiffEditorOptions> = {
			viewState: {
				revealData: {
					resource: { original: _edits[0].resource },
					range: new Range(1, 1, 1, 1)
				}
			}
		};
		const refactorPreviewSource = BulkEditEditorService.URI;
		const label = 'Refactor Preview';

		const bulkEditEditor = await this._editorService.openEditor({
			refactorPreviewSource,
			diffResources,
			edits,
			label,
			options,
			description: label
		}, ACTIVE_GROUP) as BulkEditEditor;

		const inputEditsAfterResolving = await bulkEditEditor.inputEdits;
		if (bulkEditEditor.input) {
			await this._editorService.closeEditor({ editor: bulkEditEditor.input, groupId: this._groupService.activeGroup.id });
		}

		return inputEditsAfterResolving;

	}

	private async _resolveResources(edits: ResourceTextEdit[]): Promise<IResourceDiffEditorInput[]> {
		const _resources = [...new Set(edits.map(edit => edit.resource))];
		const resources: IResourceDiffEditorInput[] = [];
		for (const operationUri of _resources) {
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

	public findBulkEditEditors() {
		return this._editorService.findEditors(BulkEditEditorService.URI);
	}
}

// registerSingleton(IBulkEditEditorService, BulkEditEditorService, InstantiationType.Eager);
