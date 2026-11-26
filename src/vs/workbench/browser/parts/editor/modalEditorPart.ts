/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modalEditorPart.css';
import { $, addDisposableListener, append, clearNode, Dimension, EventHelper, EventType, getWindow, hide, IDimension, isHTMLElement, setVisibility, show } from '../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../base/browser/globalPointerMoveMonitor.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionBar, prepareActions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Orientation, Sash, SashState } from '../../../../base/browser/ui/sash/sash.js';
import { equals } from '../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroupView, IEditorPartsView } from './editor.js';
import { EditorPart } from './editorPart.js';
import { IModalEditorPart, GroupActivationReason } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService, USE_MODAL_EDITOR_SETTING, UseModalEditorMode } from '../../../services/editor/common/editorService.js';
import { EditorPartModalCanMaximizeContext, EditorPartModalCanMoveToEditorAreaContext, EditorPartModalContext, EditorPartModalMaximizedContext, EditorPartModalNavigationContext, EditorPartModalSidebarContext, EditorPartModalSidebarVisibleContext } from '../../../common/contextkeys.js';
import { EditorResourceAccessor, IEditorCommandsContext, SideBySideEditor, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ResourceLabel } from '../../labels.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CLOSE_MODAL_EDITOR_COMMAND_ID, MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID, MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID, NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID, NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID, TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID, TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID } from './editorCommands.js';
import { canMoveModalEditorToEditorArea, IModalEditorNavigation, IModalEditorPartOptions, IModalEditorSidebar, isModalEditorOptionsProvider, resolveModalEditorOptions } from '../../../../platform/editor/common/editor.js';

const MODAL_MIN_WIDTH = 400;
const MODAL_MIN_HEIGHT = 300;
const MODAL_MAX_DEFAULT_WIDTH = 1400;
const MODAL_MAX_DEFAULT_HEIGHT = 900;
const MODAL_BORDER_WIDTH = 1; // 1px border on each side
const MODAL_BORDER_SIZE = MODAL_BORDER_WIDTH * 2;
const MODAL_HEADER_HEIGHT = 33; // Fallback only — actual height is measured from the rendered header element to account for the compact-header variant.
const MODAL_SNAP_THRESHOLD = 20;
const MODAL_MAXIMIZED_PADDING = 16;
const MODAL_SIDEBAR_MIN_WIDTH = 160;
const MODAL_SIDEBAR_DEFAULT_WIDTH = 260;
const MODAL_SIDEBAR_PADDING = 8; // matches CSS padding on sidebar container
const MODAL_SIDEBAR_BORDER_RIGHT = 1; // matches CSS border-right on sidebar container
const MODAL_FOCUSABLE_SELECTOR = 'a[href], area[href], button, input, select, textarea, iframe, object, embed, [contenteditable="true"], [tabindex]';

function getModalTabbableElements(modalElement: HTMLElement): HTMLElement[] {
	// eslint-disable-next-line eslint-js/no-restricted-syntax
	const elements = Array.from(modalElement.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR))
		.filter(element => {
			if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[inert]')) {
				return false;
			}

			for (let current: HTMLElement | null = element; current && current !== modalElement; current = current.parentElement) {
				const style = getWindow(current).getComputedStyle(current);
				if (current.hidden || current.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') {
					return false;
				}
			}

			return true;
		})
		.map((element, index) => ({ element, index }));

	elements.sort((first, second) => {
		const firstTabIndex = first.element.tabIndex;
		const secondTabIndex = second.element.tabIndex;
		if (firstTabIndex > 0 && secondTabIndex > 0) {
			return firstTabIndex - secondTabIndex || first.index - second.index;
		}
		if (firstTabIndex > 0) {
			return -1;
		}
		if (secondTabIndex > 0) {
			return 1;
		}
		return first.index - second.index;
	});

	return elements.map(({ element }) => element);
}

const defaultModalEditorAllowableCommands = new Set([

	// Application
	'workbench.action.quit',
	'workbench.action.reloadWindow',
	'workbench.action.toggleFullScreen',

	// Quick access
	'workbench.action.gotoSymbol',
	'workbench.action.gotoLine',

	// Zoom
	'workbench.action.zoomIn',
	'workbench.action.zoomOut',
	'workbench.action.zoomReset',

	// File operations
	'workbench.action.files.save',
	'workbench.action.files.saveAll',
	'workbench.action.files.revert',

	// Close editors
	'workbench.action.closeActiveEditor',
	'workbench.action.closeAllEditors',
	'workbench.action.closeEditorsInGroup',
	'workbench.action.closeUnmodifiedEditors',

	// Settings
	'workbench.action.openSettings',
	'workbench.action.openSettings2',
	'workbench.action.openSettingsJson',
	'workbench.action.openGlobalSettings',
	'workbench.action.openApplicationSettingsJson',
	'workbench.action.openRawDefaultSettings',
	'workbench.action.openWorkspaceSettings',
	'workbench.action.openWorkspaceSettingsFile',
	'workbench.action.openFolderSettings',
	'workbench.action.openFolderSettingsFile',
	'workbench.action.openRemoteSettings',
	'workbench.action.openRemoteSettingsFile',
	'workbench.action.openAccessibilitySettings',
	'workbench.action.configureLanguageBasedSettings',

	// Keybindings
	'workbench.action.openGlobalKeybindings',
	'workbench.action.openDefaultKeybindingsFile',
	'workbench.action.openGlobalKeybindingsFile',
	'workbench.action.openKeyboardLayoutPicker',

	// Modal editor
	CLOSE_MODAL_EDITOR_COMMAND_ID,
	MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
	MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
	TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
	NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
	NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
	TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID,
]);

export interface ICreateModalEditorPartResult {
	readonly part: ModalEditorPartImpl;
	readonly instantiationService: IInstantiationService;
	readonly disposables: DisposableStore;
}

interface IModalEditorSidebarController {

	readonly onDidResize: Event<void>;

	getWidth(): number;
	hasCustomWidth(): boolean;
	clampWidth(modalWidth: number): void;

	isVisible(): boolean;
	setVisible(visible: boolean): void;

	layout(height: number): void;
	updateContent(content: IModalEditorSidebar): void;
}

export class ModalEditorPart {

	constructor(
		private readonly editorPartsView: IEditorPartsView,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IHostService private readonly hostService: IHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
	}

