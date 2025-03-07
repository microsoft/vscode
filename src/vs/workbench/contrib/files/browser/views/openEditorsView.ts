/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/openeditors.css';
import * as nls from '../../../../../nls.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { IAction, ActionRunner, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from '../../../../../base/common/actions.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsService, IEditorGroup, GroupsOrder, GroupOrientation } from '../../../../services/editor/common/editorGroupsService.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { Verbosity, EditorResourceAccessor, SideBySideEditor, IEditorIdentifier, GroupModelChangeKind, preventEditorClose, EditorCloseMethod } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { SaveAllInGroupAction, CloseGroupAction } from '../fileActions.js';
import { OpenEditorsFocusedContext, ExplorerFocusedContext, IFilesConfiguration, OpenEditor } from '../../common/files.js';
import { CloseAllEditorsAction, CloseEditorAction, UnpinEditorAction } from '../../../../browser/parts/editor/editorActions.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { asCssVariable, badgeBackground, badgeForeground, contrastBorder } from '../../../../../platform/theme/common/colorRegistry.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent, IListDragAndDrop, IListDragOverReaction, ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../../base/browser/ui/list/list.js';
import { ResourceLabels, IResourceLabel } from '../../../../browser/labels.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { DisposableMap, IDisposable, dispose } from '../../../../../base/common/lifecycle.js';
import { MenuId, Action2, registerAction2, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { OpenEditorsDirtyEditorContext, OpenEditorsGroupContext, OpenEditorsReadonlyEditorContext, SAVE_ALL_LABEL, SAVE_ALL_COMMAND_ID, NEW_UNTITLED_FILE_COMMAND_ID, OpenEditorsSelectedFileOrUntitledContext } from '../fileConstants.js';
import { ResourceContextKey, MultipleEditorGroupsContext } from '../../../../common/contextkeys.js';
import { CodeDataTransfers, containsDragType } from '../../../../../platform/dnd/browser/dnd.js';
import { ResourcesDropHandler, fillEditorsDragData } from '../../../../browser/dnd.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IDragAndDropData, DataTransfers } from '../../../../../base/browser/dnd.js';
import { memoize } from '../../../../../base/common/decorators.js';
import { ElementsDragAndDropData, ListViewTargetSector, NativeDragAndDropData } from '../../../../../base/browser/ui/list/listView.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { IWorkingCopy, WorkingCopyCapabilities } from '../../../../services/workingCopy/common/workingCopy.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { Orientation } from '../../../../../base/browser/ui/splitview/splitview.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { compareFileNamesDefault } from '../../../../../base/common/comparers.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Schemas } from '../../../../../base/common/network.js';
import { extUriIgnorePathCase } from '../../../../../base/common/resources.js';
import { ILocalizedString } from '../../../../../platform/action/common/action.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { EditorGroupView } from '../../../../browser/parts/editor/editorGroupView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

const $ = dom.$;

export class OpenEditorsView extends ViewPane {

	private static readonly DEFAULT_VISIBLE_OPEN_EDITORS = 9;
	private static readonly DEFAULT_MIN_VISIBLE_OPEN_EDITORS = 0;
	static readonly ID = 'workbench.explorer.openEditorsView';
	static readonly NAME: ILocalizedString = nls.localize2({ key: 'openEditors', comment: ['Open is an adjective'] }, "Open Editors");

	private dirtyCountElement!: HTMLElement;
	private listRefreshScheduler: RunOnceScheduler | undefined;
	private structuralRefreshDelay: number;
	private dnd: OpenEditorsDragAndDrop | undefined;
	private list: WorkbenchList<OpenEditor | IEditorGroup> | undefined;
	private listLabels: ResourceLabels | undefined;
	private needsRefresh = false;
	private elements: (OpenEditor | IEditorGroup)[] = [];
	private sortOrder: 'editorOrder' | 'alphabetical' | 'fullPath';
	private blockFocusActiveEditorTracking = false;

