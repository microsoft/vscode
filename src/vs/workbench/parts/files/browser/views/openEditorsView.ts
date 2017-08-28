/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { RunOnceScheduler } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import dom = require('vs/base/browser/dom');
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IItemCollapseEvent } from 'vs/base/parts/tree/browser/treeModel';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorStacksModel, IStacksModelChangeEvent, IEditorGroup } from 'vs/workbench/common/editor';
import { SaveAllAction } from 'vs/workbench/parts/files/browser/fileActions';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/parts/views/browser/views';
import { IFilesConfiguration, VIEWLET_ID, OpenEditorsFocusedContext, ExplorerFocusedContext } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { Renderer, DataSource, Controller, AccessibilityProvider, ActionProvider, DragAndDrop } from 'vs/workbench/parts/files/browser/views/openEditorsViewer';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { CloseAllEditorsAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { ToggleEditorLayoutAction } from 'vs/workbench/browser/actions/toggleEditorLayout';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IListService } from 'vs/platform/list/browser/listService';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { attachListStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { badgeBackground, badgeForeground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';

const $ = dom.$;

export class OpenEditorsView extends CollapsibleView {

	private static DEFAULT_VISIBLE_OPEN_EDITORS = 9;
	private static DEFAULT_DYNAMIC_HEIGHT = true;
	static ID = 'workbench.explorer.openEditorsView';
	static NAME = nls.localize({ key: 'openEditors', comment: ['Open is an adjective'] }, "Open Editors");

	private visibleOpenEditors: number;
	private dynamicHeight: boolean;

	private model: IEditorStacksModel;
	private dirtyCountElement: HTMLElement;
	private structuralTreeRefreshScheduler: RunOnceScheduler;
	private structuralRefreshDelay: number;
	private groupToRefresh: IEditorGroup;
	private fullRefreshNeeded: boolean;

	private openEditorsFocusedContext: IContextKey<boolean>;
	private explorerFocusedContext: IContextKey<boolean>;

	constructor(
		initialSize: number,
		options: IViewletViewOptions,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITextFileService private textFileService: ITextFileService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IListService private listService: IListService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewletService private viewletService: IViewletService,
		@IThemeService private themeService: IThemeService
	) {
		super(initialSize, {
			...(options as IViewOptions),
			ariaHeaderLabel: nls.localize({ key: 'openEditosrSection', comment: ['Open is an adjective'] }, "Open Editors Section"),
			sizing: ViewSizing.Fixed,
			initialBodySize: OpenEditorsView.computeExpandedBodySize(editorGroupService.getStacksModel())
		}, keybindingService, contextMenuService);

		this.model = editorGroupService.getStacksModel();

		this.openEditorsFocusedContext = OpenEditorsFocusedContext.bindTo(contextKeyService);
		this.explorerFocusedContext = ExplorerFocusedContext.bindTo(contextKeyService);

		this.structuralRefreshDelay = 0;
		this.structuralTreeRefreshScheduler = new RunOnceScheduler(() => this.structuralTreeUpdate(), this.structuralRefreshDelay);
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = dom.append(container, $('.title'));
		const titleSpan = dom.append(titleDiv, $('span'));
		titleSpan.textContent = this.name;

		this.dirtyCountElement = dom.append(titleDiv, $('.monaco-count-badge'));

		this.toDispose.push((attachStylerCallback(this.themeService, { badgeBackground, badgeForeground, contrastBorder }, colors => {
			const background = colors.badgeBackground ? colors.badgeBackground.toString() : null;
			const foreground = colors.badgeForeground ? colors.badgeForeground.toString() : null;
			const border = colors.contrastBorder ? colors.contrastBorder.toString() : null;

			this.dirtyCountElement.style.backgroundColor = background;
			this.dirtyCountElement.style.color = foreground;

			this.dirtyCountElement.style.borderWidth = border ? '1px' : null;
			this.dirtyCountElement.style.borderStyle = border ? 'solid' : null;
			this.dirtyCountElement.style.borderColor = border;
		})));

		this.updateDirtyIndicator();

		super.renderHeader(container);
	}

	public getActions(): IAction[] {
		return [
			this.instantiationService.createInstance(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL),
			this.instantiationService.createInstance(SaveAllAction, SaveAllAction.ID, SaveAllAction.LABEL),
			this.instantiationService.createInstance(CloseAllEditorsAction, CloseAllEditorsAction.ID, CloseAllEditorsAction.LABEL)
		];
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		dom.addClass(this.treeContainer, 'explorer-open-editors');
		dom.addClass(this.treeContainer, 'show-file-icons');

		const dataSource = this.instantiationService.createInstance(DataSource);
		const actionProvider = this.instantiationService.createInstance(ActionProvider, this.model);
		const renderer = this.instantiationService.createInstance(Renderer, actionProvider);
		const controller = this.instantiationService.createInstance(Controller, actionProvider, this.model);
		const accessibilityProvider = this.instantiationService.createInstance(AccessibilityProvider);
		const dnd = this.instantiationService.createInstance(DragAndDrop);

		this.tree = new Tree(this.treeContainer, {
			dataSource,
			renderer,
			controller,
			accessibilityProvider,
			dnd
		}, {
				indentPixels: 0,
				twistiePixels: 22,
				ariaLabel: nls.localize({ key: 'treeAriaLabel', comment: ['Open is an adjective'] }, "Open Editors: List of Active Files"),
				showTwistie: false,
				keyboardSupport: false
			});

		// Theme styler
		this.toDispose.push(attachListStyler(this.tree, this.themeService));

		// Register to list service
		this.toDispose.push(this.listService.register(this.tree, [this.explorerFocusedContext, this.openEditorsFocusedContext]));

		// Open when selecting via keyboard
		this.toDispose.push(this.tree.addListener('selection', event => {
			if (event && event.payload && event.payload.origin === 'keyboard') {
				controller.openEditor(this.tree.getFocus(), { pinned: false, sideBySide: false, preserveFocus: false });
			}
		}));

		// Prevent collapsing of editor groups
		this.toDispose.push(this.tree.addListener('item:collapsed', (event: IItemCollapseEvent) => {
			if (event.item && event.item.getElement() instanceof EditorGroup) {
				setTimeout(() => this.tree.expand(event.item.getElement())); // unwind from callback
			}
		}));

		this.fullRefreshNeeded = true;
		this.structuralTreeUpdate();
	}

	public create(): TPromise<void> {

		// Load Config
		const configuration = this.configurationService.getConfiguration<IFilesConfiguration>();
		this.onConfigurationUpdated(configuration);

		// listeners
		this.registerListeners();

		return super.create();
	}

	private registerListeners(): void {

		// update on model changes
		this.toDispose.push(this.model.onModelChanged(e => this.onEditorStacksModelChanged(e)));

		// Also handle configuration updates
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(this.configurationService.getConfiguration<IFilesConfiguration>())));

		// Handle dirty counter
		this.toDispose.push(this.untitledEditorService.onDidChangeDirty(e => this.updateDirtyIndicator()));
		this.toDispose.push(this.textFileService.models.onModelsDirty(e => this.updateDirtyIndicator()));
		this.toDispose.push(this.textFileService.models.onModelsSaved(e => this.updateDirtyIndicator()));
		this.toDispose.push(this.textFileService.models.onModelsSaveError(e => this.updateDirtyIndicator()));
		this.toDispose.push(this.textFileService.models.onModelsReverted(e => this.updateDirtyIndicator()));

		// We are not updating the tree while the viewlet is not visible. Thus refresh when viewlet becomes visible #6702
		this.toDispose.push(this.viewletService.onDidViewletOpen(viewlet => {
			if (viewlet.getId() === VIEWLET_ID) {
				this.fullRefreshNeeded = true;
				this.structuralTreeUpdate();
				this.updateDirtyIndicator();
			}
		}));
	}

	private onEditorStacksModelChanged(e: IStacksModelChangeEvent): void {
		if (this.isDisposed || !this.isVisible() || !this.tree) {
			return;
		}

		// Do a minimal tree update based on if the change is structural or not #6670
		if (e.structural) {
			// If an editor changed structurally it is enough to refresh the group, otherwise a group changed structurally and we need the full refresh.
			// If there are multiple groups to refresh - refresh the whole tree.
			if (e.editor && !this.groupToRefresh) {
				this.groupToRefresh = e.group;
			} else {
				this.fullRefreshNeeded = true;
			}
			this.structuralTreeRefreshScheduler.schedule(this.structuralRefreshDelay);
		} else {
			const toRefresh = e.editor ? new OpenEditor(e.editor, e.group) : e.group;
			this.tree.refresh(toRefresh, false).done(() => this.highlightActiveEditor(), errors.onUnexpectedError);
		}
	}

	private structuralTreeUpdate(): void {
		// View size
		this.setBodySize(this.getExpandedBodySize(this.model));
		// Show groups only if there is more than 1 group
		const treeInput = this.model.groups.length === 1 ? this.model.groups[0] : this.model;
		// TODO@Isidor temporary workaround due to a partial tree refresh issue
		this.fullRefreshNeeded = true;
		const toRefresh = this.fullRefreshNeeded ? null : this.groupToRefresh;

		(treeInput !== this.tree.getInput() ? this.tree.setInput(treeInput) : this.tree.refresh(toRefresh)).done(() => {
			this.fullRefreshNeeded = false;
			this.groupToRefresh = null;

			// Always expand all the groups as they are unclickable
			return this.tree.expandAll(this.model.groups).then(() => this.highlightActiveEditor());
		}, errors.onUnexpectedError);
	}

	private highlightActiveEditor(): void {
		if (this.model.activeGroup && this.model.activeGroup.activeEditor /* could be empty */) {
			const openEditor = new OpenEditor(this.model.activeGroup.activeEditor, this.model.activeGroup);
			this.tree.clearFocus();
			this.tree.clearSelection();

			if (openEditor) {
				this.tree.setFocus(openEditor);
				this.tree.setSelection([openEditor]);
				const relativeTop = this.tree.getRelativeTop(openEditor);
				if (relativeTop <= 0 || relativeTop >= 1) {
					// Only reveal the element if it is not visible #8279
					this.tree.reveal(openEditor).done(null, errors.onUnexpectedError);
				}
			}
		}
	}

	private onConfigurationUpdated(configuration: IFilesConfiguration): void {
		if (this.isDisposed) {
			return; // guard against possible race condition when config change causes recreate of views
		}

		let visibleOpenEditors = configuration && configuration.explorer && configuration.explorer.openEditors && configuration.explorer.openEditors.visible;
		if (typeof visibleOpenEditors === 'number') {
			this.visibleOpenEditors = visibleOpenEditors;
		} else {
			this.visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS;
		}

		let dynamicHeight = configuration && configuration.explorer && configuration.explorer.openEditors && configuration.explorer.openEditors.dynamicHeight;
		if (typeof dynamicHeight === 'boolean') {
			this.dynamicHeight = dynamicHeight;
		} else {
			this.dynamicHeight = OpenEditorsView.DEFAULT_DYNAMIC_HEIGHT;
		}

		// Adjust expanded body size
		this.setBodySize(this.getExpandedBodySize(this.model));
	}

	private updateDirtyIndicator(): void {
		let dirty = this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY ? this.textFileService.getDirty().length
			: this.untitledEditorService.getDirty().length;
		if (dirty === 0) {
			dom.addClass(this.dirtyCountElement, 'hidden');
		} else {
			this.dirtyCountElement.textContent = nls.localize('dirtyCounter', "{0} unsaved", dirty);
			dom.removeClass(this.dirtyCountElement, 'hidden');
		}
	}

	private getExpandedBodySize(model: IEditorStacksModel): number {
		return OpenEditorsView.computeExpandedBodySize(model, this.visibleOpenEditors, this.dynamicHeight);
	}

	private static computeExpandedBodySize(model: IEditorStacksModel, visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS, dynamicHeight = OpenEditorsView.DEFAULT_DYNAMIC_HEIGHT): number {
		let entryCount = model.groups.reduce((sum, group) => sum + group.count, 0);
		// We only show the group labels if there is more than 1 group
		if (model.groups.length > 1) {
			entryCount += model.groups.length;
		}

		let itemsToShow: number;
		if (dynamicHeight) {
			itemsToShow = Math.min(Math.max(visibleOpenEditors, 1), entryCount);
		} else {
			itemsToShow = Math.max(visibleOpenEditors, 1);
		}

		return itemsToShow * Renderer.ITEM_HEIGHT;
	}

	public setStructuralRefreshDelay(delay: number): void {
		this.structuralRefreshDelay = delay;
	}

	public getOptimalWidth(): number {
		let parentNode = this.tree.getHTMLElement();
		let childNodes = [].slice.call(parentNode.querySelectorAll('.open-editor > a'));

		return dom.getLargestChildWidth(parentNode, childNodes);
	}
}
