/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorPane, IEditorPaneScrollPosition, isEditorPaneWithScrolling } from 'vs/workbench/common/editor';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';

class SyncScrollStatusEntry extends Disposable {

	private readonly syncScrollEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(@IStatusbarService private readonly statusbarService: IStatusbarService) {
		super();
	}

	updateSyncScroll(visible: boolean): void {
		if (visible) {
			if (!this.syncScrollEntry.value) {
				this.syncScrollEntry.value = this.statusbarService.addEntry({
					name: 'Scrolling Locked',
					text: 'Scrolling Locked',
					tooltip: 'Lock Scrolling enabled',
					ariaLabel: 'Scrolling Locked',
					command: {
						id: 'workbench.action.toggleLockedScrolling',
						title: ''
					},
					kind: 'prominent'
				}, 'status.scrollLockingEnabled', StatusbarAlignment.RIGHT, 102);
			}
		} else {
			this.syncScrollEntry.clear();
		}
	}
}

export class SyncScroll extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.syncScrolling';

	private readonly paneInitialScrollTop = new Map<IEditorPane, IEditorPaneScrollPosition | undefined>();

	private readonly syncScrollDispoasbles = this._register(new DisposableStore());
	private readonly paneDisposables = new DisposableStore();

	private statusBarEntries = new Set<SyncScrollStatusEntry>();

	private isActive: boolean = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.registerActions();
	}

	private registerActiveListeners(): void {
		this.syncScrollDispoasbles.add(this.editorService.onDidVisibleEditorsChange(() => this.trackVisiblePanes()));
	}

	private activate(): void {
		this.registerActiveListeners();

		this.trackVisiblePanes();
	}

	toggle(): void {
		if (this.isActive) {
			this.deactivate();
		} else {
			this.activate();
		}

		this.isActive = !this.isActive;

		this.toggleStatusbarItem(this.isActive);
	}

	private trackVisiblePanes(): void {
		this.paneDisposables.clear();
		this.paneInitialScrollTop.clear();

		for (const pane of this.getAllVisiblePanes()) {

			if (!isEditorPaneWithScrolling(pane)) {
				continue;
			}

			this.paneInitialScrollTop.set(pane, pane.getScrollPosition());
			this.paneDisposables.add(pane.onDidChangeScroll(() => this.onDidEditorPaneScroll(pane)));
		}
	}

	private onDidEditorPaneScroll(scrolledPane: IEditorPane) {

		const scrolledPaneInitialOffset = this.paneInitialScrollTop.get(scrolledPane);
		if (scrolledPaneInitialOffset === undefined) {
			throw new Error('Scrolled pane not tracked');
		}

		if (!isEditorPaneWithScrolling(scrolledPane)) {
			throw new Error('Scrolled pane does not support scrolling');
		}

		const scrolledPaneCurrentPosition = scrolledPane.getScrollPosition();
		const scrolledFromInitial = {
			scrollTop: scrolledPaneCurrentPosition.scrollTop - scrolledPaneInitialOffset.scrollTop,
			scrollLeft: scrolledPaneCurrentPosition.scrollLeft !== undefined && scrolledPaneInitialOffset.scrollLeft !== undefined ? scrolledPaneCurrentPosition.scrollLeft - scrolledPaneInitialOffset.scrollLeft : undefined,
		};

		for (const pane of this.getAllVisiblePanes()) {
			if (pane === scrolledPane) {
				continue;
			}

			if (!isEditorPaneWithScrolling(pane)) {
				return;
			}

			const initialOffset = this.paneInitialScrollTop.get(pane);
			if (initialOffset === undefined) {
				throw new Error('Could not find initial offset for pane');
			}

			pane.setScrollPosition({
				scrollTop: initialOffset.scrollTop + scrolledFromInitial.scrollTop,
				scrollLeft: initialOffset.scrollLeft !== undefined && scrolledFromInitial.scrollLeft !== undefined ? initialOffset.scrollLeft + scrolledFromInitial.scrollLeft : undefined,
			});
		}
	}

	private getAllVisiblePanes(): IEditorPane[] {
		const panes: IEditorPane[] = [];

		for (const pane of this.editorService.visibleEditorPanes) {

			if (pane instanceof SideBySideEditor) {
				const primaryPane = pane.getPrimaryEditorPane();
				const secondaryPane = pane.getSecondaryEditorPane();
				if (primaryPane) {
					panes.push(primaryPane);
				}
				if (secondaryPane) {
					panes.push(secondaryPane);
				}
				continue;
			}

			panes.push(pane);
		}

		return panes;
	}

	private deactivate(): void {
		this.paneDisposables.clear();
		this.syncScrollDispoasbles.clear();
		this.paneInitialScrollTop.clear();
	}

	// Actions & Commands

	private createStatusBarItem(instantiationService: IInstantiationService, disposables: DisposableStore): SyncScrollStatusEntry {
		const entry = disposables.add(instantiationService.createInstance(SyncScrollStatusEntry));

		this.statusBarEntries.add(entry);
		disposables.add(toDisposable(() => this.statusBarEntries.delete(entry)));

		return entry;
	}

	private registerStatusBarItems() {
		const entry = this.createStatusBarItem(this.instantiationService, this._store);
		entry.updateSyncScroll(this.isActive);

		this._register(this.editorGroupsService.onDidCreateAuxiliaryEditorPart(({ instantiationService, disposables }) => {
			const entry = this.createStatusBarItem(instantiationService, disposables);
			entry.updateSyncScroll(this.isActive);
		}));
	}

	private toggleStatusbarItem(active: boolean): void {
		for (const item of this.statusBarEntries) {
			item.updateSyncScroll(active);
		}
	}

	private registerActions() {
		const $this = this;

		this.registerStatusBarItems();

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.toggleLockedScrolling',
					title: {
						...localize2('toggleLockedScrolling', "Toggle Locked Scrolling Across Editors"),
						mnemonicTitle: localize({ key: 'miToggleLockedScrolling', comment: ['&& denotes a mnemonic'] }, "Locked Scrolling"),
					},
					category: Categories.View,
					f1: true
				});
			}

			run(): void {
				$this.toggle();
			}
		}));
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.holdLockedScrolling',
					title: {
						...localize2('holdLockedScrolling', "Hold Locked Scrolling Across Editors"),
						mnemonicTitle: localize({ key: 'miHoldLockedScrolling', comment: ['&& denotes a mnemonic'] }, "Locked Scrolling"),
					},
					category: Categories.View,
				});
			}

			run(accessor: ServicesAccessor): void {
				const keybindingService = accessor.get(IKeybindingService);

				// Enable Sync Scrolling while pressed
				$this.toggle();

				const holdMode = keybindingService.enableKeybindingHoldMode('workbench.action.holdLockedScrolling');
				if (!holdMode) {
					return;
				}

				holdMode.finally(() => {
					$this.toggle();
				});
			}
		}));
	}

	override dispose(): void {
		this.statusBarEntries.forEach(entry => entry.dispose());
		this.deactivate();
		super.dispose();
	}
}
