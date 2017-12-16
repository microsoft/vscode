/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IAction } from 'vs/base/common/actions';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Position, IEditorInput } from 'vs/platform/editor/common/editor';
import { IEditorStacksModel, IStacksModelChangeEvent, IEditorGroup } from 'vs/workbench/common/editor';
import { SaveAllAction, SaveAllInGroupAction, OpenToSideAction, SaveFileAction, RevertFileAction, SaveFileAsAction, CompareWithSavedAction, CompareResourcesAction, SelectResourceForCompareAction } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { IViewletViewOptions, IViewOptions, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { OpenEditorsFocusedContext, ExplorerFocusedContext, IFilesConfiguration } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { CloseAllEditorsAction, CloseUnmodifiedEditorsInGroupAction, CloseEditorsInGroupAction, CloseOtherEditorsInGroupAction, CloseEditorAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { ToggleEditorLayoutAction } from 'vs/workbench/browser/actions/toggleEditorLayout';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { badgeBackground, badgeForeground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { IListService, WorkbenchList } from 'vs/platform/list/browser/listService';
import { IDelegate, IRenderer, IListContextMenuEvent, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { EditorLabel } from 'vs/workbench/browser/labels';
import { ActionBar, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import { memoize } from 'vs/base/common/decorators';

const $ = dom.$;

export class OpenEditorsView extends ViewsViewletPanel {

	private static readonly DEFAULT_VISIBLE_OPEN_EDITORS = 9;
	private static readonly DEFAULT_DYNAMIC_HEIGHT = true;
	static readonly ID = 'workbench.explorer.openEditorsView';
	static NAME = nls.localize({ key: 'openEditors', comment: ['Open is an adjective'] }, "Open Editors");

	private model: IEditorStacksModel;
	private dirtyCountElement: HTMLElement;
	private listRefreshScheduler: RunOnceScheduler;
	private structuralRefreshDelay: number;
	private list: WorkbenchList<OpenEditor | IEditorGroup>;
	private needsRefresh: boolean;

	constructor(
		options: IViewletViewOptions,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITextFileService private textFileService: ITextFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IListService private listService: IListService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IThemeService private themeService: IThemeService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super({
			...(options as IViewOptions),
			ariaHeaderLabel: nls.localize({ key: 'openEditosrSection', comment: ['Open is an adjective'] }, "Open Editors Section"),
		}, keybindingService, contextMenuService);

		this.model = editorGroupService.getStacksModel();

		this.structuralRefreshDelay = 0;
		this.listRefreshScheduler = new RunOnceScheduler(() => {
			const previousLength = this.list.length;
			this.list.splice(0, this.list.length, this.elements);
			this.focusActiveEditor();
			if (previousLength !== this.list.length) {
				this.updateSize();
			}
			this.needsRefresh = false;
		}, this.structuralRefreshDelay);

		// update on model changes
		this.disposables.push(this.model.onModelChanged(e => this.onEditorStacksModelChanged(e)));

		// Also handle configuration updates
		this.disposables.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(e)));

		// Handle dirty counter
		this.disposables.push(this.untitledEditorService.onDidChangeDirty(e => this.updateDirtyIndicator()));
		this.disposables.push(this.textFileService.models.onModelsDirty(e => this.updateDirtyIndicator()));
		this.disposables.push(this.textFileService.models.onModelsSaved(e => this.updateDirtyIndicator()));
		this.disposables.push(this.textFileService.models.onModelsSaveError(e => this.updateDirtyIndicator()));
		this.disposables.push(this.textFileService.models.onModelsReverted(e => this.updateDirtyIndicator()));
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		const title = dom.append(container, $('.title'));
		dom.append(title, $('span', null, this.name));

		const count = dom.append(container, $('.count'));
		this.dirtyCountElement = dom.append(count, $('.monaco-count-badge'));

		this.disposables.push((attachStylerCallback(this.themeService, { badgeBackground, badgeForeground, contrastBorder }, colors => {
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
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'explorer-open-editors');
		dom.addClass(container, 'show-file-icons');

		const delegate = new OpenEditorsDelegate();
		this.list = new WorkbenchList<OpenEditor | IEditorGroup>(container, delegate, [
			new EditorGroupRenderer(this.keybindingService, this.instantiationService, this.editorGroupService),
			new OpenEditorRenderer(this.instantiationService, this.keybindingService, this.configurationService, this.editorGroupService)
		], {
				identityProvider: element => element instanceof OpenEditor ? element.getId() : element.id.toString(),
				multipleSelectionSupport: false
			}, this.contextKeyService, this.listService, this.themeService);

		this.updateSize();
		// Bind context keys
		OpenEditorsFocusedContext.bindTo(this.list.contextKeyService);
		ExplorerFocusedContext.bindTo(this.list.contextKeyService);

		this.disposables.push(this.list.onContextMenu(e => this.onListContextMenu(e)));

		// Open when selecting via keyboard
		this.disposables.push(this.list.onMouseClick(e => this.onMouseClick(e, false)));
		this.disposables.push(this.list.onMouseDblClick(e => this.onMouseClick(e, true)));
		this.disposables.push(this.list.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter) {
				const focused = this.list.getFocusedElements();
				const element = focused.length ? focused[0] : undefined;
				if (element instanceof OpenEditor) {
					this.openEditor(element, { pinned: false, sideBySide: !!event.ctrlKey, preserveFocus: false });
				}
			}
		}));

		this.listRefreshScheduler.schedule(0);
	}

	public getActions(): IAction[] {
		return [
			this.instantiationService.createInstance(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL),
			this.instantiationService.createInstance(SaveAllAction, SaveAllAction.ID, SaveAllAction.LABEL),
			this.instantiationService.createInstance(CloseAllEditorsAction, CloseAllEditorsAction.ID, CloseAllEditorsAction.LABEL)
		];
	}

	public setExpanded(expanded: boolean): void {
		super.setExpanded(expanded);
		if (expanded && this.needsRefresh) {
			this.listRefreshScheduler.schedule(0);
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (visible && this.needsRefresh) {
				this.listRefreshScheduler.schedule(0);
			}
		});
	}

	public getList(): WorkbenchList<OpenEditor | IEditorGroup> {
		return this.list;
	}

	protected layoutBody(size: number): void {
		if (this.list) {
			this.list.layout(size);
		}
	}

	@memoize
	private get actionProvider(): ActionProvider {
		return new ActionProvider(this.instantiationService, this.textFileService, this.untitledEditorService);
	}

	private get elements(): (IEditorGroup | OpenEditor)[] {
		const result: (IEditorGroup | OpenEditor)[] = [];
		this.model.groups.forEach(g => {
			if (this.model.groups.length > 1) {
				result.push(g);
			}
			result.push(...g.getEditors().map(ei => new OpenEditor(ei, g)));
		});

		return result;
	}

	private getIndex(group: IEditorGroup, editor: IEditorInput): number {
		let index = editor ? group.indexOf(editor) : 0;
		if (this.model.groups.length === 1) {
			return index;
		}

		for (let g of this.model.groups) {
			if (g.id === group.id) {
				return index + (!!editor ? 1 : 0);
			} else {
				index += g.count + 1;
			}
		}

		return -1;
	}

	private onMouseClick(event: IListMouseEvent<OpenEditor | IEditorGroup>, isDoubleClick: boolean): void {
		const element = event.element;
		if (!(element instanceof OpenEditor)) {
			return;
		}

		if (event.browserEvent && event.browserEvent.button === 1 /* Middle Button */) {
			const position = this.model.positionOfGroup(element.editorGroup);
			this.editorService.closeEditor(position, element.editorInput).done(null, errors.onUnexpectedError);
		} else {
			this.openEditor(element, { preserveFocus: !isDoubleClick, pinned: isDoubleClick, sideBySide: event.browserEvent.ctrlKey || event.browserEvent.metaKey });
		}
	}

	private openEditor(element: OpenEditor, options: { preserveFocus: boolean; pinned: boolean; sideBySide: boolean; }): void {
		if (element) {
			/* __GDPR__
				"workbenchActionExecuted" : {
					"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'openEditors' });
			let position = this.model.positionOfGroup(element.editorGroup);
			if (options.sideBySide && position !== Position.THREE) {
				position++;
			}
			this.editorGroupService.activateGroup(this.model.groupAt(position));
			this.editorService.openEditor(element.editorInput, options, position)
				.done(() => this.editorGroupService.activateGroup(this.model.groupAt(position)), errors.onUnexpectedError);
		}
	}

	private onListContextMenu(e: IListContextMenuEvent<OpenEditor | IEditorGroup>): void {
		const element = e.element;
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => this.actionProvider.getSecondaryActions(element),
			getActionsContext: () => element instanceof OpenEditor ? { group: element.editorGroup, editor: element.editorInput } : { group: element }
		});
	}

	private onEditorStacksModelChanged(e: IStacksModelChangeEvent): void {
		if (!this.isVisible() || !this.list || !this.isExpanded()) {
			this.needsRefresh = true;
			return;
		}

		// Do a minimal tree update based on if the change is structural or not #6670
		if (e.structural) {
			this.listRefreshScheduler.schedule(this.structuralRefreshDelay);
		} else if (!this.listRefreshScheduler.isScheduled()) {

			const newElement = e.editor ? new OpenEditor(e.editor, e.group) : e.group;
			const index = this.getIndex(e.group, e.editor);
			const previousLength = this.list.length;
			this.list.splice(index, 1, [newElement]);

			if (previousLength !== this.list.length) {
				this.updateSize();
			}
			this.focusActiveEditor();
		}
	}

	private focusActiveEditor(): void {
		if (this.model.activeGroup && this.model.activeGroup.activeEditor /* could be empty */) {
			const index = this.getIndex(this.model.activeGroup, this.model.activeGroup.activeEditor);
			this.list.setFocus([index]);
			this.list.setSelection([index]);
			this.list.reveal(index);
		}
	}

	private onConfigurationChange(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration('explorer.openEditors')) {
			this.updateSize();
		}

		// Trigger a 'repaint' when decoration settings change
		if (event.affectsConfiguration('explorer.decorations')) {
			this.listRefreshScheduler.schedule();
		}
	}

	private updateSize(): void {
		// Adjust expanded body size
		this.minimumBodySize = this.getMinExpandedBodySize();
		this.maximumBodySize = this.getMaxExpandedBodySize();
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

	private get elementCount(): number {
		return this.model.groups.map(g => g.count)
			.reduce((first, second) => first + second, this.model.groups.length > 1 ? this.model.groups.length : 0);
	}

	private getMaxExpandedBodySize(): number {
		return this.elementCount * OpenEditorsDelegate.ITEM_HEIGHT;
	}

	private getMinExpandedBodySize(): number {
		let visibleOpenEditors = this.configurationService.getValue<number>('explorer.openEditors.visible');
		if (typeof visibleOpenEditors !== 'number') {
			visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS;
		}

		let dynamicHeight = this.configurationService.getValue<boolean>('explorer.openEditors.dynamicHeight');
		if (typeof dynamicHeight !== 'boolean') {
			dynamicHeight = OpenEditorsView.DEFAULT_DYNAMIC_HEIGHT;
		}

		return this.computeMinExpandedBodySize(visibleOpenEditors, dynamicHeight);
	}

	private computeMinExpandedBodySize(visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS, dynamicHeight = OpenEditorsView.DEFAULT_DYNAMIC_HEIGHT): number {
		let itemsToShow: number;
		if (dynamicHeight) {
			itemsToShow = Math.min(Math.max(visibleOpenEditors, 1), this.elementCount);
		} else {
			itemsToShow = Math.max(visibleOpenEditors, 1);
		}

		return itemsToShow * OpenEditorsDelegate.ITEM_HEIGHT;
	}

	public setStructuralRefreshDelay(delay: number): void {
		this.structuralRefreshDelay = delay;
	}

	public getOptimalWidth(): number {
		let parentNode = this.list.getHTMLElement();
		let childNodes = [].slice.call(parentNode.querySelectorAll('.open-editor > a'));

		return dom.getLargestChildWidth(parentNode, childNodes);
	}
}

interface IOpenEditorTemplateData {
	container: HTMLElement;
	root: EditorLabel;
	actionBar: ActionBar;
	openEditor: OpenEditor;
	toDispose: IDisposable[];
}

interface IEditorGroupTemplateData {
	root: HTMLElement;
	name: HTMLSpanElement;
	actionBar: ActionBar;
	editorGroup: IEditorGroup;
	toDispose: IDisposable[];
}

class OpenEditorsDelegate implements IDelegate<OpenEditor | IEditorGroup> {

	public static readonly ITEM_HEIGHT = 22;

	getHeight(element: OpenEditor | IEditorGroup): number {
		return OpenEditorsDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: OpenEditor | IEditorGroup): string {
		if (element instanceof EditorGroup) {
			return EditorGroupRenderer.ID;
		}

		return OpenEditorRenderer.ID;
	}
}

class EditorGroupRenderer implements IRenderer<IEditorGroup, IEditorGroupTemplateData> {
	static readonly ID = 'editorgroup';

	constructor(
		private keybindingService: IKeybindingService,
		private instantiationService: IInstantiationService,
		private editorGroupService: IEditorGroupService
	) {
		// noop
	}

	get templateId() {
		return EditorGroupRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IEditorGroupTemplateData {
		const editorGroupTemplate: IEditorGroupTemplateData = Object.create(null);
		editorGroupTemplate.root = dom.append(container, $('.editor-group'));
		editorGroupTemplate.name = dom.append(editorGroupTemplate.root, $('span.name'));
		editorGroupTemplate.actionBar = new ActionBar(container);

		const editorGroupActions = [
			this.instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, SaveAllInGroupAction.LABEL),
			this.instantiationService.createInstance(CloseUnmodifiedEditorsInGroupAction, CloseUnmodifiedEditorsInGroupAction.ID, CloseUnmodifiedEditorsInGroupAction.LABEL),
			this.instantiationService.createInstance(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, CloseEditorsInGroupAction.LABEL)
		];
		editorGroupActions.forEach(a => {
			const key = this.keybindingService.lookupKeybinding(a.id);
			editorGroupTemplate.actionBar.push(a, { icon: true, label: false, keybinding: key ? key.getLabel() : void 0 });
		});

		editorGroupTemplate.toDispose = [];
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_OVER, (e: DragEvent) => {
			if (OpenEditorRenderer.DRAGGED_OPEN_EDITOR) {
				dom.addClass(container, 'focused');
			}
		}));
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_LEAVE, (e: DragEvent) => {
			dom.removeClass(container, 'focused');
		}));
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DROP, () => {
			dom.removeClass(container, 'focused');
			if (OpenEditorRenderer.DRAGGED_OPEN_EDITOR) {
				const model = this.editorGroupService.getStacksModel();
				const positionOfTargetGroup = model.positionOfGroup(editorGroupTemplate.editorGroup);
				this.editorGroupService.moveEditor(OpenEditorRenderer.DRAGGED_OPEN_EDITOR.editorInput, model.positionOfGroup(OpenEditorRenderer.DRAGGED_OPEN_EDITOR.editorGroup), positionOfTargetGroup, { preserveFocus: true });
				this.editorGroupService.activateGroup(positionOfTargetGroup);
			}
		}));

		return editorGroupTemplate;
	}

	renderElement(editorGroup: IEditorGroup, index: number, templateData: IEditorGroupTemplateData): void {
		templateData.editorGroup = editorGroup;
		templateData.name.textContent = editorGroup.label;
		templateData.actionBar.context = { group: editorGroup };
	}

	disposeTemplate(templateData: IEditorGroupTemplateData): void {
		templateData.actionBar.dispose();
		dispose(templateData.toDispose);
	}
}

