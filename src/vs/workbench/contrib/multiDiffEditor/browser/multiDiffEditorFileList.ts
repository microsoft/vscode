/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ICompressedTreeElement, ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { commonPrefixLength } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { IResourceNode, ResourceTree } from '../../../../base/common/resourceTree.js';
import { URI } from '../../../../base/common/uri.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { DocumentDiffItemViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
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
import { MultiDiffEditorFileListFocusedContext, MultiDiffEditorFileListViewMode } from '../common/multiDiffEditor.js';

type FolderNode = IResourceNode<DocumentDiffItemViewModel, null>;
type FileListElement = DocumentDiffItemViewModel | FolderNode;

function isFolder(element: FileListElement): element is FolderNode {
	return ResourceTree.isResourceNode(element);
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

function getFileListElements(items: readonly DocumentDiffItemViewModel[], viewMode: MultiDiffEditorFileListViewMode, workspaceContextService: IWorkspaceContextService): ICompressedTreeElement<FileListElement>[] {
	if (viewMode === 'list' || items.length === 0) {
		return items.map(item => ({ element: item, incompressible: true }));
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
		const files: ICompressedTreeElement<FileListElement>[] = (filesByNode.get(child) ?? []).map(item => ({ element: item, incompressible: true }));
		return child.childrenCount > 0 ? [...files, { element: child, children: toElements(child) }] : files;
	});
	return toElements(resourceTree.root);
}

/**
 * Lists the files of a {@link MultiDiffEditorWidget}, as a flat list or as a
 * tree of folders, and keeps its selection on the file the user is looking at.
 * Opening a file reveals it in the widget.
 */
export class MultiDiffEditorFileList extends Disposable {
	private readonly _tree: WorkbenchCompressibleObjectTree<FileListElement>;

	constructor(
		container: HTMLElement,
		private readonly _multiDiffEditorWidget: MultiDiffEditorWidget,
		viewMode: IObservable<MultiDiffEditorFileListViewMode>,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ILabelService labelService: ILabelService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
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

		this._register(createFileIconThemableTreeContainerScope(container, themeService));
		const labels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		this._tree = this._register(instantiationService.createInstance(
			WorkbenchCompressibleObjectTree<FileListElement>,
			'MultiDiffEditorFileList',
			container,
			new MultiDiffEditorFileListDelegate(),
			[
				new MultiDiffEditorFileRenderer(labels, labelService, () => viewMode.get()),
				new MultiDiffEditorFolderRenderer(labels, labelService),
			],
			{
				identityProvider: { getId: element => isFolder(element) ? `folder:${element.uri.toString()}` : element.getKey() },
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: element => isFolder(element) ? element.name : basename(getItemUri(element)),
					getCompressedNodeKeyboardNavigationLabel: elements => elements.map(element => isFolder(element) ? element.name : basename(getItemUri(element))).join('/'),
				},
				accessibilityProvider: {
					getWidgetAriaLabel: () => widgetAriaLabel,
					getAriaLabel: element => {
						if (isFolder(element)) {
							return element.relativePath.substring(1);
						}
						const uri = getItemUri(element);
						return localize('multiDiffEditorFileList.item', "{0}, {1}, {2}", basename(uri), getFileStatusLabel(getFileStatus(element)), labelService.getUriLabel(dirname(uri), { relative: true }));
					},
				},
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				hideTwistiesOfChildlessElements: true,
			}
		));
		MultiDiffEditorFileListFocusedContext.bindTo(this._tree.contextKeyService);

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
		let renderedItems: readonly DocumentDiffItemViewModel[] = [];
		let renderedViewMode: MultiDiffEditorFileListViewMode | undefined;
		this._register(autorun(reader => {
			const currentItems = items.read(reader);
			const currentViewMode = viewMode.read(reader);
			const didRebuild = currentItems !== renderedItems || currentViewMode !== renderedViewMode;
			if (didRebuild) {
				renderedItems = currentItems;
				renderedViewMode = currentViewMode;
				this._tree.setChildren(null, getFileListElements(currentItems, currentViewMode, workspaceContextService));
			}

			const current = currentItem.read(reader);
			if (!current || !currentItems.includes(current)) {
				this._tree.setSelection([]);
				return;
			}
			if (didRebuild || this._tree.getSelection()[0] !== current) {
				this._tree.setSelection([current]);
				this._tree.setFocus([current]);
				this._tree.reveal(current);
			}
		}));

		this._register(this._tree.onDidOpen(e => {
			if (e.element && !isFolder(e.element)) {
				this._open(e.element, !!e.editorOptions.preserveFocus);
			}
		}));
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
		return isFolder(element) ? MultiDiffEditorFolderRenderer.TEMPLATE_ID : MultiDiffEditorFileRenderer.TEMPLATE_ID;
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
	) { }

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
