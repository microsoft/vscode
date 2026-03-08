/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modalEditorPart.css';
import { $, addDisposableListener, append, Dimension, EventHelper, EventType, hide, IDimension, isHTMLElement, setVisibility, show } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { prepareActions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroupView, IEditorPartsView } from './editor.js';
import { EditorPart } from './editorPart.js';
import { GroupDirection, GroupsOrder, IModalEditorPart, GroupActivationReason } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorPartModalContext, EditorPartModalMaximizedContext, EditorPartModalNavigationContext } from '../../../common/contextkeys.js';
import { EditorResourceAccessor, SideBySideEditor, Verbosity } from '../../../common/editor.js';
import { ResourceLabel } from '../../labels.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CLOSE_MODAL_EDITOR_COMMAND_ID, MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID, MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID, NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID, NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID, TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID } from './editorCommands.js';
import { IModalEditorNavigation, IModalEditorPartOptions } from '../../../../platform/editor/common/editor.js';

const MODAL_MIN_WIDTH = 400;
const MODAL_MIN_HEIGHT = 300;
const MODAL_MAX_DEFAULT_WIDTH = 1400;
const MODAL_MAX_DEFAULT_HEIGHT = 900;
const MODAL_BORDER_SIZE = 2; // 1px border on each side
const MODAL_HEADER_HEIGHT = 33; // 32px header + 1px border bottom
const MODAL_SNAP_THRESHOLD = 20;
const MODAL_MAXIMIZED_PADDING = 16;

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
]);

