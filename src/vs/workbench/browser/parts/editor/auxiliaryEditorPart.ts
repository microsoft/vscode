/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onDidChangeFullscreen } from '../../../../base/browser/browser.js';
import { $, getActiveWindow, hide, show } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, markAsSingleton, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isNative } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { hasCustomTitlebar } from '../../../../platform/window/common/window.js';
import { IEditorGroupView, IEditorPartsView } from './editor.js';
import { EditorPart, IEditorPartUIState } from './editorPart.js';
import { IAuxiliaryTitlebarPart } from '../titlebar/titlebarPart.js';
import { WindowTitle } from '../titlebar/windowTitle.js';
import { IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { GroupDirection, GroupsOrder, IAuxiliaryEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, shouldShowCustomTitleBar } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { ITitleService } from '../../../services/title/browser/titleService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IsAuxiliaryWindowContext, IsAuxiliaryWindowFocusedContext, IsCompactTitleBarContext } from '../../../common/contextkeys.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { GroupIdentifier } from '../../../common/editor.js';

export interface IAuxiliaryEditorPartOpenOptions extends IAuxiliaryWindowOpenOptions {
	readonly state?: IEditorPartUIState;
}

export interface ICreateAuxiliaryEditorPartResult {
	readonly part: AuxiliaryEditorPartImpl;
	readonly instantiationService: IInstantiationService;
	readonly disposables: DisposableStore;
}

const compactWindowEmitter = markAsSingleton(new Emitter<{ windowId: number; compact: boolean | 'toggle' }>());

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleCompactAuxiliaryWindow',
			title: localize2('toggleCompactAuxiliaryWindow', "Toggle Window Compact Mode"),
			category: Categories.View,
			f1: true,
			precondition: IsAuxiliaryWindowFocusedContext
		});
	}

	override async run(): Promise<void> {
		compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: 'toggle' });
	}
});

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.enableCompactAuxiliaryWindow',
			title: localize('enableCompactAuxiliaryWindow', "Turn On Compact Mode"),
			icon: Codicon.screenFull,
			menu: {
				id: MenuId.LayoutControlMenu,
				when: ContextKeyExpr.and(IsCompactTitleBarContext.toNegated(), IsAuxiliaryWindowContext),
				order: 0
			}
		});
	}

	override async run(): Promise<void> {
		compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: true });
	}
});

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.disableCompactAuxiliaryWindow',
			title: localize('disableCompactAuxiliaryWindow', "Turn Off Compact Mode"),
			icon: Codicon.screenNormal,
			menu: {
				id: MenuId.LayoutControlMenu,
				when: ContextKeyExpr.and(IsCompactTitleBarContext, IsAuxiliaryWindowContext),
				order: 0
			}
		});
	}

	override async run(): Promise<void> {
		compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: false });
	}
});

export class AuxiliaryEditorPart {

	private static STATUS_BAR_VISIBILITY = 'workbench.statusBar.visible';

	constructor(
		private readonly editorPartsView: IEditorPartsView,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ITitleService private readonly titleService: ITitleService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
	}

