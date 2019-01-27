/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onDidChangeZoomLevel } from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { compareFileNames } from 'vs/base/common/comparers';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { createMatches, FuzzyScore, fuzzyScore } from 'vs/base/common/filters';
import * as glob from 'vs/base/common/glob';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { join } from 'vs/base/common/paths';
import { basename, dirname, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IDataSource, IFilter, IRenderer, ISorter, ITree } from 'vs/base/parts/tree/browser/tree';
import 'vs/css!./media/breadcrumbscontrol';
import { OutlineElement, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { OutlineDataSource, OutlineItemComparator, OutlineRenderer, OutlineItemCompareType } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { FileKind, IFileService, IFileStat } from 'vs/platform/files/common/files';
import { IConstructorSignature1, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { HighlightingWorkbenchTree, IHighlighter, IHighlightingTreeConfiguration, IHighlightingTreeOptions } from 'vs/platform/list/browser/listService';
import { breadcrumbsPickerBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ResourceLabels, IResourceLabel, DEFAULT_LABELS_CONTAINER } from 'vs/workbench/browser/labels';
import { BreadcrumbsConfig } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { BreadcrumbElement, FileElement } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { IFileIconTheme, IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';

export function createBreadcrumbsPicker(instantiationService: IInstantiationService, parent: HTMLElement, element: BreadcrumbElement): BreadcrumbsPicker {
	let ctor: IConstructorSignature1<HTMLElement, BreadcrumbsPicker> = element instanceof FileElement ? BreadcrumbsFilePicker : BreadcrumbsOutlinePicker;
	return instantiationService.createInstance(ctor, parent);
}

interface ILayoutInfo {
	maxHeight: number;
	width: number;
	arrowSize: number;
	arrowOffset: number;
	inputHeight: number;
}

export abstract class BreadcrumbsPicker {

	protected readonly _disposables = new Array<IDisposable>();
	protected readonly _domNode: HTMLDivElement;
	protected readonly _arrow: HTMLDivElement;
	protected readonly _treeContainer: HTMLDivElement;
	protected readonly _tree: HighlightingWorkbenchTree;
	protected readonly _focus: dom.IFocusTracker;
	protected readonly _symbolSortOrder: BreadcrumbsConfig<'position' | 'name' | 'type'>;
	private _layoutInfo: ILayoutInfo;

	private readonly _onDidPickElement = new Emitter<{ target: any, payload: any }>();
	readonly onDidPickElement: Event<{ target: any, payload: any }> = this._onDidPickElement.event;

	private readonly _onDidFocusElement = new Emitter<{ target: any, payload: any }>();
	readonly onDidFocusElement: Event<{ target: any, payload: any }> = this._onDidFocusElement.event;

	constructor(
		parent: HTMLElement,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IWorkbenchThemeService protected readonly _themeService: IWorkbenchThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-breadcrumbs-picker show-file-icons';
		parent.appendChild(this._domNode);

		this._focus = dom.trackFocus(this._domNode);
		this._focus.onDidBlur(_ => this._onDidPickElement.fire({ target: undefined, payload: undefined }), undefined, this._disposables);
		this._disposables.push(onDidChangeZoomLevel(_ => this._onDidPickElement.fire({ target: undefined, payload: undefined })));

		const theme = this._themeService.getTheme();
		const color = theme.getColor(breadcrumbsPickerBackground);

		this._arrow = document.createElement('div');
		this._arrow.className = 'arrow';
		this._arrow.style.borderColor = `transparent transparent ${color.toString()}`;
		this._domNode.appendChild(this._arrow);

		this._treeContainer = document.createElement('div');
		this._treeContainer.style.background = color.toString();
		this._treeContainer.style.paddingTop = '2px';
		this._treeContainer.style.boxShadow = `0px 5px 8px ${this._themeService.getTheme().getColor(widgetShadow)}`;
		this._domNode.appendChild(this._treeContainer);

		this._symbolSortOrder = BreadcrumbsConfig.SymbolSortOrder.bindTo(this._configurationService);

		const filterConfig = BreadcrumbsConfig.FilterOnType.bindTo(this._configurationService);
		this._disposables.push(filterConfig);

		const treeConfig = this._completeTreeConfiguration({ dataSource: undefined, renderer: undefined, highlighter: undefined });
		this._tree = this._instantiationService.createInstance(
			HighlightingWorkbenchTree,
			this._treeContainer,
			treeConfig,
			<IHighlightingTreeOptions>{ useShadows: false, filterOnType: filterConfig.getValue(), showTwistie: false, twistiePixels: 12 },
			{ placeholder: localize('placeholder', "Find") }
		);
		this._disposables.push(this._tree.onDidChangeSelection(e => {
			if (e.payload !== this._tree) {
				const target = this._getTargetFromEvent(e.selection[0], e.payload);
				if (target) {
					setTimeout(_ => {// need to debounce here because this disposes the tree and the tree doesn't like to be disposed on click
						this._onDidPickElement.fire({ target, payload: e.payload });
					}, 0);
				}
			}
		}));
		this._disposables.push(this._tree.onDidChangeFocus(e => {
			const target = this._getTargetFromEvent(e.focus, e.payload);
			if (target) {
				this._onDidFocusElement.fire({ target, payload: e.payload });
			}
		}));
		this._disposables.push(this._tree.onDidStartFiltering(() => {
			this._layoutInfo.inputHeight = 36;
			this._layout();
		}));
		this._disposables.push(this._tree.onDidExpandItem(() => {
			this._layout();
		}));
		this._disposables.push(this._tree.onDidCollapseItem(() => {
			this._layout();
		}));

		// tree icon theme specials
		dom.addClass(this._treeContainer, 'file-icon-themable-tree');
		dom.addClass(this._treeContainer, 'show-file-icons');
		const onFileIconThemeChange = (fileIconTheme: IFileIconTheme) => {
			dom.toggleClass(this._treeContainer, 'align-icons-and-twisties', fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
			dom.toggleClass(this._treeContainer, 'hide-arrows', fileIconTheme.hidesExplorerArrows === true);
		};
		this._disposables.push(_themeService.onDidFileIconThemeChange(onFileIconThemeChange));
		onFileIconThemeChange(_themeService.getFileIconTheme());

		this._domNode.focus();
	}

	dispose(): void {
		dispose(this._disposables);
		this._onDidPickElement.dispose();
		this._tree.dispose();
		this._focus.dispose();
		this._symbolSortOrder.dispose();
	}

	setInput(input: any, maxHeight: number, width: number, arrowSize: number, arrowOffset: number): void {
		let actualInput = this._getInput(input);
		this._tree.setInput(actualInput).then(() => {

			this._layoutInfo = { maxHeight, width, arrowSize, arrowOffset, inputHeight: 0 };
			this._layout();

			// use proper selection, reveal
			let selection = this._getInitialSelection(this._tree, input);
			if (selection) {
				return this._tree.reveal(selection, 0.5).then(() => {
					this._tree.setSelection([selection], this._tree);
					this._tree.setFocus(selection);
					this._tree.domFocus();
				});
			} else {
				this._tree.focusFirst();
				this._tree.setSelection([this._tree.getFocus()], this._tree);
				this._tree.domFocus();
				return Promise.resolve(null);
			}
		}, onUnexpectedError);
	}

	private _layout(info: ILayoutInfo = this._layoutInfo): void {

		let count = 0;
		let nav = this._tree.getNavigator(undefined, false);
		while (nav.next() && count < 13) { count += 1; }

		let headerHeight = 2 * info.arrowSize;
		let treeHeight = Math.min(info.maxHeight - headerHeight, count * 22);
		let totalHeight = treeHeight + headerHeight;

		this._domNode.style.height = `${totalHeight}px`;
		this._domNode.style.width = `${info.width}px`;
		this._arrow.style.top = `-${2 * info.arrowSize}px`;
		this._arrow.style.borderWidth = `${info.arrowSize}px`;
		this._arrow.style.marginLeft = `${info.arrowOffset}px`;
		this._treeContainer.style.height = `${treeHeight}px`;
		this._treeContainer.style.width = `${info.width}px`;
		this._tree.layout();
		this._layoutInfo = info;

	}

	protected abstract _getInput(input: BreadcrumbElement): any;
	protected abstract _getInitialSelection(tree: ITree, input: BreadcrumbElement): any;
	protected abstract _completeTreeConfiguration(config: IHighlightingTreeConfiguration): IHighlightingTreeConfiguration;
	protected abstract _getTargetFromEvent(element: any, payload: any): any | undefined;
}

//#region - Files

export class FileDataSource implements IDataSource {

	private readonly _parents = new WeakMap<object, IWorkspaceFolder | IFileStat>();

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) { }

	getId(tree: ITree, element: IWorkspace | IWorkspaceFolder | IFileStat | URI): string {
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

	hasChildren(tree: ITree, element: IWorkspace | IWorkspaceFolder | IFileStat | URI): boolean {
		return URI.isUri(element) || IWorkspace.isIWorkspace(element) || IWorkspaceFolder.isIWorkspaceFolder(element) || element.isDirectory;
	}

	getChildren(tree: ITree, element: IWorkspace | IWorkspaceFolder | IFileStat | URI): Promise<IWorkspaceFolder[] | IFileStat[]> {
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
		return this._fileService.resolveFile(uri).then(stat => {
			for (let child of stat.children) {
				this._parents.set(stat, child);
			}
			return stat.children;
		});
	}

	getParent(tree: ITree, element: IWorkspace | URI | IWorkspaceFolder | IFileStat): Promise<IWorkspaceFolder | IFileStat> {
		return Promise.resolve(this._parents.get(element));
	}
}

export class FileFilter implements IFilter {

	private readonly _cachedExpressions = new Map<string, glob.ParsedExpression>();
	private readonly _disposables: IDisposable[] = [];

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
						? join(folder.uri.path, pattern)
						: pattern;

					adjustedConfig[patternAbs] = excludesConfig[pattern];
				}
				this._cachedExpressions.set(folder.uri.toString(), glob.parse(adjustedConfig));
			});
		};
		update();
		this._disposables.push(
			config,
			config.onDidChange(update),
			_workspaceService.onDidChangeWorkspaceFolders(update)
		);
	}

	dispose(): void {
		dispose(this._disposables);
	}

	isVisible(tree: ITree, element: IWorkspaceFolder | IFileStat): boolean {
		if (IWorkspaceFolder.isIWorkspaceFolder(element)) {
			// not a file
			return true;
		}
		const folder = this._workspaceService.getWorkspaceFolder(element.resource);
		if (!folder || !this._cachedExpressions.has(folder.uri.toString())) {
			// no folder or no filer
			return true;
		}

		const expression = this._cachedExpressions.get(folder.uri.toString());
		return !expression(element.resource.path, basename(element.resource));
	}
}

