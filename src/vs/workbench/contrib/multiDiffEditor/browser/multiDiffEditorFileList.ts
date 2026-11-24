/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ICompressedTreeElement, ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ObjectTreeElementCollapseState } from '../../../../base/browser/ui/tree/tree.js';
import { commonPrefixLength } from '../../../../base/common/arrays.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { IResourceNode, ResourceTree } from '../../../../base/common/resourceTree.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { DocumentDiffItemViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TextEditorSelectionSource } from '../../../../platform/editor/common/editor.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { createFileIconThemableTreeContainerScope } from '../../files/browser/views/explorerView.js';
import { SCMStructuralDiffRenderer } from '../../scm/browser/scmStructuralDiffRenderer.js';
import { ISCMViewService } from '../../scm/common/scm.js';
import { getSCMStructuralDiffAriaLabel, getSCMStructuralDiffLabel, getSCMStructuralDiffTarget, isSCMStructuralDiffElement, IStructuralDiffResourceAdapter, SCMStructuralDiffElement, StructuralDiffModel } from '../../scm/common/scmStructuralDiff.js';
import { MultiDiffEditorFileListFocusedContext, MultiDiffEditorFileListViewMode, sortMultiDiffEditorFileListItems } from '../common/multiDiffEditor.js';

type FolderNode = IResourceNode<DocumentDiffItemViewModel, null>;
type StructuralChange = SCMStructuralDiffElement<DocumentDiffItemViewModel>;
type FileListElement = DocumentDiffItemViewModel | FolderNode | StructuralChange;

function isFolder(element: FileListElement): element is FolderNode {
	return ResourceTree.isResourceNode(element);
}

function isStructuralChange(element: FileListElement): element is StructuralChange {
	return isSCMStructuralDiffElement(element);
}

/** Like the Source Control view, the list loads the structural changes of a file when it is expanded. */
const structuralDiffAdapter: IStructuralDiffResourceAdapter<DocumentDiffItemViewModel> = {
	location: 'multiDiffEditor',
	getDocuments: item => ({ original: item.originalUri, modified: item.modifiedUri }),
	getIdentity: item => ['multiDiffEditor', item.getKey()],
};

/** How long a file loads its structural changes before its twistie shows that it loads, like in an async tree. */
const SLOW_LOAD_DELAY_MS = 800;

/** Structural changes are expanded by default, like in the Source Control view, and keep the state the user gives them. */
function toStructuralChangeElement(element: StructuralChange): ICompressedTreeElement<FileListElement> {
	const children = element.type === 'structuralDiff' ? element.children : [];
	return {
		element,
		incompressible: true,
		collapsible: children.length > 0,
		collapsed: ObjectTreeElementCollapseState.PreserveOrExpanded,
		children: children.map(toStructuralChangeElement),
	};
}

function getKeyboardNavigationLabel(element: FileListElement): string {
	return isFolder(element) ? element.name : isStructuralChange(element) ? getSCMStructuralDiffLabel(element) : basename(getItemUri(element));
}

const enum MultiDiffFileStatus {
	Added = 'added',
	Deleted = 'deleted',
	Modified = 'modified',
	Renamed = 'renamed',
}

function getFileStatus(item: DocumentDiffItemViewModel): MultiDiffFileStatus {
	if (item.modifiedUri && item.originalUri && item.modifiedUri.path !== item.originalUri.path) {
		return MultiDiffFileStatus.Renamed;
	} else if (!item.modifiedUri) {
		return MultiDiffFileStatus.Deleted;
	} else if (!item.originalUri) {
		return MultiDiffFileStatus.Added;
	}
	return MultiDiffFileStatus.Modified;
}

function getFileStatusLetter(status: MultiDiffFileStatus): string {
	switch (status) {
		case MultiDiffFileStatus.Added: return 'A';
		case MultiDiffFileStatus.Deleted: return 'D';
		case MultiDiffFileStatus.Modified: return 'M';
		case MultiDiffFileStatus.Renamed: return 'R';
	}
}

function getFileStatusLabel(status: MultiDiffFileStatus): string {
	switch (status) {
		case MultiDiffFileStatus.Added: return localize('multiDiffEditorFileList.added', "Added");
		case MultiDiffFileStatus.Deleted: return localize('multiDiffEditorFileList.deleted', "Deleted");
		case MultiDiffFileStatus.Modified: return localize('multiDiffEditorFileList.modified', "Modified");
		case MultiDiffFileStatus.Renamed: return localize('multiDiffEditorFileList.renamed', "Renamed");
	}
}