	async create(options?: IModalEditorPartOptions): Promise<ICreateModalEditorPartResult> {
		const disposables = new DisposableStore();

		// Modal container
		const modalElement = $('.monaco-modal-editor-block');
		this.layoutService.mainContainer.appendChild(modalElement);
		disposables.add(toDisposable(() => modalElement.remove()));

		// Context key service scoped to the entire modal element so that the
		// modal-level context keys (e.g. `editorPartModal`) are active when focus
		// is anywhere inside the modal. Both the editor part and the sidebar
		// content are wired up to descend from this service so that commands like
		// closing the modal on `Escape` work regardless of which area has focus
		// (e.g. the sidebar changes tree).
		const modalContextKeyService = disposables.add(this.contextKeyService.createScoped(modalElement));
		const canMoveToEditorAreaContext = EditorPartModalCanMoveToEditorAreaContext.bindTo(modalContextKeyService);
		const canMaximizeContext = EditorPartModalCanMaximizeContext.bindTo(modalContextKeyService);

		disposables.add(addDisposableListener(modalElement, EventType.MOUSE_DOWN, e => {
			if (e.target === modalElement) {
				EventHelper.stop(e, true);

				// Close modal when clicking outside the dialog
				void editorPart.close();
			}
		}));

		let useModalMode = this.configurationService.getValue<UseModalEditorMode>(USE_MODAL_EDITOR_SETTING);
		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(USE_MODAL_EDITOR_SETTING)) {
				useModalMode = this.configurationService.getValue<UseModalEditorMode>(USE_MODAL_EDITOR_SETTING);
			}
		}));

		disposables.add(addDisposableListener(modalElement, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);

			// Prevent unsupported commands unless all editors open in modal
			if (useModalMode !== 'all') {
				const resolved = this.keybindingService.softDispatch(event, this.layoutService.mainContainer);
				if (resolved.kind === ResultKind.KbFound && resolved.commandId) {
					if (
						resolved.commandId.startsWith('workbench.') &&
						!defaultModalEditorAllowableCommands.has(resolved.commandId)
					) {
						EventHelper.stop(event, true);
					}
				}
			}
		}));

		// Resizable wrapper
		const resizableElement = new ResizableHTMLElement();
		disposables.add(toDisposable(() => resizableElement.dispose()));
		resizableElement.domNode.classList.add('modal-editor-resizable');
		const effectiveMinWidth = MODAL_MIN_WIDTH + (options?.sidebar ? MODAL_SIDEBAR_MIN_WIDTH : 0);
		resizableElement.minSize = new Dimension(effectiveMinWidth, MODAL_MIN_HEIGHT);
		modalElement.appendChild(resizableElement.domNode);

		const shadowElement = resizableElement.domNode.appendChild($('.modal-editor-shadow'));

		// Editor part container
		const titleId = 'modal-editor-title';
		const editorPartContainer = $('.part.editor.modal-editor-part', {
			role: 'dialog',
			'aria-modal': 'true',
			'aria-labelledby': titleId,
		});
		shadowElement.appendChild(editorPartContainer);

		// Header
		const headerElement = editorPartContainer.appendChild($('.modal-editor-header'));

		// Sidebar toggle button (only when sidebar is configured)
		const sidebarToggleContainer = append(headerElement, $('div.modal-editor-sidebar-toggle'));
		if (!options?.sidebar) {
			hide(sidebarToggleContainer);
		}
		const sidebarToggleIcon = options?.sidebar?.sidebarHidden ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft;
		const sidebarToggleAction = disposables.add(new Action(TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID, localize('toggleSidebar', "Toggle Sidebar"), ThemeIcon.asClassName(sidebarToggleIcon), true));
		const sidebarToggleActionBar = disposables.add(new ActionBar(sidebarToggleContainer));
		sidebarToggleActionBar.push(sidebarToggleAction, { icon: true, label: false });

		// Title element
		const titleElement = append(headerElement, $('div.modal-editor-title.show-file-icons'));
		titleElement.id = titleId;
		titleElement.textContent = '';

		// Editor tabs, shown in place of the title when an editor asks for them.
		// They take the look of the tabs of an editor group from the classes
		// the two share.
		const editorTabsContainer = append(headerElement, $('div.modal-editor-tabs.modern-ui-editor-tab-group.modern-ui-editor-tab-group-active'));
		hide(editorTabsContainer);
		const editorTabsList = append(editorTabsContainer, $('div.modal-editor-tab-list.modern-ui-editor-tab-strip.modern-ui-editor-tab-list.show-file-icons', {
			role: 'tablist',
			'aria-label': localize('modalEditorTabs', "Editors"),
		}));
		// The gestures of the header, such as moving the modal, are not for its tabs
		for (const eventType of [EventType.POINTER_DOWN, EventType.CLICK, EventType.DBLCLICK, EventType.CONTEXT_MENU]) {
			disposables.add(addDisposableListener(editorTabsContainer, eventType, e => e.stopPropagation()));
		}

		// Navigation widget
		const navigationContainer = append(headerElement, $('div.modal-editor-navigation'));
		hide(navigationContainer);
		disposables.add(addDisposableListener(navigationContainer, EventType.DBLCLICK, e => EventHelper.stop(e, true)));

		const previousButton = disposables.add(new Button(navigationContainer, { title: localize('previousItem', "Previous") }));
		previousButton.icon = Codicon.chevronLeft;
		previousButton.element.classList.add('modal-editor-nav-button');
		disposables.add(previousButton.onDidClick(() => {
			const navigation = editorPart.navigation;
			if (navigation && navigation.current > 0) {
				navigation.navigate(navigation.current - 1);
			}
		}));

		const navigationLabel = append(navigationContainer, $('span.modal-editor-nav-label'));
		navigationLabel.setAttribute('aria-live', 'polite');

		const nextButton = disposables.add(new Button(navigationContainer, { title: localize('nextItem', "Next") }));
		nextButton.icon = Codicon.chevronRight;
		nextButton.element.classList.add('modal-editor-nav-button');
		disposables.add(nextButton.onDidClick(() => {
			const navigation = editorPart.navigation;
			if (navigation && navigation.current < navigation.total - 1) {
				navigation.navigate(navigation.current + 1);
			}
		}));

		// Toolbar
		const actionBarContainer = append(headerElement, $('div.modal-editor-action-container'));

		// Sidebar
		// In a modal that fits its content the sidebar can take the width of the window that the content leaves
		const getFittedSidebarMaxWidth = () => {
			const contentSize = editorPart.contentSize;

			return contentSize ? Math.max(MODAL_SIDEBAR_MIN_WIDTH, this.layoutService.mainContainerDimension.width - contentSize.width - MODAL_BORDER_SIZE) : undefined;
		};
		let isFirstLayout = true;
		let isLayingOutModal = false;
		const sidebarResult = this.createSidebar(editorPartContainer, headerElement, options?.sidebar, modalContextKeyService, getFittedSidebarMaxWidth, disposables);
		if (sidebarResult) {
			if (sidebarResult.isVisible()) {
				editorPartContainer.classList.add('has-sidebar');
			}
			disposables.add(sidebarResult.onDidResize(() => {
				if (!isLayingOutModal) {
					layoutModal(); // the modal lays itself out with the sidebar width it clamps while laying out
				}
			}));
		}

		// Create the editor part (scoped to the modal context key service so that
		// the editor area also descends from it)
		const modalInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, modalContextKeyService]
		)));
		const editorPart = disposables.add(modalInstantiationService.createInstance(
			ModalEditorPartImpl,
			mainWindow.vscodeWindowId,
			this.editorPartsView,
			modalElement,
			options,
			() => toolbar.focus(),
		));
		disposables.add(this.editorPartsView.registerPart(editorPart));
		editorPart.create(editorPartContainer);

		disposables.add(Event.once(editorPart.onWillClose)(() => disposables.dispose()));
		disposables.add(addDisposableListener(modalElement, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			const isForwardTab = event.equals(KeyCode.Tab);
			const isBackwardTab = event.equals(KeyMod.Shift | KeyCode.Tab);
			if (!isForwardTab && !isBackwardTab) {
				return;
			}
			if (this.keybindingService.softDispatch(event, event.target).kind !== ResultKind.NoMatchingKb) {
				return;
			}

			const tabbableElements = getModalTabbableElements(modalElement);
			const target = isBackwardTab ? tabbableElements.at(-1) : tabbableElements[0];
			const boundary = isBackwardTab ? tabbableElements[0] : tabbableElements.at(-1);
			if (!target || mainWindow.document.activeElement !== boundary) {
				return;
			}

			EventHelper.stop(event, true);
			target.focus();
		}, true));
		const pendingBubbleCloseEvents = new WeakSet<KeyboardEvent>();
		disposables.add(addDisposableListener(mainWindow, EventType.KEY_DOWN, e => pendingBubbleCloseEvents.delete(e)));
		// Capture close keybindings before focused controls can stop propagation.
		disposables.add(addDisposableListener(modalElement, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			const resolved = this.keybindingService.softDispatch(event, event.target);
			if (resolved.kind === ResultKind.KbFound && resolved.commandId === CLOSE_MODAL_EDITOR_COMMAND_ID) {
				if (resolved.isBubble) {
					pendingBubbleCloseEvents.add(e);
					// Dispatch after target delivery only when propagation did not reach the window.
					queueMicrotask(() => {
						if (pendingBubbleCloseEvents.delete(e)) {
							this.keybindingService.dispatchEvent(event, event.target);
						}
					});
					return;
				}
				const shouldPreventDefault = this.keybindingService.dispatchEvent(event, event.target);
				event.stopPropagation();
				if (shouldPreventDefault) {
					event.preventDefault();
				}
			}
		}, true));
		disposables.add(Event.runAndSubscribe(editorPart.onDidChangeNavigation, ((navigation: IModalEditorNavigation | undefined) => {
			if (navigation && navigation.total > 1) {
				show(navigationContainer);
				navigationLabel.textContent = localize('navigationCounter', "{0} of {1}", navigation.current + 1, navigation.total);
				previousButton.enabled = navigation.current > 0;
				nextButton.enabled = navigation.current < navigation.total - 1;
			} else {
				hide(navigationContainer);
			}
		}), editorPart.navigation));
		if (sidebarResult) {
			disposables.add(Event.runAndSubscribe(sidebarResult.onDidResize, () => {
				if (sidebarResult.isVisible()) {
					editorPart.sidebarWidth = sidebarResult.hasCustomWidth() ? sidebarResult.getWidth() : undefined;
				}
			}));
			disposables.add(editorPart.onDidToggleSidebar(() => {
				sidebarResult.setVisible(!editorPart.sidebarHidden);
				sidebarToggleAction.class = ThemeIcon.asClassName(editorPart.sidebarHidden ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft);
				layoutModal();
			}));
		}

		// Wire up sidebar toggle button
		disposables.add(sidebarToggleActionBar.onDidRun(() => editorPart.toggleSidebar()));

		// Create scoped instantiation service
		const modalEditorService = this.editorService.createScoped(editorPart, disposables);
		const scopedInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection(
			[IEditorService, modalEditorService]
		)));

		// Create editor toolbar
		const editorActionsToolbarContainer = append(actionBarContainer, $('div.modal-editor-editor-actions'));
		const editorActionsToolbar = disposables.add(scopedInstantiationService.createInstance(WorkbenchToolBar, editorActionsToolbarContainer, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			highlightToggledItems: true,
		}));

		const editorActionsSeparator = append(actionBarContainer, $('div.modal-editor-action-separator'));
		const editorActionsDisposables = disposables.add(new DisposableStore());
		const updateEditorActions = () => {
			editorActionsDisposables.clear();

			const editorActions = editorPart.activeGroup.createEditorActions(editorActionsDisposables, MenuId.ModalEditorEditorTitle);
			editorActionsDisposables.add(editorActions.onDidChange(() => updateEditorActions()));

			const { primary, secondary } = editorActions.actions;
			editorActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));

			const hasActions = primary.length > 0 || secondary.length > 0;
			setVisibility(hasActions, editorActionsSeparator);
		};
		disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => updateEditorActions()));
		disposables.add(modalEditorService.onDidEditorsChange(() => editorPart.enforceModalPartOptions()));

		// Create global toolbar
		const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ModalEditorTitle, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			highlightToggledItems: true,
			menuOptions: { shouldForwardArgs: true }
		}));

		// Create label
		const label = disposables.add(scopedInstantiationService.createInstance(ResourceLabel, titleElement, {}));
		const labelChangeDisposable = disposables.add(new MutableDisposable());
		let trackedEditor: EditorInput | undefined;
		const updateLabel = () => {
			const activeEditor = editorPart.activeGroup.activeEditor;
			if (activeEditor) {
				const { labelFormat } = editorPart.partOptions;

				label.element.setResource(
					{
						resource: EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.BOTH }),
						name: activeEditor.getName(),
						description: activeEditor.getDescription(labelFormat === 'short' ? Verbosity.SHORT : labelFormat === 'long' ? Verbosity.LONG : Verbosity.MEDIUM) || ''
					},
					{
						title: activeEditor.getTitle(Verbosity.LONG),
						icon: activeEditor.getIcon(),
						extraClasses: activeEditor.getLabelExtraClasses(),
					}
				);

				// Only (re)subscribe when the active editor changes, not on every label update
				if (trackedEditor !== activeEditor) {
					trackedEditor = activeEditor;
					labelChangeDisposable.value = activeEditor.onDidChangeLabel(() => updateLabel());
				}
			} else {
				label.element.clear();
				trackedEditor = undefined;
				labelChangeDisposable.clear();
			}
		};
		disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, updateLabel));

		// Create editor tabs. One editor asking for them lists every editor of the
		// group, so that none is left without a way to reach it.
		const editorTabs = new Map<EditorInput, { readonly element: HTMLElement; readonly label: ResourceLabel }>();
		const editorTabDisposables = disposables.add(new DisposableStore());
		const createEditorTab = (editor: EditorInput) => {
			const element = append(editorTabsList, $('div.modal-editor-tab.modern-ui-editor-tab', { role: 'tab' }));
			append(element, $('div.modern-ui-editor-tab-fill', { 'aria-hidden': 'true' }));
			append(element, $('div.tab-connected-edge', { 'aria-hidden': 'true' }));
			const label = editorTabDisposables.add(scopedInstantiationService.createInstance(ResourceLabel, append(element, $('div.modal-editor-tab-label.modern-ui-editor-tab-label')), {}));

			editorTabDisposables.add(addDisposableListener(element, EventType.CLICK, () => editorPart.activeGroup.openEditor(editor)));

			// Keyboard, as for the tabs of an editor group: Enter and Space show
			// the editor, the arrow keys move to its neighbours and keep the focus
			editorTabDisposables.add(addDisposableListener(element, EventType.KEY_UP, async e => {
				const event = new StandardKeyboardEvent(e);
				const group = editorPart.activeGroup;
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					EventHelper.stop(e, true);
					await group.openEditor(editor);
					return;
				}

				const index = group.getIndexOfEditor(editor);
				let target: EditorInput | undefined;
				if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow)) {
					target = group.getEditorByIndex(index - 1);
				} else if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow)) {
					target = group.getEditorByIndex(index + 1);
				} else if (event.equals(KeyCode.Home)) {
					target = group.getEditorByIndex(0);
				} else if (event.equals(KeyCode.End)) {
					target = group.getEditorByIndex(group.count - 1);
				}
				if (target) {
					EventHelper.stop(e, true);
					await group.openEditor(target, { preserveFocus: true });
					editorTabs.get(target)?.element.focus();
				}
			}));

			return { element, label };
		};
		const updateEditorTabs = () => {
			const group = editorPart.activeGroup;
			const showEditorTabs = editorPart.partOptions.showTabs === 'none' && group.count > 1
				&& group.editors.some(editor => resolveModalEditorOptions(editor)?.showEditorsInHeader);
			const editors = showEditorTabs ? group.editors : [];

			// Keep the tabs of unchanged editors, and with them the keyboard focus
			if (!equals(editors, [...editorTabs.keys()])) {
				editorTabDisposables.clear();
				editorTabs.clear();
				clearNode(editorTabsList);
				for (const editor of editors) {
					editorTabs.set(editor, createEditorTab(editor));
				}
			}

			for (const [editor, tab] of editorTabs) {
				const active = group.isActive(editor);
				tab.label.element.setResource(
					{
						resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }),
						name: editor.getName()
					},
					{
						title: editor.getTitle(Verbosity.LONG),
						icon: editor.getIcon(),
						extraClasses: editor.getLabelExtraClasses(),
					}
				);
				tab.element.classList.toggle('active', active);
				tab.element.setAttribute('aria-selected', String(active));
				tab.element.tabIndex = active ? 0 : -1; // Only the active tab can be focused into
			}

			headerElement.classList.toggle('has-editor-tabs', showEditorTabs);
			setVisibility(showEditorTabs, editorTabsContainer);
		};
		disposables.add(Event.runAndSubscribe(Event.any<unknown>(modalEditorService.onDidActiveEditorChange, modalEditorService.onDidEditorsChange, editorPart.onDidChangeEditorPartOptions), () => updateEditorTabs()));

		// Handle double-click on header to toggle maximize
		disposables.add(addDisposableListener(headerElement, EventType.DBLCLICK, e => {
			EventHelper.stop(e);

			editorPart.handleHeaderDoubleClick();
		}));

		// Handle right-click on header to open context menu. The context menu
		// also surfaces the editor actions of the active editor group, mirroring
		// how the workbench titlebar exposes them when
		// `workbench.editor.editorActionsLocation` is set to `titleBar`. The
		// active editor pane's `scopedContextKeyService` is used so the actions'
		// `when`/`precondition` and keybinding labels are evaluated in the correct
		// scope.
		disposables.add(addDisposableListener(headerElement, EventType.CONTEXT_MENU, e => {
			const target = e.target;
			if (isHTMLElement(target) && (target.closest('.monaco-button') || target.closest('.action-item'))) {
				return; // do not show our context menu over header buttons / actions
			}

			EventHelper.stop(e, true);

			const contextMenuDisposables = new DisposableStore();
			const activeGroup = editorPart.activeGroup;
			const activeEditor = activeGroup.activeEditor;
			const editorScopedContextKeyService = activeGroup.activeEditorPane?.scopedContextKeyService ?? activeGroup.scopedContextKeyService;
			const editorActions = activeGroup.createEditorActions(contextMenuDisposables, MenuId.EditorTitle);
			const { primary, secondary } = editorActions.actions;

			this.contextMenuService.showContextMenu({
				menuId: MenuId.ModalEditorTitleContext,
				contextKeyService: editorScopedContextKeyService,
				getAnchor: () => ({ x: e.clientX, y: e.clientY }),
				getActions: () => Separator.join(primary, secondary),
				getActionsContext: () => ({ groupId: activeGroup.id, editorIndex: activeEditor ? activeGroup.getIndexOfEditor(activeEditor) : undefined } satisfies IEditorCommandsContext),
				getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id, editorScopedContextKeyService),
				onHide: () => contextMenuDisposables.dispose(),
			});
		}));

		const layout = (sizeChanged: boolean) => {
			const { width: modalWidth, height: modalHeight } = resizableElement.size;
			const { top: topPx, left: leftPx } = resizableElement.domNode.style;
			const sidebarWidth = sidebarResult?.getWidth() ?? 0;
			const headerHeight = headerElement.offsetHeight;

			editorPart.layout(
				Math.max(0, modalWidth - MODAL_BORDER_SIZE - sidebarWidth),
				modalHeight - MODAL_BORDER_SIZE - headerHeight,
				parseFloat(topPx) + MODAL_BORDER_WIDTH + headerHeight,
				parseFloat(leftPx) + MODAL_BORDER_WIDTH + sidebarWidth,
			);

			if (sizeChanged) {
				sidebarResult?.layout(modalHeight - MODAL_BORDER_SIZE - headerHeight);
			}
		};

		// Handle drag on header to move the modal
		const dragMonitor = disposables.add(new GlobalPointerMoveMonitor());
		const dragDisposables = disposables.add(new DisposableStore());
		let didDrag = false;
		disposables.add(addDisposableListener(headerElement, EventType.POINTER_DOWN, e => {
			if (editorPart.maximized) {
				return; // no drag when maximized
			}

			if (e.button !== 0) {
				return; // only left button
			}

			// Ignore if target is a button or action
			const target = e.target;
			if (!isHTMLElement(target)) {
				return;
			}

			if (target.closest('.monaco-button') || target.closest('.action-item')) {
				return;
			}

			// Prevent text selection during drag
			EventHelper.stop(e, true);
			dragDisposables.clear();

			headerElement.classList.add('dragging');
			dragDisposables.add(toDisposable(() => headerElement.classList.remove('dragging')));

			const startX = e.clientX;
			const startY = e.clientY;
			const startLeft = parseFloat(resizableElement.domNode.style.left) || 0;
			const startTop = parseFloat(resizableElement.domNode.style.top) || 0;
			didDrag = false;

			const onPointerMove = (moveEvent: PointerEvent) => {
				didDrag = true;
				EventHelper.stop(moveEvent, true);

				const containerDimension = this.layoutService.mainContainerDimension;
				const titleBarOffset = this.layoutService.mainContainerOffset.top;
				const dialogWidth = resizableElement.size.width;
				const dialogHeight = resizableElement.size.height;

				// Clamp to window bounds
				const minLeft = 0;
				const minTop = titleBarOffset;
				const maxLeft = Math.max(minLeft, containerDimension.width - dialogWidth);
				const maxTop = Math.max(minTop, containerDimension.height - dialogHeight);

				let newLeft = Math.max(minLeft, Math.min(maxLeft, startLeft + (moveEvent.clientX - startX)));
				let newTop = Math.max(minTop, Math.min(maxTop, startTop + (moveEvent.clientY - startY)));

				// Snap to center position when close
				const centerLeft = (containerDimension.width - dialogWidth) / 2;
				const centerTop = Math.max(titleBarOffset, (containerDimension.height - dialogHeight) / 2);

				if (Math.abs(newLeft - centerLeft) < MODAL_SNAP_THRESHOLD && Math.abs(newTop - centerTop) < MODAL_SNAP_THRESHOLD) {
					newLeft = centerLeft;
					newTop = centerTop;
				}

				resizableElement.domNode.style.left = `${newLeft}px`;
				resizableElement.domNode.style.top = `${newTop}px`;

				// Update editor part position during drag
				layout(false);
			};

			const onStop = () => {
				dragDisposables.clear();

				// A modal that fits its content opens centered, so where it is dragged to is not kept
				if (didDrag && !editorPart.fitsContent) {
					const currentLeft = parseFloat(resizableElement.domNode.style.left) || 0;
					const currentTop = parseFloat(resizableElement.domNode.style.top) || 0;

					// Check if snapped to center — if so, clear custom position
					const containerDimension = this.layoutService.mainContainerDimension;
					const titleBarOffset = this.layoutService.mainContainerOffset.top;
					const centerLeft = (containerDimension.width - resizableElement.size.width) / 2;
					const centerTop = Math.max(titleBarOffset, (containerDimension.height - resizableElement.size.height) / 2);

					if (Math.abs(currentLeft - centerLeft) < 1 && Math.abs(currentTop - centerTop) < 1) {
						editorPart.position = undefined;
					} else {
						editorPart.position = { left: currentLeft, top: currentTop };
					}
				}
			};

			dragMonitor.startMonitoring(headerElement, e.pointerId, e.buttons, onPointerMove, onStop);
		}));

		// Focus active editor when clicking into the title area with no other click target
		disposables.add(addDisposableListener(headerElement, EventType.CLICK, e => {
			const wasDrag = didDrag;
			didDrag = false;
			if (wasDrag) {
				return; // skip focus after drag
			}

			EventHelper.stop(e);

			editorPart.activeGroup.focus();
		}));

		// Handle resize from sashes
		let isResizing = false;
		let resizeStartLeft = 0;
		let resizeStartTop = 0;
		let resizeStartSize = Dimension.None;

		disposables.add(resizableElement.onDidWillResize(() => {
			isResizing = true;
			resizeStartLeft = parseFloat(resizableElement.domNode.style.left) || 0;
			resizeStartTop = parseFloat(resizableElement.domNode.style.top) || 0;
			resizeStartSize = new Dimension(resizableElement.size.width, resizableElement.size.height);
		}));

		disposables.add(resizableElement.onDidResize(e => {

			// Clamp position and size to window bounds during active resize
			// (skip on `done` — values are already correct from prior events,
			//  and directional flags are not set on the done event)
			if (!e.done) {
				const containerDimension = this.layoutService.mainContainerDimension;
				const titleBarOffset = this.layoutService.mainContainerOffset.top;

				const deltaWidth = e.dimension.width - resizeStartSize.width;
				const deltaHeight = e.dimension.height - resizeStartSize.height;

				let newLeft = e.west ? resizeStartLeft - deltaWidth : resizeStartLeft;
				let newTop = e.north ? resizeStartTop - deltaHeight : resizeStartTop;
				let newWidth = e.dimension.width;
				let newHeight = e.dimension.height;

				if (newLeft < 0) {
					newWidth += newLeft;
					newLeft = 0;
				}
				if (newTop < titleBarOffset) {
					newHeight += newTop - titleBarOffset;
					newTop = titleBarOffset;
				}
				if (newLeft + newWidth > containerDimension.width) {
					newWidth = containerDimension.width - newLeft;
				}
				if (newTop + newHeight > containerDimension.height) {
					newHeight = containerDimension.height - newTop;
				}

				// Apply corrected size if it was clamped
				if (newWidth !== e.dimension.width || newHeight !== e.dimension.height) {
					resizableElement.layout(newHeight, newWidth);
				}

				// Adjust position to keep the opposite edge fixed
				if (e.west) {
					resizableElement.domNode.style.left = `${newLeft}px`;
				}
				if (e.north) {
					resizableElement.domNode.style.top = `${newTop}px`;
				}
			}

			// Update editor part layout during resize
			layout(true);

			if (e.done) {
				isResizing = false;

				// Check if size matches the default (from sash double-click reset)
				const defaultSize = getDefaultSize();
				const size = resizableElement.size;
				if (size.width === defaultSize.width && size.height === defaultSize.height) {
					editorPart.size = undefined;
					editorPart.position = undefined;
					layoutModal();
				} else {
					editorPart.size = new Dimension(size.width, size.height);
					editorPart.position = {
						left: parseFloat(resizableElement.domNode.style.left) || 0,
						top: parseFloat(resizableElement.domNode.style.top) || 0,
					};
				}
			}
		}));

		// Compute default (non-custom, non-maximized) modal size
		const getDefaultSize = (): Dimension => {
			const containerDimension = this.layoutService.mainContainerDimension;
			const titleBarOffset = this.layoutService.mainContainerOffset.top;
			const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);
			const targetWidth = containerDimension.width * 0.8;
			const targetHeight = availableHeight * 0.8;
			const width = Math.min(targetWidth, MODAL_MAX_DEFAULT_WIDTH, containerDimension.width);
			const height = Math.min(targetHeight, MODAL_MAX_DEFAULT_HEIGHT, availableHeight);

			return new Dimension(width, height);
		};

		// Layout the modal editor part
		let wasFitted = false;
		let fittedTitleHeight: number | undefined; // the title height the fitted modal was last fitted to
		const layoutModal = () => {
			if (isResizing) {
				return; // skip layout during interactive resize
			}

			isLayingOutModal = true;
			try {
				doLayoutModal();
			} finally {
				isLayingOutModal = false;
			}
		};
		const doLayoutModal = () => {

			const containerDimension = this.layoutService.mainContainerDimension;
			const titleBarOffset = this.layoutService.mainContainerOffset.top;
			const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);

			const defaultSize = getDefaultSize();
			const contentSize = editorPart.contentSize;

			// A modal that fits its content fits the sidebar to the room its content leaves in the window, before the modal
			// takes the width of the sidebar
			if (contentSize) {
				sidebarResult?.clampWidth(containerDimension.width);
			}

			let width: number;
			let height: number;

			if (editorPart.maximized) {
				const verticalPadding = Math.max(titleBarOffset /* keep away from title bar to prevent clipping issues with WCO */, MODAL_MAXIMIZED_PADDING);
				width = Math.max(containerDimension.width - MODAL_MAXIMIZED_PADDING, 0);
				height = Math.max(availableHeight - verticalPadding, 0);
			} else if (editorPart.fitsContent) {
				// Fit the content, or the default size until the editor reports one. The content is the editor pane, so add what the
				// modal shows around it: the sidebar and the editor group's title. Keep to the modal's minimum size here, so that the
				// modal is centered at the size it gets. In a window smaller than the minimum size the modal keeps that size, so it
				// shows at the window's top left
				const requestedWidth = contentSize ? contentSize.width + (sidebarResult?.getWidth() ?? 0) + MODAL_BORDER_SIZE : defaultSize.width;
				fittedTitleHeight = editorPart.activeGroup.titleHeight.total;
				const requestedHeight = contentSize ? contentSize.height + fittedTitleHeight + (headerElement.offsetHeight || MODAL_HEADER_HEIGHT) + MODAL_BORDER_SIZE : defaultSize.height;
				width = Math.min(Math.max(requestedWidth, resizableElement.minSize.width), containerDimension.width);
				height = Math.max(requestedHeight, resizableElement.minSize.height);
			} else if (editorPart.size && editorPart.canResize) {
				width = Math.min(editorPart.size.width, containerDimension.width);
				height = Math.min(editorPart.size.height, availableHeight);
			} else {
				width = defaultSize.width;
				height = defaultSize.height;
			}

			height = Math.min(height, availableHeight); // Ensure the modal never exceeds available height (below the title bar)

			// On first layout, clamp sidebar width if it would leave the editor too narrow, and so after a modal that fitted its
			// content, which can give the sidebar more room than this modal has
			if (isFirstLayout || (wasFitted && !contentSize)) {
				isFirstLayout = false;
				sidebarResult?.clampWidth(width);
			}
			wasFitted = !!contentSize;

			// Update resizable element size and constraints
			resizableElement.maxSize = new Dimension(containerDimension.width, availableHeight);
			resizableElement.preferredSize = defaultSize;
			resizableElement.layout(height, width);

			// Enable/disable sashes based on maximized state and the active editor
			const canResize = !editorPart.maximized && editorPart.canResize;
			resizableElement.enableSashes(canResize, canResize, canResize, canResize);

			// Position: use custom position if available (clamped to bounds), otherwise center
			if (!editorPart.maximized && !editorPart.fitsContent && editorPart.position) {
				const clampedLeft = Math.max(0, Math.min(editorPart.position.left, containerDimension.width - width));
				const clampedTop = Math.max(titleBarOffset, Math.min(editorPart.position.top, titleBarOffset + availableHeight - height));
				resizableElement.domNode.style.left = `${clampedLeft}px`;
				resizableElement.domNode.style.top = `${clampedTop}px`;
			} else {
				const left = (containerDimension.width - width) / 2;
				const top = Math.max(titleBarOffset, (containerDimension.height - height) / 2); // center in full window, but clamp to stay below the title bar
				resizableElement.domNode.style.left = `${left}px`;
				resizableElement.domNode.style.top = `${top}px`;
			}

			layout(true);
		};
		disposables.add(Event.runAndSubscribe(this.layoutService.onDidLayoutMainContainer, layoutModal));
		disposables.add(editorPart.onDidChangeMaximized(() => layoutModal()));
		disposables.add(editorPart.onDidRequestLayout(() => layoutModal()));

		// Reflect modal-options from the active editor (e.g. compact header)
		// as classes on the modal block, and re-layout so dimensions account
		// for any header size change.
		const updateModalOptions = () => {
			const activeEditor = editorPart.activeGroup.activeEditor;
			const editorModalOptions = resolveModalEditorOptions(activeEditor);
			modalElement.classList.toggle('compact-header', !!editorModalOptions?.compactHeader);
			canMoveToEditorAreaContext.set(canMoveModalEditorToEditorArea(activeEditor));
			canMaximizeContext.set(editorPart.canMaximize);
			if (editorPart.maximized && !editorPart.canMaximize) {
				editorPart.toggleMaximized(); // restores and lays out the modal
			} else {
				layoutModal();
			}
		};
		const modalOptionsListener = disposables.add(new MutableDisposable());
		const contentSizeListener = disposables.add(new MutableDisposable());

		// A modal that fits its content also fits its editor group's title, such as the tabs it shows with more editors or
		// a row it adds for pinned tabs. The group lays itself out again when the height of its title changes
		const groupRelayoutListener = disposables.add(new MutableDisposable());
		disposables.add(Event.runAndSubscribe(editorPart.onDidChangeActiveGroup, () => {
			groupRelayoutListener.value = editorPart.activeGroup.onDidRelayout(() => {
				if (editorPart.contentSize && editorPart.activeGroup.titleHeight.total !== fittedTitleHeight) {
					layoutModal();
				}
			});
		}));
		disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => {
			const activeEditor = editorPart.activeGroup.activeEditor;
			modalOptionsListener.value = isModalEditorOptionsProvider(activeEditor) ? activeEditor.onDidChangeModalEditorOptions?.(updateModalOptions) : undefined;
			contentSizeListener.value = editorPart.activeGroup.activeEditorPane?.onDidChangePreferredContentSize?.(() => {
				if (editorPart.fitsContent) {
					layoutModal();
				}
			});
			updateModalOptions();
		}));

		// Dim window controls to match the modal overlay
		this.hostService.setWindowDimmed(mainWindow, true);
		disposables.add(toDisposable(() => this.hostService.setWindowDimmed(mainWindow, false)));

		// Focus
		editorPart.activeGroup.focus();

		return {
			part: editorPart,
			instantiationService: scopedInstantiationService,
			disposables
		};
	}

	private createSidebar(container: HTMLElement, headerElement: HTMLElement, content: IModalEditorSidebar | undefined, modalContextKeyService: IContextKeyService, getFittedMaxWidth: () => number | undefined, disposables: DisposableStore): IModalEditorSidebarController | undefined {
		if (!content) {
			return undefined;
		}

		let sidebarWidth = content.sidebarWidth && content.sidebarWidth > 0 ? content.sidebarWidth : MODAL_SIDEBAR_DEFAULT_WIDTH;
		let customWidth = content.sidebarWidth !== undefined && content.sidebarWidth > 0;
		let visible = !content.sidebarHidden;

		const sidebarContainer = append(container, $('div.modal-editor-sidebar.show-file-icons'));
		sidebarContainer.style.width = `${sidebarWidth}px`;
		setVisibility(visible, sidebarContainer);

		// Context key service scoped to the sidebar container, descending from the
		// modal context key service so that content rendered here (e.g. the changes
		// tree) inherits the modal-level context keys.
		const sidebarContextKeyService = disposables.add(modalContextKeyService.createScoped(sidebarContainer));

		// Let the caller render content
		const onDidLayoutEmitter = disposables.add(new Emitter<{ readonly height: number; readonly width: number }>());
		const contentDisposable = disposables.add(new MutableDisposable());
		contentDisposable.value = content.render(sidebarContainer, onDidLayoutEmitter.event, sidebarContextKeyService);

		// Sash for resizing sidebar.
		// Prefer the measured header height so the sash aligns with the real chrome
		// (the compact-header variant is 40px, the default header is 33px). The
		// constant only applies before the header has been laid out.
		const getHeaderHeight = () => (headerElement.offsetHeight || MODAL_HEADER_HEIGHT);
		const sash = disposables.add(new Sash(container, {
			getVerticalSashLeft: () => sidebarWidth,
			getVerticalSashTop: () => getHeaderHeight(),
			getVerticalSashHeight: () => (container.clientHeight - getHeaderHeight()),
		}, { orientation: Orientation.VERTICAL }));
		if (!visible) {
			sash.state = SashState.Disabled;
		}

		const onDidResizeEmitter = disposables.add(new Emitter<void>());

		let sashStartWidth: number | undefined;
		disposables.add(sash.onDidStart(() => sashStartWidth = sidebarWidth));
		disposables.add(sash.onDidEnd(() => sashStartWidth = undefined));
		disposables.add(sash.onDidChange(e => {
			if (sashStartWidth === undefined) {
				return;
			}

			const delta = e.currentX - e.startX;
			const maxWidth = getFittedMaxWidth() ?? Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
			sidebarWidth = Math.min(maxWidth, Math.max(MODAL_SIDEBAR_MIN_WIDTH, sashStartWidth + delta));
			customWidth = true;
			sidebarContainer.style.width = `${sidebarWidth}px`;
			sash.layout();
			onDidResizeEmitter.fire();
		}));
		disposables.add(sash.onDidReset(() => {
			const maxWidth = getFittedMaxWidth() ?? Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
			sidebarWidth = Math.min(maxWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
			customWidth = false;
			sidebarContainer.style.width = `${sidebarWidth}px`;
			sash.layout();
			onDidResizeEmitter.fire();
		}));

		return {
			onDidResize: onDidResizeEmitter.event,
			getWidth: () => visible ? sidebarWidth : 0,
			hasCustomWidth: () => customWidth,
			clampWidth: (modalWidth: number) => {
				const fittedMaxWidth = getFittedMaxWidth();
				if (fittedMaxWidth !== undefined) {
					// Keep a width the user gave the sidebar, otherwise take the default, within the room the content leaves
					const fittedWidth = Math.min(customWidth ? sidebarWidth : MODAL_SIDEBAR_DEFAULT_WIDTH, fittedMaxWidth);
					if (fittedWidth !== sidebarWidth) {
						sidebarWidth = fittedWidth;
						sidebarContainer.style.width = `${sidebarWidth}px`;
						sash.layout();
						onDidResizeEmitter.fire();
					}
				} else if (sidebarWidth + MODAL_MIN_WIDTH > modalWidth) {
					sidebarWidth = Math.min(MODAL_SIDEBAR_DEFAULT_WIDTH, Math.max(MODAL_SIDEBAR_MIN_WIDTH, modalWidth - MODAL_MIN_WIDTH));
					customWidth = false;
					sidebarContainer.style.width = `${sidebarWidth}px`;
					sash.layout();
					onDidResizeEmitter.fire();
				}
			},
			isVisible: () => visible,
			setVisible: (value: boolean) => {
				visible = value;
				setVisibility(visible, sidebarContainer);
				container.classList.toggle('has-sidebar', visible);
				sash.state = visible ? SashState.Enabled : SashState.Disabled;
				onDidResizeEmitter.fire();
			},
			layout: (height: number) => {
				if (visible) {
					onDidLayoutEmitter.fire({
						height: height - MODAL_SIDEBAR_PADDING * 2,
						width: sidebarWidth - MODAL_SIDEBAR_PADDING * 2 - MODAL_SIDEBAR_BORDER_RIGHT
					});
				}
				sash.layout();
			},
			updateContent: (newContent: IModalEditorSidebar) => {
				contentDisposable.clear();
				sidebarContainer.textContent = '';
				contentDisposable.value = newContent.render(sidebarContainer, onDidLayoutEmitter.event, sidebarContextKeyService);
			},
		};
	}
}

