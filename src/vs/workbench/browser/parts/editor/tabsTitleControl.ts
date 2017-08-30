/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/tabstitle';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import DOM = require('vs/base/browser/dom');
import { isMacintosh } from 'vs/base/common/platform';
import { MIME_BINARY } from 'vs/base/common/mime';
import { shorten, getPathLabel } from 'vs/base/common/labels';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { Position, IEditorInput, Verbosity, IUntitledResourceInput } from 'vs/platform/editor/common/editor';
import { IEditorGroup, toResource } from 'vs/workbench/common/editor';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorLabel } from 'vs/workbench/browser/labels';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { TitleControl, handleWorkspaceExternalDrop } from 'vs/workbench/browser/parts/editor/titleControl';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { extractResources } from 'vs/base/browser/dnd';
import { getOrSet } from 'vs/base/common/map';
import { DelegatingWorkbenchEditorService } from 'vs/workbench/services/editor/browser/editorService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { TAB_INACTIVE_BACKGROUND, TAB_ACTIVE_BACKGROUND, TAB_ACTIVE_FOREGROUND, TAB_INACTIVE_FOREGROUND, TAB_BORDER, EDITOR_DRAG_AND_DROP_BACKGROUND, TAB_UNFOCUSED_ACTIVE_FOREGROUND, TAB_UNFOCUSED_INACTIVE_FOREGROUND, TAB_UNFOCUSED_ACTIVE_BORDER, TAB_ACTIVE_BORDER } from 'vs/workbench/common/theme';
import { activeContrastBorder, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';

interface IEditorInputLabel {
	name: string;
	hasAmbiguousName?: boolean;
	description?: string;
	title?: string;
}

export class TabsTitleControl extends TitleControl {
	private titleContainer: HTMLElement;
	private tabsContainer: HTMLElement;
	private activeTab: HTMLElement;
	private editorLabels: EditorLabel[];
	private scrollbar: ScrollableElement;
	private tabDisposeables: IDisposable[];
	private blockRevealActiveTab: boolean;

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService,
		@IMenuService menuService: IMenuService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IWindowService private windowService: IWindowService,
		@IWindowsService private windowsService: IWindowsService,
		@IThemeService themeService: IThemeService,
		@IFileService private fileService: IFileService,
		@IWorkspacesService private workspacesService: IWorkspacesService
	) {
		super(contextMenuService, instantiationService, editorService, editorGroupService, contextKeyService, keybindingService, telemetryService, messageService, menuService, quickOpenService, themeService);

		this.tabDisposeables = [];
		this.editorLabels = [];
	}

	protected initActions(services: IInstantiationService): void {
		super.initActions(this.createScopedInstantiationService());
	}

	private createScopedInstantiationService(): IInstantiationService {
		const stacks = this.editorGroupService.getStacksModel();
		const delegatingEditorService = this.instantiationService.createInstance(DelegatingWorkbenchEditorService);

		// We create a scoped instantiation service to override the behaviour when closing an inactive editor
		// Specifically we want to move focus back to the editor when an inactive editor is closed from anywhere
		// in the tabs title control (e.g. mouse middle click, context menu on tab). This is only needed for
		// the inactive editors because closing the active one will always cause a tab switch that sets focus.
		// We also want to block the tabs container to reveal the currently active tab because that makes it very
		// hard to close multiple inactive tabs next to each other.
		delegatingEditorService.setEditorCloseHandler((position, editor) => {
			const group = stacks.groupAt(position);
			if (group && stacks.isActive(group) && !group.isActive(editor)) {
				this.editorGroupService.focusGroup(group);
			}

			this.blockRevealActiveTab = true;

			return TPromise.as(void 0);
		});

		return this.instantiationService.createChild(new ServiceCollection([IWorkbenchEditorService, delegatingEditorService]));
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
		this.toUnbind.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.SCROLL, e => {
			if (DOM.hasClass(this.tabsContainer, 'scroll')) {
				this.scrollbar.setScrollPosition({
					scrollLeft: this.tabsContainer.scrollLeft // during DND the  container gets scrolled so we need to update the custom scrollbar
				});
			}
		}));

		// New file when double clicking on tabs container (but not tabs)
		this.toUnbind.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DBLCLICK, e => {
			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				DOM.EventHelper.stop(e);

				const group = this.context;
				if (group) {
					this.editorService.openEditor({ options: { pinned: true, index: group.count /* always at the end */ } } as IUntitledResourceInput).done(null, errors.onUnexpectedError); // untitled are always pinned
				}
			}
		}));

		// Custom Scrollbar
		this.scrollbar = new ScrollableElement(this.tabsContainer, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false,
			horizontalScrollbarSize: 3
		});

		this.scrollbar.onScroll(e => {
			this.tabsContainer.scrollLeft = e.scrollLeft;
		});

		this.titleContainer.appendChild(this.scrollbar.getDomNode());

		// Drag over
		this.toUnbind.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_OVER, (e: DragEvent) => {

			// update the dropEffect, otherwise it would look like a "move" operation. but only if we are
			// not dragging a tab actually because there we support both moving as well as copying
			if (!TabsTitleControl.getDraggedEditor()) {
				e.dataTransfer.dropEffect = 'copy';
			}

			DOM.addClass(this.tabsContainer, 'scroll'); // enable support to scroll while dragging

			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				this.updateDropFeedback(this.tabsContainer, true);
			}
		}));

		// Drag leave
		this.toUnbind.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			this.updateDropFeedback(this.tabsContainer, false);
			DOM.removeClass(this.tabsContainer, 'scroll');
		}));

		// Drag end
		this.toUnbind.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_END, (e: DragEvent) => {
			this.updateDropFeedback(this.tabsContainer, false);
			DOM.removeClass(this.tabsContainer, 'scroll');
		}));

		// Drop onto tabs container
		this.toUnbind.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DROP, (e: DragEvent) => {
			this.updateDropFeedback(this.tabsContainer, false);
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

	private updateDropFeedback(element: HTMLElement, isDND: boolean, index?: number): void {
		const isTab = (typeof index === 'number');
		const isActiveTab = isTab && this.context && this.context.isActive(this.context.getEditor(index));

		// Background
		const noDNDBackgroundColor = isTab ? this.getColor(isActiveTab ? TAB_ACTIVE_BACKGROUND : TAB_INACTIVE_BACKGROUND) : null;
		element.style.backgroundColor = isDND ? this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) : noDNDBackgroundColor;

		// Outline
		const activeContrastBorderColor = this.getColor(activeContrastBorder);
		if (activeContrastBorderColor && isDND) {
			element.style.outlineWidth = '2px';
			element.style.outlineStyle = 'dashed';
			element.style.outlineColor = activeContrastBorderColor;
			element.style.outlineOffset = isTab ? '-5px' : '-3px';
		} else {
			element.style.outlineWidth = null;
			element.style.outlineStyle = null;
			element.style.outlineColor = activeContrastBorderColor;
			element.style.outlineOffset = null;
		}
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
		const isGroupActive = this.stacks.isActive(group);
		if (isGroupActive) {
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
				const isPinned = group.isPinned(index);
				const isTabActive = group.isActive(editor);
				const isDirty = editor.isDirty();

				const label = labels[index];
				const name = label.name;
				const description = label.hasAmbiguousName && label.description ? label.description : '';
				const title = label.title || '';

				// Container
				tabContainer.setAttribute('aria-label', `${name}, tab`);
				tabContainer.title = title;
				tabContainer.style.borderLeftColor = (index !== 0) ? (this.getColor(TAB_BORDER) || this.getColor(contrastBorder)) : null;
				tabContainer.style.borderRightColor = (index === editorsOfGroup.length - 1) ? (this.getColor(TAB_BORDER) || this.getColor(contrastBorder)) : null;
				tabContainer.style.outlineColor = this.getColor(activeContrastBorder);

				const tabOptions = this.editorGroupService.getTabOptions();
				['off', 'left'].forEach(option => {
					const domAction = tabOptions.tabCloseButton === option ? DOM.addClass : DOM.removeClass;
					domAction(tabContainer, `close-button-${option}`);
				});

				// Label
				const tabLabel = this.editorLabels[index];
				tabLabel.setLabel({ name, description, resource: toResource(editor, { supportSideBySide: true }) }, { extraClasses: ['tab-label'], italic: !isPinned });

				// Active state
				if (isTabActive) {
					DOM.addClass(tabContainer, 'active');
					tabContainer.setAttribute('aria-selected', 'true');
					tabContainer.style.backgroundColor = this.getColor(TAB_ACTIVE_BACKGROUND);
					tabLabel.element.style.color = this.getColor(isGroupActive ? TAB_ACTIVE_FOREGROUND : TAB_UNFOCUSED_ACTIVE_FOREGROUND);

					// Use boxShadow for the active tab border because if we also have a editor group header
					// color, the two colors would collide and the tab border never shows up.
					// see https://github.com/Microsoft/vscode/issues/33111
					const activeTabBorderColor = this.getColor(isGroupActive ? TAB_ACTIVE_BORDER : TAB_UNFOCUSED_ACTIVE_BORDER);
					if (activeTabBorderColor) {
						tabContainer.style.boxShadow = `${activeTabBorderColor} 0 -1px inset`;
					} else {
						tabContainer.style.boxShadow = null;
					}

					this.activeTab = tabContainer;
				} else {
					DOM.removeClass(tabContainer, 'active');
					tabContainer.setAttribute('aria-selected', 'false');
					tabContainer.style.backgroundColor = this.getColor(TAB_INACTIVE_BACKGROUND);
					tabLabel.element.style.color = this.getColor(isGroupActive ? TAB_INACTIVE_FOREGROUND : TAB_UNFOCUSED_INACTIVE_FOREGROUND);
					tabContainer.style.boxShadow = null;
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

		const mapLabelToDuplicates = new Map<string, IEditorInputLabel[]>();
		const mapLabelAndDescriptionToDuplicates = new Map<string, IEditorInputLabel[]>();

		// Build labels and descriptions for each editor
		editors.forEach(editor => {
			const name = editor.getName();
			let description = editor.getDescription();
			if (mapLabelAndDescriptionToDuplicates.has(`${name}${description}`)) {
				description = editor.getDescription(true); // try verbose description if name+description already exists
			}

			const item: IEditorInputLabel = {
				name,
				description,
				title: editor.getTitle(Verbosity.LONG)
			};
			labels.push(item);

			getOrSet(mapLabelToDuplicates, item.name, []).push(item);

			if (typeof description === 'string') {
				getOrSet(mapLabelAndDescriptionToDuplicates, `${item.name}${item.description}`, []).push(item);
			}
		});

		// Mark duplicates and shorten their descriptions
		mapLabelToDuplicates.forEach(duplicates => {
			if (duplicates.length > 1) {
				duplicates = duplicates.filter(d => {
					// we could have items with equal label and description. in that case it does not make much
					// sense to produce a shortened version of the label, so we ignore those kind of items
					return typeof d.description === 'string' && mapLabelAndDescriptionToDuplicates.get(`${d.name}${d.description}`).length === 1;
				});

				if (duplicates.length > 1) {
					const shortenedDescriptions = shorten(duplicates.map(duplicate => duplicate.description));
					duplicates.forEach((duplicate, i) => {
						duplicate.description = shortenedDescriptions[i];
						duplicate.hasAmbiguousName = true;
					});
				}
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

		// Handle Tabs
		this.handleTabs(group.count);
		DOM.removeClass(this.titleContainer, 'empty');

		// Update Tabs
		this.doUpdate();
	}

	private clearTabs(): void {
		DOM.clearNode(this.tabsContainer);

		this.tabDisposeables = dispose(this.tabDisposeables);
		this.editorLabels = [];

		DOM.addClass(this.titleContainer, 'empty');
	}

	private handleTabs(tabsNeeded: number): void {
		const tabs = this.tabsContainer.children;
		const tabsCount = tabs.length;

		// Nothing to do if count did not change
		if (tabsCount === tabsNeeded) {
			return;
		}

		// We need more tabs: create new ones
		if (tabsCount < tabsNeeded) {
			for (let i = tabsCount; i < tabsNeeded; i++) {
				this.tabsContainer.appendChild(this.createTab(i));
			}
		}

		// We need less tabs: delete the ones we do not need
		else {
			for (let i = 0; i < tabsCount - tabsNeeded; i++) {
				(this.tabsContainer.lastChild as HTMLElement).remove();
				this.editorLabels.pop();
				this.tabDisposeables.pop().dispose();
			}
		}
	}

	private createTab(index: number): HTMLElement {

		// Tab Container
		const tabContainer = document.createElement('div');
		tabContainer.draggable = true;
		tabContainer.tabIndex = 0;
		tabContainer.setAttribute('role', 'presentation'); // cannot use role "tab" here due to https://github.com/Microsoft/vscode/issues/8659
		DOM.addClass(tabContainer, 'tab');

		// Tab Editor Label
		const editorLabel = this.instantiationService.createInstance(EditorLabel, tabContainer, void 0);
		this.editorLabels.push(editorLabel);

		// Tab Close
		const tabCloseContainer = document.createElement('div');
		DOM.addClass(tabCloseContainer, 'tab-close');
		tabContainer.appendChild(tabCloseContainer);

		const bar = new ActionBar(tabCloseContainer, { ariaLabel: nls.localize('araLabelTabActions', "Tab actions"), actionRunner: new TabActionRunner(() => this.context, index) });
		bar.push(this.closeEditorAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.closeEditorAction) });

		// Eventing
		const disposable = this.hookTabListeners(tabContainer, index);

		this.tabDisposeables.push(combinedDisposable([disposable, bar, editorLabel]));

		return tabContainer;
	}

	public layout(): void {
		if (!this.activeTab) {
			return;
		}

		const visibleContainerWidth = this.tabsContainer.offsetWidth;
		const totalContainerWidth = this.tabsContainer.scrollWidth;

		// Update scrollbar
		this.scrollbar.setScrollDimensions({
			width: visibleContainerWidth,
			scrollWidth: totalContainerWidth
		});

		// Return now if we are blocked to reveal the active tab and clear flag
		if (this.blockRevealActiveTab) {
			this.blockRevealActiveTab = false;
			return;
		}

		// Reveal the active one
		const containerScrollPosX = this.tabsContainer.scrollLeft;
		const activeTabPosX = this.activeTab.offsetLeft;
		const activeTabWidth = this.activeTab.offsetWidth;
		const activeTabFits = activeTabWidth <= visibleContainerWidth;

		// Tab is overflowing to the right: Scroll minimally until the element is fully visible to the right
		// Note: only try to do this if we actually have enough width to give to show the tab fully!
		if (activeTabFits && containerScrollPosX + visibleContainerWidth < activeTabPosX + activeTabWidth) {
			this.scrollbar.setScrollPosition({
				scrollLeft: containerScrollPosX + ((activeTabPosX + activeTabWidth) /* right corner of tab */ - (containerScrollPosX + visibleContainerWidth) /* right corner of view port */)
			});
		}

		// Tab is overlflowng to the left or does not fit: Scroll it into view to the left
		else if (containerScrollPosX > activeTabPosX || !activeTabFits) {
			this.scrollbar.setScrollPosition({
				scrollLeft: this.activeTab.offsetLeft
			});
		}
	}

	private hookTabListeners(tab: HTMLElement, index: number): IDisposable {
		const disposables: IDisposable[] = [];

		// Open on Click
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			tab.blur();

			const { editor, position } = this.toTabContext(index);
			if (e.button === 0 /* Left Button */ && !this.isTabActionBar((e.target || e.srcElement) as HTMLElement)) {
				setTimeout(() => this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError)); // timeout to keep focus in editor after mouse up
			}
		}));

		// Close on mouse middle click
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);
			tab.blur();

			if (e.button === 1 /* Middle Button*/ && !this.isTabActionBar((e.target || e.srcElement) as HTMLElement)) {
				this.closeEditorAction.run(this.toTabContext(index)).done(null, errors.onUnexpectedError);
			}
		}));

		// Context menu on Shift+F10
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.shiftKey && event.keyCode === KeyCode.F10) {
				DOM.EventHelper.stop(e);

				const { group, editor } = this.toTabContext(index);

				this.onContextMenu({ group, editor }, e, tab);
			}
		}));

		// Keyboard accessibility
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			let handled = false;

			const { group, position, editor } = this.toTabContext(index);

			// Run action on Enter/Space
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				handled = true;
				this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError);
			}

			// Navigate in editors
			else if ([KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.Home, KeyCode.End].some(kb => event.equals(kb))) {
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
			this.scrollbar.setScrollPosition({
				scrollLeft: this.tabsContainer.scrollLeft
			});
		}));

		// Pin on double click
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.DBLCLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			const { group, editor } = this.toTabContext(index);

			this.editorGroupService.pinEditor(group, editor);
		}));

		// Context menu
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.CONTEXT_MENU, (e: Event) => {
			DOM.EventHelper.stop(e, true);
			const { group, editor } = this.toTabContext(index);

			this.onContextMenu({ group, editor }, e, tab);
		}, true /* use capture to fix https://github.com/Microsoft/vscode/issues/19145 */));

		// Drag start
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_START, (e: DragEvent) => {
			const { group, editor } = this.toTabContext(index);

			this.onEditorDragStart({ editor, group });
			e.dataTransfer.effectAllowed = 'copyMove';

			// Insert transfer accordingly
			const fileResource = toResource(editor, { supportSideBySide: true, filter: 'file' });
			if (fileResource) {
				const resource = fileResource.toString();
				e.dataTransfer.setData('URL', resource); // enables cross window DND of tabs
				e.dataTransfer.setData('DownloadURL', [MIME_BINARY, editor.getName(), resource].join(':')); // enables support to drag a tab as file to desktop
				e.dataTransfer.setData('text/plain', getPathLabel(resource)); // enables dropping tab resource path into text controls
			}
		}));

		// We need to keep track of DRAG_ENTER and DRAG_LEAVE events because a tab is not just a div without children,
		// it contains a label and a close button. HTML gives us DRAG_ENTER and DRAG_LEAVE events when hovering over
		// these children and this can cause flicker of the drop feedback. The workaround is to count the events and only
		// remove the drop feedback when the counter is 0 (see https://github.com/Microsoft/vscode/issues/14470)
		let counter = 0;

		// Drag over
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_ENTER, (e: DragEvent) => {
			counter++;
			this.updateDropFeedback(tab, true, index);
		}));

		// Drag leave
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			counter--;
			if (counter === 0) {
				this.updateDropFeedback(tab, false, index);
			}
		}));

		// Drag end
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_END, (e: DragEvent) => {
			counter = 0;
			this.updateDropFeedback(tab, false, index);

			this.onEditorDragEnd();
		}));

		// Drop
		disposables.push(DOM.addDisposableListener(tab, DOM.EventType.DROP, (e: DragEvent) => {
			counter = 0;
			this.updateDropFeedback(tab, false, index);

			const { group, position } = this.toTabContext(index);

			this.onDrop(e, group, position, index);
		}));

		return combinedDisposable(disposables);
	}

	private isTabActionBar(element: HTMLElement): boolean {
		return !!DOM.findParentWithClass(element, 'monaco-action-bar', 'tab');
	}

	private toTabContext(index: number): { group: IEditorGroup, position: Position, editor: IEditorInput } {
		const group = this.context;
		const position = this.stacks.positionOfGroup(group);
		const editor = group.getEditor(index);

		return { group, position, editor };
	}

	private onDrop(e: DragEvent, group: IEditorGroup, targetPosition: Position, targetIndex: number): void {
		this.updateDropFeedback(this.tabsContainer, false);
		DOM.removeClass(this.tabsContainer, 'scroll');

		// Local DND
		const draggedEditor = TabsTitleControl.getDraggedEditor();
		if (draggedEditor) {
			DOM.EventHelper.stop(e, true);

			// Move editor to target position and index
			if (this.isMoveOperation(e, draggedEditor.group, group)) {
				this.editorGroupService.moveEditor(draggedEditor.editor, draggedEditor.group, group, { index: targetIndex });
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
		const droppedResources = extractResources(e).filter(r => r.resource.scheme === 'file' || r.resource.scheme === 'untitled');
		if (droppedResources.length) {
			DOM.EventHelper.stop(e, true);

			handleWorkspaceExternalDrop(droppedResources, this.fileService, this.messageService, this.windowsService, this.windowService, this.workspacesService).then(handled => {
				if (handled) {
					return;
				}

				// Add external ones to recently open list
				const externalResources = droppedResources.filter(d => d.isExternal).map(d => d.resource);
				if (externalResources.length) {
					this.windowsService.addRecentlyOpened(externalResources.map(resource => resource.fsPath));
				}

				// Open in Editor
				this.windowService.focusWindow()
					.then(() => this.editorService.openEditors(droppedResources.map(d => {
						return {
							input: { resource: d.resource, options: { pinned: true, index: targetIndex } },
							position: targetPosition
						};
					}))).then(() => {
						this.editorGroupService.focusGroup(targetPosition);
					}).done(null, errors.onUnexpectedError);
			});
		}
	}

	private isMoveOperation(e: DragEvent, source: IEditorGroup, target: IEditorGroup) {
		const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);

		return !isCopy || source.id === target.id;
	}
}