function getItemUri(item: DocumentDiffItemViewModel): URI {
	return (item.modifiedUri ?? item.originalUri)!;
}

/** Path of the deepest folder that contains all the given file paths. */
function getCommonFolderPath(paths: readonly string[]): string {
	let common = paths[0].split('/').slice(0, -1);
	for (const path of paths) {
		common = common.slice(0, commonPrefixLength(common, path.split('/').slice(0, -1)));
	}
	return common.join('/') || '/';
}

function getFileListElements(unsortedItems: readonly DocumentDiffItemViewModel[], viewMode: MultiDiffEditorFileListViewMode, workspaceContextService: IWorkspaceContextService, toFileElement: (item: DocumentDiffItemViewModel) => ICompressedTreeElement<FileListElement>): ICompressedTreeElement<FileListElement>[] {
	// `MultiDiffEditor` orders the diffs the same way, so that they appear in the order of the list.
	const items = sortMultiDiffEditorFileListItems(unsortedItems, getItemUri, viewMode);
	if (viewMode === 'list' || items.length === 0) {
		return items.map(toFileElement);
	}

	// Group by path only: the sides of a diff can use different schemes (e.g. `git:` for a deleted file).
	const uris = items.map(getItemUri);
	const commonPath = getCommonFolderPath(uris.map(uri => uri.path));

	// Like the Source Control view, start at the workspace folder so that the files' folders
	// show even when they all share one. Files outside the workspace start at their common folder.
	// Match by path only, with the workspace folders' schemes: a commit's diff uses `git:` URIs on both sides.
	let rootPath = commonPath;
	for (const folder of workspaceContextService.getWorkspace().folders) {
		const workspaceFolder = workspaceContextService.getWorkspaceFolder(folder.uri.with({ path: commonPath }));
		if (workspaceFolder) {
			// Keep the files' casing, which can differ from the folder's on case-insensitive file systems.
			rootPath = commonPath.substring(0, workspaceFolder.uri.path.length);
			break;
		}
	}

	const rootUri = uris[0].with({ path: rootPath, query: '', fragment: '' });
	const resourceTree = new ResourceTree<DocumentDiffItemViewModel, null>(null, rootUri);
	// A node holds one element, but several items can share a path: a deleted file `config` and an
	// added `config/settings.json`, or two diffs of the same file. Keep all items of each node.
	const filesByNode = new Map<FolderNode, DocumentDiffItemViewModel[]>();
	items.forEach((item, index) => {
		const uri = rootUri.with({ path: uris[index].path });
		resourceTree.add(uri, item);
		const node = resourceTree.getNode(uri)!;
		const files = filesByNode.get(node);
		if (files) {
			files.push(item);
		} else {
			filesByNode.set(node, [item]);
		}
	});

	const toElements = (folder: FolderNode): ICompressedTreeElement<FileListElement>[] => [...folder.children].flatMap(child => {
		const files = (filesByNode.get(child) ?? []).map(toFileElement);
		return child.childrenCount > 0 ? [...files, { element: child, children: toElements(child) }] : files;
	});
	return toElements(resourceTree.root);
}

/**
 * Lists the files of a {@link MultiDiffEditorWidget}, as a flat list or as a
 * tree of folders, both sorted like the Source Control view, and keeps its
 * selection on the file the user is looking at. Opening a file reveals it in
 * the widget. While the Source Control view shows structural changes, a file
 * expands to its structural changes, and opening one reveals it in the diff.
 */
export class MultiDiffEditorFileList extends Disposable {
	private readonly _tree: WorkbenchCompressibleObjectTree<FileListElement>;
	private readonly _structuralDiff: StructuralDiffModel<DocumentDiffItemViewModel>;
	/** The structural changes that the expanded files show. */
	private readonly _structuralChanges = new Map<DocumentDiffItemViewModel, readonly StructuralChange[]>();
	/** Files whose structural changes take long to load. Like in the Source Control view, their twistie shows that they load. */
	private readonly _slowItems = new Set<DocumentDiffItemViewModel>();
	private _renderedItems: readonly DocumentDiffItemViewModel[] = [];
	private _renderedViewMode: MultiDiffEditorFileListViewMode | undefined;
	private _visible = true;

