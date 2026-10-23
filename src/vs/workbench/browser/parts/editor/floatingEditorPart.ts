/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/floatingEditorPart.css';
import { $, addDisposableListener, append, Dimension, EventHelper, EventType, IDimension, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroupView, IEditorPartsView } from './editor.js';
import { EditorPart, IEditorPartUIState } from './editorPart.js';
import { GroupActivationReason, GroupDirection, GroupsOrder, IFloatingEditorPart, IFloatingEditorPartOptions } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';

/** The space between the part and the edges of the main window. */
const FLOATING_EDITOR_PART_MARGIN = 16;
const FLOATING_EDITOR_PART_BORDER_SIZE = 2; // 1px on each side
const FLOATING_EDITOR_PART_DEFAULT_SIZE = { width: 440, height: 560 };
const FLOATING_EDITOR_PART_DEFAULT_MINIMUM_SIZE = { width: 280, height: 240 };

export interface ICreateFloatingEditorPartResult {
	readonly part: FloatingEditorPartImpl;
	readonly instantiationService: IInstantiationService;
	readonly disposables: DisposableStore;
}

/**
 * Creates editor parts that float over the content of the main window in its bottom right corner, without blocking the
 * rest of the window. See {@link IFloatingEditorPart}.
 */
export class FloatingEditorPart {

	private static nextId = 1;

	constructor(
		private readonly editorPartsView: IEditorPartsView,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
	}

	async create(label: string, options: IFloatingEditorPartOptions): Promise<ICreateFloatingEditorPartResult> {
		const disposables = new DisposableStore();
		const id = FloatingEditorPart.nextId++;

		// Floats in the bottom right corner of the main window, and grows up and to the left when resized
		const resizableElement = new ResizableHTMLElement();
		disposables.add(toDisposable(() => resizableElement.dispose()));
		resizableElement.domNode.classList.add('monaco-floating-editor-part');
		resizableElement.domNode.style.right = `${FLOATING_EDITOR_PART_MARGIN}px`;
		resizableElement.domNode.style.bottom = `${FLOATING_EDITOR_PART_MARGIN}px`;
		resizableElement.enableSashes(true, false, false, true);
		const minimumSize = options.minimumSize ?? FLOATING_EDITOR_PART_DEFAULT_MINIMUM_SIZE;
		resizableElement.minSize = new Dimension(minimumSize.width, minimumSize.height);
		this.layoutService.mainContainer.appendChild(resizableElement.domNode);

		// Context keys of the part, its header included
		const partContextKeyService = disposables.add(this.contextKeyService.createScoped(resizableElement.domNode));
		const partInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, partContextKeyService]
		)));

		const titleId = `floating-editor-title-${id}`;
		const editorPartContainer = append(resizableElement.domNode, $('.part.editor.floating-editor-part', {
			role: 'region',
			'aria-labelledby': titleId,
		}));

		// Header: the title, the actions of the title menu, and closing
		const headerElement = append(editorPartContainer, $('.floating-editor-header'));
		const titleElement = append(headerElement, $('.floating-editor-title'));
		titleElement.id = titleId;
		titleElement.textContent = options.title;
		const actionsContainer = append(headerElement, $('.floating-editor-actions'));

		const editorPart = disposables.add(partInstantiationService.createInstance(
			FloatingEditorPartImpl,
			id,
			mainWindow.vscodeWindowId,
			this.editorPartsView,
			label,
			options.size,
			titleElement,
		));
		disposables.add(this.editorPartsView.registerPart(editorPart));
		editorPart.create(editorPartContainer);

		const scopedInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection(
			[IEditorService, this.editorService.createScoped(editorPart, disposables)]
		)));

		if (options.titleMenu) {
			disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, append(actionsContainer, $('.floating-editor-title-menu')), options.titleMenu, {
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				highlightToggledItems: true,
			}));
		}
		if (options.customizableTitleMenu) {
			disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, append(actionsContainer, $('.floating-editor-title-menu')), options.customizableTitleMenu.menu, {
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
				alwaysShownItems: options.customizableTitleMenu.alwaysShownItems,
			}));
		}
		const closeActionBar = disposables.add(new ActionBar(append(actionsContainer, $('.floating-editor-close'))));
		const closeAction = disposables.add(new Action('workbench.action.closeFloatingEditorPart', localize('closeFloatingEditorPart', "Close"), ThemeIcon.asClassName(Codicon.close), true, async () => { editorPart.close(); }));
		closeActionBar.push(closeAction, { icon: true, label: false });

		// Clicking the header with no other target focuses the part
		disposables.add(addDisposableListener(headerElement, EventType.CLICK, e => {
			if (e.target === headerElement || e.target === titleElement) {
				EventHelper.stop(e);
				editorPart.activeGroup.focus();
			}
		}));

		// Layout: the size, kept within the main window, and the editor part below the header
		const layout = () => {
			const container = this.layoutService.mainContainerDimension;
			const titleBarOffset = this.layoutService.mainContainerOffset.top;
			resizableElement.maxSize = new Dimension(
				Math.max(minimumSize.width, container.width - 2 * FLOATING_EDITOR_PART_MARGIN),
				Math.max(minimumSize.height, container.height - titleBarOffset - 2 * FLOATING_EDITOR_PART_MARGIN)
			);
			resizableElement.layout(editorPart.size.height, editorPart.size.width);
			layoutEditorPart();
		};

		// While resizing, lay out the editor part at most once per animation frame
		const scheduledLayout = disposables.add(new MutableDisposable());
		const scheduleLayoutEditorPart = () => {
			if (!scheduledLayout.value) {
				scheduledLayout.value = scheduleAtNextAnimationFrame(mainWindow, () => layoutEditorPart());
			}
		};
		const layoutEditorPart = () => {
			scheduledLayout.clear();
			const { width, height } = resizableElement.size;
			const headerHeight = headerElement.offsetHeight;
			const bounds = resizableElement.domNode.getBoundingClientRect();
			editorPart.layout(
				Math.max(0, width - FLOATING_EDITOR_PART_BORDER_SIZE),
				Math.max(0, height - FLOATING_EDITOR_PART_BORDER_SIZE - headerHeight),
				bounds.top + FLOATING_EDITOR_PART_BORDER_SIZE / 2 + headerHeight,
				bounds.left + FLOATING_EDITOR_PART_BORDER_SIZE / 2,
			);
		};
		disposables.add(resizableElement.onDidResize(e => {
			if (e.done) {
				layoutEditorPart();
				editorPart.updateSize(resizableElement.size);
			} else {
				scheduleLayoutEditorPart();
			}
		}));
		disposables.add(this.layoutService.onDidLayoutMainContainer(() => layout()));
		disposables.add(editorPart.onDidResetSize(() => layout()));
		layout();

		// Dispose after the part closed, so that all listeners of `onWillClose` run first
		disposables.add(Event.once(editorPart.onDidClose)(() => disposables.dispose()));

		return { part: editorPart, instantiationService: scopedInstantiationService, disposables };
	}

	/**
	 * The size a floating editor part takes unless it is given one: its default size, within the main window.
	 */
	static getDefaultSize(layoutService: IWorkbenchLayoutService): IDimension {
		const container = layoutService.mainContainerDimension;
		return {
			width: Math.min(FLOATING_EDITOR_PART_DEFAULT_SIZE.width, Math.round(container.width / 2)),
			height: Math.min(FLOATING_EDITOR_PART_DEFAULT_SIZE.height, Math.round(container.height * 0.75)),
		};
	}
}

