/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveElement } from '../../../../base/browser/dom.js';
import { RedoCommand, SelectAllCommand, UndoCommand } from '../../../../editor/browser/editorExtensions.js';
import { CopyAction, CutAction, PasteAction } from '../../../../editor/contrib/clipboard/browser/clipboard.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IWebviewService } from './webview.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { WebviewFindAccessibilityHelp } from './webviewFindAccessibilityHelp.js';
const PRIORITY = 100;
function overrideCommandForWebview(command, f) {
    command?.addImplementation(PRIORITY, 'webview', accessor => {
        const webviewService = accessor.get(IWebviewService);
        const webview = webviewService.activeWebview;
        if (webview?.isFocused) {
            f(webview);
            return true;
        }
        // When focused in a custom menu try to fallback to the active webview
        // This is needed for context menu actions and the menubar
        if (getActiveElement()?.classList.contains('action-menu-item')) {
            const editorService = accessor.get(IEditorService);
            if (editorService.activeEditor instanceof WebviewInput) {
                f(editorService.activeEditor.webview);
                return true;
            }
        }
        return false;
    });
}
overrideCommandForWebview(UndoCommand, webview => webview.undo());
overrideCommandForWebview(RedoCommand, webview => webview.redo());
overrideCommandForWebview(SelectAllCommand, webview => webview.selectAll());
overrideCommandForWebview(CopyAction, webview => webview.copy());
overrideCommandForWebview(PasteAction, webview => webview.paste());
overrideCommandForWebview(CutAction, webview => webview.cut());
export const PreventDefaultContextMenuItemsContextKeyName = 'preventDefaultContextMenuItems';
if (CutAction) {
    MenuRegistry.appendMenuItem(MenuId.WebviewContext, {
        command: {
            id: CutAction.id,
            title: nls.localize('cut', "Cut"),
        },
        group: '5_cutcopypaste',
        order: 1,
        when: ContextKeyExpr.not(PreventDefaultContextMenuItemsContextKeyName),
    });
}
if (CopyAction) {
    MenuRegistry.appendMenuItem(MenuId.WebviewContext, {
        command: {
            id: CopyAction.id,
            title: nls.localize('copy', "Copy"),
        },
        group: '5_cutcopypaste',
        order: 2,
        when: ContextKeyExpr.not(PreventDefaultContextMenuItemsContextKeyName),
    });
}
if (PasteAction) {
    MenuRegistry.appendMenuItem(MenuId.WebviewContext, {
        command: {
            id: PasteAction.id,
            title: nls.localize('paste', "Paste"),
        },
        group: '5_cutcopypaste',
        order: 3,
        when: ContextKeyExpr.not(PreventDefaultContextMenuItemsContextKeyName),
    });
}
// Register webview find accessibility help
AccessibleViewRegistry.register(new WebviewFindAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlldy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbkUsT0FBTyxFQUFnQixXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUgsT0FBTyxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0csT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUM5RyxPQUFPLEVBQUUsZUFBZSxFQUFZLE1BQU0sY0FBYyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHakYsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDO0FBRXJCLFNBQVMseUJBQXlCLENBQUMsT0FBaUMsRUFBRSxDQUE4QjtJQUNuRyxPQUFPLEVBQUUsaUJBQWlCLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxRQUFRLENBQUMsRUFBRTtRQUMxRCxNQUFNLGNBQWMsR0FBRyxRQUFRLENB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