	constructor(
		container: HTMLElement,
		private readonly _multiDiffEditorWidget: MultiDiffEditorWidget,
		private readonly _viewMode: IObservable<MultiDiffEditorFileListViewMode>,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ILabelService labelService: ILabelService,
		@ISCMViewService scmViewService: ISCMViewService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		const helpHintEnabled = observableConfigValue<boolean>(AccessibilityVerbositySettingId.MultiDiffEditorFileList, true, configurationService);
		const screenReaderOptimized = observableFromEvent(this, accessibilityService.onDidChangeScreenReaderOptimized, () => accessibilityService.isScreenReaderOptimized());
		const helpKeybinding = observableFromEvent(this, keybindingService.onDidUpdateKeybindings, () => keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel());
		const widgetAriaLabel = derived(this, reader => {
			const label = localize('multiDiffEditorFileList', "Changed Files");
			if (!helpHintEnabled.read(reader) || !screenReaderOptimized.read(reader)) {
				return label;
			}
			const keybinding = helpKeybinding.read(reader);
			return keybinding
				? localize('multiDiffEditorFileList.accessibilityHelp', "{0}, use {1} for accessibility help", label, keybinding)
				: localize('multiDiffEditorFileList.accessibilityHelpNoKb', "{0}, run the Open Accessibility Help command for more information", label);
		});

		this._structuralDiff = this._register(instantiationService.createInstance(StructuralDiffModel<DocumentDiffItemViewModel>, structuralDiffAdapter));
		this._register(createFileIconThemableTreeContainerScope(container, themeService));
		const labels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		this._tree = this._register(instantiationService.createInstance(
			WorkbenchCompressibleObjectTree<FileListElement>,
			'MultiDiffEditorFileList',
			container,
			new MultiDiffEditorFileListDelegate(),
			[
				new MultiDiffEditorFileRenderer(labels, labelService, () => this._viewMode.get(), item => this._slowItems.has(item)),
				new MultiDiffEditorFolderRenderer(labels, labelService),
				instantiationService.createInstance(SCMStructuralDiffRenderer),
			],
			{
				identityProvider: { getId: element => isFolder(element) ? `folder:${element.uri.toString()}` : isStructuralChange(element) ? element.id : element.getKey() },
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel,
					getCompressedNodeKeyboardNavigationLabel: elements => elements.map(getKeyboardNavigationLabel).join('/'),
				},
				accessibilityProvider: {
					getWidgetAriaLabel: () => widgetAriaLabel,
					getAriaLabel: element => {
						if (isFolder(element)) {
							return element.relativePath.substring(1);
						}
						if (isStructuralChange(element)) {
							return getSCMStructuralDiffAriaLabel(element);
						}
						const uri = getItemUri(element);
						return localize('multiDiffEditorFileList.item', "{0}, {1}, {2}", basename(uri), getFileStatusLabel(getFileStatus(element)), labelService.getUriLabel(dirname(uri), { relative: true }));
					},
				},
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				// A file that can expand shows its twistie before its structural changes are loaded.
				hideTwistiesOfChildlessElements: false,
				// Files and their structural changes open when clicked, so they only expand through their twistie.
				expandOnlyOnTwistieClick: element => !isFolder(element),
				twistieAdditionalCssClass: element => this._getTwistieCssClass(element),
			}
		));
		MultiDiffEditorFileListFocusedContext.bindTo(this._tree.contextKeyService);

		// A change of all files, such as turning structural changes on or off, renders the files again, which also updates
		// whether they keep their twistie space, see `_getTwistieCssClass`.
		this._register(this._structuralDiff.onDidChange(item => item ? this._updateStructuralChanges(item) : this._renderFiles()));
		this._register(this._tree.onDidChangeCollapseState(e => {
			const element = e.node.element;
			// A file whose structural changes turn out to be empty stops being collapsible, which needs no update.
			if (!element || isFolder(element) || isStructuralChange(element) || !e.node.collapsible) {
				return;
			}
			if (e.node.collapsed) {
				// Like in the Source Control view, a collapsed file keeps no structural changes and loads them again when it is expanded.
				this._structuralChanges.delete(element);
				this._tree.setChildren(element, []);
				this._structuralDiff.release(element);
			} else {
				this._loadStructuralChanges(element);
			}
		}));
		this._register(autorun(reader => this._structuralDiff.setEnabled(scmViewService.showStructuralDiff.read(reader))));

