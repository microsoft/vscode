/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/multieditortabscontrol.css';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { shorten } from '../../../../base/common/labels.js';
import { EditorResourceAccessor, Verbosity, IEditorPartOptions, SideBySideEditor, DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, IUntypedEditorInput, preventEditorClose, EditorCloseMethod, EditorsOrder, IToolbarActions } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { computeEditorAriaLabel } from '../../editor.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { EventType as TouchEventType, GestureEvent, Gesture } from '../../../../base/browser/touch.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { ResourceLabels, IResourceLabel, DEFAULT_LABELS_CONTAINER } from '../../labels.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { EditorCommandsContextActionRunner, EditorTabsControl } from './editorTabsControl.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IDisposable, dispose, DisposableStore, combinedDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { getOrSet } from '../../../../base/common/map.js';
import { IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { TAB_INACTIVE_BACKGROUND, TAB_ACTIVE_BACKGROUND, TAB_BORDER, EDITOR_DRAG_AND_DROP_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BORDER, TAB_ACTIVE_BORDER, TAB_HOVER_BACKGROUND, TAB_HOVER_BORDER, TAB_UNFOCUSED_HOVER_BACKGROUND, TAB_UNFOCUSED_HOVER_BORDER, EDITOR_GROUP_HEADER_TABS_BACKGROUND, WORKBENCH_BACKGROUND, TAB_ACTIVE_BORDER_TOP, TAB_UNFOCUSED_ACTIVE_BORDER_TOP, TAB_ACTIVE_MODIFIED_BORDER, TAB_INACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_INACTIVE_BACKGROUND, TAB_HOVER_FOREGROUND, TAB_UNFOCUSED_HOVER_FOREGROUND, EDITOR_GROUP_HEADER_TABS_BORDER, TAB_LAST_PINNED_BORDER, TAB_SELECTED_BORDER_TOP } from '../../../common/theme.js';
import { activeContrastBorder, contrastBorder, editorBackground, listActiveSelectionBackground, listActiveSelectionForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { ResourcesDropHandler, DraggedEditorIdentifier, DraggedEditorGroupIdentifier, extractTreeDropData, isWindowDraggedOver } from '../../dnd.js';
import { Color } from '../../../../base/common/color.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { MergeGroupMode, IMergeGroupOptions } from '../../../services/editor/common/editorGroupsService.js';
import { addDisposableListener, EventType, EventHelper, Dimension, scheduleAtNextAnimationFrame, findParentWithClass, clearNode, DragAndDropObserver, isMouseEvent, getWindow } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IEditorGroupsView, EditorServiceImpl, IEditorGroupView, IInternalEditorOpenOptions, IEditorPartsView, prepareMoveCopyEditors } from './editor.js';
import { CloseEditorTabAction, UnpinEditorAction } from './editorActions.js';
import { assertAllDefined, assertIsDefined } from '../../../../base/common/types.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { basenameOrAuthority } from '../../../../base/common/resources.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IPath, win32, posix } from '../../../../base/common/path.js';
import { coalesce, insert } from '../../../../base/common/arrays.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { isSafari } from '../../../../base/browser/browser.js';
import { equals } from '../../../../base/common/objects.js';
import { EditorActivation, IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { UNLOCK_GROUP_COMMAND_ID } from './editorCommands.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { ITreeViewsDnDService } from '../../../../editor/common/services/treeViewsDndService.js';
import { DraggedTreeItemsIdentifier } from '../../../../editor/common/services/treeViewsDnd.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IEditorTitleControlDimensions } from './editorTitleControl.js';
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from '../../../common/editor/filteredEditorGroupModel.js';
import { IReadonlyEditorGroupModel } from '../../../common/editor/editorGroupModel.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { applyDragImage } from '../../../../base/browser/dnd.js';

interface IEditorInputLabel {
	readonly editor: EditorInput;

	readonly name?: string;
	description?: string;
	readonly forceDescription?: boolean;
	readonly title?: string;
	readonly ariaLabel?: string;
}

interface IMultiEditorTabsControlLayoutOptions {

	/**
	 * Whether to force revealing the active tab, even when
	 * the dimensions have not changed. This can be the case
	 * when a tab was made active and needs to be revealed.
	 */
	readonly forceRevealActiveTab?: true;
}

interface IScheduledMultiEditorTabsControlLayout extends IDisposable {

	/**
	 * Associated options with the layout call.
	 */
	options?: IMultiEditorTabsControlLayoutOptions;
}

export class MultiEditorTabsControl extends EditorTabsControl {

	private static readonly SCROLLBAR_SIZES = {
		default: 3 as const,
		large: 10 as const
	};

	private static readonly TAB_WIDTH = {
		compact: 38 as const,
		shrink: 80 as const,
		fit: 120 as const
	};

	private static readonly DRAG_OVER_OPEN_TAB_THRESHOLD = 1500;

	private static readonly MOUSE_WHEEL_EVENT_THRESHOLD = 150;
	private static readonly MOUSE_WHEEL_DISTANCE_THRESHOLD = 1.5;

	private titleContainer: HTMLElement | undefined;
	private tabsAndActionsContainer: HTMLElement | undefined;
	private tabsContainer: HTMLElement | undefined;
	private tabsScrollbar: ScrollableElement | undefined;
	private tabSizingFixedDisposables: DisposableStore | undefined;

	private readonly closeEditorAction = this._register(this.instantiationService.createInstance(CloseEditorTabAction, CloseEditorTabAction.ID, CloseEditorTabAction.LABEL));
	private readonly unpinEditorAction = this._register(this.instantiationService.createInstance(UnpinEditorAction, UnpinEditorAction.ID, UnpinEditorAction.LABEL));

	private readonly tabResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
	private tabLabels: IEditorInputLabel[] = [];
	private activeTabLabel: IEditorInputLabel | undefined;

	private tabActionBars: ActionBar[] = [];
	private tabDisposables: IDisposable[] = [];

	private dimensions: IEditorTitleControlDimensions & { used?: Dimension } = {
		container: Dimension.None,
		available: Dimension.None
	};

	private readonly layoutScheduler = this._register(new MutableDisposable<IScheduledMultiEditorTabsControlLayout>());
	private blockRevealActiveTab: boolean | undefined;

	private path: IPath = isWindows ? win32 : posix;

	private lastMouseWheelEventTime = 0;
	private isMouseOverTabs = false;

	constructor(
		parent: HTMLElement,
		editorPartsView: IEditorPartsView,
		groupsView: IEditorGroupsView,
		groupView: IEditorGroupView,
		tabsModel: IReadonlyEditorGroupModel,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IThemeService themeService: IThemeService,
		@IEditorService private readonly editorService: EditorServiceImpl,
		@IPathService private readonly pathService: IPathService,
		@ITreeViewsDnDService private readonly treeViewsDragAndDropService: ITreeViewsDnDService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IHostService hostService: IHostService,
	) {
		super(parent, editorPartsView, groupsView, groupView, tabsModel, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, quickInputService, themeService, editorResolverService, hostService);

		// Resolve the correct path library for the OS we are on
		// If we are connected to remote, this accounts for the
		// remote OS.
		(async () => this.path = await this.pathService.path)();

		// React to decorations changing for our resource labels
		this._register(this.tabResourceLabels.onDidChangeDecorations(() => this.doHandleDecorationsChange()));
	}

	protected override create(parent: HTMLElement): HTMLElement {
		super.create(parent);

		this.titleContainer = parent;

		// Tabs and Actions Container (are on a single row with flex side-by-side)
		this.tabsAndActionsContainer = document.createElement('div');
		this.tabsAndActionsContainer.classList.add('tabs-and-actions-container');
		this.titleContainer.appendChild(this.tabsAndActionsContainer);

		// Tabs Container
		this.tabsContainer = document.createElement('div');
		this.tabsContainer.setAttribute('role', 'tablist');
		this.tabsContainer.draggable = true;
		this.tabsContainer.classList.add('tabs-container');
		this._register(Gesture.addTarget(this.tabsContainer));

		this.tabSizingFixedDisposables = this._register(new DisposableStore());
		this.updateTabSizing(false);

		// Tabs Scrollbar
		this.tabsScrollbar = this.createTabsScrollbar(this.tabsContainer);
		this.tabsAndActionsContainer.appendChild(this.tabsScrollbar.getDomNode());

		// Tabs Container listeners
		this.registerTabsContainerListeners(this.tabsContainer, this.tabsScrollbar);

		// Create Editor Toolbar
		this.createEditorActionsToolBar(this.tabsAndActionsContainer, ['editor-actions']);

		// Set tabs control visibility
		this.updateTabsControlVisibility();

		return this.tabsAndActionsContainer;
	}

	private createTabsScrollbar(scrollable: HTMLElement): ScrollableElement {
		const tabsScrollbar = this._register(new ScrollableElement(scrollable, {
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: this.getTabsScrollbarSizing(),
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false
		}));

		this._register(tabsScrollbar.onScroll(e => {
			if (e.scrollLeftChanged) {
				scrollable.scrollLeft = e.scrollLeft;
			}
		}));

		return tabsScrollbar;
	}

	private updateTabsScrollbarSizing(): void {
		this.tabsScrollbar?.updateOptions({
			horizontalScrollbarSize: this.getTabsScrollbarSizing()
		});
	}

	private updateTabSizing(fromEvent: boolean): void {
		const [tabsContainer, tabSizingFixedDisposables] = assertAllDefined(this.tabsContainer, this.tabSizingFixedDisposables);

		tabSizingFixedDisposables.clear();

		const options = this.groupsView.partOptions;
		if (options.tabSizing === 'fixed') {
			tabsContainer.style.setProperty('--tab-sizing-fixed-min-width', `${options.tabSizingFixedMinWidth}px`);
			tabsContainer.style.setProperty('--tab-sizing-fixed-max-width', `${options.tabSizingFixedMaxWidth}px`);

			// For https://github.com/microsoft/vscode/issues/40290 we want to
			// preserve the current tab widths as long as the mouse is over the
			// tabs so that you can quickly close them via mouse click. For that
			// we track mouse movements over the tabs container.

			tabSizingFixedDisposables.add(addDisposableListener(tabsContainer, EventType.MOUSE_ENTER, () => {
				this.isMouseOverTabs = true;
			}));
			tabSizingFixedDisposables.add(addDisposableListener(tabsContainer, EventType.MOUSE_LEAVE, () => {
				this.isMouseOverTabs = false;
				this.updateTabsFixedWidth(false);
			}));
		} else if (fromEvent) {
			tabsContainer.style.removeProperty('--tab-sizing-fixed-min-width');
			tabsContainer.style.removeProperty('--tab-sizing-fixed-max-width');
			this.updateTabsFixedWidth(false);
		}
	}

	private updateTabsFixedWidth(fixed: boolean): void {
		this.forEachTab((editor, tabIndex, tabContainer) => {
			if (fixed) {
				const { width } = tabContainer.getBoundingClientRect();
				tabContainer.style.setProperty('--tab-sizing-current-width', `${width}px`);
			} else {
				tabContainer.style.removeProperty('--tab-sizing-current-width');
			}
		});
	}

	private getTabsScrollbarSizing(): number {
		if (this.groupsView.partOptions.titleScrollbarSizing !== 'large') {
			return MultiEditorTabsControl.SCROLLBAR_SIZES.default;
		}

		return MultiEditorTabsControl.SCROLLBAR_SIZES.large;
	}

	private registerTabsContainerListeners(tabsContainer: HTMLElement, tabsScrollbar: ScrollableElement): void {

		// Forward scrolling inside the container to our custom scrollbar
		this._register(addDisposableListener(tabsContainer, EventType.SCROLL, () => {
			if (tabsContainer.classList.contains('scroll')) {
				tabsScrollbar.setScrollPosition({
					scrollLeft: tabsContainer.scrollLeft // during DND the container gets scrolled so we need to update the custom scrollbar
				});
			}
		}));

		// New file when double-clicking on tabs container (but not tabs)
		for (const eventType of [TouchEventType.Tap, EventType.DBLCLICK]) {
			this._register(addDisposableListener(tabsContainer, eventType, (e: MouseEvent | GestureEvent) => {
				if (eventType === EventType.DBLCLICK) {
					if (e.target !== tabsContainer) {
						return; // ignore if target is not tabs container
					}
				} else {
					if ((<GestureEvent>e).tapCount !== 2) {
						return; // ignore single taps
					}

					if ((<GestureEvent>e).initialTarget !== tabsContainer) {
						return; // ignore if target is not tabs container
					}
				}

				EventHelper.stop(e);

				this.editorService.openEditor({
					resource: undefined,
					options: {
						pinned: true,
						index: this.groupView.count, // always at the end
						override: DEFAULT_EDITOR_ASSOCIATION.id
					}
				}, this.groupView.id);
			}));
		}

		// Prevent auto-scrolling (https://github.com/microsoft/vscode/issues/16690)
		this._register(addDisposableListener(tabsContainer, EventType.MOUSE_DOWN, e => {
			if (e.button === 1) {
				e.preventDefault();
			}
		}));

		// Prevent auto-pasting (https://github.com/microsoft/vscode/issues/201696)
		if (isLinux) {
			this._register(addDisposableListener(tabsContainer, EventType.MOUSE_UP, e => {
				if (e.button === 1) {
					e.preventDefault();
				}
			}));
		}

		// Drag & Drop support
		let lastDragEvent: DragEvent | undefined = undefined;
		let isNewWindowOperation = false;
		this._register(new DragAndDropObserver(tabsContainer, {
			onDragStart: e => {
				isNewWindowOperation = this.onGroupDragStart(e, tabsContainer);
			},

			onDrag: e => {
				lastDragEvent = e;
			},

			onDragEnter: e => {

				// Always enable support to scroll while dragging
				tabsContainer.classList.add('scroll');

				// Return if the target is not on the tabs container
				if (e.target !== tabsContainer) {
					return;
				}

				// Return if transfer is unsupported
				if (!this.isSupportedDropTransfer(e)) {
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'none';
					}

					return;
				}

				// Update the dropEffect to "copy" if there is no local data to be dragged because
				// in that case we can only copy the data into and not move it from its source
				if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'copy';
					}
				}

				this.updateDropFeedback(tabsContainer, true, e);
			},

			onDragLeave: e => {
				this.updateDropFeedback(tabsContainer, false, e);
				tabsContainer.classList.remove('scroll');
			},

			onDragEnd: e => {
				this.updateDropFeedback(tabsContainer, false, e);
				tabsContainer.classList.remove('scroll');

				this.onGroupDragEnd(e, lastDragEvent, tabsContainer, isNewWindowOperation);
			},

			onDrop: e => {
				this.updateDropFeedback(tabsContainer, false, e);
				tabsContainer.classList.remove('scroll');

				if (e.target === tabsContainer) {
					const isGroupTransfer = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
					this.onDrop(e, isGroupTransfer ? this.groupView.count : this.tabsModel.count, tabsContainer);
				}
			}
		}));

		// Mouse-wheel support to switch to tabs optionally
		this._register(addDisposableListener(tabsContainer, EventType.MOUSE_WHEEL, (e: WheelEvent) => {
			const activeEditor = this.groupView.activeEditor;
			if (!activeEditor || this.groupView.count < 2) {
				return;  // need at least 2 open editors
			}

			// Shift-key enables or disables this behaviour depending on the setting
			if (this.groupsView.partOptions.scrollToSwitchTabs === true) {
				if (e.shiftKey) {
					return; // 'on': only enable this when Shift-key is not pressed
				}
			} else {
				if (!e.shiftKey) {
					return; // 'off': only enable this when Shift-key is pressed
				}
			}

			// Ignore event if the last one happened too recently (https://github.com/microsoft/vscode/issues/96409)
			// The restriction is relaxed according to the absolute value of `deltaX` and `deltaY`
			// to support discrete (mouse wheel) and contiguous scrolling (touchpad) equally well
			const now = Date.now();
			if (now - this.lastMouseWheelEventTime < MultiEditorTabsControl.MOUSE_WHEEL_EVENT_THRESHOLD - 2 * (Math.abs(e.deltaX) + Math.abs(e.deltaY))) {
				return;
			}

			this.lastMouseWheelEventTime = now;

			// Figure out scrolling direction but ignore it if too subtle
			let tabSwitchDirection: number;
			if (e.deltaX + e.deltaY < - MultiEditorTabsControl.MOUSE_WHEEL_DISTANCE_THRESHOLD) {
				tabSwitchDirection = -1;
			} else if (e.deltaX + e.deltaY > MultiEditorTabsControl.MOUSE_WHEEL_DISTANCE_THRESHOLD) {
				tabSwitchDirection = 1;
			} else {
				return;
			}

			const nextEditor = this.groupView.getEditorByIndex(this.groupView.getIndexOfEditor(activeEditor) + tabSwitchDirection);
			if (!nextEditor) {
				return;
			}

			// Open it
			this.groupView.openEditor(nextEditor);

			// Disable normal scrolling, opening the editor will already reveal it properly
			EventHelper.stop(e, true);
		}));

		// Context menu
		const showContextMenu = (e: Event) => {
			EventHelper.stop(e);

			// Find target anchor
			let anchor: HTMLElement | StandardMouseEvent = tabsContainer;
			if (isMouseEvent(e)) {
				anchor = new StandardMouseEvent(getWindow(this.parent), e);
			}

			// Show it
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				menuId: MenuId.EditorTabsBarContext,
				contextKeyService: this.contextKeyService,
				menuActionOptions: { shouldForwardArgs: true },
				getActionsContext: () => ({ groupId: this.groupView.id }),
				getKeyBinding: action => this.getKeybinding(action),
				onHide: () => this.groupView.focus()
			});
		};

		this._register(addDisposableListener(tabsContainer, TouchEventType.Contextmenu, e => showContextMenu(e)));
		this._register(addDisposableListener(tabsContainer, EventType.CONTEXT_MENU, e => showContextMenu(e)));
	}

	private doHandleDecorationsChange(): void {

		// A change to decorations potentially has an impact on the size of tabs
		// so we need to trigger a layout in that case to adjust things
		this.layout(this.dimensions);
	}

	protected override updateEditorActionsToolbar(): void {
		super.updateEditorActionsToolbar();

		// Changing the actions in the toolbar can have an impact on the size of the
		// tab container, so we need to layout the tabs to make sure the active is visible
		this.layout(this.dimensions);
	}

	openEditor(editor: EditorInput, options?: IInternalEditorOpenOptions): boolean {
		const changed = this.handleOpenedEditors();

		// Respect option to focus tab control if provided
		if (options?.focusTabControl) {
			this.withTab(editor, (editor, tabIndex, tabContainer) => tabContainer.focus());
		}

		return changed;
	}

	openEditors(editors: EditorInput[]): boolean {
		return this.handleOpenedEditors();
	}

	private handleOpenedEditors(): boolean {

		// Set tabs control visibility
		this.updateTabsControlVisibility();

		// Create tabs as needed
		const [tabsContainer, tabsScrollbar] = assertAllDefined(this.tabsContainer, this.tabsScrollbar);
		for (let i = tabsContainer.children.length; i < this.tabsModel.count; i++) {
			tabsContainer.appendChild(this.createTab(i, tabsContainer, tabsScrollbar));
		}

		// Make sure to recompute tab labels and detect
		// if a label change occurred that requires a
		// redraw of tabs.

		const activeEditorChanged = this.didActiveEditorChange();
		const oldActiveTabLabel = this.activeTabLabel;
		const oldTabLabelsLength = this.tabLabels.length;
		this.computeTabLabels();

		// Redraw and update in these cases
		let didChange = false;
		if (
			activeEditorChanged ||													// active editor changed
			oldTabLabelsLength !== this.tabLabels.length ||							// number of tabs changed
			!this.equalsEditorInputLabel(oldActiveTabLabel, this.activeTabLabel)	// active editor label changed
		) {
			this.redraw({ forceRevealActiveTab: true });
			didChange = true;
		}

		// Otherwise only layout for revealing
		else {
			this.layout(this.dimensions, { forceRevealActiveTab: true });
		}

		return didChange;
	}

	private didActiveEditorChange(): boolean {
		if (
			!this.activeTabLabel?.editor && this.tabsModel.activeEditor || 							// active editor changed from null => editor
			this.activeTabLabel?.editor && !this.tabsModel.activeEditor || 							// active editor changed from editor => null
			(!this.activeTabLabel?.editor || !this.tabsModel.isActive(this.activeTabLabel.editor))	// active editor changed from editorA => editorB
		) {
			return true;
		}

		return false;
	}

	private equalsEditorInputLabel(labelA: IEditorInputLabel | undefined, labelB: IEditorInputLabel | undefined): boolean {
		if (labelA === labelB) {
			return true;
		}

		if (!labelA || !labelB) {
			return false;
		}

		return labelA.name === labelB.name &&
			labelA.description === labelB.description &&
			labelA.forceDescription === labelB.forceDescription &&
			labelA.title === labelB.title &&
			labelA.ariaLabel === labelB.ariaLabel;
	}

	beforeCloseEditor(editor: EditorInput): void {

		// Fix tabs width if the mouse is over tabs and before closing
		// a tab (except the last tab) when tab sizing is 'fixed'.
		// This helps keeping the close button stable under
		// the mouse and allows for rapid closing of tabs.

		if (this.isMouseOverTabs && this.groupsView.partOptions.tabSizing === 'fixed') {
			const closingLastTab = this.tabsModel.isLast(editor);
			this.updateTabsFixedWidth(!closingLastTab);
		}
	}

	closeEditor(editor: EditorInput): void {
		this.handleClosedEditors();
	}

	closeEditors(editors: EditorInput[]): void {
		this.handleClosedEditors();
	}

	private handleClosedEditors(): void {

		// There are tabs to show
		if (this.tabsModel.count) {

			// Remove tabs that got closed
			const tabsContainer = assertIsDefined(this.tabsContainer);
			while (tabsContainer.children.length > this.tabsModel.count) {

				// Remove one tab from container (must be the last to keep indexes in order!)
				tabsContainer.lastChild?.remove();

				// Remove associated tab label and widget
				dispose(this.tabDisposables.pop());
			}

			// A removal of a label requires to recompute all labels
			this.computeTabLabels();

			// Redraw all tabs
			this.redraw({ forceRevealActiveTab: true });
		}

		// No tabs to show
		else {
			if (this.tabsContainer) {
				clearNode(this.tabsContainer);
			}

			this.tabDisposables = dispose(this.tabDisposables);
			this.tabResourceLabels.clear();
			this.tabLabels = [];
			this.activeTabLabel = undefined;
			this.tabActionBars = [];

			this.clearEditorActionsToolbar();
			this.updateTabsControlVisibility();
		}
	}

	moveEditor(editor: EditorInput, fromTabIndex: number, targeTabIndex: number): void {

		// Move the editor label
		const editorLabel = this.tabLabels[fromTabIndex];
		this.tabLabels.splice(fromTabIndex, 1);
		this.tabLabels.splice(targeTabIndex, 0, editorLabel);

		// Redraw tabs in the range of the move
		this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
			this.redrawTab(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar);
		},
			Math.min(fromTabIndex, targeTabIndex), 	// from: smallest of fromTabIndex/targeTabIndex
			Math.max(fromTabIndex, targeTabIndex)	//   to: largest of fromTabIndex/targeTabIndex
		);

		// Moving an editor requires a layout to keep the active editor visible
		this.layout(this.dimensions, { forceRevealActiveTab: true });
	}

	pinEditor(editor: EditorInput): void {
		this.withTab(editor, (editor, tabIndex, tabContainer, tabLabelWidget, tabLabel) => this.redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel));
	}

	stickEditor(editor: EditorInput): void {
		this.doHandleStickyEditorChange(editor);
	}

	unstickEditor(editor: EditorInput): void {
		this.doHandleStickyEditorChange(editor);
	}

	private doHandleStickyEditorChange(editor: EditorInput): void {

		// Update tab
		this.withTab(editor, (editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => this.redrawTab(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar));

		// Sticky change has an impact on each tab's border because
		// it potentially moves the border to the last pinned tab
		this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel) => {
			this.redrawTabBorders(tabIndex, tabContainer);
		});

		// A change to the sticky state requires a layout to keep the active editor visible
		this.layout(this.dimensions, { forceRevealActiveTab: true });
	}

	setActive(isGroupActive: boolean): void {

		// Activity has an impact on each tab's active indication
		this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
			this.redrawTabSelectedActiveAndDirty(isGroupActive, editor, tabContainer, tabActionBar);
		});

		// Activity has an impact on the toolbar, so we need to update and layout
		this.updateEditorActionsToolbar();
		this.layout(this.dimensions, { forceRevealActiveTab: true });
	}

	updateEditorSelections(): void {
		this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
			this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor, tabContainer, tabActionBar);
		});
	}

	private updateEditorLabelScheduler = this._register(new RunOnceScheduler(() => this.doUpdateEditorLabels(), 0));

	updateEditorLabel(editor: EditorInput): void {

		// Update all labels to account for changes to tab labels
		// Since this method may be called a lot of times from
		// individual editors, we collect all those requests and
		// then run the update once because we have to update
		// all opened tabs in the group at once.
		this.updateEditorLabelScheduler.schedule();
	}

	private doUpdateEditorLabels(): void {

		// A change to a label requires to recompute all labels
		this.computeTabLabels();

		// As such we need to redraw each label
		this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel) => {
			this.redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel);
		});

		// A change to a label requires a layout to keep the active editor visible
		this.layout(this.dimensions);
	}

	updateEditorDirty(editor: EditorInput): void {
		this.withTab(editor, (editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor, tabContainer, tabActionBar));
	}

	override updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {
		super.updateOptions(oldOptions, newOptions);

		// A change to a label format options requires to recompute all labels
		if (oldOptions.labelFormat !== newOptions.labelFormat) {
			this.computeTabLabels();
		}

		// Update tabs scrollbar sizing
		if (oldOptions.titleScrollbarSizing !== newOptions.titleScrollbarSizing) {
			this.updateTabsScrollbarSizing();
		}

		// Update editor actions
		if (oldOptions.alwaysShowEditorActions !== newOptions.alwaysShowEditorActions) {
			this.updateEditorActionsToolbar();
		}

		// Update tabs sizing
		if (
			oldOptions.tabSizingFixedMinWidth !== newOptions.tabSizingFixedMinWidth ||
			oldOptions.tabSizingFixedMaxWidth !== newOptions.tabSizingFixedMaxWidth ||
			oldOptions.tabSizing !== newOptions.tabSizing
		) {
			this.updateTabSizing(true);
		}

		// Redraw tabs when other options change
		if (
			oldOptions.labelFormat !== newOptions.labelFormat ||
			oldOptions.tabActionLocation !== newOptions.tabActionLocation ||
			oldOptions.tabActionCloseVisibility !== newOptions.tabActionCloseVisibility ||
			oldOptions.tabActionUnpinVisibility !== newOptions.tabActionUnpinVisibility ||
			oldOptions.tabSizing !== newOptions.tabSizing ||
			oldOptions.pinnedTabSizing !== newOptions.pinnedTabSizing ||
			oldOptions.showIcons !== newOptions.showIcons ||
			oldOptions.hasIcons !== newOptions.hasIcons ||
			oldOptions.highlightModifiedTabs !== newOptions.highlightModifiedTabs ||
			oldOptions.wrapTabs !== newOptions.wrapTabs ||
			!equals(oldOptions.decorations, newOptions.decorations)
		) {
			this.redraw();
		}
	}

	override updateStyles(): void {
		this.redraw();
	}

	private forEachTab(fn: (editor: EditorInput, tabIndex: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel, tabActionBar: ActionBar) => void, fromTabIndex?: number, toTabIndex?: number): void {
		this.tabsModel.getEditors(EditorsOrder.SEQUENTIAL).forEach((editor: EditorInput, tabIndex: number) => {
			if (typeof fromTabIndex === 'number' && fromTabIndex > tabIndex) {
				return; // do nothing if we are not yet at `fromIndex`
			}

			if (typeof toTabIndex === 'number' && toTabIndex < tabIndex) {
				return; // do nothing if we are beyond `toIndex`
			}

			this.doWithTab(tabIndex, editor, fn);
		});
	}

	private withTab(editor: EditorInput, fn: (editor: EditorInput, tabIndex: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel, tabActionBar: ActionBar) => void): void {
		this.doWithTab(this.tabsModel.indexOf(editor), editor, fn);
	}

	private doWithTab(tabIndex: number, editor: EditorInput, fn: (editor: EditorInput, tabIndex: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel, tabActionBar: ActionBar) => void): void {
		const tabsContainer = assertIsDefined(this.tabsContainer);
		const tabContainer = tabsContainer.children[tabIndex] as HTMLElement;
		const tabResourceLabel = this.tabResourceLabels.get(tabIndex);
		const tabLabel = this.tabLabels[tabIndex];
		const tabActionBar = this.tabActionBars[tabIndex];
		if (tabContainer && tabResourceLabel && tabLabel) {
			fn(editor, tabIndex, tabContainer, tabResourceLabel, tabLabel, tabActionBar);
		}
	}

	private createTab(tabIndex: number, tabsContainer: HTMLElement, tabsScrollbar: ScrollableElement): HTMLElement {

		// Tab Container
		const tabContainer = document.createElement('div');
		tabContainer.draggable = true;
		tabContainer.setAttribute('role', 'tab');
		tabContainer.classList.add('tab');

		// Gesture Support
		this._register(Gesture.addTarget(tabContainer));

		// Tab Border Top
		const tabBorderTopContainer = document.createElement('div');
		tabBorderTopContainer.classList.add('tab-border-top-container');
		tabContainer.appendChild(tabBorderTopContainer);

		// Tab Editor Label
		const editorLabel = this.tabResourceLabels.create(tabContainer, { hoverTargetOverride: tabContainer });

		// Tab Actions
		const tabActionsContainer = document.createElement('div');
		tabActionsContainer.classList.add('tab-actions');
		tabContainer.appendChild(tabActionsContainer);

		const that = this;
		const tabActionRunner = new EditorCommandsContextActionRunner({
			groupId: this.groupView.id,
			get editorIndex() { return that.toEditorIndex(tabIndex); }
		});

		const tabActionBar = new ActionBar(tabActionsContainer, { ariaLabel: localize('ariaLabelTabActions', "Tab actions"), actionRunner: tabActionRunner });
		const tabActionListener = tabActionBar.onWillRun(e => {
			if (e.action.id === this.closeEditorAction.id) {
				this.blockRevealActiveTabOnce();
			}
		});

		const tabActionBarDisposable = combinedDisposable(tabActionRunner, tabActionBar, tabActionListener, toDisposable(insert(this.tabActionBars, tabActionBar)));

		// Tab Fade Hider
		// Hides the tab fade to the right when tab action left and sizing shrink/fixed, ::after, ::before are already used
		const tabShadowHider = document.createElement('div');
		tabShadowHider.classList.add('tab-fade-hider');
		tabContainer.appendChild(tabShadowHider);

		// Tab Border Bottom
		const tabBorderBottomContainer = document.createElement('div');
		tabBorderBottomContainer.classList.add('tab-border-bottom-container');
		tabContainer.appendChild(tabBorderBottomContainer);

		// Eventing
		const eventsDisposable = this.registerTabListeners(tabContainer, tabIndex, tabsContainer, tabsScrollbar);

		this.tabDisposables.push(combinedDisposable(eventsDisposable, tabActionBarDisposable, tabActionRunner, editorLabel));

		return tabContainer;
	}

	private toEditorIndex(tabIndex: number): number {

		// Given a `tabIndex` that is relative to the tabs model
		// returns the `editorIndex` relative to the entire group

		const editor = assertIsDefined(this.tabsModel.getEditorByIndex(tabIndex));

		return this.groupView.getIndexOfEditor(editor);
	}

	private lastSingleSelectSelectedEditor: EditorInput | undefined;
	private registerTabListeners(tab: HTMLElement, tabIndex: number, tabsContainer: HTMLElement, tabsScrollbar: ScrollableElement): IDisposable {
		const disposables = new DisposableStore();

		const handleClickOrTouch = async (e: MouseEvent | GestureEvent, preserveFocus: boolean): Promise<void> => {
			tab.blur(); // prevent flicker of focus outline on tab until editor got focus

			if (isMouseEvent(e) && (e.button !== 0 /* middle/right mouse button */ || (isMacintosh && e.ctrlKey /* macOS context menu */))) {
				if (e.button === 1) {
					e.preventDefault(); // required to prevent auto-scrolling (https://github.com/microsoft/vscode/issues/16690)
				}

				return;
			}

			if (this.originatesFromTabActionBar(e)) {
				return; // not when clicking on actions
			}

			// Open tabs editor
			const editor = this.tabsModel.getEditorByIndex(tabIndex);
			if (editor) {
				if (e.shiftKey) {
					let anchor: EditorInput;
					if (this.lastSingleSelectSelectedEditor && this.tabsModel.isSelected(this.lastSingleSelectSelectedEditor)) {
						// The last selected editor is the anchor
						anchor = this.lastSingleSelectSelectedEditor;
					} else {
						// The active editor is the anchor
						const activeEditor = assertIsDefined(this.groupView.activeEditor);
						this.lastSingleSelectSelectedEditor = activeEditor;
						anchor = activeEditor;
					}
					await this.selectEditorsBetween(editor, anchor);
				} else if ((e.ctrlKey && !isMacintosh) || (e.metaKey && isMacintosh)) {
					if (this.tabsModel.isSelected(editor)) {
						await this.unselectEditor(editor);
					} else {
						await this.selectEditor(editor);
						this.lastSingleSelectSelectedEditor = editor;
					}
				} else {
					// Even if focus is preserved make sure to activate the group.
					// If a new active editor is selected, keep the current selection on key
					// down such that drag and drop can operate over the selection. The selection
					// is removed on key up in this case.
					const inactiveSelection = this.tabsModel.isSelected(editor) ? this.groupView.selectedEditors.filter(e => !e.matches(editor)) : [];
					await this.groupView.openEditor(editor, { preserveFocus, activation: EditorActivation.ACTIVATE }, { inactiveSelection, focusTabControl: true });
				}
			}
		};

		const showContextMenu = (e: Event) => {
			EventHelper.stop(e);

			const editor = this.tabsModel.getEditorByIndex(tabIndex);
			if (editor) {
				this.onTabContextMenu(editor, e, tab);
			}
		};

		// Open on Click / Touch
		disposables.add(addDisposableListener(tab, EventType.MOUSE_DOWN, e => handleClickOrTouch(e, false)));
		disposables.add(addDisposableListener(tab, TouchEventType.Tap, (e: GestureEvent) => handleClickOrTouch(e, true))); // Preserve focus on touch #125470

		// Touch Scroll Support
		disposables.add(addDisposableListener(tab, TouchEventType.Change, (e: GestureEvent) => {
			tabsScrollbar.setScrollPosition({ scrollLeft: tabsScrollbar.getScrollPosition().scrollLeft - e.translationX });
		}));

		// Update selection & prevent flicker of focus outline on tab until editor got focus
		disposables.add(addDisposableListener(tab, EventType.MOUSE_UP, async e => {
			EventHelper.stop(e);

			tab.blur();

			if (isMouseEvent(e) && (e.button !== 0 /* middle/right mouse button */ || (isMacintosh && e.ctrlKey /* macOS context menu */))) {
				return;
			}

			if (this.originatesFromTabActionBar(e)) {
				return; // not when clicking on actions
			}

			const isCtrlCmd = (e.ctrlKey && !isMacintosh) || (e.metaKey && isMacintosh);
			if (!isCtrlCmd && !e.shiftKey && this.groupView.selectedEditors.length > 1) {
				await this.unselectAllEditors();
			}
		}));

		// Close on mouse middle click
		disposables.add(addDisposableListener(tab, EventType.AUXCLICK, e => {
			if (e.button === 1 /* Middle Button*/) {
				EventHelper.stop(e, true /* for https://github.com/microsoft/vscode/issues/56715 */);

				const editor = this.tabsModel.getEditorByIndex(tabIndex);
				if (editor) {
					if (preventEditorClose(this.tabsModel, editor, EditorCloseMethod.MOUSE, this.groupsView.partOptions)) {
						return;
					}

					this.blockRevealActiveTabOnce();
					this.closeEditorAction.run({ groupId: this.groupView.id, editorIndex: this.groupView.getIndexOfEditor(editor) });
				}
			}
		}));

		// Context menu on Shift+F10
		disposables.add(addDisposableListener(tab, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.shiftKey && event.keyCode === KeyCode.F10) {
				showContextMenu(e);
			}
		}));

		// Context menu on touch context menu gesture
		disposables.add(addDisposableListener(tab, TouchEventType.Contextmenu, (e: GestureEvent) => {
			showContextMenu(e);
		}));

		// Keyboard accessibility
		disposables.add(addDisposableListener(tab, EventType.KEY_UP, e => {
			const event = new StandardKeyboardEvent(e);
			let handled = false;

			// Run action on Enter/Space
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				handled = true;
				const editor = this.tabsModel.getEditorByIndex(tabIndex);
				if (editor) {
					this.groupView.openEditor(editor);
				}
			}

			// Navigate in editors
			else if ([KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.Home, KeyCode.End].some(kb => event.equals(kb))) {
				let editorIndex = this.toEditorIndex(tabIndex);
				if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow)) {
					editorIndex = editorIndex - 1;
				} else if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow)) {
					editorIndex = editorIndex + 1;
				} else if (event.equals(KeyCode.Home)) {
					editorIndex = 0;
				} else {
					editorIndex = this.groupView.count - 1;
				}

				const target = this.groupView.getEditorByIndex(editorIndex);
				if (target) {
					handled = true;
					this.groupView.openEditor(target, { preserveFocus: true }, { focusTabControl: true });
				}
			}

			if (handled) {
				EventHelper.stop(e, true);
			}

			// moving in the tabs container can have an impact on scrolling position, so we need to update the custom scrollbar
			tabsScrollbar.setScrollPosition({
				scrollLeft: tabsContainer.scrollLeft
			});
		}));

		// Double click: either pin or toggle maximized
		for (const eventType of [TouchEventType.Tap, EventType.DBLCLICK]) {
			disposables.add(addDisposableListener(tab, eventType, (e: MouseEvent | GestureEvent) => {
				if (eventType === EventType.DBLCLICK) {
					EventHelper.stop(e);
				} else if ((<GestureEvent>e).tapCount !== 2) {
					return; // ignore single taps
				}

				const editor = this.tabsModel.getEditorByIndex(tabIndex);
				if (editor && this.tabsModel.isPinned(editor)) {
					switch (this.groupsView.partOptions.doubleClickTabToToggleEditorGroupSizes) {
						case 'maximize':
							this.groupsView.toggleMaximizeGroup(this.groupView);
							break;
						case 'expand':
							this.groupsView.toggleExpandGroup(this.groupView);
							break;
						case 'off':
							break;
					}

				} else {
					this.groupView.pinEditor(editor);
				}
			}));
		}

		// Context menu
		disposables.add(addDisposableListener(tab, EventType.CONTEXT_MENU, e => {
			EventHelper.stop(e, true);

			const editor = this.tabsModel.getEditorByIndex(tabIndex);
			if (editor) {
				this.onTabContextMenu(editor, e, tab);
			}
		}, true /* use capture to fix https://github.com/microsoft/vscode/issues/19145 */));

		// Drag & Drop support
		let lastDragEvent: DragEvent | undefined = undefined;
		let isNewWindowOperation = false;
		disposables.add(new DragAndDropObserver(tab, {
			onDragStart: e => {
				const editor = this.tabsModel.getEditorByIndex(tabIndex);
				if (!editor) {
					return;
				}

				isNewWindowOperation = this.isNewWindowOperation(e);
				const selectedEditors = this.groupView.selectedEditors;
				this.editorTransfer.setData(selectedEditors.map(e => new DraggedEditorIdentifier({ editor: e, groupId: this.groupView.id })), DraggedEditorIdentifier.prototype);

				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'copyMove';
					if (selectedEditors.length > 1) {
						const label = `${editor.getName()} + ${selectedEditors.length - 1}`;
						applyDragImage(e, label, 'monaco-editor-group-drag-image', this.getColor(listActiveSelectionBackground), this.getColor(listActiveSelectionForeground));
					} else {
						e.dataTransfer.setDragImage(tab, 0, 0); // top left corner of dragged tab set to cursor position to make room for drop-border feedback
					}
				}

				// Apply some datatransfer types to allow for dragging the element outside of the application
				this.doFillResourceDataTransfers(selectedEditors, e, isNewWindowOperation);

				scheduleAtNextAnimationFrame(getWindow(this.parent), () => this.updateDropFeedback(tab, false, e, tabIndex));
			},

			onDrag: e => {
				lastDragEvent = e;
			},

			onDragEnter: e => {

				// Return if transfer is unsupported
				if (!this.isSupportedDropTransfer(e)) {
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'none';
					}

					return;
				}

				// Update the dropEffect to "copy" if there is no local data to be dragged because
				// in that case we can only copy the data into and not move it from its source
				if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'copy';
					}
				}

				this.updateDropFeedback(tab, true, e, tabIndex);
			},

			onDragOver: (e, dragDuration) => {
				if (dragDuration >= MultiEditorTabsControl.DRAG_OVER_OPEN_TAB_THRESHOLD) {
					const draggedOverTab = this.tabsModel.getEditorByIndex(tabIndex);
					if (draggedOverTab && this.tabsModel.activeEditor !== draggedOverTab) {
						this.groupView.openEditor(draggedOverTab, { preserveFocus: true });
					}
				}

				this.updateDropFeedback(tab, true, e, tabIndex);
			},

			onDragEnd: async e => {
				this.updateDropFeedback(tab, false, e, tabIndex);
				const draggedEditors = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
				this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);

				if (
					!isNewWindowOperation ||
					isWindowDraggedOver() ||
					!draggedEditors ||
					draggedEditors.length === 0
				) {
					return; // drag to open in new window is disabled
				}

				const auxiliaryEditorPart = await this.maybeCreateAuxiliaryEditorPartAt(e, tab);
				if (!auxiliaryEditorPart) {
					return;
				}

				const targetGroup = auxiliaryEditorPart.activeGroup;
				const editorsWithOptions = prepareMoveCopyEditors(this.groupView, draggedEditors.map(editor => editor.identifier.editor));
				if (this.isMoveOperation(lastDragEvent ?? e, targetGroup.id, draggedEditors[0].identifier.editor)) {
					this.groupView.moveEditors(editorsWithOptions, targetGroup);
				} else {
					this.groupView.copyEditors(editorsWithOptions, targetGroup);
				}

				targetGroup.focus();
			},

			onDrop: e => {
				this.updateDropFeedback(tab, false, e, tabIndex);

				// compute the target index
				let targetIndex = tabIndex;
				if (this.getTabDragOverLocation(e, tab) === 'right') {
					targetIndex++;
				}

				this.onDrop(e, targetIndex, tabsContainer);
			}
		}));

		return disposables;
	}

	private isSupportedDropTransfer(e: DragEvent): boolean {
		if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
			const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				const group = data[0];
				if (group.identifier === this.groupView.id) {
					return false; // groups cannot be dropped on group it originates from
				}
			}

			return true;
		}

		if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			return true; // (local) editors can always be dropped
		}

		if (e.dataTransfer && e.dataTransfer.types.length > 0) {
			return true; // optimistically allow external data (// see https://github.com/microsoft/vscode/issues/25789)
		}

		return false;
	}

	private updateDropFeedback(element: HTMLElement, isDND: boolean, e: DragEvent, tabIndex?: number): void {
		const isTab = (typeof tabIndex === 'number');

		let dropTarget;
		if (isDND) {
			if (isTab) {
				dropTarget = this.computeDropTarget(e, tabIndex, element);
			} else {
				dropTarget = { leftElement: element.lastElementChild as HTMLElement, rightElement: undefined };
			}
		} else {
			dropTarget = undefined;
		}

		this.updateDropTarget(dropTarget);
	}

	private dropTarget: { leftElement: HTMLElement | undefined; rightElement: HTMLElement | undefined } | undefined;
	private updateDropTarget(newTarget: { leftElement: HTMLElement | undefined; rightElement: HTMLElement | undefined } | undefined): void {
		const oldTargets = this.dropTarget;
		if (oldTargets === newTarget || oldTargets && newTarget && oldTargets.leftElement === newTarget.leftElement && oldTargets.rightElement === newTarget.rightElement) {
			return;
		}

		const dropClassLeft = 'drop-target-left';
		const dropClassRight = 'drop-target-right';

		if (oldTargets) {
			oldTargets.leftElement?.classList.remove(dropClassLeft);
			oldTargets.rightElement?.classList.remove(dropClassRight);
		}

		if (newTarget) {
			newTarget.leftElement?.classList.add(dropClassLeft);
			newTarget.rightElement?.classList.add(dropClassRight);
		}

		this.dropTarget = newTarget;
	}

	private getTabDragOverLocation(e: DragEvent, tab: HTMLElement): 'left' | 'right' {
		const rect = tab.getBoundingClientRect();
		const offsetXRelativeToParent = e.clientX - rect.left;

		return offsetXRelativeToParent <= rect.width / 2 ? 'left' : 'right';
	}

	private computeDropTarget(e: DragEvent, tabIndex: number, targetTab: HTMLElement): { leftElement: HTMLElement | undefined; rightElement: HTMLElement | undefined } | undefined {
		const isLeftSideOfTab = this.getTabDragOverLocation(e, targetTab) === 'left';
		const isLastTab = tabIndex === this.tabsModel.count - 1;
		const isFirstTab = tabIndex === 0;

		// Before first tab
		if (isLeftSideOfTab && isFirstTab) {
			return { leftElement: undefined, rightElement: targetTab };
		}

		// After last tab
		if (!isLeftSideOfTab && isLastTab) {
			return { leftElement: targetTab, rightElement: undefined };
		}

		// Between two tabs
		const tabBefore = isLeftSideOfTab ? targetTab.previousElementSibling : targetTab;
		const tabAfter = isLeftSideOfTab ? targetTab : targetTab.nextElementSibling;

		return { leftElement: tabBefore as HTMLElement, rightElement: tabAfter as HTMLElement };
	}

	private async selectEditor(editor: EditorInput): Promise<void> {
		if (this.groupView.isActive(editor)) {
			return;
		}

		await this.groupView.setSelection(editor, this.groupView.selectedEditors);
	}

	private async selectEditorsBetween(target: EditorInput, anchor: EditorInput): Promise<void> {
		const editorIndex = this.groupView.getIndexOfEditor(target);
		if (editorIndex === -1) {
			throw new BugIndicatingError();
		}

		const anchorEditorIndex = this.groupView.getIndexOfEditor(anchor);
		if (anchorEditorIndex === -1) {
			throw new BugIndicatingError();
		}

		let selection = this.groupView.selectedEditors;

		// Unselect editors on other side of anchor in relation to the target
		let currentEditorIndex = anchorEditorIndex;
		while (currentEditorIndex >= 0 && currentEditorIndex <= this.groupView.count - 1) {
			currentEditorIndex = anchorEditorIndex < editorIndex ? currentEditorIndex - 1 : currentEditorIndex + 1;

			const currentEditor = this.groupView.getEditorByIndex(currentEditorIndex);
			if (!currentEditor) {
				break;
			}

			if (!this.groupView.isSelected(currentEditor)) {
				break;
			}

			selection = selection.filter(editor => !editor.matches(currentEditor));
		}

		// Select editors between anchor and target
		const fromEditorIndex = anchorEditorIndex < editorIndex ? anchorEditorIndex : editorIndex;
		const toEditorIndex = anchorEditorIndex < editorIndex ? editorIndex : anchorEditorIndex;

		const editorsToSelect = this.groupView.getEditors(EditorsOrder.SEQUENTIAL).slice(fromEditorIndex, toEditorIndex + 1);
		for (const editor of editorsToSelect) {
			if (!this.groupView.isSelected(editor)) {
				selection.push(editor);
			}
		}

		const inactiveSelectedEditors = selection.filter(editor => !editor.matches(target));
		await this.groupView.setSelection(target, inactiveSelectedEditors);
	}

	private async unselectEditor(editor: EditorInput): Promise<void> {
		const isUnselectingActiveEditor = this.groupView.isActive(editor);

		// If there is only one editor selected, do not unselect it
		if (isUnselectingActiveEditor && this.groupView.selectedEditors.length === 1) {
			return;
		}

		let newActiveEditor = assertIsDefined(this.groupView.activeEditor);

		// If active editor is bing unselected then find the most recently opened selected editor
		// that is not the editor being unselected
		if (isUnselectingActiveEditor) {
			const recentEditors = this.groupView.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
			for (let i = 1; i < recentEditors.length; i++) { // First one is the active editor
				const recentEditor = recentEditors[i];
				if (this.groupView.isSelected(recentEditor)) {
					newActiveEditor = recentEditor;
					break;
				}
			}
		}

		const inactiveSelectedEditors = this.groupView.selectedEditors.filter(e => !e.matches(editor) && !e.matches(newActiveEditor));
		await this.groupView.setSelection(newActiveEditor, inactiveSelectedEditors);
	}

	private async unselectAllEditors(): Promise<void> {
		if (this.groupView.selectedEditors.length > 1) {
			const activeEditor = assertIsDefined(this.groupView.activeEditor);
			await this.groupView.setSelection(activeEditor, []);
		}
	}

	private computeTabLabels(): void {
		const { labelFormat } = this.groupsView.partOptions;
		const { verbosity, shortenDuplicates } = this.getLabelConfigFlags(labelFormat);

		// Build labels and descriptions for each editor
		const labels: IEditorInputLabel[] = [];
		let activeEditorTabIndex = -1;
		this.tabsModel.getEditors(EditorsOrder.SEQUENTIAL).forEach((editor: EditorInput, tabIndex: number) => {
			labels.push({
				editor,
				name: editor.getName(),
				description: editor.getDescription(verbosity),
				forceDescription: editor.hasCapability(EditorInputCapabilities.ForceDescription),
				title: editor.getTitle(Verbosity.LONG),
				ariaLabel: computeEditorAriaLabel(editor, tabIndex, this.groupView, this.editorPartsView.count)
			});

			if (editor === this.tabsModel.activeEditor) {
				activeEditorTabIndex = tabIndex;
			}
		});

		// Shorten labels as needed
		if (shortenDuplicates) {
			this.shortenTabLabels(labels);
		}

		// Remember for fast lookup
		this.tabLabels = labels;
		this.activeTabLabel = labels[activeEditorTabIndex];
	}

	private shortenTabLabels(labels: IEditorInputLabel[]): void {

		// Gather duplicate titles, while filtering out invalid descriptions
		const mapNameToDuplicates = new Map<string, IEditorInputLabel[]>();
		for (const label of labels) {
			if (typeof label.description === 'string') {
				getOrSet(mapNameToDuplicates, label.name, []).push(label);
			} else {
				label.description = '';
			}
		}

		// Identify duplicate names and shorten descriptions
		for (const [, duplicateLabels] of mapNameToDuplicates) {

			// Remove description if the title isn't duplicated
			// and we have no indication to enforce description
			if (duplicateLabels.length === 1 && !duplicateLabels[0].forceDescription) {
				duplicateLabels[0].description = '';

				continue;
			}

			// Identify duplicate descriptions
			const mapDescriptionToDuplicates = new Map<string, IEditorInputLabel[]>();
			for (const duplicateLabel of duplicateLabels) {
				getOrSet(mapDescriptionToDuplicates, duplicateLabel.description, []).push(duplicateLabel);
			}

			// For editors with duplicate descriptions, check whether any long descriptions differ
			let useLongDescriptions = false;
			for (const [, duplicateLabels] of mapDescriptionToDuplicates) {
				if (!useLongDescriptions && duplicateLabels.length > 1) {
					const [first, ...rest] = duplicateLabels.map(({ editor }) => editor.getDescription(Verbosity.LONG));
					useLongDescriptions = rest.some(description => description !== first);
				}
			}

			// If so, replace all descriptions with long descriptions
			if (useLongDescriptions) {
				mapDescriptionToDuplicates.clear();
				for (const duplicateLabel of duplicateLabels) {
					duplicateLabel.description = duplicateLabel.editor.getDescription(Verbosity.LONG);
					getOrSet(mapDescriptionToDuplicates, duplicateLabel.description, []).push(duplicateLabel);
				}
			}

			// Obtain final set of descriptions
			const descriptions: string[] = [];
			for (const [description] of mapDescriptionToDuplicates) {
				descriptions.push(description);
			}

			// Remove description if all descriptions are identical unless forced
			if (descriptions.length === 1) {
				for (const label of mapDescriptionToDuplicates.get(descriptions[0]) || []) {
					if (!label.forceDescription) {
						label.description = '';
					}
				}

				continue;
			}

			// Shorten descriptions
			const shortenedDescriptions = shorten(descriptions, this.path.sep);
			descriptions.forEach((description, tabIndex) => {
				for (const label of mapDescriptionToDuplicates.get(description) || []) {
					label.description = shortenedDescriptions[tabIndex];
				}
			});
		}
	}

	private getLabelConfigFlags(value: string | undefined) {
		switch (value) {
			case 'short':
				return { verbosity: Verbosity.SHORT, shortenDuplicates: false };
			case 'medium':
				return { verbosity: Verbosity.MEDIUM, shortenDuplicates: false };
			case 'long':
				return { verbosity: Verbosity.LONG, shortenDuplicates: false };
			default:
				return { verbosity: Verbosity.MEDIUM, shortenDuplicates: true };
		}
	}

	private redraw(options?: IMultiEditorTabsControlLayoutOptions): void {

		// Border below tabs if any with explicit high contrast support
		if (this.tabsAndActionsContainer) {
			let tabsContainerBorderColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BORDER);
			if (!tabsContainerBorderColor && isHighContrast(this.theme.type)) {
				tabsContainerBorderColor = this.getColor(TAB_BORDER) || this.getColor(contrastBorder);
			}

			if (tabsContainerBorderColor) {
				this.tabsAndActionsContainer.classList.add('tabs-border-bottom');
				this.tabsAndActionsContainer.style.setProperty('--tabs-border-bottom-color', tabsContainerBorderColor.toString());
			} else {
				this.tabsAndActionsContainer.classList.remove('tabs-border-bottom');
				this.tabsAndActionsContainer.style.removeProperty('--tabs-border-bottom-color');
			}
		}

		// For each tab
		this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
			this.redrawTab(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar);
		});

		// Update Editor Actions Toolbar
		this.updateEditorActionsToolbar();

		// Ensure the active tab is always revealed
		this.layout(this.dimensions, options);
	}

	private redrawTab(editor: EditorInput, tabIndex: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel, tabActionBar: ActionBar): void {
		const isTabSticky = this.tabsModel.isSticky(tabIndex);
		const options = this.groupsView.partOptions;

		// Label
		this.redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel);

		// Action
		const hasUnpinAction = isTabSticky && options.tabActionUnpinVisibility;
		const hasCloseAction = !hasUnpinAction && options.tabActionCloseVisibility;
		const hasAction = hasUnpinAction || hasCloseAction;

		let tabAction;
		if (hasAction) {
			tabAction = hasUnpinAction ? this.unpinEditorAction : this.closeEditorAction;
		} else {
			// Even if the action is not visible, add it as it contains the dirty indicator
			tabAction = isTabSticky ? this.unpinEditorAction : this.closeEditorAction;
		}

		if (!tabActionBar.hasAction(tabAction)) {
			if (!tabActionBar.isEmpty()) {
				tabActionBar.clear();
			}

			tabActionBar.push(tabAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(tabAction) });
		}

		tabContainer.classList.toggle(`pinned-action-off`, isTabSticky && !hasUnpinAction);
		tabContainer.classList.toggle(`close-action-off`, !hasUnpinAction && !hasCloseAction);

		for (const option of ['left', 'right']) {
			tabContainer.classList.toggle(`tab-actions-${option}`, hasAction && options.tabActionLocation === option);
		}

		const tabSizing = isTabSticky && options.pinnedTabSizing === 'shrink' ? 'shrink' /* treat sticky shrink tabs as tabSizing: 'shrink' */ : options.tabSizing;
		for (const option of ['fit', 'shrink', 'fixed']) {
			tabContainer.classList.toggle(`sizing-${option}`, tabSizing === option);
		}

		tabContainer.classList.toggle('has-icon', options.showIcons && options.hasIcons);

		tabContainer.classList.toggle('sticky', isTabSticky);
		for (const option of ['normal', 'compact', 'shrink']) {
			tabContainer.classList.toggle(`sticky-${option}`, isTabSticky && options.pinnedTabSizing === option);
		}

		// If not wrapping tabs, sticky compact/shrink tabs need a position to remain at their location
		// when scrolling to stay in view (requirement for position: sticky)
		if (!options.wrapTabs && isTabSticky && options.pinnedTabSizing !== 'normal') {
			let stickyTabWidth = 0;
			switch (options.pinnedTabSizing) {
				case 'compact':
					stickyTabWidth = MultiEditorTabsControl.TAB_WIDTH.compact;
					break;
				case 'shrink':
					stickyTabWidth = MultiEditorTabsControl.TAB_WIDTH.shrink;
					break;
			}

			tabContainer.style.left = `${tabIndex * stickyTabWidth}px`;
		} else {
			tabContainer.style.left = 'auto';
		}

		// Borders / outline
		this.redrawTabBorders(tabIndex, tabContainer);

		// Selection / active / dirty state
		this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor, tabContainer, tabActionBar);
	}

	private redrawTabLabel(editor: EditorInput, tabIndex: number, tabContainer: HTMLElement, tabLabelWidget: IResourceLabel, tabLabel: IEditorInputLabel): void {
		const options = this.groupsView.partOptions;

		// Unless tabs are sticky compact, show the full label and description
		// Sticky compact tabs will only show an icon if icons are enabled
		// or their first character of the name otherwise
		let name: string | undefined;
		let forceLabel = false;
		let fileDecorationBadges = Boolean(options.decorations?.badges);
		const fileDecorationColors = Boolean(options.decorations?.colors);
		let description: string;
		if (options.pinnedTabSizing === 'compact' && this.tabsModel.isSticky(tabIndex)) {
			const isShowingIcons = options.showIcons && options.hasIcons;
			name = isShowingIcons ? '' : tabLabel.name?.charAt(0).toUpperCase();
			description = '';
			forceLabel = true;
			fileDecorationBadges = false; // not enough space when sticky tabs are compact
		} else {
			name = tabLabel.name;
			description = tabLabel.description || '';
		}

		if (tabLabel.ariaLabel) {
			tabContainer.setAttribute('aria-label', tabLabel.ariaLabel);
			// Set aria-description to empty string so that screen readers would not read the title as well
			// More details https://github.com/microsoft/vscode/issues/95378
			tabContainer.setAttribute('aria-description', '');
		}

		// Label
		tabLabelWidget.setResource(
			{ name, description, resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }) },
			{
				title: this.getHoverTitle(editor),
				extraClasses: coalesce(['tab-label', fileDecorationBadges ? 'tab-label-has-badge' : undefined].concat(editor.getLabelExtraClasses())),
				italic: !this.tabsModel.isPinned(editor),
				forceLabel,
				fileDecorations: {
					colors: fileDecorationColors,
					badges: fileDecorationBadges
				},
				icon: editor.getIcon(),
				hideIcon: options.showIcons === false,
			}
		);

		// Tests helper
		const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (resource) {
			tabContainer.setAttribute('data-resource-name', basenameOrAuthority(resource));
		} else {
			tabContainer.removeAttribute('data-resource-name');
		}
	}

	private redrawTabSelectedActiveAndDirty(isGroupActive: boolean, editor: EditorInput, tabContainer: HTMLElement, tabActionBar: ActionBar): void {
		const isTabActive = this.tabsModel.isActive(editor);
		const hasModifiedBorderTop = this.doRedrawTabDirty(isGroupActive, isTabActive, editor, tabContainer);

		this.doRedrawTabActive(isGroupActive, !hasModifiedBorderTop, editor, tabContainer, tabActionBar);
	}

	private doRedrawTabActive(isGroupActive: boolean, allowBorderTop: boolean, editor: EditorInput, tabContainer: HTMLElement, tabActionBar: ActionBar): void {
		const isActive = this.tabsModel.isActive(editor);
		const isSelected = this.tabsModel.isSelected(editor);

		tabContainer.classList.toggle('active', isActive);
		tabContainer.classList.toggle('selected', isSelected);
		tabContainer.setAttribute('aria-selected', isActive ? 'true' : 'false');
		tabContainer.tabIndex = isActive ? 0 : -1; // Only active tab can be focused into
		tabActionBar.setFocusable(isActive);

		// Set border BOTTOM if theme defined color
		if (isActive) {
			const activeTabBorderColorBottom = this.getColor(isGroupActive ? TAB_ACTIVE_BORDER : TAB_UNFOCUSED_ACTIVE_BORDER);
			tabContainer.classList.toggle('tab-border-bottom', !!activeTabBorderColorBottom);
			tabContainer.style.setProperty('--tab-border-bottom-color', activeTabBorderColorBottom ?? '');
		}

		// Set border TOP if theme defined color
		let tabBorderColorTop: string | null = null;
		if (allowBorderTop) {
			if (isActive) {
				tabBorderColorTop = this.getColor(isGroupActive ? TAB_ACTIVE_BORDER_TOP : TAB_UNFOCUSED_ACTIVE_BORDER_TOP);
			}

			if (tabBorderColorTop === null && isSelected) {
				tabBorderColorTop = this.getColor(TAB_SELECTED_BORDER_TOP);
			}
		}

		tabContainer.classList.toggle('tab-border-top', !!tabBorderColorTop);
		tabContainer.style.setProperty('--tab-border-top-color', tabBorderColorTop ?? '');
	}

	private doRedrawTabDirty(isGroupActive: boolean, isTabActive: boolean, editor: EditorInput, tabContainer: HTMLElement): boolean {
		let hasModifiedBorderColor = false;

		// Tab: dirty (unless saving)
		if (editor.isDirty() && !editor.isSaving()) {
			tabContainer.classList.add('dirty');

			// Highlight modified tabs with a border if configured
			if (this.groupsView.partOptions.highlightModifiedTabs) {
				let modifiedBorderColor: string | null;
				if (isGroupActive && isTabActive) {
					modifiedBorderColor = this.getColor(TAB_ACTIVE_MODIFIED_BORDER);
				} else if (isGroupActive && !isTabActive) {
					modifiedBorderColor = this.getColor(TAB_INACTIVE_MODIFIED_BORDER);
				} else if (!isGroupActive && isTabActive) {
					modifiedBorderColor = this.getColor(TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER);
				} else {
					modifiedBorderColor = this.getColor(TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER);
				}

				if (modifiedBorderColor) {
					hasModifiedBorderColor = true;

					tabContainer.classList.add('dirty-border-top');
					tabContainer.style.setProperty('--tab-dirty-border-top-color', modifiedBorderColor);
				}
			} else {
				tabContainer.classList.remove('dirty-border-top');
				tabContainer.style.removeProperty('--tab-dirty-border-top-color');
			}
		}

		// Tab: not dirty
		else {
			tabContainer.classList.remove('dirty', 'dirty-border-top');
			tabContainer.style.removeProperty('--tab-dirty-border-top-color');
		}

		return hasModifiedBorderColor;
	}

	private redrawTabBorders(tabIndex: number, tabContainer: HTMLElement): void {
		const isTabSticky = this.tabsModel.isSticky(tabIndex);
		const isTabLastSticky = isTabSticky && this.tabsModel.stickyCount === tabIndex + 1;
		const showLastStickyTabBorderColor = this.tabsModel.stickyCount !== this.tabsModel.count;

		// Borders / Outline
		const borderRightColor = ((isTabLastSticky && showLastStickyTabBorderColor ? this.getColor(TAB_LAST_PINNED_BORDER) : undefined) || this.getColor(TAB_BORDER) || this.getColor(contrastBorder));
		tabContainer.style.borderRight = borderRightColor ? `1px solid ${borderRightColor}` : '';
		tabContainer.style.outlineColor = this.getColor(activeContrastBorder) || '';
	}

	protected override prepareEditorActions(editorActions: IToolbarActions): IToolbarActions {
		const isGroupActive = this.groupsView.activeGroup === this.groupView;

		// Active: allow all actions
		if (isGroupActive) {
			return editorActions;
		}

		// Inactive: only show "Unlock" and secondary actions
		else {
			return {
				primary: this.groupsView.partOptions.alwaysShowEditorActions ? editorActions.primary : editorActions.primary.filter(action => action.id === UNLOCK_GROUP_COMMAND_ID),
				secondary: editorActions.secondary
			};
		}
	}

	getHeight(): number {

		// Return quickly if our used dimensions are known
		if (this.dimensions.used) {
			return this.dimensions.used.height;
		}

		// Otherwise compute via browser APIs
		else {
			return this.computeHeight();
		}
	}

	private computeHeight(): number {
		let height: number;

		if (!this.visible) {
			height = 0;
		} else if (this.groupsView.partOptions.wrapTabs && this.tabsAndActionsContainer?.classList.contains('wrapping')) {
			// Wrap: we need to ask `offsetHeight` to get
			// the real height of the title area with wrapping.
			height = this.tabsAndActionsContainer.offsetHeight;
		} else {
			height = this.tabHeight;
		}

		return height;
	}

	layout(dimensions: IEditorTitleControlDimensions, options?: IMultiEditorTabsControlLayoutOptions): Dimension {

		// Remember dimensions that we get
		Object.assign(this.dimensions, dimensions);

		if (this.visible) {
			if (!this.layoutScheduler.value) {

				// The layout of tabs can be an expensive operation because we access DOM properties
				// that can result in the browser doing a full page layout to validate them. To buffer
				// this a little bit we try at least to schedule this work on the next animation frame
				// when we have restored or when idle otherwise.

				const disposable = scheduleAtNextAnimationFrame(getWindow(this.parent), () => {
					this.doLayout(this.dimensions, this.layoutScheduler.value?.options /* ensure to pick up latest options */);

					this.layoutScheduler.clear();
				});
				this.layoutScheduler.value = { options, dispose: () => disposable.dispose() };
			}

			// Make sure to keep options updated
			if (options?.forceRevealActiveTab) {
				this.layoutScheduler.value.options = {
					...this.layoutScheduler.value.options,
					forceRevealActiveTab: true
				};
			}
		}

		// First time layout: compute the dimensions and store it
		if (!this.dimensions.used) {
			this.dimensions.used = new Dimension(dimensions.container.width, this.computeHeight());
		}

		return this.dimensions.used;
	}

	private doLayout(dimensions: IEditorTitleControlDimensions, options?: IMultiEditorTabsControlLayoutOptions): void {

		// Layout tabs
		if (dimensions.container !== Dimension.None && dimensions.available !== Dimension.None) {
			this.doLayoutTabs(dimensions, options);
		}

		// Remember the dimensions used in the control so that we can
		// return it fast from the `layout` call without having to
		// compute it over and over again
		const oldDimension = this.dimensions.used;
		const newDimension = this.dimensions.used = new Dimension(dimensions.container.width, this.computeHeight());

		// In case the height of the title control changed from before
		// (currently only possible if wrapping changed on/off), we need
		// to signal this to the outside via a `relayout` call so that
		// e.g. the editor control can be adjusted accordingly.
		if (oldDimension && oldDimension.height !== newDimension.height) {
			this.groupView.relayout();
		}
	}

	private doLayoutTabs(dimensions: IEditorTitleControlDimensions, options?: IMultiEditorTabsControlLayoutOptions): void {

		// Always first layout tabs with wrapping support even if wrapping
		// is disabled. The result indicates if tabs wrap and if not, we
		// need to proceed with the layout without wrapping because even
		// if wrapping is enabled in settings, there are cases where
		// wrapping is disabled (e.g. due to space constraints)
		const tabsWrapMultiLine = this.doLayoutTabsWrapping(dimensions);
		if (!tabsWrapMultiLine) {
			this.doLayoutTabsNonWrapping(options);
		}
	}

	private doLayoutTabsWrapping(dimensions: IEditorTitleControlDimensions): boolean {
		const [tabsAndActionsContainer, tabsContainer, editorToolbarContainer, tabsScrollbar] = assertAllDefined(this.tabsAndActionsContainer, this.tabsContainer, this.editorActionsToolbarContainer, this.tabsScrollbar);

		// Handle wrapping tabs according to setting:
		// - enabled: only add class if tabs wrap and don't exceed available dimensions
		// - disabled: remove class and margin-right variable

		const didTabsWrapMultiLine = tabsAndActionsContainer.classList.contains('wrapping');
		let tabsWrapMultiLine = didTabsWrapMultiLine;

		function updateTabsWrapping(enabled: boolean): void {
			tabsWrapMultiLine = enabled;

			// Toggle the `wrapped` class to enable wrapping
			tabsAndActionsContainer.classList.toggle('wrapping', tabsWrapMultiLine);

			// Update `last-tab-margin-right` CSS variable to account for the absolute
			// positioned editor actions container when tabs wrap. The margin needs to
			// be the width of the editor actions container to avoid screen cheese.
			tabsContainer.style.setProperty('--last-tab-margin-right', tabsWrapMultiLine ? `${editorToolbarContainer.offsetWidth}px` : '0');

			// Remove old css classes that are not needed anymore
			for (const tab of tabsContainer.children) {
				tab.classList.remove('last-in-row');
			}
		}

		// Setting enabled: selectively enable wrapping if possible
		if (this.groupsView.partOptions.wrapTabs) {
			const visibleTabsWidth = tabsContainer.offsetWidth;
			const allTabsWidth = tabsContainer.scrollWidth;
			const lastTabFitsWrapped = () => {
				const lastTab = this.getLastTab();
				if (!lastTab) {
					return true; // no tab always fits
				}

				const lastTabOverlapWithToolbarWidth = lastTab.offsetWidth + editorToolbarContainer.offsetWidth - dimensions.available.width;
				if (lastTabOverlapWithToolbarWidth > 1) {
					// Allow for slight rounding errors related to zooming here
					// https://github.com/microsoft/vscode/issues/116385
					return false;
				}

				return true;
			};

			// If tabs wrap or should start to wrap (when width exceeds visible width)
			// we must trigger `updateWrapping` to set the `last-tab-margin-right`
			// accordingly based on the number of actions. The margin is important to
			// properly position the last tab apart from the actions
			//
			// We already check here if the last tab would fit when wrapped given the
			// editor toolbar will also show right next to it. This ensures we are not
			// enabling wrapping only to disable it again in the code below (this fixes
			// flickering issue https://github.com/microsoft/vscode/issues/115050)
			if (tabsWrapMultiLine || (allTabsWidth > visibleTabsWidth && lastTabFitsWrapped())) {
				updateTabsWrapping(true);
			}

			// Tabs wrap multiline: remove wrapping under certain size constraint conditions
			if (tabsWrapMultiLine) {
				if (
					(tabsContainer.offsetHeight > dimensions.available.height) ||							// if height exceeds available height
					(allTabsWidth === visibleTabsWidth && tabsContainer.offsetHeight === this.tabHeight) ||	// if wrapping is not needed anymore
					(!lastTabFitsWrapped())																	// if last tab does not fit anymore
				) {
					updateTabsWrapping(false);
				}
			}
		}

		// Setting disabled: remove CSS traces only if tabs did wrap
		else if (didTabsWrapMultiLine) {
			updateTabsWrapping(false);
		}

		// If we transitioned from non-wrapping to wrapping, we need
		// to update the scrollbar to have an equal `width` and
		// `scrollWidth`. Otherwise a scrollbar would appear which is
		// never desired when wrapping.
		if (tabsWrapMultiLine && !didTabsWrapMultiLine) {
			const visibleTabsWidth = tabsContainer.offsetWidth;
			tabsScrollbar.setScrollDimensions({
				width: visibleTabsWidth,
				scrollWidth: visibleTabsWidth
			});
		}

		// Update the `last-in-row` class on tabs when wrapping
		// is enabled (it doesn't do any harm otherwise). This
		// class controls additional properties of tab when it is
		// the last tab in a row
		if (tabsWrapMultiLine) {

			// Using a map here to change classes after the for loop is
			// crucial for performance because changing the class on a
			// tab can result in layouts of the rendering engine.
			const tabs = new Map<HTMLElement, boolean /* last in row */>();

			let currentTabsPosY: number | undefined = undefined;
			let lastTab: HTMLElement | undefined = undefined;
			for (const child of tabsContainer.children) {
				const tab = child as HTMLElement;
				const tabPosY = tab.offsetTop;

				// Marks a new or the first row of tabs
				if (tabPosY !== currentTabsPosY) {
					currentTabsPosY = tabPosY;
					if (lastTab) {
						tabs.set(lastTab, true); // previous tab must be last in row then
					}
				}

				// Always remember last tab and ensure the
				// last-in-row class is not present until
				// we know the tab is last
				lastTab = tab;
				tabs.set(tab, false);
			}

			// Last tab overally is always last-in-row
			if (lastTab) {
				tabs.set(lastTab, true);
			}

			for (const [tab, lastInRow] of tabs) {
				tab.classList.toggle('last-in-row', lastInRow);
			}
		}

		return tabsWrapMultiLine;
	}

	private doLayoutTabsNonWrapping(options?: IMultiEditorTabsControlLayoutOptions): void {
		const [tabsContainer, tabsScrollbar] = assertAllDefined(this.tabsContainer, this.tabsScrollbar);

		//
		// Synopsis
		// - allTabsWidth:   			sum of all tab widths
		// - stickyTabsWidth:			sum of all sticky tab widths (unless `pinnedTabSizing: normal`)
		// - visibleContainerWidth: 	size of tab container
		// - availableContainerWidth: 	size of tab container minus size of sticky tabs
		//
		// [------------------------------ All tabs width ---------------------------------------]
		// [------------------- Visible container width -------------------]
		//                         [------ Available container width ------]
		// [ Sticky A ][ Sticky B ][ Tab C ][ Tab D ][ Tab E ][ Tab F ][ Tab G ][ Tab H ][ Tab I ]
		//                 Active Tab Width [-------]
		// [------- Active Tab Pos X -------]
		// [-- Sticky Tabs Width --]
		//

		const visibleTabsWidth = tabsContainer.offsetWidth;
		const allTabsWidth = tabsContainer.scrollWidth;

		// Compute width of sticky tabs depending on pinned tab sizing
		// - compact: sticky-tabs * TAB_SIZES.compact
		// -  shrink: sticky-tabs * TAB_SIZES.shrink
		// -  normal: 0 (sticky tabs inherit look and feel from non-sticky tabs)
		let stickyTabsWidth = 0;
		if (this.tabsModel.stickyCount > 0) {
			let stickyTabWidth = 0;
			switch (this.groupsView.partOptions.pinnedTabSizing) {
				case 'compact':
					stickyTabWidth = MultiEditorTabsControl.TAB_WIDTH.compact;
					break;
				case 'shrink':
					stickyTabWidth = MultiEditorTabsControl.TAB_WIDTH.shrink;
					break;
			}

			stickyTabsWidth = this.tabsModel.stickyCount * stickyTabWidth;
		}

		const activeTabAndIndex = this.tabsModel.activeEditor ? this.getTabAndIndex(this.tabsModel.activeEditor) : undefined;
		const [activeTab, activeTabIndex] = activeTabAndIndex ?? [undefined, undefined];

		// Figure out if active tab is positioned static which has an
		// impact on whether to reveal the tab or not later
		let activeTabPositionStatic = this.groupsView.partOptions.pinnedTabSizing !== 'normal' && typeof activeTabIndex === 'number' && this.tabsModel.isSticky(activeTabIndex);

		// Special case: we have sticky tabs but the available space for showing tabs
		// is little enough that we need to disable sticky tabs sticky positioning
		// so that tabs can be scrolled at naturally.
		let availableTabsContainerWidth = visibleTabsWidth - stickyTabsWidth;
		if (this.tabsModel.stickyCount > 0 && availableTabsContainerWidth < MultiEditorTabsControl.TAB_WIDTH.fit) {
			tabsContainer.classList.add('disable-sticky-tabs');

			availableTabsContainerWidth = visibleTabsWidth;
			stickyTabsWidth = 0;
			activeTabPositionStatic = false;
		} else {
			tabsContainer.classList.remove('disable-sticky-tabs');
		}

		let activeTabPosX: number | undefined;
		let activeTabWidth: number | undefined;

		if (!this.blockRevealActiveTab && activeTab) {
			activeTabPosX = activeTab.offsetLeft;
			activeTabWidth = activeTab.offsetWidth;
		}

		// Update scrollbar
		const { width: oldVisibleTabsWidth, scrollWidth: oldAllTabsWidth } = tabsScrollbar.getScrollDimensions();
		tabsScrollbar.setScrollDimensions({
			width: visibleTabsWidth,
			scrollWidth: allTabsWidth
		});
		const dimensionsChanged = oldVisibleTabsWidth !== visibleTabsWidth || oldAllTabsWidth !== allTabsWidth;

		// Revealing the active tab is skipped under some conditions:
		if (
			this.blockRevealActiveTab ||							// explicitly disabled
			typeof activeTabPosX !== 'number' ||					// invalid dimension
			typeof activeTabWidth !== 'number' ||					// invalid dimension
			activeTabPositionStatic ||								// static tab (sticky)
			(!dimensionsChanged && !options?.forceRevealActiveTab) 	// dimensions did not change and we have low layout priority (https://github.com/microsoft/vscode/issues/133631)
		) {
			this.blockRevealActiveTab = false;
			return;
		}

		// Reveal the active one
		const tabsContainerScrollPosX = tabsScrollbar.getScrollPosition().scrollLeft;
		const activeTabFits = activeTabWidth <= availableTabsContainerWidth;
		const adjustedActiveTabPosX = activeTabPosX - stickyTabsWidth;

		//
		// Synopsis
		// - adjustedActiveTabPosX: the adjusted tabPosX takes the width of sticky tabs into account
		//   conceptually the scrolling only begins after sticky tabs so in order to reveal a tab fully
		//   the actual position needs to be adjusted for sticky tabs.
		//
		// Tab is overflowing to the right: Scroll minimally until the element is fully visible to the right
		// Note: only try to do this if we actually have enough width to give to show the tab fully!
		//
		// Example: Tab G should be made active and needs to be fully revealed as such.
		//
		// [-------------------------------- All tabs width -----------------------------------------]
		// [-------------------- Visible container width --------------------]
		//                           [----- Available container width -------]
		//     [ Sticky A ][ Sticky B ][ Tab C ][ Tab D ][ Tab E ][ Tab F ][ Tab G ][ Tab H ][ Tab I ]
		//                     Active Tab Width [-------]
		//     [------- Active Tab Pos X -------]
		//                             [-------- Adjusted Tab Pos X -------]
		//     [-- Sticky Tabs Width --]
		//
		//
		if (activeTabFits && tabsContainerScrollPosX + availableTabsContainerWidth < adjustedActiveTabPosX + activeTabWidth) {
			tabsScrollbar.setScrollPosition({
				scrollLeft: tabsContainerScrollPosX + ((adjustedActiveTabPosX + activeTabWidth) /* right corner of tab */ - (tabsContainerScrollPosX + availableTabsContainerWidth) /* right corner of view port */)
			});
		}

		//
		// Tab is overlflowing to the left or does not fit: Scroll it into view to the left
		//
		// Example: Tab C should be made active and needs to be fully revealed as such.
		//
		// [----------------------------- All tabs width ----------------------------------------]
		//     [------------------ Visible container width ------------------]
		//                           [----- Available container width -------]
		// [ Sticky A ][ Sticky B ][ Tab C ][ Tab D ][ Tab E ][ Tab F ][ Tab G ][ Tab H ][ Tab I ]
		//                 Active Tab Width [-------]
		// [------- Active Tab Pos X -------]
		//      Adjusted Tab Pos X []
		// [-- Sticky Tabs Width --]
		//
		//
		else if (tabsContainerScrollPosX > adjustedActiveTabPosX || !activeTabFits) {
			tabsScrollbar.setScrollPosition({
				scrollLeft: adjustedActiveTabPosX
			});
		}
	}

	private updateTabsControlVisibility(): void {
		const tabsAndActionsContainer = assertIsDefined(this.tabsAndActionsContainer);
		tabsAndActionsContainer.classList.toggle('empty', !this.visible);

		// Reset dimensions if hidden
		if (!this.visible && this.dimensions) {
			this.dimensions.used = undefined;
		}
	}

	private get visible(): boolean {
		return this.tabsModel.count > 0;
	}

	private getTabAndIndex(editor: EditorInput): [HTMLElement, number /* index */] | undefined {
		const tabIndex = this.tabsModel.indexOf(editor);
		const tab = this.getTabAtIndex(tabIndex);
		if (tab) {
			return [tab, tabIndex];
		}

		return undefined;
	}

	private getTabAtIndex(tabIndex: number): HTMLElement | undefined {
		if (tabIndex >= 0) {
			const tabsContainer = assertIsDefined(this.tabsContainer);

			return tabsContainer.children[tabIndex] as HTMLElement | undefined;
		}

		return undefined;
	}

	private getLastTab(): HTMLElement | undefined {
		return this.getTabAtIndex(this.tabsModel.count - 1);
	}

	private blockRevealActiveTabOnce(): void {

		// When closing tabs through the tab close button or gesture, the user
		// might want to rapidly close tabs in sequence and as such revealing
		// the active tab after each close would be annoying. As such we block
		// the automated revealing of the active tab once after the close is
		// triggered.
		this.blockRevealActiveTab = true;
	}

	private originatesFromTabActionBar(e: MouseEvent | GestureEvent): boolean {
		let element: HTMLElement;
		if (isMouseEvent(e)) {
			element = (e.target || e.srcElement) as HTMLElement;
		} else {
			element = (e as GestureEvent).initialTarget as HTMLElement;
		}

		return !!findParentWithClass(element, 'action-item', 'tab');
	}

	private async onDrop(e: DragEvent, targetTabIndex: number, tabsContainer: HTMLElement): Promise<void> {
		EventHelper.stop(e, true);

		this.updateDropFeedback(tabsContainer, false, e, targetTabIndex);
		tabsContainer.classList.remove('scroll');

		let targetEditorIndex = this.tabsModel instanceof UnstickyEditorGroupModel ? targetTabIndex + this.groupView.stickyCount : targetTabIndex;
		const options: IEditorOptions = {
			sticky: this.tabsModel instanceof StickyEditorGroupModel && this.tabsModel.stickyCount === targetEditorIndex,
			index: targetEditorIndex
		};

		// Check for group transfer
		if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
			const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				const sourceGroup = this.editorPartsView.getGroup(data[0].identifier);
				if (sourceGroup) {
					const mergeGroupOptions: IMergeGroupOptions = { index: targetEditorIndex };
					if (!this.isMoveOperation(e, sourceGroup.id)) {
						mergeGroupOptions.mode = MergeGroupMode.COPY_EDITORS;
					}

					this.groupsView.mergeGroup(sourceGroup, this.groupView, mergeGroupOptions);
				}

				this.groupView.focus();
				this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
			}
		}

		// Check for editor transfer
		else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				const sourceGroup = this.editorPartsView.getGroup(data[0].identifier.groupId);
				if (sourceGroup) {
					for (const de of data) {
						const editor = de.identifier.editor;

						// Only allow moving/copying from a single group source
						if (sourceGroup.id !== de.identifier.groupId) {
							continue;
						}

						// Keep the same order when moving / copying editors within the same group
						const sourceEditorIndex = sourceGroup.getIndexOfEditor(editor);
						if (sourceGroup === this.groupView && sourceEditorIndex < targetEditorIndex) {
							targetEditorIndex--;
						}

						if (this.isMoveOperation(e, de.identifier.groupId, editor)) {
							sourceGroup.moveEditor(editor, this.groupView, { ...options, index: targetEditorIndex });
						} else {
							sourceGroup.copyEditor(editor, this.groupView, { ...options, index: targetEditorIndex });
						}

						targetEditorIndex++;
					}
				}
			}

			this.groupView.focus();
			this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
		}

		// Check for tree items
		else if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
			const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				const editors: IUntypedEditorInput[] = [];
				for (const id of data) {
					const dataTransferItem = await this.treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
					if (dataTransferItem) {
						const treeDropData = await extractTreeDropData(dataTransferItem);
						editors.push(...treeDropData.map(editor => ({ ...editor, options: { ...editor.options, pinned: true, index: targetEditorIndex } })));
					}
				}

				this.editorService.openEditors(editors, this.groupView, { validateTrust: true });
			}

			this.treeItemsTransfer.clearData(DraggedTreeItemsIdentifier.prototype);
		}

		// Check for URI transfer
		else {
			const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
			dropHandler.handleDrop(e, getWindow(this.parent), () => this.groupView, () => this.groupView.focus(), options);
		}
	}

	override dispose(): void {
		super.dispose();

		this.tabDisposables = dispose(this.tabDisposables);
	}
}

