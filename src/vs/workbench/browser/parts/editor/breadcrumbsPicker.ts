/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { compareFileNames } from 'vs/base/common/comparers';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import * as glob from 'vs/base/common/glob';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { posix } from 'vs/base/common/path';
import { basename, dirname, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/breadcrumbscontrol';
import { OutlineElement, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { FileKind, IFileService, IFileStat } from 'vs/platform/files/common/files';
import { IConstructorSignature1, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchDataTree, WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { breadcrumbsPickerBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ResourceLabels, IResourceLabel, DEFAULT_LABELS_CONTAINER } from 'vs/workbench/browser/labels';
import { BreadcrumbsConfig } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { BreadcrumbElement, FileElement } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { IFileIconTheme, IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IAsyncDataSource, ITreeRenderer, ITreeNode, ITreeFilter, TreeVisibility, ITreeSorter } from 'vs/base/browser/ui/tree/tree';
import { OutlineVirtualDelegate, OutlineGroupRenderer, OutlineElementRenderer, OutlineItemComparator, OutlineIdentityProvider, OutlineNavigationLabelProvider, OutlineDataSource, OutlineSortOrder } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { IIdentityProvider, IListVirtualDelegate, IKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/list/list';

export function createBreadcrumbsPicker(instantiationService: IInstantiationService, parent: HTMLElement, element: BreadcrumbElement): BreadcrumbsPicker {
	const ctor: IConstructorSignature1<HTMLElement, BreadcrumbsPicker> = element instanceof FileElement
		? BreadcrumbsFilePicker
		: BreadcrumbsOutlinePicker;

	return instantiationService.createInstance(ctor, parent);
}

interface ILayoutInfo {
	maxHeight: number;
	width: number;
	arrowSize: number;
	arrowOffset: number;
	inputHeight: number;
}

type Tree<I, E> = WorkbenchDataTree<I, E, FuzzyScore> | WorkbenchAsyncDataTree<I, E, FuzzyScore>;

export interface SelectEvent {
	target: any;
	browserEvent: UIEvent;
}

export abstract class BreadcrumbsPicker {

	protected readonly _disposables = new DisposableStore();
	protected readonly _domNode: HTMLDivElement;
	protected _arrow!: HTMLDivElement;
	protected _treeContainer!: HTMLDivElement;
	protected _tree!: Tree<any, any>;
	protected _fakeEvent = new UIEvent('fakeEvent');
	protected _layoutInfo!: ILayoutInfo;

	private readonly _onDidPickElement = new Emitter<SelectEvent>();
	readonly onDidPickElement: Event<SelectEvent> = this._onDidPickElement.event;

	private readonly _onDidFocusElement = new Emitter<SelectEvent>();
	readonly onDidFocusElement: Event<SelectEvent> = this._onDidFocusElement.event;

	constructor(
		parent: HTMLElement,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IWorkbenchThemeService protected readonly _themeService: IWorkbenchThemeService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-breadcrumbs-picker show-file-icons';
		parent.appendChild(this._domNode);
	}

	dispose(): void {
		this._disposables.dispose();
		this._onDidPickElement.dispose();
		this._tree.dispose();
	}

	show(input: any, maxHeight: number, width: number, arrowSize: number, arrowOffset: number): void {

		const theme = this._themeService.getTheme();
		const color = theme.getColor(breadcrumbsPickerBackground);

		this._arrow = document.createElement('div');
		this._arrow.className = 'arrow';
		this._arrow.style.borderColor = `transparent transparent ${color ? color.toString() : ''}`;
		this._domNode.appendChild(this._arrow);

		this._treeContainer = document.createElement('div');
		this._treeContainer.style.background = color ? color.toString() : '';
		this._treeContainer.style.paddingTop = '2px';
		this._treeContainer.style.boxShadow = `0px 5px 8px ${this._themeService.getTheme().getColor(widgetShadow)}`;
		this._domNode.appendChild(this._treeContainer);

		this._layoutInfo = { maxHeight, width, arrowSize, arrowOffset, inputHeight: 0 };
		this._tree = this._createTree(this._treeContainer);

		this._disposables.add(this._tree.onDidChangeSelection(e => {
			if (e.browserEvent !== this._fakeEvent) {
				const target = this._getTargetFromEvent(e.elements[0]);
				if (target) {
					setTimeout(_ => {// need to debounce here because this disposes the tree and the tree doesn't like to be disposed on click
						this._onDidPickElement.fire({ target, browserEvent: e.browserEvent || new UIEvent('fake') });
					}, 0);
				}
			}
		}));
		this._disposables.add(this._tree.onDidChangeFocus(e => {
			const target = this._getTargetFromEvent(e.elements[0]);
			if (target) {
				this._onDidFocusElement.fire({ target, browserEvent: e.browserEvent || new UIEvent('fake') });
			}
		}));
		this._disposables.add(this._tree.onDidChangeContentHeight(() => {
			this._layout();
		}));

		this._domNode.focus();

		this._setInput(input).then(() => {
			this._layout();
		}).catch(onUnexpectedError);
	}

	protected _layout(): void {

		const headerHeight = 2 * this._layoutInfo.arrowSize;
		const treeHeight = Math.min(this._layoutInfo.maxHeight - headerHeight, this._tree.contentHeight);
		const totalHeight = treeHeight + headerHeight;

		this._domNode.style.height = `${totalHeight}px`;
		this._domNode.style.width = `${this._layoutInfo.width}px`;
		this._arrow.style.top = `-${2 * this._layoutInfo.arrowSize}px`;
		this._arrow.style.borderWidth = `${this._layoutInfo.arrowSize}px`;
		this._arrow.style.marginLeft = `${this._layoutInfo.arrowOffset}px`;
		this._treeContainer.style.height = `${treeHeight}px`;
		this._treeContainer.style.width = `${this._layoutInfo.width}px`;
		this._tree.layout(treeHeight, this._layoutInfo.width);

	}

	get useAltAsMultipleSelectionModifier() {
		return this._tree.useAltAsMultipleSelectionModifier;
	}

	protected abstract _setInput(element: BreadcrumbElement): Promise<void>;
	protected abstract _createTree(container: HTMLElement): Tree<any, any>;
	protected abstract _getTargetFromEvent(element: any): any | undefined;
}

//#region - Files

class FileVirtualDelegate implements IListVirtualDelegate<IFileStat | IWorkspaceFolder> {
	getHeight(_element: IFileStat | IWorkspaceFolder) {
		return 22;
	}
	getTemplateId(_element: IFileStat | IWorkspaceFolder): string {
		return 'FileStat';
	}
}

class FileIdentityProvider implements IIdentityProvider<IWorkspace | IWorkspaceFolder | IFileStat | URI> {
	getId(element: IWorkspace | IWorkspaceFolder | IFileStat | URI): { toString(): string; } {
		if (URI.isUri(element)) {
			return element.toString();
		} else if (IWorkspace.isIWorkspace(element)) {
			return element.id;
		} else if (IWorkspaceFolder.isIWorkspaceFolder(element)) {
			return element.uri.toString();
		} else {
			return element.resource.toString();
		}
	}
}


class FileDataSource implements IAsyncDataSource<IWorkspace | URI, IWorkspaceFolder | IFileStat> {

	private readonly _parents = new WeakMap<object, IWorkspaceFolder | IFileStat>();

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) { }

	hasChildren(element: IWorkspace | URI | IWorkspaceFolder | IFileStat): boolean {
		return URI.isUri(element)
			|| IWorkspace.isIWorkspace(element)
			|| IWorkspaceFolder.isIWorkspaceFolder(element)
			|| element.isDirectory;
	}

	getChildren(element: IWorkspace | URI | IWorkspaceFolder | IFileStat): Promise<(IWorkspaceFolder | IFileStat)[]> {

		if (IWorkspace.isIWorkspace(element)) {
			return Promise.resolve(element.folders).then(folders => {
				for (let child of folders) {
					this._parents.set(element, child);
				}
				return folders;
			});
		}
		let uri: URI;
		if (IWorkspaceFolder.isIWorkspaceFolder(element)) {
			uri = element.uri;
		} else if (URI.isUri(element)) {
			uri = element;
		} else {
			uri = element.resource;
		}
		return this._fileService.resolve(uri).then(stat => {
			for (const child of stat.children || []) {
				this._parents.set(stat, child);
			}
			return stat.children || [];
		});
	}
}

class FileRenderer implements ITreeRenderer<IFileStat | IWorkspaceFolder, FuzzyScore, IResourceLabel> {

	readonly templateId: string = 'FileStat';

	constructor(
		private readonly _labels: ResourceLabels,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) { }


	renderTemplate(container: HTMLElement): IResourceLabel {
		return this._labels.create(container, { supportHighlights: true });
	}

	renderElement(node: ITreeNode<IWorkspaceFolder | IFileStat, [number, number, number]>, index: number, templateData: IResourceLabel): void {
		const fileDecorations = this._configService.getValue<{ colors: boolean, badges: boolean }>('explorer.decorations');
		const { element } = node;
		let resource: URI;
		let fileKind: FileKind;
		if (IWorkspaceFolder.isIWorkspaceFolder(element)) {
			resource = element.uri;
			fileKind = FileKind.ROOT_FOLDER;
		} else {
			resource = element.resource;
			fileKind = element.isDirectory ? FileKind.FOLDER : FileKind.FILE;
		}
		templateData.setFile(resource, {
			fileKind,
			hidePath: true,
			fileDecorations: fileDecorations,
			matches: createMatches(node.filterData),
			extraClasses: ['picker-item']
		});
	}

	disposeTemplate(templateData: IResourceLabel): void {
		templateData.dispose();
	}
}

class FileNavigationLabelProvider implements IKeyboardNavigationLabelProvider<IWorkspaceFolder | IFileStat> {

	getKeyboardNavigationLabel(element: IWorkspaceFolder | IFileStat): { toString(): string; } {
		return element.name;
	}
}

class FileFilter implements ITreeFilter<IWorkspaceFolder | IFileStat> {

	private readonly _cachedExpressions = new Map<string, glob.ParsedExpression>();
	private readonly _disposables = new DisposableStore();

	constructor(
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IConfigurationService configService: IConfigurationService,
	) {
		const config = BreadcrumbsConfig.FileExcludes.bindTo(configService);
		const update = () => {
			_workspaceService.getWorkspace().folders.forEach(folder => {
				const excludesConfig = config.getValue({ resource: folder.uri });
				if (!excludesConfig) {
					return;
				}
				// adjust patterns to be absolute in case they aren't
				// free floating (**/)
				const adjustedConfig: glob.IExpression = {};
				for (const pattern in excludesConfig) {
					if (typeof excludesConfig[pattern] !== 'boolean') {
						continue;
					}
					let patternAbs = pattern.indexOf('**/') !== 0
						? posix.join(folder.uri.path, pattern)
						: pattern;

					adjustedConfig[patternAbs] = excludesConfig[pattern];
				}
				this._cachedExpressions.set(folder.uri.toString(), glob.parse(adjustedConfig));
			});
		};
		update();
		this._disposables.add(config);
		this._disposables.add(config.onDidChange(update));
		this._disposables.add(_workspaceService.onDidChangeWorkspaceFolders(update));
	}

	dispose(): void {
		this._disposables.dispose();
	}

	filter(element: IWorkspaceFolder | IFileStat, _parentVisibility: TreeVisibility): boolean {
		if (IWorkspaceFolder.isIWorkspaceFolder(element)) {
			// not a file
			return true;
		}
		const folder = this._workspaceService.getWorkspaceFolder(element.resource);
		if (!folder || !this._cachedExpressions.has(folder.uri.toString())) {
			// no folder or no filer
			return true;
		}

		const expression = this._cachedExpressions.get(folder.uri.toString())!;
		return !expression(element.resource.path, basename(element.resource));
	}
}


export class FileSorter implements ITreeSorter<IFileStat | IWorkspaceFolder> {
	compare(a: IFileStat | IWorkspaceFolder, b: IFileStat | IWorkspaceFolder): number {
		if (IWorkspaceFolder.isIWorkspaceFolder(a) && IWorkspaceFolder.isIWorkspaceFolder(b)) {
			return a.index - b.index;
		}
		if ((a as IFileStat).isDirectory === (b as IFileStat).isDirectory) {
			// same type -> compare on names
			return compareFileNames(a.name, b.name);
		} else if ((a as IFileStat).isDirectory) {
			return -1;
		} else {
			return 1;
		}
	}
}

export class BreadcrumbsFilePicker extends BreadcrumbsPicker {

	constructor(
		parent: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@IConfigurationService configService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
	) {
		super(parent, instantiationService, themeService, configService);
	}

	_createTree(container: HTMLElement) {

		// tree icon theme specials
		dom.addClass(this._treeContainer, 'file-icon-themable-tree');
		dom.addClass(this._treeContainer, 'show-file-icons');
		const onFileIconThemeChange = (fileIconTheme: IFileIconTheme) => {
			dom.toggleClass(this._treeContainer, 'align-icons-and-twisties', fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
			dom.toggleClass(this._treeContainer, 'hide-arrows', fileIconTheme.hidesExplorerArrows === true);
		};
		this._disposables.add(this._themeService.onDidFileIconThemeChange(onFileIconThemeChange));
		onFileIconThemeChange(this._themeService.getFileIconTheme());

		const labels = this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER /* TODO@Jo visibility propagation */);
		this._disposables.add(labels);

		return this._instantiationService.createInstance(WorkbenchAsyncDataTree, container, new FileVirtualDelegate(), [this._instantiationService.createInstance(FileRenderer, labels)], this._instantiationService.createInstance(FileDataSource), {
			multipleSelectionSupport: false,
			sorter: new FileSorter(),
			filter: this._instantiationService.createInstance(FileFilter),
			identityProvider: new FileIdentityProvider(),
			keyboardNavigationLabelProvider: new FileNavigationLabelProvider()
		});
	}

	_setInput(element: BreadcrumbElement): Promise<void> {
		const { uri, kind } = (element as FileElement);
		let input: IWorkspace | URI;
		if (kind === FileKind.ROOT_FOLDER) {
			input = this._workspaceService.getWorkspace();
		} else {
			input = dirname(uri);
		}

		const tree = this._tree as WorkbenchAsyncDataTree<IWorkspace | URI, IWorkspaceFolder | IFileStat, FuzzyScore>;
		return tree.setInput(input).then(() => {
			let focusElement: IWorkspaceFolder | IFileStat | undefined;
			for (const { element } of tree.getNode().children) {
				if (IWorkspaceFolder.isIWorkspaceFolder(element) && isEqual(element.uri, uri)) {
					focusElement = element;
					break;
				} else if (isEqual((element as IFileStat).resource, uri)) {
					focusElement = element as IFileStat;
					break;
				}
			}
			if (focusElement) {
				tree.reveal(focusElement, 0.5);
				tree.setFocus([focusElement], this._fakeEvent);
			}
			tree.domFocus();
		});
	}

	protected _getTargetFromEvent(element: any): any | undefined {
		// todo@joh
		if (element && !IWorkspaceFolder.isIWorkspaceFolder(element) && !(element as IFileStat).isDirectory) {
			return new FileElement((element as IFileStat).resource, FileKind.FILE);
		}
	}
}
//#endregion

//#region - Symbols

export class BreadcrumbsOutlinePicker extends BreadcrumbsPicker {

	protected readonly _symbolSortOrder: BreadcrumbsConfig<'position' | 'name' | 'type'>;

	constructor(
		parent: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(parent, instantiationService, themeService, configurationService);
		this._symbolSortOrder = BreadcrumbsConfig.SymbolSortOrder.bindTo(this._configurationService);
	}

	protected _createTree(container: HTMLElement) {
		return this._instantiationService.createInstance(
			WorkbenchDataTree,
			container,
			new OutlineVirtualDelegate(),
			[new OutlineGroupRenderer(), this._instantiationService.createInstance(OutlineElementRenderer)],
			new OutlineDataSource(),
			{
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				sorter: new OutlineItemComparator(this._getOutlineItemCompareType()),
				identityProvider: new OutlineIdentityProvider(),
				keyboardNavigationLabelProvider: new OutlineNavigationLabelProvider()
			}
		);
	}

	dispose(): void {
		this._symbolSortOrder.dispose();
		super.dispose();
	}

	protected _setInput(input: BreadcrumbElement): Promise<void> {
		const element = input as TreeElement;
		const model = OutlineModel.get(element)!;
		const tree = this._tree as WorkbenchDataTree<OutlineModel, any, FuzzyScore>;
		tree.setInput(model);

		let focusElement: TreeElement;
		if (element === model) {
			focusElement = tree.navigate().first();
		} else {
			focusElement = element;
		}
		tree.reveal(focusElement, 0.5);
		tree.setFocus([focusElement], this._fakeEvent);
		tree.domFocus();

		return Promise.resolve();
	}

	protected _getTargetFromEvent(element: any): any | undefined {
		if (element instanceof OutlineElement) {
			return element;
		}
	}

	private _getOutlineItemCompareType(): OutlineSortOrder {
		switch (this._symbolSortOrder.getValue()) {
			case 'name':
				return OutlineSortOrder.ByName;
			case 'type':
				return OutlineSortOrder.ByKind;
			case 'position':
			default:
				return OutlineSortOrder.ByPosition;
		}
	}
}

//#endregion
