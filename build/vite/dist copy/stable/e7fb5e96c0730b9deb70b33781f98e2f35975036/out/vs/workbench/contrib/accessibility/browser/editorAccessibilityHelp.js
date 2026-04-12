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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { AccessibilityHelpNLS } from '../../../../editor/common/standaloneStrings.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityHelpAction } from './accessibleViewActions.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { CommentAccessibilityHelpNLS } from '../../comments/browser/commentsAccessibility.js';
import { CommentContextKeys } from '../../comments/common/commentContextKeys.js';
import { NEW_UNTITLED_FILE_COMMAND_ID } from '../../files/browser/fileConstants.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ctxHasEditorModification, ctxHasRequestInProgress } from '../../chat/browser/chatEditing/chatEditingEditorContextKeys.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
export class EditorAccessibilityHelpContribution extends Disposable {
    constructor() {
        super();
        this._register(AccessibilityHelpAction.addImplementation(90, 'editor', async (accessor) => {
            const codeEditorService = accessor.get(ICodeEditorService);
            const accessibleViewService = accessor.get(IAccessibleViewService);
            const instantiationService = accessor.get(IInstantiationService);
            const commandService = accessor.get(ICommandService);
            let codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
            if (!codeEditor) {
                await commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
                codeEditor = codeEditorService.getActiveCodeEditor();
            }
            accessibleViewService.show(instantiationService.createInstance(EditorAccessibilityHelpProvider, codeEditor));
        }));
    }
}
let EditorAccessibilityHelpProvider = class EditorAccessibilityHelpProvider extends Disposable {
    onClose() {
        this._editor.focus();
    }
    constructor(_editor, _keybindingService, _contextKeyService, accessibilityService, _configurationService) {
        super();
        this._editor = _editor;
        this._keybindingService = _keybindingService;
        this._contextKeyService = _contextKeyService;
        this.accessibilityService = accessibilityService;
        this._configurationService = _configurationService;
        this.id = "editor" /* AccessibleViewProviderId.Editor */;
        this.options = { type: "help" /* AccessibleViewType.Help */, readMoreUrl: 'https://go.microsoft.com/fwlink/?linkid=851010' };
        this.verbositySettingKey = "accessibility.verbosity.editor" /* AccessibilityVerbositySettingId.Editor */;
    }
    provideContent() {
        const options = this._editor.getOptions();
        const content = [];
        if (options.get(70 /* EditorOption.inDiffEditor */)) {
            if (options.get(104 /* EditorOption.readOnly */)) {
                content.push(AccessibilityHelpNLS.readonlyDiffEditor);
            }
            else {
                content.push(AccessibilityHelpNLS.editableDiffEditor);
            }
        }
        else {
            if (options.get(104 /* EditorOption.readOnly */)) {
                content.push(AccessibilityHelpNLS.readonlyEditor);
            }
            else {
                content.push(AccessibilityHelpNLS.editableEditor);
            }
        }
        if (this.accessibilityService.isScreenReaderOptimized() && this._configurationService.getValue('accessibility.windowTitleOptimized')) {
            content.push(AccessibilityHelpNLS.defaultWindowTitleIncludesEditorState);
        }
        else {
            content.push(AccessibilityHelpNLS.defaultWindowTitleExcludingEditorState);
        }
        content.push(AccessibilityHelpNLS.toolbar);
        const chatEditInfo = getChatEditInfo(this._keybindingService, this._contextKeyService, this._editor);
        if (chatEditInfo) {
            content.push(chatEditInfo);
        }
        content.push(AccessibilityHelpNLS.listSignalSounds);
        content.push(AccessibilityHelpNLS.listAlerts);
        content.push(AccessibilityHelpNLS.announceCursorPosition);
        content.push(AccessibilityHelpNLS.focusNotifications);
        const chatCommandInfo = getChatCommandInfo(this._keybindingService, this._contextKeyService);
        if (chatCommandInfo) {
            content.push(chatCommandInfo);
        }
        const commentCommandInfo = getCommentCommandInfo(this._keybindingService, this._contextKeyService, this._editor);
        if (commentCommandInfo) {
            content.push(commentCommandInfo);
        }
        content.push(AccessibilityHelpNLS.suggestActions);
        content.push(AccessibilityHelpNLS.acceptSuggestAction);
        content.push(AccessibilityHelpNLS.toggleSuggestionFocus);
        if (options.get(131 /* EditorOption.stickyScroll */).enabled) {
            content.push(AccessibilityHelpNLS.stickScroll);
        }
        if (options.get(164 /* EditorOption.tabFocusMode */)) {
            content.push(AccessibilityHelpNLS.tabFocusModeOnMsg);
        }
        else {
            content.push(AccessibilityHelpNLS.tabFocusModeOffMsg);
        }
        content.push(AccessibilityHelpNLS.codeFolding);
        content.push(AccessibilityHelpNLS.intellisense);
        content.push(AccessibilityHelpNLS.showOrFocusHover);
        content.push(AccessibilityHelpNLS.goToSymbol);
        content.push(AccessibilityHelpNLS.startDebugging);
        content.push(AccessibilityHelpNLS.setBreakpoint);
        content.push(AccessibilityHelpNLS.debugExecuteSelection);
        content.push(AccessibilityHelpNLS.addToWatch);
        return content.join('\n');
    }
};
EditorAccessibilityHelpProvider = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextKeyService),
    __param(3, IAccessibilityService),
    __param(4, IConfigurationService)
], EditorAccessibilityHelpProvider);
export function getCommentCommandInfo(keybindingService, contextKeyService, editor) {
    const editorContext = contextKeyService.getContext(editor.getDomNode());
    if (editorContext.getValue(CommentContextKeys.activeEditorHasCommentingRange.key)) {
        return [CommentAccessibilityHelpNLS.intro, CommentAccessibilityHelpNLS.addComment, CommentAccessibilityHelpNLS.nextCommentThread, CommentAccessibilityHelpNLS.previousCommentThread, CommentAccessibilityHelpNLS.nextRange, CommentAccessibilityHelpNLS.previousRange].join('\n');
    }
    return;
}
export function getChatCommandInfo(keybindingService, contextKeyService) {
    if (ChatContextKeys.enabled.getValue(contextKeyService)) {
        return [AccessibilityHelpNLS.quickChat, AccessibilityHelpNLS.startInlineChat].join('\n');
    }
    return;
}
export function getChatEditInfo(keybindingService, contextKeyService, editor) {
    const editorContext = contextKeyService.getContext(editor.getDomNode());
    if (editorContext.getValue(ctxHasEditorModification.key)) {
        return AccessibilityHelpNLS.chatEditorModification + '\n' + AccessibilityHelpNLS.chatEditActions;
    }
    else if (editorContext.getValue(ctxHasRequestInProgress.key)) {
        return AccessibilityHelpNLS.chatEditorRequestInProgress;
    }
    return;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQWNjZXNzaWJpbGl0eUhlbHAuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvZWRpdG9yQWNjZXNzaWJpbGl0eUhlbHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRTlGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDL0UsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDOUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDakYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHNCQUFzQixFQUF3RyxNQUFNLDhEQUE4RCxDQUFDO0FBRTVNLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ25JLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxN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