interface IPosition {
	left: number;
	top: number;
}

class ModalEditorPartImpl extends EditorPart implements IModalEditorPart {

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose = this._onWillClose.event;

	private readonly _onDidChangeMaximized = this._register(new Emitter<boolean>());
	readonly onDidChangeMaximized = this._onDidChangeMaximized.event;

	private readonly _onDidRequestLayout = this._register(new Emitter<void>());
	readonly onDidRequestLayout = this._onDidRequestLayout.event;

	private readonly _onDidChangeNavigation = this._register(new Emitter<IModalEditorNavigation | undefined>());
	readonly onDidChangeNavigation = this._onDidChangeNavigation.event;

	private _maximized: boolean;
	get maximized(): boolean { return this._maximized; }

	/** Whether the modal fits the content of the active editor (see `IModalEditorOptions.fitToContent`). */
	get fitsContent(): boolean { return resolveModalEditorOptions(this.activeGroup.activeEditor)?.fitToContent === true; }

	/** The size the modal fits, as the active editor pane prefers it, when the modal fits its content. */
	get contentSize(): IDimension | undefined { return this.fitsContent ? this.activeGroup.activeEditorPane?.preferredContentSize : undefined; }

	/** Whether the active editor allows maximizing the modal. */
	get canMaximize(): boolean { return resolveModalEditorOptions(this.activeGroup.activeEditor)?.canMaximize !== false; }

