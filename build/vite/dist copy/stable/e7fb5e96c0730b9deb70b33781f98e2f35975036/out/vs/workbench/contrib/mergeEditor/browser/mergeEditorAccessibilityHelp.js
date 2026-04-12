/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ContextKeyEqualsExpr } from '../../../../platform/contextkey/common/contextkey.js';
export class MergeEditorAccessibilityHelpProvider {
    constructor() {
        this.name = 'mergeEditor';
        this.type = "help" /* AccessibleViewType.Help */;
        this.priority = 125;
        this.when = ContextKeyEqualsExpr.create('isMergeEditor', true);
    }
    getProvider(accessor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
        if (!codeEditor) {
            return;
        }
        const content = [
            localize('msg1', "You are in a merge editor."),
            localize('msg2', "Navigate between merge conflicts using the commands Go to Next Unhandled Conflict{0} and Go to Previous Unhandled Conflict{1}.", '<keybinding:merge.goToNextUnhandledConflict>', '<keybinding:merge.goToPreviousUnhandledConflict>'),
            localize('msg3', "Run the command Merge Editor: Accept All Incoming Changes from the Left{0} and Merge Editor: Accept All Current Changes from the Right{1}", '<keybinding:merge.acceptAllInput1>', '<keybinding:merge.acceptAllInput2>'),
            localize('msg4', "Complete the Merge{0}.", '<keybinding:mergeEditor.acceptMerge>'),
            localize('msg5', "Toggle between merge editor inputs, incoming and current changes {0}.", '<keybinding:mergeEditor.toggleBetweenInputs>'),
        ];
        return new AccessibleContentProvider("mergeEditor" /* AccessibleViewProviderId.MergeEditor */, { type: "help" /* AccessibleViewType.Help */ }, () => content.join('\n'), () => codeEditor.focus(), "accessibility.verbosity.mergeEditor" /* AccessibilityVerbositySettingId.MergeEditor */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVyZ2VFZGl0b3JBY2Nlc3NpYmlsaXR5SGVscC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbWVyZ2VFZGl0b3JBY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHlCQUF5QixFQUFnRCxNQUFNLDhEQUE4RCxDQUFDO0FBRXZKLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBSzVGLE1BQU0sT0FBTyxvQ0FBb0M7SUFBakQ7UUFDVSxTQUFJLEdBQUcsYUFBYSxDQUFDO1FBQ3JCLFNBQUksd0NBQTJCO1FBQy9CLGFBQVEsR0FBRyxHQUFHLENBQUM7UUFDZixTQUFJLEdBQUcsb0JBQW9CLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztJQXlCcEUsQ0FBQztJQXhCQSxXQUFXLENBQUMsUUFBMEI7UUFDckMsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFM0QsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxpQkFBaUIsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBQ3ZHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHO1lBQ2YsUUFBUSxDQUFDLE1BQU0sRUFBRSw0QkFBNEIsQ0FBQztZQUM5QyxRQUFRLENBQUMsTUFBTSxFQUFFLGdJQUFnSSxFQUFFLDhDQUE4QyxFQUFFLGtEQUFrRCxDQUFDO1lBQ3RQLFFBQVEsQ0FBQyxNQUFNLEVBQUUsMklBQTJJLEVBQUUsb0NBQW9DLEVBQUUsb0NBQW9DLENBQUM7WUFDek8sUUFBUSxDQUFDLE1BQU0sRUFBRSx3QkFBd0IsRUFBRSxzQ0FBc0MsQ0FBQztZQUNsRixRQUFRLENBQUMsTUFBTSxFQUFFLHVFQUF1RSxFQUFFLDhDQUE4QyxDQUFDO1NBQ3pJLENBQUM7UUFFRixPQUFPLElBQUkseUJBQXlCLDJEQUVuQyxFQUFFLElBQUksc0NBQXlCLEVBQUUsRUFDakMsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFDeEIsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSwwRkFFeEIsQ0FBQztJQUNILENBQUM7Q0FDRCJ9