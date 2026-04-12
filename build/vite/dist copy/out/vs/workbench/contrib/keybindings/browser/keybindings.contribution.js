/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { showWindowLogActionId } from '../../../services/log/common/logConstants.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { $, addDisposableListener, append, getDomNodePagePosition, getWindows, onDidRegisterWindow } from '../../../../base/browser/dom.js';
import { createCSSRule, createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { Emitter } from '../../../../base/common/event.js';
class ToggleKeybindingsLogAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleKeybindingsLog',
            title: nls.localize2('toggleKeybindingsLog', "Toggle Keyboard Shortcuts Troubleshooting"),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        const logging = accessor.get(IKeybindingService).toggleLogging();
        if (logging) {
            const commandService = accessor.get(ICommandService);
            commandService.executeCommand(showWindowLogActionId);
        }
        if (ToggleKeybindingsLogAction.disposable) {
            ToggleKeybindingsLogAction.disposable.dispose();
            ToggleKeybindingsLogAction.disposable = undefined;
            return;
        }
        const layoutService = accessor.get(ILayoutService);
        const disposables = new DisposableStore();
        const container = layoutService.activeContainer;
        const focusMarker = append(container, $('.focus-troubleshooting-marker'));
        disposables.add(toDisposable(() => focusMarker.remove()));
        // Add CSS rule for focus marker
        const stylesheet = createStyleSheet(undefined, undefined, disposables);
        createCSSRule('.focus-troubleshooting-marker', `
			position: fixed;
			pointer-events: none;
			z-index: 100000;
			background-color: rgba(255, 0, 0, 0.2);
			border: 2px solid rgba(255, 0, 0, 0.8);
			border-radius: 2px;
			display: none;
		`, stylesheet);
        const onKeyDown = disposables.add(new Emitter());
        function registerWindowListeners(window, disposables) {
            disposables.add(addDisposableListener(window, 'keydown', e => onKeyDown.fire(e), true));
        }
        for (const { window, disposables } of getWindows()) {
            registerWindowListeners(window, disposables);
        }
        disposables.add(onDidRegisterWindow(({ window, disposables }) => registerWindowListeners(window, disposables)));
        disposables.add(layoutService.onDidChangeActiveContainer(() => {
            layoutService.activeContainer.appendChild(focusMarker);
        }));
        disposables.add(onKeyDown.event(e => {
            const target = e.target;
            if (target) {
                const position = getDomNodePagePosition(target);
                focusMarker.style.top = `${position.top}px`;
                focusMarker.style.left = `${position.left}px`;
                focusMarker.style.width = `${position.width}px`;
                focusMarker.style.height = `${position.height}px`;
                focusMarker.style.display = 'block';
                // Hide after timeout
                setTimeout(() => {
                    focusMarker.style.display = 'none';
                }, 800);
            }
        }));
        ToggleKeybindingsLogAction.disposable = disposables;
    }
}
registerAction2(ToggleKeybindingsLogAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ3MuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIva2V5YmluZGluZ3MvYnJvd3Nlci9rZXliaW5kaW5ncy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDckYsT0FBTyxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLEVBQUUsc0JBQXNCLEVBQUUsVUFBVSxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDNUksT0FBTyxFQUFFLGFBQWEsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzRCxNQUFNLDBCQUEyQixTQUFRLE9BQU87SUFHL0M7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsdUNBQXVDO1lBQzNDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLHNCQUFzQixF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