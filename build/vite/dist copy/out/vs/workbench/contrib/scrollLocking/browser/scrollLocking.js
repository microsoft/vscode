/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { SideBySideEditor } from '../../../browser/parts/editor/sideBySideEditor.js';
import { isEditorPaneWithScrolling } from '../../../common/editor.js';
import { ReentrancyBarrier } from '../../../../base/common/controlFlow.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
let SyncScroll = class SyncScroll extends Disposable {
    static { this.ID = 'workbench.contrib.syncScrolling'; }
    constructor(editorService, statusbarService) {
        super();
        this.editorService = editorService;
        this.statusbarService = statusbarService;
        this.paneInitialScrollTop = new Map();
        this.syncScrollDispoasbles = this._register(new DisposableStore());
        this.paneDisposables = this._register(new DisposableStore());
        this.statusBarEntry = this._register(new MutableDisposable());
        this.isActive = false;
        // makes sure that the onDidEditorPaneScroll is not called multiple times for the same event
        this._reentrancyBarrier = new ReentrancyBarrier();
        this.registerActions();
    }
    registerActiveListeners() {
        this.syncScrollDispoasbles.add(this.editorService.onDidVisibleEditorsChange(() => this.trackVisiblePanes()));
    }
    activate() {
        this.registerActiveListeners();
        this.trackVisiblePanes();
    }
    toggle() {
        if (this.isActive) {
            this.deactivate();
        }
        else {
            this.activate();
        }
        this.isActive = !this.isActive;
        this.toggleStatusbarItem(this.isActive);
    }
    trackVisiblePanes() {
        this.paneDisposables.clear();
        this.paneInitialScrollTop.clear();
        for (const pane of this.getAllVisiblePanes()) {
            if (!isEditorPaneWithScrolling(pane)) {
                continue;
            }
            this.paneInitialScrollTop.set(pane, pane.getScrollPosition());
            this.paneDisposables.add(pane.onDidChangeScroll(() => this._reentrancyBarrier.runExclusivelyOrSkip(() => {
                this.onDidEditorPaneScroll(pane);
            })));
        }
    }
    onDidEditorPaneScroll(scrolledPane) {
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
    getAllVisiblePanes() {
        const panes = [];
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
    deactivate() {
        this.paneDisposables.clear();
        this.syncScrollDispoasbles.clear();
        this.paneInitialScrollTop.clear();
    }
    // Actions & Commands
    toggleStatusbarItem(active) {
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
                }, 'status.scrollLockingEnabled', 1 /* StatusbarAlignment.RIGHT */, 102);
            }
        }
        else {
            this.statusBarEntry.clear();
        }
    }
    registerActions() {
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
                    f1: true,
                    metadata: {
                        description: localize('synchronizeScrolling', "Synchronize Scrolling Editors"),
                    }
                });
            }
            run() {
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
            run(accessor) {
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
    dispose() {
        this.deactivate();
        super.dispose();
    }
};
SyncScroll = __decorate([
    __param(0, IEditorService),
    __param(1, IStatusbarService)
], SyncScroll);
export { SyncScroll };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Nyb2xsTG9ja2luZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Njcm9sbExvY2tpbmcvYnJvd3Nlci9zY3JvbGxMb2NraW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFdEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFDMUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVyRixPQUFPLEVBQTBDLHlCQUF5QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDOUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBMkIsaUJBQWlCLEVBQXNCLE1BQU0sa0RBQWtELENBQUM7QUFFM0gsSUFBTSxVQUFVLEdBQWhCLE1BQU0sVUFBVyxTQUFRLFVBQVU7YUFFekIsT0FBRSxHQUFHLGlDQUFpQyxBQUFwQyxDQUFxQztJQVd2RCxZQUNpQixhQUE4QyxFQUMzQyxnQkFBb0Q7UUFFdkUsS0FBSyxFQUFFLENBQUM7UUFIeUIsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBQzFCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFYdkQseUJBQW9C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