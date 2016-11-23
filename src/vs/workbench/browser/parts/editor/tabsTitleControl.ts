/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/tabstitle';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import DOM = require('vs/base/browser/dom');
import { isMacintosh } from 'vs/base/common/platform';
import { MIME_BINARY } from 'vs/base/common/mime';
import { Position, IEditorInput } from 'vs/platform/editor/common/editor';
import { IEditorGroup, IEditorIdentifier, asFileEditorInput, getResource } from 'vs/workbench/common/editor';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorLabel } from 'vs/workbench/browser/labels';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { TitleControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { extractResources } from 'vs/base/browser/dnd';
import { LinkedMap } from 'vs/base/common/map';
import paths = require('vs/base/common/paths');

interface IEditorInputLabel {
	editor: IEditorInput;
	name: string;
	hasAmbiguousName?: boolean;
	description?: string;
	verboseDescription?: string;
}

export class TabsTitleControl extends TitleControl {
	private titleContainer: HTMLElement;
	private tabsContainer: HTMLElement;
	private activeTab: HTMLElement;
	private editorLabels: EditorLabel[];
	private scrollbar: ScrollableElement;
	private tabDisposeables: IDisposable[] = [];

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService,
		@IMenuService menuService: IMenuService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IWindowService private windowService: IWindowService
	) {
		super(contextMenuService, instantiationService, configurationService, editorService, editorGroupService, contextKeyService, keybindingService, telemetryService, messageService, menuService, quickOpenService);

		this.tabDisposeables = [];
		this.editorLabels = [];
	}

	public setContext(group: IEditorGroup): void {
		super.setContext(group);

		this.editorActionsToolbar.context = { group };
	}

	public create(parent: HTMLElement): void {
		super.create(parent);

		this.titleContainer = parent;

		// Tabs Container
		this.tabsContainer = document.createElement('div');
		this.tabsContainer.setAttribute('role', 'tablist');
		DOM.addClass(this.tabsContainer, 'tabs-container');

		// Forward scrolling inside the container to our custom scrollbar
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.SCROLL, e => {
			if (DOM.hasClass(this.tabsContainer, 'scroll')) {
				this.scrollbar.updateState({
					scrollLeft: this.tabsContainer.scrollLeft // during DND the  container gets scrolled so we need to update the custom scrollbar
				});
			}
		}));

		// New file when double clicking on tabs container (but not tabs)
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DBLCLICK, e => {
			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				DOM.EventHelper.stop(e);

				const group = this.context;

				return this.editorService.openEditor(this.untitledEditorService.createOrGet(), { pinned: true, index: group.count /* always at the end */ }); // untitled are always pinned
			}
		}));

		// Custom Scrollbar
		this.scrollbar = new ScrollableElement(this.tabsContainer, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false,
			canUseTranslate3d: true,
			horizontalScrollbarSize: 3
		});

		this.scrollbar.onScroll(e => {
			this.tabsContainer.scrollLeft = e.scrollLeft;
		});

		this.titleContainer.appendChild(this.scrollbar.getDomNode());

		// Drag over
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			DOM.addClass(this.tabsContainer, 'scroll'); // enable support to scroll while dragging

			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				DOM.addClass(this.tabsContainer, 'dropfeedback');
			}
		}));

		// Drag leave
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			DOM.removeClass(this.tabsContainer, 'dropfeedback');
			DOM.removeClass(this.tabsContainer, 'scroll');
		}));

		// Drag end
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_END, (e: DragEvent) => {
			DOM.removeClass(this.tabsContainer, 'dropfeedback');
			DOM.removeClass(this.tabsContainer, 'scroll');
		}));

		// Drop onto tabs container
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DROP, (e: DragEvent) => {
			DOM.removeClass(this.tabsContainer, 'dropfeedback');
			DOM.removeClass(this.tabsContainer, 'scroll');

			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				const group = this.context;
				if (group) {
					const targetPosition = this.stacks.positionOfGroup(group);
					const targetIndex = group.count;

					this.onDrop(e, group, targetPosition, targetIndex);
				}
			}
		}));

		// Editor Actions Container
		const editorActionsContainer = document.createElement('div');
		DOM.addClass(editorActionsContainer, 'editor-actions');
		this.titleContainer.appendChild(editorActionsContainer);

		// Editor Actions Toolbar
		this.createEditorActionsToolBar(editorActionsContainer);
	}

	public allowDragging(element: HTMLElement): boolean {
		return (element.className === 'tabs-container');
	}

	protected doUpdate(): void {
		if (!this.context) {
			return;
		}

		const group = this.context;

		// Tabs container activity state
		const isActive = this.stacks.isActive(group);
		if (isActive) {
			DOM.addClass(this.titleContainer, 'active');
		} else {
			DOM.removeClass(this.titleContainer, 'active');
		}

		// Compute labels and protect against duplicates
		const editorsOfGroup = this.context.getEditors();
		const labels = this.getUniqueTabLabels(editorsOfGroup);

		// Tab label and styles
		editorsOfGroup.forEach((editor, index) => {
			const tabContainer = this.tabsContainer.children[index];
			if (tabContainer instanceof HTMLElement) {
				const isPinned = group.isPinned(editor);
				const isActive = group.isActive(editor);
				const isDirty = editor.isDirty();

				const label = labels[index];
				const name = label.name;
				const description = label.hasAmbiguousName && label.description ? label.description : '';
				const verboseDescription = label.verboseDescription || '';

				// Container
				tabContainer.setAttribute('aria-label', `tab, ${name}`);
				tabContainer.title = verboseDescription;

				// Label
				const tabLabel = this.editorLabels[index];
				tabLabel.setLabel({ name, description, resource: getResource(editor) }, { extraClasses: ['tab-label'], italic: !isPinned });

				// Active state
				if (isActive) {
					DOM.addClass(tabContainer, 'active');
					tabContainer.setAttribute('aria-selected', 'true');
					this.activeTab = tabContainer;
				} else {
					DOM.removeClass(tabContainer, 'active');
					tabContainer.setAttribute('aria-selected', 'false');
				}

				// Dirty State
				if (isDirty) {
					DOM.addClass(tabContainer, 'dirty');
				} else {
					DOM.removeClass(tabContainer, 'dirty');
				}
			}
		});

		// Update Editor Actions Toolbar
		this.updateEditorActionsToolbar();

		// Ensure the active tab is always revealed
		this.layout();
	}

	private getUniqueTabLabels(editors: IEditorInput[]): IEditorInputLabel[] {
		const labels: IEditorInputLabel[] = [];

		const mapLabelToDuplicates = new LinkedMap<string, IEditorInputLabel[]>();
		const mapLabelAndDescriptionToDuplicates = new LinkedMap<string, IEditorInputLabel[]>();

		// Build labels and descriptions for each editor
		editors.forEach(editor => {
			let description = editor.getDescription();
			if (description && description.indexOf(paths.nativeSep) >= 0) {
				description = paths.basename(description); // optimize for editors that show paths and build a shorter description to keep tab width small
			}

			const item: IEditorInputLabel = {
				editor,
				name: editor.getName(),
				description,
				verboseDescription: editor.getDescription(true)
			};
			labels.push(item);

			mapLabelToDuplicates.getOrSet(item.name, []).push(item);
			if (item.description) {
				mapLabelAndDescriptionToDuplicates.getOrSet(item.name + item.description, []).push(item);
			}
		});

		// Mark label duplicates
		const labelDuplicates = mapLabelToDuplicates.values();
		labelDuplicates.forEach(duplicates => {
			if (duplicates.length > 1) {
				duplicates.forEach(duplicate => {
					duplicate.hasAmbiguousName = true;
				});
			}
		});

		// React to duplicates for combination of label and description
		const descriptionDuplicates = mapLabelAndDescriptionToDuplicates.values();
		descriptionDuplicates.forEach(duplicates => {
			if (duplicates.length > 1) {
				duplicates.forEach(duplicate => {
					duplicate.description = duplicate.editor.getDescription(); // fallback to full description if the short description still has duplicates
				});
			}
		});

		return labels;
	}

	protected doRefresh(): void {
		const group = this.context;
		const editor = group && group.activeEditor;
		if (!editor) {
			this.clearTabs();

			this.clearEditorActionsToolbar();

			return; // return early if we are being closed
		}

		// Refresh Tabs
		this.refreshTabs(group);

		// Update Tabs
		this.doUpdate();
	}

	private clearTabs(): void {
		DOM.clearNode(this.tabsContainer);

		this.tabDisposeables = dispose(this.tabDisposeables);
		this.editorLabels = dispose(this.editorLabels);
	}

	private refreshTabs(group: IEditorGroup): void {

		// Empty container first
		this.clearTabs();

		const tabContainers: HTMLElement[] = [];

		// Add a tab for each opened editor
		this.context.getEditors().forEach(editor => {

			// Tab Container
			const tabContainer = document.createElement('div');
			tabContainer.draggable = true;
			tabContainer.tabIndex = 0;
			tabContainer.setAttribute('role', 'presentation'); // cannot use role "tab" here due to https://github.com/Microsoft/vscode/issues/8659
			DOM.addClass(tabContainer, 'tab monaco-editor-background');
			tabContainers.push(tabContainer);

			if (!this.showTabCloseButton) {
				DOM.addClass(tabContainer, 'no-close-button');
			} else {
				DOM.removeClass(tabContainer, 'no-close-button');
			}

			// Tab Editor Label
			const editorLabel = this.instantiationService.createInstance(EditorLabel, tabContainer, void 0);
			this.editorLabels.push(editorLabel);

			// Tab Close
			const tabCloseContainer = document.createElement('div');
			DOM.addClass(tabCloseContainer, 'tab-close');
			tabContainer.appendChild(tabCloseContainer);

			const bar = new ActionBar(tabCloseContainer, { context: { editor, group }, ariaLabel: nls.localize('araLabelTabActions', "Tab actions") });
			bar.push(this.closeEditorAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.closeEditorAction) });

			this.tabDisposeables.push(bar);

			// Eventing
			this.hookTabListeners(tabContainer, { editor, group });
		});

		// Add to tabs container
		tabContainers.forEach(tab => this.tabsContainer.appendChild(tab));
	}

	public layout(): void {
		if (!this.activeTab) {
			return;
		}

		const visibleContainerWidth = this.tabsContainer.offsetWidth;
		const totalContainerWidth = this.tabsContainer.scrollWidth;

		// Update scrollbar
		this.scrollbar.updateState({
			width: visibleContainerWidth,
			scrollWidth: totalContainerWidth
		});

		// Always reveal the active one
		const containerScrollPosX = this.tabsContainer.scrollLeft;
		const activeTabPosX = this.activeTab.offsetLeft;
		const activeTabWidth = this.activeTab.offsetWidth;
		const activeTabFits = activeTabWidth <= visibleContainerWidth;

		// Tab is overflowing to the right: Scroll minimally until the element is fully visible to the right
		// Note: only try to do this if we actually have enough width to give to show the tab fully!
		if (activeTabFits && containerScrollPosX + visibleContainerWidth < activeTabPosX + activeTabWidth) {
			this.scrollbar.updateState({
				scrollLeft: containerScrollPosX + ((activeTabPosX + activeTabWidth) /* right corner of tab */ - (containerScrollPosX + visibleContainerWidth) /* right corner of view port */)
			});
		}

		// Tab is overlflowng to the left or does not fit: Scroll it into view to the left
		else if (containerScrollPosX > activeTabPosX || !activeTabFits) {
			this.scrollbar.updateState({
				scrollLeft: this.activeTab.offsetLeft
			});
		}
	}

	private hookTabListeners(tab: HTMLElement, identifier: IEditorIdentifier): void {
		const {editor, group} = identifier;
		const position = this.stacks.positionOfGroup(group);

		// Open on Click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			tab.blur();

			if (e.button === 0 /* Left Button */ && !DOM.findParentWithClass(<any>e.target || e.srcElement, 'monaco-action-bar', 'tab')) {
				setTimeout(() => this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError)); // timeout to keep focus in editor after mouse up
			}
		}));

		// Close on mouse middle click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);
			tab.blur();

			if (e.button === 1 /* Middle Button */) {
				this.editorService.closeEditor(position, editor).done(null, errors.onUnexpectedError);
			}
		}));

		// Context menu on Shift+F10
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.shiftKey && event.keyCode === KeyCode.F10) {
				DOM.EventHelper.stop(e);

				this.onContextMenu(identifier, e, tab);
			}
		}));

		// Keyboard accessibility
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			let handled = false;

			// Run action on Enter/Space
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				handled = true;
				this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError);
			}

			// Navigate in editors
			else if ([KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.Home, KeyCode.End].some(kb => event.equals(kb))) {
				const index = group.indexOf(editor);

				let targetIndex: number;
				if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow)) {
					targetIndex = index - 1;
				} else if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow)) {
					targetIndex = index + 1;
				} else if (event.equals(KeyCode.Home)) {
					targetIndex = 0;
				} else {
					targetIndex = group.count - 1;
				}

				const target = group.getEditor(targetIndex);
				if (target) {
					handled = true;
					this.editorService.openEditor(target, { preserveFocus: true }, position).done(null, errors.onUnexpectedError);
					(<HTMLElement>this.tabsContainer.childNodes[targetIndex]).focus();
				}
			}

			if (handled) {
				DOM.EventHelper.stop(e, true);
			}

			// moving in the tabs container can have an impact on scrolling position, so we need to update the custom scrollbar
			this.scrollbar.updateState({
				scrollLeft: this.tabsContainer.scrollLeft
			});
		}));

		// Pin on double click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DBLCLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			this.editorGroupService.pinEditor(group, editor);
		}));

		// Context menu
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.CONTEXT_MENU, (e: Event) => this.onContextMenu(identifier, e, tab)));

		// Drag start
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_START, (e: DragEvent) => {
			this.onEditorDragStart({ editor, group });
			e.dataTransfer.effectAllowed = 'copyMove';

			// Insert transfer accordingly
			const fileInput = asFileEditorInput(editor, true);
			if (fileInput) {
				const resource = fileInput.getResource().toString();
				e.dataTransfer.setData('URL', resource); // enables cross window DND of tabs
				e.dataTransfer.setData('DownloadURL', [MIME_BINARY, editor.getName(), resource].join(':')); // enables support to drag a tab as file to desktop
			}
		}));

		// We need to keep track of DRAG_ENTER and DRAG_LEAVE events because a tab is not just a div without children,
		// it contains a label and a close button. HTML gives us DRAG_ENTER and DRAG_LEAVE events when hovering over
		// these children and this can cause flicker of the drop feedback. The workaround is to count the events and only
		// remove the drop feedback when the counter is 0 (see https://github.com/Microsoft/vscode/issues/14470)
		let counter = 0;

		// Drag over
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_ENTER, (e: DragEvent) => {
			counter++;
			DOM.addClass(tab, 'dropfeedback');
		}));

		// Drag leave
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			counter--;
			if (counter === 0) {
				DOM.removeClass(tab, 'dropfeedback');
			}
		}));

		// Drag end
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_END, (e: DragEvent) => {
			counter = 0;
			DOM.removeClass(tab, 'dropfeedback');

			this.onEditorDragEnd();
		}));

		// Drop
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DROP, (e: DragEvent) => {
			counter = 0;
			DOM.removeClass(tab, 'dropfeedback');

			const targetPosition = this.stacks.positionOfGroup(group);
			const targetIndex = group.indexOf(editor);

			this.onDrop(e, group, targetPosition, targetIndex);
		}));
	}

	private onDrop(e: DragEvent, group: IEditorGroup, targetPosition: Position, targetIndex: number): void {
		DOM.removeClass(this.tabsContainer, 'dropfeedback');
		DOM.removeClass(this.tabsContainer, 'scroll');

		// Local DND
		const draggedEditor = TabsTitleControl.getDraggedEditor();
		if (draggedEditor) {
			DOM.EventHelper.stop(e, true);

			// Move editor to target position and index
			if (this.isMoveOperation(e, draggedEditor.group, group)) {
				this.editorGroupService.moveEditor(draggedEditor.editor, draggedEditor.group, group, targetIndex);
			}

			// Copy: just open editor at target index
			else {
				this.editorService.openEditor(draggedEditor.editor, { pinned: true, index: targetIndex }, targetPosition).done(null, errors.onUnexpectedError);
			}

			this.onEditorDragEnd();
		}

		// External DND
		else {
			this.handleExternalDrop(e, targetPosition, targetIndex);
		}
	}

	private handleExternalDrop(e: DragEvent, targetPosition: Position, targetIndex: number): void {
		const resources = extractResources(e).filter(d => d.resource.scheme === 'file' || d.resource.scheme === 'untitled');

		// Handle resources
		if (resources.length) {
			DOM.EventHelper.stop(e, true);

			// Add external ones to recently open list
			const externalResources = resources.filter(d => d.isExternal).map(d => d.resource);
			if (externalResources.length) {
				this.windowService.addToRecentlyOpen(externalResources.map(resource => {
					return {
						path: resource.fsPath,
						isFile: true
					};
				}));
			}

			// Open in Editor
			this.editorService.openEditors(resources.map(d => {
				return {
					input: { resource: d.resource, options: { pinned: true, index: targetIndex } },
					position: targetPosition
				};
			})).then(() => {
				this.editorGroupService.focusGroup(targetPosition);
				return this.windowService.focusWindow();
			}).done(null, errors.onUnexpectedError);
		}
	}

	private isMoveOperation(e: DragEvent, source: IEditorGroup, target: IEditorGroup) {
		const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);

		return !isCopy || source.id === target.id;
	}
}