/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import * as nls from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IWebviewService, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE } from '../../webview/browser/webview.js';
import { WebviewEditor } from './webviewEditor.js';
import { WebviewInput } from './webviewEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
const webviewActiveContextKeyExpr = ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', WebviewEditor.ID), EditorContextKeys.focus.toNegated() /* https://github.com/microsoft/vscode/issues/58668 */);
export class ShowWebViewEditorFindWidgetAction extends Action2 {
    static { this.ID = 'editor.action.webvieweditor.showFind'; }
    static { this.LABEL = nls.localize('editor.action.webvieweditor.showFind', "Show find"); }
    constructor() {
        super({
            id: ShowWebViewEditorFindWidgetAction.ID,
            title: ShowWebViewEditorFindWidgetAction.LABEL,
            keybinding: {
                when: ContextKeyExpr.and(webviewActiveContextKeyExpr, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED),
                primary: 2048 /* KeyMod.CtrlCmd */ | 36 /* KeyCode.KeyF */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor) {
        getActiveWebviewEditor(accessor)?.showFind();
    }
}
export class HideWebViewEditorFindCommand extends Action2 {
    static { this.ID = 'editor.action.webvieweditor.hideFind'; }
    static { this.LABEL = nls.localize('editor.action.webvieweditor.hideFind', "Stop find"); }
    constructor() {
        super({
            id: HideWebViewEditorFindCommand.ID,
            title: HideWebViewEditorFindCommand.LABEL,
            keybinding: {
                when: ContextKeyExpr.and(webviewActiveContextKeyExpr, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE),
                primary: 9 /* KeyCode.Escape */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor) {
        getActiveWebviewEditor(accessor)?.hideFind();
    }
}
export class WebViewEditorFindNextCommand extends Action2 {
    static { this.ID = 'editor.action.webvieweditor.findNext'; }
    static { this.LABEL = nls.localize('editor.action.webvieweditor.findNext', 'Find next'); }
    constructor() {
        super({
            id: WebViewEditorFindNextCommand.ID,
            title: WebViewEditorFindNextCommand.LABEL,
            keybinding: {
                when: ContextKeyExpr.and(webviewActiveContextKeyExpr, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED),
                primary: 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor) {
        getActiveWebviewEditor(accessor)?.runFindAction(false);
    }
}
export class WebViewEditorFindPreviousCommand extends Action2 {
    static { this.ID = 'editor.action.webvieweditor.findPrevious'; }
    static { this.LABEL = nls.localize('editor.action.webvieweditor.findPrevious', 'Find previous'); }
    constructor() {
        super({
            id: WebViewEditorFindPreviousCommand.ID,
            title: WebViewEditorFindPreviousCommand.LABEL,
            keybinding: {
                when: ContextKeyExpr.and(webviewActiveContextKeyExpr, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED),
                primary: 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor) {
        getActiveWebviewEditor(accessor)?.runFindAction(true);
    }
}
export class ReloadWebviewAction extends Action2 {
    static { this.ID = 'workbench.action.webview.reloadWebviewAction'; }
    static { this.LABEL = nls.localize2('refreshWebviewLabel', "Reload Webviews"); }
    constructor() {
        super({
            id: ReloadWebviewAction.ID,
            title: ReloadWebviewAction.LABEL,
            category: Categories.Developer,
            menu: [{
                    id: MenuId.CommandPalette
                }]
        });
    }
    async run(accessor) {
        const webviewService = accessor.get(IWebviewService);
        for (const webview of webviewService.webviews) {
            webview.reload();
        }
    }
}
function getActiveWebviewEditor(accessor) {
    const editorService = accessor.get(IEditorService);
    const activeEditor = editorService.activeEditor;
    return activeEditor instanceof WebviewInput ? activeEditor.webview : undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld0NvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2Vidmlld1BhbmVsL2Jyb3dzZXIvd2Vidmlld0NvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFHdEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsOENBQThDLEVBQUUsOENBQThDLEVBQUUsOENBQThDLEVBQVksTUFBTSxrQ0FBa0MsQ0FBQztBQUM3TixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbkQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVsRixNQUFNLDJCQUEyQixHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQyxzREFBc0QsQ0FBRSxDQUFDO0FBRTdNLE1BQU0sT0FBTyxpQ0FBa0MsU0FBUSxPQUFPO2FBQ3RDLE9BQUUsR0FBRyxzQ0FBc0MsQ0FBQzthQUM1QyxVQUFLLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSxX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