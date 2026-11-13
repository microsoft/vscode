/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modalEditorPart.css';
import { $, addDisposableListener, append, EventHelper, EventType, getWindow, hide, isHTMLElement, setVisibility, show } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionBar, prepareActions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Orientation, Sash, SashState } from '../../../../base/browser/ui/sash/sash.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
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
import { EditorPartModalCanMoveToEditorAreaContext, EditorPartModalContext, EditorPartModalNavigationContext, EditorPartModalSidebarContext, EditorPartModalSidebarVisibleContext } from '../../../common/contextkeys.js';
import { EditorResourceAccessor, IEditorCommandsContext, SideBySideEditor, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ResourceLabel } from '../../labels.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CLOSE_MODAL_EDITOR_COMMAND_ID, MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID, MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID, NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID, NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID, TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID } from './editorCommands.js';
import { canMoveModalEditorToEditorArea, IModalEditorNavigation, IModalEditorPartOptions, IModalEditorSidebar, isModalEditorOptionsProvider } from '../../../../platform/editor/common/editor.js';

const MODAL_MIN_WIDTH = 400;
const MODAL_MIN_HEIGHT = 300;
const MODAL_SIZE_RATIO = 0.85; // fraction of the window (width) and of the area below the title bar (height)
const MODAL_BORDER_WIDTH = 1; // 1px border on each side
const MODAL_BORDER_SIZE = MODAL_BORDER_WIDTH * 2;
const MODAL_HEADER_HEIGHT = 33; // Fallback only — actual height is measured from the rendered header element to account for the compact-header variant.
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

		// Fixed-size frame, centered and sized in `layoutModal`
		const frameElement = modalElement.appendChild($('.modal-editor-frame'));
		const minWidth = MODAL_MIN_WIDTH + (options?.sidebar ? MODAL_SIDEBAR_MIN_WIDTH : 0);

		const shadowElement = frameElement.appendChild($('.modal-editor-shadow'));

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

		// Navigation widget
		const navigationContainer = append(headerElement, $('div.modal-editor-navigation'));
		hide(navigationContainer);

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
		const sidebarResult = this.createSidebar(editorPartContainer, headerElement, options?.sidebar, modalContextKeyService, disposables);
		if (sidebarResult) {
			if (sidebarResult.isVisible()) {
				editorPartContainer.classList.add('has-sidebar');
			}
			disposables.add(sidebarResult.onDidResize(() => layoutModal()));
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
		disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ModalEditorTitle, {
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

		// Keep focus inside the modal when pressing on the header: the header
		// is not focusable, so the default would move focus to the body
		disposables.add(addDisposableListener(headerElement, EventType.MOUSE_DOWN, e => {
			const target = e.target;
			if (isHTMLElement(target) && !target.closest('.monaco-button') && !target.closest('.action-item')) {
				e.preventDefault();
			}
		}));

		// Focus active editor when clicking into the title area with no other click target
		disposables.add(addDisposableListener(headerElement, EventType.CLICK, e => {
			EventHelper.stop(e);

			editorPart.activeGroup.focus();
		}));

		// Layout the modal editor part: a fixed fraction of the window, always
		// centered. It cannot be moved or resized by the user.
		let isFirstLayout = true;
		const layoutModal = () => {
			const containerDimension = this.layoutService.mainContainerDimension;
			const titleBarOffset = this.layoutService.mainContainerOffset.top;
			const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);

			// Never smaller than the minimum size, unless the window itself is smaller
			const width = Math.min(Math.max(containerDimension.width * MODAL_SIZE_RATIO, minWidth), containerDimension.width);
			const height = Math.min(Math.max(availableHeight * MODAL_SIZE_RATIO, MODAL_MIN_HEIGHT), availableHeight);

			// Center in the full window, but clamp to stay below the title bar
			const left = (containerDimension.width - width) / 2;
			const top = Math.max(titleBarOffset, (containerDimension.height - height) / 2);

			// On first layout, clamp sidebar width if it would leave the editor too narrow
			if (isFirstLayout) {
				isFirstLayout = false;
				sidebarResult?.clampWidth(width);
			}

			frameElement.style.left = `${left}px`;
			frameElement.style.top = `${top}px`;
			frameElement.style.width = `${width}px`;
			frameElement.style.height = `${height}px`;

			const sidebarWidth = sidebarResult?.getWidth() ?? 0;
			const headerHeight = headerElement.offsetHeight;
			const contentHeight = height - MODAL_BORDER_SIZE - headerHeight;

			editorPart.layout(
				Math.max(0, width - MODAL_BORDER_SIZE - sidebarWidth),
				contentHeight,
				top + MODAL_BORDER_WIDTH + headerHeight,
				left + MODAL_BORDER_WIDTH + sidebarWidth,
			);
			sidebarResult?.layout(contentHeight);
		};
		disposables.add(Event.runAndSubscribe(this.layoutService.onDidLayoutMainContainer, layoutModal));

		// Reflect modal-options from the active editor (e.g. compact header)
		// as classes on the modal block, and re-layout so dimensions account
		// for any header size change.
		disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => {
			const activeEditor = editorPart.activeGroup.activeEditor;
			const editorModalOptions = isModalEditorOptionsProvider(activeEditor) ? activeEditor.getModalEditorOptions() : undefined;
			modalElement.classList.toggle('compact-header', !!editorModalOptions?.compactHeader);
			canMoveToEditorAreaContext.set(canMoveModalEditorToEditorArea(activeEditor));
			layoutModal();
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

	private createSidebar(container: HTMLElement, headerElement: HTMLElement, content: IModalEditorSidebar | undefined, modalContextKeyService: IContextKeyService, disposables: DisposableStore): IModalEditorSidebarController | undefined {
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
			const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
			sidebarWidth = Math.min(maxWidth, Math.max(MODAL_SIDEBAR_MIN_WIDTH, sashStartWidth + delta));
			customWidth = true;
			sidebarContainer.style.width = `${sidebarWidth}px`;
			sash.layout();
			onDidResizeEmitter.fire();
		}));
		disposables.add(sash.onDidReset(() => {
			const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
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
				if (sidebarWidth + MODAL_MIN_WIDTH > modalWidth) {
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

class ModalEditorPartImpl extends EditorPart implements IModalEditorPart {

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose = this._onWillClose.event;

	private readonly _onDidChangeNavigation = this._register(new Emitter<IModalEditorNavigation | undefined>());
	readonly onDidChangeNavigation = this._onDidChangeNavigation.event;

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

	private _navigation: IModalEditorNavigation | undefined;
	get navigation(): IModalEditorNavigation | undefined { return this._navigation; }

	private readonly optionsDisposable = this._register(new MutableDisposable());

	private previousMainWindowActiveElement: Element | null = null;

	constructor(
		windowId: number,
		editorPartsView: IEditorPartsView,
		public readonly modalElement: HTMLElement,
		options: IModalEditorPartOptions | undefined,
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

		this._navigation = options?.navigation;
		this._hasSidebar = !!options?.sidebar;
		this._sidebarHidden = options?.sidebar?.sidebarHidden ?? false;
		this._sidebarWidth = options?.sidebar?.sidebarWidth;

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
		this._navigation = options?.navigation;

		this._onDidChangeNavigation.fire(options?.navigation);
	}

	toggleSidebar(): void {
		this._sidebarHidden = !this._sidebarHidden;

		this._onDidToggleSidebar.fire();
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