export interface ICreateModalEditorPartResult {
	readonly part: ModalEditorPartImpl;
	readonly instantiationService: IInstantiationService;
	readonly disposables: DisposableStore;
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
	) {
	}

	async create(options?: IModalEditorPartOptions): Promise<ICreateModalEditorPartResult> {
		const disposables = new DisposableStore();

		// Modal container
		const modalElement = $('.monaco-modal-editor-block');
		this.layoutService.mainContainer.appendChild(modalElement);
		disposables.add(toDisposable(() => modalElement.remove()));

		disposables.add(addDisposableListener(modalElement, EventType.MOUSE_DOWN, e => {
			if (e.target === modalElement) {
				EventHelper.stop(e, true);

				// Close modal when clicking outside the dialog
				editorPart.close();
			}
		}));

		let useModalMode = this.configurationService.getValue<string>('workbench.editor.useModal');
		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.editor.useModal')) {
				useModalMode = this.configurationService.getValue<string>('workbench.editor.useModal');
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
		resizableElement.minSize = new Dimension(MODAL_MIN_WIDTH, MODAL_MIN_HEIGHT);
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

		// Title element
		const titleElement = append(headerElement, $('div.modal-editor-title.show-file-icons'));
		titleElement.id = titleId;
		titleElement.textContent = '';

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

		// Create the editor part
		const editorPart = disposables.add(this.instantiationService.createInstance(
			ModalEditorPartImpl,
			mainWindow.vscodeWindowId,
			this.editorPartsView,
			modalElement,
			options,
		));
		disposables.add(this.editorPartsView.registerPart(editorPart));
		editorPart.create(editorPartContainer);

		disposables.add(Event.once(editorPart.onWillClose)(() => disposables.dispose()));
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

		// Create global toolbar
		disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ModalEditorTitle, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			highlightToggledItems: true,
			menuOptions: { shouldForwardArgs: true }
		}));

		// Create label
		const label = disposables.add(scopedInstantiationService.createInstance(ResourceLabel, titleElement, {}));
		disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => {
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
						icon: activeEditor.getIcon(),
						extraClasses: activeEditor.getLabelExtraClasses(),
					}
				);
			} else {
				label.element.clear();
			}
		}));

		// Handle double-click on header to toggle maximize
		disposables.add(addDisposableListener(headerElement, EventType.DBLCLICK, e => {
			EventHelper.stop(e);

			editorPart.handleHeaderDoubleClick();
		}));

		// Handle drag on header to move the modal
		const dragDisposables = disposables.add(new DisposableStore());
		let didDrag = false;
		disposables.add(addDisposableListener(headerElement, EventType.MOUSE_DOWN, e => {
			if (editorPart.maximized) {
				return; // no drag when maximized
			}

			if (e.button !== 0) {
				return; // only left button
			}

			// Ignore if target is a button or action
			const target = e.target as HTMLElement;
			if (target.closest('.monaco-button') || target.closest('.action-item')) {
				return;
			}

			// Prevent text selection during drag
			e.preventDefault();

			dragDisposables.clear();

			const startX = e.clientX;
			const startY = e.clientY;
			const startLeft = parseFloat(resizableElement.domNode.style.left) || 0;
			const startTop = parseFloat(resizableElement.domNode.style.top) || 0;
			didDrag = false;

			const onMouseMove = (moveEvent: MouseEvent) => {
				didDrag = true;
				EventHelper.stop(moveEvent, true);

				const containerDimension = this.layoutService.mainContainerDimension;
				const titleBarOffset = this.layoutService.mainContainerOffset.top;
				const dialogWidth = resizableElement.size.width;
				const dialogHeight = resizableElement.size.height;
				const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);

				// Clamp to window bounds
				const minLeft = 0;
				const minTop = titleBarOffset;
				const maxLeft = Math.max(minLeft, containerDimension.width - dialogWidth);
				const maxTop = Math.max(minTop, titleBarOffset + availableHeight - dialogHeight);

				let newLeft = Math.max(minLeft, Math.min(maxLeft, startLeft + (moveEvent.clientX - startX)));
				let newTop = Math.max(minTop, Math.min(maxTop, startTop + (moveEvent.clientY - startY)));

				// Snap to center position when close
				const centerLeft = (containerDimension.width - dialogWidth) / 2;
				const centerTop = titleBarOffset + (availableHeight - dialogHeight) / 2;

				if (Math.abs(newLeft - centerLeft) < MODAL_SNAP_THRESHOLD && Math.abs(newTop - centerTop) < MODAL_SNAP_THRESHOLD) {
					newLeft = centerLeft;
					newTop = centerTop;
				}

				resizableElement.domNode.style.left = `${newLeft}px`;
				resizableElement.domNode.style.top = `${newTop}px`;
			};

			const onMouseUp = (upEvent: MouseEvent) => {
				EventHelper.stop(upEvent, true);
				dragDisposables.clear();

				if (didDrag) {
					const currentLeft = parseFloat(resizableElement.domNode.style.left) || 0;
					const currentTop = parseFloat(resizableElement.domNode.style.top) || 0;

					// Check if snapped to center — if so, clear custom position
					const containerDimension = this.layoutService.mainContainerDimension;
					const titleBarOffset = this.layoutService.mainContainerOffset.top;
					const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);
					const centerLeft = (containerDimension.width - resizableElement.size.width) / 2;
					const centerTop = titleBarOffset + (availableHeight - resizableElement.size.height) / 2;

					if (Math.abs(currentLeft - centerLeft) < 1 && Math.abs(currentTop - centerTop) < 1) {
						editorPart.position = undefined;
					} else {
						editorPart.position = { left: currentLeft, top: currentTop };
					}
				}
			};

			dragDisposables.add(addDisposableListener(mainWindow, EventType.MOUSE_MOVE, onMouseMove, true));
			dragDisposables.add(addDisposableListener(mainWindow, EventType.MOUSE_UP, onMouseUp, true));
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
			const deltaWidth = e.dimension.width - resizeStartSize.width;
			const deltaHeight = e.dimension.height - resizeStartSize.height;

			// Adjust position to keep the opposite edge fixed
			if (e.west) {
				resizableElement.domNode.style.left = `${resizeStartLeft - deltaWidth}px`;
			}
			if (e.north) {
				resizableElement.domNode.style.top = `${resizeStartTop - deltaHeight}px`;
			}

			// Update editor part layout during resize
			editorPart.layout(e.dimension.width - MODAL_BORDER_SIZE, e.dimension.height - MODAL_BORDER_SIZE - MODAL_HEADER_HEIGHT, 0, 0);

			if (e.done) {
				isResizing = false;

				// Check if size matches the default (from sash double-click reset)
				const defaultSize = getDefaultSize();
				if (e.dimension.width === defaultSize.width && e.dimension.height === defaultSize.height) {
					editorPart.size = undefined;
					editorPart.position = undefined;
					layoutModal();
				} else {
					editorPart.size = new Dimension(e.dimension.width, e.dimension.height);
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
		const layoutModal = () => {
			if (isResizing) {
				return; // skip layout during interactive resize
			}

			const containerDimension = this.layoutService.mainContainerDimension;
			const titleBarOffset = this.layoutService.mainContainerOffset.top;
			const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);

			const defaultSize = getDefaultSize();

			let width: number;
			let height: number;

			if (editorPart.maximized) {
				const verticalPadding = Math.max(titleBarOffset /* keep away from title bar to prevent clipping issues with WCO */, MODAL_MAXIMIZED_PADDING);
				width = Math.max(containerDimension.width - MODAL_MAXIMIZED_PADDING, 0);
				height = Math.max(availableHeight - verticalPadding, 0);
			} else if (editorPart.size) {
				width = Math.min(editorPart.size.width, containerDimension.width);
				height = Math.min(editorPart.size.height, availableHeight);
			} else {
				width = defaultSize.width;
				height = defaultSize.height;
			}

			height = Math.min(height, availableHeight); // Ensure the modal never exceeds available height (below the title bar)

			// Update resizable element size and constraints
			resizableElement.maxSize = new Dimension(containerDimension.width, availableHeight);
			resizableElement.preferredSize = defaultSize;
			resizableElement.layout(height, width);

			// Enable/disable sashes based on maximized state
			const canResize = !editorPart.maximized;
			resizableElement.enableSashes(canResize, canResize, canResize, canResize);

			// Position: use custom position if available (clamped to bounds), otherwise center
			if (!editorPart.maximized && editorPart.position) {
				const clampedLeft = Math.max(0, Math.min(editorPart.position.left, containerDimension.width - width));
				const clampedTop = Math.max(titleBarOffset, Math.min(editorPart.position.top, titleBarOffset + availableHeight - height));
				resizableElement.domNode.style.left = `${clampedLeft}px`;
				resizableElement.domNode.style.top = `${clampedTop}px`;
			} else {
				const left = (containerDimension.width - width) / 2;
				const top = editorPart.maximized
					? (containerDimension.height - height) / 2 // center in full window to stay close to title bar
					: titleBarOffset + (availableHeight - height) / 2;
				resizableElement.domNode.style.left = `${left}px`;
				resizableElement.domNode.style.top = `${top}px`;
			}

			editorPart.layout(width - MODAL_BORDER_SIZE, height - MODAL_BORDER_SIZE - MODAL_HEADER_HEIGHT, 0, 0);
		};
		disposables.add(Event.runAndSubscribe(this.layoutService.onDidLayoutMainContainer, layoutModal));
		disposables.add(editorPart.onDidChangeMaximized(() => layoutModal()));
		disposables.add(editorPart.onDidRequestLayout(() => layoutModal()));

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
}

interface IPosition {
	left: number;
	top: number;
}

class ModalEditorPartImpl extends EditorPart implements IModalEditorPart {

	private static COUNTER = 1;

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

	private _size: IDimension | undefined;
	get size(): IDimension | undefined { return this._size; }
	set size(value: IDimension | undefined) { this._size = value; }

	private _position: IPosition | undefined;
	get position(): IPosition | undefined { return this._position; }
	set position(value: IPosition | undefined) { this._position = value; }

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
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		const id = ModalEditorPartImpl.COUNTER++;
		super(editorPartsView, `workbench.parts.modalEditor.${id}`, localize('modalEditorPart', "Modal Editor Area"), windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);

		this._maximized = options?.maximized ?? false;
		this._size = options?.size;
		this._position = options?.position;
		this._navigation = options?.navigation;

		// When restoring a maximized state with custom layout,
		// initialize saved state so un-maximize can restore it
		if (this._maximized) {
			this.savedSize = this._size;
			this.savedPosition = this._position;
		}

		this.enforceModalPartOptions();
	}

	override create(parent: HTMLElement, options?: object): void {
		this.previousMainWindowActiveElement = mainWindow.document.activeElement;

		super.create(parent, options);
	}

	private enforceModalPartOptions(): void {
		this.optionsDisposable.value = this.enforcePartOptions({
			showTabs: 'none',
			enablePreview: true,
			closeEmptyGroups: true,
			tabActionCloseVisibility: false,
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

	handleHeaderDoubleClick(): void {
		if (this._maximized) {
			// Clear saved state so that toggleMaximized restores to default
			this.savedSize = undefined;
			this.savedPosition = undefined;
			this.toggleMaximized();
		} else if (this._size) {
			this._size = undefined;
			this._position = undefined;
			this._onDidRequestLayout.fire();
		} else {
			this.toggleMaximized(); // maximize
		}
	}

	protected override handleContextKeys(): void {
		const isModalEditorPartContext = EditorPartModalContext.bindTo(this.scopedContextKeyService);
		isModalEditorPartContext.set(true);

		const isMaximizedContext = EditorPartModalMaximizedContext.bindTo(this.scopedContextKeyService);
		isMaximizedContext.set(this._maximized);
		this._register(this.onDidChangeMaximized(maximized => isMaximizedContext.set(maximized)));

		const hasNavigationContext = EditorPartModalNavigationContext.bindTo(this.scopedContextKeyService);
		hasNavigationContext.set(!!this._navigation && this._navigation.total > 1);
		this._register(this.onDidChangeNavigation(navigation => hasNavigationContext.set(!!navigation && navigation.total > 1)));

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

		this.doClose({ mergeConfirmingEditorsToMainPart: false });
	}

	protected override saveState(): void {
		return; // disabled, modal editor part state is not persisted
	}

	close(options?: { mergeAllEditorsToMainPart?: boolean }): boolean {
		return this.doClose({ ...options, mergeConfirmingEditorsToMainPart: true });
	}

	private doClose(options?: { mergeAllEditorsToMainPart?: boolean; mergeConfirmingEditorsToMainPart?: boolean }): boolean {
		let result = true;
		if (options?.mergeConfirmingEditorsToMainPart) {

			// First close all editors that are non-confirming (unless we merge all)
			if (!options.mergeAllEditorsToMainPart) {
				for (const group of this.groups) {
					group.closeAllEditors({ excludeConfirming: true });
				}
			}

			// Then merge remaining to main part
			result = this.mergeGroupsToMainPart();
			if (!result) {
				return false; // Do not close when editors could not be merged back
			}
		}

		this._onWillClose.fire();

		return result;
	}

	private mergeGroupsToMainPart(): boolean {
		if (!this.groups.some(group => group.count > 0)) {
			return true; // skip if we have no editors opened
		}

		// Find the most recent group that is not locked
		let targetGroup: IEditorGroupView | undefined = undefined;
		for (const group of this.editorPartsView.mainPart.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			if (!group.isLocked) {
				targetGroup = group;
				break;
			}
		}

		if (!targetGroup) {
			targetGroup = this.editorPartsView.mainPart.addGroup(this.editorPartsView.mainPart.activeGroup, this.partOptions.openSideBySideDirection === 'right' ? GroupDirection.RIGHT : GroupDirection.DOWN);
		}

		const result = this.mergeAllGroups(targetGroup, {
			// Try to reduce the impact of closing the modal
			// as much as possible by not changing existing editors
			// in the main window.
			preserveExistingIndex: true
		});
		targetGroup.focus();

		return result;
	}

	override dispose(): void {
		this._navigation = undefined; // ensure to free the reference to the navigation closure

		super.dispose();
	}
}