		const items = derived(this, reader => this._multiDiffEditorWidget.viewModel.read(reader)?.items.read(reader) ?? []);

		// The active item wins while it is on screen (e.g. a revealed file near the
		// end that cannot be scrolled to the top), otherwise the topmost visible item.
		const currentItem = derived(this, reader => {
			const activeItem = this._multiDiffEditorWidget.viewModel.read(reader)?.activeDiffItem.read(reader);
			const visibleItems = this._multiDiffEditorWidget.visibleDiffItems.read(reader);
			if (activeItem && visibleItems.includes(activeItem)) {
				return activeItem;
			}
			return visibleItems[0] ?? activeItem;
		});

		// A single autorun keeps the tree contents and selection consistent with each other.
		this._register(autorun(reader => {
			const currentItems = items.read(reader);
			const currentViewMode = this._viewMode.read(reader);
			const didRebuild = currentItems !== this._renderedItems || currentViewMode !== this._renderedViewMode;
			if (didRebuild) {
				const remaining = new Set(currentItems);
				this._structuralDiff.releaseWhere(item => !remaining.has(item));
				for (const item of this._structuralChanges.keys()) {
					if (!remaining.has(item)) {
						this._structuralChanges.delete(item);
					}
				}
				this._renderedItems = currentItems;
				this._renderedViewMode = currentViewMode;
				this._renderFiles();
			}

			const current = currentItem.read(reader);
			if (!current || !currentItems.includes(current)) {
				this._tree.setSelection([]);
				return;
			}
			// A selected structural change of the current file stays selected.
			const selected = this._tree.getSelection()[0];
			const selection = selected && isStructuralChange(selected) && selected.resource === current ? selected : current;
			if (didRebuild || selected !== selection) {
				this._tree.setSelection([selection]);
				this._tree.setFocus([selection]);
				this._tree.reveal(selection);
			}
		}));

