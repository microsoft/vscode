/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorPane, IEditorPaneScrollPosition, isEditorPaneWithScrolling } from 'vs/workbench/common/editor';
import { ReentrancyBarrier } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';

export class SyncScroll extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.syncScrolling';

	private readonly paneInitialScrollTop = new Map<IEditorPane, IEditorPaneScrollPosition | undefined>();

	private readonly syncScrollDispoasbles = this._register(new DisposableStore());
	private readonly paneDisposables = new DisposableStore();

	private statusBarEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	private isActive: boolean = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IStatusbarService private readonly statusbarService: IStatusbarService
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

	// makes sure that the onDidEditorPaneScroll is not called multiple times for the same event
	private _reentrancyBarrier = new ReentrancyBarrier();

	private trackVisiblePanes(): void {
		this.paneDisposables.clear();
		this.paneInitialScrollTop.clear();

		for (const pane of this.getAllVisiblePanes()) {

			if (!isEditorPaneWithScrolling(pane)) {
				continue;
			}

			this.paneInitialScrollTop.set(pane, pane.getScrollPosition());
			this.paneDisposables.add(pane.onDidChangeScroll(() =>
				this._reentrancyBarrier.runExclusively(() => {
					this.onDidEditorPaneScroll(pane);
				})
			));
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
				continue;
			}

			const initialOffset = this.paneInitialScrollTop.get(pane);
			if (initialOffset === undefined) {
				throw new Error('Could not find initial offset for pane');
			}

			const currentPanePosition = pane.getScrollPosition();
			const newPaneScrollPosition = {
				scrollTop: initialOffset.scrollTop + scrolledFromInitial.scrollTop,
				scrollLeft: initialOffset.scrollLeft !== undefined && scrolledFromInitial.scrollLeft !== undefined ? initialOffset.scrollLeft + scrolledFromInitial.scrollLeft : undefined,
			};

			if (currentPanePosition.scrollTop === newPaneScrollPosition.scrollTop && currentPanePosition.scrollLeft === newPaneScrollPosition.scrollLeft) {
				continue;
			}

			pane.setScrollPosition(newPaneScrollPosition);
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

	private toggleStatusbarItem(active: boolean): void {
		if (active) {
			if (!this.statusBarEntry.value) {
				const text = localize('mouseScrolllingLocked', 'Scrolling Locked');
				const tooltip = localize('mouseLockScrollingEnabled', 'Lock Scrolling Enabled');
				this.statusBarEntry.value = this.statusbarService.addEntry({
					name: text,
					text,
					tooltip,
					ariaLabel: text,
					command: {
						id: 'workbench.action.toggleLockedScrolling',
						title: ''
					},
					kind: 'prominent',
					showInAllWindows: true
				}, 'status.scrollLockingEnabled', StatusbarAlignment.RIGHT, 102);
			}
		} else {
			this.statusBarEntry.clear();
		}
	}

	private registerActions() {
		const $this = this;
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
		this.deactivate();
		super.dispose();
	}
}