	constructor(
		options: IViewletViewOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IOpenerService openerService: IOpenerService,
		@IFileService private readonly fileService: IFileService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.structuralRefreshDelay = 0;
		this.sortOrder = configurationService.getValue('explorer.openEditors.sortOrder');

		this.registerUpdateEvents();

		// Also handle configuration updates
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(e)));

		// Handle dirty counter
		this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.updateDirtyIndicator(workingCopy)));
	}

	private registerUpdateEvents(): void {
		const updateWholeList = () => {
			if (!this.isBodyVisible() || !this.list) {
				this.needsRefresh = true;
				return;
			}

			this.listRefreshScheduler?.schedule(this.structuralRefreshDelay);
		};

		const groupDisposables = this._register(new DisposableMap<number>());
		const addGroupListener = (group: IEditorGroup) => {
			const groupModelChangeListener = group.onDidModelChange(e => {
				if (this.listRefreshScheduler?.isScheduled()) {
					return;
				}
				if (!this.isBodyVisible() || !this.list) {
					this.needsRefresh = true;
					return;
				}

				const index = this.getIndex(group, e.editor);
				switch (e.kind) {
					case GroupModelChangeKind.EDITOR_ACTIVE:
						this.focusActiveEditor();
						break;
					case GroupModelChangeKind.GROUP_INDEX:
					case GroupModelChangeKind.GROUP_LABEL:
						if (index >= 0) {
							this.list.splice(index, 1, [group]);
						}
						break;
					case GroupModelChangeKind.EDITOR_DIRTY:
					case GroupModelChangeKind.EDITOR_STICKY:
					case GroupModelChangeKind.EDITOR_CAPABILITIES:
					case GroupModelChangeKind.EDITOR_PIN:
					case GroupModelChangeKind.EDITOR_LABEL:
						this.list.splice(index, 1, [new OpenEditor(e.editor!, group)]);
						this.focusActiveEditor();
						break;
					case GroupModelChangeKind.EDITOR_OPEN:
					case GroupModelChangeKind.EDITOR_MOVE:
					case GroupModelChangeKind.EDITOR_CLOSE:
						updateWholeList();
						break;
				}
			});
			groupDisposables.set(group.id, groupModelChangeListener);
		};

		this.editorGroupService.groups.forEach(g => addGroupListener(g));
		this._register(this.editorGroupService.onDidAddGroup(group => {
			addGroupListener(group);
			updateWholeList();
		}));
		this._register(this.editorGroupService.onDidMoveGroup(() => updateWholeList()));
		this._register(this.editorGroupService.onDidChangeActiveGroup(() => this.focusActiveEditor()));
		this._register(this.editorGroupService.onDidRemoveGroup(group => {
			groupDisposables.deleteAndDispose(group.id);
			updateWholeList();
		}));
	}

	protected override renderHeaderTitle(container: HTMLElement): void {
		super.renderHeaderTitle(container, this.title);

		const count = dom.append(container, $('.open-editors-dirty-count-container'));
		this.dirtyCountElement = dom.append(count, $('.dirty-count.monaco-count-badge.long'));

		this.dirtyCountElement.style.backgroundColor = asCssVariable(badgeBackground);
		this.dirtyCountElement.style.color = asCssVariable(badgeForeground);
		this.dirtyCountElement.style.border = `1px solid ${asCssVariable(contrastBorder)}`;

		this.updateDirtyIndicator();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('open-editors');
		container.classList.add('show-file-icons');

		const delegate = new OpenEditorsDelegate();

		if (this.list) {
			this.list.dispose();
		}
		if (this.listLabels) {
			this.listLabels.clear();
		}

		this.dnd = new OpenEditorsDragAndDrop(this.sortOrder, this.instantiationService, this.editorGroupService);

		this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this.list = this.instantiationService.createInstance(WorkbenchList, 'OpenEditors', container, delegate, [
			new EditorGroupRenderer(this.keybindingService, this.instantiationService),
			new OpenEditorRenderer(this.listLabels, this.instantiationService, this.keybindingService, this.configurationService)
		], {
			identityProvider: { getId: (element: OpenEditor | IEditorGroup) => element instanceof OpenEditor ? element.getId() : element.id.toString() },
			dnd: this.dnd,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			accessibilityProvider: new OpenEditorsAccessibilityProvider()
		}) as WorkbenchList<OpenEditor | IEditorGroup>;
		this._register(this.list);
		this._register(this.listLabels);

		// Register the refresh scheduler
		let labelChangeListeners: IDisposable[] = [];
		this.listRefreshScheduler = this._register(new RunOnceScheduler(() => {
			// No need to refresh the list if it's not rendered
			if (!this.list) {
				return;
			}
			labelChangeListeners = dispose(labelChangeListeners);
			const previousLength = this.list.length;
			const elements = this.getElements();
			this.list.splice(0, this.list.length, elements);
			this.focusActiveEditor();
			if (previousLength !== this.list.length) {
				this.updateSize();
			}
			this.needsRefresh = false;

			if (this.sortOrder === 'alphabetical' || this.sortOrder === 'fullPath') {
				// We need to resort the list if the editor label changed
				elements.forEach(e => {
					if (e instanceof OpenEditor) {
						labelChangeListeners.push(e.editor.onDidChangeLabel(() => this.listRefreshScheduler?.schedule()));
					}
				});
			}
		}, this.structuralRefreshDelay));

		this.updateSize();

		this.handleContextKeys();
		this._register(this.list.onContextMenu(e => this.onListContextMenu(e)));

		// Open when selecting via keyboard
		this._register(this.list.onMouseMiddleClick(e => {
			if (e && e.element instanceof OpenEditor) {
				if (preventEditorClose(e.element.group, e.element.editor, EditorCloseMethod.MOUSE, this.editorGroupService.partOptions)) {
					return;
				}

				e.element.group.closeEditor(e.element.editor, { preserveFocus: true });
			}
		}));
		this._register(this.list.onDidOpen(e => {
			const element = e.element;
			if (!element) {
				return;
			} else if (element instanceof OpenEditor) {
				if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.button === 1) {
					return; // middle click already handled above: closes the editor
				}

				this.withActiveEditorFocusTrackingDisabled(() => {
					this.openEditor(element, { preserveFocus: e.editorOptions.preserveFocus, pinned: e.editorOptions.pinned, sideBySide: e.sideBySide });
				});
			} else {
				this.withActiveEditorFocusTrackingDisabled(() => {
					this.editorGroupService.activateGroup(element);
					if (!e.editorOptions.preserveFocus) {
						element.focus();
					}
				});
			}
		}));

		this.listRefreshScheduler.schedule(0);

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible && this.needsRefresh) {
				this.listRefreshScheduler?.schedule(0);
			}
		}));

		const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id)!)!;
		this._register(containerModel.onDidChangeAllViewDescriptors(() => {
			this.updateSize();
		}));
	}

	private handleContextKeys() {
		if (!this.list) {
			return;
		}

		// Bind context keys
		OpenEditorsFocusedContext.bindTo(this.list.contextKeyService);
		ExplorerFocusedContext.bindTo(this.list.contextKeyService);

		const groupFocusedContext = OpenEditorsGroupContext.bindTo(this.contextKeyService);
		const dirtyEditorFocusedContext = OpenEditorsDirtyEditorContext.bindTo(this.contextKeyService);
		const readonlyEditorFocusedContext = OpenEditorsReadonlyEditorContext.bindTo(this.contextKeyService);
		const openEditorsSelectedFileOrUntitledContext = OpenEditorsSelectedFileOrUntitledContext.bindTo(this.contextKeyService);

		const resourceContext = this.instantiationService.createInstance(ResourceContextKey);
		this._register(resourceContext);

		this._register(this.list.onDidChangeFocus(e => {
			resourceContext.reset();
			groupFocusedContext.reset();
			dirtyEditorFocusedContext.reset();
			readonlyEditorFocusedContext.reset();

			const element = e.elements.length ? e.elements[0] : undefined;
			if (element instanceof OpenEditor) {
				const resource = element.getResource();
				dirtyEditorFocusedContext.set(element.editor.isDirty() && !element.editor.isSaving());
				readonlyEditorFocusedContext.set(!!element.editor.isReadonly());
				resourceContext.set(resource ?? null);
			} else if (!!element) {
				groupFocusedContext.set(true);
			}
		}));

		this._register(this.list.onDidChangeSelection(e => {
			const selectedAreFileOrUntitled = e.elements.every(e => {
				if (e instanceof OpenEditor) {
					const resource = e.getResource();
					return resource && (resource.scheme === Schemas.untitled || this.fileService.hasProvider(resource));
				}
				return false;
			});
			openEditorsSelectedFileOrUntitledContext.set(selectedAreFileOrUntitled);
		}));
	}

	override focus(): void {
		super.focus();

		this.list?.domFocus();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.list?.layout(height, width);
	}

	private get showGroups(): boolean {
		return this.editorGroupService.groups.length > 1;
	}

	private getElements(): Array<IEditorGroup | OpenEditor> {
		this.elements = [];
		this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).forEach(g => {
			if (this.showGroups) {
				this.elements.push(g);
			}
			let editors = g.editors.map(ei => new OpenEditor(ei, g));
			if (this.sortOrder === 'alphabetical') {
				editors = editors.sort((first, second) => compareFileNamesDefault(first.editor.getName(), second.editor.getName()));
			} else if (this.sortOrder === 'fullPath') {
				editors = editors.sort((first, second) => {
					const firstResource = first.editor.resource;
					const secondResource = second.editor.resource;
					//put 'system' editors before everything
					if (firstResource === undefined && secondResource === undefined) {
						return compareFileNamesDefault(first.editor.getName(), second.editor.getName());
					} else if (firstResource === undefined) {
						return -1;
					} else if (secondResource === undefined) {
						return 1;
					} else {
						const firstScheme = firstResource.scheme;
						const secondScheme = secondResource.scheme;
						//put non-file editors before files
						if (firstScheme !== Schemas.file && secondScheme !== Schemas.file) {
							return extUriIgnorePathCase.compare(firstResource, secondResource);
						} else if (firstScheme !== Schemas.file) {
							return -1;
						} else if (secondScheme !== Schemas.file) {
							return 1;
						} else {
							return extUriIgnorePathCase.compare(firstResource, secondResource);
						}
					}
				});
			}
			this.elements.push(...editors);
		});

		return this.elements;
	}

	private getIndex(group: IEditorGroup, editor: EditorInput | undefined | null): number {
		if (!editor) {
			return this.elements.findIndex(e => !(e instanceof OpenEditor) && e.id === group.id);
		}

		return this.elements.findIndex(e => e instanceof OpenEditor && e.editor === editor && e.group.id === group.id);
	}

	private openEditor(element: OpenEditor, options: { preserveFocus?: boolean; pinned?: boolean; sideBySide?: boolean }): void {
		if (element) {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'openEditors' });

			const preserveActivateGroup = options.sideBySide && options.preserveFocus; // needed for https://github.com/microsoft/vscode/issues/42399
			if (!preserveActivateGroup) {
				this.editorGroupService.activateGroup(element.group); // needed for https://github.com/microsoft/vscode/issues/6672
			}
			const targetGroup = options.sideBySide ? this.editorGroupService.sideGroup : element.group;
			targetGroup.openEditor(element.editor, options);
		}
	}

	private onListContextMenu(e: IListContextMenuEvent<OpenEditor | IEditorGroup>): void {
		if (!e.element) {
			return;
		}

		const element = e.element;

		this.contextMenuService.showContextMenu({
			menuId: MenuId.OpenEditorsContext,
			menuActionOptions: { shouldForwardArgs: true, arg: element instanceof OpenEditor ? EditorResourceAccessor.getOriginalUri(element.editor) : {} },
			contextKeyService: this.list?.contextKeyService,
			getAnchor: () => e.anchor,
			getActionsContext: () => element instanceof OpenEditor ? { groupId: element.groupId, editorIndex: element.group.getIndexOfEditor(element.editor) } : { groupId: element.id }
		});
	}

	private withActiveEditorFocusTrackingDisabled(fn: () => void): void {
		this.blockFocusActiveEditorTracking = true;
		try {
			fn();
		} finally {
			this.blockFocusActiveEditorTracking = false;
		}
	}

	private focusActiveEditor(): void {
		if (!this.list || this.blockFocusActiveEditorTracking) {
			return;
		}

		if (this.list.length && this.editorGroupService.activeGroup) {
			const index = this.getIndex(this.editorGroupService.activeGroup, this.editorGroupService.activeGroup.activeEditor);
			if (index >= 0) {
				try {
					this.list.setFocus([index]);
					this.list.setSelection([index]);
					this.list.reveal(index);
				} catch (e) {
					// noop list updated in the meantime
				}
				return;
			}
		}

		this.list.setFocus([]);
		this.list.setSelection([]);
	}

	private onConfigurationChange(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration('explorer.openEditors')) {
			this.updateSize();
		}
		// Trigger a 'repaint' when decoration settings change or the sort order changed
		if (event.affectsConfiguration('explorer.decorations') || event.affectsConfiguration('explorer.openEditors.sortOrder')) {
			this.sortOrder = this.configurationService.getValue('explorer.openEditors.sortOrder');
			if (this.dnd) {
				this.dnd.sortOrder = this.sortOrder;
			}
			this.listRefreshScheduler?.schedule();
		}
	}

	private updateSize(): void {
		// Adjust expanded body size
		this.minimumBodySize = this.orientation === Orientation.VERTICAL ? this.getMinExpandedBodySize() : 170;
		this.maximumBodySize = this.orientation === Orientation.VERTICAL ? this.getMaxExpandedBodySize() : Number.POSITIVE_INFINITY;
	}

	private updateDirtyIndicator(workingCopy?: IWorkingCopy): void {
		if (workingCopy) {
			const gotDirty = workingCopy.isDirty();
			if (gotDirty && !(workingCopy.capabilities & WorkingCopyCapabilities.Untitled) && this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource)) {
				return; // do not indicate dirty of working copies that are auto saved after short delay
			}
		}

		const dirty = this.workingCopyService.dirtyCount;
		if (dirty === 0) {
			this.dirtyCountElement.classList.add('hidden');
		} else {
			this.dirtyCountElement.textContent = nls.localize('dirtyCounter', "{0} unsaved", dirty);
			this.dirtyCountElement.classList.remove('hidden');
		}
	}

	private get elementCount(): number {
		return this.editorGroupService.groups.map(g => g.count)
			.reduce((first, second) => first + second, this.showGroups ? this.editorGroupService.groups.length : 0);
	}

	private getMaxExpandedBodySize(): number {
		let minVisibleOpenEditors = this.configurationService.getValue<number>('explorer.openEditors.minVisible');
		// If it's not a number setting it to 0 will result in dynamic resizing.
		if (typeof minVisibleOpenEditors !== 'number') {
			minVisibleOpenEditors = OpenEditorsView.DEFAULT_MIN_VISIBLE_OPEN_EDITORS;
		}
		const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id)!)!;
		if (containerModel.visibleViewDescriptors.length <= 1) {
			return Number.POSITIVE_INFINITY;
		}

		return (Math.max(this.elementCount, minVisibleOpenEditors)) * OpenEditorsDelegate.ITEM_HEIGHT;
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

	setStructuralRefreshDelay(delay: number): void {
		this.structuralRefreshDelay = delay;
	}

	override getOptimalWidth(): number {
		if (!this.list) {
			return super.getOptimalWidth();
		}

		const parentNode = this.list.getHTMLElement();
		const childNodes: HTMLElement[] = [].slice.call(parentNode.querySelectorAll('.open-editor > a'));

		return dom.getLargestChildWidth(parentNode, childNodes);
	}
}

