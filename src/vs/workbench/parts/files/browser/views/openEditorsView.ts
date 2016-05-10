/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import {IActionRunner} from 'vs/base/common/actions';
import dom = require('vs/base/browser/dom');
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IMessageService} from 'vs/platform/message/common/message';
import {AdaptiveCollapsibleViewletView} from 'vs/workbench/browser/viewlet';
import {ITextFileService} from 'vs/workbench/parts/files/common/files';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IEditorStacksModel} from 'vs/workbench/common/editor/editorStacksModel';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {Renderer, DataSource, Controller} from 'vs/workbench/parts/files/browser/views/openEditorsViewer';

const $ = dom.emmet;

export class OpenEditorsView extends AdaptiveCollapsibleViewletView {

	private static MEMENTO_COLLAPSED = 'openEditors.memento.collapsed';
	private static DEFAULT_MAX_VISIBLE_EDITORS = 9;
	private static DEFAULT_DYNAMIC_HEIGHT = true;

	private settings: any;
	private maxVisibleOpenEditors: number;
	private dynamicHeight: boolean;

	private model: IEditorStacksModel;
	private dirtyCountElement: HTMLElement;
	private lastDirtyCount: number;

	constructor(actionRunner: IActionRunner, settings: any,
		@IMessageService messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITextFileService private textFileService: ITextFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(actionRunner, OpenEditorsView.computeExpandedBodySize(editorService.getStacksModel()), !!settings[OpenEditorsView.MEMENTO_COLLAPSED], nls.localize('openEditosrSection', "Open Editors Section"), messageService, contextMenuService);

		this.settings = settings;
		this.model = editorService.getStacksModel();
		this.lastDirtyCount = 0;
		console.log(this.getExpandedBodySize(this.model));
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = dom.append(container, $('.title'));
		const titleSpan = dom.append(titleDiv, $('span'));
		titleSpan.textContent = nls.localize('openEditors', "Open Editors");

		this.dirtyCountElement = dom.append(titleDiv, $('.monaco-count-badge'));
		this.updateDirtyIndicator();

		super.renderHeader(container);
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		dom.addClass(this.treeContainer, 'explorer-open-editors');

		const dataSource = this.instantiationService.createInstance(DataSource);
		const renderer = this.instantiationService.createInstance(Renderer);
		const controller = this.instantiationService.createInstance(Controller);

		this.tree = new Tree(this.treeContainer, {
			dataSource,
			renderer,
			controller
		}, {
			indentPixels: 0,
			twistiePixels: 8,
			ariaLabel: nls.localize('treeAriaLabel', "Open Editors")
		});

		// Show groups only if there is more than 1
		const treeInput = this.model.groups.length === 1 ? this.model.groups[0] : this.model;
		this.tree.setInput(treeInput).done(null, errors.onUnexpectedError);
		this.tree.expandAll(this.model.groups).done(null, errors.onUnexpectedError);
	}

	private updateDirtyIndicator(): void {
		let dirty = this.textFileService.getDirty().length;
		this.lastDirtyCount = dirty;
		if (dirty === 0) {
			this.dirtyCountElement.hidden = true;
		} else {
			this.dirtyCountElement.textContent = nls.localize('dirtyCounter', "{0} unsaved", dirty);
			this.dirtyCountElement.hidden = false;
		}
	}

	private getExpandedBodySize(model: IEditorStacksModel): number {
		return OpenEditorsView.computeExpandedBodySize(model, this.maxVisibleOpenEditors, this.dynamicHeight);
	}

	private static computeExpandedBodySize(model: IEditorStacksModel, maxVisibleOpenEditors = OpenEditorsView.DEFAULT_MAX_VISIBLE_EDITORS, dynamicHeight = OpenEditorsView.DEFAULT_DYNAMIC_HEIGHT): number {
		const entryCount = model.groups.reduce((sum, group) => sum + group.count, 0);

		let itemsToShow: number;
		if (dynamicHeight) {
			itemsToShow = Math.min(Math.max(maxVisibleOpenEditors, 1), entryCount);
		} else {
			itemsToShow = Math.max(maxVisibleOpenEditors, 1);
		}
		// We only show the group labels if there is more than 1 group
		if (model.groups.length > 1) {
			itemsToShow += model.groups.length;
		}

		return itemsToShow * Renderer.ITEM_HEIGHT;
	}
}
