/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hide, show } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { isNative } from 'vs/base/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { getTitleBarStyle } from 'vs/platform/window/common/window';
import { IEditorGroupView, IEditorPartsView } from 'vs/workbench/browser/parts/editor/editor';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IAuxiliaryTitlebarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { WindowTitle } from 'vs/workbench/browser/parts/titlebar/windowTitle';
import { IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { GroupsOrder, IAuxiliaryEditorPart } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStatusbarService } from 'vs/workbench/services/statusbar/browser/statusbar';
import { ITitleService } from 'vs/workbench/services/title/browser/titleService';

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
		@IEditorService private readonly editorService: IEditorService
	) {
	}

	async create(label: string, options?: IAuxiliaryWindowOpenOptions): Promise<{ readonly part: AuxiliaryEditorPartImpl; readonly instantiationService: IInstantiationService; readonly disposables: DisposableStore }> {

		function computeEditorPartHeightOffset(): number {
			let editorPartHeightOffset = 0;

			if (statusBarVisible) {
				editorPartHeightOffset += statusbarPart.height;
			}

			if (titlebarPart) {
				editorPartHeightOffset += titlebarPart.height;
			}

			return editorPartHeightOffset;
		}

		function updateStatusbarVisibility(fromEvent: boolean): void {
			if (statusBarVisible) {
				show(statusbarPart.container);
			} else {
				hide(statusbarPart.container);
			}

			updateEditorPartHeight(fromEvent);
		}

		function updateEditorPartHeight(fromEvent: boolean): void {
			editorPartContainer.style.height = `calc(100% - ${computeEditorPartHeightOffset()}px)`;

			if (fromEvent) {
				auxiliaryWindow.layout();
			}
		}

		const disposables = new DisposableStore();

		// Auxiliary Window
		const auxiliaryWindow = disposables.add(await this.auxiliaryWindowService.open(options));

		// Editor Part
		const editorPartContainer = document.createElement('div');
		editorPartContainer.classList.add('part', 'editor');
		editorPartContainer.setAttribute('role', 'main');
		editorPartContainer.style.position = 'relative';
		auxiliaryWindow.container.appendChild(editorPartContainer);

		const editorPart = disposables.add(this.instantiationService.createInstance(AuxiliaryEditorPartImpl, auxiliaryWindow.window.vscodeWindowId, this.editorPartsView, label));
		disposables.add(this.editorPartsView.registerPart(editorPart));
		editorPart.create(editorPartContainer, { restorePreviousState: false });

		// Titlebar
		let titlebarPart: IAuxiliaryTitlebarPart | undefined = undefined;
		const useCustomTitle = isNative && getTitleBarStyle(this.configurationService) === 'custom'; // custom title in aux windows only enabled in native
		if (useCustomTitle) {
			titlebarPart = disposables.add(this.titleService.createAuxiliaryTitlebarPart(auxiliaryWindow.container, editorPart));
			disposables.add(titlebarPart.onDidChange(() => updateEditorPartHeight(true)));
		} else {
			disposables.add(this.instantiationService.createInstance(WindowTitle, auxiliaryWindow.window, editorPart));
		}

		// Statusbar
		const statusbarPart = disposables.add(this.statusbarService.createAuxiliaryStatusbarPart(auxiliaryWindow.container));
		let statusBarVisible = this.configurationService.getValue<boolean>(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY)) {
				statusBarVisible = this.configurationService.getValue<boolean>(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;

				updateStatusbarVisibility(true);
			}
		}));

		updateStatusbarVisibility(false);

		// Lifecycle
		const editorCloseListener = disposables.add(Event.once(editorPart.onWillClose)(() => auxiliaryWindow.window.close()));
		disposables.add(Event.once(auxiliaryWindow.onWillClose)(() => {
			if (disposables.isDisposed) {
				return; // the close happened as part of an earlier dispose call
			}

			editorCloseListener.dispose();
			editorPart.close();
			disposables.dispose();
		}));
		disposables.add(Event.once(this.lifecycleService.onDidShutdown)(() => disposables.dispose()));

		// Layout
		disposables.add(auxiliaryWindow.onDidLayout(dimension => {
			const titlebarPartHeight = titlebarPart?.height ?? 0;
			if (titlebarPart) {
				titlebarPart.layout(dimension.width, titlebarPartHeight, 0, 0);
			}

			const editorPartHeight = dimension.height - computeEditorPartHeightOffset();
			editorPart.layout(dimension.width, editorPartHeight, titlebarPartHeight, 0);

			statusbarPart.layout(dimension.width, statusbarPart.height, dimension.height - statusbarPart.height, 0);
		}));
		auxiliaryWindow.layout();

		// Have a InstantiationService that is scoped to the auxiliary window
		const instantiationService = this.instantiationService.createChild(new ServiceCollection(
			[IStatusbarService, this.statusbarService.createScoped(statusbarPart, disposables)],
			[IEditorService, this.editorService.createScoped(editorPart, disposables)]
		));

		return {
			part: editorPart,
			instantiationService,
			disposables
		};
	}
}

class AuxiliaryEditorPartImpl extends EditorPart implements IAuxiliaryEditorPart {

	private static COUNTER = 1;

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose = this._onWillClose.event;

	constructor(
		readonly windowId: number,
		editorPartsView: IEditorPartsView,
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
		super(editorPartsView, `workbench.parts.auxiliaryEditor.${id}`, groupsLabel, true, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
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

		this.doClose(false /* do not merge any groups to main part */);
	}

	protected override saveState(): void {
		return; // TODO support auxiliary editor state
	}

	close(): void {
		this.doClose(true /* merge all groups to main part */);
	}

	private doClose(mergeGroupsToMainPart: boolean): void {
		if (mergeGroupsToMainPart && this.groups.some(group => group.count > 0)) {
			this.mergeAllGroups(this.editorPartsView.mainPart.activeGroup);
		}

		this._onWillClose.fire();
	}
}
