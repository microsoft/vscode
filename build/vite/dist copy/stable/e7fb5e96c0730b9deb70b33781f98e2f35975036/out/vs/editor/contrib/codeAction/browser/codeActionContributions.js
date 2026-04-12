/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerEditorAction, registerEditorCommand, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { editorConfigurationBaseNode } from '../../../common/config/editorConfigurationSchema.js';
import { AutoFixAction, CodeActionCommand, FixAllAction, OrganizeImportsAction, QuickFixAction, RefactorAction, SourceAction } from './codeActionCommands.js';
import { CodeActionController } from './codeActionController.js';
import { LightBulbWidget } from './lightBulbWidget.js';
import * as nls from '../../../../nls.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
registerEditorContribution(CodeActionController.ID, CodeActionController, 3 /* EditorContributionInstantiation.Eventually */);
registerEditorContribution(LightBulbWidget.ID, LightBulbWidget, 4 /* EditorContributionInstantiation.Lazy */);
registerAction2(QuickFixAction);
registerEditorAction(RefactorAction);
registerEditorAction(SourceAction);
registerEditorAction(OrganizeImportsAction);
registerEditorAction(AutoFixAction);
registerEditorAction(FixAllAction);
registerEditorCommand(new CodeActionCommand());
Registry.as(Extensions.Configuration).registerConfiguration({
    ...editorConfigurationBaseNode,
    properties: {
        'editor.codeActionWidget.showHeaders': {
            type: 'boolean',
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            description: nls.localize('showCodeActionHeaders', "Enable/disable showing group headers in the Code Action menu."),
            default: true,
        },
    }
});
Registry.as(Extensions.Configuration).registerConfiguration({
    ...editorConfigurationBaseNode,
    properties: {
        'editor.codeActionWidget.includeNearbyQuickFixes': {
            type: 'boolean',
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            description: nls.localize('includeNearbyQuickFixes', "Enable/disable showing nearest Quick Fix within a line when not currently on a diagnostic."),
            default: true,
        },
    }
});
Registry.as(Extensions.Configuration).registerConfiguration({
    ...editorConfigurationBaseNode,
    properties: {
        'editor.codeActions.triggerOnFocusChange': {
            type: 'boolean',
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: nls.localize('triggerOnFocusChange', 'Enable triggering {0} when {1} is set to {2}. Code Actions must be set to {3} to be triggered for window and focus changes.', '`#editor.codeActionsOnSave#`', '`#files.autoSave#`', '`afterDelay`', '`always`'),
            default: false,
        },
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbkNvbnRyaWJ1dGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbkNvbnRyaWJ1dGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFtQyxvQkFBb0IsRUFBRSxxQkFBcUIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hLLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzlKLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN2RCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBc0IsVUFBVSxFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQzVJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU1RSwwQkFBMEIsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsb0JBQW9CLHFEQUE2QyxDQUFDO0FBQ3RILDBCQUEwQixDQUFDLGVBQWUsQ0FBQyxFQUFFLEVBQUUsZUFBZSwrQ0FBdUMsQ0FBQztBQUN0RyxlQUFlLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDaEMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDckMsb0JBQW9CLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDbkMsb0JBQW9CLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUM1QyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUNwQyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUNuQyxxQkFBcUIsQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztBQUUvQyxRQUFRLENBQUMsRUFBRSxDQUF5QixVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDbkYsR0FBRywyQkFBMkI7SUFDOUIsVUFBVSxFQUFFO1FBQ1gscUNBQXFDLEVBQUU7WUFDdEMsSUFBSSxFQUFFLFNBQVM7WUFDZixLQUFLLGlEQUF5QztZQUM5QyxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSwrREFBK0QsQ0FBQztZQUNuSCxPQUFPLEVBQUUsSUFBSTtTQUNiO0tBQ0Q7Q0FDRCxDQUFDLENBQUM7QUFFSCxRQUFRLENBQUMsRUFBRSxDQUF5QixVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDbkYsR0FBRywyQkFBMkI7SUFDOUIsVUFBVSxFQUFFO1FBQ1gsaURBQWlELEVBQUU7WUFDbEQsSUFBSSxFQUFFLFNBQVM7WUFDZixLQUFLLGlEQUF5QztZQUM5QyxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSw0RkFBNEYsQ0FBQztZQUNsSixPQUFPLEVBQUUsSUFBSTtTQUNiO0tBQ0Q7Q0FDRCxDQUFDLENBQUM7QUFFSCxRQUFRLENBQUMsRUFBRSxDQUF5QixVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDbkYsR0FBRywyQkFBMkI7SUFDOUIsVUFBVSxFQUFFO1FBQ1gseUNBQXlDLEVBQUU7WUFDMUMsSUFBSSxFQUFFLFNBQVM7WUFDZixLQUFLLGlEQUF5QztZQUM5QyxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLDZIQUE2SCxFQUFFLDhCQUE4QixFQUFFLG9CQUFvQixFQUFFLGNBQWMsRUFBRSxVQUFVLENBQUM7WUFDMVEsT0FBTyxFQUFFLEtBQUs7U0FDZDtLQUNEO0NBQ0QsQ0FBQyxDQUFDIn0=