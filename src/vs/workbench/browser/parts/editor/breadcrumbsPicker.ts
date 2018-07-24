/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as dom from 'vs/base/browser/dom';
import { compareFileNames } from 'vs/base/common/comparers';
import { Emitter, Event } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { dirname, isEqual } from 'vs/base/common/resources';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ISelectionEvent, ISorter, ITree } from 'vs/base/parts/tree/browser/tree';
import 'vs/css!./media/breadcrumbscontrol';
import { OutlineElement, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { OutlineDataSource, OutlineItemComparator, OutlineRenderer } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { localize } from 'vs/nls';
import { FileKind, IFileService, IFileStat } from 'vs/platform/files/common/files';
import { IInstantiationService, IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { HighlightingWorkbenchTree, IHighlightingTreeConfiguration, IHighlightingRenderer } from 'vs/platform/list/browser/listService';
import { IThemeService, DARK } from 'vs/platform/theme/common/themeService';
import { FileLabel } from 'vs/workbench/browser/labels';
import { BreadcrumbElement, FileElement } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { onUnexpectedError } from 'vs/base/common/errors';
import { breadcrumbsPickerBackground } from 'vs/platform/theme/common/colorRegistry';
import { FuzzyScore, createMatches, fuzzyScore } from 'vs/base/common/filters';

export function createBreadcrumbsPicker(instantiationService: IInstantiationService, parent: HTMLElement, element: BreadcrumbElement): BreadcrumbsPicker {
	let ctor: IConstructorSignature1<HTMLElement, BreadcrumbsPicker> = element instanceof FileElement ? BreadcrumbsFilePicker : BreadcrumbsOutlinePicker;
	return instantiationService.createInstance(ctor, parent);
}

export abstract class BreadcrumbsPicker {

	protected readonly _disposables = new Array<IDisposable>();
	protected readonly _domNode: HTMLDivElement;
	protected readonly _arrow: HTMLDivElement;
	protected readonly _treeContainer: HTMLDivElement;
	protected readonly _tree: HighlightingWorkbenchTree;
	protected readonly _focus: dom.IFocusTracker;

	protected readonly _onDidPickElement = new Emitter<any>();

	readonly onDidPickElement: Event<any> = this._onDidPickElement.event;

	constructor(
		parent: HTMLElement,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IThemeService protected readonly _themeService: IThemeService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-breadcrumbs-picker show-file-icons';
		parent.appendChild(this._domNode);

		this._focus = dom.trackFocus(this._domNode);
		this._focus.onDidBlur(_ => this._onDidPickElement.fire(undefined), undefined, this._disposables);

		const theme = this._themeService.getTheme();
		const color = theme.getColor(breadcrumbsPickerBackground);

		this._arrow = document.createElement('div');
		this._arrow.style.width = '0';
		this._arrow.style.borderStyle = 'solid';
		this._arrow.style.borderWidth = '8px';
		this._arrow.style.borderColor = `transparent transparent ${color.toString()}`;
		this._domNode.appendChild(this._arrow);

		this._treeContainer = document.createElement('div');
		this._treeContainer.style.background = color.toString();
		this._treeContainer.style.paddingTop = '2px';
		this._treeContainer.style.boxShadow = `0px 5px 8px ${(theme.type === DARK ? color.darken(.6) : color.darken(.2))}`;
		this._domNode.appendChild(this._treeContainer);

		const treeConifg = this._completeTreeConfiguration({ dataSource: undefined, renderer: undefined });
		this._tree = this._instantiationService.createInstance(
			HighlightingWorkbenchTree,
			this._treeContainer,
			treeConifg,
			{ useShadows: false },
			{ placeholder: localize('placeholder', "Find") }
		);
		this._disposables.push(this._tree.onDidChangeSelection(e => {
			if (e.payload !== this._tree) {
				setTimeout(_ => this._onDidChangeSelection(e)); // need to debounce here because this disposes the tree and the tree doesn't like to be disposed on click
			}
		}));

		this._domNode.focus();
	}

	dispose(): void {
		dispose(this._disposables);
		this._onDidPickElement.dispose();
		this._tree.dispose();
		this._focus.dispose();
	}

	setInput(input: any): void {
		let actualInput = this._getInput(input);
		this._tree.setInput(actualInput).then(() => {
			let selection = this._getInitialSelection(this._tree, input);
			if (selection) {
				this._tree.reveal(selection, .5).then(() => {
					this._tree.setSelection([selection], this._tree);
					this._tree.setFocus(selection);
					this._tree.domFocus();
				});
			} else {
				this._tree.focusFirst();
				this._tree.setSelection([this._tree.getFocus()], this._tree);
				this._tree.domFocus();
			}
		}, onUnexpectedError);
	}

	layout(height: number, width: number, arrowSize: number, arrowOffset: number) {
		this._domNode.style.height = `${height}px`;
		this._domNode.style.width = `${width}px`;
		this._arrow.style.borderWidth = `${arrowSize}px`;
		this._arrow.style.marginLeft = `${arrowOffset}px`;

		this._treeContainer.style.height = `${height - 2 * arrowSize}px`;
		this._treeContainer.style.width = `${width}px`;
		this._tree.layout();
	}

	protected abstract _getInput(input: BreadcrumbElement): any;
	protected abstract _getInitialSelection(tree: ITree, input: BreadcrumbElement): any;
	protected abstract _completeTreeConfiguration(config: IHighlightingTreeConfiguration): IHighlightingTreeConfiguration;
	protected abstract _onDidChangeSelection(e: ISelectionEvent): void;
}

//#region - Files

export class FileDataSource implements IDataSource {

	private readonly _parents = new WeakMap<IFileStat, IFileStat>();

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) { }

	getId(tree: ITree, element: IFileStat | URI): string {
		return URI.isUri(element) ? element.toString() : element.resource.toString();
	}

	hasChildren(tree: ITree, element: IFileStat | URI): boolean {
		return URI.isUri(element) || element.isDirectory;
	}

	getChildren(tree: ITree, element: IFileStat | URI): TPromise<IFileStat[]> {
		return this._fileService.resolveFile(
			URI.isUri(element) ? element : element.resource
		).then(stat => {
			for (const child of stat.children) {
				this._parents.set(child, stat);
			}
			return stat.children;
		});
	}

	getParent(tree: ITree, element: IFileStat | URI): TPromise<IFileStat> {
		return TPromise.as(URI.isUri(element) ? undefined : this._parents.get(element));
	}
}

export class FileRenderer implements IRenderer, IHighlightingRenderer {

	private readonly _scores = new Map<string, FuzzyScore>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) { }

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: any): string {
		return 'FileStat';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		return this._instantiationService.createInstance(FileLabel, container, { supportHighlights: true });
	}

	renderElement(tree: ITree, element: IFileStat, templateId: string, templateData: FileLabel): void {
		templateData.setFile(element.resource, {
			hidePath: true,
			fileKind: element.isDirectory ? FileKind.FOLDER : FileKind.FILE,
			fileDecorations: { colors: true, badges: true },
			matches: createMatches((this._scores.get(element.resource.toString()) || [, []])[1])
		});
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: FileLabel): void {
		templateData.dispose();
	}

	updateHighlights(tree: ITree, pattern: string): any {
		let nav = tree.getNavigator(undefined, false);
		let topScore: FuzzyScore;
		let topElement: any;
		while (nav.next()) {
			let element = nav.current() as IFileStat;
			let score = fuzzyScore(pattern, element.name, undefined, true);
			this._scores.set(element.resource.toString(), score);
			if (!topScore || score && topScore[0] < score[0]) {
				topScore = score;
				topElement = element;
			}
		}
		return topElement;
	}
}