	async create(label: string, options?: IAuxiliaryEditorPartOpenOptions): Promise<ICreateAuxiliaryEditorPartResult> {
		const that = this;
		const disposables = new DisposableStore();

		let compact = Boolean(options?.compact);

		function computeEditorPartHeightOffset(): number {
			let editorPartHeightOffset = 0;

			if (statusbarVisible) {
				editorPartHeightOffset += statusbarPart.height;
			}

			if (titlebarPart && titlebarVisible) {
				editorPartHeightOffset += titlebarPart.height;
			}

			return editorPartHeightOffset;
		}

		function updateStatusbarVisibility(fromEvent: boolean): void {
			if (statusbarVisible) {
				show(statusbarPart.container);
			} else {
				hide(statusbarPart.container);
			}

			if (fromEvent) {
				auxiliaryWindow.layout();
			}
		}

		function updateTitlebarVisibility(fromEvent: boolean): void {
			if (!titlebarPart) {
				return;
			}

			if (titlebarVisible) {
				show(titlebarPart.container);
			} else {
				hide(titlebarPart.container);
			}

			if (fromEvent) {
				auxiliaryWindow.layout();
			}
		}

		function updateCompact(newCompact: boolean): void {
			if (newCompact === compact) {
				return;
			}

			compact = newCompact;
			auxiliaryWindow.updateOptions({ compact });
			titlebarPart?.updateOptions({ compact });
			editorPart.updateOptions({ compact });

			const oldStatusbarVisible = statusbarVisible;
			statusbarVisible = !compact && that.configurationService.getValue<boolean>(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
			if (oldStatusbarVisible !== statusbarVisible) {
				updateStatusbarVisibility(true);
			}
		}

		// Auxiliary Window
		const auxiliaryWindow = disposables.add(await this.auxiliaryWindowService.open(options));

		// Editor Part
		const editorPartContainer = $('.part.editor', { role: 'main' });
		editorPartContainer.style.position = 'relative';
		auxiliaryWindow.container.appendChild(editorPartContainer);

		const editorPart = disposables.add(this.instantiationService.createInstance(AuxiliaryEditorPartImpl, auxiliaryWindow.window.vscodeWindowId, this.editorPartsView, options?.state, label));
		editorPart.updateOptions({ compact });
		disposables.add(this.editorPartsView.registerPart(editorPart));
		editorPart.create(editorPartContainer);

		const scopedEditorPartInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection(
			[IEditorService, this.editorService.createScoped(editorPart, disposables)]
		)));

		// Titlebar
		let titlebarPart: IAuxiliaryTitlebarPart | undefined = undefined;
		let titlebarVisible = false;
		const useCustomTitle = isNative && hasCustomTitlebar(this.configurationService); // custom title in aux windows only enabled in native
		if (useCustomTitle) {
			titlebarPart = disposables.add(this.titleService.createAuxiliaryTitlebarPart(auxiliaryWindow.container, editorPart, scopedEditorPartInstantiationService));
			titlebarPart.updateOptions({ compact });
			titlebarVisible = shouldShowCustomTitleBar(this.configurationService, auxiliaryWindow.window, undefined);

			const handleTitleBarVisibilityEvent = () => {
				const oldTitlebarPartVisible = titlebarVisible;
				titlebarVisible = shouldShowCustomTitleBar(this.configurationService, auxiliaryWindow.window, undefined);
				if (oldTitlebarPartVisible !== titlebarVisible) {
					updateTitlebarVisibility(true);
				}
			};

			disposables.add(titlebarPart.onDidChange(() => auxiliaryWindow.layout()));
			disposables.add(this.layoutService.onDidChangePartVisibility(() => handleTitleBarVisibilityEvent()));
			disposables.add(onDidChangeFullscreen(windowId => {
				if (windowId !== auxiliaryWindow.window.vscodeWindowId) {
					return; // ignore all but our window
				}

				handleTitleBarVisibilityEvent();
			}));

			updateTitlebarVisibility(false);
		} else {
			disposables.add(scopedEditorPartInstantiationService.createInstance(WindowTitle, auxiliaryWindow.window));
		}

