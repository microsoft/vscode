/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Dimension, trackFocus, IFocusTracker } from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITreeConfiguration, IDataSource, ITree, IRenderer, ISelectionEvent } from 'vs/base/parts/tree/browser/tree';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileService, IFileStat, FileKind } from 'vs/platform/files/common/files';
import { FileLabel } from 'vs/workbench/browser/labels';
import URI from 'vs/base/common/uri';
import { Emitter, Event, debounceEvent } from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export abstract class BreadcrumbsPicker {

	readonly focus: IFocusTracker;

	protected readonly _onDidPickElement = new Emitter<any>();
	readonly onDidPickElement: Event<any> = this._onDidPickElement.event;

	protected readonly _disposables = new Array<IDisposable>();
	protected readonly _domNode: HTMLDivElement;
	protected readonly _tree: WorkbenchTree;

	constructor(
		container: HTMLElement,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IThemeService protected readonly _themeService: IThemeService,
	) {
		this._domNode = document.createElement('div');
		// this._domNode.style.background = this._themeService.getTheme().getColor(colors.progressBarBackground).toString();
		container.appendChild(this._domNode);

		this._tree = this._instantiationService.createInstance(WorkbenchTree, this._domNode, this._completeTreeConfiguration({ dataSource: undefined }), {});
		debounceEvent(this._tree.onDidChangeSelection, (last, cur) => cur, 0)(this._onDidChangeSelection, this, this._disposables);

		this.focus = trackFocus(this._domNode);
		this.focus.onDidBlur(_ => this._onDidPickElement.fire(undefined), undefined, this._disposables);
	}

	dispose(): void {
		dispose(this._disposables);
		this._onDidPickElement.dispose();
		this._tree.dispose();
		this.focus.dispose();
	}

	layout(dim: Dimension) {
		this._domNode.style.width = `${dim.width}px`;
		this._domNode.style.height = `${dim.height}px`;
		this._tree.layout(dim.height, dim.width);
	}

	protected abstract _completeTreeConfiguration(config: ITreeConfiguration): ITreeConfiguration;
	protected abstract _onDidChangeSelection(e: any): void;
}

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

export class FileRenderer implements IRenderer {

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: any): string {
		return 'FileStat';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		return this._instantiationService.createInstance(FileLabel, container, {});
	}

	renderElement(tree: ITree, element: IFileStat, templateId: string, templateData: FileLabel): void {
		templateData.setFile(element.resource, { hidePath: true, fileKind: element.isDirectory ? FileKind.FOLDER : FileKind.FILE });
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: FileLabel): void {
		templateData.dispose();
	}
}

export class BreadcrumbsFilePicker extends BreadcrumbsPicker {


	protected _completeTreeConfiguration(config: ITreeConfiguration): ITreeConfiguration {
		config.dataSource = this._instantiationService.createInstance(FileDataSource);
		config.renderer = this._instantiationService.createInstance(FileRenderer);
		return config;
	}

	setInput(resource: URI): void {
		this._tree.domFocus();
		this._tree.setInput(resource);
	}

	protected _onDidChangeSelection(e: ISelectionEvent): void {
		let [first] = e.selection;
		let stat = first as IFileStat;
		if (stat && !stat.isDirectory) {
			this._onDidPickElement.fire(stat.resource);
		}
	}
}