export class FileHighlighter implements IHighlighter {
	getHighlightsStorageKey(element: IFileStat | IWorkspaceFolder): string {
		return IWorkspaceFolder.isIWorkspaceFolder(element) ? element.uri.toString() : element.resource.toString();
	}
	getHighlights(tree: ITree, element: IFileStat | IWorkspaceFolder, pattern: string): FuzzyScore {
		return fuzzyScore(pattern, pattern.toLowerCase(), 0, element.name, element.name.toLowerCase(), 0, true);
	}
}

export class FileRenderer implements IRenderer {

	constructor(
		private readonly _labels: ResourceLabels,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) { }

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: any): string {
		return 'FileStat';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		return this._labels.create(container, { supportHighlights: true });
	}

	renderElement(tree: ITree, element: IFileStat | IWorkspaceFolder, templateId: string, templateData: IResourceLabel): void {
		let fileDecorations = this._configService.getValue<{ colors: boolean, badges: boolean }>('explorer.decorations');
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
			matches: createMatches((tree as HighlightingWorkbenchTree).getHighlighterScore(element)),
			extraClasses: ['picker-item']
		});
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: IResourceLabel): void {
		templateData.dispose();
	}
}

export class FileSorter implements ISorter {
	compare(tree: ITree, a: IFileStat | IWorkspaceFolder, b: IFileStat | IWorkspaceFolder): number {
		if (IWorkspaceFolder.isIWorkspaceFolder(a) && IWorkspaceFolder.isIWorkspaceFolder(b)) {
			return a.index - b.index;
		} else {
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

	protected _getInput(input: BreadcrumbElement): any {
		let { uri, kind } = (input as FileElement);
		if (kind === FileKind.ROOT_FOLDER) {
			return this._workspaceService.getWorkspace();
		} else {
			return dirname(uri);
		}
	}

	protected _getInitialSelection(tree: ITree, input: BreadcrumbElement): any {
		let { uri } = (input as FileElement);
		let nav = tree.getNavigator();
		while (nav.next()) {
			let cur = nav.current();
			let candidate = IWorkspaceFolder.isIWorkspaceFolder(cur) ? cur.uri : (cur as IFileStat).resource;
			if (isEqual(uri, candidate)) {
				return cur;
			}
		}
		return undefined;
	}

	protected _completeTreeConfiguration(config: IHighlightingTreeConfiguration): IHighlightingTreeConfiguration {
		// todo@joh reuse explorer implementations?
		const filter = this._instantiationService.createInstance(FileFilter);
		this._disposables.push(filter);

		config.dataSource = this._instantiationService.createInstance(FileDataSource);
		const labels = this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER /* TODO@Jo visibility propagation */);
		this._disposables.push(labels);
		config.renderer = this._instantiationService.createInstance(FileRenderer, labels);
		config.sorter = new FileSorter();
		config.highlighter = new FileHighlighter();
		config.filter = filter;
		return config;
	}

	protected _getTargetFromEvent(element: any, _payload: any): any | undefined {
		if (element && !IWorkspaceFolder.isIWorkspaceFolder(element) && !(element as IFileStat).isDirectory) {
			return new FileElement((element as IFileStat).resource, FileKind.FILE);
		}
	}
}
//#endregion

//#region - Symbols

class OutlineHighlighter implements IHighlighter {
	getHighlights(tree: ITree, element: OutlineElement, pattern: string): FuzzyScore {
		OutlineModel.get(element).updateMatches(pattern);
		return element.score;
	}
}

export class BreadcrumbsOutlinePicker extends BreadcrumbsPicker {

