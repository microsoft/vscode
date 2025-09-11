/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareFileNames } from '../../../../base/common/comparers.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createMatches, FuzzyScore } from '../../../../base/common/filters.js';
import * as glob from '../../../../base/common/glob.js';
import { IDisposable, DisposableStore, MutableDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { posix, relative } from '../../../../base/common/path.js';
import { basename, dirname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import './media/breadcrumbscontrol.css';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileKind, IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchDataTree, WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { breadcrumbsPickerBackground, widgetBorder, widgetShadow } from '../../../../platform/theme/common/colorRegistry.js';
import { isWorkspace, isWorkspaceFolder, IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { ResourceLabels, IResourceLabel, DEFAULT_LABELS_CONTAINER } from '../../labels.js';
import { BreadcrumbsConfig } from './breadcrumbs.js';
import { OutlineElement2, FileElement } from './breadcrumbsModel.js';
import { IAsyncDataSource, ITreeRenderer, ITreeNode, ITreeFilter, TreeVisibility, ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { IIdentityProvider, IListVirtualDelegate, IKeyboardNavigationLabelProvider } from '../../../../base/browser/ui/list/list.js';
import { IFileIconTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { localize } from '../../../../nls.js';
import { IOutline, IOutlineComparator } from '../../../services/outline/browser/outline.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';

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

	protected readonly _onWillPickElement = new Emitter<void>();
	readonly onWillPickElement: Event<void> = this._onWillPickElement.event;

	private readonly _previewDispoables = new MutableDisposable();

	constructor(
		parent: HTMLElement,
		protected resource: URI,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IThemeService protected readonly _themeService: IThemeService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-breadcrumbs-picker show-file-icons';
		parent.appendChild(this._domNode);
	}

	dispose(): void {
		this._disposables.dispose();
		this._previewDispoables.dispose();
		this._onWillPickElement.dispose();
		this._domNode.remove();
		setTimeout(() => this._tree.dispose(), 0); // tree cannot be disposed while being opened...
	}

	async show(input: FileElement | OutlineElement2, maxHeight: number, width: number, arrowSize: number, arrowOffset: number): Promise<void> {

		const theme = this._themeService.getColorTheme();
		const color = theme.getColor(breadcrumbsPickerBackground);

		this._arrow = document.createElement('div');
		this._arrow.className = 'arrow';
		this._arrow.style.borderColor = `transparent transparent ${color ? color.toString() : ''}`;
		this._domNode.appendChild(this._arrow);

		this._treeContainer = document.createElement('div');
		this._treeContainer.style.background = color ? color.toString() : '';
		this._treeContainer.style.paddingTop = '2px';
		this._treeContainer.style.borderRadius = '3px';
		this._treeContainer.style.boxShadow = `0 0 8px 2px ${this._themeService.getColorTheme().getColor(widgetShadow)}`;
		this._treeContainer.style.border = `1px solid ${this._themeService.getColorTheme().getColor(widgetBorder)}`;
		this._domNode.appendChild(this._treeContainer);

		this._layoutInfo = { maxHeight, width, arrowSize, arrowOffset, inputHeight: 0 };
		this._tree = this._createTree(this._treeContainer, input);

		this._disposables.add(this._tree.onDidOpen(async e => {
			const { element, editorOptions, sideBySide } = e;
			const didReveal = await this._revealElement(element, { ...editorOptions, preserveFocus: false }, sideBySide);
			if (!didReveal) {
				return;
			}
		}));
		this._disposables.add(this._tree.onDidChangeFocus(e => {
			this._previewDispoables.value = this._previewElement(e.elements[0]);
		}));
		this._disposables.add(this._tree.onDidChangeContentHeight(() => {
			this._layout();
		}));

		this._domNode.focus();
		try {
			await this._setInput(input);
			this._layout();
		} catch (err) {
			onUnexpectedError(err);
		}
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

	restoreViewState(): void { }

	protected abstract _setInput(element: FileElement | OutlineElement2): Promise<void>;
	protected abstract _createTree(container: HTMLElement, input: any): Tree<any, any>;
	protected abstract _previewElement(element: any): IDisposable;
	protected abstract _revealElement(element: any, options: IEditorOptions, sideBySide: boolean): Promise<boolean>;

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
	getId(element: IWorkspace | IWorkspaceFolder | IFileStat | URI): { toString(): string } {
		if (URI.isUri(element)) {
			return element.toString();
		} else if (isWorkspace(element)) {
			return element.id;
		} else if (isWorkspaceFolder(element)) {
			return element.uri.toString();
		} else {
			return element.resource.toString();
		}
	}
}


class FileDataSource implements IAsyncDataSource<IWorkspace | URI, IWorkspaceFolder | IFileStat> {

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) { }

	hasChildren(element: IWorkspace | URI | IWorkspaceFolder | IFileStat): boolean {
		return URI.isUri(element)
			|| isWorkspace(element)
			|| isWorkspaceFolder(element)
			|| element.isDirectory;
	}

	async getChildren(element: IWorkspace | URI | IWorkspaceFolder | IFileStat): Promise<(IWorkspaceFolder | IFileStat)[]> {
		if (isWorkspace(element)) {
			return element.folders;
		}
		let uri: URI;
		if (isWorkspaceFolder(element)) {
			uri = element.uri;
		} else if (URI.isUri(element)) {
			uri = element;
		} else {
			uri = element.resource;
		}
		const stat = await this._fileService.resolve(uri);
		return stat.children ?? [];
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
		const fileDecorations = this._configService.getValue<{ colors: boolean; badges: boolean }>('explorer.decorations');
		const { element } = node;
		let resource: URI;
		let fileKind: FileKind;
		if (isWorkspaceFolder(element)) {
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

	getKeyboardNavigationLabel(element: IWorkspaceFolder | IFileStat): { toString(): string } {
		return element.name;
	}
}

class FileAccessibilityProvider implements IListAccessibilityProvider<IWorkspaceFolder | IFileStat> {

	getWidgetAriaLabel(): string {
		return localize('breadcrumbs', "Breadcrumbs");
	}

	getAriaLabel(element: IWorkspaceFolder | IFileStat): string | null {
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
					const patternAbs = pattern.indexOf('**/') !== 0
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
		if (isWorkspaceFolder(element)) {
			// not a file
			return true;
		}
		const folder = this._workspaceService.getWorkspaceFolder(element.resource);
		if (!folder || !this._cachedExpressions.has(folder.uri.toString())) {
			// no folder or no filer
			return true;
		}

		const expression = this._cachedExpressions.get(folder.uri.toString())!;
		return !expression(relative(folder.uri.path, element.resource.path), basename(element.resource));
	}
}


export class FileSorter implements ITreeSorter<IFileStat | IWorkspaceFolder> {
	compare(a: IFileStat | IWorkspaceFolder, b: IFileStat | IWorkspaceFolder): number {
		if (isWorkspaceFolder(a) && isWorkspaceFolder(b)) {
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
		resource: URI,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super(parent, resource, instantiationService, themeService, configService);
	}

	protected _createTree(container: HTMLElement) {

		// tree icon theme specials
		this._treeContainer.classList.add('file-icon-themable-tree');
		this._treeContainer.classList.add('show-file-icons');
		const onFileIconThemeChange = (fileIconTheme: IFileIconTheme) => {
			this._treeContainer.classList.toggle('align-icons-and-twisties', fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
			this._treeContainer.classList.toggle('hide-arrows', fileIconTheme.hidesExplorerArrows === true);
		};
		this._disposables.add(this._themeService.onDidFileIconThemeChange(onFileIconThemeChange));
		onFileIconThemeChange(this._themeService.getFileIconTheme());

		const labels = this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER /* TODO@Jo visibility propagation */);
		this._disposables.add(labels);

		return this._instantiationService.createInstance(
			WorkbenchAsyncDataTree<IWorkspace | URI, IWorkspaceFolder | IFileStat, FuzzyScore>,
			'BreadcrumbsFilePicker',
			container,
			new FileVirtualDelegate(),
			[this._instantiationService.createInstance(FileRenderer, labels)],
			this._instantiationService.createInstance(FileDataSource),
			{
				multipleSelectionSupport: false,
				sorter: new FileSorter(),
				filter: this._instantiationService.createInstance(FileFilter),
				identityProvider: new FileIdentityProvider(),
				keyboardNavigationLabelProvider: new FileNavigationLabelProvider(),
				accessibilityProvider: this._instantiationService.createInstance(FileAccessibilityProvider),
				showNotFoundMessage: false,
				overrideStyles: {
					listBackground: breadcrumbsPickerBackground
				},
			});
	}

	protected async _setInput(element: FileElement | OutlineElement2): Promise<void> {
		const { uri, kind } = (element as FileElement);
		let input: IWorkspace | URI;
		if (kind === FileKind.ROOT_FOLDER) {
			input = this._workspaceService.getWorkspace();
		} else {
			input = dirname(uri);
		}

		const tree = this._tree as WorkbenchAsyncDataTree<IWorkspace | URI, IWorkspaceFolder | IFileStat, FuzzyScore>;
		await tree.setInput(input);
		let focusElement: IWorkspaceFolder | IFileStat | undefined;
		for (const { element } of tree.getNode().children) {
			if (isWorkspaceFolder(element) && isEqual(element.uri, uri)) {
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
	}

	protected _previewElement(_element: any): IDisposable {
		return Disposable.None;
	}

	protected async _revealElement(element: IFileStat | IWorkspaceFolder, options: IEditorOptions, sideBySide: boolean): Promise<boolean> {
		if (!isWorkspaceFolder(element) && element.isFile) {
			this._onWillPickElement.fire();
			await this._editorService.openEditor({ resource: element.resource, options }, sideBySide ? SIDE_GROUP : undefined);
			return true;
		}
		return false;
	}
}
//#endregion

//#region - Outline

class OutlineTreeSorter<E> implements ITreeSorter<E> {

	private _order: 'name' | 'type' | 'position';

	constructor(
		private comparator: IOutlineComparator<E>,
		uri: URI | undefined,
		@ITextResourceConfigurationService configService: ITextResourceConfigurationService,
	) {
		this._order = configService.getValue(uri, 'breadcrumbs.symbolSortOrder');
	}

	compare(a: E, b: E): number {
		if (this._order === 'name') {
			return this.comparator.compareByName(a, b);
		} else if (this._order === 'type') {
			return this.comparator.compareByType(a, b);
		} else {
			return this.comparator.compareByPosition(a, b);
		}
	}
}

export class BreadcrumbsOutlinePicker extends BreadcrumbsPicker {

	protected _createTree(container: HTMLElement, input: OutlineElement2) {

		const { config } = input.outline;

		return this._instantiationService.createInstance(
			WorkbenchDataTree<IOutline<any>, any, FuzzyScore>,
			'BreadcrumbsOutlinePicker',
			container,
			config.delegate,
			config.renderers,
			config.treeDataSource,
			{
				...config.options,
				sorter: this._instantiationService.createInstance(OutlineTreeSorter, config.comparator, undefined),
				collapseByDefault: true,
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				showNotFoundMessage: false
			}
		);
	}

	protected _setInput(input: OutlineElement2): Promise<void> {

		const viewState = input.outline.captureViewState();
		this.restoreViewState = () => { viewState.dispose(); };

		const tree = this._tree as WorkbenchDataTree<IOutline<any>, any, FuzzyScore>;

		tree.setInput(input.outline);
		if (input.element !== input.outline) {
			tree.reveal(input.element, 0.5);
			tree.setFocus([input.element], this._fakeEvent);
		}
		tree.domFocus();

		return Promise.resolve();
	}

	protected _previewElement(element: any): IDisposable {
		const outline: IOutline<any> = this._tree.getInput();
		return outline.preview(element);
	}

	protected async _revealElement(element: any, options: IEditorOptions, sideBySide: boolean): Promise<boolean> {
		this._onWillPickElement.fire();
		const outline: IOutline<any> = this._tree.getInput();
		await outline.reveal(element, options, sideBySide, false);
		return true;
	}
}

//#endregion
