/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IAction, ActionRunner } from 'vs/base/common/actions';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupsService, IEditorGroup, GroupChangeKind, GroupsOrder } from 'vs/workbench/services/group/common/editorGroupsService';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorInput } from 'vs/workbench/common/editor';
import { SaveAllAction, SaveAllInGroupAction, CloseGroupAction } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { OpenEditorsFocusedContext, ExplorerFocusedContext, IFilesConfiguration } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { CloseAllEditorsAction, CloseEditorAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { ToggleEditorLayoutAction } from 'vs/workbench/browser/actions/toggleEditorLayout';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { badgeBackground, badgeForeground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { ResourceLabels, IResourceLabel, IResourceLabelsContainer } from 'vs/workbench/browser/labels';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { fillInContextMenuActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { DirtyEditorContext, OpenEditorsGroupContext } from 'vs/workbench/parts/files/electron-browser/fileCommands';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { fillResourceDataTransfers, ResourcesDropHandler, LocalSelectionTransfer, CodeDataTransfers } from 'vs/workbench/browser/dnd';
import { ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';

const $ = dom.$;

export class OpenEditorsView extends ViewletPanel {

	private static readonly DEFAULT_VISIBLE_OPEN_EDITORS = 9;
	static readonly ID = 'workbench.explorer.openEditorsView';
	static NAME = nls.localize({ key: 'openEditors', comment: ['Open is an adjective'] }, "Open Editors");

	private dirtyCountElement: HTMLElement;
	private listRefreshScheduler: RunOnceScheduler;
	private structuralRefreshDelay: number;
	private list: WorkbenchList<OpenEditor | IEditorGroup>;
	private listLabels: ResourceLabels;
	private contributedContextMenu: IMenu;
	private needsRefresh: boolean;
	private resourceContext: ResourceContextKey;
	private groupFocusedContext: IContextKey<boolean>;
	private dirtyEditorFocusedContext: IContextKey<boolean>;

	constructor(
		options: IViewletViewOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IMenuService private readonly menuService: IMenuService
	) {
		super({
			...(options as IViewletPanelOptions),
			ariaHeaderLabel: nls.localize({ key: 'openEditosrSection', comment: ['Open is an adjective'] }, "Open Editors Section"),
		}, keybindingService, contextMenuService, configurationService);

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

		this.registerUpdateEvents();

		// Also handle configuration updates
		this.disposables.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(e)));

		// Handle dirty counter
		this.disposables.push(this.untitledEditorService.onDidChangeDirty(() => this.updateDirtyIndicator()));
		this.disposables.push(this.textFileService.models.onModelsDirty(() => this.updateDirtyIndicator()));
		this.disposables.push(this.textFileService.models.onModelsSaved(() => this.updateDirtyIndicator()));
		this.disposables.push(this.textFileService.models.onModelsSaveError(() => this.updateDirtyIndicator()));
		this.disposables.push(this.textFileService.models.onModelsReverted(() => this.updateDirtyIndicator()));
	}

	private registerUpdateEvents(): void {
		const updateWholeList = () => {
			if (!this.isBodyVisible() || !this.list) {
				this.needsRefresh = true;
				return;
			}

			this.listRefreshScheduler.schedule(this.structuralRefreshDelay);
		};

		const groupDisposables = new Map<number, IDisposable>();
		const addGroupListener = (group: IEditorGroup) => {
			groupDisposables.set(group.id, group.onDidGroupChange(e => {
				if (this.listRefreshScheduler.isScheduled()) {
					return;
				}
				if (!this.isBodyVisible() || !this.list) {
					this.needsRefresh = true;
					return;
				}

				const index = this.getIndex(group, e.editor);
				switch (e.kind) {
					case GroupChangeKind.GROUP_LABEL: {
						if (this.showGroups) {
							this.list.splice(index, 1, [group]);
						}
						break;
					}
					case GroupChangeKind.GROUP_ACTIVE:
					case GroupChangeKind.EDITOR_ACTIVE: {
						this.focusActiveEditor();
						break;
					}
					case GroupChangeKind.EDITOR_DIRTY:
					case GroupChangeKind.EDITOR_LABEL:
					case GroupChangeKind.EDITOR_PIN: {
						this.list.splice(index, 1, [new OpenEditor(e.editor, group)]);
						break;
					}
					case GroupChangeKind.EDITOR_OPEN: {
						this.list.splice(index, 0, [new OpenEditor(e.editor, group)]);
						setTimeout(() => this.updateSize(), this.structuralRefreshDelay);
						break;
					}
					case GroupChangeKind.EDITOR_CLOSE: {
						const previousIndex = this.getIndex(group, undefined) + e.editorIndex + (this.showGroups ? 1 : 0);
						this.list.splice(previousIndex, 1);
						this.updateSize();
						break;
					}
					case GroupChangeKind.EDITOR_MOVE: {
						this.listRefreshScheduler.schedule();
						break;
					}
				}
			}));
			this.disposables.push(groupDisposables.get(group.id));
		};

		this.editorGroupService.groups.forEach(g => addGroupListener(g));
		this.disposables.push(this.editorGroupService.onDidAddGroup(group => {
			addGroupListener(group);
			updateWholeList();
		}));
		this.disposables.push(this.editorGroupService.onDidMoveGroup(() => updateWholeList()));
		this.disposables.push(this.editorGroupService.onDidRemoveGroup(group => {
			dispose(groupDisposables.get(group.id));
			updateWholeList();
		}));
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		super.renderHeaderTitle(container, this.title);

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

		if (this.list) {
			this.list.dispose();
		}
		if (this.listLabels) {
			this.listLabels.clear();
		}
		this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility } as IResourceLabelsContainer);
		this.list = this.instantiationService.createInstance(WorkbenchList, container, delegate, [
			new EditorGroupRenderer(this.keybindingService, this.instantiationService, this.editorGroupService),
			new OpenEditorRenderer(this.listLabels, getSelectedElements, this.instantiationService, this.keybindingService, this.configurationService, this.editorGroupService)
		], {
				identityProvider: { getId: (element: OpenEditor | IEditorGroup) => element instanceof OpenEditor ? element.getId() : element.id.toString() }
			}) as WorkbenchList<OpenEditor | IEditorGroup>;
		this.disposables.push(this.list);
		this.disposables.push(this.listLabels);

		this.contributedContextMenu = this.menuService.createMenu(MenuId.OpenEditorsContext, this.list.contextKeyService);
		this.disposables.push(this.contributedContextMenu);

		this.updateSize();

		// Bind context keys
		OpenEditorsFocusedContext.bindTo(this.list.contextKeyService);
		ExplorerFocusedContext.bindTo(this.list.contextKeyService);

		this.resourceContext = this.instantiationService.createInstance(ResourceContextKey);
		this.disposables.push(this.resourceContext);
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
		this.disposables.push(this.list.onMouseMiddleClick(e => {
			if (e && e.element instanceof OpenEditor) {
				e.element.group.closeEditor(e.element.editor);
			}
		}));
		this.disposables.push(this.list.onDidOpen(e => {
			const browserEvent = e.browserEvent;

			let openToSide = false;
			let isSingleClick = false;
			let isDoubleClick = false;
			if (browserEvent instanceof MouseEvent) {
				isSingleClick = browserEvent.detail === 1;
				isDoubleClick = browserEvent.detail === 2;
				openToSide = this.list.useAltAsMultipleSelectionModifier ? (browserEvent.ctrlKey || browserEvent.metaKey) : browserEvent.altKey;
			}

			const focused = this.list.getFocusedElements();
			const element = focused.length ? focused[0] : undefined;
			if (element instanceof OpenEditor) {
				this.openEditor(element, { preserveFocus: isSingleClick, pinned: isDoubleClick, sideBySide: openToSide });
			} else if (element) {
				this.editorGroupService.activateGroup(element);
			}
		}));

		this.listRefreshScheduler.schedule(0);

		this.disposables.push(this.onDidChangeBodyVisibility(visible => {
			this.updateListVisibility(visible);
			if (visible && this.needsRefresh) {
				this.listRefreshScheduler.schedule(0);
			}
		}));
	}

	public getActions(): IAction[] {
		return [
			this.instantiationService.createInstance(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL),
			this.instantiationService.createInstance(SaveAllAction, SaveAllAction.ID, SaveAllAction.LABEL),
			this.instantiationService.createInstance(CloseAllEditorsAction, CloseAllEditorsAction.ID, CloseAllEditorsAction.LABEL)
		];
	}

	public focus(): void {
		super.focus();
		this.list.domFocus();
	}

	public getList(): WorkbenchList<OpenEditor | IEditorGroup> {
		return this.list;
	}

	protected layoutBody(size: number): void {
		if (this.list) {
			this.list.layout(size);
		}
	}

	private updateListVisibility(isVisible: boolean): void {
		if (this.list) {
			if (isVisible) {
				dom.show(this.list.getHTMLElement());
			} else {
				dom.hide(this.list.getHTMLElement()); // make sure the list goes out of the tabindex world by hiding it
			}
		}
	}

	private get showGroups(): boolean {
		return this.editorGroupService.groups.length > 1;
	}

	private get elements(): Array<IEditorGroup | OpenEditor> {
		const result: Array<IEditorGroup | OpenEditor> = [];
		this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).forEach(g => {
			if (this.showGroups) {
				result.push(g);
			}
			result.push(...g.editors.map(ei => new OpenEditor(ei, g)));
		});

		return result;
	}

	private getIndex(group: IEditorGroup, editor: IEditorInput): number {
		let index = editor ? group.getIndexOfEditor(editor) : 0;
		if (!this.showGroups) {
			return index;
		}

		for (let g of this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
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

			const preserveActivateGroup = options.sideBySide && options.preserveFocus; // needed for https://github.com/Microsoft/vscode/issues/42399
			if (!preserveActivateGroup) {
				this.editorGroupService.activateGroup(element.groupId); // needed for https://github.com/Microsoft/vscode/issues/6672
			}
			this.editorService.openEditor(element.editor, options, options.sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => {
				if (editor && !preserveActivateGroup) {
					this.editorGroupService.activateGroup(editor.group);
				}
			});
		}
	}

	private onListContextMenu(e: IListContextMenuEvent<OpenEditor | IEditorGroup>): void {
		if (!e.element) {
			return;
		}

		const element = e.element;
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => {
				const actions: IAction[] = [];
				fillInContextMenuActions(this.contributedContextMenu, { shouldForwardArgs: true, arg: element instanceof OpenEditor ? element.editor.getResource() : {} }, actions, this.contextMenuService);
				return actions;
			},
			getActionsContext: () => element instanceof OpenEditor ? { groupId: element.groupId, editorIndex: element.editorIndex } : { groupId: element.id }
		});
	}

	private focusActiveEditor(): void {
		if (this.list.length && this.editorGroupService.activeGroup) {
			const index = this.getIndex(this.editorGroupService.activeGroup, this.editorGroupService.activeGroup.activeEditor);
			this.list.setFocus([index]);
			this.list.setSelection([index]);
			this.list.reveal(index);
		} else {
			this.list.setFocus([]);
			this.list.setSelection([]);
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
		return this.editorGroupService.groups.map(g => g.count)
			.reduce((first, second) => first + second, this.showGroups ? this.editorGroupService.groups.length : 0);
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
		let childNodes: HTMLElement[] = [].slice.call(parentNode.querySelectorAll('.open-editor > a'));

		return dom.getLargestChildWidth(parentNode, childNodes);
	}
}