interface IOpenEditorTemplateData {
	container: HTMLElement;
	root: IResourceLabel;
	actionBar: ActionBar;
	actionRunner: OpenEditorActionRunner;
}

interface IEditorGroupTemplateData {
	root: HTMLElement;
	name: HTMLSpanElement;
	actionBar: ActionBar;
	editorGroup: IEditorGroup;
}

class OpenEditorActionRunner extends ActionRunner {
	public editor: OpenEditor | undefined;

	override async run(action: IAction): Promise<void> {
		if (!this.editor) {
			return;
		}

		return super.run(action, { groupId: this.editor.groupId, editorIndex: this.editor.group.getIndexOfEditor(this.editor.editor) });
	}
}

class OpenEditorsDelegate implements IListVirtualDelegate<OpenEditor | IEditorGroup> {

	public static readonly ITEM_HEIGHT = 22;

	getHeight(_element: OpenEditor | IEditorGroup): number {
		return OpenEditorsDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: OpenEditor | IEditorGroup): string {
		if (element instanceof OpenEditor) {
			return OpenEditorRenderer.ID;
		}

		return EditorGroupRenderer.ID;
	}
}

class EditorGroupRenderer implements IListRenderer<IEditorGroup, IEditorGroupTemplateData> {
	static readonly ID = 'editorgroup';