registerThemingParticipant((theme, collector) => {

	// Add bottom border to tabs when wrapping
	const borderColor = theme.getColor(TAB_BORDER);
	if (borderColor) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title > .tabs-and-actions-container.wrapping .tabs-container > .tab {
				border-bottom: 1px solid ${borderColor};
			}
		`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const activeContrastBorderColor = theme.getColor(activeContrastBorder);
	if (activeContrastBorderColor) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active,
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active:hover  {
				outline: 1px solid;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.selected:not(.active):not(:hover)  {
				outline: 1px dotted;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active:focus {
				outline-style: dashed;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active {
				outline: 1px dotted;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover  {
				outline: 1px dashed;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active:hover > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.dirty > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.sticky > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover > .tab-actions .action-label {
				opacity: 1 !important;
			}
		`);
	}

	// High Contrast Border Color for Editor Actions
	const contrastBorderColor = theme.getColor(contrastBorder);
	if (contrastBorderColor) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .editor-actions {
				outline: 1px solid ${contrastBorderColor}
			}
		`);
	}

	// Hover Background
	const tabHoverBackground = theme.getColor(TAB_HOVER_BACKGROUND);
	if (tabHoverBackground) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:not(.selected):hover {
				background-color: ${tabHoverBackground} !important;
			}
		`);
	}

	const tabUnfocusedHoverBackground = theme.getColor(TAB_UNFOCUSED_HOVER_BACKGROUND);
	if (tabUnfocusedHoverBackground) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:not(.selected):hover  {
				background-color: ${tabUnfocusedHoverBackground} !important;
			}
		`);
	}

	// Hover Foreground
	const tabHoverForeground = theme.getColor(TAB_HOVER_FOREGROUND);
	if (tabHoverForeground) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:not(.selected):hover  {
				color: ${tabHoverForeground} !important;
			}
		`);
	}

	const tabUnfocusedHoverForeground = theme.getColor(TAB_UNFOCUSED_HOVER_FOREGROUND);
	if (tabUnfocusedHoverForeground) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:not(.selected):hover  {
				color: ${tabUnfocusedHoverForeground} !important;
			}
		`);
	}

	// Hover Border
	//
	// Unfortunately we need to copy a lot of CSS over from the
	// multiEditorTabsControl.css because we want to reuse the same
	// styles we already have for the normal bottom-border.
	const tabHoverBorder = theme.getColor(TAB_HOVER_BORDER);
	if (tabHoverBorder) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:hover > .tab-border-bottom-container {
				display: block;
				position: absolute;
				left: 0;
				pointer-events: none;
				width: 100%;
				z-index: 10;
				bottom: 0;
				height: 1px;
				background-color: ${tabHoverBorder};
			}
		`);
	}

	const tabUnfocusedHoverBorder = theme.getColor(TAB_UNFOCUSED_HOVER_BORDER);
	if (tabUnfocusedHoverBorder) {
		collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover > .tab-border-bottom-container  {
				display: block;
				position: absolute;
				left: 0;
				pointer-events: none;
				width: 100%;
				z-index: 10;
				bottom: 0;
				height: 1px;
				background-color: ${tabUnfocusedHoverBorder};
			}
		`);
	}

	// Fade out styles via linear gradient (when tabs are set to shrink or fixed)
	// But not when:
	// - in high contrast theme
	// - if we have a contrast border (which draws an outline - https://github.com/microsoft/vscode/issues/109117)
	// - on Safari (https://github.com/microsoft/vscode/issues/108996)
	if (!isHighContrast(theme.type) && !isSafari && !activeContrastBorderColor) {
		const workbenchBackground = WORKBENCH_BACKGROUND(theme);
		const editorBackgroundColor = theme.getColor(editorBackground);
		const editorGroupHeaderTabsBackground = theme.getColor(EDITOR_GROUP_HEADER_TABS_BACKGROUND);
		const editorDragAndDropBackground = theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND);

		let adjustedTabBackground: Color | undefined;
		if (editorGroupHeaderTabsBackground && editorBackgroundColor) {
			adjustedTabBackground = editorGroupHeaderTabsBackground.flatten(editorBackgroundColor, editorBackgroundColor, workbenchBackground);
		}

		let adjustedTabDragBackground: Color | undefined;
		if (editorGroupHeaderTabsBackground && editorBackgroundColor && editorDragAndDropBackground && editorBackgroundColor) {
			adjustedTabDragBackground = editorGroupHeaderTabsBackground.flatten(editorBackgroundColor, editorDragAndDropBackground, editorBackgroundColor, workbenchBackground);
		}

		// Adjust gradient for focused and unfocused hover background
		const makeTabHoverBackgroundRule = (color: Color, colorDrag: Color, hasFocus = false) => `
			.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${hasFocus ? '.active' : ''} > .title .tabs-container > .tab.sizing-shrink:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after,
			.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${hasFocus ? '.active' : ''} > .title .tabs-container > .tab.sizing-fixed:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after {
				background: linear-gradient(to left, ${color}, transparent) !important;
			}

			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${hasFocus ? '.active' : ''} > .title .tabs-container > .tab.sizing-shrink:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after,
			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${hasFocus ? '.active' : ''} > .title .tabs-container > .tab.sizing-fixed:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after {
				background: linear-gradient(to left, ${colorDrag}, transparent) !important;
			}
		`;

		// Adjust gradient for (focused) hover background
		if (tabHoverBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabHoverBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabHoverBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabHoverBackgroundRule(adjustedColor, adjustedColorDrag, true));
		}

		// Adjust gradient for unfocused hover background
		if (tabUnfocusedHoverBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabUnfocusedHoverBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabUnfocusedHoverBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabHoverBackgroundRule(adjustedColor, adjustedColorDrag));
		}

		// Adjust gradient for drag and drop background
		if (editorDragAndDropBackground && adjustedTabDragBackground) {
			const adjustedColorDrag = editorDragAndDropBackground.flatten(adjustedTabDragBackground);
			collector.addRule(`
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container.active > .title .tabs-container > .tab.sizing-shrink.dragged-over:not(.active):not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container:not(.active) > .title .tabs-container > .tab.sizing-shrink.dragged-over:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container.active > .title .tabs-container > .tab.sizing-fixed.dragged-over:not(.active):not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container:not(.active) > .title .tabs-container > .tab.sizing-fixed.dragged-over:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${adjustedColorDrag}, transparent) !important;
				}
		`);
		}

		const makeTabBackgroundRule = (color: Color, colorDrag: Color, focused: boolean, active: boolean) => `
				.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${focused ? '.active' : ':not(.active)'} > .title .tabs-container > .tab.sizing-shrink${active ? '.active' : ''}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${focused ? '.active' : ':not(.active)'} > .title .tabs-container > .tab.sizing-fixed${active ? '.active' : ''}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${color}, transparent);
				}

				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${focused ? '.active' : ':not(.active)'} > .title .tabs-container > .tab.sizing-shrink${active ? '.active' : ''}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${focused ? '.active' : ':not(.active)'} > .title .tabs-container > .tab.sizing-fixed${active ? '.active' : ''}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${colorDrag}, transparent);
				}
		`;

		// Adjust gradient for focused active tab background
		const tabActiveBackground = theme.getColor(TAB_ACTIVE_BACKGROUND);
		if (tabActiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabActiveBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabActiveBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, true, true));
		}

		// Adjust gradient for unfocused active tab background
		const tabUnfocusedActiveBackground = theme.getColor(TAB_UNFOCUSED_ACTIVE_BACKGROUND);
		if (tabUnfocusedActiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabUnfocusedActiveBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabUnfocusedActiveBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, false, true));
		}

		// Adjust gradient for focused inactive tab background
		const tabInactiveBackground = theme.getColor(TAB_INACTIVE_BACKGROUND);
		if (tabInactiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabInactiveBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabInactiveBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, true, false));
		}

		// Adjust gradient for unfocused inactive tab background
		const tabUnfocusedInactiveBackground = theme.getColor(TAB_UNFOCUSED_INACTIVE_BACKGROUND);
		if (tabUnfocusedInactiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
			const adjustedColor = tabUnfocusedInactiveBackground.flatten(adjustedTabBackground);
			const adjustedColorDrag = tabUnfocusedInactiveBackground.flatten(adjustedTabDragBackground);
			collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, false, false));
		}
	}
});