		this._register(this._tree.onDidOpen(e => {
			if (!e.element || isFolder(e.element)) {
				return;
			}
			if (isStructuralChange(e.element)) {
				this._openStructuralChange(e.element, !!e.editorOptions.preserveFocus);
			} else {
				this._open(e.element, !!e.editorOptions.preserveFocus);
			}
		}));
	}

	/**
	 * Called when the editor of the list is shown or hidden. Like the Source Control view, a hidden list keeps no
	 * structural changes, so it loads those of its expanded files again when it is shown.
	 */
	setVisible(visible: boolean): void {
		if (this._visible === visible) {
			return;
		}
		this._visible = visible;
		this._structuralDiff.setVisible(visible);
		if (visible) {
			this._loadExpandedFiles();
		}
	}

	private _open(item: DocumentDiffItemViewModel, preserveFocus: boolean): void {
		const viewModel = this._multiDiffEditorWidget.viewModel.get();
		if (!viewModel || !viewModel.items.get().includes(item)) {
			return;
		}
		if (!preserveFocus && item.collapsed.get()) {
			viewModel.expand(item);
		}
		this._multiDiffEditorWidget.reveal({ original: item.originalUri, modified: item.modifiedUri }, { highlight: false });
		if (!preserveFocus) {
			this._multiDiffEditorWidget.focus();
		}
	}

	/** Reveals a structural change in the diff of its file, and selects it, which also shows it in a hidden unchanged region. */
	private _openStructuralChange(change: StructuralChange, preserveFocus: boolean): void {
		const item = change.resource;
		const viewModel = this._multiDiffEditorWidget.viewModel.get();
		if (change.type !== 'structuralDiff' || !this._structuralDiff.isCurrent(change) || !viewModel || !viewModel.items.get().includes(item)) {
			return;
		}
		if (item.collapsed.get()) {
			viewModel.expand(item);
		}
		const resource = { original: item.originalUri, modified: item.modifiedUri };
		this._multiDiffEditorWidget.reveal(resource, { highlight: false });
		const diffEditor = this._multiDiffEditorWidget.getActiveControl();
		if (!diffEditor) {
			return;
		}
		const { side, range } = getSCMStructuralDiffTarget(change, diffEditor.renderSideBySide);
		const editor = side === 'original' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
		editor.setSelection(range, TextEditorSelectionSource.NAVIGATION);
		this._multiDiffEditorWidget.reveal(resource, { range, side, highlight: false });
		if (!preserveFocus) {
			editor.focus();
		}
	}

	/**
	 * Structural changes always show an icon, so they keep their twistie space to indent their children under their
	 * parent's icon, and files that can expand keep their twistie when the file icon theme hides arrows, like file nests
	 * in the Explorer. A flat list has no folders whose twisties file icons align with, so while files can expand, all
	 * files keep their twistie space, so that their icons stay aligned.
	 */
	private _getTwistieCssClass(element: FileListElement): string | undefined {
		if (isStructuralChange(element)) {
			return 'force-twistie';
		}
		if (isFolder(element)) {
			return undefined;
		}
		const canExpandFiles = this._structuralDiff.enabled && this._structuralDiff.hasProvider.get();
		return this._structuralDiff.hasChildren(element) || (canExpandFiles && this._viewMode.get() === 'list') ? 'force-twistie' : undefined;
	}

	/**
	 * Renders the files with the structural changes that they show. Expanded files keep showing them while they load them
	 * again, for example after the provider changed, so that the list does not lose its scroll position.
	 */
	private _renderFiles(): void {
		if (this._renderedViewMode === undefined) {
			return;
		}
		this._tree.setChildren(null, getFileListElements(this._renderedItems, this._renderedViewMode, this._workspaceContextService, item => {
			const collapsible = this._structuralDiff.hasChildren(item);
			if (!collapsible) {
				this._structuralChanges.delete(item);
			}
			return {
				element: item,
				incompressible: true,
				collapsible,
				// Files are collapsed until the user expands them.
				collapsed: ObjectTreeElementCollapseState.PreserveOrCollapsed,
				children: this._structuralChanges.get(item)?.map(toStructuralChangeElement),
			};
		}));
		this._loadExpandedFiles();
	}

	/** Updates whether a file can expand and, if it is expanded, loads its structural changes again, for example after an edit. */
	private _updateStructuralChanges(item: DocumentDiffItemViewModel): void {
		if (!this._tree.hasElement(item)) {
			return;
		}
		const collapsible = this._structuralDiff.hasChildren(item);
		if (this._tree.isCollapsible(item) !== collapsible) {
			// An expanded file that becomes collapsible loads its structural changes through its collapse state change.
			this._tree.setCollapsible(item, collapsible);
		} else if (collapsible && !this._tree.isCollapsed(item)) {
			this._loadStructuralChanges(item);
		}
	}

	private _loadExpandedFiles(): void {
		for (const item of this._renderedItems) {
			if (this._tree.hasElement(item) && this._tree.isCollapsible(item) && !this._tree.isCollapsed(item)) {
				this._loadStructuralChanges(item);
			}
		}
	}

	private async _loadStructuralChanges(item: DocumentDiffItemViewModel): Promise<void> {
		const slowTimeout = disposableTimeout(() => this._setSlow(item, true), SLOW_LOAD_DELAY_MS, this._store);
		try {
			const changes = await this._structuralDiff.getChildren(item);
			// A file that was collapsed, edited or removed in the meantime loads its structural changes again when it is
			// expanded or after the edit. A load that was stopped, for example by an edit, yields no structural changes, while
			// the file still has some, so the file keeps showing its previous ones until then.
			const isCurrent = changes.length > 0 ? changes.every(change => this._structuralDiff.isCurrent(change)) : !this._structuralDiff.hasChildren(item);
			if (this._store.isDisposed || !isCurrent || !this._tree.hasElement(item) || this._tree.isCollapsed(item)) {
				return;
			}
			this._structuralChanges.set(item, changes);
			this._tree.setChildren(item, changes.map(toStructuralChangeElement));
		} catch (error) {
			onUnexpectedError(error);
		} finally {
			slowTimeout.dispose();
			this._setSlow(item, false);
		}
	}

	private _setSlow(item: DocumentDiffItemViewModel, slow: boolean): void {
		if (this._store.isDisposed || this._slowItems.has(item) === slow) {
			return;
		}
		if (slow) {
			this._slowItems.add(item);
		} else {
			this._slowItems.delete(item);
		}
		if (this._tree.hasElement(item)) {
			this._tree.rerender(item);
		}
	}

	layout(height: number, width: number): void {
		this._tree.layout(height, width);
	}

	focus(): void {
		if (this._tree.getFocus().length === 0) {
			const selection = this._tree.getSelection();
			if (selection.length > 0) {
				this._tree.setFocus(selection);
			} else {
				this._tree.focusFirst();
			}
		}
		this._tree.domFocus();
	}
}