interface IOpenEditorTemplateData {
	container: HTMLElement;
	root: IResourceLabel;
	actionBar: ActionBar;
	actionRunner: OpenEditorActionRunner;
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

class OpenEditorActionRunner extends ActionRunner {
	public editor: OpenEditor;

	run(action: IAction, context?: any): Promise<void> {
		return super.run(action, { groupId: this.editor.groupId, editorIndex: this.editor.editorIndex });
	}
}

class OpenEditorsDelegate implements IListVirtualDelegate<OpenEditor | IEditorGroup> {

	public static readonly ITEM_HEIGHT = 22;

	getHeight(element: OpenEditor | IEditorGroup): number {
		return OpenEditorsDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: OpenEditor | IEditorGroup): string {
		if (element instanceof OpenEditor) {
			return OpenEditorRenderer.ID;
		}

		return EditorGroupRenderer.ID;
	}
}

/**
 * Check if the item being dragged is one of the supported types that can be dropped on an
 * open editor or editor group. Fixes https://github.com/Microsoft/vscode/issues/52344.
 *
 * @returns true if dropping is supported.
 */
function dropOnEditorSupported(e: DragEvent): boolean {
	// DataTransfer types are automatically converted to lower case, except Files.
	const supportedTransferTypes = {
		openEditor: CodeDataTransfers.EDITORS.toLowerCase(),
		externalFile: 'Files',
		codeFile: CodeDataTransfers.FILES.toLowerCase()
	};

	if (
		e.dataTransfer.types.indexOf(supportedTransferTypes.openEditor) !== -1 ||
		e.dataTransfer.types.indexOf(supportedTransferTypes.externalFile) !== -1 ||
		// All Code files should already register as normal files, but just to be safe:
		e.dataTransfer.types.indexOf(supportedTransferTypes.codeFile) !== -1
	) {
		return true;
	} else {
		return false;
	}
}

class EditorGroupRenderer implements IListRenderer<IEditorGroup, IEditorGroupTemplateData> {
	static readonly ID = 'editorgroup';