	/** Whether the active editor allows resizing the modal. */
	get canResize(): boolean {
		const options = resolveModalEditorOptions(this.activeGroup.activeEditor);

		return options?.canResize !== false && !options?.fitToContent;
	}

	private _size: IDimension | undefined;
	get size(): IDimension | undefined { return this._size; }
	set size(value: IDimension | undefined) { this._size = value; }

	private _position: IPosition | undefined;
	get position(): IPosition | undefined { return this._position; }
	set position(value: IPosition | undefined) { this._position = value; }

	private _sidebarWidth: number | undefined;
	get sidebarWidth(): number | undefined { return this._sidebarWidth; }
	set sidebarWidth(value: number | undefined) { this._sidebarWidth = value; }

	private _sidebarHidden = false;
	get sidebarHidden(): boolean { return this._sidebarHidden; }
	set sidebarHidden(value: boolean) { this._sidebarHidden = value; }

	private _hasSidebar = false;
	get hasSidebar(): boolean { return this._hasSidebar; }
	set hasSidebar(value: boolean) { this._hasSidebar = value; }

	private readonly _onDidToggleSidebar = this._register(new Emitter<void>());
	readonly onDidToggleSidebar = this._onDidToggleSidebar.event;

	private savedSize: IDimension | undefined;
	private savedPosition: IPosition | undefined;