	constructor(
		private keybindingService: IKeybindingService,
		private instantiationService: IInstantiationService,
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

		return editorGroupTemplate;
	}

	renderElement(editorGroup: IEditorGroup, _index: number, templateData: IEditorGroupTemplateData): void {
		templateData.editorGroup = editorGroup;
		templateData.name.textContent = editorGroup.label;
		templateData.actionBar.context = { groupId: editorGroup.id };
	}

	disposeTemplate(templateData: IEditorGroupTemplateData): void {
		templateData.actionBar.dispose();
	}
}

class OpenEditorRenderer implements IListRenderer<OpenEditor, IOpenEditorTemplateData> {
	static readonly ID = 'openeditor';

	private readonly closeEditorAction = this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL);
	private readonly unpinEditorAction = this.instantiationService.createInstance(UnpinEditorAction, UnpinEditorAction.ID, UnpinEditorAction.LABEL);

	constructor(
		private labels: ResourceLabels,
		private instantiationService: IInstantiationService,
		private keybindingService: IKeybindingService,
		private configurationService: IConfigurationService
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
		editorTemplate.root = this.labels.create(container);

		return editorTemplate;
	}

	renderElement(openedEditor: OpenEditor, _index: number, templateData: IOpenEditorTemplateData): void {
		const editor = openedEditor.editor;
		templateData.actionRunner.editor = openedEditor;
		templateData.container.classList.toggle('dirty', editor.isDirty() && !editor.isSaving());
		templateData.container.classList.toggle('sticky', openedEditor.isSticky());
		templateData.root.setResource({
			resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }),
			name: editor.getName(),
			description: editor.getDescription(Verbosity.MEDIUM)
		}, {
			italic: openedEditor.isPreview(),
			extraClasses: ['open-editor'].concat(openedEditor.editor.getLabelExtraClasses()),
			fileDecorations: this.configurationService.getValue<IFilesConfiguration>().explorer.decorations,
			title: editor.getTitle(Verbosity.LONG),
			icon: editor.getIcon()
		});
		const editorAction = openedEditor.isSticky() ? this.unpinEditorAction : this.closeEditorAction;
		if (!templateData.actionBar.hasAction(editorAction)) {
			if (!templateData.actionBar.isEmpty()) {
				templateData.actionBar.clear();
			}
			templateData.actionBar.push(editorAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(editorAction.id)?.getLabel() });
		}
	}

	disposeTemplate(templateData: IOpenEditorTemplateData): void {
		templateData.actionBar.dispose();
		templateData.root.dispose();
		templateData.actionRunner.dispose();
	}
}

