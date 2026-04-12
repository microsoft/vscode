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
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
// Allowed Editor Contributions:
import { MenuPreventer } from '../../codeEditor/browser/menuPreventer.js';
import { EditorDictation } from '../../codeEditor/browser/dictation/editorDictation.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { TabCompletionController } from '../../snippets/browser/tabCompletion.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { clamp } from '../../../../base/common/numbers.js';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { DropIntoEditorController } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { LinkDetector } from '../../../../editor/contrib/links/browser/links.js';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController.js';
import { SelectionClipboardContributionID } from '../../codeEditor/browser/selectionClipboard.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { IUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
export const ctxCommentEditorFocused = new RawContextKey('commentEditorFocused', false);
export const MIN_EDITOR_HEIGHT = 5 * 18;
export const MAX_EDITOR_HEIGHT = 25 * 18;
let SimpleCommentEditor = class SimpleCommentEditor extends CodeEditorWidget {
    constructor(domElement, options, scopedContextKeyService, parentThread, instantiationService, codeEditorService, commandService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, userInteractionService) {
        const codeEditorWidgetOptions = {
            contributions: [
                { id: MenuPreventer.ID, ctor: MenuPreventer, instantiation: 2 /* EditorContributionInstantiation.BeforeFirstInteraction */ },
                { id: ContextMenuController.ID, ctor: ContextMenuController, instantiation: 2 /* EditorContributionInstantiation.BeforeFirstInteraction */ },
                { id: SuggestController.ID, ctor: SuggestController, instantiation: 0 /* EditorContributionInstantiation.Eager */ },
                { id: SnippetController2.ID, ctor: SnippetController2, instantiation: 4 /* EditorContributionInstantiation.Lazy */ },
                { id: TabCompletionController.ID, ctor: TabCompletionController, instantiation: 0 /* EditorContributionInstantiation.Eager */ }, // eager because it needs to define a context key
                { id: EditorDictation.ID, ctor: EditorDictation, instantiation: 4 /* EditorContributionInstantiation.Lazy */ },
                ...EditorExtensionsRegistry.getSomeEditorContributions([
                    CopyPasteController.ID,
                    DropIntoEditorController.ID,
                    LinkDetector.ID,
                    MessageController.ID,
                    ContentHoverController.ID,
                    GlyphHoverController.ID,
                    SelectionClipboardContributionID,
                    InlineCompletionsController.ID,
                    CodeActionController.ID,
                    PlaceholderTextContribution.ID
                ])
            ],
            contextMenuId: MenuId.SimpleEditorContext
        };
        super(domElement, options, codeEditorWidgetOptions, instantiationService, codeEditorService, commandService, scopedContextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, userInteractionService);
        this._commentEditorFocused = ctxCommentEditorFocused.bindTo(scopedContextKeyService);
        this._commentEditorEmpty = CommentContextKeys.commentIsEmpty.bindTo(scopedContextKeyService);
        this._commentEditorEmpty.set(!this.getModel()?.getValueLength());
        this._parentThread = parentThread;
        this._register(this.onDidFocusEditorWidget(_ => this._commentEditorFocused.set(true)));
        this._register(this.onDidChangeModelContent(e => this._commentEditorEmpty.set(!this.getModel()?.getValueLength())));
        this._register(this.onDidBlurEditorWidget(_ => this._commentEditorFocused.reset()));
    }
    getParentThread() {
        return this._parentThread;
    }
    _getActions() {
        return EditorExtensionsRegistry.getEditorActions();
    }
    updateOptions(newOptions) {
        const withLineNumberRemoved = { ...newOptions, lineNumbers: 'off' };
        super.updateOptions(withLineNumberRemoved);
    }
    static getEditorOptions(configurationService) {
        return {
            wordWrap: 'on',
            glyphMargin: false,
            lineNumbers: 'off',
            folding: false,
            selectOnLineNumbers: false,
            scrollbar: {
                vertical: 'visible',
                verticalScrollbarSize: 14,
                horizontal: 'auto',
                useShadows: true,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                alwaysConsumeMouseWheel: false
            },
            overviewRulerLanes: 2,
            lineDecorationsWidth: 0,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            fixedOverflowWidgets: true,
            acceptSuggestionOnEnter: 'smart',
            minimap: {
                enabled: false
            },
            dropIntoEditor: { enabled: true },
            autoClosingBrackets: configurationService.getValue('editor.autoClosingBrackets'),
            quickSuggestions: false,
            accessibilitySupport: configurationService.getValue('editor.accessibilitySupport'),
            fontFamily: configurationService.getValue('editor.fontFamily'),
            fontSize: configurationService.getValue('editor.fontSize'),
            allowVariableLineHeights: false
        };
    }
};
SimpleCommentEditor = __decorate([
    __param(4, IInstantiationService),
    __param(5, ICodeEditorService),
    __param(6, ICommandService),
    __param(7, IThemeService),
    __param(8, INotificationService),
    __param(9, IAccessibilityService),
    __param(10, ILanguageConfigurationService),
    __param(11, ILanguageFeaturesService),
    __param(12, IUserInteractionService)
], SimpleCommentEditor);
export { SimpleCommentEditor };
export function calculateEditorHeight(parentEditor, editor, currentHeight) {
    const layoutInfo = editor.getLayoutInfo();
    const lineHeight = editor.getOption(75 /* EditorOption.lineHeight */);
    const contentHeight = (editor._getViewModel()?.getLineCount() * lineHeight); // Can't just call getContentHeight() because it returns an incorrect, large, value when the editor is first created.
    if ((contentHeight > layoutInfo.height) ||
        (contentHeight < layoutInfo.height && currentHeight > MIN_EDITOR_HEIGHT)) {
        const linesToAdd = Math.ceil((contentHeight - layoutInfo.height) / lineHeight);
        const proposedHeight = layoutInfo.height + (lineHeight * linesToAdd);
        return clamp(proposedHeight, MIN_EDITOR_HEIGHT, clamp(parentEditor.getLayoutInfo().height - 90, MIN_EDITOR_HEIGHT, MAX_EDITOR_HEIGHT));
    }
    return currentHeight;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlQ29tbWVudEVkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvc2ltcGxlQ29tbWVudEVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQWlELHdCQUF3QixFQUFrQyxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pLLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBNEIsTUFBTSxrRUFBa0UsQ0FBQztBQUM5SCxPQUFPLEVBQXNCLGFBQWEsRUFBZSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVuRixnQ0FBZ0M7QUFDaEMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN0RyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENB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