/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './accessibility.css';
import * as nls from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED, IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { accessibilityHelpIsShown } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityHelpNLS } from '../../../../../editor/common/standaloneStrings.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { CursorColumns } from '../../../../../editor/common/core/cursorColumns.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
class ToggleScreenReaderMode extends Action2 {
    constructor() {
        super({
            id: 'editor.action.toggleScreenReaderAccessibilityMode',
            title: nls.localize2('toggleScreenReaderMode', "Toggle Screen Reader Accessibility Mode"),
            metadata: {
                description: nls.localize2('toggleScreenReaderModeDescription', "Toggles an optimized mode for usage with screen readers, braille devices, and other assistive technologies."),
            },
            f1: true,
            keybinding: [{
                    primary: 2048 /* KeyMod.CtrlCmd */ | 35 /* KeyCode.KeyE */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
                    when: accessibilityHelpIsShown
                },
                {
                    primary: 512 /* KeyMod.Alt */ | 59 /* KeyCode.F1 */ | 1024 /* KeyMod.Shift */,
                    linux: { primary: 512 /* KeyMod.Alt */ | 62 /* KeyCode.F4 */ | 1024 /* KeyMod.Shift */ },
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
                }]
        });
    }
    async run(accessor) {
        const accessibiiltyService = accessor.get(IAccessibilityService);
        const configurationService = accessor.get(IConfigurationService);
        const isScreenReaderOptimized = accessibiiltyService.isScreenReaderOptimized();
        configurationService.updateValue('editor.accessibilitySupport', isScreenReaderOptimized ? 'off' : 'on', 2 /* ConfigurationTarget.USER */);
        alert(isScreenReaderOptimized ? AccessibilityHelpNLS.screenReaderModeDisabled : AccessibilityHelpNLS.screenReaderModeEnabled);
    }
}
registerAction2(ToggleScreenReaderMode);
class AnnounceCursorPosition extends Action2 {
    constructor() {
        super({
            id: 'editor.action.announceCursorPosition',
            title: nls.localize2('announceCursorPosition', "Announce Cursor Position"),
            f1: true,
            metadata: {
                description: nls.localize2('announceCursorPosition.description', "Announce the current cursor position (line and column) via screen reader.")
            },
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
                when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED)
            }
        });
    }
    async run(accessor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const editor = codeEditorService.getFocusedCodeEditor();
        if (!editor) {
            return;
        }
        const position = editor.getPosition();
        const model = editor.getModel();
        if (!position || !model) {
            return;
        }
        // Use visible column to match status bar display (accounts for tabs)
        const tabSize = model.getOptions().tabSize;
        const lineContent = model.getLineContent(position.lineNumber);
        const visibleColumn = CursorColumns.visibleColumnFromColumn(lineContent, position.column, tabSize) + 1;
        alert(nls.localize('screenReader.lineColPosition', "Line {0}, Column {1}", position.lineNumber, visibleColumn));
    }
}
registerAction2(AnnounceCursorPosition);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJpbGl0eS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5L2FjY2Vzc2liaWxpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxxQkFBcUIsQ0FBQztBQUM3QixPQUFPLEtBQUssR0FBRyxNQUFNLHVCQUF1QixDQUFDO0FBQzdDLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUUzSCxPQUFPLEVBQUUsa0NBQWtDLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUMxSSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBR3hHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRXpGLE1BQU0sc0JBQXVCLFNBQVEsT0FBTztJQUUzQztRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxtREFBbUQ7WUFDdkQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsd0JBQXdCLEVBQUUseUNBQXlDLENBQUM7WUFDekYsUUFBUSxFQUFFO2dCQUNULFdBQVcsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLG1DQUFtQyxFQUFFLDZHQUE2RyxDQUFDO2FBQzlLO1lBQ0QsRUFBRSxFQUFFLElBQUk7WUFDUixVQUFVLEVBQUUsQ0FBQztvQkFDWixPQUFPLEVBQUUsaURBQTZCO29CQUN0QyxNQUFNLEVBQUUsOENBQW9DLEVBQUU7b0JBQzlDLElBQUksRUFBRSx3QkFBd0I7aUJBQzlCO2dCQUNEO29CQUNDLE9BQU8sRUFBRSwwQ0FBdUIsMEJBQWU7b0JBQy9DLEtBQUssRUFBRSxFQUFFLE9BQU8sRUFBRSwwQ0FBdUIsMEJBQWUsRUFBRTtvQkFDMUQsTUFBTSxFQUFFLDhDQUFvQyxFQUFFO2lCQUM5QyxDQUFDO1NBQ0YsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDbkMsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDakUsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDakUsTUFBTSx1QkFBdUIsR0FBRyxvQkFBb0IsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQy9FLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyw2QkFBNkIsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLG1DQUEyQixDQUFDO1FBQ2xJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDL0gsQ0FBQztDQUNEO0FBRUQsZUFBZSxDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFFeEMsTUFBTSxzQkFBdUIsU0FBUSxPQUFPO0lBQzNDO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLHNDQUFzQztZQUMxQyxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyx3QkFBd0IsRUFBRSwwQkFBMEIsQ0FBQztZQUMxRSxFQUFFLEVBQUUsSUFBSTtZQUNSLFFBQVEsRUFBRTtnQkFDVCxXQUFXLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxvQ0FBb0MsRUFBRSwyRUFBMkUsQ0FBQzthQUM3STtZQUNELFVBQVUsRUFBRTtnQkFDWCxPQUFPLEVBQUUsZ0RBQTJCLDBCQUFlLHdCQUFlO2dCQUNsRSxNQUFNLEVBQUUsOENBQW9DLEVBQUU7Z0JBQzlDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLGVBQWUsRUFBRSxrQ0FBa0MsQ0FBQzthQUMvRjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25DLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNELE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDeEQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDdEMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN6QixPQUFPO1FBQ1IsQ0FBQztRQUNELHFFQUFxRTtRQUNyRSxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsT0FBTyxDQUFDO1FBQzNDLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzlELE1BQU0sYUFBYSxHQUFHLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsc0JBQXNCLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQ2pILENBQUM7Q0FDRDtBQUVELGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDIn0=