export class FileSorter implements ISorter {
	compare(tree: ITree, a: IFileStat, b: IFileStat): number {
		if (a.isDirectory === b.isDirectory) {
			// same type -> compare on names
			return compareFileNames(a.name, b.name);
		} else if (a.isDirectory) {
			return -1;
		} else {
			return 1;
		}
	}
}

export class BreadcrumbsFilePicker extends BreadcrumbsPicker {

	protected _getInput(input: BreadcrumbElement): any {
		let { uri } = (input as FileElement);
		return dirname(uri);
	}

	protected _getInitialSelection(tree: ITree, input: BreadcrumbElement): any {
		let { uri } = (input as FileElement);
		let nav = tree.getNavigator();
		while (nav.next()) {
			if (isEqual(uri, (nav.current() as IFileStat).resource)) {
				return nav.current();
			}
		}
		return undefined;
	}

	protected _completeTreeConfiguration(config: IHighlightingTreeConfiguration): IHighlightingTreeConfiguration {
		// todo@joh reuse explorer implementations?
		config.dataSource = this._instantiationService.createInstance(FileDataSource);
		config.renderer = this._instantiationService.createInstance(FileRenderer);
		config.sorter = new FileSorter();
		return config;
	}

	protected _onDidChangeSelection(e: ISelectionEvent): void {
		let [first] = e.selection;
		let stat = first as IFileStat;
		if (stat && !stat.isDirectory) {
			this._onDidPickElement.fire(new FileElement(stat.resource, true));
		}
	}
}
//#endregion

//#region - Symbols

class HighlightingOutlineRenderer extends OutlineRenderer implements IHighlightingRenderer {

	updateHighlights(tree: ITree, pattern: string): any {
		let model = OutlineModel.get(tree.getInput());
		return model.updateMatches(pattern);
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
		config.renderer = this._instantiationService.createInstance(HighlightingOutlineRenderer);
		config.sorter = new OutlineItemComparator();
		return config;
	}

	protected _onDidChangeSelection(e: ISelectionEvent): void {
		if (e.payload && e.payload.didClickOnTwistie) {
			return;
		}
		let [first] = e.selection;
		if (first instanceof OutlineElement) {
			this._onDidPickElement.fire(first);
		}
	}
}

//#endregion
