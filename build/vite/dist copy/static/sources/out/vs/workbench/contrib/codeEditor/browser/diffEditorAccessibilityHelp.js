/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { AccessibleDiffViewerNext, AccessibleDiffViewerPrev } from '../../../../editor/browser/widget/diffEditor/commands.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ContextKeyEqualsExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { getCommentCommandInfo } from '../../accessibility/browser/editorAccessibilityHelp.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
export class DiffEditorAccessibilityHelp {
    constructor() {
        this.priority = 105;
        this.name = 'diff-editor';
        this.when = ContextKeyEqualsExpr.create('isInDiffEditor', true);
        this.type = "help" /* AccessibleViewType.Help */;
    }
    getProvider(accessor) {
        const editorService = accessor.get(IEditorService);
        const codeEditorService = accessor.get(ICodeEditorService);
        const keybindingService = accessor.get(IKeybindingService);
        const contextKeyService = accessor.get(IContextKeyService);
        if (!(editorService.activeTextEditorControl instanceof DiffEditorWidget)) {
            return;
        }
        const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
        if (!codeEditor) {
            return;
        }
        const switchSides = localize('msg3', "Run the command Diff Editor: Switch Side{0} to toggle between the original and modified editors.", '<keybinding:diffEditor.switchSide>');
        const diffEditorActiveAnnouncement = localize('msg5', "The setting, accessibility.verbosity.diffEditorActive, controls if a diff editor announcement is made when it becomes the active editor.");
        const keys = ['accessibility.signals.diffLineDeleted', 'accessibility.signals.diffLineInserted', 'accessibility.signals.diffLineModified'];
        const content = [
            localize('msg1', "You are in a diff editor."),
            localize('msg2', "View the next{0} or previous{1} diff in diff review mode, which is optimized for screen readers.", '<keybinding:' + AccessibleDiffViewerNext.id + '>', '<keybinding:' + AccessibleDiffViewerPrev.id + '>'),
            switchSides,
            diffEditorActiveAnnouncement,
            localize('msg4', "To control which accessibility signals should be played, the following settings can be configured: {0}.", keys.join(', ')),
        ];
        const commentCommandInfo = getCommentCommandInfo(keybindingService, contextKeyService, codeEditor);
        if (commentCommandInfo) {
            content.push(commentCommandInfo);
        }
        return new AccessibleContentProvider("diffEditor" /* AccessibleViewProviderId.DiffEditor */, { type: "help" /* AccessibleViewType.Help */ }, () => content.join('\n'), () => codeEditor.focus(), "accessibility.verbosity.diffEditor" /* AccessibilityVerbositySettingId.DiffEditor */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvckFjY2Vzc2liaWxpdHlIZWxwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29kZUVkaXRvci9icm93c2VyL2RpZmZFZGl0b3JBY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNwRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFnRCx5QkFBeUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRXZKLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRWhILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVsRixNQUFNLE9BQU8sMkJBQTJCO0lBQXhDO1FBQ1UsYUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNmLFNBQUksR0FBRyxhQUFhLENBQUM7UUFDckIsU0FBSSxHQUFHLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzRCxTQUFJLHdDQUEyQjtJQXVDekMsQ0FBQztJQXRDQSxXQUFXLENBQUMsUUFBMEI7UUFDckMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNuRCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMzRCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMzRCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUUzRCxJQUFJLENBQUMsQ0FBQyxhQUFhLENBQUMsdUJBQXVCLFlBQVksZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1lBQzFFLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxpQkFBaUIsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBQ3ZHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsa0dBQWtHLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztRQUMvSyxNQUFNLDRCQUE0QixHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsMElBQTBJLENBQUMsQ0FBQztRQUVsTSxNQUFNLElBQUksR0FBRyxDQUFDLHVDQUF1QyxFQUFFLHdDQUF3QyxFQUFFLHdDQUF3QyxDQUFDLENBQUM7UUFDM0ksTUFBTSxPQUFPLEdBQUc7WUFDZixRQUFRLENBQUMsTUFBTSxFQUFFLDJCQUEyQixDQUFDO1lBQzdDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsa0dBQWtHLEVBQUUsY0FBYyxHQUFHLHdCQUF3QixDQUFDLEVBQUUsR0FBRyxHQUFHLEVBQUUsY0FBYyxHQUFHLHdCQUF3QixDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUM7WUFDNU4sV0FBVztZQUNYLDRCQUE0QjtZQUM1QixRQUFRLENBQUMsTUFBTSxFQUFFLHlHQUF5RyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDNUksQ0FBQztRQUNGLE1BQU0sa0JBQWtCLEdBQUcscUJBQXFCLENBQUMsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDbkcsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsT0FBTyxJQUFJLHlCQUF5Qix5REFFbkMsRUFBRSxJQUFJLHNDQUF5QixFQUFFLEVBQ2pDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQ3hCLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsd0ZBRXhCLENBQUM7SUFDSCxDQUFDO0NBQ0QifQ==