class OpenEditorRenderer implements IRenderer<OpenEditor, IOpenEditorTemplateData> {
	static readonly ID = 'openeditor';
	public static DRAGGED_OPEN_EDITOR: OpenEditor;

	constructor(
		private instantiationService: IInstantiationService,
		private keybindingService: IKeybindingService,
		private configurationService: IConfigurationService,
		private editorGroupService: IEditorGroupService
	) {
		// noop
	}

	get templateId() {
		return OpenEditorRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IOpenEditorTemplateData {
		const editorTemplate: IOpenEditorTemplateData = Object.create(null);
		editorTemplate.container = container;
		editorTemplate.actionBar = new ActionBar(container);
		container.draggable = true;

		const closeEditorAction = this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL);
		const key = this.keybindingService.lookupKeybinding(closeEditorAction.id);
		editorTemplate.actionBar.push(closeEditorAction, { icon: true, label: false, keybinding: key ? key.getLabel() : void 0 });

		editorTemplate.root = this.instantiationService.createInstance(EditorLabel, container, void 0);

		editorTemplate.toDispose = [];

		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_START, (e: DragEvent) => {

			const dragImage = document.createElement('div');
			e.dataTransfer.effectAllowed = 'copyMove';
			dragImage.className = 'monaco-tree-drag-image';
			dragImage.textContent = editorTemplate.openEditor.editorInput.getName();
			document.body.appendChild(dragImage);
			e.dataTransfer.setDragImage(dragImage, -10, -10);
			setTimeout(() => document.body.removeChild(dragImage), 0);

			OpenEditorRenderer.DRAGGED_OPEN_EDITOR = editorTemplate.openEditor;
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_OVER, () => {
			if (OpenEditorRenderer.DRAGGED_OPEN_EDITOR) {
				dom.addClass(container, 'focused');
			}
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_LEAVE, () => {
			dom.removeClass(container, 'focused');
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DROP, (e: DragEvent) => {
			dom.removeClass(container, 'focused');
			if (OpenEditorRenderer.DRAGGED_OPEN_EDITOR) {
				const model = this.editorGroupService.getStacksModel();
				const positionOfTargetGroup = model.positionOfGroup(editorTemplate.openEditor.editorGroup);
				const index = editorTemplate.openEditor.editorGroup.indexOf(editorTemplate.openEditor.editorInput);

				this.editorGroupService.moveEditor(OpenEditorRenderer.DRAGGED_OPEN_EDITOR.editorInput,
					model.positionOfGroup(OpenEditorRenderer.DRAGGED_OPEN_EDITOR.editorGroup), positionOfTargetGroup, { index, preserveFocus: true });
				this.editorGroupService.activateGroup(positionOfTargetGroup);
			}
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_END, () => {
			OpenEditorRenderer.DRAGGED_OPEN_EDITOR = undefined;
		}));

		return editorTemplate;
	}

	renderElement(editor: OpenEditor, index: number, templateData: IOpenEditorTemplateData): void {
		templateData.openEditor = editor;
		editor.isDirty() ? dom.addClass(templateData.container, 'dirty') : dom.removeClass(templateData.container, 'dirty');
		templateData.root.setEditor(editor.editorInput, {
			italic: editor.isPreview(),
			extraClasses: ['open-editor'],
			fileDecorations: this.configurationService.getValue<IFilesConfiguration>().explorer.decorations
		});
		templateData.actionBar.context = { group: editor.editorGroup, editor: editor.editorInput };
	}

	disposeTemplate(templateData: IOpenEditorTemplateData): void {
		templateData.actionBar.dispose();
		templateData.root.dispose();
		dispose(templateData.toDispose);
	}
}

export class ActionProvider extends ContributableActionProvider {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		super();
	}

	public getSecondaryActions(element: any): TPromise<IAction[]> {
		return super.getSecondaryActions(undefined, element).then(result => {
			const autoSaveEnabled = this.textFileService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY;

			if (element instanceof EditorGroup) {
				if (!autoSaveEnabled) {
					result.push(this.instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, nls.localize('saveAll', "Save All")));
					result.push(new Separator());
				}

				result.push(this.instantiationService.createInstance(CloseUnmodifiedEditorsInGroupAction, CloseUnmodifiedEditorsInGroupAction.ID, nls.localize('closeAllUnmodified', "Close Unmodified")));
				result.push(this.instantiationService.createInstance(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, nls.localize('closeAll', "Close All")));
			} else {
				const openEditor = <OpenEditor>element;
				const resource = openEditor.getResource();
				if (resource) {
					// Open to side
					result.unshift(this.instantiationService.createInstance(OpenToSideAction, undefined, resource, false));

					if (!openEditor.isUntitled()) {

						// Files: Save / Revert
						if (!autoSaveEnabled) {
							result.push(new Separator());

							const saveAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
							saveAction.setResource(resource);
							saveAction.enabled = openEditor.isDirty();
							result.push(saveAction);

							const revertAction = this.instantiationService.createInstance(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL);
							revertAction.setResource(resource);
							revertAction.enabled = openEditor.isDirty();
							result.push(revertAction);
						}
					}

					// Untitled: Save / Save As
					if (openEditor.isUntitled()) {
						result.push(new Separator());

						if (this.untitledEditorService.hasAssociatedFilePath(resource)) {
							let saveUntitledAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
							saveUntitledAction.setResource(resource);
							result.push(saveUntitledAction);
						}

						let saveAsAction = this.instantiationService.createInstance(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL);
						saveAsAction.setResource(resource);
						result.push(saveAsAction);
					}

					// Compare Actions
					result.push(new Separator());

					if (!openEditor.isUntitled()) {
						const compareWithSavedAction = this.instantiationService.createInstance(CompareWithSavedAction, CompareWithSavedAction.ID, nls.localize('compareWithSaved', "Compare with Saved"));
						compareWithSavedAction.setResource(resource);
						compareWithSavedAction.enabled = openEditor.isDirty();
						result.push(compareWithSavedAction);
					}

					const runCompareAction = this.instantiationService.createInstance(CompareResourcesAction, resource, undefined);
					if (runCompareAction._isEnabled()) {
						result.push(runCompareAction);
					}
					result.push(this.instantiationService.createInstance(SelectResourceForCompareAction, resource, undefined));

					result.push(new Separator());
				}

				result.push(this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, nls.localize('close', "Close")));
				const closeOtherEditorsInGroupAction = this.instantiationService.createInstance(CloseOtherEditorsInGroupAction, CloseOtherEditorsInGroupAction.ID, nls.localize('closeOthers', "Close Others"));
				closeOtherEditorsInGroupAction.enabled = openEditor.editorGroup.count > 1;
				result.push(closeOtherEditorsInGroupAction);
				result.push(this.instantiationService.createInstance(CloseUnmodifiedEditorsInGroupAction, CloseUnmodifiedEditorsInGroupAction.ID, nls.localize('closeAllUnmodified', "Close Unmodified")));
				result.push(this.instantiationService.createInstance(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, nls.localize('closeAll', "Close All")));
			}

			return result;
		});
	}
}
