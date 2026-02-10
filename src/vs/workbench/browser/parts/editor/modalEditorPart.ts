/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modalEditorPart.css';
import { $, addDisposableListener, append, EventHelper, EventType } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
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
import { GroupDirection, GroupsOrder, IModalEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorPartModalContext } from '../../../common/contextkeys.js';
import { Verbosity } from '../../../common/editor.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';

const defaultModalEditorAllowableCommands = new Set([
	'workbench.action.quit',
	'workbench.action.reloadWindow',
	'workbench.action.closeActiveEditor',
	'workbench.action.closeAllEditors',
	'workbench.action.files.save',
	'workbench.action.files.saveAll',
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
	) {
	}

	async create(): Promise<ICreateModalEditorPartResult> {
		const disposables = new DisposableStore();

		// Create modal container
		const modalElement = $('.monaco-modal-editor-block.dimmed');
		modalElement.tabIndex = -1;
		this.layoutService.mainContainer.appendChild(modalElement);
		disposables.add(toDisposable(() => modalElement.remove()));

		const shadowElement = modalElement.appendChild($('.modal-editor-shadow'));

		// Create editor part container
		const titleId = 'modal-editor-title';
		const editorPartContainer = $('.part.editor.modal-editor-part', {
			role: 'dialog',
			'aria-modal': 'true',
			'aria-labelledby': titleId
		});
		shadowElement.appendChild(editorPartContainer);

		// Create header with title and close button
		const headerElement = editorPartContainer.appendChild($('.modal-editor-header'));

		// Title element (centered)
		const titleElement = append(headerElement, $('div.modal-editor-title'));
		titleElement.id = titleId;
		titleElement.textContent = '';

		// Action buttons
		const actionBarContainer = append(headerElement, $('div.modal-editor-action-container'));

		// Create the editor part
		const editorPart = disposables.add(this.instantiationService.createInstance(
			ModalEditorPartImpl,
			mainWindow.vscodeWindowId,
			this.editorPartsView,
			localize('modalEditorPart', "Modal Editor Area")
		));
		disposables.add(this.editorPartsView.registerPart(editorPart));
		editorPart.create(editorPartContainer);

		// Create scoped instantiation service
		const modalEditorService = this.editorService.createScoped(editorPart, disposables);
		const scopedInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection(
			[IEditorService, modalEditorService]
		)));

		// Create toolbar driven by MenuId.ModalEditorTitle
		disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ModalEditorTitle, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			menuOptions: { shouldForwardArgs: true }
		}));

		disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, (() => {

			// Update title when active editor changes
			const activeEditor = editorPart.activeGroup.activeEditor;
			titleElement.textContent = activeEditor?.getTitle(Verbosity.MEDIUM) ?? '';

			// Notify editor part that active editor changed
			editorPart.notifyActiveEditorChanged();
		})));

		// Handle close on click outside (on the dimmed background)
		disposables.add(addDisposableListener(modalElement, EventType.MOUSE_DOWN, e => {
			if (e.target === modalElement) {
				editorPart.close();
			}
		}));

		// Block certain workbench commands from being dispatched while the modal is open
		disposables.add(addDisposableListener(modalElement, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			const resolved = this.keybindingService.softDispatch(event, this.layoutService.mainContainer);
			if (resolved.kind === ResultKind.KbFound && resolved.commandId) {
				if (
					resolved.commandId.startsWith('workbench.') &&
					!defaultModalEditorAllowableCommands.has(resolved.commandId)
				) {
					EventHelper.stop(event, true);
				}
			}
		}));

		// Handle close event from editor part
		disposables.add(Event.once(editorPart.onWillClose)(() => {
			disposables.dispose();
		}));

		// Layout the modal editor part
		disposables.add(Event.runAndSubscribe(this.layoutService.onDidLayoutMainContainer, () => {
			const containerDimension = this.layoutService.mainContainerDimension;
			const width = Math.min(containerDimension.width * 0.8, 1200);
			const height = Math.min(containerDimension.height * 0.8, 800);

			editorPartContainer.style.width = `${width}px`;
			editorPartContainer.style.height = `${height}px`;

			const borderSize = 2; // Account for 1px border on all sides and modal header height
			const headerHeight = 32 + 1 /* border bottom */;
			editorPart.layout(width - borderSize, height - borderSize - headerHeight, 0, 0);
		}));

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

	private readonly optionsDisposable = this._register(new MutableDisposable());

	constructor(
		windowId: number,
		editorPartsView: IEditorPartsView,
		groupsLabel: string,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		const id = ModalEditorPartImpl.COUNTER++;
		super(editorPartsView, `workbench.parts.modalEditor.${id}`, groupsLabel, windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);

		this.enforceModalPartOptions();
	}

	private enforceModalPartOptions(): void {
		const editorCount = this.groups.reduce((count, group) => count + group.count, 0);
		this.optionsDisposable.value = this.enforcePartOptions({
			showTabs: editorCount > 1 ? 'multiple' : 'none',
			closeEmptyGroups: true,
			tabActionCloseVisibility: editorCount > 1,
			editorActionsLocation: 'default',
			tabHeight: 'default',
			wrapTabs: false
		});
	}

	notifyActiveEditorChanged(): void {
		this.enforceModalPartOptions();
	}

	protected override handleContextKeys(): void {
		const isModalEditorPartContext = EditorPartModalContext.bindTo(this.scopedContextKeyService);
		isModalEditorPartContext.set(true);

		super.handleContextKeys();
	}

	override removeGroup(group: number | IEditorGroupView, preserveFocus?: boolean): void {

		// Close modal when last group removed
		const groupView = this.assertGroupView(group);
		if (this.count === 1 && this.activeGroup === groupView) {
			this.doRemoveLastGroup(preserveFocus);
		}

		// Otherwise delegate to parent implementation
		else {
			super.removeGroup(group, preserveFocus);
		}
	}

	private doRemoveLastGroup(preserveFocus?: boolean): void {
		const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.container);

		// Activate next group
		const mostRecentlyActiveGroups = this.editorPartsView.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		const nextActiveGroup = mostRecentlyActiveGroups[1]; // [0] will be the current group we are about to dispose
		if (nextActiveGroup) {
			nextActiveGroup.groupsView.activateGroup(nextActiveGroup);

			if (restoreFocus) {
				nextActiveGroup.focus();
			}
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
}