		// Statusbar
		const statusbarPart = disposables.add(this.statusbarService.createAuxiliaryStatusbarPart(auxiliaryWindow.container, scopedEditorPartInstantiationService));
		let statusbarVisible = !compact && this.configurationService.getValue<boolean>(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY)) {
				statusbarVisible = !compact && this.configurationService.getValue<boolean>(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;

				updateStatusbarVisibility(true);
			}
		}));

		updateStatusbarVisibility(false);

		// Lifecycle
		const editorCloseListener = disposables.add(Event.once(editorPart.onWillClose)(() => auxiliaryWindow.window.close()));
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
			if (disposables.isDisposed) {
				return; // the close happened as part of an earlier dispose call
			}

			editorCloseListener.dispose();
			editorPart.close();
			disposables.dispose();
		}));
		disposables.add(Event.once(this.lifecycleService.onDidShutdown)(() => disposables.dispose()));
		disposables.add(auxiliaryWindow.onBeforeUnload(event => {
			for (const group of editorPart.groups) {
				for (const editor of group.editors) {
					// Closing an auxiliary window with opened editors
					// will move the editors to the main window. As such,
					// we need to validate that we can move and otherwise
					// prevent the window from closing.
					const canMoveVeto = editor.canMove(group.id, this.editorPartsView.mainPart.activeGroup.id);
					if (typeof canMoveVeto === 'string') {
						group.openEditor(editor);
						event.veto(canMoveVeto);
						break;
					}
				}
			}
		}));

		// Layout: specifically `onWillLayout` to have a chance
		// to build the aux editor part before other components
		// have a chance to react.
		disposables.add(auxiliaryWindow.onWillLayout(dimension => {
			const titlebarPartHeight = titlebarPart?.height ?? 0;
			titlebarPart?.layout(dimension.width, titlebarPartHeight, 0, 0);

			const editorPartHeight = dimension.height - computeEditorPartHeightOffset();
			editorPart.layout(dimension.width, editorPartHeight, titlebarPartHeight, 0);

			statusbarPart.layout(dimension.width, statusbarPart.height, dimension.height - statusbarPart.height, 0);
		}));
		auxiliaryWindow.layout();

		// Compact mode
		disposables.add(compactWindowEmitter.event(e => {
			if (e.windowId === auxiliaryWindow.window.vscodeWindowId) {
				let newCompact: boolean;
				if (typeof e.compact === 'boolean') {
					newCompact = e.compact;
				} else {
					newCompact = !compact;
				}
				updateCompact(newCompact);
			}
		}));

		disposables.add(editorPart.onDidAddGroup(() => {
			updateCompact(false); // leave compact mode when a group is added
		}));

		disposables.add(editorPart.activeGroup.onDidActiveEditorChange(() => {
			if (editorPart.activeGroup.count > 1) {
				updateCompact(false); // leave compact mode when more than 1 editor is active
			}
		}));

		// Have a scoped instantiation service that is scoped to the auxiliary window
		const scopedInstantiationService = disposables.add(scopedEditorPartInstantiationService.createChild(new ServiceCollection(
			[IStatusbarService, this.statusbarService.createScoped(statusbarPart, disposables)]
		)));

		return {
			part: editorPart,
			instantiationService: scopedInstantiationService,
			disposables
		};
	}
}

class AuxiliaryEditorPartImpl extends EditorPart implements IAuxiliaryEditorPart {

	private static COUNTER = 1;

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose = this._onWillClose.event;

	private readonly optionsDisposable = this._register(new MutableDisposable());

	private isCompact = false;

	constructor(
		windowId: number,
		editorPartsView: IEditorPartsView,
		private readonly state: IEditorPartUIState | undefined,
		groupsLabel: string,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		const id = AuxiliaryEditorPartImpl.COUNTER++;
		super(editorPartsView, `workbench.parts.auxiliaryEditor.${id}`, groupsLabel, windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
	}

	updateOptions(options: { compact: boolean }): void {
		this.isCompact = options.compact;

		if (options.compact) {
			if (!this.optionsDisposable.value) {
				this.optionsDisposable.value = this.enforcePartOptions({
					showTabs: 'none',
					closeEmptyGroups: true
				});
			}
		} else {
			this.optionsDisposable.clear();
		}
	}

	override addGroup(location: IEditorGroupView | GroupIdentifier, direction: GroupDirection, groupToCopy?: IEditorGroupView): IEditorGroupView {
		if (this.isCompact) {
			// When in compact mode, we prefer to open groups in the main part
			// as compact mode is typically meant for showing just 1 editor.
			location = this.editorPartsView.mainPart.activeGroup;
		}

		return super.addGroup(location, direction, groupToCopy);
	}

	override removeGroup(group: number | IEditorGroupView, preserveFocus?: boolean): void {

		// Close aux window when last group removed
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

		this.doClose(false /* do not merge any confirming editors to main part */);
	}

	protected override loadState(): IEditorPartUIState | undefined {
		return this.state;
	}

	protected override saveState(): void {
		return; // disabled, auxiliary editor part state is tracked outside
	}

	close(): boolean {
		return this.doClose(true /* merge all confirming editors to main part */);
	}

	private doClose(mergeConfirmingEditorsToMainPart: boolean): boolean {
		let result = true;
		if (mergeConfirmingEditorsToMainPart) {

			// First close all editors that are non-confirming
			for (const group of this.groups) {
				group.closeAllEditors({ excludeConfirming: true });
			}

			// Then merge remaining to main part
			result = this.mergeGroupsToMainPart();
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
			// Try to reduce the impact of closing the auxiliary window
			// as much as possible by not changing existing editors
			// in the main window.
			preserveExistingIndex: true
		});
		targetGroup.focus();

		return result;
	}
}