	private transfer = LocalSelectionTransfer.getInstance<OpenEditor>();

	constructor(
		private keybindingService: IKeybindingService,
		private instantiationService: IInstantiationService,
		private editorGroupService: IEditorGroupsService
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
		const saveAllInGroupKey = this.keybindingService.lookupKeybinding(saveAllInGroupAction.id);
		editorGroupTemplate.actionBar.push(saveAllInGroupAction, { icon: true, label: false, keybinding: saveAllInGroupKey ? saveAllInGroupKey.getLabel() : undefined });

		const closeGroupAction = this.instantiationService.createInstance(CloseGroupAction, CloseGroupAction.ID, CloseGroupAction.LABEL);
		const closeGroupActionKey = this.keybindingService.lookupKeybinding(closeGroupAction.id);
		editorGroupTemplate.actionBar.push(closeGroupAction, { icon: true, label: false, keybinding: closeGroupActionKey ? closeGroupActionKey.getLabel() : undefined });

		editorGroupTemplate.toDispose = [];
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_OVER, (e: DragEvent) => {
			if (dropOnEditorSupported(e)) {
				dom.addClass(container, 'focused');
			}
		}));
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_LEAVE, () => {
			dom.removeClass(container, 'focused');
		}));
		editorGroupTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DROP, e => {
			dom.removeClass(container, 'focused');


			if (this.transfer.hasData(OpenEditor.prototype)) {
				this.transfer.getData(OpenEditor.prototype).forEach(oe =>
					oe.group.moveEditor(oe.editor, editorGroupTemplate.editorGroup, { preserveFocus: true }));
				this.editorGroupService.activateGroup(editorGroupTemplate.editorGroup);
			} else {
				const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
				dropHandler.handleDrop(e, () => editorGroupTemplate.editorGroup, () => editorGroupTemplate.editorGroup.focus());
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

class OpenEditorRenderer implements IListRenderer<OpenEditor, IOpenEditorTemplateData> {
	static readonly ID = 'openeditor';

	private transfer = LocalSelectionTransfer.getInstance<OpenEditor>();

	constructor(
		private labels: ResourceLabels,
		private getSelectedElements: () => Array<OpenEditor | IEditorGroup>,
		private instantiationService: IInstantiationService,
		private keybindingService: IKeybindingService,
		private configurationService: IConfigurationService,
		private editorGroupService: IEditorGroupsService
	) {
		// noop
	}

	get templateId() {
		return OpenEditorRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IOpenEditorTemplateData {
		const editorTemplate: IOpenEditorTemplateData = Object.create(null);
		editorTemplate.container = container;
		editorTemplate.actionRunner = new OpenEditorActionRunner();
		editorTemplate.actionBar = new ActionBar(container, { actionRunner: editorTemplate.actionRunner });
		container.draggable = true;

		const closeEditorAction = this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL);
		const key = this.keybindingService.lookupKeybinding(closeEditorAction.id);
		editorTemplate.actionBar.push(closeEditorAction, { icon: true, label: false, keybinding: key ? key.getLabel() : undefined });

		editorTemplate.root = this.labels.create(container);

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
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_OVER, (e: DragEvent) => {
			if (dropOnEditorSupported(e)) {
				dom.addClass(container, 'focused');
			}
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_LEAVE, () => {
			dom.removeClass(container, 'focused');
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DROP, (e: DragEvent) => {
			dom.removeClass(container, 'focused');
			const index = editorTemplate.openEditor.group.getIndexOfEditor(editorTemplate.openEditor.editor);

			if (this.transfer.hasData(OpenEditor.prototype)) {
				this.transfer.getData(OpenEditor.prototype).forEach((oe, offset) =>
					oe.group.moveEditor(oe.editor, editorTemplate.openEditor.group, { index: index + offset, preserveFocus: true }));
				this.editorGroupService.activateGroup(editorTemplate.openEditor.group);
			} else {
				const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
				dropHandler.handleDrop(e, () => editorTemplate.openEditor.group, () => editorTemplate.openEditor.group.focus(), index);
			}
		}));
		editorTemplate.toDispose.push(dom.addDisposableListener(container, dom.EventType.DRAG_END, () => {
			this.transfer.clearData(OpenEditor.prototype);
		}));

		return editorTemplate;
	}

	renderElement(editor: OpenEditor, index: number, templateData: IOpenEditorTemplateData): void {
		templateData.openEditor = editor;
		templateData.actionRunner.editor = editor;
		editor.isDirty() ? dom.addClass(templateData.container, 'dirty') : dom.removeClass(templateData.container, 'dirty');
		templateData.root.setEditor(editor.editor, {
			italic: editor.isPreview(),
			extraClasses: ['open-editor'],
			fileDecorations: this.configurationService.getValue<IFilesConfiguration>().explorer.decorations
		});
	}

	disposeTemplate(templateData: IOpenEditorTemplateData): void {
		templateData.actionBar.dispose();
		templateData.root.dispose();
		templateData.actionRunner.dispose();
		dispose(templateData.toDispose);
	}
}