class FloatingEditorPartImpl extends EditorPart implements IFloatingEditorPart {

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose = this._onWillClose.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	/** Fired after {@link onWillClose}, once the part can be disposed. */
	readonly onDidClose = this._onDidClose.event;

	private readonly _onDidChangeSize = this._register(new Emitter<IDimension>());
	readonly onDidChangeSize = this._onDidChangeSize.event;

	private _size: IDimension;
	get size(): IDimension { return this._size; }

	constructor(
		id: number,
		windowId: number,
		editorPartsView: IEditorPartsView,
		groupsLabel: string,
		size: IDimension | undefined,
		private readonly titleElement: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editorPartsView, `workbench.parts.floatingEditor.${id}`, groupsLabel, windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);

		this._size = size ?? FloatingEditorPart.getDefaultSize(layoutService);
	}

	setTitle(title: string): void {
		this.titleElement.textContent = title;
	}

	private readonly _onDidResetSize = this._register(new Emitter<void>());
	/** Fired when the part is reset to its default size, which its layout then applies. */
	readonly onDidResetSize = this._onDidResetSize.event;

	resetSize(): void {
		this._size = FloatingEditorPart.getDefaultSize(this.layoutService);
		this._onDidResetSize.fire();
	}

	/** Records the size the user resized the part to. */
	updateSize(size: IDimension): void {
		if (this._size.width === size.width && this._size.height === size.height) {
			return;
		}
		this._size = { width: size.width, height: size.height };
		this._onDidChangeSize.fire(this._size);
	}

	override removeGroup(group: number | IEditorGroupView, preserveFocus?: boolean): void {

		// Close the part when its last group is removed
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

		// Activate the next group when closing
		const mostRecentlyActiveGroups = this.editorPartsView.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		const nextActiveGroup = mostRecentlyActiveGroups.find(group => group.groupsView !== this);
		if (nextActiveGroup) {
			nextActiveGroup.groupsView.activateGroup(nextActiveGroup, undefined, GroupActivationReason.PART_CLOSE);
		}

		// Focus it, unless that would reveal a hidden main editor part
		if (nextActiveGroup && restoreFocus) {
			const nextGroupInHiddenMainPart = nextActiveGroup.groupsView === this.editorPartsView.mainPart && !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
			if (!nextGroupInHiddenMainPart) {
				nextActiveGroup.focus();
			}
		}

		this.doClose(false /* do not merge any confirming editors to main part */);
	}

	protected override loadState(): IEditorPartUIState | undefined {
		return undefined;
	}

	protected override saveState(): void {
		return; // disabled, floating editor part state is not persisted
	}

	close(): boolean {
		return this.doClose(true /* merge all confirming editors to main part */);
	}

	private doClose(mergeConfirmingEditorsToMainPart: boolean): boolean {
		let result = true;
		if (mergeConfirmingEditorsToMainPart) {

			// First close all editors that are non-confirming
			for (const group of this.groups) {
				group.closeAllEditors({ excludeConfirming: true, force: true });
			}

			// Then merge remaining to main part
			result = this.mergeGroupsToMainPart();
			if (!result) {
				return false; // Do not close when editors could not be merged back
			}
		}

		this._onWillClose.fire();
		this._onDidClose.fire();

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

		const result = this.mergeAllGroups(targetGroup, { preserveExistingIndex: true });
		targetGroup.focus();

		return result;
	}
}