class OpenEditorsDragAndDrop implements IListDragAndDrop<OpenEditor | IEditorGroup> {

	private _sortOrder: 'editorOrder' | 'alphabetical' | 'fullPath';
	public set sortOrder(value: 'editorOrder' | 'alphabetical' | 'fullPath') {
		this._sortOrder = value;
	}

	constructor(
		sortOrder: 'editorOrder' | 'alphabetical' | 'fullPath',
		private instantiationService: IInstantiationService,
		private editorGroupService: IEditorGroupsService
	) {
		this._sortOrder = sortOrder;
	}

	@memoize private get dropHandler(): ResourcesDropHandler {
		return this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
	}

	getDragURI(element: OpenEditor | IEditorGroup): string | null {
		if (element instanceof OpenEditor) {
			const resource = element.getResource();
			if (resource) {
				return resource.toString();
			}
		}
		return null;
	}

	getDragLabel?(elements: (OpenEditor | IEditorGroup)[]): string {
		if (elements.length > 1) {
			return String(elements.length);
		}
		const element = elements[0];

		return element instanceof OpenEditor ? element.editor.getName() : element.label;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const items = (data as ElementsDragAndDropData<OpenEditor | IEditorGroup>).elements;
		const editors: IEditorIdentifier[] = [];
		if (items) {
			for (const item of items) {
				if (item instanceof OpenEditor) {
					editors.push(item);
				}
			}
		}

		if (editors.length) {
			// Apply some datatransfer types to allow for dragging the element outside of the application
			this.instantiationService.invokeFunction(fillEditorsDragData, editors, originalEvent);
		}
	}

