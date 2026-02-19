/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modalEditorPart.css';
import { $, addDisposableListener, append, EventHelper, EventType, hide, isHTMLElement, show } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
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
import { Verbosity } from '../../../common/editor.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CLOSE_MODAL_EDITOR_COMMAND_ID, MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID, NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID, NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID, TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID } from './editorCommands.js';
import { IModalEditorNavigation, IModalEditorPartOptions } from '../../../../platform/editor/common/editor.js';

const defaultModalEditorAllowableCommands = new Set([
	'workbench.action.quit',
	'workbench.action.reloadWindow',
	'workbench.action.closeActiveEditor',
	'workbench.action.closeAllEditors',
	'workbench.action.files.save',
	'workbench.action.files.saveAll',
	CLOSE_MODAL_EDITOR_COMMAND_ID,
	MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
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

		disposables.add(addDisposableListener(modalElement, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);

			// Close on Escape
			if (event.equals(KeyCode.Escape)) {
				EventHelper.stop(event, true);

				editorPart.close();
			}

			// Prevent unsupported commands
			else {
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

		const shadowElement = modalElement.appendChild($('.modal-editor-shadow'));

		// Editor part container
		const titleId = 'modal-editor-title';
		const editorPartContainer = $('.part.editor.modal-editor-part', {
			role: 'dialog',
			'aria-modal': 'true',
			'aria-labelledby': titleId,
			tabIndex: -1
		});
		shadowElement.appendChild(editorPartContainer);

		// Header
		const headerElement = editorPartContainer.appendChild($('.modal-editor-header'));

		// Title element
		const titleElement = append(headerElement, $('div.modal-editor-title'));
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

		// Create toolbar
		disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ModalEditorTitle, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			highlightToggledItems: true,
			menuOptions: { shouldForwardArgs: true }
		}));

		disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, (() => {

			// Update title when active editor changes
			const activeEditor = editorPart.activeGroup.activeEditor;
			titleElement.textContent = activeEditor?.getTitle(Verbosity.MEDIUM) ?? '';

			// Notify editor part that active editor changed
			editorPart.notifyActiveEditorChanged();
		})));

		// Handle double-click on header to toggle maximize
		disposables.add(addDisposableListener(headerElement, EventType.DBLCLICK, e => {
			EventHelper.stop(e);

			editorPart.toggleMaximized();
		}));


		// Layout the modal editor part
		const layoutModal = () => {
			const containerDimension = this.layoutService.mainContainerDimension;
			const titleBarOffset = this.layoutService.mainContainerOffset.top;
			const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);

			let width: number;
			let height: number;

			if (editorPart.maximized) {
				const horizontalPadding = 16;
				const verticalPadding = Math.max(titleBarOffset /* keep away from title bar to prevent clipping issues with WCO */, 16);
				width = Math.max(containerDimension.width - horizontalPadding, 0);
				height = Math.max(availableHeight - verticalPadding, 0);
			} else {
				const maxWidth = 1200;
				const maxHeight = 800;
				const targetWidth = containerDimension.width * 0.8;
				const targetHeight = availableHeight * 0.8;
				width = Math.min(targetWidth, maxWidth, containerDimension.width);
				height = Math.min(targetHeight, maxHeight, availableHeight);
			}

			height = Math.min(height, availableHeight); // Ensure the modal never exceeds available height (below the title bar)

			editorPartContainer.style.width = `${width}px`;
			editorPartContainer.style.height = `${height}px`;

			const borderSize = 2; // Account for 1px border on all sides and modal header height
			const headerHeight = 32 + 1 /* border bottom */;
			editorPart.layout(width - borderSize, height - borderSize - headerHeight, 0, 0);
		};
		disposables.add(Event.runAndSubscribe(this.layoutService.onDidLayoutMainContainer, layoutModal));
		disposables.add(editorPart.onDidChangeMaximized(() => layoutModal()));

		// Dim window controls to match the modal overlay
		this.hostService.setWindowDimmed(mainWindow, true);
		disposables.add(toDisposable(() => this.hostService.setWindowDimmed(mainWindow, false)));

		// Focus the modal
		editorPartContainer.focus();

		return {
			part: editorPart,
			instantiationService: scopedInstantiationService,
			disposables
		};
	}
}

class ModalEditorPartImpl extends EditorPart implements IModalEditorPart {

	private static COUNTER = 1;

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose = this._onWillClose.event;

	private readonly _onDidChangeMaximized = this._register(new Emitter<boolean>());
	readonly onDidChangeMaximized = this._onDidChangeMaximized.event;

	private readonly _onDidChangeNavigation = this._register(new Emitter<IModalEditorNavigation | undefined>());
	readonly onDidChangeNavigation = this._onDidChangeNavigation.event;

	private _maximized = false;
	get maximized(): boolean { return this._maximized; }

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

		this._navigation = options?.navigation;

		this.enforceModalPartOptions();
	}

	override create(parent: HTMLElement, options?: object): void {
		this.previousMainWindowActiveElement = mainWindow.document.activeElement;

		super.create(parent, options);
	}

	private enforceModalPartOptions(): void {
		const editorCount = this.groups.reduce((count, group) => count + group.count, 0);
		this.optionsDisposable.value = this.enforcePartOptions({
			showTabs: editorCount > 1 ? 'multiple' : 'none',
			enablePreview: true,
			closeEmptyGroups: true,
			tabActionCloseVisibility: editorCount > 1,
			editorActionsLocation: 'default',
			tabHeight: 'default',
			wrapTabs: false,
			allowDropIntoGroup: false
		});
	}

	notifyActiveEditorChanged(): void {
		this.enforceModalPartOptions();
	}

	updateOptions(options?: IModalEditorPartOptions): void {
		this._navigation = options?.navigation;

		this._onDidChangeNavigation.fire(options?.navigation);
	}

	toggleMaximized(): void {
		this._maximized = !this._maximized;

		this._onDidChangeMaximized.fire(this._maximized);
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