class TabActionRunner extends ActionRunner {

	constructor(private group: () => IEditorGroup, private index: number) {
		super();
	}

	public run(action: IAction, context?: any): TPromise<void> {
		const group = this.group();
		if (!group) {
			return TPromise.as(void 0);
		}

		return super.run(action, { group, editor: group.getEditor(this.index) });
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	// Styling with Outline color (e.g. high contrast theme)
	const activeContrastBorderColor = theme.getColor(activeContrastBorder);
	if (activeContrastBorderColor) {
		collector.addRule(`
			.monaco-workbench > .part.editor > .content > .one-editor-silo > .container > .title .tabs-container > .tab.active,
			.monaco-workbench > .part.editor > .content > .one-editor-silo > .container > .title .tabs-container > .tab.active:hover  {
				outline: 1px solid;
				outline-offset: -5px;
			}

			.monaco-workbench > .part.editor > .content > .one-editor-silo > .container > .title .tabs-container > .tab:hover  {
				outline: 1px dashed;
				outline-offset: -5px;
			}

			.monaco-workbench > .part.editor > .content > .one-editor-silo > .container > .title .tabs-container > .tab.active > .tab-close .action-label,
			.monaco-workbench > .part.editor > .content > .one-editor-silo > .container > .title .tabs-container > .tab.active:hover > .tab-close .action-label,
			.monaco-workbench > .part.editor > .content > .one-editor-silo > .container > .title .tabs-container > .tab.dirty > .tab-close .action-label,
			.monaco-workbench > .part.editor > .content > .one-editor-silo > .container > .title .tabs-container > .tab:hover > .tab-close .action-label {
				opacity: 1 !important;
			}
		`);
	}
});