	protected _getInput(input: BreadcrumbElement): any {
		let element = input as TreeElement;
		let model = OutlineModel.get(element);
		model.updateMatches('');
		return model;
	}

	protected _getInitialSelection(_tree: ITree, input: BreadcrumbElement): any {
		return input instanceof OutlineModel ? undefined : input;
	}

	protected _completeTreeConfiguration(config: IHighlightingTreeConfiguration): IHighlightingTreeConfiguration {
		config.dataSource = this._instantiationService.createInstance(OutlineDataSource);
		config.renderer = this._instantiationService.createInstance(OutlineRenderer);
		config.sorter = new OutlineItemComparator(this._getOutlineItemComparator());
		config.highlighter = new OutlineHighlighter();
		return config;
	}

	protected _getTargetFromEvent(element: any, payload: any): any | undefined {
		if (payload && payload.didClickOnTwistie) {
			return;
		}
		if (element instanceof OutlineElement) {
			return element;
		}
	}

	private _getOutlineItemComparator(): OutlineItemCompareType {
		switch (this._symbolSortOrder.getValue()) {
			case 'name':
				return OutlineItemCompareType.ByName;
			case 'type':
				return OutlineItemCompareType.ByKind;
			case 'position':
			default:
				return OutlineItemCompareType.ByPosition;
		}
	}
}

//#endregion
