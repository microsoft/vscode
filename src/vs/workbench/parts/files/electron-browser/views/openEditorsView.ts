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
import { SaveAllAction, SaveAllInGroupAction } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { IViewletViewOptions, IViewOptions, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { OpenEditorsFocusedContext, ExplorerFocusedContext, IFilesConfiguration } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { CloseAllEditorsAction, CloseEditorAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { ToggleEditorLayoutAction } from 'vs/workbench/browser/actions/toggleEditorLayout';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { badgeBackground, badgeForeground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IDelegate, IRenderer, IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { EditorLabel } from 'vs/workbench/browser/labels';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { OpenEditorsGroupContext, DirtyEditorContext } from 'vs/workbench/parts/files/electron-browser/fileCommands';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { fillResourceDataTransfers, ResourcesDropHandler, LocalSelectionTransfer } from 'vs/workbench/browser/dnd';

const $ = dom.$;

export class OpenEditorsView extends ViewsViewletPanel {

	private static readonly DEFAULT_VISIBLE_OPEN_EDITORS = 9;
	static readonly ID = 'workbench.explorer.openEditorsView';
	static NAME = nls.localize({ key: 'openEditors', comment: ['Open is an adjective'] }, "Open Editors");

	private model: IEditorStacksModel;
	private dirtyCountElement: HTMLElement;
	private listRefreshScheduler: RunOnceScheduler;
	private structuralRefreshDelay: number;
	private list: WorkbenchList<OpenEditor | IEditorGroup>;
	private contributedContextMenu: IMenu;
	private needsRefresh: boolean;
	private resourceContext: ResourceContextKey;
	private groupFocusedContext: IContextKey<boolean>;
	private dirtyEditorFocusedContext: IContextKey<boolean>;

	constructor(
		options: IViewletViewOptions,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITextFileService private textFileService: ITextFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IThemeService private themeService: IThemeService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IMenuService private menuService: IMenuService
	) {
		super({
			...(options as IViewOptions),
			ariaHeaderLabel: nls.localize({ key: 'openEditosrSection', comment: ['Open is an adjective'] }, "Open Editors Section"),
		}, keybindingService, contextMenuService, configurationService);

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
		const getSelectedElements = () => {
			const selected = this.list.getSelectedElements();
			const focused = this.list.getFocusedElements();
			if (focused.length && selected.indexOf(focused[0]) >= 0) {
				return selected;
			}

			return focused;
		};
		this.list = this.instantiationService.createInstance(WorkbenchList, container, delegate, [
			new EditorGroupRenderer(this.keybindingService, this.instantiationService, this.editorGroupService),
			new OpenEditorRenderer(getSelectedElements, this.instantiationService, this.keybindingService, this.configurationService, this.editorGroupService)
		], {
				identityProvider: (element: OpenEditor | EditorGroup) => element instanceof OpenEditor ? element.getId() : element.id.toString(),
				selectOnMouseDown: false /* disabled to better support DND */
			}) as WorkbenchList<OpenEditor | IEditorGroup>;

		this.contributedContextMenu = this.menuService.createMenu(MenuId.OpenEditorsContext, this.list.contextKeyService);
		this.disposables.push(this.contributedContextMenu);

		this.updateSize();

		// Bind context keys
		OpenEditorsFocusedContext.bindTo(this.list.contextKeyService);
		ExplorerFocusedContext.bindTo(this.list.contextKeyService);

		this.resourceContext = this.instantiationService.createInstance(ResourceContextKey);
		this.groupFocusedContext = OpenEditorsGroupContext.bindTo(this.contextKeyService);
		this.dirtyEditorFocusedContext = DirtyEditorContext.bindTo(this.contextKeyService);

		this.disposables.push(this.list.onContextMenu(e => this.onListContextMenu(e)));
		this.list.onFocusChange(e => {
			this.resourceContext.reset();
			this.groupFocusedContext.reset();
			this.dirtyEditorFocusedContext.reset();
			const element = e.elements.length ? e.elements[0] : undefined;
			if (element instanceof OpenEditor) {
				this.dirtyEditorFocusedContext.set(this.textFileService.isDirty(element.getResource()));
				this.resourceContext.set(element.getResource());
			} else if (!!element) {
				this.groupFocusedContext.set(true);
			}
		});

		// Open when selecting via keyboard
		this.disposables.push(this.list.onOpen(e => {
			const browserEvent = e.browserEvent;

			let openToSide = false;
			let isSingleClick = false;
			let isDoubleClick = false;
			let isMiddleClick = false;
			if (browserEvent instanceof MouseEvent) {
				isSingleClick = browserEvent.detail === 1;
				isDoubleClick = browserEvent.detail === 2;
				isMiddleClick = browserEvent.button === 1 /* middle button */;
				openToSide = this.list.useAltAsMultipleSelectionModifier ? (browserEvent.ctrlKey || browserEvent.metaKey) : browserEvent.altKey;
			}

			const focused = this.list.getFocusedElements();
			const element = focused.length ? focused[0] : undefined;
			if (element instanceof OpenEditor) {
				if (isMiddleClick) {
					const position = this.model.positionOfGroup(element.group);
					this.editorService.closeEditor(position, element.editor).done(null, errors.onUnexpectedError);
				} else {
					this.openEditor(element, { preserveFocus: isSingleClick, pinned: isDoubleClick, sideBySide: openToSide });
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

	public focus(): void {
		this.list.domFocus();
		super.focus();
	}

	public getList(): WorkbenchList<OpenEditor | IEditorGroup> {
		return this.list;
	}

	protected layoutBody(size: number): void {
		if (this.list) {
			this.list.layout(size);
		}
	}

	private get showGroups(): boolean {
		return this.model.groups.length > 1;
	}

	private get elements(): (IEditorGroup | OpenEditor)[] {
		const result: (IEditorGroup | OpenEditor)[] = [];
		this.model.groups.forEach(g => {
			if (this.showGroups) {
				result.push(g);
			}
			result.push(...g.getEditors().map(ei => new OpenEditor(ei, g)));
		});

		return result;
	}

	private getIndex(group: IEditorGroup, editor: IEditorInput): number {
		let index = editor ? group.indexOf(editor) : 0;
		if (!this.showGroups) {
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

	private openEditor(element: OpenEditor, options: { preserveFocus: boolean; pinned: boolean; sideBySide: boolean; }): void {
		if (element) {
			/* __GDPR__
				"workbenchActionExecuted" : {
					"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'openEditors' });

			let position = this.model.positionOfGroup(element.group);
			if (options.sideBySide && position !== Position.THREE) {
				position++;
			}

			const preserveActivateGroup = options.sideBySide && options.preserveFocus; // needed for https://github.com/Microsoft/vscode/issues/42399
			if (!preserveActivateGroup) {
				this.editorGroupService.activateGroup(this.model.groupAt(position)); // needed for https://github.com/Microsoft/vscode/issues/6672
			}
			this.editorService.openEditor(element.editor, options, position).done(() => {
				if (!preserveActivateGroup) {
					this.editorGroupService.activateGroup(this.model.groupAt(position));
				}
			}, errors.onUnexpectedError);
		}
	}

	private onListContextMenu(e: IListContextMenuEvent<OpenEditor | IEditorGroup>): void {
		const element = e.element;
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => {
				const actions: IAction[] = [];
				fillInActions(this.contributedContextMenu, { shouldForwardArgs: true, arg: element instanceof OpenEditor ? element.editor.getResource() : {} }, actions, this.contextMenuService);
				return TPromise.as(actions);
			},
			getActionsContext: () => element instanceof OpenEditor ? { groupId: element.group.id, editorIndex: element.editorIndex } : { groupId: element.id }
		});
	}

	private onEditorStacksModelChanged(e: IStacksModelChangeEvent): void {
		if (!this.isVisible() || !this.list || !this.isExpanded()) {
			this.needsRefresh = true;
			return;
		}

		// Do a minimal list update based on if the change is structural or not #6670
		if (e.structural) {
			this.listRefreshScheduler.schedule(this.structuralRefreshDelay);
		} else if (!this.listRefreshScheduler.isScheduled()) {

			const newElement = e.editor ? new OpenEditor(e.editor, e.group) : this.showGroups ? e.group : undefined;
			if (newElement) {
				const index = this.getIndex(e.group, e.editor);
				const previousLength = this.list.length;
				this.list.splice(index, 1, [newElement]);

				if (previousLength !== this.list.length) {
					this.updateSize();
				}
				this.focusActiveEditor();
			}
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
			.reduce((first, second) => first + second, this.showGroups ? this.model.groups.length : 0);
	}

	private getMaxExpandedBodySize(): number {
		return this.elementCount * OpenEditorsDelegate.ITEM_HEIGHT;
	}

	private getMinExpandedBodySize(): number {
		let visibleOpenEditors = this.configurationService.getValue<number>('explorer.openEditors.visible');
		if (typeof visibleOpenEditors !== 'number') {
			visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS;
		}

		return this.computeMinExpandedBodySize(visibleOpenEditors);
	}

	private computeMinExpandedBodySize(visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS): number {
		const itemsToShow = Math.min(Math.max(visibleOpenEditors, 1), this.elementCount);
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

	private transfer = LocalSelectionTransfer.getInstance<OpenEditor>();

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

		const saveAllInGroupAction = this.instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, SaveAllInGroupAction.LABEL);
		const key = this.keybindingService.lookupKeybinding(saveAllInGroupAction.id);
		editorGroupTemplate.actionBar.push(saveAllInGroupAction, { icon: true, label: false, keybinding: key ? key.getLabel() : void 0 });

		editorGroupTemplate.toDispose = [];
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_OVER, (e: DragEvent) => {
			dom.addClass(container, 'focused');
		}));
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_LEAVE, (e: DragEvent) => {
			dom.removeClass(container, 'focused');
		}));
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DROP, e => {
			dom.removeClass(container, 'focused');

			const model = this.editorGroupService.getStacksModel();
			const positionOfTargetGroup = model.positionOfGroup(editorGroupTemplate.editorGroup);

			if (this.transfer.hasData(OpenEditor.prototype)) {
				this.transfer.getData(OpenEditor.prototype).forEach(oe =>
					this.editorGroupService.moveEditor(oe.editor, model.positionOfGroup(oe.group), positionOfTargetGroup, { preserveFocus: true }));
				this.editorGroupService.activateGroup(positionOfTargetGroup);
			} else {
				const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
				dropHandler.handleDrop(e, () => this.editorGroupService.activateGroup(positionOfTargetGroup), positionOfTargetGroup);
			}
		}));

		return editorGroupTemplate;
	}

	renderElement(editorGroup: IEditorGroup, index: number, templateData: IEditorGroupTemplateData): void {
		templateData.editorGroup = editorGroup;
		templateData.name.textContent = editorGroup.label;
		templateData.actionBar.context = { groupId: editorGroup.id };
	}

	disposeTemplate(templateData: IEditorGroupTemplateData): void {
		templateData.actionBar.dispose();
		dispose(templateData.toDispose);
	}
}

class OpenEditorRenderer implements IRenderer<OpenEditor, IOpenEditorTemplateData> {
	static readonly ID = 'openeditor';

	private transfer = LocalSelectionTransfer.getInstance<OpenEditor>();

	constructor(
		private getSelectedElements: () => (OpenEditor | IEditorGroup)[],
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
			const dragged = <OpenEditor[]>this.getSelectedElements().filter(e => e instanceof OpenEditor && !!e.getResource());

			const dragImage = document.createElement('div');
			e.dataTransfer.effectAllowed = 'copyMove';
			dragImage.className = 'monaco-tree-drag-image';
			dragImage.textContent = dragged.length === 1 ? editorTemplate.openEditor.editor.getName() : String(dragged.length);
			document.body.appendChild(dragImage);
			e.dataTransfer.setDragImage(dragImage, -10, -10);
			setTimeout(() => document.body.removeChild(dragImage), 0);

			this.transfer.setData(dragged, OpenEditor.prototype);

			if (editorTemplate.openEditor && editorTemplate.openEditor.editor) {
				this.instantiationService.invokeFunction(fillResourceDataTransfers, dragged.map(d => d.getResource()), e);
			}
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_OVER, () => {
			dom.addClass(container, 'focused');
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_LEAVE, () => {
			dom.removeClass(container, 'focused');
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DROP, (e: DragEvent) => {
			dom.removeClass(container, 'focused');
			const model = this.editorGroupService.getStacksModel();
			const positionOfTargetGroup = model.positionOfGroup(editorTemplate.openEditor.group);
			const index = editorTemplate.openEditor.group.indexOf(editorTemplate.openEditor.editor);

			if (this.transfer.hasData(OpenEditor.prototype)) {
				this.transfer.getData(OpenEditor.prototype).forEach((oe, offset) =>
					this.editorGroupService.moveEditor(oe.editor, model.positionOfGroup(oe.group), positionOfTargetGroup, { index: index + offset, preserveFocus: true }));
				this.editorGroupService.activateGroup(positionOfTargetGroup);
			} else {
				const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
				dropHandler.handleDrop(e, () => this.editorGroupService.activateGroup(positionOfTargetGroup), positionOfTargetGroup, index);
			}
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_END, () => {
			this.transfer.clearData();
		}));

		return editorTemplate;
	}

	renderElement(editor: OpenEditor, index: number, templateData: IOpenEditorTemplateData): void {
		templateData.openEditor = editor;
		editor.isDirty() ? dom.addClass(templateData.container, 'dirty') : dom.removeClass(templateData.container, 'dirty');
		templateData.root.setEditor(editor.editor, {
			italic: editor.isPreview(),
			extraClasses: ['open-editor'],
			fileDecorations: this.configurationService.getValue<IFilesConfiguration>().explorer.decorations
		});
		templateData.actionBar.context = { groupId: editor.group.id, editorIndex: editor.editorIndex };
	}

	disposeTemplate(templateData: IOpenEditorTemplateData): void {
		templateData.actionBar.dispose();
		templateData.root.dispose();
		dispose(templateData.toDispose);
	}
}