	onDragOver(data: IDragAndDropData, _targetElement: OpenEditor | IEditorGroup, _targetIndex: number, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | IListDragOverReaction {
		if (data instanceof NativeDragAndDropData) {
			if (!containsDragType(originalEvent, DataTransfers.FILES, CodeDataTransfers.FILES)) {
				return false;
			}
		}

		if (this._sortOrder !== 'editorOrder') {
			if (data instanceof ElementsDragAndDropData) {
				// No reordering supported when sorted
				return false;
			} else {
				// Allow droping files to open them
				return { accept: true, effect: { type: ListDragOverEffectType.Move }, feedback: [-1] };
			}
		}

		let dropEffectPosition: ListDragOverEffectPosition | undefined = undefined;
		switch (targetSector) {
			case ListViewTargetSector.TOP:
			case ListViewTargetSector.CENTER_TOP:
				dropEffectPosition = (_targetIndex === 0 && _targetElement instanceof EditorGroupView) ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before; break;
			case ListViewTargetSector.CENTER_BOTTOM:
			case ListViewTargetSector.BOTTOM:
				dropEffectPosition = ListDragOverEffectPosition.After; break;
		}

		return { accept: true, effect: { type: ListDragOverEffectType.Move, position: dropEffectPosition }, feedback: [_targetIndex] };
	}

	drop(data: IDragAndDropData, targetElement: OpenEditor | IEditorGroup | undefined, _targetIndex: number, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void {
		let group = targetElement instanceof OpenEditor ? targetElement.group : targetElement || this.editorGroupService.groups[this.editorGroupService.count - 1];
		let targetEditorIndex = targetElement instanceof OpenEditor ? targetElement.group.getIndexOfEditor(targetElement.editor) : 0;

		switch (targetSector) {
			case ListViewTargetSector.TOP:
			case ListViewTargetSector.CENTER_TOP:
				if (targetElement instanceof EditorGroupView && group.index !== 0) {
					group = this.editorGroupService.groups[group.index - 1];
					targetEditorIndex = group.count;
				}
				break;
			case ListViewTargetSector.BOTTOM:
			case ListViewTargetSector.CENTER_BOTTOM:
				if (targetElement instanceof OpenEditor) {
					targetEditorIndex++;
				}
				break;
		}

		if (data instanceof ElementsDragAndDropData) {
			for (const oe of data.elements) {
				const sourceEditorIndex = oe.group.getIndexOfEditor(oe.editor);
				if (oe.group === group && sourceEditorIndex < targetEditorIndex) {
					targetEditorIndex--;
				}
				oe.group.moveEditor(oe.editor, group, { index: targetEditorIndex, preserveFocus: true });
				targetEditorIndex++;
			}
			this.editorGroupService.activateGroup(group);
		} else {
			this.dropHandler.handleDrop(originalEvent, mainWindow, () => group, () => group.focus(), { index: targetEditorIndex });
		}
	}

	dispose(): void { }
}

class OpenEditorsAccessibilityProvider implements IListAccessibilityProvider<OpenEditor | IEditorGroup> {

	getWidgetAriaLabel(): string {
		return nls.localize('openEditors', "Open Editors");
	}

	getAriaLabel(element: OpenEditor | IEditorGroup): string | null {
		if (element instanceof OpenEditor) {
			return `${element.editor.getName()}, ${element.editor.getDescription()}`;
		}

		return element.ariaLabel;
	}
}

const toggleEditorGroupLayoutId = 'workbench.action.toggleEditorGroupLayout';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.toggleEditorGroupLayout',
			title: nls.localize2('flipLayout', "Toggle Vertical/Horizontal Editor Layout"),
			f1: true,
			keybinding: {
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit0,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit0 },
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: Codicon.editorLayout,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', OpenEditorsView.ID), MultipleEditorGroupsContext),
				order: 10
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		const newOrientation = (editorGroupService.orientation === GroupOrientation.VERTICAL) ? GroupOrientation.HORIZONTAL : GroupOrientation.VERTICAL;
		editorGroupService.setGroupOrientation(newOrientation);
		editorGroupService.activeGroup.focus();
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '5_flip',
	command: {
		id: toggleEditorGroupLayoutId,
		title: {
			...nls.localize2('miToggleEditorLayoutWithoutMnemonic', "Flip Layout"),
			mnemonicTitle: nls.localize({ key: 'miToggleEditorLayout', comment: ['&& denotes a mnemonic'] }, "Flip &&Layout")
		}
	},
	order: 1
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.files.saveAll',
			title: SAVE_ALL_LABEL,
			f1: true,
			icon: Codicon.saveAll,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', OpenEditorsView.ID),
				order: 20
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand(SAVE_ALL_COMMAND_ID);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'openEditors.closeAll',
			title: CloseAllEditorsAction.LABEL,
			f1: false,
			icon: Codicon.closeAll,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', OpenEditorsView.ID),
				order: 30
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);

		const closeAll = new CloseAllEditorsAction();
		await instantiationService.invokeFunction(accessor => closeAll.run(accessor));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'openEditors.newUntitledFile',
			title: nls.localize2('newUntitledFile', "New Untitled Text File"),
			f1: false,
			icon: Codicon.newFile,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', OpenEditorsView.ID),
				order: 5
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
	}
});