class MultiDiffEditorFileListDelegate implements IListVirtualDelegate<FileListElement> {
	getHeight(): number {
		return 22;
	}

	getTemplateId(element: FileListElement): string {
		return isFolder(element) ? MultiDiffEditorFolderRenderer.TEMPLATE_ID : isStructuralChange(element) ? SCMStructuralDiffRenderer.TEMPLATE_ID : MultiDiffEditorFileRenderer.TEMPLATE_ID;
	}
}

interface IMultiDiffEditorFileTemplate {
	readonly label: IResourceLabel;
	readonly status: HTMLElement;
}

class MultiDiffEditorFileRenderer implements ICompressibleTreeRenderer<FileListElement, void, IMultiDiffEditorFileTemplate> {
	static readonly TEMPLATE_ID = 'multiDiffEditorFileListFile';

	readonly templateId = MultiDiffEditorFileRenderer.TEMPLATE_ID;

	constructor(
		private readonly _labels: ResourceLabels,
		private readonly _labelService: ILabelService,
		private readonly _getViewMode: () => MultiDiffEditorFileListViewMode,
		private readonly _isSlow: (item: DocumentDiffItemViewModel) => boolean,
	) { }

	renderTwistie(element: FileListElement, twistie: HTMLElement): boolean {
		const loading = ThemeIcon.asClassNameArray(Codicon.treeItemLoading);
		if (this._isSlow(element as DocumentDiffItemViewModel)) {
			twistie.classList.add(...loading);
			return true;
		}
		twistie.classList.remove(...loading);
		return false;
	}

	renderTemplate(container: HTMLElement): IMultiDiffEditorFileTemplate {
		container.classList.add('multi-diff-file-list-item');
		const label = this._labels.create(container);
		const status = append(container, $('.multi-diff-file-list-item-status'));
		return { label, status };
	}

	renderElement(node: ITreeNode<FileListElement, void>, _index: number, template: IMultiDiffEditorFileTemplate): void {
		const item = node.element as DocumentDiffItemViewModel;
		const uri = getItemUri(item);
		const status = getFileStatus(item);
		template.label.setFile(uri, {
			fileKind: FileKind.FILE,
			hidePath: this._getViewMode() === 'tree',
			strikethrough: status === MultiDiffFileStatus.Deleted,
			title: status === MultiDiffFileStatus.Renamed && item.originalUri
				? localize('multiDiffEditorFileList.renamedTitle', "{0} (renamed from {1})", this._labelService.getUriLabel(uri, { relative: true }), this._labelService.getUriLabel(item.originalUri, { relative: true }))
				: undefined,
		});
		template.status.textContent = getFileStatusLetter(status);
		template.status.dataset.status = status;
	}

	renderCompressedElements(): void {
		throw new Error('Should never happen since files are incompressible');
	}

	disposeTemplate(template: IMultiDiffEditorFileTemplate): void {
		template.label.dispose();
	}
}

class MultiDiffEditorFolderRenderer implements ICompressibleTreeRenderer<FileListElement, void, IResourceLabel> {
	static readonly TEMPLATE_ID = 'multiDiffEditorFileListFolder';

	readonly templateId = MultiDiffEditorFolderRenderer.TEMPLATE_ID;

	constructor(
		private readonly _labels: ResourceLabels,
		private readonly _labelService: ILabelService,
	) { }

	renderTemplate(container: HTMLElement): IResourceLabel {
		return this._labels.create(container);
	}

	renderElement(node: ITreeNode<FileListElement, void>, _index: number, label: IResourceLabel): void {
		const folder = node.element as FolderNode;
		label.setResource({ resource: folder.uri, name: folder.name }, { fileKind: FileKind.FOLDER });
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<FileListElement>, void>, _index: number, label: IResourceLabel): void {
		const folders = node.element.elements as FolderNode[];
		const folder = folders[folders.length - 1];
		label.setResource({ resource: folder.uri, name: folders.map(f => f.name) }, {
			fileKind: FileKind.FOLDER,
			separator: this._labelService.getSeparator(folder.uri.scheme),
		});
	}

	disposeTemplate(label: IResourceLabel): void {
		label.dispose();
	}
}