	private _navigation: IModalEditorNavigation | undefined;
	get navigation(): IModalEditorNavigation | undefined { return this._navigation; }

	private readonly optionsDisposable = this._register(new MutableDisposable());

	private previousMainWindowActiveElement: Element | null = null;

	constructor(
		windowId: number,
		editorPartsView: IEditorPartsView,
		public readonly modalElement: HTMLElement,
		options: IModalEditorPartOptions | undefined,
		public readonly focusToolbar: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService private readonly modalContextKeyService: IContextKeyService,
	) {
		// Keep a stable component ID so recreating the modal does not grow the global memento cache.
		super(editorPartsView, 'workbench.parts.modalEditor', localize('modalEditorPart', "Modal Editor Area"), windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, modalContextKeyService);

		this._maximized = options?.maximized ?? false;
		this._size = options?.size;
		this._position = options?.position;
		this._navigation = options?.navigation;
		this._hasSidebar = !!options?.sidebar;
		this._sidebarHidden = options?.sidebar?.sidebarHidden ?? false;
		this._sidebarWidth = options?.sidebar?.sidebarWidth;

		// When restoring a maximized state with custom layout,
		// initialize saved state so un-maximize can restore it
		if (this._maximized) {
			this.savedSize = this._size;
			this.savedPosition = this._position;
		}

		this.enforceModalPartOptions();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(USE_MODAL_EDITOR_SETTING)) {
				this.enforceModalPartOptions();
			}
		}));
	}

	override create(parent: HTMLElement, options?: object): void {
		this.previousMainWindowActiveElement = mainWindow.document.activeElement;

		super.create(parent, options);
	}

	enforceModalPartOptions(): void {
		const useModalForAll = this.configurationService.getValue<UseModalEditorMode>(USE_MODAL_EDITOR_SETTING) === 'all';
		const editorCount = this.groups.reduce((count, group) => count + group.count, 0);
		const showTabs = useModalForAll && editorCount > 1 ? 'multiple' : 'none';

		this.optionsDisposable.value = this.enforcePartOptions({
			showTabs,
			enablePreview: true,
			closeEmptyGroups: true,
			tabActionCloseVisibility: showTabs !== 'none',
			editorActionsLocation: 'hidden',
			tabHeight: 'default',
			wrapTabs: false,
			allowDropIntoGroup: false
		});
	}

	updateOptions(options?: IModalEditorPartOptions): void {
		if (typeof options?.maximized === 'boolean' && options.maximized !== this._maximized) {
			this.toggleMaximized();
		}

		this._navigation = options?.navigation;

		this._onDidChangeNavigation.fire(options?.navigation);
	}

	toggleMaximized(): void {
		if (!this._maximized && !this.canMaximize) {
			return;
		}

		this._maximized = !this._maximized;

		if (this._maximized) {
			this.savedSize = this._size;
			this.savedPosition = this._position;
		} else {
			this._size = this.savedSize;
			this._position = this.savedPosition;
			this.savedSize = undefined;
			this.savedPosition = undefined;
		}

		this._onDidChangeMaximized.fire(this._maximized);
	}

	toggleSidebar(): void {
		this._sidebarHidden = !this._sidebarHidden;

		this._onDidToggleSidebar.fire();
	}

	handleHeaderDoubleClick(): void {
		if (this._maximized) {
			// Clear saved state so that toggleMaximized restores to default
			this.savedSize = undefined;
			this.savedPosition = undefined;
			this.toggleMaximized();
		} else if (this._size && this.canResize) {
			this._size = undefined;
			this._position = undefined;
			this._onDidRequestLayout.fire();
		} else {
			this.toggleMaximized(); // maximize
		}
	}

	protected override handleContextKeys(): void {

		// Bind the modal-level context keys to the modal context key service which
		// is scoped to the entire modal element (not just the editor part
		// container). This keeps them active when focus is anywhere inside the
		// modal, including the sidebar (e.g. the changes tree). Otherwise commands
		// like closing the modal on `Escape` would not fire while the sidebar has
		// focus.
		const isModalEditorPartContext = EditorPartModalContext.bindTo(this.modalContextKeyService);
		isModalEditorPartContext.set(true);

		const isMaximizedContext = EditorPartModalMaximizedContext.bindTo(this.modalContextKeyService);
		isMaximizedContext.set(this._maximized);
		this._register(this.onDidChangeMaximized(maximized => isMaximizedContext.set(maximized)));

		const hasNavigationContext = EditorPartModalNavigationContext.bindTo(this.modalContextKeyService);
		hasNavigationContext.set(!!this._navigation && this._navigation.total > 1);
		this._register(this.onDidChangeNavigation(navigation => hasNavigationContext.set(!!navigation && navigation.total > 1)));

		const sidebarContext = EditorPartModalSidebarContext.bindTo(this.modalContextKeyService);
		sidebarContext.set(this._hasSidebar);

		const sidebarVisibleContext = EditorPartModalSidebarVisibleContext.bindTo(this.modalContextKeyService);
		sidebarVisibleContext.set(this._hasSidebar && !this._sidebarHidden);
		this._register(this.onDidToggleSidebar(() => sidebarVisibleContext.set(this._hasSidebar && !this._sidebarHidden)));

		super.handleContextKeys();
	}

	override removeGroup(group: number | IEditorGroupView, preserveFocus?: boolean): void {

		// Close modal when last group removed
		const groupView = this.assertGroupView(group);
		if (this.count === 1 && this.activeGroup === groupView) {
			this.doRemoveLastGroup();
		}

		// Otherwise delegate to parent implementation
		else {
			super.removeGroup(group, preserveFocus);
		}
	}

	private doRemoveLastGroup(): void {

		// Activate main editor group when closing
		const activeMainGroup = this.editorPartsView.mainPart.activeGroup;
		this.editorPartsView.mainPart.activateGroup(activeMainGroup, undefined, GroupActivationReason.PART_CLOSE);

		// Deal with focus: removing the last modal group
		// means we return back to the main editor part.
		// But we only want to focus that if it was focused
		// before to prevent revealing the editor part if
		// it was maybe hidden before.
		const mainEditorPartContainer = this.layoutService.getContainer(mainWindow, Parts.EDITOR_PART);
		if (
			!isHTMLElement(this.previousMainWindowActiveElement) ||					// invalid previous element
			!this.previousMainWindowActiveElement.isConnected ||					// previous element no longer in the DOM
			mainEditorPartContainer?.contains(this.previousMainWindowActiveElement)	// previous element is inside main editor part
		) {
			activeMainGroup.focus();
		} else {
			this.previousMainWindowActiveElement.focus();
		}

		this._onWillClose.fire();
	}

	protected override saveState(): void {
		return; // disabled, modal editor part state is not persisted
	}

	async close(options?: { mergeAllEditorsToMainPart?: boolean }): Promise<boolean> {

		// Merge all editors to main part (editors stay open, no confirmation needed)
		if (options?.mergeAllEditorsToMainPart) {
			const result = this.mergeGroupsToMainPart();
			if (!result) {
				return false;
			}
		}

		// Close all editors in each group, leveraging the existing
		// confirmation infrastructure for dirty editors
		else {
			for (const group of this.groups) {
				const closed = await group.closeAllEditors();
				if (!closed) {
					return false; // user cancelled
				}
			}
		}

		this._onWillClose.fire();

		return true;
	}

	override dispose(): void {
		this._navigation = undefined; // ensure to free the reference to the navigation closure

		super.dispose();
	}
}
